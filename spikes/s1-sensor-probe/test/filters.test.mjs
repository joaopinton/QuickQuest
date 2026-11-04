import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createAhrs, createComplementary, evaluateReturn, orientationError } from '../src/filters.js';
import { W3C_MAPPING, applyMapping } from '../src/mapping.js';
import { G, angleBetween, qConj, qFromRotationVector, qRotate } from '../src/math.js';
import { simulate } from './synth.mjs';

const require = createRequire(import.meta.url);

test('il filtro complementare corregge un tilt iniziale sbagliato', () => {
  const f = createComplementary({ kp: 2 });
  f.update([0, 0, 0], [0, 0, G], 0.01); // inizializzato in piano
  const tilted = [0, G * Math.sin(0.5), G * Math.cos(0.5)];
  for (let i = 0; i < 500; i++) f.update([0, 0, 0], tilted, 0.01);
  const upPred = qRotate(qConj(f.q), [0, 0, 1]);
  assert.ok(angleBetween(upPred, tilted) < 0.01);
});

test('orientationError separa yaw e tilt', () => {
  const e = orientationError([1, 0, 0, 0], qFromRotationVector([0, 0, 0.3]));
  assert.ok(Math.abs(e.yaw - 0.3) < 1e-9);
  assert.ok(e.tilt < 1e-6);
});

// Giro e ritorno: fermo, poi rotazioni che si annullano (90° su X e ritorno, 60° su Z e ritorno), poi fermo.
function returnTrace() {
  const seg = (t, start, len, axis, angle) => {
    if (t < start || t >= start + len) return 0;
    return axis * angle * (Math.PI / len) * 0.5 * Math.sin((Math.PI * (t - start)) / len) * 1000;
  };
  const omega = (t) => [
    seg(t, 500, 800, 1, Math.PI / 2) + seg(t, 1300, 800, -1, Math.PI / 2),
    0,
    seg(t, 2100, 600, 1, Math.PI / 3) + seg(t, 2700, 600, -1, Math.PI / 3),
  ];
  return simulate({ durationMs: 4300, omega }).map((s) => applyMapping(s, W3C_MAPPING));
}

test('giro e ritorno: errore piccolo con il filtro complementare su dati perfetti', () => {
  const res = evaluateReturn(returnTrace(), createComplementary());
  assert.equal(res.ok, true, res.reason);
  assert.ok(res.atStop.tiltDeg < 1, JSON.stringify(res));
  assert.ok(res.atStop.yawDeg < 1, JSON.stringify(res));
});

test('giro e ritorno: anche Madgwick di ahrs resta preciso', () => {
  const AHRS = require('ahrs');
  const f = createAhrs(AHRS, { algorithm: 'Madgwick', beta: 0.05, sampleIntervalMs: 16.7 });
  const res = evaluateReturn(returnTrace(), f);
  assert.equal(res.ok, true, res.reason);
  assert.ok(res.atStop.tiltDeg < 2, JSON.stringify(res));
  assert.ok(res.atStop.yawDeg < 2, JSON.stringify(res));
});

test('evaluateReturn rifiuta una traccia senza quiete iniziale', () => {
  const pts = simulate({ durationMs: 1000, omega: () => [1, 0, 0] }).map((s) => applyMapping(s, W3C_MAPPING));
  assert.equal(evaluateReturn(pts, createComplementary()).ok, false);
});
