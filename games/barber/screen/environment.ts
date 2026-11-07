// Bottega anni '60 del Barber shop (docs/games/barber.md § Set, docs/07 — stile "Soft Toy").
// Pavimento a scacchi, pareti crema con zoccolo menta, specchio con le lampadine, mensola con
// barattoli e pettini, insegna a spirale originale nei colori dell'accento, poltrona rossa.
// Tutto procedurale: geometrie semplici e texture disegnate su canvas (ADR-005).

import * as THREE from 'three';

export const ACCENT = '#2EC4B6';
const CREAM = '#FFF4DE';
const CHAIR_RED = '#D94352';
const CHROME = '#C9D3DD';

export interface BarberEnvironment {
  readonly group: THREE.Group;
  /** Punto dove si siede il cliente (cuscino della poltrona). */
  readonly seat: THREE.Vector3;
  update(dt: number): void;
  dispose(): void;
}

interface Disposable {
  dispose(): void;
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function checkerTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 256, (ctx) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#F7F1E6' : '#2B2D42';
        ctx.fillRect(c * 64, r * 64, 64, 64);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

/** Spirale dell'insegna: strisce diagonali menta, bianco e rosso che "salgono" ruotando. */
function poleTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 128, 256);
    const colors = [ACCENT, '#FFFFFF', CHAIR_RED, '#FFFFFF'];
    ctx.save();
    ctx.translate(64, 128);
    ctx.rotate(-Math.PI / 5);
    for (let i = -12; i < 12; i++) {
      ctx.fillStyle = colors[((i % 4) + 4) % 4]!;
      ctx.fillRect(-300, i * 22, 600, 22);
    }
    ctx.restore();
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function signTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#2B2D42';
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 28);
    ctx.fill();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#FFF4DE';
    ctx.font = 'bold 64px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BARBIERE', 256, 68);
  });
}

export function createBarberEnvironment(): BarberEnvironment {
  const group = new THREE.Group();
  const trash: Disposable[] = [];
  const keep = <T extends Disposable>(x: T): T => {
    trash.push(x);
    return x;
  };
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    keep(new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }));
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(keep(geo), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Pavimento e pareti
  const floorTex = keep(checkerTexture());
  const floor = add(new THREE.PlaneGeometry(10, 10), mat('#ffffff', { map: floorTex, roughness: 0.45 }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;

  const wallMat = mat(CREAM, { roughness: 0.9 });
  const trimMat = mat(ACCENT, { roughness: 0.6 });
  add(new THREE.PlaneGeometry(10, 5), wallMat, 0, 2.5, -3).castShadow = false;
  add(new THREE.BoxGeometry(10, 1.1, 0.06), trimMat, 0, 0.55, -2.97);
  for (const side of [-1, 1]) {
    const wall = add(new THREE.PlaneGeometry(8, 5), wallMat, side * 4.2, 2.5, 1);
    wall.rotation.y = -side * (Math.PI / 2);
    wall.castShadow = false;
    const trim = add(new THREE.BoxGeometry(8, 1.1, 0.06), trimMat, side * 4.17, 0.55, 1);
    trim.rotation.y = Math.PI / 2;
  }

  // Specchio con le lampadine, dietro la poltrona
  const frameMat = mat('#8A5A3C', { roughness: 0.5 });
  add(new THREE.BoxGeometry(2.6, 1.9, 0.08), frameMat, 0, 2.15, -2.93);
  add(new THREE.PlaneGeometry(2.3, 1.6), mat('#BFD8E6', { roughness: 0.05, metalness: 0.85 }), 0, 2.15, -2.88).castShadow = false;
  const bulbGeo = keep(new THREE.SphereGeometry(0.07, 12, 10));
  const bulbMat = mat('#FFF2C4', { emissive: '#FFD27A', emissiveIntensity: 1.4 });
  for (let i = 0; i < 6; i++) {
    const x = -1.1 + (i * 2.2) / 5;
    for (const y of [3.07, 1.23]) {
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(x, y, -2.85);
      group.add(b);
    }
  }

  // Mensola con barattoli e pettini
  add(new THREE.BoxGeometry(2.8, 0.06, 0.4), frameMat, 0, 1.08, -2.78);
  const jarColors = [ACCENT, '#FFB703', CHAIR_RED, '#8E5BFF', ACCENT];
  jarColors.forEach((c, i) => {
    const jar = add(new THREE.CylinderGeometry(0.09, 0.1, 0.26, 16), mat(c, { roughness: 0.3, transparent: true, opacity: 0.85 }), -1.1 + i * 0.5, 1.24, -2.75);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), mat('#2B2D42'), jar.position.x, 1.39, -2.75);
  });
  for (let i = 0; i < 3; i++) {
    const comb = add(new THREE.BoxGeometry(0.32, 0.02, 0.06), mat(['#2B2D42', CHAIR_RED, ACCENT][i]!), 0.95 - i * 0.12, 1.12, -2.62);
    comb.rotation.y = 0.3 * i;
  }

  // Insegna
  const signTex = keep(signTexture());
  add(new THREE.PlaneGeometry(2, 0.5), keep(new THREE.MeshBasicMaterial({ map: signTex })), 0, 3.6, -2.95).castShadow = false;

  // Insegna a spirale che gira (originale, nei colori dell'accento)
  const poleTex = keep(poleTexture());
  const poleX = -2.4;
  add(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 24), mat('#ffffff', { map: poleTex, roughness: 0.25 }), poleX, 2.3, -2.7);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24), mat(CHROME, { metalness: 0.8, roughness: 0.25 }), poleX, 2.95, -2.7);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24), mat(CHROME, { metalness: 0.8, roughness: 0.25 }), poleX, 1.65, -2.7);
  add(new THREE.SphereGeometry(0.16, 16, 12), mat(CHAIR_RED, { roughness: 0.3 }), poleX, 3.08, -2.7);

  // Pianta in vaso e sgabello d'attesa: la bottega è vissuta
  add(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 16), mat('#E07A4F'), 2.6, 0.23, -2.4);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(new THREE.SphereGeometry(0.22, 12, 10), mat('#3FAE4A', { roughness: 0.9 }), 2.6 + Math.cos(a) * 0.15, 0.7 + (i % 2) * 0.15, -2.4 + Math.sin(a) * 0.15);
  }
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20), mat(CHAIR_RED, { roughness: 0.4 }), -2.6, 0.62, -1.6);
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 10), mat(CHROME, { metalness: 0.8, roughness: 0.3 }), -2.6, 0.3, -1.6);

  // Poltrona da barbiere rossa con base cromata
  const chairMat = mat(CHAIR_RED, { roughness: 0.4 });
  const chromeMat = mat(CHROME, { metalness: 0.85, roughness: 0.2 });
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.08, 28), chromeMat, 0, 0.04, 0);
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 14), chromeMat, 0, 0.3, 0);
  add(new THREE.BoxGeometry(0.9, 0.22, 0.8), chairMat, 0, 0.62, 0);
  add(new THREE.BoxGeometry(0.9, 0.85, 0.16), chairMat, 0, 1.08, -0.38);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.14, 0.1, 0.7), chairMat, side * 0.52, 0.92, 0.02);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8), chromeMat, side * 0.52, 0.8, 0.25);
  }
  add(new THREE.BoxGeometry(0.6, 0.05, 0.28), chromeMat, 0, 0.18, 0.55);

  // Luci calde da bottega
  const hemi = new THREE.HemisphereLight('#FFF7E8', '#6B5B4B', 1.1);
  group.add(hemi);
  const key = new THREE.DirectionalLight('#FFFFFF', 1.6);
  key.position.set(2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  group.add(key);
  const warm = new THREE.PointLight('#FFC879', 6, 6, 1.6);
  warm.position.set(0, 2.6, -2.2);
  group.add(warm);

  let t = 0;
  return {
    group,
    seat: new THREE.Vector3(0, 0.73, 0),
    update(dt) {
      t += dt;
      poleTex.offset.y = (t * 0.35) % 1;
    },
    dispose() {
      trash.forEach((d) => d.dispose());
      key.shadow.map?.dispose();
    },
  };
}
