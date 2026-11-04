#!/usr/bin/env node
// Analisi delle sessioni S1 scaricate dai telefoni. Stampa un report in Markdown.
//
//   node analyze.mjs sessione1.json [sessione2.json …] [--split <cartella>] [--out report.md]
//
// --split scrive ogni traccia di swing come fixture in <cartella>/<piattaforma>/<tipo>-<dispositivo>-<id>.json.gz

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createAhrs, createComplementary, evaluateReturn } from './src/filters.js';
import { applyMapping, describeMapping, isComplete } from './src/mapping.js';
import { mean } from './src/math.js';
import { activeMapping, isSession } from './src/session.js';
import { LABELS, sessionCriteria, swingMetrics } from './src/swing.js';

const require = createRequire(import.meta.url);
const ICON = { pass: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️', pending: '⏳' };
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function parseArgs(argv) {
  const files = [];
  let split = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--split') split = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else files.push(argv[i]);
  }
  return { files, split, out };
}

function filterFactories() {
  const list = [
    () => createComplementary({ kp: 0.5 }),
    () => createComplementary({ kp: 1 }),
    () => createComplementary({ kp: 2 }),
  ];
  let AHRS = null;
  try {
    AHRS = require('ahrs');
  } catch {
    return { list, note: 'Pacchetto `ahrs` non installato (`npm install`): confronto solo sul filtro complementare.' };
  }
  for (const beta of [0.033, 0.1, 0.3]) list.push(() => createAhrs(AHRS, { algorithm: 'Madgwick', beta }));
  list.push(() => createAhrs(AHRS, { algorithm: 'Mahony', kp: 0.5 }));
  return { list, note: null };
}

function reportProbe(s, lines) {
  if (!s.probe) {
    lines.push('Sonda: non eseguita.', '');
    return;
  }
  const t = s.probe.timing;
  lines.push(`**Sonda:** ${s.probe.pass ? 'compatibile' : 'NON compatibile'} · ${t.count} eventi · intervallo mediano ${fmt(t.medianDtMs)} ms (p95 ${fmt(t.p95DtMs)} ms) · `
    + `interval riportato ${fmt(t.reportedIntervalMs)} ms (unità ${t.reportedIntervalUnit})`, '');
  for (const c of s.probe.checks) lines.push(`- ${ICON[c.status]} ${c.label}: ${c.value} — ${c.detail ?? ''}`);
  lines.push('');
}

function reportAxes(s, lines) {
  if (!s.axes) {
    lines.push('**Assi:** test non eseguito, si usa il mapping W3C.', '');
    return;
  }
  const { fit, static: st } = s.axes;
  lines.push(`**Assi:** pose statiche ${st.ok ? 'ok' : 'da rifare'}; segni accelerometro ${st.accSign.join(' ')}`);
  if (fit.best) {
    lines.push(`- mapping: ${describeMapping(fit.best.mapping)}`);
    lines.push(`- errore ${fmt(fit.best.errDeg)}° (secondo candidato ${fmt(fit.second.errDeg)}°, separazione ×${fmt(fit.separation)}) su ${fit.windows} finestre`);
    lines.push(`- ${fit.matchesW3C ? 'coincide' : '**NON coincide**'} con la specifica W3C`);
  } else {
    lines.push(`- danza lenta: ${fit.reason}`);
  }
  if (st.gyroNoiseRaw) lines.push(`- giroscopio da fermo (α, β, γ, unità grezze): media ${st.gyroNoiseRaw.map((n) => fmt(n.mean, 3)).join(', ')} · σ ${st.gyroNoiseRaw.map((n) => fmt(n.std, 3)).join(', ')}`);
  lines.push('');
}

function reportSwings(s, traces, lines) {
  const swings = traces.filter((t) => t.label !== 'ritorno');
  if (!swings.length) return;
  lines.push('| # | tipo | valido | picco ω_s | ω_s rilascio | v (km/h) | polso (°) | rilascio dopo picco (ms) | durata (ms) | sat. |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const t of swings) {
    const m = t.metrics;
    if (!m.ok) {
      lines.push(`| ${t.id} | ${t.label} | ${m.reason} |||||||`);
      continue;
    }
    lines.push(`| ${t.id} | ${t.label} | ${m.swingValid ? 'sì' : 'no'} | ${fmt(m.peakForward)} | ${fmt(m.omegaSRelease)} | ${fmt(m.vEst * 3.6, 0)} | ${fmt(m.wristRollDeg, 0)} | ${fmt(m.releaseAfterPeakMs, 0)} | ${fmt(m.durationMs, 0)} | ${m.gyroSaturated ? '⚠️' : ''} |`);
  }
  lines.push('');
}

function reportFilters(s, traces, factories, lines) {
  const returns = traces.filter((t) => t.label === 'ritorno');
  if (!returns.length) return;
  const mapping = activeMapping(s);
  lines.push('**Giro e ritorno** (errore appena il telefono è di nuovo fermo, media sulle prove):', '');
  lines.push('| filtro | tilt (°) | yaw (°) | µs per campione |', '|---|---|---|---|');
  for (const make of factories) {
    const results = returns
      .map((t) => evaluateReturn(t.samples.filter(isComplete).map((r) => applyMapping(r, mapping)), make()))
      .filter((r) => r.ok);
    if (!results.length) continue;
    lines.push(`| ${results[0].filter} | ${fmt(mean(results.map((r) => r.atStop.tiltDeg)))} | ${fmt(mean(results.map((r) => r.atStop.yawDeg)))} | ${fmt(mean(results.map((r) => r.usPerUpdate)))} |`);
  }
  lines.push('');
}

const SAFE_PLATFORMS = new Set(['ios', 'android', 'altro']);
const SAFE_LABELS = new Set(LABELS.map((l) => l.id));

async function writeFixtures(s, traces, dir) {
  // Il JSON arriva da un telefono: nei percorsi solo valori noti.
  const platform = SAFE_PLATFORMS.has(s.device.platform) ? s.device.platform : 'altro';
  const slug = (s.device.name || 'telefono').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  const target = path.join(dir, platform);
  await mkdir(target, { recursive: true });
  let n = 0;
  for (const t of traces.filter((x) => SAFE_LABELS.has(x.label) && Number.isInteger(x.id))) {
    const fixture = {
      format: 'quickquest.trace', version: 1, game: 'bowling',
      device: s.device, mapping: activeMapping(s), columns: s.columns,
      label: t.label, note: t.note, createdAt: t.createdAt,
      samples: t.samples, buttons: t.buttons, metrics: t.metrics,
    };
    await writeFile(path.join(target, `${t.label}-${slug}-${t.id}.json.gz`), gzipSync(JSON.stringify(fixture)));
    n++;
  }
  return n;
}

async function main() {
  const { files, split, out } = parseArgs(process.argv.slice(2));
  if (!files.length) {
    process.stderr.write('Uso: node analyze.mjs <sessione.json> [...] [--split <cartella>] [--out report.md]\n');
    process.exit(1);
  }
  const { list: factories, note } = filterFactories();
  const lines = ['# Spike S1 — report', ''];
  if (note) lines.push(`> ${note}`, '');
  for (const file of files) {
    let s;
    try {
      s = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      process.stderr.write(`${file}: impossibile leggere il JSON (${err instanceof Error ? err.message : err})\n`);
      process.exitCode = 1;
      continue;
    }
    if (!isSession(s)) {
      process.stderr.write(`${file}: non è una sessione S1\n`);
      process.exitCode = 1;
      continue;
    }
    // Metriche ricalcolate qui, con il codice attuale e il mapping della sessione.
    const traces = s.traces.map((t) => (t.label === 'ritorno' ? t : { ...t, metrics: swingMetrics(t, activeMapping(s)) }));
    const crit = sessionCriteria({ ...s, traces });
    lines.push(`## ${s.device.name || 'telefono senza nome'} (${s.device.platform})`, '', `\`${s.device.ua}\``, '');
    reportProbe(s, lines);
    reportAxes(s, lines);
    lines.push(`**Verdetto: ${crit.verdict.toUpperCase()}**`, '');
    for (const c of crit.criteria) lines.push(`- ${ICON[c.status]} ${c.label} — ${c.detail ?? ''}`);
    lines.push('');
    reportSwings(s, traces, lines);
    reportFilters(s, traces, factories, lines);
    if (split) lines.push(`Fixture scritte: ${await writeFixtures(s, traces, split)} in \`${path.join(split, s.device.platform)}\``, '');
  }
  const text = lines.join('\n');
  if (out) await writeFile(out, text);
  process.stdout.write(`${text}\n`);
}

main();
