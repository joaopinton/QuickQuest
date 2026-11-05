// Fisica della palla: volo con drag e Magnus, rimbalzi sul terreno, rotolamento in pendenza,
// buca vera con lip-out (games/golf/screen/physics.ts) e terreno a griglia (terrain.ts).
import { describe, expect, test } from 'vitest';
import { launchPutt, stepBall, FLIGHT_STEP, type Flight } from '../golf/screen/physics';
import {
  aimPreview, applyShot, createGolf, makeCourse, stepGolf,
  type Club, type GolfEvent, type GolfHole, type GolfState, type Lie, type Point, type ShotInput,
} from '../golf/screen/rules';
import { groundGradient, groundHeight, waterLevel } from '../golf/screen/terrain';

const HOLE: GolfHole = { par: 4, lengthM: 400, greenRadiusM: 14, greenSpeed: 2.5, slopeDegPerM: 0, wind: 0, bunkers: [] };
const FULL = (power: number, faceDeg = 0): ShotInput => ({ kind: 'full', power, faceDeg, aimDeg: 0, strokeDeg: 0 });

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

/** Un colpo su una buca fatta a mano; dove si ferma e dove ha toccato terra la prima volta. */
function shoot(hole: GolfHole, club: Club, lie: Lie, ball: Point, shot: ShotInput) {
  const base = createGolf(['P1'], { seed: 1 }).state;
  const s: GolfState = { ...base, course: [hole], players: base.players.map((p) => ({ ...p, club, lie, ball })) };
  const { state, events } = play(applyShot(s, 'P1', shot).state);
  const touches = events.flatMap((e) => (e.kind === 'touchdown' ? [e] : []));
  return { player: state.players[0]!, events, touches, landing: touches[0]?.at };
}

/** Una palla che rotola libera da `ball` a velocità (vx, vy): dove si ferma. */
function rollFrom(hole: GolfHole, ball: Point, vx: number, vy: number): Point {
  let f: Flight = { ...launchPutt(hole, ball, 0, 0), vx, vy };
  let p = ball;
  for (let i = 0; i < 20000; i++) {
    const r = stepBall(hole, p, f, FLIGHT_STEP);
    p = r.ball;
    f = r.flight;
    if (r.outcome.kind !== 'moving') break;
  }
  return p;
}

describe('volo', () => {
  test('a piena potenza ogni mazza vola il suo carry su terreno piatto', () => {
    expect(shoot(HOLE, 'driver', 'tee', { x: 0, y: 0 }, FULL(1)).landing!.y).toBeCloseTo(210, 0);
    expect(shoot(HOLE, 'iron', 'fairway', { x: 0, y: 0 }, FULL(1)).landing!.y).toBeCloseTo(150, 0);
    expect(shoot(HOLE, 'wedge', 'fairway', { x: 0, y: 0 }, FULL(1)).landing!.y).toBeCloseTo(70, 0);
  });

  test('il wedge sale più ripido del driver', () => {
    const apex = (club: Club) => {
      const base = createGolf(['P1'], { seed: 1 }).state;
      let s: GolfState = applyShot({ ...base, course: [HOLE], players: base.players.map((p) => ({ ...p, club })) }, 'P1', FULL(1)).state;
      let top = 0;
      while (s.players[0]!.flight?.airborne) {
        s = stepGolf(s, 1 / 60).state;
        top = Math.max(top, s.players[0]!.flight?.heightM ?? 0);
      }
      return top;
    };
    // a parità di distanza il wedge sale molto di più
    expect(apex('wedge') / 70).toBeGreaterThan((apex('driver') / 210) * 1.5);
  });

  test('il vento laterale porta la palla; il cerchio di mira lo sa', () => {
    const p = { ...createGolf(['P1'], { seed: 4 }).state.players[0]!, club: 'iron' as const, lie: 'fairway' as const, ball: { x: 0, y: 0 } };
    const calm = aimPreview(HOLE, p)!;
    expect(calm.x).toBeCloseTo(0, 3);
    expect(calm.y).toBeCloseTo(150, 0);
    expect(aimPreview({ ...HOLE, wind: 4 }, p)!.x).toBeGreaterThan(2);
    expect(aimPreview({ ...HOLE, wind: -4 }, p)!.x).toBeLessThan(-2);
    expect(aimPreview(HOLE, { ...p, lie: 'green', club: 'putter' })).toBeNull();
  });

  test('faccia aperta: slice a destra, curva anche in volo (non solo in partenza)', () => {
    const open = shoot(HOLE, 'iron', 'fairway', { x: 0, y: 0 }, FULL(1, 8));
    const touch = open.landing!;
    expect(touch.x).toBeGreaterThan(8);
    // la curva cresce nel volo: a metà carry la palla è meno spostata che in proporzione
    expect(touch.x / touch.y).toBeGreaterThan(Math.tan((8 * 0.35 * Math.PI) / 180) * 1.3);
  });
});

describe('rimbalzi', () => {
  test('sul fairway rimbalza e corre; il driver corre più del wedge', () => {
    const drive = shoot(HOLE, 'driver', 'tee', { x: 0, y: 0 }, FULL(1));
    const wedge = shoot(HOLE, 'wedge', 'fairway', { x: 0, y: 0 }, FULL(1));
    expect(drive.touches.length).toBeGreaterThanOrEqual(2);
    expect(drive.events.filter((e) => e.kind === 'landed')).toHaveLength(1);
    const driveRun = drive.player.ball.y - drive.landing!.y;
    const wedgeRun = wedge.player.ball.y - wedge.landing!.y;
    expect(driveRun).toBeGreaterThan(15);
    expect(driveRun).toBeLessThan(50);
    expect(wedgeRun).toBeLessThan(driveRun * 0.4);
  });

  test('sul green il wedge morde: si ferma entro un paio di metri, anche tornando indietro', () => {
    const r = shoot(HOLE, 'wedge', 'fairway', { x: 0, y: 335 }, FULL(0.9));
    expect(r.player.lie).toBe('green');
    expect(Math.abs(r.player.ball.y - r.landing!.y)).toBeLessThan(2.5);
  });

  test('nella sabbia la palla si pianta; nel rough corre meno che sul fairway', () => {
    const bunker: GolfHole = { ...HOLE, bunkers: [{ x: 0, y: 150, radiusM: 9 }] };
    const inSand = shoot(bunker, 'iron', 'fairway', { x: 0, y: 0 }, FULL(1));
    expect(inSand.player.lie).toBe('bunker');
    expect(Math.abs(inSand.player.ball.y - inSand.landing!.y)).toBeLessThan(3);
    // stessa velocità, rotolando: verso il rough si ferma prima
    const along = rollFrom(HOLE, { x: 0, y: 50 }, 0, 12);
    const across = rollFrom(HOLE, { x: 16, y: 50 }, 12, 0);
    expect(across.x - 16).toBeLessThan((along.y - 50) * 0.8);
  });

  test('in partita: atterra, rimbalza e si ferma più avanti', () => {
    const base = createGolf(['P1'], { seed: 4 }).state;
    const calm = { ...base, course: base.course.map((h) => ({ ...h, wind: 0, bunkers: [], water: [] })) };
    const { state, events } = play(applyShot(calm, 'P1', FULL(0.7)).state);
    const touches = events.flatMap((e) => (e.kind === 'touchdown' ? [e] : []));
    expect(touches.length).toBeGreaterThanOrEqual(2);
    expect(state.players[0]!.ball.y).toBeGreaterThan(touches[0]!.at.y + 5);
  });
});

describe('terreno', () => {
  test('stesso seme, stesse colline; il campo ha rilievi veri', () => {
    expect(makeCourse(3, 9)).toEqual(makeCourse(3, 9));
    const hole = makeCourse(3, 9)[0]!;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < hole.lengthM; y += 3) {
      for (let x = -45; x <= 45; x += 3) {
        const h = groundHeight(hole, { x, y });
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    expect(hi - lo).toBeGreaterThan(2);
  });

  test('tee piano, green su un piano inclinato come dice la pendenza', () => {
    const hole: GolfHole = { ...HOLE, slopeDegPerM: 1, hills: [{ x: 10, y: 395, heightM: 3, radiusM: 20 }] };
    expect(groundHeight(hole, { x: 0, y: 0 })).toBeCloseTo(0, 5);
    const g1 = groundGradient(hole, { x: -5.5, y: 398.5 });
    const g2 = groundGradient(hole, { x: 5.5, y: 401.5 });
    expect(g1.x).toBeCloseTo(-0.02, 3);
    expect(g2.x).toBeCloseTo(-0.02, 3);
    expect(g1.y).toBeCloseTo(0, 3);
  });

  test('la palla scende dalle colline: lasciata ferma su un pendio ripido, rotola a valle', () => {
    const hole: GolfHole = { ...HOLE, hills: [{ x: 10, y: 200, heightM: 6, radiusM: 12 }] };
    const start = { x: 4, y: 200 };
    const rest = rollFrom(hole, start, 0, 0);
    expect(groundHeight(hole, rest)).toBeLessThan(groundHeight(hole, start) - 1);
    expect(rest.x).toBeLessThan(start.x);
  });

  test('putt in pendenza: la palla scende verso il basso del green', () => {
    const tilted: GolfHole = { ...HOLE, slopeDegPerM: 1 }; // scende verso destra
    const end = rollFrom(tilted, { x: 0, y: 392 }, 0, Math.sqrt(2 * 0.5 * 8));
    expect(end.x).toBeGreaterThan(0.3);
  });

  test('i laghetti stanno in una conca: il pelo dell\'acqua è sotto il prato attorno', () => {
    const pond = { x: 0, y: 150, rx: 10, ry: 8 };
    const hole: GolfHole = { ...HOLE, water: [pond] };
    expect(groundHeight(hole, { x: 0, y: 150 })).toBeLessThan(waterLevel(hole, pond));
    expect(groundHeight(hole, { x: 0, y: 140 })).toBeGreaterThan(waterLevel(hole, pond));
  });
});

describe('la buca', () => {
  const putt = (lengthM: number) => shoot(HOLE, 'putter', 'green', { x: 0, y: 396 }, { kind: 'putt', power: 0, faceDeg: 0, aimDeg: 0, strokeDeg: lengthM / (0.09 * 2.5) });

  test('dritto alla buca a velocità giusta: dentro', () => {
    expect(putt(4).player.result).toBe('holed');
    expect(putt(5.5).player.result).toBe('holed');
  });

  test('troppo forte: salta il foro o sbatte sul bordo ed esce', () => {
    const r = putt(9);
    expect(r.player.result).toBe('playing');
    // il bordo l'ha frenata: si ferma molto prima dei 5 m oltre che farebbe sul piano
    expect(r.player.ball.y - 400).toBeLessThan(3);
  });
});
