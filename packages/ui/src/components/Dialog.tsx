// Dialog modale su <dialog> nativo: focus intrappolato e tasto Esc gratis dal browser.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  accent?: string;
  children: ComponentChildren;
}

export function Dialog({ isOpen, onClose, title, accent, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    if (!isOpen && el.open) el.close();
  }, [isOpen]);

  // Si chiude cliccando fuori dal pannello, ma non se una selezione iniziata dentro finisce fuori.
  const downOnBackdrop = useRef(false);
  const handlePointerDown = (e: PointerEvent) => { downOnBackdrop.current = e.target === ref.current; };
  const handleBackdrop = (e: MouseEvent) => {
    if (e.target === ref.current && downOnBackdrop.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      class="qq-dialog"
      aria-label={title}
      style={accent ? { '--dialog-accent': accent } : undefined}
      onClose={onClose}
      onPointerDown={handlePointerDown}
      onClick={handleBackdrop}
    >
      <div class="qq-dialog__panel">
        <button type="button" class="qq-dialog__close" onClick={onClose} aria-label={t('games.close')}>×</button>
        {children}
      </div>
    </dialog>
  );
}
