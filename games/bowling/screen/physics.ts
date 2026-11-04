// Simulatore fisico del Bowling con Rapier3D (docs/games/bowling.md § 4, docs/06 § 2).
// Misure reali USBC: pista 18.29 m, zona olio (μ 0.04), back-end asciutto (μ 0.20),
// 10 birilli a massa e baricentro calibrati, palla 6.4 kg con CCD e hook physics.

import RAPIER from '@dimforge/rapier3d-compat';
import type { BowlingPinStatus, BowlingReleaseData } from '../shared/events';
import {
  PIN_HEIGHT,
  PIN_MASS,
  PIN_OFFSETS,
} from './pin-geometry';

export const LANE_LENGTH = 18.29; // metri dalla linea di fallo al birillo 1
export const LANE_WIDTH = 1.054; // metri (39 tavole)
export const OIL_LENGTH = 12.0; // primi 12 metri oliati (μ 0.04)
export const BALL_RADIUS = 0.108; // 21.6 cm diametro
export const BALL_MASS = 6.4; // 14 lb in kg
export const HEADPIN_Z = LANE_LENGTH; // Birillo 1 a z = 18.29 m
const HOOK_ACCEL_N = 3.0; // forza laterale (N) a spin = 1 nel back-end asciutto
const PIN_SETTLE_SPEED = 0.15; // m/s sotto cui un birillo è considerato fermo

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
  getPinStatuses(): BowlingPinStatus[];
  isBallActive(): boolean;
  arePinsSettled(): boolean;
  dispose(): void;
}

export async function createBowlingPhysicsWorld(): Promise<PhysicsWorldState> {
  await RAPIER.init();

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);

  // 1. Collider Pista: divisa in due zone (olio e back-end asciutto)
  // Zona Olio: da z = 0 a z = OIL_LENGTH (μ = 0.04)
  const oilColliderDesc = RAPIER.ColliderDesc.cuboid(LANE_WIDTH / 2, 0.05, OIL_LENGTH / 2)
    .setTranslation(0, -0.05, OIL_LENGTH / 2)
    .setFriction(0.04)
    .setRestitution(0.1);
  world.createCollider(oilColliderDesc);

  // Zona Back-end asciutta: da z = OIL_LENGTH a z = 20.0 m (μ = 0.22 per presa e curva dell'hook)
  const dryLength = 20.0 - OIL_LENGTH;
  const dryColliderDesc = RAPIER.ColliderDesc.cuboid(LANE_WIDTH / 2, 0.05, dryLength / 2)
    .setTranslation(0, -0.05, OIL_LENGTH + dryLength / 2)
    .setFriction(0.22)
    .setRestitution(0.1);
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

  // 2. Creazione della Palla (6.4 kg, CCD attivo)
  const ballBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, BALL_RADIUS, -1.0)
    .setCcdEnabled(true)
    .setLinearDamping(0.05)
    .setAngularDamping(0.05);
  const ballBody = world.createRigidBody(ballBodyDesc);

  const ballColliderDesc = RAPIER.ColliderDesc.ball(BALL_RADIUS)
    .setDensity(BALL_MASS / ((4 / 3) * Math.PI * BALL_RADIUS ** 3))
    .setFriction(1.0)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setRestitution(0.1);
  world.createCollider(ballColliderDesc, ballBody);

  // 3. Creazione dei 10 Birilli (corpi rigidi dinamici con collider composito)
  const pinBodies: RAPIER.RigidBody[] = [];

  function spawnPin(id: number, rx: number, rz: number): RAPIER.RigidBody {
    const x = rx;
    const z = HEADPIN_Z + rz;
    const y = 0; // base a livello pista

    const pinBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + PIN_HEIGHT / 2, z)
      .setLinearDamping(0.2)
      .setAngularDamping(0.3)
      .setCanSleep(true);

    const body = world.createRigidBody(pinBodyDesc);

    // Collider composito per birillo: base larga + corpo + testa
    // Con centro di massa abbassato a ~1/3 altezza per garantire il tipico wobble e ribaltamento
    const baseRadius = 0.042;
    const bellyRadius = 0.058;
    const headRadius = 0.032;

    const density = PIN_MASS / 0.003; // calcolato per ottenere 1.53 kg totali

    // Segmento inferiore (base)
    const baseDesc = RAPIER.ColliderDesc.cylinder(0.04, baseRadius)
      .setTranslation(0, -PIN_HEIGHT / 2 + 0.04, 0)
      .setDensity(density * 1.5) // più pesante alla base
      .setFriction(0.25)
      .setRestitution(0.45);
    world.createCollider(baseDesc, body);

    // Segmento pancia
    const bellyDesc = RAPIER.ColliderDesc.cylinder(0.07, bellyRadius)
      .setTranslation(0, -PIN_HEIGHT / 2 + 0.12, 0)
      .setDensity(density)
      .setFriction(0.25)
      .setRestitution(0.45);
    world.createCollider(bellyDesc, body);

    // Segmento collo (evita che i birilli si compenetrino sopra la pancia)
    const neckDesc = RAPIER.ColliderDesc.cylinder(0.065, 0.026)
      .setTranslation(0, -PIN_HEIGHT / 2 + 0.255, 0)
      .setDensity(density * 0.7)
      .setFriction(0.25)
      .setRestitution(0.45);
    world.createCollider(neckDesc, body);

    // Segmento testa
    const headDesc = RAPIER.ColliderDesc.ball(headRadius)
      .setTranslation(0, PIN_HEIGHT / 2 - headRadius, 0)
      .setDensity(density * 0.7)
      .setFriction(0.25)
      .setRestitution(0.45);
    world.createCollider(headDesc, body);

    return body;
  }

  // Birilli tolti dallo sweeper (disabilitati fino al prossimo rack completo)
  const removedPins = new Set<number>();

  function placeOnSpot(body: RAPIER.RigidBody, x: number, z: number) {
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
        const newBody = spawnPin(offset.id, offset.x, offset.z);
        pinBodies.push(newBody);
      }
    }
  }

  resetPins();

  let isThrown = false;
  let activeSpin = 0;

  function parkBall() {
    isThrown = false;
    activeSpin = 0;
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
        // Fisica dell'hook: nel back-end asciutto (z > 12m), l'attrito laterale converte lo spin in curva
        if (isThrown) {
          const ballPos = ballBody.translation();
          if (ballPos.z > OIL_LENGTH && ballPos.z < HEADPIN_Z + 1.0) {
            // Curva progressiva verso sinistra (-X) per hook sinistro (spin > 0)
            const hookForce = -activeSpin * HOOK_ACCEL_N;
            ballBody.applyImpulse({ x: hookForce * subDt, y: 0, z: 0 }, true);
          }
        }
        world.step();
      }

      // Palla entrata nel pozzetto: la disattivo, così non disturba i birilli che si stanno assestando
      if (isThrown && ballBody.isEnabled() && ballBody.translation().z > HEADPIN_Z + 1.2) {
        ballBody.setEnabled(false);
      }
    },

    launchBall(data: BowlingReleaseData) {
      isThrown = true;
      activeSpin = data.spin;
      ballBody.setEnabled(true);

      const startX = Math.max(-0.45, Math.min(0.45, data.startX));
      ballBody.setTranslation({ x: startX, y: BALL_RADIUS + 0.01, z: 0.1 }, true);

      // Velocità lineare lungo la direzione di mira
      const speed = Math.max(3.5, Math.min(11.0, data.speed));
      const vx = speed * Math.sin(data.dir);
      const vz = speed * Math.cos(data.dir);
      ballBody.setLinvel({ x: vx, y: -0.2, z: vz }, true);

      // Velocità angolare iniziale:
      // Rotolamento parziale (ωx) + spin laterale (ωz) per effetto hook
      const rollRate = (vz / BALL_RADIUS) * 0.4; // scivolamento iniziale realistico sull'olio
      const spinRate = data.spin * 15.0; // rad/s (positivo: la base scivola a destra, reazione spinge a sinistra)
      ballBody.setAngvel({ x: rollRate, y: 0, z: spinRate }, true);
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
          removedPins.add(i);
          // Parcheggiato lontano dalla pista e disabilitato: non interagisce più con palla e birilli
          body.setTranslation({ x: 0, y: -5, z: HEADPIN_Z + 4 + i * 0.5 }, false);
          body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          body.setEnabled(false);
        } else {
          placeOnSpot(body, offset.x, HEADPIN_Z + offset.z);
        }
      });
    },

    isPinRemoved(index: number): boolean {
      return removedPins.has(index);
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
        if (removedPins.has(i) || body.isSleeping()) return true;
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
