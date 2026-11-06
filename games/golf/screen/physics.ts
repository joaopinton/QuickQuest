// Fisica della palla da golf (docs/games/golf.md § Fisica), senza Three.js.
// Coordinate: x a destra, y verso la bandiera, z in alto; metri e secondi.
// - In aria: gravità, resistenza dell'aria, effetto Magnus (backspin → portanza, sidespin →
//   curva) e vento.
// - Al contatto: rimbalzo sulla normale del terreno (pendenze comprese), con elasticità e
//   presa del terreno; il backspin frena la palla, il wedge "morde" e può tornare indietro.
// - Rotolando: la gravità spinge giù per le pendenze, l'erba frena; la palla si ferma solo se
//   la pendenza non basta a vincere l'attrito.
// - La buca è un foro vero, largo come quello disegnato (30 cm di raggio, una buca "da gioco"
//   in scala con la palla ingrandita): se la palla ci passa sopra non troppo veloce ci cade;
//   troppo veloce ci salta sopra o sbatte sul bordo ed esce (lip-out). In volo: piano dentro,
//   forte sbatte sulla parete dietro e schizza fuori.
import type { Club } from '../shared/clubs';
import { hazardAt, type Hazard } from './hazards';
import { distanceToPin, lieAt, pinOf, type GolfHole, type Lie, type Point } from './rules';
import { groundGradient, groundHeight } from './terrain';

export interface Flight {
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** rad/s: + backspin (la palla sale e frena all'atterraggio), − topspin. */
  readonly backspin: number;
  /** rad/s attorno alla verticale: + curva a sinistra (hook), − a destra (slice). */
  readonly sidespin: number;
  readonly airborne: boolean;
  /** Contatti col terreno finora. */
  readonly hops: number;
  readonly isPutt: boolean;
  /** Altezza della palla sopra il terreno (m), per la scena. */
  readonly heightM: number;
  /** Da quanto la palla è sopra il foro della buca (s). */
  readonly overCupS: number;
  readonly timeS: number;
}

export const G = 9.81;
export const BALL_RADIUS_M = 0.0214;
/** Raggio della buca, uguale per la fisica e per la scena (scene.ts). */
export const CUP_RADIUS_M = 0.3;
/**
 * Quanto deve "cadere" la palla sopra il foro per essere dentro: tarato perché al centro entri
 * fino a ~1,9 m/s; di striscio la corda è più corta e serve meno velocità.
 */
export const CAPTURE_DROP_M = 0.5;
/** In volo: sotto questa velocità orizzontale la palla che tocca dentro il foro ci resta. */
const DUNK_MAX_MS = 3;
/** In volo, troppo forte: quanta velocità resta dopo la parete e quanto schizza in alto. */
const CUP_WALL_KEEP = 0.45;
const CUP_WALL_POP = 0.25;
const AIR_DRAG = 0.0045; // ½ρ·Cd·A/m (1/m)
const MAGNUS = 0.0004; // ½ρ·A·r/m: a = k·ω×v
const LIFT_CAP = 0.0055; // portanza massima ≈ ½ρ·Cl,max·A/m · v²
const SPIN_DECAY_S = 8;
/** Gradi di inclinazione dell'asse di rotazione per grado di faccia: aperta = slice. */
const AXIS_TILT_PER_FACE = 1.6;
/** Sotto questa velocità d'uscita dal rimbalzo (m/s) la palla smette di saltare e rotola. */
const ROLL_BELOW_MS = 0.7;
const STOP_MS = 0.03;
const SLOW_ROLL_SHARE = 0.35;
const FAST_ROLL_MS = 4;
const MAX_FLIGHT_S = 45;
/** Quota del bordo oltre cui la palla sul foro sbatte sul bordo invece di passarci sopra. */
const LIP_DROP_SHARE = 0.4;
const LIP_SPEED_KEEP = 0.45;
const LIP_TURN_MAX_RAD = 1.1;

/** Come risponde il terreno. */
interface Surface {
  /** Elasticità a bassa velocità d'impatto; cala con impatti forti. */
  readonly bounce: number;
  /** Quanto della velocità lungo il terreno resta dopo un impatto pieno. */
  readonly grip: number;
  /** Quanto il backspin frena all'impatto (m/s per m/s di velocità al bordo della palla). */
  readonly spinBite: number;
  /** Frenata del rotolamento (m/s²). */
  readonly roll: number;
}
const SURFACE: Readonly<Record<Exclude<Lie, 'green'>, Surface>> = {
  tee: { bounce: 0.4, grip: 0.6, spinBite: 0.3, roll: 3.2 },
  fairway: { bounce: 0.4, grip: 0.6, spinBite: 0.3, roll: 3.2 },
  rough: { bounce: 0.22, grip: 0.35, spinBite: 0.12, roll: 6.5 },
  bunker: { bounce: 0.04, grip: 0.1, spinBite: 0.05, roll: 14 },
};
/** Frenata sul green = questo / velocità del green (green veloce = palla che corre). */
export const GREEN_ROLL_REF = 1.25;
const IMPACT_SOFTEN_MS = 8;

export function surfaceOf(hole: GolfHole, lie: Lie): Surface {
  if (lie === 'green') return { bounce: 0.3, grip: 0.3, spinBite: 0.7, roll: GREEN_ROLL_REF / hole.greenSpeed };
  return SURFACE[lie];
}

/** Lancio di ogni mazza: angolo verticale e backspin a piena velocità. */
const LAUNCH: Readonly<Record<Exclude<Club, 'putter'>, { readonly deg: number; readonly spin: number }>> = {
  driver: { deg: 12, spin: 270 },
  iron: { deg: 19, spin: 560 },
  wedge: { deg: 31, spin: 880 },
};
const LIE_SPIN: Readonly<Record<Lie, number>> = { tee: 1, fairway: 1, rough: 0.5, bunker: 0.7, green: 1 };

const DEG = Math.PI / 180;

interface Body {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  back: number;
  side: number;
}

/** Un passo in aria (Eulero semi-implicito). `wind` è l'aria che si muove verso +x. */
function airStep(b: Body, h: number, wind: number): void {
  const rx = b.vx - wind;
  const ry = b.vy;
  const rz = b.vz;
  const sp = Math.hypot(rx, ry, rz);
  let ax = -AIR_DRAG * sp * rx;
  let ay = -AIR_DRAG * sp * ry;
  let az = -AIR_DRAG * sp * rz - G;
  const hs = Math.hypot(rx, ry);
  if (sp > 1e-6 && hs > 1e-6) {
    // asse del backspin: orizzontale, a destra del moto; il sidespin è sulla verticale
    const wx = (ry / hs) * b.back;
    const wy = (-rx / hs) * b.back;
    const wz = b.side;
    let mx = MAGNUS * (wy * rz - wz * ry);
    let my = MAGNUS * (wz * rx - wx * rz);
    let mz = MAGNUS * (wx * ry - wy * rx);
    const m = Math.hypot(mx, my, mz);
    const cap = LIFT_CAP * sp * sp;
    if (m > cap) {
      mx *= cap / m;
      my *= cap / m;
      mz *= cap / m;
    }
    ax += mx;
    ay += my;
    az += mz;
  }
  b.vx += ax * h;
  b.vy += ay * h;
  b.vz += az * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
  const decay = Math.exp(-h / SPIN_DECAY_S);
  b.back *= decay;
  b.side *= decay;
}

export const FLIGHT_STEP = 1 / 120;

/** Volo su terreno piatto senza vento: dove tocca terra (m). Serve a tarare la velocità. */
function flatCarry(speed: number, launchDeg: number, backspin: number): number {
  const b: Body = { x: 0, y: 0, z: 0, vx: 0, vy: speed * Math.cos(launchDeg * DEG), vz: speed * Math.sin(launchDeg * DEG), back: backspin, side: 0 };
  for (let t = 0; t < MAX_FLIGHT_S; t += FLIGHT_STEP) {
    const py = b.y;
    const pz = b.z;
    airStep(b, FLIGHT_STEP, 0);
    if (b.z <= 0 && b.vz < 0) return py + (b.y - py) * (pz / (pz - b.z));
  }
  return b.y;
}

const speedCache = new Map<string, number>();

/** Velocità di lancio con cui la mazza vola `carryM` metri su terreno piatto. */
export function launchSpeedFor(club: Exclude<Club, 'putter'>, spinShare: number, carryM: number): number {
  const key = `${club}:${spinShare}:${carryM.toFixed(3)}`;
  const hit = speedCache.get(key);
  if (hit !== undefined) return hit;
  const { deg, spin } = LAUNCH[club];
  let lo = 1;
  let hi = 120;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (flatCarry(mid, deg, spin * spinShare) < carryM) lo = mid;
    else hi = mid;
  }
  const v = (lo + hi) / 2;
  if (speedCache.size > 2000) speedCache.clear();
  speedCache.set(key, v);
  return v;
}

export interface FullLaunch {
  readonly club: Exclude<Club, 'putter'>;
  readonly lie: Lie;
  readonly carryM: number;
  readonly headingDeg: number;
  readonly faceDeg: number;
}

/** Colpo pieno: velocità tarata sul carry, backspin della mazza, sidespin dalla faccia. */
export function launchFull(hole: GolfHole, from: Point, l: FullLaunch): Flight {
  const spinShare = LIE_SPIN[l.lie];
  const speed = launchSpeedFor(l.club, spinShare, Math.max(1, l.carryM));
  const { deg, spin } = LAUNCH[l.club];
  const back = spin * spinShare;
  const h = Math.cos(deg * DEG) * speed;
  return {
    z: groundHeight(hole, from),
    vx: Math.sin(l.headingDeg * DEG) * h,
    vy: Math.cos(l.headingDeg * DEG) * h,
    vz: Math.sin(deg * DEG) * speed,
    backspin: back,
    sidespin: -back * Math.tan(Math.min(60, l.faceDeg * AXIS_TILT_PER_FACE) * DEG),
    airborne: true,
    hops: 0,
    isPutt: false,
    heightM: 0,
    overCupS: 0,
    timeS: 0,
  };
}

/** Putt: palla che rotola, con la velocità che su un green piano la ferma dopo `distanceM`. */
export function launchPutt(hole: GolfHole, from: Point, headingDeg: number, distanceM: number): Flight {
  const speed = Math.sqrt(2 * surfaceOf(hole, 'green').roll * Math.max(0, distanceM));
  return {
    z: groundHeight(hole, from),
    vx: Math.sin(headingDeg * DEG) * speed,
    vy: Math.cos(headingDeg * DEG) * speed,
    vz: 0,
    backspin: 0,
    sidespin: 0,
    airborne: false,
    hops: 1,
    isPutt: true,
    heightM: 0,
    overCupS: 0,
    timeS: 0,
  };
}

export type BallOutcome =
  | { readonly kind: 'moving' }
  | { readonly kind: 'contact'; readonly lie: Lie; readonly at: Point; readonly hop: number }
  | { readonly kind: 'hazard'; readonly hazard: Hazard; readonly at: Point }
  | { readonly kind: 'holed' }
  | { readonly kind: 'rested' };

export interface BallStep {
  readonly ball: Point;
  readonly flight: Flight;
  readonly outcome: BallOutcome;
}

const bodyOf = (p: Point, f: Flight): Body => ({ x: p.x, y: p.y, z: f.z, vx: f.vx, vy: f.vy, vz: f.vz, back: f.backspin, side: f.sidespin });

function withBody(f: Flight, b: Body, patch: Partial<Flight>): Flight {
  return { ...f, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, backspin: b.back, sidespin: b.side, ...patch };
}

/**
 * Rimbalzo: la velocità si scompone sulla normale del terreno. La parte normale torna indietro
 * con l'elasticità (meno se l'impatto è forte), quella lungo il terreno perde presa e viene
 * frenata dal backspin. Restituisce se la palla da qui rotola.
 */
function bounce(hole: GolfHole, b: Body, lie: Lie): boolean {
  const s = surfaceOf(hole, lie);
  const g = groundGradient(hole, b);
  const nl = Math.hypot(g.x, g.y, 1);
  const nx = -g.x / nl;
  const ny = -g.y / nl;
  const nz = 1 / nl;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return false;
  const tx = b.vx - vn * nx;
  const ty = b.vy - vn * ny;
  const tz = b.vz - vn * nz;
  const vt = Math.hypot(tx, ty, tz);
  const impact = -vn;
  const steep = Math.min(1, impact / Math.max(1e-6, Math.hypot(impact, vt)));
  const e = s.bounce / (1 + impact / IMPACT_SOFTEN_MS);
  // impatto pieno: più ripido, più la palla perde velocità lungo il terreno
  const keep = 1 - (1 - s.grip) * Math.min(1, steep * 1.6 + 0.3);
  let vtNew = vt * keep - s.spinBite * Math.max(0, b.back) * BALL_RADIUS_M * Math.min(1, impact / 4);
  vtNew = Math.max(-0.25 * vt, vtNew); // col tanto backspin torna un po' indietro
  const k = vt > 1e-6 ? vtNew / vt : 0;
  const out = e * impact;
  b.vx = tx * k + nx * out;
  b.vy = ty * k + ny * out;
  b.vz = tz * k + nz * out;
  b.back *= 0.45;
  b.side = 0;
  return out < ROLL_BELOW_MS;
}

/** Dove tocca terra un colpo (primo contatto), con terreno e vento veri. */
export function firstContact(hole: GolfHole, from: Point, f: Flight): Point {
  const b = bodyOf(from, f);
  for (let t = 0; t < MAX_FLIGHT_S; t += FLIGHT_STEP) {
    const px = b.x;
    const py = b.y;
    const above = b.z - groundHeight(hole, b);
    airStep(b, FLIGHT_STEP, hole.wind);
    const now = b.z - groundHeight(hole, b);
    if (now <= 0 && b.vz < 0) {
      const k = above / Math.max(1e-9, above - now);
      return { x: px + (b.x - px) * k, y: py + (b.y - py) * k };
    }
  }
  return { x: b.x, y: b.y };
}

function airborneStep(hole: GolfHole, ball: Point, f: Flight, h: number): BallStep {
  const b = bodyOf(ball, f);
  const above = f.z - groundHeight(hole, ball);
  airStep(b, h, hole.wind);
  const ground = groundHeight(hole, b);
  const now = b.z - ground;
  const timeS = f.timeS + h;
  if (now > 0 || b.vz >= 0) {
    const z = Math.max(b.z, ground);
    return { ball: { x: b.x, y: b.y }, flight: withBody(f, { ...b, z }, { heightM: Math.max(0, now), timeS }), outcome: { kind: 'moving' } };
  }
  // contatto: si torna al punto esatto in cui la traiettoria incrocia il terreno
  const k = above / Math.max(1e-9, above - now);
  b.x = ball.x + (b.x - ball.x) * k;
  b.y = ball.y + (b.y - ball.y) * k;
  b.z = groundHeight(hole, b);
  const at = { x: b.x, y: b.y };
  const hazard = hazardAt(hole, at);
  if (hazard) return { ball: at, flight: withBody(f, b, { heightM: 0, timeS }), outcome: { kind: 'hazard', hazard, at } };
  const lie = lieAt(hole, at);
  if (hole.greenRadiusM > 0 && distanceToPin(hole, at) < CUP_RADIUS_M) {
    const hs = Math.hypot(b.vx, b.vy);
    if (hs <= DUNK_MAX_MS) return { ball: pinOf(hole), flight: withBody(f, b, { heightM: 0, timeS }), outcome: { kind: 'holed' } };
    return cupWall(hole, f, b, hs, timeS);
  }
  const rolls = bounce(hole, b, lie);
  const hop = f.hops;
  const flight = withBody(f, b, { airborne: !rolls, hops: f.hops + 1, heightM: 0, timeS, vz: rolls ? 0 : b.vz });
  return { ball: at, flight, outcome: { kind: 'contact', lie, at, hop } };
}

/**
 * Palla che entra in volo nel foro troppo forte: sbatte sulla parete dietro e schizza fuori in
 * alto, più lenta, dal bordo opposto a dove è entrata.
 */
function cupWall(hole: GolfHole, f: Flight, b: Body, hs: number, timeS: number): BallStep {
  const pin = pinOf(hole);
  const ux = b.vx / hs;
  const uy = b.vy / hs;
  const out = { x: pin.x + ux * CUP_RADIUS_M * 1.05, y: pin.y + uy * CUP_RADIUS_M * 1.05 };
  const z = groundHeight(hole, out);
  const flight: Flight = {
    ...f,
    z,
    vx: b.vx * CUP_WALL_KEEP,
    vy: b.vy * CUP_WALL_KEEP,
    vz: hs * CUP_WALL_POP,
    backspin: 0,
    sidespin: 0,
    airborne: true,
    hops: f.hops + 1,
    heightM: 0,
    timeS,
  };
  return { ball: out, flight, outcome: { kind: 'contact', lie: 'green', at: out, hop: f.hops } };
}

/** Lip-out: la palla sbatte sul bordo, gira e perde velocità. */
function lipOut(ball: Point, pin: Point, vx: number, vy: number): { vx: number; vy: number } {
  const ox = ball.x - pin.x;
  const oy = ball.y - pin.y;
  const sp = Math.hypot(vx, vy);
  // da che lato del centro è passata: gira da quella parte, di più se è passata di striscio
  const cross = (vx * oy - vy * ox) / Math.max(1e-9, sp * Math.hypot(ox, oy));
  const turn = -Math.sign(cross || 1) * LIP_TURN_MAX_RAD * (0.4 + 0.6 * Math.min(1, Math.abs(cross) * 2));
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return { vx: (vx * c - vy * s) * LIP_SPEED_KEEP, vy: (vx * s + vy * c) * LIP_SPEED_KEEP };
}

function rollingStep(hole: GolfHole, ball: Point, f: Flight, h: number): BallStep {
  const lie = lieAt(hole, ball);
  const s = surfaceOf(hole, lie);
  const g = groundGradient(hole, ball);
  // palla piena che rotola senza strisciare: 5/7 della gravità lungo la pendenza
  const slope = (5 / 7) * G / (1 + g.x * g.x + g.y * g.y);
  const gx = -slope * g.x;
  const gy = -slope * g.y;
  const pull = Math.hypot(gx, gy);
  let vx = f.vx + gx * h;
  let vy = f.vy + gy * h;
  const sp = Math.hypot(vx, vy);
  // l'erba frena di più la palla veloce (salta tra i fili); piano piano frena meno, così su
  // una pendenza vera la palla riparte a valle. Sul green la frenata è costante (putt misurabili).
  const roll = lie === 'green' ? s.roll : s.roll * (SLOW_ROLL_SHARE + (1 - SLOW_ROLL_SHARE) * Math.min(1, sp / FAST_ROLL_MS));
  const slowed = Math.max(0, sp - roll * h);
  vx = sp > 0 ? (vx / sp) * slowed : 0;
  vy = sp > 0 ? (vy / sp) * slowed : 0;
  const timeS = f.timeS + h;
  const next = { x: ball.x + vx * h, y: ball.y + vy * h };
  const hazard = hazardAt(hole, next);
  const base = { ...f, vx, vy, vz: 0, z: groundHeight(hole, next), heightM: 0, timeS, backspin: 0, sidespin: 0 };
  if (hazard) return { ball: next, flight: base, outcome: { kind: 'hazard', hazard, at: next } };

  // la buca: sopra il foro la palla cade; se ci resta abbastanza è dentro
  const pin = pinOf(hole);
  if (hole.greenRadiusM > 0 && distanceToPin(hole, next) < CUP_RADIUS_M) {
    const overCupS = f.overCupS + h;
    if (0.5 * G * overCupS * overCupS >= CAPTURE_DROP_M) return { ball: pin, flight: { ...base, overCupS }, outcome: { kind: 'holed' } };
    return { ball: next, flight: { ...base, overCupS }, outcome: { kind: 'moving' } };
  }
  if (f.overCupS > 0) {
    const drop = 0.5 * G * f.overCupS * f.overCupS;
    const out = drop > LIP_DROP_SHARE * CAPTURE_DROP_M ? lipOut(next, pin, vx, vy) : { vx, vy };
    return { ball: next, flight: { ...base, ...out, overCupS: 0 }, outcome: { kind: 'moving' } };
  }
  // ferma solo se la pendenza non vince l'attrito dell'erba
  if ((slowed <= STOP_MS && pull <= roll) || timeS > MAX_FLIGHT_S) {
    return { ball: next, flight: { ...base, vx: 0, vy: 0 }, outcome: { kind: 'rested' } };
  }
  return { ball: next, flight: base, outcome: { kind: 'moving' } };
}

/** Un passo fisso della palla. */
export function stepBall(hole: GolfHole, ball: Point, f: Flight, h: number): BallStep {
  return f.airborne ? airborneStep(hole, ball, f, h) : rollingStep(hole, ball, f, h);
}
