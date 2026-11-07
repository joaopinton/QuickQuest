// Pad del Barber shop sul telefono (docs/05 § Lato controller, docs/games/barber.md § Gesto).
// Il telefono è il tagliacapelli e si tiene dritto, in verticale. Si muove come un mouse: girarlo
// a destra porta la macchinetta a destra sulla testa, inclinarlo in su la porta verso la cima
// (packages/motion/aim manda i movimenti del retro, lo schermo li applica al cursore che sta
// sempre sulla testa). Niente centro da prendere, niente deriva; il tremore non muove niente.
// La poltrona non ha tasti: segue da sola la macchinetta quando si va sui lati e sulla nuca.
// Si guarda la TV, non il telefono: in alto le cose rare (Finito, Esci), sotto il pollice gli
// attrezzi (come le mazze del golf) e il tasto grande, che fa quello che fa l'attrezzo in mano:
// tenuto premuto accende la macchinetta, con le forbici ogni tocco taglia.
// Col telefono simulato (`?sim`) compare un trackpad: si trascina col dito, come su un portatile.

import { createAimPointer, type PointerPosition } from '@quickquest/motion';
import { slotStyle, t } from '@quickquest/ui';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ControllerPadProps } from '../../contract';
import {
  BARBER_TOOLS,
  finishEvent,
  snipEvent,
  TOOL_COMB,
  TOOL_HINT,
  TOOL_NAME,
  toolEvent,
  type BarberTool,
  type CombLevel,
} from '../shared/events';
import { ToolArt } from '../shared/ToolArt';
import { createClipperBuzz } from './buzz';
import './barber-pad.css';

const SEND_MS = 50;
const HEARTBEAT_MS = 500;
const MOVE_EPS = 0.002;
const CLIP_HAPTIC_MS = 140;
const UI_REFRESH_MS = 90;
const CENTER: PointerPosition = { x: 0.5, y: 0.5 };

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
  const [isUpright, setUpright] = useState(true);
  const live = useRef({ clip: false, tool: 'clip1' as BarberTool, simPos: CENTER, send });
  // Trackpad del simulatore: la mira accumula i trascinamenti, il dito che si appoggia non sposta
  const simAimRef = useRef({ ax: 0, ay: 0 });
  const simFingerRef = useRef<PointerPosition | null>(null);
  const style = slotStyle(slot);
  const isMyTurn = activeSlot === slot && !isLost;
  const isScissors = tool === 'scissors';
  live.current = { clip: isClipping, tool, simPos, send };

  const position = (): PointerPosition => (isSimulated ? live.current.simPos : aim.reading);

  // Orientamento → mira
  useEffect(() => {
    const off = tracker.subscribe((s) => {
      aim.update(s.q, s.dtMs / 1000);
    });
    const id = setInterval(() => setUpright(aim.reading.isUpright), UI_REFRESH_MS);
    return () => {
      off();
      clearInterval(id);
    };
  }, [tracker, aim]);

  // A fine turno la macchinetta si spegne
  useEffect(() => {
    setSimPos(CENTER);
    if (!isMyTurn) {
      setClipping(false);
      buzz.stop();
    }
  }, [isMyTurn, buzz]);

  // Streaming dello strumento a ~20 Hz, solo nel proprio turno
  useEffect(() => {
    if (!isMyTurn) return;
    let last = { ax: Number.NaN, ay: Number.NaN, clip: false, tool: '' as string, at: 0 };
    const id = setInterval(() => {
      const p = isSimulated ? live.current.simPos : aim.reading;
      const a = isSimulated ? simAimRef.current : aim.reading;
      const { clip, tool: current } = live.current;
      const now = performance.now();
      const moved = !(Math.abs(a.ax - last.ax) <= MOVE_EPS && Math.abs(a.ay - last.ay) <= MOVE_EPS);
      if (!moved && clip === last.clip && current === last.tool && now - last.at < HEARTBEAT_MS) return;
      live.current.send(
        toolEvent({ x: p.x, y: p.y, ax: a.ax, ay: a.ay, clip, comb: combOf(current), scissors: current === 'scissors' }),
      );
      last = { ax: a.ax, ay: a.ay, clip, tool: current, at: now };
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

  /** Il dito sul trackpad del simulatore: una larghezza del trackpad vale un'unità di mira. */
  const simPoint = (e: PointerEvent, isStart: boolean) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const finger = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    const prev = simFingerRef.current;
    if (prev && !isStart) {
      simAimRef.current = { ax: simAimRef.current.ax + finger.x - prev.x, ay: simAimRef.current.ay + finger.y - prev.y };
    }
    simFingerRef.current = finger;
    setSimPos({ x: Math.min(1, Math.max(0, finger.x)), y: Math.min(1, Math.max(0, finger.y)) });
  };

  const isTilted = isMyTurn && !isSimulated && !isUpright;
  let turnText: string;
  if (lastCue?.text && !isMyTurn) turnText = lastCue.text;
  else if (isTilted) turnText = '📱 Tieni il telefono più dritto';
  else if (isMyTurn && isClipping) turnText = 'Bzzzz… taglia!';
  else if (isMyTurn) turnText = lastCue?.text ?? 'Tocca a te: muovi il telefono sulla testa';
  else if (activeSlot) turnText = t('controller.waitTurn', { slot: `${slotStyle(activeSlot).symbol} ${activeSlot}` });
  else turnText = 'Il cliente si guarda allo specchio…';

  let statusBadge = null;
  if (isLost) statusBadge = <span class="ctl-demo bb-pad__lost">{t('controller.reconnecting')}</span>;
  else if (isDemo) statusBadge = <span class="ctl-demo">{t('controller.demoBadge')}</span>;

  let actionText: string = t('controller.notYourTurn');
  if (isMyTurn && isScissors) actionText = 'TOCCA: SFORBICIATA';
  else if (isMyTurn) actionText = isClipping ? 'TAGLIO…' : 'TIENI PREMUTO: MACCHINETTA';

  return (
    <section class="ctl-screen ctl-game bb-pad" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar bb-pad__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title bb-pad__title">Barber shop</span>
        {statusBadge}
        <button type="button" class="qq-btn qq-btn--ghost bb-pad__leave" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </header>

      <p class={`ctl-turn ${isMyTurn ? 'ctl-turn--mine' : ''} ${isTilted ? 'bb-pad__tilted' : ''}`} aria-live="polite">
        {turnText}
      </p>

      <div class="bb-pad__row">
        <button type="button" class="qq-btn qq-btn--primary" disabled={!isMyTurn} onClick={() => send(finishEvent())}>
          ✅ Finito!
        </button>
      </div>

      {isSimulated ? (
        <div
          class="bb-pad__track"
          onPointerDown={(e) => {
            e.preventDefault();
            capture(e);
            simPoint(e, true);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) simPoint(e, false);
          }}
          onPointerUp={() => {
            simFingerRef.current = null;
          }}
          aria-label="Trascina per puntare"
        >
          <span class="bb-pad__hint" aria-hidden="true">trascina come su un trackpad</span>
          <span class="bb-pad__dot" style={{ left: `${simPos.x * 100}%`, top: `${simPos.y * 100}%` }} />
        </div>
      ) : (
        <p class="bb-pad__tip">Muovi il telefono: la macchinetta scorre sulla testa e la poltrona la segue.</p>
      )}

      <ToolPicker tool={tool} isEnabled={isMyTurn} onPick={pickTool} />

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
    </section>
  );
}
