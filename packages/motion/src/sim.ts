// Campioni sintetici: per i test e per il telefono di prova (`?sim`, solo in sviluppo).

import type { RawSample } from './raw';
import { G } from './stats';

export interface SimOptions {
  readonly hz?: number;
  readonly durationMs?: number;
  readonly t0?: number;
  readonly hasGyro?: boolean;
  /** Fattore sull'accelerazione (1 = m/s² corretti; 1/G simula un browser che dà g). */
  readonly accelScale?: number;
}

/** Un telefono tenuto in mano che dondola piano: rotationRate in °/s, gravità ruotata di poco. */
export function simulateHandheld({ hz = 60, durationMs = 1500, t0 = 1000, hasGyro = true, accelScale = 1 }: SimOptions = {}): RawSample[] {
  const dt = 1000 / hz;
  const out: RawSample[] = [];
  for (let t = 0; t <= durationMs; t += dt) {
    const tilt = 0.25 * Math.sin(t / 300);
    const gy = G * Math.sin(tilt) * accelScale;
    const gz = G * Math.cos(tilt) * accelScale;
    const rate = hasGyro
      ? [12 * Math.sin(t / 90), 20 * Math.cos(t / 300), 8 * Math.sin(t / 150)]
      : [null, null, null];
    out.push([t0 + t, dt, 0, 0, 0, 0.05 * Math.sin(t / 50), gy, gz, ...rate]);
  }
  return out;
}
