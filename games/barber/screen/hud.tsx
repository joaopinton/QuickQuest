// Pezzi dell'HUD del Barber shop: figurina della richiesta, stelle, podio con i premi.

import type { ScreenPlayer } from '../../contract';
import { silhouette, type Haircut } from '../shared/haircuts';
import type { Award, StandingRow } from './rules';

const FIG_R = 26;
const FIG_HAIR = 16;

function silhouettePath(cut: Haircut, view: 'front' | 'side', cx: number, cy: number): string {
  return silhouette(cut, view)
    .map((p, i) => {
      const r = FIG_R + FIG_HAIR * p.length;
      const x = cx + r * Math.sin(p.angle);
      const y = cy - r * Math.cos(p.angle);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ')
    .concat(' Z');
}

/** Figurina del taglio richiesto, di fronte e di lato (docs/11 § 6.1). */
export function HaircutFigure({ cut }: { readonly cut: Haircut }) {
  return (
    <svg class="bb-figure" viewBox="0 0 180 90" role="img" aria-label={`Taglio richiesto: ${cut.name}`}>
      {(['front', 'side'] as const).map((view, i) => {
        const cx = 45 + i * 90;
        const cy = 50;
        return (
          <g key={view}>
            <path d={silhouettePath(cut, view, cx, cy)} class="bb-figure__hair" />
            <circle cx={cx} cy={cy} r={FIG_R - 1} class="bb-figure__skin" />
            {view === 'front' ? (
              <>
                <circle cx={cx - 9} cy={cy + 3} r={2.6} class="bb-figure__eye" />
                <circle cx={cx + 9} cy={cy + 3} r={2.6} class="bb-figure__eye" />
                <path d={`M${cx - 7},${cy + 12} Q${cx},${cy + 17} ${cx + 7},${cy + 12}`} class="bb-figure__mouth" />
              </>
            ) : (
              <>
                <circle cx={cx + 15} cy={cy + 3} r={2.6} class="bb-figure__eye" />
                <circle cx={cx - 3} cy={cy + 4} r={5} class="bb-figure__ear" />
              </>
            )}
            <text x={cx} y={88} class="bb-figure__label">
              {view === 'front' ? 'fronte' : 'lato'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Stars({ count, max = 5 }: { readonly count: number; readonly max?: number }) {
  return (
    <span class="bb-stars" aria-label={`${count} stelle su ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} class={i < count ? 'is-on' : ''} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

interface PodiumProps {
  readonly board: readonly StandingRow[];
  readonly awards: readonly Award[];
  readonly playerById: (id: string) => ScreenPlayer;
  readonly onLobby: () => void;
  readonly onSetup: () => void;
  readonly onRematch: () => void;
}

export function Podium({ board, awards, playerById, onLobby, onSetup, onRematch }: PodiumProps) {
  const winner = playerById(board[0]?.playerId ?? 'P1');
  return (
    <div class="bb-modal-backdrop">
      <section class="bb-modal" aria-labelledby="bb-podium-title">
        <span class="bb-eyebrow">Bottega chiusa</span>
        <h1 id="bb-podium-title" class="bb-modal__title">
          💈 Vince {winner.name}!
        </h1>
        <ol class="bb-podium">
          {board.map((row) => {
            const p = playerById(row.playerId);
            return (
              <li key={row.playerId} class="bb-podium__row" style={{ '--player': p.color }}>
                <span class="bb-podium__rank">#{row.position}</span>
                <span class="bb-podium__name">
                  {p.symbol} {p.name}
                </span>
                <Stars count={Math.round(row.avgStars)} />
                <span class="bb-podium__score">{row.score} pt</span>
              </li>
            );
          })}
        </ol>
        {awards.length > 0 && (
          <div class="bb-awards">
            {awards.map((a) => {
              const p = playerById(a.playerId);
              return (
                <div key={a.id} class="bb-award">
                  <span class="bb-award__icon" aria-hidden="true">
                    {a.icon}
                  </span>
                  <div>
                    <strong>{a.title}</strong>
                    <small style={{ color: p.color }}>{p.name}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div class="bb-modal__actions">
          <button type="button" class="bb-btn bb-btn--secondary" onClick={onLobby}>
            Lobby
          </button>
          <button type="button" class="bb-btn bb-btn--secondary" onClick={onSetup}>
            Impostazioni
          </button>
          <button type="button" class="bb-btn bb-btn--primary" onClick={onRematch}>
            Rivincita
          </button>
        </div>
      </section>
    </div>
  );
}
