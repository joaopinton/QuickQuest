// Statistiche minime (portate da spikes/s1-sensor-probe/src/math.js).

export { G } from './math';

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

/** Percentile con interpolazione lineare; p in [0, 100]. */
export function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = sorted[lo] ?? Number.NaN;
  const b = sorted[hi] ?? Number.NaN;
  return a + (b - a) * (idx - lo);
}

export const median = (xs: readonly number[]): number => percentile(xs, 50);

export function diffs(xs: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) out.push((xs[i] ?? 0) - (xs[i - 1] ?? 0));
  return out;
}
