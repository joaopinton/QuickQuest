import { describe, expect, test } from 'vitest';
import { createCalibrator } from '../src/calibration';
import { qAngle, qFromRotationVector, swingTwistAngles, type Quaternion } from '../src/math';

describe('calibrazione yaw e rilevamento quiete', () => {
  test('calibrate() azzera lo yaw dell’orientamento corrente', () => {
    const calibrator = createCalibrator();

    // Orientamento con yaw ruotato di 45 gradi attorno a Z
    const qWithYaw = qFromRotationVector([0, 0, Math.PI / 4]);
    calibrator.calibrate(qWithYaw);
    expect(calibrator.isCalibrated).toBe(true);

    // Applicando la calibrazione a qWithYaw lo yaw diventa 0
    const calibratedQ = calibrator.apply(qWithYaw);
    const { twist } = swingTwistAngles(calibratedQ, [0, 0, 1]);
    expect(twist).toBeCloseTo(0, 3);
  });

  test('feedMotion rileva quando il telefono è fermo per 150 ms', () => {
    const calibrator = createCalibrator({ stillnessThreshold: 0.2, stillnessMs: 150 });

    // Telefono in movimento
    expect(calibrator.feedMotion([0.5, 0, 0], 50)).toBe(false);
    expect(calibrator.isStill).toBe(false);

    // Telefono immobile
    calibrator.feedMotion([0.05, 0.02, 0], 50);
    expect(calibrator.isStill).toBe(false);
    calibrator.feedMotion([0.04, 0.01, 0], 50);
    expect(calibrator.isStill).toBe(false);
    // Raggiunti 150 ms da fermo
    calibrator.feedMotion([0.03, 0.01, 0], 50);
    expect(calibrator.isStill).toBe(true);
  });
});

