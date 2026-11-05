import { describe, expect, test, vi } from 'vitest';
import {
  isFullscreen, isFullscreenShortcut, isFullscreenSupported, onFullscreenChange, toggleFullscreen, type FullscreenDoc,
} from './fullscreen';

function fakeDoc(over: Partial<FullscreenDoc> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const doc: FullscreenDoc & { fire(type: string): void; fullscreenElement: unknown } = {
    fullscreenElement: null,
    fullscreenEnabled: true,
    documentElement: { requestFullscreen: vi.fn(async () => { doc.fullscreenElement = doc.documentElement; }) },
    exitFullscreen: vi.fn(async () => { doc.fullscreenElement = null; }),
    addEventListener: (type, cb) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(cb); },
    removeEventListener: (type, cb) => { listeners.get(type)?.delete(cb); },
    fire: (type) => listeners.get(type)?.forEach((cb) => cb()),
    ...over,
  };
  return doc;
}

const key = (k: string, extra: Partial<Parameters<typeof isFullscreenShortcut>[0]> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: null, ...extra,
});

describe('schermo intero', () => {
  test('entra ed esce con la stessa funzione', async () => {
    const doc = fakeDoc();
    expect(isFullscreenSupported(doc)).toBe(true);
    expect(await toggleFullscreen(doc)).toBe(true);
    expect(isFullscreen(doc)).toBe(true);
    expect(await toggleFullscreen(doc)).toBe(true);
    expect(isFullscreen(doc)).toBe(false);
    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  test('usa le API webkit dove servono (Safari su iPad)', async () => {
    const doc = fakeDoc({ fullscreenEnabled: undefined, webkitFullscreenEnabled: true, exitFullscreen: undefined });
    const request = vi.fn();
    (doc as { documentElement: unknown }).documentElement = { webkitRequestFullscreen: request };
    expect(isFullscreenSupported(doc)).toBe(true);
    expect(await toggleFullscreen(doc)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('non supportato (iPhone): niente pulsante', () => {
    expect(isFullscreenSupported(fakeDoc({ fullscreenEnabled: false }))).toBe(false);
    expect(isFullscreenSupported(fakeDoc({ documentElement: {} }))).toBe(false);
  });

  test('un rifiuto del browser non è un errore', async () => {
    const doc = fakeDoc({ documentElement: { requestFullscreen: () => Promise.reject(new Error('no gesture')) } });
    expect(await toggleFullscreen(doc)).toBe(false);
  });

  test('segue i cambi anche fatti con Esc, e si disiscrive', () => {
    const doc = fakeDoc();
    const cb = vi.fn();
    const off = onFullscreenChange(doc, cb);
    doc.fire('fullscreenchange');
    doc.fire('webkitfullscreenchange');
    off();
    doc.fire('fullscreenchange');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('scorciatoia: F da solo, non mentre si scrive', () => {
    expect(isFullscreenShortcut(key('f'))).toBe(true);
    expect(isFullscreenShortcut(key('F'))).toBe(true);
    expect(isFullscreenShortcut(key('g'))).toBe(false);
    expect(isFullscreenShortcut(key('f', { ctrlKey: true }))).toBe(false);
    expect(isFullscreenShortcut(key('f', { metaKey: true }))).toBe(false);
    expect(isFullscreenShortcut(key('f', { repeat: true }))).toBe(false);
    expect(isFullscreenShortcut(key('f', { target: { tagName: 'INPUT' } }))).toBe(false);
    expect(isFullscreenShortcut(key('f', { target: { tagName: 'DIV', isContentEditable: true } }))).toBe(false);
  });
});
