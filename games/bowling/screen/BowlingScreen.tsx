// Schermo del bowling sul contratto modulo (games/contract.ts): i lanci arrivano come `game-event`
// di tipo `throw` dal telefono di turno, il turno lo decide la partita e lo si dice ai telefoni.
import type { SlotId } from '@quickquest/protocol';
import { useCallback } from 'preact/hooks';
import type { ScreenGameProps } from '../../contract';
import { parseThrowEvent } from '../shared/events';
import { BowlingSandbox, type ThrowSubscriber } from './BowlingSandbox';

export function Screen({ players, subscribeEvents, setActiveSlot, sendCue, onEndGame }: ScreenGameProps) {
  const subscribeThrows = useCallback<ThrowSubscriber>(
    (cb) =>
      subscribeEvents((slot, e) => {
        const release = parseThrowEvent(e);
        if (release) cb(slot, release);
        else sendCue(slot, { kind: 'error', text: 'Lancio non valido' });
      }),
    [subscribeEvents, sendCue],
  );
  const onActivePlayerChange = useCallback(
    (id: string | null) => setActiveSlot(players.some((p) => p.id === id) ? (id as SlotId) : null),
    [players, setActiveSlot],
  );
  const onShot = useCallback(
    (id: string, text: string, isGood: boolean) => {
      const slot = players.find((p) => p.id === id)?.id;
      if (slot) sendCue(slot, { kind: isGood ? 'success' : 'tap', text });
    },
    [players, sendCue],
  );
  return (
    <BowlingSandbox
      players={players}
      subscribeThrows={subscribeThrows}
      onActivePlayerChange={onActivePlayerChange}
      onShot={onShot}
      onEndGame={onEndGame}
    />
  );
}
