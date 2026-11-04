import { describe, expect, test } from 'vitest';
import { createBowlingRecognizer, type BowlingReleaseEvent } from '../src/bowling';
import { createPoseStreamer, POSE_INTERVAL_MS } from '../src/streamer';
import { generateBowlingSwing, generateCancelTrace } from '../src/synth';

function replayTrace(recognizer: ReturnType<typeof createBowlingRecognizer>, trace: ReturnType<typeof generateBowlingSwing>): BowlingReleaseEvent | null {
  let event: BowlingReleaseEvent | null = null;
  recognizer.onRelease((e) => { event = e; });

  const events = [
    ...trace.samples.map((s) => ({ type: 'sample' as const, t: s.t, sample: s })),
    ...trace.buttons.map((b) => ({ type: 'button' as const, t: b.t, down: b.down })),
  ].sort((a, b) => a.t - b.t);

  for (const item of events) {
    if (item.type === 'sample') {
      recognizer.onSample(item.sample);
    } else {
      recognizer.onButton(item.down, item.t);
    }
  }

  return event;
}

describe('riconoscitore gesto Bowling su tracce sintetiche tarate su S1', () => {
  test('lancio medio (amp: 8 rad/s) produce evento valido con velocità attesa', () => {
    const recognizer = createBowlingRecognizer();
    const trace = generateBowlingSwing({ amp: 8 });
    const e = replayTrace(recognizer, trace);

    expect(e).not.toBeNull();
    expect(e?.valid).toBe(true);
    // Velocità stimata = omega * 0.65 m (circa 8 * 0.65 = 5.2 m/s)
    expect(e?.speed).toBeGreaterThan(4.0);
    expect(e?.speed).toBeLessThan(6.5);
    expect(e?.peakForward).toBeGreaterThan(6.0);
    expect(e?.peakBack).toBeLessThan(-3.0);
    expect(Math.abs(e?.spin ?? 1)).toBeLessThan(0.15); // tiro dritto senza rotazione
  });

  test('distinzione tra tiro piano e tiro forte', () => {
    const recognizerPiano = createBowlingRecognizer();
    const ePiano = replayTrace(recognizerPiano, generateBowlingSwing({ amp: 4.5 }));

    const recognizerForte = createBowlingRecognizer();
    const eForte = replayTrace(recognizerForte, generateBowlingSwing({ amp: 12 }));

    expect(ePiano?.valid).toBe(true);
    expect(eForte?.valid).toBe(true);
    expect(eForte!.speed).toBeGreaterThan(ePiano!.speed * 2);
  });

  test('spin: hook a sinistra produce spin positivo, hook a destra negativo', () => {
    const recSx = createBowlingRecognizer();
    const eSx = replayTrace(recSx, generateBowlingSwing({ amp: 8, roll: 6 }));

    const recDx = createBowlingRecognizer();
    const eDx = replayTrace(recDx, generateBowlingSwing({ amp: 8, roll: -6 }));

    expect(eSx?.valid).toBe(true);
    expect(eDx?.valid).toBe(true);
    expect(eSx!.spin).toBeGreaterThan(0.3);
    expect(eDx!.spin).toBeLessThan(-0.3);
  });

  test('annullo: tasto premuto e rilasciato senza swing non lancia la palla', () => {
    const recognizer = createBowlingRecognizer();
    const trace = generateCancelTrace();
    const e = replayTrace(recognizer, trace);

    expect(e).not.toBeNull();
    expect(e?.valid).toBe(false);
    expect(e?.speed).toBe(0);
  });
});

describe('PoseStreamer a 30 Hz', () => {
  test('limita l’emissione dei frame a circa 30 Hz', () => {
    const frames: ArrayBuffer[] = [];
    const streamer = createPoseStreamer({ slot: 'P1', onPoseFrame: (f) => frames.push(f) });

    let t = 1000;
    // Alimentiamo campioni ogni 10 ms (100 Hz come da devicemotion)
    for (let i = 0; i < 20; i++) {
      streamer.feed(t, [1, 0, 0, 0], [0, 0, 9.81], 0, true);
      t += 10;
    }

    // In 200 ms a 30 Hz (intervallo ~33.3 ms) devono essere emessi circa 6 frame, non 20
    expect(frames.length).toBeGreaterThanOrEqual(5);
    expect(frames.length).toBeLessThanOrEqual(7);
    expect(streamer.seq).toBe(frames.length);
  });
});

