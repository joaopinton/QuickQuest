// Card di un gioco: metà superiore nell'accento del gioco, metà inferiore bianca (docs/08 § 4).
import type { GameMeta } from '@quickquest/games';
import { GameIcon, t } from '@quickquest/ui';
import type { JSX } from 'preact';

export interface GameCardProps {
  game: GameMeta;
  /** Nella lobby: si può avviare adesso. */
  isPlayable?: boolean;
  onOpen?: (game: GameMeta) => void;
  isSelected?: boolean;
}

export function playersLabel(g: GameMeta): string {
  if (g.players.min !== g.players.max) return t('games.players', { min: g.players.min, max: g.players.max });
  return g.players.max === 1 ? t('games.playersOne') : t('games.playersExact', { n: g.players.max });
}

export function GameCard({ game, isPlayable = false, onOpen, isSelected = false }: GameCardProps) {
  const style = { '--accent': game.accent } as JSX.CSSProperties;
  let status = game.status === 'soon' ? t('games.statusSoon') : t('games.statusLater');
  if (isPlayable) status = t('games.statusPlay');
  const badge = isPlayable ? 'play' : game.status;
  const body = (
    <>
      <div class="game-card__art" data-game={game.id}>
        <span class={`game-card__badge game-card__badge--${badge}`}>{status}</span>
        <span class="game-card__icon"><GameIcon id={game.id} size="54%" /></span>
      </div>
      <div class="game-card__body">
        <h3 class="game-card__name">{game.name}</h3>
        <p class="game-card__tagline">{game.tagline}</p>
        <p class="game-card__meta">
          <span>{playersLabel(game)}</span>
          <span aria-hidden="true">·</span>
          <span>{t('games.minutes', { n: game.estMinutes })}</span>
        </p>
      </div>
    </>
  );
  const cls = `game-card ${isSelected ? 'is-selected' : ''}`;
  if (!onOpen) return <article class={cls} style={style}>{body}</article>;
  return (
    <button type="button" class={cls} style={style} onClick={() => onOpen(game)} aria-label={t('games.openDetails', { name: game.name })}>
      {body}
    </button>
  );
}
