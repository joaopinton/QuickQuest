// Banner mostrato dopo ogni tiro: birilli abbattuti, esito e totale aggiornato.

import type { ShotReport } from '../useBowlingGame';

const HEADLINE: Record<ShotReport['outcome'], (pins: number) => string> = {
  strike: () => 'STRIKE!',
  spare: () => 'SPARE!',
  gutter: () => 'Canalina!',
  open: (pins) => `${pins} birill${pins === 1 ? 'o' : 'i'}`,
};

export function ShotToast({ shot }: { readonly shot: ShotReport }) {
  return (
    <div
      class={`bw-toast bw-toast--${shot.outcome}`}
      style={{ '--player': shot.player.color }}
      role="status"
      aria-live="polite"
    >
      <p class="bw-toast__who">
        <span class="bw-toast__dot" aria-hidden="true">{shot.player.symbol}</span>
        {shot.player.name} · Frame {shot.frame} · Tiro {shot.roll}
      </p>
      <p class="bw-toast__headline">{HEADLINE[shot.outcome](shot.pins)}</p>
      <p class="bw-toast__score">
        <span class="bw-toast__gain">+{shot.gained}</span>
        <span>Totale <strong>{shot.total}</strong></span>
      </p>
    </div>
  );
}
