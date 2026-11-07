import { describe, expect, test } from 'vitest';
import { LEARN_THROWS, learnFromSwing, MIN_SWING_PEAK, throwFromSwing, type SwingAnalysis } from '../src/swing';

const swing = (peak: number, heading: number | null = 0.4): SwingAnalysis => ({ valid: true, peak, heading, roll: 0 });

describe('taratura automatica dai tiri veri', () => {
  test('il primo tiro valido fissa la direzione dello schermo: quel tiro va dritto', () => {
    const first = swing(8, 1.2);
    const profile = learnFromSwing(null, first);
    expect(profile?.heading0).toBe(1.2);
    expect(throwFromSwing(first, profile).dir).toBeCloseTo(0);
    expect(throwFromSwing(first, null).dir).toBeCloseTo(0);
  });

  test('i tiri non validi o senza direzione non insegnano niente', () => {
    expect(learnFromSwing(null, { valid: false, failure: 'too-weak', peak: 1, heading: null, roll: 0 })).toBeNull();
    expect(learnFromSwing(null, swing(8, null))).toBeNull();
  });

  test('la forza normale è la media dei primi tiri, poi resta ferma', () => {
    let p = learnFromSwing(null, swing(6));
    for (let i = 1; i < LEARN_THROWS; i++) p = learnFromSwing(p, swing(9));
    expect(p?.normalPeak).toBeCloseTo((6 + 9 * (LEARN_THROWS - 1)) / LEARN_THROWS);
    const done = p;
    expect(learnFromSwing(done, swing(14))).toBe(done);
  });

  test('dopo la taratura girarsi di lato sposta la mira', () => {
    const p = learnFromSwing(null, swing(8, 0));
    expect(throwFromSwing(swing(8, 0.3), p).dir).toBeLessThan(0);
    expect(throwFromSwing(swing(8, -0.3), p).dir).toBeGreaterThan(0);
  });

  test('la forza imparata ha dei limiti ragionevoli', () => {
    const p = learnFromSwing(null, swing(MIN_SWING_PEAK));
    expect(p?.normalPeak).toBeGreaterThanOrEqual(MIN_SWING_PEAK * 1.5);
  });
});
