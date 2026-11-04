// Utility numeriche pure (nessuna dipendenza dal DOM): statistiche, vettori, quaternioni.
// Quaternioni come [w, x, y, z], convenzione di Hamilton.

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const G = 9.80665;

// ---------- statistiche ----------

export function mean(xs) {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function variance(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

export function std(xs) {
  return Math.sqrt(variance(xs));
}

/** Percentile con interpolazione lineare; p in [0, 100]. */
export function percentile(xs, p) {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(xs) {
  return percentile(xs, 50);
}

/** Differenze tra elementi consecutivi. */
export function diffs(xs) {
  const out = [];
  for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1]);
  return out;
}

// ---------- vettori 3D ----------

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function normalize(a) {
  const n = norm(a);
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0];
}

/** Angolo tra due vettori, in radianti (robusto ai vettori quasi paralleli). */
export function angleBetween(a, b) {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

/** Autovettore principale di una matrice 3×3 simmetrica (power iteration). */
export function principalAxis(m, iterations = 50) {
  // Si parte dalla colonna con norma maggiore per evitare un vettore iniziale ortogonale.
  const cols = [0, 1, 2].map((j) => [m[0][j], m[1][j], m[2][j]]);
  let v = normalize(cols.reduce((best, c) => (norm(c) > norm(best) ? c : best), cols[0]));
  if (norm(v) === 0) return [1, 0, 0];
  for (let i = 0; i < iterations; i++) {
    const next = [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
    const n = norm(next);
    if (n === 0) break;
    v = scale(next, 1 / n);
  }
  return v;
}

// ---------- quaternioni [w, x, y, z] ----------

export const qIdentity = () => [1, 0, 0, 0];

export function qMul(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export const qConj = (q) => [q[0], -q[1], -q[2], -q[3]];

export function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 0 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : qIdentity();
}

/** Quaternione da vettore di rotazione (asse × angolo, rad). */
export function qFromRotationVector(r) {
  const angle = norm(r);
  if (angle < 1e-12) return [1, r[0] / 2, r[1] / 2, r[2] / 2];
  const s = Math.sin(angle / 2) / angle;
  return [Math.cos(angle / 2), r[0] * s, r[1] * s, r[2] * s];
}

/** Ruota il vettore v con il quaternione q (q v q*). */
export function qRotate(q, v) {
  const p = qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q));
  return [p[1], p[2], p[3]];
}

/** Angolo della rotazione rappresentata da q, in radianti, in [0, π]. */
export function qAngle(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(q[0])));
}

/** Quaternione che porta il vettore a sul vettore b (rotazione minima). */
export function qFromTo(a, b) {
  const u = normalize(a);
  const v = normalize(b);
  const d = dot(u, v);
  if (d < -0.999999) {
    // 180°: si sceglie un asse qualsiasi ortogonale a u.
    const axis = normalize(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
    return [0, axis[0], axis[1], axis[2]];
  }
  const c = cross(u, v);
  return qNormalize([1 + d, c[0], c[1], c[2]]);
}

/**
 * Scomposizione swing-twist di q rispetto all'asse unitario `axis`.
 * Restituisce gli angoli (rad) della parte di twist (attorno all'asse) e di swing (il resto).
 */
export function swingTwistAngles(q, axis) {
  const proj = dot([q[1], q[2], q[3]], axis);
  let twist = [q[0], axis[0] * proj, axis[1] * proj, axis[2] * proj];
  const n = Math.hypot(...twist);
  twist = n < 1e-12 ? qIdentity() : twist.map((c) => c / n);
  const swing = qMul(q, qConj(twist));
  return { twist: qAngle(twist), swing: qAngle(swing) };
}
