// Pad dei Tiri liberi sul telefono (docs/05 § Lato controller, docs/games/free-throw.md).
// Guida il giocatore nelle tre fasi del tiro insegnato alla scuola basket:
// 1. Tieni premuto e carica il telefono sopra la fronte (gomito a 90°).
// 2. Spingi verso l'alto distendendo il braccio.
// 3. Alza il pollice in cima chiudendo il polso a gancio ("mano nel canestro") per dare il backspin!

import { slotStyle, t } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import { MotionMeter } from '../../shared/MotionMeter';
import { shootEvent, type FreeThrowShotData } from '../shared/events';
import {
  createFreeThrowRecognizer,
  IDEAL_RELEASE_ANGLE_DEG,
  IDEAL_RELEASE_SPEED,
  MIN_OMEGA_PEAK,
  type FreeThrowPhase,
} from './recognizer';
import './free-throw-pad.css';

const FEEDBACK_MS = 3800;
const UI_POLL_MS = 90;

type Feedback =
  | { readonly kind: 'shot'; readonly text: string }
  | { readonly kind: 'miss'; readonly text: string }
  | null;

/** Formatta i dettagli tecnici del tiro appena rilasciato (angolo, gancio del polso, backspin). */
export function describeFreeThrow(shot: FreeThrowShotData): string {
  const angle = Math.round(shot.releaseAngleDeg);
  const hookPct = Math.round(shot.hookQuality * 100);
  const rps = (1.5 + shot.backspin * 4.2).toFixed(1);
  const degLateral = Math.round((Math.abs(shot.dir) * 180) / Math.PI * 10) / 10;
  let aim = 'dritto';
  if (degLateral >= 0.6) {
    aim = shot.dir < 0 ? `${degLateral}° a sx` : `${degLateral}° a dx`;
  }
  return `Arco ${angle}° · Gancio ${hookPct}% (${rps} giri/s) · ${aim}`;
}

/**
 * Tiro sintetico per il telefono simulato (`?sim`):
 * una pressione intorno a ~650 ms produce il tiro ideale da scuola basket (53°, gancio 92%, velocità ideale).
 */
export function simulatedFreeThrow(heldMs: number): FreeThrowShotData {
  // Tra 350 e 950 ms siamo vicini allo sweet spot; pressioni brevissime tirano corto, lunghissime tirano lungo
  const normalized = Math.min(1.5, Math.max(0.3, heldMs / 650));
  const delta = (normalized - 1) * 0.45;
  const speed = Math.min(8.6, Math.max(6.2, IDEAL_RELEASE_SPEED + delta));
  const hookQuality = Math.min(0.98, Math.max(0.65, 1 - Math.abs(normalized - 1) * 0.35));
  return {
    speed,
    releaseAngleDeg: IDEAL_RELEASE_ANGLE_DEG,
    backspin: 0.88,
    hookQuality,
    dir: 0,
  };
}

export function Pad({
  slot,
  color,
  isDemo,
  isLost,
  activeSlot,
  tracker,
  haptics,
  swingProfile,
  lastCue,
  isSimulated,
  send,
  onRecalibrate,
  onLeave,
}: ControllerPadProps) {
  const recognizer = useMemo(() => createFreeThrowRecognizer(), []);
  const [isPressed, setPressed] = useState(false);
  const [phase, setPhase] = useState<FreeThrowPhase>('idle');
  const [loadLevel, setLoadLevel] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const pressedAtRef = useRef(0);
  const style = slotStyle(slot);
  const isMyTurn = activeSlot === slot && !isLost;

  useEffect(() => {
    const off = tracker.subscribe((s) => recognizer.feed(s));
    const timer = setInterval(() => {
      setPhase(recognizer.phase);
      setLoadLevel(recognizer.loadLevel);
    }, UI_POLL_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [tracker, recognizer]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  // Se il turno cambia o cade la connessione a metà caricamento, annulla il gesto
  useEffect(() => {
    if (isMyTurn) return;
    tracker.cancel();
    recognizer.reset();
    setPressed(false);
  }, [isMyTurn, tracker, recognizer]);

  const onActionDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const now = performance.now();
    pressedAtRef.current = now;
    tracker.press(now);
    recognizer.press(now);
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
      recognizer.reset();
      const shot = simulatedFreeThrow(now - pressedAtRef.current);
      send(shootEvent(shot));
      setFeedback({ kind: 'shot', text: describeFreeThrow(shot) });
      haptics.play('success');
      return;
    }

    tracker.cancel();
    const analysis = recognizer.release(now, swingProfile);
    if (!analysis.valid || !analysis.shot) {
      const msg =
        analysis.failure === 'no-upward-push'
          ? 'Spingi verso l’alto sopra la testa e chiudi il polso a gancio!'
          : `Gesto troppo debole (${analysis.peakOmega.toFixed(1)} rad/s, min ${MIN_OMEGA_PEAK}): spingi su e frusta il polso!`;
      setFeedback({ kind: 'miss', text: msg });
      haptics.play('error');
      return;
    }

    send(shootEvent(analysis.shot));
    setFeedback({ kind: 'shot', text: describeFreeThrow(analysis.shot) });
    haptics.play('success');
  };

  let turnText: string;
  if (feedback) turnText = feedback.text;
  else if (lastCue?.text && !isMyTurn) turnText = lastCue.text;
  else if (isMyTurn) {
    if (!isPressed) turnText = 'Tocca a te! Tieni premuto, porta sopra la fronte, spingi su e chiudi a gancio';
    else if (phase === 'pushing') turnText = 'Ora! Rilascia in alto e piega il polso a gancio!';
    else turnText = 'Caricato sopra la testa… spingi verso l’alto!';
  } else if (activeSlot) {
    turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  } else {
    turnText = 'Palla in volo…';
  }

  let buttonText: string;
  if (!isMyTurn) buttonText = t('controller.notYourTurn');
  else if (isPressed) buttonText = 'RILASCIA IN ALTO A GANCIO!';
  else buttonText = 'TIENI PREMUTO · CARICA E TIRA';

  let statusBadge = <span class="ctl-demo">📶 {t('controller.readySent')}</span>;
  if (isLost) {
    statusBadge = (
      <span
        class="ctl-demo"
        style={{
          background: 'color-mix(in oklab, var(--danger-500) 14%, #fff)',
          color: 'color-mix(in oklab, var(--danger-500) 70%, var(--ink-900))',
        }}
      >
        {t('controller.reconnecting')}
      </span>
    );
  } else if (isDemo) {
    statusBadge = <span class="ctl-demo">{t('controller.demoBadge')}</span>;
  }

  return (
    <section class="ctl-screen ctl-game ft-pad" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">Tiri liberi</span>
        {statusBadge}
      </header>

      <p class={`ctl-turn ${isMyTurn && !feedback ? 'ctl-turn--mine' : ''}`} aria-live="polite">
        {turnText}
      </p>

      {lastCue?.text && isMyTurn && !feedback && (
        <p class="ft-pad__cue" aria-live="polite">
          {lastCue.text}
        </p>
      )}

      {/* Guida in 3 passi del fondamentale da scuola basket */}
      <div class="ft-pad__guide" aria-label="Gesto scuola basket">
        <div class={`ft-pad__step ${isPressed && phase === 'loading' ? 'is-active' : ''}`}>
          <span class="ft-pad__step-icon" aria-hidden="true">🙆</span>
          <span>1. Sopra la testa</span>
        </div>
        <div class={`ft-pad__step ${isPressed && phase === 'pushing' ? 'is-active' : ''}`}>
          <span class="ft-pad__step-icon" aria-hidden="true">⬆️</span>
          <span>2. Spingi in alto</span>
        </div>
        <div class={`ft-pad__step ${feedback?.kind === 'shot' ? 'is-active' : ''}`}>
          <span class="ft-pad__step-icon" aria-hidden="true">🪝</span>
          <span>3. Polso a gancio</span>
        </div>
      </div>

      {isPressed && !isSimulated && (
        <div class="ft-pad__meter-wrap" aria-hidden="true">
          <div class="ft-pad__meter-head">
            <span>Caricamento sopra la fronte</span>
            <span>{Math.round(loadLevel * 100)}%</span>
          </div>
          <div class="ft-pad__meter-bar">
            <div class="ft-pad__meter-fill" style={{ width: `${Math.round(loadLevel * 100)}%` }} />
          </div>
        </div>
      )}

      {!isSimulated && <MotionMeter tracker={tracker} />}

      <button
        type="button"
        class={`ctl-action-btn ft-pad__btn ${isPressed ? 'is-pressed' : ''}`}
        disabled={!isMyTurn}
        onPointerDown={onActionDown}
        onPointerUp={onActionUp}
        onPointerCancel={onActionUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">🏀</span>
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

