import { describe, expect, test } from 'vitest';
import { findHaircut } from '../barber/shared/haircuts';
import {
  edgeSlowdown,
  followPointer,
  HEAD_SPAN,
  edgeTurnRate,
  EDGE_TURN_MAX,
  headYaw,
  isNearCutEdge,
  nearestTurn,
  pointerContact,
  pointerToDir,
  turnChair,
  VIEW_TILT,
} from '../barber/screen/pointing';

describe('puntamento sulla testa', () => {
  test('il centro punta la parte alta della fronte, in alto la cima', () => {
    const d = pointerToDir({ x: 0.5, y: 0.5 }, 0)!;
    expect(d[0]).toBeCloseTo(0);
    expect(d[1]).toBeCloseTo(Math.sin(VIEW_TILT));
    expect(d[2]).toBeCloseTo(Math.cos(VIEW_TILT));
    expect(pointerToDir({ x: 0.5, y: 0.2 }, 0)![1]).toBeGreaterThan(0.9);
  });

  test('destra del puntatore = lato destro della testa (x > 0) vista di fronte', () => {
    expect(pointerToDir({ x: 0.8, y: 0.5 }, 0)![0]).toBeGreaterThan(0.5);
  });

  test('girando la poltrona il centro punta il lato e poi la nuca', () => {
    expect(pointerToDir({ x: 0.5, y: 0.5 }, headYaw(1))![0]).toBeCloseTo(Math.cos(VIEW_TILT));
    expect(pointerToDir({ x: 0.5, y: 0.5 }, headYaw(2))![2]).toBeCloseTo(-Math.cos(VIEW_TILT));
    expect(turnChair(0, -1)).toBe(3);
    expect(turnChair(3, 1)).toBe(0);
    expect(headYaw(2)).toBeCloseTo(-Math.PI);
  });

  test('il puntatore è libero: lontano dalla testa non tocca niente', () => {
    expect(pointerToDir({ x: 1, y: 1 }, 0)).toBeNull();
    expect(pointerToDir({ x: 0.02, y: 0.5 }, 0)).toBeNull();
  });

  test('appena fuori dalla cute tocca il bordo, ma solo se i capelli lì sono lunghi', () => {
    const justOut = { x: 0.5 + HEAD_SPAN * 1.12, y: 0.5 };
    const d = pointerToDir(justOut, 0);
    expect(d).not.toBeNull();
    expect(Math.hypot(d![0], d![1], d![2])).toBeCloseTo(1);
    expect(pointerContact(justOut, 0, () => 0.82)).not.toBeNull();
    expect(pointerContact(justOut, 0, () => 0.06)).toBeNull();
    // sulla cute tocca sempre, anche coi capelli già rasati
    expect(pointerContact({ x: 0.5, y: 0.5 }, 0, () => 0)).not.toBeNull();
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

  test('la poltrona gira da sola solo puntando verso il bordo, dalla parte giusta', () => {
    expect(edgeTurnRate({ x: 0.5, y: 0.5 })).toBe(0);
    expect(edgeTurnRate({ x: 0.5 + HEAD_SPAN * 0.4, y: 0.5 })).toBe(0);
    // a destra il lato destro viene avanti: la testa gira in negativo, come headYaw(1)
    expect(edgeTurnRate({ x: 0.5 + HEAD_SPAN * 1.3, y: 0.5 })).toBeCloseTo(-EDGE_TURN_MAX);
    expect(edgeTurnRate({ x: 0.5 - HEAD_SPAN * 0.9, y: 0.5 })).toBeGreaterThan(0);
    // molto sopra la testa il telefono non sta mirando
    expect(edgeTurnRate({ x: 1, y: 0 })).toBe(0);
  });

  test('il nome della vista è il quarto di giro più vicino', () => {
    expect(nearestTurn(0)).toBe(0);
    expect(nearestTurn(headYaw(1) + 0.3)).toBe(1);
    expect(nearestTurn(headYaw(2))).toBe(2);
    expect(nearestTurn(Math.PI / 2)).toBe(3);
  });
});
