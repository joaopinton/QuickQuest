// Schermo del Barber shop sul contratto modulo (games/contract.ts, docs/games/barber.md).
// Il motore (session.ts) gestisce scena, capelli e regole; qui c'è solo l'HUD: impostazioni,
// richiesta del cliente con la figurina, timer, pettine, voto allo specchio e podio.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import { COMB_LABELS, parseBarberEvent, type AssistLevel } from '../shared/events';
import { findHaircut } from '../shared/haircuts';
import { HaircutFigure, Podium, Stars } from './hud';
import { chairViewName } from './pointing';
import { computeAwards, currentBarber, currentHaircut, standings } from './rules';
import { createBarberSession, type BarberSession, type SessionSnapshot } from './session';
import './barber.css';

const DEFAULT_ROSTER: readonly ScreenPlayer[] = [{ id: 'P1', name: 'Pupo 1', color: '#2EC4B6', symbol: '●' }];
const ASSIST_LABELS: Readonly<Record<AssistLevel, string>> = { easy: 'Facile', normal: 'Normale', pro: 'Pro' };
const INITIAL: SessionSnapshot = { phase: 'setup', game: null, countdown: 0, timeLeft: 0, comb: 1, turn: 0, result: null };

export function Screen({ players, subscribeEvents, setActiveSlot, sendCue, onEndGame, isPaused }: ScreenGameProps) {
  const roster = players.length > 0 ? players : DEFAULT_ROSTER;
  const [snap, setSnap] = useState<SessionSnapshot>(INITIAL);
  const [assist, setAssist] = useState<AssistLevel>('normal');
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<BarberSession | null>(null);
  const rosterRef = useRef(roster);
  const propsRef = useRef({ setActiveSlot, sendCue });
  rosterRef.current = roster;
  propsRef.current = { setActiveSlot, sendCue };

  const playerById = (id: string): ScreenPlayer =>
    rosterRef.current.find((p) => p.id === id) ?? rosterRef.current[0] ?? DEFAULT_ROSTER[0]!;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let session: BarberSession;
    try {
      session = createBarberSession({
        container,
        sendCue: (slot, cue) => propsRef.current.sendCue(slot, cue),
        setActiveSlot: (slot) => propsRef.current.setActiveSlot(slot),
        onSnapshot: setSnap,
        playerById,
      });
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return;
    }
    sessionRef.current = session;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) session.resize(width, height);
      }
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      session.dispose();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la sessione vive quanto lo schermo
  }, []);

  useEffect(() => {
    sessionRef.current?.setPaused(isPaused);
  }, [isPaused]);

  useEffect(
    () =>
      subscribeEvents((slot, e) => {
        const parsed = parseBarberEvent(e);
        if (parsed) sessionRef.current?.handleEvent(slot, parsed);
        else propsRef.current.sendCue(slot, { kind: 'error', text: 'Comando non valido' });
      }),
    [subscribeEvents],
  );

  const start = () => sessionRef.current?.start(roster.map((p) => p.id), assist);
  const { phase, game } = snap;
  // Allo specchio le regole sono già passate al cliente dopo: l'HUD resta su quello appena servito
  const served = phase === 'mirror' ? snap.result : null;
  const barber = served ? playerById(served.playerId) : game ? playerById(currentBarber(game).playerId) : null;
  const cut = served ? findHaircut(served.haircutId) : game ? currentHaircut(game) : null;
  const clientNumber = served ? served.round : game?.currentRound ?? 1;
  const isWorking = phase === 'intro' || phase === 'cutting' || phase === 'mirror';
  const board = game ? standings(game) : [];
  const resultPlayer = snap.result ? playerById(snap.result.playerId) : null;
  const isHurry = phase === 'cutting' && snap.timeLeft <= 10;

  return (
    <div class="bb-screen">
      <div ref={containerRef} class="bb-canvas" />

      <header class="bb-header">
        <div class="bb-badge" style={barber ? { '--player': barber.color } : undefined}>
          <span aria-hidden="true">💈</span>
          {isWorking && barber && game ? (
            <>
              <span>
                Barbiere: <strong style={{ color: barber.color }}>{barber.name}</strong>
              </span>
              <span class="bb-badge__meta">
                Cliente {clientNumber}/{game.rounds}
              </span>
            </>
          ) : (
            <span>QuickQuest · Barber shop</span>
          )}
        </div>
        <div class="bb-header__actions">
          {isWorking && (
            <button type="button" class="bb-btn bb-btn--secondary" onClick={() => sessionRef.current?.toSetup()}>
              ⚙️ Impostazioni
            </button>
          )}
          <button type="button" class="bb-btn bb-btn--secondary" onClick={onEndGame}>
            ← Lobby
          </button>
        </div>
      </header>

      {isWorking && cut && (
        <aside class="bb-request" aria-label="Richiesta del cliente">
          <span class="bb-eyebrow">
            {cut.icon} Richiesta
          </span>
          <strong class="bb-request__name">{cut.name}</strong>
          <HaircutFigure cut={cut} />
          <p class="bb-request__line">“{cut.line}”</p>
        </aside>
      )}

      {phase === 'cutting' && (
        <div class="bb-tools" aria-live="polite">
          <span class={`bb-timer ${isHurry ? 'is-hurry' : ''}`}>⏱ {snap.timeLeft}s</span>
          <span class="bb-chip">Pettine: {COMB_LABELS[snap.comb]}</span>
          <span class="bb-chip">Vista: {chairViewName(snap.turn)}</span>
        </div>
      )}

      {isWorking && game && game.players.length > 1 && (
        <ol class="bb-board" aria-label="Classifica">
          {board.map((row) => {
            const p = playerById(row.playerId);
            return (
              <li key={row.playerId} class={`bb-board__row ${barber?.id === p.id ? 'is-active' : ''}`} style={{ '--player': p.color }}>
                <span>
                  {p.symbol} {p.name}
                </span>
                <strong>{row.score}</strong>
              </li>
            );
          })}
        </ol>
      )}

      {phase === 'intro' && barber && (
        <div class="bb-countdown" role="status" style={{ '--player': barber.color }}>
          <p>
            Tocca a <strong>{barber.name}</strong>
          </p>
          <span key={snap.countdown} class="bb-countdown__num">
            {snap.countdown}
          </span>
          <small>📱 Punta il telefono verso la testa del cliente</small>
        </div>
      )}

      {phase === 'cutting' && barber && (
        <p class="bb-prompt" style={{ '--player': barber.color }}>
          📱 Tieni premuto per la macchinetta · tocca per le forbici · gira la poltrona per vedere i lati
        </p>
      )}

      {phase === 'mirror' && snap.result && resultPlayer && (
        <div class="bb-verdict" role="status" style={{ '--player': resultPlayer.color }}>
          <span class="bb-eyebrow">Allo specchio</span>
          <Stars count={snap.result.stars} />
          <p class="bb-verdict__line">{snap.result.line}</p>
          <small>
            Precisione {Math.round(snap.result.accuracy * 100)}%
            {snap.result.timeBonus > 0 ? ` · bonus tempo +${snap.result.timeBonus}` : ''}
          </small>
        </div>
      )}

      {phase === 'setup' && !loadError && (
        <div class="bb-modal-backdrop">
          <section class="bb-modal" aria-labelledby="bb-setup-title">
            <span class="bb-eyebrow">Bottega dal 1962</span>
            <h1 id="bb-setup-title" class="bb-modal__title">
              Barber shop
            </h1>
            <p class="bb-modal__lead">3 clienti a testa, 90 secondi ciascuno. Tutti ricevono la stessa richiesta: vince la mano più ferma.</p>
            <div class="bb-roster">
              {roster.map((p) => (
                <span key={p.id} class="bb-roster__chip" style={{ '--player': p.color }}>
                  {p.symbol} <strong>{p.name}</strong>
                </span>
              ))}
            </div>
            <div class="bb-assist" role="radiogroup" aria-label="Aiuto">
              <span class="bb-assist__label">Aiuto</span>
              {(['easy', 'normal', 'pro'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={assist === lvl}
                  class={`bb-pill ${assist === lvl ? 'is-active' : ''}`}
                  onClick={() => setAssist(lvl)}
                >
                  {ASSIST_LABELS[lvl]}
                </button>
              ))}
            </div>
            <button type="button" class="bb-btn bb-btn--primary bb-btn--big" onClick={start}>
              Apri la bottega
            </button>
          </section>
        </div>
      )}

      {phase === 'over' && game && (
        <Podium
          board={board}
          awards={computeAwards(game)}
          playerById={playerById}
          onLobby={onEndGame}
          onSetup={() => sessionRef.current?.toSetup()}
          onRematch={() => sessionRef.current?.start(roster.map((p) => p.id), game.assist)}
        />
      )}

      {loadError && (
        <div class="bb-modal-backdrop" role="alert">
          <section class="bb-modal">
            <h2 class="bb-modal__title">Impossibile aprire la bottega 3D</h2>
            <p class="bb-modal__lead">{loadError}</p>
            <button type="button" class="bb-btn bb-btn--primary" onClick={onEndGame}>
              Torna alla lobby
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
