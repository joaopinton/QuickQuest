// Contratto di un modulo di gioco (docs/05). Tutti i giochi passano da qui: eventi generici
// `game-event` dal telefono, `cue` dallo schermo al telefono, componenti caricati con import() dinamico.
import type { FusedSample, MotionTracker, SwingProfile } from '@quickquest/motion';
import type { Cue, CueKind, GameEvent, SlotId } from '@quickquest/protocol';
import type { ComponentType } from 'preact';

/** Giocatore come lo vede lo schermo. */
export interface ScreenPlayer {
  readonly id: SlotId;
  readonly name: string;
  readonly color: string;
  readonly symbol: string;
}

export type GameEventListener = (slot: SlotId, e: GameEvent) => void;
export type GameEventSubscriber = (cb: GameEventListener) => () => void;

export interface ScreenGameProps {
  readonly players: readonly ScreenPlayer[];
  readonly subscribeEvents: GameEventSubscriber;
  /** Chi può mandare eventi adesso (`null` = tutti, per i giochi simultanei, o nessuno se lo dice il gioco). */
  readonly setActiveSlot: (slot: SlotId | null) => void;
  readonly sendCue: (slot: SlotId | null, cue: Cue) => void;
  readonly onEndGame: () => void;
}

/** Feedback sul telefono: dentro un gesto dell'utente vibra anche su iPhone. */
export interface ControllerHaptics {
  play(kind: CueKind): void;
  impact(intensity: number): void;
}

export interface ControllerPadProps {
  readonly slot: SlotId;
  readonly color: string;
  readonly activeSlot: SlotId | null;
  readonly isLost: boolean;
  readonly isDemo: boolean;
  readonly isSimulated: boolean;
  /** Campioni fusi a 60 Hz, quiete, velocità angolare; press/release per i gesti "tieni premuto". */
  readonly tracker: Pick<MotionTracker, 'subscribe' | 'still' | 'omega' | 'press' | 'release' | 'cancel'>;
  readonly haptics: ControllerHaptics;
  /** Taratura del giocatore dai tiri di prova; `null` se non c'è (telefono simulato). */
  readonly swingProfile: SwingProfile | null;
  /** Rifà la taratura; poi il telefono torna sul pad. */
  readonly onRecalibrate: () => void;
  /** Ultimo feedback ricevuto dallo schermo. */
  readonly lastCue: Cue | null;
  readonly send: (e: GameEvent) => void;
  readonly onLeave: () => void;
}

export interface ScreenModule {
  readonly Screen: ComponentType<ScreenGameProps>;
}

export interface ControllerModule {
  readonly Pad: ComponentType<ControllerPadProps>;
}

export type { FusedSample };
