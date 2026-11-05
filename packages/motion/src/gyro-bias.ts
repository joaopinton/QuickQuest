// Offset del giroscopio a telefono fermo (docs/04 § 3).
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/GyroBias.ts.
//
// Un giroscopio MEMS non legge zero quando nulla ruota: sulle tracce a riposo di PhoneMote
// l'offset residuo è di 0.07–0.51 °/s per asse. Integrato, sposta la mira e l'orientamento
// stimato. Non è rumore, quindi nessun filtro lo toglie: va misurato e sottratto.
// La stima si aggiorna solo in finestre in cui *ogni* asse è rimasto sotto la soglia, quindi
// una mira lenta (≈ 8 °/s) non viene mai scambiata per offset; in più è limitata a 2 °/s.

import { DEG2RAD, type Vector3 } from './math';

export const BIAS_STILL_RAD = 3 * DEG2RAD;
export const BIAS_WINDOW_MS = 500;
export const BIAS_PULL = 0.1;
export const BIAS_MAX_RAD = 2 * DEG2RAD;
const MIN_WINDOW_SAMPLES = 4;

export interface GyroBiasOptions {
  readonly stillRad?: number;
  readonly windowMs?: number;
  readonly pull?: number;
  readonly maxRad?: number;
}

export interface GyroBias {
  /** Assorbe un campione (rad/s) e restituisce il giroscopio corretto. `dtMs` dal campione precedente. */
  update(gyro: Vector3, dtMs: number): Vector3;
  readonly bias: Vector3;
  reset(): void;
}

const clampAbs = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));

export function createGyroBias(opts: GyroBiasOptions = {}): GyroBias {
  const stillRad = opts.stillRad ?? BIAS_STILL_RAD;
  const windowMs = opts.windowMs ?? BIAS_WINDOW_MS;
  const pull = opts.pull ?? BIAS_PULL;
  const maxRad = opts.maxRad ?? BIAS_MAX_RAD;

  let window: { readonly gyro: Vector3; readonly dtMs: number }[] = [];
  let span = 0;
  let bias: Vector3 = [0, 0, 0];

  const isStill = () => window.every(({ gyro }) => gyro.every((w) => Math.abs(w) < stillRad));

  const absorb = (gyro: Vector3, dtMs: number) => {
    // dt nullo: campione già visto. Buco più lungo della finestra: la finestra non è più
    // "l'ultimo mezzo secondo", ma l'offset resta quello (il telefono che dorme non lo cambia).
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    if (dtMs > windowMs) {
      window = [];
      span = 0;
      return;
    }
    window = [...window, { gyro, dtMs }];
    span += dtMs;
    while (window.length > 1 && span - window[0]!.dtMs >= windowMs) {
      span -= window[0]!.dtMs;
      window = window.slice(1);
    }
    if (span < windowMs || window.length < MIN_WINDOW_SAMPLES || !isStill()) return;

    // Verso la media della finestra, non direttamente su di essa: è pur sempre rumorosa
    const mean = [0, 1, 2].map((i) => window.reduce((s, x) => s + x.gyro[i]!, 0) / window.length);
    bias = [0, 1, 2].map((i) => clampAbs(bias[i]! + pull * (mean[i]! - bias[i]!), maxRad)) as unknown as Vector3;
  };

  return {
    update(gyro, dtMs) {
      absorb(gyro, dtMs);
      return [gyro[0] - bias[0], gyro[1] - bias[1], gyro[2] - bias[2]];
    },
    get bias() {
      return bias;
    },
    reset() {
      window = [];
      span = 0;
      bias = [0, 0, 0];
    },
  };
}
