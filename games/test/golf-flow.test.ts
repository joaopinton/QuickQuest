import { describe, expect, test } from 'vitest';
import { ballHeight, outboxFor, parseClub, parseShot, turnText } from '../golf/screen/flow';
import { createGolf } from '../golf/screen/rules';

describe('eventi dai telefoni', () => {
  test('colpo valido, con i valori riportati nei limiti', () => {
    expect(parseShot({ kind: 'shot', data: { kind: 'full', power: 2, faceDeg: -90, aimDeg: 3, strokeDeg: 0 } }))
      .toEqual({ kind: 'full', power: 1, faceDeg: -45, aimDeg: 3, strokeDeg: 0 });
  });

  test.each([
    ['tipo sbagliato', { kind: 'club', data: {} }],
    ['colpo sconosciuto', { kind: 'shot', data: { kind: 'chip', power: 1, faceDeg: 0, aimDeg: 0, strokeDeg: 0 } }],
    ['campo mancante', { kind: 'shot', data: { kind: 'full', power: 1, faceDeg: 0, aimDeg: 0 } }],
    ['testo al posto di un numero', { kind: 'shot', data: { kind: 'putt', power: '1', faceDeg: 0, aimDeg: 0, strokeDeg: 5 } }],
  ])('rifiuta: %s', (_n, e) => {
    expect(parseShot(e)).toBeNull();
  });

  test('mazza', () => {
    expect(parseClub({ kind: 'club', data: { club: 'iron' } })).toBe('iron');
    expect(parseClub({ kind: 'club', data: { club: 'mazza' } })).toBeNull();
    expect(parseClub({ kind: 'shot', data: {} })).toBeNull();
  });
});

describe('feedback ai telefoni', () => {
  const { state } = createGolf(['P1', 'P2'], { seed: 1 });

  test('turno: si apre al giocatore e gli si dice mazza e distanza', () => {
    const out = outboxFor([{ kind: 'turn', playerId: 'P2' }], state);
    expect(out.activeSlot).toBe('P2');
    expect(out.cues[0]).toMatchObject({ slot: 'P2', cue: { kind: 'tap' } });
    expect(out.cues[0]!.cue.text).toMatch(/· (driver|ferro|wedge) · \d+ m alla bandiera/);
    expect(turnText(state, 'P9')).toBe('Tocca a te');
  });

  test('colpo, rifiuto, buca, fine', () => {
    const out = outboxFor([
      { kind: 'struck', playerId: 'P1', shot: 'full', club: 'driver', carryM: 200 },
      { kind: 'refused', playerId: 'P2', reason: 'not_your_turn' },
      { kind: 'holed', playerId: 'P1', strokes: 3, par: 4, term: 'birdie', conceded: false },
      { kind: 'picked_up', playerId: 'P2', strokes: 9 },
      { kind: 'hole_over', hole: 1 },
      { kind: 'over' },
    ], state);
    expect(out.activeSlot).toBeNull();
    expect(out.cues.map((c) => [c.slot, c.cue.kind])).toEqual([
      ['P2', 'error'], ['P1', 'success'], ['P2', 'select'], [null, 'select'], [null, 'select'],
    ]);
    expect(out.cues[1]!.cue.text).toBe('Birdie! 3 colpi');
    expect(outboxFor([], state)).toEqual({ cues: [] });
  });

  test('altezza della palla: zero a terra, massima a metà carry', () => {
    expect(ballHeight(null)).toBe(0);
    expect(ballHeight({ airborne: false, carryLeft: 0, carryM: 100 })).toBe(0);
    const mid = ballHeight({ airborne: true, carryLeft: 50, carryM: 100 });
    expect(mid).toBeCloseTo(15, 6);
    expect(ballHeight({ airborne: true, carryLeft: 90, carryM: 100 })).toBeLessThan(mid);
  });
});
