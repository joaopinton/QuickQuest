// Valutazione della sonda sensori di 1,5 s (docs/04 § 2). Logica pura, senza DOM.

import { COL, normalizeReportedInterval } from './mapping.js';
import { G, diffs, median, norm, percentile, variance } from './math.js';

export const PROBE_DURATION_MS = 1500;
export const MIN_EVENTS = 30;
export const MAX_INTERVAL_MS = 33;
export const GOOD_INTERVAL_MS = 20;
const GRAVITY_TOLERANCE = 0.25;

/** @typedef {'pass'|'warn'|'fail'|'info'} CheckStatus */
/** @typedef {{id:string, label:string, status:CheckStatus, value:string, detail?:string}} Check */

/** Statistiche di temporizzazione dai timestamp degli eventi. */
export function timingStats(samples) {
  const ts = samples.map((s) => s[COL.t]);
  const dts = diffs(ts).filter((d) => d > 0);
  const reported = normalizeReportedInterval(samples.map((s) => s[COL.interval]));
  const medianDtMs = dts.length ? median(dts) : NaN;
  return {
    count: samples.length,
    spanMs: ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0,
    medianDtMs,
    p95DtMs: dts.length ? percentile(dts, 95) : NaN,
    maxDtMs: dts.length ? Math.max(...dts) : NaN,
    hzMeasured: medianDtMs > 0 ? 1000 / medianDtMs : 0,
    reportedIntervalMs: reported.medianMs,
    reportedIntervalUnit: reported.unit,
  };
}

const fmt = (x, digits = 1) => (Number.isFinite(x) ? x.toFixed(digits) : '—');

function frequencyCheck(timing) {
  const dt = timing.medianDtMs;
  let status = 'fail';
  if (dt <= GOOD_INTERVAL_MS) status = 'pass';
  else if (dt <= MAX_INTERVAL_MS) status = 'warn';
  const reported = timing.reportedIntervalUnit === 'assente'
    ? 'interval non riportato'
    : `interval riportato ${fmt(timing.reportedIntervalMs)} ms (unità originale: ${timing.reportedIntervalUnit})`;
  return {
    id: 'frequency',
    label: 'Frequenza',
    status,
    value: `${fmt(dt)} ms (${fmt(timing.hzMeasured, 0)} Hz)`,
    detail: `${reported}; p95 ${fmt(timing.p95DtMs)} ms, massimo ${fmt(timing.maxDtMs)} ms`,
  };
}

function gyroCheck(samples) {
  const cols = [COL.ra, COL.rb, COL.rg];
  const withGyro = samples.filter((s) => cols.every((c) => s[c] !== null));
  const share = samples.length ? withGyro.length / samples.length : 0;
  const variances = cols.map((c) => variance(withGyro.map((s) => s[c])));
  const varies = cols.some((c) => new Set(withGyro.map((s) => s[c])).size > 1);
  const ok = share >= 0.9 && varies;
  let detail = `varianza per asse (α, β, γ): ${variances.map((v) => v.toExponential(1)).join(', ')}`;
  if (share < 0.9) detail = `rotationRate nullo nel ${fmt((1 - share) * 100, 0)}% degli eventi`;
  else if (!varies) detail = 'rotationRate sempre identico: giroscopio assente o finto';
  return { id: 'gyro', label: 'Giroscopio', status: ok ? 'pass' : 'fail', value: ok ? 'presente' : 'assente', detail };
}

function accelCheck(samples) {
  const cols = [COL.ax, COL.ay, COL.az];
  const withAcc = samples.filter((s) => cols.every((c) => s[c] !== null));
  if (withAcc.length < samples.length * 0.9 || withAcc.length === 0) {
    return { id: 'accel', label: 'Accelerometro', status: 'fail', value: 'assente', detail: 'accelerationIncludingGravity nullo' };
  }
  const mag = median(withAcc.map((s) => norm(cols.map((c) => s[c]))));
  const ok = Math.abs(mag - G) <= GRAVITY_TOLERANCE * G;
  return {
    id: 'accel',
    label: 'Accelerometro',
    status: ok ? 'pass' : 'fail',
    value: `|a| mediano ${fmt(mag, 2)} m/s²`,
    detail: ok ? 'gravità nella norma (±25%)' : 'modulo lontano da 9,8 m/s²: unità errate o sensore guasto',
  };
}

function linearCheck(samples) {
  const has = samples.some((s) => s[COL.lx] !== null);
  return {
    id: 'linear',
    label: 'Accelerazione senza gravità',
    status: 'info',
    value: has ? 'disponibile' : 'non disponibile',
    detail: 'non è richiesta: la gravità si separa nel filtro',
  };
}

/**
 * Valuta la sonda secondo i criteri di docs/04 § 2.
 * @param {(number|null)[][]} samples campioni grezzi raccolti in PROBE_DURATION_MS
 * @returns {{pass:boolean, checks:Check[], timing:object}}
 */
export function evaluateProbe(samples) {
  const timing = timingStats(samples);
  const countOk = samples.length >= MIN_EVENTS;
  const checks = [
    {
      id: 'events',
      label: 'Eventi ricevuti',
      status: countOk ? 'pass' : 'fail',
      value: `${samples.length} in ${fmt(timing.spanMs / 1000, 2)} s`,
      detail: `minimo ${MIN_EVENTS}`,
    },
    frequencyCheck(timing),
    gyroCheck(samples),
    accelCheck(samples),
    linearCheck(samples),
    {
      id: 'coherence',
      label: 'Coerenza giroscopio/gravità',
      status: 'info',
      value: 'vedi test assi',
      detail: 'si misura con la "danza lenta", che confronta il giroscopio integrato con la gravità',
    },
  ];
  const pass = checks.every((c) => c.status !== 'fail');
  return { pass, checks, timing };
}
