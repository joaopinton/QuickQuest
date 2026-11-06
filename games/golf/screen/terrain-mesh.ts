// Mesh del terreno del golf (Three.js): la griglia di terrain.ts diventa un prato a rilievo.
// I colori delle zone (fairway a strisce, rough, green, sabbia, fuori limite) si calcolano per
// pixel nello shader con la stessa logica di `lieAt`, così i bordi sono netti e coincidono con
// le regole; i vertici portano solo la luce delle colline. La buca è un foro vero: il materiale
// scarta i pixel dentro il raggio della buca.
import * as THREE from 'three';
import { OOB_BEHIND_TEE_M, OOB_HALF_WIDTH_M, OOB_PAST_GREEN_M } from './bounds';
import { FAIRWAY_HALF_WIDTH_M, pinOf, type GolfHole } from './rules';
import { terrainOf } from './terrain';

const COLOR = {
  fairway: 0x7ed957,
  stripe: 0x8de464,
  green: 0x9be56f,
  rough: 0x5fb84a,
  bunker: 0xf3dc9b,
  outOfBounds: 0x4b9640,
};
const STRIPE_M = 12;
/** Inizio del fairway dietro il tee (come in rules.ts, lieAt). */
const FAIRWAY_FROM_Y_M = -5;
/** Bunker gestiti dallo shader (le buche ne hanno al massimo 2). */
const MAX_BUNKERS = 4;

/** Luce delle colline: un filo più chiaro in cima, più scuro nelle conche. */
const shadeAt = (height: number) => 0.94 + 0.03 * Math.max(-2, Math.min(3, height));

const linear = (hex: number) => new THREE.Color(hex);

const ZONE_GLSL = `
uniform vec3 uCup;
uniform vec3 uGreen;
uniform vec4 uBunkers[${MAX_BUNKERS}];
uniform vec4 uField;
uniform float uOobPast;
uniform vec3 uColFairway;
uniform vec3 uColStripe;
uniform vec3 uColGreen;
uniform vec3 uColRough;
uniform vec3 uColBunker;
uniform vec3 uColOob;
varying vec3 vQqWorld;

// stessa logica di lieAt (rules.ts) e hazardAt per il fuori limite (hazards.ts)
vec3 qqZone(vec2 p) {
  float len = uField.y;
  if (abs(p.x) > uField.z || p.y < uField.w || p.y > len + uOobPast) return uColOob;
  if (length(p - uGreen.xy) <= uGreen.z) return uColGreen;
  for (int i = 0; i < ${MAX_BUNKERS}; i++) {
    vec4 b = uBunkers[i];
    if (b.w > 0.5 && length(p - b.xy) <= b.z) return uColBunker;
  }
  if (p.y >= ${FAIRWAY_FROM_Y_M.toFixed(1)} && p.y <= len && abs(p.x) <= uField.x) {
    return mod(floor(p.y / ${STRIPE_M.toFixed(1)}), 2.0) < 0.5 ? uColStripe : uColFairway;
  }
  return uColRough;
}
`;

/** Prato a rilievo della buca, con il foro della buca (raggio `cupRadius`). */
export function buildTerrainMesh(hole: GolfHole, cupRadius: number): THREE.Mesh {
  const f = terrainOf(hole);
  const count = f.cols * f.rows;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let j = 0; j < f.rows; j++) {
    for (let i = 0; i < f.cols; i++) {
      const k = j * f.cols + i;
      const h = f.heights[k]!;
      positions[k * 3] = f.x0 + i * f.cell;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = -(f.y0 + j * f.cell);
      const shade = shadeAt(h);
      colors[k * 3] = shade;
      colors[k * 3 + 1] = shade;
      colors[k * 3 + 2] = shade;
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
      // in Three.js y di gioco è −z: quest'ordine tiene le facce verso l'alto.
      // La diagonale è b–d, come in terrain.ts (groundHeight): la palla sta su questi triangoli.
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
  const bunkers = Array.from({ length: MAX_BUNKERS }, (_, i) => {
    const b = hole.bunkers[i];
    return b ? new THREE.Vector4(b.x, b.y, b.radiusM, 1) : new THREE.Vector4(0, 0, 0, 0);
  });
  const material = new THREE.MeshToonMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uCup: { value: new THREE.Vector3(pin.x, -pin.y, cupRadius) },
      uGreen: { value: new THREE.Vector3(pin.x, pin.y, hole.greenRadiusM) },
      uBunkers: { value: bunkers },
      uField: { value: new THREE.Vector4(FAIRWAY_HALF_WIDTH_M, hole.lengthM, OOB_HALF_WIDTH_M, OOB_BEHIND_TEE_M) },
      uOobPast: { value: OOB_PAST_GREEN_M },
      uColFairway: { value: linear(COLOR.fairway) },
      uColStripe: { value: linear(COLOR.stripe) },
      uColGreen: { value: linear(COLOR.green) },
      uColRough: { value: linear(COLOR.rough) },
      uColBunker: { value: linear(COLOR.bunker) },
      uColOob: { value: linear(COLOR.outOfBounds) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vQqWorld;\nvoid main() {')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvQqWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${ZONE_GLSL}\nvoid main() {\nif (length(vQqWorld.xz - uCup.xy) < uCup.z) discard;`)
      // coordinate di gioco: (x, −z)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= qqZone(vec2(vQqWorld.x, -vQqWorld.z));');
  };
  return new THREE.Mesh(geometry, material);
}
