import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W3C_MAPPING } from '../src/mapping.js';
import {
  activeMapping, addTrace, createSession, detectPlatform, fileName, isSession, load, nextTraceId,
  removeTrace, save,
} from '../src/session.js';
import { resolveRequest } from '../serve.mjs';

const device = { name: 'Pixel 7 di Ånna', ua: 'Mozilla/5.0 (Linux; Android 14)', screen: { w: 412, h: 915, dpr: 2.6 } };
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('detectPlatform', () => {
  assert.equal(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(detectPlatform(device.ua), 'android');
  assert.equal(detectPlatform('Mozilla/5.0 (Windows NT 10.0)'), 'altro');
});

test('le operazioni sulla sessione non mutano l’originale', () => {
  const s0 = createSession(device, '2026-11-04T10:20:00.000Z');
  const s1 = addTrace(s0, { id: 1, label: 'piano' });
  const s2 = removeTrace(s1, 1);
  assert.equal(s0.traces.length, 0);
  assert.equal(s1.traces.length, 1);
  assert.equal(s2.traces.length, 0);
  assert.equal(nextTraceId(addTrace(s1, { id: 7, label: 'forte' })), 8);
});

test('fileName è sicuro e leggibile', () => {
  const s = createSession(device, '2026-11-04T10:20:00.000Z');
  assert.equal(fileName(s), 's1-android-pixel-7-di-anna-2026-11-04-10-20.json');
});

test('activeMapping usa W3C finché il test assi non è affidabile', () => {
  const s = createSession(device, '2026-11-04T10:20:00.000Z');
  assert.deepEqual(activeMapping(s), W3C_MAPPING);
  const custom = { ...W3C_MAPPING, gyroScale: 1 };
  assert.equal(activeMapping({ ...s, axes: { static: { ok: true, accSign: [1, 1, 1] }, fit: { ok: true, best: { mapping: custom } } } }), custom);
});

test('save/load fanno il giro completo e rifiutano dati estranei', () => {
  const st = memoryStorage();
  const s = createSession(device, '2026-11-04T10:20:00.000Z');
  assert.deepEqual(save(st, s), { ok: true });
  assert.deepEqual(load(st), s);
  st.setItem('lq-s1-session', '{"format":"altro"}');
  assert.equal(load(st), null);
  st.setItem('lq-s1-session', '{rotto');
  assert.equal(load(st), null);
  assert.equal(isSession(null), false);
});

test('save segnala lo spazio esaurito', () => {
  const full = { setItem: () => { throw new Error('QuotaExceededError'); } };
  const res = save(full, createSession(device, '2026-11-04T10:20:00.000Z'));
  assert.equal(res.ok, false);
  assert.match(res.error, /Quota/);
});

test('il server serve solo i file della pagina', () => {
  assert.equal(resolveRequest('/'), 'index.html');
  assert.equal(resolveRequest('/src/main.js?v=2'), 'src/main.js');
  assert.equal(resolveRequest('/style.css'), 'style.css');
  for (const bad of ['/package.json', '/node_modules/ahrs/index.js', '/src/../package.json', '/%2e%2e/secret', '/test/synth.mjs', '/src/%2e%2e%2fserve.mjs', '/%E0%A4%A']) {
    assert.equal(resolveRequest(bad), null, bad);
  }
});
