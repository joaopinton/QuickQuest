// Feedback aptico del telefono (docs/05 § Lato controller, `HapticsService`).
//
// Sopra `web-haptics` (lochie/web-haptics, MIT): su Android usa `navigator.vibrate`, su iPhone,
// dove `navigator.vibrate` non esiste, fa scattare uno switch nascosto (`<input switch>`),
// che Safari accompagna con un tick aptico.
// Limite di iOS: il tick arriva solo dentro un gesto dell'utente (tap, rilascio del pollice).
// Per gli eventi che arrivano dallo schermo (uno strike) su iOS non si può vibrare: al loro posto
// si suona un click breve, con un AudioContext sbloccato al primo tocco.
import { WebHaptics, type HapticInput } from 'web-haptics';

export type HapticPreset = 'tap' | 'select' | 'success' | 'error';

export interface HapticsService {
  /** Da chiamare dentro un gesto dell'utente: vibra su Android e iPhone. */
  play(kind: HapticPreset): void;
  /** Colpo di intensità 0..1, dentro un gesto dell'utente. */
  impact(intensity: number): void;
  /** Evento arrivato dallo schermo, fuori da un gesto: vibra dove si può, altrimenti un click. */
  cue(kind: HapticPreset): void;
  /** Sblocca l'audio del click: da chiamare in un tap (iOS lo richiede). */
  unlock(): void;
  destroy(): void;
}

export interface HapticEngine {
  trigger(input: HapticInput): Promise<void> | void;
  destroy(): void;
}

export interface ClickPlayer {
  unlock(): void;
  click(intensity: number): void;
  close(): void;
}

export interface HapticsOptions {
  readonly engine?: HapticEngine;
  readonly click?: ClickPlayer;
  /** Se il browser vibra anche fuori da un gesto (Android con `navigator.vibrate`). */
  readonly canVibrateAnytime?: boolean;
}

/** Pattern in stile UIFeedbackGenerator, sul formato di web-haptics. */
export const PATTERNS: Readonly<Record<HapticPreset, HapticInput>> = {
  tap: [{ duration: 25, intensity: 0.7 }],
  select: [{ duration: 8, intensity: 0.3 }],
  success: [{ duration: 30, intensity: 0.5 }, { delay: 60, duration: 40, intensity: 1 }],
  error: [{ duration: 40, intensity: 0.8 }, { delay: 40, duration: 40, intensity: 0.8 }, { delay: 40, duration: 50, intensity: 0.6 }],
};

const CUE_CLICK: Readonly<Record<HapticPreset, number>> = { tap: 0.6, select: 0.3, success: 0.9, error: 0.5 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Click di ~12 ms filtrato, come il "pock" di un telecomando. */
export function createClickPlayer(): ClickPlayer {
  let ctx: AudioContext | null = null;
  return {
    unlock() {
      if (typeof AudioContext === 'undefined') return;
      try {
        ctx ??= new AudioContext();
        void ctx.resume();
      } catch {
        ctx = null; // audio non disponibile: si resta senza click
      }
    },
    click(intensity) {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.012);
      gain.gain.setValueAtTime(0.25 * clamp01(intensity), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    },
    close() {
      void ctx?.close();
      ctx = null;
    },
  };
}

export function createHaptics(opts: HapticsOptions = {}): HapticsService {
  const engine: HapticEngine = opts.engine ?? new WebHaptics();
  const click = opts.click ?? createClickPlayer();
  const canVibrateAnytime = opts.canVibrateAnytime ?? WebHaptics.isSupported;

  const fire = (input: HapticInput) => {
    try {
      void Promise.resolve(engine.trigger(input)).catch(() => undefined);
    } catch {
      // niente vibrazione: il gioco va avanti lo stesso
    }
  };

  return {
    play(kind) {
      fire(PATTERNS[kind]);
    },
    impact(intensity) {
      const k = clamp01(intensity);
      fire([{ duration: Math.round(15 + 25 * k), intensity: 0.4 + 0.6 * k }]);
    },
    cue(kind) {
      if (canVibrateAnytime) fire(PATTERNS[kind]);
      else click.click(CUE_CLICK[kind]);
    },
    unlock() {
      click.unlock();
    },
    destroy() {
      engine.destroy();
      click.close();
    },
  };
}
