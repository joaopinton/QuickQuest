// BowlingSandbox: partita di bowling 3D con fisica Rapier3D e Three.js, a turni tra i giocatori
// della lobby, con punteggio dopo ogni tiro e classifica (docs/06, docs/07, docs/games/bowling.md).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { BowlingPinStatus, BowlingReleaseData, GestureThrow } from '../shared/events';
import { SWEEP_MS, SWEEP_SWAP_MS, type ScoreboardInfo } from './environment';
import { GameSetup } from './hud/GameSetup';
import { Leaderboard } from './hud/Leaderboard';
import { Podium } from './hud/Podium';
import { Scorecard } from './hud/Scorecard';
import { ShotToast } from './hud/ShotToast';
import { StrikeBurst } from './hud/StrikeBurst';
import { createBowlingPhysicsWorld, playingLine, type PhysicsWorldState } from './physics';
import { isGameOver, liveTotal, turnInfo, type GameState } from './rules';
import { createBowlingScene, type BowlingScene } from './scene';
import { DEFAULT_PLAYERS, useBowlingGame, type BowlingPlayer, type ShotReport } from './useBowlingGame';
import './bowling.css';
import './hud/hud.css';

export type { BowlingPlayer } from './useBowlingGame';

export type { GestureThrow } from '../shared/events';
export type ThrowSubscriber = (cb: (playerId: string, release: GestureThrow) => void) => () => void;

export interface BowlingSandboxProps {
  readonly onEndGame?: () => void;
  readonly players?: readonly BowlingPlayer[];
  /** Lanci in arrivo dai telefoni: si tira solo col gesto del giocatore di turno. */
  readonly subscribeThrows?: ThrowSubscriber;
  /** Chi può lanciare adesso (id del giocatore) o `null`: lo si dice ai telefoni. */
  readonly onActivePlayerChange?: (playerId: string | null) => void;
  /** Esito del tiro appena chiuso, per il telefono di chi ha tirato. */
  readonly onShot?: (playerId: string, text: string, isGood: boolean) => void;
}

const TOAST_MS = 1700; // quanto resta in vista l'esito prima che lo sweeper sistemi il rack
const STRIKE_TOAST_MS = 2700; // lo strike si festeggia un po' più a lungo
const FULL_BOARD_MS = 2600; // tabellone completo al cambio di giocatore
const THROW_TIMEOUT_MS = 12000;

// Disposizione triangolare USBC vista dall'approccio: fila 4 (7-10) in alto, birillo 1 in basso
const PIN_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

const INITIAL_PINS: BowlingPinStatus[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  knockedDown: false,
  x: 0,
  z: 0,
  tiltAngleDeg: 0,
}));

const SCOREBOARD_MESSAGE: Record<ShotReport['outcome'], string | undefined> = {
  strike: 'STRIKE!',
  spare: 'SPARE!',
  gutter: 'Canalina!',
  open: undefined,
};

function playerAt(players: readonly BowlingPlayer[], idx: number): BowlingPlayer {
  return players[idx] ?? players[0] ?? DEFAULT_PLAYERS[0]!;
}

function scoreboardFor(game: GameState, players: readonly BowlingPlayer[], message?: string): ScoreboardInfo {
  const turn = turnInfo(game);
  const player = playerAt(players, turn.playerIndex);
  return {
    playerName: player.name,
    color: player.color,
    frame: turn.frameIndex + 1,
    frameCount: game.frameCount,
    roll: turn.rollInFrame + 1,
    total: liveTotal(game.rolls[turn.playerIndex] ?? [], game.frameCount),
    message,
  };
}

export function BowlingSandbox({ onEndGame, players: playersProp, subscribeThrows, onActivePlayerChange, onShot }: BowlingSandboxProps) {
  // Giocatori collegati ora (per la schermata iniziale) e formazione fissata a inizio partita
  const lobbyPlayers = playersProp && playersProp.length > 0 ? playersProp : DEFAULT_PLAYERS;
  const { game, roster: players, lastShot, start, record, reset } = useBowlingGame();

  const containerRef = useRef<HTMLDivElement>(null);
  const physicsRef = useRef<PhysicsWorldState | null>(null);
  const sceneRef = useRef<BowlingScene | null>(null);
  const throwStartRef = useRef<number | null>(null); // timestamp del tiro in corso
  const standingBeforeRef = useRef(10); // birilli in piedi al momento del lancio
  const timersRef = useRef<number[]>([]);
  const finishThrowRef = useRef<(statuses: BowlingPinStatus[]) => void>(() => {});
  const onShotRef = useRef(onShot);
  const strikeFxPlayedRef = useRef(false); // effetto 3D già partito per il tiro in corso
  const shooterColorRef = useRef('#8E5BFF');
  onShotRef.current = onShot;

  const [pinStatuses, setPinStatuses] = useState<BowlingPinStatus[]>(INITIAL_PINS);
  const [isBusy, setIsBusy] = useState(false); // palla in pista o rack in sistemazione
  const [isFullBoardOpen, setFullBoardOpen] = useState(false);
  const [isFullBoardPinned, setFullBoardPinned] = useState(false);
  const [isReady, setIsReady] = useState(false); // fisica e scena 3D pronte
  const [loadError, setLoadError] = useState<string | null>(null);

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  /** Prepara la pista per il tiro del giocatore di turno (rack, camera, colore palla, tabellone). */
  const prepareTurn = (g: GameState, fullRack: boolean, lineup: readonly BowlingPlayer[] = players) => {
    const phys = physicsRef.current;
    const sc = sceneRef.current;
    if (!phys || !sc) return;
    if (fullRack) phys.resetPins();
    else phys.clearKnockedPins();
    sc.resetCamera();
    sc.setBallColor(playerAt(lineup, g.current).color);
    sc.setScoreboard(scoreboardFor(g, lineup));
    setPinStatuses(phys.getPinStatuses());
  };

  // Chiude il tiro: registra il punteggio, mostra l'esito e poi sistema il rack per il prossimo tiro
  finishThrowRef.current = (statuses: BowlingPinStatus[]) => {
    setPinStatuses(statuses);
    const standingAfter = statuses.filter((p) => !p.knockedDown).length;
    const result = record(standingBeforeRef.current - standingAfter);
    const sc = sceneRef.current;
    if (!result || !sc) {
      setIsBusy(false);
      return;
    }

    const { next, report, nextTurn, isOver } = result;
    const holdMs = report.outcome === 'strike' ? STRIKE_TOAST_MS : TOAST_MS;
    // strike non visto durante il tiro (es. birillo caduto dopo l'ultimo controllo): si festeggia ora
    if (report.outcome === 'strike' && !strikeFxPlayedRef.current) sc.playStrike(report.player.color);
    strikeFxPlayedRef.current = true;
    const pinsText = `${report.pins} birill${report.pins === 1 ? 'o' : 'i'}`;
    onShotRef.current?.(report.player.id, SCOREBOARD_MESSAGE[report.outcome] ?? pinsText, report.outcome === 'strike' || report.outcome === 'spare');
    // Il tabellone 3D mostra l'esito del tiro appena fatto finché lo sweeper non sistema il rack
    sc.setScoreboard({
      playerName: report.player.name,
      color: report.player.color,
      frame: report.frame,
      frameCount: next.frameCount,
      roll: report.roll,
      total: report.total,
      message: SCOREBOARD_MESSAGE[report.outcome] ?? pinsText,
    });

    if (isOver) {
      later(() => setIsBusy(false), holdMs);
      return;
    }

    const shooterIndex = players.findIndex((p) => p.id === report.player.id);
    const isNewPlayer = nextTurn.playerIndex !== shooterIndex;

    later(() => {
      sc.playSweep();
      later(() => prepareTurn(next, nextTurn.standing === 10), SWEEP_SWAP_MS);
      later(() => setIsBusy(false), SWEEP_MS);
      if (isNewPlayer && players.length > 1) {
        setFullBoardOpen(true);
        later(() => setFullBoardOpen(false), FULL_BOARD_MS);
      }
    }, holdMs);
  };

  // Inizializzazione fisica Rapier3D e scena Three.js
  useEffect(() => {
    let animFrame = 0;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    const container = containerRef.current;
    if (!container) return;

    const init = async () => {
      const phys = await createBowlingPhysicsWorld();
      if (disposed) {
        phys.dispose();
        return;
      }
      physicsRef.current = phys;

      const sc = createBowlingScene(container, phys);
      sceneRef.current = sc;
      sc.setBallColor(playerAt(lobbyPlayers, 0).color);
      sc.setScoreboard({ playerName: 'Benvenuti!', color: '#8E5BFF', frame: 1, frameCount: 10, roll: 1, total: 0 });

      let lastTime = performance.now();
      const loop = (now: number) => {
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        phys.step(dt);
        // Strike: all'istante in cui cade l'ultimo dei 10 birilli parte la festa nella scena
        if (throwStartRef.current !== null && !strikeFxPlayedRef.current && standingBeforeRef.current === 10
          && phys.getPinStatuses().every((p) => p.knockedDown)) {
          strikeFxPlayedRef.current = true;
          sc.playStrike(shooterColorRef.current);
        }
        sc.update(dt);

        if (phys.isBallActive()) {
          const statuses = phys.getPinStatuses();
          // Aggiorna lo stato solo se cambia l'insieme dei birilli a terra (evita re-render a 60 Hz)
          setPinStatuses((prev) =>
            prev.every((p, i) => p.knockedDown === statuses[i]?.knockedDown) ? prev : statuses,
          );
        }

        // Fine tiro: palla uscita e birilli fermi (timeout di sicurezza)
        const startedAt = throwStartRef.current;
        if (startedAt !== null) {
          const elapsed = now - startedAt;
          if ((!phys.isBallActive() && phys.arePinsSettled() && elapsed > 800) || elapsed > THROW_TIMEOUT_MS) {
            throwStartRef.current = null;
            finishThrowRef.current(phys.getPinStatuses());
          }
        }

        animFrame = requestAnimationFrame(loop);
      };
      animFrame = requestAnimationFrame(loop);

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
        // Senza fisica o WebGL la pista non si può mostrare: lo diciamo invece di restare muti
        console.error('[bowling] inizializzazione fallita', err);
        if (!disposed) setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrame);
      ro?.disconnect();
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      sceneRef.current?.dispose();
      sceneRef.current = null;
      physicsRef.current?.dispose();
      physicsRef.current = null;
    };
    // La scena va creata una sola volta: i giocatori sono letti al bisogno
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGame = (frameCount: number, lineup: readonly BowlingPlayer[] = lobbyPlayers) => {
    clearTimers();
    throwStartRef.current = null;
    const g = start(frameCount, lineup);
    prepareTurn(g, true, lineup);
    setIsBusy(false);
    setFullBoardOpen(false);
  };

  const backToSetup = () => {
    clearTimers();
    reset();
    setFullBoardOpen(false);
  };

  const isOver = game !== null && isGameOver(game);
  const canThrow = isReady && game !== null && !isOver && !isBusy;

  // Esecuzione lancio palla: i parametri arrivano dal gesto sul telefono del giocatore di turno
  const handleThrow = (release: GestureThrow) => {
    const phys = physicsRef.current;
    // throwStartRef è sincrono: due lanci nello stesso frame (prima del re-render) ne valgono uno
    if (!phys || !canThrow || throwStartRef.current !== null) return;

    // Linea di gioco dallo spin (posizione e uscita verso il bordo), la mira del telefono si somma
    const line = playingLine(release.spin);
    const releaseData: BowlingReleaseData = { startX: line.startX, dir: line.dir + release.dir, speed: release.speed, spin: release.spin };
    standingBeforeRef.current = phys.getPinStatuses().filter((p) => !p.knockedDown).length;
    strikeFxPlayedRef.current = false;
    shooterColorRef.current = current?.color ?? shooterColorRef.current;
    phys.launchBall(releaseData);
    setIsBusy(true);
    // La fine del tiro è rilevata nel loop di simulazione (palla uscita + birilli fermi)
    throwStartRef.current = performance.now();
  };

  const turn = game ? turnInfo(game) : null;
  const current = turn ? playerAt(players, turn.playerIndex) : null;
  const showFullBoard = game !== null && !isOver && (isFullBoardOpen || isFullBoardPinned);
  const activePlayerId = canThrow && current ? current.id : null;

  // Lancio dal telefono: vale solo se arriva dal giocatore di turno e la pista è libera
  const onGestureRef = useRef<(playerId: string, release: GestureThrow) => void>(() => {});
  onGestureRef.current = (playerId, release) => {
    if (playerId !== activePlayerId) return;
    handleThrow(release);
  };
  useEffect(() => subscribeThrows?.((id, release) => onGestureRef.current(id, release)), [subscribeThrows]);

  // I telefoni sanno chi può lanciare: solo quello abilita il tasto
  const onActiveRef = useRef(onActivePlayerChange);
  onActiveRef.current = onActivePlayerChange;
  useEffect(() => {
    onActiveRef.current?.(activePlayerId);
  }, [activePlayerId]);
  useEffect(() => () => onActiveRef.current?.(null), []);

  return (
    <div class="bowling-sandbox">
      {/* Canvas 3D */}
      <div ref={containerRef} class="bowling-canvas-container" />

      {/* Header bar */}
      <header class="bowling-hud-header">
        <div class="bowling-title-badge" style={current ? { '--player': current.color } : undefined}>
          <span>🎳</span>
          {current && turn ? (
            <>
              <span class="bw-turn-dot" aria-hidden="true">{current.symbol}</span>
              <span>Tocca a <strong style={{ color: current.color }}>{current.name}</strong></span>
              <span class="bw-turn-meta">Frame {turn.frameIndex + 1}/{game?.frameCount} · Tiro {turn.rollInFrame + 1}</span>
            </>
          ) : (
            <span>QuickQuest Bowling</span>
          )}
        </div>

        <div class="bw-header-actions">
          {game && !isOver && (
            <button
              type="button"
              class="bowling-btn bowling-btn--secondary"
              aria-pressed={isFullBoardPinned}
              onClick={() => setFullBoardPinned((v) => !v)}
            >
              📋 Tabellone
            </button>
          )}
          {onEndGame && (
            <button type="button" class="bowling-btn bowling-btn--secondary" onClick={onEndGame}>
              ← Lobby
            </button>
          )}
        </div>
      </header>

      {/* Riga del segnapunti del giocatore di turno */}
      {game && !isOver && !showFullBoard && (
        <div class="bw-strip">
          <Scorecard game={game} players={players} currentFrame={turn?.frameIndex ?? 0} onlyCurrent />
        </div>
      )}

      {/* Tabellone completo: al cambio di giocatore o su richiesta */}
      {showFullBoard && game && (
        <div class="bw-fullboard">
          <Scorecard game={game} players={players} currentFrame={turn?.frameIndex ?? 0} />
        </div>
      )}

      {/* Classifica */}
      {game && !isOver && (
        <div class="bw-side">
          <Leaderboard game={game} players={players} />
        </div>
      )}

      {/* Diagramma 10 Birilli (Pin Rack HUD) */}
      <div class="bowling-pin-rack" aria-label="Stato birilli">
        {PIN_ROWS.map((row, rIdx) => (
          <div key={rIdx} class="bowling-pin-row">
            {row.map((pinId) => {
              const isDown = pinStatuses.find((p) => p.id === pinId)?.knockedDown ?? false;
              return (
                <div
                  key={pinId}
                  class={`bowling-pin-dot ${isDown ? 'is-down' : ''}`}
                  title={`Birillo ${pinId}: ${isDown ? 'Abbattuto' : 'In piedi'}`}
                >
                  {pinId}
                </div>
              );
            })}
          </div>
        ))}
        <div class="bowling-score-callout">
          {pinStatuses.filter((p) => !p.knockedDown).length} in piedi
        </div>
      </div>

      {/* Esito dell'ultimo tiro */}
      {lastShot && (lastShot.outcome === 'strike'
        ? <StrikeBurst key={lastShot.seq} shot={lastShot} />
        : <ShotToast key={lastShot.seq} shot={lastShot} />)}

      {/* Invito al lancio: si tira solo col gesto dal telefono del giocatore di turno */}
      {game && !isOver && current && (
        <div class="bowling-controls-panel bw-throw-prompt" style={{ '--player': current.color }} aria-live="polite">
          {isBusy ? (
            <p class="bw-throw-prompt__text">🎳 Palla in pista…</p>
          ) : (
            <>
              <p class="bw-throw-prompt__text">
                📱 <strong style={{ color: current.color }}>{current.name}</strong>, prendi il telefono e lancia!
              </p>
              <p class="bowling-mouse-hint">
                Tieni premuto il tasto, porta il braccio indietro e fai lo swing verso dove vuoi tirare, poi rilascia.
              </p>
            </>
          )}
        </div>
      )}

      {loadError && (
        <div class="bw-load-error" role="alert">
          <p><strong>La pista non si è caricata.</strong></p>
          <p>Il browser non è riuscito ad avviare la grafica 3D o la fisica del gioco.</p>
          <button type="button" class="bowling-btn bowling-btn--primary" onClick={() => window.location.reload()}>
            Riprova
          </button>
        </div>
      )}

      {game === null && !loadError && <GameSetup players={lobbyPlayers} onStart={(frames) => startGame(frames)} />}

      {isOver && !isBusy && game && (
        <Podium
          game={game}
          players={players}
          onRematch={() => startGame(game.frameCount, players)}
          onNewGame={backToSetup}
          onExit={onEndGame}
        />
      )}
    </div>
  );
}
