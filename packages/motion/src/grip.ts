// Inclinazione con segno rispetto all'impugnatura scelta dal giocatore (docs/04 § 6).
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/grip.ts.
//
// `up` è la direzione "in alto" del mondo espressa nel frame del telefono (accG normalizzata,
// oppure qRotate(qConj(q), WORLD_UP)). La rotazione minima che porta l'up dell'impugnatura
// sull'up attuale ha asse up × gripUp: le sue componenti lungo l'asse di mira del telefono
// (−Z, il dorso) e lungo la sua destra (+X) danno rollio e beccheggio, con il segno.
// Niente angoli di Eulero: quelli diventano singolari proprio dove si gioca (telefono in
// verticale per la mira del golf e dell'arco).
//
// Convenzione: roll > 0 = bordo destro verso il basso; pitch > 0 = punta verso l'alto.

import { angleBetween, cross, dot, norm, normalize, type Vector3 } from './math';

const FORWARD: Vector3 = [0, 0, -1];
const RIGHT: Vector3 = [1, 0, 0];
/** Telefono in verticale, schermo verso il giocatore. */
const LEVEL: Vector3 = [0, 1, 0];

/** Un campione più lontano di così dal più recente non fa parte della presa. */
export const GRIP_SETTLE_RAD = (15 * Math.PI) / 180;
export const GRIP_WINDOW_MS = 500;
/** Telefono sdraiato (schermo in su o in giù) entro questo angolo: il rollio non si vede. */
export const FLAT_GRIP_RAD = (25 * Math.PI) / 180;

export interface Grip {
  readonly up: Vector3;
  readonly capturedAt: number;
}

export interface GripSample {
  readonly up: Vector3;
  readonly t: number;
}

/** Aggiunge un campione e scarta quelli più vecchi della finestra (nuovo array). */
export function pushGripSample(buffer: readonly GripSample[], up: Vector3, t: number, windowMs = GRIP_WINDOW_MS): GripSample[] {
  return [...buffer, { up, t }].filter((s) => t - s.t <= windowMs);
}

/** Media dei campioni vicini al più recente: è la presa che il giocatore sta tenendo. */
export function captureGrip(samples: readonly GripSample[], at: number): Grip {
  const newest = samples[samples.length - 1];
  if (!newest) return { up: LEVEL, capturedAt: at };
  let sum: Vector3 = [0, 0, 0];
  for (const s of samples) {
    if (angleBetween(s.up, newest.up) >= GRIP_SETTLE_RAD) continue;
    sum = [sum[0] + s.up[0], sum[1] + s.up[1], sum[2] + s.up[2]];
  }
  return { up: normalize(sum), capturedAt: at };
}

/** Inclinazione (rad) rispetto alla presa: `roll` attorno alla mira, `pitch` attorno alla destra. */
export function tiltFromGrip(grip: Grip, up: Vector3): { readonly roll: number; readonly pitch: number } {
  const from = normalize(grip.up);
  const to = normalize(up);
  const axis = cross(to, from);
  const length = norm(axis);
  // Nella presa, ruotato attorno alla gravità (che `up` non vede) o capovolto esatto
  if (length < 1e-9) return { roll: 0, pitch: 0 };
  const angle = angleBetween(from, to);
  const unit: Vector3 = [axis[0] / length, axis[1] / length, axis[2] / length];
  return { roll: angle * dot(unit, FORWARD), pitch: angle * dot(unit, RIGHT) };
}

export const signedRoll = (grip: Grip, up: Vector3): number => tiltFromGrip(grip, up).roll;
export const signedPitch = (grip: Grip, up: Vector3): number => tiltFromGrip(grip, up).pitch;

/** Se la presa è un telefono sdraiato: il rollio attorno alla mira non sposta la gravità. */
export function isFlatGrip(up: Vector3): boolean {
  const a = angleBetween(normalize(up), [0, 0, 1]);
  return Math.min(a, Math.PI - a) < FLAT_GRIP_RAD;
}
