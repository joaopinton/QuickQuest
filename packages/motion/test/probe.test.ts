import { describe, expect, test } from 'vitest';
import { evaluateProbe } from '../src/probe';
import { COL, normalizeReportedInterval, rawFromEvent } from '../src/raw';
import { simulateHandheld } from '../src/sim';
import { detectPlatform } from '../src/sensors';
import { G, median, percentile } from '../src/stats';

const status = (r: ReturnType<typeof evaluateProbe>, id: string) => r.checks.find((c) => c.id === id)?.status;

describe('sonda sensori (docs/04 § 2)', () => {
  test('un telefono a 60 Hz con giroscopio passa', () => {
    const r = evaluateProbe(simulateHandheld());
    expect(r.pass).toBe(true);
    expect(Math.round(r.timing.hzMeasured)).toBe(60);
  });

  test('senza giroscopio non passa', () => {
    const r = evaluateProbe(simulateHandheld({ hasGyro: false }));
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'gyro')).toMatchObject({ status: 'fail', problem: 'missing' });
  });

  test('giroscopio bloccato (sempre zero) non passa', () => {
    const frozen = simulateHandheld().map((s) => s.map((v, i) => (i >= COL.ra ? 0 : v)));
    expect(evaluateProbe(frozen).checks.find((c) => c.id === 'gyro')).toMatchObject({ status: 'fail', problem: 'frozen' });
  });

  test('25 Hz: troppo lento', () => {
    expect(status(evaluateProbe(simulateHandheld({ hz: 25 })), 'frequency')).toBe('fail');
  });

  test('40 Hz: accettato con avviso', () => {
    const r = evaluateProbe(simulateHandheld({ hz: 40 }));
    expect(status(r, 'frequency')).toBe('warn');
    expect(r.pass).toBe(true);
  });

  test('15 Hz: troppo pochi eventi', () => {
    expect(evaluateProbe(simulateHandheld({ hz: 15 })).checks[0]).toMatchObject({ id: 'events', status: 'fail', problem: 'too-few' });
  });

  test('accelerazione in g invece che in m/s²', () => {
    expect(evaluateProbe(simulateHandheld({ accelScale: 1 / G })).checks.find((c) => c.id === 'accel')?.problem).toBe('bad-gravity');
  });

  test('nessun campione', () => {
    const r = evaluateProbe([]);
    expect(r.pass).toBe(false);
    expect(r.checks.find((c) => c.id === 'accel')?.problem).toBe('missing');
  });
});

describe('utilità', () => {
  test('rawFromEvent e interval in secondi', () => {
    const raw = rawFromEvent({ timeStamp: 5, interval: 0.016, rotationRate: null, accelerationIncludingGravity: { x: 1, y: 2, z: 3 } });
    expect(raw[COL.ra]).toBeNull();
    expect(raw[COL.az]).toBe(3);
    expect(normalizeReportedInterval([0.016, 0.017, 0.016])).toEqual({ medianMs: 16, unit: 's' });
    expect(normalizeReportedInterval([]).unit).toBe('assente');
  });

  test('statistiche', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(percentile([0, 10], 25)).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  test('detectPlatform', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('altro');
  });
});
