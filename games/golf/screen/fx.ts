// Effetti del golf sopra la scena (Three.js): la scia del colpo come nelle dirette TV, gli
// sbuffi di erba o sabbia a ogni contatto, e il cerchio di mira dove cade la mazza scelta.
// Coordinate di gioco come in scene.ts: (x, y) di gioco → (x, −z) in Three.js.
import * as THREE from 'three';
import type { Lie, Point } from './rules';

const TRAIL_MAX = 260;
const TRAIL_STEP_M = 1.8;
const TRAIL_RADIUS = 0.26;
const TRAIL_FADE_S = 2.6;

const PUFF_LIFE_S = 0.7;
const PUFF_GRAVITY = 14;
const PUFF_COLOR: Readonly<Record<Lie, number>> = {
  tee: 0x6fcf4f, fairway: 0x6fcf4f, green: 0xb6f08a, rough: 0x3f9a34, bunker: 0xf6e2a8,
};
const PUFF_COUNT: Readonly<Record<Lie, number>> = { tee: 7, fairway: 7, green: 5, rough: 10, bunker: 18 };

const SPLASH_COUNT = 24;
const SPLASH_COLORS = [0x7cc8ff, 0xffffff, 0xa9dcff] as const;
const SPLASH_RING_S = 0.9;

const AIM_RING_INNER = 3;
const AIM_RING_OUTER = 3.6;
const AIM_PULSE_HZ = 1.4;

interface Trail {
  readonly mesh: THREE.InstancedMesh;
  count: number;
  last: THREE.Vector3 | null;
  wasMoving: boolean;
  /** Secondi da quando la palla si è fermata; `null` mentre corre. */
  fadeT: number | null;
}

interface WaterRing {
  readonly mesh: THREE.Mesh;
  t: number;
  readonly delay: number;
}

interface Particle {
  readonly mesh: THREE.Mesh;
  readonly velocity: THREE.Vector3;
  t: number;
}

export interface GolfFx {
  /** Scia della palla: si riparte a ogni colpo, sbiadisce quando la palla si ferma. */
  trail(id: string, color: string, at: THREE.Vector3, isMoving: boolean): void;
  dropTrail(id: string): void;
  clearTrails(): void;
  /** Sbuffo al contatto col terreno: colore e quantità dipendono dal terreno. */
  puff(at: Point, lie: Lie, strength: number): void;
  /** Palla in acqua: spruzzo e cerchi sull'acqua. */
  splash(at: Point): void;
  /** Cerchio dove cade la mazza scelta a piena potenza; `null` lo nasconde. */
  setAim(at: Point | null, color: string): void;
  update(dt: number): void;
  dispose(): void;
}

export function createGolfFx(scene: THREE.Scene): GolfFx {
  const trailGeometry = new THREE.SphereGeometry(TRAIL_RADIUS, 10, 8);
  const puffGeometry = new THREE.SphereGeometry(0.22, 8, 6);
  const trails = new Map<string, Trail>();
  const particles: Particle[] = [];
  const waterRings: WaterRing[] = [];
  const waterRingGeometry = new THREE.RingGeometry(0.8, 1.15, 40);
  const matrix = new THREE.Matrix4();

  const aim = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(AIM_RING_INNER, AIM_RING_OUTER, 48), ringMaterial);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), dotMaterial);
  ring.rotation.x = dot.rotation.x = -Math.PI / 2;
  aim.add(ring, dot);
  aim.visible = false;
  scene.add(aim);
  let clock = 0;

  const trailMaterial = (t: Trail) => t.mesh.material as THREE.MeshBasicMaterial;

  const getTrail = (id: string, color: string): Trail => {
    let t = trails.get(id);
    if (!t) {
      const mesh = new THREE.InstancedMesh(
        trailGeometry,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.8, depthWrite: false }),
        TRAIL_MAX,
      );
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      t = { mesh, count: 0, last: null, wasMoving: false, fadeT: null };
      trails.set(id, t);
    }
    return t;
  };

  const dropTrail = (id: string) => {
    const t = trails.get(id);
    if (!t) return;
    scene.remove(t.mesh);
    (t.mesh.material as THREE.Material).dispose();
    t.mesh.dispose();
    trails.delete(id);
  };

  return {
    trail(id, color, at, isMoving) {
      const t = getTrail(id, color);
      if (isMoving && !t.wasMoving) {
        // colpo nuovo: scia nuova
        t.count = 0;
        t.last = null;
        t.fadeT = null;
        trailMaterial(t).opacity = 0.8;
      }
      if (!isMoving && t.wasMoving) t.fadeT = 0;
      t.wasMoving = isMoving;
      if (!isMoving || t.count >= TRAIL_MAX) return;
      if (t.last && t.last.distanceTo(at) < TRAIL_STEP_M) return;
      matrix.makeTranslation(at.x, at.y, at.z);
      t.mesh.setMatrixAt(t.count, matrix);
      t.count++;
      t.mesh.count = t.count;
      t.mesh.instanceMatrix.needsUpdate = true;
      t.last = at.clone();
    },

    dropTrail,

    clearTrails() {
      for (const id of [...trails.keys()]) dropTrail(id);
    },

    puff(at, lie, strength) {
      const n = Math.max(2, Math.round(PUFF_COUNT[lie] * strength));
      const color = PUFF_COLOR[lie];
      const lift = lie === 'bunker' ? 6 : 3.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
        const out = (1.5 + Math.random() * 2.5) * strength;
        const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }));
        mesh.position.set(at.x, 0.3, -at.y);
        scene.add(mesh);
        particles.push({ mesh, velocity: new THREE.Vector3(Math.cos(a) * out, lift * (0.6 + Math.random() * 0.6) * strength, Math.sin(a) * out), t: 0 });
      }
    },

    splash(at) {
      for (let i = 0; i < SPLASH_COUNT; i++) {
        const a = (i / SPLASH_COUNT) * Math.PI * 2 + Math.random() * 0.4;
        const out = 1 + Math.random() * 2.2;
        const color = SPLASH_COLORS[i % SPLASH_COLORS.length]!;
        const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }));
        mesh.position.set(at.x, 0.3, -at.y);
        scene.add(mesh);
        // colonna d'acqua: più in alto che di lato
        particles.push({ mesh, velocity: new THREE.Vector3(Math.cos(a) * out, 7 + Math.random() * 5, Math.sin(a) * out), t: 0 });
      }
      for (let k = 0; k < 3; k++) {
        const mesh = new THREE.Mesh(waterRingGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(at.x, 0.08, -at.y);
        scene.add(mesh);
        waterRings.push({ mesh, t: 0, delay: k * 0.22 });
      }
    },

    setAim(at, color) {
      aim.visible = at !== null;
      if (!at) return;
      aim.position.set(at.x, 0.12, -at.y);
      ringMaterial.color.set(color);
    },

    update(dt) {
      clock += dt;
      if (aim.visible) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * Math.PI * 2 * AIM_PULSE_HZ);
        ring.scale.setScalar(1 + pulse * 0.12);
        ringMaterial.opacity = 0.6 + pulse * 0.3;
      }
      for (const t of trails.values()) {
        if (t.fadeT === null) continue;
        t.fadeT += dt;
        const left = Math.max(0, 1 - t.fadeT / TRAIL_FADE_S);
        trailMaterial(t).opacity = 0.8 * left;
        if (left === 0) {
          t.count = 0;
          t.mesh.count = 0;
          t.fadeT = null;
        }
      }
      for (let i = waterRings.length - 1; i >= 0; i--) {
        const r = waterRings[i]!;
        r.t += dt;
        const p = Math.min(1, Math.max(0, (r.t - r.delay) / SPLASH_RING_S));
        r.mesh.scale.setScalar(1 + p * 5);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.t < r.delay ? 0 : 0.85 * (1 - p);
        if (p >= 1) {
          scene.remove(r.mesh);
          (r.mesh.material as THREE.Material).dispose();
          waterRings.splice(i, 1);
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]!;
        p.t += dt;
        p.velocity.y -= PUFF_GRAVITY * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (p.mesh.position.y < 0.15) p.mesh.position.y = 0.15;
        const left = 1 - p.t / PUFF_LIFE_S;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, left);
        p.mesh.scale.setScalar(0.6 + 0.6 * Math.max(0, left));
        if (left <= 0) {
          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
        }
      }
    },

    dispose() {
      for (const id of [...trails.keys()]) dropTrail(id);
      for (const p of particles) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      }
      particles.length = 0;
      for (const r of waterRings) {
        scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
      }
      waterRings.length = 0;
      waterRingGeometry.dispose();
      scene.remove(aim);
      ring.geometry.dispose();
      dot.geometry.dispose();
      ringMaterial.dispose();
      dotMaterial.dispose();
      trailGeometry.dispose();
      puffGeometry.dispose();
    },
  };
}
