// Test sulle tracce registrate da choijunhuk/phonemote (MIT), convertite con
// scripts/convert-pmtrace.ts. Due sono di un telefono vero (real-*), le altre sintetiche.
import { describe, expect, test } from 'vitest';
import type { GyroOrder } from '../src/axis-check';
import { createBurstDetector, type BurstEvent } from '../src/burst';
import { DEG2RAD, norm } from '../src/math';
import { traceEvent } from '../src/trace';
import { aimRates, createPointer } from '../src/pointer';
import { createMotionTracker, type FusedSample } from '../src/tracker';
import phoneOnTable from './traces/phone-on-table.json';
import realRest from './traces/real-rest.json';
import realSwing from './traces/real-swing.json';
import sensorStall from './traces/sensor-stall.json';
import swingForward from './traces/swing-forward.json';
import walkAround from './traces/walk-around.json';

interface Trace {
  readonly note: string;
  readonly synthetic: boolean;
  readonly samples: readonly (readonly number[])[];
}

const TRACES: Record<string, Trace> = {
  'phone-on-table': phoneOnTable, 'real-rest': realRest, 'real-swing': realSwing,
  'sensor-stall': sensorStall, 'swing-forward': swingForward, 'walk-around': walkAround,
};

function load(name: string): Trace {
  const trace = TRACES[name];
  if (!trace) throw new Error(`traccia sconosciuta: ${name}`);
  return trace;
}

const toEvent = traceEvent;

/** Riproduce una traccia nel tracker; raccoglie i colpi del rilevatore e i campioni fusi. */
function replay(name: string, gyroOrder: GyroOrder = 'xyz') {
  const tracker = createMotionTracker({ gyroOrder, persist: false });
  const burst = createBurstDetector();
  const bursts: BurstEvent[] = [];
  const fused: FusedSample[] = [];
  tracker.subscribe((s) => {
    fused.push(s);
    const e = burst.update(s);
    if (e) bursts.push(e);
  });
  for (const s of load(name).samples) tracker.feedEvent(toEvent(s), s[0]!);
  return { tracker, bursts, fused };
}

describe('verifica dell’ordine degli assi sulle tracce', () => {
  // Nelle tracce di PhoneMote la gravità non c'è: è ricostruita dall'orientamento, e i segni
  // di quella ricostruzione non si possono verificare senza il telefono. La verifica quindi
  // non deve decidere su questi dati; la si prova su movimenti simulati in axis-check.test.ts.
  test('su uno swing con gravità ricostruita non decide', () => {
    const tracker = createMotionTracker({ gyroOrder: 'spec', persist: false });
    for (const s of load('real-swing').samples) tracker.feedEvent(toEvent(s), s[0]!);
    expect(tracker.checkAxes().order).toBeNull();
    expect(tracker.gyroOrder).toBe('spec');
  });

  test('a telefono fermo non decide', () => {
    const tracker = createMotionTracker({ gyroOrder: 'spec', persist: false });
    for (const s of load('phone-on-table').samples) tracker.feedEvent(toEvent(s), s[0]!);
    expect(tracker.checkAxes().order).toBeNull();
  });
});

describe('telefono sul tavolo', () => {
  test('nessun colpo, telefono fermo e offset entro il limite', () => {
    const { tracker, bursts } = replay('phone-on-table');
    expect(bursts).toHaveLength(0);
    expect(tracker.still.isStill).toBe(true);
    expect(tracker.still.steadyMs).toBeGreaterThan(5000);
    expect(norm(tracker.bias)).toBeLessThanOrEqual(2 * DEG2RAD * Math.sqrt(3));
  });

  test('il puntatore resta entro un ventesimo di schermo', () => {
    const { fused } = replay('phone-on-table');
    const pointer = createPointer();
    for (const s of fused) pointer.update(aimRates(s.gyro, s.q), s.dtMs / 1000);
    expect(Math.hypot(pointer.position.x - 0.5, pointer.position.y - 0.5)).toBeLessThan(0.05);
  });
});

describe('movimenti che non sono colpi', () => {
  test('camminando col telefono in mano', () => {
    const { tracker, bursts } = replay('walk-around');
    expect(bursts).toHaveLength(0);
    expect(tracker.still.isStill).toBe(false);
  });

  test('sensore che si blocca: niente colpi dai dati congelati', () => {
    expect(replay('sensor-stall').bursts).toHaveLength(0);
  });

  test('telefono vero tenuto fermo in mano', () => {
    const { tracker, bursts } = replay('real-rest');
    expect(bursts).toHaveLength(0);
    expect(tracker.still.isStill).toBe(true);
  });
});

describe('colpi', () => {
  test('dieci swing voluti: ciascuno una volta sola, a piena forza', () => {
    const { bursts } = replay('swing-forward');
    expect(bursts).toHaveLength(10);
    for (const b of bursts) {
      expect(b.strength).toBeGreaterThan(0.9);
      expect(b.peakRate).toBeGreaterThan(800 * DEG2RAD);
    }
  });

  test('uno swing registrato su un telefono vero: una volta sola, forte', () => {
    const { bursts } = replay('real-swing');
    expect(bursts).toHaveLength(1);
    expect(bursts[0]!.strength).toBeGreaterThan(0.8);
    expect(bursts[0]!.replacesPrevious).toBe(false);
  });
});
