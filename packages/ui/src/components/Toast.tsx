// Toast: pillola in alto che esce dopo 3 s (docs/08 § 4).
import { signal } from '@preact/signals';

interface ToastItem {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'success' | 'danger';
}

const toasts = signal<readonly ToastItem[]>([]);
let nextId = 1;
export const TOAST_MS = 3000;

export function showToast(text: string, tone: ToastItem['tone'] = 'info'): void {
  const item: ToastItem = { id: nextId++, text, tone };
  toasts.value = [...toasts.value, item];
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== item.id);
  }, TOAST_MS);
}

export function ToastHost() {
  return (
    <div class="qq-toasts" role="status" aria-live="polite">
      {toasts.value.map((x) => (
        <div key={x.id} class={`qq-toast qq-toast--${x.tone}`}>{x.text}</div>
      ))}
    </div>
  );
}
