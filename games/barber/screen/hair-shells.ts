// Capelli con shell texturing (docs/games/barber.md § Simulazione dei capelli).
// Una sola InstancedMesh di gusci sferici concentrici: il guscio 0 è la cute (con la ricrescita
// che si vede in trasparenza dove i capelli sono corti, come in una sfumatura vera), i gusci
// superiori disegnano le ciocche dove la mappa delle lunghezze è più alta della loro quota.
//
// Perché non sembrino un prato di bastoncini:
// - le ciocche seguono un FLUSSO: partono dal vortice sulla nuca e cadono verso il basso, quindi
//   i gusci alti si spostano lungo la cute e i capelli lunghi si coricano invece di stare dritti;
// - i fili sono fini e sparsi in 3D sulla radice (niente cuciture né poli schiacciati della UV),
//   raggruppati in ciocche da un rumore a bassa frequenza che ne varia lunghezza e colore;
// - la luce è quella dei capelli (Kajiya-Kay): due riflessi allungati lungo il filo, uno chiaro e
//   uno tinto, più un'ombra che scurisce le radici e un controluce sui bordi;
// - i bordi dei fili sono morbidi con l'alpha-to-coverage del multisample.
// Una sola draw call, la mappa si aggiorna come DataTexture.

import * as THREE from 'three';
import { HAIR_LIE_DOWN, MAX_HAIR } from '../shared/head';
import type { HairMap } from './hair-map';

export { MAX_HAIR };

export const SHELL_COUNT = 24;
/** Sotto questo numero di gusci le ciocche diventano scalini: è il minimo della qualità adattiva. */
export const MIN_SHELL_COUNT = 10;
/** Fili per raggio della testa (densità del reticolo 3D delle radici). */
const STRAND_DENSITY = 120;
/** Luce principale e controluce della bottega (environment.ts), direzioni nel mondo. */
const KEY_DIR = new THREE.Vector3(2.5, 5, 3.5).normalize();
const RIM_DIR = new THREE.Vector3(0, 0.45, -1).normalize();

const vertexShader = /* glsl */ `
  attribute float aLayer;
  uniform float uMaxHair;
  uniform sampler2D uLen;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vRoot;
  varying vec3 vNormal;
  varying vec3 vFlow;
  varying vec3 vWorld;
  varying float vClump;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  // Rumore lento delle ciocche: per vertice basta, è a bassa frequenza
  float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
    float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
    float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
    float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
  }

  // Vortice: un po' indietro sulla sommità, da lì i capelli si aprono e scendono
  const vec3 CROWN = vec3(0.0, 0.83, -0.56);

  vec3 hairFlow(vec3 n) {
    vec3 away = n * dot(n, CROWN) - CROWN;
    float la = length(away);
    away = la > 1e-4 ? away / la : vec3(0.0, 0.0, 1.0);
    // la gravità sul piano della cute: i lati e la nuca cadono giù
    vec3 g = vec3(0.0, -1.0, 0.0) + n * n.y;
    // una riga appena accennata: sopra la fronte la frangia va un po' di lato
    vec3 side = vec3(1.0, 0.0, 0.0) - n * n.x;
    vec3 t = away * 0.8 + g * 0.55 + side * 0.18 * smoothstep(0.2, 0.9, n.z) * smoothstep(0.1, 0.7, n.y);
    float lt = length(t);
    return lt > 1e-4 ? t / lt : away;
  }

  void main() {
    vUv = uv;
    vLayer = aLayer;
    vec3 n = normalize(position);
    vRoot = n;
    vClump = valueNoise(n * 4.5 + 7.0);
    vec3 flow = hairFlow(n);
    float len = texture2D(uLen, vec2(uv.x, 1.0 - uv.y)).r;
    float h = aLayer * uMaxHair;
    // I capelli lunghi si coricano lungo il flusso: crescono meno in altezza e più "in avanti"
    float lift = h * (1.0 - ${HAIR_LIE_DOWN.toFixed(2)} * len);
    float bend = aLayer * aLayer * uMaxHair * (0.25 + 1.15 * len);
    vec3 p = n * (1.0 + lift) + flow * bend;
    p.y -= aLayer * aLayer * uMaxHair * 0.18 * len * (1.0 - abs(n.y));
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vFlow = normalize(mat3(modelMatrix) * flow);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uLen;
  uniform sampler2D uTarget;
  uniform vec3 uHair;
  uniform vec3 uSkin;
  uniform vec3 uGhostColor;
  uniform float uGhost;
  uniform vec3 uKeyDir;
  uniform vec3 uRimDir;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vRoot;
  varying vec3 vNormal;
  varying vec3 vFlow;
  varying vec3 vWorld;
  varying float vClump;

  // Reticolo ruotato: niente file allineate agli assi
  const mat3 GRID = mat3(0.788, -0.346, 0.509, 0.570, 0.682, -0.458, -0.189, 0.644, 0.741);

  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }

  // Riflesso di Kajiya-Kay lungo il filo
  float strandSpec(vec3 t, vec3 h, float power) {
    float th = dot(t, h);
    return pow(sqrt(max(0.0, 1.0 - th * th)), power);
  }

  void main() {
    vec2 tuv = vec2(vUv.x, 1.0 - vUv.y);
    float len = texture2D(uLen, tuv).r;
    // i gusci sopra i capelli più lunghi possibili qui non disegnano niente: si esce subito
    if (vLayer > len * 1.08) discard;
    float want = texture2D(uTarget, tuv).r;
    vec3 n = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = normalize(uKeyDir);

    // Ciocche: un rumore lento raggruppa i fili per lunghezza, colore e direzione
    float clump = vClump;
    vec3 cellP = GRID * vRoot * ${STRAND_DENSITY.toFixed(1)};
    vec3 cell = floor(cellP);
    vec3 rnd = hash33(cell);
    float d = length(cellP - (cell + 0.2 + 0.6 * rnd));

    vec3 color;
    float alpha = 1.0;
    if (vLayer < 0.001) {
      // Cute: dove i capelli sono corti si vede la pelle con i puntini della ricrescita, così
      // una sfumatura passa dal pieno alla pelle in modo graduale
      float stubble = (1.0 - smoothstep(0.18, 0.42, d)) * smoothstep(0.004, 0.04, len);
      float cover = smoothstep(0.03, 0.3, len);
      float density = clamp(cover * 0.9 + stubble * 0.55, 0.0, 1.0);
      color = mix(uSkin, uHair * 0.42, density);
      float lambert = max(dot(n, L), 0.0);
      color *= 0.55 + 0.45 * lambert;
    } else {
      float strandLen = len * (0.74 + 0.2 * rnd.x + 0.12 * clump);
      if (vLayer > strandLen) discard;
      float h = vLayer / max(strandLen, 0.001);
      // Fili fini che si assottigliano; vicino alla radice un sottopelo fitto copre la cute
      float radius = mix(0.5, 0.1, pow(h, 0.8));
      float fw = max(fwidth(d), 0.02);
      alpha = 1.0 - smoothstep(radius - fw, radius + fw, d);
      alpha = max(alpha, 1.0 - smoothstep(0.0, 0.3, h));
      if (alpha < 0.1) discard;

      // Tangente del filo: il flusso, girato un po' per ciocca e per filo
      vec3 bin = normalize(cross(n, vFlow));
      vec3 T = normalize(vFlow + bin * ((clump - 0.5) * 0.9 + (rnd.y - 0.5) * 0.35));
      vec3 H = normalize(L + V);
      float shift = (rnd.z - 0.5) * 0.25;
      float spec1 = strandSpec(normalize(T + n * (0.12 + shift)), H, 110.0);
      float spec2 = strandSpec(normalize(T + n * (-0.1 + shift)), H, 26.0);
      float diffuse = clamp(dot(n, L) * 0.6 + 0.4, 0.0, 1.0);
      // Ombra tra i fili: radici scure, punte più chiare (e un filo più secco qua e là)
      float ao = mix(0.28, 1.0, smoothstep(0.0, 1.0, h)) * mix(0.75, 1.0, clump);
      vec3 base = uHair * (0.82 + 0.36 * rnd.x) * (0.85 + 0.3 * clump);
      base = mix(base, base * 1.35 + 0.02, h * h * 0.45);
      color = base * (0.3 + 0.8 * diffuse) * ao;
      color += vec3(1.0, 0.96, 0.9) * spec1 * 0.2 * diffuse * ao;
      color += base * spec2 * 0.85 * diffuse * ao * (0.5 + rnd.y);
      // Controluce della lampada dietro la poltrona: accende i bordi della chioma
      float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * max(dot(-V, normalize(uRimDir)) * 0.5 + 0.5, 0.0);
      color += base * rim * 0.9 * h;
    }
    // Sagoma dell'assist: in menta i capelli ancora da tagliare
    float toCut = step(want + 0.06, len) * step(0.01, len);
    color = mix(color, uGhostColor * 0.9, 0.34 * uGhost * toCut);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface HairShells {
  readonly mesh: THREE.InstancedMesh;
  setMaps(lengths: HairMap, target: Uint8Array): void;
  markDirty(): void;
  setColors(hair: string, skin: string): void;
  setGhost(alpha: number): void;
  /** Gusci disegnati (qualità): meno gusci = meno lavoro per pixel, ciocche più grossolane. */
  setShellCount(count: number): void;
  readonly shellCount: number;
  dispose(): void;
}

function makeTexture(data: Uint8Array, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function createHairShells(): HairShells {
  const geo = new THREE.SphereGeometry(1, 64, 44);
  const layers = new Float32Array(SHELL_COUNT);
  const layerAttr = new THREE.InstancedBufferAttribute(layers, 1);
  geo.setAttribute('aLayer', layerAttr);
  let shellCount = SHELL_COUNT;
  const spreadLayers = (count: number) => {
    for (let i = 0; i < SHELL_COUNT; i++) layers[i] = Math.min(1, i / (count - 1));
    layerAttr.needsUpdate = true;
  };
  spreadLayers(SHELL_COUNT);

  const empty = new Uint8Array(16);
  let lenTex = makeTexture(empty, 4);
  let targetTex = makeTexture(empty, 4);
  const uniforms = {
    uLen: { value: lenTex as THREE.Texture },
    uTarget: { value: targetTex as THREE.Texture },
    uHair: { value: new THREE.Color('#5B3A29') },
    uSkin: { value: new THREE.Color('#F2C7A5') },
    uGhostColor: { value: new THREE.Color('#2EC4B6') },
    uGhost: { value: 0 },
    uMaxHair: { value: MAX_HAIR },
    uKeyDir: { value: KEY_DIR.clone() },
    uRimDir: { value: RIM_DIR.clone() },
  };
  // alpha-to-coverage: bordi dei fili morbidi col multisample, senza ordinare i gusci
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, alphaToCoverage: true });
  const mesh = new THREE.InstancedMesh(geo, material, SHELL_COUNT);
  mesh.frustumCulled = false;
  // i gusci nel passaggio delle ombre costano tanto e non si vedono: l'ombra la fa la testa
  mesh.castShadow = false;

  return {
    mesh,
    setMaps(map, target) {
      lenTex.dispose();
      targetTex.dispose();
      lenTex = makeTexture(map.lengths, map.size);
      targetTex = makeTexture(target, map.size);
      uniforms.uLen.value = lenTex;
      uniforms.uTarget.value = targetTex;
    },
    markDirty() {
      lenTex.needsUpdate = true;
    },
    setColors(hair, skin) {
      uniforms.uHair.value.set(hair);
      uniforms.uSkin.value.set(skin);
    },
    setGhost(alpha) {
      uniforms.uGhost.value = alpha;
    },
    setShellCount(count) {
      const next = Math.round(Math.min(SHELL_COUNT, Math.max(MIN_SHELL_COUNT, count)));
      if (next === shellCount) return;
      shellCount = next;
      // i gusci restano distribuiti su tutta l'altezza dei capelli, solo più radi
      spreadLayers(next);
      mesh.count = next;
    },
    get shellCount() {
      return shellCount;
    },
    dispose() {
      lenTex.dispose();
      targetTex.dispose();
      geo.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
