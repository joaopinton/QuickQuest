// Controller del bowling: il lancio parte dal gesto del giocatore di turno (docs/04 § 6).
// Tieni premuto il tasto, porta il braccio indietro, swing in avanti, alza il pollice = rilascio.
import { createBowlingRecognizer, createSensorAdapter, type BowlingReleaseEvent } from '@quickquest/motion';
import type { SlotId, ThrowParams } from '@quickquest/protocol';
import { slotStyle, t, type Accessory } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

export interface GamePadProps {
  readonly slot: SlotId;
  readonly color: string;
  readonly accessory: Accessory;
  readonly gameId: string;
  readonly layoutId: string;
  readonly isDemo: boolean;
  readonly isLost: boolean;
  /** Chi può lanciare adesso (deciso dallo schermo); `null` = nessuno (palla in pista). */
  readonly activeSlot: SlotId | null;
  /** Solo in sviluppo (`?sim`): niente sensori, il lancio è sintetizzato dalla durata della pressione. */
  readonly isSimulated: boolean;
  readonly onThrow: (params: ThrowParams) => void;
  readonly onLeave: () => void;
}

const MIN_SPEED = 3.5; // m/s: sotto la palla si fermerebbe a metà pista
const MAX_SPEED = 10.5;
const MAX_AIM_RAD = 0.07; // ±4° come i vecchi slider dello schermo
const FEEDBACK_MS = 2500;

type Feedback = 'thrown' | 'noSwing' | null;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Converte il rilascio riconosciuto (più la mira dal trackpad) nei parametri del tiro. */
export function throwFromRelease(ev: Pick<BowlingReleaseEvent, 'speed' | 'spin'>, aim: number): ThrowParams {
  return {
    speed: clamp(ev.speed, MIN_SPEED, MAX_SPEED),
    spin: clamp(ev.spin, -1, 1),
    dir: clamp(aim, -1, 1) * MAX_AIM_RAD,
  };
}

/** Lancio sintetico per il telefono simulato: pressione più lunga = tiro più forte. */
function simulatedThrow(heldMs: number, aim: number): ThrowParams {
  return throwFromRelease({ speed: 5 + clamp(heldMs / 1000, 0, 1) * 4, spin: 0.25 }, aim);
}

export function GamePad({
  slot, color, gameId, isDemo, isLost, activeSlot, isSimulated, onThrow, onLeave,
}: GamePadProps) {
  const [aim, setAim] = useState(0); // -1.0 .. +1.0
  const [isPressed, setPressed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const grooveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef(0);
  const pressedAtRef = useRef(0);
  const onThrowRef = useRef(onThrow);
  onThrowRef.current = onThrow;
  const recognizer = useMemo(() => createBowlingRecognizer(), []);
  const style = slotStyle(slot);

  const isMyTurn = activeSlot === slot && !isLost;

  // Sensori → riconoscitore del gesto, alla frequenza nativa
  useEffect(() => {
    if (isSimulated) return;
    const adapter = createSensorAdapter();
    const handler = (e: DeviceMotionEvent) => {
      const sample = adapter.fromEvent(e);
      if (sample) recognizer.onSample(sample);
    };
    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [recognizer, isSimulated]);

  useEffect(() => recognizer.onRelease((ev) => {
    if (!ev.valid) {
      setFeedback('noSwing');
      return;
    }
    onThrowRef.current(throwFromRelease(ev, aimRef.current));
    setFeedback('thrown');
    try { navigator.vibrate?.([40, 30, 80]); } catch { /* vibrazione non disponibile */ }
  }), [recognizer]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  // Turno perso (o passato ad altri) a metà pressione: il gesto non vale più
  useEffect(() => {
    if (isMyTurn) return;
    recognizer.reset();
    setPressed(false);
  }, [isMyTurn, recognizer]);

  const updateAimFromPointer = (clientX: number) => {
    if (!grooveRef.current) return;
    const rect = grooveRef.current.getBoundingClientRect();
    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const normalized = (relativeX / rect.width) * 2 - 1; // -1 .. +1
    aimRef.current = normalized;
    setAim(normalized);
  };

  const onTrackpadPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateAimFromPointer(e.clientX);
    try { navigator.vibrate?.(15); } catch { /* vibrazione non disponibile */ }
  };

  const onTrackpadPointerMove = (e: PointerEvent) => {
    if (e.buttons > 0) updateAimFromPointer(e.clientX);
  };

  const onActionDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pressedAtRef.current = e.timeStamp;
    setPressed(true);
    setFeedback(null);
    if (!isSimulated) recognizer.onButton(true, e.timeStamp);
    try { navigator.vibrate?.(45); } catch { /* vibrazione non disponibile */ }
  };

  const onActionUp = (e: PointerEvent) => {
    e.preventDefault();
    if (!isPressed) return;
    setPressed(false);
    if (!isMyTurn) return;
    if (isSimulated) {
      onThrow(simulatedThrow(e.timeStamp - pressedAtRef.current, aimRef.current));
      setFeedback('thrown');
      return;
    }
    // il pollice alzato è il momento del rilascio: il riconoscitore decide se c'era uno swing
    recognizer.onButton(false, e.timeStamp);
  };

  const gameName = gameId === 'bowling' ? 'Bowling' : gameId;
  const dotPercent = ((aim + 1) / 2) * 100;

  let turnText: string;
  if (feedback === 'thrown') turnText = t('controller.thrown');
  else if (feedback === 'noSwing') turnText = t('controller.noSwing');
  else if (isMyTurn) turnText = t('controller.yourTurn');
  else if (activeSlot) turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  else turnText = t('controller.laneBusy');

  let buttonText: string;
  if (!isMyTurn) buttonText = t('controller.notYourTurn');
  else if (isPressed) buttonText = t('controller.actionButtonRelease');
  else buttonText = t('controller.actionButtonHold');

  return (
    <section class="ctl-screen ctl-game" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">{gameName}</span>
        {isLost ? (
          <span class="ctl-demo" style={{ background: 'var(--danger-100)', color: 'var(--danger-700)' }}>
            {t('controller.reconnecting')}
          </span>
        ) : isDemo ? (
          <span class="ctl-demo">{t('controller.demoBadge')}</span>
        ) : (
          <span class="ctl-demo">📶 {t('controller.readySent')}</span>
        )}
      </header>

      <p class={`ctl-turn ${isMyTurn && !feedback ? 'ctl-turn--mine' : ''}`} aria-live="polite">{turnText}</p>

      {/* Trackpad di mira orizzontale */}
      <div class="ctl-trackpad" aria-label={t('controller.trackpadHint')}>
        <span class="ctl-trackpad__label">◀ {t('controller.trackpadHint')} ▶</span>
        <div
          ref={grooveRef}
          class="ctl-trackpad__groove"
          onPointerDown={onTrackpadPointerDown}
          onPointerMove={onTrackpadPointerMove}
        >
          <div class="ctl-trackpad__center-line" aria-hidden="true" />
          <div class="ctl-trackpad__dot" aria-hidden="true" style={{ left: `${dotPercent}%` }} />
        </div>
      </div>

      {/* Tasto azione: si tiene premuto durante lo swing e si rilascia per tirare (docs/08 § 2) */}
      <button
        type="button"
        class={`ctl-action-btn ${isPressed ? 'is-pressed' : ''}`}
        disabled={!isMyTurn}
        onPointerDown={onActionDown}
        onPointerUp={onActionUp}
        onPointerCancel={onActionUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">🎳</span>
        <span>{buttonText}</span>
      </button>

      <footer class="ctl-actions">
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </footer>
    </section>
  );
}
