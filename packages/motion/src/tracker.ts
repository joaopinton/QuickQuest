// Tracker di movimento del controller: sensori → offset del giroscopio → filtro d'orientamento
// → buffer per lo swing. Vive per tutta la sessione del telefono (calibrazione e partita),
// così l'orientamento stimato resta coerente tra il tiro di prova e i tiri veri.
//
// Dalla pipeline di choijunhuk/phonemote (MIT) arrivano: verifica dell'ordine degli assi,
// sottrazione dell'offset del giroscopio, stato "fermo" e integrazione trapezoidale (D39).

import { createSensorAdapter, type SensorSample } from './adapter';
import { checkGyroOrder, loadGyroOrder, saveGyroOrder, type AxisCheckResult, type AxisCheckSample, type GyroOrder } from './axis-check';
import { createComplementaryFilter } from './filter';
import { createGyroBias } from './gyro-bias';
import { norm, normalize, qConj, qRotate, WORLD_UP, type Quaternion, type Vector3 } from './math';
import type { MotionLike } from './raw';
import { createStillness, type StillnessReading } from './stillness';
import { analyzeSwing, type SwingAnalysis, type SwingSample } from './swing';

const BUFFER_MS = 2500;
const AXIS_BUFFER_MS = 3000;
const PRE_PRESS_MS = 300; // il braccio può partire un attimo prima del pollice
const MAX_DT_MS = 50;

/** Campione già fuso, per i riconoscitori dei giochi (pointer, burst, grip). */
export interface FusedSample {
  readonly t: number; // ms, orologio della pagina
  readonly dtMs: number;
  /** rad/s, frame del telefono, offset già sottratto. */
  readonly gyro: Vector3;
  /** m/s², gravità esclusa. */
  readonly acc: Vector3;
  readonly accG: Vector3;
  /** telefono → mondo. */
  readonly q: Quaternion;
  /** In alto del mondo, nel frame del telefono (unitario). */
  readonly up: Vector3;
  readonly still: StillnessReading;
}

export type FusedListener = (s: FusedSample) => void;

export interface MotionTracker {
  /** Inizia ad ascoltare `devicemotion` (dopo il permesso dei sensori). */
  start(): void;
  stop(): void;
  /** Campione già normalizzato (usato dai test e da `start`). `now` = orologio della pagina in ms. */
  feed(sample: SensorSample, now: number): void;
  /** Evento `devicemotion` (o equivalente registrato), letto con l'ordine degli assi attuale. */
  feedEvent(e: MotionLike, now: number): void;
  press(now: number): void;
  /** Rilascio del pollice: analizza lo swing fatto tenendo premuto. */
  release(now: number): SwingAnalysis;
  cancel(): void;
  /** Ricevere ogni campione fuso; restituisce la funzione per smettere. */
  subscribe(listener: FusedListener): () => void;
  /** Verifica l'ordine degli assi sugli ultimi secondi di movimento e, se è chiaro, lo applica. */
  checkAxes(): AxisCheckResult;
  /** Velocità angolare attuale (rad/s), per mostrare che i sensori rispondono. */
  readonly omega: number;
  readonly q: Quaternion | null;
  readonly up: Vector3 | null;
  readonly still: StillnessReading;
  readonly bias: Vector3;
  readonly gyroOrder: GyroOrder;
  readonly samples: number;
  readonly isPressed: boolean;
}

export interface MotionTrackerOptions {
  readonly gyroOrder?: GyroOrder;
  /** Ricorda l'ordine degli assi in sessionStorage (default true). */
  readonly persist?: boolean;
}

export function createMotionTracker(opts: MotionTrackerOptions = {}): MotionTracker {
  const persist = opts.persist ?? true;
  const filter = createComplementaryFilter();
  const adapter = createSensorAdapter({ gyroOrder: opts.gyroOrder ?? (persist ? loadGyroOrder() : null) ?? 'spec' });
  const bias = createGyroBias();
  const stillness = createStillness();
  const listeners = new Set<FusedListener>();
  let buffer: SwingSample[] = [];
  let axisBuffer: AxisCheckSample[] = [];
  let lastT: number | null = null;
  let lastGyro: Vector3 | null = null;
  let omega = 0;
  let count = 0;
  let pressedAt: number | null = null;
  let listening = false;

  const resetFusion = () => {
    filter.reset();
    bias.reset();
    stillness.reset();
    buffer = [];
    lastGyro = null;
  };

  const feed = (sample: SensorSample, now: number) => {
    const dtMs = lastT === null ? 1000 / 60 : Math.min(MAX_DT_MS, Math.max(1, now - lastT));
    lastT = now;
    const gyro = bias.update(sample.gyro, dtMs);
    // trapezio (D39): si integra la media tra il campione precedente e questo
    const step: Vector3 = lastGyro
      ? [(lastGyro[0] + gyro[0]) / 2, (lastGyro[1] + gyro[1]) / 2, (lastGyro[2] + gyro[2]) / 2]
      : gyro;
    lastGyro = gyro;
    const q = filter.update(step, sample.accG, dtMs / 1000);
    const still = stillness.update(gyro, dtMs);
    omega = norm(gyro);
    count++;

    buffer = [...buffer, { t: now, gyro, q }].filter((s) => now - s.t <= BUFFER_MS);
    axisBuffer = [...axisBuffer, { t: now, gyro: sample.specGyro ?? sample.gyro, accG: sample.rawAccG ?? sample.accG }]
      .filter((s) => now - s.t <= AXIS_BUFFER_MS);

    if (listeners.size > 0) {
      const fused: FusedSample = {
        t: now, dtMs, gyro, acc: sample.acc, accG: sample.accG, q, up: normalize(qRotate(qConj(q), WORLD_UP)), still,
      };
      for (const l of listeners) l(fused);
    }
  };

  // si usa l'orologio della pagina alla ricezione: event.timeStamp non è affidabile su tutti i browser
  const feedEvent = (e: MotionLike, now: number) => {
    const s = adapter.fromEvent(e);
    if (s) feed(s, now);
  };
  const handler = (e: DeviceMotionEvent) => feedEvent(e, performance.now());

  return {
    start() {
      if (listening || typeof window === 'undefined') return;
      listening = true;
      window.addEventListener('devicemotion', handler);
    },
    stop() {
      listening = false;
      window.removeEventListener('devicemotion', handler);
    },
    feed,
    feedEvent,
    press(now) {
      pressedAt = now;
    },
    release(now) {
      const from = (pressedAt ?? now) - PRE_PRESS_MS;
      pressedAt = null;
      return analyzeSwing(buffer.filter((s) => s.t >= from && s.t <= now + 20), now);
    },
    cancel() {
      pressedAt = null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    checkAxes() {
      const result = checkGyroOrder(axisBuffer);
      if (result.order && result.order !== adapter.gyroOrder) {
        adapter.setGyroOrder(result.order);
        resetFusion(); // l'orientamento stimato con gli assi sbagliati non vale più
      }
      if (result.order && persist) saveGyroOrder(result.order);
      return result;
    },
    get omega() {
      return omega;
    },
    get q() {
      return filter.q;
    },
    get up() {
      const q = filter.q;
      return q ? normalize(qRotate(qConj(q), WORLD_UP)) : null;
    },
    get still() {
      return stillness.reading;
    },
    get bias() {
      return bias.bias;
    },
    get gyroOrder() {
      return adapter.gyroOrder;
    },
    get samples() {
      return count;
    },
    get isPressed() {
      return pressedAt !== null;
    },
  };
}

