// Il cliente: un Piggy "peloso" seduto in poltrona con la mantellina (docs/games/barber.md § Set).
// È lo stesso piccione tondo degli altri giochi (games/shared/piggy-3d.ts, docs/07 § 6): collo
// cangiante che esce dalla mantellina, occhi con l'iride arancio, becco con la cera, zampette rosa
// sotto le ginocchia e ali nascoste sotto la mantellina che spuntano quando esulta.
// La testa è una sfera unitaria scalata a HEAD_RADIUS: i capelli sono i gusci di hair-shells.ts,
// la faccia (occhi con le palpebre, becco, guance) si gira con la testa. Le reazioni allo specchio
// sono sempre comiche, mai offensive (docs/11 § 6.1).

import * as THREE from 'three';
import {
  createPiggyBeakGeometry,
  createPiggyEyeGeometry,
  createPiggyFootGeometry,
  createPiggyWingGeometry,
  paintPiggyIridescent,
  paintPiggySolid,
  piggyWingRotation,
  PIGGY_CHEEK,
} from '../../shared/piggy-3d';
import { ACCENT } from './environment';
import { createHairShells, type HairShells } from './hair-shells';
import type { Reaction } from './rules';

export const HEAD_RADIUS = 0.36;
const WALK_IN_S = 0.9;
/** Scala delle parti del Piggy (alto 1) sulla testa unitaria: la testolina del Piggy ha raggio ~0.26. */
const FACE_SCALE = 1 / 0.26;
const NECK_Y = 0.97;
const NECK_H = 0.18;

export interface ClientLook {
  readonly hair: string;
  /** Piume del corpo e della testa (sotto i capelli). */
  readonly feathers: string;
}

export const CLIENT_LOOKS: readonly ClientLook[] = [
  { hair: '#5B3A29', feathers: '#7CC8FF' },
  { hair: '#2B2522', feathers: '#FFB38A' },
  { hair: '#C8642E', feathers: '#FFF6E8' },
  { hair: '#E5C07B', feathers: '#9B6B4E' },
  { hair: '#6C4BA8', feathers: '#C9A7FF' },
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

/** Orienta un oggetto sulla testa unitaria: `yaw` verso +x, `pitch` verso l'alto; +z guarda fuori. */
function placeOnHead(obj: THREE.Object3D, yaw: number, pitch: number, radius = 1): void {
  obj.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(radius);
  obj.rotation.set(-pitch, yaw, 0, 'YXZ');
}

export function createBarberClient(seat: THREE.Vector3): BarberClient {
  const group = new THREE.Group();
  group.position.copy(seat);
  const trash: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    trash.push(x);
    return x;
  };

  const featherMat = keep(new THREE.MeshStandardMaterial({ color: CLIENT_LOOKS[0]!.feathers, roughness: 0.4 }));
  const wingMat = keep(new THREE.MeshStandardMaterial({ color: CLIENT_LOOKS[0]!.feathers, roughness: 0.4, vertexColors: true }));
  const detailMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.4, vertexColors: true }));
  const capeMat = keep(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.6 }));

  // Corpo sotto la mantellina
  const cape = new THREE.Mesh(keep(new THREE.ConeGeometry(0.62, 0.95, 32, 1, true)), capeMat);
  cape.position.y = 0.42;
  cape.castShadow = true;
  group.add(cape);
  const collar = new THREE.Mesh(keep(new THREE.TorusGeometry(0.2, 0.045, 10, 28)), accentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = NECK_Y - NECK_H / 2 + 0.02;
  group.add(collar);
  // Collo cangiante del piccione: largo, quasi un tutt'uno col petto e la testolina
  const neckGeo = new THREE.CylinderGeometry(0.2, 0.23, NECK_H, 24, 4, true);
  const neck = new THREE.Mesh(keep(paintPiggyIridescent(neckGeo, -NECK_H / 2, NECK_H / 2)), detailMat);
  neck.position.y = NECK_Y;
  group.add(neck);
  const knees = new THREE.Mesh(keep(new THREE.SphereGeometry(0.3, 16, 12)), capeMat);
  knees.scale.set(1.3, 0.5, 1);
  knees.position.set(0, 0.05, 0.35);
  group.add(knees);
  // Zampette rosa che penzolano davanti alle ginocchia
  const footGeo = keep(createPiggyFootGeometry(2.2));
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(footGeo, detailMat);
    foot.position.set(side * 0.16, -0.12, 0.56);
    foot.rotation.set(0.5, side * 0.2, 0);
    group.add(foot);
  }

  // Ali nascoste sotto la mantellina: spuntano fuori solo nell'esultanza
  const WING_SCALE = 1.6;
  const wingGeo = keep(createPiggyWingGeometry());
  const wings = ([-1, 1] as const).map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.84, -0.02);
    pivot.scale.setScalar(WING_SCALE);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.castShadow = true;
    pivot.add(wing);
    group.add(pivot);
    return { pivot, side };
  });
  let wingsOpen = 0;
  const setWings = (open: number) => {
    for (const { pivot, side } of wings) {
      piggyWingRotation(side, open, pivot.rotation);
      // Ripiegate stanno dritte dentro la mantellina, senza bucarla
      pivot.rotation.z *= THREE.MathUtils.smoothstep(open, 0, 0.25);
      pivot.visible = open > 0.02;
    }
  };
  setWings(0);

  // Testa (sfera unitaria scalata)
  const head = new THREE.Group();
  head.position.y = NECK_Y + HEAD_RADIUS * 0.82;
  head.scale.setScalar(HEAD_RADIUS);
  group.add(head);
  const hair = createHairShells();
  head.add(hair.mesh);

  // Occhi da piccione, un poco di lato, con la palpebra del colore delle piume che fa l'espressione
  const eyeGeo = keep(createPiggyEyeGeometry(FACE_SCALE * 0.85));
  const lidGeo = keep(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const lids = [-1, 1].map((side) => {
    const socket = new THREE.Group();
    placeOnHead(socket, side * 0.42, 0.1, 0.97);
    socket.add(new THREE.Mesh(eyeGeo, detailMat));
    const lidPivot = new THREE.Group();
    const lid = new THREE.Mesh(lidGeo, featherMat);
    lid.scale.set(1, 1, 0.6);
    lidPivot.add(lid);
    socket.add(lidPivot);
    head.add(socket);
    return { pivot: lidPivot, side };
  });
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(keep(paintPiggySolid(new THREE.SphereGeometry(0.14, 12, 8).scale(1.2, 0.7, 0.3), PIGGY_CHEEK)), detailMat);
    placeOnHead(cheek, side * 0.8, -0.28, 0.98);
    head.add(cheek);
  }

  // Becco con la cera: chiuso, sorridente (socchiuso) o spalancato per lo spavento
  const beak = new THREE.Group();
  placeOnHead(beak, 0, -0.12, 0.94);
  beak.rotation.x += 0.12;
  const beaks = {
    closed: new THREE.Mesh(keep(createPiggyBeakGeometry(FACE_SCALE * 0.8, 0)), detailMat),
    smile: new THREE.Mesh(keep(createPiggyBeakGeometry(FACE_SCALE * 0.8, 0.45)), detailMat),
    open: new THREE.Mesh(keep(createPiggyBeakGeometry(FACE_SCALE * 0.8, 1)), detailMat),
  };
  beak.add(beaks.closed, beaks.smile, beaks.open);
  head.add(beak);

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

  const setFace = (r: Reaction | null) => {
    const shape = r === 'shocked' ? 'open' : r === 'selfie' || r === 'happy' ? 'smile' : 'closed';
    beaks.closed.visible = shape === 'closed';
    beaks.smile.visible = shape === 'smile';
    beaks.open.visible = shape === 'open';
    for (const { pivot, side } of lids) {
      // La palpebra scende sull'occhio (y) e si inclina (z): perplesso, imbarazzato, spalancato
      const tilt = r === 'puzzled' ? (side < 0 ? 0.35 : -0.1) : r === 'awkward' ? side * 0.25 : r === 'shocked' ? 0 : -side * 0.12;
      pivot.rotation.z = tilt;
      pivot.position.y = r === 'shocked' ? 0.21 : r === 'awkward' || r === 'puzzled' ? 0.06 : 0.12;
      pivot.visible = r !== 'selfie';
    }
  };
  setFace(null);

  return {
    group,
    head,
    hair,
    setLook(look) {
      featherMat.color.set(look.feathers);
      wingMat.color.set(look.feathers);
      hair.setColors(look.hair, look.feathers);
    },
    setYawTarget(yaw) {
      yawTarget = yaw;
    },
    setReaction(r) {
      reaction = r;
      reactionT = 0;
      setFace(r);
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
      let wingsTarget = 0;
      if (reaction === 'selfie' || reaction === 'happy') {
        const hop = Math.abs(Math.sin(reactionT * 7));
        group.position.y = seat.y + hop * (reaction === 'selfie' ? 0.12 : 0.06);
        // Esulta: le ali escono da sotto la mantellina e battono col saltello
        wingsTarget = (reaction === 'selfie' ? 0.75 : 0.5) + hop * 0.25;
      } else if (reaction === 'shocked') {
        hat.position.y = Math.max(1.05, hat.position.y - dt * 4);
        head.position.x = Math.sin(reactionT * 40) * 0.01 * Math.max(0, 1 - reactionT);
      } else if (reaction === 'puzzled' || reaction === 'awkward') {
        head.rotation.z = Math.sin(reactionT * 2.5) * 0.08;
      } else {
        head.rotation.z *= 0.9;
        head.position.x = 0;
      }
      wingsOpen += (wingsTarget - wingsOpen) * Math.min(1, dt * 10);
      setWings(wingsOpen);
    },
    dispose() {
      hair.dispose();
      trash.forEach((d) => d.dispose());
    },
  };
}
