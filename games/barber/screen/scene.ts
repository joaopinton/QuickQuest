// Scena 3D del Barber shop con Three.js (docs/06, docs/07, docs/games/barber.md).
// Mette insieme la bottega, il cliente con i capelli a gusci, l'attrezzo del barbiere (che fluttua
// dove punta il telefono e tocca i capelli solo quando ci arriva), il segno del pennello dove
// taglia e i ciuffi che cadono. La regia della telecamera ha tre inquadrature: arrivo del
// cliente, lavoro (vista dall'alto con l'angolo usato da pointing.ts) e specchio a fine taglio.

import * as THREE from 'three';
import type { BarberTool } from '../shared/events';
import { hairHeight, type Vec3 } from '../shared/head';
import { createBarberClient, type ClientLook } from './client';
import { createClippings } from './clippings';
import { createBarberEnvironment } from './environment';
import type { HairMap } from './hair-map';
import { VIEW_TILT, type ViewPoint } from './pointing';
import type { Reaction } from './rules';
import { createToolModel } from './tool-model';

export type CameraShot = 'intro' | 'work' | 'mirror';

export interface ToolContact {
  readonly dir: Vec3;
  /** Lunghezza dei capelli sotto lo strumento (0..1), per appoggiarlo sulle punte. */
  readonly length: number;
}

export interface ToolView {
  /** Dove punta il telefono, sul piano della vista di lavoro (raggi della testa). */
  readonly view: ViewPoint;
  /** Dove tocca i capelli; `null` = l'attrezzo è nel vuoto accanto alla testa. */
  readonly contact: ToolContact | null;
  /** Raggio visibile del pennello, in radianti. */
  readonly radius: number;
  /** Macchinetta accesa. */
  readonly isOn: boolean;
  readonly tool: BarberTool;
}

export interface BarberScene {
  update(dt: number): void;
  resize(width: number, height: number): void;
  newClient(map: HairMap, target: Uint8Array, look: ClientLook): void;
  markHairDirty(): void;
  setHeadYaw(yaw: number): void;
  setTool(tool: ToolView | null): void;
  /** Le forbici si chiudono (animazione). */
  snip(): void;
  setBarberColor(color: string): void;
  spawnClippings(dir: Vec3, length: number, removed: number): void;
  setGhost(alpha: number): void;
  setShot(shot: CameraShot): void;
  setReaction(r: Reaction | null): void;
  dispose(): void;
}

const WORK_DISTANCE = 2.1;
const MIRROR_DISTANCE = 1.45;
/** L'attrezzo nel vuoto sta un po' davanti al piano della testa, verso la telecamera. */
const FLOAT_DEPTH = 0.75;
/** Quanto in fretta l'attrezzo raggiunge la posa nuova, 1/s. */
const TOOL_FOLLOW = 22;
const DOWN = new THREE.Vector3(0, -1, 0);
/**
 * Qualità adattiva dei capelli: se i frame restano lenti (TV, portatili deboli, WebGL software)
 * si tolgono gusci. Si scende soltanto, a gradini, con una pausa tra un gradino e l'altro.
 */
const SLOW_FRAME_S = 1 / 28;
const QUALITY_STEPS = [24, 16, 10] as const;
const QUALITY_COOLDOWN_S = 1.2;

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

  // Segno del pennello: un alone sottile sulle punte, solo dove l'attrezzo tocca i capelli
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#2EC4B6', transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 10;
  ring.visible = false;
  client.head.add(ring);

  // L'attrezzo vive nel mondo, non sulla testa: si muove libero col telefono
  const tool = createToolModel();
  tool.group.visible = false;
  scene.add(tool.group);
  const toolPos = new THREE.Vector3();
  const toolQuat = new THREE.Quaternion();
  const toolBasis = new THREE.Matrix4();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const camRight = new THREE.Vector3(1, 0, 0);
  const camUp = new THREE.Vector3(0, Math.cos(VIEW_TILT), -Math.sin(VIEW_TILT));
  const camToward = new THREE.Vector3(0, Math.sin(VIEW_TILT), Math.cos(VIEW_TILT));
  const scratch = new THREE.Vector3();
  let hasToolPose = false;

  const headCenter = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  let shot: CameraShot = 'intro';
  let cutting = false;
  let pulse = 0;
  let frameAvg = 1 / 60;
  let qualityStep = 0;
  let qualityWait = QUALITY_COOLDOWN_S;

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
    new THREE.Vector3(dir[0], dir[1], dir[2]).multiplyScalar(1 + hairHeight(length) + lift);

  return {
    update(dt) {
      frameAvg += (dt - frameAvg) * 0.1;
      qualityWait -= dt;
      if (frameAvg > SLOW_FRAME_S && qualityWait <= 0 && qualityStep < QUALITY_STEPS.length - 1) {
        qualityStep += 1;
        qualityWait = QUALITY_COOLDOWN_S;
        client.hair.setShellCount(QUALITY_STEPS[qualityStep]!);
      }
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
        const s = cutting ? 1 + Math.sin(pulse * 30) * 0.05 : 1;
        ring.scale.setScalar(ring.userData.radius * s);
        ringMat.opacity = cutting ? 0.7 : 0.4;
      }
      if (tool.group.visible) {
        const k = hasToolPose ? Math.min(1, dt * TOOL_FOLLOW) : 1;
        tool.group.position.lerp(toolPos, k);
        tool.group.quaternion.slerp(toolQuat, k);
        hasToolPose = true;
      }
      tool.update(dt);
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
    setTool(view) {
      tool.group.visible = view !== null;
      ring.visible = view?.contact != null;
      if (!view) {
        hasToolPose = false;
        tool.setOn(false);
        return;
      }
      cutting = view.isOn;
      tool.setTool(view.tool);
      tool.setOn(view.isOn);
      client.head.getWorldPosition(headCenter);
      const radius = client.head.getWorldScale(scratch).x;
      // "Via dalla testa": la direzione in cui sporge l'impugnatura
      const away = new THREE.Vector3();
      if (view.contact) {
        const p = localPoint(view.contact.dir, view.contact.length, 0.01);
        ring.position.copy(p);
        ring.lookAt(client.head.localToWorld(p.clone().multiplyScalar(2)));
        ring.userData.radius = view.radius;
        toolPos.copy(client.head.localToWorld(localPoint(view.contact.dir, view.contact.length, 0)));
        const normal = toolPos.clone().sub(headCenter).normalize();
        away.copy(normal).multiplyScalar(0.55).addScaledVector(camToward, 0.6).addScaledVector(DOWN, 0.35);
      } else {
        toolPos
          .copy(headCenter)
          .addScaledVector(camRight, view.view.sx * radius)
          .addScaledVector(camUp, view.view.sy * radius)
          .addScaledVector(camToward, FLOAT_DEPTH * radius);
        away.copy(camToward).multiplyScalar(0.6).addScaledVector(DOWN, 0.6);
      }
      // +Y dell'attrezzo verso la testa, il dorso (+Z) verso la telecamera
      axisY.copy(away).normalize().negate();
      axisZ.copy(camToward).addScaledVector(axisY, -camToward.dot(axisY)).normalize();
      axisX.crossVectors(axisY, axisZ);
      toolBasis.makeBasis(axisX, axisY, axisZ);
      toolQuat.setFromRotationMatrix(toolBasis);
    },
    snip() {
      tool.snip();
    },
    setBarberColor(color) {
      ringMat.color.set(color);
      tool.setColor(color);
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
      tool.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
