// Schermo dei Tiri liberi sul contratto modulo (games/contract.ts, docs/games/free-throw.md).
// Gestisce il flusso della partita (Classica 10 tiri, Veloce 5 tiri, A tempo 60s),
// la simulazione fisica Rapier3D + aerodinamica + retina Verlet, lo slow-mo quando la palla
// balla sul ferro, e l'HUD con i premi di fine partita.

import type { SlotId } from '@quickquest/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScreenGameProps, ScreenPlayer } from '../../contract';
import {
  parseShootEvent,
  type AssistLevel,
  type FreeThrowMode,
  type FreeThrowShotData,
  type ResolvedOutcome,
} from '../shared/events';
import { createFreeThrowPhysicsWorld, type FreeThrowPhysicsWorld } from './physics';
import {
  applyShotAssist,
  computeAwards,
  createFreeThrowGame,
  currentShooter,
  feedbackMessageFor,
  isShotMade,
  pointsForOutcome,
  recordShot,
  shouldShowGuideArc,
  standings,
  tickTimedMode,
  type FreeThrowGameState,
} from './rules';
import { createFreeThrowScene, type FreeThrowScene } from './scene';
import './free-throw.css';

const DEFAULT_ROSTER: readonly ScreenPlayer[] = [
  { id: 'P1', name: 'Bubù 1', color: '#FF8A2B', symbol: '●' },
];

const HOLD_AFTER_SHOT_MS = 1450;
const SWISH_HOLD_MS = 2100;

interface ToastBanner {
  readonly title: string;
  readonly subtitle: string;
  readonly outcome: ResolvedOutcome;
  readonly color: string;
  readonly seq: number;
}

function playerById(roster: readonly ScreenPlayer[], id: string): ScreenPlayer {
  return roster.find((p) => p.id === id) ?? roster[0] ?? DEFAULT_ROSTER[0]!;
}

export function Screen({
  players: playersProp,
  subscribeEvents,
  setActiveSlot,
  sendCue,
  onEndGame,
  isPaused,
}: ScreenGameProps) {
  const lobbyPlayers = playersProp.length > 0 ? playersProp : DEFAULT_ROSTER;
  const [roster, setRoster] = useState<readonly ScreenPlayer[]>(lobbyPlayers);
  const [selectedAssist, setSelectedAssist] = useState<AssistLevel>('normal');
  const [game, setGame] = useState<FreeThrowGameState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastBanner | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const physicsRef = useRef<FreeThrowPhysicsWorld | null>(null);
  const sceneRef = useRef<FreeThrowScene | null>(null);
  const gameRef = useRef<FreeThrowGameState | null>(null);
  const rosterRef = useRef<readonly ScreenPlayer[]>(roster);
  const shotInFlightRef = useRef(false);
  const toastSeqRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const pausedRef = useRef(isPaused);
  const resolveShotRef = useRef<() => void>(() => {});
  const sendCueRef = useRef(sendCue);

  gameRef.current = game;
  rosterRef.current = roster;
  pausedRef.current = isPaused;
  sendCueRef.current = sendCue;

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  const syncSceneToTurn = (state: FreeThrowGameState, lineup: readonly ScreenPlayer[] = rosterRef.current) => {
    const sc = sceneRef.current;
    const phys = physicsRef.current;
    if (!sc || !phys) return;
    const shooterStats = currentShooter(state);
    const player = playerById(lineup, shooterStats.playerId);

    phys.resetBall();
    sc.resetShooterPose();
    sc.resetCamera();
    sc.setPlayerColor(player.color);
    sc.setGuideArcVisible(shouldShowGuideArc(state.assist, shooterStats.attempts));

    const subtitle =
      state.mode === 'timed'
        ? `${Math.ceil(state.timeRemainingS)}s rimasti`
        : state.isTiebreaker
          ? `Spareggio · Giro ${state.currentRound}`
          : `Tiro ${state.currentRound}/${state.totalRounds}`;

    sc.setScoreboard({
      playerName: player.name,
      color: player.color,
      subtitle,
      score: shooterStats.score,
      streak: shooterStats.streak,
    });
  };

  resolveShotRef.current = () => {
    const phys = physicsRef.current;
    const sc = sceneRef.current;
    const current = gameRef.current;
    if (!phys || !sc || !current) {
      shotInFlightRef.current = false;
      setIsBusy(false);
      return;
    }

    const telemetry = phys.getTelemetry();
    const shooterBefore = currentShooter(current);
    const playerInfo = playerById(rosterRef.current, shooterBefore.playerId);
    const { points, multiplier } = pointsForOutcome(telemetry.outcome, current.mode, shooterBefore.streak);
    const fb = feedbackMessageFor(telemetry.outcome, telemetry.hint, points, multiplier);

    // Effetto visivo in scena e reazione dei Bubù sulle gradinate
    const fxKind = telemetry.outcome === 'swish' ? 'swish' : isShotMade(telemetry.outcome) ? 'make' : 'miss';
    sc.playShotOutcomeFx(fxKind, playerInfo.color);

    // Registra il tiro nelle regole
    const nextState = recordShot(current, telemetry.outcome);
    gameRef.current = nextState;
    setGame(nextState);

    // Aggiorna il tabellone LED sopra il canestro
    const updatedStats = nextState.players.find((p) => p.playerId === shooterBefore.playerId) ?? shooterBefore;
    sc.setScoreboard({
      playerName: playerInfo.name,
      color: playerInfo.color,
      subtitle:
        current.mode === 'timed'
          ? `${Math.ceil(nextState.timeRemainingS)}s rimasti`
          : `Tiro ${current.currentRound}/${current.totalRounds}`,
      score: updatedStats.score,
      streak: updatedStats.streak,
      message: fb.title,
    });

    // Invia il cue aptico + consiglio al telefono che ha tirato
    sendCueRef.current(playerInfo.id as SlotId, {
      kind: fb.isGood ? 'success' : 'tap',
      text: fb.cueText,
    });

    toastSeqRef.current += 1;
    setToast({
      title: fb.title,
      subtitle: fb.cueText,
      outcome: telemetry.outcome,
      color: playerInfo.color,
      seq: toastSeqRef.current,
    });

    const holdMs =
      current.mode === 'timed'
        ? 550 // nella modalità a tempo la palla torna subito!
        : telemetry.outcome === 'swish'
          ? SWISH_HOLD_MS
          : HOLD_AFTER_SHOT_MS;

    later(() => {
      setToast(null);
      shotInFlightRef.current = false;
      const latest = gameRef.current;
      if (latest && !latest.isOver) {
        syncSceneToTurn(latest);
      }
      setIsBusy(false);
    }, holdMs);
  };

  // Inizializzazione Rapier3D + Three.js
  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const container = containerRef.current;
    if (!container) return;

    const init = async () => {
      const phys = await createFreeThrowPhysicsWorld();
      if (disposed) {
        phys.dispose();
        return;
      }
      physicsRef.current = phys;

      const sc = createFreeThrowScene(container, phys);
      sceneRef.current = sc;
      sc.setPlayerColor(lobbyPlayers[0]?.color ?? '#FF8A2B');
      sc.setScoreboard({
        playerName: 'Scuola Basket',
        color: '#FF8A2B',
        subtitle: 'Pronti in lunetta!',
        score: 0,
        streak: 0,
      });

      let lastTime = performance.now();
      const loop = (now: number) => {
        if (pausedRef.current) {
          lastTime = now;
          raf = requestAnimationFrame(loop);
          return;
        }
        const rawDt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        // Slow-mo leggero (0.55x) quando la palla balla sul ferro col fiato sospeso (docs/11 § 4.4)
        const timeScale = phys.isBallDancingOnRim() ? 0.55 : 1.0;
        const simDt = rawDt * timeScale;

        phys.step(simDt);
        sc.update(rawDt);

        // Orologio della modalità a tempo (60 s)
        const st = gameRef.current;
        if (st && st.mode === 'timed' && !st.isOver) {
          const ticked = tickTimedMode(st, rawDt);
          if (ticked !== st) {
            const prevPlayer = st.currentPlayerIndex;
            gameRef.current = ticked;
            setGame(ticked);
            if (ticked.currentPlayerIndex !== prevPlayer && !ticked.isOver) {
              shotInFlightRef.current = false;
              setIsBusy(false);
              syncSceneToTurn(ticked);
            }
          }
        }

        if (shotInFlightRef.current && phys.isShotResolved()) {
          shotInFlightRef.current = false;
          resolveShotRef.current();
        }

        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) sc.resize(width, height);
        }
      });
      ro.observe(container);
    };

    init()
      .then(() => {
        if (!disposed) setIsReady(true);
      })
      .catch((err: unknown) => {
        console.error('[free-throw] errore caricamento scena/fisica', err);
        if (!disposed) setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      clearTimers();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      physicsRef.current?.dispose();
      physicsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGame = (
    mode: FreeThrowMode = 'classic',
    assist: AssistLevel = selectedAssist,
    lineup: readonly ScreenPlayer[] = lobbyPlayers,
  ) => {
    clearTimers();
    shotInFlightRef.current = false;
    setToast(null);
    setRoster(lineup);
    const newState = createFreeThrowGame(
      lineup.map((p) => p.id),
      { mode, assist },
    );
    gameRef.current = newState;
    setGame(newState);
    setIsBusy(false);
    syncSceneToTurn(newState, lineup);
  };

  const canShoot = isReady && game !== null && !game.isOver && !isBusy;
  const activeStats = game ? currentShooter(game) : null;
  const activePlayer = activeStats ? playerById(roster, activeStats.playerId) : null;
  const activeSlotId: SlotId | null = canShoot && activePlayer ? activePlayer.id : null;

  // Comunica ai telefoni di chi è il turno
  const setActiveSlotRef = useRef(setActiveSlot);
  setActiveSlotRef.current = setActiveSlot;
  useEffect(() => {
    setActiveSlotRef.current(activeSlotId);
  }, [activeSlotId]);
  useEffect(() => () => setActiveSlotRef.current(null), []);

  // Ricezione dell'evento `shoot` dal telefono di turno
  const handleShootRef = useRef<(slot: SlotId, rawShot: FreeThrowShotData) => void>(() => {});
  handleShootRef.current = (slot, rawShot) => {
    const phys = physicsRef.current;
    const sc = sceneRef.current;
    const st = gameRef.current;
    if (!phys || !sc || !st || !canShoot || shotInFlightRef.current) return;
    if (slot !== activeSlotId) return;

    const assistedShot = applyShotAssist(rawShot, st.assist);

    sc.playShooterRelease();
    phys.launchBall(assistedShot);
    shotInFlightRef.current = true;
    setIsBusy(true);
  };

  useEffect(
    () =>
      subscribeEvents((slot, e) => {
        const parsed = parseShootEvent(e);
        if (parsed) {
          handleShootRef.current(slot, parsed);
        } else {
          sendCueRef.current(slot, { kind: 'error', text: 'Tiro non valido' });
        }
      }),
    [subscribeEvents],
  );

  const board = game ? standings(game) : [];
  const awards = game && game.isOver ? computeAwards(game) : [];

  return (
    <div class="ft-screen">
      <div ref={containerRef} class="ft-canvas" />

      {/* Barra superiore */}
      <header class="ft-header">
        <div class="ft-turn-badge" style={activePlayer ? { '--player': activePlayer.color } : undefined}>
          <span>🏀</span>
          {game && !game.isOver && activePlayer && activeStats ? (
            <>
              <span aria-hidden="true">{activePlayer.symbol}</span>
              <span>
                Tocca a <strong style={{ color: activePlayer.color }}>{activePlayer.name}</strong>
              </span>
              <span class="ft-turn-meta">
                {game.mode === 'timed'
                  ? `⏱ ${Math.ceil(game.timeRemainingS)}s`
                  : game.isTiebreaker
                    ? `⚡ Spareggio`
                    : `Tiro ${game.currentRound}/${game.totalRounds}`}
              </span>
              {activeStats.streak >= 2 && (
                <span class="ft-streak-pill">
                  🔥 {activeStats.streak} di fila{game.mode === 'timed' && activeStats.streak >= 3 ? ' (×2!)' : ''}
                </span>
              )}
            </>
          ) : (
            <span>QuickQuest · Tiri liberi</span>
          )}
        </div>

        <div class="ft-header-actions">
          {game && !game.isOver && (
            <button type="button" class="ft-btn ft-btn--secondary" onClick={() => setGame(null)}>
              ⚙️ Modalità
            </button>
          )}
          <button type="button" class="ft-btn ft-btn--secondary" onClick={onEndGame}>
            ← Lobby
          </button>
        </div>
      </header>

      {/* Pallini dei tiri del turno */}
      {game && !game.isOver && activeStats && game.mode !== 'timed' && (
        <div class="ft-shot-strip" aria-label="Tiri del giocatore">
          <div class="ft-dots">
            {Array.from({ length: game.totalRounds }, (_, i) => {
              const shotRec = activeStats.history[i];
              let cls = 'ft-dot';
              let label = String(i + 1);
              if (shotRec) {
                if (shotRec.outcome === 'swish') {
                  cls += ' is-swish';
                  label = '3';
                } else if (isShotMade(shotRec.outcome)) {
                  cls += ' is-made';
                  label = '2';
                } else {
                  cls += ' is-miss';
                  label = '×';
                }
              } else if (i + 1 === game.currentRound) {
                cls += ' is-current';
              }
              return (
                <span key={i} class={cls}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Classifica live */}
      {game && !game.isOver && (
        <aside class="ft-leaderboard" aria-label="Classifica">
          <ol class="ft-leaderboard__list">
            {board.map((row) => {
              const p = playerById(roster, row.playerId);
              const isCurrent = activePlayer?.id === row.playerId;
              return (
                <li
                  key={row.playerId}
                  class={`ft-leaderboard__row ${isCurrent ? 'is-active' : ''}`}
                  style={{ '--player': p.color }}
                >
                  <span>
                    {p.symbol} {p.name}
                  </span>
                  <span class="ft-leaderboard__score">{row.score}</span>
                </li>
              );
            })}
          </ol>
        </aside>
      )}

      {/* Toast centrale dell'esito (CIUFF! / CANESTRO! / FERRO!) */}
      {toast && (
        <div
          key={toast.seq}
          class={`ft-toast ${toast.outcome === 'swish' ? 'ft-toast--swish' : ''}`}
          style={{ '--accent': toast.color }}
          role="status"
        >
          <p class="ft-toast__title">{toast.title}</p>
        </div>
      )}

      {/* Pillola compatta in basso */}
      {game && !game.isOver && activePlayer && !isBusy && (
        <div class="ft-prompt" style={{ '--player': activePlayer.color }} aria-live="polite">
          <p class="ft-prompt__main">
            📱 <strong style={{ color: activePlayer.color }}>{activePlayer.name}</strong> · Carica sopra la testa e chiudi a gancio
          </p>
        </div>
      )}

      {/* Scelta modalità rapida ed essenziale (stile Bowling) */}
      {game === null && !loadError && (
        <div class="ft-modal-backdrop">
          <section class="ft-modal" aria-labelledby="ft-setup-title">
            <span class="ft-eyebrow">Palestra Comunale</span>
            <h1 id="ft-setup-title" class="ft-modal__title">
              Tiri liberi!
            </h1>

            <div class="ft-roster">
              {lobbyPlayers.map((p) => (
                <span key={p.id} class="ft-roster__chip" style={{ '--chip-color': p.color }}>
                  <span class="ft-roster__dot" />
                  <span>{p.symbol}</span>
                  <strong>{p.name}</strong>
                </span>
              ))}
            </div>

            <div class="ft-modes" role="group" aria-label="Scegli modalità">
              <button
                type="button"
                class="ft-mode-btn"
                onClick={() => startGame('quick', selectedAssist, lobbyPlayers)}
              >
                <span class="ft-mode-btn__num">5</span>
                <span class="ft-mode-btn__title">Veloce</span>
                <span class="ft-mode-btn__sub">tiri</span>
              </button>
              <button
                type="button"
                class="ft-mode-btn ft-mode-btn--featured"
                onClick={() => startGame('classic', selectedAssist, lobbyPlayers)}
              >
                <span class="ft-mode-btn__num">10</span>
                <span class="ft-mode-btn__title">Classica</span>
                <span class="ft-mode-btn__sub">tiri</span>
              </button>
              <button
                type="button"
                class="ft-mode-btn"
                onClick={() => startGame('timed', selectedAssist, lobbyPlayers)}
              >
                <span class="ft-mode-btn__num">60&Prime;</span>
                <span class="ft-mode-btn__title">A tempo</span>
                <span class="ft-mode-btn__sub">secondi</span>
              </button>
            </div>

            <div class="ft-assist-bar" role="radiogroup" aria-label="Aiuto mira">
              <span class="ft-assist-bar__label">Mira</span>
              {(['easy', 'normal', 'pro'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  class={`ft-assist-pill ${selectedAssist === lvl ? 'is-active' : ''}`}
                  onClick={() => setSelectedAssist(lvl)}
                >
                  {lvl === 'easy' ? 'Facile' : lvl === 'normal' ? 'Normale' : 'Pro'}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Podio di fine partita */}
      {game && game.isOver && !isBusy && (
        <div class="ft-modal-backdrop">
          <section class="ft-modal" aria-labelledby="ft-podium-title">
            <span class="ft-eyebrow">Partita conclusa</span>
            <h1 id="ft-podium-title" class="ft-modal__title">
              🏆 Vince {playerById(roster, board[0]?.playerId ?? 'P1').name}!
            </h1>

            <ol class="ft-podium-list">
              {board.map((row) => {
                const p = playerById(roster, row.playerId);
                return (
                  <li key={row.playerId} class="ft-podium-row" style={{ '--player': p.color }}>
                    <span class="ft-podium-row__rank">#{row.position}</span>
                    <span class="ft-podium-row__name">
                      {p.symbol} {p.name}
                    </span>
                    <span class="ft-podium-row__meta">
                      {row.made}/{row.attempts}
                    </span>
                    <span class="ft-podium-row__score">{row.score} pt</span>
                  </li>
                );
              })}
            </ol>

            {awards.length > 0 && (
              <div class="ft-awards-grid">
                {awards.map((a) => {
                  const winner = playerById(roster, a.playerId);
                  return (
                    <div key={a.id} class="ft-award-card">
                      <span class="ft-award-icon" aria-hidden="true">
                        {a.icon}
                      </span>
                      <div>
                        <strong>{a.title}</strong>
                        <small style={{ color: winner.color }}>{winner.name}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div class="ft-modal-actions">
              <button type="button" class="ft-btn ft-btn--secondary" onClick={onEndGame}>
                Lobby
              </button>
              <button type="button" class="ft-btn ft-btn--secondary" onClick={() => setGame(null)}>
                Modalità
              </button>
              <button
                type="button"
                class="ft-btn ft-btn--primary"
                onClick={() => startGame(game.mode, game.assist, roster)}
              >
                Rivincita
              </button>
            </div>
          </section>
        </div>
      )}

      {loadError && (
        <div class="ft-modal-backdrop" role="alert">
          <div class="ft-modal">
            <h2 class="ft-modal__title">Impossibile avviare la palestra 3D</h2>
            <p class="ft-modal__lead">{loadError}</p>
            <button type="button" class="ft-btn ft-btn--primary" onClick={onEndGame}>
              Torna alla lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

