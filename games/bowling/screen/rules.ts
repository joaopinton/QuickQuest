// Regole e punteggio del bowling (docs/games/bowling.md § 5). Logica pura e immutabile:
// ogni funzione restituisce nuovi oggetti, nessuna dipendenza da fisica o rendering.

export const PINS = 10;
export const FULL_GAME_FRAMES = 10;
export const QUICK_GAME_FRAMES = 3;

export interface GameState {
  readonly frameCount: number;
  readonly playerIds: readonly string[];
  /** Tiri (birilli abbattuti) per giocatore, nello stesso ordine di `playerIds`. */
  readonly rolls: readonly (readonly number[])[];
  /** Indice del giocatore di turno. */
  readonly current: number;
}

export interface TurnInfo {
  readonly playerIndex: number;
  readonly frameIndex: number; // 0-based
  readonly rollInFrame: number; // 0-based
  /** Birilli in piedi prima del prossimo tiro (10 = rack completo). */
  readonly standing: number;
}

export type RollOutcome = 'strike' | 'spare' | 'gutter' | 'open';

export interface Standing {
  readonly playerId: string;
  readonly playerIndex: number;
  readonly position: number; // 1-based, pari merito condividono la posizione
  readonly total: number;
  readonly strikes: number;
  readonly spares: number;
  readonly gapFromLeader: number;
}

export function createGame(playerIds: readonly string[], frameCount: number = FULL_GAME_FRAMES): GameState {
  if (playerIds.length === 0) throw new Error('Serve almeno un giocatore');
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error(`Numero di frame non valido: ${frameCount}`);
  return {
    frameCount,
    playerIds: [...playerIds],
    rolls: playerIds.map(() => []),
    current: 0,
  };
}

/** Divide i tiri di un giocatore nei frame (l'ultimo frame può avere fino a 3 tiri). */
export function splitFrames(rolls: readonly number[], frameCount: number): number[][] {
  const frames: number[][] = [];
  let i = 0;
  for (let f = 0; f < frameCount && i < rolls.length; f++) {
    if (f === frameCount - 1) {
      frames.push(rolls.slice(i));
      i = rolls.length;
    } else if (rolls[i] === PINS) {
      frames.push([PINS]);
      i += 1;
    } else {
      frames.push(rolls.slice(i, i + 2));
      i += 2;
    }
  }
  return frames;
}

function isFrameComplete(frame: readonly number[], isLast: boolean): boolean {
  const [a = 0, b = 0] = frame;
  if (!isLast) return frame[0] === PINS || frame.length === 2;
  if (frame.length === 3) return true;
  return frame.length === 2 && a + b < PINS;
}

/** Birilli in piedi prima del prossimo tiro dentro un frame non ancora concluso. */
function standingIn(frame: readonly number[], isLast: boolean): number {
  const [a = 0, b = 0] = frame;
  if (frame.length === 0) return PINS;
  if (!isLast) return PINS - a;
  if (frame.length === 1) return a === PINS ? PINS : PINS - a;
  // Terzo tiro del frame finale
  if (a === PINS) return b === PINS ? PINS : PINS - b;
  return PINS; // dopo uno spare il rack è nuovo
}

function completedFrames(rolls: readonly number[], frameCount: number): number {
  const frames = splitFrames(rolls, frameCount);
  return frames.filter((fr, i) => isFrameComplete(fr, i === frameCount - 1)).length;
}

export function isGameOver(state: GameState): boolean {
  return state.rolls.every((r) => completedFrames(r, state.frameCount) === state.frameCount);
}

export function turnInfo(state: GameState): TurnInfo {
  const rolls = state.rolls[state.current] ?? [];
  const frames = splitFrames(rolls, state.frameCount);
  const lastIdx = frames.length - 1;
  const last = frames[lastIdx];
  const isOpenFrame = last !== undefined && !isFrameComplete(last, lastIdx === state.frameCount - 1);
  if (isOpenFrame) {
    return {
      playerIndex: state.current,
      frameIndex: lastIdx,
      rollInFrame: last.length,
      standing: standingIn(last, lastIdx === state.frameCount - 1),
    };
  }
  return {
    playerIndex: state.current,
    frameIndex: Math.min(frames.length, state.frameCount - 1),
    rollInFrame: 0,
    standing: PINS,
  };
}

/** Registra un tiro del giocatore di turno e, a frame concluso, passa la mano al successivo. */
export function recordRoll(state: GameState, pins: number): GameState {
  if (isGameOver(state)) throw new Error('La partita è finita');
  const { standing } = turnInfo(state);
  const knocked = Math.max(0, Math.min(standing, Math.round(pins)));

  const rolls = state.rolls.map((r, i) => (i === state.current ? [...r, knocked] : r));
  const mine = rolls[state.current] ?? [];
  const frames = splitFrames(mine, state.frameCount);
  const lastIdx = frames.length - 1;
  const frameDone = isFrameComplete(frames[lastIdx] ?? [], lastIdx === state.frameCount - 1);

  const next: GameState = { ...state, rolls };
  if (!frameDone) return next;
  return { ...next, current: (state.current + 1) % state.playerIds.length };
}

/**
 * Punteggi cumulativi per frame. Con `provisional` i bonus non ancora tirati valgono 0
 * (utile per mostrare subito i punti); altrimenti i frame in attesa di bonus sono `null`.
 */
export function frameScores(
  rolls: readonly number[],
  frameCount: number,
  provisional = false,
): (number | null)[] {
  const out: (number | null)[] = [];
  let total = 0;
  let i = 0;
  let pending = false;
  const at = (k: number): number | undefined => rolls[k];
  const bonus = (k: number): number | undefined => (provisional ? (at(k) ?? 0) : at(k));

  for (let f = 0; f < frameCount; f++) {
    if (pending || i >= rolls.length) {
      out.push(null);
      pending = true;
      continue;
    }
    if (f === frameCount - 1) {
      const frame = rolls.slice(i);
      if (!provisional && !isFrameComplete(frame, true)) {
        out.push(null);
        pending = true;
        continue;
      }
      total += frame.reduce((s, n) => s + n, 0);
      out.push(total);
      continue;
    }

    const a = at(i) ?? 0;
    if (a === PINS) {
      const b1 = bonus(i + 1);
      const b2 = bonus(i + 2);
      if (b1 === undefined || b2 === undefined) {
        out.push(null);
        pending = true;
        continue;
      }
      total += PINS + b1 + b2;
      i += 1;
    } else {
      const b = at(i + 1);
      if (b === undefined) {
        if (provisional) {
          total += a;
          out.push(total);
          pending = true;
          continue;
        }
        out.push(null);
        pending = true;
        continue;
      }
      if (a + b === PINS) {
        const b1 = bonus(i + 2);
        if (b1 === undefined) {
          out.push(null);
          pending = true;
          continue;
        }
        total += PINS + b1;
      } else {
        total += a + b;
      }
      i += 2;
    }
    out.push(total);
  }
  return out;
}

/** Totale "live": i punti certi più i birilli già abbattuti nei frame in attesa di bonus. */
export function liveTotal(rolls: readonly number[], frameCount: number): number {
  const scores = frameScores(rolls, frameCount, true);
  return scores.reduce<number>((max, s) => (s !== null ? s : max), 0);
}

/** Simboli classici del segnapunti per un frame: X strike, / spare, - zero. */
export function frameMarks(frame: readonly number[], isLast: boolean): string[] {
  const num = (n: number) => (n === 0 ? '-' : String(n));
  const [a, b, c] = frame;
  if (!isLast) {
    if (a === undefined) return [];
    if (a === PINS) return ['', 'X'];
    if (b === undefined) return [num(a)];
    return [num(a), a + b === PINS ? '/' : num(b)];
  }
  const marks: string[] = [];
  if (a === undefined) return marks;
  marks.push(a === PINS ? 'X' : num(a));
  if (b === undefined) return marks;
  if (a === PINS) marks.push(b === PINS ? 'X' : num(b));
  else marks.push(a + b === PINS ? '/' : num(b));
  if (c === undefined) return marks;
  if (a === PINS && b === PINS) marks.push(c === PINS ? 'X' : num(c));
  else if (a === PINS) marks.push(b + c === PINS ? '/' : num(c));
  else marks.push(c === PINS ? 'X' : num(c));
  return marks;
}

/** Esito dell'ultimo tiro registrato per un giocatore. */
export function lastRollOutcome(rolls: readonly number[], frameCount: number): RollOutcome | null {
  const frames = splitFrames(rolls, frameCount);
  const lastIdx = frames.length - 1;
  const frame = frames[lastIdx];
  if (!frame || frame.length === 0) return null;
  const marks = frameMarks(frame, lastIdx === frameCount - 1);
  const mark = marks[marks.length - 1];
  if (mark === 'X') return 'strike';
  if (mark === '/') return 'spare';
  if (mark === '-') return 'gutter';
  return 'open';
}

function countMarks(rolls: readonly number[], frameCount: number, mark: string): number {
  return splitFrames(rolls, frameCount)
    .flatMap((fr, i) => frameMarks(fr, i === frameCount - 1))
    .filter((m) => m === mark).length;
}

/** Classifica ordinata per punti; a pari punti stessa posizione (1°, 1°, 3°). */
export function standings(state: GameState): Standing[] {
  const rows = state.playerIds.map((playerId, playerIndex) => {
    const rolls = state.rolls[playerIndex] ?? [];
    return {
      playerId,
      playerIndex,
      total: liveTotal(rolls, state.frameCount),
      strikes: countMarks(rolls, state.frameCount, 'X'),
      spares: countMarks(rolls, state.frameCount, '/'),
    };
  });
  const leader = Math.max(...rows.map((r) => r.total));
  return rows
    .map((r) => ({
      ...r,
      position: 1 + rows.filter((o) => o.total > r.total).length,
      gapFromLeader: leader - r.total,
    }))
    .sort((x, y) => x.position - y.position || x.playerIndex - y.playerIndex);
}
