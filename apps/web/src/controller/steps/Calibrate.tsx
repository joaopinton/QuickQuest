// Fase di prova e taratura: si controlla che i sensori rispondano, poi due tiri di prova
// verso lo schermo insegnano al telefono come lanci tu (asse dello swing, direzione, forza).
import {
  MIN_SWING_PEAK, profileFromPractice, type MotionTracker, type SwingAnalysis, type SwingProfile,
} from '@quickquest/motion';
import { Button, t } from '@quickquest/ui';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HapticsService } from '../haptics';
import { MotionMeter } from '@quickquest/games/shared/MotionMeter';

export interface CalibrateProps {
  readonly tracker: MotionTracker;
  readonly haptics: HapticsService;
  readonly color: string;
  readonly isSimulated: boolean;
  readonly onDone: (profile: SwingProfile | null) => void;
}

const PRACTICE_THROWS = 2;
const NO_DATA_AFTER_MS = 3000;
const MOVE_TARGET = 2; // rad/s per dire "i sensori rispondono"

type Phase = 'sensors' | 'practice' | 'done';

/** Testo dell'esito di uno swing (tiro di prova o tiro vero non riuscito). */
export function swingMessage(a: SwingAnalysis): string {
  if (a.valid) return t('controller.calibGood', { w: a.peak.toFixed(1) });
  if (a.failure === 'no-data') return t('controller.calibNoSwingData');
  return t('controller.calibWeak', { w: a.peak.toFixed(1), min: MIN_SWING_PEAK });
}

function SensorCheck({ tracker, onNext }: { tracker: MotionTracker; onNext: () => void }) {
  const [isMoving, setMoving] = useState(false);
  const [hasNoData, setNoData] = useState(false);

  useEffect(() => {
    const started = performance.now();
    let hasAxes = false;
    const id = setInterval(() => {
      if (tracker.omega > MOVE_TARGET && tracker.samples > 30) setMoving(true);
      // mentre si muove il telefono si verifica l'ordine degli assi del giroscopio (axis-check.ts)
      if (!hasAxes && tracker.samples > 30) hasAxes = tracker.checkAxes().order !== null;
      setNoData(tracker.samples === 0 && performance.now() - started > NO_DATA_AFTER_MS);
    }, 100);
    return () => clearInterval(id);
  }, [tracker]);

  return (
    <>
      <h1 class="ctl-title">{t('controller.calibTitle')}</h1>
      <p class="ctl-lead">{t('controller.calibMove')}</p>
      <MotionMeter tracker={tracker} />
      {hasNoData && <p class="ctl-banner ctl-banner--danger" role="alert">{t('controller.calibNoData')}</p>}
      {isMoving && <p class="ctl-turn ctl-turn--mine">{t('controller.calibSensorsOk')}</p>}
      <div class="ctl-actions">
        <Button size="xl" isBlock disabled={!isMoving} onClick={onNext}>{t('controller.calibNext')}</Button>
      </div>
    </>
  );
}

function Practice({ tracker, haptics, onProfile }: { tracker: MotionTracker; haptics: HapticsService; onProfile: (p: SwingProfile) => void }) {
  const [goodCount, setGoodCount] = useState(0);
  const [last, setLast] = useState<SwingAnalysis | null>(null);
  const [isPressed, setPressed] = useState(false);
  const goodRef = useRef<SwingAnalysis[]>([]);

  const down = (e: PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    tracker.press(performance.now());
    setPressed(true);
    haptics.play('tap');
  };

  const up = (e: PointerEvent) => {
    e.preventDefault();
    if (!tracker.isPressed) return;
    setPressed(false);
    const a = tracker.release(performance.now());
    setLast(a);
    if (!a.valid) {
      haptics.play('error');
      return;
    }
    haptics.play('success');
    goodRef.current = [...goodRef.current, a];
    setGoodCount(goodRef.current.length);
    if (goodRef.current.length >= PRACTICE_THROWS) {
      const profile = profileFromPractice(goodRef.current);
      if (profile) onProfile(profile);
    }
  };

  const count = t('controller.calibPracticeCount', { n: Math.min(goodCount + 1, PRACTICE_THROWS), total: PRACTICE_THROWS });

  return (
    <>
      <h1 class="ctl-title">{t('controller.calibPracticeTitle')}</h1>
      <p class="ctl-lead">{t('controller.calibPracticeLead')}</p>
      <p class="ctl-turn">{count}</p>
      <MotionMeter tracker={tracker} />
      {last && <p class={`ctl-turn ${last.valid ? 'ctl-turn--mine' : ''}`} aria-live="polite">{swingMessage(last)}</p>}
      <button
        type="button"
        class={`ctl-action-btn ${isPressed ? 'is-pressed' : ''}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">🎳</span>
        <span>{isPressed ? t('controller.actionButtonRelease') : t('controller.actionButtonHold')}</span>
      </button>
    </>
  );
}

export function Calibrate({ tracker, haptics, color, isSimulated, onDone }: CalibrateProps) {
  const [phase, setPhase] = useState<Phase>('sensors');
  const [profile, setProfile] = useState<SwingProfile | null>(null);

  if (isSimulated) {
    return (
      <section class="ctl-screen ctl-game" style={{ '--slot': color }}>
        <h1 class="ctl-title">{t('controller.calibTitle')}</h1>
        <div class="ctl-actions"><Button size="xl" isBlock onClick={() => onDone(null)}>{t('controller.calibSkip')}</Button></div>
      </section>
    );
  }

  return (
    <section class="ctl-screen ctl-game" style={{ '--slot': color }}>
      {phase === 'sensors' && <SensorCheck tracker={tracker} onNext={() => { haptics.play('select'); setPhase('practice'); }} />}
      {phase === 'practice' && (
        <Practice tracker={tracker} haptics={haptics} onProfile={(p) => { setProfile(p); setPhase('done'); }} />
      )}
      {phase === 'done' && (
        <>
          <h1 class="ctl-title">{t('controller.calibDoneTitle')}</h1>
          <p class="ctl-lead">{t('controller.calibDoneLead')}</p>
          <div class="ctl-actions">
            <Button size="xl" isBlock onClick={() => onDone(profile)}>{t('controller.calibPlay')}</Button>
            <Button variant="ghost" onClick={() => setPhase('practice')}>{t('controller.calibRedo')}</Button>
          </div>
        </>
      )}
    </section>
  );
}
