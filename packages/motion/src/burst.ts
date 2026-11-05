// Rilevatore di colpi "a raffica" senza tasto (docs/04 § 6): golf, tennis, scherma.
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/SwingDetector.ts.
//
// Il bowling usa la finestra tra pressione e rilascio del pollice (swing.ts). Gli altri giochi
// non hanno un tasto: il colpo si riconosce da solo, al picco della velocità angolare.
// - si arma sopra SWING_HI e si torna "a riposo" sotto SWING_LO (isteresi);
// - la cattura riprende anche i campioni appena prima dell'armo, dall'ultimo sotto LO;
// - si chiude quando |ω| scende al 60% del picco, o dopo 400 ms;
// - serve anche un'accelerazione lineare minima: girare il polso sul posto non è un colpo;
// - D29: se entro 120 ms ne arriva uno più forte (backswing seguito dal colpo vero), il nuovo
//   evento ha `replacesPrevious` e il gioco deve usare quello.
// La potenza è relativa alla scala del giocatore (D42): lo stesso braccio va da 297 a 1211 °/s.

import { DEG2RAD, norm, type Vector3 } from './math';

export const BURST_HI = 400 * DEG2RAD;
export const BURST_LO = 110 * DEG2RAD;
export const BURST_MAX = 900 * DEG2RAD;
export const BURST_DECAY_RATIO = 0.6;
export const BURST_MIN_ACCEL = 12; // m/s², gravità esclusa
export const BURST_LOOKBACK = 16;
export const BURST_MIN_WINDOW_MS = 20;
export const BURST_CAPTURE_MS = 400;
export const BURST_COOLDOWN_MS = 150;
export const BURST_REPLACE_MS = 120;

export interface PowerScale {
  /** rad/s di un colpo leggero del giocatore. */
  readonly softRate: number;
  /** rad/s del suo colpo più forte. */
  readonly hardRate: number;
}

export const DEFAULT_POWER_SCALE: PowerScale = { softRate: 350 * DEG2RAD, hardRate: 1250 * DEG2RAD };

export interface BurstEvent {
  /** 0 alla soglia, 1 a BURST_MAX. */
  readonly strength: number;
  /** 0..1 rispetto alla scala del giocatore. Da preferire a `strength`. */
  readonly power: number;
  /** Picco di |ω| (rad/s). */
  readonly peakRate: number;
  /** Rotazione integrata durante il colpo (rad), frame del telefono. */
  readonly rotation: Vector3;
  readonly onsetAt: number;
  readonly peakAt: number;
  readonly durationMs: number;
  readonly t: number;
  /** Arrivato entro BURST_REPLACE_MS da un colpo più debole: sostituisce quello. */
  readonly replacesPrevious: boolean;
}

export interface BurstSample {
  readonly t: number; // ms
  readonly gyro: Vector3; // rad/s
  readonly acc: Vector3; // m/s², gravità esclusa
}

export interface BurstDetector {
  update(sample: BurstSample): BurstEvent | null;
  setPowerScale(scale: PowerScale): void;
  reset(): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const burstStrength = (peak: number): number => clamp01((peak - BURST_HI) / (BURST_MAX - BURST_HI));

export function burstPower(peak: number, scale: PowerScale = DEFAULT_POWER_SCALE): number {
  return clamp01((peak - scale.softRate) / Math.max(1e-6, scale.hardRate - scale.softRate));
}

interface Rec {
  readonly t: number;
  readonly gyro: Vector3;
  readonly magnitude: number;
  readonly accel: number;
}

interface Capture {
  readonly startedAt: number;
  peak: number;
  peakAt: number;
  maxAccel: number;
  rotation: [number, number, number];
  previous: Rec;
}

export function createBurstDetector(): BurstDetector {
  let capture: Capture | null = null;
  let cooldownUntil = Number.NEGATIVE_INFINITY;
  let waitingForQuiet = false;
  let recent: Rec[] = [];
  let scale = DEFAULT_POWER_SCALE;
  let last: { t: number; peak: number } | null = null;

  const accumulate = (c: Capture, s: Rec) => {
    const dt = Math.max(0, s.t - c.previous.t) / 1000;
    // trapezio (D39): media tra il campione precedente e questo
    for (let i = 0; i < 3; i++) c.rotation[i]! += ((c.previous.gyro[i]! + s.gyro[i]!) / 2) * dt;
    if (s.magnitude > c.peak) {
      c.peak = s.magnitude;
      c.peakAt = s.t;
    }
    c.maxAccel = Math.max(c.maxAccel, s.accel);
    c.previous = s;
  };

  const begin = (s: Rec): Capture => {
    let start = recent.length - 1;
    while (start > 0 && recent[start - 1]!.magnitude >= BURST_LO) start--;
    const first = recent[start] ?? s;
    const c: Capture = { startedAt: first.t, peak: 0, peakAt: first.t, maxAccel: 0, rotation: [0, 0, 0], previous: first };
    for (let i = start; i < recent.length; i++) accumulate(c, recent[i]!);
    return c;
  };

  const finish = (c: Capture, s: Rec): BurstEvent | null => {
    const elapsed = s.t - c.startedAt;
    const decayed = s.magnitude < c.peak * BURST_DECAY_RATIO;
    if (elapsed < BURST_MIN_WINDOW_MS) return null;
    if (!decayed && elapsed < BURST_CAPTURE_MS) return null;
    capture = null;
    cooldownUntil = s.t + BURST_COOLDOWN_MS;
    waitingForQuiet = true;
    if (c.maxAccel < BURST_MIN_ACCEL) return null;
    // l'inizio del colpo (che la cattura riprende all'indietro) è vicino alla fine del precedente
    const replacesPrevious = last !== null && c.startedAt - last.t <= BURST_REPLACE_MS && c.peak > last.peak;
    last = { t: s.t, peak: c.peak };
    return {
      strength: burstStrength(c.peak),
      power: burstPower(c.peak, scale),
      peakRate: c.peak,
      rotation: [c.rotation[0], c.rotation[1], c.rotation[2]],
      onsetAt: c.startedAt,
      peakAt: c.peakAt,
      durationMs: elapsed,
      t: s.t,
      replacesPrevious,
    };
  };

  return {
    update(sample) {
      const rec: Rec = { t: sample.t, gyro: sample.gyro, magnitude: norm(sample.gyro), accel: norm(sample.acc) };
      let event: BurstEvent | null = null;
      if (capture) {
        accumulate(capture, rec);
        event = finish(capture, rec);
      } else {
        if (rec.magnitude < BURST_LO) waitingForQuiet = false;
        if (!waitingForQuiet && rec.t >= cooldownUntil && rec.magnitude >= BURST_HI) {
          recent = [...recent, rec].slice(-BURST_LOOKBACK);
          capture = begin(rec);
          return null;
        }
      }
      recent = [...recent, rec].slice(-BURST_LOOKBACK);
      return event;
    },
    setPowerScale(s) {
      scale = s;
    },
    reset() {
      capture = null;
      last = null;
      recent = [];
      waitingForQuiet = false;
      cooldownUntil = Number.NEGATIVE_INFINITY;
    },
  };
}
