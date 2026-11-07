import { describe, expect, test } from 'vitest';
import { hasKey, setLocale, t } from '../src/i18n';
import it from '../src/i18n/it.json';
import { EYES, FACE_ITEMS, HATS, MOUTHS, NECK_ITEMS, PATTERNS } from '../src/look';
import { PLAYER_SLOTS, BUBU_COLORS, bubuColor, slotStyle } from '../src/palette';

describe('i18n', () => {
  test('sostituisce i segnaposto e lascia quelli senza valore', () => {
    expect(t('games.players', { min: 1, max: 4 })).toBe('1–4 giocatori');
    expect(t('games.players', { min: 1 })).toBe('1–{max} giocatori');
  });

  test('una chiave mancante è evidente a schermo', () => {
    expect(t('non.esiste')).toBe('⟦non.esiste⟧');
    expect(t('home')).toBe('⟦home⟧'); // un ramo non è una stringa
    expect(hasKey('brand.name')).toBe(true);
  });

  test('la lingua sconosciuta non cambia nulla', () => {
    expect(setLocale('xx')).toBe(false);
    expect(setLocale('it')).toBe(true);
    expect(t('brand.name')).toBe('quickquest');
  });

  test('ogni colore e ogni opzione del Bubù ha il suo nome', () => {
    for (const c of BUBU_COLORS) expect(hasKey(`colors.${c.id}`)).toBe(true);
    const groups = { patterns: PATTERNS, eyes: EYES, mouths: MOUTHS, hats: HATS, face: FACE_ITEMS, neck: NECK_ITEMS };
    for (const [group, list] of Object.entries(groups)) {
      for (const id of list) expect(hasKey(`look.${group}.${id}`)).toBe(true);
    }
  });

  test('nessuna stringa vuota e nessun richiamo a marchi Nintendo', () => {
    const flat = JSON.stringify(it);
    expect(flat).not.toMatch(/\bWii\b|\bMii\b|Nintendo|Joy-?Con/i);
    const walk = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : walk(v as object)));
    for (const s of walk(it)) expect(s.trim().length).toBeGreaterThan(0);
  });
});

describe('palette', () => {
  test('slot e colori', () => {
    expect(PLAYER_SLOTS.map((s) => s.symbol).join('')).toBe('●▲■◆');
    expect(slotStyle('P3').hex).toBe('#F7C531');
    expect(() => slotStyle('P9' as 'P1')).toThrow();
    expect(bubuColor('grape').hex).toBe('#9C6BFF');
    expect(bubuColor('inesistente').id).toBe('cherry');
  });
});
