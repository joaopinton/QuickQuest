// Scena 3D del golf (Three.js), stile "Soft Toy" (docs/07): colline morbide, colori pieni,
// materiali toon e nessun asset esterno. Coordinate di gioco: x attraverso la buca, y verso la
// bandiera; in Three.js y di gioco diventa −z, e l'alto è +y.
import * as THREE from 'three';
import { FAIRWAY_HALF_WIDTH_M, type GolfHole } from './rules';

export interface BallView {
  readonly id: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  /** Altezza visiva sopra il terreno (m). */
  readonly height: number;
}

export interface GolfScene {
  setHole(hole: GolfHole): void;
  setBalls(balls: readonly BallView[]): void;
  /** Dove guarda la camera: la palla di chi tira, verso la bandiera. */
  follow(target: { x: number; y: number; height: number }, dt: number): void;
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const COLORS = {
  sky: 0xbfe6ff,
  rough: 0x5fb84a,
  fairway: 0x7ed957,
  green: 0x9be56f,
  sand: 0xf3dc9b,
  tee: 0x6ac24f,
  pole: 0xffffff,
  flag: 0xff5a5f,
  cup: 0x2d3a2f,
};

const BALL_RADIUS_VIS = 0.6; // le palle sono ingrandite: da 200 m una pallina vera è invisibile
const CAMERA_BACK_M = 14;
const CAMERA_UP_M = 6;

const toon = (color: number) => new THREE.MeshToonMaterial({ color });

function disc(radius: number, color: number, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), toon(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

export function createGolfScene(container: HTMLElement): GolfScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 180, 650);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6aa84f, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-60, 120, 40);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 1500);
  const lookAt = new THREE.Vector3();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000, 1, 1), toon(COLORS.rough));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // colline morbide ai lati: emisferi schiacciati, deterministici
  const hills = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(i % 3 === 0 ? 0x4fa83d : 0x58b445));
    const r = 30 + ((i * 37) % 40);
    hill.scale.set(r, r * 0.35, r);
    hill.position.set(side * (70 + ((i * 53) % 60)), 0, -i * 35 + 40);
    hills.add(hill);
  }
  scene.add(hills);

  const course = new THREE.Group();
  scene.add(course);
  const balls = new Map<string, THREE.Mesh>();
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS_VIS, 20, 14);

  const clearCourse = () => {
    for (const child of [...course.children]) {
      course.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  };

  return {
    setHole(hole) {
      clearCourse();
      const fairway = new THREE.Mesh(new THREE.PlaneGeometry(FAIRWAY_HALF_WIDTH_M * 2, hole.lengthM + 10), toon(COLORS.fairway));
      fairway.rotation.x = -Math.PI / 2;
      fairway.position.set(0, 0.02, -(hole.lengthM - 10) / 2);
      course.add(fairway);
      const green = disc(hole.greenRadiusM, COLORS.green, 0.04);
      green.position.z = -hole.lengthM;
      course.add(green);
      for (const b of hole.bunkers) {
        const sand = disc(b.radiusM, COLORS.sand, 0.06);
        sand.position.set(b.x, 0.06, -b.y);
        course.add(sand);
      }
      const tee = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), toon(COLORS.tee));
      tee.position.set(0, 0.15, 1);
      course.add(tee);
      const cup = disc(0.6, COLORS.cup, 0.07);
      cup.position.set(0, 0.07, -hole.lengthM);
      course.add(cup);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 10), toon(COLORS.pole));
      pole.position.set(0, 3, -hole.lengthM);
      course.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), new THREE.MeshToonMaterial({ color: COLORS.flag, side: THREE.DoubleSide }));
      flag.position.set(1.1, 5.2, -hole.lengthM);
      course.add(flag);
    },

    setBalls(views) {
      const seen = new Set<string>();
      for (const v of views) {
        seen.add(v.id);
        let mesh = balls.get(v.id);
        if (!mesh) {
          mesh = new THREE.Mesh(ballGeometry, toon(new THREE.Color(v.color).getHex()));
          balls.set(v.id, mesh);
          scene.add(mesh);
        }
        mesh.position.set(v.x, BALL_RADIUS_VIS + v.height, -v.y);
      }
      for (const [id, mesh] of balls) {
        if (seen.has(id)) continue;
        scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        balls.delete(id);
      }
    },

    follow(target, dt) {
      // dietro la palla, sulla linea verso la bandiera (che sta su x = 0, più avanti)
      const goal = new THREE.Vector3(target.x * 0.85, CAMERA_UP_M + target.height * 0.6, -target.y + CAMERA_BACK_M);
      const k = 1 - Math.exp(-dt * 3);
      camera.position.lerp(goal, k);
      lookAt.lerp(new THREE.Vector3(target.x * 0.5, target.height * 0.5, -target.y - 40), k);
      camera.lookAt(lookAt);
    },

    render() {
      renderer.render(scene, camera);
    },

    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    dispose() {
      clearCourse();
      for (const mesh of balls.values()) (mesh.material as THREE.Material).dispose();
      ballGeometry.dispose();
      hills.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
