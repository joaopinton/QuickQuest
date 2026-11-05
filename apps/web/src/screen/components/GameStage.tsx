// Palco del gioco: occupa tutta la finestra (a schermo intero si vede solo il gioco), carica la scena
// del gioco sul contratto modulo e aggiunge per tutti i giochi il dock (pausa, schermo intero) e il
// menù di pausa. Tasti: P o Esc per la pausa, F per lo schermo intero.
import type { GameEventSubscriber, ScreenGameProps } from '@quickquest/games/contract';
import { loadersFor } from '@quickquest/games/loaders';
import { Button, t } from '@quickquest/ui';
import type { ComponentType } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPauseGate } from '../pause-gate';
import { FullscreenToggle, useFullscreen } from './FullscreenToggle';
import './game-stage.css';

export type GameStageProps = Omit<ScreenGameProps, 'isPaused'> & {
  readonly gameId: string;
  readonly gameName: string;
  /** Esce del tutto: chiude la stanza e torna alla home. */
  readonly onLeaveRoom: () => void;
};

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

function PauseMenu({ gameName, onResume, onToLobby, onLeaveRoom }: {
  gameName: string;
  onResume: () => void;
  onToLobby: () => void;
  onLeaveRoom: () => void;
}) {
  const fullscreen = useFullscreen();
  const resumeRef = useRef<HTMLDivElement>(null);
  // il fuoco va su "Riprendi": Invio o spazio ripartono subito
  useEffect(() => resumeRef.current?.querySelector('button')?.focus(), []);
  return (
    <div class="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div class="pause__card">
        <p class="pause__game">{gameName}</p>
        <h2 id="pause-title" class="pause__title">{t('pause.title')}</h2>
        <p class="pause__lead">{t('pause.lead')}</p>
        <div class="pause__actions">
          <div ref={resumeRef} class="pause__primary">
            <Button size="xl" onClick={onResume}>▶ {t('pause.resume')}</Button>
          </div>
          {fullscreen.isSupported && (
            <Button variant="secondary" size="lg" onClick={fullscreen.toggle}>
              {t(fullscreen.isOn ? 'pause.fullscreenOff' : 'pause.fullscreenOn')}
            </Button>
          )}
          <Button variant="secondary" size="lg" onClick={onToLobby}>{t('pause.toLobby')}</Button>
          <Button variant="ghost" onClick={onLeaveRoom}>{t('pause.leaveRoom')}</Button>
        </div>
      </div>
    </div>
  );
}

export function GameStage({ gameId, gameName, players, subscribeEvents, setActiveSlot, sendCue, onEndGame, onLeaveRoom }: GameStageProps) {
  const [isPaused, setPaused] = useState(false);
  const io = useRef({ setActiveSlot, sendCue });
  io.current = { setActiveSlot, sendCue };
  const gate = useMemo(
    () => createPauseGate(
      { setActiveSlot: (s) => io.current.setActiveSlot(s), sendCue: (s, c) => io.current.sendCue(s, c) },
      { paused: t('pause.cuePaused'), resumed: t('pause.cueResumed') },
    ),
    [],
  );

  const Game = useMemo<ComponentType<ScreenGameProps> | null>(() => {
    const loaders = loadersFor(gameId);
    return loaders ? lazy(() => loaders.screen().then((m) => m.Screen)) : null;
  }, [gameId]);

  const pause = useCallback(() => { if (gate.pause()) setPaused(true); }, [gate]);
  const resume = useCallback(() => { if (gate.resume()) setPaused(false); }, [gate]);
  const gameSubscribe = useCallback<GameEventSubscriber>((cb) => subscribeEvents(gate.filter(cb)), [subscribeEvents, gate]);

  // P o Esc: apre e chiude il menù (a schermo intero Esc lo usa il browser per uscire)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (TYPING_TAGS.has(tag) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key !== 'Escape' && e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      if (gate.isPaused) resume();
      else pause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gate, pause, resume]);

  // scheda nascosta o finestra ridotta: la partita si ferma da sola
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') pause(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pause]);

  if (!Game) return null;
  return (
    <div class="game-stage">
      <Suspense fallback={<div class="game-stage__loading">{t('lobby.loadingGame')}</div>}>
        <Game
          players={players}
          subscribeEvents={gameSubscribe}
          setActiveSlot={gate.setActiveSlot}
          sendCue={sendCue}
          onEndGame={onEndGame}
          isPaused={isPaused}
        />
      </Suspense>
      <div class="screen-dock screen-dock--game">
        <button type="button" class="dock-btn" aria-label={t('pause.button')} title={t('pause.button')} onClick={pause}>
          <PauseIcon />
        </button>
        <FullscreenToggle />
      </div>
      {isPaused && <PauseMenu gameName={gameName} onResume={resume} onToLobby={onEndGame} onLeaveRoom={onLeaveRoom} />}
    </div>
  );
}
