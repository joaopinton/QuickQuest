// Regole del Barber shop, modalità Classica (docs/11 § 6.1, § 6.3, § 6.5).
// Stato immutabile: ogni funzione restituisce un nuovo stato. A giri: in ogni giro ogni giocatore
// ha un cliente con la stessa richiesta, 90 s per cliente, voto in stelle dalla mappa delle
// lunghezze confrontata con il taglio richiesto.

import type { AssistLevel } from '../shared/events';
import { findHaircut, HAIRCUTS, targetLength, zoneWeight, type Haircut } from '../shared/haircuts';
import { isScalp, mirrorColumn, texelArea, texelDir } from '../shared/head';
import { toLength, type HairMap } from './hair-map';

export const CLIENT_TIME_S = 90;
export const DEFAULT_ROUNDS = 3;
export const POINTS_PER_STAR = 100;
export const MAX_TIME_BONUS = 50;
/** Il bonus tempo si guadagna solo con un taglio decente. */
export const TIME_BONUS_MIN_STARS = 3;
/** Quanto pesa l'errore medio: un taglio intatto su "tutto a zero" vale ~0%. */
const ERROR_GAIN = 2.2;
const SYMMETRY_BONUS = 0.05;
const HOLE_PENALTY = 0.5;

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface AssistConfig {
  /** Moltiplicatore del raggio del pennello rispetto a quello visibile. */
  readonly brushScale: number;
  /** Freno del cursore vicino ai bordi del taglio (1 = nessuno). */
  readonly dwell: number;
  /** Secondi in cui si vede la sagoma del taglio sulla testa (`Infinity` = sempre). */
  readonly ghostSeconds: number;
}

export const ASSIST_CONFIG: Readonly<Record<AssistLevel, AssistConfig>> = {
  easy: { brushScale: 1.3, dwell: 0.4, ghostSeconds: Infinity },
  normal: { brushScale: 1.15, dwell: 0.65, ghostSeconds: 10 },
  pro: { brushScale: 1, dwell: 1, ghostSeconds: 0 },
};

export interface CutScore {
  /** 0..1, già con simmetria e buchi. */
  readonly accuracy: number;
  /** 0..1, 1 = lati identici. */
  readonly symmetry: number;
  /** Frazione del cuoio capelluto rasato dove il taglio voleva capelli. */
  readonly holes: number;
  readonly stars: Stars;
}

export interface CutRecord extends CutScore {
  readonly haircutId: string;
  readonly timeBonus: number;
  readonly points: number;
}

export interface PlayerStats {
  readonly playerId: string;
  readonly score: number;
  readonly cuts: readonly CutRecord[];
}

export interface BarberGameState {
  readonly players: readonly PlayerStats[];
  readonly assist: AssistLevel;
  readonly rounds: number;
  /** Un taglio per giro, uguale per tutti. */
  readonly haircutIds: readonly string[];
  /** 1-based. */
  readonly currentRound: number;
  readonly currentPlayerIndex: number;
  readonly timeRemainingS: number;
  readonly isOver: boolean;
}

export interface CreateOptions {
  readonly assist?: AssistLevel;
  readonly rounds?: number;
  readonly haircutIds?: readonly string[];
  readonly random?: () => number;
}

/** Sceglie `n` tagli diversi (si ripetono solo se il catalogo non basta). */
export function pickHaircuts(n: number, random: () => number = Math.random): string[] {
  const pool = HAIRCUTS.map((h) => h.id);
  const shuffled = [...pool]
    .map((id) => ({ id, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.id);
  return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]!);
}

export function createBarberGame(playerIds: readonly string[], opts: CreateOptions = {}): BarberGameState {
  const rounds = Math.max(1, opts.rounds ?? DEFAULT_ROUNDS);
  const haircutIds = opts.haircutIds && opts.haircutIds.length >= rounds
    ? opts.haircutIds.slice(0, rounds)
    : pickHaircuts(rounds, opts.random);
  const ids = playerIds.length > 0 ? playerIds : ['P1'];
  return {
    players: ids.map((playerId) => ({ playerId, score: 0, cuts: [] })),
    assist: opts.assist ?? 'normal',
    rounds,
    haircutIds,
    currentRound: 1,
    currentPlayerIndex: 0,
    timeRemainingS: CLIENT_TIME_S,
    isOver: false,
  };
}

export function currentBarber(state: BarberGameState): PlayerStats {
  return state.players[state.currentPlayerIndex] ?? state.players[0]!;
}

export function currentHaircut(state: BarberGameState): Haircut {
  return findHaircut(state.haircutIds[state.currentRound - 1] ?? state.haircutIds[0] ?? HAIRCUTS[0]!.id);
}

export function tickTimer(state: BarberGameState, dt: number): BarberGameState {
  if (state.isOver || dt <= 0 || state.timeRemainingS <= 0) return state;
  return { ...state, timeRemainingS: Math.max(0, state.timeRemainingS - dt) };
}

export const isTimeUp = (state: BarberGameState): boolean => state.timeRemainingS <= 0;

export function starsFor(accuracy: number): Stars {
  if (accuracy >= 0.9) return 5;
  if (accuracy >= 0.75) return 4;
  if (accuracy >= 0.55) return 3;
  if (accuracy >= 0.35) return 2;
  return 1;
}

/** Confronta la mappa con il taglio richiesto (docs/11 § 6.1). */
export function scoreCut(map: HairMap, cut: Haircut): CutScore {
  const { size, lengths } = map;
  let errSum = 0;
  let weightSum = 0;
  let symSum = 0;
  let symCount = 0;
  let holeArea = 0;
  let scalpArea = 0;

  for (let r = 0; r < size; r++) {
    const area = texelArea(r, size);
    for (let c = 0; c < size; c++) {
      const d = texelDir(c, r, size);
      if (!isScalp(d)) continue;
      const len = toLength(lengths[r * size + c]!);
      const want = targetLength(cut, d);
      const w = area * zoneWeight(d);
      errSum += Math.abs(len - want) * w;
      weightSum += w;
      scalpArea += area;
      if (want >= 0.3 && len < 0.15) holeArea += area;
      if (d[0] > 0) {
        const mirrored = toLength(lengths[r * size + mirrorColumn(c, size)]!);
        symSum += Math.abs(len - mirrored) * area;
        symCount += area;
      }
    }
  }

  const meanErr = weightSum > 0 ? errSum / weightSum : 1;
  const symmetry = symCount > 0 ? Math.max(0, 1 - (symSum / symCount) * 3) : 0;
  const holes = scalpArea > 0 ? holeArea / scalpArea : 0;
  const base = 1 - meanErr * ERROR_GAIN;
  const bonus = symmetry > 0.8 && base > 0.5 ? SYMMETRY_BONUS * symmetry : 0;
  const accuracy = Math.min(1, Math.max(0, base + bonus - holes * HOLE_PENALTY));
  return { accuracy, symmetry, holes, stars: starsFor(accuracy) };
}

export function timeBonusFor(stars: Stars, timeRemainingS: number): number {
  if (stars < TIME_BONUS_MIN_STARS) return 0;
  return Math.round((Math.min(CLIENT_TIME_S, Math.max(0, timeRemainingS)) / CLIENT_TIME_S) * MAX_TIME_BONUS);
}

/** Chiude il cliente di turno e passa al prossimo barbiere (o al giro dopo). */
export function recordCut(state: BarberGameState, score: CutScore): BarberGameState {
  if (state.isOver) return state;
  const timeBonus = timeBonusFor(score.stars, state.timeRemainingS);
  const record: CutRecord = {
    ...score,
    haircutId: currentHaircut(state).id,
    timeBonus,
    points: score.stars * POINTS_PER_STAR + timeBonus,
  };
  const players = state.players.map((p, i) =>
    i === state.currentPlayerIndex ? { ...p, score: p.score + record.points, cuts: [...p.cuts, record] } : p,
  );
  const lastPlayer = state.currentPlayerIndex >= state.players.length - 1;
  const nextRound = lastPlayer ? state.currentRound + 1 : state.currentRound;
  const isOver = lastPlayer && state.currentRound >= state.rounds;
  return {
    ...state,
    players,
    currentPlayerIndex: lastPlayer ? 0 : state.currentPlayerIndex + 1,
    currentRound: isOver ? state.currentRound : nextRound,
    timeRemainingS: CLIENT_TIME_S,
    isOver,
  };
}

export interface StandingRow {
  readonly playerId: string;
  readonly score: number;
  readonly position: number;
  readonly avgStars: number;
}

const avgStars = (p: PlayerStats): number =>
  p.cuts.length > 0 ? p.cuts.reduce((s, c) => s + c.stars, 0) / p.cuts.length : 0;

export function standings(state: BarberGameState): StandingRow[] {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return sorted.map((p, i) => ({
    playerId: p.playerId,
    score: p.score,
    avgStars: avgStars(p),
    position: i > 0 && sorted[i - 1]!.score === p.score ? i : i + 1,
  }));
}

export interface Award {
  readonly id: 'golden-hands' | 'lightning' | 'symmetry' | 'avant-garde';
  readonly title: string;
  readonly icon: string;
  readonly playerId: string;
}

function bestBy(players: readonly PlayerStats[], key: (p: PlayerStats) => number): PlayerStats | null {
  let best: PlayerStats | null = null;
  for (const p of players) if (p.cuts.length > 0 && (!best || key(p) > key(best))) best = p;
  return best;
}

/** Premi di fine partita: c'è sempre quello di consolazione (docs/11 § 1.7, § 6.5). */
export function computeAwards(state: BarberGameState): Award[] {
  const awards: Award[] = [];
  const golden = bestBy(state.players, avgStars);
  if (golden) awards.push({ id: 'golden-hands', title: "Mani d'oro", icon: '👐', playerId: golden.playerId });

  const fastest = bestBy(state.players, (p) => p.cuts.reduce((s, c) => s + c.timeBonus, 0));
  if (fastest && fastest.cuts.some((c) => c.timeBonus > 0)) {
    awards.push({ id: 'lightning', title: 'Fulmine', icon: '⚡', playerId: fastest.playerId });
  }

  const symmetric = bestBy(state.players, (p) => Math.max(...p.cuts.map((c) => c.symmetry)));
  if (symmetric) awards.push({ id: 'symmetry', title: 'Simmetria perfetta', icon: '⚖️', playerId: symmetric.playerId });

  const worst = bestBy(state.players, (p) => -Math.min(...p.cuts.map((c) => c.accuracy)));
  if (worst) awards.push({ id: 'avant-garde', title: "Stilista d'avanguardia", icon: '🎨', playerId: worst.playerId });
  return awards;
}

export type Reaction = 'selfie' | 'happy' | 'puzzled' | 'awkward' | 'shocked';

export function reactionFor(stars: Stars): Reaction {
  const map: Readonly<Record<Stars, Reaction>> = { 5: 'selfie', 4: 'happy', 3: 'puzzled', 2: 'awkward', 1: 'shocked' };
  return map[stars];
}

export const REACTION_LINES: Readonly<Record<Reaction, string>> = {
  selfie: 'Stupendo! Mi faccio un selfie!',
  happy: 'Bello! Ecco la mancia.',
  puzzled: 'Mmh… interessante.',
  awkward: '…grazie?',
  shocked: 'Dov’è il mio cappello?!',
};
