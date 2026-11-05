import { describe, expect, test } from 'vitest';
import { parseThrowEvent, THROW_EVENT, throwEvent } from '../bowling/shared/events';
import { isPlayable, loadersFor } from '../loaders';

describe('bowling sul contratto modulo', () => {
  test('il lancio va e torna come game-event, arrotondato', () => {
    const e = throwEvent({ speed: 7.12345, spin: -0.33333, dir: 0.0123456 });
    expect(e.kind).toBe(THROW_EVENT);
    expect(parseThrowEvent(e)).toEqual({ speed: 7.123, spin: -0.333, dir: 0.012 });
  });

  test('scarta eventi che non sono lanci o hanno numeri fuori scala', () => {
    expect(parseThrowEvent({ kind: 'shot', data: { speed: 7, spin: 0, dir: 0 } })).toBeNull();
    expect(parseThrowEvent({ kind: 'throw', data: { speed: '7', spin: 0, dir: 0 } })).toBeNull();
    expect(parseThrowEvent({ kind: 'throw', data: { speed: 0, spin: 0, dir: 0 } })).toBeNull();
    expect(parseThrowEvent({ kind: 'throw', data: { speed: 40, spin: 0, dir: 0 } })).toBeNull();
    expect(parseThrowEvent({ kind: 'throw', data: { speed: 7, spin: 2, dir: 0 } })).toBeNull();
    expect(parseThrowEvent({ kind: 'throw', data: { speed: 7, spin: 0, dir: Number.NaN } })).toBeNull();
  });

  test('il bowling ha i suoi loader come il golf', () => {
    expect(isPlayable('bowling')).toBe(true);
    expect(loadersFor('bowling')).toBeDefined();
    expect(isPlayable('bocce')).toBe(false);
  });
});
