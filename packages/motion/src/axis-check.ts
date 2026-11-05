// Verifica automatica dell'ordine degli assi del giroscopio (docs/04 § 3).
// Adattato da choijunhuk/phonemote (MIT), apps/game/src/input/SensorNormalizer.ts (decisione D27).
//
// La specifica W3C dice che `rotationRate.alpha/beta/gamma` sono le velocità attorno a z/x/y.
// PhoneMote ha misurato su un telefono Android con Chrome che arrivano invece come x/y/z.
// Invece di indovinare dalla piattaforma, si confrontano le due letture con un fatto fisico:
// la gravità è ferma nel mondo, quindi nel frame del telefono si muove come
// d(accG)/dt = −ω × accG. Vince l'ordine con cui il giroscopio prevede meglio quel movimento.

import { dot, qConj, qFromRotationVector, qRotate, sub, type Vector3 } from './math';

/** `spec`: alpha = z, beta = x, gamma = y (W3C). `xyz`: alpha = x, beta = y, gamma = z (misurato su Chrome Android). */
export type GyroOrder = 'spec' | 'xyz';

export const GYRO_ORDERS: readonly GyroOrder[] = ['spec', 'xyz'];

/** Campione per la verifica: giroscopio letto con l'ordine della specifica (rad/s) e accG (m/s²). */
export interface AxisCheckSample {
  readonly t: number; // ms
  readonly gyro: Vector3;
  readonly accG: Vector3;
}

export interface AxisCheckResult {
  /** `null` se il movimento non basta per decidere. */
  readonly order: GyroOrder | null;
  /** Errore relativo di previsione per ordine (0 = perfetto, 1 = nessuna informazione). */
  readonly errors: Readonly<Record<GyroOrder, number>>;
  /** Quanto movimento della gravità c'era (somma di |d accG/dt|² · dt). */
  readonly energy: number;
}

/** Sotto questa energia il telefono si è mosso troppo poco per giudicare. */
export const MIN_AXIS_ENERGY = 20;
/** Il vincitore deve sbagliare almeno così meno dell'altro. */
export const AXIS_MARGIN = 0.15;
/** Il vincitore deve spiegare davvero il movimento: errore relativo sotto questa soglia. */
export const AXIS_MAX_ERROR = 0.6;
const MAX_STEP_MS = 100;

/** Riordina un giroscopio letto con l'ordine della specifica nell'ordine richiesto. */
export function applyGyroOrder(specGyro: Vector3, order: GyroOrder): Vector3 {
  if (order === 'spec') return specGyro;
  // specGyro = [beta, gamma, alpha]; con l'ordine xyz il telefono intendeva [alpha, beta, gamma]
  return [specGyro[2], specGyro[0], specGyro[1]];
}

/**
 * Errore relativo di previsione della rotazione della gravità per un dato ordine.
 * Per ogni passo si ruota accG con la rotazione esatta del giroscopio (ω medio × dt) e la si
 * confronta con accG misurata dopo: a 20 Hz uno swing gira di ~45° per passo, troppo per
 * una derivata a differenze finite.
 */
function predictionError(samples: readonly AxisCheckSample[], order: GyroOrder): { error: number; energy: number } {
  let residual = 0;
  let energy = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dtMs = b.t - a.t;
    if (dtMs <= 0 || dtMs > MAX_STEP_MS) continue;
    const dt = dtMs / 1000;
    const ga = applyGyroOrder(a.gyro, order);
    const gb = applyGyroOrder(b.gyro, order);
    const w: Vector3 = [((ga[0] + gb[0]) / 2) * dt, ((ga[1] + gb[1]) / 2) * dt, ((ga[2] + gb[2]) / 2) * dt];
    // il telefono ruota di dq: un vettore fermo nel mondo, nel frame del telefono, ruota di dq⁻¹
    const predicted = qRotate(qConj(qFromRotationVector(w)), a.accG);
    const moved = sub(b.accG, a.accG);
    const diff = sub(b.accG, predicted);
    residual += dot(diff, diff) / dt;
    energy += dot(moved, moved) / dt;
  }
  return { error: energy > 0 ? residual / energy : 1, energy };
}

/** Sceglie l'ordine degli assi che spiega meglio come si è mossa la gravità. */
export function checkGyroOrder(samples: readonly AxisCheckSample[]): AxisCheckResult {
  const spec = predictionError(samples, 'spec');
  const xyz = predictionError(samples, 'xyz');
  const errors = { spec: spec.error, xyz: xyz.error };
  const energy = spec.energy;
  if (energy < MIN_AXIS_ENERGY) return { order: null, errors, energy };
  if (spec.error < AXIS_MAX_ERROR && spec.error + AXIS_MARGIN < xyz.error) return { order: 'spec', errors, energy };
  if (xyz.error < AXIS_MAX_ERROR && xyz.error + AXIS_MARGIN < spec.error) return { order: 'xyz', errors, energy };
  return { order: null, errors, energy };
}

const STORAGE_KEY = 'qq.gyroOrder';

/** Ordine salvato per questa sessione del browser, se c'è. */
export function loadGyroOrder(storage: Pick<Storage, 'getItem'> | undefined = globalThis.sessionStorage): GyroOrder | null {
  try {
    const v = storage?.getItem(STORAGE_KEY);
    return v === 'spec' || v === 'xyz' ? v : null;
  } catch {
    return null; // storage non disponibile (modalità privata)
  }
}

export function saveGyroOrder(order: GyroOrder, storage: Pick<Storage, 'setItem'> | undefined = globalThis.sessionStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, order);
  } catch {
    // storage non disponibile: si rifarà la verifica alla prossima calibrazione
  }
}
