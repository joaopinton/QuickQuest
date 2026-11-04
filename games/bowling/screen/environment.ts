// Ambientazione procedurale della sala bowling (docs/games/bowling.md § 2 Ambiente, docs/07).
// Sala serale e accogliente: piste vicine, moquette, pareti con onde retro, insegne al neon
// originali (birillo stilizzato e stelline), tabellone sopra i birilli, ritorno palle e sweeper.

import * as THREE from 'three';
import { HEADPIN_Z, LANE_LENGTH, LANE_WIDTH } from './physics';
import { PIN_OFFSETS } from './pin-geometry';

export const LANE_PITCH = 2.3; // distanza tra i centri di due piste vicine
const GUTTER_WIDTH = 0.235;
const NEIGHBOR_LANES = [-2, -1, 1, 2];
const LANE_DEPTH = LANE_LENGTH + 2.0;
const SWEEP_DURATION = 1.5; // secondi

const NEON = {
  pink: '#FF5FD2',
  cyan: '#4DE8FF',
  yellow: '#FFD84D',
  violet: '#A97BFF',
} as const;

export interface ScoreboardInfo {
  readonly playerName: string;
  readonly color: string;
  readonly frame: number; // 1-based
  readonly frameCount: number;
  readonly roll: number; // 1-based
  readonly total: number;
  readonly message?: string;
}

export interface BowlingEnvironment {
  readonly group: THREE.Group;
  setScoreboard(info: ScoreboardInfo): void;
  /** Avvia l'animazione dello sweeper del pinsetter. */
  playSweep(): void;
  update(dt: number): void;
  dispose(): void;
}

type Disposable = { dispose(): void };

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Moquette da sala bowling: fondo prugna con stelline, cerchi e saette colorate. */
function drawCarpet(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#2a1640';
  ctx.fillRect(0, 0, 256, 256);
  const colors = ['#FF5FD2', '#4DE8FF', '#FFD84D', '#7CF29C', '#A97BFF'];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 256;
    const y = rnd() * 256;
    ctx.fillStyle = colors[i % colors.length] ?? '#fff';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 3;
    const kind = i % 3;
    if (kind === 0) {
      ctx.beginPath();
      ctx.arc(x, y, 4 + rnd() * 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y + 6);
      ctx.lineTo(x + 2, y + 9);
      ctx.lineTo(x + 10, y + 16);
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, 5, 5);
    }
  }
}

/** Parete con onde retro orizzontali. */
function drawWall(ctx: CanvasRenderingContext2D): void {
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#120c22');
  grad.addColorStop(1, '#2b1847');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  const bands = ['#FF5FD2', '#FFD84D', '#4DE8FF'];
  bands.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = 300 + i * 26 + Math.sin((x / 512) * Math.PI * 4) * 18;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function lanePlankTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 1024, (ctx) => {
    const boards = 39;
    const w = 128 / boards;
    for (let i = 0; i < boards; i++) {
      const tone = 150 + Math.sin(i * 1.7) * 10;
      ctx.fillStyle = `rgb(${tone}, ${tone * 0.82}, ${tone * 0.62})`;
      ctx.fillRect(i * w, 0, w, 1024);
    }
  });
}

/** Contorno di un birillo stilizzato (profilo specchiato), centrato in 0. */
function pinOutline(scale: number): THREE.Vector3[] {
  const profile: [number, number][] = [
    [0.0, 0], [0.18, 0.02], [0.3, 0.25], [0.32, 0.45], [0.22, 0.75],
    [0.12, 0.95], [0.16, 1.12], [0.12, 1.28], [0.0, 1.33],
  ];
  const right = profile.map(([x, y]) => new THREE.Vector3(x * scale, (y - 0.66) * scale, 0));
  const left = [...profile].reverse().slice(1, -1).map(([x, y]) => new THREE.Vector3(-x * scale, (y - 0.66) * scale, 0));
  return [...right, ...left];
}

function starOutline(radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return pts;
}

/** Tubo neon chiuso lungo una polilinea. */
function neonTube(points: THREE.Vector3[], color: string, thickness: number, smooth: boolean): THREE.Mesh {
  const curve = smooth
    ? new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.4)
    : (() => {
      const path = new THREE.CurvePath<THREE.Vector3>();
      points.forEach((p, i) => path.add(new THREE.LineCurve3(p, points[(i + 1) % points.length] ?? p)));
      return path;
    })();
  const geo = new THREE.TubeGeometry(curve, smooth ? 96 : 120, thickness, 8, true);
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  return new THREE.Mesh(geo, mat);
}

function drawScoreboard(ctx: CanvasRenderingContext2D, info: ScoreboardInfo): void {
  const W = 1024;
  const H = 512;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1b1036');
  grad.addColorStop(1, '#0c0820');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Cornice luminosa
  ctx.strokeStyle = NEON.violet;
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // Giocatore di turno
  ctx.fillStyle = info.color;
  ctx.beginPath();
  ctx.arc(110, 110, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 72px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.playerName, 190, 112);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '700 48px system-ui, sans-serif';
  ctx.fillText(`Frame ${info.frame}/${info.frameCount} · Tiro ${info.roll}`, 70, 230);

  // Totale
  ctx.textAlign = 'right';
  ctx.fillStyle = NEON.yellow;
  ctx.font = '900 190px system-ui, sans-serif';
  ctx.fillText(String(info.total), W - 60, 200);
  ctx.textAlign = 'left';

  // Messaggio dell'ultimo tiro
  if (info.message) {
    ctx.fillStyle = NEON.pink;
    ctx.font = '900 110px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(info.message, W / 2, 390);
    ctx.textAlign = 'left';
  }
}

export function createBowlingEnvironment(
  pinGeometry: THREE.BufferGeometry,
  pinMaterial: THREE.Material,
): BowlingEnvironment {
  const group = new THREE.Group();
  group.name = 'bowling-environment';
  const disposables: Disposable[] = [];
  const own = <T extends Disposable>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const add = (mesh: THREE.Object3D) => {
    group.add(mesh);
    return mesh;
  };

  const roomHalfWidth = (NEIGHBOR_LANES.length / 2 + 0.6) * LANE_PITCH + 0.6;
  const roomBackZ = HEADPIN_Z + 5.2;
  const roomFrontZ = -8;
  const roomDepth = roomBackZ - roomFrontZ;
  const ceilingY = 5.2;

  // ---------- Pavimento a moquette ----------
  const carpetTex = own(canvasTexture(256, 256, drawCarpet));
  carpetTex.wrapS = THREE.RepeatWrapping;
  carpetTex.wrapT = THREE.RepeatWrapping;
  carpetTex.repeat.set(roomHalfWidth, roomDepth / 2);
  const floor = new THREE.Mesh(
    own(new THREE.PlaneGeometry(roomHalfWidth * 2, roomDepth)),
    own(new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 0.95 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.16, roomFrontZ + roomDepth / 2);
  floor.receiveShadow = true;
  add(floor);

  // ---------- Pareti e soffitto ----------
  const wallTex = own(canvasTexture(512, 512, drawWall));
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(roomDepth / 6, 1);
  const wallMat = own(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  const sideWallGeo = own(new THREE.PlaneGeometry(roomDepth, ceilingY + 0.2));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(sideWallGeo, wallMat);
    wall.rotation.y = -side * Math.PI / 2;
    wall.position.set(side * roomHalfWidth, ceilingY / 2 - 0.1, roomFrontZ + roomDepth / 2);
    add(wall);
  }
  const backWall = new THREE.Mesh(
    own(new THREE.PlaneGeometry(roomHalfWidth * 2, ceilingY + 0.2)),
    own(new THREE.MeshStandardMaterial({ color: '#120c22', roughness: 1 })),
  );
  backWall.rotation.y = Math.PI;
  backWall.position.set(0, ceilingY / 2 - 0.1, roomBackZ);
  add(backWall);

  const ceiling = new THREE.Mesh(
    own(new THREE.PlaneGeometry(roomHalfWidth * 2, roomDepth)),
    own(new THREE.MeshStandardMaterial({ color: '#0d0919', roughness: 1 })),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilingY, roomFrontZ + roomDepth / 2);
  add(ceiling);

  // Strisce di luce calda a soffitto, una fila per pista
  const stripGeo = own(new THREE.BoxGeometry(0.18, 0.04, 2.4));
  const stripMat = own(new THREE.MeshBasicMaterial({ color: '#FFE3B0', toneMapped: false }));
  const lanesX = [0, ...NEIGHBOR_LANES.map((k) => k * LANE_PITCH)];
  const stripCount = 5;
  const strips = new THREE.InstancedMesh(stripGeo, stripMat, lanesX.length * stripCount);
  const m = new THREE.Matrix4();
  let s = 0;
  for (const x of lanesX) {
    for (let k = 0; k < stripCount; k++) {
      m.makeTranslation(x, ceilingY - 0.05, 1.5 + k * 3.6);
      strips.setMatrixAt(s++, m);
    }
  }
  add(strips);

  // ---------- Piste vicine (più scure, con i loro birilli) ----------
  const plankTex = own(lanePlankTexture());
  const neighborLaneMat = own(new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.25, metalness: 0.05 }));
  const neighborLaneGeo = own(new THREE.BoxGeometry(LANE_WIDTH, 0.1, LANE_DEPTH));
  const gutterGeo = own(new THREE.BoxGeometry(GUTTER_WIDTH, 0.06, LANE_DEPTH));
  const gutterMat = own(new THREE.MeshStandardMaterial({ color: '#252033', roughness: 0.4 }));
  const deckGeo = own(new THREE.BoxGeometry(LANE_WIDTH * 1.5, 0.1, 4.5));
  const deckMat = own(new THREE.MeshStandardMaterial({ color: '#c9a77c', roughness: 0.6 }));

  for (const k of NEIGHBOR_LANES) {
    const x = k * LANE_PITCH;
    const lane = new THREE.Mesh(neighborLaneGeo, neighborLaneMat);
    lane.position.set(x, -0.05, LANE_DEPTH / 2);
    lane.receiveShadow = true;
    add(lane);
    for (const side of [-1, 1]) {
      const g = new THREE.Mesh(gutterGeo, gutterMat);
      g.position.set(x + side * (LANE_WIDTH / 2 + GUTTER_WIDTH / 2), -0.07, LANE_DEPTH / 2);
      add(g);
    }
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(x, -0.05, -2.25);
    add(deck);
  }

  const neighborPins = new THREE.InstancedMesh(pinGeometry, pinMaterial, NEIGHBOR_LANES.length * PIN_OFFSETS.length);
  neighborPins.castShadow = true;
  let p = 0;
  for (const k of NEIGHBOR_LANES) {
    for (const o of PIN_OFFSETS) {
      m.makeTranslation(k * LANE_PITCH + o.x, 0, HEADPIN_Z + o.z);
      neighborPins.setMatrixAt(p++, m);
    }
  }
  add(neighborPins);

  // Separatori (capping) tra le piste con un filo luminoso
  const cappingGeo = own(new THREE.BoxGeometry(LANE_PITCH - LANE_WIDTH - 2 * GUTTER_WIDTH, 0.12, LANE_DEPTH + 4.5));
  const cappingMat = own(new THREE.MeshStandardMaterial({ color: '#3a2a5c', roughness: 0.5 }));
  const glowGeo = own(new THREE.BoxGeometry(0.03, 0.01, LANE_DEPTH + 4.5));
  const glowMat = own(new THREE.MeshBasicMaterial({ color: NEON.cyan, toneMapped: false }));
  for (let k = -2; k < 2; k++) {
    const x = (k + 0.5) * LANE_PITCH;
    const cap = new THREE.Mesh(cappingGeo, cappingMat);
    cap.position.set(x, -0.04, (LANE_DEPTH - 4.5) / 2);
    cap.receiveShadow = true;
    add(cap);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, 0.025, (LANE_DEPTH - 4.5) / 2);
    add(glow);
  }

  // ---------- Ritorno palle (a destra dell'approccio) ----------
  const returnX = LANE_PITCH / 2;
  const hood = new THREE.Mesh(
    own(new THREE.BoxGeometry(0.55, 0.5, 1.6)),
    own(new THREE.MeshStandardMaterial({ color: '#5B3FD9', roughness: 0.35, metalness: 0.2 })),
  );
  hood.position.set(returnX, 0.2, 0.9);
  hood.castShadow = true;
  add(hood);
  const rackBalls = ['#EF4E5B', '#3C8CF0', '#F7C531', '#34C27A'];
  const rackBallGeo = own(new THREE.SphereGeometry(0.108, 24, 16));
  rackBalls.forEach((color, i) => {
    const ball = new THREE.Mesh(rackBallGeo, own(new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.2 })));
    ball.position.set(returnX, 0.56, 0.35 + i * 0.24);
    ball.castShadow = true;
    add(ball);
  });

  // ---------- Pannello di mascheramento sopra i birilli ----------
  const maskZ = HEADPIN_Z - 0.45;
  const maskBottom = 1.25;
  const mask = new THREE.Mesh(
    own(new THREE.BoxGeometry(roomHalfWidth * 2, ceilingY - maskBottom, 0.2)),
    own(new THREE.MeshStandardMaterial({ color: '#22163f', roughness: 0.8 })),
  );
  mask.position.set(0, maskBottom + (ceilingY - maskBottom) / 2, maskZ);
  add(mask);

  // Fascia luminosa sotto il pannello
  const trim = new THREE.Mesh(
    own(new THREE.BoxGeometry(roomHalfWidth * 2, 0.05, 0.05)),
    own(new THREE.MeshBasicMaterial({ color: NEON.pink, toneMapped: false })),
  );
  trim.position.set(0, maskBottom, maskZ - 0.12);
  add(trim);

  // Tabellone (monitor) sopra la nostra pista
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 1024;
  boardCanvas.height = 512;
  const boardCtx = boardCanvas.getContext('2d');
  const boardTex = own(new THREE.CanvasTexture(boardCanvas));
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    own(new THREE.PlaneGeometry(2.0, 1.0)),
    own(new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })),
  );
  board.rotation.y = Math.PI; // guarda verso il giocatore (-Z)
  board.position.set(0, 2.05, maskZ - 0.12);
  add(board);

  // Tabelloni spenti sulle piste vicine (solo cornice)
  const sideBoardGeo = own(new THREE.PlaneGeometry(1.6, 0.8));
  const sideBoardMat = own(new THREE.MeshBasicMaterial({ color: '#1b1036' }));
  for (const k of NEIGHBOR_LANES) {
    const sb = new THREE.Mesh(sideBoardGeo, sideBoardMat);
    sb.rotation.y = Math.PI;
    sb.position.set(k * LANE_PITCH, 2.0, maskZ - 0.11);
    add(sb);
  }

  // ---------- Insegne al neon originali ----------
  const neonGroup = new THREE.Group();
  const neonPinL = neonTube(pinOutline(0.75), NEON.pink, 0.022, true);
  neonPinL.position.set(-1.55, 2.2, maskZ - 0.13);
  neonPinL.rotation.z = 0.18;
  const neonPinR = neonTube(pinOutline(0.75), NEON.cyan, 0.022, true);
  neonPinR.position.set(1.55, 2.2, maskZ - 0.13);
  neonPinR.rotation.z = -0.18;
  const stars = [
    { x: -2.3, y: 3.0, r: 0.22, c: NEON.yellow },
    { x: 2.35, y: 2.95, r: 0.18, c: NEON.yellow },
    { x: -0.9, y: 3.15, r: 0.12, c: NEON.violet },
    { x: 0.95, y: 3.2, r: 0.14, c: NEON.pink },
  ];
  neonGroup.add(neonPinL, neonPinR);
  for (const st of stars) {
    const star = neonTube(starOutline(st.r), st.c, 0.014, false);
    star.position.set(st.x, st.y, maskZ - 0.13);
    neonGroup.add(star);
  }
  neonGroup.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      own(o.geometry);
      own(o.material as THREE.Material);
    }
  });
  add(neonGroup);

  const neonLightPink = new THREE.PointLight(NEON.pink, 3, 7, 1.5);
  neonLightPink.position.set(-1.6, 2.1, maskZ - 0.8);
  const neonLightCyan = new THREE.PointLight(NEON.cyan, 3, 7, 1.5);
  neonLightCyan.position.set(1.6, 2.1, maskZ - 0.8);
  add(neonLightPink);
  add(neonLightCyan);

  // ---------- Sweeper del pinsetter ----------
  const sweeper = new THREE.Group();
  const sweepBar = new THREE.Mesh(
    own(new THREE.BoxGeometry(LANE_WIDTH + 0.5, 0.42, 0.05)),
    own(new THREE.MeshStandardMaterial({ color: '#d9d4e8', roughness: 0.4, metalness: 0.5 })),
  );
  const sweepStripe = new THREE.Mesh(
    own(new THREE.BoxGeometry(LANE_WIDTH + 0.5, 0.06, 0.055)),
    own(new THREE.MeshBasicMaterial({ color: NEON.violet, toneMapped: false })),
  );
  sweepStripe.position.y = 0.1;
  sweeper.add(sweepBar, sweepStripe);
  const sweepRestY = maskBottom + 0.3;
  const sweepDownY = 0.24;
  const sweepFrontZ = HEADPIN_Z - 0.3;
  sweeper.position.set(0, sweepRestY, sweepFrontZ);
  add(sweeper);
  let sweepT = -1;

  const smooth = (t: number) => t * t * (3 - 2 * t);

  return {
    group,

    setScoreboard(info: ScoreboardInfo) {
      if (!boardCtx) return;
      drawScoreboard(boardCtx, info);
      boardTex.needsUpdate = true;
    },

    playSweep() {
      sweepT = 0;
    },

    update(dt: number) {
      // Pulsazione leggera dei neon
      const t = performance.now() / 1000;
      neonLightPink.intensity = 2.6 + Math.sin(t * 2.1) * 0.4;
      neonLightCyan.intensity = 2.6 + Math.cos(t * 1.7) * 0.4;

      if (sweepT < 0) return;
      sweepT += dt / SWEEP_DURATION;
      const k = Math.min(1, sweepT);
      // 0–0.3 scende davanti ai birilli, 0.3–0.7 resta giù (lì il rack viene sistemato), 0.7–1 risale
      if (k < 0.3) {
        sweeper.position.y = sweepRestY + (sweepDownY - sweepRestY) * smooth(k / 0.3);
      } else if (k < 0.7) {
        sweeper.position.y = sweepDownY;
      } else {
        sweeper.position.y = sweepDownY + (sweepRestY - sweepDownY) * smooth((k - 0.7) / 0.3);
      }
      if (k >= 1) sweepT = -1;
    },

    dispose() {
      neighborPins.dispose();
      strips.dispose();
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

/** Durata dello sweeper e istante (ms) in cui la barra è giù: lì si sistema il rack in fisica. */
export const SWEEP_MS = SWEEP_DURATION * 1000;
export const SWEEP_SWAP_MS = SWEEP_MS * 0.45;
