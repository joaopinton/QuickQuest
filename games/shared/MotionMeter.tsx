// Barra che mostra in diretta quanto si muove il telefono: prova visibile che i sensori arrivano.
import type { MotionTracker } from '@quickquest/motion';
import { t } from '@quickquest/ui';
import { useEffect, useRef } from 'preact/hooks';

const FULL_SCALE = 12; // rad/s: oltre la barra è piena

export function MotionMeter({ tracker }: { tracker: Pick<MotionTracker, 'omega' | 'still'> }) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Aggiornamento a frame d'animazione senza re-render di Preact
  useEffect(() => {
    let raf = 0;
    let shown = 0;
    const tick = () => {
      shown = Math.max(tracker.omega, shown * 0.9); // discesa morbida, salita immediata
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, shown / FULL_SCALE)})`;
      const isStill = tracker.still.isStill;
      if (valueRef.current) valueRef.current.textContent = isStill ? t('controller.meterStill') : `${shown.toFixed(1)} rad/s`;
      rootRef.current?.classList.toggle('is-still', isStill);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tracker]);

  return (
    <div ref={rootRef} class="ctl-meter" role="img" aria-label={t('controller.meterLabel')}>
      <span class="ctl-meter__label">{t('controller.meterLabel')}</span>
      <span class="ctl-meter__track"><span ref={fillRef} class="ctl-meter__fill" /></span>
      <span ref={valueRef} class="ctl-meter__value">0.0 rad/s</span>
    </div>
  );
}
