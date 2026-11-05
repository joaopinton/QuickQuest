// Golf sullo schermo (docs/05 § Lato schermo, docs/games/golf.md): scena 3D, regole, HUD.
// I colpi arrivano già riconosciuti dai telefoni (ADR-002); qui si validano e si giocano.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import { ballHeight, outboxFor, parseClub, parseShot, TERM_TEXT } from './flow';
import {
  applyShot, createGolf, currentHole, distanceToPin, findPlayer, leaderboard, removePlayer, setClub, stepGolf,
  type GolfEvent, type GolfState, type Step,
} from './rules';
import { createGolfScene, type GolfScene } from './scene';
import './golf.css';

const HOLES = 3;
const HUD_REFRESH_MS = 100;
const TOAST_MS = 2200;
const MAX_FRAME_S = 0.1;

interface Toast {
  readonly text: string;
  readonly color: string;
  readonly at: number;
}

function toastFor(e: GolfEvent, players: readonly ScreenPlayer[]): Omit<Toast, 'at'> | null {
  const who = (id: string) => players.find((p) => p.id === id);
  if (e.kind === 'holed') return { text: `${who(e.playerId)?.name ?? e.playerId}: ${TERM_TEXT[e.term]}`, color: who(e.playerId)?.color ?? '#fff' };
  if (e.kind === 'landed' && (e.lie === 'bunker' || e.lie === 'rough')) {
    return { text: e.lie === 'bunker' ? 'Nel bunker!' : 'Nel rough', color: who(e.playerId)?.color ?? '#fff' };
  }
  if (e.kind === 'hole_started') return { text: `Buca ${e.hole} · par ${e.par}`, color: '#ffffff' };
  return null;
}

function formatToPar(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

export function Screen({ players, subscribeEvents, setActiveSlot, sendCue, onEndGame }: ScreenGameProps) {
  // la formazione si fissa all'inizio: chi entra dopo guarda
  const [roster] = useState(() => players);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GolfState | null>(null);
  const sceneRef = useRef<GolfScene | null>(null);
  const [hud, setHud] = useState<GolfState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const io = useRef({ setActiveSlot, sendCue });
  io.current = { setActiveSlot, sendCue };

  /** Applica un passo delle regole: stato, feedback ai telefoni, toast. */
  const commit = (step: Step) => {
    stateRef.current = step.state;
    if (step.events.length === 0) return;
    const out = outboxFor(step.events, step.state);
    if (out.activeSlot !== undefined) io.current.setActiveSlot(out.activeSlot);
    for (const { slot, cue } of out.cues) io.current.sendCue(slot, cue);
    for (const e of step.events) {
      const t = toastFor(e, roster);
      if (t) setToast({ ...t, at: performance.now() });
      if (e.kind === 'hole_started') sceneRef.current?.setHole(currentHole(step.state));
    }
  };

  // scena e ciclo di gioco
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createGolfScene(container);
    sceneRef.current = scene;
    const first = createGolf(roster.map((p) => p.id), { holes: HOLES, seed: Date.now() % 100000 });
    scene.setHole(currentHole(first.state));
    commit(first);

    const resize = () => scene.resize(container.clientWidth, container.clientHeight);
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(MAX_FRAME_S, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (s) {
        commit(stepGolf(s, dt));
        const st = stateRef.current!;
        scene.setBalls(st.players.map((p) => {
          const color = roster.find((r) => r.id === p.id)?.color ?? '#ffffff';
          return { id: p.id, color, x: p.ball.x, y: p.ball.y, height: ballHeight(p.flight) };
        }));
        const focus = st.players.find((p) => p.flight) ?? (st.turn ? findPlayer(st, st.turn) : undefined) ?? st.players[0];
        if (focus) scene.follow({ x: focus.ball.x, y: focus.ball.y, height: ballHeight(focus.flight) }, dt);
      }
      scene.render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const hudTimer = setInterval(() => setHud(stateRef.current), HUD_REFRESH_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      window.removeEventListener('resize', resize);
      scene.dispose();
      sceneRef.current = null;
      io.current.setActiveSlot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la partita si crea una volta sola
  }, []);

  // colpi e mazze dai telefoni
  useEffect(() => subscribeEvents((slot, e) => {
    const s = stateRef.current;
    if (!s) return;
    const shot = parseShot(e);
    if (shot) {
      commit(applyShot(s, slot, shot));
      return;
    }
    const club = parseClub(e);
    if (club) stateRef.current = setClub(s, slot, club);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit legge solo ref
  }), [subscribeEvents]);

  // un giocatore che se ne va finisce la buca qui
  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    const here = new Set(players.map((p) => p.id));
    for (const p of roster) if (!here.has(p.id)) commit(removePlayer(stateRef.current!, p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reagisce solo ai giocatori collegati
  }, [players]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const hole = hud ? currentHole(hud) : null;
  const shooter = hud?.turn ? findPlayer(hud, hud.turn) : undefined;
  const shooterInfo = shooter ? roster.find((r) => r.id === shooter.id) : undefined;
  const board = hud ? leaderboard(hud) : [];

  return (
    <div class="golf">
      <div ref={containerRef} class="golf__canvas" />
      {hud && hole && (
        <>
          <header class="golf__bar">
            <span class="golf__chip">Buca {hud.hole}/{hud.course.length}</span>
            <span class="golf__chip">Par {hole.par}</span>
            <span class="golf__chip">{Math.round(hole.lengthM)} m</span>
            <span class="golf__chip">Vento {hole.wind >= 0 ? '→' : '←'} {Math.abs(hole.wind).toFixed(1)} m/s</span>
          </header>

          {shooter && shooterInfo && hud.phase === 'aim' && (
            <p class="golf__turn" style={{ '--player': shooterInfo.color }} aria-live="polite">
              {shooterInfo.symbol} Tocca a {shooterInfo.name} · {shooter.lie === 'green' ? 'putt' : shooter.club} ·{' '}
              {Math.round(distanceToPin(hole, shooter.ball))} m
            </p>
          )}

          <ol class="golf__board" aria-label="Classifica">
            {board.map((c) => {
              const p = roster.find((r) => r.id === c.playerId);
              const live = findPlayer(hud, c.playerId);
              return (
                <li key={c.playerId} style={{ '--player': p?.color ?? '#fff' }}>
                  <span class="golf__board-name">{p?.symbol} {p?.name}</span>
                  <span class="golf__board-score">{c.holesPlayed > 0 ? formatToPar(c.toPar) : '–'}</span>
                  <span class="golf__board-strokes">{live && live.result === 'playing' ? `${live.strokes} colpi` : ''}</span>
                </li>
              );
            })}
          </ol>

          {toast && <p class="golf__toast" style={{ '--player': toast.color }} role="status">{toast.text}</p>}

          {hud.phase === 'over' && (
            <section class="golf__over" aria-labelledby="golf-over-title">
              <h2 id="golf-over-title">Partita finita!</h2>
              <p>{roster.find((r) => r.id === board[0]?.playerId)?.name ?? ''} vince con {formatToPar(board[0]?.toPar ?? 0)}</p>
              <button type="button" class="qq-btn qq-btn--lg" onClick={onEndGame}>Torna alla lobby</button>
            </section>
          )}

          <button type="button" class="golf__quit qq-btn qq-btn--ghost" onClick={onEndGame}>Esci dalla partita</button>
        </>
      )}
    </div>
  );
}

