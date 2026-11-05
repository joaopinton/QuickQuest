import { describe, expect, test } from 'vitest';
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_RG,
  createBowlingPhysicsWorld,
  HEADPIN_Z,
  LANE_LENGTH,
  LANE_WIDTH,
  OIL_LENGTH,
} from '../bowling/screen/physics';
import {
  computePinInertia,
  createPinGeometry,
  PIN_COM_HEIGHT,
  PIN_HEIGHT,
  PIN_MASS,
  PIN_OFFSETS,
} from '../bowling/screen/pin-geometry';

describe('Bowling Physics & Geometry (USBC Specs)', () => {
  test('costanti dimensionali USBC e masse', () => {
    expect(LANE_LENGTH).toBe(18.29);
    expect(LANE_WIDTH).toBeCloseTo(1.054, 3);
    expect(OIL_LENGTH).toBe(12.0);
    expect(BALL_RADIUS).toBeCloseTo(0.108, 3);
    expect(BALL_MASS).toBeCloseTo(6.4, 1);
    expect(PIN_HEIGHT).toBeCloseTo(0.381, 3);
    expect(PIN_MASS).toBeCloseTo(1.53, 2);
    expect(PIN_OFFSETS).toHaveLength(10);
  });

  test('geometria procedurale dei birilli con colori dei vertici', () => {
    const geo = createPinGeometry();
    const pos = geo.attributes.position;
    const col = geo.attributes.color;
    expect(pos).toBeDefined();
    expect(col).toBeDefined();
    expect(pos?.count ?? 0).toBeGreaterThan(50);

    // Verifica presenza colore rosso nelle fasce del collo
    const colors = col?.array ?? [];
    let foundRed = false;
    let foundIvory = false;
    for (let i = 0; i < colors.length; i += 3) {
      const r = colors[i]!;
      const g = colors[i + 1]!;
      const b = colors[i + 2]!;
      if (r > 0.8 && g < 0.2 && b < 0.2) {
        foundRed = true;
      }
      if (r > 0.9 && g > 0.9 && b > 0.85) {
        foundIvory = true;
      }
    }
    expect(foundRed).toBe(true);
    expect(foundIvory).toBe(true);
    geo.dispose();
  });

  test('mondo fisico Rapier3D: inizializzazione e 10 birilli in posizione', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      expect(phys.pinBodies).toHaveLength(10);
      expect(phys.isBallActive()).toBe(false);

      const statuses = phys.getPinStatuses();
      expect(statuses).toHaveLength(10);
      // All'inizio tutti i 10 birilli sono in piedi
      expect(statuses.every((p) => !p.knockedDown)).toBe(true);

      // Birillo 1 (headpin) a z = 18.29 m
      const p1 = phys.pinBodies[0]!.translation();
      expect(p1.x).toBeCloseTo(0, 2);
      expect(p1.z).toBeCloseTo(HEADPIN_Z, 2);

      // Birilli 7 e 10 sui lati posteriori
      const p7 = phys.pinBodies[6]!.translation();
      const p10 = phys.pinBodies[9]!.translation();
      expect(p7.x).toBeLessThan(-0.35);
      expect(p10.x).toBeGreaterThan(0.35);
    } finally {
      phys.dispose();
    }
  });

  test('lancio della palla e abbattimento birilli', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      // Lancio dritto e potente dritto nella tasca
      phys.launchBall({
        startX: 0.0,
        dir: 0.0,
        speed: 9.0, // 9 m/s (~32 km/h)
        spin: 0.1,
      });

      expect(phys.isBallActive()).toBe(true);

      // Esegui la simulazione per ~2.5 secondi
      const dt = 1 / 60;
      for (let i = 0; i < 150; i++) {
        phys.step(dt);
      }

      // La palla ha colpito il castello dei birilli
      const statuses = phys.getPinStatuses();
      const knocked = statuses.filter((p) => p.knockedDown).length;
      expect(knocked).toBeGreaterThan(0);

      // Reset birilli
      phys.resetPins();
      const resetStatuses = phys.getPinStatuses();
      expect(resetStatuses.every((p) => !p.knockedDown)).toBe(true);
      expect(phys.isBallActive()).toBe(false);
    } finally {
      phys.dispose();
    }
  });

  test('effetto hook nel backend asciutto curva la traiettoria con spin elevato', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      // Lancio con forte spin a sinistra (+1.0)
      phys.launchBall({
        startX: 0.2, // da destra
        dir: 0.0,
        speed: 7.0,
        spin: 1.0, // forte hook verso sinistra
      });

      const dt = 1 / 60;
      // Step fino alla zona back-end asciutta (z > 12m)
      for (let i = 0; i < 110; i++) {
        phys.step(dt);
      }

      const ballPos = phys.ballBody.translation();
      // Con spin positivo (sinistra), la coordinata X deve essersi spostata verso sinistra (< 0.2)
      expect(ballPos.x).toBeLessThan(0.2);
    } finally {
      phys.dispose();
    }
  });
  test('la simulazione corre in tempo reale (regressione timestep Rapier)', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.launchBall({ startX: 0, dir: 0, speed: 7.0, spin: 0 });
      for (let i = 0; i < 60; i++) phys.step(1 / 60); // 1 secondo simulato
      // A 7 m/s la palla dopo 1 s deve essere intorno a z ≈ 7 m, non oltre i birilli
      expect(phys.ballBody.translation().z).toBeLessThan(9);
    } finally {
      phys.dispose();
    }
  });

  test('sweeper: toglie i birilli abbattuti e rimette sullo spot quelli in piedi', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.launchBall({ startX: 0, dir: 0, speed: 9.0, spin: 0.1 });
      for (let i = 0; i < 240; i++) phys.step(1 / 60);
      const before = phys.getPinStatuses();
      const knocked = before.filter((p) => p.knockedDown).length;
      expect(knocked).toBeGreaterThan(0);

      phys.clearKnockedPins();
      expect(phys.isBallActive()).toBe(false);
      const after = phys.getPinStatuses();
      // Stesso conteggio: i tolti restano "abbattuti", quelli in piedi tornano dritti sullo spot
      expect(after.filter((p) => p.knockedDown).length).toBe(knocked);
      after.forEach((p, i) => {
        expect(phys.isPinRemoved(i)).toBe(p.knockedDown);
        if (!p.knockedDown) expect(p.tiltAngleDeg).toBeCloseTo(0, 3);
      });
      for (let i = 0; i < 60; i++) phys.step(1 / 60);
      expect(phys.getPinStatuses().filter((p) => p.knockedDown).length).toBe(knocked);

      phys.resetPins();
      expect(phys.getPinStatuses().every((p) => !p.knockedDown)).toBe(true);
      expect(phys.pinBodies.every((b) => b.isEnabled())).toBe(true);
    } finally {
      phys.dispose();
    }
  });

  test('masse, baricentri e inerzie reali di palla e birilli', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.step(1 / 60); // Rapier aggiorna le proprietà di massa al primo passo
      expect(phys.ballBody.mass()).toBeCloseTo(BALL_MASS, 3);
      const ballI = phys.ballBody.principalInertia();
      expect(ballI.x).toBeCloseTo(BALL_MASS * BALL_RG ** 2, 5);

      const pin = phys.pinBodies[0]!;
      expect(pin.mass()).toBeCloseTo(PIN_MASS, 3);
      // Baricentro a 14.9 cm dalla base (USBC 14.76–15.08 cm), non a metà altezza
      const com = pin.worldCom();
      expect(com.y).toBeCloseTo(PIN_COM_HEIGHT, 3);
      expect(PIN_COM_HEIGHT).toBeGreaterThan(0.1476);
      expect(PIN_COM_HEIGHT).toBeLessThan(0.1508);

      const inertia = computePinInertia();
      const pinI = pin.principalInertia();
      expect(pinI.y).toBeCloseTo(inertia.axial, 5);
      expect(pinI.x).toBeCloseTo(inertia.transverse, 5);
      // Ordine di grandezza di un birillo reale: trasversale ~0.013 kg·m², assiale ~0.0018 kg·m²
      expect(inertia.transverse).toBeGreaterThan(0.01);
      expect(inertia.transverse).toBeLessThan(0.017);
      expect(inertia.axial).toBeLessThan(inertia.transverse / 5);
    } finally {
      phys.dispose();
    }
  });

  test('birillo in volo libero: il momento angolare si conserva', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.world.gravity = { x: 0, y: 0, z: 0 };
      const pin = phys.pinBodies[0]!;
      pin.setTranslation({ x: 0, y: 3, z: 5 }, true); // lontano da tutto
      pin.setAngvel({ x: 4, y: 25, z: -2 }, true); // non allineato agli assi principali
      phys.step(1 / 60); // proprietà di massa inizializzate

      const angularMomentum = () => {
        const q = pin.rotation();
        const w = pin.angvel();
        const { axial, transverse } = computePinInertia();
        // Asse del birillo (y locale) nel mondo
        const a = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
        const dot = a.x * w.x + a.y * w.y + a.z * w.z;
        const k = (axial - transverse) * dot;
        return { x: transverse * w.x + k * a.x, y: transverse * w.y + k * a.y, z: transverse * w.z + k * a.z };
      };

      const before = angularMomentum();
      const w0 = pin.angvel();
      for (let i = 0; i < 30; i++) phys.step(1 / 60);
      const after = angularMomentum();
      const w1 = pin.angvel();
      // Errore d'integrazione del termine giroscopico a 240 Hz: sotto l'1.5% in mezzo secondo
      // di volo con 25 rad/s (un birillo resta in aria ~0.3 s)
      const drift = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
      expect(drift / Math.hypot(before.x, before.y, before.z)).toBeLessThan(0.015);
      // ...mentre la velocità angolare precede (il corpo non è sferico)
      expect(Math.hypot(w1.x - w0.x, w1.y - w0.y, w1.z - w0.z)).toBeGreaterThan(1);
    } finally {
      phys.dispose();
    }
  });

  test("l'attrito porta la palla al rotolamento puro senza forze aggiuntive", async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.launchBall({ startX: 0, dir: 0, speed: 8, spin: 0.6 });
      const slip = () => {
        const v = phys.ballBody.linvel();
        const w = phys.ballBody.angvel();
        // Velocità del punto di contatto: v + ω × (0, −R, 0)
        return Math.hypot(v.x + BALL_RADIUS * w.z, v.z - BALL_RADIUS * w.x);
      };
      expect(slip()).toBeGreaterThan(4); // rilascio in slittamento
      while (phys.ballBody.translation().z < HEADPIN_Z - 1) phys.step(1 / 60);
      expect(slip()).toBeLessThan(0.1); // nel back end rotola
      expect(phys.ballBody.linvel().x).toBeLessThan(-0.2); // e ha curvato verso sinistra
    } finally {
      phys.dispose();
    }
  });

  test('un tiro in tasca con hook fa strike', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      let strikes = 0;
      for (const dir of [0.0125, 0.015, 0.0175]) {
        phys.resetPins();
        phys.launchBall({ startX: 0, dir, speed: 9, spin: 0.6 });
        for (let i = 0; i < 360; i++) phys.step(1 / 60);
        if (phys.getPinStatuses().every((p) => p.knockedDown)) strikes++;
      }
      expect(strikes).toBeGreaterThanOrEqual(2);
    } finally {
      phys.dispose();
    }
  });
});
