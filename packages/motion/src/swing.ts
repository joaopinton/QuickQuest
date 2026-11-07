// Analisi dello swing del bowling indipendente da come si tiene il telefono (docs/04 § 6).
//
// Invece di assumere un asse fisso del giroscopio, si porta ω nel frame del mondo (con
// l'orientamento del filtro) e si cerca l'asse attorno a cui ruota il braccio: è l'asse
// principale delle velocità angolari durante lo swing. Il verso "in avanti" è quello del
// movimento appena prima del rilascio. La mira viene dalla direzione del piano dello swing,
// confrontata con quella del tiro di prova fatto verso lo schermo.

import { dot, norm, normalize, principalAxis, qRotate, scale, sub, WORLD_UP, type Quaternion, type Vector3 } from './math';

/** Campione già fuso: giroscopio nel frame del telefono + orientamento telefono → mondo. */
export interface SwingSample {
  readonly t: number; // ms
  readonly gyro: Vector3; // rad/s, frame del telefono
  readonly q: Quaternion; // telefono → mondo
}

/** Taratura personale ricavata dai tiri di prova. */
export interface SwingProfile {
  /** Direzione (rad) dell'asse dello swing quando si tira dritto verso lo schermo. */
  readonly heading0: number;
  /** Picco di velocità angolare (rad/s) di un tiro "normale" del giocatore. */
  readonly normalPeak: number;
  /** Tiri usati finora per la taratura automatica (assente = taratura completa). */
  readonly learned?: number;
}

export type SwingFailure = 'no-data' | 'too-weak';

export interface SwingAnalysis {
  readonly valid: boolean;
  readonly failure?: SwingFailure;
  /** Picco della velocità angolare in avanti (rad/s) vicino al rilascio. */
  readonly peak: number;
  /** Direzione dell'asse dello swing nel piano orizzontale (rad), `null` se non affidabile. */
  readonly heading: number | null;
  /** Rotazione del polso (rad) attorno all'avambraccio negli ultimi istanti. */
  readonly roll: number;
}

export interface ThrowOutput {
  readonly speed: number; // m/s
  readonly spin: number; // -1 .. +1
  readonly dir: number; // rad, positivo = verso destra
}

export const MIN_SWING_PEAK = 2.5; // rad/s: sotto non è un lancio, è il telefono che si muove in mano
export const RELEASE_LOOKBACK_MS = 500; // il pollice può alzarsi un po' dopo il picco
export const SWING_ROLL_WINDOW_MS = 150;
export const DEFAULT_NORMAL_PEAK = 7; // rad/s, braccio adulto medio
export const NORMAL_SPEED = 7.5; // m/s (~27 km/h) per un tiro "normale"
export const MIN_SPEED = 3.5;
export const MAX_SPEED = 10.5;
export const FULL_AIM_RAD = (20 * Math.PI) / 180; // girarsi di 20° = mira al massimo
export const MAX_DIR_RAD = 0.07; // ±4° sulla pista

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Angolo in (-π, π]. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Analizza i campioni tra la pressione del tasto e il rilascio. */
export function analyzeSwing(samples: readonly SwingSample[], tRelease: number): SwingAnalysis {
  const fail = (failure: SwingFailure, peak = 0): SwingAnalysis => ({ valid: false, failure, peak, heading: null, roll: 0 });
  if (samples.length < 4) return fail('no-data');

  const world = samples.map((s) => ({ t: s.t, w: qRotate(s.q, s.gyro) }));

  // Asse attorno a cui ruota il braccio: autovettore principale di Σ ω ωᵀ
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const { w } of world) {
    for (let i = 0; i < 3; i++) {
      const row = m[i]!;
      for (let j = 0; j < 3; j++) row[j] = (row[j] ?? 0) + (w[i] ?? 0) * (w[j] ?? 0);
    }
  }
  let axis = principalAxis(m);

  // Verso in avanti: quello del movimento più forte appena prima del rilascio
  const recent = world.filter((s) => s.t >= tRelease - RELEASE_LOOKBACK_MS && s.t <= tRelease + 20);
  const tail = recent.length > 0 ? recent : world.slice(-4);
  const strongest = tail.reduce((best, s) => (Math.abs(dot(s.w, axis)) > Math.abs(dot(best.w, axis)) ? s : best), tail[0]!);
  if (dot(strongest.w, axis) < 0) axis = scale(axis, -1);

  const peak = Math.max(0, ...tail.map((s) => dot(s.w, axis)));
  if (peak < MIN_SWING_PEAK) return fail('too-weak', peak);

  // Direzione dello swing: l'asse in avanti proiettato sul piano orizzontale
  const horizontal = Math.hypot(axis[0], axis[1]);
  const heading = horizontal > 0.5 ? Math.atan2(axis[1], axis[0]) : null;

  // Polso: rotazione attorno all'avambraccio (verso il basso, perpendicolare all'asse)
  const down = scale(WORLD_UP, -1);
  const forearm = normalize(sub(down, scale(axis, dot(down, axis))));
  let roll = 0;
  const rollPts = world.filter((s) => s.t >= tRelease - SWING_ROLL_WINDOW_MS && s.t <= tRelease);
  for (let i = 1; i < rollPts.length; i++) {
    const dt = (rollPts[i]!.t - rollPts[i - 1]!.t) / 1000;
    roll += dot(rollPts[i]!.w, forearm) * dt;
  }
  if (norm(forearm) === 0) roll = 0;

  return { valid: true, peak, heading, roll };
}

/** Taratura dai tiri di prova validi (fatti dritti verso lo schermo). */
export function profileFromPractice(throws: readonly SwingAnalysis[]): SwingProfile | null {
  const valid = throws.filter((t) => t.valid);
  if (valid.length === 0) return null;
  const withHeading = valid.filter((t): t is SwingAnalysis & { heading: number } => t.heading !== null);
  const heading0 = withHeading.length > 0
    ? Math.atan2(
      withHeading.reduce((s, t) => s + Math.sin(t.heading), 0),
      withHeading.reduce((s, t) => s + Math.cos(t.heading), 0),
    )
    : 0;
  const normalPeak = valid.reduce((s, t) => s + t.peak, 0) / valid.length;
  return { heading0, normalPeak: clamp(normalPeak, MIN_SWING_PEAK * 1.5, 15) };
}

/** Quanti tiri veri servono per imparare la forza "normale" del giocatore. */
export const LEARN_THROWS = 3;

/**
 * Taratura automatica, senza tiri di prova: il primo tiro valido fissa la direzione dello
 * schermo (quel tiro va dritto), i primi `LEARN_THROWS` fanno la media della forza. Dopo la
 * taratura resta ferma, così tirare più forte o mirare di lato conta davvero.
 */
export function learnFromSwing(profile: SwingProfile | null, swing: SwingAnalysis): SwingProfile | null {
  if (!swing.valid) return profile;
  const peak = clamp(swing.peak, MIN_SWING_PEAK * 1.5, 15);
  if (!profile) {
    if (swing.heading === null) return null;
    return { heading0: swing.heading, normalPeak: peak, learned: 1 };
  }
  const learned = profile.learned ?? LEARN_THROWS;
  if (learned >= LEARN_THROWS) return profile;
  const normalPeak = (profile.normalPeak * learned + peak) / (learned + 1);
  return { ...profile, normalPeak, learned: learned + 1 };
}

/** Converte lo swing nei parametri del tiro, rispetto alla taratura del giocatore. */
export function throwFromSwing(swing: SwingAnalysis, profile: SwingProfile | null): ThrowOutput {
  const normalPeak = profile?.normalPeak ?? DEFAULT_NORMAL_PEAK;
  const speed = clamp((NORMAL_SPEED * swing.peak) / normalPeak, MIN_SPEED, MAX_SPEED);
  // Girandosi a sinistra l'asse ruota in senso antiorario (angolo che cresce): in pista è dir negativo
  const delta = profile && swing.heading !== null ? wrapAngle(swing.heading - profile.heading0) : 0;
  const dir = -clamp(delta / FULL_AIM_RAD, -1, 1) * MAX_DIR_RAD;
  const spin = clamp(swing.roll / 0.8, -1, 1);
  return { speed, spin, dir };
}
