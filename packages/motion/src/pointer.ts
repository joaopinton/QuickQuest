// Puntatore col giroscopio (docs/04 § 7): mira sullo schermo, barber shop, menu.
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/PointerMode.ts.
//
// Si integrano le velocità di imbardata e beccheggio in una posizione 0..1. Lo yaw assoluto
// non è affidabile (deriva e riferimento arbitrario), quindi non si legge mai: la deriva si
// annulla ricentrando. Prima il filtro 1€ (separa la mano dal rumore), poi una deadzone con
// isteresi che toglie l'ultimo tremolio senza far "sfarfallare" il cursore.
// A differenza di PhoneMote le velocità si leggono nel frame del mondo, così il puntatore
// funziona con qualsiasi presa del telefono.

import { DEG2RAD, dot, normalize, qRotate, scale, sub, WORLD_UP, type Quaternion, type Vector3 } from './math';
import { createOneEuroFilter } from './one-euro';

/** Una rotazione di 60° attraversa lo schermo. */
export const POINTER_SENSITIVITY = 1 / (60 * DEG2RAD);
export const POINTER_DEADZONE_RAD = 2 * DEG2RAD;
/** Frazione della deadzone sotto cui si torna fermi. */
export const POINTER_DEADZONE_RELEASE = 0.7;
/** Un buco più lungo non si integra: sensori fermi, niente velocità "morte". */
export const POINTER_MAX_STEP_S = 0.15;

export interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

export interface AimRates {
  /** rad/s, > 0 = mira verso destra. */
  readonly yaw: number;
  /** rad/s, > 0 = mira verso l'alto. */
  readonly pitch: number;
}

/**
 * Velocità di mira indipendenti dalla presa: yaw attorno alla verticale del mondo, pitch
 * attorno all'asse destro del telefono proiettato in orizzontale.
 */
export function aimRates(gyro: Vector3, q: Quaternion): AimRates {
  const w = qRotate(q, gyro);
  const right = qRotate(q, [1, 0, 0]);
  const rightH = normalize(sub(right, scale(WORLD_UP, dot(right, WORLD_UP))));
  return { yaw: -dot(w, WORLD_UP), pitch: dot(w, rightH) };
}

function createDeadzoneGate(enter: number, leave: number) {
  let live = false;
  return {
    apply(rate: number) {
      const speed = Math.abs(rate);
      live = live ? speed >= leave : speed >= enter;
      return live ? rate : 0;
    },
    reset() {
      live = false;
    },
  };
}

export interface PointerOptions {
  readonly sensitivity?: number;
  readonly deadzoneRad?: number;
}

export interface Pointer {
  /** `dt` in secondi. */
  update(rates: AimRates, dt: number): PointerPosition;
  readonly position: PointerPosition;
  /** Ricentra (il giocatore preme "centro" puntando al centro dello schermo). */
  recenter(): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function createPointer(opts: PointerOptions = {}): Pointer {
  const sensitivity = opts.sensitivity ?? POINTER_SENSITIVITY;
  const dz = opts.deadzoneRad ?? POINTER_DEADZONE_RAD;
  const yawFilter = createOneEuroFilter();
  const pitchFilter = createOneEuroFilter();
  const yawGate = createDeadzoneGate(dz, dz * POINTER_DEADZONE_RELEASE);
  const pitchGate = createDeadzoneGate(dz, dz * POINTER_DEADZONE_RELEASE);
  let position: PointerPosition = { x: 0.5, y: 0.5 };

  return {
    update(rates, dt) {
      if (dt <= 0 || dt > POINTER_MAX_STEP_S) return position;
      const yaw = yawGate.apply(yawFilter.filter(rates.yaw, dt));
      const pitch = pitchGate.apply(pitchFilter.filter(rates.pitch, dt));
      // y dello schermo cresce verso il basso: mirare in alto sposta il cursore in su
      position = { x: clamp01(position.x + yaw * dt * sensitivity), y: clamp01(position.y - pitch * dt * sensitivity) };
      return position;
    },
    get position() {
      return position;
    },
    recenter() {
      position = { x: 0.5, y: 0.5 };
      yawFilter.reset();
      pitchFilter.reset();
      yawGate.reset();
      pitchGate.reset();
    },
  };
}
