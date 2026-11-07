// Il cliente: un Bubù "peloso" seduto in poltrona con la mantellina (docs/games/barber.md § Set).
// La testa è una sfera unitaria scalata a HEAD_RADIUS: i capelli sono i gusci di hair-shells.ts,
// la faccia (occhi, naso, bocca, sopracciglia) si gira con la testa. Le reazioni allo specchio
// sono sempre comiche, mai offensive (docs/11 § 6.1).

import * as THREE from 'three';
import { ACCENT } from './environment';
import { createHairShells, type HairShells } from './hair-shells';
import type { Reaction } from './rules';

export const HEAD_RADIUS = 0.36;
const WALK_IN_S = 0.9;

export interface ClientLook {
  readonly hair: string;
  readonly skin: string;
}

export const CLIENT_LOOKS: readonly ClientLook[] = [
  { hair: '#5B3A29', skin: '#F2C7A5' },
  { hair: '#2B2522', skin: '#C98E6B' },
  { hair: '#C8642E', skin: '#F6D2B6' },
  { hair: '#E5C07B', skin: '#EBB896' },
  { hair: '#6C4BA8', skin: '#F2C7A5' },
];

export interface BarberClient {
  readonly group: THREE.Group;
  /** Gruppo della testa: rotazione della poltrona e riferimento dei punti sulla testa. */
  readonly head: THREE.Group;
  readonly hair: HairShells;
  setLook(look: ClientLook): void;
  setYawTarget(yaw: number): void;
  setReaction(r: Reaction | null): void;
  walkIn(): void;
  update(dt: number): void;
  dispose(): void;
}

export function createBarberClient(seat: THREE.Vector3): BarberClient {
  const group = new THREE.Group();
  group.position.copy(seat);
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x);
    return x;
  };

  const skinMat = keep(new THREE.MeshStandardMaterial({ color: '#F2C7A5', roughness: 0.7 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ color: '#1E2A4A', roughness: 0.4 }));
  const cheekMat = keep(new THREE.MeshStandardMaterial({ color: '#FF9AA2', roughness: 0.8, transparent: true, opacity: 0.7 }));
  const capeMat = keep(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.6 }));

  // Corpo sotto la mantellina
  const cape = new THREE.Mesh(keep(new THREE.ConeGeometry(0.62, 0.95, 32, 1, true)), capeMat);
  cape.position.y = 0.42;
  cape.castShadow = true;
  group.add(cape);
  const collar = new THREE.Mesh(keep(new THREE.TorusGeometry(0.13, 0.04, 10, 24)), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.9;
  group.add(collar);
  const neck = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 16)), skinMat);
  neck.position.y = 0.95;
  group.add(neck);
  const knees = new THREE.Mesh(keep(new THREE.SphereGeometry(0.3, 16, 12)), capeMat);
  knees.scale.set(1.3, 0.5, 1);
  knees.position.set(0, 0.05, 0.35);
  group.add(knees);

  // Testa (sfera unitaria scalata)
  const head = new THREE.Group();
  head.position.y = 0.95 + HEAD_RADIUS * 0.92;
  head.scale.setScalar(HEAD_RADIUS);
  group.add(head);
  const hair = createHairShells();
  head.add(hair.mesh);

  const onHead = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(x, y, z);
    head.add(m);
    return m;
  };
  for (const side of [-1, 1]) {
    onHead(new THREE.SphereGeometry(0.1, 14, 10), darkMat, side * 0.32, 0.1, 0.93);
    onHead(new THREE.SphereGeometry(0.13, 12, 8), cheekMat, side * 0.55, -0.18, 0.8).scale.set(1, 0.6, 0.4);
    onHead(new THREE.SphereGeometry(0.2, 14, 10), skinMat, side * 0.98, -0.12, 0).scale.set(0.45, 1, 0.8);
  }
  const brows = [-1, 1].map((side) => {
    const b = onHead(new THREE.BoxGeometry(0.2, 0.04, 0.04), darkMat, side * 0.32, 0.3, 0.94);
    return { mesh: b, side };
  });
  onHead(new THREE.SphereGeometry(0.11, 12, 10), skinMat, 0, -0.06, 1.0);
  const smile = onHead(new THREE.TorusGeometry(0.17, 0.032, 8, 20, Math.PI), darkMat, 0, -0.3, 0.93);
  smile.rotation.z = Math.PI;
  const mouthO = onHead(new THREE.TorusGeometry(0.08, 0.03, 8, 16), darkMat, 0, -0.36, 0.92);
  mouthO.visible = false;

  // Cappello per il voto più basso: comico, si nasconde il disastro
  const hatMat = keep(new THREE.MeshStandardMaterial({ color: '#2B2D42', roughness: 0.6 }));
  const hat = new THREE.Group();
  const crown = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.62, 0.7, 0.6, 24)), hatMat);
  crown.position.y = 0.3;
  const brim = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.15, 1.15, 0.06, 28)), hatMat);
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.71, 0.71, 0.12, 24)), accentMat);
  band.position.y = 0.08;
  hat.add(crown, brim, band);
  hat.position.y = 2.4;
  hat.visible = false;
  head.add(hat);

  let yawTarget = 0;
  let reaction: Reaction | null = null;
  let reactionT = 0;
  let walkT = WALK_IN_S;

  const setMouth = (r: Reaction | null) => {
    const shocked = r === 'shocked';
    mouthO.visible = shocked;
    smile.visible = !shocked;
    const curve: Readonly<Record<Reaction, number>> = { selfie: 1.25, happy: 1, puzzled: 0.25, awkward: -0.5, shocked: 0 };
    const k = r ? curve[r] : 0.7;
    smile.scale.set(1, Math.max(0.15, Math.abs(k)), 1);
    smile.rotation.z = k >= 0 ? Math.PI : 0;
    smile.position.y = k >= 0 ? -0.3 : -0.4;
    for (const { mesh, side } of brows) {
      const tilt = r === 'puzzled' ? (side < 0 ? 0.35 : -0.1) : r === 'awkward' ? side * 0.25 : r === 'shocked' ? 0 : -side * 0.12;
      mesh.rotation.z = tilt;
      mesh.position.y = r === 'shocked' ? 0.38 : 0.3;
    }
  };
  setMouth(null);

  return {
    group,
    head,
    hair,
    setLook(look) {
      skinMat.color.set(look.skin);
      hair.setColors(look.hair, look.skin);
    },
    setYawTarget(yaw) {
      yawTarget = yaw;
    },
    setReaction(r) {
      reaction = r;
      reactionT = 0;
      setMouth(r);
      hat.visible = r === 'shocked';
      hat.position.y = 2.4;
    },
    walkIn() {
      walkT = 0;
      head.rotation.y = 0;
      yawTarget = 0;
    },
    update(dt) {
      // La poltrona gira con una molla morbida
      head.rotation.y += (yawTarget - head.rotation.y) * Math.min(1, dt * 7);

      walkT = Math.min(WALK_IN_S, walkT + dt);
      const w = 1 - walkT / WALK_IN_S;
      group.position.x = seat.x - w * w * 3.2;
      group.position.y = seat.y + Math.abs(Math.sin(walkT * 14)) * 0.06 * w;

      reactionT += dt;
      if (reaction === 'selfie' || reaction === 'happy') {
        group.position.y = seat.y + Math.abs(Math.sin(reactionT * 7)) * (reaction === 'selfie' ? 0.12 : 0.06);
      } else if (reaction === 'shocked') {
        hat.position.y = Math.max(1.05, hat.position.y - dt * 4);
        head.position.x = Math.sin(reactionT * 40) * 0.01 * Math.max(0, 1 - reactionT);
      } else if (reaction === 'puzzled' || reaction === 'awkward') {
        head.rotation.z = Math.sin(reactionT * 2.5) * 0.08;
      } else {
        head.rotation.z *= 0.9;
        head.position.x = 0;
      }
    },
    dispose() {
      hair.dispose();
      trash.forEach((d) => d.dispose());
    },
  };
}
