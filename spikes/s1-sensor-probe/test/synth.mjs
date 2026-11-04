// Generatore di tracce sintetiche con orientamento noto, per i test.

import { G, RAD2DEG, qConj, qFromRotationVector, qMul, qNormalize, qRotate, scale } from '../src/math.js';

/**
 * Simula un telefono che ruota con velocità angolare ω(t) nel frame del dispositivo.
 * Restituisce campioni grezzi come li darebbe un browser conforme a W3C
 * (alpha = z, beta = x, gamma = y in °/s; accelerationIncludingGravity = +g sull'asse in alto).
 * @param {{hz?:number, durationMs:number, omega?:(t:number)=>number[], q0?:number[],
 *   t0?:number, transform?:(raw:(number|null)[])=>(number|null)[], noLinear?:boolean}} o
 */
export function simulate({ hz = 60, durationMs, omega = () => [0, 0, 0], q0 = [1, 0, 0, 0], t0 = 1000, transform = (r) => r, noLinear = false }) {
  const dtMs = 1000 / hz;
  const substeps = 8;
  let q = q0;
  const out = [];
  for (let t = 0; t <= durationMs + 1e-9; t += dtMs) {
    const w = omega(t);
    const up = qRotate(qConj(q), [0, 0, G]);
    const raw = [
      t0 + t, dtMs,
      noLinear ? null : 0, noLinear ? null : 0, noLinear ? null : 0,
      up[0], up[1], up[2],
      w[2] * RAD2DEG, w[0] * RAD2DEG, w[1] * RAD2DEG,
    ];
    out.push(transform(raw));
    for (let k = 0; k < substeps; k++) {
      const tk = t + (k + 0.5) * (dtMs / substeps);
      q = qNormalize(qMul(q, qFromRotationVector(scale(omega(tk), dtMs / substeps / 1000))));
    }
  }
  return out;
}

/** "Danza lenta": rotazioni lente e variate su tutti e tre gli assi. */
export const slowDanceOmega = (t) => {
  const s = t / 1000;
  return [0.9 * Math.sin(1.3 * s), 0.8 * Math.sin(0.9 * s + 1), 0.7 * Math.cos(1.1 * s)];
};

/**
 * Swing da bowling sintetico attorno all'asse X del dispositivo.
 * @param {{amp?:number, roll?:number, rollAxis?:number[], armedMs?:number, backMs?:number, fwdMs?:number}} o
 * amp: picco di ω in avanti (rad/s); roll: velocità di rotazione del polso negli ultimi 120 ms
 */
export function bowlingSwing({ amp = 8, roll = 0, rollAxis = [0, 1, 0], armedMs = 300, backMs = 450, fwdMs = 400 } = {}) {
  const tRelease = armedMs + backMs + fwdMs;
  const omega = (t) => {
    let wx = 0;
    if (t >= armedMs && t < armedMs + backMs) wx = -0.6 * amp * Math.sin((Math.PI * (t - armedMs)) / backMs);
    else if (t >= armedMs + backMs && t <= tRelease) wx = amp * Math.sin((Math.PI * (t - armedMs - backMs)) / (2 * fwdMs));
    const r = t >= tRelease - 120 && t <= tRelease ? roll : 0;
    return [wx + rollAxis[0] * r, rollAxis[1] * r, rollAxis[2] * r];
  };
  const t0 = 1000;
  // Presa del bowling: telefono nel palmo, schermo in alto.
  const samples = simulate({ durationMs: tRelease + 300, omega, t0 });
  return {
    samples,
    buttons: [{ t: t0 + 100, down: true }, { t: t0 + tRelease, down: false }],
  };
}

/** Pressione e rilascio senza swing (solo un leggero tremolio). */
export function cancelTrace() {
  const t0 = 1000;
  const samples = simulate({ durationMs: 900, omega: (t) => [0.2 * Math.sin(t / 50), 0.1, 0], t0 });
  return { samples, buttons: [{ t: t0 + 100, down: true }, { t: t0 + 700, down: false }] };
}
