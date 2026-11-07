// Ciuffi che cadono (docs/games/barber.md): InstancedMesh con un pool fisso, quantità
// proporzionale ai capelli tolti. Toccato il pavimento restano lì: a fine cliente c'è il mucchietto.

import * as THREE from 'three';

const POOL = 480;
const GRAVITY = -5.5;
const FLOOR_Y = 0.012;
/** Ciuffi per unità di capelli tolti (texel × lunghezza). */
const PER_REMOVED = 0.9;
const MAX_PER_BURST = 14;

interface Bit {
  alive: boolean;
  landed: boolean;
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  spin: number;
  angle: number;
}

export interface Clippings {
  readonly mesh: THREE.InstancedMesh;
  spawn(at: THREE.Vector3, outward: THREE.Vector3, removed: number): void;
  setColor(color: string): void;
  clear(): void;
  update(dt: number): void;
  dispose(): void;
}

export function createClippings(): Clippings {
  const geo = new THREE.BoxGeometry(0.012, 0.055, 0.012);
  const mat = new THREE.MeshStandardMaterial({ color: '#5B3A29', roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, POOL);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const bits: Bit[] = Array.from({ length: POOL }, () => ({
    alive: false,
    landed: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    spin: 0,
    angle: 0,
  }));
  let next = 0;
  let pending = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0.3, 0.2, 1).normalize();
  const one = new THREE.Vector3(1, 1, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  return {
    mesh,
    spawn(at, outward, removed) {
      pending += removed * PER_REMOVED;
      const n = Math.min(MAX_PER_BURST, Math.floor(pending));
      pending -= n;
      for (let i = 0; i < n; i++) {
        const b = bits[next]!;
        next = (next + 1) % POOL;
        b.alive = true;
        b.landed = false;
        b.pos.copy(at).addScaledVector(outward, 0.02);
        b.vel
          .copy(outward)
          .multiplyScalar(0.4 + Math.random() * 0.4)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
        b.spin = (Math.random() - 0.5) * 16;
        b.angle = Math.random() * Math.PI;
      }
    },
    setColor(color) {
      mat.color.set(color);
    },
    clear() {
      bits.forEach((b) => {
        b.alive = false;
      });
      pending = 0;
    },
    update(dt) {
      let count = 0;
      for (let i = 0; i < POOL; i++) {
        const b = bits[i]!;
        if (b.alive && !b.landed) {
          b.vel.y += GRAVITY * dt;
          b.vel.multiplyScalar(1 - Math.min(1, dt * 1.8));
          b.pos.addScaledVector(b.vel, dt);
          b.angle += b.spin * dt;
          if (b.pos.y <= FLOOR_Y) {
            b.pos.y = FLOOR_Y;
            b.landed = true;
            b.angle = Math.PI / 2 + (b.angle % 1);
          }
        }
        if (b.alive) {
          q.setFromAxisAngle(axis, b.angle);
          m4.compose(b.pos, q, one);
        } else {
          m4.copy(hidden);
        }
        mesh.setMatrixAt(i, m4);
        if (b.alive) count = i + 1;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
