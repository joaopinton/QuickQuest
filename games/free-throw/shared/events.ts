// Tipi ed eventi del gioco Tiri liberi / Basket (docs/05, docs/games/free-throw.md).
// Il gesto riconosciuto sul telefono è il fondamentale della scuola basket:
// caricamento sopra la fronte, distensione verso l'alto e chiusura del polso "a gancio" (follow-through).

export type AssistLevel = 'easy' | 'normal' | 'pro';
export type FreeThrowMode = 'classic' | 'quick' | 'timed';

/**
 * Parametri fisici del tiro inviati dal telefono allo schermo dopo il riconoscimento del gesto.
 */
export interface FreeThrowShotData {
  /** Velocità di uscita della palla in m/s (tipica dalla lunetta: ~7.1–7.4 m/s). */
  readonly speed: number;
  /** Angolo di uscita sopra l'orizzontale in gradi (scuola basket ottimale: 50°–55°). */
  readonly releaseAngleDeg: number;
  /** Backspin impresso dalla frustata del polso a gancio, normalizzato in [0, 1] (1 ≈ 5.5 giri/s). */
  readonly backspin: number;
  /** Qualità della chiusura a gancio del polso in [0, 1] (follow-through "mano nel canestro"). */
  readonly hookQuality: number;
  /** Deviazione laterale (yaw) in radianti (-0.25 .. +0.25, + = a destra). */
  readonly dir: number;
}

export type ShotOutcome =
  | 'swish'          // Solo retina ("CIUFF!") -> 3 punti (2 + 1 bonus)
  | 'Good'           // Alias interno non usato; usiamo categorie esplicite sotto:
  | 'rim-in'         // Canestro toccando il ferro -> 2 punti
  | 'bank-in'        // Canestro di tabella -> 2 punti
  | 'rim-out'        // Ferro e fuori -> 0 punti
  | 'backboard-out'  // Tabellone e fuori -> 0 punti
  | 'airball';       // Air ball (né ferro né tabellone) -> 0 punti

export type ResolvedOutcome = Exclude<ShotOutcome, 'Good'>;

export type ShotFeedbackHint =
  | 'perfect'
  | 'short'
  | 'long'
  | 'left'
  | 'right'
  | 'flat'
  | 'no-hook';

export const SHOOT_EVENT = 'shoot';

const MIN_VALID_SPEED = 3.0;
const MAX_VALID_SPEED = 14.0;
const MIN_RELEASE_DEG = 25;
const MAX_RELEASE_DEG = 78;
const MAX_DIR_RAD = 0.45;

const round = (v: number, digits = 1000) => Math.round(v * digits) / digits;

/** Costruisce il `game-event` da inviare dal controller allo schermo. */
export function shootEvent(shot: FreeThrowShotData): { kind: string; data: Record<string, number> } {
  return {
    kind: SHOOT_EVENT,
    data: {
      speed: round(shot.speed),
      releaseAngleDeg: round(shot.releaseAngleDeg, 100),
      backspin: round(shot.backspin),
      hookQuality: round(shot.hookQuality),
      dir: round(shot.dir),
    },
  };
}

/** Valida e legge un `game-event` ricevuto dallo schermo. */
export function parseShootEvent(e: {
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
}): FreeThrowShotData | null {
  if (e.kind !== SHOOT_EVENT) return null;
  const { speed, releaseAngleDeg, backspin, hookQuality, dir } = e.data;
  if (
    typeof speed !== 'number' ||
    typeof releaseAngleDeg !== 'number' ||
    typeof backspin !== 'number' ||
    typeof hookQuality !== 'number' ||
    typeof dir !== 'number'
  ) {
    return null;
  }
  if (
    !Number.isFinite(speed) ||
    !Number.isFinite(releaseAngleDeg) ||
    !Number.isFinite(backspin) ||
    !Number.isFinite(hookQuality) ||
    !Number.isFinite(dir)
  ) {
    return null;
  }
  if (speed < MIN_VALID_SPEED || speed > MAX_VALID_SPEED) return null;
  if (releaseAngleDeg < MIN_RELEASE_DEG || releaseAngleDeg > MAX_RELEASE_DEG) return null;
  if (backspin < 0 || backspin > 1) return null;
  if (hookQuality < 0 || hookQuality > 1) return null;
  if (Math.abs(dir) > MAX_DIR_RAD) return null;
  return { speed, releaseAngleDeg, backspin, hookQuality, dir };
}

