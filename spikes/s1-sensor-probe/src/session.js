// Modello della sessione di misura: dati immutabili, persistenza con storage iniettato.

import { COLUMNS, W3C_MAPPING } from './mapping.js';

export const FORMAT = 'quickquest.s1-session';
export const VERSION = 1;
export const STORAGE_KEY = 'lq-s1-session';

/** @param {string} ua */
export function detectPlatform(ua) {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'altro';
}

/**
 * @param {{name:string, ua:string, screen:{w:number,h:number,dpr:number}}} device
 * @param {string} nowIso
 */
export function createSession(device, nowIso) {
  return {
    format: FORMAT,
    version: VERSION,
    createdAt: nowIso,
    device: { ...device, platform: detectPlatform(device.ua) },
    columns: [...COLUMNS],
    clock: null,
    probe: null,
    axes: null,
    traces: [],
  };
}

export const withProbe = (s, probe) => ({ ...s, probe });
export const withAxes = (s, axes) => ({ ...s, axes });
export const withClock = (s, clock) => ({ ...s, clock });
export const withDeviceName = (s, name) => ({ ...s, device: { ...s.device, name } });
export const addTrace = (s, trace) => ({ ...s, traces: [...s.traces, trace] });
export const removeTrace = (s, id) => ({ ...s, traces: s.traces.filter((t) => t.id !== id) });

/** Mapping da usare: quello misurato dal test assi se affidabile, altrimenti W3C. */
export function activeMapping(s) {
  if (s.axes?.fit?.ok) return s.axes.fit.best.mapping;
  if (s.axes?.static?.ok) return { ...W3C_MAPPING, accSign: s.axes.static.accSign };
  return W3C_MAPPING;
}

/** Prossimo id progressivo (stabile anche dopo le cancellazioni). */
export function nextTraceId(s) {
  return s.traces.reduce((m, t) => Math.max(m, t.id), 0) + 1;
}

/** Nome file: s1-<piattaforma>-<dispositivo>-<data>.json */
export function fileName(s) {
  const slug = (s.device.name || 'telefono').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  const date = s.createdAt.slice(0, 16).replace(/[:T]/g, '-');
  return `s1-${s.device.platform}-${slug || 'telefono'}-${date}.json`;
}

/** Verifica minima di un oggetto letto da storage o da file. */
export function isSession(x) {
  return Boolean(x) && typeof x === 'object' && x.format === FORMAT && x.version === VERSION
    && Array.isArray(x.traces) && Array.isArray(x.columns);
}

/**
 * @param {{setItem:(k:string,v:string)=>void}} storage
 * @returns {{ok:true}|{ok:false, error:string}}
 */
export function save(storage, s) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** @param {{getItem:(k:string)=>string|null}} storage */
export function load(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch {
    return null; // sessione corrotta o storage non disponibile: si riparte da zero
  }
}
