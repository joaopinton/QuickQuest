// Acqua e fuori limite: +1 colpo; dall'acqua si droppa fuori, dal fuori limite si ritira.
import { describe, expect, test } from 'vitest';
import { outboxFor } from '../golf/screen/flow';
import { hazardAt, makeWater, OOB_HALF_WIDTH_M, waterDrop } from '../golf/screen/hazards';
import { applyShot, createGolf, findPlayer, makeCourse, seededRng, stepGolf, type GolfEvent, type GolfHole, type GolfState, type ShotInput } from '../golf/screen/rules';

const POND = { x: 0, y: 150, rx: 12, ry: 8 };
const HOLE: GolfHole = { par: 4, lengthM: 320, greenRadiusM: 14, greenSpeed: 2.5, slopeDegPerM: 0, wind: 0, bunkers: [], water: [POND] };
const FULL = (power: number, aimDeg = 0): ShotInput => ({ kind: 'full', power, faceDeg: 0, aimDeg, strokeDeg: 0 });

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

/** Partita di un giocatore su una buca fatta a mano, col ferro in mano. */
function onHole(hole: GolfHole): GolfState {
  const base = createGolf(['P1'], { seed: 1 }).state;
  return { ...base, course: [hole], players: base.players.map((p) => ({ ...p, club: 'iron' as const })) };
}

describe('dove sono gli ostacoli', () => {
  test('acqua dentro il laghetto, fuori limite oltre i paletti, dietro il tee e oltre il green', () => {
    expect(hazardAt(HOLE, { x: 0, y: 150 })).toBe('water');
    expect(hazardAt(HOLE, { x: 11, y: 150 })).toBe('water');
    expect(hazardAt(HOLE, { x: 13, y: 150 })).toBeNull();
    expect(hazardAt(HOLE, { x: OOB_HALF_WIDTH_M + 1, y: 100 })).toBe('oob');
    expect(hazardAt(HOLE, { x: 0, y: -30 })).toBe('oob');
    expect(hazardAt(HOLE, { x: 0, y: HOLE.lengthM + 40 })).toBe('oob');
    expect(hazardAt(HOLE, { x: 0, y: HOLE.lengthM })).toBeNull();
  });

  test('il drop dall\'acqua è fuori dall\'acqua, sulla linea verso il punto di partenza', () => {
    const drop = waterDrop(HOLE, { x: 0, y: 150 }, { x: 0, y: 0 });
    expect(hazardAt(HOLE, drop)).toBeNull();
    expect(drop.x).toBeCloseTo(0, 5);
    expect(drop.y).toBeLessThan(POND.y - POND.ry);
    expect(drop.y).toBeGreaterThan(POND.y - POND.ry - 4);
  });

  test('i laghetti generati non toccano green, tee, bunker né i paletti; stesso seme stessa acqua', () => {
    expect(makeCourse(9, 5)).toEqual(makeCourse(9, 5));
    let ponds = 0;
    for (let seed = 1; seed < 40; seed++) {
      for (const h of makeCourse(9, seed)) {
        for (const w of h.water ?? []) {
          ponds++;
          expect(hazardAt(h, { x: 0, y: h.lengthM })).toBeNull();
          expect(hazardAt(h, { x: 0, y: 0 })).toBeNull();
          expect(Math.abs(w.x) + w.rx).toBeLessThan(OOB_HALF_WIDTH_M);
          for (const b of h.bunkers) expect(hazardAt(h, b)).toBeNull();
        }
      }
    }
    expect(ponds).toBeGreaterThan(20); // l'acqua c'è davvero
  });

  test('generatore: senza spazio non mette laghetti', () => {
    const tiny: GolfHole = { ...HOLE, lengthM: 40, water: [] };
    expect(makeWater(tiny, seededRng(3), 18)).toEqual([]);
  });
});

describe('penalità in partita', () => {
  test('in acqua: +1 colpo, palla droppata fuori dall\'acqua, il telefono lo sa', () => {
    // si cerca la potenza con cui il ferro cade (o rotola) nel laghetto a 142–158 m
    const s = onHole(HOLE);
    const power = [0.7, 0.72, 0.74, 0.76, 0.78, 0.8].find((pw) => play(applyShot(s, 'P1', FULL(pw)).state).events.some((e) => e.kind === 'penalty'));
    expect(power).toBeDefined();
    const struck = applyShot(s, 'P1', FULL(power!));
    const { state, events } = play(struck.state);
    const penalty = events.find((e) => e.kind === 'penalty');
    expect(penalty).toMatchObject({ kind: 'penalty', hazard: 'water' });
    const p = findPlayer(state, 'P1')!;
    expect(p.strokes).toBe(2);
    expect(hazardAt(HOLE, p.ball)).toBeNull();
    expect(p.ball.y).toBeLessThan(POND.y - POND.ry);
    const rested = events.find((e) => e.kind === 'rested');
    expect(rested?.kind === 'rested' && rested.record.penalty).toBe('water');
    expect(outboxFor(events, state).cues.some((c) => c.cue.kind === 'error' && /acqua/.test(c.cue.text ?? ''))).toBe(true);
  });

  test('si vola sopra l\'acqua: conta solo dove si tocca terra', () => {
    // laghetto a 72–88 m, il ferro pieno vola 150 m: ci passa sopra
    const s = onHole({ ...HOLE, water: [{ ...POND, y: 80 }] });
    const { events } = play(applyShot(s, 'P1', FULL(1)).state);
    expect(events.some((e) => e.kind === 'penalty')).toBe(false);
  });

  test('fuori limite: +1 colpo e si ritira da dove si era', () => {
    const dry: GolfHole = { ...HOLE, water: [] };
    const s = onHole(dry);
    // mira tutta a destra con il vento forte: la palla esce oltre i paletti
    const windy = { ...s, course: [{ ...dry, wind: 40 }] };
    const { state, events } = play(applyShot(windy, 'P1', FULL(1, 15)).state);
    expect(events.find((e) => e.kind === 'penalty')).toMatchObject({ hazard: 'oob', drop: { x: 0, y: 0 } });
    const p = findPlayer(state, 'P1')!;
    expect(p.strokes).toBe(2);
    expect(p.ball).toEqual({ x: 0, y: 0 });
    expect(p.lie).toBe('tee');
  });
});
