// Statistiche del tempo di andata e ritorno (RTT) dei battiti ping/pong.
// Come in choijunhuk/phonemote (MIT), ARCHITECTURE.md § 12: si usa solo l'RTT, mai la
// latenza di sola andata, perché gli orologi di telefono e schermo hanno origini diverse.
import { median, percentile } from '@quickquest/motion';

export const RTT_WINDOW = 30;

export interface RttSummary {
  readonly count: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly lastMs: number;
}

export interface RttStats {
  add(rttMs: number): void;
  readonly summary: RttSummary | null;
}

export function createRttStats(window = RTT_WINDOW): RttStats {
  let values: number[] = [];
  return {
    add(rttMs) {
      if (!Number.isFinite(rttMs) || rttMs < 0) return; // orologio saltato o battito corrotto
      values = [...values, rttMs].slice(-window);
    },
    get summary() {
      if (values.length === 0) return null;
      return {
        count: values.length,
        medianMs: median(values),
        p95Ms: percentile(values, 95),
        lastMs: values[values.length - 1]!,
      };
    },
  };
}
