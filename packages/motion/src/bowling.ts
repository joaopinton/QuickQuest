// Riconoscitore del gesto del Bowling (docs/04 § 6, spikes/s1-sensor-probe/src/swing.js).
// Esegue una macchina a stati in tempo reale alla frequenza nativa dei sensori:
// idle -> armed (tasto premuto) -> backswing -> forward -> release (pollice alzato).

import type { SensorSample } from './adapter';
import { WORLD_UP, swingTwistAngles, type Quaternion, type Vector3 } from './math';

export const R_ARM = 0.65; // metri (raggio braccio del giocatore)
export const SWING_THRESHOLD = 2.0; // rad/s soglia minima moto
export const BACKSWING_MIN_MS = 60; // ms per confermare il backswing
export const RELEASE_WINDOW_MS = 40; // ms per calcolare omega al rilascio
export const ROLL_WINDOW_MS = 120; // ms per integrare la rotazione del polso

export type BowlingPhase = 'idle' | 'armed' | 'backswing' | 'forward';

export interface BowlingReleaseEvent {
  readonly valid: boolean;
  readonly speed: number; // m/s
  readonly spin: number; // -1 (hook a destra) .. +1 (hook a sinistra)
  readonly dir: number; // radianti (-0.5 .. +0.5 deviazione mira orizzontale)
  readonly tRelease: number;
  readonly peakForward: number; // rad/s
  readonly peakBack: number; // rad/s
}

export interface BowlingRecognizer {
  onButton(down: boolean, t: number): void;
  onSample(sample: SensorSample, q?: Quaternion): void;
  onRelease(cb: (event: BowlingReleaseEvent) => void): () => void;
  readonly state: BowlingPhase;
  reset(): void;
}

export function createBowlingRecognizer(): BowlingRecognizer {
  let phase: BowlingPhase = 'idle';
  let tDown = 0;
  let backswingStartMs = 0;
  let peakBack = 0;
  let peakForward = 0;
  let lastQ: Quaternion = [1, 0, 0, 0];

  // Buffer circolare recente per gli ultimi 1500 ms di campioni
  const history: { t: number; gyro: Vector3; accG: Vector3; ws: number }[] = [];
  const MAX_HISTORY_MS = 1500;

  const releaseListeners = new Set<(e: BowlingReleaseEvent) => void>();

  const reset = () => {
    phase = 'idle';
    tDown = 0;
    backswingStartMs = 0;
    peakBack = 0;
    peakForward = 0;
    history.length = 0;
  };

  return {
    get state() {
      return phase;
    },

    reset,

    onRelease(cb) {
      releaseListeners.add(cb);
      return () => releaseListeners.delete(cb);
    },

    onButton(down: boolean, t: number) {
      if (down) {
        if (phase === 'idle') {
          phase = 'armed';
          tDown = t;
          peakBack = 0;
          peakForward = 0;
          backswingStartMs = 0;
        }
      } else {
        // Pollice alzato: momento del rilascio (docs/04 § 6.2)
        const tRelease = t;
        if (phase === 'forward' || (phase === 'backswing' && peakForward > SWING_THRESHOLD)) {
          // Swing completato con successo: estrazione parametri
          const releasePoints = history.filter((p) => p.t >= tRelease - RELEASE_WINDOW_MS);
          const pts = releasePoints.length >= 2 ? releasePoints : history.slice(-2);
          const avgOmegaS = pts.length > 0 ? pts.reduce((sum, p) => sum + p.ws, 0) / pts.length : 0;
          const omegaRelease = Math.max(0, avgOmegaS);
          const speed = omegaRelease * R_ARM;

          // Calcolo dello spin dalla rotazione dell'avambraccio (asse Y del telefono) negli ultimi 120 ms
          const rollPoints = history.filter((p) => p.t >= tRelease - ROLL_WINDOW_MS);
          let wristRoll = 0;
          for (let i = 1; i < rollPoints.length; i++) {
            const prev = rollPoints[i - 1];
            const curr = rollPoints[i];
            if (!prev || !curr) continue;
            const dt = (curr.t - prev.t) / 1000;
            wristRoll += curr.gyro[1] * dt;
          }

          // Mappatura spin in [-1, +1]
          const spin = Math.max(-1, Math.min(1, wristRoll * 1.2));

          // Direzione di rilascio da yaw
          const { twist } = swingTwistAngles(lastQ, WORLD_UP);
          const dir = Math.max(-0.5, Math.min(0.5, twist));

          const event: BowlingReleaseEvent = {
            valid: true,
            speed,
            spin,
            dir,
            tRelease,
            peakForward,
            peakBack,
          };

          releaseListeners.forEach((cb) => cb(event));
        } else if (phase === 'armed' || phase === 'backswing') {
          // Tasto rilasciato senza completare lo swing in avanti: annullo
          const event: BowlingReleaseEvent = {
            valid: false,
            speed: 0,
            spin: 0,
            dir: 0,
            tRelease,
            peakForward: 0,
            peakBack: 0,
          };
          releaseListeners.forEach((cb) => cb(event));
        }
        reset();
      }
    },

    onSample(sample: SensorSample, q?: Quaternion) {
      if (q) lastQ = q;

      // Nella presa normale del bowling, lo swing pendolare avviene principalmente attorno all'asse X
      // (ωx positivo in avanti verso i birilli, negativo indietro nel backswing)
      const ws = sample.gyro[0];

      history.push({ t: sample.t, gyro: sample.gyro, accG: sample.accG, ws });
      while (history.length > 0) {
        const first = history[0];
        if (!first || sample.t - first.t <= MAX_HISTORY_MS) break;
        history.shift();
      }

      if (phase === 'idle') return;

      if (phase === 'armed') {
        if (ws < -SWING_THRESHOLD) {
          if (backswingStartMs === 0) backswingStartMs = sample.t;
          if (sample.t - backswingStartMs >= BACKSWING_MIN_MS) {
            phase = 'backswing';
          }
        } else {
          backswingStartMs = 0;
        }
      } else if (phase === 'backswing') {
        if (ws < peakBack) peakBack = ws;
        // Inversione della rotazione del braccio: transizione a forward
        if (ws > SWING_THRESHOLD) {
          phase = 'forward';
          peakForward = ws;
        }
      } else if (phase === 'forward') {
        if (ws > peakForward) peakForward = ws;
      }
    },
  };
}
