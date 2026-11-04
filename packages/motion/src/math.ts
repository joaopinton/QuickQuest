// Utility matematiche per vettori 3D e quaternioni (convenzione Hamilton [w, x, y, z]).
// Utilizzato per la fusione dei sensori e la stima dell'orientamento (docs/04 § 4).

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const G = 9.80665;

export type Vector3 = readonly [x: number, y: number, z: number];
export type Quaternion = readonly [w: number, x: number, y: number, z: number];
export type ProtocolQuaternion = readonly [x: number, y: number, z: number, w: number];

export const WORLD_UP: Vector3 = [0, 0, 1];

// ---------- Operazioni su vettori 3D ----------

export const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const norm = (a: Vector3): number => Math.hypot(a[0], a[1], a[2]);

export const scale = (a: Vector3, k: number): Vector3 => [a[0] * k, a[1] * k, a[2] * k];

export const add = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function normalize(a: Vector3): Vector3 {
  const n = norm(a);
  return n > 0 ? scale(a, 1 / n) : [0, 0, 0];
}

/** Angolo tra due vettori in radianti, in [0, π]. */
export function angleBetween(a: Vector3, b: Vector3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

/** Autovettore principale di una matrice 3×3 simmetrica (power iteration). */
export function principalAxis(m: readonly (readonly number[])[], iterations = 50): Vector3 {
  const row0 = m[0] ?? [1, 0, 0];
  const row1 = m[1] ?? [0, 1, 0];
  const row2 = m[2] ?? [0, 0, 1];

  const cols: Vector3[] = [
    [row0[0] ?? 0, row1[0] ?? 0, row2[0] ?? 0],
    [row0[1] ?? 0, row1[1] ?? 0, row2[1] ?? 0],
    [row0[2] ?? 0, row1[2] ?? 0, row2[2] ?? 0],
  ];

  const col0 = cols[0] ?? [1, 0, 0];
  let v = normalize(cols.reduce((best, c) => (norm(c) > norm(best) ? c : best), col0));
  if (norm(v) === 0) return [1, 0, 0];

  for (let i = 0; i < iterations; i++) {
    const next: Vector3 = [
      dot([row0[0] ?? 0, row0[1] ?? 0, row0[2] ?? 0], v),
      dot([row1[0] ?? 0, row1[1] ?? 0, row1[2] ?? 0], v),
      dot([row2[0] ?? 0, row2[1] ?? 0, row2[2] ?? 0], v),
    ];
    const n = norm(next);
    if (n === 0) break;
    v = scale(next, 1 / n);
  }
  return v;
}

// ---------- Operazioni su Quaternioni [w, x, y, z] ----------

export const qIdentity = (): Quaternion => [1, 0, 0, 0];

export function qMul(a: Quaternion, b: Quaternion): Quaternion {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export const qConj = (q: Quaternion): Quaternion => [q[0], -q[1], -q[2], -q[3]];

export function qNormalize(q: Quaternion): Quaternion {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n > 0 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : qIdentity();
}

/** Quaternione da vettore di rotazione (asse × angolo, radianti). */
export function qFromRotationVector(r: Vector3): Quaternion {
  const angle = norm(r);
  if (angle < 1e-12) return [1, r[0] / 2, r[1] / 2, r[2] / 2];
  const s = Math.sin(angle / 2) / angle;
  return [Math.cos(angle / 2), r[0] * s, r[1] * s, r[2] * s];
}

/** Ruota il vettore v con il quaternione q (q v q*). */
export function qRotate(q: Quaternion, v: Vector3): Vector3 {
  const p = qMul(qMul(q, [0, v[0], v[1], v[2]]), qConj(q));
  return [p[1], p[2], p[3]];
}

/** Angolo della rotazione in radianti, in [0, π]. */
export function qAngle(q: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q[0])));
}

/** Quaternione che porta il vettore a sul vettore b (rotazione minima). */
export function qFromTo(a: Vector3, b: Vector3): Quaternion {
  const u = normalize(a);
  const v = normalize(b);
  const d = dot(u, v);
  if (d < -0.999999) {
    const axis = normalize(Math.abs(u[0]) < 0.9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0]));
    return [0, axis[0], axis[1], axis[2]];
  }
  const c = cross(u, v);
  return qNormalize([1 + d, c[0], c[1], c[2]]);
}

/**
 * Scomposizione swing-twist di q rispetto a un asse unitario `axis`.
 * Restituisce gli angoli (rad) del twist (attorno all'asse) e dello swing.
 */
export function swingTwistAngles(q: Quaternion, axis: Vector3): { twist: number; swing: number } {
  const proj = dot([q[1], q[2], q[3]], axis);
  let twist: Quaternion = [q[0], axis[0] * proj, axis[1] * proj, axis[2] * proj];
  const n = Math.hypot(...twist);
  twist = n < 1e-12 ? qIdentity() : (twist.map((c) => c / n) as unknown as Quaternion);
  const swing = qMul(q, qConj(twist));
  return { twist: qAngle(twist), swing: qAngle(swing) };
}

/** Converte [w, x, y, z] nel formato del protocollo posa [x, y, z, w]. */
export const toProtocolQ = (q: Quaternion): ProtocolQuaternion => [q[1], q[2], q[3], q[0]];

/** Converte [x, y, z, w] del protocollo posa in [w, x, y, z]. */
export const fromProtocolQ = (q: ProtocolQuaternion): Quaternion => [q[3], q[0], q[1], q[2]];
