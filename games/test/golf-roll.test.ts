// Fisica della palla: volo con drag e Magnus, rimbalzi sul terreno, rotolamento in pendenza,
// buca vera con lip-out (games/golf/screen/physics.ts) e terreno a griglia (terrain.ts).
import { describe, expect, test } from 'vitest';
import { CUP_RADIUS_M, launchPutt, stepBall, surfaceOf, FLIGHT_STEP, type BallOutcome, type Flight } from '../golf/screen/physics';
import {
  aimPreview, applyShot, createGolf, makeCourse, stepGolf,
  type Club, type GolfEvent, type GolfHole, type GolfState, type Lie, type Point, type ShotInput,
} from '../golf/screen/rules';
import { hazardAt } from '../golf/screen/hazards';
import { groundGradient, groundHeight, terrainOf, underwater, WATER_SHEET_SCALE, waterLevel } from '../golf/screen/terrain';

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

  test('la palla sta sui triangoli disegnati: quota piana dentro ogni triangolo, uguale ai vertici', () => {
    const hole: GolfHole = { ...HOLE, hills: [{ x: 3, y: 200, heightM: 4, radiusM: 9 }] };
    const f = terrainOf(hole);
    const i = Math.round((2 - f.x0) / f.cell);
    const j = Math.round((198 - f.y0) / f.cell);
    const at = (di: number, dj: number) => f.heights[(j + dj) * f.cols + i + di]!;
    const x = f.x0 + i * f.cell;
    const y = f.y0 + j * f.cell;
    // ai vertici: la quota della griglia
    expect(groundHeight(hole, { x, y })).toBeCloseTo(at(0, 0), 5);
    // triangolo sotto la diagonale (00, 10, 01): piano per i tre vertici
    expect(groundHeight(hole, { x: x + 0.25, y: y + 0.25 })).toBeCloseTo(at(0, 0) + (at(1, 0) - at(0, 0)) * 0.25 + (at(0, 1) - at(0, 0)) * 0.25, 5);
    // triangolo sopra (10, 11, 01)
    expect(groundHeight(hole, { x: x + 0.75, y: y + 0.75 })).toBeCloseTo(at(1, 1) + (at(0, 1) - at(1, 1)) * 0.25 + (at(1, 0) - at(1, 1)) * 0.25, 5);
    // sulla diagonale i due triangoli si toccano: niente gradini
    const onDiag = { x: x + 0.5, y: y + 0.5 };
    expect(groundHeight(hole, { x: onDiag.x - 1e-7, y: onDiag.y - 1e-7 })).toBeCloseTo(groundHeight(hole, { x: onDiag.x + 1e-7, y: onDiag.y + 1e-7 }), 5);
  });

  test("l'acqua è dove si vede: ostacolo solo col terreno sotto il pelo, su tutte le buche", () => {
    let wet = 0;
    for (const hole of makeCourse(9, 21)) {
      for (const w of hole.water ?? []) {
        for (let k = 0; k < 400; k++) {
          const a = (k / 400) * Math.PI * 2 * 7;
          const q = (k / 400) * 1.6;
          const p = { x: w.x + Math.cos(a) * w.rx * q, y: w.y + Math.sin(a) * w.ry * q };
          if (hazardAt(hole, p) === 'oob') continue;
          // sott'acqua in un laghetto qualsiasi della buca (possono essere due)
          const wetHere = (hole.water ?? []).some((o) => Math.hypot((p.x - o.x) / o.rx, (p.y - o.y) / o.ry) < WATER_SHEET_SCALE && groundHeight(hole, p) < waterLevel(hole, o));
          expect(hazardAt(hole, p) === 'water').toBe(wetHere);
          expect(underwater(hole, p) !== null).toBe(wetHere);
          if (wetHere) wet++;
        }
      }
    }
    expect(wet).toBeGreaterThan(50);
  });

  test('i laghetti stanno in una conca: il pelo dell\'acqua è sotto il prato attorno', () => {
    const pond = { x: 0, y: 150, rx: 10, ry: 8 };
    const hole: GolfHole = { ...HOLE, water: [pond] };
    expect(groundHeight(hole, { x: 0, y: 150 })).toBeLessThan(waterLevel(hole, pond));
    expect(groundHeight(hole, { x: 0, y: 140 })).toBeGreaterThan(waterLevel(hole, pond));
  });
});

/** Palla da `ball` con il volo `f`, passo dopo passo finché non succede qualcosa di finale. */
function runBall(hole: GolfHole, ball: Point, f: Flight): { kind: BallOutcome['kind']; at: Point } {
  let p = ball;
  let fl = f;
  for (let i = 0; i < 20000; i++) {
    const r = stepBall(hole, p, fl, FLIGHT_STEP);
    p = r.ball;
    fl = r.flight;
    if (r.outcome.kind === 'holed' || r.outcome.kind === 'rested' || r.outcome.kind === 'hazard') return { kind: r.outcome.kind, at: p };
  }
  return { kind: 'moving', at: p };
}

describe('la buca', () => {
  /** Palla che rotola dritta alla buca e ci arriva a `speed` m/s. */
  const rollAt = (speed: number, x = 0) => {
    const from = { x, y: 398 };
    const v0 = Math.sqrt(speed * speed + 2 * surfaceOf(HOLE, 'green').roll * (2 - CUP_RADIUS_M));
    return runBall(HOLE, from, { ...launchPutt(HOLE, from, 0, 0), vy: v0 });
  };

  test('la buca della fisica è quella disegnata (30 cm di raggio)', () => {
    expect(CUP_RADIUS_M).toBeCloseTo(0.3, 5);
  });

  test('rotolando: al centro entra fino a ~1,8 m/s, più forte esce; di striscio entra se è lenta', () => {
    expect(rollAt(0.5).kind).toBe('holed');
    expect(rollAt(1.7).kind).toBe('holed');
    expect(rollAt(2.8).kind).not.toBe('holed');
    expect(rollAt(0.8, 0.2).kind).toBe('holed');
    // appena fuori dal bordo passa accanto
    expect(rollAt(0.8, CUP_RADIUS_M + 0.05).kind).not.toBe('holed');
  });

  test('al volo: piano nella buca resta dentro, forte sbatte sulla parete ed esce oltre', () => {
    const z0 = groundHeight(HOLE, { x: 0, y: 400 }) + 0.3;
    const flying = (vy: number, y: number): Flight => ({ ...launchPutt(HOLE, { x: 0, y }, 0, 0), airborne: true, isPutt: false, hops: 1, z: z0, vy, vz: -1 });
    // in ~0,16 s scende di 30 cm: si parte in modo da toccare terra al centro della buca
    expect(runBall(HOLE, { x: 0, y: 400 - 1.5 * 0.16 }, flying(1.5, 400 - 1.5 * 0.16)).kind).toBe('holed');
    const fast = runBall(HOLE, { x: 0, y: 400 - 9 * 0.16 }, flying(9, 400 - 9 * 0.16));
    expect(fast.kind).not.toBe('holed');
    expect(fast.at.y).toBeGreaterThan(400 + CUP_RADIUS_M);
  });

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
