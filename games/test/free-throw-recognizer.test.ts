import { DEG2RAD, qFromRotationVector, qMul, qRotate, qConj, WORLD_UP, type FusedSample, type Quaternion, type Vector3 } from '@quickquest/motion';
import { describe, expect, test } from 'vitest';
import { createFreeThrowRecognizer, IDEAL_RELEASE_SPEED } from '../free-throw/controller/recognizer';
import { parseShootEvent, shootEvent } from '../free-throw/shared/events';

/** Costruisce una sequenza di campioni fusi integrando giroscopio e accelerazione. */
function buildGestureTrace(
  steps: readonly {
    readonly durationMs: number;
    readonly worldGyro: Vector3; // rad/s nel mondo
    readonly upAcc: number;      // m/s² verso l'alto
  }[],
  initialQ: Quaternion = [1, 0, 0, 0],
): FusedSample[] {
  const dtMs = 16;
  const dtS = dtMs / 1000;
  let t = 0;
  let q = initialQ;
  const out: FusedSample[] = [];

  for (const seg of steps) {
    const count = Math.max(1, Math.round(seg.durationMs / dtMs));
    for (let i = 0; i < count; i++) {
      t += dtMs;
      // Convertiamo ω del mondo nel frame del telefono: gyro_local = q* ω_world q
      const qInv = qConj(q);
      const localGyro = qRotate(qInv, seg.worldGyro);
      const stepQ = qFromRotationVector([
        localGyro[0] * dtS,
        localGyro[1] * dtS,
        localGyro[2] * dtS,
      ]);
      q = qMul(q, stepQ);
      const up = qRotate(qConj(q), WORLD_UP);
      const acc: Vector3 = [up[0] * seg.upAcc, up[1] * seg.upAcc, up[2] * seg.upAcc];
      const accG: Vector3 = [up[0] * 9.81 + acc[0], up[1] * 9.81 + acc[1], up[2] * 9.81 + acc[2]];
      out.push({
        t,
        dtMs,
        gyro: localGyro,
        acc,
        accG,
        q,
        up,
        still: { rate: Math.hypot(...localGyro), isStill: Math.hypot(...localGyro) < 0.1, steadyMs: 0 },
      });
    }
  }
  return out;
}

describe('riconoscitore del gesto Tiri liberi — Scuola Basket', () => {
  test('gesto scuola basket completo (carico sopra la testa + spinta in alto + chiusura a gancio) dà ottimo angolo e backspin', () => {
    const rec = createFreeThrowRecognizer();
    const trace = buildGestureTrace([
      // 1. Caricamento sopra la fronte (gomito piegato, polso caricato indietro)
      { durationMs: 220, worldGyro: [-1.2, 0, 0], upAcc: 1.5 },
      // 2. Spinta verso l'alto-avanti (estensione del braccio)
      { durationMs: 180, worldGyro: [4.2, 0, 0], upAcc: 9.5 },
      // 3. Chiusura a gancio in cima (frustata decisa del polso in avanti-basso)
      { durationMs: 140, worldGyro: [7.2, 0, 0], upAcc: 6.0 },
    ]);

    rec.press(0);
    for (const s of trace) rec.feed(s);
    const lastT = trace[trace.length - 1]!.t;
    const res = rec.release(lastT);

    expect(res.valid).toBe(true);
    expect(res.shot).not.toBeNull();
    expect(res.wristHookDeg).toBeGreaterThan(30);
    expect(res.shot!.hookQuality).toBeGreaterThan(0.75);
    expect(res.shot!.backspin).toBeGreaterThan(0.75);
    // Angolo di uscita scuola basket (50°–56°)
    expect(res.shot!.releaseAngleDeg).toBeGreaterThanOrEqual(50);
    expect(res.shot!.releaseAngleDeg).toBeLessThanOrEqual(56);
    expect(res.shot!.speed).toBeGreaterThan(IDEAL_RELEASE_SPEED - 0.8);
    expect(res.shot!.speed).toBeLessThan(IDEAL_RELEASE_SPEED + 0.8);
    expect(Math.abs(res.shot!.dir)).toBeLessThan(0.05);
  });

  test('tiro piatto di petto senza chiusura a gancio né spinta verticale ha poco backspin e angolo basso', () => {
    const rec = createFreeThrowRecognizer();
    const trace = buildGestureTrace([
      { durationMs: 250, worldGyro: [0, 0, 0], upAcc: 0 },
      // Movimento debole e piatto senza frustata finale del polso
      { durationMs: 180, worldGyro: [2.6, 0, 0], upAcc: 0.4 },
      { durationMs: 120, worldGyro: [1.2, 0, 0], upAcc: 0.1 },
    ]);

    rec.press(0);
    for (const s of trace) rec.feed(s);
    const res = rec.release(trace[trace.length - 1]!.t);

    expect(res.valid).toBe(true);
    expect(res.shot!.hookQuality).toBeLessThan(0.45);
    expect(res.shot!.backspin).toBeLessThan(0.55);
    expect(res.shot!.releaseAngleDeg).toBeLessThan(48);
  });

  test('indipendenza dalla presa: stesso gesto con telefono ruotato di 90° nel palmo dà lo stesso risultato', () => {
    const steps = [
      { durationMs: 200, worldGyro: [-1.0, 0, 0] as Vector3, upAcc: 1.2 },
      { durationMs: 180, worldGyro: [4.5, 0, 0] as Vector3, upAcc: 8.8 },
      { durationMs: 140, worldGyro: [6.8, 0, 0] as Vector3, upAcc: 5.5 },
    ];
    const recA = createFreeThrowRecognizer();
    const traceA = buildGestureTrace(steps, [1, 0, 0, 0]);
    recA.press(0);
    traceA.forEach((s) => recA.feed(s));
    const resA = recA.release(traceA[traceA.length - 1]!.t);

    // Presa ruotata (schermo inclinato e ruotato)
    const tiltedQ = qFromRotationVector([0.6, 0.8, -0.4]);
    const recB = createFreeThrowRecognizer();
    const traceB = buildGestureTrace(steps, tiltedQ);
    recB.press(0);
    traceB.forEach((s) => recB.feed(s));
    const resB = recB.release(traceB[traceB.length - 1]!.t);

    expect(resA.valid).toBe(true);
    expect(resB.valid).toBe(true);
    expect(resB.shot!.speed).toBeCloseTo(resA.shot!.speed, 2);
    expect(resB.shot!.hookQuality).toBeCloseTo(resA.shot!.hookQuality, 2);
    expect(resB.shot!.releaseAngleDeg).toBeCloseTo(resA.shot!.releaseAngleDeg, 1);
  });

  test('pressione e rilascio a telefono fermo annulla il tiro senza consumare il turno', () => {
    const rec = createFreeThrowRecognizer();
    const trace = buildGestureTrace([
      { durationMs: 300, worldGyro: [0.2, -0.1, 0], upAcc: 0.1 },
    ]);
    rec.press(0);
    trace.forEach((s) => rec.feed(s));
    const res = rec.release(trace[trace.length - 1]!.t);
    expect(res.valid).toBe(false);
    expect(res.failure).toBe('too-weak');
    expect(res.shot).toBeNull();
  });

  test('torsione laterale del polso al rilascio sposta la mira a sinistra o a destra', () => {
    const rec = createFreeThrowRecognizer();
    const trace = buildGestureTrace([
      { durationMs: 180, worldGyro: [-1.0, 0, 0], upAcc: 1.0 },
      { durationMs: 160, worldGyro: [5.5, 0, -2.5], upAcc: 8.5 },
      { durationMs: 140, worldGyro: [6.5, 0, -3.2], upAcc: 5.0 },
    ]);
    rec.press(0);
    trace.forEach((s) => rec.feed(s));
    const res = rec.release(trace[trace.length - 1]!.t);
    expect(res.valid).toBe(true);
    expect(Math.abs(res.shot!.dir)).toBeGreaterThan(0.03);
    expect(res.shot!.dir * DEG2RAD).not.toBe(0);
  });

  test('codec shootEvent / parseShootEvent valida i limiti fisici', () => {
    const ev = shootEvent({
      speed: 7.28,
      releaseAngleDeg: 53,
      backspin: 0.88,
      hookQuality: 0.92,
      dir: -0.02,
    });
    expect(parseShootEvent(ev)).toEqual({
      speed: 7.28,
      releaseAngleDeg: 53,
      backspin: 0.88,
      hookQuality: 0.92,
      dir: -0.02,
    });
    expect(parseShootEvent({ kind: 'other', data: ev.data })).toBeNull();
    expect(parseShootEvent({ kind: 'shoot', data: { ...ev.data, speed: 99 } })).toBeNull();
    expect(parseShootEvent({ kind: 'shoot', data: { ...ev.data, backspin: -0.5 } })).toBeNull();
  });
});

