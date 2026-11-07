// Ronzio della macchinetta sul telefono (docs/games/barber.md § Rischi): su iPhone la vibrazione
// continua non c'è, quindi il feedback è un ronzio basso e discreto con WebAudio. L'AudioContext
// nasce al primo tocco (serve un gesto dell'utente) e si riusa.

export interface ClipperBuzz {
  start(): void;
  stop(): void;
  dispose(): void;
}

const BUZZ_HZ = 118;
const BUZZ_GAIN = 0.05;
const RAMP_S = 0.04;

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createClipperBuzz(): ClipperBuzz {
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;

  const ensure = (): boolean => {
    if (ctx && gain) return true;
    const Ctor = audioCtor();
    if (!Ctor) return false;
    try {
      ctx = new Ctor();
      gain = ctx.createGain();
      gain.gain.value = 0;
      // Dente di sega con un tremolo veloce: suona come un motorino, non come un fischio
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = BUZZ_HZ;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 32;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 9;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      lfo.start();
      return true;
    } catch {
      ctx = null;
      gain = null;
      return false;
    }
  };

  const rampTo = (value: number) => {
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(value, now, RAMP_S);
  };

  return {
    start() {
      if (!ensure()) return;
      void ctx?.resume();
      rampTo(BUZZ_GAIN);
    },
    stop() {
      rampTo(0);
    },
    dispose() {
      void ctx?.close();
      ctx = null;
      gain = null;
    },
  };
}
