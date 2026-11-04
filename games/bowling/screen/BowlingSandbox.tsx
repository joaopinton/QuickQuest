// BowlingSandbox: partita di bowling 3D con fisica Rapier3D e Three.js, a turni tra i giocatori
// della lobby, con punteggio dopo ogni tiro e classifica (docs/06, docs/07, docs/games/bowling.md).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { BowlingPinStatus, BowlingReleaseData } from '../shared/events';
import { SWEEP_MS, SWEEP_SWAP_MS, type ScoreboardInfo } from './environment';
import { GameSetup } from './hud/GameSetup';
import { Leaderboard } from './hud/Leaderboard';
import { Podium } from './hud/Podium';
import { Scorecard } from './hud/Scorecard';
import { ShotToast } from './hud/ShotToast';
import { createBowlingPhysicsWorld, type PhysicsWorldState } from './physics';
import { isGameOver, liveTotal, turnInfo, type GameState } from './rules';
import { createBowlingScene, type BowlingScene } from './scene';
import { DEFAULT_PLAYERS, useBowlingGame, type BowlingPlayer, type ShotReport } from './useBowlingGame';
import './bowling.css';
import './hud/hud.css';

export type { BowlingPlayer } from './useBowlingGame';

export interface BowlingSandboxProps {
  readonly onEndGame?: () => void;
  readonly players?: readonly BowlingPlayer[];
}

const TOAST_MS = 1700; // quanto resta in vista l'esito prima che lo sweeper sistemi il rack
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

export function BowlingSandbox({ onEndGame, players: playersProp }: BowlingSandboxProps) {
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

  // Parametri di lancio (regolabili via slider o drag del mouse)
  const [startX, setStartX] = useState(0.0); // metri (-0.4 .. +0.4)
  const [aimDeg, setAimDeg] = useState(0.0); // gradi (-4.0 .. +4.0)
  const [speed, setSpeed] = useState(7.5); // m/s (~27 km/h)
  const [spin, setSpin] = useState(0.25); // -1.0 .. +1.0 (hook)

  const [pinStatuses, setPinStatuses] = useState<BowlingPinStatus[]>(INITIAL_PINS);
  const [isBusy, setIsBusy] = useState(false); // palla in pista o rack in sistemazione
  const [showParams, setShowParams] = useState(false);
  const [isFullBoardOpen, setFullBoardOpen] = useState(false);
  const [isFullBoardPinned, setFullBoardPinned] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; time: number } | null>(null);

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
    // Il tabellone 3D mostra l'esito del tiro appena fatto finché lo sweeper non sistema il rack
    sc.setScoreboard({
      playerName: report.player.name,
      color: report.player.color,
      frame: report.frame,
      frameCount: next.frameCount,
      roll: report.roll,
      total: report.total,
      message: SCOREBOARD_MESSAGE[report.outcome] ?? `${report.pins} birill${report.pins === 1 ? 'o' : 'i'}`,
    });

    if (isOver) {
      later(() => setIsBusy(false), TOAST_MS);
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
    }, TOAST_MS);
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

    void init();

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
  const canThrow = game !== null && !isOver && !isBusy;

  // Esecuzione lancio palla
  const handleThrow = (customRelease?: Partial<BowlingReleaseData>) => {
    const phys = physicsRef.current;
    if (!phys || !canThrow) return;

    const releaseData: BowlingReleaseData = {
      startX: customRelease?.startX ?? startX,
      dir: customRelease?.dir ?? (aimDeg * Math.PI) / 180,
      speed: customRelease?.speed ?? speed,
      spin: customRelease?.spin ?? spin,
    };

    standingBeforeRef.current = phys.getPinStatuses().filter((p) => !p.knockedDown).length;
    phys.launchBall(releaseData);
    setIsBusy(true);
    // La fine del tiro è rilevata nel loop di simulazione (palla uscita + birilli fermi)
    throwStartRef.current = performance.now();
  };

  // Drag interattivo sulla pista con il mouse / touch per tirare con un flick
  const onPointerDown = (e: PointerEvent) => {
    if (!canThrow) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragStart({ x: e.clientX, y: e.clientY, time: performance.now() });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart || !canThrow) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dt = Math.max(16, performance.now() - dragStart.time);

    // Flick verso l'alto (dy negativo)
    if (dy < -30) {
      const flickSpeed = Math.min(10.5, Math.max(4.5, (-dy / dt) * 18.0));
      const flickDir = Math.max(-0.07, Math.min(0.07, (dx / 300) * 0.08));
      handleThrow({ startX, speed: flickSpeed, dir: flickDir, spin });
    }
    setDragStart(null);
  };

  const turn = game ? turnInfo(game) : null;
  const current = turn ? playerAt(players, turn.playerIndex) : null;
  const showFullBoard = game !== null && !isOver && (isFullBoardOpen || isFullBoardPinned);

  return (
    <div class="bowling-sandbox">
      {/* Canvas 3D */}
      <div
        ref={containerRef}
        class="bowling-canvas-container"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragStart(null)}
      />

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
      {lastShot && <ShotToast key={lastShot.seq} shot={lastShot} />}

      {/* Pannello di lancio */}
      {game && !isOver && (
        <div class="bowling-controls-panel">
          <button
            type="button"
            class="bowling-params-toggle"
            aria-expanded={showParams}
            aria-controls="bowling-params"
            onClick={() => setShowParams((v) => !v)}
          >
            {showParams ? '▾ Nascondi parametri' : '▸ Parametri di lancio'}
          </button>

          <div id="bowling-params" class="bowling-sliders-grid" hidden={!showParams}>
            <div class="bowling-control-item">
              <label class="bowling-control-label" for="param-pos">
                <span>Posizione Partenza</span>
                <span>{(startX * 100).toFixed(0)} cm</span>
              </label>
              <input id="param-pos" class="bowling-slider" type="range" min="-0.4" max="0.4" step="0.02"
                value={startX} disabled={!canThrow}
                onInput={(e) => setStartX(parseFloat((e.target as HTMLInputElement).value))} />
            </div>

            <div class="bowling-control-item">
              <label class="bowling-control-label" for="param-aim">
                <span>Angolo di Mira</span>
                <span>{aimDeg > 0 ? `+${aimDeg.toFixed(1)}°` : `${aimDeg.toFixed(1)}°`}</span>
              </label>
              <input id="param-aim" class="bowling-slider" type="range" min="-4.0" max="4.0" step="0.2"
                value={aimDeg} disabled={!canThrow}
                onInput={(e) => setAimDeg(parseFloat((e.target as HTMLInputElement).value))} />
            </div>

            <div class="bowling-control-item">
              <label class="bowling-control-label" for="param-speed">
                <span>Velocità Palla</span>
                <span>{(speed * 3.6).toFixed(1)} km/h</span>
              </label>
              <input id="param-speed" class="bowling-slider" type="range" min="4.5" max="10.5" step="0.2"
                value={speed} disabled={!canThrow}
                onInput={(e) => setSpeed(parseFloat((e.target as HTMLInputElement).value))} />
            </div>

            <div class="bowling-control-item">
              <label class="bowling-control-label" for="param-spin">
                <span>Effetto Hook (Polso)</span>
                <span>{spin > 0 ? `Curva Sx (+${spin.toFixed(2)})` : spin < 0 ? `Curva Dx (${spin.toFixed(2)})` : 'Dritto'}</span>
              </label>
              <input id="param-spin" class="bowling-slider" type="range" min="-1.0" max="1.0" step="0.1"
                value={spin} disabled={!canThrow}
                onInput={(e) => setSpin(parseFloat((e.target as HTMLInputElement).value))} />
            </div>
          </div>

          <div class="bowling-buttons-row">
            <button
              type="button"
              class="bowling-btn bowling-btn--primary"
              style={current ? { '--player': current.color } : undefined}
              disabled={!canThrow}
              onClick={() => handleThrow()}
            >
              🎳 {isBusy ? 'Palla in pista...' : `Lancia, ${current?.name ?? ''}!`}
            </button>
          </div>

          <p class="bowling-mouse-hint">
            💡 Puoi anche trascinare e fare un "flick" verso l'alto sulla pista per lanciare al volo!
          </p>
        </div>
      )}

      {game === null && <GameSetup players={lobbyPlayers} onStart={(frames) => startGame(frames)} />}

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
