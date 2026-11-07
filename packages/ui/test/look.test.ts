import { describe, expect, test } from 'vitest';
import { cleanName, DEFAULT_STYLE, displayName, NAME_MAX, normalizeStyle, typingName } from '../src/look';

describe('aspetto del Piggy', () => {
  test('dati sbagliati tornano al default campo per campo', () => {
    expect(normalizeStyle(null)).toEqual(DEFAULT_STYLE);
    const s = normalizeStyle({ color2: 'rosso', pattern: 'stars', eyes: '<script>', hat: 'crown', neck: 42 });
    expect(s.color2).toBe(DEFAULT_STYLE.color2);
    expect(s.pattern).toBe('stars');
    expect(s.eyes).toBe(DEFAULT_STYLE.eyes);
    expect(s.hat).toBe('crown');
    expect(s.neck).toBe('none');
  });
});

describe('nome del Piggy', () => {
  test('tiene lettere accentate, cifre e poca punteggiatura; toglie il resto', () => {
    expect(cleanName('  Zoë   la  Bella ')).toBe('Zoë la Bella');
    expect(cleanName('<b>Ugo</b>')).toBe('bUgob');
    expect(cleanName('Ana😀!')).toBe('Ana');
    expect(cleanName(42)).toBe('');
  });

  test('al massimo NAME_MAX caratteri, contando le lettere composte una volta', () => {
    expect(Array.from(cleanName('Bartolomeo Primo')).length).toBeLessThanOrEqual(NAME_MAX);
    expect(cleanName('Bartolomeo Primo')).toBe('Bartolomeo P');
  });

  test('mentre si scrive lo spazio finale resta, così si possono separare le parole', () => {
    expect(typingName('Mario ')).toBe('Mario ');
    expect(cleanName('Mario ')).toBe('Mario');
  });

  test('senza nome lo schermo mostra "Piggy N"', () => {
    expect(displayName('', 'P3')).toBe('Piggy 3');
    expect(displayName(undefined, 'P1')).toBe('Piggy 1');
    expect(displayName(' Leo ', 'P2')).toBe('Leo');
  });
});
