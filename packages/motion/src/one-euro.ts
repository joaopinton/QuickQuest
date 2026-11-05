// Filtro 1€ (Casiez, Roussel, Vogel, CHI 2012): passa-basso con taglio adattivo.
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/OneEuroFilter.ts.
// Liscia molto quando il segnale è quasi fermo (tremore della mano) e quasi niente quando
// si muove davvero, così la mira è stabile senza aggiungere ritardo ai movimenti veri.

export interface OneEuroOptions {
  /** Taglio minimo (Hz): più basso = più liscio da fermi. */
  readonly minCutoff?: number;
  /** Quanto cresce il taglio con la velocità: più alto = meno ritardo in movimento. */
  readonly beta?: number;
  readonly derivativeCutoff?: number;
}

export interface OneEuroFilter {
  /** `dt` in secondi. */
  filter(sample: number, dt: number): number;
  reset(): void;
}

const alphaFor = (cutoffHz: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dt));

export function createOneEuroFilter(opts: OneEuroOptions = {}): OneEuroFilter {
  const minCutoff = opts.minCutoff ?? 1.2;
  const beta = opts.beta ?? 0.03;
  const dCutoff = opts.derivativeCutoff ?? 1;
  let value: number | null = null;
  let derivative = 0;

  return {
    filter(sample, dt) {
      if (dt <= 0) return value ?? sample;
      if (value === null) {
        value = sample;
        return sample;
      }
      derivative += alphaFor(dCutoff, dt) * ((sample - value) / dt - derivative);
      const cutoff = minCutoff + beta * Math.abs(derivative);
      value += alphaFor(cutoff, dt) * (sample - value);
      return value;
    },
    reset() {
      value = null;
      derivative = 0;
    },
  };
}

/** Filtro 1€ su un angolo (rad): segue il valore più vicino, senza salti a ±π. */
export function createAngleOneEuroFilter(opts: OneEuroOptions = {}): OneEuroFilter {
  const inner = createOneEuroFilter(opts);
  let unwrapped: number | null = null;
  return {
    filter(sample, dt) {
      if (unwrapped === null) unwrapped = sample;
      else unwrapped += Math.atan2(Math.sin(sample - unwrapped), Math.cos(sample - unwrapped));
      const out = inner.filter(unwrapped, dt);
      return Math.atan2(Math.sin(out), Math.cos(out));
    },
    reset() {
      unwrapped = null;
      inner.reset();
    },
  };
}
