// Il Piggy: piccione tondo di gelatina lucida (docs/07 § 6), in SVG con animazioni CSS.
// Testolina tonda e petto paffuto, collo cangiante, becco con la cera, ali ripiegate che si aprono
// solo quando salta, zampette rosa. Si personalizza con motivo, occhi, becco e accessori (look.ts).
import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { DEFAULT_STYLE, type PiggyStyle, type EyeStyle, type MouthStyle, type Pattern } from '../look';
import { PiggyFace, PiggyHat, PiggyNeck } from './PiggyParts';
import './piggy.css';

export type PiggyMood = 'idle' | 'happy' | 'wait' | 'lost';
export type PiggyMotion = 'breathe' | 'hop' | 'none';
/** Inquadratura: tutto il corpo, solo la testa (cappelli) o solo la faccia (occhi, bocca). */
export type PiggyFraming = 'full' | 'head' | 'face';

/** Stesse proporzioni 120×150 del corpo intero, così il CSS non cambia. */
const FRAMING_VIEWBOX: Readonly<Record<PiggyFraming, string>> = {
  full: '0 0 120 150',
  head: '10 -14 100 125',
  face: '18 22 84 105',
};

export interface PiggyProps {
  color: string;
  /** Personalizzazione; i campi mancanti prendono il default. */
  look?: Partial<PiggyStyle>;
  mood?: PiggyMood;
  motion?: PiggyMotion;
  wave?: boolean;
  /** Piggy con la palla da bowling in mano. */
  ball?: boolean;
  size?: number | string;
  /** Testo alternativo; senza, il Piggy è decorativo. */
  label?: string;
  /** Ritardo del ciclo di animazione, per desincronizzare più Piggy. */
  delay?: number;
  framing?: PiggyFraming;
  class?: string;
}

export const INK = '#1E2A4A';
const SHADE = '#2B2F7A';
const BODY = 'M60 12 C82 12 96 28 96 48 C96 58 94 62 97 68 C108 82 112 102 106 117 C99 130 82 134 60 134 C38 134 21 130 14 117 C8 102 12 82 23 68 C26 62 24 58 24 48 C24 28 38 12 60 12 Z';

/** Punti del motivo a pois/stelle, lontani dalla faccia. */
const SPECKLES: readonly (readonly [number, number, number])[] = [
  [28, 40, 5], [92, 44, 4.5], [22, 100, 5.5], [98, 98, 5], [40, 116, 5], [80, 118, 5.5],
  [60, 104, 4.5], [24, 70, 4], [96, 70, 4], [60, 126, 4], [46, 98, 3.5], [74, 96, 3.5], [60, 22, 4],
];

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function PatternShape({ kind, color }: { kind: Pattern; color: string }) {
  switch (kind) {
    case 'belly':
      return <ellipse cx="60" cy="108" rx="30" ry="25" fill={color} />;
    case 'stripes':
      return (
        <g fill={color}>
          {[92, 108, 124].map((y) => <rect key={y} x="0" y={y} width="120" height="8" rx="4" />)}
        </g>
      );
    case 'dots':
      return <g fill={color}>{SPECKLES.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />)}</g>;
    case 'stars':
      return <g fill={color}>{SPECKLES.filter((_, i) => i % 2 === 0).map(([x, y, r]) => <path key={`${x}-${y}`} d={star(x, y, r * 1.5)} />)}</g>;
    case 'spots':
      return (
        <g fill={color}>
          <path d="M14 58 q14 -6 18 8 q4 14 -10 18 q-10 2 -8 -26 z" />
          <path d="M92 96 q16 -4 16 12 q-2 16 -18 10 q-10 -8 2 -22 z" />
          <path d="M40 112 q12 -4 14 6 q0 12 -12 10 q-10 -4 -2 -16 z" />
          <path d="M84 24 q10 -6 16 4 q4 10 -8 12 q-10 0 -8 -16 z" />
        </g>
      );
    case 'split':
      return <path d="M0 96 q15 -8 30 0 t30 0 t30 0 t30 0 V150 H0 Z" fill={color} />;
    default:
      return null;
  }
}

interface EyeProps {
  readonly kind: EyeStyle;
  readonly look: number;
  readonly small: boolean;
  readonly lid: string;
}

/** Occhio lucido; `ring` aggiunge l'iride arancio da piccione (occhi di default). */
function GlossyEye({ cx, look, small, ring = false }: { cx: number; look: number; small: boolean; ring?: boolean }) {
  return (
    <g>
      <ellipse cx={cx} cy="58" rx="11" ry="13" fill="#fff" />
      {ring && !small && <ellipse cx={cx + look} cy="59.5" rx="8.6" ry="10.4" fill="#FF9A3C" />}
      <ellipse cx={cx + look} cy="60" rx={small ? 3.5 : ring ? 5.8 : 7} ry={small ? 3.5 : ring ? 7.4 : 9} fill={INK} />
      {!small && <circle cx={cx + look - 2.5} cy="55" r="3" fill="#fff" />}
      {!small && <circle cx={cx + look + 2.5} cy="64" r="1.4" fill="#fff" opacity="0.8" />}
    </g>
  );
}

function Eyes({ kind, look, small, lid }: EyeProps) {
  const sides = [46, 74];
  switch (kind) {
    case 'happy':
      return (
        <g class="qq-piggy__eyes" fill="none" stroke={INK} stroke-width="5.5" stroke-linecap="round">
          {sides.map((x) => <path key={x} d={`M${x - 8} 60 q8 -11 16 0`} />)}
        </g>
      );
    case 'sleepy':
    case 'sly':
      return (
        <g class="qq-piggy__eyes">
          {sides.map((x, i) => {
            const tilt = kind === 'sly' ? (i === 0 ? 4 : -4) : 0;
            return (
              <g key={x}>
                <GlossyEye cx={x} look={kind === 'sly' ? 3 + look : look} small={small} />
                <path d={`M${x - 13} ${45 + tilt} H${x + 13} V${58 - tilt} Q${x} ${54} ${x - 13} ${58 + tilt} Z`} fill={lid} />
                <path d={`M${x - 12} ${58 + tilt} Q${x} ${54} ${x + 12} ${58 - tilt}`} fill="none" stroke={INK} stroke-width="3" stroke-linecap="round" />
              </g>
            );
          })}
        </g>
      );
    case 'stars':
      return (
        <g class="qq-piggy__eyes">
          {sides.map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="58" rx="11" ry="13" fill="#fff" />
              <path d={star(x + look, 59, small ? 5 : 9)} fill="#FFC21A" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
            </g>
          ))}
        </g>
      );
    case 'dots':
      return (
        <g class="qq-piggy__eyes">
          {sides.map((x) => (
            <g key={x}>
              <ellipse cx={x + look} cy="59" rx={small ? 3 : 5} ry={small ? 3 : 6.5} fill={INK} />
              {!small && <circle cx={x + look - 1.5} cy="56.5" r="1.8" fill="#fff" />}
            </g>
          ))}
        </g>
      );
    default:
      return <g class="qq-piggy__eyes">{sides.map((x) => <GlossyEye key={x} cx={x} look={look} small={small} ring />)}</g>;
  }
}

const BEAK = '#FFB547';
const BEAK_DARK = '#E08A1E';
const TONGUE = '#FF7E9A';
const FOOT = '#F27D94';
const beakLine = { stroke: BEAK_DARK, 'stroke-width': 1.6, 'stroke-linejoin': 'round' as const };

/** Becco del piccione: stessi id delle vecchie bocche (look.ts), così i profili salvati restano validi. */
function Beak({ kind }: { kind: MouthStyle }) {
  switch (kind) {
    case 'grin':
      return (
        <g>
          <ellipse cx="60" cy="75" rx="7.5" ry="6.5" fill={INK} />
          <ellipse cx="60" cy="78.5" rx="4.5" ry="2.6" fill={TONGUE} />
          <path d="M53 78 Q60 90 67 78 Q60 82 53 78 Z" fill={BEAK} {...beakLine} />
          <path d="M50 66 Q60 60 70 66 Q66 72 60 74 Q54 72 50 66 Z" fill={BEAK} {...beakLine} />
        </g>
      );
    case 'cat':
      return <path d="M54 67 Q60 63.5 66 67 Q63 71 60 75 Q57 71 54 67 Z" fill={BEAK} {...beakLine} />;
    case 'tongue':
      return (
        <g>
          <path d="M56.5 74 h7 v6 a3.5 3.5 0 0 1 -7 0 z" fill={TONGUE} />
          <path d="M51 67 Q60 62 69 67 Q65 73 60 78 Q55 73 51 67 Z" fill={BEAK} {...beakLine} />
        </g>
      );
    case 'o':
      return (
        <g>
          <ellipse cx="60" cy="76" rx="5.5" ry="6.5" fill={INK} />
          <path d="M54.5 80 Q60 89 65.5 80 Q60 83 54.5 80 Z" fill={BEAK} {...beakLine} />
          <path d="M51 66 Q60 61 69 66 Q65 71 60 73 Q55 71 51 66 Z" fill={BEAK} {...beakLine} />
        </g>
      );
    case 'flat':
      return (
        <g>
          <path d="M48 67 Q60 63 72 67 Q67 73 60 74 Q53 73 48 67 Z" fill={BEAK} {...beakLine} />
          <path d="M51 69.5 H69" fill="none" stroke={BEAK_DARK} stroke-width="1.8" stroke-linecap="round" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M51 67 Q60 62 69 67 Q65 73 60 80 Q55 73 51 67 Z" fill={BEAK} {...beakLine} />
          <path d="M53.5 70.5 Q60 73.5 66.5 70.5" fill="none" stroke={BEAK_DARK} stroke-width="1.6" stroke-linecap="round" />
        </g>
      );
  }
}

const WING = 'M27 72 C12 77 5 97 9 115 C11 124 20 127 26 119 C33 107 35 88 27 72 Z';

/** Ala sinistra ripiegata sul fianco; la destra è la stessa specchiata. Barre e punta del secondo colore. */
function WingShape() {
  return (
    <g>
      <path d={WING} fill="var(--piggy)" />
      <path d={WING} fill={SHADE} opacity="0.14" />
      <path d="M9.5 111 C10 120 14 126 19.5 125.5 C23 125 26 121.5 27.5 117 C21 118.5 14 117 9.5 111 Z" fill="var(--piggy-2)" />
      <path d="M13 95 Q20 92.5 29 96.5 M11.5 104 Q19 101.5 28 105.5" fill="none" stroke="var(--piggy-2)" stroke-width="3.6" stroke-linecap="round" />
      <path d="M25 76 C17 80 12 90 11.5 100" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.35" />
    </g>
  );
}

/** Zampette rosa a tre dita. */
function Feet() {
  return (
    <g fill="none" stroke={FOOT} stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
      {[47, 73].map((x) => <path key={x} d={`M${x} 128 V137.5 M${x} 137.5 l-6.5 4.5 M${x} 137.5 v6 M${x} 137.5 l6.5 4.5`} />)}
    </g>
  );
}

export function Piggy({
  color, look, mood = 'idle', motion = 'breathe', wave = false, ball = false,
  size = 120, label, delay = 0, framing = 'full', class: className = '',
}: PiggyProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const style2: PiggyStyle = { ...DEFAULT_STYLE, ...look };
  const a11y: JSX.SVGAttributes<SVGSVGElement> = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true' };
  // Con una dimensione in px si fissa anche l'altezza: in alcuni contenitori flex height:auto vale 0.
  const height = typeof size === 'number' ? size * (150 / 120) : undefined;
  const style = { '--piggy': color, '--piggy-2': style2.color2, '--piggy-delay': `${delay}s`, width: size, height } as JSX.CSSProperties;
  const eyeLook = mood === 'wait' ? 4 : 0;
  const mouth: MouthStyle = mood === 'lost' ? 'o' : mood === 'happy' && style2.mouth === 'smile' ? 'grin' : style2.mouth;
  const clip = `${id}-body`;
  return (
    <svg
      class={`qq-piggy qq-piggy--${motion} ${wave ? 'qq-piggy--wave' : ''} ${className}`}
      viewBox={FRAMING_VIEWBOX[framing]}
      style={style}
      {...a11y}
    >
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
        <radialGradient id={`${id}-shade`} cx="0.38" cy="0.32" r="0.78">
          <stop offset="0.55" stop-color={SHADE} stop-opacity="0" />
          <stop offset="1" stop-color={SHADE} stop-opacity="0.34" />
        </radialGradient>
        <radialGradient id={`${id}-gloss`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        {/* il collo cangiante dei piccioni: verde acqua → viola → verde acqua */}
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#2FD1B5" />
          <stop offset="0.5" stop-color="#9C6BFF" />
          <stop offset="1" stop-color="#2FD1B5" />
        </linearGradient>
      </defs>
      {/* ombra a terra colorata, mai grigia */}
      <ellipse class="qq-piggy__ground" cx="60" cy="144" rx="34" ry="5.5" fill={SHADE} opacity="0.18" />
      <g class="qq-piggy__body">
        <Feet />
        {/* corpo a pera: testolina tonda e petto paffuto */}
        <path class="qq-piggy__bean" d={BODY} fill="var(--piggy)" />
        <g clip-path={`url(#${clip})`}>
          <PatternShape kind={style2.pattern} color="var(--piggy-2)" />
          <path d="M8 70 Q60 98 112 70 L112 86 Q60 116 8 86 Z" fill={`url(#${id}-sheen)`} opacity="0.3" />
          <rect x="0" y="0" width="120" height="150" fill={`url(#${id}-shade)`} />
        </g>
        {/* riflessi: grande morbido sulla testa, puntino netto e luce di bordo sul petto */}
        <ellipse cx="42" cy="30" rx="16" ry="9" fill={`url(#${id}-gloss)`} transform="rotate(-30 42 30)" />
        <ellipse cx="37" cy="26" rx="4.5" ry="2.8" fill="#fff" opacity="0.85" transform="rotate(-30 37 26)" />
        <path d="M101 88 Q108 102 101 117" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.28" />
        {/* ali: ferme sui fianchi, si aprono solo nel salto (piggy.css) */}
        <g class="qq-piggy__wing qq-piggy__wing--left"><WingShape /></g>
        <g class="qq-piggy__wing qq-piggy__wing--right">
          <g transform="matrix(-1 0 0 1 120 0)"><WingShape /></g>
          {ball && (
            <g class="qq-piggy__ball">
              <circle cx="104" cy="122" r="15" fill="#8E5BFF" />
              <circle cx="99" cy="116" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="105" cy="114" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="102" cy="121" r="2.2" fill={INK} opacity="0.7" />
              <ellipse cx="98" cy="114" rx="5" ry="3" fill="#fff" opacity="0.35" />
            </g>
          )}
        </g>
        {/* guance */}
        <ellipse cx="35" cy="73" rx="7" ry="4.2" fill="#FF7EB6" opacity="0.5" />
        <ellipse cx="85" cy="73" rx="7" ry="4.2" fill="#FF7EB6" opacity="0.5" />
        <Eyes kind={style2.eyes} look={eyeLook} small={mood === 'lost'} lid={color} />
        <PiggyNeck kind={style2.neck} color2={style2.color2} />
        {/* cera bianca sopra il becco */}
        <ellipse cx="60" cy="63.5" rx="5" ry="2.8" fill="#fff" opacity="0.92" />
        <Beak kind={mouth} />
        <PiggyFace kind={style2.face} />
        <PiggyHat kind={style2.hat} color2={style2.color2} />
      </g>
    </svg>
  );
}
