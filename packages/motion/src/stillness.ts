// Quanto è fermo il telefono (docs/04 § 3).
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/Stillness.ts.
//
// Separazione misurata da PhoneMote: telefono sul tavolo 0.17 °/s, mano che prova a stare
// ferma 3.34 °/s di media, camminata 54, swing oltre 300; il movimento voluto più lento
// (un putt) parte da 40. Le soglie stanno in quel buco, con isteresi per non sfarfallare.
// La media usa una costante di tempo e non un peso per campione: la frequenza dei sensori
// cambia da telefono a telefono.

import { DEG2RAD, norm, type Vector3 } from './math';

export const STILL_ENTER_RAD = 8 * DEG2RAD;
export const STILL_EXIT_RAD = 16 * DEG2RAD;
export const STILL_TAU_MS = 300;

export interface StillnessReading {
  /** |ω| mediato (rad/s). */
  readonly rate: number;
  readonly isStill: boolean;
  /** Da quanto il telefono è fermo (ms), 0 se si muove. */
  readonly steadyMs: number;
}

export interface Stillness {
  update(gyro: Vector3, dtMs: number): StillnessReading;
  readonly reading: StillnessReading;
  reset(): void;
}

export interface StillnessOptions {
  readonly enterRad?: number;
  readonly exitRad?: number;
  readonly tauMs?: number;
}

const MOVING: StillnessReading = { rate: 0, isStill: false, steadyMs: 0 };

export function createStillness(opts: StillnessOptions = {}): Stillness {
  const enter = opts.enterRad ?? STILL_ENTER_RAD;
  const exit = opts.exitRad ?? STILL_EXIT_RAD;
  const tau = opts.tauMs ?? STILL_TAU_MS;
  let rate: number | null = null;
  let reading = MOVING;

  return {
    update(gyro, dtMs) {
      const sample = norm(gyro);
      // Si parte dal primo campione e non da zero: una media che parte da zero direbbe
      // "fermo" proprio nei primi istanti di uno swing.
      if (rate === null) rate = sample;
      else if (dtMs > 0) rate += (1 - Math.exp(-dtMs / tau)) * (sample - rate);
      const isStill = reading.isStill ? rate <= exit : rate < enter;
      const steadyMs = isStill ? reading.steadyMs + Math.max(0, dtMs) : 0;
      reading = { rate, isStill, steadyMs };
      return reading;
    },
    get reading() {
      return reading;
    },
    reset() {
      rate = null;
      reading = MOVING;
    },
  };
}
