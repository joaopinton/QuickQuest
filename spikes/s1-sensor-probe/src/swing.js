// Metriche di uno swing da bowling e criteri go/no-go dello spike S1.
// Segue il recognizer di docs/games/bowling.md § 3.3, in versione "a posteriori" sulla traccia intera.

import { applyMapping, isComplete } from './mapping.js';
import { G, RAD2DEG, dot, mean, norm, normalize, principalAxis, scale, sub } from './math.js';

export const R_ARM = 0.65; // m, raggio del braccio (bowling § 3.3)
export const SWING_THRESHOLD = 2.5; // rad/s
export const BACKSWING_MIN_MS = 60;
export const RELEASE_WINDOW_MS = 40;
export const ROLL_WINDOW_MS = 120;
export const AXIS_EXCLUDE_MS = 150;
export const GYRO_SATURATION = 34; // rad/s (circa 1950 °/s, il fondo scala tipico è 2000 °/s)

export const LABELS = Object.freeze([
  { id: 'piano', text: 'Piano' },
  { id: 'medio', text: 'Medio' },
  { id: 'forte', text: 'Forte' },
  { id: 'hook-sx', text: 'Hook a sinistra' },
  { id: 'hook-dx', text: 'Hook a destra' },
  { id: 'annullo', text: 'Annullo (premi e rilascia senza swing)' },
]);

/** Ultimo intervallo tasto giù → tasto su della traccia. */
export function pressWindow(buttons) {
  let up = -1;
  for (let i = buttons.length - 1; i >= 0; i--) {
    if (!buttons[i].down) { up = i; break; }
  }
  if (up < 0) return null;
  for (let i = up - 1; i >= 0; i--) {
    if (buttons[i].down) return { tDown: buttons[i].t, tUp: buttons[up].t };
  }
  return null;
}

/** Asse dominante di ω (PCA sulla matrice Σ ω ωᵀ). */
export function swingAxis(gyros) {
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const w of gyros) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r][c] += w[r] * w[c];
  }
  return principalAxis(m);
}

/** Primo istante in cui `pred` resta vero per almeno `minMs` consecutivi. */
function firstSustained(pts, pred, minMs, fromIdx = 0) {
  let start = -1;
  for (let i = fromIdx; i < pts.length; i++) {
    if (pred(pts[i])) {
      if (start < 0) start = i;
      if (pts[i].t - pts[start].t >= minMs) return start;
    } else {
      start = -1;
    }
  }
  return -1;
}

/**
 * Metriche di uno swing.
 * @param {{samples:(number|null)[][], buttons:{t:number, down:boolean}[]}} trace
 * @param {import('./mapping.js').Mapping} mapping
 */
export function swingMetrics(trace, mapping) {
  const win = pressWindow(trace.buttons);
  if (!win) return { ok: false, reason: 'nessun rilascio del tasto nella traccia' };
  const pts = trace.samples
    .filter(isComplete)
    .map((s) => applyMapping(s, mapping))
    .filter((p) => p.t >= win.tDown && p.t <= win.tUp);
  if (pts.length < 5) return { ok: false, reason: 'troppo pochi campioni tra pressione e rilascio' };

  // Asse dello swing: come nel recognizer, si stima prima del rilascio, escludendo gli ultimi
  // istanti, dove la rotazione del polso lo sporcherebbe.
  const axisPts = pts.filter((p) => p.t <= win.tUp - AXIS_EXCLUDE_MS);
  let axis = swingAxis((axisPts.length >= 5 ? axisPts : pts).map((p) => p.gyro));
  // Ultimi 40 ms, ma almeno 2 campioni: a 30 Hz con jitter la finestra può restare vuota.
  const inWindow = pts.filter((p) => p.t >= win.tUp - RELEASE_WINDOW_MS);
  const releasePts = inWindow.length >= 2 ? inWindow : pts.slice(-2);
  const releaseMean = mean(releasePts.map((p) => dot(p.gyro, axis)));
  // Verso dell'asse: ω_s positivo nella fase in avanti, al rilascio.
  if (releaseMean < 0) axis = scale(axis, -1);
  const pointsWithS = pts.map((p) => ({ ...p, ws: dot(p.gyro, axis) }));

  const iBack = firstSustained(pointsWithS, (p) => p.ws < -SWING_THRESHOLD, BACKSWING_MIN_MS);
  const iFwd = iBack >= 0 ? pointsWithS.findIndex((p, i) => i > iBack && p.ws > SWING_THRESHOLD) : -1;
  const swingValid = iBack >= 0 && iFwd >= 0;

  const forward = iFwd >= 0 ? pointsWithS.slice(iFwd) : pointsWithS;
  const peak = forward.reduce((best, p) => (p.ws > best.ws ? p : best), forward[0]);
  const peakBack = Math.min(...pointsWithS.map((p) => p.ws));
  const omegaSRelease = Math.abs(releaseMean);

  // Rotazione del polso: componente di ω lungo l'avambraccio (asse Y del telefono nella presa
  // del bowling), resa ortogonale all'asse dello swing, integrata negli ultimi 120 ms.
  const rollAxis = normalize(sub([0, 1, 0], scale(axis, axis[1])));
  let wristRoll = 0;
  for (let i = 1; i < pointsWithS.length; i++) {
    const p = pointsWithS[i];
    if (p.t < win.tUp - ROLL_WINDOW_MS) continue;
    wristRoll += dot(p.gyro, rollAxis) * ((p.t - pointsWithS[i - 1].t) / 1000);
  }

  const maxGyro = Math.max(...pts.map((p) => Math.max(...p.gyro.map(Math.abs))));
  const maxAcc = Math.max(...pts.map((p) => norm(p.accG)));
  return {
    ok: true,
    swingValid,
    durationMs: win.tUp - win.tDown,
    samples: pts.length,
    axis,
    peakForward: peak.ws,
    peakBack,
    omegaSRelease,
    releaseRatio: peak.ws > 0 ? omegaSRelease / peak.ws : 0,
    releaseAfterPeakMs: win.tUp - peak.t,
    vEst: omegaSRelease * R_ARM,
    wristRoll,
    wristRollDeg: wristRoll * RAD2DEG,
    maxGyro,
    maxAccG: maxAcc / G,
    gyroSaturated: maxGyro >= GYRO_SATURATION,
  };
}

// ---------- criteri go/no-go (docs/09 § S1) ----------

const pending = (id, label, detail) => ({ id, label, status: 'pending', detail });

function frequencyCriterion(probe) {
  const label = 'Intervallo mediano ≤ 20 ms (≤ 33 ms su telefono economico)';
  if (!probe) return pending('frequency', label, 'manca la sonda');
  const dt = probe.timing.medianDtMs;
  let status = 'fail';
  if (dt <= 20) status = 'pass';
  else if (dt <= 33) status = 'warn';
  return { id: 'frequency', label, status, detail: `${dt.toFixed(1)} ms` };
}

function speedCriterion(byLabel) {
  const label = 'Swing "piano" e "forte" separabili (picco di ω_s ≥ +40%)';
  const piano = byLabel.piano ?? [];
  const forte = byLabel.forte ?? [];
  if (piano.length < 3 || forte.length < 3) {
    return pending('speed', label, `servono almeno 3 tracce per tipo (piano ${piano.length}, forte ${forte.length})`);
  }
  const mp = mean(piano.map((m) => m.peakForward));
  const mf = mean(forte.map((m) => m.peakForward));
  const ratio = mf / mp;
  const overlap = Math.max(...piano.map((m) => m.peakForward)) >= Math.min(...forte.map((m) => m.peakForward));
  return {
    id: 'speed',
    label,
    status: ratio >= 1.4 ? 'pass' : 'fail',
    detail: `media piano ${mp.toFixed(1)} rad/s, forte ${mf.toFixed(1)} rad/s (×${ratio.toFixed(2)})`
      + (overlap ? '; le due distribuzioni si sovrappongono' : '; nessuna sovrapposizione'),
  };
}

function majoritySign(values) {
  const pos = values.filter((v) => v > 0).length;
  return pos * 2 >= values.length ? 1 : -1;
}

function spinCriterion(byLabel) {
  const label = 'Rotazione del polso con segno coerente in ≥ 8 tracce su 10';
  const sx = (byLabel['hook-sx'] ?? []).map((m) => m.wristRoll);
  const dx = (byLabel['hook-dx'] ?? []).map((m) => m.wristRoll);
  if (sx.length < 3 || dx.length < 3) {
    return pending('spin', label, `servono almeno 3 tracce per lato (sx ${sx.length}, dx ${dx.length})`);
  }
  const sSx = majoritySign(sx);
  const sDx = majoritySign(dx);
  const coherent = sx.filter((v) => Math.sign(v) === sSx).length + dx.filter((v) => Math.sign(v) === sDx).length;
  const share = coherent / (sx.length + dx.length);
  const opposite = sSx !== sDx;
  return {
    id: 'spin',
    label,
    status: share >= 0.8 && opposite ? 'pass' : 'fail',
    detail: `${coherent}/${sx.length + dx.length} coerenti; hook a sinistra ⇒ rotazione ${sSx > 0 ? 'positiva' : 'negativa'}`
      + (opposite ? '' : '; ATTENZIONE: sinistra e destra hanno lo stesso segno'),
    hookLeftSign: sSx,
  };
}

function cancelCriterion(byLabel) {
  const label = 'Annullo: nessuno swing valido riconosciuto';
  const list = byLabel.annullo ?? [];
  if (list.length === 0) return pending('cancel', label, 'nessuna traccia "annullo"');
  const falsePositives = list.filter((m) => m.swingValid).length;
  return {
    id: 'cancel',
    label,
    status: falsePositives === 0 ? 'pass' : 'warn',
    detail: `${falsePositives}/${list.length} falsi positivi`,
  };
}

function axesCriterion(axes) {
  const label = 'Mapping degli assi determinato (errore < 8°, separazione ≥ ×2)';
  if (!axes?.fit) return pending('axes', label, 'test assi non eseguito');
  if (!axes.fit.best) return { id: 'axes', label, status: 'fail', detail: axes.fit.reason };
  const { best, separation, matchesW3C } = axes.fit;
  return {
    id: 'axes',
    label,
    status: axes.fit.ok && axes.static?.ok !== false ? 'pass' : 'fail',
    detail: `errore ${best.errDeg.toFixed(1)}°, separazione ×${separation.toFixed(1)}, `
      + (matchesW3C ? 'coincide con la specifica W3C' : 'DIVERSO dalla specifica W3C'),
  };
}

/**
 * Criteri go/no-go dello spike S1 per una sessione su un dispositivo.
 * @param {{probe?:object, axes?:object, traces:{label:string, metrics:object}[]}} session
 */
export function sessionCriteria(session) {
  const byLabel = {};
  for (const tr of session.traces) {
    if (!tr.metrics?.ok) continue;
    (byLabel[tr.label] ??= []).push(tr.metrics);
  }
  const criteria = [
    frequencyCriterion(session.probe),
    speedCriterion(byLabel),
    spinCriterion(byLabel),
    cancelCriterion(byLabel),
    axesCriterion(session.axes),
  ];
  const decided = criteria.filter((c) => c.status !== 'pending');
  let verdict = 'incompleto';
  if (decided.length === criteria.length) {
    verdict = criteria.some((c) => c.status === 'fail') ? 'no-go' : 'go';
  }
  return { criteria, verdict, counts: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, v.length])) };
}
