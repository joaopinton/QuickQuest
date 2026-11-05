import { GAMES, type GameMeta } from '@quickquest/games';
import type { ScreenGameProps, ScreenPlayer } from '@quickquest/games/contract';
import { isPlayable, loadersFor } from '@quickquest/games/loaders';
import { SLOT_IDS, type LobbyPlayer } from '@quickquest/protocol';
import { Button, Logo, PlayerSlot, showToast, slotStyle, t, type Accessory, type SlotState } from '@quickquest/ui';
import type { ComponentType } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useMemo, useState } from 'preact/hooks';
import { useScreenRoom } from '../../net/useScreenRoom';
import { FullscreenToggle } from '../components/FullscreenToggle';
import { GameCard } from '../components/GameCard';
import { QrCode } from '../components/QrCode';
import './lobby.css';

/** Giocatori collegati come li vede un gioco: colore del Pupo scelto sul telefono e simbolo dello slot. */
function screenPlayers(players: readonly LobbyPlayer[]): ScreenPlayer[] {
  return players
    .filter((p) => p.state !== 'disconnected')
    .map((p) => {
      const slot = slotStyle(p.slot);
      return {
        id: p.slot,
        name: `Pupo ${p.slot.slice(1)}`,
        // il telefono manda già l'esadecimale del colore scelto (non l'id della palette)
        color: p.profile?.color ?? slot.hex,
        symbol: slot.symbol,
      };
    });
}

/** Scena di un gioco sul contratto modulo, caricata solo quando serve. */
function ModuleGame({ gameId, ...props }: ScreenGameProps & { gameId: string }) {
  const Game = useMemo<ComponentType<ScreenGameProps> | null>(() => {
    const loaders = loadersFor(gameId);
    return loaders ? lazy(() => loaders.screen().then((m) => m.Screen)) : null;
  }, [gameId]);
  if (!Game) return null;
  return (
    <Suspense fallback={<div class="lobby__loading">{t('lobby.loadingGame')}</div>}>
      <Game {...props} />
    </Suspense>
  );
}

function slotState(p: LobbyPlayer | undefined): SlotState {
  return p ? p.state : 'empty';
}

function CodeTiles({ code }: { code: string }) {
  return (
    <p class="code-tiles" data-code={code}>
      <span class="visually-hidden">{`${t('lobby.codeLabel')}: ${code.split('').join(' ')}`}</span>
      {code.split('').map((ch, i) => <span key={i} class="code-tiles__tile" aria-hidden="true" style={{ animationDelay: `${i * 80}ms` }}>{ch}</span>)}
    </p>
  );
}

function JoinPanel({ code, joinUrl }: { code: string; joinUrl: string }) {
  const host = window.location.host;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      showToast(t('lobby.copied'), 'success');
    } catch {
      showToast(joinUrl); // appunti non disponibili: almeno si mostra il link
    }
  };
  return (
    <section class="join-panel" aria-labelledby="join-title">
      <h2 id="join-title" class="join-panel__title">{t('lobby.scan')}</h2>
      <div class="join-panel__qr"><QrCode value={joinUrl} label={`QR: ${joinUrl}`} /></div>
      <p class="join-panel__or">{t('lobby.orGo')} <strong>{host}/c</strong> {t('lobby.andType')}</p>
      <CodeTiles code={code} />
      <Button variant="ghost" onClick={copy}>{t('lobby.copy')}</Button>
    </section>
  );
}

function GamePicker({ onBack, onStartGame }: { onBack: () => void; onStartGame: (gameId: string) => void }) {
  const pick = (g: GameMeta) => {
    if (isPlayable(g.id)) {
      onStartGame(g.id);
    } else {
      showToast(t('lobby.laterToast', { name: g.name }));
    }
  };
  return (
    <section class="picker" aria-labelledby="picker-title">
      <div class="picker__head">
        <h1 id="picker-title" class="lobby__title">{t('lobby.chooseTitle')}</h1>
        <Button variant="secondary" onClick={onBack}>← {t('lobby.back')}</Button>
      </div>
      <div class="bento">
        {GAMES.map((g, i) => <GameCard key={g.id} game={g} isFeatured={i === 0} onOpen={pick} />)}
      </div>
    </section>
  );
}

function PlayingScreen({
  players,
  gameId,
  onEndGame,
}: {
  players: readonly LobbyPlayer[];
  gameId: string | null;
  onEndGame: () => void;
}) {
  const name = gameId === 'bowling' ? 'Bowling' : (gameId ?? 'Bowling');
  const bySlot = new Map(players.map((p) => [p.slot, p]));

  return (
    <main class="lobby__main" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '32px' }}>
      <section class="lobby__players" style={{ maxWidth: '800px', width: '100%', margin: '0 auto' }}>
        <h1 class="lobby__title" style={{ fontSize: '3rem' }}>
          🎳 {t('lobby.gameRunningTitle', { name })}
        </h1>
        <p class="lobby__count" style={{ fontSize: '1.25rem', marginTop: '8px' }}>
          {t('lobby.gameRunningLead')}
        </p>
        <ul class="lobby__slots" style={{ justifyContent: 'center', margin: '32px 0' }}>
          {SLOT_IDS.map((id) => {
            const p = bySlot.get(id);
            if (!p || p.state === 'disconnected') return null;
            return (
              <li key={id}>
                <PlayerSlot
                  slot={id}
                  state={slotState(p)}
                  pupoColor={p.profile?.color}
                  accessory={(p.profile?.accessory ?? 'none') as Accessory}
                />
              </li>
            );
          })}
        </ul>
        <div class="lobby__actions" style={{ justifyContent: 'center' }}>
          <Button variant="secondary" size="lg" onClick={onEndGame}>
            {t('lobby.endGame')}
          </Button>
        </div>
      </section>
    </main>
  );
}

export function Lobby() {
  const { code, players, joinUrl, phase, selectedGame, startGame, returnToLobby, setActiveSlot, onGameEvent, sendCue } = useScreenRoom();
  const [isChoosing, setChoosing] = useState(false);
  const active = players.filter((p) => p.state !== 'disconnected').length;
  const bySlot = new Map(players.map((p) => [p.slot, p]));

  const handleStartGame = (gameId: string) => {
    startGame(gameId);
    setChoosing(false);
  };

  return (
    <div class="lobby">
      <div class="lobby__backdrop" aria-hidden="true">
        <svg viewBox="0 0 1600 300" preserveAspectRatio="none">
          <path d="M0 140 C260 60 520 120 800 110 C1080 100 1300 40 1600 90 V300 H0 Z" fill="#B7E58E" />
          <path d="M0 200 C300 150 600 210 900 190 C1200 170 1400 150 1600 180 V300 H0 Z" fill="#7ED957" />
          <path d="M0 250 C400 220 800 260 1200 240 C1400 232 1500 236 1600 240 V300 H0 Z" fill="#3FAE4A" />
        </svg>
      </div>
      <header class="lobby__bar">
        <a href="/" aria-label={t('nav.home')}><Logo size="md" /></a>
        <p class="lobby__badge">{t('lobby.demoBadge')}</p>
      </header>
      {/* schermo intero per lobby e per ogni gioco: sta sopra qualsiasi scena */}
      <FullscreenToggle />

      {phase === 'playing' ? (
        loadersFor(selectedGame) ? (
          <ModuleGame
            gameId={selectedGame!}
            players={screenPlayers(players)}
            subscribeEvents={onGameEvent}
            setActiveSlot={setActiveSlot}
            sendCue={sendCue}
            onEndGame={returnToLobby}
          />
        ) : (
          <PlayingScreen players={players} gameId={selectedGame} onEndGame={returnToLobby} />
        )
      ) : isChoosing ? (
        <GamePicker onBack={() => setChoosing(false)} onStartGame={handleStartGame} />
      ) : (
        <main class="lobby__main">
          <JoinPanel code={code} joinUrl={joinUrl} />
          <section class="lobby__players" aria-labelledby="lobby-title">
            <h1 id="lobby-title" class="lobby__title">{t('lobby.title')}</h1>
            <p class="lobby__count" aria-live="polite">
              {active === 0 ? t('lobby.noPlayers') : t('lobby.playersCount', { n: active })}
            </p>
            <ul class="lobby__slots">
              {SLOT_IDS.map((id) => {
                const p = bySlot.get(id);
                return (
                  <li key={id}>
                    <PlayerSlot
                      slot={id}
                      state={slotState(p)}
                      pupoColor={p?.profile?.color}
                      accessory={(p?.profile?.accessory ?? 'none') as Accessory}
                    />
                  </li>
                );
              })}
            </ul>
            <div class="lobby__actions">
              <Button size="xl" disabled={active === 0} onClick={() => setChoosing(true)}>{t('lobby.chooseGame')}</Button>
              {import.meta.env.DEV && (
                <Button variant="ghost" onClick={() => window.open(`/c/${code}?sim`, '_blank', 'noopener')}>
                  + {t('lobby.devAddPhone')}
                </Button>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
