// Regole del golf, adattate da choijunhuk/phonemote (MIT), golfState.ts e golfState.test.ts.
import { describe, expect, test } from 'vitest';
import {
  applyShot, CLUB_CARRY_M, createGolf, currentHole, distanceToPin, findPlayer, GIMME_RADIUS_M, leaderboard, lieAt,
  makeCourse, nextShooter, removePlayer, setClub, stepGolf, suggestClub, termFor,
  type GolfState, type ShotInput, type Step,
} from '../golf/screen/rules';

const FULL = (power: number, faceDeg = 0, aimDeg = 0): ShotInput => ({ kind: 'full', power, faceDeg, aimDeg, strokeDeg: 0 });
const PUTT = (strokeDeg: number, aimDeg = 0): ShotInput => ({ kind: 'putt', power: 0, faceDeg: 0, aimDeg, strokeDeg });

/** Fa scorrere il tempo finché le palle non sono ferme; restituisce stato ed eventi. */
function settle(step: Step, seconds = 30): Step {
  let s = step.state;
  const events = [...step.events];
  for (let t = 0; t < seconds && s.players.some((p) => p.flight); t += 1 / 60) {
    const r = stepGolf(s, 1 / 60);
    s = r.state;
    events.push(...r.events);
  }
  // un ultimo passo chiude il turno o la buca
  const r = stepGolf(s, 1 / 60);
  return { state: r.state, events: [...events, ...r.events] };
}

function playerOn(state: GolfState, id: string, patch: Partial<GolfState['players'][number]>): GolfState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

describe('percorso', () => {
  test('stesso seme, stesso percorso; par e lunghezze sensati', () => {
    expect(makeCourse(9, 7)).toEqual(makeCourse(9, 7));
    for (const h of makeCourse(9, 3)) {
      expect([3, 4, 5]).toContain(h.par);
      if (h.par === 3) expect(h.lengthM).toBeLessThan(200);
      if (h.par === 5) expect(h.lengthM).toBeGreaterThan(430);
    }
  });

  test('lie: green, bunker, fairway e rough', () => {
    const hole = { par: 4, lengthM: 300, greenRadiusM: 14, greenSpeed: 2.5, slopeDegPerM: 0, wind: 0, bunkers: [{ x: 10, y: 200, radiusM: 5 }] };
    expect(lieAt(hole, { x: 0, y: 295 })).toBe('green');
    expect(lieAt(hole, { x: 11, y: 201 })).toBe('bunker');
    expect(lieAt(hole, { x: 0, y: 100 })).toBe('fairway');
    expect(lieAt(hole, { x: 40, y: 100 })).toBe('rough');
  });

  test('mazza suggerita e nomi del punteggio', () => {
    expect(suggestClub(300, 'tee')).toBe('driver');
    expect(suggestClub(120, 'fairway')).toBe('iron');
    expect(suggestClub(50, 'rough')).toBe('wedge');
    expect(suggestClub(5, 'green')).toBe('putter');
    expect([termFor(2, 4), termFor(3, 4), termFor(4, 4), termFor(5, 4), termFor(6, 4), termFor(9, 4), termFor(1, 4)])
      .toEqual(['eagle', 'birdie', 'par', 'bogey', 'double', 'other', 'albatross']);
  });
});

describe('colpi', () => {
  test('si tira solo quando è il proprio turno, e non con la palla in volo', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 2 });
    expect(state.turn).toBe('P1');
    expect(applyShot(state, 'P2', FULL(0.8)).events).toEqual([{ kind: 'refused', playerId: 'P2', reason: 'not_your_turn' }]);
    const struck = applyShot(state, 'P1', FULL(0.8));
    expect(struck.events[0]).toMatchObject({ kind: 'struck', playerId: 'P1', club: 'driver' });
    expect(applyShot(struck.state, 'P1', FULL(0.8)).events[0]).toMatchObject({ kind: 'refused', reason: 'ball_moving' });
    expect(applyShot(state, 'P9', FULL(1)).events).toHaveLength(0);
  });

  test('più potenza = più lontano; il drive pieno resta vicino al carry della mazza', () => {
    const { state } = createGolf(['P1'], { seed: 4 });
    const soft = settle(applyShot(state, 'P1', FULL(0.2))).state.players[0]!;
    const hard = settle(applyShot(state, 'P1', FULL(1))).state.players[0]!;
    expect(hard.ball.y).toBeGreaterThan(soft.ball.y + 50);
    expect(hard.ball.y).toBeGreaterThan(CLUB_CARRY_M.driver * 0.9);
    expect(hard.strokes).toBe(1);
  });

  test('faccia aperta: la palla finisce a destra; chiusa: a sinistra', () => {
    const calm = createGolf(['P1'], { seed: 4 }).state;
    const noWind = { ...calm, course: calm.course.map((h) => ({ ...h, wind: 0 })) };
    const open = settle(applyShot(noWind, 'P1', FULL(0.8, 10))).state.players[0]!;
    const closed = settle(applyShot(noWind, 'P1', FULL(0.8, -10))).state.players[0]!;
    const straight = settle(applyShot(noWind, 'P1', FULL(0.8, 0))).state.players[0]!;
    expect(open.ball.x).toBeGreaterThan(straight.ball.x + 5);
    expect(closed.ball.x).toBeLessThan(straight.ball.x - 5);
  });

  test('sul green si putta: un colpo pieno viene rifiutato, un tremolio pure', () => {
    const { state } = createGolf(['P1'], { seed: 5 });
    const hole = currentHole(state);
    const onGreen = playerOn(state, 'P1', { ball: { x: 0, y: hole.lengthM - 6 }, lie: 'green', club: 'putter' });
    expect(applyShot(onGreen, 'P1', FULL(0.5)).events[0]).toMatchObject({ reason: 'green_needs_putt' });
    expect(applyShot(onGreen, 'P1', PUTT(1)).events[0]).toMatchObject({ reason: 'too_small' });
  });

  test('il putt della lunghezza giusta va in buca', () => {
    const base = createGolf(['P1'], { seed: 6 }).state;
    const flat = { ...base, course: base.course.map((h) => ({ ...h, slopeDegPerM: 0 })) };
    const hole = currentHole(flat);
    const s = playerOn(flat, 'P1', { ball: { x: 0, y: hole.lengthM - 4 }, lie: 'green', club: 'putter', strokes: 2 });
    // distanza = gradi × 0,09 × velocità del green
    const deg = 4 / (0.09 * hole.greenSpeed);
    const r = settle(applyShot(s, 'P1', PUTT(deg)));
    const holed = r.events.find((e) => e.kind === 'holed');
    expect(holed).toMatchObject({ playerId: 'P1', strokes: 3, conceded: false });
    expect(r.state.phase).toBe('hole_over');
  });

  test('palla ferma vicinissima: concessa, con il colpo del tap-in', () => {
    const base = createGolf(['P1'], { seed: 6 }).state;
    const flat = { ...base, course: base.course.map((h) => ({ ...h, slopeDegPerM: 0 })) };
    const hole = currentHole(flat);
    const s = playerOn(flat, 'P1', { ball: { x: 0, y: hole.lengthM - 4 }, lie: 'green', club: 'putter', strokes: 2 });
    const shortBy = (4 - GIMME_RADIUS_M / 2) / (0.09 * hole.greenSpeed);
    const r = settle(applyShot(s, 'P1', PUTT(shortBy)));
    expect(r.events.find((e) => e.kind === 'holed')).toMatchObject({ strokes: 4, conceded: true });
  });

  test('dopo par + 5 colpi la palla si raccoglie', () => {
    const { state } = createGolf(['P1'], { seed: 7 });
    const par = currentHole(state).par;
    const s = playerOn(state, 'P1', { strokes: par + 4 });
    const r = settle(applyShot(s, 'P1', FULL(0.1)));
    expect(r.events.find((e) => e.kind === 'picked_up')).toMatchObject({ playerId: 'P1', strokes: par + 5 });
    expect(findPlayer(r.state, 'P1')!.card[0]).toBe(par + 5);
  });
});

describe('turni e buche', () => {
  test('tira chi è più lontano dalla bandiera', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 8 });
    const r = settle(applyShot(state, 'P1', FULL(1)));
    expect(r.state.turn).toBe('P2'); // P2 è ancora sul tee
    expect(r.events.some((e) => e.kind === 'turn' && e.playerId === 'P2')).toBe(true);
    const s = settle(applyShot(r.state, 'P2', FULL(0.1))).state;
    const hole = currentHole(s);
    const far = s.players.reduce((a, b) => (distanceToPin(hole, a.ball) > distanceToPin(hole, b.ball) ? a : b));
    expect(nextShooter(s)).toBe(far.id);
  });

  test('scelta della mazza: il putter solo sul green', () => {
    const { state } = createGolf(['P1'], { seed: 9 });
    expect(findPlayer(setClub(state, 'P1', 'iron'), 'P1')).toMatchObject({ club: 'iron', clubChosen: true });
    expect(setClub(state, 'P1', 'putter')).toBe(state);
    expect(setClub(state, 'P9', 'iron')).toBe(state);
  });

  test('a buca chiusa si passa alla successiva, e dopo l’ultima la partita finisce', () => {
    const { state } = createGolf(['P1'], { seed: 10, holes: 2 });
    let s = removePlayer(state, 'P1').state; // raccoglie: buca finita
    expect(s.phase).toBe('hole_over');
    let r = stepGolf(s, 5);
    expect(r.events[0]).toMatchObject({ kind: 'hole_started', hole: 2 });
    expect(r.state.turn).toBe('P1');
    s = removePlayer(r.state, 'P1').state;
    r = stepGolf(stepGolf(s, 1).state, 5);
    expect(r.events).toEqual([{ kind: 'over' }]);
    expect(stepGolf(r.state, 1).events).toHaveLength(0);
  });

  test('chi esce passa il turno; la classifica ordina per colpi sul par', () => {
    const { state } = createGolf(['P1', 'P2'], { seed: 11 });
    const r = removePlayer(state, 'P1');
    expect(r.state.turn).toBe('P2');
    expect(removePlayer(r.state, 'P1').events).toHaveLength(0);
    const board = leaderboard(playerOn(playerOn(state, 'P1', { card: [6, null, null] }), 'P2', { card: [3, null, null] }));
    expect(board[0]!.playerId).toBe('P2');
  });
});
