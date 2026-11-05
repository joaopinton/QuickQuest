// Simulatore fisico del Bowling con Rapier3D (docs/games/bowling.md § 4, docs/06 § 2).
// Misure e masse reali USBC. Niente forze "finte": l'hook nasce solo dall'attrito di Coulomb
// tra palla rotante e pista, gli urti solo da restituzione e attrito dei materiali.
// Rapier integra le equazioni di Eulero complete (termine giroscopico incluso), quindi il momento
// angolare di palla e birilli si conserva in volo e cambia solo per gli impulsi di contatto.

import RAPIER from '@dimforge/rapier3d-compat';
import type { BowlingPinStatus, BowlingReleaseData } from '../shared/events';
import {
  computePinInertia,
  PIN_COM_HEIGHT,
  PIN_HEIGHT,
  PIN_MASS,
  PIN_MAX_RADIUS,
  PIN_OFFSETS,
  PIN_PROFILE,
} from './pin-geometry';

export const LANE_LENGTH = 18.29; // metri dalla linea di fallo al birillo 1
export const LANE_WIDTH = 1.054; // metri (39 tavole)
export const OIL_LENGTH = 12.0; // primi 12 metri oliati
export const BALL_RADIUS = 0.108; // 21.6 cm diametro
export const BALL_MASS = 6.4; // 14 lb in kg
/** Raggio giratore della palla (USBC: 2.46"-2.80"); 2.50" = nucleo medio-basso. */
export const BALL_RG = 0.0635;
export const HEADPIN_Z = LANE_LENGTH; // Birillo 1 a z = 18.29 m

// Coefficienti d'attrito (Coulomb) delle superfici
const MU_OIL = 0.04; // pista oliata
const MU_DRY = 0.2; // back end asciutto
const MU_PIN = 0.25; // birillo (acero laccato) contro palla, birilli e pin deck

// Coefficienti di restituzione: Rapier combina con la media, quindi
// palla-birillo (0.7+0.5)/2 = 0.6, birillo-birillo 0.5, birillo-pista 0.25, palla-pista 0.35
const E_BALL = 0.7;
const E_PIN = 0.5;
const E_LANE = 0.0;

// Rilascio: rev rate e rotazione dell'asse crescono con |spin| (docs § 3.3)
const REV_RATE_MIN = 10; // rad/s, palla dritta (~95 rpm)
const REV_RATE_MAX = 35; // rad/s, cranker (~335 rpm)
const AXIS_ROTATION_MAX = (45 * Math.PI) / 180;

// Resistenza al rotolamento di un birillo sdraiato sul pin deck (1/s): agisce solo a contatto
const PIN_ROLLING_RESISTANCE = 1.5;
const PIN_LYING_HEIGHT = PIN_MAX_RADIUS + 0.01; // centro più basso di così = birillo a terra
const PIN_SETTLE_SPEED = 0.15; // m/s sotto cui un birillo è considerato fermo
const PIN_HULL_SEGMENTS = 16; // lati dei poligoni che approssimano le sezioni del birillo
const PIN_HULL_TOLERANCE = 0.0015; // m: scarto massimo tollerato fra hull e profilo reale
/**
 * Base del birillo: cilindro fino al primo anello sopra la base. Il contatto hull convesso–pista in
 * Rapier vibra (il birillo "cammina" e cade da solo in pochi secondi); cilindro–pista è stabile.
 */
const PIN_BASE_RADIUS = PIN_PROFILE[1]![0];
const PIN_BASE_TOP = PIN_PROFILE[2]![1];
/** Gioco minimo fra hitbox: sotto questa distanza (oltre al moto del sottopasso) è un colpo. */
const HIT_MARGIN = 0.004;

/**
 * Collider del birillo: il profilo lathe viene spezzato in tratti convessi (pancia, collo, testa...).
 * Un tratto si allunga finché nessun punto intermedio del profilo sta dentro la corda di più di
 * PIN_HULL_TOLERANCE, così l'unione degli hull coincide col birillo visto (collo stretto compreso).
 * Coordinate relative al centro del corpo (metà altezza).
 */
export function buildPinHullPoints(): Float32Array[] {
  // Via i punti sull'asse e l'anello di base (lo copre il cilindro di base): restano gli anelli sopra
  const profile = PIN_PROFILE.slice(2, -1);
  const hulls: Float32Array[] = [];
  let start = 0;
  while (start < profile.length - 1) {
    let end = start + 1;
    while (end + 1 < profile.length && isConvexRun(profile, start, end + 1)) end++;
    hulls.push(ringsToPoints(profile.slice(start, end + 1)));
    start = end;
  }
  return hulls;
}

function isConvexRun(profile: readonly (readonly [number, number])[], from: number, to: number): boolean {
  const [r0, y0] = profile[from]!;
  const [r1, y1] = profile[to]!;
  for (let i = from + 1; i < to; i++) {
    const [r, y] = profile[i]!;
    const chordR = r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    if (r < chordR - PIN_HULL_TOLERANCE) return false;
  }
  return true;
}

function ringsToPoints(rings: readonly (readonly [number, number])[]): Float32Array {
  const pts = new Float32Array(rings.length * PIN_HULL_SEGMENTS * 3);
  let k = 0;
  for (const [r, y] of rings) {
    for (let j = 0; j < PIN_HULL_SEGMENTS; j++) {
      const a = (j / PIN_HULL_SEGMENTS) * Math.PI * 2;
      pts[k++] = r * Math.cos(a);
      pts[k++] = y - PIN_HEIGHT / 2;
      pts[k++] = r * Math.sin(a);
    }
  }
  return pts;
}

/**
 * Velocità angolare al rilascio. Asse di rotazione orizzontale, ruotato rispetto all'asse di
 * rotolamento puro (x) di un angolo che cresce con |spin|: la componente lungo z fa scivolare il
 * punto di contatto di lato e l'attrito della pista la converte in curva (hook).
 * Con omega = (wx, 0, wz) la velocità del contatto è (vx + R*wz, 0, vz - R*wx).
 */
export function releaseAngularVelocity(spin: number): { x: number; y: number; z: number } {
  const amount = Math.min(1, Math.abs(spin));
  const revRate = REV_RATE_MIN + (REV_RATE_MAX - REV_RATE_MIN) * amount;
  const axisRotation = AXIS_ROTATION_MAX * amount;
  return {
    x: revRate * Math.cos(axisRotation),
    y: 0,
    z: Math.sign(spin) * revRate * Math.sin(axisRotation), // spin > 0: contatto verso +x, hook verso -x
  };
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const EPS = 1e-12;

/** Distanza minima fra i segmenti p1-q1 e p2-q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= EPS) {
    t = e <= EPS ? 0 : clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const gap = sub(
    { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s },
    { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t },
  );
  return Math.sqrt(dot(gap, gap));
}

/** Asse del birillo (base → sommità) dati il centro del corpo e la rotazione. */
export function pinAxisSegment(center: Vec3, q: Vec3 & { readonly w: number }): [Vec3, Vec3] {
  const h = PIN_HEIGHT / 2;
  // Asse y locale ruotato dal quaternione
  const ax = 2 * (q.x * q.y - q.w * q.z);
  const ay = 1 - 2 * (q.x * q.x + q.z * q.z);
  const az = 2 * (q.y * q.z + q.w * q.x);
  return [
    { x: center.x - ax * h, y: center.y - ay * h, z: center.z - az * h },
    { x: center.x + ax * h, y: center.y + ay * h, z: center.z + az * h },
  ];
}

/**
 * Hitbox: la palla è una sfera che spazza il tragitto del sottopasso, il birillo un cilindro
 * (capsula) col raggio della pancia attorno al suo asse. Vero se si toccano entro dt.
 */
export function ballHitsPin(ballPos: Vec3, ballVel: Vec3, pinAxis: readonly [Vec3, Vec3], dt: number): boolean {
  const end = { x: ballPos.x + ballVel.x * dt, y: ballPos.y + ballVel.y * dt, z: ballPos.z + ballVel.z * dt };
  return segmentDistance(ballPos, end, pinAxis[0], pinAxis[1]) <= BALL_RADIUS + PIN_MAX_RADIUS + HIT_MARGIN;
}

export interface PhysicsWorldState {
  readonly world: RAPIER.World;
  readonly ballBody: RAPIER.RigidBody;
  readonly pinBodies: readonly RAPIER.RigidBody[];
  step(dt: number): void;
  launchBall(data: BowlingReleaseData): void;
  resetPins(): void;
  /** Sweeper tra il 1° e il 2° tiro: toglie i birilli abbattuti e rimette sullo spot quelli in piedi. */
  clearKnockedPins(): void;
  /** Il birillo è stato tolto dalla pista dallo sweeper. */
  isPinRemoved(index: number): boolean;
  /** Il birillo è fermo sullo spot, bloccato finché qualcosa non entra nella sua hitbox. */
  isPinStanding(index: number): boolean;
  /** Sblocca un birillo (diventa un corpo dinamico) come se fosse stato colpito. */
  releasePin(index: number): void;
  getPinStatuses(): BowlingPinStatus[];
  isBallActive(): boolean;
  arePinsSettled(): boolean;
  dispose(): void;
}

export async function createBowlingPhysicsWorld(): Promise<PhysicsWorldState> {
  await RAPIER.init();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  world.numSolverIterations = 8; // castello di birilli a contatto: più iterazioni, meno compenetrazioni

  // 1. Collider Pista: divisa in due zone (olio e back-end asciutto)
  const oilColliderDesc = RAPIER.ColliderDesc.cuboid(LANE_WIDTH / 2, 0.05, OIL_LENGTH / 2)
    .setTranslation(0, -0.05, OIL_LENGTH / 2)
    .setFriction(MU_OIL)
    .setRestitution(E_LANE);
  world.createCollider(oilColliderDesc);

  // Zona Back-end asciutta e pin deck: da z = OIL_LENGTH a z = 20.0 m
  const dryLength = 20.0 - OIL_LENGTH;
  const dryColliderDesc = RAPIER.ColliderDesc.cuboid(LANE_WIDTH / 2, 0.05, dryLength / 2)
    .setTranslation(0, -0.05, OIL_LENGTH + dryLength / 2)
    .setFriction(MU_DRY)
    .setRestitution(E_LANE);
  world.createCollider(dryColliderDesc);

  // Canaline sinistra e destra (abbassate a y = -0.05 m per intrappolare le palle)
  const gutterWidth = 0.235;
  const gutterLeftDesc = RAPIER.ColliderDesc.cuboid(gutterWidth / 2, 0.04, 10.0)
    .setTranslation(-LANE_WIDTH / 2 - gutterWidth / 2, -0.09, 10.0)
    .setFriction(0.05);
  world.createCollider(gutterLeftDesc);

  const gutterRightDesc = RAPIER.ColliderDesc.cuboid(gutterWidth / 2, 0.04, 10.0)
    .setTranslation(LANE_WIDTH / 2 + gutterWidth / 2, -0.09, 10.0)
    .setFriction(0.05);
  world.createCollider(gutterRightDesc);

  // Pareti laterali oltre le canaline: impediscono alla palla di uscire di lato dopo la canalina
  for (const side of [-1, 1]) {
    const wallDesc = RAPIER.ColliderDesc.cuboid(0.05, 0.3, 11.0)
      .setTranslation(side * (LANE_WIDTH / 2 + gutterWidth + 0.05), 0.2, 11.0)
      .setFriction(0.1);
    world.createCollider(wallDesc);
  }

  // Pozzetto: fondo e parete posteriore, così i birilli abbattuti si fermano invece di cadere all'infinito
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.0, 0.05, 1.5).setTranslation(0, -0.35, 21.5).setFriction(0.6),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.0, 0.6, 0.05).setTranslation(0, 0.2, 22.95).setRestitution(0.2),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.05, 0.6, 1.5).setTranslation(-1.0, 0.2, 21.5),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.05, 0.6, 1.5).setTranslation(1.0, 0.2, 21.5),
  );

  // 2. Palla: 6.4 kg, inerzia da raggio giratore reale (I = m*RG^2), nessuno smorzamento artificiale
  const ballInertia = BALL_MASS * BALL_RG ** 2;
  const ballBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, BALL_RADIUS, -1.0)
    .setCcdEnabled(true)
    .setLinearDamping(0)
    .setAngularDamping(0);
  const ballBody = world.createRigidBody(ballBodyDesc);

  const ballColliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setMassProperties(
      BALL_MASS,
      { x: 0, y: 0, z: 0 },
      { x: ballInertia, y: ballInertia, z: ballInertia },
      { w: 1, x: 0, y: 0, z: 0 },
    )
    // Attrito 1.0 con regola Min: vince sempre quello della superficie toccata (olio, asciutto, birillo)
    .setFriction(1.0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setRestitution(E_BALL);
  world.createCollider(ballColliderDesc, ballBody);

  // 3. Birilli: forma dal profilo reale, massa 1.53 kg, baricentro USBC a 14.9 cm dalla base,
  // tensore d'inerzia del solido di rotazione (asse del birillo = y locale)
  const pinBodies: RAPIER.RigidBody[] = [];
  const pinHulls = buildPinHullPoints();
  const pinInertia = computePinInertia();
  const pinCom = { x: 0, y: PIN_COM_HEIGHT - PIN_HEIGHT / 2, z: 0 };

  function spawnPin(rx: number, rz: number): RAPIER.RigidBody {
    const pinBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(rx, PIN_HEIGHT / 2, HEADPIN_Z + rz)
      .setAdditionalMassProperties(
        PIN_MASS,
        pinCom,
        { x: pinInertia.transverse, y: pinInertia.axial, z: pinInertia.transverse },
        { w: 1, x: 0, y: 0, z: 0 },
      )
      .setLinearDamping(0)
      .setAngularDamping(0) // in volo il momento angolare si conserva; v. rollingResistance()
      .setCcdEnabled(true)
      .setCanSleep(true);
    const body = world.createRigidBody(pinBodyDesc);

    world.createCollider(
      RAPIER.ColliderDesc.cylinder(PIN_BASE_TOP / 2, PIN_BASE_RADIUS)
        .setTranslation(0, PIN_BASE_TOP / 2 - PIN_HEIGHT / 2, 0)
        .setDensity(0)
        .setFriction(MU_PIN)
        .setRestitution(E_PIN),
      body,
    );
    for (const points of pinHulls) {
      const hull = RAPIER.ColliderDesc.convexHull(points);
      if (!hull) throw new Error('Bowling: hull del birillo non valido');
      // Densità 0: massa e inerzia arrivano tutte dalle proprietà del corpo
      world.createCollider(hull.setDensity(0).setFriction(MU_PIN).setRestitution(E_PIN), body);
    }
    return body;
  }

  // Birilli tolti dallo sweeper (disabilitati fino al prossimo rack completo)
  const removedPins = new Set<number>();
  // Birilli in piedi sullo spot: corpi fissi, non tremano e non cadono finché la palla (o un
  // birillo già in moto) non entra nella loro hitbox. Solo allora diventano dinamici.
  const standingPins = new Set<number>();

  function freeze(i: number) {
    standingPins.add(i);
    pinBodies[i]?.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  }

  function release(i: number) {
    const body = pinBodies[i];
    if (!body || !standingPins.delete(i)) return;
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }

  /** Prima di ogni sottopasso: sblocca i birilli fermi toccati dalla palla o da un birillo in moto. */
  function releaseHitPins(dt: number) {
    if (standingPins.size === 0) return;
    const movers = pinBodies.flatMap((body, i) => {
      if (standingPins.has(i) || removedPins.has(i) || body.isSleeping()) return [];
      const v = body.linvel();
      const w = body.angvel();
      const sweep = (Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z) * (PIN_HEIGHT / 2)) * dt;
      return [{ axis: pinAxisSegment(body.translation(), body.rotation()), reach: 2 * PIN_MAX_RADIUS + sweep + HIT_MARGIN }];
    });
    const ballLive = isThrown && ballBody.isEnabled();
    for (const i of [...standingPins]) {
      const body = pinBodies[i]!;
      const axis = pinAxisSegment(body.translation(), body.rotation());
      const hitByBall = ballLive && ballHitsPin(ballBody.translation(), ballBody.linvel(), axis, dt);
      const hitByPin = movers.some((m) => segmentDistance(m.axis[0], m.axis[1], axis[0], axis[1]) <= m.reach);
      if (hitByBall || hitByPin) release(i);
    }
  }

  function placeOnSpot(body: RAPIER.RigidBody, x: number, z: number) {
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, false);
    body.setTranslation({ x, y: PIN_HEIGHT / 2, z }, true);
    body.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
  }

  function resetPins() {
    removedPins.clear();
    for (let i = 0; i < PIN_OFFSETS.length; i++) {
      const offset = PIN_OFFSETS[i];
      if (!offset) continue;
      const body = pinBodies[i];
      const targetX = offset.x;
      const targetZ = HEADPIN_Z + offset.z;

      if (body) {
        body.setEnabled(true);
        placeOnSpot(body, targetX, targetZ);
      } else {
        const newBody = spawnPin(offset.x, offset.z);
        pinBodies.push(newBody);
      }
      freeze(i);
    }
  }

  let isThrown = false;

  resetPins();

  /** Un birillo sdraiato che rotola sul pin deck perde giri per deformazione al contatto. */
  function rollingResistance(dt: number) {
    const factor = Math.max(0, 1 - PIN_ROLLING_RESISTANCE * dt);
    pinBodies.forEach((body, i) => {
      if (standingPins.has(i) || removedPins.has(i) || body.isSleeping()) return;
      if (body.translation().y > PIN_LYING_HEIGHT) return;
      const w = body.angvel();
      body.setAngvel({ x: w.x * factor, y: w.y * factor, z: w.z * factor }, false);
    });
  }

  function parkBall() {
    isThrown = false;
    ballBody.setEnabled(true);
    ballBody.setTranslation({ x: 0, y: BALL_RADIUS, z: -1.0 }, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  function computeStatuses(): BowlingPinStatus[] {
    return pinBodies.map((body, i) => {
      const offset = PIN_OFFSETS[i] ?? { id: i + 1, x: 0, z: 0 };
      const pos = body.translation();
      if (removedPins.has(i)) {
        return { id: offset.id, knockedDown: true, x: pos.x, z: pos.z, tiltAngleDeg: 90 };
      }
      const rot = body.rotation();

      // Angolo di inclinazione rispetto alla verticale Y:
      // Vettore (0, 1, 0) ruotato dal quaternione del birillo
      // cos(theta) = 1 - 2*(x^2 + z^2)
      const dotUp = 1 - 2 * (rot.x ** 2 + rot.z ** 2);
      const tiltAngleDeg = Math.acos(Math.max(-1, Math.min(1, dotUp))) * (180 / Math.PI);

      // Spostamento dallo spot originale (metri)
      const displacement = Math.hypot(pos.x - offset.x, pos.z - (HEADPIN_Z + offset.z));

      // Criterio USBC: abbattuto se inclinato > 25°, spostato > 12 cm, o caduto nel pozzetto (y < 0.1)
      const knockedDown = tiltAngleDeg > 25 || displacement > 0.12 || pos.y < 0.08 || pos.z > HEADPIN_Z + 1.2;

      return { id: offset.id, knockedDown, x: pos.x, z: pos.z, tiltAngleDeg };
    });
  }

  return {
    world,
    ballBody,
    pinBodies,

    step(dt: number) {
      // Sottopassi (4 substeps a 240 Hz) per collisioni stabili tra birilli veloci (docs/games/bowling.md § 4)
      const substeps = 4;
      const subDt = dt / substeps;
      // Il passo di Rapier va impostato esplicitamente: di default è 1/60 s per ogni world.step(),
      // quindi senza questa riga la simulazione girerebbe 4x più veloce del tempo reale.
      world.timestep = subDt;

      for (let s = 0; s < substeps; s++) {
        releaseHitPins(subDt);
        rollingResistance(subDt);
        world.step();
      }

      // Palla entrata nel pozzetto: la disattivo, così non disturba i birilli che si stanno assestando
      if (isThrown && ballBody.isEnabled() && ballBody.translation().z > HEADPIN_Z + 1.2) {
        ballBody.setEnabled(false);
      }
    },

    launchBall(data: BowlingReleaseData) {
      isThrown = true;
      ballBody.setEnabled(true);

      // La palla tocca la pista al rilascio: nessuna caduta che la farebbe rimbalzare
      const startX = Math.max(-0.45, Math.min(0.45, data.startX));
      ballBody.setTranslation({ x: startX, y: BALL_RADIUS, z: 0.1 }, true);
      ballBody.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);

      const speed = Math.max(3.5, Math.min(11.0, data.speed));
      ballBody.setLinvel({ x: speed * Math.sin(data.dir), y: 0, z: speed * Math.cos(data.dir) }, true);
      // Rilascio in slittamento: i giri (<= 35 rad/s) sono molto meno di v/R (~75 rad/s);
      // l'attrito porta poi la palla al rotolamento puro, conservando il momento angolare
      // attorno al punto di contatto
      ballBody.setAngvel(releaseAngularVelocity(data.spin), true);
      ballBody.wakeUp();
    },

    resetPins() {
      parkBall();
      resetPins();
    },

    clearKnockedPins() {
      const statuses = computeStatuses();
      parkBall();
      statuses.forEach((status, i) => {
        const body = pinBodies[i];
        const offset = PIN_OFFSETS[i];
        if (!body || !offset) return;
        if (status.knockedDown) {
          standingPins.delete(i);
          removedPins.add(i);
          // Parcheggiato lontano dalla pista e disabilitato: non interagisce più con palla e birilli
          body.setTranslation({ x: 0, y: -5, z: HEADPIN_Z + 4 + i * 0.5 }, false);
          body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          body.setEnabled(false);
        } else {
          placeOnSpot(body, offset.x, HEADPIN_Z + offset.z);
          freeze(i);
        }
      });
    },

    isPinRemoved(index: number): boolean {
      return removedPins.has(index);
    },

    isPinStanding(index: number): boolean {
      return standingPins.has(index);
    },

    releasePin(index: number) {
      release(index);
    },

    getPinStatuses(): BowlingPinStatus[] {
      return computeStatuses();
    },

    isBallActive(): boolean {
      if (!isThrown || !ballBody.isEnabled()) return false;
      const pos = ballBody.translation();
      return pos.z < HEADPIN_Z + 2.5 && pos.y > -0.5;
    },

    arePinsSettled(): boolean {
      return pinBodies.every((body, i) => {
        if (standingPins.has(i) || removedPins.has(i) || body.isSleeping()) return true;
        const v = body.linvel();
        const w = body.angvel();
        return Math.hypot(v.x, v.y, v.z) < PIN_SETTLE_SPEED && Math.hypot(w.x, w.y, w.z) < 0.6;
      });
    },

    dispose() {
      world.free();
    },
  };
}
