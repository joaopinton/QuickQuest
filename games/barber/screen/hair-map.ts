// Mappa delle lunghezze dei capelli (docs/games/barber.md § Simulazione dei capelli).
// 128×128 byte, stessa UV della sfera della testa: è anche il contenuto della DataTexture che lo
// shader dei gusci legge. Per prestazioni il taglio scrive nel buffer in place (60 volte al
// secondo): il buffer appartiene a un solo cliente e si ricrea a ogni cliente.

import { HAIR_MAP_SIZE, isScalp, texelDir, uvFromDir, type Vec3 } from '../shared/head';
import { INITIAL_LENGTH } from '../shared/haircuts';

export interface HairMap {
  readonly size: number;
  /** Lunghezze 0..255, riga = colatitudine (0 = in cima), colonna = longitudine. */
  readonly lengths: Uint8Array;
}

export type BrushKind = 'clip' | 'snip';

export interface Brush {
  readonly dir: Vec3;
  /** Raggio angolare in radianti. */
  readonly radius: number;
  /** Lunghezza sotto cui il taglio non scende (il pettine), 0..1. */
  readonly floor: number;
  readonly kind: BrushKind;
}

export interface CutResult {
  /** Capelli tolti, in "texel × lunghezza" (0..1 per texel): serve per i ciuffi che cadono. */
  readonly removed: number;
  /** Righe toccate (comprese), `null` se non è cambiato niente. */
  readonly dirtyRows: { readonly from: number; readonly to: number } | null;
}

/** Quanto toglie una sforbiciata. */
export const SNIP_DEPTH = 0.16;
/** Frazione interna del pennello che taglia piena; il bordo sfuma. */
const BRUSH_CORE = 0.7;

const toByte = (len: number): number => Math.round(Math.min(1, Math.max(0, len)) * 255);
export const toLength = (b: number): number => b / 255;

const dirTables = new Map<number, Float32Array>();

/** Direzioni dei centri dei texel, calcolate una volta per dimensione. */
export function texelDirections(size = HAIR_MAP_SIZE): Float32Array {
  const cached = dirTables.get(size);
  if (cached) return cached;
  const table = new Float32Array(size * size * 3);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const d = texelDir(c, r, size);
      const i = (r * size + c) * 3;
      table[i] = d[0];
      table[i + 1] = d[1];
      table[i + 2] = d[2];
    }
  }
  dirTables.set(size, table);
  return table;
}

/** Piccolo rumore deterministico per texel: i capelli non sono tutti uguali. */
function texelNoise(c: number, r: number): number {
  const s = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function createHairMap(lengthAt: (d: Vec3, c: number, r: number) => number, size = HAIR_MAP_SIZE): HairMap {
  const lengths = new Uint8Array(size * size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      lengths[r * size + c] = toByte(lengthAt(texelDir(c, r, size), c, r));
    }
  }
  return { size, lengths };
}

/** Il cliente appena seduto: capelli lunghi dove c'è cuoio capelluto, un po' irregolari. */
export function initialHairMap(size = HAIR_MAP_SIZE): HairMap {
  return createHairMap((d, c, r) => (isScalp(d) ? INITIAL_LENGTH + (texelNoise(c, r) - 0.5) * 0.06 : 0), size);
}

/** Lunghezza nel texel più vicino a una direzione. */
export function lengthAt(map: HairMap, d: Vec3): number {
  const { u, v } = uvFromDir(d);
  const c = Math.min(map.size - 1, Math.floor(u * map.size));
  const r = Math.min(map.size - 1, Math.floor(v * map.size));
  return toLength(map.lengths[r * map.size + c]!);
}

function rowRange(dir: Vec3, radius: number, size: number): { from: number; to: number } {
  const v = uvFromDir(dir).v;
  const span = radius / Math.PI;
  return {
    from: Math.max(0, Math.floor((v - span) * size)),
    to: Math.min(size - 1, Math.ceil((v + span) * size)),
  };
}

/** Taglia dove punta lo strumento. Accorcia soltanto, mai sotto il pettine. */
export function cutAt(map: HairMap, brush: Brush): CutResult {
  const { size, lengths } = map;
  const dirs = texelDirections(size);
  const cosR = Math.cos(brush.radius);
  const floorB = toByte(brush.floor);
  const snipB = toByte(SNIP_DEPTH);
  const [bx, by, bz] = brush.dir;
  const rows = rowRange(brush.dir, brush.radius, size);
  let removed = 0;
  let from = -1;
  let to = -1;

  for (let r = rows.from; r <= rows.to; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const cur = lengths[idx]!;
      if (cur <= floorB) continue;
      const di = idx * 3;
      const cosA = dirs[di]! * bx + dirs[di + 1]! * by + dirs[di + 2]! * bz;
      if (cosA < cosR) continue;
      const ang = Math.acos(Math.min(1, cosA));
      const edge = ang <= brush.radius * BRUSH_CORE ? 0 : (ang - brush.radius * BRUSH_CORE) / (brush.radius * (1 - BRUSH_CORE));
      // Il bordo sfuma verso "intatto": ripassare nello stesso punto non allarga il taglio
      const full = brush.kind === 'clip' ? floorB : Math.max(floorB, cur - snipB);
      const next = Math.min(cur, Math.round(full + (255 - full) * edge));
      if (next >= cur) continue;
      lengths[idx] = next;
      removed += (cur - next) / 255;
      if (from < 0) from = r;
      to = r;
    }
  }
  return { removed, dirtyRows: from < 0 ? null : { from, to } };
}
