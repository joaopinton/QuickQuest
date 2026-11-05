// Festa dello strike sopra la scena: lampo, raggi che girano, onde d'urto, la parola che entra
// lettera per lettera e il punteggio. Sostituisce il banner normale quando l'esito è uno strike.

import type { ShotReport } from '../useBowlingGame';

const WORD = 'STRIKE!';
const SPARKS = 14;

export function StrikeBurst({ shot }: { readonly shot: ShotReport }) {
  return (
    <div class="bw-strike" style={{ '--player': shot.player.color }} role="status" aria-live="assertive">
      <div class="bw-strike__flash" aria-hidden="true" />
      <div class="bw-strike__rays" aria-hidden="true" />
      <div class="bw-strike__ring" aria-hidden="true" />
      <div class="bw-strike__ring bw-strike__ring--late" aria-hidden="true" />
      <div class="bw-strike__sparks" aria-hidden="true">
        {Array.from({ length: SPARKS }, (_, i) => (
          <span key={i} class="bw-strike__spark" style={{ '--a': `${(360 / SPARKS) * i}deg`, '--d': `${(i % 3) * 60}ms` }} />
        ))}
      </div>
      <div class="bw-strike__card">
        <p class="bw-strike__who">
          <span class="bw-toast__dot" aria-hidden="true">{shot.player.symbol}</span>
          {shot.player.name} · Frame {shot.frame}
        </p>
        <p class="bw-strike__word" aria-label={WORD}>
          {WORD.split('').map((ch, i) => (
            <span key={i} class="bw-strike__letter" style={{ '--i': i }} aria-hidden="true">{ch}</span>
          ))}
        </p>
        <p class="bw-strike__score">
          <span class="bw-toast__gain">+{shot.gained}</span>
          <span>Totale <strong>{shot.total}</strong></span>
        </p>
      </div>
    </div>
  );
}
