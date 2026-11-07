// Preferenze del telefono salvate in locale: ultimo Bubù scelto (nome e aspetto), avviso di
// sicurezza già visto. Tutto quello che si rilegge da localStorage passa dalla validazione.
import type { Profile } from '@quickquest/protocol';
import {
  BUBU_COLORS, bubuColor, cleanName, DEFAULT_STYLE, EYES, FACE_ITEMS, HATS, MOUTHS, NECK_ITEMS, normalizeStyle, PATTERNS,
  type BubuStyle,
} from '@quickquest/ui';

/** Quello che il giocatore sceglie: colori per id della palette, il resto come in `BubuStyle`. */
export interface BubuChoice extends Omit<BubuStyle, 'color2'> {
  readonly name: string;
  readonly colorId: string;
  readonly color2Id: string;
}

const CHOICE_KEY = 'qq:bubu';
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

const isColorId = (x: unknown): x is string => typeof x === 'string' && BUBU_COLORS.some((c) => c.id === x);
const randomOf = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] ?? list[0]!;

/** Una scelta valida da dati qualsiasi; i campi mancanti o sbagliati tornano al default. */
export function normalizeChoice(raw: Readonly<Record<string, unknown>>): BubuChoice {
  const style = normalizeStyle(raw);
  return {
    name: cleanName(raw.name),
    colorId: isColorId(raw.colorId) ? raw.colorId : randomOf(BUBU_COLORS).id,
    color2Id: isColorId(raw.color2Id) ? raw.color2Id : DEFAULT_COLOR2_ID,
    pattern: style.pattern,
    eyes: style.eyes,
    mouth: style.mouth,
    hat: style.hat,
    face: style.face,
    neck: style.neck,
  };
}

/** Ultimo Bubù scelto, validato; altrimenti un colore a caso. */
export function loadChoice(): BubuChoice {
  try {
    const parsed: unknown = JSON.parse(safeGet(CHOICE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizeChoice(parsed as Record<string, unknown>);
  } catch {
    // JSON rotto: si riparte da una scelta nuova
  }
  return normalizeChoice({});
}

/** Un Bubù tutto a caso, ma col nome che il giocatore ha già scritto. */
export function randomChoice(name: string): BubuChoice {
  return {
    name,
    colorId: randomOf(BUBU_COLORS).id,
    color2Id: randomOf(BUBU_COLORS).id,
    pattern: randomOf(PATTERNS),
    eyes: randomOf(EYES),
    mouth: randomOf(MOUTHS),
    hat: randomOf(HATS),
    face: Math.random() < 0.5 ? 'none' : randomOf(FACE_ITEMS),
    neck: Math.random() < 0.5 ? 'none' : randomOf(NECK_ITEMS),
  };
}

export function choiceStyle(c: BubuChoice): BubuStyle {
  return { ...DEFAULT_STYLE, ...c, color2: bubuColor(c.color2Id).hex };
}

/** Profilo da mandare allo schermo. */
export function choiceProfile(c: BubuChoice): Profile {
  const s = choiceStyle(c);
  return {
    name: cleanName(c.name),
    color: bubuColor(c.colorId).hex,
    color2: s.color2,
    pattern: s.pattern,
    eyes: s.eyes,
    mouth: s.mouth,
    hat: s.hat,
    face: s.face,
    neck: s.neck,
  };
}

export const saveChoice = (c: BubuChoice): void => safeSet(CHOICE_KEY, JSON.stringify(c));
export const hasSeenSafety = (): boolean => safeGet(SAFETY_KEY) === '1';
export const markSafetySeen = (): void => safeSet(SAFETY_KEY, '1');
