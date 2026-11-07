// Fine partita: podio, classifica finale e premio "Più strike" (docs/games/bowling.md § 8).

import { standings, type GameState, type Standing } from '../rules';
import type { BowlingPlayer } from '../useBowlingGame';

export interface PodiumProps {
  readonly game: GameState;
  readonly players: readonly BowlingPlayer[];
  readonly onRematch: () => void;
  readonly onNewGame: () => void;
  readonly onExit?: () => void;
}

const STEP_ORDER = [1, 0, 2]; // 2° a sinistra, 1° al centro, 3° a destra

export function Podium({ game, players, onRematch, onNewGame, onExit }: PodiumProps) {
  const rows = standings(game);
  const top = STEP_ORDER.map((i) => rows[i]).filter((r): r is Standing => r !== undefined);
  const maxStrikes = Math.max(...rows.map((r) => r.strikes));
  const strikeKing = maxStrikes > 0 ? rows.find((r) => r.strikes === maxStrikes) : undefined;
  const playerAt = (idx: number): BowlingPlayer =>
    players[idx] ?? { id: `P${idx + 1}`, name: `Piggy ${idx + 1}`, color: '#8E5BFF', symbol: '●' };
  const winner = rows[0];

  return (
    <div class="bw-overlay" role="dialog" aria-modal="true" aria-labelledby="bw-podium-title">
      <div class="bw-card bw-podium">
        <p class="bw-eyebrow">Partita finita · {game.frameCount} frame</p>
        <h2 id="bw-podium-title" class="bw-setup__title">
          {rows.length > 1 && winner ? `Vince ${playerAt(winner.playerIndex).name}!` : `${winner?.total ?? 0} punti!`}
        </h2>

        <div class="bw-podium__steps">
          {top.map((r) => {
            const p = playerAt(r.playerIndex);
            return (
              <div key={p.id} class={`bw-step bw-step--${Math.min(r.position, 3)}`} style={{ '--player': p.color }}>
                <span class="bw-step__avatar" aria-hidden="true">{p.symbol}</span>
                <span class="bw-step__name">{p.name}</span>
                <span class="bw-step__pts">{r.total} pt</span>
                <span class="bw-step__block">{r.position}°</span>
              </div>
            );
          })}
        </div>

        {rows.length > 3 && (
          <ol class="bw-podium__rest">
            {rows.slice(3).map((r) => (
              <li key={r.playerId}>
                {r.position}° {playerAt(r.playerIndex).name} · {r.total} pt
              </li>
            ))}
          </ol>
        )}

        {strikeKing && (
          <p class="bw-podium__award">
            🏅 Più strike: <strong>{playerAt(strikeKing.playerIndex).name}</strong> ({strikeKing.strikes})
          </p>
        )}

        <div class="bw-podium__actions">
          <button type="button" class="bowling-btn bowling-btn--primary" onClick={onRematch}>
            ↺ Rivincita
          </button>
          <button type="button" class="bowling-btn bowling-btn--secondary" onClick={onNewGame}>
            Cambia durata
          </button>
          {onExit && (
            <button type="button" class="bowling-btn bowling-btn--secondary" onClick={onExit}>
              Esci alla Lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
