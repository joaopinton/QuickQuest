// Calibrazione dello yaw verso lo schermo e rilevamento quiete (docs/04 § 5).

import {
  norm,
  qAngle,
  qConj,
  qIdentity,
  qMul,
  qNormalize,
  swingTwistAngles,
  WORLD_UP,
  type Quaternion,
  type Vector3,
} from './math';

export const DEFAULT_STILLNESS_THRESHOLD = 0.25; // rad/s
export const DEFAULT_STILLNESS_MS = 150; // ms

export interface Calibrator {
  /** Imposta l'orientamento attuale come riferimento di yaw zero. */
  calibrate(currentQ: Quaternion): void;
  /** Applica l'offset di calibrazione al quaternione d'orientamento. */
  apply(q: Quaternion): Quaternion;
  /** Controlla la quiete per l'eventuale auto-ricalibrazione. */
  feedMotion(gyro: Vector3, dtMs: number): boolean;
  readonly isStill: boolean;
  readonly isCalibrated: boolean;
  reset(): void;
}

export function createCalibrator(opts: {
  stillnessThreshold?: number;
  stillnessMs?: number;
} = {}): Calibrator {
  const {
    stillnessThreshold = DEFAULT_STILLNESS_THRESHOLD,
    stillnessMs = DEFAULT_STILLNESS_MS,
  } = opts;

  let offset: Quaternion = qIdentity();
  let calibrated = false;
  let stillAccumMs = 0;
  let still = false;

  return {
    calibrate(currentQ: Quaternion) {
      // Estrae la componente yaw (twist attorno all'asse WORLD_UP)
      const { twist } = swingTwistAngles(currentQ, WORLD_UP);
      // Quaternione inverso per azzerare lo yaw
      const proj = currentQ[3]; // z component
      const rawTwist: Quaternion = [currentQ[0], 0, 0, proj];
      const n = Math.hypot(rawTwist[0], rawTwist[3]);
      const twistQ: Quaternion = n > 1e-12 ? [rawTwist[0] / n, 0, 0, rawTwist[3] / n] : qIdentity();
      offset = qConj(twistQ);
      calibrated = true;
    },

    apply(q: Quaternion): Quaternion {
      if (!calibrated) return q;
      return qNormalize(qMul(offset, q));
    },

    feedMotion(gyro: Vector3, dtMs: number): boolean {
      if (norm(gyro) < stillnessThreshold) {
        stillAccumMs += dtMs;
        if (stillAccumMs >= stillnessMs) {
          still = true;
        }
      } else {
        stillAccumMs = 0;
        still = false;
      }
      return still;
    },

    get isStill() {
      return still;
    },

    get isCalibrated() {
      return calibrated;
    },

    reset() {
      offset = qIdentity();
      calibrated = false;
      stillAccumMs = 0;
      still = false;
    },
  };
}
