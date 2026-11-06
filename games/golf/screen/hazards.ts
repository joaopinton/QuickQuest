// Ostacoli del golf: acqua e fuori limite (docs/games/golf.md § Acqua e fuori limite).
// Solo geometria e regole di drop, senza Three.js: le usano le regole e la scena.
// Regole, semplificate dal golf vero:
// - acqua: +1 colpo, si droppa dietro il punto da cui si è tirato, più lontano dalla bandiera:
//   buttarla in acqua non fa mai guadagnare strada;
// - fuori limite (paletti bianchi): +1 colpo e si ritira da dove si era tirato.
import { OOB_BEHIND_TEE_M, OOB_HALF_WIDTH_M, OOB_PAST_GREEN_M } from './bounds';
import type { Bunker, GolfHole, Point } from './rules';
import { underwater, WATER_SHEET_SCALE } from './terrain';

export { OOB_BEHIND_TEE_M, OOB_HALF_WIDTH_M, OOB_PAST_GREEN_M };

export type Hazard = 'water' | 'oob';

/** Laghetto ellittico, assi allineati al campo. */
export interface Pond {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
}

/** Quanto dietro il punto di tiro si droppa dopo l'acqua. */
export const WATER_DROP_BACK_M = 10;
const DROP_SEARCH_STEP_M = 0.5;
/** Il drop non va troppo dietro il tee. */
const DROP_MIN_Y_M = OOB_BEHIND_TEE_M + 6;

export function inPond(w: Pond, p: Point): boolean {
  return ((p.x - w.x) / w.rx) ** 2 + ((p.y - w.y) / w.ry) ** 2 <= 1;
}

export function hazardAt(hole: GolfHole, p: Point): Hazard | null {
  if (Math.abs(p.x) > OOB_HALF_WIDTH_M || p.y < OOB_BEHIND_TEE_M || p.y > hole.lengthM + OOB_PAST_GREEN_M) return 'oob';
  // acqua dove il terreno scende sotto il pelo dell'acqua: la riva che si vede è il confine
  if (underwater(hole, p)) return 'water';
  return null;
}

/**
 * Drop dall'acqua: dal punto da cui si è tirato (`from`) si va indietro, lontano dalla
 * bandiera, di WATER_DROP_BACK_M, su terreno senza ostacoli. Mai più vicino alla bandiera di
 * `from`: chi la butta in acqua non guadagna strada. `entry` (dove è entrata) serve solo se
 * `from` coincide con la bandiera.
 */
export function waterDrop(hole: GolfHole, entry: Point, from: Point): Point {
  const pin = { x: 0, y: hole.lengthM };
  let dx = from.x - pin.x;
  let dy = from.y - pin.y;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    dx = from.x - entry.x;
    dy = from.y - entry.y;
    d = Math.hypot(dx, dy) || 1;
  }
  const ux = dx / d;
  const uy = dy / d;
  const at = (s: number): Point => ({ x: from.x + ux * s, y: Math.max(DROP_MIN_Y_M, from.y + uy * s) });
  for (let s = WATER_DROP_BACK_M; s >= 0; s -= DROP_SEARCH_STEP_M) {
    const p = at(s);
    if (hazardAt(hole, p) === null && Math.hypot(p.x - pin.x, p.y - pin.y) >= d - 1e-9) return p;
  }
  return from;
}

/** Dove si rimette la palla dopo l'ostacolo. */
export function dropPoint(hole: GolfHole, hazard: Hazard, entry: Point, from: Point): Point {
  return hazard === 'oob' ? from : waterDrop(hole, entry, from);
}

const overlapsBunker = (w: Pond, bunkers: readonly Bunker[]) =>
  bunkers.some((b) => Math.hypot(b.x - w.x, b.y - w.y) < b.radiusM + Math.max(w.rx, w.ry) * WATER_SHEET_SCALE + 2);
/** Due laghetti hanno peli dell'acqua a quote diverse: le loro conche non si toccano. */
const overlapsPond = (w: Pond, ponds: readonly Pond[]) =>
  ponds.some((o) => Math.hypot(o.x - w.x, o.y - w.y) < (Math.max(o.rx, o.ry) + Math.max(w.rx, w.ry)) * WATER_SHEET_SCALE + 2);
const grown = (w: Pond): Pond => ({ ...w, rx: w.rx * WATER_SHEET_SCALE, ry: w.ry * WATER_SHEET_SCALE });

/**
 * Laghetti della buca: uno a lato del fairway (a volte), e sui par 3 a volte uno davanti
 * al green, da superare in volo. Mai sul green, sul tee, sui bunker o oltre i paletti.
 */
export function makeWater(hole: GolfHole, rng: () => number, fairwayHalfWidthM: number): readonly Pond[] {
  const ponds: Pond[] = [];
  const pin = { x: 0, y: hole.lengthM };
  // il bordo del green non deve finire nella conca del laghetto (fin dove arriva l'acqua)
  const greenEdge = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    return { x: pin.x + Math.cos(a) * hole.greenRadiusM, y: pin.y + Math.sin(a) * hole.greenRadiusM };
  });
  const fits = (w: Pond) =>
    Math.abs(w.x) + w.rx < OOB_HALF_WIDTH_M - 3
    && w.y - w.ry > 40 // lontano dal tee
    && !inPond(w, pin)
    && !greenEdge.some((p) => inPond(grown(w), p))
    && !overlapsBunker(w, hole.bunkers)
    && !overlapsPond(w, ponds);

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
