// Pad del bowling sul contratto modulo (games/contract.ts): il lancio parte dal gesto del giocatore
// di turno (docs/04 § 6) e arriva allo schermo come game-event "throw".
// Tieni premuto, braccio indietro, swing in avanti, alza il pollice. La mira è la direzione
// dello swing (girati a sinistra o a destra), la forza è la velocità del braccio.
import { MIN_SWING_PEAK, throwFromSwing, type ThrowOutput } from '@quickquest/motion';
import { slotStyle, t } from '@quickquest/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import { MotionMeter } from '../../shared/MotionMeter';
import { throwEvent } from '../shared/events';

const FEEDBACK_MS = 3500;

type Feedback = { readonly kind: 'thrown'; readonly text: string } | { readonly kind: 'miss'; readonly text: string } | null;

/** Descrizione del tiro mostrata sul telefono: velocità e mira. */
export function describeThrow(th: ThrowOutput): string {
  const deg = Math.round((Math.abs(th.dir) * 180) / Math.PI * 10) / 10;
  let aim = t('controller.aimStraight');
  if (deg >= 0.3) aim = th.dir < 0 ? t('controller.aimLeft', { deg }) : t('controller.aimRight', { deg });
  return t('controller.thrownDetail', { kmh: Math.round(th.speed * 3.6), aim });
}

/** Lancio sintetico per il telefono simulato: pressione più lunga = tiro più forte. */
function simulatedThrow(heldMs: number): ThrowOutput {
  return { speed: 5 + Math.min(1, heldMs / 1000) * 4, spin: 0.25, dir: 0 };
}

export function Pad({
  slot, color, isDemo, isLost, activeSlot, tracker, haptics, swingProfile, learnSwing, lastCue, isSimulated, send, onRecalibrate, onLeave,
}: ControllerPadProps) {
  const [isPressed, setPressed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const pressedAtRef = useRef(0);
  const style = slotStyle(slot);
  const isMyTurn = activeSlot === slot && !isLost;

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  // Turno perso (o passato ad altri) a metà pressione: il gesto non vale più
  useEffect(() => {
    if (isMyTurn) return;
    tracker.cancel();
    setPressed(false);
  }, [isMyTurn, tracker]);

  const onActionDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pressedAtRef.current = performance.now();
    tracker.press(pressedAtRef.current);
    setPressed(true);
    setFeedback(null);
    haptics.play('tap');
  };

  const onActionUp = (e: PointerEvent) => {
    e.preventDefault();
    if (!isPressed) return;
    setPressed(false);
    if (!isMyTurn) return;
    const now = performance.now();
    if (isSimulated) {
      tracker.cancel();
      const th = simulatedThrow(now - pressedAtRef.current);
      send(throwEvent(th));
      setFeedback({ kind: 'thrown', text: describeThrow(th) });
      return;
    }
    // il pollice alzato è il momento del rilascio: si analizza lo swing fatto tenendo premuto
    const swing = tracker.release(now);
    if (!swing.valid) {
      const text = t('controller.noSwingDetail', { w: swing.peak.toFixed(1), min: MIN_SWING_PEAK });
      setFeedback({ kind: 'miss', text });
      haptics.play('error');
      return;
    }
    const th = throwFromSwing(swing, swingProfile);
    learnSwing(swing);
    send(throwEvent(th));
    setFeedback({ kind: 'thrown', text: describeThrow(th) });
    haptics.play('success');
  };


  let turnText: string;
  if (feedback) turnText = feedback.text;
  else if (lastCue?.text && !isMyTurn) turnText = lastCue.text; // esito del tiro detto dallo schermo
  else if (isMyTurn) turnText = t('controller.yourTurn');
  else if (activeSlot) turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  else turnText = t('controller.laneBusy');

  let buttonText: string;
  if (!isMyTurn) buttonText = t('controller.notYourTurn');
  else if (isPressed) buttonText = t('controller.actionButtonRelease');
  else buttonText = t('controller.actionButtonHold');

  let statusBadge = <span class="ctl-demo">📶 {t('controller.readySent')}</span>;
  if (isLost) {
    statusBadge = (
      <span class="ctl-demo" style={{ background: 'color-mix(in oklab, var(--danger-500) 14%, #fff)', color: 'color-mix(in oklab, var(--danger-500) 70%, var(--ink-900))' }}>
        {t('controller.reconnecting')}
      </span>
    );
  } else if (isDemo) {
    statusBadge = <span class="ctl-demo">{t('controller.demoBadge')}</span>;
  }

  return (
    <section class="ctl-screen ctl-game" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">Bowling</span>
        {statusBadge}
      </header>

      <p class={`ctl-turn ${isMyTurn && !feedback ? 'ctl-turn--mine' : ''}`} aria-live="polite">{turnText}</p>

      {!isSimulated && <MotionMeter tracker={tracker} />}

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
        {!isSimulated && (
          <button type="button" class="qq-btn qq-btn--secondary" onClick={onRecalibrate}>
            🎯 {t('controller.recalibrate')}
          </button>
        )}
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </footer>
    </section>
  );
}
