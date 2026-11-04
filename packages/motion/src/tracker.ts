// Tracker di movimento del controller: sensori → filtro d'orientamento → buffer per lo swing.
// Vive per tutta la sessione del telefono (calibrazione e partita), così l'orientamento
// stimato resta coerente tra il tiro di prova e i tiri veri.

import { createSensorAdapter, type SensorSample } from './adapter';
import { createComplementaryFilter } from './filter';
import { norm, type Quaternion } from './math';
import { analyzeSwing, type SwingAnalysis, type SwingSample } from './swing';

const BUFFER_MS = 2500;
const PRE_PRESS_MS = 300; // il braccio può partire un attimo prima del pollice

export interface MotionTracker {
  /** Inizia ad ascoltare `devicemotion` (dopo il permesso dei sensori). */
  start(): void;
  stop(): void;
  /** Campione già normalizzato (usato dai test e da `start`). `now` = orologio della pagina in ms. */
  feed(sample: SensorSample, now: number): void;
  press(now: number): void;
  /** Rilascio del pollice: analizza lo swing fatto tenendo premuto. */
  release(now: number): SwingAnalysis;
  cancel(): void;
  /** Velocità angolare attuale (rad/s), per mostrare che i sensori rispondono. */
  readonly omega: number;
  readonly q: Quaternion | null;
  readonly samples: number;
  readonly isPressed: boolean;
}

export function createMotionTracker(): MotionTracker {
  const filter = createComplementaryFilter();
  const adapter = createSensorAdapter();
  const buffer: SwingSample[] = [];
  let lastT: number | null = null;
  let omega = 0;
  let count = 0;
  let pressedAt: number | null = null;
  let listening = false;

  const feed = (sample: SensorSample, now: number) => {
    const dt = lastT === null ? 1 / 60 : Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    const q = filter.update(sample.gyro, sample.accG, dt);
    omega = norm(sample.gyro);
    count++;
    buffer.push({ t: now, gyro: sample.gyro, q });
    while (buffer.length > 0 && now - buffer[0]!.t > BUFFER_MS) buffer.shift();
  };

  // si usa l'orologio della pagina alla ricezione: event.timeStamp non è affidabile su tutti i browser
  const handler = (e: DeviceMotionEvent) => {
    const s = adapter.fromEvent(e);
    if (s) feed(s, performance.now());
  };

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
    get omega() {
      return omega;
    },
    get q() {
      return filter.q;
    },
    get samples() {
      return count;
    },
    get isPressed() {
      return pressedAt !== null;
    },
  };
}
