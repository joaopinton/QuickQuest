// Stringhe dell'interfaccia (docs/08 § 6). MVP solo in italiano.
import it from './it.json';

type Dict = { readonly [key: string]: string | Dict };

const dictionaries: Record<string, Dict> = { it };
let current: Dict = it;

export type Vars = Readonly<Record<string, string | number>>;

/** Cambia lingua; ritorna false se la lingua non esiste. */
export function setLocale(locale: string): boolean {
  const dict = dictionaries[locale];
  if (!dict) return false;
  current = dict;
  return true;
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Traduce una chiave tipo "home.ctaCreate" sostituendo i segnaposto {nome}.
 * Una chiave mancante si vede subito a schermo come ⟦chiave⟧.
 */
export function t(key: string, vars: Vars = {}): string {
  const template = lookup(current, key);
  if (template === undefined) return `⟦${key}⟧`;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Vero se la chiave esiste nel dizionario corrente (usato dai test). */
export function hasKey(key: string): boolean {
  return lookup(current, key) !== undefined;
}
