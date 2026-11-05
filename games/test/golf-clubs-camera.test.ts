import { describe, expect, test } from 'vitest';
import { clubFromTurnText } from '../golf/shared/clubs';
import { cameraFocusId, turnText } from '../golf/screen/flow';
import { applyShot, createGolf, stepGolf, type GolfState } from '../golf/screen/rules';

describe('il telefono legge la mazza dal testo del turno', () => {
  const { state } = createGolf(['P1'], { seed: 1 });

  test('la mazza suggerita dallo schermo arriva al pad', () => {
    const text = turnText(state, 'P1');
    expect(clubFromTurnText(text)).toBe(state.players[0]!.club);
  });

  test('sul green è il putter', () => {
    const onGreen: GolfState = {
      ...state,
      players: state.players.map((p) => ({ ...p, lie: 'green', club: 'putter', ball: { x: 0, y: state.course[0]!.lengthM - 4 } })),
    };
    expect(clubFromTurnText(turnText(onGreen, 'P1'))).toBe('putter');
  });

  test.each([
    ['nessun testo', undefined],
    ['un altro cue', 'Non è il tuo turno'],
    ['turno senza mazza', 'Tocca a te'],
  ])('nessuna mazza: %s', (_n, text) => {
    expect(clubFromTurnText(text)).toBeNull();
  });
});

describe('chi inquadra la camera', () => {
  const shot = { kind: 'full' as const, power: 0.6, faceDeg: 0, aimDeg: 0, strokeDeg: 0 };

  test('prima chi tira, poi la palla in volo', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 3 });
    expect(cameraFocusId(state, null, 0)).toBe('P1');
    const flying = applyShot(state, 'P1', shot).state;
    expect(cameraFocusId(flying, null, 0)).toBe('P1');
  });

  test('a palla ferma resta su chi ha tirato per un attimo, poi passa al turno', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 3 });
    let s = applyShot(state, 'P1', shot).state;
    for (let i = 0; i < 2000 && s.phase === 'flight'; i++) s = stepGolf(s, 1 / 60).state;
    expect(s.turn).toBe('P2');
    const hold = { playerId: 'P1', until: 1000 };
    expect(cameraFocusId(s, hold, 500)).toBe('P1');
    expect(cameraFocusId(s, hold, 1500)).toBe('P2');
  });

  test('a buca chiusa (nessun turno) resta sull\'ultima palla', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 3 });
    const closed: GolfState = { ...state, turn: null, phase: 'hole_over' };
    expect(cameraFocusId(closed, { playerId: 'P2', until: 0 }, 99)).toBe('P2');
  });

  test('un giocatore uscito non si inquadra', () => {
    const { state } = createGolf(['P1'], { seed: 3 });
    expect(cameraFocusId(state, { playerId: 'P9', until: 1e9 }, 0)).toBe('P1');
  });
});
