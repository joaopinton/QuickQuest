import { describe, expect, test } from 'vitest';
import {
  BALL_MASS,
  BALL_RADIUS,
  BALL_RG,
  ballHitsPin,
  createBowlingPhysicsWorld,
  pinAxisSegment,
  segmentDistance,
  HEADPIN_Z,
  LANE_LENGTH,
  LINE_SPEED,
  playingLine,
  POCKET_X,
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

  test('senza palla i birilli restano fermi sullo spot (niente cadute da soli)', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      for (let i = 0; i < 300; i++) phys.step(1 / 60); // 5 secondi
      const statuses = phys.getPinStatuses();
      expect(statuses.every((p) => !p.knockedDown && p.tiltAngleDeg < 0.01)).toBe(true);
      expect(PIN_OFFSETS.every((_, i) => phys.isPinStanding(i))).toBe(true);
    } finally {
      phys.dispose();
    }
  });

  test('un birillo sbloccato ma non colpito resta in piedi (base stabile)', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      PIN_OFFSETS.forEach((_, i) => phys.releasePin(i));
      for (let i = 0; i < 300; i++) phys.step(1 / 60);
      expect(phys.getPinStatuses().every((p) => !p.knockedDown && p.tiltAngleDeg < 2)).toBe(true);
    } finally {
      phys.dispose();
    }
  });

  test("i birilli si muovono solo quando la palla entra nella loro hitbox", async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.launchBall({ startX: 0, dir: 0, speed: 8, spin: 0 });
      let firstRelease = -1;
      for (let i = 0; i < 240 && firstRelease < 0; i++) {
        phys.step(1 / 60);
        if (PIN_OFFSETS.some((_, k) => !phys.isPinStanding(k))) firstRelease = i;
        // Finché nessuno è stato toccato, nessuno è caduto
        if (firstRelease < 0) expect(phys.getPinStatuses().some((p) => p.knockedDown)).toBe(false);
      }
      expect(firstRelease).toBeGreaterThan(0);
      // Allo sblocco la palla è al birillo 1: davanti di meno di un raggio più la pancia (+ un passo)
      const gap = HEADPIN_Z - phys.ballBody.translation().z;
      expect(gap).toBeLessThan(BALL_RADIUS + 0.0605 + 8 / 60);
      expect(phys.isPinStanding(0)).toBe(false);

      for (let i = 0; i < 180; i++) phys.step(1 / 60);
      expect(phys.getPinStatuses().filter((p) => p.knockedDown).length).toBeGreaterThan(3);
    } finally {
      phys.dispose();
    }
  });

  test('palla in canalina: nessun birillo toccato, nessuno cade', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      phys.launchBall({ startX: 0.45, dir: 0.05, speed: 7, spin: 0 });
      for (let i = 0; i < 300; i++) phys.step(1 / 60);
      expect(phys.getPinStatuses().some((p) => p.knockedDown)).toBe(false);
    } finally {
      phys.dispose();
    }
  });

  test('hitbox: distanza fra segmenti e contatto palla–birillo', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(segmentDistance(o, { x: 1, y: 0, z: 0 }, { x: 0.5, y: 1, z: -1 }, { x: 0.5, y: 1, z: 1 })).toBeCloseTo(1, 6);
    expect(segmentDistance(o, o, { x: 3, y: 4, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5, 6);
    const axis = pinAxisSegment({ x: 0, y: PIN_HEIGHT / 2, z: 10 }, { x: 0, y: 0, z: 0, w: 1 });
    expect(axis[0].y).toBeCloseTo(0, 6);
    expect(axis[1].y).toBeCloseTo(PIN_HEIGHT, 6);
    const ball = { x: 0, y: BALL_RADIUS, z: 9.5 };
    // Ferma a 50 cm: niente colpo; a 8 m/s in 1/16 s la arriva addosso
    expect(ballHitsPin(ball, { x: 0, y: 0, z: 0 }, axis, 1 / 240)).toBe(false);
    expect(ballHitsPin(ball, { x: 0, y: 0, z: 8 }, axis, 1 / 16)).toBe(true);
    // Passa di lato a 20 cm: fuori dalla hitbox
    expect(ballHitsPin({ ...ball, x: 0.2 }, { x: 0, y: 0, z: 8 }, axis, 1 / 8)).toBe(false);
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
      phys.releasePin(0); // un corpo fisso non espone massa: lo sblocco
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
      // Rapier può riordinare gli assi principali (frame locale ruotato): confronto i valori
      const [minI, , maxI] = [pinI.x, pinI.y, pinI.z].sort((a, b) => a - b);
      expect(minI).toBeCloseTo(inertia.axial, 5);
      expect(maxI).toBeCloseTo(inertia.transverse, 5);
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
      phys.releasePin(0); // in piedi è un corpo fisso: lo sblocco come se fosse stato colpito
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
      expect(phys.ballBody.linvel().x).toBeLessThan(-0.1); // e ha curvato verso sinistra
    } finally {
      phys.dispose();
    }
  });

  /** Tira sulla linea dello spin e misura dove e con che angolo arriva al birillo 1, e i birilli giù. */
  async function throwOnLine(phys: Awaited<ReturnType<typeof createBowlingPhysicsWorld>>, spin: number, speed = LINE_SPEED, aim = 0) {
    const line = playingLine(spin);
    phys.resetPins();
    phys.launchBall({ startX: line.startX, dir: line.dir + aim, speed, spin });
    let hitX = Number.NaN;
    let angleDeg = Number.NaN;
    for (let i = 0; i < 360; i++) {
      phys.step(1 / 60);
      const b = phys.ballBody.translation();
      if (Number.isNaN(hitX) && b.z > HEADPIN_Z - 0.3) {
        const v = phys.ballBody.linvel();
        hitX = b.x;
        angleDeg = (Math.atan2(v.x, v.z) * 180) / Math.PI;
      }
    }
    return { hitX, angleDeg, down: phys.getPinStatuses().filter((p) => p.knockedDown).length };
  }

  test('tiro normale sulla linea: la palla arriva in tasca e fa strike, destri e mancini', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      for (const spin of [0, 0.3, 0.8, 1, -1]) {
        const r = await throwOnLine(phys, spin);
        expect(Math.abs(r.hitX - Math.sign(spin || 1) * POCKET_X)).toBeLessThan(0.015);
        expect(r.down).toBe(10);
      }
    } finally {
      phys.dispose();
    }
  });

  test('più spin = più angolo d’ingresso; più lenta = più curva', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      const straight = await throwOnLine(phys, 0);
      const medium = await throwOnLine(phys, 0.5);
      const strong = await throwOnLine(phys, 1);
      expect(Math.abs(straight.angleDeg)).toBeLessThan(0.2);
      expect(Math.abs(medium.angleDeg)).toBeGreaterThan(1);
      expect(Math.abs(strong.angleDeg)).toBeGreaterThan(Math.abs(medium.angleDeg) + 1);
      // Hook verso -x: la palla lenta ha più tempo per curvare, quella veloce arriva più a destra
      const slow = await throwOnLine(phys, 0.8, LINE_SPEED - 1);
      const fast = await throwOnLine(phys, 0.8, LINE_SPEED + 1);
      expect(slow.hitX).toBeLessThan(POCKET_X - 0.05);
      expect(fast.hitX).toBeGreaterThan(POCKET_X + 0.05);
    } finally {
      phys.dispose();
    }
  });

  test('la mira dal telefono sposta il colpo: lontano dalla tasca niente strike', async () => {
    const phys = await createBowlingPhysicsWorld();
    try {
      const wide = await throwOnLine(phys, 0.5, LINE_SPEED, 0.02); // ~1° a destra: 37 cm sui birilli
      expect(wide.hitX).toBeGreaterThan(POCKET_X + 0.25);
      expect(wide.down).toBeLessThan(10);
    } finally {
      phys.dispose();
    }
  });
});
