// Campioni grezzi di `devicemotion`, senza correzioni (formato dello spike S1).

import { median } from './stats';

/** t, interval, acceleration (lx..lz), accelerationIncludingGravity (ax..az), rotationRate (ra, rb, rg). */
export const COLUMNS = ['t', 'interval', 'lx', 'ly', 'lz', 'ax', 'ay', 'az', 'ra', 'rb', 'rg'] as const;
export const COL = {
  t: 0, interval: 1, lx: 2, ly: 3, lz: 4, ax: 5, ay: 6, az: 7, ra: 8, rb: 9, rg: 10,
} as const;

export type RawSample = readonly (number | null)[];

interface XYZ { x?: number | null; y?: number | null; z?: number | null }
interface Rate { alpha?: number | null; beta?: number | null; gamma?: number | null }

export interface MotionLike {
  readonly timeStamp: number;
  readonly interval?: number | null;
  readonly acceleration?: XYZ | null;
  readonly accelerationIncludingGravity?: XYZ | null;
  readonly rotationRate?: Rate | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function rawFromEvent(e: MotionLike): RawSample {
  const l = e.acceleration ?? {};
  const a = e.accelerationIncludingGravity ?? {};
  const r = e.rotationRate ?? {};
  return [
    e.timeStamp,
    num(e.interval),
    num(l.x), num(l.y), num(l.z),
    num(a.x), num(a.y), num(a.z),
    num(r.alpha), num(r.beta), num(r.gamma),
  ];
}

export const at = (s: RawSample, col: number): number | null => s[col] ?? null;

/** Alcuni browser riportano `interval` in secondi: se la mediana è < 1 si assume che lo siano. */
export function normalizeReportedInterval(reported: readonly (number | null)[]): { medianMs: number; unit: 'ms' | 's' | 'assente' } {
  const vals = reported.filter((v): v is number => typeof v === 'number' && v > 0);
  if (vals.length === 0) return { medianMs: Number.NaN, unit: 'assente' };
  const med = median(vals);
  return med < 1 ? { medianMs: med * 1000, unit: 's' } : { medianMs: med, unit: 'ms' };
}
