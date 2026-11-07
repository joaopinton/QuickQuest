// Scelta del Piggy: nome, due colori, motivo, occhi, becco e accessori per testa, viso e collo.
// In alto il "palco" resta fermo mentre si scorre: il Piggy su un trespolo, con il nome scritto
// sulla targhetta sotto i piedi. Sotto, schede con icone e tessere con mini-Piggy già vestiti.
// "A caso" rimescola tutto tranne il nome.
import {
  PIGGY_COLORS, Piggy, piggyColor, EYES, FACE_ITEMS, HATS, MOUTHS, NAME_MAX, NECK_ITEMS, PATTERNS, Button, cleanName, slotStyle, t, typingName,
  type PiggyFraming, type PiggyStyle, type SlotId,
} from '@quickquest/ui';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { choiceStyle, randomChoice, type PiggyChoice } from '../prefs';

type Tab = 'colors' | 'pattern' | 'face' | 'extras';
const TABS: readonly Tab[] = ['colors', 'pattern', 'face', 'extras'];
const TAB_LABEL: Readonly<Record<Tab, string>> = {
  colors: 'controller.tabColors',
  pattern: 'controller.tabPattern',
  face: 'controller.tabFace',
  extras: 'controller.tabExtras',
};
const TAB_ICON: Readonly<Record<Tab, string>> = { colors: '🎨', pattern: '🌀', face: '👀', extras: '🎩' };

type StyleKey = 'pattern' | 'eyes' | 'mouth' | 'hat' | 'face' | 'neck';
const FRAMING: Readonly<Record<StyleKey, PiggyFraming>> = {
  pattern: 'full', eyes: 'face', mouth: 'face', face: 'face', hat: 'head', neck: 'full',
};

interface OptionGridProps<K extends StyleKey> {
  readonly field: K;
  readonly options: readonly PiggyStyle[K][];
  readonly i18nGroup: string;
  readonly legend: string;
  readonly choice: PiggyChoice;
  readonly onPick: (value: PiggyStyle[K]) => void;
}

/** Griglia di mini-Piggy: ognuno mostra il Piggy attuale con quell'opzione al posto della sua. */
function OptionGrid<K extends StyleKey>({ field, options, i18nGroup, legend, choice, onPick }: OptionGridProps<K>) {
  const color = piggyColor(choice.colorId).hex;
  const base = choiceStyle(choice);
  return (
    <fieldset class="ctl-field">
      <legend class="ctl-field__legend">{legend}</legend>
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
              <span class="ctl-option__art">
                <Piggy color={color} look={{ ...base, [field]: opt }} motion="none" framing={FRAMING[field]} size={58} />
              </span>
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
      <legend class="ctl-field__legend">{legend}</legend>
      <div class="ctl-swatches" role="radiogroup">
        {PIGGY_COLORS.map((c) => (
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

export function PickPiggy({ slot, initial, onConfirm }: { slot: SlotId; initial: PiggyChoice; onConfirm: (c: PiggyChoice) => void }) {
  const [choice, setChoice] = useState(initial);
  const [tab, setTab] = useState<Tab>('colors');
  const [bump, setBump] = useState(0);
  const color = piggyColor(choice.colorId);
  const color2 = piggyColor(choice.color2Id);
  const s = slotStyle(slot);
  const placeholder = t('controller.namePlaceholder', { n: slot.slice(1) });
  const tint = { '--tint': color.hex, '--tint-2': color2.hex, '--slot': s.hex } as JSX.CSSProperties;

  const update = (next: Partial<PiggyChoice>) => {
    setChoice((c) => ({ ...c, ...next }));
    setBump((b) => b + 1);
  };

  const grid = <K extends StyleKey>(field: K, options: readonly PiggyStyle[K][], group: string, legend: string) => (
    <OptionGrid
      field={field}
      options={options}
      i18nGroup={group}
      legend={t(legend)}
      choice={choice}
      onPick={(v) => update({ [field]: v } as Partial<PiggyChoice>)}
    />
  );

  return (
    <section class="ctl-screen ctl-pick" style={tint}>
      <div class="ctl-pick__top">
        <header class="ctl-pick__head">
          <span class="ctl-slot-pill">
            <span aria-hidden="true">{s.symbol}</span> {t('controller.slotTitle', { slot })}
          </span>
          <h1 class="ctl-pick__title">{t('controller.pickTitle')}</h1>
        </header>

        <div class="ctl-stage">
          <span class="ctl-stage__sun" aria-hidden="true" />
          <span class="ctl-stage__cloud ctl-stage__cloud--a" aria-hidden="true" />
          <span class="ctl-stage__cloud ctl-stage__cloud--b" aria-hidden="true" />
          <div class="ctl-stage__piggy" key={bump}>
            <Piggy color={color.hex} look={choiceStyle(choice)} mood="happy" motion="hop" size={150} label={choice.name || placeholder} />
          </div>
          <span class="ctl-stage__perch" aria-hidden="true" />
          <button type="button" class="ctl-dice" aria-label={t('controller.randomize')} onClick={() => update(randomChoice(choice.name))}>
            <span aria-hidden="true">🎲</span>
          </button>
          <label class="ctl-plate">
            <span class="visually-hidden">{t('controller.nameLabel')}</span>
            <input
              class="ctl-plate__input"
              type="text"
              inputMode="text"
              autoComplete="nickname"
              enterKeyHint="done"
              maxLength={NAME_MAX * 2}
              placeholder={placeholder}
              aria-describedby="ctl-name-hint"
              value={choice.name}
              onInput={(e) => setChoice((c) => ({ ...c, name: typingName((e.currentTarget as HTMLInputElement).value) }))}
            />
            <span class="ctl-plate__pen" aria-hidden="true">✎</span>
          </label>
          <span id="ctl-name-hint" class="visually-hidden">{t('controller.nameHint', { max: NAME_MAX })}</span>
        </div>

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
              <span class="ctl-tab__icon" aria-hidden="true">{TAB_ICON[id]}</span>
              <span class="ctl-tab__label">{t(TAB_LABEL[id])}</span>
            </button>
          ))}
        </div>
      </div>

      <div class="ctl-tabpanel" role="tabpanel" key={tab}>
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

      <div class="ctl-actions ctl-pick__confirm">
        <Button size="xl" isBlock onClick={() => onConfirm({ ...choice, name: cleanName(choice.name) })}>{t('controller.pickConfirm')}</Button>
      </div>
    </section>
  );
}
