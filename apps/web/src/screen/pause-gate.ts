// Pausa della partita, uguale per tutti i giochi: mentre è in pausa gli eventi dei telefoni non
// arrivano al gioco e i telefoni sanno che non è il loro turno; alla ripresa torna il turno che il
// gioco aveva chiesto (anche se lo ha cambiato durante la pausa).
import type { Cue, GameEvent, SlotId } from '@quickquest/protocol';

export interface PauseIo {
  setActiveSlot(slot: SlotId | null): void;
  sendCue(slot: SlotId | null, cue: Cue): void;
}

export interface PauseTexts {
  readonly paused: string;
  readonly resumed: string;
}

export type EventListener = (slot: SlotId, e: GameEvent) => void;

export interface PauseGate {
  readonly isPaused: boolean;
  /** Il gioco chiede il turno: passa subito, o alla ripresa se si è in pausa. */
  setActiveSlot(slot: SlotId | null): void;
  /** Avvolge l'ascoltatore del gioco: in pausa gli eventi si scartano. */
  filter(cb: EventListener): EventListener;
  /** `true` se ha cambiato stato. */
  pause(): boolean;
  resume(): boolean;
}

export function createPauseGate(io: PauseIo, texts: PauseTexts): PauseGate {
  let isPaused = false;
  let wanted: SlotId | null = null;
  return {
    get isPaused() {
      return isPaused;
    },
    setActiveSlot(slot) {
      wanted = slot;
      if (!isPaused) io.setActiveSlot(slot);
    },
    filter: (cb) => (slot, e) => {
      if (!isPaused) cb(slot, e);
    },
    pause() {
      if (isPaused) return false;
      isPaused = true;
      io.setActiveSlot(null);
      io.sendCue(null, { kind: 'select', text: texts.paused });
      return true;
    },
    resume() {
      if (!isPaused) return false;
      isPaused = false;
      io.setActiveSlot(wanted);
      io.sendCue(null, { kind: 'tap', text: texts.resumed });
      return true;
    },
  };
}
