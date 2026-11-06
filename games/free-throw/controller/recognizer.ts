// Riconoscitore del gesto dei Tiri liberi — Scuola Basket (docs/games/free-throw.md § Gesto, docs/04 § 6).
//
// Il fondamentale insegnato alla scuola basket (BEEF: Balance, Eyes, Elbow, Follow-through):
// 1. CARICAMENTO SOPRA LA TESTA (Set Point): si tiene premuto il tasto, si piega il gomito a 90°
//    portando il telefono sopra la fronte con il polso caricato all'indietro.
// 2. SPINTA VERSO L'ALTO (Upward Extension): distensione fluida del braccio verso l'alto-avanti
//    (accelerazione verticale contro la gravità + rotazione dell'avambraccio).
// 3. RILASCIO IN ALTO E CHIUSURA A GANCIO (Follow-through / "mano nel canestro"): in cima alla
//    spinta il polso si flette decisamente in avanti-basso ("a gancio" / collo d'oca) mentre si
//    alza il pollice. La chiusura a gancio genera il backspin morbido e l'arco ottimale (50°–55°).
//
// Indipendenza dalla presa: usiamo `s.up` (direzione della gravità nel frame del telefono) e
// l'orientamento nel mondo `s.q` per sapere sempre cosa significa "verso l'alto" e "flessione
// del polso in avanti", sia con lo schermo verso il palmo sia verso il viso.

import {
  angleBetween,
  cross,
  dot,
  norm,
  normalize,
  principalAxis,
  qRotate,
  RAD2DEG,
  scale,
  sub,
  wrapAngle,
  WORLD_UP,
  type FusedSample,
  type SwingProfile,
  type Vector3,
} from '@quickquest/motion';
import type { FreeThrowShotData } from '../shared/events';

/** Velocità ideale per centrare il canestro dalla lunetta (4.225 m al centro del ferro) a 53°. */
export const IDEAL_RELEASE_SPEED = 7.28; // m/s
export const MIN_SHOT_SPEED = 5.4;
export const MAX_SHOT_SPEED = 9.4;

/** Angolo di uscita ottimale da scuola basket (50°–55°). */
export const IDEAL_RELEASE_ANGLE_DEG = 53;
export const MIN_RELEASE_ANGLE_DEG = 38;
export const MAX_RELEASE_ANGLE_DEG = 64;

/** Soglie morbide per distinguere un vero tiro da un tocco involontario senza richiedere troppa forza. */
export const MIN_OMEGA_PEAK = 1.4; // rad/s
export const MIN_UPWARD_ACC = 1.0; // m/s² verso l'alto
export const HOOK_WINDOW_MS = 180; // finestra finale (ms) in cui si misura la frustata del polso a gancio
export const EXTENSION_WINDOW_MS = 450; // finestra (ms) della spinta verso l'alto prima del rilascio
export const IDEAL_HOOK_DEG = 38; // flessione del polso (gradi) per una chiusura a gancio naturale
export const IDEAL_WRIST_SNAP_OMEGA = 6.4; // rad/s di picco del polso nel follow-through

export type FreeThrowPhase = 'idle' | 'loading' | 'pushing';

export type FreeThrowFailure = 'no-data' | 'too-weak' | 'no-upward-push';

export interface FreeThrowGestureAnalysis {
  readonly valid: boolean;
  readonly failure?: FreeThrowFailure;
  readonly shot: FreeThrowShotData | null;
  /** Picco di velocità angolare nel follow-through (rad/s). */
  readonly peakOmega: number;
  /** Picco di accelerazione verticale verso l'alto (m/s²). */
  readonly peakUpAcc: number;
  /** Angolo di chiusura del polso a gancio (gradi). */
  readonly wristHookDeg: number;
}

export interface FreeThrowRecognizer {
  /** Inizia il caricamento (tasto premuto). */
  press(t: number): void;
  /** Alimenta il riconoscitore con i campioni fusi a 60–100 Hz. */
  feed(s: FusedSample): void;
  /** Alza il pollice in cima alla spinta: analizza il tiro e la chiusura a gancio. */
  release(t: number, profile?: SwingProfile | null): FreeThrowGestureAnalysis;
  /** Annulla il gesto in corso. */
  reset(): void;
  readonly phase: FreeThrowPhase;
  /** Indicatore live [0..1] di quanto il telefono è caricato e pronto sopra la testa. */
  readonly loadLevel: number;
}

interface RecordedSample {
  readonly t: number;
  readonly dtS: number;
  readonly gyro: Vector3;
  readonly worldOmega: Vector3;
  readonly up: Vector3;
  /** Accelerazione lineare verso l'alto del mondo (m/s², > 0 quando si spinge su). */
  readonly upAcc: number;
  /** Accelerazione lineare totale (modulo, m/s²). */
  readonly accMag: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createFreeThrowRecognizer(): FreeThrowRecognizer {
  let phase: FreeThrowPhase = 'idle';
  let pressedAt: number | null = null;
  let samples: RecordedSample[] = [];
  let loadLevel = 0;
  let initialUp: Vector3 | null = null;

  const reset = () => {
    phase = 'idle';
    pressedAt = null;
    samples = [];
    loadLevel = 0;
    initialUp = null;
  };

  return {
    press(t: number) {
      pressedAt = t;
      phase = 'loading';
      samples = [];
      loadLevel = 0.25;
      initialUp = null;
    },

    feed(s: FusedSample) {
      if (pressedAt === null) return;
      const dtS = clamp(s.dtMs / 1000, 0.001, 0.05);
      const worldOmega = qRotate(s.q, s.gyro);
      const upAcc = dot(s.acc, s.up);
      const accMag = norm(s.acc);

      if (!initialUp) initialUp = s.up;

      // Durante il caricamento il giocatore piega il gomito e porta il telefono sopra la fronte;
      // appena spinge verso l'alto o ruota il polso in avanti passa in 'pushing'
      const tiltFromStart = angleBetween(initialUp, s.up) * RAD2DEG;
      loadLevel = clamp(0.35 + tiltFromStart / 32 + Math.max(0, upAcc) / 9, 0, 1);

      if (phase === 'loading' && (upAcc > 1.3 || norm(s.gyro) > 1.6)) {
        phase = 'pushing';
      }

      samples.push({
        t: s.t,
        dtS,
        gyro: s.gyro,
        worldOmega,
        up: s.up,
        upAcc,
        accMag,
      });

      // Mantiene gli ultimi 2.5 s di campioni
      if (samples.length > 260) {
        samples = samples.slice(samples.length - 260);
      }
    },

    release(tRelease: number, profile: SwingProfile | null = null): FreeThrowGestureAnalysis {
      const fail = (
        failure: FreeThrowFailure,
        peakOmega = 0,
        peakUpAcc = 0,
        wristHookDeg = 0,
      ): FreeThrowGestureAnalysis => {
        reset();
        return { valid: false, failure, shot: null, peakOmega, peakUpAcc, wristHookDeg };
      };

      if (pressedAt === null || samples.length < 4) {
        return fail('no-data');
      }

      // Finestra della spinta verso l'alto e del rilascio
      const extSamples = samples.filter((s) => s.t >= tRelease - EXTENSION_WINDOW_MS && s.t <= tRelease + 30);
      const active = extSamples.length >= 3 ? extSamples : samples.slice(-6);

      // 1. Asse principale di rotazione nel piano orizzontale (l'asse del gomito/polso durante il tiro)
      const cov = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      for (const s of active) {
        // Proiettiamo ω sul piano orizzontale per trovare l'asse del gancio (avanti/indietro)
        const wh: Vector3 = [s.worldOmega[0], s.worldOmega[1], 0];
        for (let i = 0; i < 3; i++) {
          const row = cov[i]!;
          for (let j = 0; j < 3; j++) {
            row[j] = (row[j] ?? 0) + (wh[i] ?? 0) * (wh[j] ?? 0);
          }
        }
      }
      let snapAxis = principalAxis(cov);
      if (norm(snapAxis) < 1e-6) snapAxis = [1, 0, 0];

      // Il verso positivo dell'asse è quello della chiusura in avanti negli ultimi istanti (hook window)
      const hookSamples = active.filter((s) => s.t >= tRelease - HOOK_WINDOW_MS);
      const tail = hookSamples.length >= 2 ? hookSamples : active.slice(-3);
      const strongestHook = tail.reduce(
        (best, s) => (Math.abs(dot(s.worldOmega, snapAxis)) > Math.abs(dot(best.worldOmega, snapAxis)) ? s : best),
        tail[0]!,
      );
      if (dot(strongestHook.worldOmega, snapAxis) < 0) {
        snapAxis = scale(snapAxis, -1);
      }

      // 2. Picco di velocità angolare lungo l'asse del tiro e accelerazione verso l'alto
      const peakOmega = Math.max(0, ...active.map((s) => dot(s.worldOmega, snapAxis)));
      const peakUpAcc = Math.max(0, ...active.map((s) => s.upAcc));
      const peakTotalAcc = Math.max(0, ...active.map((s) => s.accMag));

      if (peakOmega < MIN_OMEGA_PEAK && peakUpAcc < MIN_UPWARD_ACC) {
        return fail('too-weak', peakOmega, peakUpAcc, 0);
      }

      // Verifica che non sia un movimento verso il basso (es. abbassare il braccio senza spingere su)
      const minUpAcc = Math.min(...tail.map((s) => s.upAcc));
      if (peakUpAcc < 0.4 && minUpAcc < -6.0 && peakOmega < MIN_OMEGA_PEAK * 1.3) {
        return fail('no-upward-push', peakOmega, peakUpAcc, 0);
      }

      // 3. Analisi della CHIUSURA A GANCIO (Follow-through del polso in cima alla spinta)
      // Integriamo la rotazione in avanti attorno a snapAxis nella finestra finale del rilascio
      let hookRad = 0;
      let peakHookOmega = 0;
      for (const s of tail) {
        const wForward = Math.max(0, dot(s.worldOmega, snapAxis));
        hookRad += wForward * s.dtS;
        if (wForward > peakHookOmega) peakHookOmega = wForward;
      }
      const wristHookDeg = hookRad * RAD2DEG;

      // Qualità della chiusura a gancio [0..1]: combina l'angolo di flessione del polso e la rapidità dello snap
      const angleScore = clamp(wristHookDeg / IDEAL_HOOK_DEG, 0, 1);
      const snapSpeedScore = clamp(peakHookOmega / IDEAL_WRIST_SNAP_OMEGA, 0, 1);
      const hookQuality = clamp(angleScore * 0.55 + snapSpeedScore * 0.45, 0.1, 1);

      // 4. Backspin [0..1]: nasce direttamente dalla frustata del polso nella chiusura a gancio
      const backspin = clamp(0.15 + hookQuality * 0.85, 0.15, 1);

      // 5. Angolo di uscita (Release Angle):
      // Nella scuola basket, spingere verso l'alto sopra la testa + chiudere a gancio dà un arco
      // alto e morbido (51°–55°). Un tiro spinto piatto senza gancio né spinta verticale esce basso (~41°–46°).
      const upwardRatio = clamp((peakUpAcc + 2.0) / 10.0, 0, 1);
      // Stimiamo anche l'elevazione dall'orientamento al punto di carico rispetto al rilascio
      const firstLoaded = active[0]!;
      const lastReleased = tail[tail.length - 1]!;
      const verticalSweepDeg = angleBetween(firstLoaded.up, lastReleased.up) * RAD2DEG;
      const sweepFactor = clamp(verticalSweepDeg / 45, 0, 1);

      const rawAngle =
        43 +
        upwardRatio * 6.5 +
        hookQuality * 5.0 +
        (sweepFactor - 0.5) * 3.0;
      const releaseAngleDeg = clamp(rawAngle, MIN_RELEASE_ANGLE_DEG, MAX_RELEASE_ANGLE_DEG);

      // 6. Potenza / Velocità iniziale della palla (m/s):
      // Tarata su un gesto naturale e rilassato da tiro libero (molto più morbido di uno swing a tutto braccio),
      // così non serve forzare il movimento per arrivare comodamente al canestro.
      const refOmega = profile ? clamp(profile.normalPeak * 0.56, 3.0, 4.3) : 3.5;
      const omegaNorm = clamp(peakOmega / refOmega, 0.35, 1.65);
      const effAcc = peakUpAcc > 0.3 ? peakUpAcc : peakTotalAcc * 0.65;
      const accNorm = clamp(effAcc / 4.6, 0.55, 1.5);
      const combinedPower = omegaNorm * 0.65 + accNorm * 0.35;

      // Curva morbida e compressa attorno a IDEAL_RELEASE_SPEED (7.28 m/s):
      // i gesti normali/rilassati cadono naturalmente nello sweet spot senza richiedere sforzo eccessivo.
      const deltaPower = combinedPower - 1.0;
      const compressedDelta = deltaPower * (Math.abs(deltaPower) < 0.38 ? 0.42 : 0.65);
      const rawSpeed = IDEAL_RELEASE_SPEED * (1.0 + compressedDelta * 0.18);
      const speed = clamp(rawSpeed, MIN_SHOT_SPEED, MAX_SHOT_SPEED);

      // 7. Deviazione laterale (dir in radianti, + = destra, - = sinistra)
      const horizNorm = Math.hypot(snapAxis[0], snapAxis[1]);
      const heading = horizNorm > 0.4 ? Math.atan2(snapAxis[1], snapAxis[0]) : null;
      let dirFromHeading = 0;
      if (profile && heading !== null) {
        const delta = wrapAngle(heading - profile.heading0);
        dirFromHeading = -clamp(delta / ((26 * Math.PI) / 180), -1, 1) * 0.09;
      }

      // Torsione laterale del polso al rilascio (con piccola deadzone per ignorare micro-rotazioni naturali)
      const forwardDir = normalize(cross(WORLD_UP, snapAxis));
      let lateralTwist = 0;
      for (const s of tail) {
        const yawRate = dot(s.worldOmega, WORLD_UP);
        const rollRate = dot(s.worldOmega, forwardDir);
        lateralTwist += (-yawRate * 0.6 + rollRate * 0.4) * s.dtS;
      }
      const twistPastDeadzone =
        Math.abs(lateralTwist) <= 0.04
          ? 0
          : Math.sign(lateralTwist) * (Math.abs(lateralTwist) - 0.04);
      const dirFromTwist = clamp(twistPastDeadzone * 0.26, -0.13, 0.13);
      const dir = clamp(dirFromHeading + dirFromTwist, -0.2, 0.2);

      const shot: FreeThrowShotData = {
        speed,
        releaseAngleDeg,
        backspin,
        hookQuality,
        dir,
      };

      reset();
      return {
        valid: true,
        shot,
        peakOmega,
        peakUpAcc,
        wristHookDeg,
      };
    },

    reset,

    get phase() {
      return phase;
    },

    get loadLevel() {
      return loadLevel;
    },
  };
}

