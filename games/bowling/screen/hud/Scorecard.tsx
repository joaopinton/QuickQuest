// Segnapunti classico con X e / (docs/games/bowling.md § 8): riga del giocatore di turno
// sempre visibile e tabellone completo di tutti i giocatori.

import { frameMarks, frameScores, liveTotal, splitFrames, type GameState } from '../rules';
import type { BowlingPlayer } from '../useBowlingGame';

interface RowProps {
  readonly game: GameState;
  readonly player: BowlingPlayer;
  readonly playerIndex: number;
  readonly isCurrent: boolean;
  readonly currentFrame: number;
}

function ScoreRow({ game, player, playerIndex, isCurrent, currentFrame }: RowProps) {
  const rolls = game.rolls[playerIndex] ?? [];
  const frames = splitFrames(rolls, game.frameCount);
  const scores = frameScores(rolls, game.frameCount);
  return (
    <tr class={isCurrent ? 'is-current' : ''} style={{ '--player': player.color }}>
      <th scope="row" class="bw-score__name">
        <span class="bw-score__dot" aria-hidden="true">{player.symbol}</span>
        {player.name}
      </th>
      {Array.from({ length: game.frameCount }, (_, f) => {
        const isLast = f === game.frameCount - 1;
        const marks = frameMarks(frames[f] ?? [], isLast);
        const boxes = isLast ? 3 : 2;
        const isActive = isCurrent && f === currentFrame;
        return (
          <td key={f} class={`bw-score__frame ${isActive ? 'is-active' : ''}`}>
            <span class="bw-score__marks">
              {Array.from({ length: boxes }, (_, b) => (
                <span key={b} class={`bw-score__mark ${marks[b] === 'X' || marks[b] === '/' ? 'is-hit' : ''}`}>
                  {marks[b] ?? ''}
                </span>
              ))}
            </span>
            <span class="bw-score__cum">{scores[f] ?? ''}</span>
          </td>
        );
      })}
      <td class="bw-score__total">{liveTotal(rolls, game.frameCount)}</td>
    </tr>
  );
}

export interface ScorecardProps {
  readonly game: GameState;
  readonly players: readonly BowlingPlayer[];
  readonly currentFrame: number;
  /** Solo il giocatore di turno (striscia compatta) o tutti. */
  readonly onlyCurrent?: boolean;
}

export function Scorecard({ game, players, currentFrame, onlyCurrent = false }: ScorecardProps) {
  const rows = players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ playerIndex }) => !onlyCurrent || playerIndex === game.current);
  return (
    <table class={`bw-score ${onlyCurrent ? 'bw-score--strip' : ''}`}>
      <caption class="bw-sr-only">Segnapunti</caption>
      <thead>
        <tr>
          <th scope="col" class="bw-score__name">Giocatore</th>
          {Array.from({ length: game.frameCount }, (_, f) => (
            <th key={f} scope="col">{f + 1}</th>
          ))}
          <th scope="col">Tot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ player, playerIndex }) => (
          <ScoreRow
            key={player.id}
            game={game}
            player={player}
            playerIndex={playerIndex}
            isCurrent={playerIndex === game.current}
            currentFrame={currentFrame}
          />
        ))}
      </tbody>
    </table>
  );
}
