import { GAMES, type GameMeta } from '@quickquest/games';
import { Dialog, GameIcon, t } from '@quickquest/ui';
import { StickerCluster } from '../components/Decor';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { GameCard, playersLabel } from '../components/GameCard';
import { Page } from '../components/SiteChrome';

function GameDetails({ game }: { game: GameMeta }) {
  const style = { '--accent': game.accent } as JSX.CSSProperties;
  return (
    <div class="game-details" style={style}>
      <div class="game-details__art"><GameIcon id={game.id} size="40%" /></div>
      <p class={`game-card__badge game-card__badge--${game.status}`}>
        {game.status === 'soon' ? t('games.statusSoon') : t('games.statusLater')}
      </p>
      <h2 class="dialog-title">{game.name}</h2>
      <p class="dialog-lead">{game.tagline}</p>
      <h3 class="game-details__h">{t('games.gesture')}</h3>
      <p>{game.gesture}</p>
      <p class="game-card__meta">
        <span>{playersLabel(game)}</span>
        <span aria-hidden="true">·</span>
        <span>{t('games.minutes', { n: game.estMinutes })}</span>
      </p>
    </div>
  );
}

export function Games() {
  const [open, setOpen] = useState<GameMeta | null>(null);
  return (
    <Page class="games-page">
      <section class="page-hero page-hero--art">
        <div>
          <h1 class="page-hero__title">{t('games.title')}</h1>
          <p class="page-hero__lead">{t('games.lead')}</p>
        </div>
        <StickerCluster games={GAMES} />
      </section>
      <section class="section">
        <div class="bento bento--catalog">
          {GAMES.map((g, i) => <GameCard key={g.id} game={g} isFeatured={i === 0} onOpen={setOpen} />)}
        </div>
      </section>
      <Dialog isOpen={open !== null} onClose={() => setOpen(null)} title={open?.name ?? ''} accent={open?.accent}>
        {open && <GameDetails game={open} />}
      </Dialog>
    </Page>
  );
}
