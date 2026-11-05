// Riconoscimento del colpo di golf sul telefono (ADR-002, docs/games/golf.md).
// Idee e numeri da choijunhuk/phonemote (MIT), golfState.ts: presa catturata a telefono fermo,
// mira dal rollio rispetto alla presa, faccia del bastone dalla rotazione durante il colpo,
// colpo più forte entro 120 ms che sostituisce il precedente (backswing + colpo vero, D29).
//
// - Colpo pieno: nessun tasto. Si tiene fermo il telefono un attimo (presa), poi swing.
// - Putt: si tiene premuto il tasto, si fa il movimento e si rilascia; conta l'ampiezza.
import {
  BURST_REPLACE_MS, captureGrip, createBurstDetector, pushGripSample, RAD2DEG, signedRoll,
  type BurstEvent, type FusedSample, type Grip, type GripSample,
} from '@quickquest/motion';

export const GRIP_STEADY_MS = 400;
export const AIM_GAIN = 0.5;
export const AIM_LIMIT_DEG = 15;
export const FACE_LIMIT_DEG = 12;
const FACE_PITCH_FLOOR_DEG = 30;

export interface GolfShotData {
  readonly kind: 'full' | 'putt';
  readonly power: number;
  readonly faceDeg: number;
  readonly aimDeg: number;
  readonly strokeDeg: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Faccia del bastone dal colpo (gradi, + aperta). Rotazione integrata nel frame del telefono:
 * beccheggio attorno a +X, rollio attorno all'asse di mira (−Z). Diviso per il beccheggio
 * (con un minimo) così conta la torsione relativa al colpo, non quella assoluta.
 */
export function faceFromRotation(rotation: readonly [number, number, number]): number {
  const pitchDeg = rotation[0] * RAD2DEG;
  const rollDeg = -rotation[2] * RAD2DEG;
  const through = Math.max(Math.abs(pitchDeg), FACE_PITCH_FLOOR_DEG);
  return clamp((rollDeg / through) * FACE_LIMIT_DEG, -FACE_LIMIT_DEG, FACE_LIMIT_DEG);
}

export interface GolfRecognizer {
  /** Campione fuso dal tracker. Restituisce un colpo pieno quando è pronto. */
  feed(s: FusedSample): GolfShotData | null;
  pressPutt(t: number): void;
  /** Fine del putt: `null` se non c'era la pressione. */
  releasePutt(t: number): GolfShotData | null;
  readonly hasGrip: boolean;
  readonly aimDeg: number;
  readonly isPutting: boolean;
  reset(): void;
}

export function createGolfRecognizer(): GolfRecognizer {
  const burst = createBurstDetector();
  let gripBuffer: GripSample[] = [];
  let grip: Grip | null = null;
  let aimDeg = 0;
  let pending: { event: BurstEvent; aimDeg: number } | null = null;
  let putt: { from: number; angle: number } | null = null;

  const toShot = (event: BurstEvent, aim: number): GolfShotData => ({
    kind: 'full',
    power: event.power,
    faceDeg: faceFromRotation(event.rotation),
    aimDeg: aim,
    strokeDeg: 0,
  });

  return {
    feed(s) {
      if (putt) {
        putt = { ...putt, angle: putt.angle + Math.hypot(...s.gyro) * (s.dtMs / 1000) };
        return null;
      }
      gripBuffer = pushGripSample(gripBuffer, s.up, s.t);
      // presa: telefono fermo abbastanza a lungo; la mira si legge solo da fermi
      if (s.still.isStill && s.still.steadyMs >= GRIP_STEADY_MS) {
        if (!grip) grip = captureGrip(gripBuffer, s.t);
        aimDeg = clamp(signedRoll(grip, s.up) * RAD2DEG * AIM_GAIN, -AIM_LIMIT_DEG, AIM_LIMIT_DEG);
      }

      let ready: GolfShotData | null = null;
      if (pending && s.t - pending.event.t > BURST_REPLACE_MS) {
        ready = toShot(pending.event, pending.aimDeg);
        pending = null;
        grip = null; // dopo il colpo si riprende la presa
      }
      // il rilevatore vede sempre i campioni (per la sua isteresi), ma senza presa non si tira
      const event = burst.update(s);
      if (event && grip) {
        // un colpo più forte subito dopo (backswing seguito dal colpo vero) prende il suo posto
        if (!pending || event.replacesPrevious) pending = { event, aimDeg };
      }
      return ready;
    },
    pressPutt(t) {
      putt = { from: t, angle: 0 };
    },
    releasePutt() {
      if (!putt) return null;
      // avanti e indietro: l'ampiezza del colpo è metà della rotazione totale
      const strokeDeg = (putt.angle * RAD2DEG) / 2;
      putt = null;
      return { kind: 'putt', power: 0, faceDeg: 0, aimDeg, strokeDeg };
    },
    get hasGrip() {
      return grip !== null;
    },
    get aimDeg() {
      return aimDeg;
    },
    get isPutting() {
      return putt !== null;
    },
    reset() {
      burst.reset();
      gripBuffer = [];
      grip = null;
      aimDeg = 0;
      pending = null;
      putt = null;
    },
  };
}
