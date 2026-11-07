// Mira col telefono tenuto dritto (barber shop, docs/games/barber.md § Gesto).
// Il telefono si tiene in verticale come una macchinetta: conta la direzione in cui guarda il
// suo retro (−Z del telefono). Girarlo a destra/sinistra (imbardata) e inclinarlo avanti/indietro
// (beccheggio) muove la mira; il rollio nel palmo non sposta niente.
//
// Il gioco usa i MOVIMENTI della mira (`ax`, `ay`, senza limiti e senza salti a ±180°), come un
// mouse: non serve un centro e non c'è deriva da correggere. Gli angoli vengono dall'orientamento
// già fuso (non si integrano velocità con una zona morta, che si mangiava i movimenti lenti).
// `x`, `y` (0..1 attorno a un centro preso ricentrando) restano per chi vuole una posizione.
//
// Un "guinzaglio" toglie il tremore: la mira si muove solo quando la mano si sposta più di mezzo
// grado; dentro si assesta piano (il tremore va avanti e indietro e si annulla).

import { DEG2RAD, dot, qRotate, WORLD_UP, type Quaternion, type Vector3 } from './math';
import { createAngleOneEuroFilter, createOneEuroFilter, type OneEuroOptions } from './one-euro';
import type { PointerPosition } from './pointer';

/** Ampiezza angolare di un'unità di mira: 60° di rotazione = 1. */
export const AIM_SPAN_RAD = 60 * DEG2RAD;
/** Oltre questa inclinazione il retro guarda troppo in alto o in basso: si chiede di raddrizzare. */
export const AIM_UPRIGHT_MAX_RAD = 60 * DEG2RAD;
/** Col retro quasi in verticale l'imbardata non ha senso: si tiene l'ultima buona. */
const YAW_HOLD_RAD = 72 * DEG2RAD;
/** Filtro 1€ sugli angoli: liscio da fermi (tremore), pronto quando la mano si muove. */
const AIM_FILTER: OneEuroOptions = { minCutoff: 1.4, beta: 1.8 };
const MAX_STEP_S = 0.25;
/** Raggio del guinzaglio anti-tremore, in unità di mira (≈ 0,5°). */
export const AIM_LEASH = 0.009;
/** Dentro il guinzaglio la mira si assesta sul punto vero con questa rapidità, 1/s. */
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
  /** Mira senza limiti, in unità di `AIM_SPAN_RAD`: > 0 = più a destra. Se ne usano le differenze. */
  readonly ax: number;
  /** Mira senza limiti: > 0 = più in basso (come la y dello schermo). */
  readonly ay: number;
  /** Il telefono è tenuto abbastanza dritto da mirare bene. */
  readonly isUpright: boolean;
  /** Inclinazione del retro, rad (> 0 = verso l'alto). */
  readonly pitch: number;
}

export interface AimPointer {
  /** `dt` in secondi. */
  update(q: Quaternion, dt: number): AimReading;
  readonly reading: AimReading;
  /** La direzione attuale diventa il centro di `x`, `y`. */
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
  /** Imbardata "srotolata": un giro intero vale 2π, niente salti a ±180°. */
  let yaw: number | null = null;
  let lastWrapped = 0;
  let refAx = 0;
  let hasRef = false;
  let reading: AimReading = { x: 0.5, y: 0.5, ax: 0, ay: 0, isUpright: false, pitch: 0 };

  /** La mira segue il telefono oltre il guinzaglio; dentro si assesta piano. */
  const leash = (tx: number, ty: number, dt: number) => {
    const dx = tx - reading.ax;
    const dy = ty - reading.ay;
    const d = Math.hypot(dx, dy);
    // oltre il guinzaglio si segue subito fino al suo bordo, poi ci si assesta sul resto
    const pull = d > AIM_LEASH ? (d - AIM_LEASH) / d : 0;
    const settle = pull + (1 - pull) * Math.min(1, LEASH_SETTLE_RATE * dt);
    return { ax: reading.ax + dx * settle, ay: reading.ay + dy * settle };
  };

  return {
    update(q, dt) {
      const raw = backAngles(q);
      const step = dt > 0 && dt <= MAX_STEP_S ? dt : 1 / 60;
      const pitch = pitchFilter.filter(raw.pitch, step);
      if (Math.abs(raw.pitch) < YAW_HOLD_RAD) {
        const wrapped = yawFilter.filter(raw.yaw, step);
        yaw = yaw === null ? wrapped : yaw + wrapAngle(wrapped - lastWrapped);
        lastWrapped = wrapped;
      }
      if (yaw === null) {
        reading = { ...reading, isUpright: false, pitch };
        return reading;
      }
      const tx = yaw / span;
      const ty = -pitch / span;
      // il primo campione buono fa da centro, e la mira parte già lì senza scivolare
      const held = hasRef ? leash(tx, ty, step) : { ax: tx, ay: ty };
      if (!hasRef) {
        refAx = held.ax;
        hasRef = true;
      }
      reading = {
        ax: held.ax,
        ay: held.ay,
        x: clamp01(0.5 + held.ax - refAx),
        // telefono dritto = centro in altezza: il beccheggio è assoluto
        y: clamp01(0.5 + held.ay),
        isUpright: Math.abs(pitch) <= AIM_UPRIGHT_MAX_RAD,
        pitch,
      };
      return reading;
    },
    get reading() {
      return reading;
    },
    recenter() {
      if (!hasRef) return;
      refAx = reading.ax;
      reading = { ...reading, x: 0.5 };
    },
  };
}
