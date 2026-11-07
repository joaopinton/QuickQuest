import { describe, expect, test } from 'vitest';
import { AIM_LEASH, AIM_SPAN_RAD, AIM_STEADY_SCALE, backAngles, createAimPointer } from '../src/aim';
import { DEG2RAD, qFromRotationVector, qMul, type Quaternion } from '../src/math';

// Telefono dritto in verticale, schermo verso il giocatore, retro verso il televisore (+Y del mondo)
const UPRIGHT = qFromRotationVector([Math.PI / 2, 0, 0]);
/** Imbardata nel mondo: > 0 = verso destra (orario visto dall'alto). */
const turnRight = (q: Quaternion, deg: number) => qMul(qFromRotationVector([0, 0, -deg * DEG2RAD]), q);
/** Il retro guarda più in alto (cima del telefono inclinata all'indietro). */
const tiltUp = (q: Quaternion, deg: number) => qMul(qFromRotationVector([deg * DEG2RAD, 0, 0]), q);
/** Rollio attorno al retro, nel frame del telefono. */
const roll = (q: Quaternion, deg: number) => qMul(q, qFromRotationVector([0, 0, deg * DEG2RAD]));

function settle(aim: ReturnType<typeof createAimPointer>, q: Quaternion, frames = 300) {
  for (let i = 0; i < frames; i++) aim.update(q, 1 / 60);
  return aim.reading;
}

describe('mira assoluta col telefono dritto', () => {
  test('telefono dritto: retro orizzontale, nessun beccheggio', () => {
    const a = backAngles(UPRIGHT);
    expect(a.pitch).toBeCloseTo(0);
    expect(backAngles(tiltUp(UPRIGHT, 20)).pitch).toBeCloseTo(20 * DEG2RAD);
    expect(backAngles(turnRight(UPRIGHT, 15)).yaw - a.yaw).toBeCloseTo(15 * DEG2RAD);
  });

  test('dritto davanti = centro; il primo campione fa da riferimento', () => {
    const aim = createAimPointer();
    const r = settle(aim, UPRIGHT);
    expect(r.x).toBeCloseTo(0.5);
    expect(r.y).toBeCloseTo(0.5);
    expect(r.isUpright).toBe(true);
  });

  test('girare a destra sposta a destra, inclinare in su sposta in su, in proporzione', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    const right = settle(aim, turnRight(UPRIGHT, 12));
    expect(right.x).toBeCloseTo(0.5 + (12 * DEG2RAD) / AIM_SPAN_RAD, 2);
    const up = settle(aim, tiltUp(UPRIGHT, 12));
    expect(up.y).toBeCloseTo(0.5 - (12 * DEG2RAD) / AIM_SPAN_RAD, 2);
    expect(up.x).toBeCloseTo(0.5, 2);
  });

  test('stesso orientamento = stesso punto, anche dopo un giro avanti e indietro', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    settle(aim, turnRight(tiltUp(UPRIGHT, -10), -25));
    const back = settle(aim, UPRIGHT);
    expect(back.x).toBeCloseTo(0.5, 3);
    expect(back.y).toBeCloseTo(0.5, 3);
  });

  test('il rollio nel palmo non sposta il cursore', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    const rolled = settle(aim, roll(UPRIGHT, 35));
    expect(rolled.x).toBeCloseTo(0.5, 3);
    expect(rolled.y).toBeCloseTo(0.5, 3);
  });

  test('ricentrare porta al centro la direzione attuale', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    settle(aim, turnRight(UPRIGHT, 20));
    aim.recenter();
    expect(aim.reading.x).toBeCloseTo(0.5);
    expect(settle(aim, UPRIGHT).x).toBeLessThan(0.3);
  });

  test('telefono sdraiato: non è dritto, il cursore va in fondo e non salta di lato', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    const flat = settle(aim, tiltUp(turnRight(UPRIGHT, 0), -88));
    expect(flat.isUpright).toBe(false);
    expect(flat.y).toBe(1);
    expect(flat.x).toBeCloseTo(0.5, 2);
  });

  test('il tremore della mano non muove il cursore', () => {
    const aim = createAimPointer();
    const still = settle(aim, UPRIGHT);
    for (let i = 0; i < 240; i++) {
      const wobble = Math.sin(i * 1.7) * 0.25; // ±0,25°, il tremore di una mano ferma
      aim.update(tiltUp(turnRight(UPRIGHT, wobble), wobble * 0.8), 1 / 60);
      expect(Math.abs(aim.reading.x - still.x)).toBeLessThanOrEqual(AIM_LEASH);
      expect(Math.abs(aim.reading.y - still.y)).toBeLessThanOrEqual(AIM_LEASH);
    }
  });

  test('con la mano ferma il telefono conta la metà, poi il cursore torna dove si punta', () => {
    const aim = createAimPointer();
    settle(aim, UPRIGHT);
    aim.setSteady(true);
    const steady = settle(aim, turnRight(UPRIGHT, 12));
    const full = (12 * DEG2RAD) / AIM_SPAN_RAD;
    expect(steady.x - 0.5).toBeCloseTo(full * AIM_STEADY_SCALE, 1);
    aim.setSteady(false);
    const back = settle(aim, turnRight(UPRIGHT, 12), 240);
    expect(back.x - 0.5).toBeCloseTo(full, 1);
  });
});
