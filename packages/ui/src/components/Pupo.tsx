// Il Pupo: creatura-giocattolo a fagiolo (docs/07 § 6), in SVG con animazioni CSS.
import type { JSX } from 'preact';
import type { Accessory } from '../palette';
import './pupo.css';

export type PupoMood = 'idle' | 'happy' | 'wait' | 'lost';
export type PupoMotion = 'breathe' | 'hop' | 'none';

export interface PupoProps {
  color: string;
  accessory?: Accessory;
  mood?: PupoMood;
  motion?: PupoMotion;
  wave?: boolean;
  /** Pupo con la palla da bowling in mano. */
  ball?: boolean;
  size?: number | string;
  /** Testo alternativo; senza, il Pupo è decorativo. */
  label?: string;
  /** Ritardo del ciclo di animazione, per desincronizzare più Pupi. */
  delay?: number;
  class?: string;
}

const INK = '#1E2A4A';
const SHADE = '#3B3F8C';

function Eyes({ mood }: { mood: PupoMood }) {
  if (mood === 'happy') {
    return (
      <g class="qq-pupo__eyes" fill="none" stroke={INK} stroke-width="5" stroke-linecap="round">
        <path d="M40 58 q7 -9 14 0" />
        <path d="M66 58 q7 -9 14 0" />
      </g>
    );
  }
  const look = mood === 'wait' ? 4 : 0;
  const small = mood === 'lost';
  return (
    <g class="qq-pupo__eyes">
      <ellipse cx="47" cy="56" rx="9" ry="12" fill="#fff" />
      <ellipse cx="73" cy="56" rx="9" ry="12" fill="#fff" />
      <ellipse cx={47 + look} cy="58" rx={small ? 3 : 5} ry={small ? 3 : 7} fill={INK} />
      <ellipse cx={73 + look} cy="58" rx={small ? 3 : 5} ry={small ? 3 : 7} fill={INK} />
      {!small && <circle cx={45 + look} cy="54" r="2" fill="#fff" />}
      {!small && <circle cx={71 + look} cy="54" r="2" fill="#fff" />}
    </g>
  );
}

function Mouth({ mood }: { mood: PupoMood }) {
  if (mood === 'happy') return <path d="M52 74 q8 9 16 0 z" fill={INK} />;
  if (mood === 'lost') return <ellipse cx="60" cy="77" rx="4" ry="5" fill={INK} />;
  return null;
}

function AccessoryShape({ kind }: { kind: Accessory }) {
  switch (kind) {
    case 'cap':
      return (
        <g>
          <path d="M30 34 q30 -30 60 0 z" fill="#FFD23F" />
          <path d="M60 34 h40 q4 0 2 5 q-10 4 -42 0 z" fill="#E0A800" />
          <circle cx="60" cy="13" r="4" fill="#E0A800" />
        </g>
      );
    case 'band':
      return <path d="M25 38 q35 -12 70 0 v9 q-35 -12 -70 0 z" fill="#fff" stroke={SHADE} stroke-opacity="0.25" />;
    case 'headphones':
      return (
        <g>
          <path d="M26 52 q-2 -42 34 -44 q36 2 34 44" fill="none" stroke={INK} stroke-width="6" stroke-linecap="round" />
          <rect x="16" y="46" width="14" height="22" rx="7" fill="#FF7EB6" />
          <rect x="90" y="46" width="14" height="22" rx="7" fill="#FF7EB6" />
        </g>
      );
    case 'glasses':
      return (
        <g fill="none" stroke={INK} stroke-width="3.5">
          <circle cx="47" cy="56" r="13" />
          <circle cx="73" cy="56" r="13" />
          <path d="M60 55 h0.1" stroke-linecap="round" />
        </g>
      );
    case 'bowtie':
      return (
        <g transform="translate(60 92)">
          <path d="M0 0 l-14 -8 v16 z M0 0 l14 -8 v16 z" fill="#FFD23F" />
          <circle r="4" fill="#E0A800" />
        </g>
      );
    case 'leaves':
      return (
        <g fill="#3FAE4A">
          <path d="M40 24 q-4 -14 8 -16 q2 12 -8 16 z" />
          <path d="M60 18 q-6 -14 0 -18 q6 4 0 18 z" fill="#7ED957" />
          <path d="M80 24 q4 -14 -8 -16 q-2 12 8 16 z" />
        </g>
      );
    default:
      return null;
  }
}

export function Pupo({
  color, accessory = 'none', mood = 'idle', motion = 'breathe', wave = false, ball = false,
  size = 120, label, delay = 0, class: className = '',
}: PupoProps) {
  const a11y: JSX.SVGAttributes<SVGSVGElement> = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true' };
  // Con una dimensione in px si fissa anche l'altezza: in alcuni contenitori flex height:auto vale 0.
  const height = typeof size === 'number' ? size * (150 / 120) : undefined;
  const style = { '--pupo': color, '--pupo-delay': `${delay}s`, width: size, height } as JSX.CSSProperties;
  return (
    <svg
      class={`qq-pupo qq-pupo--${motion} ${wave ? 'qq-pupo--wave' : ''} ${className}`}
      viewBox="0 0 120 150"
      style={style}
      {...a11y}
    >
      {/* ombra a terra colorata, mai grigia */}
      <ellipse class="qq-pupo__ground" cx="60" cy="143" rx="34" ry="6" fill={SHADE} opacity="0.18" />
      <g class="qq-pupo__body">
        {/* piedini */}
        <ellipse cx="44" cy="134" rx="12" ry="8" fill="var(--pupo)" />
        <ellipse cx="76" cy="134" rx="12" ry="8" fill="var(--pupo)" />
        <ellipse cx="44" cy="137" rx="10" ry="4" fill={SHADE} opacity="0.2" />
        <ellipse cx="76" cy="137" rx="10" ry="4" fill={SHADE} opacity="0.2" />
        {/* braccio sinistro */}
        <g class="qq-pupo__arm qq-pupo__arm--left">
          <rect x="10" y="78" width="18" height="34" rx="9" fill="var(--pupo)" transform="rotate(18 19 80)" />
        </g>
        {/* corpo a fagiolo */}
        <path
          class="qq-pupo__bean"
          d="M60 10 C92 10 104 40 102 76 C100 112 88 132 60 132 C32 132 18 112 18 76 C16 40 28 10 60 10 Z"
          fill="var(--pupo)"
        />
        {/* volume: ombra colorata in basso a destra e riflesso morbido in alto */}
        <path d="M102 76 C100 112 88 132 60 132 C80 120 92 100 94 72 C95 56 92 44 86 34 C98 44 103 58 102 76 Z" fill={SHADE} opacity="0.16" />
        <ellipse cx="42" cy="32" rx="14" ry="9" fill="#fff" opacity="0.35" transform="rotate(-24 42 32)" />
        {/* guance */}
        <ellipse cx="36" cy="72" rx="7" ry="4.5" fill="#FF7EB6" opacity="0.45" />
        <ellipse cx="84" cy="72" rx="7" ry="4.5" fill="#FF7EB6" opacity="0.45" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        <AccessoryShape kind={accessory} />
        {/* braccio destro (quello che saluta o tiene la palla) */}
        <g class="qq-pupo__arm qq-pupo__arm--right">
          <rect x="92" y="78" width="18" height="34" rx="9" fill="var(--pupo)" transform="rotate(-18 101 80)" />
          {ball && (
            <g class="qq-pupo__ball">
              <circle cx="108" cy="112" r="15" fill="#8E5BFF" />
              <circle cx="103" cy="106" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="109" cy="104" r="2.2" fill={INK} opacity="0.7" />
              <circle cx="106" cy="111" r="2.2" fill={INK} opacity="0.7" />
              <ellipse cx="102" cy="104" rx="5" ry="3" fill="#fff" opacity="0.35" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}
