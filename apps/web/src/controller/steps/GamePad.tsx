import type { SlotId } from '@quickquest/protocol';
import { slotStyle, t, type Accessory } from '@quickquest/ui';
import { useRef, useState } from 'preact/hooks';

export interface GamePadProps {
  readonly slot: SlotId;
  readonly color: string;
  readonly accessory: Accessory;
  readonly gameId: string;
  readonly layoutId: string;
  readonly isDemo: boolean;
  readonly isLost: boolean;
  readonly onLeave: () => void;
}

export function GamePad({ slot, color, gameId, isDemo, isLost, onLeave }: GamePadProps) {
  const [aim, setAim] = useState(0); // -1.0 .. +1.0
  const [isPressed, setPressed] = useState(false);
  const grooveRef = useRef<HTMLDivElement>(null);
  const style = slotStyle(slot);

  const updateAimFromPointer = (clientX: number) => {
    if (!grooveRef.current) return;
    const rect = grooveRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const clamped = Math.max(0, Math.min(rect.width, relativeX));
    const normalized = (clamped / rect.width) * 2 - 1; // -1 .. +1
    setAim(normalized);
  };

  const onTrackpadPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateAimFromPointer(e.clientX);
    try { navigator.vibrate?.(15); } catch {}
  };

  const onTrackpadPointerMove = (e: PointerEvent) => {
    if (e.buttons > 0) {
      updateAimFromPointer(e.clientX);
    }
  };

  const onActionDown = (e: PointerEvent) => {
    e.preventDefault();
    setPressed(true);
    try { navigator.vibrate?.(45); } catch {}
  };

  const onActionUp = (e: PointerEvent) => {
    e.preventDefault();
    if (isPressed) {
      setPressed(false);
      try { navigator.vibrate?.(65); } catch {}
    }
  };

  const gameName = gameId === 'bowling' ? 'Bowling' : gameId;
  const dotPercent = ((aim + 1) / 2) * 100;

  return (
    <section class="ctl-screen ctl-game" style={{ '--slot': color || style.hex }}>
      <header class="ctl-game__bar">
        <div class="ctl-slot-pill">
          <span>{style.symbol}</span>
          <strong>{slot}</strong>
        </div>
        <span class="ctl-game__title">{gameName}</span>
        {isLost ? (
          <span class="ctl-demo" style={{ background: 'var(--danger-100)', color: 'var(--danger-700)' }}>
            {t('controller.reconnecting')}
          </span>
        ) : isDemo ? (
          <span class="ctl-demo">{t('controller.demoBadge')}</span>
        ) : (
          <span class="ctl-demo">📶 {t('controller.readySent')}</span>
        )}
      </header>

      {/* Trackpad di mira orizzontale */}
      <div class="ctl-trackpad" aria-label={t('controller.trackpadHint')}>
        <span class="ctl-trackpad__label">◀ {t('controller.trackpadHint')} ▶</span>
        <div
          ref={grooveRef}
          class="ctl-trackpad__groove"
          onPointerDown={onTrackpadPointerDown}
          onPointerMove={onTrackpadPointerMove}
        >
          <div class="ctl-trackpad__center-line" aria-hidden="true" />
          <div
            class="ctl-trackpad__dot"
            aria-hidden="true"
            style={{ left: `${dotPercent}%` }}
          />
        </div>
      </div>

      {/* Tasto azione grande per swing e rilascio col pollice (docs/08 § 2) */}
      <button
        type="button"
        class={`ctl-action-btn ${isPressed ? 'is-pressed' : ''}`}
        onPointerDown={onActionDown}
        onPointerUp={onActionUp}
        onPointerCancel={onActionUp}
      >
        <span class="ctl-action-btn__icon" aria-hidden="true">🎳</span>
        <span>
          {isPressed ? t('controller.actionButtonRelease') : t('controller.actionButtonHold')}
        </span>
      </button>

      <footer class="ctl-actions">
        <button type="button" class="qq-btn qq-btn--ghost" onClick={onLeave}>
          {t('controller.leave')}
        </button>
      </footer>
    </section>
  );
}

