// Effetto 3D dello strike (docs/games/bowling.md § 6): coriandoli luminosi che esplodono dal pin deck,
// lampo di luce col colore del giocatore, onda d'urto sulla pista e camera che trema.
// Tutto procedurale (ADR-005): niente texture né modelli.
import * as THREE from 'three';
import { HEADPIN_Z } from './physics';

const PARTICLES = 260;
const LIFE_S = 1.8;
const GRAVITY = -5.5; // m/s²: un po' meno della realtà, i coriandoli "galleggiano"
const DRAG = 0.6; // 1/s
const SHAKE_S = 0.55;
const SHAKE_M = 0.035; // ampiezza massima del tremolio
const RING_S = 0.9;
const RING_MAX_SCALE = 3.2;
const FLASH_S = 0.7;
const FLASH_PEAK = 9;
const PALETTE = ['#ffd84d', '#ff5fd2', '#4de8ff', '#ffffff'];
const ORIGIN = new THREE.Vector3(0, 0.25, HEADPIN_Z + 0.45); // centro del castello di birilli

export interface StrikeFx {
  /** Fa partire l'effetto col colore del giocatore. */
  play(color: string): void;
  /** Avanza l'effetto; restituisce lo spostamento della camera per il tremolio (da togliere dopo il render). */
  update(dt: number): THREE.Vector3;
  dispose(): void;
}

export function createStrikeFx(scene: THREE.Scene): StrikeFx {
  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 3);
  const velocities = new Float32Array(PARTICLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);

  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(ORIGIN.x, 0.01, ORIGIN.z);
  ring.visible = false;
  scene.add(ring);

  const flash = new THREE.PointLight('#ffffff', 0, 6, 1.5);
  flash.position.set(ORIGIN.x, 0.8, ORIGIN.z - 0.6);
  scene.add(flash);

  const shake = new THREE.Vector3();
  // chi ha chiesto meno movimento vede coriandoli e lampo, ma la camera resta ferma
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tmpColor = new THREE.Color();
  let elapsed = Number.POSITIVE_INFINITY; // nessun effetto in corso

  function spawn(color: string) {
    for (let i = 0; i < PARTICLES; i++) {
      const k = i * 3;
      positions[k] = ORIGIN.x + (Math.random() - 0.5) * 0.7;
      positions[k + 1] = ORIGIN.y + Math.random() * 0.25;
      positions[k + 2] = ORIGIN.z + (Math.random() - 0.5) * 0.6;
      // fontana verso l'alto e un po' verso la camera, aperta ai lati
      const a = Math.random() * Math.PI * 2;
      const spread = 0.6 + Math.random() * 2.2;
      velocities[k] = Math.cos(a) * spread;
      velocities[k + 1] = 2.2 + Math.random() * 3.4;
      velocities[k + 2] = Math.sin(a) * spread * 0.5 - Math.random() * 1.6;
      tmpColor.set(i % 3 === 0 ? color : PALETTE[i % PALETTE.length]!);
      colors[k] = tmpColor.r;
      colors[k + 1] = tmpColor.g;
      colors[k + 2] = tmpColor.b;
    }
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.color!.needsUpdate = true;
  }

  function stepParticles(dt: number) {
    const drag = Math.max(0, 1 - DRAG * dt);
    for (let i = 0; i < PARTICLES; i++) {
      const k = i * 3;
      velocities[k] = velocities[k]! * drag;
      velocities[k + 1] = velocities[k + 1]! * drag + GRAVITY * dt;
      velocities[k + 2] = velocities[k + 2]! * drag;
      positions[k] = positions[k]! + velocities[k]! * dt;
      positions[k + 1] = Math.max(0.01, positions[k + 1]! + velocities[k + 1]! * dt);
      positions[k + 2] = positions[k + 2]! + velocities[k + 2]! * dt;
    }
    geometry.attributes.position!.needsUpdate = true;
  }

  return {
    play(color: string) {
      elapsed = 0;
      spawn(color);
      ringMat.color.set(color);
      flash.color.set(color);
      points.visible = true;
      ring.visible = true;
    },

    update(dt: number): THREE.Vector3 {
      shake.set(0, 0, 0);
      if (elapsed > LIFE_S) return shake;
      elapsed += dt;
      const t = elapsed;

      stepParticles(dt);
      material.opacity = t < 0.08 ? t / 0.08 : Math.max(0, 1 - (t - 0.8) / (LIFE_S - 0.8));

      const r = Math.min(1, t / RING_S);
      ring.scale.setScalar(0.3 + (RING_MAX_SCALE - 0.3) * (1 - (1 - r) ** 3));
      ringMat.opacity = 0.9 * (1 - r);

      // lampo: sale in 60 ms, poi si spegne
      flash.intensity = t < 0.06 ? (FLASH_PEAK * t) / 0.06 : FLASH_PEAK * Math.max(0, 1 - (t - 0.06) / FLASH_S) ** 2;

      if (t < SHAKE_S && !reduceMotion) {
        const amp = SHAKE_M * (1 - t / SHAKE_S) ** 2;
        shake.set(Math.sin(t * 91) * amp, Math.sin(t * 73 + 1.3) * amp * 0.7, Math.sin(t * 57 + 2.1) * amp * 0.4);
      }

      if (elapsed > LIFE_S) {
        points.visible = false;
        ring.visible = false;
        flash.intensity = 0;
      }
      return shake;
    },

    dispose() {
      scene.remove(points, ring, flash);
      geometry.dispose();
      material.dispose();
      ringGeo.dispose();
      ringMat.dispose();
    },
  };
}
