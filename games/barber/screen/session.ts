// Motore di una partita del Barber shop: tiene insieme regole, mappa dei capelli, puntamento e
// scena, fuori da Preact. Il componente dello schermo riceve solo delle "fotografie" dello stato
// (`SessionSnapshot`), aggiornate quando cambia qualcosa di visibile nell'HUD (non a ogni frame).

import type { SlotId } from '@quickquest/protocol';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import type { AssistLevel, BarberEvent, CombLevel } from '../shared/events';
import { COMB_LENGTH, HAIRCUTS, targetLength } from '../shared/haircuts';
import { CLIENT_LOOKS } from './client';
import { createHairMap, cutAt, initialHairMap, lengthAt, type BrushKind, type HairMap } from './hair-map';
import { edgeSlowdown, followPointer, headYaw, pointerToDir, turnChair, type ChairTurn, type Cursor } from './pointing';
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
const CENTER: Cursor = { x: 0.5, y: 0.5 };

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
  let cursor: Cursor = CENTER;
  let raw: Cursor = CENTER;
  let clip = false;
  let comb: CombLevel = 1;
  let lastToolAt = 0;
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
    scene.setCursor(null);
    turn = 0;
    cursor = CENTER;
    raw = CENTER;
    clip = false;
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
    scene.setCursor(null);
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
    const dir = pointerToDir(cursor, turn);
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

  const stepCutting = (dt: number) => {
    if (!game) return;
    game = tickTimer(game, dt);
    cutT += dt;
    const cfg = ASSIST_CONFIG[game.assist];
    const cut = currentHaircut(game);
    const slow = edgeSlowdown(cut, pointerToDir(cursor, turn), cfg.dwell);
    cursor = followPointer(cursor, raw, dt, slow);
    const isCutting = clip && performance.now() - lastToolAt < TOOL_STALE_MS;
    if (isCutting) applyCut('clip', CLIP_RADIUS);
    const dir = pointerToDir(cursor, turn);
    scene.setCursor({ dir, length: lengthAt(map, dir), radius: CLIP_RADIUS, isCutting });
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
          raw = { x: e.tool.x, y: e.tool.y };
          clip = e.tool.clip;
          lastToolAt = performance.now();
          if (e.tool.comb !== comb) {
            comb = e.tool.comb;
            emit();
          }
          break;
        case 'snip':
          // la sforbiciata cade dove puntava il telefono al tocco, non dove è rimasto il cursore
          raw = { x: e.snip.x, y: e.snip.y };
          cursor = raw;
          applyCut('snip', SNIP_RADIUS);
          break;
        case 'rotate':
          turn = turnChair(turn, e.dir);
          scene.setHeadYaw(headYaw(turn));
          emit();
          break;
        case 'finish':
          if (cutT >= MIN_FINISH_S) finishClient();
          break;
      }
    },
    toSetup() {
      game = null;
      result = null;
      scene.setCursor(null);
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
