// Scena visiva 3D del Bowling con Three.js (docs/06, docs/07, docs/games/bowling.md § 2, 6).
// Include pista con 39 tavole e frecce di mira, 10 birilli, canaline, palla con riflessi e regia camera.

import * as THREE from 'three';
import {
  BALL_RADIUS,
  HEADPIN_Z,
  LANE_LENGTH,
  LANE_WIDTH,
  OIL_LENGTH,
  type PhysicsWorldState,
} from './physics';
import { createBowlingEnvironment, type ScoreboardInfo } from './environment';
import { createPinGeometry, PIN_HEIGHT } from './pin-geometry';
import { createStrikeFx } from './strike-fx';

export interface BowlingScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  update(dt: number): void;
  resetCamera(): void;
  setScoreboard(info: ScoreboardInfo): void;
  setBallColor(color: string): void;
  playSweep(): void;
  /** Festa dello strike nella scena: coriandoli, lampo col colore del giocatore, camera che trema. */
  playStrike(color: string): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Genera una texture procedurale per le tavole in legno della pista da bowling */
function createLaneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d')!;

  // 39 tavole di acero/pino con leggera variazione di tonalità
  const boards = 39;
  const boardWidth = canvas.width / boards;

  for (let i = 0; i < boards; i++) {
    const tone = 215 + Math.sin(i * 1.7) * 12 + Math.cos(i * 3.1) * 8;
    ctx.fillStyle = `rgb(${tone}, ${tone * 0.88}, ${tone * 0.7})`;
    ctx.fillRect(i * boardWidth, 0, boardWidth, canvas.height);

    // Linee sottili tra le tavole
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(i * boardWidth, 0, 1, canvas.height);
  }

  // 7 Frecce di mira (a circa 4.6 m dalla linea di fallo: ~25% della lunghezza)
  const arrowY = canvas.height * 0.25;
  ctx.fillStyle = '#4a2810';
  const arrowPositions = [5, 10, 15, 20, 25, 30, 35]; // indici tavola
  for (const b of arrowPositions) {
    const x = b * boardWidth;
    ctx.beginPath();
    ctx.moveTo(x, arrowY);
    ctx.lineTo(x + boardWidth, arrowY);
    ctx.lineTo(x + boardWidth / 2, arrowY - 24);
    ctx.closePath();
    ctx.fill();
  }

  // Linea di fallo (rossa, all'inizio della pista)
  ctx.fillStyle = '#e53935';
  ctx.fillRect(0, 0, canvas.width, 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // senza questo i colori risultano spenti
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function createBowlingScene(
  container: HTMLElement,
  physics: PhysicsWorldState,
): BowlingScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d0919'); // Sala bowling serale (docs/games/bowling.md § 2)
  scene.fog = new THREE.Fog('#0d0919', 26, 48);

  const camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    80,
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // ---------- Luci ----------
  const ambientLight = new THREE.AmbientLight('#ffe0b2', 1.3); // ambra calda accogliente
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight('#ffffff', 1.6);
  mainLight.position.set(2, 6, 4);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 30;
  mainLight.shadow.camera.left = -3;
  mainLight.shadow.camera.right = 3;
  mainLight.shadow.camera.top = 22;
  mainLight.shadow.camera.bottom = -2;
  scene.add(mainLight);

  // Accento viola neon Soft Toy lungo la pista
  const rimLight = new THREE.PointLight('#8E5BFF', 2.0, 15);
  rimLight.position.set(-2, 3, HEADPIN_Z - 2);
  scene.add(rimLight);

  const pinSpotlight = new THREE.SpotLight('#ffffff', 2.5, 12, Math.PI / 4, 0.4);
  pinSpotlight.position.set(0, 4.5, HEADPIN_Z - 1);
  pinSpotlight.target.position.set(0, 0, HEADPIN_Z + 0.5);
  scene.add(pinSpotlight);
  scene.add(pinSpotlight.target);

  // ---------- Geometria Pista ----------
  const laneTexture = createLaneTexture();
  const laneMaterial = new THREE.MeshStandardMaterial({
    map: laneTexture,
    roughness: 0.18, // Pista lucida
    metalness: 0.05,
  });

  const laneGeo = new THREE.BoxGeometry(LANE_WIDTH, 0.1, LANE_LENGTH + 2.0);
  const laneMesh = new THREE.Mesh(laneGeo, laneMaterial);
  laneMesh.position.set(0, -0.05, (LANE_LENGTH + 2.0) / 2);
  laneMesh.receiveShadow = true;
  scene.add(laneMesh);

  // Approccio (rincorsa in legno chiaro prima della linea di fallo)
  const approachGeo = new THREE.BoxGeometry(LANE_WIDTH * 1.5, 0.1, 4.5);
  const approachMat = new THREE.MeshStandardMaterial({ color: '#dfc299', roughness: 0.6 });
  const approachMesh = new THREE.Mesh(approachGeo, approachMat);
  approachMesh.position.set(0, -0.05, -2.25);
  approachMesh.receiveShadow = true;
  scene.add(approachMesh);

  // Canaline sinistra e destra
  const gutterWidth = 0.235;
  const gutterGeo = new THREE.BoxGeometry(gutterWidth, 0.06, LANE_LENGTH + 2.0);
  const gutterMat = new THREE.MeshStandardMaterial({ color: '#252033', roughness: 0.4 });

  const leftGutter = new THREE.Mesh(gutterGeo, gutterMat);
  leftGutter.position.set(-LANE_WIDTH / 2 - gutterWidth / 2, -0.07, (LANE_LENGTH + 2.0) / 2);
  scene.add(leftGutter);

  const rightGutter = new THREE.Mesh(gutterGeo, gutterMat);
  rightGutter.position.set(LANE_WIDTH / 2 + gutterWidth / 2, -0.07, (LANE_LENGTH + 2.0) / 2);
  scene.add(rightGutter);

  // Pozzetto e retro birilli (Pin Deck)
  const pitGeo = new THREE.BoxGeometry(LANE_WIDTH + 0.6, 0.4, 1.2);
  const pitMat = new THREE.MeshStandardMaterial({ color: '#1a1824', roughness: 0.8 });
  const pitMesh = new THREE.Mesh(pitGeo, pitMat);
  pitMesh.position.set(0, -0.15, LANE_LENGTH + 2.0 + 0.6);
  scene.add(pitMesh);

  // ---------- Birilli ----------
  const pinGeometry = createPinGeometry();
  const pinBaseOffset = new THREE.Vector3();
  const pinMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.18, // finitura smaltata lucida
    metalness: 0.05,
  });

  // Sala: piste vicine, neon, tabellone, sweeper (environment.ts)
  const environment = createBowlingEnvironment(pinGeometry, pinMaterial);
  scene.add(environment.group);

  const pinMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(pinGeometry, pinMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    pinMeshes.push(mesh);
  }

  // ---------- Palla ----------
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
  const ballMat = new THREE.MeshStandardMaterial({
    color: '#8E5BFF', // viola iconico del Bowling
    roughness: 0.12,
    metalness: 0.25,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  // Tre fori per le dita sulla palla (segno distintivo del bowling e feedback visivo della rotazione)
  const holeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 16);
  const holeMat = new THREE.MeshBasicMaterial({ color: '#1b0e36' });
  const hole1 = new THREE.Mesh(holeGeo, holeMat);
  hole1.position.set(0, BALL_RADIUS - 0.005, 0.035);
  hole1.rotation.x = Math.PI / 4;
  ballMesh.add(hole1);

  const hole2 = new THREE.Mesh(holeGeo, holeMat);
  hole2.position.set(-0.02, BALL_RADIUS - 0.005, 0.015);
  hole2.rotation.x = Math.PI / 4;
  ballMesh.add(hole2);

  const hole3 = new THREE.Mesh(holeGeo, holeMat);
  hole3.position.set(0.02, BALL_RADIUS - 0.005, 0.015);
  hole3.rotation.x = Math.PI / 4;
  ballMesh.add(hole3);

  const strikeFx = createStrikeFx(scene);

  // Regia della telecamera (dietro il piggy -> segui palla -> pin cam, docs/games/bowling.md § 6)
  const initialCamPos = new THREE.Vector3(0, 1.15, -1.9);
  const initialCamTarget = new THREE.Vector3(0, 0.2, HEADPIN_Z - 3);
  camera.position.copy(initialCamPos);
  camera.lookAt(initialCamTarget);

  const resetCamera = () => {
    camera.position.copy(initialCamPos);
    camera.lookAt(initialCamTarget);
  };

  const resize = (w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  return {
    scene,
    camera,
    renderer,

    resetCamera,
    resize,
    setScoreboard: (info) => environment.setScoreboard(info),
    setBallColor: (color) => ballMat.color.set(color),
    playSweep: () => environment.playSweep(),
    playStrike: (color) => strikeFx.play(color),

    update(dt: number) {
      // 1. Sincronizzazione visiva dei 10 birilli dalla fisica Rapier
      for (let i = 0; i < physics.pinBodies.length; i++) {
        const body = physics.pinBodies[i];
        const mesh = pinMeshes[i];
        if (!body || !mesh) continue;
        mesh.visible = !physics.isPinRemoved(i);
        if (!mesh.visible) continue;

        const pos = body.translation();
        const rot = body.rotation();

        // L'origine della mesh è alla base del birillo, quella del corpo a metà altezza:
        // l'offset va ruotato col birillo, altrimenti un birillo inclinato appare sfalsato.
        mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        pinBaseOffset.set(0, -PIN_HEIGHT / 2, 0).applyQuaternion(mesh.quaternion);
        mesh.position.set(pos.x + pinBaseOffset.x, pos.y + pinBaseOffset.y, pos.z + pinBaseOffset.z);
      }

      // 2. Sincronizzazione visiva della palla
      const bPos = physics.ballBody.translation();
      const bRot = physics.ballBody.rotation();
      ballMesh.position.set(bPos.x, bPos.y, bPos.z);
      ballMesh.quaternion.set(bRot.x, bRot.y, bRot.z, bRot.w);

      // 3. Regia dinamica della telecamera
      if (physics.isBallActive() && bPos.z > 0.5) {
        if (bPos.z < HEADPIN_Z - 3.8) {
          // Fase 2: Segui palla da dietro e dall'alto con inseguimento fluido
          const targetCamZ = bPos.z - 2.2;
          const targetCamY = Math.max(0.65, 1.3 - (bPos.z / HEADPIN_Z) * 0.5);
          camera.position.x += (bPos.x * 0.5 - camera.position.x) * 0.08;
          camera.position.y += (targetCamY - camera.position.y) * 0.08;
          camera.position.z += (targetCamZ - camera.position.z) * 0.12;
          camera.lookAt(bPos.x * 0.3, 0.2, bPos.z + 4.0);
        } else {
          // Fase 3: Pin Cam ad alto impatto all'arrivo sui birilli
          const pinCamPos = new THREE.Vector3(1.15, 0.85, HEADPIN_Z - 1.8);
          camera.position.lerp(pinCamPos, 0.08);
          camera.lookAt(0, 0.2, HEADPIN_Z + 0.4);
        }
      }

      environment.update(dt);
      // tremolio dello strike: solo per questo frame, la regia resta dov'era
      const shake = strikeFx.update(dt);
      camera.position.add(shake);
      renderer.render(scene, camera);
      camera.position.sub(shake);
    },

    dispose() {
      strikeFx.dispose();
      environment.dispose();
      renderer.dispose();
      laneGeo.dispose();
      laneMaterial.dispose();
      laneTexture.dispose();
      approachGeo.dispose();
      approachMat.dispose();
      gutterGeo.dispose();
      gutterMat.dispose();
      pitGeo.dispose();
      pitMat.dispose();
      pinGeometry.dispose();
      pinMaterial.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      holeGeo.dispose();
      holeMat.dispose();
      renderer.domElement.remove();
    },
  };
}
