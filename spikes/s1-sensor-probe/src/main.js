// Pagina della sonda S1: collega sensori, UI e moduli di analisi.

import { createStripChart } from './chart.js';
import { createComplementary, evaluateReturn } from './filters.js';
import {
  COL, STATIC_POSES, analyzeStaticPoses, applyMapping, describeMapping, fitGyroMapping, isComplete,
  rawFromEvent,
} from './mapping.js';
import { G, median, norm } from './math.js';
import { PROBE_DURATION_MS, evaluateProbe } from './probe.js';
import {
  activeMapping, addTrace, createSession, fileName, load, nextTraceId, removeTrace, save, withAxes,
  withClock, withDeviceName, withProbe,
} from './session.js';
import { LABELS, sessionCriteria, swingMetrics } from './swing.js';

const $ = (id) => document.getElementById(id);

const PRE_ROLL_MS = 1500;
const POST_ROLL_MS = 500;
const RING_MS = 3000;
const SETTLE_MS = 3000;
const STATIC_MS = 2000;
const DANCE_MS = 12000;
const RETURN_MAX_MS = 60000;
const HOLD_MAX_MS = 10000;

// ---------- stato ----------
let session = null;
let selectedLabel = 'medio';
let holding = null;        // traccia di swing in registrazione
let returnRun = null;      // traccia "ritorno" in registrazione
let busy = false;          // test assi in corso
const ring = [];           // ultimi RING_MS di campioni grezzi
const collectors = new Set();
const clockOffsets = [];
let timestampSource = 'event.timeStamp';

/** Vero se nessuna registrazione o test è in corso. */
const isIdle = () => !holding && !returnRun && !busy;

// ---------- sensori ----------

/** Ora nel clock dei sensori (event.timeStamp), stimata da performance.now(). */
function sensorNow() {
  const off = clockOffsets.length ? median(clockOffsets) : 0;
  return performance.now() - off;
}

function onMotion(e) {
  const raw = rawFromEvent(e);
  if (!raw[COL.t]) {
    raw[COL.t] = performance.now();
    timestampSource = 'performance.now (timeStamp assente)';
  }
  clockOffsets.push(performance.now() - raw[COL.t]);
  if (clockOffsets.length > 60) clockOffsets.shift();
  ring.push(raw);
  while (ring.length && ring[0][COL.t] < raw[COL.t] - RING_MS) ring.shift();
  for (const fn of collectors) fn(raw);
  if (isComplete(raw) && session) {
    const p = applyMapping(raw, activeMapping(session));
    charts.gyro.push(p.t, p.gyro);
    charts.acc.push(p.t, [norm(p.accG)]);
  }
}

/** Raccoglie i nuovi campioni per `ms` millisecondi. */
function collect(ms, onProgress = () => {}) {
  return new Promise((resolve) => {
    const out = [];
    const fn = (raw) => out.push(raw);
    collectors.add(fn);
    const start = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      onProgress(p);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => {
      collectors.delete(fn);
      onProgress(1);
      resolve(out);
    }, ms);
  });
}

async function requestPermissions() {
  if (typeof DeviceMotionEvent === 'undefined') throw new Error('Questo browser non espone i sensori di movimento.');
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const res = await DeviceMotionEvent.requestPermission();
    if (res !== 'granted') {
      throw new Error('Permesso negato. Su iPhone: chiudi la scheda, riaprila e tocca "Consenti", oppure Impostazioni → Safari → Movimento e orientamento.');
    }
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    await DeviceOrientationEvent.requestPermission().catch(() => 'ignored'); // facoltativo: non usiamo deviceorientation
  }
}

let wakeLock = null;
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null; // non disponibile: lo schermo può spegnersi, la misura funziona lo stesso
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock?.released !== false) keepAwake();
});

// ---------- grafici ----------
const charts = {
  gyro: createStripChart($('chart-gyro'), { colors: ['#ef4e5b', '#34c27a', '#3c8cf0'] }),
  acc: createStripChart($('chart-acc'), { colors: ['#8e5bff'], min: 0, max: 40, guides: [G] }),
};

function frame() {
  const now = sensorNow();
  charts.gyro.draw(now);
  charts.acc.draw(now);
  const recent = ring.filter((s) => s[COL.t] >= ring[ring.length - 1][COL.t] - 1000).length;
  $('hz').textContent = ring.length ? `${recent} Hz` : '— Hz';
  requestAnimationFrame(frame);
}

// ---------- persistenza ----------
function commit(next) {
  session = next;
  const res = save(localStorage, session);
  $('storage-warning').hidden = res.ok;
}

function computeMetrics(trace, s = session) {
  if (trace.label === 'ritorno') {
    const pts = trace.samples.filter(isComplete).map((r) => applyMapping(r, activeMapping(s)));
    return { kind: 'return', ...evaluateReturn(pts, createComplementary()) };
  }
  return swingMetrics(trace, activeMapping(s));
}

// ---------- rendering ----------
const BADGE = { pass: '✓', warn: '!', fail: '✕', info: 'i', pending: '…' };
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

function renderChecks(ul, checks) {
  ul.replaceChildren(...checks.map((c) => el('li', { className: `check s-${c.status}` }, [
    el('span', { className: 'badge', textContent: BADGE[c.status] ?? '?' }),
    el('span', { className: 'title' }, [c.label, c.value ? el('span', { textContent: ` · ${c.value}` }) : '']),
    el('span', { className: 'detail', textContent: c.detail ?? '' }),
  ])));
}

function renderDl(container, rows, headline) {
  const dl = el('dl');
  for (const [k, v] of rows) dl.append(el('dt', { textContent: k }), el('dd', { textContent: v }));
  container.replaceChildren(...(headline ? [el('div', { className: 'big', textContent: headline })] : []), dl);
  container.hidden = false;
}

function renderProbe() {
  const { probe } = session;
  if (!probe) return;
  $('probe-verdict').textContent = probe.pass ? 'Telefono compatibile ✓' : 'Telefono NON compatibile';
  renderChecks($('probe-checks'), probe.checks);
}

function renderAxes() {
  const steps = [...STATIC_POSES.map((p) => p.label), 'Danza lenta (12 s)'];
  $('axes-steps').replaceChildren(...steps.map((s, i) => {
    const li = el('li', { textContent: s });
    li.dataset.step = String(i); // dataset è in sola lettura: non si può passare a Object.assign
    return li;
  }));
  const { axes } = session;
  if (!axes) return;
  const rows = [['Pose statiche', axes.static.ok ? 'ok' : 'da ripetere']];
  if (axes.fit.best) {
    rows.push(
      ['Mapping', describeMapping(axes.fit.best.mapping)],
      ['Errore medio', `${fmt(axes.fit.best.errDeg)}° (secondo: ${fmt(axes.fit.second.errDeg)}°)`],
      ['Finestre usate', String(axes.fit.windows)],
      ['Specifica W3C', axes.fit.matchesW3C ? 'rispettata' : 'NON rispettata'],
    );
  } else {
    rows.push(['Danza lenta', axes.fit.reason]);
  }
  if (axes.static.gyroNoiseRaw) {
    rows.push(['Rumore giroscopio da fermo (α, β, γ)', axes.static.gyroNoiseRaw.map((n) => fmt(n.std, 3)).join(', ')]);
  }
  renderDl($('axes-result'), rows, axes.fit.ok && axes.static.ok ? 'Assi determinati ✓' : 'Assi da rifare');
}

function renderLabels() {
  $('labels').replaceChildren(...LABELS.map((l) => {
    const chip = el('button', { type: 'button', className: 'chip', textContent: l.text });
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(l.id === selectedLabel));
    chip.addEventListener('click', () => {
      selectedLabel = l.id;
      renderLabels();
    });
    return chip;
  }));
}

function renderCounts() {
  const counts = {};
  for (const t of session.traces) counts[t.label] = (counts[t.label] ?? 0) + 1;
  $('swing-counts').textContent = `Tracce: ${LABELS.map((l) => `${l.id} ${counts[l.id] ?? 0}`).join(' · ')}`;
}

function renderSwingResult(m) {
  if (!m.ok) {
    renderDl($('swing-result'), [['Problema', m.reason]], 'Traccia non valida');
    return;
  }
  renderDl($('swing-result'), [
    ['Swing riconosciuto', m.swingValid ? 'sì' : 'no'],
    ['Picco ω_s in avanti', `${fmt(m.peakForward)} rad/s`],
    ['ω_s al rilascio', `${fmt(m.omegaSRelease)} rad/s (${fmt(m.releaseRatio * 100, 0)}% del picco)`],
    ['Rilascio dopo il picco', `${fmt(m.releaseAfterPeakMs, 0)} ms`],
    ['Rotazione del polso', `${fmt(m.wristRollDeg, 0)}°`],
    ['Durata', `${fmt(m.durationMs, 0)} ms · ${m.samples} campioni`],
    ['Massimi', `|ω| ${fmt(m.maxGyro)} rad/s${m.gyroSaturated ? ' (SATURATO)' : ''} · |a| ${fmt(m.maxAccG)} g`],
  ], `${fmt(m.vEst * 3.6, 0)} km/h stimati`);
}

function renderReturnResult(m) {
  if (!m.ok) {
    renderDl($('return-result'), [['Problema', m.reason]], 'Prova non valida');
    return;
  }
  renderDl($('return-result'), [
    ['Filtro', m.filter],
    ['Movimento', `${fmt(m.motionSeconds)} s`],
    ['Errore di tilt appena fermo', `${fmt(m.atStop.tiltDeg)}°`],
    ['Errore di yaw appena fermo', `${fmt(m.atStop.yawDeg)}°`],
    ['Alla fine (tilt / yaw)', `${fmt(m.atEnd.tiltDeg)}° / ${fmt(m.atEnd.yawDeg)}°`],
  ], `Yaw: ${fmt(m.atStop.yawDeg)}° di deriva`);
}

function renderSession() {
  const res = sessionCriteria(session);
  const verdictText = { go: 'Verdetto: GO ✓', 'no-go': 'Verdetto: NO-GO', incompleto: 'Verdetto: dati incompleti' };
  $('session-verdict').textContent = verdictText[res.verdict];
  renderChecks($('criteria'), res.criteria);
  const rows = session.traces.map((t) => {
    const m = t.metrics ?? {};
    const del = el('button', { type: 'button', textContent: 'Elimina' });
    del.setAttribute('aria-label', `Elimina la traccia ${t.id}`);
    del.addEventListener('click', () => {
      if (!window.confirm(`Eliminare la traccia ${t.id} (${t.label})?`)) return;
      commit(removeTrace(session, t.id));
      renderSession();
      renderCounts();
    });
    const isReturn = m.kind === 'return';
    return el('tr', {}, [
      el('td', { textContent: String(t.id) }),
      el('td', { textContent: t.label }),
      el('td', { textContent: isReturn ? '—' : fmt(m.peakForward) }),
      el('td', { textContent: isReturn ? '—' : `${fmt(m.vEst * 3.6, 0)} km/h` }),
      el('td', { textContent: isReturn ? `yaw ${fmt(m.atStop?.yawDeg)}°` : `${fmt(m.wristRollDeg, 0)}°` }),
      el('td', { textContent: isReturn ? (m.ok ? 'sì' : 'no') : (m.swingValid ? 'sì' : 'no') }),
      el('td', {}, [del]),
    ]);
  });
  $('traces').tBodies[0].replaceChildren(...rows);
  $('btn-share').hidden = !(navigator.canShare && navigator.share);
}

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.dataset.panel !== name;
  if (name === 'session') renderSession();
}

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
}

// ---------- flussi ----------

async function runProbe() {
  if (busy) return;
  busy = true;
  try {
    await probeFlow();
  } finally {
    busy = false;
  }
}

async function probeFlow() {
  showScreen('screen-probe');
  const bar = $('probe-bar');
  const samples = await collect(PROBE_DURATION_MS, (p) => { bar.style.width = `${p * 100}%`; });
  const res = evaluateProbe(samples);
  commit(withClock(withProbe(session, { ...res, samples }), {
    offsetMs: clockOffsets.length ? median(clockOffsets) : null,
    timestampSource,
  }));
  showScreen('screen-main');
  renderProbe();
  selectTab('probe');
}

async function onStart() {
  $('start-error').hidden = true;
  if (!window.isSecureContext) {
    $('secure-warning').hidden = false;
    return;
  }
  try {
    await requestPermissions(); // deve restare la prima chiamata dentro il tap (iOS)
  } catch (err) {
    $('start-error').textContent = err instanceof Error ? err.message : String(err);
    $('start-error').hidden = false;
    return;
  }
  try {
    keepAwake();
    window.addEventListener('devicemotion', onMotion);
    session = restoreOrCreate($('device-name').value.trim());
    renderLabels();
    renderAxes();
    renderCounts();
    requestAnimationFrame(frame);
    await runProbe();
  } catch (err) {
    showScreen('screen-start');
    $('start-error').textContent = `Errore inatteso: ${err instanceof Error ? err.message : String(err)}`;
    $('start-error').hidden = false;
  }
}

/** Riprende la sessione salvata oppure ne crea una nuova; quella vecchia, se scartata, viene scaricata. */
function restoreOrCreate(name) {
  const saved = load(localStorage);
  if (saved && saved.traces.length > 0) {
    const resume = window.confirm(`C'è una sessione salvata con ${saved.traces.length} tracce.\n\nOK = riprendila.\nAnnulla = ricomincia da zero (la vecchia sessione viene prima scaricata come file).`);
    if (resume) return name ? withDeviceName(saved, name) : saved;
    downloadSession(saved);
  }
  return createSession({
    name,
    ua: navigator.userAgent,
    screen: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio || 1 },
  }, new Date().toISOString());
}

function markStep(i) {
  for (const li of $('axes-steps').children) {
    const k = Number(li.dataset.step);
    li.className = k < i ? 'done' : k === i ? 'active' : '';
  }
}

async function countdown(text, ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    $('axes-instruction').textContent = `${text} · si parte tra ${Math.ceil((end - performance.now()) / 1000)}`;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function runAxes() {
  if (!isIdle()) return;
  busy = true;
  $('btn-axes').disabled = true;
  $('axes-result').hidden = true;
  const bar = $('axes-bar');
  const progress = (p) => { bar.style.width = `${p * 100}%`; };
  const poses = {};
  try {
    for (const [i, pose] of STATIC_POSES.entries()) {
      markStep(i);
      await countdown(pose.label, SETTLE_MS);
      $('axes-instruction').textContent = `${pose.label} · non muoverlo`;
      poses[pose.id] = await collect(STATIC_MS, progress);
    }
    markStep(STATIC_POSES.length);
    await countdown('Prendi il telefono in mano', SETTLE_MS);
    $('axes-instruction').textContent = 'Ruotalo LENTAMENTE in tutte le direzioni: avanti e indietro, di lato, come un volante';
    const dance = await collect(DANCE_MS, progress);
    markStep(STATIC_POSES.length + 1);
    $('axes-instruction').textContent = 'Fatto.';
    const staticRes = analyzeStaticPoses(poses);
    const fit = fitGyroMapping(dance, staticRes.accSign);
    const next = withAxes(session, { static: staticRes, fit, poses, dance });
    // Il mapping può essere cambiato: si ricalcolano le metriche delle tracce già registrate.
    commit({ ...next, traces: next.traces.map((t) => ({ ...t, metrics: computeMetrics(t, next) })) });
    renderAxes();
  } finally {
    busy = false;
    $('btn-axes').disabled = false;
  }
}

function onHoldDown(e) {
  e.preventDefault();
  if (!isIdle()) return;
  $('btn-hold').setPointerCapture?.(e.pointerId);
  const tDown = sensorNow();
  holding = {
    pointerId: e.pointerId,
    samples: ring.filter((s) => s[COL.t] >= tDown - PRE_ROLL_MS),
    buttons: [{ t: tDown, down: true }],
    timer: setTimeout(() => onHoldCancel(null, 'Tasto tenuto troppo a lungo: riprova'), HOLD_MAX_MS),
  };
  holding.collector = (raw) => holding.samples.push(raw);
  collectors.add(holding.collector);
  $('btn-hold').classList.add('is-down');
  $('hold-state').textContent = 'Swing… alza il pollice per rilasciare';
  navigator.vibrate?.(15);
}

function onHoldUp(e) {
  e.preventDefault();
  if (!holding || holding.buttons.length > 1 || e.pointerId !== holding.pointerId) return;
  clearTimeout(holding.timer);
  holding.buttons.push({ t: sensorNow(), down: false });
  $('btn-hold').classList.remove('is-down');
  $('btn-hold').disabled = true;
  $('hold-state').textContent = 'Rilasciato!';
  navigator.vibrate?.(30);
  const current = holding;
  setTimeout(() => {
    collectors.delete(current.collector);
    const trace = {
      id: nextTraceId(session),
      label: selectedLabel,
      note: $('swing-note').value.trim(),
      createdAt: new Date().toISOString(),
      samples: current.samples,
      buttons: current.buttons,
    };
    const metrics = computeMetrics(trace);
    commit(addTrace(session, { ...trace, metrics }));
    renderSwingResult(metrics);
    renderCounts();
    holding = null;
    $('btn-hold').disabled = false;
    $('hold-state').textContent = `Traccia ${trace.id} salvata · pronto`;
  }, POST_ROLL_MS);
}

function onHoldCancel(e, message = 'Interrotto dal browser: riprova') {
  if (!holding || holding.buttons.length > 1) return; // già rilasciato: la traccia si sta chiudendo
  if (e && e.pointerId !== holding.pointerId) return;
  clearTimeout(holding.timer);
  collectors.delete(holding.collector);
  holding = null;
  $('btn-hold').classList.remove('is-down');
  $('hold-state').textContent = message;
}

function stopReturn() {
  if (!returnRun) return;
  clearTimeout(returnRun.timer);
  collectors.delete(returnRun.collector);
  const trace = {
    id: nextTraceId(session),
    label: 'ritorno',
    note: '',
    createdAt: new Date().toISOString(),
    samples: returnRun.samples,
    buttons: [],
  };
  returnRun = null;
  const metrics = computeMetrics(trace);
  commit(addTrace(session, { ...trace, metrics }));
  renderReturnResult(metrics);
  $('btn-return').textContent = 'Avvia';
}

function toggleReturn() {
  if (returnRun) {
    stopReturn();
    return;
  }
  if (!isIdle()) return;
  returnRun = { samples: [] };
  returnRun.collector = (raw) => returnRun.samples.push(raw);
  collectors.add(returnRun.collector);
  returnRun.timer = setTimeout(stopReturn, RETURN_MAX_MS);
  $('btn-return').textContent = 'Stop';
  $('return-result').hidden = true;
}

function download() {
  downloadSession(session);
}

function downloadSession(s) {
  const blob = new Blob([JSON.stringify(s)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: fileName(s) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function share() {
  const file = new File([JSON.stringify(session)], fileName(session), { type: 'application/json' });
  if (!navigator.canShare?.({ files: [file] })) {
    download();
    return;
  }
  try {
    await navigator.share({ files: [file], title: fileName(session) });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) download();
  }
}

function resetSession() {
  if (!isIdle()) return;
  if (!window.confirm('Cancellare tutte le tracce di questa sessione? Scaricale prima se ti servono.')) return;
  commit(createSession({ ...session.device }, new Date().toISOString()));
  renderAxes();
  renderCounts();
  $('axes-result').hidden = true;
  $('swing-result').hidden = true;
  $('return-result').hidden = true;
  runProbe();
}

// ---------- collegamenti ----------
$('btn-start').addEventListener('click', onStart);
$('btn-reprobe').addEventListener('click', () => { if (isIdle()) runProbe(); });
$('btn-axes').addEventListener('click', runAxes);
$('btn-return').addEventListener('click', toggleReturn);
$('btn-download').addEventListener('click', download);
$('btn-share').addEventListener('click', share);
$('btn-reset').addEventListener('click', resetSession);
const hold = $('btn-hold');
hold.addEventListener('pointerdown', onHoldDown);
hold.addEventListener('pointerup', onHoldUp);
hold.addEventListener('pointercancel', (e) => onHoldCancel(e));
hold.addEventListener('lostpointercapture', (e) => onHoldCancel(e, 'Tasto perso: riprova'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onHoldCancel(null, 'Pagina in background: riprova');
});
hold.addEventListener('contextmenu', (e) => e.preventDefault());
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => selectTab(tab.dataset.tab));
if (!window.isSecureContext) $('secure-warning').hidden = false;
