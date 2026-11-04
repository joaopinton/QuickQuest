import { describe, expect, test } from 'vitest';
import { ALPHABET, generateRoomCode, isValidRoomCode, normalizeCodeChar } from '../src/room-code';

describe('codice stanza', () => {
  test('l’alfabeto esclude i caratteri ambigui', () => {
    for (const ch of '01OI') expect(ALPHABET).not.toContain(ch);
    expect(ALPHABET).toHaveLength(32);
  });

  test('generateRoomCode produce 4 caratteri validi', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  test('generateRoomCode usa la sorgente casuale iniettata', () => {
    const fill = (buf: Uint8Array) => { buf.fill(0); return buf; };
    expect(generateRoomCode(fill)).toBe('AAAA');
  });

  test('normalizeCodeChar porta in maiuscolo e rifiuta i caratteri esclusi', () => {
    expect(normalizeCodeChar('k')).toBe('K');
    expect(normalizeCodeChar('7')).toBe('7');
    expect(normalizeCodeChar('o')).toBe('');
    expect(normalizeCodeChar('1')).toBe('');
    expect(normalizeCodeChar(' ')).toBe('');
  });

  test('isValidRoomCode', () => {
    expect(isValidRoomCode('K7RM')).toBe(true);
    expect(isValidRoomCode('k7rm')).toBe(false);
    expect(isValidRoomCode('K7R')).toBe(false);
    expect(isValidRoomCode('K0RM')).toBe(false);
  });
});
