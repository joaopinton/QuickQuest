// Stato della partita di bowling per lo schermo: collega le regole pure (rules.ts) all'HUD.

import { useCallback, useRef, useState } from 'preact/hooks';
import {
  createGame,
  isGameOver,
  lastRollOutcome,
  liveTotal,
  recordRoll,
  turnInfo,
  type GameState,
  type RollOutcome,
  type TurnInfo,
} from './rules';

export interface BowlingPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly symbol: string;
}

export interface ShotReport {
  readonly seq: number;
  readonly player: BowlingPlayer;
  readonly frame: number; // 1-based
  readonly roll: number; // 1-based
  readonly pins: number;
  readonly outcome: RollOutcome;
  readonly total: number;
  readonly gained: number;
}

export interface RollResult {
  readonly next: GameState;
  readonly report: ShotReport;
  readonly nextTurn: TurnInfo;
  readonly isOver: boolean;
}

export const DEFAULT_PLAYERS: readonly BowlingPlayer[] = [
  { id: 'P1', name: 'Piggy 1', color: '#EF4E5B', symbol: '●' },
];

/**
 * La formazione viene fissata all'avvio (`start`): se un telefono si scollega a metà partita
 * il suo punteggio resta in classifica e i turni non si sfasano.
 */
export function useBowlingGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [roster, setRoster] = useState<readonly BowlingPlayer[]>(DEFAULT_PLAYERS);
  const rosterRef = useRef<readonly BowlingPlayer[]>(DEFAULT_PLAYERS);
  const [lastShot, setLastShot] = useState<ShotReport | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const seqRef = useRef(0);

  const start = useCallback(
    (frameCount: number, players: readonly BowlingPlayer[]): GameState => {
      const lineup = players.length > 0 ? [...players] : DEFAULT_PLAYERS;
      const g = createGame(lineup.map((p) => p.id), frameCount);
      rosterRef.current = lineup;
      setRoster(lineup);
      gameRef.current = g;
      setGame(g);
      setLastShot(null);
      return g;
    },
    [],
  );

  /** Registra i birilli abbattuti dal tiro appena concluso. `null` se non c'è una partita in corso. */
  const record = useCallback(
    (pins: number): RollResult | null => {
      const current = gameRef.current;
      if (!current || isGameOver(current)) return null;
      const before = turnInfo(current);
      const idx = before.playerIndex;
      const prevTotal = liveTotal(current.rolls[idx] ?? [], current.frameCount);
      const next = recordRoll(current, pins);
      const myRolls = next.rolls[idx] ?? [];
      const total = liveTotal(myRolls, next.frameCount);
      const player = rosterRef.current[idx] ?? DEFAULT_PLAYERS[0]!;
      seqRef.current += 1;
      const report: ShotReport = {
        seq: seqRef.current,
        player,
        frame: before.frameIndex + 1,
        roll: before.rollInFrame + 1,
        pins: myRolls[myRolls.length - 1] ?? 0,
        outcome: lastRollOutcome(myRolls, next.frameCount) ?? 'open',
        total,
        gained: total - prevTotal,
      };
      gameRef.current = next;
      setGame(next);
      setLastShot(report);
      return { next, report, nextTurn: turnInfo(next), isOver: isGameOver(next) };
    },
    [],
  );

  const reset = useCallback(() => {
    gameRef.current = null;
    setGame(null);
    setLastShot(null);
  }, []);

  return { game, roster, lastShot, start, record, reset };
}
