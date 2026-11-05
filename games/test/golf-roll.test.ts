// Rimbalzi e rotolamento per terreno: la palla non si pianta dove cade (tranne nella sabbia).
import { describe, expect, test } from 'vitest';
import { aimPreview, applyShot, createGolf, setClub, stepGolf, touchdown, type Flight, type GolfEvent, type GolfHole, type GolfState, type Lie } from '../golf/screen/rules';

const HOLE: GolfHole = { par: 4, lengthM: 400, greenRadiusM: 14, greenSpeed: 2.5, slopeDegPerM: 0, wind: 0, bunkers: [] };

const landing = (carryM: number, spin = 1): Flight => ({
  headingDeg: 0, speed: 40, airborne: true, carryLeft: 0, carryM, apexM: 20, curveDegPerM: 0, decel: 0,
  hops: 0, runM: 0, spin, isPutt: false,
});

/** Distanza dopo l'atterraggio se tutto il percorso resta sullo stesso terreno. */
function runAfterLanding(lie: Lie, spin = 1): { hops: number; metres: number } {
  let f = touchdown(HOLE, landing(150, spin), lie);
  let metres = 0;
  let hops = 0;
  while (f.airborne) {
    metres += f.carryM;
    hops++;
    f = touchdown(HOLE, f, lie);
  }
  return { hops, metres: metres + (f.speed * f.speed) / (2 * f.decel) };
}

function play(state: GolfState): { state: GolfState; events: GolfEvent[] } {
  let s = state;
  const events: GolfEvent[] = [];
  for (let i = 0; i < 6000 && s.players.some((p) => p.flight); i++) {
    const r = stepGolf(s, 1 / 60);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('rimbalzi e rotolamento', () => {
  test('sul fairway rimbalza due volte e poi corre', () => {
    const r = runAfterLanding('fairway');
    expect(r.hops).toBe(2);
    expect(r.metres).toBeCloseTo(150 * 0.16, 0);
  });

  test('ogni terreno ha la sua corsa: fairway > green > rough > sabbia', () => {
    const fairway = runAfterLanding('fairway').metres;
    const green = runAfterLanding('green').metres;
    const rough = runAfterLanding('rough').metres;
    const bunker = runAfterLanding('bunker');
    expect(fairway).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(rough);
    expect(rough).toBeGreaterThan(bunker.metres);
    expect(bunker.hops).toBe(0); // nella sabbia si pianta
    expect(bunker.metres).toBeLessThan(2);
  });

  test('il wedge ha effetto: corre molto meno del driver', () => {
    expect(runAfterLanding('fairway', 0.45).metres).toBeLessThan(runAfterLanding('fairway', 1.25).metres * 0.5);
  });

  test('un rimbalzo è in aria: ha un\'altezza, e si alza meno del volo', () => {
    const hop = touchdown(HOLE, landing(150), 'fairway');
    expect(hop.airborne).toBe(true);
    expect(hop.apexM).toBeGreaterThan(0.3);
    expect(hop.apexM).toBeLessThan(20);
  });

  test('in partita: il colpo atterra, rimbalza e si ferma più avanti', () => {
    const base = createGolf(['P1'], { seed: 4 }).state;
    const calm = { ...base, course: base.course.map((h) => ({ ...h, wind: 0, bunkers: [] })) };
    const struck = applyShot(setClub(calm, 'P1', 'iron'), 'P1', { kind: 'full', power: 0.7, faceDeg: 0, aimDeg: 0, strokeDeg: 0 });
    const { state, events } = play(struck.state);
    const touches = events.flatMap((e) => (e.kind === 'touchdown' ? [e] : []));
    expect(touches.length).toBeGreaterThanOrEqual(2);
    expect(events.filter((e) => e.kind === 'landed')).toHaveLength(1);
    expect(state.players[0]!.ball.y).toBeGreaterThan(touches[0]!.at.y + 5);
  });

  test('cerchio di mira: carry pieno della mazza verso la bandiera, il vento lo sposta, sul green non c\'è', () => {
    const { state } = createGolf(['P1'], { seed: 4 });
    const p = { ...state.players[0]!, club: 'iron' as const, lie: 'fairway' as const, ball: { x: 0, y: 0 } };
    const calm = aimPreview({ ...HOLE, wind: 0 }, p)!;
    expect(calm.x).toBeCloseTo(0, 5);
    expect(calm.y).toBeCloseTo(150, 5);
    expect(aimPreview({ ...HOLE, wind: 4 }, p)!.x).toBeGreaterThan(2);
    expect(aimPreview({ ...HOLE, wind: -4 }, p)!.x).toBeLessThan(-2);
    expect(aimPreview(HOLE, { ...p, lie: 'green', club: 'putter' })).toBeNull();
  });

  test('una palla che corre dal fairway nel rough rallenta', () => {
    // stessa velocità di partenza, rotola dritta: verso il rough (fuori dal fairway) si ferma prima
    const rolling = (x: number, headingDeg: number): Flight => ({
      headingDeg, speed: 12, airborne: false, carryLeft: 0, carryM: 0, apexM: 0, curveDegPerM: 0, decel: 3.5,
      hops: 3, runM: 0, spin: 1, isPutt: false,
    });
    const base = createGolf(['P1'], { seed: 4 }).state;
    const calm = { ...base, course: base.course.map((h) => ({ ...h, bunkers: [] })), phase: 'flight' as const, turn: null };
    const along = play({ ...calm, players: calm.players.map((p) => ({ ...p, ball: { x: 0, y: 50 }, flight: rolling(0, 0) })) }).state.players[0]!;
    const across = play({ ...calm, players: calm.players.map((p) => ({ ...p, ball: { x: 16, y: 50 }, flight: rolling(16, 90) })) }).state.players[0]!;
    const alongM = along.ball.y - 50;
    const acrossM = across.ball.x - 16;
    expect(acrossM).toBeLessThan(alongM * 0.8);
    expect(across.lie).toBe('rough');
  });
});
