// Overlay di debug del telefono (`?debug`): rete e sensori in diretta.
// Sul modello del DebugOverlay di choijunhuk/phonemote (MIT): RTT mediana/p95, frequenza dei
// sensori, ordine degli assi, offset del giroscopio e stato "fermo".
import { RAD2DEG, type MotionTracker } from '@quickquest/motion';
import { useEffect, useRef } from 'preact/hooks';
import type { ControllerConnection } from '../../net/controllerConnection';
import { createRttStats } from '../../net/rtt';

const REFRESH_MS = 250;

export function DebugOverlay({ tracker, conn }: { tracker: MotionTracker; conn: ControllerConnection }) {
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const rtt = createRttStats();
    const off = conn.onRtt((ms) => rtt.add(ms));
    let lastCount = tracker.samples;
    let lastAt = performance.now();
    let hz = 0;
    const id = setInterval(() => {
      const now = performance.now();
      hz = ((tracker.samples - lastCount) * 1000) / Math.max(1, now - lastAt);
      lastCount = tracker.samples;
      lastAt = now;
      const r = rtt.summary;
      const bias = tracker.bias.map((b) => (b * RAD2DEG).toFixed(2)).join(' ');
      const lines = [
        `RTT  ${r ? `${Math.round(r.medianMs)} ms (p95 ${Math.round(r.p95Ms)}, n ${r.count})` : '—'}`,
        `Hz   ${hz.toFixed(0)}`,
        `assi ${tracker.gyroOrder}`,
        `bias ${bias} °/s`,
        `ω    ${(tracker.omega * RAD2DEG).toFixed(0)} °/s ${tracker.still.isStill ? `fermo ${Math.round(tracker.still.steadyMs)} ms` : ''}`,
      ];
      if (textRef.current) textRef.current.textContent = lines.join('\n');
    }, REFRESH_MS);
    return () => {
      off();
      clearInterval(id);
    };
  }, [tracker, conn]);

  return <pre ref={textRef} class="ctl-debug" aria-hidden="true" />;
}
