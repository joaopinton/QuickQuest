// Scena 3D del Barber shop con Three.js (docs/06, docs/07, docs/games/barber.md).
// Mette insieme la bottega, il cliente con i capelli a gusci, l'anello luminoso dello strumento
// sulla testa e i ciuffi che cadono. La regia della telecamera ha tre inquadrature: arrivo del
// cliente, lavoro (vista dall'alto con l'angolo usato da pointing.ts) e specchio a fine taglio.

import * as THREE from 'three';
import type { Vec3 } from '../shared/head';
import { createBarberClient, type ClientLook } from './client';
import { createClippings } from './clippings';
import { createBarberEnvironment } from './environment';
import type { HairMap } from './hair-map';
import { MAX_HAIR } from './hair-shells';
import { VIEW_TILT } from './pointing';
import type { Reaction } from './rules';

export type CameraShot = 'intro' | 'work' | 'mirror';

export interface CursorView {
  readonly dir: Vec3;
  /** Lunghezza dei capelli sotto lo strumento (0..1), per appoggiare l'anello sulle punte. */
  readonly length: number;
  /** Raggio visibile del pennello, in radianti. */
  readonly radius: number;
  readonly isCutting: boolean;
}

export interface BarberScene {
  update(dt: number): void;
  resize(width: number, height: number): void;
  newClient(map: HairMap, target: Uint8Array, look: ClientLook): void;
  markHairDirty(): void;
  setHeadYaw(yaw: number): void;
  setCursor(cursor: CursorView | null): void;
  setBarberColor(color: string): void;
  spawnClippings(dir: Vec3, length: number, removed: number): void;
  setGhost(alpha: number): void;
  setShot(shot: CameraShot): void;
  setReaction(r: Reaction | null): void;
  dispose(): void;
}

const WORK_DISTANCE = 2.1;
const MIRROR_DISTANCE = 1.45;

export function createBarberScene(container: HTMLElement): BarberScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#FFF4DE');
  scene.fog = new THREE.Fog('#FFF4DE', 7, 14);
  const camera = new THREE.PerspectiveCamera(38, (container.clientWidth || 1) / (container.clientHeight || 1), 0.05, 40);

  const env = createBarberEnvironment();
  scene.add(env.group);
  const client = createBarberClient(env.seat);
  scene.add(client.group);
  const clippings = createClippings();
  scene.add(clippings.mesh);

  // Anello dello strumento: vive nel riferimento della testa e si gira con lei
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#2EC4B6', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 10;
  ring.visible = false;
  client.head.add(ring);
  const dotGeo = new THREE.CircleGeometry(0.18, 20);
  const dot = new THREE.Mesh(dotGeo, ringMat);
  dot.renderOrder = 10;
  ring.add(dot);

  const headCenter = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let shot: CameraShot = 'intro';
  let cutting = false;
  let pulse = 0;

  const computeShot = () => {
    client.head.getWorldPosition(headCenter);
    if (shot === 'work') {
      desiredPos.set(0, headCenter.y + Math.sin(VIEW_TILT) * WORK_DISTANCE, headCenter.z + Math.cos(VIEW_TILT) * WORK_DISTANCE);
      desiredLook.copy(headCenter);
    } else if (shot === 'mirror') {
      desiredPos.set(0.35, headCenter.y + 0.15, headCenter.z + MIRROR_DISTANCE);
      desiredLook.set(headCenter.x, headCenter.y - 0.05, headCenter.z);
    } else {
      desiredPos.set(1.6, 2.1, 3.6);
      desiredLook.set(0, 1.2, 0);
    }
  };
  computeShot();
  camera.position.copy(desiredPos);
  lookAt.copy(desiredLook);
  camera.lookAt(lookAt);

  const localPoint = (dir: Vec3, length: number, lift: number) =>
    new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(1 + MAX_HAIR * length + lift);

  return {
    update(dt) {
      env.update(dt);
      client.update(dt);
      clippings.update(dt);
      computeShot();
      const k = Math.min(1, dt * 3.2);
      camera.position.lerp(desiredPos, k);
      lookAt.lerp(desiredLook, k);
      camera.lookAt(lookAt);
      pulse += dt;
      if (ring.visible) {
        const s = cutting ? 1 + Math.sin(pulse * 30) * 0.06 : 1;
        ring.scale.setScalar(ring.userData.radius * s);
        ringMat.opacity = cutting ? 1 : 0.75;
      }
      renderer.render(scene, camera);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    },
    newClient(map, target, look) {
      client.hair.setMaps(map, target);
      client.setLook(look);
      client.setReaction(null);
      client.walkIn();
      clippings.clear();
      clippings.setColor(look.hair);
    },
    markHairDirty() {
      client.hair.markDirty();
    },
    setHeadYaw(yaw) {
      client.setYawTarget(yaw);
    },
    setCursor(cursor) {
      ring.visible = cursor !== null;
      if (!cursor) return;
      cutting = cursor.isCutting;
      const p = localPoint(cursor.dir, cursor.length, 0.03);
      ring.position.copy(p);
      ring.lookAt(client.head.localToWorld(p.clone().multiplyScalar(2)));
      ring.userData.radius = cursor.radius;
    },
    setBarberColor(color) {
      ringMat.color.set(color);
    },
    spawnClippings(dir, length, removed) {
      const local = localPoint(dir, length, 0);
      const world = client.head.localToWorld(local.clone());
      const center = client.head.getWorldPosition(new THREE.Vector3());
      const outward = world.clone().sub(center).normalize();
      clippings.spawn(world, outward, removed);
    },
    setGhost(alpha) {
      client.hair.setGhost(alpha);
    },
    setShot(next) {
      shot = next;
    },
    setReaction(r) {
      client.setReaction(r);
    },
    dispose() {
      env.dispose();
      client.dispose();
      clippings.dispose();
      ringGeo.dispose();
      dotGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
