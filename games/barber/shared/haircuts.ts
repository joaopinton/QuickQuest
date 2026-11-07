// Catalogo delle richieste dei clienti (docs/11 § 6.1): ogni taglio è una funzione che dà la
// lunghezza desiderata (0..1) in ogni punto della testa. Le lunghezze coincidono con quelle dei
// pettini, così ogni taglio è davvero ottenibile con la macchinetta.

import { isScalp, hairlineY, type Vec3 } from './head';
import type { CombLevel } from './events';

/** Lunghezza dei capelli quando il cliente si siede (un po' arruffati). */
export const INITIAL_LENGTH = 0.82;
/** Lunghezza lasciata dalla macchinetta per ogni pettine. */
export const COMB_LENGTH: Readonly<Record<CombLevel, number>> = { 0: 0.06, 1: 0.32, 2: 0.58 };

export interface Haircut {
  readonly id: string;
  readonly name: string;
  /** Battuta del cliente quando si siede. */
  readonly line: string;
  readonly icon: string;
  /** Lunghezza desiderata in una direzione della testa (solo dove c'è cuoio capelluto). */
  target(d: Vec3): number;
}

const ZERO = COMB_LENGTH[0];
const SHORT = COMB_LENGTH[1];
const MEDIUM = COMB_LENGTH[2];
const UNTOUCHED = INITIAL_LENGTH;

const isFringe = (d: Vec3): boolean => d[2] > 0.45 && d[1] > 0.3;

export const HAIRCUTS: readonly Haircut[] = [
  {
    id: 'trim',
    name: 'Spuntatina',
    line: 'Solo una spuntatina, eh.',
    icon: '✂️',
    target: () => MEDIUM,
  },
  {
    id: 'low-fade',
    name: 'Sfumatura bassa',
    line: 'Corto ai lati, ma con classe.',
    icon: '💈',
    target: (d) => {
      if (isFringe(d)) return MEDIUM;
      const above = d[1] - hairlineY(d);
      if (above < 0.2) return ZERO;
      if (above < 0.45) return SHORT;
      return MEDIUM;
    },
  },
  {
    id: 'mohawk',
    name: 'Cresta',
    line: 'Voglio sembrare un gallo. Ma elegante.',
    icon: '🐓',
    target: (d) => (Math.abs(d[0]) < 0.28 ? UNTOUCHED : ZERO),
  },
  {
    id: 'quiff',
    name: 'Tutto a zero, tranne il ciuffo',
    line: 'Il ciuffo non si tocca!',
    icon: '🌀',
    target: (d) => (d[2] > 0.45 && d[1] > 0.45 && Math.abs(d[0]) < 0.5 ? UNTOUCHED : ZERO),
  },
  {
    id: 'bowl',
    name: 'A scodella',
    line: 'Come il nonno nelle foto.',
    icon: '🥣',
    target: (d) => (d[1] > 0.12 ? MEDIUM : ZERO),
  },
];

export function findHaircut(id: string): Haircut {
  return HAIRCUTS.find((h) => h.id === id) ?? HAIRCUTS[0]!;
}

/** Lunghezza desiderata, 0 fuori dal cuoio capelluto. */
export function targetLength(cut: Haircut, d: Vec3): number {
  return isScalp(d) ? cut.target(d) : 0;
}

/** Frangia e nuca contano di più nel voto (docs/11 § 6.1). */
export function zoneWeight(d: Vec3): number {
  if (isFringe(d)) return 1.5;
  if (d[2] < -0.45 && d[1] < 0.25) return 1.5;
  return 1;
}

export interface SilhouettePoint {
  /** Angolo sul profilo, 0 = in cima, positivo verso destra (fronte) o verso la faccia (lato). */
  readonly angle: number;
  /** Lunghezza dei capelli in quel punto (0 = pelle). */
  readonly length: number;
}

/**
 * Profilo della figurina della richiesta, di fronte o di lato. Si legge un po' inclinato verso
 * chi guarda, così il ciuffo sulla fronte si vede anche nella vista di fronte.
 */
export function silhouette(cut: Haircut, view: 'front' | 'side', steps = 48): SilhouettePoint[] {
  const out: SilhouettePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI + (i / steps) * Math.PI * 2;
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const raw: Vec3 = view === 'front' ? [s, c, 0.6] : [0.35, c, s];
    const n = Math.hypot(raw[0], raw[1], raw[2]);
    const d: Vec3 = [raw[0] / n, raw[1] / n, raw[2] / n];
    out.push({ angle, length: targetLength(cut, d) });
  }
  return out;
}
