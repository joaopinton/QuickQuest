// Dal puntatore del telefono a un punto della testa (docs/games/barber.md § Gesto).
// Il telefono manda dove punta il suo retro, 0..1 (mira assoluta, packages/motion/aim). Qui lo si
// proietta sulla testa vista dalla telecamera (un po' dall'alto) e si tiene conto di quanto è
// girata la poltrona: è un raycast "logico" su una sfera, senza la scena 3D.
// Il puntatore è libero: può uscire dalla testa. Taglia solo dove tocca davvero i capelli.

import { targetLength, type Haircut } from '../shared/haircuts';
import { HEAD_SPAN, hairHeight, MAX_HAIR, type Vec3 } from '../shared/head';

/** La telecamera guarda la testa da sopra di circa 20°. */
export const VIEW_TILT = 0.36;
export { HEAD_SPAN };
/** Rapidità con cui il cursore insegue il telefono, 1/s. */
export const FOLLOW_RATE = 18;
/** Distanza (rad) a cui si guarda se si è vicini al bordo di una zona del taglio. */
const EDGE_PROBE = 0.12;
const RIM = 0.985;
/** Oltre questo raggio (in raggi della testa) non c'è nemmeno un capello da toccare. */
export const HAIR_REACH = 1 + MAX_HAIR;

export type ChairTurn = 0 | 1 | 2 | 3;

export interface Cursor {
  readonly x: number;
  readonly y: number;
}

export function turnChair(turn: ChairTurn, dir: 1 | -1): ChairTurn {
  return ((((turn + dir) % 4) + 4) % 4) as ChairTurn;
}

/** Rotazione della testa attorno alla verticale per un giro della poltrona. */
export function headYaw(turn: ChairTurn): number {
  return (-turn * Math.PI) / 2;
}

const CHAIR_VIEW_NAMES: Readonly<Record<ChairTurn, string>> = { 0: 'Fronte', 1: 'Lato destro', 2: 'Nuca', 3: 'Lato sinistro' };
export const chairViewName = (turn: ChairTurn): string => CHAIR_VIEW_NAMES[turn];

export interface ViewPoint {
  /** Coordinate sul piano della vista, in raggi della testa (0 = centro, +y in alto). */
  readonly sx: number;
  readonly sy: number;
}

/** Il puntatore sul piano della vista di lavoro, centrato sulla testa. */
export function pointerToView(p: Cursor): ViewPoint {
  return { sx: (p.x - 0.5) / HEAD_SPAN, sy: (0.5 - p.y) / HEAD_SPAN };
}

/**
 * Punto della testa (direzione nel riferimento della testa) sotto il puntatore, `null` se il
 * puntatore è fuori dalla testa e dai capelli. Appena fuori dalla cute si prende il bordo: lì i
 * capelli lunghi sporgono e si possono ancora toccare.
 */
export function pointerToDir(p: Cursor, turn: ChairTurn): Vec3 | null {
  let { sx, sy } = pointerToView(p);
  const r = Math.hypot(sx, sy);
  if (r > HAIR_REACH) return null;
  if (r > RIM) {
    sx *= RIM / r;
    sy *= RIM / r;
  }
  const sz = Math.sqrt(Math.max(0, 1 - sx * sx - sy * sy));

  // Telecamera dall'alto: il centro del puntatore cade sulla parte alta della fronte
  const ct = Math.cos(VIEW_TILT);
  const st = Math.sin(VIEW_TILT);
  const wy = sy * ct + sz * st;
  const wz = -sy * st + sz * ct;

  // Si annulla la rotazione della poltrona per tornare nel riferimento della testa
  const b = -headYaw(turn);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  return [sx * cb + wz * sb, wy, -sx * sb + wz * cb];
}

/**
 * Dove lo strumento tocca i capelli, `null` se è nel vuoto. Sulla cute tocca sempre; sul bordo
 * della testa tocca solo se i capelli lì sono abbastanza lunghi da arrivare al puntatore.
 */
export function pointerContact(p: Cursor, turn: ChairTurn, lengthAt: (d: Vec3) => number): Vec3 | null {
  const dir = pointerToDir(p, turn);
  if (!dir) return null;
  const { sx, sy } = pointerToView(p);
  const r = Math.hypot(sx, sy);
  return r <= 1 || r <= 1 + hairHeight(lengthAt(dir)) ? dir : null;
}

/** Il cursore insegue il telefono; `slow` < 1 lo frena (assist vicino ai bordi). */
export function followPointer(cur: Cursor, raw: Cursor, dt: number, slow = 1): Cursor {
  const k = Math.min(1, Math.max(0, dt) * FOLLOW_RATE * slow);
  return { x: cur.x + (raw.x - cur.x) * k, y: cur.y + (raw.y - cur.y) * k };
}

function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Il punto è vicino al confine tra due lunghezze del taglio richiesto? */
export function isNearCutEdge(cut: Haircut, d: Vec3): boolean {
  const here = targetLength(cut, d);
  const ref: Vec3 = Math.abs(d[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const t1 = normalize(cross(d, ref));
  const t2 = normalize(cross(d, t1));
  const probes: Vec3[] = [t1, t2, [-t1[0], -t1[1], -t1[2]], [-t2[0], -t2[1], -t2[2]]];
  return probes.some((t) => {
    const n = normalize([d[0] + t[0] * EDGE_PROBE, d[1] + t[1] * EDGE_PROBE, d[2] + t[2] * EDGE_PROBE]);
    return Math.abs(targetLength(cut, n) - here) > 0.05;
  });
}

/** Freno del cursore: `dwell` vicino ai bordi del taglio, 1 altrove. */
export function edgeSlowdown(cut: Haircut, d: Vec3, dwell: number): number {
  if (dwell >= 1) return 1;
  return isNearCutEdge(cut, d) ? dwell : 1;
}
