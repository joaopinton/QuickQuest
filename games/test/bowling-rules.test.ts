import { describe, expect, test } from 'vitest';
import {
  createGame,
  frameMarks,
  frameScores,
  isGameOver,
  lastRollOutcome,
  liveTotal,
  recordRoll,
  standings,
  turnInfo,
  type GameState,
} from '../bowling/screen/rules';

const playAll = (state: GameState, rolls: readonly number[]): GameState =>
  rolls.reduce((s, pins) => recordRoll(s, pins), state);

const finalScore = (rolls: readonly number[], frames = 10) =>
  frameScores(rolls, frames).at(-1);

describe('punteggio bowling (docs/games/bowling.md § 5)', () => {
  test('partita perfetta: 12 strike = 300', () => {
    expect(finalScore(Array(12).fill(10))).toBe(300);
  });

  test('tutti 9-/ seguiti da 9 = 190', () => {
    expect(finalScore([...Array(10).fill([9, 1]).flat(), 9])).toBe(190);
  });

  test('tutti spare 5/ con 5 bonus = 150', () => {
    expect(finalScore(Array(21).fill(5))).toBe(150);
  });

  test('tutte canaline = 0', () => {
    expect(finalScore(Array(20).fill(0))).toBe(0);
  });

  test('frame dopo uno strike resta in attesa dei 2 tiri bonus', () => {
    expect(frameScores([10, 3], 10).slice(0, 2)).toEqual([null, null]);
    expect(frameScores([10, 3, 4], 10).slice(0, 2)).toEqual([17, 24]);
  });

  test('frame dopo uno spare resta in attesa del tiro bonus', () => {
    expect(frameScores([6, 4], 10)[0]).toBeNull();
    expect(frameScores([6, 4, 7], 10)[0]).toBe(17);
  });

  test('il totale live conta subito i birilli abbattuti', () => {
    expect(liveTotal([7], 10)).toBe(7);
    expect(liveTotal([10], 10)).toBe(10);
    expect(liveTotal([10, 3], 10)).toBe(16);
    expect(liveTotal([6, 4, 7], 10)).toBe(24);
  });

  test('partita veloce da 3 frame con bonus nel frame finale', () => {
    expect(finalScore([10, 10, 10, 10, 10], 3)).toBe(90);
    expect(finalScore([3, 4, 5, 5, 7, 1], 3)).toBe(32);
  });
});

describe('flusso dei turni', () => {
  test('i birilli in piedi scendono al secondo tiro e tornano a 10 dopo il frame', () => {
    let g = createGame(['P1'], 10);
    expect(turnInfo(g)).toMatchObject({ frameIndex: 0, rollInFrame: 0, standing: 10 });
    g = recordRoll(g, 7);
    expect(turnInfo(g)).toMatchObject({ frameIndex: 0, rollInFrame: 1, standing: 3 });
    g = recordRoll(g, 2);
    expect(turnInfo(g)).toMatchObject({ frameIndex: 1, rollInFrame: 0, standing: 10 });
  });

  test('un tiro oltre i birilli in piedi viene limitato', () => {
    const g = recordRoll(recordRoll(createGame(['P1']), 8), 5);
    expect(g.rolls[0]).toEqual([8, 2]);
  });

  test('ordine P1 frame 1 → P2 frame 1 → P1 frame 2', () => {
    let g = createGame(['P1', 'P2'], 3);
    g = recordRoll(g, 10);
    expect(g.current).toBe(1);
    g = recordRoll(g, 4);
    expect(g.current).toBe(1);
    g = recordRoll(g, 3);
    expect(g.current).toBe(0);
    expect(turnInfo(g).frameIndex).toBe(1);
  });

  test('10° frame: strike dà due tiri bonus con rack nuovo', () => {
    let g = playAll(createGame(['P1'], 1), [10]);
    expect(turnInfo(g)).toMatchObject({ rollInFrame: 1, standing: 10 });
    g = recordRoll(g, 6);
    expect(turnInfo(g)).toMatchObject({ rollInFrame: 2, standing: 4 });
    g = recordRoll(g, 4);
    expect(isGameOver(g)).toBe(true);
    expect(() => recordRoll(g, 1)).toThrow();
  });

  test('10° frame aperto chiude la partita dopo 2 tiri', () => {
    const g = playAll(createGame(['P1'], 1), [3, 4]);
    expect(isGameOver(g)).toBe(true);
  });

  test('partita a 2 giocatori finisce quando entrambi completano i frame', () => {
    const g = playAll(createGame(['P1', 'P2'], 2), [10, 3, 4, 5, 5, 1]);
    expect(isGameOver(g)).toBe(false);
    expect(isGameOver(recordRoll(recordRoll(g, 2), 2))).toBe(true);
  });

  test('createGame rifiuta input non validi', () => {
    expect(() => createGame([])).toThrow();
    expect(() => createGame(['P1'], 0)).toThrow();
  });
});

describe('segnapunti e classifica', () => {
  test('simboli X, /, - nei frame normali e nel finale', () => {
    expect(frameMarks([10], false)).toEqual(['', 'X']);
    expect(frameMarks([7, 3], false)).toEqual(['7', '/']);
    expect(frameMarks([0, 5], false)).toEqual(['-', '5']);
    expect(frameMarks([10, 10, 10], true)).toEqual(['X', 'X', 'X']);
    expect(frameMarks([10, 6, 4], true)).toEqual(['X', '6', '/']);
    expect(frameMarks([5, 5, 10], true)).toEqual(['5', '/', 'X']);
  });

  test('esito dell ultimo tiro', () => {
    expect(lastRollOutcome([10], 10)).toBe('strike');
    expect(lastRollOutcome([4, 6], 10)).toBe('spare');
    expect(lastRollOutcome([0], 10)).toBe('gutter');
    expect(lastRollOutcome([4], 10)).toBe('open');
    expect(lastRollOutcome([], 10)).toBeNull();
  });

  test('classifica ordinata con posizioni a pari merito e distacco', () => {
    const g = playAll(createGame(['P1', 'P2', 'P3'], 3), [5, 4, 10, 9, 0]);
    const s = standings(g);
    expect(s.map((r) => [r.playerId, r.position, r.total, r.gapFromLeader])).toEqual([
      ['P2', 1, 10, 0],
      ['P1', 2, 9, 1],
      ['P3', 2, 9, 1],
    ]);
    expect(s[0]?.strikes).toBe(1);
  });
});
