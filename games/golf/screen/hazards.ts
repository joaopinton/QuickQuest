// Ostacoli del golf: acqua e fuori limite (docs/games/golf.md § Acqua e fuori limite).
// Solo geometria e regole di drop, senza Three.js: le usano le regole e la scena.
// Regole, semplificate dal golf vero:
// - acqua: +1 colpo, si droppa fuori dall'acqua sulla linea verso il punto di partenza;
// - fuori limite (paletti bianchi): +1 colpo e si ritira da dove si era tirato.
import type { Bunker, GolfHole, Point } from './rules';

export type Hazard = 'water' | 'oob';

/** Laghetto ellittico, assi allineati al campo. */
export interface Pond {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/** Paletti bianchi ai lati: oltre questo |x| si è fuori limite. */
export const OOB_HALF_WIDTH_M = 48;
/** Fuori limite dietro il tee e oltre il green. */
export const OOB_BEHIND_TEE_M = -20;
export const OOB_PAST_GREEN_M = 35;
/** Quanto fuori dall'acqua si droppa. */
export const WATER_DROP_CLEAR_M = 2;
const DROP_SEARCH_STEP_M = 0.5;

export function inPond(w: Pond, p: Point): boolean {
  return ((p.x - w.x) / w.rx) ** 2 + ((p.y - w.y) / w.ry) ** 2 <= 1;
}

export function hazardAt(hole: GolfHole, p: Point): Hazard | null {
  if (Math.abs(p.x) > OOB_HALF_WIDTH_M || p.y < OOB_BEHIND_TEE_M || p.y > hole.lengthM + OOB_PAST_GREEN_M) return 'oob';
  if ((hole.water ?? []).some((w) => inPond(w, p))) return 'water';
  return null;
}

/**
 * Drop dall'acqua: dal punto in cui la palla è entrata si torna verso `from` (da dove si è
 * tirato) finché si esce dall'acqua, più qualche metro. Mai oltre `from`.
 */
export function waterDrop(hole: GolfHole, entry: Point, from: Point): Point {
  const dx = from.x - entry.x;
  const dy = from.y - entry.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return from;
  const at = (s: number): Point => ({ x: entry.x + (dx / d) * s, y: entry.y + (dy / d) * s });
  for (let s = DROP_SEARCH_STEP_M; s < d; s += DROP_SEARCH_STEP_M) {
    if (hazardAt(hole, at(s)) === null) return at(Math.min(d, s + WATER_DROP_CLEAR_M));
  }
  return from;
}

/** Dove si rimette la palla dopo l'ostacolo. */
export function dropPoint(hole: GolfHole, hazard: Hazard, entry: Point, from: Point): Point {
  return hazard === 'oob' ? from : waterDrop(hole, entry, from);
}

const overlapsBunker = (w: Pond, bunkers: readonly Bunker[]) =>
  bunkers.some((b) => Math.hypot(b.x - w.x, b.y - w.y) < b.radiusM + Math.max(w.rx, w.ry) + 2);

/**
 * Laghetti della buca: uno a lato del fairway (a volte), e sui par 3 a volte uno davanti
 * al green, da superare in volo. Mai sul green, sul tee, sui bunker o oltre i paletti.
 */
export function makeWater(hole: GolfHole, rng: () => number, fairwayHalfWidthM: number): readonly Pond[] {
  const ponds: Pond[] = [];
  const pin = { x: 0, y: hole.lengthM };
  // il bordo del green (con un metro di margine) non deve finire in acqua
  const greenEdge = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return { x: pin.x + Math.cos(a) * (hole.greenRadiusM + 1), y: pin.y + Math.sin(a) * (hole.greenRadiusM + 1) };
  });
  const fits = (w: Pond) =>
    Math.abs(w.x) + w.rx < OOB_HALF_WIDTH_M - 3
    && w.y - w.ry > 40 // lontano dal tee
    && !inPond(w, pin)
    && !greenEdge.some((p) => inPond(w, p))
    && !overlapsBunker(w, hole.bunkers);

  if (rng() < 0.5) {
    const side = rng() < 0.5 ? -1 : 1;
    const rx = 7 + rng() * 6;
    const sidePond: Pond = {
      x: side * (fairwayHalfWidthM + rx * 0.35),
      y: hole.lengthM * (0.35 + rng() * 0.35),
      rx,
      ry: 14 + rng() * 16,
    };
    if (fits(sidePond)) ponds.push(sidePond);
  }
  if (hole.par === 3 && rng() < 0.55) {
    const ry = 6 + rng() * 3;
    const front: Pond = { x: (rng() * 2 - 1) * 5, y: hole.lengthM - hole.greenRadiusM - ry - 3, rx: 12 + rng() * 6, ry };
    if (fits(front)) ponds.push(front);
  }
  return ponds;
}
