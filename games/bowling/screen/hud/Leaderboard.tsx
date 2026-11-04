// Classifica live: posizione, punti e distacco dal primo; le righe scorrono quando cambia l'ordine.

import { standings, type GameState } from '../rules';
import type { BowlingPlayer } from '../useBowlingGame';

const ROW_HEIGHT = 52;

export interface LeaderboardProps {
  readonly game: GameState;
  readonly players: readonly BowlingPlayer[];
}

export function Leaderboard({ game, players }: LeaderboardProps) {
  const rows = standings(game);
  const isSolo = rows.length === 1;
  return (
    <section class="bw-card bw-board" aria-labelledby="bw-board-title">
      <h2 id="bw-board-title" class="bw-board__title">Classifica</h2>
      <ol class="bw-board__list" style={{ height: `${rows.length * ROW_HEIGHT}px` }}>
        {/* Ordine stabile nel DOM (per giocatore): la posizione visiva è un transform animato */}
        {players.map((player, idx) => {
          const slot = rows.findIndex((r) => r.playerIndex === idx);
          const row = rows[slot];
          if (!row) return null;
          const note = row.gapFromLeader > 0 ? `−${row.gapFromLeader}` : isSolo ? 'punti' : 'in testa';
          return (
            <li
              key={player.id}
              class={`bw-board__row ${idx === game.current ? 'is-current' : ''} ${row.position === 1 ? 'is-leader' : ''}`}
              style={{ '--player': player.color, transform: `translateY(${slot * ROW_HEIGHT}px)` }}
            >
              <span class="bw-board__pos">{row.position}°</span>
              <span class="bw-board__dot" aria-hidden="true">{player.symbol}</span>
              <span class="bw-board__name">{player.name}</span>
              <span class="bw-board__pts">
                <strong>{row.total}</strong>
                <small>{note}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
