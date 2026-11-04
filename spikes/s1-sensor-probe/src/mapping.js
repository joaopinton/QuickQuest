// Formato dei campioni grezzi e mapping assi/unità/segni verso il frame del dispositivo
// (X a destra dello schermo, Y verso il lato superiore, Z uscente dallo schermo; vedi docs/04 § 3).

import {
  DEG2RAD, G, angleBetween, mean, median, norm, normalize, qFromRotationVector, qRotate, scale, std,
} from './math.js';

/**
 * Colonne di un campione grezzo, così come arriva da `devicemotion`, senza correzioni.
 * t: event.timeStamp (ms) · interval: event.interval com'è riportato (unità non garantita)
 * lx..lz: acceleration (senza gravità, può mancare) · ax..az: accelerationIncludingGravity
 * ra, rb, rg: rotationRate.alpha / beta / gamma (unità non garantita)
 */
export const COLUMNS = Object.freeze(['t', 'interval', 'lx', 'ly', 'lz', 'ax', 'ay', 'az', 'ra', 'rb', 'rg']);
export const COL = Object.freeze(Object.fromEntries(COLUMNS.map((c, i) => [c, i])));

/** @typedef {(number|null)[]} RawSample */

/**
 * @typedef {object} Mapping
 * @property {number[]} gyroPerm  indici in [ra, rb, rg] per gli assi x, y, z del dispositivo
 * @property {number[]} gyroSign  segno per x, y, z
 * @property {number} gyroScale   fattore verso rad/s (DEG2RAD se il browser dà °/s)
 * @property {number[]} accSign   segno per x, y, z di accelerationIncludingGravity
 */

/** Mapping atteso dalla specifica W3C: x = beta, y = gamma, z = alpha, in °/s. */
export const W3C_MAPPING = Object.freeze({
  gyroPerm: [1, 2, 0],
  gyroSign: [1, 1, 1],
  gyroScale: DEG2RAD,
  accSign: [1, 1, 1],
});

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Converte un DeviceMotionEvent (o un oggetto con la stessa forma) in un campione grezzo.
 * @param {{timeStamp:number, interval?:number, acceleration?:object|null,
 *   accelerationIncludingGravity?:object|null, rotationRate?:object|null}} e
 * @returns {RawSample}
 */
export function rawFromEvent(e) {
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

/** Vero se il campione ha giroscopio e accelerometro (con gravità) completi. */
export function isComplete(s) {
  return [COL.ax, COL.ay, COL.az, COL.ra, COL.rb, COL.rg].every((i) => s[i] !== null);
}

/**
 * Applica un mapping a un campione grezzo.
 * @param {RawSample} s
 * @param {Mapping} m
 * @returns {{t:number, gyro:number[], accG:number[], lin:number[]|null}}
 */
export function applyMapping(s, m) {
  const rr = [s[COL.ra] ?? 0, s[COL.rb] ?? 0, s[COL.rg] ?? 0];
  const gyro = [0, 1, 2].map((axis) => rr[m.gyroPerm[axis]] * m.gyroSign[axis] * m.gyroScale);
  const accG = [s[COL.ax] ?? 0, s[COL.ay] ?? 0, s[COL.az] ?? 0].map((v, i) => v * m.accSign[i]);
  const hasLin = s[COL.lx] !== null && s[COL.ly] !== null && s[COL.lz] !== null;
  const lin = hasLin ? [s[COL.lx], s[COL.ly], s[COL.lz]].map((v, i) => v * m.accSign[i]) : null;
  return { t: s[COL.t], gyro, accG, lin };
}

/**
 * Normalizza `interval` in millisecondi. Alcuni browser lo riportano in secondi:
 * se la mediana è < 1 si assume che sia in secondi.
 * @param {number[]} reported
 * @returns {{medianMs:number, unit:'ms'|'s'|'assente'}}
 */
export function normalizeReportedInterval(reported) {
  const vals = reported.filter((v) => typeof v === 'number' && v > 0);
  if (vals.length === 0) return { medianMs: NaN, unit: 'assente' };
  const med = median(vals);
  return med < 1 ? { medianMs: med * 1000, unit: 's' } : { medianMs: med, unit: 'ms' };
}

// ---------- pose statiche: segno dell'accelerometro e rumore del giroscopio ----------

/** Pose statiche richieste dal test assi e asse del dispositivo che deve puntare in alto. */
export const STATIC_POSES = Object.freeze([
  { id: 'flat', axis: 2, label: 'Sul tavolo, schermo verso l’alto' },
  { id: 'portrait', axis: 1, label: 'In verticale, dritto come per leggere' },
  { id: 'landscape', axis: 0, label: 'Di lato, con il bordo sinistro in basso' },
]);

/**
 * Analizza le pose statiche. Per W3C l'asse che punta in alto legge circa +g.
 * @param {Record<string, RawSample[]>} poses campioni per id di posa
 */
export function analyzeStaticPoses(poses) {
  const accSign = [1, 1, 1];
  const details = [];
  let ok = true;
  for (const pose of STATIC_POSES) {
    const samples = (poses[pose.id] ?? []).filter(isComplete);
    if (samples.length < 10) {
      ok = false;
      details.push({ pose: pose.id, ok: false, reason: 'campioni insufficienti' });
      continue;
    }
    const m = [COL.ax, COL.ay, COL.az].map((c) => mean(samples.map((s) => s[c])));
    const onAxis = m[pose.axis];
    const dominant = Math.abs(onAxis) > 0.8 * G && Math.abs(onAxis) >= Math.max(...m.map(Math.abs)) - 1e-9;
    if (!dominant) ok = false;
    accSign[pose.axis] = onAxis >= 0 ? 1 : -1;
    details.push({ pose: pose.id, ok: dominant, meanAccG: m, sign: accSign[pose.axis] });
  }
  const flat = (poses.flat ?? []).filter(isComplete);
  const gyroNoise = flat.length >= 10
    ? [COL.ra, COL.rb, COL.rg].map((c) => {
      const xs = flat.map((s) => s[c]);
      return { mean: mean(xs), std: std(xs) };
    })
    : null;
  return { ok, accSign, details, gyroNoiseRaw: gyroNoise };
}

// ---------- fit del mapping del giroscopio dalla "danza lenta" ----------

function permutations3() {
  return [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
}

function signs3() {
  const out = [];
  for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) out.push([a, b, c]);
  return out;
}

/** Tutti i 96 mapping candidati (6 permutazioni × 8 segni × 2 unità). */
export function candidateMappings(accSign = [1, 1, 1]) {
  const out = [];
  for (const gyroPerm of permutations3()) {
    for (const gyroSign of signs3()) {
      for (const gyroScale of [DEG2RAD, 1]) out.push({ gyroPerm, gyroSign, gyroScale, accSign });
    }
  }
  return out;
}

const QUASI_STATIC_TOL = 0.15 * G;

/**
 * Finestre informative: inizio e fine quasi statici e direzione della gravità che cambia
 * di almeno `minTurn` rad (altrimenti la finestra non dice nulla sul giroscopio).
 */
export function informativeWindows(samples, { windowMs = 1000, minTurn = 15 * Math.PI / 180 } = {}) {
  const pts = samples.filter(isComplete).map((s) => {
    const a = [s[COL.ax], s[COL.ay], s[COL.az]];
    return { s, static: Math.abs(norm(a) - G) < QUASI_STATIC_TOL };
  });
  const windows = [];
  let i = 0;
  while (i < pts.length) {
    const t0 = pts[i].s[COL.t];
    let j = i;
    while (j + 1 < pts.length && pts[j + 1].s[COL.t] - t0 <= windowMs) j++;
    let a = i;
    while (a < j && !pts[a].static) a++;
    let b = j;
    while (b > a && !pts[b].static) b--;
    if (b - a >= 5) {
      const ua = [COL.ax, COL.ay, COL.az].map((c) => pts[a].s[c]);
      const ub = [COL.ax, COL.ay, COL.az].map((c) => pts[b].s[c]);
      if (angleBetween(ua, ub) >= minTurn) windows.push(pts.slice(a, b + 1).map((p) => p.s));
    }
    i = j + 1;
  }
  return windows;
}

/**
 * Errore (rad) di un mapping su una finestra: si integra il giroscopio per prevedere come
 * cambia la direzione della gravità nel frame del dispositivo (dv/dt = −ω × v) e la si
 * confronta con quella misurata alla fine della finestra.
 */
export function windowError(win, mapping) {
  const first = applyMapping(win[0], mapping);
  let v = normalize(first.accG);
  for (let k = 1; k < win.length; k++) {
    const cur = applyMapping(win[k], mapping);
    const dt = (cur.t - win[k - 1][COL.t]) / 1000;
    v = qRotate(qFromRotationVector(scale(cur.gyro, -dt)), v);
  }
  const last = applyMapping(win[win.length - 1], mapping);
  return angleBetween(v, normalize(last.accG));
}

/**
 * Prova tutti i mapping candidati e li ordina per errore medio.
 * @param {RawSample[]} samples registrati durante la "danza lenta"
 * @param {number[]} accSign segni dell'accelerometro ricavati dalle pose statiche
 */
export function fitGyroMapping(samples, accSign = [1, 1, 1]) {
  const windows = informativeWindows(samples);
  if (windows.length < 3) {
    return { ok: false, reason: `servono almeno 3 finestre informative, trovate ${windows.length}`, windows: windows.length };
  }
  const ranking = candidateMappings(accSign)
    .map((mapping) => ({ mapping, errRad: mean(windows.map((w) => windowError(w, mapping))) }))
    .sort((a, b) => a.errRad - b.errRad);
  const best = ranking[0];
  const second = ranking[1];
  const ratio = second.errRad / Math.max(best.errRad, 1e-6);
  return {
    ok: best.errRad < (8 * Math.PI) / 180 && ratio >= 2,
    windows: windows.length,
    best: { ...best, errDeg: best.errRad / DEG2RAD },
    second: { ...second, errDeg: second.errRad / DEG2RAD },
    separation: ratio,
    matchesW3C: sameMapping(best.mapping, W3C_MAPPING),
  };
}

export function sameMapping(a, b) {
  return ['gyroPerm', 'gyroSign', 'accSign'].every((k) => a[k].every((v, i) => v === b[k][i]))
    && a.gyroScale === b.gyroScale;
}

/** Descrizione leggibile del mapping, per la tabella del SensorAdapter. */
export function describeMapping(m) {
  const names = ['alpha', 'beta', 'gamma'];
  const unit = m.gyroScale === 1 ? 'rad/s' : '°/s';
  const gyro = ['x', 'y', 'z']
    .map((axis, i) => `${axis} = ${m.gyroSign[i] < 0 ? '−' : ''}${names[m.gyroPerm[i]]}`)
    .join(', ');
  const acc = ['x', 'y', 'z'].map((axis, i) => `${m.accSign[i] < 0 ? '−' : '+'}${axis}`).join(' ');
  return `giroscopio: ${gyro} (${unit}) · accelerometro: ${acc}`;
}
