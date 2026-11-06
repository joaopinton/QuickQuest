// Regole, punteggio, assist, serie ("Mano calda"), spareggio e premi dei Tiri liberi
// (docs/games/free-throw.md § Regole & Assist, docs/11-games-brainstorm.md § 4).
// Logica pura senza dipendenze da Three.js, testata con Vitest.

import type {
  AssistLevel,
  FreeThrowMode,
  FreeThrowShotData,
  ResolvedOutcome,
  ShotFeedbackHint,
} from '../shared/events';
import { idealSpeedForAngle } from './physics';

export const POINTS_BASKET = 2;
export const POINTS_SWISH = 3; // +1 punto bonus per il "ciuff" solo retina
export const HOT_HAND_STREAK = 3; // 3 canestri di fila = moltiplicatore ×2 nella modalità a tempo
export const TIMED_DURATION_S = 60;

export interface ShotRecord {
  readonly round: number; // 1-based
  readonly outcome: ResolvedOutcome;
  readonly points: number;
  readonly multiplier: number;
  readonly isTiebreaker: boolean;
}

export interface PlayerStats {
  readonly playerId: string;
  readonly score: number;
  readonly attempts: number;
  readonly made: number;
  readonly swishes: number;
  readonly rimHits: number; // ferri presi (per il premio "Mattoncino")
  readonly streak: number;
  readonly bestStreak: number;
  readonly clutchMade: boolean; // canestro all'ultimo giro o nello spareggio
  readonly history: readonly ShotRecord[];
}

export interface FreeThrowGameState {
  readonly mode: FreeThrowMode;
  readonly assist: AssistLevel;
  readonly totalRounds: number; // 10 in classic, 5 in quick, 1 in timed
  readonly currentRound: number; // 1-based
  readonly currentPlayerIndex: number;
  /** Indici dei giocatori attivi nel giro corrente (tutti, o solo i pari merito nello spareggio). */
  readonly activeIndices: readonly number[];
  readonly isTiebreaker: boolean;
  readonly isOver: boolean;
  readonly timeRemainingS: number; // usato nella modalità 'timed'
  readonly players: readonly PlayerStats[];
}

export interface AssistConfig {
  readonly sweetSpotTolerance: number; // es. 0.08 = ±8%
  readonly sweetSpotPull: number; // 0..1 quanto attrae verso la velocità ideale
  readonly dirScale: number; // 0.3 Facile, 0.5 Normale, 0.9 Pro
  readonly angleAssist: number; // aiuto verso 53° se c'è chiusura a gancio
}

export const ASSIST_CONFIG: Readonly<Record<AssistLevel, AssistConfig>> = {
  easy: { sweetSpotTolerance: 0.16, sweetSpotPull: 0.85, dirScale: 0.25, angleAssist: 0.65 },
  normal: { sweetSpotTolerance: 0.12, sweetSpotPull: 0.68, dirScale: 0.4, angleAssist: 0.45 },
  pro: { sweetSpotTolerance: 0.04, sweetSpotPull: 0.25, dirScale: 0.75, angleAssist: 0.15 },
};

/**
 * Indica se mostrare l'arco guida tratteggiato in scena (docs/11 § 4.3):
 * - Facile: sempre
 * - Normale: nei primi 3 tiri del giocatore
 * - Pro: mai
 */
export function shouldShowGuideArc(assist: AssistLevel, playerAttemptsSoFar: number): boolean {
  if (assist === 'easy') return true;
  if (assist === 'normal') return playerAttemptsSoFar < 3;
  return false;
}

/**
 * Applica il livello di assist scelto (sweet spot di potenza, scala della mira laterale
 * e stabilizzazione dell'angolo d'uscita con buona chiusura a gancio).
 */
export function applyShotAssist(shot: FreeThrowShotData, assist: AssistLevel): FreeThrowShotData {
  const cfg = ASSIST_CONFIG[assist];

  // 1. Stabilizzazione dell'angolo attorno a 53° quando il giocatore chiude bene a gancio
  const idealAngle = 53;
  const pullAngle = cfg.angleAssist * Math.min(1, shot.hookQuality);
  const releaseAngleDeg = shot.releaseAngleDeg + (idealAngle - shot.releaseAngleDeg) * pullAngle;

  // 2. Sweet spot di potenza: entro ±8% (Normale) o ±12% (Facile) la velocità è attratta verso il valore ideale
  const idealSpeed = idealSpeedForAngle(releaseAngleDeg, shot.backspin);
  const relError = Math.abs(shot.speed - idealSpeed) / idealSpeed;
  let speed = shot.speed;
  if (cfg.sweetSpotTolerance > 0 && relError <= cfg.sweetSpotTolerance) {
    // Più siamo vicini al centro dello sweet spot, più il tiro viene accompagnato
    const closeness = 1 - (relError / cfg.sweetSpotTolerance) * 0.4;
    const pull = cfg.sweetSpotPull * closeness;
    speed = shot.speed + (idealSpeed - shot.speed) * pull;
  }

  // 3. Scala della deviazione laterale
  const dir = shot.dir * cfg.dirScale;

  return {
    ...shot,
    speed,
    releaseAngleDeg,
    dir,
  };
}

export interface CreateGameOptions {
  readonly mode?: FreeThrowMode;
  readonly assist?: AssistLevel;
  readonly rounds?: number;
}

export function createFreeThrowGame(
  playerIds: readonly string[],
  opts: CreateGameOptions = {},
): FreeThrowGameState {
  if (playerIds.length === 0) {
    throw new Error('FreeThrow: serve almeno un giocatore');
  }
  const mode = opts.mode ?? 'classic';
  const assist = opts.assist ?? 'normal';
  const totalRounds = opts.rounds ?? (mode === 'classic' ? 10 : mode === 'quick' ? 5 : 1);

  const players: PlayerStats[] = playerIds.map((playerId) => ({
    playerId,
    score: 0,
    attempts: 0,
    made: 0,
    swishes: 0,
    rimHits: 0,
    streak: 0,
    bestStreak: 0,
    clutchMade: false,
    history: [],
  }));

  return {
    mode,
    assist,
    totalRounds,
    currentRound: 1,
    currentPlayerIndex: 0,
    activeIndices: players.map((_, i) => i),
    isTiebreaker: false,
    isOver: false,
    timeRemainingS: mode === 'timed' ? TIMED_DURATION_S : 0,
    players,
  };
}

export function currentShooter(state: FreeThrowGameState): PlayerStats {
  return state.players[state.currentPlayerIndex] ?? state.players[0]!;
}

export function isShotMade(outcome: ResolvedOutcome): boolean {
  return outcome === 'swish' || outcome === 'rim-in' || outcome === 'bank-in';
}

/** Calcola i punti assegnati da un tiro (2 per canestro, 3 per swish, ×2 se Mano calda in modalità a tempo). */
export function pointsForOutcome(
  outcome: ResolvedOutcome,
  mode: FreeThrowMode,
  streakBeforeShot: number,
): { readonly points: number; readonly multiplier: number } {
  if (!isShotMade(outcome)) return { points: 0, multiplier: 1 };
  const base = outcome === 'swish' ? POINTS_SWISH : POINTS_BASKET;
  const multiplier = mode === 'timed' && streakBeforeShot >= HOT_HAND_STREAK ? 2 : 1;
  return { points: base * multiplier, multiplier };
}

/** Registra l'esito di un tiro e avanza il turno (o apre lo spareggio / chiude la partita). */
export function recordShot(
  state: FreeThrowGameState,
  outcome: ResolvedOutcome,
): FreeThrowGameState {
  if (state.isOver) return state;

  const idx = state.currentPlayerIndex;
  const player = state.players[idx];
  if (!player) return state;

  const made = isShotMade(outcome);
  const { points, multiplier } = pointsForOutcome(outcome, state.mode, player.streak);
  const nextStreak = made ? player.streak + 1 : 0;
  const isFinalOrTiebreak = state.isTiebreaker || state.currentRound === state.totalRounds;

  const record: ShotRecord = {
    round: state.currentRound,
    outcome,
    points,
    multiplier,
    isTiebreaker: state.isTiebreaker,
  };

  const updatedPlayer: PlayerStats = {
    ...player,
    score: player.score + points,
    attempts: player.attempts + 1,
    made: player.made + (made ? 1 : 0),
    swishes: player.swishes + (outcome === 'swish' ? 1 : 0),
    rimHits: player.rimHits + (outcome === 'rim-out' || outcome === 'rim-in' ? 1 : 0),
    streak: nextStreak,
    bestStreak: Math.max(player.bestStreak, nextStreak),
    clutchMade: player.clutchMade || (made && isFinalOrTiebreak),
    history: [...player.history, record],
  };

  const players = state.players.map((p, i) => (i === idx ? updatedPlayer : p));

  // Nella modalità a tempo lo stesso giocatore continua a tirare finché non scade il timer
  if (state.mode === 'timed') {
    return {
      ...state,
      players,
    };
  }

  // Modalità a giri (classic / quick): passa al prossimo giocatore attivo nel giro
  const posInActive = state.activeIndices.indexOf(idx);
  if (posInActive >= 0 && posInActive < state.activeIndices.length - 1) {
    const nextIdx = state.activeIndices[posInActive + 1]!;
    return {
      ...state,
      currentPlayerIndex: nextIdx,
      players,
    };
  }

  // Fine del giro corrente
  if (!state.isTiebreaker && state.currentRound < state.totalRounds) {
    return {
      ...state,
      currentRound: state.currentRound + 1,
      currentPlayerIndex: state.activeIndices[0] ?? 0,
      players,
    };
  }

  // Tutti i giri regolamentari (o il giro di spareggio) sono finiti: controlliamo se c'è parità in testa
  const candidates = state.isTiebreaker
    ? state.activeIndices.map((i) => players[i]!)
    : players;
  const maxScore = Math.max(...candidates.map((p) => p.score));
  const leaders = players
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => (!state.isTiebreaker || state.activeIndices.includes(i)) && p.score === maxScore);

  if (leaders.length > 1) {
    // Spareggio a morte improvvisa tra i primi a pari merito!
    const tiedIndices = leaders.map((l) => l.i);
    return {
      ...state,
      currentRound: state.currentRound + 1,
      currentPlayerIndex: tiedIndices[0]!,
      activeIndices: tiedIndices,
      isTiebreaker: true,
      players,
    };
  }

  return {
    ...state,
    isOver: true,
    players,
  };
}

/** Avanza l'orologio nella modalità a tempo (60 s per giocatore). */
export function tickTimedMode(state: FreeThrowGameState, dtS: number): FreeThrowGameState {
  if (state.mode !== 'timed' || state.isOver) return state;
  const remaining = Math.max(0, state.timeRemainingS - dtS);
  if (remaining > 0) {
    return { ...state, timeRemainingS: remaining };
  }

  // Tempo scaduto per il giocatore corrente: passa al successivo o chiude la partita
  const nextIndex = state.currentPlayerIndex + 1;
  if (nextIndex < state.players.length) {
    return {
      ...state,
      currentPlayerIndex: nextIndex,
      timeRemainingS: TIMED_DURATION_S,
    };
  }

  return {
    ...state,
    timeRemainingS: 0,
    isOver: true,
  };
}

export interface StandingRow {
  readonly playerId: string;
  readonly position: number;
  readonly score: number;
  readonly made: number;
  readonly attempts: number;
  readonly swishes: number;
  readonly bestStreak: number;
  readonly gapFromLeader: number;
}

/** Classifica ordinata per punteggio (a parità, più swish e più canestri). */
export function standings(state: FreeThrowGameState): StandingRow[] {
  const sorted = [...state.players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.swishes !== a.swishes) return b.swishes - a.swishes;
    return b.made - a.made;
  });

  const leaderScore = sorted[0]?.score ?? 0;
  let currentRank = 1;
  return sorted.map((p, idx) => {
    if (idx > 0 && p.score < sorted[idx - 1]!.score) {
      currentRank = idx + 1;
    }
    return {
      playerId: p.playerId,
      position: currentRank,
      score: p.score,
      made: p.made,
      attempts: p.attempts,
      swishes: p.swishes,
      bestStreak: p.bestStreak,
      gapFromLeader: leaderScore - p.score,
    };
  });
}

export interface MatchAward {
  readonly id: 'swish-master' | 'hot-hand' | 'ice-cold' | 'brick-layer';
  readonly title: string;
  readonly subtitle: string;
  readonly icon: string;
  readonly playerId: string;
}

/**
 * Calcola i premi di fine partita (docs/11-games-brainstorm.md § 4.5),
 * incluso il premio consolazione "Mattoncino".
 */
export function computeAwards(state: FreeThrowGameState): MatchAward[] {
  const awards: MatchAward[] = [];
  if (state.players.length === 0) return awards;

  // 1. Solo retina (più swish)
  const topSwish = [...state.players].sort((a, b) => b.swishes - a.swishes)[0]!;
  if (topSwish.swishes > 0) {
    awards.push({
      id: 'swish-master',
      title: 'Solo retina',
      subtitle: `${topSwish.swishes} swish pulit${topSwish.swishes === 1 ? 'o' : 'i'} ("ciuff!")`,
      icon: '🎯',
      playerId: topSwish.playerId,
    });
  }

  // 2. Mano calda (serie più lunga)
  const topStreak = [...state.players].sort((a, b) => b.bestStreak - a.bestStreak)[0]!;
  if (topStreak.bestStreak >= 2) {
    awards.push({
      id: 'hot-hand',
      title: 'Mano calda',
      subtitle: `${topStreak.bestStreak} canestri di fila`,
      icon: '🔥',
      playerId: topStreak.playerId,
    });
  }

  // 3. Freddo come il ghiaccio (canestro decisivo all'ultimo giro/spareggio)
  const clutchPlayer = state.players.find((p) => p.clutchMade);
  if (clutchPlayer) {
    awards.push({
      id: 'ice-cold',
      title: 'Freddo come il ghiaccio',
      subtitle: 'Canestro all’ultimo giro',
      icon: '🧊',
      playerId: clutchPlayer.playerId,
    });
  }

  // 4. Mattoncino (premio consolazione: più ferri presi)
  const topBricks = [...state.players].sort((a, b) => b.rimHits - a.rimHits)[0]!;
  if (topBricks.rimHits > 0) {
    awards.push({
      id: 'brick-layer',
      title: 'Mattoncino',
      subtitle: `${topBricks.rimHits} ferr${topBricks.rimHits === 1 ? 'o preso' : 'i presi'}`,
      icon: '🧱',
      playerId: topBricks.playerId,
    });
  }

  return awards;
}

/** Messaggio breve di feedback per il telefono e l'HUD dopo il tiro (docs/games/free-throw.md § Rischi). */
export function feedbackMessageFor(
  outcome: ResolvedOutcome,
  hint: ShotFeedbackHint,
  points: number,
  multiplier = 1,
): { readonly title: string; readonly cueText: string; readonly isGood: boolean } {
  const bonusTag = multiplier > 1 ? ` (×${multiplier}🔥)` : '';
  if (outcome === 'swish') {
    return {
      title: 'CIUFF! SOLO RETINA!',
      cueText: `CIUFF! Solo retina! +${points}${bonusTag}`,
      isGood: true,
    };
  }
  if (outcome === 'bank-in') {
    return {
      title: 'DI TABELLA!',
      cueText: `Canestro di tabella! +${points}${bonusTag}`,
      isGood: true,
    };
  }
  if (outcome === 'rim-in') {
    return {
      title: 'CANESTRO!',
      cueText: `Dentro! +${points}${bonusTag}`,
      isGood: true,
    };
  }

  // Tiro sbagliato: consiglio pratico da scuola basket
  const hintMap: Readonly<Record<ShotFeedbackHint, string>> = {
    perfect: 'Quasi dentro! Riprova così',
    short: 'Un po’ corto · spingi più verso l’alto',
    long: 'Un po’ lungo · dosa la spinta',
    left: 'A sinistra · tieni dritto il gomito',
    right: 'A destra · allinea gomito e polso',
    flat: 'Tiro piatto · rilascia più in alto sopra la testa!',
    'no-hook': 'Chiudi di più il polso a gancio in cima!',
  };

  const advice = hintMap[hint];
  if (outcome === 'airball') {
    return {
      title: 'AIR BALL!',
      cueText: `Air ball · ${advice}`,
      isGood: false,
    };
  }
  if (outcome === 'rim-out') {
    return {
      title: 'FERRO!',
      cueText: `Ferro! ${advice}`,
      isGood: false,
    };
  }
  return {
    title: 'TABELLONE!',
    cueText: `Tabellone · ${advice}`,
    isGood: false,
  };
}

