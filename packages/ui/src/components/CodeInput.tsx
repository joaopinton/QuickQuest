// Quattro caselle grandi per il codice stanza: incolla, sovrascrittura e cancellazione.
import { useRef } from 'preact/hooks';
import { t } from '../i18n';
import { applyBackspaceOnEmpty, applyCellInput, type CellEdit } from './code-input-logic';

export interface CodeInputProps {
  value: string;
  length?: number;
  /** Normalizza e filtra un carattere; ritorna '' se non è ammesso. */
  normalize: (ch: string) => string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  hasError?: boolean;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

export function CodeInput({ value, length = 4, normalize, onChange, onComplete, hasError = false, autoFocus = false, size = 'lg' }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  const apply = (edit: CellEdit) => {
    onChange(edit.value);
    refs.current[edit.focus]?.focus();
    if (edit.value.length === length && edit.value !== value) onComplete?.(edit.value);
  };

  const handleInput = (i: number, el: HTMLInputElement) => {
    const edit = applyCellInput(value, i, el.value, length, normalize);
    if (edit) apply(edit);
    else el.value = chars[i] ?? ''; // carattere non ammesso: si ripristina
  };

  const handleKeyDown = (i: number, e: KeyboardEvent) => {
    if (e.key === 'Backspace') {
      const edit = applyBackspaceOnEmpty(value, i);
      if (edit) {
        e.preventDefault();
        apply(edit);
      }
    } else if (e.key === 'ArrowLeft') {
      refs.current[Math.max(0, i - 1)]?.focus();
    } else if (e.key === 'ArrowRight') {
      refs.current[Math.min(length - 1, i + 1)]?.focus();
    }
  };

  return (
    <div class={`qq-code qq-code--${size} ${hasError ? 'qq-code--error' : ''}`} role="group" aria-label={t('code.label')}>
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          class="qq-code__cell"
          value={ch}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellcheck={false}
          maxLength={length}
          aria-label={t('code.charLabel', { n: i + 1 })}
          aria-invalid={hasError}
          autoFocus={autoFocus && i === 0}
          onInput={(e) => handleInput(i, e.currentTarget as HTMLInputElement)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        />
      ))}
    </div>
  );
}
