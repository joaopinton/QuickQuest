// Generatore di tracce di movimento sintetiche per i test di regressione (tarate sui dati S1).

import type { SensorSample } from './adapter';
import {
  G,
  qConj,
  qFromRotationVector,
  qMul,
  qNormalize,
  qRotate,
  scale,
  type Quaternion,
  type Vector3,
} from './math';

export interface BowlingTrace {
  readonly samples: readonly SensorSample[];
  readonly buttons: readonly { t: number; down: boolean }[];
}

export function simulateTrace(opts: {
  hz?: number;
  durationMs: number;
  omega?: (t: number) => Vector3;
  q0?: Quaternion;
  t0?: number;
}): SensorSample[] {
  const { hz = 60, durationMs, omega = () => [0, 0, 0], q0 = [1, 0, 0, 0], t0 = 1000 } = opts;
  const dtMs = 1000 / hz;
  const substeps = 4;
  let q = q0;
  const out: SensorSample[] = [];

  for (let t = 0; t <= durationMs + 1e-6; t += dtMs) {
    const w = omega(t);
    // Vettore gravità nel frame del dispositivo: ruota la gravità del mondo [0, 0, G]
    const up = qRotate(qConj(q), [0, 0, G]);
    out.push({
      t: t0 + t,
      gyro: w,
      acc: [0, 0, 0],
      accG: up,
    });

    for (let k = 0; k < substeps; k++) {
      const dtSub = dtMs / substeps / 1000;
      const tk = t + (k + 0.5) * (dtMs / substeps);
      q = qNormalize(qMul(q, qFromRotationVector(scale(omega(tk), dtSub))));
    }
  }

  return out;
}

/**
 * Genera un lancio di bowling sintetico attorno all'asse X del dispositivo.
 * @param amp Picco di velocità angolare in avanti (rad/s)
 * @param roll Velocità angolare di rotazione del polso attorno all'avambraccio (rad/s)
 */
export function generateBowlingSwing(opts: {
  amp?: number;
  roll?: number;
  armedMs?: number;
  backMs?: number;
  fwdMs?: number;
} = {}): BowlingTrace {
  const {
    amp = 8,
    roll = 0,
    armedMs = 300,
    backMs = 450,
    fwdMs = 400,
  } = opts;

  const tRelease = armedMs + backMs + fwdMs;
  const omega = (t: number): Vector3 => {
    let wx = 0;
    if (t >= armedMs && t < armedMs + backMs) {
      // Braccio che va all'indietro: wx negativo
      wx = -0.6 * amp * Math.sin((Math.PI * (t - armedMs)) / backMs);
    } else if (t >= armedMs + backMs && t <= tRelease) {
      // Braccio che avanza: wx positivo fino al picco
      wx = amp * Math.sin((Math.PI * (t - armedMs - backMs)) / (2 * fwdMs));
    }
    // Rotazione del polso (spin) negli ultimi 120 ms prima del rilascio
    const wy = t >= tRelease - 120 && t <= tRelease ? roll : 0;
    return [wx, wy, 0];
  };

  const t0 = 1000;
  const samples = simulateTrace({ durationMs: tRelease + 200, omega, t0 });

  return {
    samples,
    buttons: [
      { t: t0 + 100, down: true },
      { t: t0 + tRelease, down: false },
    ],
  };
}

/** Genera una pressione del tasto senza swing (annullo tiro). */
export function generateCancelTrace(): BowlingTrace {
  const t0 = 1000;
  const samples = simulateTrace({
    durationMs: 800,
    omega: (t) => [0.2 * Math.sin(t / 50), 0.1, 0],
    t0,
  });

  return {
    samples,
    buttons: [
      { t: t0 + 100, down: true },
      { t: t0 + 650, down: false },
    ],
  };
}

