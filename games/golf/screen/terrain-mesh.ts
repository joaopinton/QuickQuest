// Mesh del terreno del golf (Three.js): la griglia di terrain.ts diventa un prato a rilievo con
// i colori per zona (fairway a strisce, rough, green, sabbia, conca dei laghetti, fuori limite).
// La buca è un foro vero: il materiale scarta i pixel dentro il raggio della buca.
import * as THREE from 'three';
import { hazardAt, inPond } from './hazards';
import { lieAt, pinOf, type GolfHole, type Lie } from './rules';
import { terrainOf } from './terrain';

const LIE_COLOR: Readonly<Record<Lie, number>> = {
  tee: 0x6ac24f,
  fairway: 0x7ed957,
  green: 0x9be56f,
  rough: 0x5fb84a,
  bunker: 0xf3dc9b,
};
const STRIPE_LIGHT = 0x8de464;
const STRIPE_M = 12;
const OUT_OF_BOUNDS = 0x4b9640;
const POND_BED = 0x3d8f73;

function colorAt(hole: GolfHole, x: number, y: number, out: THREE.Color, height: number): void {
  const p = { x, y };
  const grownPond = (hole.water ?? []).some((w) => inPond({ ...w, rx: w.rx * 1.12, ry: w.ry * 1.12 }, p));
  if (grownPond) out.setHex(POND_BED);
  else if (hazardAt(hole, p) === 'oob') out.setHex(OUT_OF_BOUNDS);
  else {
    const lie = lieAt(hole, p);
    const stripe = lie === 'fairway' && Math.floor(y / STRIPE_M) % 2 === 0;
    out.setHex(stripe ? STRIPE_LIGHT : LIE_COLOR[lie]);
  }
  // un filo più chiaro in cima alle colline, più scuro nelle conche
  out.multiplyScalar(0.94 + 0.03 * Math.max(-2, Math.min(3, height)));
}

/** Prato a rilievo della buca, con il foro della buca (raggio visivo `cupRadius`). */
export function buildTerrainMesh(hole: GolfHole, cupRadius: number): THREE.Mesh {
  const f = terrainOf(hole);
  const count = f.cols * f.rows;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const k = j * f.cols + i;
      const x = f.x0 + i * f.cell;
      const y = f.y0 + j * f.cell;
      const h = f.heights[k]!;
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = -y;
      colorAt(hole, x, y, c, h);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const index = new Uint32Array((f.cols - 1) * (f.rows - 1) * 6);
  let n = 0;
  for (let j = 0; j < f.rows - 1; j++) {
    for (let i = 0; i < f.cols - 1; i++) {
      const a = j * f.cols + i;
      const b = a + 1;
      const d = a + f.cols;
      const e = d + 1;
      // in Three.js y di gioco è −z: quest'ordine tiene le facce verso l'alto
      index[n++] = a; index[n++] = b; index[n++] = d;
      index[n++] = b; index[n++] = e; index[n++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();

  const pin = pinOf(hole);
  const material = new THREE.MeshToonMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCup = { value: new THREE.Vector3(pin.x, -pin.y, cupRadius) };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vQqWorld;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvQqWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      'uniform vec3 uCup;\nvarying vec3 vQqWorld;\nvoid main() {\nif (length(vQqWorld.xz - uCup.xy) < uCup.z) discard;',
    );
  };
  return new THREE.Mesh(geometry, material);
}
