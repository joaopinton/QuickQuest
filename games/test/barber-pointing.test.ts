import { describe, expect, test } from 'vitest';
import { findHaircut } from '../barber/shared/haircuts';
import { isScalp } from '../barber/shared/head';
import {
  easeCursor,
  edgeSlowdown,
  FOLLOW_DEADBAND,
  followYaw,
  HEAD_GAIN,
  headDir,
  headYaw,
  isNearCutEdge,
  LAT_MAX,
  latMin,
  moveOnHead,
  nearestTurn,
  START_CURSOR,
} from '../barber/screen/pointing';

const settleYaw = (lon: number, yaw = 0) => {
  let y = yaw;
  for (let i = 0; i < 600; i++) y = followYaw(y, lon, 1 / 60);
  return y;
};

describe('cursore sulla testa', () => {
  test('il cliente parte con la macchinetta sopra la fronte, sui capelli', () => {
    const d = headDir(START_CURSOR);
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1);
    expect(d[2]).toBeGreaterThan(0.5);
    expect(isScalp(d)).toBe(true);
  });

  test('girare il telefono a destra porta la macchinetta a destra, inclinarlo in su verso la cima', () => {
    const right = moveOnHead(START_CURSOR, 0.1, 0);
    expect(headDir(right)[0]).toBeGreaterThan(headDir(START_CURSOR)[0]);
    const up = moveOnHead(START_CURSOR, 0, -0.1);
    expect(up.lat).toBeCloseTo(START_CURSOR.lat + 0.1 * HEAD_GAIN);
    // `gain` < 1 frena (assist vicino ai bordi)
    expect(moveOnHead(START_CURSOR, 0.1, 0, 0.5).lon).toBeLessThan(right.lon);
  });

  test('il cursore non lascia mai la testa: si ferma sulla cima e poco sotto l\'attaccatura', () => {
    expect(moveOnHead(START_CURSOR, 0, -5).lat).toBe(LAT_MAX);
    const low = moveOnHead(START_CURSOR, 0, 5);
    expect(low.lat).toBeCloseTo(latMin(low.lon));
    // sulla nuca l'attaccatura è più bassa che sulla fronte
    expect(latMin(Math.PI)).toBeLessThan(latMin(0));
  });

  test('continuando a destra si fa il giro della testa', () => {
    let c = START_CURSOR;
    for (let i = 0; i < 40; i++) c = moveOnHead(c, 0.05, 0);
    expect(c.lon).toBeGreaterThan(Math.PI);
  });

  test('il cursore mostrato raggiunge quello vero', () => {
    const goal = { lon: 1, lat: 0.3 };
    const half = easeCursor(START_CURSOR, goal, 1 / 60);
    expect(half.lon).toBeGreaterThan(0);
    expect(half.lon).toBeLessThan(1);
    expect(easeCursor(START_CURSOR, goal, 10)).toEqual(goal);
  });

  test('la poltrona sta ferma finché il cursore è davanti, poi lo segue', () => {
    expect(followYaw(0, FOLLOW_DEADBAND * 0.8, 1 / 60)).toBe(0);
    // cursore sul lato destro: la testa gira come per il quarto di giro "lato destro"
    const yaw = settleYaw(Math.PI / 2);
    expect(yaw).toBeLessThan(0);
    expect(Math.PI / 2 + yaw).toBeCloseTo(FOLLOW_DEADBAND, 2);
    expect(nearestTurn(settleYaw(Math.PI))).toBe(2);
  });

  test('il nome della vista è il quarto di giro più vicino', () => {
    expect(nearestTurn(0)).toBe(0);
    expect(nearestTurn(headYaw(1) + 0.3)).toBe(1);
    expect(nearestTurn(headYaw(2))).toBe(2);
    expect(nearestTurn(Math.PI / 2)).toBe(3);
  });

  test('freno solo vicino ai bordi della cresta', () => {
    const mohawk = findHaircut('mohawk');
    const edge = [0.28, 0.96, 0] as const;
    expect(isNearCutEdge(mohawk, edge)).toBe(true);
    expect(isNearCutEdge(mohawk, [0, 1, 0])).toBe(false);
    expect(edgeSlowdown(mohawk, edge, 0.4)).toBe(0.4);
    expect(edgeSlowdown(mohawk, edge, 1)).toBe(1);
  });
});
