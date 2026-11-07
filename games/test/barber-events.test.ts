import { isGameEvent } from '@quickquest/protocol';
import { describe, expect, test } from 'vitest';
import { finishEvent, parseBarberEvent, rotateEvent, snipEvent, toolEvent } from '../barber/shared/events';

describe('eventi del Barber shop', () => {
  test('tool: andata e ritorno, valori arrotondati e dentro 0..1', () => {
    const wire = toolEvent({ x: 0.123456, y: 1.4, clip: true, comb: 1 });
    expect(isGameEvent(wire)).toBe(true);
    expect(parseBarberEvent(wire)).toEqual({ type: 'tool', tool: { x: 0.123, y: 1, clip: true, comb: 1 } });
  });

  test('snip, rotate e finish sono eventi validi per il protocollo', () => {
    for (const e of [snipEvent({ x: 0.5, y: 0.4 }), rotateEvent(-1), finishEvent()]) {
      expect(isGameEvent(e)).toBe(true);
      expect(parseBarberEvent(e)).not.toBeNull();
    }
    expect(parseBarberEvent(rotateEvent(1))).toEqual({ type: 'rotate', dir: 1 });
  });

  test('rifiuta valori fuori range, non finiti o tipi sbagliati', () => {
    expect(parseBarberEvent({ kind: 'tool', data: { x: 2, y: 0.5, clip: true, comb: 0 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'tool', data: { x: Number.NaN, y: 0.5, clip: true, comb: 0 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: 1, comb: 0 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: true, comb: 3 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'rotate', data: { dir: 2 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'shoot', data: {} })).toBeNull();
  });
});
