import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median, percentile, principalAxis, qFromRotationVector, qFromTo, qRotate, swingTwistAngles, qMul,
} from '../src/math.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('percentile interpola linearmente e median è il 50°', () => {
  assert.equal(median([3, 1, 2]), 2);
  close(percentile([0, 10], 25), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test('principalAxis trova l’asse dominante di una matrice simmetrica', () => {
  const v = principalAxis([[1, 0, 0], [0, 9, 0], [0, 0, 2]]);
  close(Math.abs(v[1]), 1);
});

test('qFromTo porta a su b, anche a 180°', () => {
  for (const [a, b] of [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0, 0, -1]], [[0, 1, 0], [0, 1, 0]]]) {
    const r = qRotate(qFromTo(a, b), a);
    b.forEach((c, i) => close(r[i], c, 1e-9));
  }
});

test('swingTwistAngles separa la rotazione attorno all’asse dal resto', () => {
  const yaw = qFromRotationVector([0, 0, 0.5]);
  const tilt = qFromRotationVector([0.2, 0, 0]);
  const { twist, swing } = swingTwistAngles(qMul(tilt, yaw), [0, 0, 1]);
  close(twist, 0.5, 1e-9);
  close(swing, 0.2, 1e-9);
});
