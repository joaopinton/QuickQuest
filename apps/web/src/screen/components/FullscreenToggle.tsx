// Pulsante per lo schermo intero, uguale per tutti i giochi: lo mette la lobby sopra la scena.
// Anche il tasto F. Dove il browser non lo permette (iPhone) il pulsante non c'è.
import { t } from '@quickquest/ui';
import { useEffect, useState } from 'preact/hooks';
import {
  isFullscreen, isFullscreenShortcut, isFullscreenSupported, onFullscreenChange, toggleFullscreen, type FullscreenDoc,
} from '../fullscreen';
import './fullscreen-toggle.css';

const doc = document as unknown as FullscreenDoc;

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

export function FullscreenToggle() {
  const [isOn, setOn] = useState(() => isFullscreen(doc));
  const isSupported = isFullscreenSupported(doc);

  useEffect(() => onFullscreenChange(doc, () => setOn(isFullscreen(doc))), []);

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
      class={`fs-toggle ${isOn ? 'is-on' : ''}`}
      aria-label={label}
      aria-pressed={isOn}
      title={label}
      onClick={() => void toggleFullscreen(doc)}
    >
      {isOn ? <CollapseIcon /> : <ExpandIcon />}
    </button>
  );
}
