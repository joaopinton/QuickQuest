// Terreno del golf: una griglia di quote (heightfield) a passo di 1 m, letta sugli stessi due
// triangoli per cella con cui è disegnata (terrain-mesh.ts), così la palla sta esattamente sul
// prato che si vede (docs/games/golf.md § Terreno). Senza Three.js: lo usano la fisica e la scena.
//
// La griglia si ricava dalla buca: colline e avvallamenti (gaussiane), tee piano, green su un
// piano inclinato, conche dei bunker e dei laghetti. Si calcola una volta per buca (cache).
import type { GolfHole, Point } from './rules';
import { OOB_BEHIND_TEE_M, OOB_HALF_WIDTH_M, OOB_PAST_GREEN_M } from './bounds';
import type { Pond } from './hazards';

/** Collina (altezza > 0) o avvallamento (altezza < 0) a campana. */
export interface Hill {
  readonly x: number;
  readonly y: number;
  readonly heightM: number;
  /** Raggio a cui la campana è scesa a circa un terzo. */
  readonly radiusM: number;
}

export interface Heightfield {
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** Quote per righe (y), da x0 a destra. */
  readonly heights: Float32Array;
}

export const TERRAIN_CELL_M = 1;
/** La griglia va un po' oltre i paletti; fuori il prato è piatto a quota 0. */
const GRID_MARGIN_X_M = 22;
const GRID_MARGIN_BACK_M = 15;
const GRID_MARGIN_FRONT_M = 15;
const FADE_M = 10;
const TEE_FLAT_M = 6;
const TEE_BLEND_M = 10;
const GREEN_BLEND_M = 6;
/** Pendenza del green (frazione) per ogni grado/m di `slopeDegPerM`. */
export const GREEN_GRADE_PER_SLOPE = 0.02;
const POND_DEPTH_M = 1.4;
/**
 * Il pelo dell'acqua sta a metà della conca: su terreno piano la riva cade proprio sull'ellisse
 * del laghetto (dove la conca è scesa a metà).
 */
const POND_WATER_BELOW_M = POND_DEPTH_M / 2;
/** Fin dove (in raggi del laghetto) arriva il piano dell'acqua disegnato, e quindi l'ostacolo. */
export const WATER_SHEET_SCALE = 1.3;
const BUNKER_DEPTH_M = 0.75;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hillsAt(hills: readonly Hill[], x: number, y: number): number {
  let h = 0;
  for (const k of hills) {
    const d2 = (x - k.x) ** 2 + (y - k.y) ** 2;
    const s2 = (k.radiusM * 0.6) ** 2;
    if (d2 < s2 * 16) h += k.heightM * Math.exp(-d2 / (2 * s2));
  }
  return h;
}

const pondQ = (w: Pond, x: number, y: number) => Math.sqrt(((x - w.x) / w.rx) ** 2 + ((y - w.y) / w.ry) ** 2);

/** Quota "vera" (prima della griglia) nel punto. */
function rawHeight(hole: GolfHole, x: number, y: number): number {
  const hills = hole.hills ?? [];
  let h = hillsAt(hills, x, y);
  // tee piano a quota 0
  h = lerp(h, 0, 1 - smoothstep(TEE_FLAT_M, TEE_FLAT_M + TEE_BLEND_M, Math.hypot(x, y)));
  // green: piano inclinato di lato (la palla "rompe" come prima col vecchio slopeDegPerM)
  const pinY = hole.lengthM;
  const greenBase = hillsAt(hills, 0, pinY);
  const grade = hole.slopeDegPerM * GREEN_GRADE_PER_SLOPE;
  const plane = greenBase - grade * x;
  h = lerp(h, plane, 1 - smoothstep(hole.greenRadiusM, hole.greenRadiusM + GREEN_BLEND_M, Math.hypot(x, y - pinY)));
  // laghetti: conca piana attorno, poi la buca d'acqua
  for (const w of hole.water ?? []) {
    const q = pondQ(w, x, y);
    if (q > 2) continue;
    h = lerp(h, hillsAt(hills, w.x, w.y), 1 - smoothstep(1, 1.8, q));
    h -= POND_DEPTH_M * (1 - smoothstep(0.7, 1.3, q));
  }
  for (const b of hole.bunkers) {
    const d = Math.hypot(x - b.x, y - b.y) / b.radiusM;
    if (d < 1.1) h -= BUNKER_DEPTH_M * (1 - smoothstep(0.5, 1.05, d));
  }
  // ai bordi della griglia si torna a quota 0
  const fx = 1 - smoothstep(OOB_HALF_WIDTH_M + GRID_MARGIN_X_M - FADE_M - 2, OOB_HALF_WIDTH_M + GRID_MARGIN_X_M - 2, Math.abs(x));
  const yLo = OOB_BEHIND_TEE_M - GRID_MARGIN_BACK_M;
  const yHi = hole.lengthM + OOB_PAST_GREEN_M + GRID_MARGIN_FRONT_M;
  const fy = smoothstep(yLo + 2, yLo + 2 + FADE_M, y) * (1 - smoothstep(yHi - 2 - FADE_M, yHi - 2, y));
  return h * fx * fy;
}

function buildField(hole: GolfHole): Heightfield {
  const cell = TERRAIN_CELL_M;
  const x0 = -(OOB_HALF_WIDTH_M + GRID_MARGIN_X_M);
  const y0 = OOB_BEHIND_TEE_M - GRID_MARGIN_BACK_M;
  const cols = Math.round((2 * -x0) / cell) + 1;
  const rows = Math.round((hole.lengthM + OOB_PAST_GREEN_M + GRID_MARGIN_FRONT_M - y0) / cell) + 1;
  const heights = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) heights[j * cols + i] = rawHeight(hole, x0 + i * cell, y0 + j * cell);
  }
  return { x0, y0, cell, cols, rows, heights };
}

const cache = new WeakMap<GolfHole, Heightfield>();

/** Griglia della buca (calcolata una volta). */
export function terrainOf(hole: GolfHole): Heightfield {
  let f = cache.get(hole);
  if (!f) {
    f = buildField(hole);
    cache.set(hole, f);
  }
  return f;
}

interface CellSample {
  readonly h00: number;
  readonly h10: number;
  readonly h01: number;
  readonly h11: number;
  readonly u: number;
  readonly v: number;
}

function cellAt(f: Heightfield, x: number, y: number): CellSample | null {
  const gx = (x - f.x0) / f.cell;
  const gy = (y - f.y0) / f.cell;
  if (gx < 0 || gy < 0 || gx >= f.cols - 1 || gy >= f.rows - 1) return null;
  const i = Math.floor(gx);
  const j = Math.floor(gy);
  const k = j * f.cols + i;
  return { h00: f.heights[k]!, h10: f.heights[k + 1]!, h01: f.heights[k + f.cols]!, h11: f.heights[k + f.cols + 1]!, u: gx - i, v: gy - j };
}

// Ogni cella è divisa lungo la diagonale (1,0)–(0,1), come in terrain-mesh.ts: sotto la
// diagonale il triangolo (00, 10, 01), sopra (10, 11, 01). Dentro un triangolo il terreno è piano.

/** Quota del terreno (m) nel punto; fuori dalla griglia 0. */
export function groundHeight(hole: GolfHole, p: Point): number {
  const c = cellAt(terrainOf(hole), p.x, p.y);
  if (!c) return 0;
  if (c.u + c.v <= 1) return c.h00 + (c.h10 - c.h00) * c.u + (c.h01 - c.h00) * c.v;
  return c.h11 + (c.h01 - c.h11) * (1 - c.u) + (c.h10 - c.h11) * (1 - c.v);
}

/** Pendenza del terreno: derivate della quota in x e in y (m/m), quelle del triangolo sotto il punto. */
export function groundGradient(hole: GolfHole, p: Point): Point {
  const f = terrainOf(hole);
  const c = cellAt(f, p.x, p.y);
  if (!c) return { x: 0, y: 0 };
  if (c.u + c.v <= 1) return { x: (c.h10 - c.h00) / f.cell, y: (c.h01 - c.h00) / f.cell };
  return { x: (c.h11 - c.h01) / f.cell, y: (c.h11 - c.h10) / f.cell };
}

/** Quota del pelo dell'acqua di un laghetto. */
export function waterLevel(hole: GolfHole, w: Pond): number {
  return hillsAt(hole.hills ?? [], w.x, w.y) - POND_WATER_BELOW_M;
}

/**
 * Il laghetto in cui il punto è sott'acqua, se c'è: dentro il piano dell'acqua disegnato e con il
 * terreno sotto il pelo. È la riva che si vede, quindi anche il confine dell'ostacolo.
 */
export function underwater(hole: GolfHole, p: Point): Pond | null {
  for (const w of hole.water ?? []) {
    if (pondQ(w, p.x, p.y) >= WATER_SHEET_SCALE) continue;
    if (groundHeight(hole, p) < waterLevel(hole, w)) return w;
  }
  return null;
}

/**
 * Colline della buca, col seme: montagnette ai lati del fairway, ondulazioni e avvallamenti
 * sul fairway, a volte un green rialzato e una conca davanti al green.
 */
export function makeHills(hole: GolfHole, rng: () => number, fairwayHalfWidthM: number): readonly Hill[] {
  const hills: Hill[] = [];
  const L = hole.lengthM;
  const sideCount = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < sideCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    hills.push({
      x: side * (fairwayHalfWidthM + 4 + rng() * 22),
      y: 15 + rng() * (L + 10),
      heightM: 1.5 + rng() * 3.5,
      radiusM: 10 + rng() * 14,
    });
  }
  const rolls = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < rolls; i++) {
    hills.push({
      x: (rng() * 2 - 1) * (fairwayHalfWidthM - 4),
      y: 30 + rng() * Math.max(10, L - 60),
      heightM: (rng() < 0.4 ? -1 : 1) * (0.5 + rng() * 1.3),
      radiusM: 8 + rng() * 12,
    });
  }
  if (rng() < 0.6) hills.push({ x: 0, y: L + 4, heightM: 0.8 + rng() * 1.8, radiusM: 22 + rng() * 10 });
  if (rng() < 0.5) hills.push({ x: (rng() * 2 - 1) * 8, y: L - hole.greenRadiusM - 8, heightM: -(0.6 + rng() * 0.8), radiusM: 6 + rng() * 4 });
  return hills;
}
