// Eventi del Barber shop (docs/05, docs/games/barber.md).
// A differenza degli altri giochi l'input è continuo: il telefono è lo strumento e manda la
// posizione del puntatore a ~20 Hz (`tool`) finché è il suo turno. Tutti i campi sono piatti e
// numerici/booleani, come vuole `isGameEvent` del protocollo.

export type AssistLevel = 'easy' | 'normal' | 'pro';

/** Lunghezza del pettine della macchinetta: 0 = a zero, 1 = corto, 2 = medio. */
export type CombLevel = 0 | 1 | 2;
export const COMB_LEVELS: readonly CombLevel[] = [0, 1, 2];
export const COMB_LABELS: Readonly<Record<CombLevel, string>> = { 0: 'A zero', 1: 'Corto', 2: 'Medio' };

/**
 * Gli attrezzi sul carrello del barbiere: la macchinetta con tre rialzi (il pettino che si
 * aggancia alle lame e decide la lunghezza) e le forbici. Si scelgono sul telefono come le mazze
 * del golf; lo schermo mostra in mano al barbiere quello scelto.
 */
export type BarberTool = 'clip0' | 'clip1' | 'clip2' | 'scissors';
export const BARBER_TOOLS: readonly BarberTool[] = ['clip0', 'clip1', 'clip2', 'scissors'];
export const TOOL_COMB: Readonly<Record<Exclude<BarberTool, 'scissors'>, CombLevel>> = { clip0: 0, clip1: 1, clip2: 2 };
export const TOOL_NAME: Readonly<Record<BarberTool, string>> = {
  clip0: 'Rialzo 0',
  clip1: 'Rialzo 3',
  clip2: 'Rialzo 6',
  scissors: 'Forbici',
};
export const TOOL_HINT: Readonly<Record<BarberTool, string>> = {
  clip0: 'rasato',
  clip1: 'corto',
  clip2: 'medio',
  scissors: 'a tocchi',
};

export function toolFromComb(comb: CombLevel): BarberTool {
  return comb === 0 ? 'clip0' : comb === 1 ? 'clip1' : 'clip2';
}

export const TOOL_EVENT = 'tool';
export const SNIP_EVENT = 'snip';
export const ROTATE_EVENT = 'rotate';
export const FINISH_EVENT = 'finish';

export interface ToolState {
  /** Puntatore 0..1, 0.5 = centro della testa. */
  readonly x: number;
  /** Puntatore 0..1, 0 = in alto. */
  readonly y: number;
  /** Macchinetta accesa (tasto grande premuto). */
  readonly clip: boolean;
  readonly comb: CombLevel;
  /** In mano ci sono le forbici (la macchinetta resta spenta, si taglia coi `snip`). */
  readonly scissors: boolean;
}

export interface SnipData {
  readonly x: number;
  readonly y: number;
}

export type BarberEvent =
  | { readonly type: 'tool'; readonly tool: ToolState }
  | { readonly type: 'snip'; readonly snip: SnipData }
  | { readonly type: 'rotate'; readonly dir: 1 | -1 }
  | { readonly type: 'finish' };

interface WireEvent {
  readonly kind: string;
  readonly data: Record<string, number | boolean>;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function toolEvent(t: ToolState): WireEvent {
  return { kind: TOOL_EVENT, data: { x: round3(clamp01(t.x)), y: round3(clamp01(t.y)), clip: t.clip, comb: t.comb, scissors: t.scissors } };
}

export function snipEvent(s: SnipData): WireEvent {
  return { kind: SNIP_EVENT, data: { x: round3(clamp01(s.x)), y: round3(clamp01(s.y)) } };
}

export function rotateEvent(dir: 1 | -1): WireEvent {
  return { kind: ROTATE_EVENT, data: { dir } };
}

export function finishEvent(): WireEvent {
  return { kind: FINISH_EVENT, data: {} };
}

const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function isCombLevel(v: unknown): v is CombLevel {
  return v === 0 || v === 1 || v === 2;
}

/** Valida un `game-event` del barbiere; `null` se non è valido. */
export function parseBarberEvent(e: {
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
}): BarberEvent | null {
  const d = e.data;
  switch (e.kind) {
    case TOOL_EVENT:
      if (!isUnit(d.x) || !isUnit(d.y) || typeof d.clip !== 'boolean' || !isCombLevel(d.comb)) return null;
      // `scissors` è arrivato dopo: un telefono vecchio non lo manda, vuol dire macchinetta
      if (d.scissors !== undefined && typeof d.scissors !== 'boolean') return null;
      return { type: 'tool', tool: { x: d.x, y: d.y, clip: d.clip, comb: d.comb, scissors: d.scissors === true } };
    case SNIP_EVENT:
      if (!isUnit(d.x) || !isUnit(d.y)) return null;
      return { type: 'snip', snip: { x: d.x, y: d.y } };
    case ROTATE_EVENT:
      if (d.dir !== 1 && d.dir !== -1) return null;
      return { type: 'rotate', dir: d.dir };
    case FINISH_EVENT:
      return { type: 'finish' };
    default:
      return null;
  }
}
