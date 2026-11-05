// Schermo intero per lo schermo condiviso: hook riusabile (pulsante, menù di pausa) e pulsante con
// la scorciatoia F. Dove il browser non lo permette (iPhone) il pulsante non c'è.
import { t } from '@quickquest/ui';
import { useEffect, useState } from 'preact/hooks';
import {
  isFullscreen, isFullscreenShortcut, isFullscreenSupported, onFullscreenChange, toggleFullscreen, type FullscreenDoc,
} from '../fullscreen';
import './screen-dock.css';

const doc = document as unknown as FullscreenDoc;

export interface FullscreenControl {
  readonly isSupported: boolean;
  readonly isOn: boolean;
  toggle(): void;
}

export function useFullscreen(): FullscreenControl {
  const [isOn, setOn] = useState(() => isFullscreen(doc));
  useEffect(() => onFullscreenChange(doc, () => setOn(isFullscreen(doc))), []);
  return { isSupported: isFullscreenSupported(doc), isOn, toggle: () => void toggleFullscreen(doc) };
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
    </svg>
  );
}

/** Pulsante tondo per il dock in basso a destra; ascolta anche il tasto F. Montarne uno solo. */
export function FullscreenToggle() {
  const { isSupported, isOn, toggle } = useFullscreen();

  useEffect(() => {
    if (!isSupported) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isFullscreenShortcut(e)) return;
      e.preventDefault();
      void toggleFullscreen(doc);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSupported]);

  if (!isSupported) return null;
  const label = t(isOn ? 'lobby.fullscreenExit' : 'lobby.fullscreenEnter');
  return (
    <button
      type="button"
      class={`dock-btn ${isOn ? 'is-on' : ''}`}
      aria-label={label}
      aria-pressed={isOn}
      title={label}
      onClick={toggle}
    >
      {isOn ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}
