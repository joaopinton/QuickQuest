// Il cursore sulla testa (docs/games/barber.md § Gesto).
// Il cursore vive SULLA testa, come un punto della cute (longitudine e latitudine), e non la
// lascia mai. Il telefono manda dove guarda il suo retro (packages/motion/aim); qui contano i
// suoi MOVIMENTI, come un mouse: girarlo a destra porta la macchinetta a destra sulla testa,
// inclinarlo in su la porta verso la cima. Non serve un centro e non c'è deriva.
// Continuando a destra si passa sul lato e poi sulla nuca: la poltrona segue il cursore
// (`followYaw`) e lo tiene sempre davanti alla telecamera.

import { targetLength, type Haircut } from '../shared/haircuts';
import { hairlineY, type Vec3 } from '../shared/head';

/** La telecamera guarda la testa da sopra di circa 20°. */
export const VIEW_TILT = 0.36;
/** Radianti percorsi sulla testa per un'unità di mira (60° di rotazione del telefono). */
export const HEAD_GAIN = 3.3;
/** Il cursore non va oltre la cima (verso la nuca ci si arriva girando). */
export const LAT_MAX = 1.35;
/** Sotto l'attaccatura dei capelli si scende solo di poco: niente macchinetta sugli occhi. */
const BELOW_HAIRLINE = 0.12;
/** Vicino alla cima un grado di longitudine è corto: si va più veloci, fino a questo limite. */
const MIN_LON_SCALE = 0.35;
/** Un salto più grande di così tra due letture del telefono non è un movimento: si ignora. */
export const MAX_AIM_JUMP = 0.6;
/** Rapidità con cui il cursore mostrato raggiunge quello vero, 1/s. */
export const CURSOR_EASE = 20;
/** Il cursore si muove libero finché resta entro questo angolo dal centro della vista. */
export const FOLLOW_DEADBAND = 0.45;
/** Oltre la zona libera la poltrona gira per riportarlo dentro, 1/s. */
const FOLLOW_RATE = 3.2;
/** Distanza (rad) a cui si guarda se si è vicini al bordo di una zona del taglio. */
const EDGE_PROBE = 0.12;

export type ChairTurn = 0 | 1 | 2 | 3;

/** Punto della cute: longitudine 0 = davanti (+z), > 0 verso destra (+x); latitudine 0 = equatore. */
export interface HeadCursor {
  readonly lon: number;
  readonly lat: number;
}

/** Dove parte ogni cliente: sopra la fronte, dove c'è già da tagliare. */
export const START_CURSOR: HeadCursor = { lon: 0, lat: 0.62 };

/** Rotazione della testa attorno alla verticale per un quarto di giro della poltrona. */
export function headYaw(turn: ChairTurn): number {
  return (-turn * Math.PI) / 2;
}

const CHAIR_VIEW_NAMES: Readonly<Record<ChairTurn, string>> = { 0: 'Fronte', 1: 'Lato destro', 2: 'Nuca', 3: 'Lato sinistro' };
export const chairViewName = (turn: ChairTurn): string => CHAIR_VIEW_NAMES[turn];

/** Il quarto di giro più vicino a una rotazione qualsiasi della testa. */
export function nearestTurn(yaw: number): ChairTurn {
  return (((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4) as ChairTurn;
}

/** Direzione (riferimento della testa) del punto della cute sotto il cursore. */
export function headDir(c: HeadCursor): Vec3 {
  const cl = Math.cos(c.lat);
  return [Math.sin(c.lon) * cl, Math.sin(c.lat), Math.cos(c.lon) * cl];
}

/** Latitudine più bassa a cui scende il cursore a questa longitudine: poco sotto l'attaccatura. */
export function latMin(lon: number): number {
  const equator: Vec3 = [Math.sin(lon), 0, Math.cos(lon)];
  return Math.asin(Math.min(1, Math.max(-1, hairlineY(equator)))) - BELOW_HAIRLINE;
}

/**
 * Sposta il cursore sulla testa di un movimento del telefono (`dax`, `day` in unità di mira;
 * `day` > 0 = verso il basso). `gain` < 1 lo frena (assist vicino ai bordi del taglio).
 */
export function moveOnHead(c: HeadCursor, dax: number, day: number, gain = 1): HeadCursor {
  const k = HEAD_GAIN * gain;
  const lon = c.lon + (dax * k) / Math.max(Math.cos(c.lat), MIN_LON_SCALE);
  const lat = Math.min(LAT_MAX, Math.max(latMin(lon), c.lat - day * k));
  return { lon, lat };
}

/** Il cursore mostrato raggiunge quello vero (le letture del telefono arrivano a 20 Hz). */
export function easeCursor(shown: HeadCursor, target: HeadCursor, dt: number): HeadCursor {
  const k = Math.min(1, Math.max(0, dt) * CURSOR_EASE);
  return { lon: shown.lon + (target.lon - shown.lon) * k, lat: shown.lat + (target.lat - shown.lat) * k };
}

/**
 * La poltrona segue il cursore: finché è entro `FOLLOW_DEADBAND` dal centro della vista la testa
 * sta ferma, oltre gira quel tanto che basta per riportarlo dentro. La longitudine del cursore
 * vista dalla telecamera è `lon + yaw`.
 */
export function followYaw(yaw: number, lon: number, dt: number): number {
  const view = lon + yaw;
  const excess = view - Math.min(FOLLOW_DEADBAND, Math.max(-FOLLOW_DEADBAND, view));
  return yaw - excess * Math.min(1, Math.max(0, dt) * FOLLOW_RATE);
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
