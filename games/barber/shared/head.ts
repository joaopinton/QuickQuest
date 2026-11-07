// Geometria della testa del cliente (docs/games/barber.md § Simulazione dei capelli).
// La testa è una sfera unitaria con la stessa mappa UV di `THREE.SphereGeometry`:
//   u = longitudine (phi / 2π), v = colatitudine (theta / π, 0 = in cima).
//   x = -cos(phi)·sin(theta), y = cos(theta), z = sin(phi)·sin(theta).
// Così +z (la faccia) è a u = 0.25, la nuca a u = 0.75, i lati a u = 0 (x = -1) e u = 0.5 (x = +1).

export type Vec3 = readonly [number, number, number];

/** Lato della mappa delle lunghezze (128×128 texel, un byte ciascuno). */
export const HAIR_MAP_SIZE = 128;

/** Raggio della testa nel puntatore 0..1 del telefono, vista di lavoro (cute, senza capelli). */
export const HEAD_SPAN = 0.34;

/** Spessore dei capelli a lunghezza 1, in raggi della testa: oltre la cute ci sono ancora capelli. */
export const MAX_HAIR = 0.26;
/** I capelli lunghi si coricano lungo la testa: a lunghezza 1 sporgono il 38% in meno. */
export const HAIR_LIE_DOWN = 0.38;

/** Di quanto sporgono dalla cute capelli lunghi `len` (0..1), in raggi della testa. */
export function hairHeight(len: number): number {
  return MAX_HAIR * len * (1 - HAIR_LIE_DOWN * len);
}

export function dirFromUv(u: number, v: number): Vec3 {
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  const st = Math.sin(theta);
  return [-Math.cos(phi) * st, Math.cos(theta), Math.sin(phi) * st];
}

export function uvFromDir(d: Vec3): { readonly u: number; readonly v: number } {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const y = Math.min(1, Math.max(-1, d[1] / len));
  const theta = Math.acos(y);
  let phi = Math.atan2(d[2], -d[0]);
  if (phi < 0) phi += Math.PI * 2;
  return { u: phi / (Math.PI * 2), v: theta / Math.PI };
}

/** Direzione al centro del texel (colonna `c`, riga `r`). */
export function texelDir(c: number, r: number, size = HAIR_MAP_SIZE): Vec3 {
  return dirFromUv((c + 0.5) / size, (r + 0.5) / size);
}

/**
 * Attaccatura dei capelli: alta sulla fronte, sopra le orecchie ai lati, bassa sulla nuca.
 * Restituisce la quota `y` sotto cui non crescono capelli, per una direzione sulla testa.
 */
export function hairlineY(d: Vec3): number {
  return d[2] * 0.36 - 0.02;
}

/** C'è cuoio capelluto (quindi capelli) in questa direzione? */
export function isScalp(d: Vec3): boolean {
  return d[1] > hairlineY(d);
}

/** Specchia sinistra/destra: x → -x, cioè u → 0.5 - u. Colonna speculare sulla mappa. */
export function mirrorColumn(c: number, size = HAIR_MAP_SIZE): number {
  const half = size / 2;
  return (((half - 1 - c) % size) + size) % size;
}

/** Superficie relativa del texel sulla sfera (∝ sin theta): così i poli non contano troppo. */
export function texelArea(r: number, size = HAIR_MAP_SIZE): number {
  return Math.sin(((r + 0.5) / size) * Math.PI);
}
