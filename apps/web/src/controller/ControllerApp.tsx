// Flusso del telefono (docs/08 § 1.2): codice → benvenuto → sonda → Bubù → sicurezza → attesa → gioco.
// Niente tiri di prova: la taratura del lancio si impara dai primi tiri veri (motion `learnFromSwing`).
import {
  collectMotion, createMotionTracker, detectPlatform, evaluateProbe, keepAwake, learnFromSwing, releaseWakeLock, requestMotionPermission,
  simulateHandheld, type ProbeResult, type RawSample, type SwingAnalysis, type SwingProfile,
} from '@quickquest/motion';
import { isValidRoomCode, type Cue, type LobbyPlayer, type SlotId } from '@quickquest/protocol';
import { bubuColor, showToast, t } from '@quickquest/ui';
import { useLocation, useRoute } from 'preact-iso';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadersFor } from '@quickquest/games/loaders';
import { createControllerConnection } from '../net/controllerConnection';
import { createHaptics } from './haptics';
import { choiceProfile, choiceStyle, hasSeenSafety, loadChoice, markSafetySeen, saveChoice, type BubuChoice } from './prefs';
import { DebugOverlay } from './steps/DebugOverlay';
import { ModulePad } from './steps/ModulePad';
import { TraceRecorder } from './steps/TraceRecorder';
import { PickBubu } from './steps/PickBubu';
import { Blocked, EnterCode, Incompatible, Probing, Safety, Welcome } from './steps/Screens';
import { Waiting } from './steps/Waiting';
import './controller.css';

type WaitStep = { k: 'waiting' };
type GameStep = { k: 'game'; gameId: string; layoutId: string };

type Step =
  | { k: 'welcome'; error: string | null }
  | { k: 'probing'; progress: number }
  | { k: 'fail'; result: ProbeResult }
  | { k: 'pick' }
  | { k: 'safety' }
  | WaitStep
  | GameStep
  | { k: 'blocked'; message: string };

/** Ordine degli assi del giroscopio: si verifica in sottofondo appena il telefono si muove (axis-check.ts). */
const AXIS_CHECK_MS = 250;
const AXIS_CHECK_OMEGA = 2;
const AXIS_CHECK_MIN_SAMPLES = 30;
/** Dopo tanti tentativi col telefono in movimento si smette: dati mai puliti, si resta sull'ordine attuale. */
const AXIS_CHECK_MAX_TRIES = 240;

const PERMISSION_ERRORS = {
  denied: 'controller.permissionDenied',
  unsupported: 'controller.noSensorsApi',
  insecure: 'controller.insecure',
} as const;

/** Solo in sviluppo: `?sim` simula un telefono, `?sim=nogyro` uno senza giroscopio. */
function simulatedProbe(variant: string, onProgress: (p: number) => void): Promise<RawSample[]> {
  return new Promise((resolve) => {
    const start = performance.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / 1500);
      onProgress(p);
      if (p >= 1) {
        clearInterval(timer);
        resolve(simulateHandheld({ hasGyro: variant !== 'nogyro' }));
      }
    }, 50);
  });
}

function RoomFlow({ code }: { code: string }) {
  const { query, route } = useLocation();
  const conn = useMemo(() => createControllerConnection(code), [code]);
  const [step, setStep] = useState<Step>({ k: 'welcome', error: null });
  const [slot, setSlot] = useState<SlotId>('P1');
  const [isDemo, setDemo] = useState(false);
  const [choice, setChoice] = useState<BubuChoice>(loadChoice);
  const [players, setPlayers] = useState<readonly LobbyPlayer[]>([]);
  const [isLost, setLost] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null);
  const [profile, setProfile] = useState<SwingProfile | null>(null);
  const [lastCue, setLastCue] = useState<Cue | null>(null);
  // un solo tracker per tutta la sessione: l'orientamento stimato resta coerente con la taratura
  const tracker = useMemo(() => createMotionTracker(), []);
  useEffect(() => () => tracker.stop(), [tracker]);
  const haptics = useMemo(() => createHaptics(), []);
  useEffect(() => () => haptics.destroy(), [haptics]);
  const simVariant = import.meta.env.DEV ? query.sim : undefined;
  const isBusy = useRef(false);
  const isMounted = useRef(true);

  /** Aggiorna lo stato solo se la schermata è ancora montata (l'utente può tornare indietro). */
  const safeStep = (s: Step) => { if (isMounted.current) setStep(s); };

  useEffect(() => {
    isMounted.current = true;
    const offLobby = conn.onLobby((p, phase) => {
      setPlayers(p);
      // lo schermo ha chiuso la partita: il telefono torna in attesa invece di restare sul pad
      if (phase === 'lobby' && isMounted.current) {
        setStep((s) => (s.k === 'game' ? { k: 'waiting' } : s));
        setActiveSlot(null);
      }
    });
    const offTurn = conn.onTurn(setActiveSlot);
    // feedback dallo schermo: fuori da un tocco su iPhone diventa un click (haptics.cue)
    const offCue = conn.onCue((cue) => {
      haptics.cue(cue.kind);
      if (isMounted.current) setLastCue(cue);
    });
    const offLayout = conn.onLayout((layout) => {
      conn.sendReady(layout.layoutId);
      const game: GameStep = { k: 'game', gameId: layout.gameId, layoutId: layout.layoutId };
      if (isMounted.current) setStep(game);
    });
    const offKicked = conn.onKicked(() => {
      releaseWakeLock();
      if (isMounted.current) setStep({ k: 'blocked', message: t('controller.kicked') });
    });
    const offStatus = conn.onStatus((s) => {
      setSlot(s.slot);
      setDemo(s.mode === 'demo');
      setLost(s.mode === 'lost');
    });
    return () => {
      isMounted.current = false;
      offLobby();
      offLayout();
      offStatus();
      offTurn();
      offCue();
      offKicked();
      conn.close();
    };
  }, [conn, haptics]);

  // Prima c'era una schermata apposta; ora l'ordine degli assi si controlla mentre si gioca,
  // mai a metà di un lancio (il controllo può ripartire la stima dell'orientamento).
  useEffect(() => {
    if (simVariant !== undefined) return;
    let tries = 0;
    const id = setInterval(() => {
      if (tracker.samples < AXIS_CHECK_MIN_SAMPLES || tracker.omega < AXIS_CHECK_OMEGA || tracker.isPressed) return;
      tries += 1;
      const before = tracker.gyroOrder;
      const found = tracker.checkAxes().order;
      // assi corretti: l'orientamento è ripartito, la direzione imparata finora non vale più
      if (found !== null && found !== before) setProfile(null);
      if (found !== null || tries >= AXIS_CHECK_MAX_TRIES) clearInterval(id);
    }, AXIS_CHECK_MS);
    return () => clearInterval(id);
  }, [tracker, simVariant]);

  const learnSwing = (swing: SwingAnalysis) => setProfile((p) => learnFromSwing(p, swing));
  const realignAim = () => {
    setProfile(null);
    haptics.play('success');
    showToast(t('controller.recalibrated'));
  };

  const connect = async () => {
    if (isBusy.current) return; // doppio tap su "Connetti" o "Riprova"
    isBusy.current = true;
    haptics.unlock(); // dentro il tap: iOS sblocca l'audio del click solo qui
    try {
      await runConnect();
    } finally {
      isBusy.current = false;
    }
  };

  const runConnect = async () => {
    if (simVariant === undefined) {
      const outcome = await requestMotionPermission(); // prima await dentro il tap (iOS)
      if (outcome !== 'granted') {
        safeStep({ k: 'welcome', error: t(PERMISSION_ERRORS[outcome]) });
        return;
      }
      void keepAwake();
      tracker.start();
    }
    safeStep({ k: 'probing', progress: 0 });
    const onProgress = (progress: number) => safeStep({ k: 'probing', progress });
    const samples = simVariant === undefined ? await collectMotion(1500, onProgress) : await simulatedProbe(simVariant, onProgress);
    const result = evaluateProbe(samples);
    if (!isMounted.current) return;
    if (!result.pass) {
      safeStep({ k: 'fail', result });
      return;
    }
    const joined = await conn.join({
      gyro: true, accel: true, hz: Math.round(result.timing.hzMeasured), platform: detectPlatform(navigator.userAgent),
    });
    if (!isMounted.current) return;
    if (!joined.ok) {
      safeStep({ k: 'blocked', message: t(joined.code === 'ROOM_FULL' ? 'controller.roomFull' : 'controller.roomGone') });
      return;
    }
    setSlot(joined.slot);
    setDemo(joined.mode === 'demo');
    safeStep({ k: 'pick' });
  };

  const confirmBubu = (c: BubuChoice) => {
    setChoice(c);
    saveChoice(c);
    conn.sendProfile(choiceProfile(c));
    setStep(hasSeenSafety() ? { k: 'waiting' } : { k: 'safety' });
  };

  const screen = renderStep();
  const isDebug = query.debug !== undefined;
  const isRecording = query.rec !== undefined;
  return (
    <>
      {screen}
      {isDebug && <DebugOverlay tracker={tracker} conn={conn} />}
      {isRecording && <TraceRecorder platform={detectPlatform(navigator.userAgent)} />}
    </>
  );

  function renderStep() {
    switch (step.k) {
      case 'welcome':
        return <Welcome code={code} error={step.error} onConnect={connect} />;
      case 'probing':
        return <Probing progress={step.progress} />;
      case 'fail':
        return <Incompatible result={step.result} onRetry={connect} />;
      case 'pick':
        return <PickBubu slot={slot} initial={choice} onConfirm={confirmBubu} />;
      case 'safety':
        return <Safety onOk={() => { markSafetySeen(); setStep({ k: 'waiting' }); }} />;
      case 'blocked':
        return <Blocked message={step.message} />;
      case 'waiting':
        return (
          <Waiting
            slot={slot}
            color={bubuColor(choice.colorId).hex}
            look={choiceStyle(choice)}
            name={choice.name}
            isDemo={isDemo}
            isLost={isLost}
            players={players}
            onChangeBubu={() => setStep({ k: 'pick' })}
            onLeave={() => { conn.leave(); releaseWakeLock(); route('/'); }}
          />
        );
      case 'game':
        // gioco sconosciuto (telefono più vecchio dello schermo): si resta in attesa
        if (!loadersFor(step.gameId)) {
          return <Waiting slot={slot} color={bubuColor(choice.colorId).hex} look={choiceStyle(choice)} name={choice.name} isDemo={isDemo} isLost={isLost} players={players} onChangeBubu={() => setStep({ k: 'pick' })} onLeave={() => { conn.leave(); releaseWakeLock(); route('/'); }} />;
        }
        return (
          <ModulePad
            gameId={step.gameId}
            slot={slot}
            color={bubuColor(choice.colorId).hex}
            activeSlot={activeSlot}
            isLost={isLost}
            isDemo={isDemo}
            isSimulated={simVariant !== undefined}
            tracker={tracker}
            haptics={haptics}
            swingProfile={profile}
            learnSwing={learnSwing}
            lastCue={lastCue}
            send={(e) => conn.sendGameEvent(step.gameId, e)}
            onRecalibrate={realignAim}
            onLeave={() => { conn.leave(); releaseWakeLock(); route('/'); }}
          />
        );
      default:
        return null;
    }
  }
}

export function ControllerApp() {
  const { params } = useRoute();
  const { route } = useLocation();
  const raw = (params.code ?? '').toUpperCase();

  useEffect(() => {
    document.body.classList.add('is-controller');
    return () => document.body.classList.remove('is-controller');
  }, []);

  const content = isValidRoomCode(raw)
    ? <RoomFlow key={raw} code={raw} />
    : <EnterCode hasError={raw.length > 0} onSubmit={(c) => route(`/c/${c}`)} />;
  return <main class="ctl">{content}</main>;
}
