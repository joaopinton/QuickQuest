// Sonda sensori di 1,5 s (docs/04 § 2, ADR-006), portata dallo spike S1.

import { at, COL, normalizeReportedInterval, type RawSample } from './raw';
import { diffs, G, median, percentile, variance } from './stats';

export const PROBE_DURATION_MS = 1500;
export const MIN_EVENTS = 30;
export const MAX_INTERVAL_MS = 33;
export const GOOD_INTERVAL_MS = 20;
const GRAVITY_TOLERANCE = 0.25;

export type CheckId = 'events' | 'frequency' | 'gyro' | 'accel';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ProbeCheck {
  readonly id: CheckId;
  readonly status: CheckStatus;
  /** Valore misurato, già formattato per l'utente. */
  readonly value: string;
  /** Codice del problema, per scegliere il messaggio nella UI. */
  readonly problem?: 'too-few' | 'too-slow' | 'missing' | 'frozen' | 'bad-gravity';
}

export interface ProbeTiming {
  readonly count: number;
  readonly spanMs: number;
  readonly medianDtMs: number;
  readonly p95DtMs: number;
  readonly hzMeasured: number;
  readonly reportedIntervalMs: number;
  readonly reportedIntervalUnit: 'ms' | 's' | 'assente';
}

export interface ProbeResult {
  readonly pass: boolean;
  readonly checks: readonly ProbeCheck[];
  readonly timing: ProbeTiming;
}

const fmt = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');

export function timingStats(samples: readonly RawSample[]): ProbeTiming {
  const ts = samples.map((s) => at(s, COL.t) ?? 0);
  const dts = diffs(ts).filter((d) => d > 0);
  const reported = normalizeReportedInterval(samples.map((s) => at(s, COL.interval)));
  const medianDtMs = dts.length ? median(dts) : Number.NaN;
  return {
    count: samples.length,
    spanMs: ts.length > 1 ? (ts[ts.length - 1] ?? 0) - (ts[0] ?? 0) : 0,
    medianDtMs,
    p95DtMs: dts.length ? percentile(dts, 95) : Number.NaN,
    hzMeasured: medianDtMs > 0 ? 1000 / medianDtMs : 0,
    reportedIntervalMs: reported.medianMs,
    reportedIntervalUnit: reported.unit,
  };
}

function frequencyCheck(t: ProbeTiming): ProbeCheck {
  const dt = t.medianDtMs;
  if (dt <= GOOD_INTERVAL_MS) return { id: 'frequency', status: 'pass', value: `${fmt(t.hzMeasured)} Hz` };
  if (dt <= MAX_INTERVAL_MS) return { id: 'frequency', status: 'warn', value: `${fmt(t.hzMeasured)} Hz` };
  return { id: 'frequency', status: 'fail', value: `${fmt(t.hzMeasured)} Hz`, problem: 'too-slow' };
}

const GYRO = [COL.ra, COL.rb, COL.rg] as const;
const ACC = [COL.ax, COL.ay, COL.az] as const;

function gyroCheck(samples: readonly RawSample[]): ProbeCheck {
  const withGyro = samples.filter((s) => GYRO.every((c) => at(s, c) !== null));
  const share = samples.length ? withGyro.length / samples.length : 0;
  if (share < 0.9) return { id: 'gyro', status: 'fail', value: 'assente', problem: 'missing' };
  const varies = GYRO.some((c) => variance(withGyro.map((s) => at(s, c) ?? 0)) > 0);
  if (!varies) return { id: 'gyro', status: 'fail', value: 'bloccato', problem: 'frozen' };
  return { id: 'gyro', status: 'pass', value: 'presente' };
}

function accelCheck(samples: readonly RawSample[]): ProbeCheck {
  const withAcc = samples.filter((s) => ACC.every((c) => at(s, c) !== null));
  if (withAcc.length === 0 || withAcc.length < samples.length * 0.9) {
    return { id: 'accel', status: 'fail', value: 'assente', problem: 'missing' };
  }
  const mag = median(withAcc.map((s) => Math.hypot(...ACC.map((c) => at(s, c) ?? 0))));
  const ok = Math.abs(mag - G) <= GRAVITY_TOLERANCE * G;
  return ok
    ? { id: 'accel', status: 'pass', value: `${fmt(mag, 1)} m/s²` }
    : { id: 'accel', status: 'fail', value: `${fmt(mag, 1)} m/s²`, problem: 'bad-gravity' };
}

/** Valuta i campioni raccolti durante la sonda. Il telefono passa se nessun controllo fallisce. */
export function evaluateProbe(samples: readonly RawSample[]): ProbeResult {
  const timing = timingStats(samples);
  const events: ProbeCheck = samples.length >= MIN_EVENTS
    ? { id: 'events', status: 'pass', value: String(samples.length) }
    : { id: 'events', status: 'fail', value: String(samples.length), problem: 'too-few' };
  const checks = [events, frequencyCheck(timing), gyroCheck(samples), accelCheck(samples)];
  return { pass: checks.every((c) => c.status !== 'fail'), checks, timing };
}
