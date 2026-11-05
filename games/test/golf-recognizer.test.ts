import type { FusedSample } from '@quickquest/motion';
import { describe, expect, test } from 'vitest';
import { createGolfRecognizer, faceFromRotation, FACE_LIMIT_DEG, GRIP_STEADY_MS } from '../golf/controller/recognizer';

const DEG = Math.PI / 180;
const UP: readonly [number, number, number] = [0, 1, 0];

function sample(t: number, gyro: readonly [number, number, number], opts: { still?: boolean; steadyMs?: number; acc?: number; up?: readonly [number, number, number] } = {}): FusedSample {
  return {
    t,
    dtMs: 16,
    gyro,
    acc: [opts.acc ?? 0, 0, 0],
    accG: [0, 9.81, 0],
    q: [1, 0, 0, 0],
    up: opts.up ?? UP,
    still: { rate: 0, isStill: opts.still ?? false, steadyMs: opts.steadyMs ?? 0 },
  };
}

/** Telefono fermo per `ms`, poi uno swing attorno a X con un po' di rollio, poi quiete. */
function swingSequence(peakDeg: number, rollDeg = 0): FusedSample[] {
  const out: FusedSample[] = [];
  let t = 0;
  for (; t <= GRIP_STEADY_MS + 100; t += 16) out.push(sample(t, [0, 0, 0], { still: true, steadyMs: t }));
  for (let k = 0; k <= 200; k += 16, t += 16) {
    const s = Math.sin((Math.PI * k) / 200);
    out.push(sample(t, [peakDeg * DEG * s, 0, -rollDeg * DEG * s], { acc: 25 }));
  }
  for (let k = 0; k < 400; k += 16, t += 16) out.push(sample(t, [0, 0, 0]));
  return out;
}

describe('riconoscimento del colpo di golf', () => {
  test('presa, swing, colpo: uno solo, dopo la finestra di sostituzione', () => {
    const r = createGolfRecognizer();
    const shots = swingSequence(1000).map((s) => r.feed(s)).filter(Boolean);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ kind: 'full' });
    expect(shots[0]!.power).toBeGreaterThan(0.6);
    expect(r.hasGrip).toBe(false); // dopo il colpo si riprende la presa
  });

  test('senza presa (mai fermo) lo swing non vale', () => {
    const r = createGolfRecognizer();
    const seq = swingSequence(1000).map((s) => ({ ...s, still: { rate: 1, isStill: false, steadyMs: 0 } }));
    expect(seq.map((s) => r.feed(s)).filter(Boolean)).toHaveLength(0);
  });

  test('torcere il polso durante il colpo apre la faccia', () => {
    const r = createGolfRecognizer();
    const [shot] = swingSequence(1000, 400).map((s) => r.feed(s)).filter(Boolean);
    expect(shot!.faceDeg).toBeGreaterThan(3);
    expect(faceFromRotation([0, 0, -10])).toBe(FACE_LIMIT_DEG);
    expect(faceFromRotation([0, 0, 0])).toBeCloseTo(0, 9);
  });

  test('la mira viene dal rollio rispetto alla presa', () => {
    const r = createGolfRecognizer();
    for (let t = 0; t <= 600; t += 16) r.feed(sample(t, [0, 0, 0], { still: true, steadyMs: t }));
    const tilted: [number, number, number] = [Math.sin(20 * DEG), Math.cos(20 * DEG), 0];
    r.feed(sample(620, [0, 0, 0], { still: true, steadyMs: 700, up: tilted }));
    expect(Math.abs(r.aimDeg)).toBeGreaterThan(5);
    r.reset();
    expect(r.aimDeg).toBe(0);
  });

  test('putt: ampiezza del movimento tenendo premuto', () => {
    const r = createGolfRecognizer();
    expect(r.releasePutt(0)).toBeNull();
    r.pressPutt(0);
    expect(r.isPutting).toBe(true);
    // 60°/s per 1 s, avanti e indietro → 30° di ampiezza
    for (let t = 16; t <= 1000; t += 16) r.feed(sample(t, [60 * DEG, 0, 0]));
    const p = r.releasePutt(1000)!;
    expect(p.kind).toBe('putt');
    expect(p.strokeDeg).toBeGreaterThan(25);
    expect(p.strokeDeg).toBeLessThan(35);
  });
});
