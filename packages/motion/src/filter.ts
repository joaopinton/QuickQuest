// Filtro complementare di orientamento (forma di Mahony, docs/04 § 4).
// Converte gyro + accG in un quaternione unitario stabile [w, x, y, z].
// Z del mondo verso l'alto (WORLD_UP = [0, 0, 1]).

import {
  cross,
  G,
  norm,
  normalize,
  qConj,
  qFromRotationVector,
  qFromTo,
  qMul,
  qNormalize,
  qRotate,
  scale,
  WORLD_UP,
  type Quaternion,
  type Vector3,
} from './math';

export interface ComplementaryOptions {
  /** Guadagno correzione proporzionale verso la gravità (default 1.0 rad/s per rad). */
  readonly kp?: number;
  /** Cancello di accelerazione (frazione di g oltre la quale la gravità non viene considerata). */
  readonly gate?: number;
}

export interface OrientationFilter {
  /** Aggiorna il filtro con un nuovo campione e restituisce il quaternione orientamento q. */
  update(gyro: Vector3, accG: Vector3, dt: number): Quaternion;
  readonly q: Quaternion | null;
  reset(): void;
}

export function createComplementaryFilter(opts: ComplementaryOptions = {}): OrientationFilter {
  const { kp = 1.0, gate = 0.25 } = opts;
  let q: Quaternion | null = null;

  return {
    update(gyro: Vector3, accG: Vector3, dt: number): Quaternion {
      const u = normalize(accG);

      // Inizializzazione rapida dal primo vettore di gravità
      if (q === null) {
        q = qFromTo(u, WORLD_UP);
        return q;
      }

      // Vettore di gravità previsto dal modello corrente nel frame del dispositivo
      const uPred = qRotate(qConj(q), WORLD_UP);

      // Fiducia: massima se norm(accG) ≈ 9.81 m/s², zero se in forte accelerazione
      const accMagnitude = norm(accG);
      const trust = Math.max(0, 1 - Math.abs(accMagnitude - G) / (gate * G));

      // Errore tilt = cross(misurato, previsto)
      const err = cross(u, uPred);
      const corrected: Vector3 = [
        gyro[0] + kp * trust * err[0],
        gyro[1] + kp * trust * err[1],
        gyro[2] + kp * trust * err[2],
      ];

      // Integrazione del giroscopio corretto
      const dq = qFromRotationVector(scale(corrected, dt));
      q = qNormalize(qMul(q, dq));
      return q;
    },

    get q() {
      return q;
    },

    reset() {
      q = null;
    },
  };
}
