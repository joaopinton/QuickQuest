// Motore di una partita del Barber shop: tiene insieme regole, mappa dei capelli, puntamento e
// scena, fuori da Preact. Il componente dello schermo riceve solo delle "fotografie" dello stato
// (`SessionSnapshot`), aggiornate quando cambia qualcosa di visibile nell'HUD (non a ogni frame).

import type { SlotId } from '@quickquest/protocol';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import { toolFromComb, type AssistLevel, type BarberEvent, type BarberTool, type CombLevel } from '../shared/events';
import { COMB_LENGTH, HAIRCUTS, targetLength } from '../shared/haircuts';
import { CLIENT_LOOKS } from './client';
import { createHairMap, cutAt, initialHairMap, lengthAt, type BrushKind, type HairMap } from './hair-map';
import {
  easeCursor,
  edgeSlowdown,
  followYaw,
  headDir,
  MAX_AIM_JUMP,
  moveOnHead,
  nearestTurn,
  START_CURSOR,
  type ChairTurn,
  type HeadCursor,
} from './pointing';
import {
  ASSIST_CONFIG,
  createBarberGame,
  currentBarber,
  currentHaircut,
  reactionFor,
  REACTION_LINES,
  recordCut,
  scoreCut,
  tickTimer,
  timeBonusFor,
  type BarberGameState,
  type Stars,
} from './rules';
import { createBarberScene, type BarberScene } from './scene';

export type Phase = 'setup' | 'intro' | 'cutting' | 'mirror' | 'over';

export interface CutResultView {
  readonly playerId: string;
  readonly haircutId: string;
  readonly round: number;
  readonly stars: Stars;
  readonly accuracy: number;
  readonly timeBonus: number;
  readonly line: string;
}

export interface SessionSnapshot {
  readonly phase: Phase;
  readonly game: BarberGameState | null;
  readonly countdown: number;
  readonly timeLeft: number;
  readonly comb: CombLevel;
  /** Attrezzo in mano al barbiere (macchinetta col suo rialzo, o forbici). */
  readonly tool: BarberTool;
  readonly turn: ChairTurn;
  readonly result: CutResultView | null;
}

export interface SessionDeps {
  readonly container: HTMLElement;
  readonly sendCue: ScreenGameProps['sendCue'];
  readonly setActiveSlot: ScreenGameProps['setActiveSlot'];
  readonly onSnapshot: (s: SessionSnapshot) => void;
  readonly playerById: (id: string) => ScreenPlayer;
}

export interface BarberSession {
  start(playerIds: readonly string[], assist: AssistLevel): void;
  handleEvent(slot: SlotId, e: BarberEvent): void;
  toSetup(): void;
  setPaused(paused: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const INTRO_S = 3;
const MIRROR_S = 4.2;
/** Raggi visibili del pennello (radianti sulla testa). */
const CLIP_RADIUS = 0.2;
const SNIP_RADIUS = 0.12;
/** Senza notizie dal telefono per così tanto la macchinetta si spegne da sola. */
const TOOL_STALE_MS = 1000;
/** "Finito!" vale solo dopo qualche secondo di lavoro (niente tocchi per sbaglio). */
const MIN_FINISH_S = 5;


export function createBarberSession(deps: SessionDeps): BarberSession {
  const scene: BarberScene = createBarberScene(deps.container);
  try {
    return runSession(deps, scene);
  } catch (err: unknown) {
    scene.dispose();
    throw err;
  }
}

function runSession(deps: SessionDeps, scene: BarberScene): BarberSession {
  let phase: Phase = 'setup';
  let game: BarberGameState | null = null;
  let phaseT = 0;
  let cutT = 0;
  let paused = false;
  let map: HairMap = initialHairMap();
  /** Cursore sulla testa: quello vero (mosso dal telefono) e quello mostrato (ammorbidito). */
  let aimed: HeadCursor = START_CURSOR;
  let cursor: HeadCursor = START_CURSOR;
  /** Ultima mira del telefono: il cursore si muove delle differenze. */
  let lastAim: { readonly ax: number; readonly ay: number } | null = null;
  let clip = false;
  let comb: CombLevel = 1;
  let scissors = false;
  let lastToolAt = 0;
  /** Rotazione della testa (rad), continua: la poltrona segue il cursore. */
  let yaw = 0;
  let turn: ChairTurn = 0;
  let result: CutResultView | null = null;
  let lastShownSecond = -1;
  let raf = 0;
  let lastFrame = performance.now();
  // Un cliente già seduto fa da sfondo alle impostazioni
  scene.newClient(map, createHairMap((d) => targetLength(HAIRCUTS[0]!, d)).lengths, CLIENT_LOOKS[0]!);

  const activeId = (): SlotId | null =>
    game && (phase === 'intro' || phase === 'cutting') ? (currentBarber(game).playerId as SlotId) : null;

  const emit = () => {
    deps.onSnapshot({
      phase,
      game,
      countdown: phase === 'intro' ? Math.max(1, Math.ceil(INTRO_S - phaseT)) : 0,
      timeLeft: game ? Math.ceil(game.timeRemainingS) : 0,
      comb,
      tool: scissors ? 'scissors' : toolFromComb(comb),
      turn,
      result,
    });
  };

  const setPhase = (next: Phase) => {
    phase = next;
    phaseT = 0;
    deps.setActiveSlot(activeId());
    emit();
  };

  const startClient = (state: BarberGameState) => {
    const cut = currentHaircut(state);
    const barber = deps.playerById(currentBarber(state).playerId);
    map = initialHairMap();
    const target = createHairMap((d) => targetLength(cut, d)).lengths;
    const look = CLIENT_LOOKS[Math.floor(Math.random() * CLIENT_LOOKS.length)]!;
    scene.newClient(map, target, look);
    scene.setBarberColor(barber.color);
    scene.setShot('intro');
    scene.setHeadYaw(0);
    scene.setTool(null);
    yaw = 0;
    turn = 0;
    aimed = START_CURSOR;
    cursor = START_CURSOR;
    lastAim = null;
    clip = false;
    scissors = false;
    cutT = 0;
    result = null;
    lastShownSecond = -1;
    game = state;
    setPhase('intro');
    deps.sendCue(barber.id, { kind: 'select', text: `Tocca a te: ${cut.name}` });
  };

  const finishClient = () => {
    if (!game || phase !== 'cutting') return;
    const barberId = currentBarber(game).playerId;
    const score = scoreCut(map, currentHaircut(game));
    const timeBonus = timeBonusFor(score.stars, game.timeRemainingS);
    const reaction = reactionFor(score.stars);
    result = {
      playerId: barberId,
      haircutId: currentHaircut(game).id,
      round: game.currentRound,
      stars: score.stars, accuracy: score.accuracy, timeBonus, line: REACTION_LINES[reaction] };
    game = recordCut(game, score);
    clip = false;
    scene.setTool(null);
    scene.setGhost(0);
    scene.setShot('mirror');
    scene.setHeadYaw(0);
    scene.setReaction(reaction);
    deps.sendCue(barberId as SlotId, {
      kind: score.stars >= 3 ? 'success' : 'tap',
      text: `${'★'.repeat(score.stars)}${'☆'.repeat(5 - score.stars)} ${REACTION_LINES[reaction]}`,
    });
    setPhase('mirror');
  };

  const applyCut = (kind: BrushKind, radius: number) => {
    if (!game) return;
    const dir = headDir(cursor);
    const res = cutAt(map, {
      dir,
      radius: radius * ASSIST_CONFIG[game.assist].brushScale,
      floor: COMB_LENGTH[comb],
      kind,
    });
    if (res.dirtyRows) {
      scene.markHairDirty();
      scene.spawnClippings(dir, lengthAt(map, dir), res.removed);
    }
  };

  /** La poltrona segue il cursore e lo tiene davanti alla telecamera. */
  const turnHead = (dt: number) => {
    yaw = followYaw(yaw, cursor.lon, dt);
    scene.setHeadYawNow(yaw);
    const view = nearestTurn(yaw);
    if (view !== turn) {
      turn = view;
      emit();
    }
  };

  /** Il telefono si è mosso: la macchinetta scorre sulla testa della stessa quantità. */
  const moveCursor = (ax: number, ay: number) => {
    const prev = lastAim;
    lastAim = { ax, ay };
    if (!prev || !game) return;
    const dx = ax - prev.ax;
    const dy = ay - prev.ay;
    // un salto (telefono vecchio che riparte dal centro, ricentrata) non è un movimento
    if (Math.hypot(dx, dy) > MAX_AIM_JUMP) return;
    const slow = edgeSlowdown(currentHaircut(game), headDir(aimed), ASSIST_CONFIG[game.assist].dwell);
    aimed = moveOnHead(aimed, dx, dy, slow);
  };

  const stepCutting = (dt: number) => {
    if (!game) return;
    game = tickTimer(game, dt);
    cutT += dt;
    const cfg = ASSIST_CONFIG[game.assist];
    cursor = easeCursor(cursor, aimed, dt);
    turnHead(dt);
    const isOn = !scissors && clip && performance.now() - lastToolAt < TOOL_STALE_MS;
    if (isOn) applyCut('clip', CLIP_RADIUS);
    const dir = headDir(cursor);
    scene.setTool({
      contact: { dir, length: lengthAt(map, dir) },
      radius: scissors ? SNIP_RADIUS : CLIP_RADIUS,
      isOn,
      tool: scissors ? 'scissors' : toolFromComb(comb),
    });
    const ghostLeft = cfg.ghostSeconds - cutT;
    scene.setGhost(ghostLeft > 1 ? 1 : Math.max(0, ghostLeft));

    const second = Math.ceil(game.timeRemainingS);
    if (second !== lastShownSecond) {
      lastShownSecond = second;
      emit();
    }
    if (game.timeRemainingS <= 0) finishClient();
  };

  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    raf = requestAnimationFrame(frame);
    if (paused) return;
    phaseT += dt;
    if (phase === 'intro') {
      const before = Math.ceil(INTRO_S - (phaseT - dt));
      if (phaseT >= INTRO_S) {
        scene.setShot('work');
        setPhase('cutting');
      } else if (Math.ceil(INTRO_S - phaseT) !== before) {
        emit();
      }
    } else if (phase === 'cutting') {
      stepCutting(dt);
    } else if (phase === 'mirror' && phaseT >= MIRROR_S && game) {
      if (game.isOver) setPhase('over');
      else startClient(game);
    }
    scene.update(dt);
  };
  raf = requestAnimationFrame(frame);

  return {
    start(playerIds, assist) {
      startClient(createBarberGame(playerIds, { assist }));
    },
    handleEvent(slot, e) {
      if (!game || phase !== 'cutting' || slot !== activeId()) return;
      switch (e.type) {
        case 'tool':
          moveCursor(e.tool.ax ?? e.tool.x, e.tool.ay ?? e.tool.y);
          clip = e.tool.clip;
          lastToolAt = performance.now();
          if (e.tool.comb !== comb || e.tool.scissors !== scissors) {
            comb = e.tool.comb;
            scissors = e.tool.scissors;
            emit();
          }
          break;
        case 'snip':
          // la sforbiciata cade dove sta la macchinetta adesso
          cursor = aimed;
          applyCut('snip', SNIP_RADIUS);
          scene.snip();
          break;
        case 'rotate':
          // un quarto di giro: il cursore passa al lato accanto e la poltrona lo segue
          aimed = { ...aimed, lon: aimed.lon + (e.dir * Math.PI) / 2 };
          break;
        case 'finish':
          if (cutT >= MIN_FINISH_S) finishClient();
          break;
      }
    },
    toSetup() {
      game = null;
      result = null;
      scene.setTool(null);
      scene.setShot('intro');
      setPhase('setup');
    },
    setPaused(next) {
      paused = next;
    },
    resize(width, height) {
      scene.resize(width, height);
    },
    dispose() {
      cancelAnimationFrame(raf);
      deps.setActiveSlot(null);
      scene.dispose();
    },
  };
}
