// Decorazioni del sito: coriandoli a forma di simboli, "adesivi" dei giochi, coppia di telefoni.
import type { GameMeta } from '@quickquest/games';
import { GameIcon, PLAYER_SLOTS, Piggy } from '@quickquest/ui';
import type { JSX } from 'preact';

const CONFETTI = [
  { slot: 0, x: '-4%', y: '8%', s: 34, r: -12, d: 0 },
  { slot: 1, x: '92%', y: '2%', s: 28, r: 18, d: 0.6 },
  { slot: 2, x: '96%', y: '62%', s: 38, r: -8, d: 1.2 },
  { slot: 3, x: '2%', y: '74%', s: 30, r: 22, d: 0.3 },
  { slot: 1, x: '44%', y: '-5%', s: 22, r: -20, d: 0.9 },
  { slot: 0, x: '70%', y: '96%', s: 24, r: 10, d: 1.5 },
] as const;

/** Simboli dei giocatori che galleggiano intorno alla scena. */
export function Confetti() {
  return (
    <div class="confetti" aria-hidden="true">
      {CONFETTI.map((c, i) => {
        const slot = PLAYER_SLOTS[c.slot]!;
        const style = {
          left: c.x, top: c.y, '--c': slot.hex, '--r': `${c.r}deg`, '--d': `${c.d}s`, width: `${c.s}px`, height: `${c.s}px`,
        } as JSX.CSSProperties;
        return <span key={i} class={`confetti__bit confetti__bit--${slot.id}`} style={style} />;
      })}
    </div>
  );
}

/** Le icone dei giochi come adesivi inclinati: riempiono l'intestazione della pagina Giochi. */
export function StickerCluster({ games }: { games: readonly GameMeta[] }) {
  const tilts = [-8, 6, -4, 10, -12, 4];
  return (
    <div class="stickers" aria-hidden="true">
      {games.map((g, i) => (
        <span key={g.id} class="sticker" style={{ '--accent': g.accent, '--r': `${tilts[i % tilts.length]}deg`, '--d': `${i * 0.25}s` } as JSX.CSSProperties}>
          <GameIcon id={g.id} size="70%" />
        </span>
      ))}
    </div>
  );
}

/** Schermo e telefono che si "parlano", con un Piggy che saluta. */
export function PhoneDuo() {
  return (
    <div class="phone-duo" aria-hidden="true">
      <svg class="phone-duo__tv" viewBox="0 0 220 160">
        <rect x="10" y="10" width="200" height="124" rx="22" fill="#1E2A4A" />
        <rect x="22" y="22" width="176" height="100" rx="12" fill="#8FD3FF" />
        <path d="M22 96 C70 76 120 90 198 80 V110 a12 12 0 0 1 -12 12 H34 a12 12 0 0 1 -12 -12 Z" fill="#7ED957" />
        <rect x="96" y="134" width="28" height="10" fill="#1E2A4A" />
        <rect x="70" y="144" width="80" height="8" rx="4" fill="#1E2A4A" />
      </svg>
      <span class="phone-duo__waves"><i /><i /><i /></span>
      <svg class="phone-duo__phone" viewBox="0 0 70 120">
        <rect x="4" y="4" width="62" height="112" rx="16" fill="#1E2A4A" />
        <rect x="10" y="14" width="50" height="92" rx="10" fill="#F1EBFF" />
        <rect x="18" y="58" width="34" height="34" rx="12" fill="#8E5BFF" />
      </svg>
      <span class="phone-duo__piggy"><Piggy color="#FF9A3C" look={{ pattern: 'split', color2: '#FFD23F', face: 'glasses' }} wave mood="happy" size="100%" /></span>
    </div>
  );
}
