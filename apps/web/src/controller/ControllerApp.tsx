// Flusso del telefono (docs/08 § 1.2): codice → benvenuto → sonda → Pupo → sicurezza → attesa → gioco.
import {
  collectMotion, detectPlatform, evaluateProbe, keepAwake, releaseWakeLock, requestMotionPermission, simulateHandheld,
  type ProbeResult, type RawSample,
} from '@quickquest/motion';
import { isValidRoomCode, type LobbyPlayer, type SlotId } from '@quickquest/protocol';
import { pupoColor, t } from '@quickquest/ui';
import { useLocation, useRoute } from 'preact-iso';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createControllerConnection } from '../net/controllerConnection';
import { hasSeenSafety, loadChoice, markSafetySeen, saveChoice } from './prefs';
import { GamePad } from './steps/GamePad';
import { PickPupo, type PupoChoice } from './steps/PickPupo';
import { Blocked, EnterCode, Incompatible, Probing, Safety, Welcome } from './steps/Screens';
import { Waiting } from './steps/Waiting';
import './controller.css';

type Step =
  | { k: 'welcome'; error: string | null }
  | { k: 'probing'; progress: number }
  | { k: 'fail'; result: ProbeResult }
  | { k: 'pick' }
  | { k: 'safety' }
  | { k: 'waiting' }
  | { k: 'game'; gameId: string; layoutId: string }
  | { k: 'blocked'; message: string };

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
  const [choice, setChoice] = useState<PupoChoice>(loadChoice);
  const [players, setPlayers] = useState<readonly LobbyPlayer[]>([]);
  const [isLost, setLost] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SlotId | null>(null);
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
    const offLayout = conn.onLayout((layout) => {
      conn.sendReady(layout.layoutId);
      safeStep({ k: 'game', gameId: layout.gameId, layoutId: layout.layoutId });
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
      conn.close();
    };
  }, [conn]);

  const connect = async () => {
    if (isBusy.current) return; // doppio tap su "Connetti" o "Riprova"
    isBusy.current = true;
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

  const confirmPupo = (c: PupoChoice) => {
    setChoice(c);
    saveChoice(c);
    conn.sendProfile({ color: pupoColor(c.colorId).hex, accessory: c.accessory });
    setStep(hasSeenSafety() ? { k: 'waiting' } : { k: 'safety' });
  };

  switch (step.k) {
    case 'welcome':
      return <Welcome code={code} error={step.error} onConnect={connect} />;
    case 'probing':
      return <Probing progress={step.progress} />;
    case 'fail':
      return <Incompatible result={step.result} onRetry={connect} />;
    case 'pick':
      return <PickPupo slot={slot} initial={choice} onConfirm={confirmPupo} />;
    case 'safety':
      return <Safety onOk={() => { markSafetySeen(); setStep({ k: 'waiting' }); }} />;
    case 'blocked':
      return <Blocked message={step.message} />;
    case 'waiting':
      return (
        <Waiting
          slot={slot}
          color={pupoColor(choice.colorId).hex}
          accessory={choice.accessory}
          isDemo={isDemo}
          isLost={isLost}
          players={players}
          onChangePupo={() => setStep({ k: 'pick' })}
          onLeave={() => { conn.leave(); releaseWakeLock(); route('/'); }}
        />
      );
    case 'game':
      return (
        <GamePad
          slot={slot}
          color={pupoColor(choice.colorId).hex}
          accessory={choice.accessory}
          gameId={step.gameId}
          layoutId={step.layoutId}
          isDemo={isDemo}
          isLost={isLost}
          activeSlot={activeSlot}
          isSimulated={simVariant !== undefined}
          onThrow={(params) => conn.sendThrow(params)}
          onLeave={() => { conn.leave(); releaseWakeLock(); route('/'); }}
        />
      );
    default:
      return null;
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
