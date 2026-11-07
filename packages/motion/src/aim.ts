// Mira assoluta col telefono tenuto dritto (barber shop, docs/games/barber.md § Gesto).
// Il telefono si tiene in verticale come una macchinetta: conta la direzione in cui guarda il
// suo retro (−Z del telefono). Il beccheggio è assoluto, letto dalla gravità: telefono dritto =
// altezza del centro, inclinato all'indietro = più in alto. Non deriva mai. L'imbardata è
// relativa a un riferimento preso ricentrando ("punta il centro della testa").
//
// A differenza di `pointer.ts` non si integrano velocità: lo stesso orientamento dà sempre lo
// stesso punto, quindi si taglia esattamente dove si punta e il cursore non "scivola". Il
// rollio attorno al retro (girare il telefono nel palmo) non sposta niente.

import { DEG2RAD, dot, qRotate, WORLD_UP, type Quaternion, type Vector3 } from './math';
import { createAngleOneEuroFilter, createOneEuroFilter, type OneEuroOptions } from './one-euro';
import type { PointerPosition } from './pointer';

/** Ampiezza angolare dell'area 0..1: ±30° dal centro arrivano ai bordi. */
export const AIM_SPAN_RAD = 60 * DEG2RAD;
/** Oltre questa inclinazione il telefono non è più "dritto": si chiede di raddrizzarlo. */
export const AIM_UPRIGHT_MAX_RAD = 40 * DEG2RAD;
/** Col retro quasi in verticale l'imbardata non ha senso: si tiene l'ultima buona. */
const YAW_HOLD_RAD = 70 * DEG2RAD;
/** Filtro 1€ sugli angoli: liscio da fermi (tremore), pronto quando la mano si muove. */
const AIM_FILTER: OneEuroOptions = { minCutoff: 1.4, beta: 1.8 };
const MAX_STEP_S = 0.25;

const BACK: Vector3 = [0, 0, -1];

export interface AimAngles {
  /** rad, > 0 = il retro guarda a destra (attorno alla verticale del mondo). */
  readonly yaw: number;
  /** rad, > 0 = il retro guarda in alto; 0 = telefono dritto. */
  readonly pitch: number;
}

/** Angoli del retro del telefono nel mondo (frame di `packages/motion`: Z in alto). */
export function backAngles(q: Quaternion): AimAngles {
  const back = qRotate(q, BACK);
  const pitch = Math.asin(Math.min(1, Math.max(-1, dot(back, WORLD_UP))));
  // Attorno a +Z il verso antiorario (visto dall'alto) è verso sinistra: destra = −atan2
  return { yaw: -Math.atan2(back[1], back[0]), pitch };
}

export interface AimReading extends PointerPosition {
  /** Il telefono è tenuto abbastanza dritto da mirare bene. */
  readonly isUpright: boolean;
  /** Inclinazione del retro, rad (> 0 = verso l'alto): per l'indicatore sul telefono. */
  readonly pitch: number;
}

export interface AimPointer {
  /** `dt` in secondi. */
  update(q: Quaternion, dt: number): AimReading;
  readonly reading: AimReading;
  /** La direzione attuale diventa il centro orizzontale. */
  recenter(): void;
}

export interface AimPointerOptions {
  readonly spanRad?: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function createAimPointer(opts: AimPointerOptions = {}): AimPointer {
  const span = opts.spanRad ?? AIM_SPAN_RAD;
  const yawFilter = createAngleOneEuroFilter(AIM_FILTER);
  const pitchFilter = createOneEuroFilter(AIM_FILTER);
  let yaw: number | null = null;
  let yawRef: number | null = null;
  let reading: AimReading = { x: 0.5, y: 0.5, isUpright: false, pitch: 0 };

  return {
    update(q, dt) {
      const raw = backAngles(q);
      const step = dt > 0 && dt <= MAX_STEP_S ? dt : 1 / 60;
      const pitch = pitchFilter.filter(raw.pitch, step);
      if (Math.abs(raw.pitch) < YAW_HOLD_RAD) yaw = yawFilter.filter(raw.yaw, step);
      if (yaw === null) {
        reading = { ...reading, isUpright: false, pitch };
        return reading;
      }
      // il primo campione buono fa da centro, finché non si ricentra davvero
      if (yawRef === null) yawRef = yaw;
      reading = {
        x: clamp01(0.5 + wrapAngle(yaw - yawRef) / span),
        // y dello schermo cresce verso il basso: retro verso l'alto = cursore in su
        y: clamp01(0.5 - pitch / span),
        isUpright: Math.abs(pitch) <= AIM_UPRIGHT_MAX_RAD,
        pitch,
      };
      return reading;
    },
    get reading() {
      return reading;
    },
    recenter() {
      yawRef = yaw;
      if (yaw !== null) reading = { ...reading, x: 0.5 };
    },
  };
}
