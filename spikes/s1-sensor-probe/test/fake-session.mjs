// Costruisce una sessione sintetica completa (per provare analyze.mjs senza telefono).
//   node test/fake-session.mjs > sessione-finta.json
import { analyzeStaticPoses, fitGyroMapping, W3C_MAPPING } from '../src/mapping.js';
import { qFromTo } from '../src/math.js';
import { evaluateProbe } from '../src/probe.js';
import { addTrace, createSession, withAxes, withProbe } from '../src/session.js';
import { swingMetrics } from '../src/swing.js';
import { bowlingSwing, cancelTrace, simulate, slowDanceOmega } from './synth.mjs';

let s = createSession({ name: 'Telefono finto', ua: 'Mozilla/5.0 (Linux; Android 14) test', screen: { w: 400, h: 900, dpr: 2 } }, '2026-11-04T12:00:00.000Z');
const probeSamples = simulate({ durationMs: 1500, omega: (t) => [0.3 * Math.sin(t / 80), 0.2, 0.1] });
s = withProbe(s, { ...evaluateProbe(probeSamples), samples: probeSamples });
const poses = {
  flat: simulate({ durationMs: 2000 }),
  portrait: simulate({ durationMs: 2000, q0: qFromTo([0, 1, 0], [0, 0, 1]) }),
  landscape: simulate({ durationMs: 2000, q0: qFromTo([1, 0, 0], [0, 0, 1]) }),
};
const st = analyzeStaticPoses(poses);
const dance = simulate({ durationMs: 12000, omega: slowDanceOmega });
s = withAxes(s, { static: st, fit: fitGyroMapping(dance, st.accSign), poses, dance });
let id = 0;
const add = (label, tr) => { s = addTrace(s, { id: ++id, label, note: '', createdAt: s.createdAt, ...tr, metrics: swingMetrics(tr, W3C_MAPPING) }); };
for (const amp of [5, 5.5, 6]) add('piano', bowlingSwing({ amp }));
for (const amp of [7.5, 8]) add('medio', bowlingSwing({ amp }));
for (const amp of [10, 11, 12]) add('forte', bowlingSwing({ amp }));
for (const roll of [5, 6, 7]) add('hook-sx', bowlingSwing({ roll }));
for (const roll of [5, 6, 7]) add('hook-dx', bowlingSwing({ roll: -roll }));
add('annullo', cancelTrace());
const seg = (t, start, len, angle) => (t < start || t >= start + len ? 0 : angle * (Math.PI / (2 * len)) * 1000 * Math.sin((Math.PI * (t - start)) / len));
const ret = simulate({ durationMs: 5000, omega: (t) => [seg(t, 800, 1000, 1.2) + seg(t, 1800, 1000, -1.2), 0, seg(t, 2800, 800, 0.9) + seg(t, 3600, 800, -0.9)] });
s = addTrace(s, { id: ++id, label: 'ritorno', note: '', createdAt: s.createdAt, samples: ret, buttons: [], metrics: { kind: 'return' } });
process.stdout.write(JSON.stringify(s));
