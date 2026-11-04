// Scelta del Pupo: 8 colori e 7 accessori, anteprima che salta a ogni cambio.
import { ACCESSORIES, Button, PUPO_COLORS, Pupo, slotStyle, t, type Accessory, type SlotId } from '@quickquest/ui';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

export interface PupoChoice {
  readonly colorId: string;
  readonly accessory: Accessory;
}

export function PickPupo({ slot, initial, onConfirm }: { slot: SlotId; initial: PupoChoice; onConfirm: (c: PupoChoice) => void }) {
  const [choice, setChoice] = useState(initial);
  const [bump, setBump] = useState(0);
  const color = PUPO_COLORS.find((c) => c.id === choice.colorId) ?? PUPO_COLORS[0]!;
  const s = slotStyle(slot);

  const update = (next: Partial<PupoChoice>) => {
    setChoice((c) => ({ ...c, ...next }));
    setBump((b) => b + 1);
  };

  return (
    <section class="ctl-screen ctl-pick" style={{ '--tint': color.hex } as JSX.CSSProperties}>
      <header class="ctl-pick__head">
        <span class="ctl-slot-pill" style={{ '--slot': s.hex } as JSX.CSSProperties}>
          <span aria-hidden="true">{s.symbol}</span> {t('controller.slotTitle', { slot })}
        </span>
        <h1 class="ctl-title">{t('controller.pickTitle')}</h1>
        <p class="ctl-lead">{t('controller.pickLead')}</p>
      </header>
      <div class="ctl-pick__preview" key={bump}>
        <Pupo color={color.hex} accessory={choice.accessory} mood="happy" motion="hop" size={170} label={`${t(`colors.${color.id}`)}, ${t(`accessories.${choice.accessory}`)}`} />
      </div>
      <fieldset class="ctl-field">
        <legend>{t('controller.colorLabel')}</legend>
        <div class="ctl-swatches" role="radiogroup">
          {PUPO_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === choice.colorId}
              aria-label={t('controller.colorName', { name: t(`colors.${c.id}`) })}
              class="ctl-swatch"
              style={{ '--swatch': c.hex } as JSX.CSSProperties}
              onClick={() => update({ colorId: c.id })}
            />
          ))}
        </div>
      </fieldset>
      <fieldset class="ctl-field">
        <legend>{t('controller.accessoryLabel')}</legend>
        <div class="ctl-chips" role="radiogroup">
          {ACCESSORIES.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={a === choice.accessory} class="ctl-chip" onClick={() => update({ accessory: a })}>
              {t(`accessories.${a}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <div class="ctl-actions">
        <Button size="xl" isBlock onClick={() => onConfirm(choice)}>{t('controller.pickConfirm')}</Button>
      </div>
    </section>
  );
}
