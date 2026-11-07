// Pad del Barber shop sul telefono (docs/05 § Lato controller, docs/games/barber.md § Gesto).
// Il telefono è il tagliacapelli e si tiene DRITTO, in verticale: si taglia dove guarda il retro
// (mira assoluta, packages/motion/aim). Stesso orientamento = stesso punto, niente deriva in
// altezza; il centro orizzontale si prende da solo quando il telefono si ferma dritto a inizio
// turno, oppure col tasto "Centra".
// Gli attrezzi si scelgono come le mazze del golf: macchinetta coi tre rialzi o forbici. Il tasto
// grande fa quello che fa l'attrezzo in mano: tenuto premuto accende la macchinetta (vibra e
// ronza), con le forbici ogni tocco è una sforbiciata.
// Col telefono simulato (`?sim`) compare una superficie per puntare col dito.

import { createAimPointer, type PointerPosition } from '@quickquest/motion';
import { slotStyle, t } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import {
  BARBER_TOOLS,
  finishEvent,
  rotateEvent,
  snipEvent,
  TOOL_COMB,
  TOOL_HINT,
  TOOL_NAME,
  toolEvent,
  type BarberTool,
  type CombLevel,
} from '../shared/events';
import { HEAD_SPAN } from '../shared/head';
import { ToolArt } from '../shared/ToolArt';
import { createClipperBuzz } from './buzz';
import './barber-pad.css';

const SEND_MS = 50;
const HEARTBEAT_MS = 500;
const MOVE_EPS = 0.002;
const CLIP_HAPTIC_MS = 140;
const UI_REFRESH_MS = 90;
/** Per prendere il centro da solo il telefono deve stare dritto e fermo così a lungo. */
const AUTO_CENTER_STEADY_MS = 300;
const CENTER: PointerPosition = { x: 0.5, y: 0.5 };

interface AimView extends PointerPosition {
  readonly isUpright: boolean;
}

const combOf = (tool: BarberTool): CombLevel => (tool === 'scissors' ? 1 : TOOL_COMB[tool]);

/** Il pointer capture può mancare (pointer sintetici, dito già sollevato): non è un errore. */
function capture(e: PointerEvent): void {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  } catch {
    // senza capture il gesto funziona lo stesso, finché il dito resta sul tasto
  }
}

interface ToolPickerProps {
  readonly tool: BarberTool;
  readonly isEnabled: boolean;
  readonly onPick: (tool: BarberTool) => void;
}

/** Gli attrezzi sul carrello, disegnati uno accanto all'altro: si tocca quello che si vuole. */
function ToolPicker({ tool, isEnabled, onPick }: ToolPickerProps) {
  return (
    <div class="bb-tools-pick" role="radiogroup" aria-label="Scegli l'attrezzo">
      {BARBER_TOOLS.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === tool}
          class={`bb-tool ${item === tool ? 'is-selected' : ''}`}
          disabled={!isEnabled}
          onClick={() => onPick(item)}
        >
          <ToolArt tool={item} class="bb-tool__art" />
          <span class="bb-tool__name">{TOOL_NAME[item]}</span>
          <span class="bb-tool__meta">{TOOL_HINT[item]}</span>
        </button>
      ))}
    </div>
  );
}

/** Mirino: la testa del cliente e il punto in cui guarda il retro del telefono. */
function AimGauge({ aim }: { readonly aim: AimView }) {
  const size = `${HEAD_SPAN * 200}%`;
  const dx = (aim.x - 0.5) / HEAD_SPAN;
  const dy = (aim.y - 0.5) / HEAD_SPAN;
  const isOnHead = Math.hypot(dx, dy) <= 1.15;
  return (
    <div class={`bb-aim ${aim.isUpright ? '' : 'is-tilted'}`} aria-hidden="true">
      <span class="bb-aim__head" style={{ width: size, height: size }} />
      <span class={`bb-aim__dot ${isOnHead ? 'is-on' : ''}`} style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }} />
      <span class="bb-aim__label">
        {aim.isUpright ? (isOnHead ? 'Sulla testa' : 'Fuori dalla testa') : '📱 Tieni il telefono dritto, retro verso lo schermo'}
      </span>
    </div>
  );
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
  const aim = useMemo(() => createAimPointer(), []);
  const buzz = useMemo(() => createClipperBuzz(), []);
  const [isClipping, setClipping] = useState(false);
  const [tool, setTool] = useState<BarberTool>('clip1');
  const [simPos, setSimPos] = useState<PointerPosition>(CENTER);
  const [aimView, setAimView] = useState<AimView>({ ...CENTER, isUpright: true });
  const live = useRef({ clip: false, tool: 'clip1' as BarberTool, simPos: CENTER, send });
  const needsCenterRef = useRef(true);
  const style = slotStyle(slot);
  const isMyTurn = activeSlot === slot && !isLost;
  const isScissors = tool === 'scissors';
  live.current = { clip: isClipping, tool, simPos, send };

  const position = (): PointerPosition => (isSimulated ? live.current.simPos : aim.reading);

  // Orientamento → mira; a inizio turno il centro si prende quando il telefono si ferma dritto
  useEffect(() => {
    const off = tracker.subscribe((s) => {
      const r = aim.update(s.q, s.dtMs / 1000);
      if (needsCenterRef.current && r.isUpright && s.still.isStill && s.still.steadyMs >= AUTO_CENTER_STEADY_MS) {
        aim.recenter();
        needsCenterRef.current = false;
      }
    });
    const id = setInterval(() => {
      const r = aim.reading;
      setAimView((prev) =>
        Math.abs(prev.x - r.x) < MOVE_EPS && Math.abs(prev.y - r.y) < MOVE_EPS && prev.isUpright === r.isUpright
          ? prev
          : { x: r.x, y: r.y, isUpright: r.isUpright },
      );
    }, UI_REFRESH_MS);
    return () => {
      off();
      clearInterval(id);
    };
  }, [tracker, aim]);

  // A inizio turno si riprende il centro; a fine turno la macchinetta si spegne
  useEffect(() => {
    needsCenterRef.current = true;
    setSimPos(CENTER);
    if (!isMyTurn) {
      setClipping(false);
      buzz.stop();
    }
  }, [isMyTurn, buzz]);

  // Streaming dello strumento a ~20 Hz, solo nel proprio turno
  useEffect(() => {
    if (!isMyTurn) return;
    let last = { x: -1, y: -1, clip: false, tool: '' as string, at: 0 };
    const id = setInterval(() => {
      const p = isSimulated ? live.current.simPos : aim.reading;
      const { clip, tool: current } = live.current;
      const now = performance.now();
      const moved = Math.abs(p.x - last.x) > MOVE_EPS || Math.abs(p.y - last.y) > MOVE_EPS;
      if (!moved && clip === last.clip && current === last.tool && now - last.at < HEARTBEAT_MS) return;
      live.current.send(toolEvent({ x: p.x, y: p.y, clip, comb: combOf(current), scissors: current === 'scissors' }));
      last = { x: p.x, y: p.y, clip, tool: current, at: now };
    }, SEND_MS);
    return () => clearInterval(id);
  }, [isMyTurn, isSimulated, aim]);

  // Vibrazione ritmata della macchinetta (su iPhone resta il ronzio audio)
  useEffect(() => {
    if (!isClipping) return;
    const id = setInterval(() => haptics.impact(0.25), CLIP_HAPTIC_MS);
    return () => clearInterval(id);
  }, [isClipping, haptics]);

  useEffect(() => () => buzz.dispose(), [buzz]);

  const stopClipper = () => {
    setClipping(false);
    buzz.stop();
  };

  const actionDown = (e: PointerEvent) => {
    e.preventDefault();
    if (!isMyTurn) return;
    if (isScissors) {
      send(snipEvent(position()));
      haptics.impact(0.6);
      return;
    }
    capture(e);
    setClipping(true);
    buzz.start();
    haptics.play('tap');
  };

  const actionUp = (e: PointerEvent) => {
    e.preventDefault();
    stopClipper();
  };

  const pickTool = (next: BarberTool) => {
    if (next === tool) return;
    if (next === 'scissors') stopClipper();
    setTool(next);
    haptics.play('select');
  };

  const rotate = (dir: 1 | -1) => {
    if (!isMyTurn) return;
    send(rotateEvent(dir));
    haptics.play('select');
  };

  const recenter = () => {
    aim.recenter();
    needsCenterRef.current = false;
    haptics.play('success');
  };

  const simPoint = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSimPos({
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  };

  let turnText: string;
  if (lastCue?.text && !isMyTurn) turnText = lastCue.text;
  else if (isMyTurn && isClipping) turnText = 'Bzzzz… taglia!';
  else if (isMyTurn) turnText = lastCue?.text ?? 'Tocca a te: punta il retro del telefono sulla testa';
  else if (activeSlot) turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  else turnText = 'Il cliente si guarda allo specchio…';

  let statusBadge = <span class="ctl-demo">📶 {t('controller.readySent')}</span>;
  if (isLost) statusBadge = <span class="ctl-demo bb-pad__lost">{t('controller.reconnecting')}</span>;
  else if (isDemo) statusBadge = <span class="ctl-demo">{t('controller.demoBadge')}</span>;

  let actionText: string = t('controller.notYourTurn');
  if (isMyTurn && isScissors) actionText = 'TOCCA: SFORBICIATA';
  else if (isMyTurn) actionText = isClipping ? 'TAGLIO…' : 'TIENI PREMUTO: MACCHINETTA';

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

      <ToolPicker tool={tool} isEnabled={isMyTurn} onPick={pickTool} />

      {isSimulated ? (
        <div
          class="bb-pad__track"
          onPointerDown={(e) => {
            e.preventDefault();
            capture(e);
            simPoint(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) simPoint(e);
          }}
          aria-label="Trascina per puntare"
        >
          <span class="bb-aim__head" style={{ width: `${HEAD_SPAN * 200}%`, height: `${HEAD_SPAN * 200}%` }} />
          <span class="bb-pad__dot" style={{ left: `${simPos.x * 100}%`, top: `${simPos.y * 100}%` }} />
        </div>
      ) : (
        <AimGauge aim={aimView} />
      )}

      <div class="bb-pad__row">
        <button type="button" class="qq-btn qq-btn--secondary" disabled={!isMyTurn} onClick={() => rotate(-1)} aria-label="Gira la poltrona a sinistra">
          ↺ Poltrona
        </button>
        {!isSimulated && (
          <button type="button" class="qq-btn qq-btn--secondary" onClick={recenter}>
            🎯 Centra
          </button>
        )}
        <button type="button" class="qq-btn qq-btn--secondary" disabled={!isMyTurn} onClick={() => rotate(1)} aria-label="Gira la poltrona a destra">
          Poltrona ↻
        </button>
      </div>

      <button
        type="button"
        class={`ctl-action-btn bb-pad__action ${isClipping ? 'is-pressed' : ''} ${isScissors ? 'is-scissors' : ''}`}
        disabled={!isMyTurn}
        onPointerDown={actionDown}
        onPointerUp={actionUp}
        onPointerCancel={actionUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">{isScissors ? '✂️' : '💈'}</span>
        <span>{actionText}</span>
      </button>

      <footer class="ctl-actions">
        <button type="button" class="qq-btn qq-btn--primary" disabled={!isMyTurn} onClick={() => send(finishEvent())}>
          ✅ Finito!
        </button>
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </footer>
    </section>
  );
}
