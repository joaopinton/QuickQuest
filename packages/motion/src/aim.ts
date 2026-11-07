// Mira assoluta col telefono tenuto dritto (barber shop, docs/games/barber.md § Gesto).
// Il telefono si tiene in verticale come una macchinetta: conta la direzione in cui guarda il
// suo retro (−Z del telefono). Il beccheggio è assoluto, letto dalla gravità: telefono dritto =
// altezza del centro, inclinato all'indietro = più in alto. Non deriva mai. L'imbardata è
// relativa a un riferimento preso ricentrando ("punta il centro della testa").
//
// A differenza di `pointer.ts` non si integrano velocità: lo stesso orientamento dà sempre lo
// stesso punto, quindi si taglia esattamente dove si punta e il cursore non "scivola". Il
// rollio attorno al retro (girare il telefono nel palmo) non sposta niente.
//
// Per tenere fermo il cursore senza fatica:
// - un "guinzaglio" toglie il tremore: il cursore si muove solo quando la mira si allontana più
//   di mezzo grado da lui, quindi una mano quasi ferma non lo agita; dentro il guinzaglio si
//   assesta piano sul punto vero (il tremore va avanti e indietro e si annulla);
// - la "mano ferma" (`setSteady`, mentre si taglia): da lì in poi il telefono conta la metà, così
//   le passate sono corte e precise; finita la passata il cursore torna piano a dove si punta.

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
/** Raggio del guinzaglio anti-tremore, in unità 0..1 (≈ 0,5° con l'ampiezza di default). */
export const AIM_LEASH = 0.009;
/** Con la mano ferma il movimento del telefono conta così. */
export const AIM_STEADY_SCALE = 0.5;
/** Rapidità (1/s) con cui, lasciata la mano ferma, il cursore torna dove punta il telefono. */
const STEADY_RETURN_RATE = 3.5;
/** Dentro il guinzaglio il cursore si assesta sul punto vero con questa rapidità, 1/s. */
const LEASH_SETTLE_RATE = 1.5;

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
  /** Mano ferma (mentre si taglia): il movimento conta `AIM_STEADY_SCALE`. */
  setSteady(isSteady: boolean): void;
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
  // Mira "vera" (assoluta) e scarto tra cursore e mira: la mano ferma lo crea, poi si riassorbe
  let abs = { x: 0.5, y: 0.5 };
  let offset = { x: 0, y: 0 };
  let steadyFrom: { readonly abs: { x: number; y: number }; readonly out: { x: number; y: number } } | null = null;

  /** Il cursore segue la mira oltre il guinzaglio; dentro si assesta piano. */
  const leash = (target: { x: number; y: number }, dt: number) => {
    const dx = target.x - reading.x;
    const dy = target.y - reading.y;
    const d = Math.hypot(dx, dy);
    // oltre il guinzaglio si segue subito fino al suo bordo, poi ci si assesta sul resto
    const pull = d > AIM_LEASH ? (d - AIM_LEASH) / d : 0;
    const settle = pull + (1 - pull) * Math.min(1, LEASH_SETTLE_RATE * dt);
    return { x: reading.x + dx * settle, y: reading.y + dy * settle };
  };

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
      // y dello schermo cresce verso il basso: retro verso l'alto = cursore in su
      abs = { x: 0.5 + wrapAngle(yaw - yawRef) / span, y: 0.5 - pitch / span };
      if (steadyFrom) {
        const out = {
          x: steadyFrom.out.x + (abs.x - steadyFrom.abs.x) * AIM_STEADY_SCALE,
          y: steadyFrom.out.y + (abs.y - steadyFrom.abs.y) * AIM_STEADY_SCALE,
        };
        offset = { x: out.x - abs.x, y: out.y - abs.y };
      } else {
        const keep = Math.exp(-STEADY_RETURN_RATE * step);
        offset = { x: offset.x * keep, y: offset.y * keep };
      }
      const held = leash({ x: abs.x + offset.x, y: abs.y + offset.y }, step);
      reading = {
        x: clamp01(held.x),
        y: clamp01(held.y),
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
      offset = { x: 0, y: 0 };
      steadyFrom = null;
      if (yaw !== null) reading = { ...reading, x: 0.5, y: clamp01(abs.y) };
    },
    setSteady(isSteady) {
      if (isSteady === (steadyFrom !== null)) return;
      steadyFrom = isSteady ? { abs: { ...abs }, out: { x: reading.x, y: reading.y } } : null;
    },
  };
}
