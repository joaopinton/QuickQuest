// Schermata iniziale: giocatori in pista e scelta della durata (docs/games/bowling.md § 9).

import { FULL_GAME_FRAMES, QUICK_GAME_FRAMES } from '../rules';
import type { BowlingPlayer } from '../useBowlingGame';

export interface GameSetupProps {
  readonly players: readonly BowlingPlayer[];
  readonly onStart: (frameCount: number) => void;
}

export function GameSetup({ players, onStart }: GameSetupProps) {
  return (
    <div class="bw-overlay" role="dialog" aria-modal="true" aria-labelledby="bw-setup-title">
      <div class="bw-card bw-setup">
        <p class="bw-eyebrow">Sala Stelline · Pista 7</p>
        <h2 id="bw-setup-title" class="bw-setup__title">Si gioca a bowling!</h2>
        <ul class="bw-setup__players" aria-label="Giocatori in pista">
          {players.map((p, i) => (
            <li key={p.id} class="bw-chip" style={{ '--player': p.color, animationDelay: `${i * 90}ms` }}>
              <span class="bw-chip__dot" aria-hidden="true">{p.symbol}</span>
              {p.name}
            </li>
          ))}
        </ul>
        <div class="bw-setup__modes">
          <button type="button" class="bw-mode" onClick={() => onStart(QUICK_GAME_FRAMES)}>
            <span class="bw-mode__big">{QUICK_GAME_FRAMES}</span>
            <span class="bw-mode__label">Partita veloce</span>
            <span class="bw-mode__hint">frame · per le feste</span>
          </button>
          <button type="button" class="bw-mode bw-mode--full" onClick={() => onStart(FULL_GAME_FRAMES)}>
            <span class="bw-mode__big">{FULL_GAME_FRAMES}</span>
            <span class="bw-mode__label">Partita completa</span>
            <span class="bw-mode__hint">frame · regolamentare</span>
          </button>
        </div>
      </div>
    </div>
  );
}
