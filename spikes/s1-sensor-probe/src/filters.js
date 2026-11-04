// Filtri di orientamento e prova "giro e ritorno" (docs/04 § 4).
// Convenzione interna: q porta il frame del dispositivo nel mondo; Z del mondo verso l'alto.

import {
  G, angleBetween, cross, norm, normalize, qConj, qFromRotationVector, qFromTo, qMul, qNormalize,
  qRotate, scale, swingTwistAngles,
} from './math.js';

const WORLD_UP = [0, 0, 1];
const QUIET_MARGIN_MS = 200;

/**
 * Filtro complementare in forma di Mahony: integra il giroscopio e corregge il tilt verso la
 * gravità con un guadagno che si annulla durante i movimenti bruschi (|a| lontano da g).
 * @param {{kp?:number, gate?:number}} [opts] kp in rad/s per radiante di errore; gate in frazioni di g
 */
export function createComplementary({ kp = 1.0, gate = 0.25 } = {}) {
  let q = null;
  return {
    name: `complementare (kp ${kp})`,
    /** @param {number[]} gyro rad/s @param {number[]} accG m/s² @param {number} dt s */
    update(gyro, accG, dt) {
      const u = normalize(accG);
      if (q === null) {
        q = qFromTo(u, WORLD_UP);
        return q;
      }
      const uPred = qRotate(qConj(q), WORLD_UP);
      const trust = Math.max(0, 1 - Math.abs(norm(accG) - G) / (gate * G));
      const corrected = [0, 1, 2].map((i) => gyro[i] + kp * trust * cross(u, uPred)[i]);
      q = qNormalize(qMul(q, qFromRotationVector(scale(corrected, dt))));
      return q;
    },
    get q() { return q; },
  };
}

/**
 * Adatta un filtro di `ahrs` (Madgwick o Mahony) alla nostra interfaccia.
 * `ahrs` vuole l'accelerazione in g e parte dall'identità: si fa un riscaldamento da fermi.
 * La convenzione del quaternione si ricava confrontandolo con la gravità misurata.
 * @param {Function} AHRS costruttore del pacchetto `ahrs`
 */
export function createAhrs(AHRS, { algorithm = 'Madgwick', beta = 0.1, kp = 0.5, sampleIntervalMs = 16 } = {}) {
  const make = () => new AHRS({ sampleInterval: sampleIntervalMs, algorithm, beta, kp });
  const read = (inst) => {
    const r = inst.getQuaternion();
    return [r.w, r.x, r.y, r.z];
  };
  // `ahrs` normalizza il gradiente di Madgwick: se la gravità misurata coincide esattamente con
  // la stima il gradiente è nullo e il quaternione diventa NaN. Un dither di 1e-9 g lo evita.
  let tick = 0;
  const feed = (inst, gyro, accG, dt) => {
    tick += 1;
    const d = (tick % 2 === 0 ? 1 : -1) * 1e-9;
    inst.update(gyro[0], gyro[1], gyro[2], accG[0] / G + d, accG[1] / G - d, accG[2] / G + d, undefined, undefined, undefined, dt);
  };
  const warmUp = (inst, accG) => {
    for (let i = 0; i < 2000; i++) feed(inst, [0, 0, 0], accG, 0.01);
  };
  // Con il telefono in piano le due convenzioni coincidono: si decide con una posa inclinata.
  const probe = make();
  const tilted = [0, G * Math.SQRT1_2, G * Math.SQRT1_2];
  warmUp(probe, tilted);
  const convention = detectConvention(read(probe), tilted);
  const f = make();
  let warmed = false;
  const toDeviceToWorld = (q) => (convention === 'world-to-device' ? qConj(q) : q);
  return {
    name: algorithm === 'Madgwick' ? `Madgwick (ahrs, beta ${beta})` : `Mahony (ahrs, kp ${kp})`,
    update(gyro, accG, dt) {
      if (!warmed) {
        warmUp(f, accG);
        warmed = true;
      }
      feed(f, gyro, accG, dt);
      return toDeviceToWorld(read(f));
    },
    convention,
  };
}

/** 'device-to-world' se q porta il dispositivo nel mondo, altrimenti 'world-to-device'. */
export function detectConvention(q, accG) {
  const u = normalize(accG);
  const asDeviceToWorld = angleBetween(qRotate(qConj(q), WORLD_UP), u);
  const asWorldToDevice = angleBetween(qRotate(q, WORLD_UP), u);
  return asDeviceToWorld <= asWorldToDevice ? 'device-to-world' : 'world-to-device';
}

/** Errore di orientamento tra due stati, scomposto in tilt e yaw (attorno alla verticale). */
export function orientationError(q0, q1) {
  const rel = qMul(q1, qConj(q0));
  const { twist, swing } = swingTwistAngles(rel, WORLD_UP);
  return { yaw: twist, tilt: swing };
}

/**
 * Prova "giro e ritorno": il telefono parte appoggiato, viene mosso e torna nello stesso punto.
 * L'orientamento finale vero coincide con quello iniziale, quindi la differenza è l'errore.
 * @param {{t:number, gyro:number[], accG:number[]}[]} pts campioni già mappati
 * @param {{update:Function, name:string}} filter
 * @param {{motionThreshold?:number}} [opts] soglia di |ω| (rad/s) che separa moto e quiete
 */
export function evaluateReturn(pts, filter, { motionThreshold = 0.3 } = {}) {
  if (pts.length < 20) return { ok: false, reason: 'traccia troppo corta' };
  const moving = pts.map((p) => norm(p.gyro) > motionThreshold);
  const firstMove = moving.indexOf(true);
  const lastMove = moving.lastIndexOf(true);
  if (firstMove < 1 || lastMove >= pts.length - 2) {
    return { ok: false, reason: 'servono un tratto fermo all’inizio e uno alla fine' };
  }
  // Riferimenti presi 200 ms prima del primo campione in moto e 200 ms dopo l'ultimo:
  // sotto soglia il telefono si muove già (o ancora) un po', e falserebbe l'errore.
  const iStart = pts.findLastIndex((p) => p.t <= pts[firstMove].t - QUIET_MARGIN_MS);
  const iStop = pts.findIndex((p) => p.t >= pts[lastMove].t + QUIET_MARGIN_MS);
  if (iStart < 0) return { ok: false, reason: 'manca il tratto fermo iniziale (almeno 200 ms)' };
  if (iStop < 0) return { ok: false, reason: 'manca il tratto fermo finale (almeno 200 ms)' };
  const started = performance.now();
  let q0 = null;
  let qStop = null;
  let qEnd = null;
  for (let i = 0; i < pts.length; i++) {
    const dt = i === 0 ? 0.01 : (pts[i].t - pts[i - 1].t) / 1000;
    // Integrazione a trapezio: ω medio tra il campione precedente e quello attuale.
    const gyro = i === 0 ? pts[i].gyro : pts[i].gyro.map((v, k) => (v + pts[i - 1].gyro[k]) / 2);
    const q = filter.update(gyro, pts[i].accG, dt);
    if (i === iStart) q0 = q;
    if (i === iStop) qStop = q;
    qEnd = q;
  }
  const elapsed = performance.now() - started;
  const toDeg = (e) => ({ yawDeg: (e.yaw * 180) / Math.PI, tiltDeg: (e.tilt * 180) / Math.PI });
  return {
    ok: true,
    filter: filter.name,
    motionSeconds: (pts[lastMove].t - pts[firstMove].t) / 1000,
    atStop: toDeg(orientationError(q0, qStop)),
    atEnd: toDeg(orientationError(q0, qEnd)),
    usPerUpdate: (elapsed * 1000) / pts.length,
  };
}
