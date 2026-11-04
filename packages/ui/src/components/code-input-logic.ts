// Logica pura delle caselle del codice, separata dal DOM per poterla testare.

export interface CellEdit {
  readonly value: string;
  /** Casella da mettere a fuoco dopo la modifica. */
  readonly focus: number;
}

/**
 * Applica quello che il browser ha messo nella casella `i`.
 * - stringa vuota: cancellazione del carattere della casella;
 * - più caratteri (incolla o testo non selezionato): si sovrascrive da `i` in avanti.
 * Ritorna null se non c'è nessun carattere ammesso (la casella va ripristinata).
 */
export function applyCellInput(
  value: string, i: number, typed: string, length: number, normalize: (ch: string) => string,
): CellEdit | null {
  const prev = value[i] ?? '';
  if (typed === '') {
    if (!prev) return { value, focus: Math.max(0, i - 1) };
    return { value: value.slice(0, i) + value.slice(i + 1), focus: i };
  }
  const raw = prev && typed.length > 1 && typed.startsWith(prev) ? typed.slice(prev.length) : typed;
  const clean = [...raw].map(normalize).join('');
  if (!clean) return null;
  const head = value.slice(0, i);
  const next = (head + clean + value.slice(i + clean.length)).slice(0, length);
  return { value: next, focus: Math.min(length - 1, head.length + clean.length) };
}

/** Backspace su una casella vuota: cancella la precedente e ci torna. */
export function applyBackspaceOnEmpty(value: string, i: number): CellEdit | null {
  if (i <= 0 || (value[i] ?? '') !== '') return null;
  const target = Math.min(i - 1, value.length - 1);
  if (target < 0) return null;
  return { value: value.slice(0, target) + value.slice(target + 1), focus: target };
}
