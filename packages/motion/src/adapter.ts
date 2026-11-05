// Normalizzazione dei campioni grezzi dai sensori (docs/04 § 3).
// Restituisce un sistema di riferimento standard W3C:
// X = destra, Y = in alto lungo il telefono, Z = uscente dallo schermo.
// Giroscopio in rad/s, accelerazioni in m/s².
//
// Due correzioni prese da choijunhuk/phonemote (MIT), apps/game/src/input/SensorNormalizer.ts:
// - l'ordine dei canali di `rotationRate` si sceglie con la verifica degli assi (axis-check.ts);
// - con lo schermo ruotato (orizzontale) gli assi si riportano a quelli del telefono in
//   verticale, ruotando attorno a Z: Chrome non lo fa da solo.

import { applyGyroOrder, type GyroOrder } from './axis-check';
import { DEG2RAD, type Vector3 } from './math';
import type { MotionLike, RawSample } from './raw';

export interface SensorSample {
  readonly t: number;
  readonly gyro: Vector3; // rad/s
  readonly acc: Vector3;  // m/s² accelerazione lineare
  readonly accG: Vector3; // m/s² accelerazione inclusa gravità
  /** Giroscopio letto con l'ordine della specifica e senza rotazione dello schermo (per axis-check). */
  readonly specGyro?: Vector3;
  /** accG senza rotazione dello schermo (per axis-check). */
  readonly rawAccG?: Vector3;
}

export interface AdapterOptions {
  readonly gyroOrder?: GyroOrder;
  /** Angolo di rotazione dello schermo in gradi (0, 90, 180, 270). Default: `screen.orientation.angle`. */
  readonly screenAngle?: () => number;
}

export interface SensorAdapter {
  fromRaw(raw: RawSample): SensorSample | null;
  fromEvent(e: MotionLike): SensorSample | null;
  setGyroOrder(order: GyroOrder): void;
  readonly gyroOrder: GyroOrder;
}

/** Ruota un vettore attorno a Z del telefono (la rotazione dello schermo lo è sempre). */
export function rotateAboutZ(v: Vector3, angleDeg: number): Vector3 {
  if (angleDeg === 0) return v;
  const a = angleDeg * DEG2RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

function defaultScreenAngle(): number {
  if (typeof screen === 'undefined') return 0;
  const angle = screen.orientation?.angle;
  return typeof angle === 'number' && Number.isFinite(angle) ? angle : 0;
}

export function createSensorAdapter(opts: AdapterOptions = {}): SensorAdapter {
  let order: GyroOrder = opts.gyroOrder ?? 'spec';
  const screenAngle = opts.screenAngle ?? defaultScreenAngle;

  const build = (t: number, rate: { a: number; b: number; g: number }, acc: Vector3, accG: Vector3): SensorSample => {
    // In W3C: alpha = z, beta = x, gamma = y, in gradi al secondo: convertiamo in rad/s
    const specGyro: Vector3 = [rate.b * DEG2RAD, rate.g * DEG2RAD, rate.a * DEG2RAD];
    const angle = screenAngle();
    return {
      t,
      gyro: rotateAboutZ(applyGyroOrder(specGyro, order), angle),
      acc: rotateAboutZ(acc, angle),
      accG: rotateAboutZ(accG, angle),
      specGyro,
      rawAccG: accG,
    };
  };

  return {
    fromRaw(raw) {
      const t = raw[0];
      const ax = raw[5];
      const ay = raw[6];
      const az = raw[7];
      if (typeof t !== 'number' || typeof ax !== 'number' || typeof ay !== 'number' || typeof az !== 'number') {
        return null;
      }
      return build(
        t,
        { a: raw[8] ?? 0, b: raw[9] ?? 0, g: raw[10] ?? 0 },
        [raw[2] ?? 0, raw[3] ?? 0, raw[4] ?? 0],
        [ax, ay, az],
      );
    },

    fromEvent(e) {
      const t = e.timeStamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const ag = e.accelerationIncludingGravity;
      if (!ag) return null;
      const { x: ax, y: ay, z: az } = ag;
      if (typeof ax !== 'number' || typeof ay !== 'number' || typeof az !== 'number') return null;
      const acc = e.acceleration ?? {};
      const rot = e.rotationRate ?? {};
      return build(
        t,
        { a: rot.alpha ?? 0, b: rot.beta ?? 0, g: rot.gamma ?? 0 },
        [acc.x ?? 0, acc.y ?? 0, acc.z ?? 0],
        [ax, ay, az],
      );
    },

    setGyroOrder(next) {
      order = next;
    },

    get gyroOrder() {
      return order;
    },
  };
}
