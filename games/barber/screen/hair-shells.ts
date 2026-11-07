// Capelli con shell texturing (docs/games/barber.md § Simulazione dei capelli).
// Una sola InstancedMesh di gusci sferici concentrici: il guscio 0 è la testa (pelle, o radici
// scure dove ci sono capelli corti), i gusci superiori disegnano i ciuffi dove la mappa delle
// lunghezze è più alta della loro quota. Una sola draw call, la mappa si aggiorna come DataTexture.

import * as THREE from 'three';
import type { HairMap } from './hair-map';

export const SHELL_COUNT = 16;
/** Spessore massimo dei capelli, in raggi della testa. */
export const MAX_HAIR = 0.26;

const vertexShader = /* glsl */ `
  attribute float aLayer;
  uniform float uMaxHair;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vLayer = aLayer;
    vec3 p = position * (1.0 + aLayer * uMaxHair);
    // Le punte cadono un po' verso il basso: sembrano capelli, non un casco
    p.y -= aLayer * aLayer * uMaxHair * 0.35 * (1.0 - abs(normal.y));
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uLen;
  uniform sampler2D uTarget;
  uniform vec3 uHair;
  uniform vec3 uSkin;
  uniform vec3 uGhostColor;
  uniform float uGhost;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 tuv = vec2(vUv.x, 1.0 - vUv.y);
    float len = texture2D(uLen, tuv).r;
    float want = texture2D(uTarget, tuv).r;
    vec3 n = normalize(vNormal);
    float light = 0.58 + 0.42 * max(dot(n, normalize(vec3(0.35, 0.8, 0.5))), 0.0);
    vec3 color;
    if (vLayer < 0.001) {
      float covered = smoothstep(0.02, 0.1, len);
      color = mix(uSkin, uHair * 0.5, covered);
    } else {
      vec2 grid = vUv * vec2(280.0, 140.0);
      float rnd = hash(floor(grid));
      float strand = len * (0.72 + 0.28 * rnd);
      if (vLayer > strand) discard;
      // Ogni ciuffo si assottiglia verso la punta
      vec2 f = fract(grid) - 0.5;
      float taper = 1.0 - vLayer / max(strand, 0.001);
      if (length(f) > taper * 0.6 + 0.12) discard;
      float ao = mix(0.42, 1.08, vLayer / max(len, 0.001));
      color = uHair * ao * (0.92 + 0.16 * rnd);
    }
    // Sagoma dell'assist: in menta i capelli ancora da tagliare
    float toCut = step(want + 0.06, len) * step(0.01, len);
    color = mix(color, uGhostColor, 0.42 * uGhost * toCut);
    gl_FragColor = vec4(color * light, 1.0);
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
  const geo = new THREE.SphereGeometry(1, 56, 36);
  const layers = new Float32Array(SHELL_COUNT);
  for (let i = 0; i < SHELL_COUNT; i++) layers[i] = i / (SHELL_COUNT - 1);
  geo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layers, 1));

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
  };
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
  const mesh = new THREE.InstancedMesh(geo, material, SHELL_COUNT);
  mesh.frustumCulled = false;
  // 16 gusci nel passaggio delle ombre costano tanto e non si vedono: l'ombra la fa la testa
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
    dispose() {
      lenTex.dispose();
      targetTex.dispose();
      geo.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
