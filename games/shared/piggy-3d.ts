// Il Piggy in 3D (docs/07 § 6): piccione tondo fatto di geometria procedurale con i colori nei
// vertex color (ADR-005). Stesso disegno del Piggy SVG di packages/ui: corpo a pera (testolina tonda e
// petto paffuto), collo cangiante verde acqua → viola, becco arancio con la cera bianca, occhi con
// l'iride arancio, guance rosate, ali ripiegate sui fianchi e zampette rosa a tre dita.
//
// Il Piggy è alto 1 unità con i piedi in y = 0 e guarda verso +z: chi lo usa lo scala e lo gira.
// Le parti sono separate per colore:
// - `body` e `wing` hanno vertex color chiari (luce e ombra bakate) e prendono il colore del
//   giocatore dal materiale (o dal colore d'istanza in una InstancedMesh);
// - `details` (collo, occhi, becco, guance, zampette) ha i colori propri e non va tinto.

import * as THREE from 'three';

export const PIGGY_INK = '#1E2A4A';
export const PIGGY_BEAK = '#FF9A3C';
export const PIGGY_CERE = '#FFF6E8';
export const PIGGY_FEET = '#FF8FA3';
export const PIGGY_CHEEK = '#FF9AA2';
export const PIGGY_IRIS = '#FF9A3C';
export const PIGGY_NECK_TEAL = '#2EC4B6';
export const PIGGY_NECK_VIOLET = '#8A5CF0';

/** Altezza dei piedi da terra: il corpo parte un poco sopra le zampette. */
const BODY_BASE = 0.05;
/** Fascia del collo cangiante, in altezza sul corpo. */
const NECK_FROM = 0.5;
const NECK_TO = 0.68;
/** Spalla dell'ala, nello spazio del Piggy (lato destro, +x). */
export const PIGGY_SHOULDER = new THREE.Vector3(0.355, 0.5, -0.02);
/** Centro della testolina, dove stanno occhi e becco. */
export const PIGGY_HEAD_Y = 0.77;

/** Profilo del corpo a pera (raggio, altezza): petto largo, strozzatura al collo, testolina tonda. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0.001, 0.0],
  [0.26, 0.02],
  [0.38, 0.12],
  [0.42, 0.26],
  [0.4, 0.38],
  [0.32, 0.5],
  [0.235, 0.6],
  [0.245, 0.68],
  [0.262, 0.77],
  [0.235, 0.86],
  [0.15, 0.93],
  [0.001, 0.96],
];

const profileCurve = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
const profilePoints = profileCurve.getPoints(48);

/** Raggio del corpo all'altezza `y` (spazio del corpo, prima di BODY_BASE). */
function radiusAt(y: number): number {
  for (let i = 1; i < profilePoints.length; i++) {
    const a = profilePoints[i - 1]!;
    const b = profilePoints[i]!;
    if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    }
  }
  return 0;
}

/** Punto sulla superficie del corpo: `angle` 0 = davanti (+z), positivo verso +x. */
export function piggySurface(angle: number, y: number, inset = 0): THREE.Vector3 {
  const r = Math.max(0, radiusAt(y - BODY_BASE) - inset);
  return new THREE.Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
}

function paint(geo: THREE.BufferGeometry, color: (p: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = color(p);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function paintPiggySolid(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  return paint(geo, () => c);
}

/** Unisce geometrie non indicizzate con position, normal e color (niente uv). */
export function mergePiggyGeometries(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const data = new Float32Array(total * 3);
    let offset = 0;
    for (const g of flat) {
      const attr = g.getAttribute(name);
      for (let i = 0; i < attr.count; i++) {
        data[offset++] = attr.getX(i);
        data[offset++] = attr.getY(i);
        data[offset++] = attr.getZ(i);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  for (const g of flat) g.dispose();
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** Mette una parte sulla superficie, con il suo +z lungo la normale verso l'esterno. */
function onSurface(geo: THREE.BufferGeometry, angle: number, y: number, inset: number, tilt = 0): THREE.BufferGeometry {
  const at = piggySurface(angle, y, inset);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-tilt, angle, 0, 'YXZ'));
  m.setPosition(at);
  return geo.applyMatrix4(m);
}

/** Corpo a pera, bianco con un poco di ombra bakata in basso: il colore lo dà il materiale. */
export function createPiggyBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.LatheGeometry(profilePoints, 32);
  geo.translate(0, BODY_BASE, 0);
  return paint(geo, (p) => {
    // Ombra morbida sotto la pancia e sotto la testa, petto più chiaro
    const below = THREE.MathUtils.smoothstep(p.y, 0.0, 0.3);
    const chest = 0.04 * Math.max(0, p.z) * THREE.MathUtils.smoothstep(p.y, 0.15, 0.45);
    const v = Math.min(1, 0.78 + 0.22 * below + chest);
    return new THREE.Color(v, v, v);
  });
}

/** Il collo cangiante: un anello appena sopra la superficie, verde acqua in basso, viola in alto. */
export function createPiggyNeckGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const y = NECK_FROM + ((NECK_TO - NECK_FROM) * i) / steps - BODY_BASE;
    pts.push(new THREE.Vector2(radiusAt(y) + 0.008, y + BODY_BASE));
  }
  return paintPiggyIridescent(new THREE.LatheGeometry(pts, 32), NECK_FROM, NECK_TO);
}

/** Colora una geometria col cangiante del collo, verde acqua a `from` e viola a `to` (in y). */
export function paintPiggyIridescent(geo: THREE.BufferGeometry, from: number, to: number): THREE.BufferGeometry {
  const teal = new THREE.Color(PIGGY_NECK_TEAL);
  const violet = new THREE.Color(PIGGY_NECK_VIOLET);
  const out = new THREE.Color();
  return paint(geo, (p) => {
    const t = (p.y - from) / (to - from);
    // Riflesso cangiante: il viola scivola un poco lungo il giro, come le piume vere
    const sheen = 0.5 + 0.5 * Math.sin(Math.atan2(p.x, p.z) * 2 + t * 3);
    return out.copy(teal).lerp(violet, THREE.MathUtils.clamp(t * 0.8 + sheen * 0.3, 0, 1));
  });
}

/** Occhio lucido con l'iride arancio da piccione; +z guarda fuori. */
export function createPiggyEyeGeometry(scale = 1): THREE.BufferGeometry {
  const white = paintPiggySolid(new THREE.SphereGeometry(0.06 * scale, 14, 10).scale(1, 1.15, 0.45), '#FFFFFF');
  const iris = paintPiggySolid(new THREE.SphereGeometry(0.043 * scale, 12, 8).scale(1, 1.15, 0.4).translate(0, 0, 0.012 * scale), PIGGY_IRIS);
  const pupil = paintPiggySolid(new THREE.SphereGeometry(0.028 * scale, 10, 8).scale(1, 1.2, 0.4).translate(0, 0, 0.02 * scale), PIGGY_INK);
  const glint = paintPiggySolid(new THREE.SphereGeometry(0.011 * scale, 6, 4).translate(-0.012 * scale, 0.02 * scale, 0.032 * scale), '#FFFFFF');
  return mergePiggyGeometries([white, iris, pupil, glint]);
}

/** Becco arancio morbido con la cera bianca sopra; la base è in z = 0 e la punta verso +z. */
export function createPiggyBeakGeometry(scale = 1, open = 0): THREE.BufferGeometry {
  const upper = new THREE.ConeGeometry(0.042 * scale, 0.12 * scale, 14, 1);
  upper.rotateX(Math.PI / 2).translate(0, 0, 0.06 * scale).scale(1, 0.7, 1);
  upper.rotateX(-open * 0.35).translate(0, 0.004 * scale, 0);
  const lower = new THREE.ConeGeometry(0.03 * scale, 0.08 * scale, 12, 1);
  lower.rotateX(Math.PI / 2).translate(0, -0.012 * scale, 0.04 * scale).scale(1, 0.6, 1);
  lower.rotateX(open * 0.6);
  const cere = paintPiggySolid(new THREE.SphereGeometry(0.03 * scale, 12, 8).scale(1.1, 0.6, 0.8).translate(0, 0.02 * scale, 0.01 * scale), PIGGY_CERE);
  return mergePiggyGeometries([paintPiggySolid(upper, PIGGY_BEAK), paintPiggySolid(lower, '#F07F25'), cere]);
}

/** Zampetta rosa a tre dita, appoggiata a terra con le dita verso +z. */
export function createPiggyFootGeometry(scale = 1): THREE.BufferGeometry {
  const toes = [-0.5, 0, 0.5].map((a) => {
    const toe = new THREE.CapsuleGeometry(0.016 * scale, 0.07 * scale, 4, 8);
    toe.rotateX(Math.PI / 2).translate(0, 0.016 * scale, 0.045 * scale).rotateY(a);
    return paintPiggySolid(toe, PIGGY_FEET);
  });
  const leg = paintPiggySolid(new THREE.CylinderGeometry(0.018 * scale, 0.022 * scale, 0.07 * scale, 8).translate(0, 0.045 * scale, 0), PIGGY_FEET);
  return mergePiggyGeometries([...toes, leg]);
}

/** Viso, collo e zampette in un'unica geometria a colori propri. */
export function createPiggyDetailsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [createPiggyNeckGeometry()];
  for (const side of [-1, 1]) {
    parts.push(onSurface(createPiggyEyeGeometry(), side * 0.42, PIGGY_HEAD_Y + 0.01, 0.012));
    parts.push(
      onSurface(paintPiggySolid(new THREE.SphereGeometry(0.04, 10, 8).scale(1.2, 0.7, 0.3), PIGGY_CHEEK), side * 0.78, PIGGY_HEAD_Y - 0.075, 0.006),
    );
    parts.push(createPiggyFootGeometry().rotateY(side * 0.15).translate(side * 0.12, 0, 0.08));
  }
  parts.push(onSurface(createPiggyBeakGeometry(), 0, PIGGY_HEAD_Y - 0.035, 0.015, -0.1));
  return mergePiggyGeometries(parts);
}

/**
 * Ala ripiegata: goccia piatta che pende dalla spalla (origine) verso -y, con due barre e la punta
 * più scure (come le barre del Piggy SVG). Il colore viene dal materiale.
 */
export function createPiggyWingGeometry(): THREE.BufferGeometry {
  const len = 0.18;
  const geo = new THREE.SphereGeometry(1, 16, 12);
  geo.scale(0.045, len, 0.13);
  // Goccia: larga vicino alla spalla, punta stretta in basso e un poco all'indietro
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + len) / (2 * len); // 0 punta, 1 spalla
    pos.setZ(i, pos.getZ(i) * (0.45 + 0.55 * Math.sqrt(t)) - (1 - t) * 0.06);
  }
  geo.translate(0, -len, 0);
  geo.computeVertexNormals();
  return paint(geo, (p) => {
    const d = -p.y / (2 * len); // 0 spalla, 1 punta
    const bar = (d > 0.38 && d < 0.45) || (d > 0.52 && d < 0.59);
    const v = d > 0.82 ? 0.62 : bar ? 0.58 : 0.9 - 0.08 * d;
    return new THREE.Color(v, v, v);
  });
}

/** Punta dell'ala (le remiganti), da usare come "mano" che si chiude a gancio; origine alla base. */
export function createPiggyWingtipGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 12, 8).scale(0.035, 0.09, 0.09).translate(0, 0.07, 0);
  return paint(geo, () => new THREE.Color(0.62, 0.62, 0.62));
}

/** Rotazione dell'ala intorno alla spalla: 0 ripiegata sul fianco, 1 aperta in alto. */
export function piggyWingRotation(side: -1 | 1, open: number, out = new THREE.Euler()): THREE.Euler {
  const t = THREE.MathUtils.clamp(open, 0, 1);
  return out.set(-0.12 + t * 0.2, 0, side * (0.2 + t * 2.0));
}

/** Spalla dell'ala per il lato dato. */
export function piggyShoulder(side: -1 | 1, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(PIGGY_SHOULDER.x * side, PIGGY_SHOULDER.y, PIGGY_SHOULDER.z);
}

export interface Piggy3D {
  readonly group: THREE.Group;
  /** Perno delle ali: rotazione 0 = ripiegate; si usano anche come "braccio". */
  readonly wings: { readonly left: THREE.Group; readonly right: THREE.Group };
  /** Materiale del corpo e delle ali (vertex color × colore del giocatore). */
  readonly bodyMaterial: THREE.MeshStandardMaterial;
  setColor(color: string): void;
  /** Apre (1) o richiude (0) le ali; `side` limita a un'ala sola. */
  setWingsOpen(open: number, side?: -1 | 1): void;
  dispose(): void;
}

/** Piggy intero come gruppo di mesh, per un personaggio singolo (tiratore, cliente...). */
export function createPiggy3D(color: string): Piggy3D {
  const group = new THREE.Group();
  const bodyGeo = createPiggyBodyGeometry();
  const detailsGeo = createPiggyDetailsGeometry();
  const wingGeo = createPiggyWingGeometry();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, vertexColors: true });
  const detailsMat = new THREE.MeshStandardMaterial({ roughness: 0.4, vertexColors: true });

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  const details = new THREE.Mesh(detailsGeo, detailsMat);
  details.castShadow = true;
  group.add(body, details);

  const makeWing = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    piggyShoulder(side, pivot.position);
    piggyWingRotation(side, 0, pivot.rotation);
    const wing = new THREE.Mesh(wingGeo, bodyMat);
    wing.castShadow = true;
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  };
  const wings = { left: makeWing(-1), right: makeWing(1) };

  return {
    group,
    wings,
    bodyMaterial: bodyMat,
    setColor(c) {
      bodyMat.color.set(c);
    },
    setWingsOpen(open, side) {
      if (side !== 1) piggyWingRotation(-1, open, wings.left.rotation);
      if (side !== -1) piggyWingRotation(1, open, wings.right.rotation);
    },
    dispose() {
      bodyGeo.dispose();
      detailsGeo.dispose();
      wingGeo.dispose();
      bodyMat.dispose();
      detailsMat.dispose();
      group.removeFromParent();
    },
  };
}
