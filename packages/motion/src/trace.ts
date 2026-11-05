// Tracce di sensori per i test (docs/04 § 7): lo stesso formato di packages/motion/test/traces,
// prodotto sia da scripts/convert-pmtrace.ts (tracce di PhoneMote) sia dal registratore `?rec`.
import type { MotionLike } from './raw';

export const TRACE_COLUMNS = ['t', 'agx', 'agy', 'agz', 'lx', 'ly', 'lz', 'ra', 'rb', 'rg'] as const;

export interface MotionTrace {
  readonly source: string;
  readonly note: string;
  readonly synthetic: boolean;
  readonly columns: typeof TRACE_COLUMNS | readonly string[];
  readonly samples: readonly (readonly number[])[];
}

const r3 = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);

/** Un evento `devicemotion` come riga della traccia; `null` se manca l'accelerazione con gravità. */
export function traceRow(e: MotionLike, t: number): number[] | null {
  const g = e.accelerationIncludingGravity;
  if (!g || typeof g.x !== 'number' || typeof g.y !== 'number' || typeof g.z !== 'number') return null;
  const l = e.acceleration ?? {};
  const r = e.rotationRate ?? {};
  return [r3(t), r3(g.x), r3(g.y), r3(g.z), r3(l.x), r3(l.y), r3(l.z), r3(r.alpha), r3(r.beta), r3(r.gamma)];
}

/** Riga della traccia → evento da passare a `tracker.feedEvent`. */
export function traceEvent(row: readonly number[]): MotionLike {
  const v = (i: number) => row[i] ?? 0;
  return {
    timeStamp: v(0),
    accelerationIncludingGravity: { x: v(1), y: v(2), z: v(3) },
    acceleration: { x: v(4), y: v(5), z: v(6) },
    rotationRate: { alpha: v(7), beta: v(8), gamma: v(9) },
  };
}

export interface TraceRecorder {
  add(e: MotionLike, t: number): void;
  readonly count: number;
  finish(note: string): MotionTrace;
}

/** Registra al massimo `maxSamples` campioni (default ~2 minuti a 60 Hz), con t relativo al primo. */
export function createTraceRecorder(source: string, maxSamples = 7200): TraceRecorder {
  let rows: number[][] = [];
  let t0: number | null = null;
  return {
    add(e, t) {
      if (rows.length >= maxSamples) return;
      t0 ??= t;
      const row = traceRow(e, t - t0);
      if (row) rows = [...rows, row];
    },
    get count() {
      return rows.length;
    },
    finish(note) {
      return { source, note, synthetic: false, columns: TRACE_COLUMNS, samples: rows };
    },
  };
}
