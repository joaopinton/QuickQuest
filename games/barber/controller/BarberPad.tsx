// Pad del Barber shop sul telefono (docs/05 § Lato controller, docs/games/barber.md § Gesto).
// Il telefono è il tagliacapelli: inclinandolo si muove il cerchio sulla testa del cliente
// (puntatore col giroscopio, packages/motion/pointer). Tasto grande tenuto premuto = macchinetta
// (vibra e ronza), tasto forbici = una sforbiciata per tocco. Sul trackpad: swipe orizzontale per
// girare la poltrona, verticale per il pettine, doppio tocco per ricentrare.
// Col telefono simulato (`?sim`) il trackpad diventa una superficie per puntare col dito.

import { aimRates, createPointer, type PointerPosition } from '@quickquest/motion';
import { slotStyle, t } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import { COMB_LABELS, COMB_LEVELS, finishEvent, rotateEvent, snipEvent, toolEvent, type CombLevel } from '../shared/events';
import { createClipperBuzz } from './buzz';
import './barber-pad.css';

const SEND_MS = 50;
const HEARTBEAT_MS = 500;
const MOVE_EPS = 0.002;
const CLIP_HAPTIC_MS = 140;
const SWIPE_PX = 40;
const DOUBLE_TAP_MS = 320;
const CENTER: PointerPosition = { x: 0.5, y: 0.5 };

/** Il pointer capture può mancare (pointer sintetici, dito già sollevato): non è un errore. */
function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    // senza capture il gesto funziona lo stesso, finché il dito resta sul tasto
  }
}

interface Gesture {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export function Pad({
  slot,
  color,
  isDemo,
  isLost,
  activeSlot,
  tracker,
  haptics,
  lastCue,
  isSimulated,
  send,
  onLeave,
}: ControllerPadProps) {
  const pointer = useMemo(() => createPointer(), []);
  const buzz = useMemo(() => createClipperBuzz(), []);
  const [isClipping, setClipping] = useState(false);
  const [comb, setComb] = useState<CombLevel>(1);
  const [simPos, setSimPos] = useState<PointerPosition>(CENTER);
  const live = useRef({ clip: false, comb: 1 as CombLevel, simPos: CENTER, send });
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef(0);
  const style = slotStyle(slot);
  const isMyTurn = activeSlot === slot && !isLost;
  live.current = { clip: isClipping, comb, simPos, send };

  const position = (): PointerPosition => (isSimulated ? live.current.simPos : pointer.position);

  // Giroscopio → puntatore
  useEffect(
    () =>
      tracker.subscribe((s) => {
        pointer.update(aimRates(s.gyro, s.q), s.dtMs / 1000);
      }),
    [tracker, pointer],
  );

  // A inizio turno lo strumento riparte dal centro della testa; a fine turno si spegne
  useEffect(() => {
    pointer.recenter();
    setSimPos(CENTER);
    if (!isMyTurn) {
      setClipping(false);
      buzz.stop();
    }
  }, [isMyTurn, pointer, buzz]);

  // Streaming dello strumento a ~20 Hz, solo nel proprio turno
  useEffect(() => {
    if (!isMyTurn) return;
    let last = { x: -1, y: -1, clip: false, comb: -1, at: 0 };
    const id = setInterval(() => {
      const p = isSimulated ? live.current.simPos : pointer.position;
      const { clip, comb: c } = live.current;
      const now = performance.now();
      const moved = Math.abs(p.x - last.x) > MOVE_EPS || Math.abs(p.y - last.y) > MOVE_EPS;
      if (!moved && clip === last.clip && c === last.comb && now - last.at < HEARTBEAT_MS) return;
      live.current.send(toolEvent({ x: p.x, y: p.y, clip, comb: c }));
      last = { x: p.x, y: p.y, clip, comb: c, at: now };
    }, SEND_MS);
    return () => clearInterval(id);
  }, [isMyTurn, isSimulated, pointer]);

  // Vibrazione ritmata della macchinetta (su iPhone resta il ronzio audio)
  useEffect(() => {
    if (!isClipping) return;
    const id = setInterval(() => haptics.impact(0.25), CLIP_HAPTIC_MS);
    return () => clearInterval(id);
  }, [isClipping, haptics]);

  useEffect(() => () => buzz.dispose(), [buzz]);

  const clipDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    capture(e);
    setClipping(true);
    buzz.start();
    haptics.play('tap');
  };

  const clipUp = (e: PointerEvent) => {
    e.preventDefault();
    setClipping(false);
    buzz.stop();
  };

  const snip = () => {
    if (!isMyTurn) return;
    send(snipEvent(position()));
    haptics.impact(0.6);
  };

  const changeComb = (next: CombLevel) => {
    if (next === comb) return;
    setComb(next);
    haptics.play('select');
  };

  const rotate = (dir: 1 | -1) => {
    if (!isMyTurn) return;
    send(rotateEvent(dir));
    haptics.play('select');
  };

  const simPoint = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSimPos({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  };

  const padDown = (e: PointerEvent) => {
    e.preventDefault();
    capture(e);
    if (isSimulated) {
      simPoint(e);
      return;
    }
    gestureRef.current = { x: e.clientX, y: e.clientY, at: performance.now() };
  };

  const padMove = (e: PointerEvent) => {
    if (isSimulated && e.buttons > 0) simPoint(e);
  };

  const padUp = (e: PointerEvent) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (isSimulated || !g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      rotate(dx > 0 ? 1 : -1);
    } else if (Math.abs(dy) > SWIPE_PX) {
      const step = dy < 0 ? 1 : -1;
      changeComb(Math.min(2, Math.max(0, comb + step)) as CombLevel);
    } else {
      const now = performance.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        pointer.recenter();
        haptics.play('success');
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  let turnText: string;
  if (lastCue?.text && !isMyTurn) turnText = lastCue.text;
  else if (isMyTurn) turnText = isClipping ? 'Bzzzz… taglia!' : lastCue?.text ?? 'Tocca a te: muovi il telefono sulla testa';
  else if (activeSlot) turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  else turnText = 'Il cliente si guarda allo specchio…';

  let statusBadge = <span class="ctl-demo">📶 {t('controller.readySent')}</span>;
  if (isLost) statusBadge = <span class="ctl-demo bb-pad__lost">{t('controller.reconnecting')}</span>;
  else if (isDemo) statusBadge = <span class="ctl-demo">{t('controller.demoBadge')}</span>;

  const shown = isSimulated ? simPos : null;

  return (
    <section class="ctl-screen ctl-game bb-pad" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">Barber shop</span>
        {statusBadge}
      </header>

      <p class={`ctl-turn ${isMyTurn ? 'ctl-turn--mine' : ''}`} aria-live="polite">
        {turnText}
      </p>

      <div
        class={`bb-pad__track ${isSimulated ? 'is-sim' : ''}`}
        onPointerDown={padDown}
        onPointerMove={padMove}
        onPointerUp={padUp}
        onPointerCancel={() => {
          gestureRef.current = null;
        }}
        aria-label={isSimulated ? 'Trascina per puntare' : 'Swipe: gira la poltrona o cambia pettine. Doppio tocco: ricentra'}
      >
        {shown ? (
          <span class="bb-pad__dot" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }} />
        ) : (
          <span class="bb-pad__hint">
            ⇆ poltrona · ⇅ pettine
            <br />
            doppio tocco = centro
          </span>
        )}
      </div>

      <div class="bb-pad__row" role="radiogroup" aria-label="Pettine">
        {COMB_LEVELS.map((lvl) => (
          <button
            key={lvl}
            type="button"
            role="radio"
            aria-checked={comb === lvl}
            class={`bb-pad__comb ${comb === lvl ? 'is-active' : ''}`}
            onClick={() => changeComb(lvl)}
          >
            {COMB_LABELS[lvl]}
          </button>
        ))}
      </div>

      <div class="bb-pad__row">
        <button type="button" class="qq-btn qq-btn--secondary" disabled={!isMyTurn} onClick={() => rotate(-1)} aria-label="Gira la poltrona a sinistra">
          ↺
        </button>
        <button type="button" class="bb-pad__scissors" disabled={!isMyTurn} onClick={snip}>
          ✂️ Forbici
        </button>
        <button type="button" class="qq-btn qq-btn--secondary" disabled={!isMyTurn} onClick={() => rotate(1)} aria-label="Gira la poltrona a destra">
          ↻
        </button>
      </div>

      <button
        type="button"
        class={`ctl-action-btn bb-pad__clipper ${isClipping ? 'is-pressed' : ''}`}
        disabled={!isMyTurn}
        onPointerDown={clipDown}
        onPointerUp={clipUp}
        onPointerCancel={clipUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">💈</span>
        <span>{isMyTurn ? (isClipping ? 'TAGLIO…' : 'TIENI PREMUTO: MACCHINETTA') : t('controller.notYourTurn')}</span>
      </button>

      <footer class="ctl-actions">
        <button type="button" class="qq-btn qq-btn--primary" disabled={!isMyTurn} onClick={() => send(finishEvent())}>
          ✅ Finito!
        </button>
        {!isSimulated && (
          <button
            type="button"
            class="qq-btn qq-btn--secondary"
            onClick={() => {
              pointer.recenter();
              haptics.play('success');
            }}
          >
            🎯 Centro
          </button>
        )}
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </footer>
    </section>
  );
}
