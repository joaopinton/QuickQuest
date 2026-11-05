// Scena 3D del golf (Three.js), stile "Soft Toy" (docs/07): colline morbide, colori pieni,
// materiali toon e nessun asset esterno. Coordinate di gioco: x attraverso la buca, y verso la
// bandiera; in Three.js y di gioco diventa −z, e l'alto è +y.
// Il prato è la griglia di quote di terrain.ts (terrain-mesh.ts), con la buca come foro vero;
// palle, bandiera, acqua e paletti stanno alla quota del terreno sotto di loro.
import * as THREE from 'three';
import { createGolfFx } from './fx';
import { OOB_BEHIND_TEE_M, OOB_HALF_WIDTH_M, OOB_PAST_GREEN_M, inPond, type Hazard, type Pond } from './hazards';
import { pinOf, type GolfHole, type Lie, type Point } from './rules';
import { groundHeight, waterLevel } from './terrain';
import { buildTerrainMesh } from './terrain-mesh';

export type BallState = 'play' | 'holed' | 'gone';

export interface BallView {
  readonly id: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  /** Altezza visiva sopra il terreno (m). */
  readonly height: number;
  /** `holed`: la palla cade nella buca; `gone`: raccolta, non si vede più. */
  readonly state: BallState;
  /** In volo o che rotola: lascia la scia. */
  readonly isMoving: boolean;
}

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  /** Palla in volo o che rotola: la camera non gira finché non si ferma. */
  readonly isMoving: boolean;
}

export interface GolfScene {
  setHole(hole: GolfHole): void;
  setBalls(balls: readonly BallView[], dt: number): void;
  /** La camera sta dietro la palla e guarda sempre verso la buca, anche se la palla l'ha superata. */
  follow(target: CameraTarget, dt: number): void;
  /** Contatto col terreno (atterraggio o rimbalzo): sbuffo d'erba o di sabbia. */
  puff(at: Point, lie: Lie, hop: number): void;
  /** Cerchio di mira: dove cade la mazza scelta a piena potenza; `null` lo nasconde. */
  setAim(at: Point | null, color: string): void;
  /** Acqua o fuori limite: spruzzo (o sbuffo), la palla sparisce un attimo e ricompare al drop. */
  penalty(id: string, at: Point, hazard: Hazard): void;
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const COLORS = {
  sky: 0xbfe6ff,
  tee: 0x6ac24f,
  pole: 0xffffff,
  flag: 0xff5a5f,
  cup: 0x1f2a22,
  rim: 0xffffff,
  water: 0x48b2f0,
  waterEdge: 0xbfe9ff,
  outOfBounds: 0x4b9640,
  stake: 0xffffff,
};

const BALL_RADIUS_VIS = 0.6; // le palle sono ingrandite: da 200 m una pallina vera è invisibile
const CUP_RADIUS_VIS = 0.95; // buca in scala con la palla ingrandita
const CUP_DEPTH = 1.8;
const POLE_HEIGHT = 6;
const FLAG_LIFT_M = 3.2; // la bandiera si alza per far entrare la palla
const FLAG_LIFT_NEAR_M = 3;
const FLAG_WAVE_HZ = 1.6;
const FLAG_WAVE_PER_MS = 0.07; // più vento, più sventola
const GROUND_HALF = 1000;
const STAKE_SPACING_M = 15;
const STAKE_HEIGHT = 1.8;
/** Dopo l'ostacolo la palla resta nascosta, poi ricompare dove si droppa. */
const PENALTY_HIDE_S = 1.3;

// caduta in buca: la palla scivola al centro, poi giù con un piccolo rimbalzo sul fondo
const SINK_SLIDE_S = 0.16;
const SINK_GRAVITY = 26;
const SINK_BOUNCE = 0.28;
const RIPPLE_S = 0.55;
const FLAG_DOWN_AFTER_S = 1.4;

// camera: dietro la palla, sulla linea palla → buca
const CAM_TURN_RATE = 2.4;
const CAM_FOLLOW_RATE = 4;
const CAM_BACK_MIN = 6;
const CAM_BACK_MAX = 15;
const CAM_UP_MIN = 2.6;
const CAM_UP_MAX = 7;
const CAM_LOOK_AHEAD_MAX = 40;
const CAM_SNAP_M = 80;
const AIM_MIN_DIST_M = 0.8;
const CAM_GROUND_CLEAR_M = 1.5;

const toon = (color: number) => new THREE.MeshToonMaterial({ color });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);
/** Differenza d'angolo più corta, in (−π, π]. */
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function circlePath(path: THREE.Path, x: number, y: number, r: number): THREE.Path {
  path.absarc(x, y, r, 0, Math.PI * 2, false);
  return path;
}

/** Superficie piatta in coordinate di gioco, con un foro opzionale (la buca). */
function flat(shape: THREE.Shape, color: number, lift: number, hole?: Point & { readonly r: number }): THREE.Mesh {
  if (hole) shape.holes.push(circlePath(new THREE.Path(), hole.x, hole.y, hole.r));
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), toon(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = lift;
  return mesh;
}

function circleShape(x: number, y: number, r: number): THREE.Shape {
  return circlePath(new THREE.Shape(), x, y, r) as THREE.Shape;
}

function ellipseShape(w: Pond, grow = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(w.x, w.y, w.rx + grow, w.ry + grow, 0, Math.PI * 2, false, 0);
  return s;
}

/** Paletti bianchi del fuori limite ai lati e dietro il green, piantati nel terreno. */
function addStakes(course: THREE.Group, hole: GolfHole) {
  const back = hole.lengthM + OOB_PAST_GREEN_M;
  const stakeAt = (x: number, y: number) => {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, STAKE_HEIGHT, 8), toon(COLORS.stake));
    stake.position.set(x, groundHeight(hole, { x, y }) + STAKE_HEIGHT / 2, -y);
    course.add(stake);
  };
  for (let y = OOB_BEHIND_TEE_M; y <= back; y += STAKE_SPACING_M) {
    stakeAt(-OOB_HALF_WIDTH_M, y);
    stakeAt(OOB_HALF_WIDTH_M, y);
  }
  for (let x = -OOB_HALF_WIDTH_M + STAKE_SPACING_M; x < OOB_HALF_WIDTH_M; x += STAKE_SPACING_M) stakeAt(x, back);
}

function rectShape(x0: number, y0: number, x1: number, y1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  return s;
}

interface BallRecord {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  /** Secondi dall'inizio della caduta in buca; `null` se la palla è in gioco. */
  sinkT: number | null;
  sinkFrom: THREE.Vector3;
  /** Secondi in cui la palla resta nascosta dopo l'ostacolo. */
  hiddenFor: number;
}

interface Ripple {
  readonly mesh: THREE.Mesh;
  t: number;
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
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

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 1500);

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
  const flag = new THREE.Group(); // asta e bandierina: si alzano insieme
  let pin: Point = { x: 0, y: 0 };
  let currentHole: GolfHole | null = null;
  /** Quota del terreno sotto un punto di gioco. */
  const ground = (x: number, y: number) => (currentHole ? groundHeight(currentHole, { x, y }) : 0);
  let cupGround = 0;
  let flagLift = 0;
  let cloth: THREE.Mesh | null = null;
  let wind = 0;
  let clock = 0;
  const fx = createGolfFx(scene, ground);

  const balls = new Map<string, BallRecord>();
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS_VIS, 20, 14);
  const shadowGeometry = new THREE.CircleGeometry(BALL_RADIUS_VIS * 1.1, 24);
  const ripples: Ripple[] = [];
  const rippleGeometry = new THREE.RingGeometry(CUP_RADIUS_VIS, CUP_RADIUS_VIS + 0.25, 40);

  // camera: stato smorzato, così si gira attorno alla palla invece di tagliare il campo
  const cam = { heading: 0, back: CAM_BACK_MAX, up: CAM_UP_MAX, focus: new THREE.Vector3(), look: new THREE.Vector3(), needsSnap: true };

  const clearCourse = () => {
    for (const child of [...course.children]) {
      course.remove(child);
      disposeTree(child);
    }
  };

  const spawnRipple = () => {
    const mesh = new THREE.Mesh(rippleGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pin.x, cupGround + 0.1, -pin.y);
    scene.add(mesh);
    ripples.push({ mesh, t: 0 });
  };

  const updateRipples = (dt: number) => {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]!;
      r.t += dt;
      const p = Math.min(1, r.t / RIPPLE_S);
      r.mesh.scale.setScalar(1 + p * 2.2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
      if (p >= 1) {
        scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        ripples.splice(i, 1);
      }
    }
  };

  /** Caduta in buca: scivola al centro, cade, rimbalza piano sul fondo. */
  const placeSinking = (rec: BallRecord, dt: number) => {
    const before = rec.sinkT ?? 0;
    const wasFalling = before >= SINK_SLIDE_S;
    const t = before + dt;
    rec.sinkT = t;
    const cx = pin.x;
    const cz = -pin.y;
    if (t < SINK_SLIDE_S) {
      const k = t / SINK_SLIDE_S;
      rec.mesh.position.set(
        THREE.MathUtils.lerp(rec.sinkFrom.x, cx, k),
        THREE.MathUtils.lerp(rec.sinkFrom.y, cupGround + BALL_RADIUS_VIS, k),
        THREE.MathUtils.lerp(rec.sinkFrom.z, cz, k),
      );
      return;
    }
    if (!wasFalling) spawnRipple();
    const ft = t - SINK_SLIDE_S;
    const top = cupGround + BALL_RADIUS_VIS;
    const floor = cupGround - CUP_DEPTH + BALL_RADIUS_VIS;
    const fallS = Math.sqrt((2 * (top - floor)) / SINK_GRAVITY);
    let y: number;
    if (ft < fallS) {
      y = top - 0.5 * SINK_GRAVITY * ft * ft;
    } else {
      // un rimbalzo smorzato sul fondo della buca
      const bt = ft - fallS;
      const v0 = SINK_GRAVITY * fallS * SINK_BOUNCE;
      y = Math.max(floor, floor + v0 * bt - 0.5 * SINK_GRAVITY * bt * bt);
    }
    const wobble = Math.max(0, 1 - ft * 3) * 0.12 * Math.sin(ft * 40);
    rec.mesh.position.set(cx + wobble, y, cz);
  };

  return {
    setHole(hole) {
      clearCourse();
      currentHole = hole;
      pin = pinOf(hole);
      cupGround = groundHeight(hole, pin);
      // fuori dalla griglia: prato del fuori limite, piatto
      course.add(flat(rectShape(-GROUND_HALF, -GROUND_HALF, GROUND_HALF, GROUND_HALF), COLORS.outOfBounds, -0.03));
      course.add(buildTerrainMesh(hole, CUP_RADIUS_VIS));
      for (const w of hole.water ?? []) {
        const level = waterLevel(hole, w);
        // il pelo dell'acqua copre la conca fin dove il terreno sale sopra
        course.add(flat(ellipseShape(w, Math.max(w.rx, w.ry) * 0.12 + 0.9), COLORS.waterEdge, level - 0.01));
        course.add(flat(ellipseShape(w, Math.max(w.rx, w.ry) * 0.12), COLORS.water, level));
      }
      addStakes(course, hole);
      const tee = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), toon(COLORS.tee));
      tee.position.set(0, 0.15, 1);
      course.add(tee);

      // la buca: un cilindro scuro aperto, con fondo e bordo bianco, nel foro del prato
      const cupWall = new THREE.Mesh(
        new THREE.CylinderGeometry(CUP_RADIUS_VIS, CUP_RADIUS_VIS, CUP_DEPTH, 40, 1, true),
        new THREE.MeshToonMaterial({ color: COLORS.cup, side: THREE.BackSide }),
      );
      cupWall.position.set(pin.x, cupGround - CUP_DEPTH / 2 + 0.3, -pin.y);
      course.add(cupWall);
      course.add(flat(circleShape(pin.x, pin.y, CUP_RADIUS_VIS), COLORS.cup, cupGround - CUP_DEPTH + 0.3));
      course.add(flat(circleShape(pin.x, pin.y, CUP_RADIUS_VIS + 0.12), COLORS.rim, cupGround + 0.05, { ...pin, r: CUP_RADIUS_VIS }));

      flag.clear();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, POLE_HEIGHT, 10), toon(COLORS.pole));
      pole.position.y = POLE_HEIGHT / 2;
      // la bandierina è imperniata sull'asta e punta dove tira il vento
      const clothGeometry = new THREE.PlaneGeometry(2.2, 1.4);
      clothGeometry.translate(1.1, 0, 0);
      cloth = new THREE.Mesh(clothGeometry, new THREE.MeshToonMaterial({ color: COLORS.flag, side: THREE.DoubleSide }));
      cloth.position.set(0, POLE_HEIGHT - 0.8, 0);
      wind = hole.wind;
      cloth.rotation.y = wind < 0 ? Math.PI : 0;
      flag.add(pole, cloth);
      flag.position.set(pin.x, cupGround, -pin.y);
      course.add(flag);
      flagLift = 0;
      fx.clearTrails();
      fx.setAim(null, '#ffffff');
      cam.needsSnap = true;
    },

    setBalls(views, dt) {
      const seen = new Set<string>();
      let wantsFlagOut = false;
      for (const v of views) {
        seen.add(v.id);
        let rec = balls.get(v.id);
        if (!rec) {
          const mesh = new THREE.Mesh(ballGeometry, toon(new THREE.Color(v.color).getHex()));
          const shadow = new THREE.Mesh(shadowGeometry, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
          shadow.rotation.x = -Math.PI / 2;
          rec = { mesh, shadow, sinkT: null, sinkFrom: new THREE.Vector3(), hiddenFor: 0 };
          balls.set(v.id, rec);
          scene.add(mesh, shadow);
        }
        rec.hiddenFor = Math.max(0, rec.hiddenFor - dt);
        rec.mesh.visible = v.state !== 'gone' && rec.hiddenFor === 0;
        const g = ground(v.x, v.y);
        fx.trail(v.id, v.color, new THREE.Vector3(v.x, g + BALL_RADIUS_VIS + v.height, -v.y), v.isMoving && v.state === 'play');
        rec.shadow.visible = v.state === 'play' && rec.hiddenFor === 0;
        if (v.state === 'holed') {
          if (rec.sinkT === null) {
            rec.sinkT = 0;
            rec.sinkFrom.copy(rec.mesh.position);
          }
          placeSinking(rec, dt);
          if ((rec.sinkT ?? 0) < FLAG_DOWN_AFTER_S) wantsFlagOut = true;
          continue;
        }
        rec.sinkT = null;
        rec.mesh.position.set(v.x, g + BALL_RADIUS_VIS + v.height, -v.y);
        // l'ombra resta a terra e si allarga (e sbiadisce) quando la palla sale
        rec.shadow.position.set(v.x, g + 0.12, -v.y);
        rec.shadow.scale.setScalar(1 + v.height * 0.04);
        (rec.shadow.material as THREE.MeshBasicMaterial).opacity = 0.22 / (1 + v.height * 0.08);
        if (v.state === 'play' && v.height === 0 && Math.hypot(v.x - pin.x, v.y - pin.y) < FLAG_LIFT_NEAR_M) wantsFlagOut = true;
      }
      for (const [id, rec] of balls) {
        if (seen.has(id)) continue;
        scene.remove(rec.mesh, rec.shadow);
        (rec.mesh.material as THREE.Material).dispose();
        (rec.shadow.material as THREE.Material).dispose();
        balls.delete(id);
        fx.dropTrail(id);
      }
      flagLift = THREE.MathUtils.lerp(flagLift, wantsFlagOut ? FLAG_LIFT_M : 0, ease(6, dt));
      flag.position.y = cupGround + flagLift;
      updateRipples(dt);
      clock += dt;
      if (cloth) {
        const base = wind < 0 ? Math.PI : 0;
        cloth.rotation.y = base + Math.sin(clock * Math.PI * 2 * FLAG_WAVE_HZ) * Math.min(0.5, 0.08 + Math.abs(wind) * FLAG_WAVE_PER_MS);
      }
      fx.update(dt);
    },

    puff(at, lie, hop) {
      // il primo impatto è il più forte, i rimbalzi dopo sono più piccoli
      fx.puff(at, lie, hop === 0 ? 1 : 0.5);
    },

    setAim(at, color) {
      fx.setAim(at, color);
    },

    penalty(id, at, hazard) {
      const pond = currentHole?.water?.find((w) => inPond(w, at));
      if (hazard === 'water') fx.splash(at, pond && currentHole ? waterLevel(currentHole, pond) : ground(at.x, at.y));
      else fx.puff(at, 'rough', 1);
      const rec = balls.get(id);
      if (rec) rec.hiddenFor = PENALTY_HIDE_S;
    },

    follow(target, dt) {
      const dx = pin.x - target.x;
      const dy = pin.y - target.y;
      const dist = Math.hypot(dx, dy);
      // la direzione si aggiorna solo a palla ferma: in volo si resta sulla linea del colpo,
      // poi la camera gira attorno alla palla e torna a guardare la buca (anche da oltre)
      const aimHeading = !target.isMoving && dist > AIM_MIN_DIST_M ? Math.atan2(dx, dy) : cam.heading;
      const back = clamp(4 + dist * 0.35, CAM_BACK_MIN, CAM_BACK_MAX);
      const up = clamp(2 + dist * 0.12, CAM_UP_MIN, CAM_UP_MAX) + target.height * 0.6;
      const lookAhead = target.isMoving ? CAM_LOOK_AHEAD_MAX * 0.75 : Math.min(dist * 0.6, CAM_LOOK_AHEAD_MAX);
      const g = ground(target.x, target.y);
      const focus = new THREE.Vector3(target.x, g + target.height * 0.5, -target.y);

      const snap = cam.needsSnap || cam.focus.distanceTo(focus) > CAM_SNAP_M;
      cam.needsSnap = false;
      const kTurn = snap ? 1 : ease(CAM_TURN_RATE, dt);
      const kFollow = snap ? 1 : ease(CAM_FOLLOW_RATE, dt);
      if (snap && dist > AIM_MIN_DIST_M) cam.heading = Math.atan2(dx, dy);
      else cam.heading += angleDelta(cam.heading, aimHeading) * kTurn;
      cam.back = THREE.MathUtils.lerp(cam.back, back, kFollow);
      cam.up = THREE.MathUtils.lerp(cam.up, up, kFollow);
      cam.focus.lerp(focus, kFollow);

      const dir = new THREE.Vector3(Math.sin(cam.heading), 0, -Math.cos(cam.heading));
      camera.position.copy(cam.focus).addScaledVector(dir, -cam.back);
      // la camera sta sopra la palla e non entra mai nelle colline
      camera.position.y = Math.max(cam.focus.y - target.height * 0.5 + cam.up, ground(camera.position.x, -camera.position.z) + CAM_GROUND_CLEAR_M);
      const look = cam.focus.clone().addScaledVector(dir, lookAhead);
      look.y = ground(look.x, -look.z) * 0.5 + g * 0.5 + target.height * 0.5;
      if (snap) cam.look.copy(look);
      else cam.look.lerp(look, kFollow);
      camera.lookAt(cam.look);
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
      fx.dispose();
      for (const rec of balls.values()) {
        (rec.mesh.material as THREE.Material).dispose();
        (rec.shadow.material as THREE.Material).dispose();
      }
      for (const r of ripples) (r.mesh.material as THREE.Material).dispose();
      ballGeometry.dispose();
      shadowGeometry.dispose();
      rippleGeometry.dispose();
      disposeTree(hills);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
