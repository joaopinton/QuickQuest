// Scelta del Bubù: nome, due colori, motivo, occhi, bocca e accessori per testa, viso e collo.
// L'anteprima grande salta a ogni cambio; le opzioni sono mini-Bubù già vestiti, così si vede
// subito cosa si sceglie. "A caso" rimescola tutto tranne il nome.
import {
  BUBU_COLORS, Bubu, bubuColor, EYES, FACE_ITEMS, HATS, MOUTHS, NAME_MAX, NECK_ITEMS, PATTERNS, Button, cleanName, slotStyle, t, typingName,
  type BubuFraming, type BubuStyle, type SlotId,
} from '@quickquest/ui';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { choiceStyle, randomChoice, type BubuChoice } from '../prefs';

type Tab = 'colors' | 'pattern' | 'face' | 'extras';
const TABS: readonly Tab[] = ['colors', 'pattern', 'face', 'extras'];
const TAB_LABEL: Readonly<Record<Tab, string>> = {
  colors: 'controller.tabColors',
  pattern: 'controller.tabPattern',
  face: 'controller.tabFace',
  extras: 'controller.tabExtras',
};

type StyleKey = 'pattern' | 'eyes' | 'mouth' | 'hat' | 'face' | 'neck';
const FRAMING: Readonly<Record<StyleKey, BubuFraming>> = {
  pattern: 'full', eyes: 'face', mouth: 'face', face: 'face', hat: 'head', neck: 'full',
};

interface OptionGridProps<K extends StyleKey> {
  readonly field: K;
  readonly options: readonly BubuStyle[K][];
  readonly i18nGroup: string;
  readonly legend: string;
  readonly choice: BubuChoice;
  readonly onPick: (value: BubuStyle[K]) => void;
}

/** Griglia di mini-Bubù: ognuno mostra il Bubù attuale con quell'opzione al posto della sua. */
function OptionGrid<K extends StyleKey>({ field, options, i18nGroup, legend, choice, onPick }: OptionGridProps<K>) {
  const color = bubuColor(choice.colorId).hex;
  const base = choiceStyle(choice);
  return (
    <fieldset class="ctl-field">
      <legend>{legend}</legend>
      <div class="ctl-options" role="radiogroup">
        {options.map((opt) => {
          const name = t(`look.${i18nGroup}.${opt}`);
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={(choice[field] as string) === opt}
              aria-label={name}
              class="ctl-option"
              onClick={() => onPick(opt)}
            >
              <Bubu color={color} look={{ ...base, [field]: opt }} motion="none" framing={FRAMING[field]} size={56} />
              <span class="ctl-option__name">{name}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Swatches({ legend, nameKey, selected, onPick }: { legend: string; nameKey: string; selected: string; onPick: (id: string) => void }) {
  return (
    <fieldset class="ctl-field">
      <legend>{legend}</legend>
      <div class="ctl-swatches" role="radiogroup">
        {BUBU_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={c.id === selected}
            aria-label={t(nameKey, { name: t(`colors.${c.id}`) })}
            class="ctl-swatch"
            style={{ '--swatch': c.hex } as JSX.CSSProperties}
            onClick={() => onPick(c.id)}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function PickBubu({ slot, initial, onConfirm }: { slot: SlotId; initial: BubuChoice; onConfirm: (c: BubuChoice) => void }) {
  const [choice, setChoice] = useState(initial);
  const [tab, setTab] = useState<Tab>('colors');
  const [bump, setBump] = useState(0);
  const color = bubuColor(choice.colorId);
  const s = slotStyle(slot);
  const placeholder = t('controller.namePlaceholder', { n: slot.slice(1) });

  const update = (next: Partial<BubuChoice>) => {
    setChoice((c) => ({ ...c, ...next }));
    setBump((b) => b + 1);
  };

  const grid = <K extends StyleKey>(field: K, options: readonly BubuStyle[K][], group: string, legend: string) => (
    <OptionGrid
      field={field}
      options={options}
      i18nGroup={group}
      legend={t(legend)}
      choice={choice}
      onPick={(v) => update({ [field]: v } as Partial<BubuChoice>)}
    />
  );

  return (
    <section class="ctl-screen ctl-pick" style={{ '--tint': color.hex } as JSX.CSSProperties}>
      <header class="ctl-pick__head">
        <span class="ctl-slot-pill" style={{ '--slot': s.hex } as JSX.CSSProperties}>
          <span aria-hidden="true">{s.symbol}</span> {t('controller.slotTitle', { slot })}
        </span>
        <h1 class="ctl-title">{t('controller.pickTitle')}</h1>
        <p class="ctl-lead">{t('controller.pickLead')}</p>
      </header>

      <div class="ctl-pick__stage">
        <div class="ctl-pick__preview" key={bump}>
          <Bubu color={color.hex} look={choiceStyle(choice)} mood="happy" motion="hop" size={150} label={choice.name || placeholder} />
        </div>
        <button type="button" class="ctl-dice" onClick={() => update(randomChoice(choice.name))}>
          {t('controller.randomize')}
        </button>
      </div>

      <label class="ctl-name">
        <span class="ctl-name__label">{t('controller.nameLabel')}</span>
        <input
          class="ctl-name__input"
          type="text"
          inputMode="text"
          autoComplete="nickname"
          enterKeyHint="done"
          maxLength={NAME_MAX * 2}
          placeholder={placeholder}
          value={choice.name}
          onInput={(e) => setChoice((c) => ({ ...c, name: typingName((e.currentTarget as HTMLInputElement).value) }))}
        />
        <span class="ctl-name__hint">{t('controller.nameHint', { max: NAME_MAX })}</span>
      </label>

      <div class="ctl-tabs" role="tablist" aria-label={t('controller.pickTitle')}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class="ctl-tab"
            onClick={() => setTab(id)}
          >
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </div>

      <div class="ctl-tabpanel" role="tabpanel">
        {tab === 'colors' && (
          <>
            <Swatches legend={t('controller.colorLabel')} nameKey="controller.colorName" selected={choice.colorId} onPick={(id) => update({ colorId: id })} />
            <Swatches legend={t('controller.color2Label')} nameKey="controller.color2Name" selected={choice.color2Id} onPick={(id) => update({ color2Id: id })} />
          </>
        )}
        {tab === 'pattern' && grid('pattern', PATTERNS, 'patterns', 'controller.patternLabel')}
        {tab === 'face' && (
          <>
            {grid('eyes', EYES, 'eyes', 'controller.eyesLabel')}
            {grid('mouth', MOUTHS, 'mouths', 'controller.mouthLabel')}
            {grid('face', FACE_ITEMS, 'face', 'controller.faceLabel')}
          </>
        )}
        {tab === 'extras' && (
          <>
            {grid('hat', HATS, 'hats', 'controller.hatLabel')}
            {grid('neck', NECK_ITEMS, 'neck', 'controller.neckLabel')}
          </>
        )}
      </div>

      <div class="ctl-actions">
        <Button size="xl" isBlock onClick={() => onConfirm({ ...choice, name: cleanName(choice.name) })}>{t('controller.pickConfirm')}</Button>
      </div>
    </section>
  );
}
