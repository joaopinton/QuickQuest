import { describe, expect, test } from 'vitest';
import {
  BUTTON_ACTION,
  BUTTON_TRACKPAD,
  decodePose,
  encodePose,
  FLAG_CALIBRATED,
  FRAME_TYPE_POSE,
  POSE_FRAME_BYTES,
  rewritePoseSlot,
  type PoseFrame,
} from '../src/pose';

describe('frame binario di posa a 24 byte', () => {
  test('dimensione esatta 24 byte e round-trip di una posa', () => {
    const original: PoseFrame = {
      slot: 'P2',
      seq: 1042,
      ts: 98765432,
      q: [0.35, -0.2, 0.7, 0.58],
      accelMagnitude: 9.81,
      buttons: BUTTON_ACTION | BUTTON_TRACKPAD,
      flags: FLAG_CALIBRATED,
      trackpad: [-0.5, 0.8],
    };

    const buffer = encodePose(original);
    expect(buffer.byteLength).toBe(POSE_FRAME_BYTES);

    const decoded = decodePose(buffer);
    expect(decoded).not.toBeNull();
    expect(decoded?.slot).toBe('P2');
    expect(decoded?.seq).toBe(1042);
    expect(decoded?.ts).toBe(98765432);
    expect(decoded?.buttons).toBe(BUTTON_ACTION | BUTTON_TRACKPAD);
    expect(decoded?.flags).toBe(FLAG_CALIBRATED);

    // Tolleranza per quantizzazione int16 (1/32767 ≈ 0.00003)
    expect(decoded?.q[0]).toBeCloseTo(0.35, 3);
    expect(decoded?.q[1]).toBeCloseTo(-0.2, 3);
    expect(decoded?.q[2]).toBeCloseTo(0.7, 3);
    expect(decoded?.q[3]).toBeCloseTo(0.58, 3);

    // Accelerazione in centesimi di m/s² (tolleranza 0.01)
    expect(decoded?.accelMagnitude).toBeCloseTo(9.81, 2);

    expect(decoded?.trackpad?.[0]).toBeCloseTo(-0.5, 3);
    expect(decoded?.trackpad?.[1]).toBeCloseTo(0.8, 3);
  });

  test('rewritePoseSlot sovrascrive lo slot sul frame senza toccare il resto', () => {
    const original: PoseFrame = {
      slot: 'P1',
      seq: 55,
      ts: 1234,
      q: [0, 0, 0, 1],
      accelMagnitude: 10,
      buttons: 0,
      flags: 0,
      trackpad: [0, 0],
    };

    const buffer = encodePose(original);
    const ok = rewritePoseSlot(buffer, 'P3');
    expect(ok).toBe(true);

    const decoded = decodePose(buffer);
    expect(decoded?.slot).toBe('P3');
    expect(decoded?.seq).toBe(55);
    expect(decoded?.ts).toBe(1234);
  });

  test('rifiuta frame di dimensione non corretta o con tipo non valido', () => {
    expect(decodePose(new ArrayBuffer(10))).toBeNull();
    expect(decodePose(new ArrayBuffer(30))).toBeNull();

    const wrongTypeBuffer = new ArrayBuffer(24);
    new DataView(wrongTypeBuffer).setUint8(0, 0x02);
    expect(decodePose(wrongTypeBuffer)).toBeNull();

    expect(rewritePoseSlot(new ArrayBuffer(10), 'P1')).toBe(false);
  });
});

