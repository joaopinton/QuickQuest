import { describe, expect, test } from 'vitest';
import {
  angleBetween,
  cross,
  dot,
  fromProtocolQ,
  norm,
  normalize,
  principalAxis,
  qAngle,
  qConj,
  qFromRotationVector,
  qFromTo,
  qIdentity,
  qMul,
  qNormalize,
  qRotate,
  swingTwistAngles,
  toProtocolQ,
  type Quaternion,
  type Vector3,
} from '../src/math';

describe('math: vettori 3D e quaternioni', () => {
  test('operazioni sui vettori', () => {
    const a: Vector3 = [1, 0, 0];
    const b: Vector3 = [0, 1, 0];

    expect(dot(a, b)).toBe(0);
    expect(cross(a, b)).toEqual([0, 0, 1]);
    expect(norm([3, 4, 0])).toBe(5);
    expect(normalize([0, 10, 0])).toEqual([0, 1, 0]);
    expect(angleBetween(a, b)).toBeCloseTo(Math.PI / 2, 5);
  });

  test('principalAxis estrae l’asse di massima varianza', () => {
    // Matrice diagonale con varianza massima lungo l'asse X
    const m = [
      [10, 0, 0],
      [0, 2, 0],
      [0, 0, 1],
    ];
    const axis = principalAxis(m);
    expect(Math.abs(axis[0])).toBeCloseTo(1, 3);
    expect(axis[1]).toBeCloseTo(0, 3);
    expect(axis[2]).toBeCloseTo(0, 3);
  });

  test('quaternioni: moltiplicazione, rotazione e coniugato', () => {
    // Rotazione di 90° attorno all'asse Z: cos(45°) + k sin(45°)
    const q90Z = qFromRotationVector([0, 0, Math.PI / 2]);
    const v: Vector3 = [1, 0, 0];
    const rotated = qRotate(q90Z, v);

    expect(rotated[0]).toBeCloseTo(0, 4);
    expect(rotated[1]).toBeCloseTo(1, 4);
    expect(rotated[2]).toBeCloseTo(0, 4);

    // Coniugato inverte la rotazione
    const reverted = qRotate(qConj(q90Z), rotated);
    expect(reverted[0]).toBeCloseTo(1, 4);
    expect(reverted[1]).toBeCloseTo(0, 4);
    expect(reverted[2]).toBeCloseTo(0, 4);
  });

  test('swingTwistAngles separa twist su un asse dallo swing residuo', () => {
    // Pura rotazione attorno a Z (twist = 45°, swing = 0)
    const qTwist = qFromRotationVector([0, 0, Math.PI / 4]);
    const { twist, swing } = swingTwistAngles(qTwist, [0, 0, 1]);
    expect(twist).toBeCloseTo(Math.PI / 4, 3);
    expect(swing).toBeCloseTo(0, 3);
  });

  test('conversione bidirezionale formato protocollo posa', () => {
    const q: Quaternion = [0.7071, 0, 0, 0.7071];
    const proto = toProtocolQ(q);
    expect(proto).toEqual([0, 0, 0.7071, 0.7071]);
    const restored = fromProtocolQ(proto);
    expect(restored).toEqual(q);
  });
});

