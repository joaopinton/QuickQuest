// Simulatore fisico dei Tiri liberi con Rapier3D + Aerodinamica + Retina Verlet 3D
// (docs/games/free-throw.md § Simulazione, docs/06 § 2).
//
// Misure regolamentari FIBA / NBA:
// - Ferro a 3,05 m da terra, diametro interno 45 cm (raggio 0,225 m), restitution 0,6.
// - Lunetta a 4,60 m dal tabellone; centro del ferro a 4,225 m dalla lunetta.
// - Palla misura 7: diametro 24 cm (raggio 0,12 m), massa 0,62 kg, I = 2/3 m R².
// - Tabellone 1,80 × 1,05 m, bordo inferiore a 2,90 m, restitution 0,7.
// - Aerodinamica in volo: Drag + effetto Magnus (backspin dalla chiusura a gancio).
// - Retina: rete Verlet di 6 anelli × 12 nodi (72 punti) che interagisce con la palla ("ciuff").

import RAPIER from '@dimforge/rapier3d-compat';
import type { FreeThrowShotData, ResolvedOutcome, ShotFeedbackHint } from '../shared/events';

// ---------- Costanti dimensionali FIBA / NBA ----------
export const RIM_HEIGHT = 3.05; // m da terra
export const RIM_RADIUS = 0.225; // m (diametro interno 45 cm)
export const RIM_TUBE_RADIUS = 0.01; // m (spessore tubo d'acciaio)
export const FREE_THROW_DIST = 4.6; // m dalla lunetta al tabellone
export const RIM_BRACKET_LEN = 0.15; // m staffa tra tabellone e bordo posteriore del ferro
export const BACKBOARD_Z = FREE_THROW_DIST; // z = 4.60 m
export const HOOP_Z = BACKBOARD_Z - RIM_BRACKET_LEN - RIM_RADIUS; // z = 4.225 m
export const BACKBOARD_WIDTH = 1.8; // m
export const BACKBOARD_HEIGHT = 1.05; // m
export const BACKBOARD_BOTTOM_Y = 2.9; // m da terra
export const BACKBOARD_THICKNESS = 0.05; // m
export const TARGET_SQUARE_WIDTH = 0.59; // m
export const TARGET_SQUARE_HEIGHT = 0.45; // m

export const BALL_RADIUS = 0.12; // m (diametro 24 cm)
export const BALL_MASS = 0.62; // kg
/** Momento d'inerzia di un guscio sferico gonfiato: I = (2/3) m R². */
export const BALL_INERTIA = (2 / 3) * BALL_MASS * BALL_RADIUS * BALL_RADIUS;

/** Punto di rilascio sopra la testa del tiratore in lunetta (z = 0). */
export const RELEASE_POS = { x: 0, y: 2.15, z: 0 } as const;

// Restituzioni e attriti (Rapier usa la media di default, o regole esplicite)
export const E_RIM = 0.6;
export const E_BACKBOARD = 0.7;
export const E_FLOOR = 0.76;
const MU_RIM = 0.48; // attrito ferro-palla: trasforma il backspin in "shooter's roll" morbido
const MU_BACKBOARD = 0.38;
const MU_FLOOR = 0.65;

// Costanti aerodinamiche (aria a 20°C: ρ = 1.225 kg/m³, A = π R² = 0.04524 m²)
const AIR_DENSITY = 1.225;
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const CD_DRAG = 0.47;
/** Coefficiente F_drag = -DRAG_K * |v| * v (N). */
export const DRAG_K = 0.5 * AIR_DENSITY * CD_DRAG * BALL_AREA; // ~0.0130 kg/m
/** Coefficiente effetto Magnus F_M = MAGNUS_K * (ω × v) (N). */
export const MAGNUS_K = 0.00042;

/** Backspin massimo al rilascio (rad/s): ~5.5 giri/s = 34.5 rad/s. */
export const MAX_BACKSPIN_RAD_S = 34.5;
export const MIN_BACKSPIN_RAD_S = 5.0;

const DEG2RAD = Math.PI / 180;
const GRAVITY_Y = -9.81;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Calcola la forza aerodinamica (Drag + Magnus) agente sulla palla in volo.
 * Con moto verso +z e backspin `wx < 0`, `ω × v` ha componente y = -wx * vz > 0 (portanza).
 */
export function computeAeroForce(vel: Vec3, angVel: Vec3): Vec3 {
  const speed = Math.hypot(vel.x, vel.y, vel.z);
  if (speed < 1e-4) return { x: 0, y: 0, z: 0 };

  // 1. Resistenza dell'aria: F_d = -½ ρ Cd A |v| v
  const dragX = -DRAG_K * speed * vel.x;
  const dragY = -DRAG_K * speed * vel.y;
  const dragZ = -DRAG_K * speed * vel.z;

  // 2. Effetto Magnus: F_m = S (ω × v)
  const mx = MAGNUS_K * (angVel.y * vel.z - angVel.z * vel.y);
  const my = MAGNUS_K * (angVel.z * vel.x - angVel.x * vel.z);
  const mz = MAGNUS_K * (angVel.x * vel.y - angVel.y * vel.x);

  return {
    x: dragX + mx,
    y: dragY + my,
    z: dragZ + mz,
  };
}

/**
 * Converte il parametro `backspin` [0..1] nella velocità angolare iniziale (rad/s).
 * `wx < 0` significa rotazione all'indietro (backspin): il punto superiore della palla va verso -z,
 * il punto anteriore (+z) sale verso +y, ammorbidendo i contatti su ferro e tabellone.
 */
export function releaseBackspinOmega(backspin: number): Vec3 {
  const clamped = Math.max(0, Math.min(1, backspin));
  const omegaMag = MIN_BACKSPIN_RAD_S + (MAX_BACKSPIN_RAD_S - MIN_BACKSPIN_RAD_S) * clamped;
  return { x: -omegaMag, y: 0, z: 0 };
}

/**
 * Simula numericamente la traiettoria balistica in aria (senza collisioni) con lo stesso passo
 * di Rapier (240 Hz) per trovare l'altezza `y` quando la palla raggiunge `z = HOOP_Z` in fase discendente,
 * oppure per generare i punti dell'arco guida.
 */
export function traceBallisticArc(
  speed: number,
  releaseAngleDeg: number,
  backspin: number,
  dir = 0,
  maxTimeS = 1.6,
): Vec3[] {
  const dt = 1 / 240;
  const angleRad = releaseAngleDeg * DEG2RAD;
  const vHoriz = speed * Math.cos(angleRad);
  let x = RELEASE_POS.x;
  let y = RELEASE_POS.y;
  let z = RELEASE_POS.z;
  let vx = Math.sin(dir) * vHoriz;
  let vy = speed * Math.sin(angleRad);
  let vz = Math.cos(dir) * vHoriz;
  const omega = releaseBackspinOmega(backspin);

  const points: Vec3[] = [{ x, y, z }];
  const steps = Math.floor(maxTimeS / dt);
  for (let i = 0; i < steps; i++) {
    const f = computeAeroForce({ x: vx, y: vy, z: vz }, omega);
    vx += (f.x / BALL_MASS) * dt;
    vy += (GRAVITY_Y + f.y / BALL_MASS) * dt;
    vz += (f.z / BALL_MASS) * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    if (i % 4 === 0) points.push({ x, y, z });
    if (y < RIM_HEIGHT - 0.3 && vy < 0 && z >= HOOP_Z) break;
  }
  return points;
}

const idealSpeedCache = new Map<string, number>();

/**
 * Calcola con ricerca binaria la velocità iniziale esatta (m/s) che porta il centro della palla
 * al centro del ferro `(0, RIM_HEIGHT, HOOP_Z)` per un dato angolo di rilascio e backspin.
 */
export function idealSpeedForAngle(releaseAngleDeg: number, backspin = 0.85): number {
  const clampedAngle = Math.max(38, Math.min(68, releaseAngleDeg));
  const key = `${clampedAngle.toFixed(1)}:${backspin.toFixed(2)}`;
  const cached = idealSpeedCache.get(key);
  if (cached !== undefined) return cached;

  const dt = 1 / 240;
  const angleRad = clampedAngle * DEG2RAD;
  const omega = releaseBackspinOmega(backspin);

  // Restituisce la quota y della palla quando attraversa z = HOOP_Z
  const yAtHoop = (speed: number): number => {
    let y = RELEASE_POS.y;
    let z = RELEASE_POS.z;
    let vx = 0;
    let vy = speed * Math.sin(angleRad);
    let vz = speed * Math.cos(angleRad);
    for (let i = 0; i < 400; i++) {
      const prevZ = z;
      const prevY = y;
      const f = computeAeroForce({ x: vx, y: vy, z: vz }, omega);
      vx += (f.x / BALL_MASS) * dt;
      vy += (GRAVITY_Y + f.y / BALL_MASS) * dt;
      vz += (f.z / BALL_MASS) * dt;
      y += vy * dt;
      z += vz * dt;
      if (z >= HOOP_Z) {
        const t = (HOOP_Z - prevZ) / Math.max(1e-6, z - prevZ);
        return prevY + (y - prevY) * t;
      }
    }
    return -10;
  };

  let lo = 5.5;
  let hi = 10.5;
  for (let iter = 0; iter < 32; iter++) {
    const mid = (lo + hi) / 2;
    if (yAtHoop(mid) < RIM_HEIGHT) lo = mid;
    else hi = mid;
  }
  const result = (lo + hi) / 2;
  idealSpeedCache.set(key, result);
  return result;
}

// ---------- Retina in Fisica Verlet 3D ----------
export const NET_RINGS = 6;
export const NET_SEGMENTS = 12;
export const NET_LENGTH = 0.42; // 42 cm lunghezza regolamentare della retina

interface NetNode {
  x: number;
  y: number;
  z: number;
  oldX: number;
  oldY: number;
  oldZ: number;
  restX: number;
  restY: number;
  restZ: number;
  pinned: boolean;
}

interface NetConstraint {
  readonly a: number;
  readonly b: number;
  readonly restLen: number;
}

export interface VerletNet {
  readonly nodes: readonly NetNode[];
  step(dt: number, ballPos: Vec3, ballVel: Vec3, swishPulse?: number): void;
  /** Impulso "ciuff" quando la palla attraversa la retina: la retina frusta verso l'alto. */
  triggerSwishWhip(intensity?: number): void;
  reset(): void;
  /** Posizioni [x1,y1,z1, x2,y2,z2, ...] di tutti i fili per `THREE.LineSegments`. */
  writeLinePositions(out?: Float32Array): Float32Array;
  /** Massimo spostamento attuale dei nodi rispetto alla posizione di riposo (m). */
  maxDisplacement(): number;
  readonly lineVertexCount: number;
}

/** Raggio a riposo di ciascuno dei 6 anelli della retina (si stringe a clessidra verso il fondo). */
function netRingRadius(ringIndex: number): number {
  const t = ringIndex / (NET_RINGS - 1); // 0 in cima (ferro), 1 in fondo
  // Da 0.215 m sul ferro scende a ~0.128 m a 3/4 e ~0.138 m sul fondo
  return RIM_RADIUS * (0.96 - 0.42 * Math.sin(t * Math.PI * 0.78));
}

export function createVerletNet(): VerletNet {
  const nodes: NetNode[] = [];
  const constraints: NetConstraint[] = [];

  for (let r = 0; r < NET_RINGS; r++) {
    const t = r / (NET_RINGS - 1);
    const radius = netRingRadius(r);
    const y = RIM_HEIGHT - t * NET_LENGTH;
    // Sfasamento di mezzo passo ad anelli alterni per il tipico intreccio a losanga della retina
    const phaseOffset = (r % 2) * (Math.PI / NET_SEGMENTS);
    for (let s = 0; s < NET_SEGMENTS; s++) {
      const angle = (s / NET_SEGMENTS) * Math.PI * 2 + phaseOffset;
      const x = Math.cos(angle) * radius;
      const z = HOOP_Z + Math.sin(angle) * radius;
      nodes.push({
        x,
        y,
        z,
        oldX: x,
        oldY: y,
        oldZ: z,
        restX: x,
        restY: y,
        restZ: z,
        pinned: r === 0,
      });
    }
  }

  const idx = (r: number, s: number) => r * NET_SEGMENTS + ((s + NET_SEGMENTS) % NET_SEGMENTS);
  const addLink = (a: number, b: number) => {
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const restLen = Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z);
    constraints.push({ a, b, restLen });
  };

  for (let r = 0; r < NET_RINGS; r++) {
    for (let s = 0; s < NET_SEGMENTS; s++) {
      // Anello orizzontale
      if (r > 0) {
        addLink(idx(r, s), idx(r, s + 1));
      }
      // Diagonali a losanga verso l'anello successivo
      if (r < NET_RINGS - 1) {
        addLink(idx(r, s), idx(r + 1, s));
        addLink(idx(r, s), idx(r + 1, r % 2 === 0 ? s - 1 : s + 1));
      }
    }
  }

  const lineBuffer = new Float32Array(constraints.length * 6);

  return {
    nodes,
    lineVertexCount: constraints.length * 2,

    reset() {
      for (const n of nodes) {
        n.x = n.restX;
        n.y = n.restY;
        n.z = n.restZ;
        n.oldX = n.restX;
        n.oldY = n.restY;
        n.oldZ = n.restZ;
      }
    },

    triggerSwishWhip(intensity = 1.0) {
      // Nello swish ("ciuff") il fondo della retina si gonfia in fuori e frusta verso l'alto
      for (let r = 2; r < NET_RINGS; r++) {
        const factor = (r / (NET_RINGS - 1)) * intensity;
        for (let s = 0; s < NET_SEGMENTS; s++) {
          const n = nodes[idx(r, s)]!;
          const dx = n.x;
          const dz = n.z - HOOP_Z;
          const dist = Math.hypot(dx, dz) || 1;
          n.oldX -= (dx / dist) * 0.032 * factor;
          n.oldZ -= (dz / dist) * 0.032 * factor;
          n.oldY -= 0.048 * factor; // spinge verso l'alto (+y)
        }
      }
    },

    step(dt: number, ballPos: Vec3, ballVel: Vec3) {
      const clampedDt = Math.min(dt, 1 / 30);
      const damping = 0.965;
      const gStep = GRAVITY_Y * clampedDt * clampedDt;

      // 1. Integrazione di Verlet + richiamo elastico morbido alla forma a clessidra
      for (const n of nodes) {
        if (n.pinned) continue;
        const vx = (n.x - n.oldX) * damping;
        const vy = (n.y - n.oldY) * damping;
        const vz = (n.z - n.oldZ) * damping;
        n.oldX = n.x;
        n.oldY = n.y;
        n.oldZ = n.z;
        n.x += vx + (n.restX - n.x) * 0.04;
        n.y += vy + gStep + (n.restY - n.y) * 0.04;
        n.z += vz + (n.restZ - n.z) * 0.04;
      }

      // 2. Interazione con la palla da basket (spostamento + attrito viscoso del cotone)
      const interactRadius = BALL_RADIUS + 0.022;
      const ballNearNet =
        Math.abs(ballPos.x) < 0.6 &&
        Math.abs(ballPos.z - HOOP_Z) < 0.6 &&
        ballPos.y > RIM_HEIGHT - NET_LENGTH - 0.35 &&
        ballPos.y < RIM_HEIGHT + 0.35;

      if (ballNearNet) {
        for (const n of nodes) {
          if (n.pinned) continue;
          const dx = n.x - ballPos.x;
          const dy = n.y - ballPos.y;
          const dz = n.z - ballPos.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < interactRadius && dist > 1e-5) {
            const overlap = interactRadius - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            n.x += nx * overlap * 0.85;
            n.y += ny * overlap * 0.5;
            n.z += nz * overlap * 0.85;
            // Trascinamento dei fili lungo il moto della palla
            n.oldX -= ballVel.x * clampedDt * 0.22;
            n.oldY -= ballVel.y * clampedDt * 0.18;
            n.oldZ -= ballVel.z * clampedDt * 0.22;
          }
        }
      }

      // 3. Rilassamento dei vincoli di distanza (4 iterazioni di Gauss-Seidel)
      for (let iter = 0; iter < 4; iter++) {
        for (const c of constraints) {
          const na = nodes[c.a]!;
          const nb = nodes[c.b]!;
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dz = nb.z - na.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < 1e-6) continue;
          const diff = (dist - c.restLen) / dist;
          if (na.pinned) {
            nb.x -= dx * diff;
            nb.y -= dy * diff;
            nb.z -= dz * diff;
          } else if (nb.pinned) {
            na.x += dx * diff;
            na.y += dy * diff;
            na.z += dz * diff;
          } else {
            const half = diff * 0.5;
            na.x += dx * half;
            na.y += dy * half;
            na.z += dz * half;
            nb.x -= dx * half;
            nb.y -= dy * half;
            nb.z -= dz * half;
          }
        }
      }
    },

    writeLinePositions(out = lineBuffer): Float32Array {
      let k = 0;
      for (const c of constraints) {
        const na = nodes[c.a]!;
        const nb = nodes[c.b]!;
        out[k++] = na.x;
        out[k++] = na.y;
        out[k++] = na.z;
        out[k++] = nb.x;
        out[k++] = nb.y;
        out[k++] = nb.z;
      }
      return out;
    },

    maxDisplacement(): number {
      let maxD = 0;
      for (const n of nodes) {
        const d = Math.hypot(n.x - n.restX, n.y - n.restY, n.z - n.restZ);
        if (d > maxD) maxD = d;
      }
      return maxD;
    },
  };
}

// ---------- Mondo Fisico Rapier3D dei Tiri Liberi ----------

export interface ShotTelemetry {
  readonly made: boolean;
  readonly outcome: ResolvedOutcome;
  readonly touchedRim: boolean;
  readonly touchedBackboard: boolean;
  readonly rimBounces: number;
  readonly hint: ShotFeedbackHint;
  /** Punto di attraversamento sul piano del ferro `y = RIM_HEIGHT` in fase discendente. */
  readonly crossingAtRim: { readonly x: number; readonly z: number } | null;
}

export interface FreeThrowPhysicsWorld {
  readonly world: RAPIER.World;
  readonly ballBody: RAPIER.RigidBody;
  readonly net: VerletNet;
  step(dt: number): void;
  launchBall(shot: FreeThrowShotData): void;
  resetBall(): void;
  isBallActive(): boolean;
  isShotResolved(): boolean;
  /** Vero mentre la palla sta ballando sul ferro (attiva il leggero slow-mo di suspense). */
  isBallDancingOnRim(): boolean;
  getTelemetry(): ShotTelemetry;
  dispose(): void;
}

const RIM_COLLIDER_SEGMENTS = 24;

export async function createFreeThrowPhysicsWorld(): Promise<FreeThrowPhysicsWorld> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
  world.numSolverIterations = 8;

  // 1. Parquet della palestra (piano a y = 0)
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(12, 0.1, 14)
      .setTranslation(0, -0.1, 3.0)
      .setFriction(MU_FLOOR)
      .setRestitution(E_FLOOR),
  );

  // Parete di fondo dietro il canestro (a z = 7.2 m) così la palla resta in palestra
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(12, 5, 0.2)
      .setTranslation(0, 2.5, 7.2)
      .setFriction(0.5)
      .setRestitution(0.5),
  );

  // 2. Tabellone in plexiglass (1.80 × 1.05 m, faccia anteriore a z = BACKBOARD_Z = 4.60 m)
  const backboardCenterY = BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT / 2;
  const backboardCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(BACKBOARD_WIDTH / 2, BACKBOARD_HEIGHT / 2, BACKBOARD_THICKNESS / 2)
      .setTranslation(0, backboardCenterY, BACKBOARD_Z + BACKBOARD_THICKNESS / 2)
      .setFriction(MU_BACKBOARD)
      .setRestitution(E_BACKBOARD),
  );

  // 3. Ferro (anello di 24 sfere lungo la circonferenza + staffa posteriore verso il tabellone)
  const rimBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, RIM_HEIGHT, HOOP_Z));
  const rimCenterRadius = RIM_RADIUS + RIM_TUBE_RADIUS;
  const rimColliderHandles = new Set<number>();

  for (let i = 0; i < RIM_COLLIDER_SEGMENTS; i++) {
    const theta = (i / RIM_COLLIDER_SEGMENTS) * Math.PI * 2;
    const cx = Math.cos(theta) * rimCenterRadius;
    const cz = Math.sin(theta) * rimCenterRadius;
    const col = world.createCollider(
      RAPIER.ColliderDesc.ball(RIM_TUBE_RADIUS)
        .setTranslation(cx, 0, cz)
        .setFriction(MU_RIM)
        .setRestitution(E_RIM),
      rimBody,
    );
    rimColliderHandles.add(col.handle);
  }

  // Staffa posteriore (neck) tra l'anello e il tabellone
  const bracketCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.06, RIM_TUBE_RADIUS, RIM_BRACKET_LEN / 2)
      .setTranslation(0, -0.005, rimCenterRadius + RIM_BRACKET_LEN / 2)
      .setFriction(MU_RIM)
      .setRestitution(0.4),
    rimBody,
  );
  rimColliderHandles.add(bracketCol.handle);

  // 4. Palla da basket (Misura 7: raggio 0.12 m, massa 0.62 kg, CCD attivo)
  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(RELEASE_POS.x, RELEASE_POS.y, RELEASE_POS.z)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(BALL_RADIUS)
      .setMassProperties(
        BALL_MASS,
        { x: 0, y: 0, z: 0 },
        { x: BALL_INERTIA, y: BALL_INERTIA, z: BALL_INERTIA },
        { w: 1, x: 0, y: 0, z: 0 },
      )
      .setFriction(0.55)
      .setRestitution(0.72)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    ballBody,
  );

  const net = createVerletNet();

  // Stato del tiro in corso
  let isActive = false;
  let elapsedS = 0;
  let maxAltitudeY: number = RELEASE_POS.y;
  let prevBallPos: Vec3 = { ...RELEASE_POS };
  let made = false;
  let touchedRim = false;
  let touchedBackboard = false;
  let backboardRebounded = false;
  let rimBounces = 0;
  let rimCooldownS = 0;
  let touchedFloorAfterHoop = false;
  let floorTimerS = 0;
  let crossingAtRim: { readonly x: number; readonly z: number } | null = null;
  let lastShot: FreeThrowShotData | null = null;

  function resetState() {
    isActive = false;
    elapsedS = 0;
    maxAltitudeY = RELEASE_POS.y;
    prevBallPos = { ...RELEASE_POS };
    made = false;
    touchedRim = false;
    touchedBackboard = false;
    backboardRebounded = false;
    rimBounces = 0;
    rimCooldownS = 0;
    touchedFloorAfterHoop = false;
    floorTimerS = 0;
    crossingAtRim = null;
    ballBody.setBodyType(RAPIER.RigidBodyType.Fixed, false);
    ballBody.setTranslation({ x: RELEASE_POS.x, y: RELEASE_POS.y, z: RELEASE_POS.z }, false);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, false);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, false);
  }

  resetState();

  function detectContacts(subDt: number) {
    rimCooldownS = Math.max(0, rimCooldownS - subDt);
    const pos = ballBody.translation();
    const vel = ballBody.linvel();
    const ang = ballBody.angvel();

    // Contatto col tabellone (faccia anteriore a z = BACKBOARD_Z)
    if (
      pos.z + BALL_RADIUS >= BACKBOARD_Z - 0.015 &&
      pos.z - BALL_RADIUS <= BACKBOARD_Z + BACKBOARD_THICKNESS + 0.02 &&
      Math.abs(pos.x) <= BACKBOARD_WIDTH / 2 + BALL_RADIUS &&
      pos.y >= BACKBOARD_BOTTOM_Y - BALL_RADIUS &&
      pos.y <= BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT + BALL_RADIUS
    ) {
      if (!made) {
        touchedBackboard = true;
        // Quando Rapier ha invertito vz (rimbalzo dal tabellone verso il campo, vel.z < 0):
        // se il tiro colpisce il quadrato di mira con backspin (wx < 0), la flessione del plexiglass
        // e l'attrito del backspin smorzano il rimbalzo indirizzando la palla nel ferro ("di tabella")
        if (!backboardRebounded && vel.z < 0) {
          backboardRebounded = true;
          const inSquare =
            Math.abs(pos.x) <= TARGET_SQUARE_WIDTH / 2 &&
            pos.y >= RIM_HEIGHT + 0.02 &&
            pos.y <= RIM_HEIGHT + TARGET_SQUARE_HEIGHT + 0.08;
          if (inSquare && ang.x < -4) {
            const spinFactor = Math.min(1, Math.abs(ang.x) / (MAX_BACKSPIN_RAD_S * 0.75));
            const dy = Math.max(0.03, pos.y - RIM_HEIGHT);
            const vyAfter = Math.min(-1.1, vel.y * 0.65);
            const gMag = Math.abs(GRAVITY_Y);
            const tDrop = (Math.sqrt(vyAfter * vyAfter + 2 * gMag * dy) + vyAfter) / gMag;
            const idealBankVz = (HOOP_Z - pos.z) / Math.max(0.05, tDrop);
            const blendedVz = vel.z * (1 - 0.78 * spinFactor) + idealBankVz * (0.78 * spinFactor);
            ballBody.setLinvel({ x: vel.x * 0.55, y: vyAfter, z: blendedVz }, true);
          }
        }
      }
    }

    // Contatto con l'anello del ferro (distanza toroidale esatta dal cerchio di raggio rimCenterRadius)
    const dx = pos.x;
    const dz = pos.z - HOOP_Z;
    const radialDist = Math.hypot(dx, dz);
    const tubeDist = Math.hypot(radialDist - rimCenterRadius, pos.y - RIM_HEIGHT);
    if (tubeDist <= BALL_RADIUS + RIM_TUBE_RADIUS + 0.005) {
      if (!made) touchedRim = true;
      if (rimCooldownS <= 0) {
        rimBounces++;
        rimCooldownS = 0.09;
      }
    }
  }

  function checkBasketCrossing(prev: Vec3, curr: Vec3, vel: Vec3) {
    // Passaggio dal piano del ferro (y = RIM_HEIGHT) dall'alto verso il basso
    if (prev.y >= RIM_HEIGHT && curr.y < RIM_HEIGHT && vel.y < 0 && maxAltitudeY > RIM_HEIGHT + 0.12) {
      const t = (prev.y - RIM_HEIGHT) / Math.max(1e-6, prev.y - curr.y);
      const cx = prev.x + (curr.x - prev.x) * t;
      const cz = prev.z + (curr.z - prev.z) * t;
      if (!crossingAtRim) {
        crossingAtRim = { x: cx, z: cz };
      }
      const distFromHoopCenter = Math.hypot(cx, cz - HOOP_Z);
      // Il centro della palla passa dentro il raggio utile dell'anello
      if (!made && distFromHoopCenter <= RIM_RADIUS - 0.015) {
        made = true;
        // Nello swish la palla rallenta leggermente accarezzando la retina e fa il "ciuff"
        const isCleanSwish = !touchedRim && !touchedBackboard;
        net.triggerSwishWhip(isCleanSwish ? 1.25 : 0.75);
        ballBody.setLinvel({ x: vel.x * 0.45, y: vel.y * 0.72, z: vel.z * 0.45 }, true);
      }
    }
  }

  function computeHint(): ShotFeedbackHint {
    if (made) return 'perfect';
    if (lastShot && lastShot.releaseAngleDeg < 45) return 'flat';
    if (lastShot && lastShot.hookQuality < 0.4) return 'no-hook';
    if (crossingAtRim) {
      if (Math.abs(crossingAtRim.x) > 0.14) {
        return crossingAtRim.x < 0 ? 'left' : 'right';
      }
      if (crossingAtRim.z < HOOP_Z - 0.05) return 'short';
      if (crossingAtRim.z > HOOP_Z + 0.06) return 'long';
    }
    if (lastShot) {
      const ideal = idealSpeedForAngle(lastShot.releaseAngleDeg, lastShot.backspin);
      if (lastShot.speed < ideal - 0.15) return 'short';
      if (lastShot.speed > ideal + 0.15) return 'long';
    }
    return 'short';
  }

  function computeOutcome(): ResolvedOutcome {
    if (made) {
      if (!touchedRim && !touchedBackboard) return 'swish';
      if (touchedBackboard && !touchedRim) return 'bank-in';
      return 'rim-in';
    }
    if (touchedRim) return 'rim-out';
    if (touchedBackboard) return 'backboard-out';
    return 'airball';
  }

  return {
    world,
    ballBody,
    net,

    launchBall(shot: FreeThrowShotData) {
      resetState();
      net.reset();
      lastShot = shot;
      isActive = true;

      ballBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      ballBody.setTranslation({ x: RELEASE_POS.x, y: RELEASE_POS.y, z: RELEASE_POS.z }, true);
      ballBody.setRotation({ w: 1, x: 0, y: 0, z: 0 }, true);

      const angleRad = shot.releaseAngleDeg * DEG2RAD;
      const vHoriz = shot.speed * Math.cos(angleRad);
      const vx = Math.sin(shot.dir) * vHoriz;
      const vy = shot.speed * Math.sin(angleRad);
      const vz = Math.cos(shot.dir) * vHoriz;

      ballBody.setLinvel({ x: vx, y: vy, z: vz }, true);
      ballBody.setAngvel(releaseBackspinOmega(shot.backspin), true);
      ballBody.wakeUp();
    },

    step(dt: number) {
      const substeps = 4;
      const subDt = Math.min(dt, 0.1) / substeps;
      world.timestep = subDt;

      for (let s = 0; s < substeps; s++) {
        if (isActive) {
          elapsedS += subDt;
          const pos = ballBody.translation();
          const vel = ballBody.linvel();
          const ang = ballBody.angvel();

          // Applica drag e Magnus solo quando la palla è in volo sopra il parquet
          if (pos.y > BALL_RADIUS + 0.05) {
            const aero = computeAeroForce(vel, ang);
            ballBody.resetForces(false);
            ballBody.addForce(aero, true);
          } else {
            ballBody.resetForces(false);
          }
        }

        world.step();

        if (isActive) {
          const currPos = ballBody.translation();
          const currVel = ballBody.linvel();
          if (currPos.y > maxAltitudeY) maxAltitudeY = currPos.y;

          detectContacts(subDt);
          checkBasketCrossing(prevBallPos, currPos, currVel);

          if (currPos.y <= BALL_RADIUS + 0.03 && elapsedS > 0.4) {
            touchedFloorAfterHoop = true;
          }
          if (touchedFloorAfterHoop || made) {
            floorTimerS += subDt;
          }

          net.step(subDt, currPos, currVel);
          prevBallPos = { x: currPos.x, y: currPos.y, z: currPos.z };
        } else {
          net.step(subDt, RELEASE_POS, { x: 0, y: 0, z: 0 });
        }
      }
    },

    resetBall() {
      resetState();
      net.reset();
    },

    isBallActive(): boolean {
      return isActive;
    },

    isShotResolved(): boolean {
      if (!isActive) return false;
      const pos = ballBody.translation();
      // Il tiro è concluso quando:
      // - è entrato e sono passati ~0.65 s (tempo di godersi la palla che esce dalla retina e rimbalza)
      // - oppure ha toccato il parquet (o è sceso ben sotto il ferro) dopo aver superato l'apice
      if (made && floorTimerS >= 0.65) return true;
      if (touchedFloorAfterHoop && floorTimerS >= 0.45) return true;
      if (pos.y < 1.2 && elapsedS > 0.9 && ballBody.linvel().y < 0) return true;
      if (elapsedS > 4.5) return true;
      return false;
    },

    isBallDancingOnRim(): boolean {
      if (!isActive || made) return false;
      const pos = ballBody.translation();
      const distHoop = Math.hypot(pos.x, pos.z - HOOP_Z);
      return (
        touchedRim &&
        distHoop < RIM_RADIUS * 1.45 &&
        pos.y >= RIM_HEIGHT - 0.05 &&
        pos.y <= RIM_HEIGHT + 0.55
      );
    },

    getTelemetry(): ShotTelemetry {
      return {
        made,
        outcome: computeOutcome(),
        touchedRim,
        touchedBackboard,
        rimBounces,
        hint: computeHint(),
        crossingAtRim,
      };
    },

    dispose() {
      world.free();
    },
  };
}
