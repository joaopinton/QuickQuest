import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COL } from '../src/mapping.js';
import { evaluateProbe } from '../src/probe.js';
import { simulate } from './synth.mjs';

const wobble = (t) => [0.3 * Math.sin(t / 80), 0.2 * Math.cos(t / 60), 0.1];
const status = (res, id) => res.checks.find((c) => c.id === id).status;

test('un telefono a 60 Hz con giroscopio passa la sonda', () => {
  const res = evaluateProbe(simulate({ durationMs: 1500, omega: wobble }));
  assert.equal(res.pass, true);
  assert.equal(status(res, 'frequency'), 'pass');
  assert.ok(Math.abs(res.timing.hzMeasured - 60) < 1);
});

test('rotationRate nullo fa fallire la sonda', () => {
  const noGyro = (r) => r.map((v, i) => (i >= COL.ra ? null : v));
  const res = evaluateProbe(simulate({ durationMs: 1500, omega: wobble, transform: noGyro }));
  assert.equal(res.pass, false);
  assert.equal(status(res, 'gyro'), 'fail');
});

test('rotationRate costante (giroscopio finto) fa fallire la sonda', () => {
  const frozen = (r) => r.map((v, i) => (i >= COL.ra ? 0 : v));
  const res = evaluateProbe(simulate({ durationMs: 1500, omega: wobble, transform: frozen }));
  assert.equal(status(res, 'gyro'), 'fail');
});

test('25 Hz: frequenza troppo bassa', () => {
  const res = evaluateProbe(simulate({ hz: 25, durationMs: 1500, omega: wobble }));
  assert.equal(status(res, 'frequency'), 'fail');
  assert.equal(res.pass, false);
});

test('15 Hz: anche gli eventi sono troppo pochi', () => {
  const res = evaluateProbe(simulate({ hz: 15, durationMs: 1500, omega: wobble }));
  assert.equal(status(res, 'events'), 'fail');
});

test('40 Hz: accettato con avviso', () => {
  const res = evaluateProbe(simulate({ hz: 40, durationMs: 1500, omega: wobble }));
  assert.equal(status(res, 'frequency'), 'warn');
  assert.equal(res.pass, true);
});

test('accelerometro in unità sbagliate (g invece di m/s²) fallisce', () => {
  const inG = (r) => r.map((v, i) => (i >= COL.ax && i <= COL.az ? v / 9.8 : v));
  const res = evaluateProbe(simulate({ durationMs: 1500, omega: wobble, transform: inG }));
  assert.equal(status(res, 'accel'), 'fail');
});
