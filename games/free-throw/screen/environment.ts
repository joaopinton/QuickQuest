// Ambientazione procedurale 3D della Palestra di Quartiere per i Tiri liberi
// (docs/games/free-throw.md § Set, docs/07 — Stile "Soft Toy").
//
// Include:
// - Parquet lucido a listoni in acero con linee regolamentari FIBA, area colorata e lunetta;
// - Struttura del canestro imbottita, tabellone in plexiglass con quadrato di mira, ferro arancione
//   con 12 gancetti e tabellone LED sopra il canestro;
// - Pupo tiratore in lunetta che esegue il gesto della scuola basket (caricamento sopra la fronte,
//   estensione verso l'alto e chiusura del polso a gancio "follow-through");
// - Gradinate in legno con 36 Pupi spettatori (InstancedMesh) che esultano o sospirano;
// - Spalliere svedesi, carrello porta-palloni, striscioni da scuola basket e luci calde da palestra.

import * as THREE from 'three';
import {
  BACKBOARD_BOTTOM_Y,
  BACKBOARD_HEIGHT,
  BACKBOARD_THICKNESS,
  BACKBOARD_WIDTH,
  BACKBOARD_Z,
  HOOP_Z,
  RIM_BRACKET_LEN,
  RIM_HEIGHT,
  RIM_RADIUS,
  RIM_TUBE_RADIUS,
  TARGET_SQUARE_HEIGHT,
  TARGET_SQUARE_WIDTH,
} from './physics';

export interface GymScoreboardInfo {
  readonly playerName: string;
  readonly color: string;
  readonly subtitle: string; // es. "Tiro 4/10" oppure "42s rimasti"
  readonly score: number;
  readonly streak: number;
  readonly message?: string;
}

export interface FreeThrowEnvironment {
  readonly group: THREE.Group;
  setScoreboard(info: GymScoreboardInfo): void;
  setShooterColor(color: string): void;
  /** Avvia l'animazione del Pupo: spinta sopra la testa + chiusura del polso a gancio (follow-through). */
  playShooterRelease(): void;
  resetShooterPose(): void;
  /** Reazione del pubblico sulle gradinate: 'swish' | 'make' | 'miss'. */
  playCrowdReaction(kind: 'swish' | 'make' | 'miss'): void;
  update(dt: number): void;
  dispose(): void;
}

type Disposable = { dispose(): void };

function createCanvasTex(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Disegna il parquet lucido a listoni d'acero con l'area dei 3 secondi, la lunetta e l'arco da 3 punti. */
function drawCourtParquet(ctx: CanvasRenderingContext2D): void {
  const W = 1024;
  const H = 1024;

  // 1. Listoni di parquet in acero caldo
  const cols = 32;
  const rows = 16;
  const cw = W / cols;
  const ch = H / rows;
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const shift = (c % 2) * (ch * 0.5);
      const y0 = ((r * ch + shift) % H) - ch * 0.5;
      const base = 218 + Math.floor((rnd() - 0.5) * 24);
      const red = Math.min(255, base + 18);
      const green = Math.floor(base * 0.82);
      const blue = Math.floor(base * 0.54);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      ctx.fillRect(c * cw, y0, cw, ch + 2);
      ctx.strokeStyle = 'rgba(90, 52, 18, 0.14)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c * cw, y0, cw, ch);
    }
  }

  // Mappatura coordinate campo -> canvas:
  // Il piano del pavimento è largo 14 m (x in [-7, +7]) e lungo 14 m (z in [-5, +9], centro a z = 2.0)
  // In Three.js PlaneGeometry ruotata di -PI/2 attorno a X ha V che cresce verso -Z, quindi y_canvas cresce con +Z.
  const toX = (xM: number) => ((xM + 7) / 14) * W;
  const toY = (zM: number) => ((zM + 5) / 14) * H;
  const scaleM = W / 14;

  // 2. Area dei 3 secondi (da z = 0 lunetta fino a z = 5.80 linea di fondo, larga 4.90 m)
  const keyHalfW = 2.45;
  const baselineZ = 5.8;
  ctx.fillStyle = 'rgba(255, 138, 43, 0.85)'; // Arancio palla QuickQuest
  ctx.fillRect(
    toX(-keyHalfW),
    toY(0),
    keyHalfW * 2 * scaleM,
    baselineZ * scaleM,
  );

  // Fascia blu notte interna al pitturato
  ctx.fillStyle = 'rgba(30, 42, 74, 0.18)';
  ctx.fillRect(
    toX(-keyHalfW + 0.25),
    toY(0.25),
    (keyHalfW * 2 - 0.5) * scaleM,
    (baselineZ - 0.5) * scaleM,
  );

  // 3. Semicerchio della lunetta (centro in (0, 0), raggio 1.80 m)
  ctx.strokeStyle = '#FFF6E5';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), 1.8 * scaleM, Math.PI, Math.PI * 2, false);
  ctx.stroke();

  // Metà tratteggiata interna della lunetta
  ctx.save();
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.arc(toX(0), toY(0), 1.8 * scaleM, 0, Math.PI, false);
  ctx.stroke();
  ctx.restore();

  // 4. Contorno bianco dell'area e linea del tiro libero (a z = 0)
  ctx.strokeRect(
    toX(-keyHalfW),
    toY(0),
    keyHalfW * 2 * scaleM,
    baselineZ * scaleM,
  );

  // Tacche del rimbalzo lungo i lati dell'area
  for (const zTick of [1.75, 2.6, 3.45, 4.3]) {
    for (const side of [-1, 1]) {
      const xEdge = toX(side * keyHalfW);
      ctx.beginPath();
      ctx.moveTo(xEdge, toY(zTick));
      ctx.lineTo(xEdge + side * 0.4 * scaleM, toY(zTick));
      ctx.stroke();
    }
  }

  // Semicerchio "no-charge" sotto il canestro (raggio 1.25 m centrato in HOOP_Z)
  ctx.beginPath();
  ctx.arc(toX(0), toY(HOOP_Z), 1.25 * scaleM, Math.PI, Math.PI * 2, false);
  ctx.stroke();

  // 5. Arco dei 3 punti (raggio 6.75 m dal centro del canestro)
  ctx.beginPath();
  ctx.arc(toX(0), toY(HOOP_Z), 6.75 * scaleM, Math.PI * 1.08, Math.PI * 1.92, false);
  ctx.stroke();

  // Linea di fondo campo (z = 5.8 m) e righe laterali
  ctx.lineWidth = 9;
  ctx.strokeRect(toX(-6.2), toY(-4.4), 12.4 * scaleM, (baselineZ + 4.4) * scaleM);
}

/** Disegna il quadrato di mira e la cornice bianca sul tabellone in plexiglass. */
function drawBackboardMarkings(ctx: CanvasRenderingContext2D): void {
  const W = 1024;
  const H = 600;
  ctx.clearRect(0, 0, W, H);

  // Sfondo leggermente fumé traslucido per dare corpo al plexiglass
  ctx.fillStyle = 'rgba(235, 246, 255, 0.18)';
  ctx.fillRect(0, 0, W, H);

  // Riflesso diagonale morbido sul vetro
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Cornice esterna bianca regolamentare
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 22;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  // Quadrato di mira dietro l'anello (0.59 m × 0.45 m su 1.80 m × 1.05 m)
  const sqW = (TARGET_SQUARE_WIDTH / BACKBOARD_WIDTH) * W;
  const sqH = (TARGET_SQUARE_HEIGHT / BACKBOARD_HEIGHT) * H;
  const bottomOffset = ((RIM_HEIGHT - BACKBOARD_BOTTOM_Y) / BACKBOARD_HEIGHT) * H;
  const sqX = (W - sqW) / 2;
  const sqY = H - bottomOffset - sqH;

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 18;
  ctx.strokeRect(sqX, sqY, sqW, sqH);
}

const LED_FONT = 'system-ui, -apple-system, sans-serif';

function fitLedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  maxPx: number,
  x: number,
  y: number,
  maxWidth: number,
): void {
  let px = maxPx;
  ctx.font = `${weight} ${px}px ${LED_FONT}`;
  while (px > 20 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `${weight} ${px}px ${LED_FONT}`;
  }
  ctx.fillText(text, x, y);
}

function drawScoreboardLed(ctx: CanvasRenderingContext2D, info: GymScoreboardInfo): void {
  const W = 1024;
  const H = 384;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1B2238');
  grad.addColorStop(1, '#0F1526');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Cornice arancio basket
  ctx.strokeStyle = '#FF8A2B';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, W - 20, H - 20);

  // Bollino colore giocatore
  ctx.fillStyle = info.color;
  ctx.beginPath();
  ctx.arc(92, 96, 40, 0, Math.PI * 2);
  ctx.fill();

  // Punteggio grande a destra
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFD23F';
  ctx.font = `900 156px ${LED_FONT}`;
  const scoreStr = String(info.score);
  const scoreWidth = ctx.measureText(scoreStr).width;
  ctx.fillText(scoreStr, W - 54, 112);

  // Nome giocatore e sottotitolo
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  fitLedText(ctx, info.playerName, 800, 66, 158, 86, Math.max(140, W - scoreWidth - 240));

  const streakStr = info.streak >= 2 ? `  🔥 ×${info.streak}` : '';
  ctx.fillStyle = 'rgba(255, 246, 229, 0.82)';
  fitLedText(ctx, `${info.subtitle}${streakStr}`, 700, 44, 158, 156, Math.max(140, W - scoreWidth - 230));

  // Messaggio dell'ultimo tiro ("CIUFF!", "CANESTRO!", "FERRO!")
  if (info.message) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FF8A2B';
    fitLedText(ctx, info.message, 900, 92, W / 2, 292, W - 100);
    ctx.textAlign = 'left';
  }
}

export function createFreeThrowEnvironment(): FreeThrowEnvironment {
  const group = new THREE.Group();
  group.name = 'free-throw-environment';
  const disposables: Disposable[] = [];
  const own = <T extends Disposable>(item: T): T => {
    disposables.push(item);
    return item;
  };
  const add = <T extends THREE.Object3D>(obj: T): T => {
    group.add(obj);
    return obj;
  };

  // ---------- 1. Parquet lucido con linee regolamentari ----------
  const courtTex = own(createCanvasTex(1024, 1024, drawCourtParquet));
  courtTex.anisotropy = 8;
  const floorMat = own(
    new THREE.MeshStandardMaterial({
      map: courtTex,
      roughness: 0.24,
      metalness: 0.04,
    }),
  );
  const floorMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(14, 14)), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, 2.0);
  floorMesh.receiveShadow = true;
  add(floorMesh);

  // Bordo esterno della palestra intorno al campo
  const outerFloor = new THREE.Mesh(
    own(new THREE.PlaneGeometry(24, 24)),
    own(new THREE.MeshStandardMaterial({ color: '#c89658', roughness: 0.55 })),
  );
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.set(0, -0.01, 2.0);
  outerFloor.receiveShadow = true;
  add(outerFloor);

  // ---------- 2. Pareti, Spalliere Svedesi, Striscioni e Soffitto ----------
  const wallMat = own(new THREE.MeshStandardMaterial({ color: '#F7EBD5', roughness: 0.88 }));
  const dadoMat = own(new THREE.MeshStandardMaterial({ color: '#283862', roughness: 0.75 }));
  const stripeMat = own(new THREE.MeshBasicMaterial({ color: '#FF8A2B' }));

  // Parete di fondo dietro il canestro (z = 7.4 m)
  const backWall = new THREE.Mesh(own(new THREE.PlaneGeometry(18, 8.5)), wallMat);
  backWall.rotation.y = Math.PI;
  backWall.position.set(0, 4.25, 7.4);
  add(backWall);

  const backDado = new THREE.Mesh(own(new THREE.PlaneGeometry(18, 2.1)), dadoMat);
  backDado.rotation.y = Math.PI;
  backDado.position.set(0, 1.05, 7.38);
  add(backDado);

  const backStripe = new THREE.Mesh(own(new THREE.PlaneGeometry(18, 0.14)), stripeMat);
  backStripe.rotation.y = Math.PI;
  backStripe.position.set(0, 2.12, 7.37);
  add(backStripe);

  // Pareti laterali (x = ±8.2 m)
  const sideWallGeo = own(new THREE.PlaneGeometry(18, 8.5));
  const sideDadoGeo = own(new THREE.PlaneGeometry(18, 2.1));
  for (const side of [-1, 1]) {
    const sw = new THREE.Mesh(sideWallGeo, wallMat);
    sw.rotation.y = -side * (Math.PI / 2);
    sw.position.set(side * 8.2, 4.25, 1.5);
    add(sw);

    const sd = new THREE.Mesh(sideDadoGeo, dadoMat);
    sd.rotation.y = -side * (Math.PI / 2);
    sd.position.set(side * 8.18, 1.05, 1.5);
    add(sd);
  }

  // Spalliere svedesi in legno sulla parete di fondo (tipiche di ogni palestra scolastica/di quartiere!)
  const woodMat = own(new THREE.MeshStandardMaterial({ color: '#C98A4B', roughness: 0.55 }));
  const barVerticalGeo = own(new THREE.BoxGeometry(0.06, 2.5, 0.1));
  const barRungGeo = own(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8));
  barRungGeo.rotateZ(Math.PI / 2);
  for (const xPos of [-5.2, -4.1, 4.1, 5.2]) {
    const ladder = new THREE.Group();
    const leftPost = new THREE.Mesh(barVerticalGeo, woodMat);
    leftPost.position.set(-0.45, 1.25, 0);
    const rightPost = new THREE.Mesh(barVerticalGeo, woodMat);
    rightPost.position.set(0.45, 1.25, 0);
    ladder.add(leftPost, rightPost);
    for (let r = 0; r < 9; r++) {
      const rung = new THREE.Mesh(barRungGeo, woodMat);
      rung.position.set(0, 0.25 + r * 0.27, 0.02);
      ladder.add(rung);
    }
    ladder.position.set(xPos, 0, 7.3);
    add(ladder);
  }

  // Striscioni colorati appesi al soffitto della palestra
  const bannerColors = ['#FF8A2B', '#2F7DF6', '#34C27A'];
  const bannerGeo = own(new THREE.BoxGeometry(1.3, 1.8, 0.04));
  bannerColors.forEach((c, idx) => {
    const bm = own(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
    const banner = new THREE.Mesh(bannerGeo, bm);
    banner.position.set((idx - 1) * 3.1, 6.2, 7.15);
    add(banner);
  });

  // Lampade calde a soffitto
  const lampGeo = own(new THREE.CylinderGeometry(0.25, 0.42, 0.28, 16));
  const lampMat = own(new THREE.MeshStandardMaterial({ color: '#3A4664', roughness: 0.4, metalness: 0.5 }));
  const bulbGeo = own(new THREE.SphereGeometry(0.22, 12, 8));
  const bulbMat = own(new THREE.MeshBasicMaterial({ color: '#FFF3D1', toneMapped: false }));
  for (const lx of [-3.2, 0, 3.2]) {
    for (const lz of [0.5, 4.0]) {
      const lamp = new THREE.Group();
      lamp.add(new THREE.Mesh(lampGeo, lampMat));
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.y = -0.1;
      lamp.add(bulb);
      lamp.position.set(lx, 7.1, lz);
      add(lamp);
    }
  }

  // ---------- 3. Canestro Professionale (Piantana, Tabellone Plexiglass, Ferro Arancio) ----------
  const stanchionGroup = new THREE.Group();

  // Base imbottita blu notte + protezione arancio dietro la linea di fondo
  const padMat = own(new THREE.MeshStandardMaterial({ color: '#1E2A4A', roughness: 0.65 }));
  const orangePadMat = own(new THREE.MeshStandardMaterial({ color: '#FF6B1A', roughness: 0.5 }));
  const steelMat = own(new THREE.MeshStandardMaterial({ color: '#E8EEF7', roughness: 0.35, metalness: 0.4 }));

  const basePad = new THREE.Mesh(own(new THREE.BoxGeometry(0.95, 1.9, 1.1)), padMat);
  basePad.position.set(0, 0.95, 6.15);
  basePad.castShadow = true;
  stanchionGroup.add(basePad);

  const padAccent = new THREE.Mesh(own(new THREE.BoxGeometry(0.98, 0.25, 1.12)), orangePadMat);
  padAccent.position.set(0, 1.65, 6.15);
  stanchionGroup.add(padAccent);

  // Braccio inclinato dal basamento al retro del tabellone
  const armMesh = new THREE.Mesh(own(new THREE.CylinderGeometry(0.11, 0.13, 2.2, 16)), steelMat);
  armMesh.position.set(0, 2.65, 5.4);
  armMesh.rotation.x = -Math.PI / 4.2;
  stanchionGroup.add(armMesh);

  const upperArm = new THREE.Mesh(own(new THREE.BoxGeometry(0.22, 0.22, 0.95)), steelMat);
  upperArm.position.set(0, 3.35, BACKBOARD_Z + 0.5);
  stanchionGroup.add(upperArm);

  // Tabellone in plexiglass con quadrato ufficiale (1.80 × 1.05 m)
  const bbTex = own(createCanvasTex(1024, 600, drawBackboardMarkings));
  bbTex.anisotropy = 8;
  const bbCenterY = BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT / 2;
  const backboardMesh = new THREE.Mesh(
    own(new THREE.BoxGeometry(BACKBOARD_WIDTH, BACKBOARD_HEIGHT, BACKBOARD_THICKNESS)),
    own(
      new THREE.MeshStandardMaterial({
        map: bbTex,
        transparent: true,
        opacity: 0.92,
        roughness: 0.12,
        metalness: 0.08,
      }),
    ),
  );
  backboardMesh.position.set(0, bbCenterY, BACKBOARD_Z + BACKBOARD_THICKNESS / 2);
  backboardMesh.castShadow = true;
  backboardMesh.receiveShadow = true;
  stanchionGroup.add(backboardMesh);

  // Protezione morbida arancione lungo il bordo inferiore del tabellone
  const bbBottomPad = new THREE.Mesh(
    own(new THREE.BoxGeometry(BACKBOARD_WIDTH + 0.04, 0.07, BACKBOARD_THICKNESS + 0.03)),
    orangePadMat,
  );
  bbBottomPad.position.set(0, BACKBOARD_BOTTOM_Y - 0.02, BACKBOARD_Z + BACKBOARD_THICKNESS / 2);
  stanchionGroup.add(bbBottomPad);

  // Ferro (anello arancione a y = 3.05 m, z = HOOP_Z) + staffa a L + 12 gancetti
  const rimCenterRadius = RIM_RADIUS + RIM_TUBE_RADIUS;
  const rimMat = own(new THREE.MeshStandardMaterial({ color: '#FF5500', roughness: 0.28, metalness: 0.55 }));
  const rimTorus = new THREE.Mesh(
    own(new THREE.TorusGeometry(rimCenterRadius, RIM_TUBE_RADIUS * 1.15, 16, 48)),
    rimMat,
  );
  rimTorus.rotation.x = Math.PI / 2;
  rimTorus.position.set(0, RIM_HEIGHT, HOOP_Z);
  rimTorus.castShadow = true;
  stanchionGroup.add(rimTorus);

  const rimBracket = new THREE.Mesh(
    own(new THREE.BoxGeometry(0.13, 0.045, RIM_BRACKET_LEN + 0.02)),
    rimMat,
  );
  rimBracket.position.set(0, RIM_HEIGHT - 0.015, HOOP_Z + rimCenterRadius + RIM_BRACKET_LEN / 2);
  stanchionGroup.add(rimBracket);

  // Tabellone elettronico LED sopra il tabellone in plexiglass
  const ledCanvas = document.createElement('canvas');
  ledCanvas.width = 1024;
  ledCanvas.height = 384;
  const ledCtx = ledCanvas.getContext('2d');
  const ledTex = own(new THREE.CanvasTexture(ledCanvas));
  ledTex.colorSpace = THREE.SRGBColorSpace;
  ledTex.anisotropy = 8;

  const ledBox = new THREE.Mesh(
    own(new THREE.BoxGeometry(1.65, 0.62, 0.1)),
    own(new THREE.MeshStandardMaterial({ color: '#151C30', roughness: 0.5 })),
  );
  ledBox.position.set(0, BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT + 0.45, BACKBOARD_Z + 0.05);
  stanchionGroup.add(ledBox);

  const ledScreen = new THREE.Mesh(
    own(new THREE.PlaneGeometry(1.58, 0.58)),
    own(new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false })),
  );
  ledScreen.rotation.y = Math.PI;
  ledScreen.position.set(0, BACKBOARD_BOTTOM_Y + BACKBOARD_HEIGHT + 0.45, BACKBOARD_Z - 0.01);
  stanchionGroup.add(ledScreen);

  add(stanchionGroup);

  // ---------- 4. Carrello porta-palloni a bordo campo ----------
  const rackGroup = new THREE.Group();
  const rackFrameMat = own(new THREE.MeshStandardMaterial({ color: '#3C4A6B', roughness: 0.4, metalness: 0.6 }));
  const rackPostGeo = own(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8));
  for (const rz of [-0.55, 0.55]) {
    for (const rx of [-0.22, 0.22]) {
      const post = new THREE.Mesh(rackPostGeo, rackFrameMat);
      post.position.set(rx, 0.45, rz);
      rackGroup.add(post);
    }
  }
  const rackBallGeo = own(new THREE.SphereGeometry(0.115, 16, 12));
  const rackBallMat = own(new THREE.MeshStandardMaterial({ color: '#FF7A1A', roughness: 0.45 }));
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(rackBallGeo, rackBallMat);
      b.position.set(0, 0.32 + row * 0.36, -0.39 + i * 0.26);
      b.castShadow = true;
      rackGroup.add(b);
    }
  }
  rackGroup.position.set(3.25, 0, 1.2);
  rackGroup.rotation.y = -0.25;
  add(rackGroup);

  // ---------- 5. Gradinate in legno e Pubblico di Pupi (InstancedMesh) ----------
  const bleacherMat = own(new THREE.MeshStandardMaterial({ color: '#B87B3E', roughness: 0.65 }));
  const bleacherStepGeo = own(new THREE.BoxGeometry(1.2, 0.35, 8.5));
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier++) {
      const bench = new THREE.Mesh(bleacherStepGeo, bleacherMat);
      bench.position.set(side * (4.9 + tier * 0.65), 0.175 + tier * 0.38, 2.6);
      bench.receiveShadow = true;
      add(bench);
    }
  }

  const crowdPositions: { x: number; y: number; z: number; rotY: number; phase: number }[] = [];
  const palette = ['#EF4E5B', '#3C8CF0', '#F7C531', '#34C27A', '#FF9A3C', '#9C6BFF', '#FF7EB6', '#2EC4B6'];
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 3; tier++) {
      for (let slotIdx = 0; slotIdx < 6; slotIdx++) {
        const x = side * (4.85 + tier * 0.65);
        const y = 0.36 + tier * 0.38;
        const z = -0.4 + slotIdx * 1.18 + (tier % 2) * 0.25;
        const rotY = Math.atan2(-x, HOOP_Z - z);
        crowdPositions.push({ x, y, z, rotY, phase: slotIdx * 1.1 + tier * 0.7 + (side > 0 ? 0.5 : 0) });
      }
    }
  }

  const pupoBodyGeo = own(new THREE.CapsuleGeometry(0.19, 0.26, 8, 16));
  const pupoMat = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45 }));
  const crowdMesh = new THREE.InstancedMesh(pupoBodyGeo, pupoMat, crowdPositions.length);
  crowdMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  crowdPositions.forEach((p, i) => {
    dummy.position.set(p.x, p.y + 0.32, p.z);
    dummy.rotation.set(0, p.rotY, 0);
    dummy.updateMatrix();
    crowdMesh.setMatrixAt(i, dummy.matrix);
    crowdMesh.setColorAt(i, tmpColor.set(palette[i % palette.length]!));
  });
  crowdMesh.instanceMatrix.needsUpdate = true;
  if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  add(crowdMesh);

  // ---------- 6. Pupo Tiratore in lunetta con Gesto Scuola Basket (Chiusura a Gancio) ----------
  const shooterGroup = new THREE.Group();
  shooterGroup.position.set(-0.32, 0, -0.38); // leggermente a sinistra per lasciare libera la visuale sul canestro
  shooterGroup.rotation.y = 0.08;

  const shooterBodyMat = own(new THREE.MeshStandardMaterial({ color: '#FF8A2B', roughness: 0.38 }));
  const shooterBody = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.23, 0.44, 12, 20)), shooterBodyMat);
  shooterBody.position.y = 0.62;
  shooterBody.castShadow = true;
  shooterGroup.add(shooterBody);

  // Fascia sportiva bianca e arancione sulla fronte del Pupo
  const headband = new THREE.Mesh(
    own(new THREE.CylinderGeometry(0.235, 0.235, 0.07, 20)),
    own(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5 })),
  );
  headband.position.y = 0.86;
  shooterGroup.add(headband);

  // Braccio destro articolato (spalla -> gomito -> polso che si chiude a gancio sopra la testa!)
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.24, 0.82, 0.05);
  const upperArmMesh = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.065, 0.24, 8, 12)), shooterBodyMat);
  upperArmMesh.position.set(0, 0.14, 0);
  rightShoulder.add(upperArmMesh);

  const wristPivot = new THREE.Group();
  wristPivot.position.set(0, 0.3, 0);
  const handMesh = new THREE.Mesh(own(new THREE.SphereGeometry(0.075, 12, 10)), shooterBodyMat);
  handMesh.scale.set(0.9, 1.25, 0.7);
  handMesh.position.set(0, 0.06, 0);
  wristPivot.add(handMesh);
  rightShoulder.add(wristPivot);
  shooterGroup.add(rightShoulder);

  // Posa iniziale: braccio caricato sopra la fronte ("set point" scuola basket)
  const resetShooterPose = () => {
    shooterGroup.position.y = 0;
    rightShoulder.rotation.set(-0.45, 0, -0.15);
    wristPivot.rotation.set(-0.55, 0, 0); // polso caricato all'indietro
  };
  resetShooterPose();
  add(shooterGroup);

  let releaseAnimT = -1; // >= 0 durante il follow-through e la chiusura a gancio
  let crowdReaction: { kind: 'swish' | 'make' | 'miss'; timer: number } | null = null;
  let elapsed = 0;

  return {
    group,

    setScoreboard(info: GymScoreboardInfo) {
      if (!ledCtx) return;
      drawScoreboardLed(ledCtx, info);
      ledTex.needsUpdate = true;
    },

    setShooterColor(color: string) {
      shooterBodyMat.color.set(color);
    },

    playShooterRelease() {
      releaseAnimT = 0;
    },

    resetShooterPose() {
      releaseAnimT = -1;
      resetShooterPose();
    },

    playCrowdReaction(kind) {
      crowdReaction = { kind, timer: kind === 'swish' ? 2.4 : 1.6 };
    },

    update(dt: number) {
      elapsed += dt;

      // 1. Animazione del Pupo tiratore: spinta verso l'alto + chiusura del polso a gancio ("collo d'oca")
      if (releaseAnimT >= 0) {
        releaseAnimT += dt;
        // Nei primi 0.18 s il braccio si distende sopra la testa e il polso frusta in avanti a gancio (+1.15 rad)
        const ext = Math.min(1, releaseAnimT / 0.18);
        const easeOut = 1 - (1 - ext) * (1 - ext);
        const jumpArc = Math.max(0, Math.sin(Math.min(1, releaseAnimT / 0.42) * Math.PI)) * 0.16;
        shooterGroup.position.y = jumpArc;
        // Braccio ben alto sopra la fronte
        rightShoulder.rotation.set(-0.18 * (1 - easeOut) + 0.12 * easeOut, 0, -0.05);
        // Polso che da caricato indietro (-0.55) si chiude a gancio in avanti (+1.05 rad = ~60° verso il canestro!)
        wristPivot.rotation.set(-0.55 + 1.6 * easeOut, 0, 0);
      } else {
        // Leggero respiro / concentrazione in lunetta
        shooterGroup.position.y = Math.sin(elapsed * 2.5) * 0.015;
        rightShoulder.rotation.set(-0.45 + Math.sin(elapsed * 2.5) * 0.04, 0, -0.15);
      }

      // 2. Animazione del pubblico di Pupi sulle gradinate
      if (crowdReaction) {
        crowdReaction.timer -= dt;
        if (crowdReaction.timer <= 0) crowdReaction = null;
      }

      for (let i = 0; i < crowdPositions.length; i++) {
        const p = crowdPositions[i]!;
        let jump = Math.sin(elapsed * 2.2 + p.phase) * 0.02;
        let squashY = 1.0;
        if (crowdReaction) {
          if (crowdReaction.kind === 'swish' || crowdReaction.kind === 'make') {
            const freq = crowdReaction.kind === 'swish' ? 12 : 8.5;
            const amp = crowdReaction.kind === 'swish' ? 0.18 : 0.11;
            jump = Math.abs(Math.sin(elapsed * freq + p.phase)) * amp;
            squashY = 1 + jump * 0.5;
          } else {
            // Sospiro / delusione ("ooooh")
            jump = -0.04;
            squashY = 0.88;
          }
        }
        dummy.position.set(p.x, p.y + 0.32 + jump, p.z);
        dummy.rotation.set(0, p.rotY, 0);
        dummy.scale.set(1 / Math.sqrt(squashY), squashY, 1 / Math.sqrt(squashY));
        dummy.updateMatrix();
        crowdMesh.setMatrixAt(i, dummy.matrix);
      }
      crowdMesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      crowdMesh.dispose();
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

