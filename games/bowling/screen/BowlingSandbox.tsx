// BowlingSandbox: simulatore 3D interattivo con fisica realistica Rapier3D e Three.js
// docs/06, docs/07, docs/games/bowling.md

import { useEffect, useRef, useState } from 'preact/hooks';
import type { BowlingPinStatus, BowlingReleaseData } from '../shared/events';
import { createBowlingPhysicsWorld, type PhysicsWorldState } from './physics';
import { createBowlingScene, type BowlingScene } from './scene';
import './bowling.css';

export interface BowlingSandboxProps {
  readonly onEndGame?: () => void;
  readonly playerName?: string;
  readonly isDemo?: boolean;
}

export function BowlingSandbox({
  onEndGame,
  playerName = 'Pupo',
}: BowlingSandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const physicsRef = useRef<PhysicsWorldState | null>(null);
  const sceneRef = useRef<BowlingScene | null>(null);
  const throwStartRef = useRef<number | null>(null); // timestamp del tiro in corso

  // Parametri di lancio (regolabili via slider o drag del mouse)
  const [startX, setStartX] = useState(0.0); // metri (-0.4 .. +0.4)
  const [aimDeg, setAimDeg] = useState(0.0); // gradi (-4.0 .. +4.0)
  const [speed, setSpeed] = useState(7.5); // m/s (~27 km/h)
  const [spin, setSpin] = useState(0.25); // -1.0 .. +1.0 (hook)

  const [pinStatuses, setPinStatuses] = useState<BowlingPinStatus[]>(() =>
    Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      knockedDown: false,
      x: 0,
      z: 0,
      tiltAngleDeg: 0,
    })),
  );
  const [isRolling, setIsRolling] = useState(false);
  const [callout, setCallout] = useState<string>('Pronto al tiro');
  const [isStrike, setIsStrike] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; time: number } | null>(null);

  // Chiude il tiro: aggiorna HUD e messaggio in base ai birilli abbattuti
  const finishThrow = (finalStatuses: BowlingPinStatus[]) => {
    setPinStatuses(finalStatuses);
    const knocked = finalStatuses.filter((p) => p.knockedDown).length;
    if (knocked === 10) {
      setCallout('💥 STRIKE! 10/10!');
      setIsStrike(true);
    } else if (knocked === 0) {
      setCallout('Canalina! 0 birilli');
    } else {
      setCallout(`${knocked} Birill${knocked === 1 ? 'o' : 'i'}!`);
    }
    setIsRolling(false);
  };

  // Inizializzazione fisica Rapier3D e scena Three.js
  useEffect(() => {
    let animFrame: number;
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;

    let phys: PhysicsWorldState;
    let sc: BowlingScene;

    const init = async () => {
      phys = await createBowlingPhysicsWorld();
      if (disposed) {
        phys.dispose();
        return;
      }
      physicsRef.current = phys;

      sc = createBowlingScene(container, phys);
      sceneRef.current = sc;

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

        // Fine tiro: palla uscita e birilli fermi (timeout di sicurezza 12 s)
        const startedAt = throwStartRef.current;
        if (startedAt !== null) {
          const elapsed = now - startedAt;
          if ((!phys.isBallActive() && phys.arePinsSettled() && elapsed > 800) || elapsed > 12000) {
            throwStartRef.current = null;
            finishThrow(phys.getPinStatuses());
          }
        }

        animFrame = requestAnimationFrame(loop);
      };

      animFrame = requestAnimationFrame(loop);

      // Gestione ridimensionamento finestra
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (sc && width > 0 && height > 0) {
            sc.resize(width, height);
          }
        }
      });
      ro.observe(container);

      return () => {
        ro.disconnect();
      };
    };

    const cleanupInit = init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animFrame);
      cleanupInit.then((fn) => fn && fn());
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      if (physicsRef.current) {
        physicsRef.current.dispose();
        physicsRef.current = null;
      }
    };
  }, []);

  // Esecuzione lancio palla
  const handleThrow = (customRelease?: Partial<BowlingReleaseData>) => {
    const phys = physicsRef.current;
    if (!phys || isRolling) return;

    const releaseData: BowlingReleaseData = {
      startX: customRelease?.startX ?? startX,
      dir: (customRelease?.dir ?? (aimDeg * Math.PI) / 180),
      speed: customRelease?.speed ?? speed,
      spin: customRelease?.spin ?? spin,
    };

    phys.launchBall(releaseData);
    setIsRolling(true);
    setCallout('In corsa...');
    setIsStrike(false);

    // La fine del tiro è rilevata nel loop di simulazione (palla uscita + birilli fermi)
    throwStartRef.current = performance.now();
  };

  // Reset del rack dei birilli e riposizionamento telecamera
  const handleResetRack = () => {
    const phys = physicsRef.current;
    const sc = sceneRef.current;
    if (!phys || !sc) return;

    throwStartRef.current = null;
    phys.resetPins();
    sc.resetCamera();
    setPinStatuses(phys.getPinStatuses());
    setIsRolling(false);
    setIsStrike(false);
    setCallout('Birilli rialzati');
  };

  // Drag interattivo sulla pista con il mouse / touch per tirare con un flick
  const onPointerDown = (e: PointerEvent) => {
    if (isRolling) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragStart({ x: e.clientX, y: e.clientY, time: performance.now() });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragStart || isRolling) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const dt = Math.max(16, performance.now() - dragStart.time);

    // Se è stato un gesto di flick verso l'alto (dy negativo)
    if (dy < -30) {
      const flickSpeed = Math.min(10.5, Math.max(4.5, (-dy / dt) * 18.0));
      const flickDir = Math.max(-0.07, Math.min(0.07, (dx / 300) * 0.08));
      handleThrow({
        startX,
        speed: flickSpeed,
        dir: flickDir,
        spin,
      });
    }
    setDragStart(null);
  };

  // Disposizione triangolare USBC:
  // Fila 4: 7, 8, 9, 10
  // Fila 3: 4, 5, 6
  // Fila 2: 2, 3
  // Fila 1: 1
  const pinRows = [
    [7, 8, 9, 10],
    [4, 5, 6],
    [2, 3],
    [1],
  ];

  const knockedCount = pinStatuses.filter((p) => p.knockedDown).length;

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
        <div class="bowling-title-badge">
          <span>🎳 QuickQuest Bowling</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <span style={{ color: '#ffcc00' }}>{playerName}</span>
        </div>

        {onEndGame && (
          <button
            type="button"
            class="bowling-btn bowling-btn--secondary"
            onClick={onEndGame}
          >
            ← Esci alla Lobby
          </button>
        )}
      </header>

      {/* Diagramma 10 Birilli (Pin Rack HUD) */}
      <div class="bowling-pin-rack" aria-label="Stato birilli">
        {pinRows.map((row, rIdx) => (
          <div key={rIdx} class="bowling-pin-row">
            {row.map((pinId) => {
              const status = pinStatuses.find((p) => p.id === pinId);
              const isDown = status?.knockedDown ?? false;
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
        <div class={`bowling-score-callout ${isStrike ? 'is-strike' : ''}`} role="status" aria-live="polite">
          {callout} ({knockedCount}/10)
        </div>
      </div>

      {/* Pannello Controlli / Parametri di Lancio Sandbox */}
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
          {/* Posizione X */}
          <div class="bowling-control-item">
            <label class="bowling-control-label" for="param-pos">
              <span>Posizione Partenza</span>
              <span>{(startX * 100).toFixed(0)} cm</span>
            </label>
            <input
              id="param-pos"
              class="bowling-slider"
              type="range"
              min="-0.4"
              max="0.4"
              step="0.02"
              value={startX}
              disabled={isRolling}
              onInput={(e) => setStartX(parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>

          {/* Angolo di mira */}
          <div class="bowling-control-item">
            <label class="bowling-control-label" for="param-aim">
              <span>Angolo di Mira</span>
              <span>{aimDeg > 0 ? `+${aimDeg.toFixed(1)}°` : `${aimDeg.toFixed(1)}°`}</span>
            </label>
            <input
              id="param-aim"
              class="bowling-slider"
              type="range"
              min="-4.0"
              max="4.0"
              step="0.2"
              value={aimDeg}
              disabled={isRolling}
              onInput={(e) => setAimDeg(parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>

          {/* Velocità di lancio */}
          <div class="bowling-control-item">
            <label class="bowling-control-label" for="param-speed">
              <span>Velocità Palla</span>
              <span>{(speed * 3.6).toFixed(1)} km/h</span>
            </label>
            <input
              id="param-speed"
              class="bowling-slider"
              type="range"
              min="4.5"
              max="10.5"
              step="0.2"
              value={speed}
              disabled={isRolling}
              onInput={(e) => setSpeed(parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>

          {/* Effetto Hook / Spin */}
          <div class="bowling-control-item">
            <label class="bowling-control-label" for="param-spin">
              <span>Effetto Hook (Polso)</span>
              <span>{spin > 0 ? `Curva Sx (+${spin.toFixed(2)})` : spin < 0 ? `Curva Dx (${spin.toFixed(2)})` : 'Dritto'}</span>
            </label>
            <input
              id="param-spin"
              class="bowling-slider"
              type="range"
              min="-1.0"
              max="1.0"
              step="0.1"
              value={spin}
              disabled={isRolling}
              onInput={(e) => setSpin(parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>

        {/* Pulsanti Azione */}
        <div class="bowling-buttons-row">
          <button
            type="button"
            class="bowling-btn bowling-btn--primary"
            disabled={isRolling}
            onClick={() => handleThrow()}
          >
            🎳 {isRolling ? 'Palla in pista...' : 'Lancia Palla'}
          </button>

          <button
            type="button"
            class="bowling-btn bowling-btn--secondary"
            onClick={handleResetRack}
          >
            ↺ Nuovo Tiro / Riazza
          </button>
        </div>

        <p class="bowling-mouse-hint">
          💡 Suggerimento: puoi anche trascinare e fare un "flick" verso l'alto con il mouse per lanciare al volo!
        </p>
      </div>
    </div>
  );
}

