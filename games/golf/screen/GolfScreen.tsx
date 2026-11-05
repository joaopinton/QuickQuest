// Golf sullo schermo (docs/05 § Lato schermo, docs/games/golf.md): scena 3D, regole, HUD.
// I colpi arrivano già riconosciuti dai telefoni (ADR-002); qui si validano e si giocano.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import { ClubArt } from '../shared/ClubArt';
import { CLUB_NAME } from '../shared/clubs';
import { ballHeight, cameraFocusId, outboxFor, parseClub, parseShot, TERM_TEXT, type FocusHold } from './flow';
import { hazardAt } from './hazards';
import {
  aimPreview, applyShot, createGolf, currentHole, distanceToPin, findPlayer, leaderboard, removePlayer, setClub, stepGolf,
  type GolfEvent, type GolfPlayer, type GolfState, type Lie, type Step,
} from './rules';
import { createGolfScene, type BallState, type GolfScene } from './scene';
import './golf.css';

const HOLES = 3;
const HUD_REFRESH_MS = 100;
const TOAST_MS = 2200;
const MAX_FRAME_S = 0.1;
/** Dopo un colpo la camera resta sulla palla ferma (o che cade in buca) prima di passare al turno dopo. */
const FOCUS_HOLD_MS = 1600;
const SHOT_CARD_MS = 3200;
/** Dopo acqua o fuori limite la camera guarda lo spruzzo, poi va al drop. */
const PENALTY_VIEW_MS = 1300;
const DANGER_COLOR = '#ff4d4d';

const LIE_TEXT: Readonly<Record<Lie, string>> = { tee: 'tee', fairway: 'fairway', green: 'green', rough: 'rough', bunker: 'sabbia' };
/** Da dove si tira, se rende il colpo più difficile. */
const LIE_FROM: Partial<Record<Lie, string>> = { rough: 'dal rough', bunker: 'dalla sabbia' };

interface ShotCard {
  readonly club: string;
  readonly metres: number;
  readonly lie: string;
  readonly color: string;
  readonly at: number;
}

const ballState = (p: GolfPlayer): BallState => (p.result === 'holed' ? 'holed' : p.result === 'picked_up' ? 'gone' : 'play');

interface Toast {
  readonly text: string;
  readonly color: string;
  readonly at: number;
}

function toastFor(e: GolfEvent, players: readonly ScreenPlayer[]): Omit<Toast, 'at'> | null {
  const who = (id: string) => players.find((p) => p.id === id);
  if (e.kind === 'holed') return { text: `${who(e.playerId)?.name ?? e.playerId}: ${TERM_TEXT[e.term]}`, color: who(e.playerId)?.color ?? '#fff' };
  // dove si ferma conta più di dove cade: dal fairway può rimbalzare nella sabbia
  if (e.kind === 'rested' && !e.record.holed && !e.record.penalty && (e.record.endLie === 'bunker' || e.record.endLie === 'rough')) {
    return { text: e.record.endLie === 'bunker' ? 'Nel bunker!' : 'Nel rough', color: who(e.playerId)?.color ?? '#fff' };
  }
  if (e.kind === 'penalty') return { text: e.hazard === 'water' ? 'In acqua! +1' : 'Fuori limite! +1', color: who(e.playerId)?.color ?? '#fff' };
  if (e.kind === 'hole_started') return { text: `Buca ${e.hole} · par ${e.par}`, color: '#ffffff' };
  return null;
}

function formatToPar(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}

export function Screen({ players, subscribeEvents, setActiveSlot, sendCue, onEndGame, isPaused }: ScreenGameProps) {
  // la formazione si fissa all'inizio: chi entra dopo guarda
  const [roster] = useState(() => players);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GolfState | null>(null);
  const sceneRef = useRef<GolfScene | null>(null);
  const [hud, setHud] = useState<GolfState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [shotCard, setShotCard] = useState<ShotCard | null>(null);
  const io = useRef({ setActiveSlot, sendCue });
  io.current = { setActiveSlot, sendCue };
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const holdRef = useRef<FocusHold | null>(null);
  const penaltyViewRef = useRef<{ readonly at: { x: number; y: number }; readonly until: number } | null>(null);

  /** Applica un passo delle regole: stato, feedback ai telefoni, toast. */
  const commit = (step: Step) => {
    stateRef.current = step.state;
    if (step.events.length === 0) return;
    const out = outboxFor(step.events, step.state);
    if (out.activeSlot !== undefined) io.current.setActiveSlot(out.activeSlot);
    for (const { slot, cue } of out.cues) io.current.sendCue(slot, cue);
    for (const e of step.events) {
      if (e.kind === 'penalty') {
        penaltyViewRef.current = { at: e.at, until: performance.now() + PENALTY_VIEW_MS };
        sceneRef.current?.penalty(e.playerId, e.at, e.hazard);
      }
      if (e.kind === 'rested') {
        const extra = e.record.penalty ? PENALTY_VIEW_MS : 0;
        holdRef.current = { playerId: e.playerId, until: performance.now() + FOCUS_HOLD_MS + extra };
      }
      if (e.kind === 'hole_started') holdRef.current = null;
      if (e.kind === 'touchdown') sceneRef.current?.puff(e.at, e.lie, e.hop);
      if (e.kind === 'rested' && e.record.kind === 'full' && !e.record.holed && !e.record.penalty) {
        const color = roster.find((r) => r.id === e.playerId)?.color ?? '#fff';
        setShotCard({ club: CLUB_NAME[e.record.club], metres: Math.round(e.record.distanceM), lie: LIE_TEXT[e.record.endLie], color, at: performance.now() });
      }
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
      // in pausa palle e camera restano ferme: si salta il passo e si ridisegna l'ultimo fotogramma
      if (pausedRef.current) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const s = stateRef.current;
      if (s) {
        commit(stepGolf(s, dt));
        const st = stateRef.current!;
        scene.setBalls(st.players.map((p) => {
          const color = roster.find((r) => r.id === p.id)?.color ?? '#ffffff';
          return { id: p.id, color, x: p.ball.x, y: p.ball.y, height: ballHeight(p.flight), state: ballState(p), isMoving: p.flight !== null };
        }), dt);
        const focusId = cameraFocusId(st, holdRef.current, now);
        const focus = focusId ? findPlayer(st, focusId) : undefined;
        const aimer = st.phase === 'aim' && st.turn ? findPlayer(st, st.turn) : undefined;
        const aimAt = aimer ? aimPreview(currentHole(st), aimer) : null;
        // cerchio rosso se a piena potenza la mazza finisce in acqua o fuori
        const aimColor = aimAt && hazardAt(currentHole(st), aimAt) ? DANGER_COLOR : roster.find((r) => r.id === aimer?.id)?.color ?? '#ffffff';
        scene.setAim(aimAt, aimColor);
        const splash = penaltyViewRef.current;
        if (splash && now < splash.until) scene.follow({ x: splash.at.x, y: splash.at.y, height: 0, isMoving: true }, dt);
        else if (focus) scene.follow({ x: focus.ball.x, y: focus.ball.y, height: ballHeight(focus.flight), isMoving: focus.flight !== null }, dt);
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
    if (!shotCard) return;
    const id = setTimeout(() => setShotCard(null), SHOT_CARD_MS);
    return () => clearTimeout(id);
  }, [shotCard]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const hole = hud ? currentHole(hud) : null;
  const shooter = hud?.turn ? findPlayer(hud, hud.turn) : undefined;
  const shooterInfo = shooter ? roster.find((r) => r.id === shooter.id) : undefined;
  const board = hud ? leaderboard(hud) : [];
  const shooterClub = shooter?.lie === 'green' ? 'putter' : shooter?.club ?? 'driver';

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
              <ClubArt club={shooterClub} class="golf__turn-club" />
              <span>
                {shooterInfo.symbol} Tocca a {shooterInfo.name}
                <small class="golf__turn-detail">
                  {CLUB_NAME[shooterClub]} · {Math.round(distanceToPin(hole, shooter.ball))} m alla buca
                  {LIE_FROM[shooter.lie] ? ` · ${LIE_FROM[shooter.lie]}` : ''}
                </small>
              </span>
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

          {shotCard && (
            <p class="golf__shot" style={{ '--player': shotCard.color }} role="status">
              <span class="golf__shot-metres">{shotCard.metres}<small> m</small></span>
              <span class="golf__shot-detail">{shotCard.club} · {shotCard.lie}</span>
            </p>
          )}

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

