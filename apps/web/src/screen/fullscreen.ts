// Schermo intero per i giochi sullo schermo condiviso. Fullscreen API standard con il fallback
// `webkit` (Safari su iPad e Mac fino alla 16.4). Il documento è iniettabile per i test.

type MaybePromise = Promise<void> | void;

interface FullscreenElement {
  requestFullscreen?: () => MaybePromise;
  webkitRequestFullscreen?: () => MaybePromise;
}

export interface FullscreenDoc {
  readonly documentElement: FullscreenElement;
  readonly fullscreenElement?: unknown;
  readonly webkitFullscreenElement?: unknown;
  readonly fullscreenEnabled?: boolean;
  readonly webkitFullscreenEnabled?: boolean;
  exitFullscreen?: () => MaybePromise;
  webkitExitFullscreen?: () => MaybePromise;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

/** Il browser lo permette (su iPhone Safari non esiste per le pagine). */
export function isFullscreenSupported(doc: FullscreenDoc): boolean {
  return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled)
    && Boolean(doc.documentElement.requestFullscreen ?? doc.documentElement.webkitRequestFullscreen);
}

export function isFullscreen(doc: FullscreenDoc): boolean {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Entra o esce dallo schermo intero. Va chiamato dentro un gesto (click o tasto): fuori il
 * browser rifiuta, e il rifiuto non è un errore da mostrare. Restituisce se ha funzionato.
 */
export async function toggleFullscreen(doc: FullscreenDoc): Promise<boolean> {
  try {
    if (isFullscreen(doc)) {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      await exit?.call(doc);
    } else {
      const el = doc.documentElement;
      const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
      if (!request) return false;
      await request.call(el);
    }
    return true;
  } catch {
    return false; // rifiutato dal browser (niente gesto, iframe senza permesso…)
  }
}

/** Avvisa quando si entra o si esce, anche con Esc o dai controlli del browser. */
export function onFullscreenChange(doc: FullscreenDoc, cb: () => void): () => void {
  CHANGE_EVENTS.forEach((type) => doc.addEventListener(type, cb));
  return () => CHANGE_EVENTS.forEach((type) => doc.removeEventListener(type, cb));
}

export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  readonly target: unknown;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Tasto F da solo, non mentre si scrive in un campo. */
export function isFullscreenShortcut(e: ShortcutEvent): boolean {
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return !(target && (TYPING_TAGS.has(target.tagName ?? '') || target.isContentEditable));
}
