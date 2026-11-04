import { describe, expect, test } from 'vitest';
import { qConj, qFromRotationVector, qMul, qNormalize, qRotate, type Quaternion, type Vector3 } from '../src/math';
import { analyzeSwing, MAX_DIR_RAD, NORMAL_SPEED, profileFromPractice, throwFromSwing, type SwingSample } from '../src/swing';
import { createMotionTracker } from '../src/tracker';

/**
 * Swing pendolare sintetico: il braccio ruota attorno a un asse orizzontale che dipende da
 * dove si tira (`headingDeg`), il telefono è tenuto con un'impugnatura qualsiasi (`grip`).
 */
function swing(opts: { amp?: number; headingDeg?: number; grip?: Quaternion; roll?: number } = {}) {
  const { amp = 8, headingDeg = 0, grip = [1, 0, 0, 0], roll = 0 } = opts;
  const h = (headingDeg * Math.PI) / 180;
  const axis: Vector3 = [Math.cos(h), Math.sin(h), 0];
  const backMs = 450;
  const fwdMs = 400;
  const dt = 1000 / 60;
  const samples: SwingSample[] = [];
  let theta = 0;
  for (let t = 0; t <= backMs + fwdMs; t += dt) {
    const s = t < backMs
      ? -0.6 * amp * Math.sin((Math.PI * t) / backMs)
      : amp * Math.sin((Math.PI * (t - backMs)) / (2 * fwdMs));
    theta += s * (dt / 1000);
    const q = qNormalize(qMul(qFromRotationVector([axis[0] * theta, axis[1] * theta, 0]), grip));
    const wWorld: Vector3 = [axis[0] * s, axis[1] * s, t > backMs + fwdMs - 150 ? -roll : 0];
    samples.push({ t, gyro: qRotate(qConj(q), wWorld), q });
  }
  return { samples, tRelease: backMs + fwdMs };
}

const GRIPS: Record<string, Quaternion> = {
  'schermo verso l’alto': [1, 0, 0, 0],
  'telefono in verticale': qFromRotationVector([Math.PI / 2, 0, 0]),
  'girato di lato': qFromRotationVector([0, Math.PI / 2, 0]),
  'capovolto': qFromRotationVector([Math.PI, 0, 0]),
  'storto': qFromRotationVector([0.7, -0.4, 1.9]),
};

describe('analisi dello swing indipendente dall’impugnatura', () => {
  test.each(Object.entries(GRIPS))('swing valido con il telefono %s', (_name, grip) => {
    const { samples, tRelease } = swing({ grip });
    const a = analyzeSwing(samples, tRelease);
    expect(a.valid).toBe(true);
    expect(a.peak).toBeGreaterThan(7);
    expect(a.peak).toBeLessThan(8.5);
    expect(a.heading).not.toBeNull();
  });

  test('un movimento leggero non è un lancio', () => {
    const { samples, tRelease } = swing({ amp: 1.5 });
    const a = analyzeSwing(samples, tRelease);
    expect(a).toMatchObject({ valid: false, failure: 'too-weak' });
  });

  test('senza campioni il motivo è chiaro', () => {
    expect(analyzeSwing([], 100)).toMatchObject({ valid: false, failure: 'no-data' });
  });

  test('il pollice alzato un po’ dopo il picco vale lo stesso', () => {
    const { samples, tRelease } = swing();
    expect(analyzeSwing(samples, tRelease + 200).valid).toBe(true);
  });
});

describe('taratura e parametri del tiro', () => {
  const practice = [analyzeSwing(swing().samples, 850), analyzeSwing(swing({ amp: 9 }).samples, 850)];
  const profile = profileFromPractice(practice)!;

  test('un tiro uguale a quello di prova va alla velocità normale e dritto', () => {
    const t = throwFromSwing(analyzeSwing(swing({ amp: 8.5 }).samples, 850), profile);
    expect(t.speed).toBeCloseTo(NORMAL_SPEED, 0);
    expect(Math.abs(t.dir)).toBeLessThan(0.005);
  });

  test('braccio più veloce = palla più veloce', () => {
    const piano = throwFromSwing(analyzeSwing(swing({ amp: 6 }).samples, 850), profile);
    const forte = throwFromSwing(analyzeSwing(swing({ amp: 11 }).samples, 850), profile);
    expect(forte.speed).toBeGreaterThan(piano.speed + 2);
  });

  test('girarsi a sinistra o a destra sposta la mira, con qualsiasi impugnatura', () => {
    const grip = GRIPS.storto!;
    const sx = throwFromSwing(analyzeSwing(swing({ headingDeg: 15, grip }).samples, 850), profile);
    const dx = throwFromSwing(analyzeSwing(swing({ headingDeg: -15, grip }).samples, 850), profile);
    expect(sx.dir).toBeLessThan(-0.03);
    expect(dx.dir).toBeGreaterThan(0.03);
    expect(Math.abs(sx.dir)).toBeLessThanOrEqual(MAX_DIR_RAD);
  });

  test('la rotazione del polso al rilascio dà effetto', () => {
    const t = throwFromSwing(analyzeSwing(swing({ roll: 5 }).samples, 850), profile);
    expect(Math.abs(t.spin)).toBeGreaterThan(0.3);
  });

  test('senza tiri di prova validi non c’è taratura', () => {
    expect(profileFromPractice([analyzeSwing([], 0)])).toBeNull();
  });
});

describe('tracker: dai sensori al lancio passando per il filtro', () => {
  test('swing registrato tra pressione e rilascio, con orientamento stimato dal filtro', () => {
    const tracker = createMotionTracker();
    const grip = GRIPS['telefono in verticale']!;
    const { samples } = swing({ grip });
    // prima dello swing: telefono fermo per farlo assestare
    const still = samples[0]!.q;
    for (let t = -500; t < 0; t += 1000 / 60) {
      tracker.feed({ t, gyro: [0, 0, 0], acc: [0, 0, 0], accG: qRotate(qConj(still), [0, 0, 9.81]) }, t + 1000);
    }
    tracker.press(1000);
    for (const s of samples) {
      tracker.feed({ t: s.t, gyro: s.gyro, acc: [0, 0, 0], accG: qRotate(qConj(s.q), [0, 0, 9.81]) }, s.t + 1000);
    }
    expect(tracker.isPressed).toBe(true);
    const a = tracker.release(1850);
    expect(a.valid).toBe(true);
    expect(a.peak).toBeGreaterThan(7);
    expect(tracker.samples).toBeGreaterThan(50);
  });
});
