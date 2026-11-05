// Moduli adattati da choijunhuk/phonemote (MIT): assi, offset, fermo, 1€, presa, puntatore, colpi.
import { describe, expect, test } from 'vitest';
import { createSensorAdapter, rotateAboutZ } from '../src/adapter';
import { applyGyroOrder, checkGyroOrder, loadGyroOrder, saveGyroOrder, type AxisCheckSample, type GyroOrder } from '../src/axis-check';
import { burstPower, createBurstDetector, DEFAULT_POWER_SCALE, type BurstSample } from '../src/burst';
import { captureGrip, isFlatGrip, pushGripSample, signedPitch, signedRoll, tiltFromGrip } from '../src/grip';
import { createGyroBias } from '../src/gyro-bias';
import { DEG2RAD, qConj, qFromRotationVector, qMul, qNormalize, qRotate, type Quaternion, type Vector3 } from '../src/math';
import { createAngleOneEuroFilter, createOneEuroFilter } from '../src/one-euro';
import { aimRates, createPointer } from '../src/pointer';
import { createStillness } from '../src/stillness';
import { createTraceRecorder, traceEvent, traceRow } from '../src/trace';

/** Telefono che ruota su più assi; restituisce i campioni come li leggerebbe l'adapter (ordine spec). */
function rotatingPhone(trueOrder: GyroOrder, hz = 60, seconds = 1.5): AxisCheckSample[] {
  const out: AxisCheckSample[] = [];
  let q: Quaternion = [1, 0, 0, 0];
  const dt = 1 / hz;
  for (let i = 0; i < hz * seconds; i++) {
    const t = i * dt;
    const w: Vector3 = [3 * Math.sin(2 * t), 2 * Math.cos(3 * t), 2.5 * Math.sin(1.3 * t + 1)];
    q = qNormalize(qMul(q, qFromRotationVector([w[0] * dt, w[1] * dt, w[2] * dt])));
    const accG = qRotate(qConj(q), [0, 0, 9.81]);
    // ciò che arriva come [beta, gamma, alpha]
    const spec: Vector3 = trueOrder === 'spec' ? w : [w[1], w[2], w[0]];
    out.push({ t: t * 1000, gyro: spec, accG });
  }
  return out;
}

describe('verifica dell’ordine degli assi', () => {
  test.each(['spec', 'xyz'] as const)('riconosce un telefono che manda gli assi in ordine %s', (order) => {
    const r = checkGyroOrder(rotatingPhone(order));
    expect(r.order).toBe(order);
    expect(r.errors[order]).toBeLessThan(0.1);
  });

  test('funziona anche a 20 Hz', () => {
    expect(checkGyroOrder(rotatingPhone('xyz', 20)).order).toBe('xyz');
  });

  test('senza movimento non decide', () => {
    const still = Array.from({ length: 60 }, (_, i) => ({ t: i * 16, gyro: [0, 0, 0] as const, accG: [0, 0, 9.81] as const }));
    expect(checkGyroOrder(still).order).toBeNull();
  });

  test('riordino dei canali', () => {
    expect(applyGyroOrder([1, 2, 3], 'spec')).toEqual([1, 2, 3]);
    expect(applyGyroOrder([1, 2, 3], 'xyz')).toEqual([3, 1, 2]);
  });

  test('si ricorda per la sessione e ignora valori strani', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadGyroOrder(storage)).toBeNull();
    saveGyroOrder('xyz', storage);
    expect(loadGyroOrder(storage)).toBe('xyz');
    data.set('qq.gyroOrder', 'boh');
    expect(loadGyroOrder(storage)).toBeNull();
    const broken = { getItem: () => { throw new Error('privato'); }, setItem: () => { throw new Error('privato'); } };
    expect(loadGyroOrder(broken)).toBeNull();
    expect(() => saveGyroOrder('spec', broken)).not.toThrow();
  });
});

describe('adapter', () => {
  const ev = { timeStamp: 10, accelerationIncludingGravity: { x: 1, y: 2, z: 3 }, acceleration: { x: 0, y: 0, z: 0 }, rotationRate: { alpha: 30, beta: 10, gamma: 20 } };

  test('ordine spec e xyz dei canali di rotationRate', () => {
    const spec = createSensorAdapter({ screenAngle: () => 0 }).fromEvent(ev)!;
    expect(spec.gyro.map((v) => v / DEG2RAD)).toEqual([10, 20, 30].map((v) => expect.closeTo(v, 6)));
    const a = createSensorAdapter({ gyroOrder: 'xyz', screenAngle: () => 0 });
    expect(a.fromEvent(ev)!.gyro.map((v) => v / DEG2RAD)).toEqual([30, 10, 20].map((v) => expect.closeTo(v, 6)));
    a.setGyroOrder('spec');
    expect(a.gyroOrder).toBe('spec');
  });

  test('schermo ruotato: gli assi tornano quelli del telefono in verticale', () => {
    const s = createSensorAdapter({ screenAngle: () => 90 }).fromEvent(ev)!;
    expect(s.accG[0]).toBeCloseTo(-2, 6);
    expect(s.accG[1]).toBeCloseTo(1, 6);
    expect(s.rawAccG).toEqual([1, 2, 3]);
    expect(rotateAboutZ([1, 0, 0], 0)).toEqual([1, 0, 0]);
  });
});

describe('offset del giroscopio', () => {
  const offset: Vector3 = [0.3 * DEG2RAD, -0.4 * DEG2RAD, 0.2 * DEG2RAD];

  test('a telefono fermo impara l’offset e lo toglie', () => {
    const bias = createGyroBias();
    let out: Vector3 = [0, 0, 0];
    for (let i = 0; i < 600; i++) out = bias.update(offset, 16);
    expect(bias.bias[0]).toBeCloseTo(offset[0], 4);
    expect(Math.abs(out[1])).toBeLessThan(1e-4);
  });

  test('una mira lenta non viene scambiata per offset', () => {
    const bias = createGyroBias();
    for (let i = 0; i < 600; i++) bias.update([0, 8 * DEG2RAD, 0], 16);
    expect(bias.bias).toEqual([0, 0, 0]);
  });

  test('è limitato a 2 °/s e si azzera', () => {
    const bias = createGyroBias({ stillRad: 10 * DEG2RAD });
    for (let i = 0; i < 2000; i++) bias.update([5 * DEG2RAD, 0, 0], 16);
    expect(bias.bias[0]).toBeCloseTo(2 * DEG2RAD, 6);
    bias.update([0, 0, 0], 2000); // buco: la finestra riparte, la stima resta
    expect(bias.bias[0]).toBeCloseTo(2 * DEG2RAD, 6);
    bias.update([0, 0, 0], 0);
    bias.reset();
    expect(bias.bias).toEqual([0, 0, 0]);
  });
});

describe('telefono fermo', () => {
  test('entra sotto 8 °/s, esce sopra 16 °/s e conta da quanto è fermo', () => {
    const s = createStillness();
    expect(s.update([0.5, 0, 0], 16).isStill).toBe(false); // seminato col primo campione: uno swing
    for (let i = 0; i < 100; i++) s.update([3 * DEG2RAD, 0, 0], 16);
    expect(s.reading.isStill).toBe(true);
    expect(s.reading.steadyMs).toBeGreaterThan(1000);
    for (let i = 0; i < 30; i++) s.update([12 * DEG2RAD, 0, 0], 16);
    expect(s.reading.isStill).toBe(true); // isteresi
    for (let i = 0; i < 60; i++) s.update([40 * DEG2RAD, 0, 0], 16);
    expect(s.reading).toMatchObject({ isStill: false, steadyMs: 0 });
    s.update([0, 0, 0], 0);
    s.reset();
    expect(s.reading.isStill).toBe(false);
  });
});

describe('filtro 1€', () => {
  test('liscia il tremolio e segue i movimenti veri', () => {
    const f = createOneEuroFilter();
    let out = 0;
    for (let i = 0; i < 120; i++) out = f.filter(i % 2 === 0 ? 0.02 : -0.02, 1 / 60);
    expect(Math.abs(out)).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) out = f.filter(1, 1 / 60);
    expect(out).toBeGreaterThan(0.9);
    expect(f.filter(5, 0)).toBe(out);
    f.reset();
    expect(f.filter(3, 1 / 60)).toBe(3);
  });

  test('sugli angoli non salta a ±π', () => {
    const f = createAngleOneEuroFilter();
    f.filter(Math.PI - 0.05, 1 / 60);
    const out = f.filter(-Math.PI + 0.05, 1 / 60);
    expect(Math.abs(out)).toBeGreaterThan(Math.PI - 0.1);
    f.reset();
  });
});

describe('presa', () => {
  const upright: Vector3 = [0, 1, 0];
  const tilt = (axis: Vector3, angle: number) => qRotate(qConj(qFromRotationVector([axis[0] * angle, axis[1] * angle, axis[2] * angle])), upright);

  test('rollio e beccheggio con il segno', () => {
    const grip = captureGrip(pushGripSample([], upright, 0), 0);
    // bordo destro giù = rotazione negativa attorno a +Z (cioè positiva attorno alla mira −Z)
    expect(signedRoll(grip, tilt([0, 0, 1], -0.3))).toBeCloseTo(0.3, 6);
    expect(signedPitch(grip, tilt([1, 0, 0], 0.2))).toBeCloseTo(0.2, 6);
    expect(tiltFromGrip(grip, upright)).toEqual({ roll: 0, pitch: 0 });
  });

  test('la presa ignora i campioni lontani e quelli vecchi', () => {
    let buf = pushGripSample([], [1, 0, 0], 0);
    buf = pushGripSample(buf, upright, 100);
    buf = pushGripSample(buf, upright, 200);
    expect(captureGrip(buf, 200).up[1]).toBeCloseTo(1, 6);
    expect(pushGripSample(buf, upright, 2000)).toHaveLength(1);
    expect(captureGrip([], 5).up).toEqual([0, 1, 0]);
  });

  test('telefono sdraiato', () => {
    expect(isFlatGrip([0, 0, 1])).toBe(true);
    expect(isFlatGrip([0, 0, -1])).toBe(true);
    expect(isFlatGrip(upright)).toBe(false);
  });
});

describe('puntatore', () => {
  test('girarsi a destra lo sposta a destra, mirare in alto lo sposta in su', () => {
    const p = createPointer();
    const q: Quaternion = qFromRotationVector([Math.PI / 2, 0, 0]); // in verticale, dorso verso lo schermo
    // rotazione attorno alla verticale del mondo verso destra (negativa attorno a +Z mondo)
    const wRight = qRotate(qConj(q), [0, 0, -0.5]);
    expect(aimRates(wRight, q).yaw).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 30; i++) p.update({ yaw: 0.5, pitch: 0.3 }, 1 / 60);
    expect(p.position.x).toBeGreaterThan(0.6);
    expect(p.position.y).toBeLessThan(0.45);
    expect(p.update({ yaw: 5, pitch: 0 }, 1)).toEqual(p.position); // buco dei sensori: niente
    p.recenter();
    expect(p.position).toEqual({ x: 0.5, y: 0.5 });
  });

  test('il tremolio non lo muove', () => {
    const p = createPointer();
    for (let i = 0; i < 600; i++) p.update({ yaw: (i % 2 ? 1 : -1) * DEG2RAD, pitch: 0 }, 1 / 60);
    expect(Math.abs(p.position.x - 0.5)).toBeLessThan(0.01);
  });
});

describe('colpi a raffica', () => {
  function swingAt(t0: number, peakDeg: number, ms = 200, acc = 20): BurstSample[] {
    const out: BurstSample[] = [];
    for (let t = 0; t <= ms; t += 16) {
      const w = peakDeg * DEG2RAD * Math.sin((Math.PI * t) / ms);
      out.push({ t: t0 + t, gyro: [0, w, 0], acc: [acc, 0, 0] });
    }
    return out;
  }
  const quiet = (t0: number, ms: number): BurstSample[] =>
    Array.from({ length: Math.floor(ms / 16) }, (_, i) => ({ t: t0 + i * 16, gyro: [0, 0, 0], acc: [0, 0, 0] }));

  test('uno swing forte è un colpo solo, con potenza relativa al giocatore', () => {
    const d = createBurstDetector();
    const events = [...quiet(0, 200), ...swingAt(200, 900), ...quiet(420, 400)].map((s) => d.update(s)).filter(Boolean);
    expect(events).toHaveLength(1);
    expect(events[0]!.strength).toBeGreaterThan(0.9);
    d.setPowerScale({ softRate: 300 * DEG2RAD, hardRate: 600 * DEG2RAD });
    expect(burstPower(900 * DEG2RAD, DEFAULT_POWER_SCALE)).toBeLessThan(burstPower(900 * DEG2RAD, { softRate: 0, hardRate: 900 * DEG2RAD }));
  });

  test('girare il polso sul posto (senza accelerazione) non è un colpo', () => {
    const d = createBurstDetector();
    expect([...swingAt(0, 900, 200, 2), ...quiet(220, 300)].map((s) => d.update(s)).filter(Boolean)).toHaveLength(0);
  });

  test('un colpo più forte subito dopo sostituisce il precedente', () => {
    const d = createBurstDetector();
    const events = [...swingAt(0, 500, 150), ...quiet(160, 60), ...swingAt(220, 1000, 200), ...quiet(430, 300)]
      .map((s) => d.update(s)).filter(Boolean);
    expect(events).toHaveLength(2);
    expect(events[1]!.replacesPrevious).toBe(true);
    d.reset();
  });
});

describe('tracce', () => {
  const ev = { timeStamp: 0, accelerationIncludingGravity: { x: 0.1234, y: 9.8, z: 0 }, acceleration: null, rotationRate: { alpha: 1, beta: null, gamma: 3 } };

  test('riga e ritorno', () => {
    const row = traceRow(ev, 5)!;
    expect(row).toEqual([5, 0.123, 9.8, 0, 0, 0, 0, 1, 0, 3]);
    expect(traceEvent(row).rotationRate).toEqual({ alpha: 1, beta: 0, gamma: 3 });
    expect(traceRow({ timeStamp: 0 }, 0)).toBeNull();
  });

  test('il registratore parte da t = 0 e si ferma al limite', () => {
    const rec = createTraceRecorder('test', 2);
    rec.add(ev, 1000);
    rec.add(ev, 1016);
    rec.add(ev, 1032);
    const trace = rec.finish('prova');
    expect(rec.count).toBe(2);
    expect(trace.samples.map((r) => r[0])).toEqual([0, 16]);
    expect(trace).toMatchObject({ source: 'test', note: 'prova', synthetic: false });
  });
});
