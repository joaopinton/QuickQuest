import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COL, W3C_MAPPING, analyzeStaticPoses, applyMapping, describeMapping, fitGyroMapping,
  normalizeReportedInterval, rawFromEvent, sameMapping,
} from '../src/mapping.js';
import { DEG2RAD, G, qFromTo } from '../src/math.js';
import { simulate, slowDanceOmega } from './synth.mjs';

test('rawFromEvent tollera campi mancanti', () => {
  const raw = rawFromEvent({ timeStamp: 5, interval: 16, accelerationIncludingGravity: { x: 0, y: 1, z: 9.8 }, rotationRate: null });
  assert.equal(raw[COL.t], 5);
  assert.equal(raw[COL.ra], null);
  assert.equal(raw[COL.lx], null);
  assert.equal(raw[COL.az], 9.8);
});

test('normalizeReportedInterval riconosce gli intervalli in secondi', () => {
  assert.deepEqual(normalizeReportedInterval([0.016, 0.016, 0.017]), { medianMs: 16, unit: 's' });
  assert.equal(normalizeReportedInterval([16, 17]).unit, 'ms');
  assert.equal(normalizeReportedInterval([null, null]).unit, 'assente');
});

test('applyMapping W3C converte °/s in rad/s con x = beta, y = gamma, z = alpha', () => {
  const p = applyMapping([0, 16, null, null, null, 0, 0, G, 30, 10, 20], W3C_MAPPING);
  assert.deepEqual(p.gyro, [10 * DEG2RAD, 20 * DEG2RAD, 30 * DEG2RAD]);
  assert.equal(p.lin, null);
});

const still = (q0) => simulate({ durationMs: 1000, q0 });

test('analyzeStaticPoses: un browser conforme dà segni tutti positivi', () => {
  const res = analyzeStaticPoses({
    flat: still([1, 0, 0, 0]),
    portrait: still(qFromTo([0, 1, 0], [0, 0, 1])),
    landscape: still(qFromTo([1, 0, 0], [0, 0, 1])),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(res.accSign, [1, 1, 1]);
});

test('analyzeStaticPoses rileva un accelerometro con segni invertiti', () => {
  const flip = (r) => r.map((v, i) => (i >= COL.ax && i <= COL.az ? -v : v));
  const res = analyzeStaticPoses({
    flat: still([1, 0, 0, 0]).map(flip),
    portrait: still(qFromTo([0, 1, 0], [0, 0, 1])).map(flip),
    landscape: still(qFromTo([1, 0, 0], [0, 0, 1])).map(flip),
  });
  assert.deepEqual(res.accSign, [-1, -1, -1]);
});

test('analyzeStaticPoses segnala una posa sbagliata', () => {
  const res = analyzeStaticPoses({ flat: still([1, 0, 0, 0]), portrait: still([1, 0, 0, 0]), landscape: [] });
  assert.equal(res.ok, false);
});

test('fitGyroMapping ritrova il mapping W3C dalla danza lenta', () => {
  const fit = fitGyroMapping(simulate({ durationMs: 10000, omega: slowDanceOmega }));
  assert.equal(fit.ok, true, JSON.stringify(fit));
  assert.equal(fit.matchesW3C, true);
  assert.ok(fit.best.errDeg < 2);
});

test('fitGyroMapping ritrova un mapping non standard (rad/s, beta invertito)', () => {
  const odd = (r) => {
    const out = [...r];
    out[COL.ra] = r[COL.ra] * DEG2RAD;
    out[COL.rb] = -r[COL.rb] * DEG2RAD;
    out[COL.rg] = r[COL.rg] * DEG2RAD;
    return out;
  };
  const fit = fitGyroMapping(simulate({ durationMs: 10000, omega: slowDanceOmega, transform: odd }));
  assert.equal(fit.ok, true);
  const expected = { gyroPerm: [1, 2, 0], gyroSign: [-1, 1, 1], gyroScale: 1, accSign: [1, 1, 1] };
  assert.ok(sameMapping(fit.best.mapping, expected), describeMapping(fit.best.mapping));
});

test('fitGyroMapping rifiuta una traccia senza movimento', () => {
  const fit = fitGyroMapping(simulate({ durationMs: 5000 }));
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /finestre/);
});
