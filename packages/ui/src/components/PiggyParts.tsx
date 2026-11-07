// Accessori del Piggy (piccione) (docs/07 § 6): testa, viso e collo, disegnati sulla stessa griglia
// 120×150 del corpo. Il secondo colore del giocatore colora berretti, sciarpe e antenne.
import type { FaceItem, Hat, NeckItem } from '../look';

const INK = '#1E2A4A';
const GOLD = '#FFC21A';
const GOLD_DARK = '#D99A00';

export function PiggyHat({ kind, color2 }: { kind: Hat; color2: string }) {
  switch (kind) {
    case 'cap':
      return (
        <g>
          <path d="M30 36 q30 -32 60 0 z" fill="#FFD23F" />
          <path d="M60 36 h40 q4 0 2 5 q-10 4 -42 0 z" fill={GOLD_DARK} />
          <circle cx="60" cy="14" r="4" fill={GOLD_DARK} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d="M28 40 q32 -40 64 0 z" fill={color2} />
          <rect x="26" y="34" width="68" height="10" rx="5" fill={color2} stroke={INK} stroke-opacity="0.15" stroke-width="2" />
          {[36, 46, 56, 66, 76].map((x) => <path key={x} d={`M${x} 24 v8`} stroke={INK} stroke-opacity="0.12" stroke-width="2" />)}
          <circle cx="60" cy="10" r="7" fill={color2} stroke={INK} stroke-opacity="0.15" stroke-width="2" />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M36 32 l4 -20 l10 12 l10 -16 l10 16 l10 -12 l4 20 z" fill={GOLD} stroke={GOLD_DARK} stroke-width="2" stroke-linejoin="round" />
          <circle cx="60" cy="25" r="3.2" fill="#EF4E5B" />
          <circle cx="46" cy="27" r="2.4" fill="#3C8CF0" />
          <circle cx="74" cy="27" r="2.4" fill="#34C27A" />
        </g>
      );
    case 'chef':
      return (
        <g fill="#fff" stroke={INK} stroke-opacity="0.12" stroke-width="2">
          <rect x="38" y="20" width="44" height="16" rx="3" />
          <circle cx="44" cy="14" r="11" />
          <circle cx="60" cy="8" r="13" />
          <circle cx="76" cy="14" r="11" />
        </g>
      );
    case 'party':
      return (
        <g>
          <path d="M44 30 L60 -6 L76 30 z" fill="#FF7EB6" />
          <path d="M50 18 L70 18 M47 25 L73 25 M53 10 L67 10" stroke="#fff" stroke-width="3" />
          <circle cx="60" cy="-6" r="5" fill={GOLD} />
        </g>
      );
    case 'band':
      return <path d="M24 40 q36 -12 72 0 v9 q-36 -12 -72 0 z" fill="#fff" stroke={INK} stroke-opacity="0.2" />;
    case 'headphones':
      return (
        <g>
          <path d="M25 54 q-2 -44 35 -46 q37 2 35 46" fill="none" stroke={INK} stroke-width="6" stroke-linecap="round" />
          <rect x="15" y="48" width="14" height="22" rx="7" fill="#FF7EB6" />
          <rect x="91" y="48" width="14" height="22" rx="7" fill="#FF7EB6" />
        </g>
      );
    case 'leaves':
      return (
        <g fill="#3FAE4A">
          <path d="M40 26 q-4 -14 8 -16 q2 12 -8 16 z" />
          <path d="M60 20 q-6 -14 0 -18 q6 4 0 18 z" fill="#7ED957" />
          <path d="M80 26 q4 -14 -8 -16 q-2 12 8 16 z" />
        </g>
      );
    case 'antennae':
      return (
        <g>
          <path d="M48 18 q-6 -10 -10 -16 M72 18 q6 -10 10 -16" fill="none" stroke={INK} stroke-width="3" stroke-linecap="round" />
          <circle cx="37" cy="1" r="6" fill={color2} stroke={INK} stroke-opacity="0.2" stroke-width="2" />
          <circle cx="83" cy="1" r="6" fill={color2} stroke={INK} stroke-opacity="0.2" stroke-width="2" />
        </g>
      );
    case 'bow':
      return (
        <g transform="translate(80 22) rotate(18)">
          <path d="M0 0 l-16 -10 q-4 10 0 20 z M0 0 l16 -10 q4 10 0 20 z" fill="#FF7EB6" />
          <circle r="5" fill="#E5568F" />
        </g>
      );
    default:
      return null;
  }
}

export function PiggyFace({ kind }: { kind: FaceItem }) {
  switch (kind) {
    case 'glasses':
      return (
        <g fill="none" stroke={INK} stroke-width="3.5">
          <circle cx="46" cy="58" r="14" />
          <circle cx="74" cy="58" r="14" />
          <path d="M60 57 h0.1" stroke-linecap="round" />
        </g>
      );
    case 'sunglasses':
      return (
        <g>
          <path d="M30 50 h60 v4 q-2 16 -16 16 q-12 0 -14 -14 q-2 14 -14 14 q-14 0 -16 -16 z" fill={INK} />
          <path d="M36 55 l8 0 M66 55 l8 0" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.6" />
        </g>
      );
    case 'freckles':
      return (
        <g fill="#B5651D" opacity="0.55">
          {[[28, 70], [33, 76], [38, 71], [82, 71], [87, 76], [92, 70]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />)}
        </g>
      );
    case 'mustache':
      // sotto il becco, non sopra
      return <path transform="translate(0 10)" d="M60 72 q-6 -6 -14 -2 q-6 4 -12 -2 q4 10 14 8 q8 -1 12 -4 q4 3 12 4 q10 2 14 -8 q-6 6 -12 2 q-8 -4 -14 2 z" fill={INK} />;
    default:
      return null;
  }
}

export function PiggyNeck({ kind, color2 }: { kind: NeckItem; color2: string }) {
  switch (kind) {
    case 'bowtie':
      return (
        <g transform="translate(60 96)">
          <path d="M0 0 l-14 -8 v16 z M0 0 l14 -8 v16 z" fill="#FFD23F" />
          <circle r="4" fill={GOLD_DARK} />
        </g>
      );
    case 'scarf':
      return (
        <g fill={color2} stroke={INK} stroke-opacity="0.15" stroke-width="2">
          <path d="M24 90 q36 14 72 0 v10 q-36 14 -72 0 z" />
          <path d="M74 98 l4 26 l-12 2 l-2 -24 z" />
        </g>
      );
    case 'necklace':
      return (
        <g>
          <path d="M34 90 q26 18 52 0" fill="none" stroke={INK} stroke-opacity="0.3" stroke-width="1.5" />
          {[38, 46, 54, 66, 74, 82].map((x, i) => (
            <circle key={x} cx={x} cy={92 + Math.sin((i / 5) * Math.PI) * 8} r="3.4" fill={['#FF7EB6', '#FFD23F', '#7CC8FF'][i % 3]} />
          ))}
          <circle cx="60" cy="100" r="5" fill={GOLD} stroke={GOLD_DARK} stroke-width="1.5" />
        </g>
      );
    default:
      return null;
  }
}
