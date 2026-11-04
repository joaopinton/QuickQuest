import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W3C_MAPPING } from '../src/mapping.js';
import { pressWindow, sessionCriteria, swingMetrics } from '../src/swing.js';
import { bowlingSwing, cancelTrace } from './synth.mjs';

test('pressWindow prende l’ultimo giù → su', () => {
  const w = pressWindow([{ t: 1, down: true }, { t: 2, down: false }, { t: 5, down: true }, { t: 9, down: false }]);
  assert.deepEqual(w, { tDown: 5, tUp: 9 });
  assert.equal(pressWindow([{ t: 1, down: true }]), null);
});

test('swing valido: asse X, picco e velocità stimata', () => {
  const m = swingMetrics(bowlingSwing({ amp: 10 }), W3C_MAPPING);
  assert.equal(m.ok, true);
  assert.equal(m.swingValid, true);
  assert.ok(Math.abs(Math.abs(m.axis[0]) - 1) < 0.01, `asse ${m.axis}`);
  assert.ok(Math.abs(m.peakForward - 10) < 0.3);
  assert.ok(m.peakBack < -5);
  assert.ok(Math.abs(m.vEst - 10 * 0.65) < 0.3);
  assert.ok(Math.abs(m.wristRoll) < 0.05);
});

test('la rotazione del polso ha il segno della rotazione attorno all’avambraccio', () => {
  const left = swingMetrics(bowlingSwing({ roll: 6 }), W3C_MAPPING);
  const right = swingMetrics(bowlingSwing({ roll: -6 }), W3C_MAPPING);
  assert.ok(left.wristRoll > 0.5);
  assert.ok(right.wristRoll < -0.5);
});

test('la presa non conta: swing attorno a un asse diverso viene trovato lo stesso', () => {
  // Swing attorno a Z (telefono tenuto di taglio), rotazione del polso ancora lungo Y.
  const tr = bowlingSwing({ amp: 9 });
  const rotated = { ...tr, samples: tr.samples.map((r) => [...r.slice(0, 8), r[9], r[8], r[10]]) };
  const m = swingMetrics(rotated, W3C_MAPPING);
  assert.ok(Math.abs(Math.abs(m.axis[2]) - 1) < 0.01);
  assert.equal(m.swingValid, true);
});

test('buco di campioni prima del rilascio: metriche ancora finite e con il segno giusto', () => {
  const tr = bowlingSwing({ amp: 9 });
  const tUp = tr.buttons[1].t;
  const sparse = { ...tr, samples: tr.samples.filter((r) => r[0] < tUp - 60 || r[0] > tUp) };
  const m = swingMetrics(sparse, W3C_MAPPING);
  assert.ok(Number.isFinite(m.vEst) && m.vEst > 0, JSON.stringify(m));
  assert.equal(m.swingValid, true);
});

test('annullo: nessuno swing valido', () => {
  const m = swingMetrics(cancelTrace(), W3C_MAPPING);
  assert.equal(m.ok, true);
  assert.equal(m.swingValid, false);
});

test('sessionCriteria: go con dati buoni, pending se mancano tracce', () => {
  const tr = (label, opts) => ({ label, metrics: swingMetrics(bowlingSwing(opts), W3C_MAPPING) });
  const traces = [
    ...[5, 5.5, 6].map((amp) => tr('piano', { amp })),
    ...[10, 11, 12].map((amp) => tr('forte', { amp })),
    ...[5, 6, 7].map((roll) => tr('hook-sx', { roll })),
    ...[5, 6, 7].map((roll) => tr('hook-dx', { roll: -roll })),
    { label: 'annullo', metrics: swingMetrics(cancelTrace(), W3C_MAPPING) },
  ];
  const probe = { timing: { medianDtMs: 16.7 } };
  const axes = { static: { ok: true }, fit: { ok: true, best: { errDeg: 1 }, separation: 10, matchesW3C: true } };
  const res = sessionCriteria({ probe, axes, traces });
  assert.equal(res.verdict, 'go', JSON.stringify(res.criteria, null, 1));
  assert.equal(res.criteria.find((c) => c.id === 'spin').hookLeftSign, 1);

  const partial = sessionCriteria({ probe, traces: traces.slice(0, 4) });
  assert.equal(partial.verdict, 'incompleto');
});

test('sessionCriteria: no-go se piano e forte non si distinguono', () => {
  const tr = (label, amp) => ({ label, metrics: swingMetrics(bowlingSwing({ amp }), W3C_MAPPING) });
  const res = sessionCriteria({ traces: [8, 8.2, 8.4].map((a) => tr('piano', a)).concat([8.5, 8.6, 8.8].map((a) => tr('forte', a))) });
  assert.equal(res.criteria.find((c) => c.id === 'speed').status, 'fail');
});
