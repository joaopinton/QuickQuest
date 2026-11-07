// Preferenze del telefono salvate in locale: ultimo Piggy scelto (nome e aspetto), avviso di
// sicurezza già visto. Tutto quello che si rilegge da localStorage passa dalla validazione.
import type { Profile } from '@quickquest/protocol';
import {
  PIGGY_COLORS, piggyColor, cleanName, DEFAULT_STYLE, EYES, FACE_ITEMS, HATS, MOUTHS, NECK_ITEMS, normalizeStyle, PATTERNS,
  type PiggyStyle,
} from '@quickquest/ui';

/** Quello che il giocatore sceglie: colori per id della palette, il resto come in `PiggyStyle`. */
export interface PiggyChoice extends Omit<PiggyStyle, 'color2'> {
  readonly name: string;
  readonly colorId: string;
  readonly color2Id: string;
}

const CHOICE_KEY = 'qq:piggy';
/** Chiave di quando i personaggi si chiamavano Bubù: si rilegge una volta sola, per non perdere la scelta. */
const LEGACY_CHOICE_KEY = 'qq:bubu';
const SAFETY_KEY = 'qq:safety-ok';
const DEFAULT_COLOR2_ID = 'snow';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage pieno o disabilitato: la preferenza non viene ricordata, nient'altro
  }
}

const isColorId = (x: unknown): x is string => typeof x === 'string' && PIGGY_COLORS.some((c) => c.id === x);
const randomOf = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] ?? list[0]!;

/** Una scelta valida da dati qualsiasi; i campi mancanti o sbagliati tornano al default. */
export function normalizeChoice(raw: Readonly<Record<string, unknown>>): PiggyChoice {
  const style = normalizeStyle(raw);
  return {
    name: cleanName(raw.name),
    colorId: isColorId(raw.colorId) ? raw.colorId : randomOf(PIGGY_COLORS).id,
    color2Id: isColorId(raw.color2Id) ? raw.color2Id : DEFAULT_COLOR2_ID,
    pattern: style.pattern,
    eyes: style.eyes,
    mouth: style.mouth,
    hat: style.hat,
    face: style.face,
    neck: style.neck,
  };
}

/** Ultimo Piggy scelto, validato; altrimenti un colore a caso. */
export function loadChoice(): PiggyChoice {
  try {
    const parsed: unknown = JSON.parse(safeGet(CHOICE_KEY) ?? safeGet(LEGACY_CHOICE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizeChoice(parsed as Record<string, unknown>);
  } catch {
    // JSON rotto: si riparte da una scelta nuova
  }
  return normalizeChoice({});
}

/** Un Piggy tutto a caso, ma col nome che il giocatore ha già scritto. */
export function randomChoice(name: string): PiggyChoice {
  return {
    name,
    colorId: randomOf(PIGGY_COLORS).id,
    color2Id: randomOf(PIGGY_COLORS).id,
    pattern: randomOf(PATTERNS),
    eyes: randomOf(EYES),
    mouth: randomOf(MOUTHS),
    hat: randomOf(HATS),
    face: Math.random() < 0.5 ? 'none' : randomOf(FACE_ITEMS),
    neck: Math.random() < 0.5 ? 'none' : randomOf(NECK_ITEMS),
  };
}

export function choiceStyle(c: PiggyChoice): PiggyStyle {
  return { ...DEFAULT_STYLE, ...c, color2: piggyColor(c.color2Id).hex };
}

/** Profilo da mandare allo schermo. */
export function choiceProfile(c: PiggyChoice): Profile {
  const s = choiceStyle(c);
  return {
    name: cleanName(c.name),
    color: piggyColor(c.colorId).hex,
    color2: s.color2,
    pattern: s.pattern,
    eyes: s.eyes,
    mouth: s.mouth,
    hat: s.hat,
    face: s.face,
    neck: s.neck,
  };
}

export const saveChoice = (c: PiggyChoice): void => safeSet(CHOICE_KEY, JSON.stringify(c));
export const hasSeenSafety = (): boolean => safeGet(SAFETY_KEY) === '1';
export const markSafetySeen = (): void => safeSet(SAFETY_KEY, '1');
