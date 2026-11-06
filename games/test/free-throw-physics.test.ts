import { describe, expect, test } from 'vitest';
import {
  BACKBOARD_Z,
  BALL_INERTIA,
  BALL_MASS,
  BALL_RADIUS,
  computeAeroForce,
  createFreeThrowPhysicsWorld,
  FREE_THROW_DIST,
  HOOP_Z,
  idealSpeedForAngle,
  NET_RINGS,
  NET_SEGMENTS,
  releaseBackspinOmega,
  RIM_HEIGHT,
  RIM_RADIUS,
} from '../free-throw/screen/physics';

describe('Fisica Tiri liberi (Rapier3D + Aerodinamica + Retina Verlet)', () => {
  test('misure regolamentari FIBA / NBA (docs/games/free-throw.md § Set)', () => {
    expect(RIM_HEIGHT).toBe(3.05);
    expect(RIM_RADIUS).toBeCloseTo(0.225, 3); // Ø 45 cm
    expect(FREE_THROW_DIST).toBe(4.6);
    expect(BACKBOARD_Z).toBe(4.6);
    expect(HOOP_Z).toBeCloseTo(4.225, 3);
    expect(BALL_RADIUS).toBeCloseTo(0.12, 3); // Ø 24 cm
    expect(BALL_MASS).toBeCloseTo(0.62, 2);
    expect(BALL_INERTIA).toBeCloseTo((2 / 3) * 0.62 * 0.12 * 0.12, 6);
  });

  test('aerodinamica: drag opposto al moto e portanza Magnus dal backspin', () => {
    const vel = { x: 0, y: 2.0, z: 6.0 };
    const omegaBackspin = releaseBackspinOmega(0.9); // wx < 0
    const omegaNoSpin = { x: 0, y: 0, z: 0 };

    const fNoSpin = computeAeroForce(vel, omegaNoSpin);
    const fWithSpin = computeAeroForce(vel, omegaBackspin);

    // Il drag frena il moto verso +z
    expect(fNoSpin.z).toBeLessThan(0);
    // Il backspin (wx < 0) con vz > 0 genera portanza verso l'alto (+y) per effetto Magnus
    expect(fWithSpin.y).toBeGreaterThan(fNoSpin.y);
  });

  test('tiro perfetto scuola basket (53° con chiusura a gancio) fa SWISH ("ciuff") e muove la retina Verlet', async () => {
    const phys = await createFreeThrowPhysicsWorld();
    try {
      expect(phys.net.nodes).toHaveLength(NET_RINGS * NET_SEGMENTS);
      const speed = idealSpeedForAngle(53, 0.88);
      phys.launchBall({
        speed,
        releaseAngleDeg: 53,
        backspin: 0.88,
        hookQuality: 0.92,
        dir: 0,
      });

      let maxNetMove = 0;
      for (let i = 0; i < 130; i++) {
        phys.step(1 / 60);
        const disp = phys.net.maxDisplacement();
        if (disp > maxNetMove) maxNetMove = disp;
      }

      const tel = phys.getTelemetry();
      expect(tel.made).toBe(true);
      expect(tel.outcome).toBe('swish');
      expect(tel.touchedRim).toBe(false);
      expect(tel.touchedBackboard).toBe(false);
      expect(tel.hint).toBe('perfect');
      // La retina Verlet si è gonfiata e mossa col passaggio della palla ("ciuff")
      expect(maxNetMove).toBeGreaterThan(0.03);
    } finally {
      phys.dispose();
    }
  });

  test('tiro di tabella (bank shot) sul quadrato del tabellone con backspin entra a canestro', async () => {
    const phys = await createFreeThrowPhysicsWorld();
    try {
      // Un tiro leggermente più lungo che colpisce il quadrato sopra il ferro con buon backspin
      const ideal = idealSpeedForAngle(52, 0.9);
      phys.launchBall({
        speed: ideal + 0.34,
        releaseAngleDeg: 52,
        backspin: 0.95,
        hookQuality: 0.95,
        dir: 0,
      });

      for (let i = 0; i < 160; i++) {
        phys.step(1 / 60);
      }

      const tel = phys.getTelemetry();
      expect(tel.touchedBackboard).toBe(true);
      expect(tel.made).toBe(true);
      expect(['bank-in', 'rim-in']).toContain(tel.outcome);
    } finally {
      phys.dispose();
    }
  });

  test('tiro corto fa airball e dà il suggerimento "short"', async () => {
    const phys = await createFreeThrowPhysicsWorld();
    try {
      phys.launchBall({
        speed: 5.7,
        releaseAngleDeg: 50,
        backspin: 0.6,
        hookQuality: 0.6,
        dir: 0,
      });

      for (let i = 0; i < 140; i++) {
        phys.step(1 / 60);
      }

      const tel = phys.getTelemetry();
      expect(tel.made).toBe(false);
      expect(tel.outcome).toBe('airball');
      expect(tel.hint).toBe('short');
    } finally {
      phys.dispose();
    }
  });

  test('tiro sul ferro rimbalza realisticamente grazie al compound collider toroidale', async () => {
    const phys = await createFreeThrowPhysicsWorld();
    try {
      const ideal = idealSpeedForAngle(53, 0.7);
      // Leggermente corto sul ferro anteriore (-0.21 m dal centro del ferro)
      phys.launchBall({
        speed: ideal - 0.19,
        releaseAngleDeg: 53,
        backspin: 0.7,
        hookQuality: 0.7,
        dir: 0,
      });

      for (let i = 0; i < 150; i++) {
        phys.step(1 / 60);
      }

      const tel = phys.getTelemetry();
      expect(tel.touchedRim).toBe(true);
      expect(tel.rimBounces).toBeGreaterThanOrEqual(1);
    } finally {
      phys.dispose();
    }
  });

  test('tiro storto a sinistra o destra segnala la direzione corretta', async () => {
    const phys = await createFreeThrowPhysicsWorld();
    try {
      const ideal = idealSpeedForAngle(53, 0.8);
      phys.launchBall({
        speed: ideal,
        releaseAngleDeg: 53,
        backspin: 0.8,
        hookQuality: 0.8,
        dir: -0.1, // a sinistra
      });

      for (let i = 0; i < 140; i++) {
        phys.step(1 / 60);
      }

      const tel = phys.getTelemetry();
      expect(tel.made).toBe(false);
      expect(tel.hint).toBe('left');
    } finally {
      phys.dispose();
    }
  });
});

