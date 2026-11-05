// Tipi ed eventi del gioco Bowling (docs/05, docs/games/bowling.md § 3.3).

export interface BowlingReleaseData {
  readonly speed: number;        // m/s (4.0 - 10.5)
  readonly spin: number;         // -1.0 (hook dx) .. +1.0 (hook sx)
  readonly dir: number;          // radianti deviazione orizzontale (-0.1 .. +0.1)
  readonly startX: number;       // posizione laterale di partenza sulla tavola (-0.45 .. +0.45 m)
  readonly tRelease?: number;    // timestamp ms
}

export interface BowlingPinStatus {
  readonly id: number;           // 1 .. 10
  readonly knockedDown: boolean;
  readonly x: number;
  readonly z: number;
  readonly tiltAngleDeg: number;
}

export interface BowlingShotResult {
  readonly pinCount: number;     // 0 .. 10
  readonly isStrike: boolean;
  readonly pins: readonly BowlingPinStatus[];
  readonly speedKmh: number;
  readonly durationSeconds: number;
}

/** Parametri di un lancio fatto col gesto sul telefono. */
export type GestureThrow = Pick<BowlingReleaseData, 'speed' | 'spin' | 'dir'>;

/** Evento del contratto modulo (`game-event`) per un lancio: il telefono lo manda, lo schermo lo legge. */
export const THROW_EVENT = 'throw';

/** Limiti fisici plausibili: un valore fuori scala è un dato rotto, non un lancio. */
const MAX_SPEED = 15; // m/s
const MAX_DIR = 0.5; // rad

export function throwEvent(th: GestureThrow): { kind: string; data: Record<string, number> } {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { kind: THROW_EVENT, data: { speed: round(th.speed), spin: round(th.spin), dir: round(th.dir) } };
}

/** Lancio dentro un `game-event`, o `null` se l'evento non è un lancio valido. */
export function parseThrowEvent(e: { readonly kind: string; readonly data: Readonly<Record<string, unknown>> }): GestureThrow | null {
  if (e.kind !== THROW_EVENT) return null;
  const { speed, spin, dir } = e.data;
  if (typeof speed !== 'number' || typeof spin !== 'number' || typeof dir !== 'number') return null;
  if (!(speed > 0 && speed <= MAX_SPEED) || !(Math.abs(spin) <= 1) || !(Math.abs(dir) <= MAX_DIR)) return null;
  return { speed, spin, dir };
}
