import { describe, expect, test } from 'vitest';
import { findGame, GAMES } from '../registry';

describe('registro dei giochi', () => {
  test('sei giochi, id unici, il bowling è il primo', () => {
    expect(GAMES).toHaveLength(6);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(6);
    expect(GAMES[0]?.id).toBe('bowling');
    expect(GAMES.filter((g) => g.status === 'soon').map((g) => g.id)).toEqual(['bowling']);
  });

  test('accenti validi e giocatori coerenti con il massimo di 4', () => {
    for (const g of GAMES) {
      expect(g.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(g.players.min).toBeGreaterThanOrEqual(1);
      expect(g.players.max).toBeLessThanOrEqual(4);
      expect(g.players.min).toBeLessThanOrEqual(g.players.max);
    }
  });

  test('findGame', () => {
    expect(findGame('golf')?.name).toBe('Golf');
    expect(findGame('wii')).toBeUndefined();
  });
});
