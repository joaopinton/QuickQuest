import { findGame, GAMES, type GameMeta } from '@quickquest/games';
import type { ScreenPlayer } from '@quickquest/games/contract';
import { isPlayable, loadersFor } from '@quickquest/games/loaders';
import { SLOT_IDS, type LobbyPlayer, type SlotId } from '@quickquest/protocol';
import { Button, displayName, Logo, normalizeStyle, PlayerSlot, showToast, slotStyle, t, type SlotState } from '@quickquest/ui';
import { useLocation } from 'preact-iso';
import { useEffect, useState } from 'preact/hooks';
import { useScreenRoom } from '../../net/useScreenRoom';
import { FullscreenToggle } from '../components/FullscreenToggle';
import { GameStage } from '../components/GameStage';
import { GameCard } from '../components/GameCard';
import { QrCode } from '../components/QrCode';
import './lobby.css';

/** Giocatori collegati come li vede un gioco: colore del Piggy scelto sul telefono e simbolo dello slot. */
function screenPlayers(players: readonly LobbyPlayer[]): ScreenPlayer[] {
  return players
    .filter((p) => p.state !== 'disconnected')
    .map((p) => {
      const slot = slotStyle(p.slot);
      return {
        id: p.slot,
        name: displayName(p.profile?.name, p.slot),
        // il telefono manda già l'esadecimale del colore scelto (non l'id della palette)
        color: p.profile?.color ?? slot.hex,
        symbol: slot.symbol,
      };
    });
}

function slotState(p: LobbyPlayer | undefined): SlotState {
  return p ? p.state : 'empty';
}

const KICK_CONFIRM_MS = 3000;

/** Togli un giocatore: primo tocco chiede conferma, il secondo (entro 3 s) lo toglie. */
function KickButton({ slot, name, onKick }: { slot: SlotId; name: string; onKick: (slot: SlotId) => void }) {
  const [isArmed, setArmed] = useState(false);
  useEffect(() => {
    if (!isArmed) return;
    const id = setTimeout(() => setArmed(false), KICK_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [isArmed]);
  return (
    <button
      type="button"
      class={`lobby__kick ${isArmed ? 'is-armed' : ''}`}
      aria-label={t('lobby.kickLabel', { name })}
      onClick={() => {
        if (!isArmed) { setArmed(true); return; }
        setArmed(false);
        onKick(slot);
        showToast(t('lobby.kickToast', { name }));
      }}
    >
      {isArmed ? t('lobby.kickConfirm') : `✕ ${t('lobby.kick')}`}
    </button>
  );
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
        {GAMES.map((g) => <GameCard key={g.id} game={g} isPlayable={isPlayable(g.id)} onOpen={pick} />)}
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
                  piggyColor={p.profile?.color}
                  look={normalizeStyle(p.profile as Record<string, unknown> | null)}
                  name={displayName(p.profile?.name, id)}
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
  const { code, players, joinUrl, phase, selectedGame, startGame, returnToLobby, setActiveSlot, onGameEvent, sendCue, kick } = useScreenRoom();
  const { route } = useLocation();
  const isPlaying = phase === 'playing';
  const [isChoosing, setChoosing] = useState(false);
  const active = players.filter((p) => p.state !== 'disconnected').length;
  const bySlot = new Map(players.map((p) => [p.slot, p]));

  const handleStartGame = (gameId: string) => {
    startGame(gameId);
    setChoosing(false);
  };

  return (
    <div class="lobby">
      {!isPlaying && <div class="lobby__backdrop" aria-hidden="true">
        <svg viewBox="0 0 1600 300" preserveAspectRatio="none">
          <path d="M0 140 C260 60 520 120 800 110 C1080 100 1300 40 1600 90 V300 H0 Z" fill="#B7E58E" />
          <path d="M0 200 C300 150 600 210 900 190 C1200 170 1400 150 1600 180 V300 H0 Z" fill="#7ED957" />
          <path d="M0 250 C400 220 800 260 1200 240 C1400 232 1500 236 1600 240 V300 H0 Z" fill="#3FAE4A" />
        </svg>
      </div>}
      {!isPlaying && (
        <header class="lobby__bar">
          <a href="/" aria-label={t('nav.home')}><Logo size="md" /></a>
          <p class="lobby__badge">{t('lobby.demoBadge')}</p>
        </header>
      )}
      {/* in partita il dock lo mette il palco del gioco, insieme alla pausa */}
      {!isPlaying && <div class="screen-dock"><FullscreenToggle /></div>}

      {isPlaying ? (
        loadersFor(selectedGame) ? (
          <GameStage
            gameId={selectedGame!}
            gameName={findGame(selectedGame!)?.name ?? selectedGame!}
            players={screenPlayers(players)}
            subscribeEvents={onGameEvent}
            setActiveSlot={setActiveSlot}
            sendCue={sendCue}
            onEndGame={returnToLobby}
            onLeaveRoom={() => { returnToLobby(); route('/'); }}
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
                      piggyColor={p?.profile?.color}
                      look={normalizeStyle(p?.profile as Record<string, unknown> | null | undefined)}
                      name={p ? displayName(p.profile?.name, id) : undefined}
                    />
                    {p && <KickButton slot={id} name={displayName(p.profile?.name, id)} onKick={kick} />}
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
