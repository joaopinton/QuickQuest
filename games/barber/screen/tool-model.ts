// L'attrezzo in mano al barbiere, disegnato in 3D accanto alla testa (docs/games/barber.md § Gesto).
// Non è un anello incollato sulla cute: è la macchinetta (o le forbici) che fluttua dove punta il
// telefono e appoggia le lame sui capelli solo quando ci arriva sopra.
// Riferimento locale: +Y = verso le lame (la punta che taglia, all'origine), −Y = l'impugnatura,
// +Z = il dorso che guarda la telecamera. Misure in metri, come la bottega.

import * as THREE from 'three';
import type { BarberTool } from '../shared/events';

export interface ToolModel {
  readonly group: THREE.Group;
  setTool(tool: BarberTool): void;
  setColor(color: string): void;
  /** Macchinetta accesa: vibra. */
  setOn(isOn: boolean): void;
  /** Una sforbiciata: le lame si chiudono e si riaprono. */
  snip(): void;
  update(dt: number): void;
  dispose(): void;
}

/** Lunghezza dei denti del rialzo per ogni macchinetta (0 = lame scoperte). */
const GUARD_DEPTH: Readonly<Record<Exclude<BarberTool, 'scissors'>, number>> = { clip0: 0, clip1: 0.014, clip2: 0.03 };
const GUARD_TEETH = 9;
const SNIP_S = 0.2;
const SCISSORS_OPEN = 0.32;
const BUZZ_AMPLITUDE = 0.0018;

export function createToolModel(): ToolModel {
  const group = new THREE.Group();
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x);
    return x;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    return m;
  };

  const shellMat = keep(new THREE.MeshStandardMaterial({ color: '#2A2D34', roughness: 0.38, metalness: 0.2 }));
  const gripMat = keep(new THREE.MeshStandardMaterial({ color: '#17191D', roughness: 0.85 }));
  const steelMat = keep(new THREE.MeshStandardMaterial({ color: '#D9DEE4', roughness: 0.22, metalness: 0.95 }));
  const guardMat = keep(new THREE.MeshStandardMaterial({ color: '#1F2226', roughness: 0.5, transparent: true, opacity: 0.88 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ color: '#2EC4B6', roughness: 0.45 }));

  // --- Macchinetta: corpo a capsula, testina, lame, rialzo a denti --------------------------
  const clipper = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.027, 0.12, 6, 18), shellMat, 0, -0.105, 0);
  body.scale.set(1.12, 1, 0.78);
  const grip = mesh(new THREE.CapsuleGeometry(0.0285, 0.06, 6, 18), gripMat, 0, -0.14, 0);
  grip.scale.set(1.12, 1, 0.8);
  const band = mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.008, 20), accentMat, 0, -0.085, 0);
  band.scale.set(1.08, 1, 0.8);
  const button = mesh(new THREE.BoxGeometry(0.012, 0.02, 0.006), accentMat, 0, -0.06, 0.022);
  const housing = mesh(new THREE.BoxGeometry(0.064, 0.026, 0.036), shellMat, 0, -0.022, 0);
  const blade = mesh(new THREE.BoxGeometry(0.062, 0.006, 0.02), steelMat, 0, -0.006, 0.002);
  const teethGeo = keep(new THREE.BoxGeometry(0.0036, 0.006, 0.003));
  for (let i = 0; i < 12; i++) {
    const tooth = new THREE.Mesh(teethGeo, steelMat);
    tooth.position.set(-0.028 + (i * 0.056) / 11, -0.0005, 0.011);
    clipper.add(tooth);
  }
  const guard = new THREE.Group();
  const guardToothGeo = keep(new THREE.BoxGeometry(0.003, 1, 0.006));
  const guardBarGeo = keep(new THREE.BoxGeometry(0.066, 0.004, 0.008));
  const guardTeeth: THREE.Mesh[] = [];
  for (let i = 0; i < GUARD_TEETH; i++) {
    const tooth = new THREE.Mesh(guardToothGeo, guardMat);
    tooth.position.x = -0.03 + (i * 0.06) / (GUARD_TEETH - 1);
    guardTeeth.push(tooth);
    guard.add(tooth);
  }
  const guardBar = new THREE.Mesh(guardBarGeo, guardMat);
  guard.add(guardBar);
  clipper.add(body, grip, band, button, housing, blade, guard);

  // --- Forbici: due lame incrociate al perno, due anelli ----------------------------------
  const scissors = new THREE.Group();
  const bladeGeo = keep(new THREE.ConeGeometry(0.009, 0.11, 4, 1));
  const ringGeo = keep(new THREE.TorusGeometry(0.017, 0.0045, 8, 20));
  const halves = [-1, 1].map((side) => {
    const half = new THREE.Group();
    const b = new THREE.Mesh(bladeGeo, steelMat);
    b.scale.set(1, 1, 0.35);
    b.position.set(0, 0.055, 0);
    const shank = mesh(new THREE.BoxGeometry(0.006, 0.05, 0.004), steelMat, side * 0.008, -0.026, 0);
    shank.rotation.z = side * 0.32;
    const ring = new THREE.Mesh(ringGeo, accentMat);
    ring.position.set(side * 0.022, -0.06, 0);
    half.add(b, shank, ring);
    half.position.z = side * 0.002;
    scissors.add(half);
    return { half, side };
  });
  const pivot = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.01, 10), steelMat);
  pivot.rotation.x = Math.PI / 2;
  scissors.add(pivot);
  // il perno sta un po' sotto la punta: le lame arrivano fino all'origine (dove si taglia)
  scissors.position.y = -0.11;

  group.add(clipper, scissors);
  group.traverse((o) => {
    o.castShadow = false;
    o.renderOrder = 5;
  });

  let isOn = false;
  let snipT = SNIP_S;
  let t = 0;

  const setGuard = (depth: number) => {
    guard.visible = depth > 0;
    for (const tooth of guardTeeth) {
      tooth.scale.y = depth;
      tooth.position.y = depth / 2;
    }
    guardBar.position.y = depth;
  };

  return {
    group,
    setTool(tool) {
      clipper.visible = tool !== 'scissors';
      scissors.visible = tool === 'scissors';
      if (tool !== 'scissors') setGuard(GUARD_DEPTH[tool]);
      // col rialzo la punta che tocca i capelli è il bordo del pettine, non le lame
      clipper.position.y = tool === 'scissors' ? 0 : -GUARD_DEPTH[tool];
    },
    setColor(color) {
      accentMat.color.set(color);
    },
    setOn(next) {
      isOn = next;
    },
    snip() {
      snipT = 0;
    },
    update(dt) {
      t += dt;
      snipT = Math.min(SNIP_S, snipT + dt);
      // chiusa a metà sforbiciata, poi di nuovo aperta
      const phase = snipT / SNIP_S;
      const open = SCISSORS_OPEN * Math.abs(1 - 2 * phase);
      for (const { half, side } of halves) half.rotation.z = side * open * 0.5;
      const buzz = isOn ? BUZZ_AMPLITUDE : 0;
      clipper.position.x = Math.sin(t * 190) * buzz;
      clipper.position.z = Math.cos(t * 230) * buzz;
    },
    dispose() {
      trash.forEach((d) => d.dispose());
    },
  };
}
