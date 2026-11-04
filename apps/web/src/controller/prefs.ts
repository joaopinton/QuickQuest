// Preferenze del telefono salvate in locale: ultimo Pupo scelto, avviso di sicurezza già visto.
import { ACCESSORIES, PUPO_COLORS, type Accessory } from '@quickquest/ui';
import type { PupoChoice } from './steps/PickPupo';

const CHOICE_KEY = 'qq:pupo';
const SAFETY_KEY = 'qq:safety-ok';

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

/** Ultimo Pupo scelto, validato; altrimenti un colore a caso. */
export function loadChoice(): PupoChoice {
  try {
    const parsed: unknown = JSON.parse(safeGet(CHOICE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const { colorId, accessory } = parsed as Record<string, unknown>;
      if (PUPO_COLORS.some((c) => c.id === colorId) && ACCESSORIES.includes(accessory as Accessory)) {
        return { colorId: colorId as string, accessory: accessory as Accessory };
      }
    }
  } catch {
    // JSON rotto: si riparte da una scelta nuova
  }
  const random = PUPO_COLORS[Math.floor(Math.random() * PUPO_COLORS.length)] ?? PUPO_COLORS[0]!;
  return { colorId: random.id, accessory: 'none' };
}

export const saveChoice = (c: PupoChoice): void => safeSet(CHOICE_KEY, JSON.stringify(c));
export const hasSeenSafety = (): boolean => safeGet(SAFETY_KEY) === '1';
export const markSafetySeen = (): void => safeSet(SAFETY_KEY, '1');
