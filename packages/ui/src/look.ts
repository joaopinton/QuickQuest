// Aspetto di un Bubù (docs/07 § 6): colore, secondo colore, motivo, occhi, bocca e tre posti per
// gli accessori (testa, viso, collo). È quello che il telefono manda allo schermo nel profilo.

export const PATTERNS = ['none', 'belly', 'stripes', 'dots', 'stars', 'spots', 'split'] as const;
export const EYES = ['round', 'happy', 'sleepy', 'sly', 'stars', 'dots'] as const;
export const MOUTHS = ['smile', 'grin', 'cat', 'tongue', 'o', 'flat'] as const;
export const HATS = ['none', 'cap', 'beanie', 'crown', 'chef', 'party', 'band', 'headphones', 'leaves', 'antennae', 'bow'] as const;
export const FACE_ITEMS = ['none', 'glasses', 'sunglasses', 'freckles', 'mustache'] as const;
export const NECK_ITEMS = ['none', 'bowtie', 'scarf', 'necklace'] as const;

export type Pattern = (typeof PATTERNS)[number];
export type EyeStyle = (typeof EYES)[number];
export type MouthStyle = (typeof MOUTHS)[number];
export type Hat = (typeof HATS)[number];
export type FaceItem = (typeof FACE_ITEMS)[number];
export type NeckItem = (typeof NECK_ITEMS)[number];

export interface BubuLook {
  /** Colore del corpo. */
  readonly color: string;
  /** Mani, piedi e motivo. */
  readonly color2: string;
  readonly pattern: Pattern;
  readonly eyes: EyeStyle;
  readonly mouth: MouthStyle;
  readonly hat: Hat;
  readonly face: FaceItem;
  readonly neck: NeckItem;
}

/** Tutto tranne il colore principale: quello che si sceglie oltre al colore. */
export type BubuStyle = Omit<BubuLook, 'color'>;

export const DEFAULT_STYLE: BubuStyle = {
  color2: '#FFF6E8',
  pattern: 'none',
  eyes: 'round',
  mouth: 'smile',
  hat: 'none',
  face: 'none',
  neck: 'none',
};

/** Massimo di caratteri del nome scelto sul telefono. */
export const NAME_MAX = 12;

const HEX = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Legge un aspetto da dati non fidati (profilo di rete, localStorage): ogni campo sbagliato torna al default. */
export function normalizeStyle(raw: Readonly<Record<string, unknown>> | null | undefined): BubuStyle {
  const r = raw ?? {};
  return {
    color2: typeof r.color2 === 'string' && HEX.test(r.color2) ? r.color2 : DEFAULT_STYLE.color2,
    pattern: pick(PATTERNS, r.pattern, DEFAULT_STYLE.pattern),
    eyes: pick(EYES, r.eyes, DEFAULT_STYLE.eyes),
    mouth: pick(MOUTHS, r.mouth, DEFAULT_STYLE.mouth),
    hat: pick(HATS, r.hat, DEFAULT_STYLE.hat),
    face: pick(FACE_ITEMS, r.face, DEFAULT_STYLE.face),
    neck: pick(NECK_ITEMS, r.neck, DEFAULT_STYLE.neck),
  };
}

/**
 * Nome pulito: solo lettere (anche accentate), cifre, spazi e `' . _ -`, niente spazi doppi, al
 * massimo `NAME_MAX` caratteri. Sono le stesse regole che il protocollo controlla (`isProfile`).
 */
export function cleanName(raw: unknown): string {
  return typingName(raw).trimEnd();
}

/** Come `cleanName` ma tiene lo spazio finale: serve mentre si scrive, per poter separare le parole. */
export function typingName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const chars = Array.from(raw.replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} '._-]/gu, '').trimStart());
  return chars.slice(0, NAME_MAX).join('');
}

/** Nome da mostrare: quello scelto o "Bubù N" come ripiego. */
export function displayName(name: string | null | undefined, slot: string): string {
  const clean = cleanName(name ?? '');
  return clean.length > 0 ? clean : `Bubù ${slot.replace(/^P/, '')}`;
}
