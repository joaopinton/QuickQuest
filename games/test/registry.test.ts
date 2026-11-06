import { describe, expect, test } from 'vitest';
import { GAME_LOADERS, isPlayable, loadersFor } from '../loaders';
import { findGame, GAMES } from '../registry';

describe('registro dei giochi', () => {
  test('sei giochi, id unici, il bowling è il primo', () => {
    expect(GAMES).toHaveLength(6);
    expect(new Set(GAMES.map((g) => g.id)).size).toBe(6);
    expect(GAMES[0]?.id).toBe('bowling');
    expect(GAMES.filter((g) => g.status === 'soon').map((g) => g.id)).toEqual(['bowling', 'free-throw', 'golf']);
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

describe('loader dei giochi sul contratto modulo', () => {
  test('si avviano il bowling (cablato) e i giochi con i loader', () => {
    expect(isPlayable('bowling')).toBe(true);
    expect(isPlayable('golf')).toBe(true);
    expect(isPlayable('bocce')).toBe(false);
    expect(loadersFor(null)).toBeUndefined();
    expect(loadersFor('golf')).toBe(GAME_LOADERS.golf);
  });

  test('ogni gioco "soon" si può avviare', () => {
    for (const g of GAMES.filter((x) => x.status === 'soon')) expect(isPlayable(g.id)).toBe(true);
  });
});
