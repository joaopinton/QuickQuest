import { isGameEvent } from '@quickquest/protocol';
import { describe, expect, test } from 'vitest';
import { finishEvent, parseBarberEvent, rotateEvent, snipEvent, TOOL_COMB, toolEvent, toolFromComb } from '../barber/shared/events';

describe('eventi del Barber shop', () => {
  test('tool: andata e ritorno, valori arrotondati e dentro 0..1', () => {
    const wire = toolEvent({ x: 0.123456, y: 1.4, clip: true, comb: 1, scissors: false });
    expect(isGameEvent(wire)).toBe(true);
    expect(parseBarberEvent(wire)).toEqual({ type: 'tool', tool: { x: 0.123, y: 1, clip: true, comb: 1, scissors: false } });
  });

  test('tool: le forbici in mano viaggiano; senza il campo vale la macchinetta', () => {
    const wire = toolEvent({ x: 0.5, y: 0.5, clip: false, comb: 2, scissors: true });
    expect(parseBarberEvent(wire)).toMatchObject({ tool: { scissors: true } });
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: true, comb: 0 } })).toMatchObject({ tool: { scissors: false } });
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: true, comb: 0, scissors: 1 } })).toBeNull();
  });

  test('tool: la mira senza limiti viaggia insieme, o non viaggia', () => {
    const wire = toolEvent({ x: 1, y: 0.5, clip: false, comb: 1, scissors: false, ax: 3.21456, ay: -0.5 });
    expect(isGameEvent(wire)).toBe(true);
    expect(parseBarberEvent(wire)).toMatchObject({ tool: { ax: 3.2146, ay: -0.5 } });
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: true, comb: 0, ax: 1 } })).toBeNull();
    expect(parseBarberEvent({ kind: 'tool', data: { x: 0.5, y: 0.5, clip: true, comb: 0, ax: Infinity, ay: 0 } })).toBeNull();
  });

  test('ogni rialzo della macchinetta corrisponde a un pettine', () => {
    for (const tool of ['clip0', 'clip1', 'clip2'] as const) expect(toolFromComb(TOOL_COMB[tool])).toBe(tool);
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
