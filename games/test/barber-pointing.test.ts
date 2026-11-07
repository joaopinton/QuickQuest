import { describe, expect, test } from 'vitest';
import { findHaircut } from '../barber/shared/haircuts';
import {
  edgeSlowdown,
  followPointer,
  headYaw,
  isNearCutEdge,
  pointerToDir,
  turnChair,
  VIEW_TILT,
} from '../barber/screen/pointing';

describe('puntamento sulla testa', () => {
  test('il centro punta la parte alta della fronte, in alto la cima', () => {
    const d = pointerToDir({ x: 0.5, y: 0.5 }, 0);
    expect(d[0]).toBeCloseTo(0);
    expect(d[1]).toBeCloseTo(Math.sin(VIEW_TILT));
    expect(d[2]).toBeCloseTo(Math.cos(VIEW_TILT));
    expect(pointerToDir({ x: 0.5, y: 0.2 }, 0)[1]).toBeGreaterThan(0.9);
  });

  test('destra del puntatore = lato destro della testa (x > 0) vista di fronte', () => {
    expect(pointerToDir({ x: 0.8, y: 0.5 }, 0)[0]).toBeGreaterThan(0.5);
  });

  test('girando la poltrona il centro punta il lato e poi la nuca', () => {
    expect(pointerToDir({ x: 0.5, y: 0.5 }, 1)[0]).toBeCloseTo(Math.cos(VIEW_TILT));
    expect(pointerToDir({ x: 0.5, y: 0.5 }, 2)[2]).toBeCloseTo(-Math.cos(VIEW_TILT));
    expect(turnChair(0, -1)).toBe(3);
    expect(turnChair(3, 1)).toBe(0);
    expect(headYaw(2)).toBeCloseTo(-Math.PI);
  });

  test('fuori dalla testa il puntatore resta sul bordo (direzione unitaria)', () => {
    const d = pointerToDir({ x: 1, y: 1 }, 0);
    expect(Math.hypot(d[0], d[1], d[2])).toBeCloseTo(1);
  });

  test('il cursore insegue il telefono e il freno lo rallenta', () => {
    const fast = followPointer({ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, 1 / 60);
    const slow = followPointer({ x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, 1 / 60, 0.4);
    expect(fast.x).toBeGreaterThan(slow.x);
    expect(slow.x).toBeGreaterThan(0.5);
    expect(followPointer({ x: 0, y: 0 }, { x: 1, y: 1 }, 10).x).toBe(1);
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
