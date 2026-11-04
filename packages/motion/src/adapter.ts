// Normalizzazione dei campioni grezzi dai sensori (docs/04 § 3).
// Restituisce un sistema di riferimento standard W3C:
// X = destra, Y = in alto lungo il telefono, Z = uscente dallo schermo.
// Giroscopio in rad/s, accelerazioni in m/s².

import { DEG2RAD, type Vector3 } from './math';
import type { MotionLike, RawSample } from './raw';

export interface SensorSample {
  readonly t: number;
  readonly gyro: Vector3; // rad/s
  readonly acc: Vector3;  // m/s² accelerazione lineare
  readonly accG: Vector3; // m/s² accelerazione inclusa gravità
}

export interface AdapterOptions {
  readonly isIOS?: boolean;
}

export function createSensorAdapter(opts: AdapterOptions = {}) {
  const { isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent) } = opts;

  return {
    fromRaw(raw: RawSample): SensorSample | null {
      const t = raw[0];
      const ax = raw[5];
      const ay = raw[6];
      const az = raw[7];
      if (typeof t !== 'number' || typeof ax !== 'number' || typeof ay !== 'number' || typeof az !== 'number') {
        return null;
      }

      const lx = raw[2] ?? 0;
      const ly = raw[3] ?? 0;
      const lz = raw[4] ?? 0;

      const ra = raw[8] ?? 0;
      const rb = raw[9] ?? 0;
      const rg = raw[10] ?? 0;

      // In W3C: alpha = z, beta = x, gamma = y
      // Su iOS e Android rotationRate è in gradi al secondo: convertiamo in rad/s.
      const gyroScale = DEG2RAD;
      const wx = rb * gyroScale;
      const wy = rg * gyroScale;
      const wz = ra * gyroScale;

      return {
        t,
        gyro: [wx, wy, wz],
        acc: [lx, ly, lz],
        accG: [ax, ay, az],
      };
    },

    fromEvent(e: MotionLike): SensorSample | null {
      const t = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const ag = e.accelerationIncludingGravity;
      if (!ag) return null;

      const ax = ag.x;
      const ay = ag.y;
      const az = ag.z;
      if (typeof ax !== 'number' || typeof ay !== 'number' || typeof az !== 'number') {
        return null;
      }

      const acc = e.acceleration ?? {};
      const rot = e.rotationRate ?? {};

      // W3C standard: rotationRate.beta = x, gamma = y, alpha = z in deg/s
      const gyroScale = DEG2RAD;
      const wx = (rot.beta ?? 0) * gyroScale;
      const wy = (rot.gamma ?? 0) * gyroScale;
      const wz = (rot.alpha ?? 0) * gyroScale;

      return {
        t,
        gyro: [wx, wy, wz],
        acc: [acc.x ?? 0, acc.y ?? 0, acc.z ?? 0],
        accG: [ax, ay, az],
      };
    },
  };
}
