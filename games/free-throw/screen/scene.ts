// Scena 3D dei Tiri liberi con Three.js (docs/06, docs/07, docs/games/free-throw.md).
// Include:
// - Palla da basket a 8 spicchi (così il backspin dato dalla chiusura a gancio si vede a occhio nudo!);
// - Retina 3D agganciata al ferro e aggiornata a 60 Hz dalla simulazione Verlet (`physics.net`);
// - Arco guida tratteggiato per l'assist nei primi tiri;
// - Scia morbida della palla in volo e particelle festive per il canestro / "CIUFF!" dello swish;
// - Regia dinamica della telecamera (dalla lunetta all'inquadratura ravvicinata sul canestro).

import * as THREE from 'three';
import { createFreeThrowEnvironment, type GymScoreboardInfo } from './environment';
import {
  BALL_RADIUS,
  HOOP_Z,
  idealSpeedForAngle,
  RIM_HEIGHT,
  traceBallisticArc,
  type FreeThrowPhysicsWorld,
} from './physics';

export interface FreeThrowScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  update(dt: number): void;
  resetCamera(): void;
  setScoreboard(info: GymScoreboardInfo): void;
  setPlayerColor(color: string): void;
  setGuideArcVisible(visible: boolean): void;
  playShooterRelease(): void;
  resetShooterPose(): void;
  playShotOutcomeFx(outcome: 'swish' | 'make' | 'miss', color: string): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/**
 * Genera le texture procedurali (colore + bump) della palla da basket calcolando
 * la distanza geodetica direttamente sulla sfera unitaria 3D (nx, ny, nz).
 * In questo modo gli 8 spicchi classici (equatore, meridiano e i 2 lobi curvi laterali)
 * hanno spessore uniforme su tutta la sfera senza distorsioni ai poli.
 */
function createBasketballTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const width = 512;
  const height = 256;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;

  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');

  if (colorCtx && bumpCtx && typeof colorCtx.createImageData === 'function') {
    const colorImg = colorCtx.createImageData(width, height);
    const bumpImg = bumpCtx.createImageData(width, height);
    const cData = colorImg.data;
    const bData = bumpImg.data;

    // Pre-calcolo trigonometrico per mappare (u, v) sulla sfera 3D
    const cosPhi = new Float32Array(width);
    const sinPhi = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const phi = ((x + 0.5) / width) * Math.PI * 2;
      cosPhi[x] = Math.cos(phi);
      sinPhi[x] = Math.sin(phi);
    }

    const cosTheta = new Float32Array(height);
    const sinTheta = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      const theta = ((y + 0.5) / height) * Math.PI;
      cosTheta[y] = Math.cos(theta);
      sinTheta[y] = Math.sin(theta);
    }

    // Semiasse dei 2 lobi curvi degli 8 spicchi sulla sfera unitaria
    const lobeA = 0.52;
    const lobeB = 0.84;
    const invA2 = 1 / (lobeA * lobeA);
    const invB2 = 1 / (lobeB * lobeB);
    const invA4 = invA2 * invA2;
    const invB4 = invB2 * invB2;
    const seamHalfWidth = 0.024;
    const seamSoftEdge = 0.012;

    let idx = 0;
    for (let y = 0; y < height; y++) {
      const ny = cosTheta[y]!;
      const st = sinTheta[y]!;
      for (let x = 0; x < width; x++) {
        const nx = -cosPhi[x]! * st;
        const nz = sinPhi[x]! * st;

        // 1. Due cerchi massimi ortogonali (ny = 0 e nz = 0) -> ruotano attorno a X in backspin
        const dEq = Math.abs(ny);
        const dMer = Math.abs(nz);

        // 2. Due cuciture curve a lobo (una nell'emisfero nx > 0, una in nx < 0) per gli 8 spicchi
        const fLobe = ny * ny * invA2 + nz * nz * invB2 - 1;
        const gradLen = 2 * Math.sqrt(Math.max(1e-4, ny * ny * invA4 + nz * nz * invB4));
        const dLobe = Math.abs(fLobe) / gradLen;

        const dSeam = Math.min(dEq, dMer, dLobe);

        // Profilo morbido del solco nero
        let seamMask = 0;
        if (dSeam < seamHalfWidth + seamSoftEdge) {
          const t = Math.max(0, (dSeam - seamHalfWidth) / seamSoftEdge);
          seamMask = 1 - t * t * (3 - 2 * t);
        }

        // Grana "pebbled" 3D distribuita uniformemente sulla sfera
        const pFreq = 115;
        const pebble =
          Math.sin(nx * pFreq) * Math.sin(ny * pFreq) * Math.sin(nz * pFreq) +
          0.5 * Math.cos((nx + ny) * 85) * Math.sin((nz - ny) * 85);
        const pebbleBump = pebble > 0.15 ? 1 : pebble < -0.2 ? -0.6 : 0;

        // Colore base arancio caldo da pallone da gara + leggera ombreggiatura ai bordi del solco
        const bevel = dSeam < seamHalfWidth * 2.2 ? 0.92 : 1.0;
        const orangeR = (238 + pebbleBump * 9) * bevel;
        const orangeG = (102 + pebbleBump * 6) * bevel;
        const orangeB = (22 + pebbleBump * 3) * bevel;

        // Colore cucitura nera/antracite
        const seamR = 26;
        const seamG = 20;
        const seamB = 18;

        cData[idx] = Math.round(orangeR * (1 - seamMask) + seamR * seamMask);
        cData[idx + 1] = Math.round(orangeG * (1 - seamMask) + seamG * seamMask);
        cData[idx + 2] = Math.round(orangeB * (1 - seamMask) + seamB * seamMask);
        cData[idx + 3] = 255;

        // Bump map: solco scavato (0) nelle cuciture, rilievo sui pallini della gomma
        const bumpVal = Math.round((1 - seamMask) * (175 + pebbleBump * 45));
        bData[idx] = bumpVal;
        bData[idx + 1] = bumpVal;
        bData[idx + 2] = bumpVal;
        bData[idx + 3] = 255;

        idx += 4;
      }
    }

    colorCtx.putImageData(colorImg, 0, 0);
    bumpCtx.putImageData(bumpImg, 0, 0);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  return { map, bumpMap };
}

export function createFreeThrowScene(
  container: HTMLElement,
  physics: FreeThrowPhysicsWorld,
): FreeThrowScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1B243B');
  scene.fog = new THREE.Fog('#1B243B', 14, 28);

  const camera = new THREE.PerspectiveCamera(
    46,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.1,
    60,
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  // ---------- 1. Illuminazione calda da palestra ("Soft Toy", docs/07 § 3) ----------
  const hemiLight = new THREE.HemisphereLight('#FFF5E0', '#B87B3E', 1.35);
  scene.add(hemiLight);

  const mainLight = new THREE.DirectionalLight('#FFF8EB', 1.75);
  mainLight.position.set(3.5, 8.5, -1.5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 1024;
  mainLight.shadow.mapSize.height = 1024;
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 20;
  mainLight.shadow.camera.left = -5.5;
  mainLight.shadow.camera.right = 5.5;
  mainLight.shadow.camera.top = 6;
  mainLight.shadow.camera.bottom = -2;
  scene.add(mainLight);

  const hoopSpotlight = new THREE.SpotLight('#FFE0B2', 2.6, 12, Math.PI / 3.5, 0.45);
  hoopSpotlight.position.set(0, 6.2, HOOP_Z - 1.2);
  hoopSpotlight.target.position.set(0, RIM_HEIGHT, HOOP_Z);
  scene.add(hoopSpotlight);
  scene.add(hoopSpotlight.target);

  // ---------- 2. Palestra di quartiere ----------
  const environment = createFreeThrowEnvironment();
  scene.add(environment.group);

  // ---------- 3. Retina dinamica in fisica Verlet ----------
  const netPositions = physics.net.writeLinePositions();
  const netGeo = new THREE.BufferGeometry();
  const netPosAttr = new THREE.BufferAttribute(netPositions, 3);
  netPosAttr.setUsage(THREE.DynamicDrawUsage);
  netGeo.setAttribute('position', netPosAttr);
  const netMat = new THREE.LineBasicMaterial({ color: '#FFFDF7', linewidth: 2 });
  const netLines = new THREE.LineSegments(netGeo, netMat);
  scene.add(netLines);

  // ---------- 4. Palla da basket ----------
  const { map: ballTex, bumpMap: ballBumpTex } = createBasketballTextures();
  const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 48, 36);
  const ballMat = new THREE.MeshStandardMaterial({
    map: ballTex,
    bumpMap: ballBumpTex,
    bumpScale: 0.0035,
    roughness: 0.44,
    metalness: 0.03,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  scene.add(ballMesh);

  // Ombra morbida sul parquet esattamente sotto la palla (fondamentale per leggere la profondità!)
  const ballShadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.15, 24);
  ballShadowGeo.rotateX(-Math.PI / 2);
  const ballShadowMat = new THREE.MeshBasicMaterial({
    color: '#1E2A4A',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
  ballShadow.position.y = 0.008;
  scene.add(ballShadow);

  // ---------- 5. Arco guida tratteggiato (Assist per i primi tiri, docs/games/free-throw.md § Assist) ----------
  const idealSpeed = idealSpeedForAngle(53, 0.85);
  const arcPts = traceBallisticArc(idealSpeed, 53, 0.85).map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const arcCurve = new THREE.CatmullRomCurve3(arcPts);
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arcCurve.getPoints(48));
  const arcMat = new THREE.LineDashedMaterial({
    color: '#FFD23F',
    dashSize: 0.16,
    gapSize: 0.1,
    transparent: true,
    opacity: 0.72,
  });
  const guideArcLine = new THREE.Line(arcGeo, arcMat);
  guideArcLine.computeLineDistances();
  scene.add(guideArcLine);

  // ---------- 6. Scia morbida della palla in volo ----------
  const TRAIL_LEN = 18;
  const trailPts: THREE.Vector3[] = Array.from({ length: TRAIL_LEN }, () => new THREE.Vector3());
  const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
  const trailMat = new THREE.LineBasicMaterial({
    color: '#FF9A3C',
    transparent: true,
    opacity: 0.55,
  });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  trailLine.visible = false;
  scene.add(trailLine);
  let trailCount = 0;

  // ---------- 7. Particelle festive sul canestro ("CIUFF!") ----------
  const BURST_COUNT = 28;
  const burstGeo = new THREE.OctahedronGeometry(0.045, 0);
  const burstMat = new THREE.MeshBasicMaterial({ color: '#FFD23F', toneMapped: false });
  const burstMesh = new THREE.InstancedMesh(burstGeo, burstMat, BURST_COUNT);
  burstMesh.visible = false;
  scene.add(burstMesh);
  const burstParticles: { pos: THREE.Vector3; vel: THREE.Vector3 }[] = Array.from(
    { length: BURST_COUNT },
    () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3() }),
  );
  let burstTimer = -1;
  let shakeTimer = 0;
  const burstDummy = new THREE.Object3D();

  // ---------- 8. Regia della Telecamera ----------
  const initialCamPos = new THREE.Vector3(0.32, 2.28, -2.35);
  const initialCamLook = new THREE.Vector3(0, 2.95, HOOP_Z);
  const currentLook = initialCamLook.clone();
  camera.position.copy(initialCamPos);
  camera.lookAt(currentLook);

  const resetCamera = () => {
    camera.position.copy(initialCamPos);
    currentLook.copy(initialCamLook);
    camera.lookAt(currentLook);
    trailLine.visible = false;
    trailCount = 0;
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
    setPlayerColor: (color) => {
      environment.setShooterColor(color);
      trailMat.color.set(color);
    },
    setGuideArcVisible: (visible) => {
      guideArcLine.visible = visible;
    },
    playShooterRelease: () => environment.playShooterRelease(),
    resetShooterPose: () => environment.resetShooterPose(),

    playShotOutcomeFx(outcome, color) {
      environment.playCrowdReaction(outcome);
      if (outcome === 'swish' || outcome === 'make') {
        burstTimer = 0;
        shakeTimer = outcome === 'swish' ? 0.24 : 0.14;
        burstMat.color.set(outcome === 'swish' ? '#FFD23F' : color);
        burstMesh.visible = true;
        for (let i = 0; i < BURST_COUNT; i++) {
          const angle = (i / BURST_COUNT) * Math.PI * 2;
          const speed = (outcome === 'swish' ? 2.8 : 1.9) * (0.6 + (i % 4) * 0.2);
          burstParticles[i]!.pos.set(
            Math.cos(angle) * 0.22,
            RIM_HEIGHT,
            HOOP_Z + Math.sin(angle) * 0.22,
          );
          burstParticles[i]!.vel.set(
            Math.cos(angle) * speed,
            1.6 + (i % 3) * 0.9,
            Math.sin(angle) * speed,
          );
        }
      }
    },

    update(dt: number) {
      // 1. Palla
      const bPos = physics.ballBody.translation();
      const bRot = physics.ballBody.rotation();
      ballMesh.position.set(bPos.x, bPos.y, bPos.z);
      ballMesh.quaternion.set(bRot.x, bRot.y, bRot.z, bRot.w);

      // Ombra sul parquet
      ballShadow.position.set(bPos.x, 0.008, bPos.z);
      const heightScale = 1 + Math.max(0, bPos.y) * 0.18;
      ballShadow.scale.setScalar(heightScale);
      ballShadowMat.opacity = Math.max(0.05, 0.3 / (1 + Math.max(0, bPos.y) * 0.35));

      // 2. Scia della palla in volo
      if (physics.isBallActive()) {
        if (trailCount === 0) {
          for (const p of trailPts) p.set(bPos.x, bPos.y, bPos.z);
        } else {
          for (let i = TRAIL_LEN - 1; i > 0; i--) {
            trailPts[i]!.copy(trailPts[i - 1]!);
          }
          trailPts[0]!.set(bPos.x, bPos.y, bPos.z);
        }
        trailCount++;
        trailGeo.setFromPoints(trailPts);
        trailLine.visible = true;
      } else if (trailLine.visible) {
        trailLine.visible = false;
        trailCount = 0;
      }

      // 3. Retina Verlet
      physics.net.writeLinePositions(netPositions);
      netPosAttr.needsUpdate = true;

      // 4. Particelle di festa sul canestro
      if (burstTimer >= 0) {
        burstTimer += dt;
        const life = 1.1;
        if (burstTimer >= life) {
          burstTimer = -1;
          burstMesh.visible = false;
        } else {
          const scale = Math.max(0.01, 1 - burstTimer / life);
          for (let i = 0; i < BURST_COUNT; i++) {
            const p = burstParticles[i]!;
            p.vel.y -= 6.5 * dt;
            p.pos.addScaledVector(p.vel, dt);
            burstDummy.position.copy(p.pos);
            burstDummy.rotation.set(burstTimer * 6, i, burstTimer * 4);
            burstDummy.scale.setScalar(scale);
            burstDummy.updateMatrix();
            burstMesh.setMatrixAt(i, burstDummy.matrix);
          }
          burstMesh.instanceMatrix.needsUpdate = true;
        }
      }

      // 5. Regia dinamica della telecamera: segue l'arco alto della palla e stringe sul canestro
      if (physics.isBallActive()) {
        const progress = Math.min(1, Math.max(0, bPos.z / HOOP_Z));
        const targetCamPos = new THREE.Vector3(
          0.32 * (1 - progress * 0.5) + bPos.x * 0.25,
          2.28 + progress * 0.65,
          -2.35 + progress * 2.1,
        );
        const targetLook = new THREE.Vector3(
          bPos.x * 0.4,
          Math.max(2.6, Math.min(4.2, bPos.y * 0.45 + RIM_HEIGHT * 0.55)),
          HOOP_Z,
        );
        camera.position.lerp(targetCamPos, Math.min(1, dt * 4.5));
        currentLook.lerp(targetLook, Math.min(1, dt * 6.0));
        camera.lookAt(currentLook);
      } else {
        camera.position.lerp(initialCamPos, Math.min(1, dt * 5.0));
        currentLook.lerp(initialCamLook, Math.min(1, dt * 5.0));
        camera.lookAt(currentLook);
      }

      environment.update(dt);

      // Camera shake morbido sullo swish / canestro
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        const amp = shakeTimer * 0.08;
        const ox = Math.sin(performance.now() * 0.07) * amp;
        const oy = Math.cos(performance.now() * 0.09) * amp;
        camera.position.x += ox;
        camera.position.y += oy;
        renderer.render(scene, camera);
        camera.position.x -= ox;
        camera.position.y -= oy;
      } else {
        renderer.render(scene, camera);
      }
    },

    dispose() {
      environment.dispose();
      netGeo.dispose();
      netMat.dispose();
      ballGeo.dispose();
      ballMat.dispose();
      ballTex.dispose();
      ballBumpTex.dispose();
      ballShadowGeo.dispose();
      ballShadowMat.dispose();
      arcGeo.dispose();
      arcMat.dispose();
      trailGeo.dispose();
      trailMat.dispose();
      burstGeo.dispose();
      burstMat.dispose();
      burstMesh.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

