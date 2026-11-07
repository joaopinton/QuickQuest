// Il Bubù: creatura-giocattolo di gelatina lucida (docs/07 § 6), in SVG con animazioni CSS.
// Corpo tondo con riflessi e ombra colorata, occhioni lucidi, piedini e manine del secondo
// colore. Si personalizza con motivo, occhi, bocca e accessori per testa, viso e collo (look.ts).
import type { JSX } from 'preact';
import { useId } from 'preact/hooks';
import { DEFAULT_STYLE, type BubuStyle, type EyeStyle, type MouthStyle, type Pattern } from '../look';
import { BubuFace, BubuHat, BubuNeck } from './BubuParts';
import './bubu.css';

export type BubuMood = 'idle' | 'happy' | 'wait' | 'lost';
export type BubuMotion = 'breathe' | 'hop' | 'none';
/** Inquadratura: tutto il corpo, solo la testa (cappelli) o solo la faccia (occhi, bocca). */
export type BubuFraming = 'full' | 'head' | 'face';

/** Stesse proporzioni 120×150 del corpo intero, così il CSS non cambia. */
const FRAMING_VIEWBOX: Readonly<Record<BubuFraming, string>> = {
  full: '0 0 120 150',
  head: '10 -14 100 125',
  face: '18 22 84 105',
};

export interface BubuProps {
  color: string;
  /** Personalizzazione; i campi mancanti prendono il default. */
  look?: Partial<BubuStyle>;
  mood?: BubuMood;
  motion?: BubuMotion;
  wave?: boolean;
  /** Bubù con la palla da bowling in mano. */
  ball?: boolean;
  size?: number | string;
  /** Testo alternativo; senza, il Bubù è decorativo. */
  label?: string;
  /** Ritardo del ciclo di animazione, per desincronizzare più Bubù. */
  delay?: number;
  framing?: BubuFraming;
  class?: string;
}

export const INK = '#1E2A4A';
const SHADE = '#2B2F7A';
const BODY = 'M60 14 C94 14 106 46 104 82 C102 116 88 134 60 134 C32 134 18 116 16 82 C14 46 26 14 60 14 Z';

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

function GlossyEye({ cx, look, small }: { cx: number; look: number; small: boolean }) {
  return (
    <g>
      <ellipse cx={cx} cy="58" rx="11" ry="13" fill="#fff" />
      <ellipse cx={cx + look} cy="60" rx={small ? 3.5 : 7} ry={small ? 3.5 : 9} fill={INK} />
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
        <g class="qq-bubu__eyes" fill="none" stroke={INK} stroke-width="5.5" stroke-linecap="round">
          {sides.map((x) => <path key={x} d={`M${x - 8} 60 q8 -11 16 0`} />)}
        </g>
      );
    case 'sleepy':
    case 'sly':
      return (
        <g class="qq-bubu__eyes">
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
        <g class="qq-bubu__eyes">
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
        <g class="qq-bubu__eyes">
          {sides.map((x) => (
            <g key={x}>
              <ellipse cx={x + look} cy="59" rx={small ? 3 : 5} ry={small ? 3 : 6.5} fill={INK} />
              {!small && <circle cx={x + look - 1.5} cy="56.5" r="1.8" fill="#fff" />}
            </g>
          ))}
        </g>
      );
    default:
      return <g class="qq-bubu__eyes">{sides.map((x) => <GlossyEye key={x} cx={x} look={look} small={small} />)}</g>;
  }
}

function Mouth({ kind }: { kind: MouthStyle }) {
  const line = { fill: 'none', stroke: INK, 'stroke-width': 4.5, 'stroke-linecap': 'round' as const };
  switch (kind) {
    case 'grin':
      return (
        <g>
          <path d="M48 76 q12 15 24 0 z" fill={INK} />
          <path d="M53 83 q7 5 14 0 q-7 -4 -14 0 z" fill="#FF7E9A" />
        </g>
      );
    case 'cat':
      return <path d="M50 77 q5 6 10 0 q5 6 10 0" {...line} />;
    case 'tongue':
      return (
        <g>
          <path d="M57 79 h8 v5 a4 4 0 0 1 -8 0 z" fill="#FF7E9A" />
          <path d="M50 77 q10 8 20 0" {...line} />
        </g>
      );
    case 'o':
      return <ellipse cx="60" cy="80" rx="5" ry="6" fill={INK} />;
    case 'flat':
      return <path d="M52 79 h16" {...line} />;
    default:
      return <path d="M50 77 q10 10 20 0" {...line} />;
  }
}

export function Bubu({
  color, look, mood = 'idle', motion = 'breathe', wave = false, ball = false,
  size = 120, label, delay = 0, framing = 'full', class: className = '',
}: BubuProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const style2: BubuStyle = { ...DEFAULT_STYLE, ...look };
  const a11y: JSX.SVGAttributes<SVGSVGElement> = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true' };
  // Con una dimensione in px si fissa anche l'altezza: in alcuni contenitori flex height:auto vale 0.
  const height = typeof size === 'number' ? size * (150 / 120) : undefined;
  const style = { '--bubu': color, '--bubu-2': style2.color2, '--bubu-delay': `${delay}s`, width: size, height } as JSX.CSSProperties;
  const eyeLook = mood === 'wait' ? 4 : 0;
  const mouth: MouthStyle = mood === 'lost' ? 'o' : mood === 'happy' && style2.mouth === 'smile' ? 'grin' : style2.mouth;
  const clip = `${id}-body`;
  return (
    <svg
      class={`qq-bubu qq-bubu--${motion} ${wave ? 'qq-bubu--wave' : ''} ${className}`}
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
      </defs>
      {/* ombra a terra colorata, mai grigia */}
      <ellipse class="qq-bubu__ground" cx="60" cy="143" rx="34" ry="6" fill={SHADE} opacity="0.18" />
      <g class="qq-bubu__body">
        {/* piedini a fagiolo del secondo colore */}
        <ellipse cx="43" cy="135" rx="13" ry="8.5" fill="var(--bubu-2)" />
        <ellipse cx="77" cy="135" rx="13" ry="8.5" fill="var(--bubu-2)" />
        <ellipse cx="43" cy="138" rx="10" ry="3.5" fill={SHADE} opacity="0.22" />
        <ellipse cx="77" cy="138" rx="10" ry="3.5" fill={SHADE} opacity="0.22" />
        {/* braccino sinistro */}
        <g class="qq-bubu__arm qq-bubu__arm--left">
          <rect x="9" y="80" width="17" height="30" rx="8.5" fill="var(--bubu)" transform="rotate(20 18 82)" />
          <circle cx="12" cy="106" r="8" fill="var(--bubu-2)" />
        </g>
        {/* corpo di gelatina */}
        <path class="qq-bubu__bean" d={BODY} fill="var(--bubu)" />
        <g clip-path={`url(#${clip})`}>
          <PatternShape kind={style2.pattern} color="var(--bubu-2)" />
          <rect x="0" y="0" width="120" height="150" fill={`url(#${id}-shade)`} />
        </g>
        {/* riflessi: grande morbido in alto a sinistra, puntino netto e luce di bordo */}
        <ellipse cx="40" cy="34" rx="18" ry="11" fill={`url(#${id}-gloss)`} transform="rotate(-28 40 34)" />
        <ellipse cx="34" cy="30" rx="5" ry="3" fill="#fff" opacity="0.85" transform="rotate(-28 34 30)" />
        <path d="M96 52 Q104 76 98 104" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.28" />
        {/* guance */}
        <ellipse cx="33" cy="74" rx="7.5" ry="4.5" fill="#FF7EB6" opacity="0.5" />
        <ellipse cx="87" cy="74" rx="7.5" ry="4.5" fill="#FF7EB6" opacity="0.5" />
        <Eyes kind={style2.eyes} look={eyeLook} small={mood === 'lost'} lid={color} />
        <Mouth kind={mouth} />
        <BubuFace kind={style2.face} />
        <BubuNeck kind={style2.neck} color2={style2.color2} />
        <BubuHat kind={style2.hat} color2={style2.color2} />
        {/* braccino destro (quello che saluta o tiene la palla) */}
        <g class="qq-bubu__arm qq-bubu__arm--right">
          <rect x="94" y="80" width="17" height="30" rx="8.5" fill="var(--bubu)" transform="rotate(-20 102 82)" />
          <circle cx="108" cy="106" r="8" fill="var(--bubu-2)" />
          {ball && (
            <g class="qq-bubu__ball">
              <circle cx="108" cy="114" r="15" fill="#8E5BFF" />
              <circle cx="103" cy="108" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="109" cy="106" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="106" cy="113" r="2.2" fill={INK} opacity="0.7" />
              <ellipse cx="102" cy="106" rx="5" ry="3" fill="#fff" opacity="0.35" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
