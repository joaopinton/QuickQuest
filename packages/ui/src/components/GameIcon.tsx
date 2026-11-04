// Icone originali dei giochi: forme piene e morbide, leggibili anche come sagoma.
const INK = '#1E2A4A';

function Bowling() {
  return (
    <g>
      <path d="M38 14c6 0 8 6 7 12-1 5-4 7-4 11 0 5 7 10 7 22 0 9-4 15-10 15s-10-6-10-15c0-12 7-17 7-22 0-4-3-6-4-11-1-6 1-12 7-12z" fill="#fff" />
      <path d="M31 33h14M30 37h16" stroke="#F0505A" stroke-width="3" stroke-linecap="round" />
      <circle cx="62" cy="60" r="18" fill={INK} />
      <circle cx="56" cy="52" r="2.6" fill="#fff" opacity="0.8" />
      <circle cx="63" cy="50" r="2.6" fill="#fff" opacity="0.8" />
      <circle cx="60" cy="58" r="2.6" fill="#fff" opacity="0.8" />
    </g>
  );
}

function Bocce() {
  return (
    <g>
      <ellipse cx="44" cy="76" rx="34" ry="6" fill={INK} opacity="0.15" />
      <circle cx="30" cy="56" r="17" fill="#fff" />
      <path d="M16 50q14 8 28 0" stroke="#E07A4F" stroke-width="3" fill="none" />
      <circle cx="60" cy="58" r="15" fill={INK} />
      <path d="M47 54q13 7 26 0" stroke="#fff" stroke-width="3" fill="none" opacity="0.7" />
      <circle cx="78" cy="70" r="5" fill="#FFD23F" />
    </g>
  );
}

function FreeThrow() {
  return (
    <g>
      <rect x="22" y="10" width="52" height="34" rx="6" fill="#fff" />
      <rect x="38" y="22" width="20" height="14" rx="2" fill="none" stroke="#FF8A2B" stroke-width="3" />
      <path d="M34 44h28l-4 22H38z" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="4 3" />
      <rect x="31" y="41" width="34" height="5" rx="2.5" fill={INK} />
      <circle cx="70" cy="70" r="14" fill={INK} />
      <path d="M56 70h28M70 56v28M60 60q10 10 0 20M80 60q-10 10 0 20" stroke="#FF8A2B" stroke-width="2" fill="none" />
    </g>
  );
}

function Golf() {
  return (
    <g>
      <ellipse cx="48" cy="74" rx="34" ry="8" fill="#fff" opacity="0.9" />
      <ellipse cx="56" cy="74" rx="6" ry="2.5" fill={INK} />
      <path d="M56 74V16" stroke={INK} stroke-width="3.5" stroke-linecap="round" />
      <path d="M56 16l24 9-24 9z" fill="#F0505A" />
      <circle cx="30" cy="68" r="6" fill="#fff" stroke={INK} stroke-opacity="0.2" />
    </g>
  );
}

function Barber() {
  return (
    <g>
      <rect x="30" y="12" width="26" height="62" rx="11" fill="#fff" />
      <rect x="30" y="12" width="26" height="14" rx="6" fill={INK} />
      <path d="M34 16v6M39 16v6M44 16v6M49 16v6M54 16v4" stroke="#fff" stroke-width="2" />
      <circle cx="43" cy="44" r="5" fill="#2EC4B6" />
      <path d="M66 30c10 4 14 14 10 24-2 4-8 4-9 0l-3-10" stroke={INK} stroke-width="3" fill="none" stroke-linecap="round" />
      <circle cx="70" cy="62" r="6" fill="none" stroke={INK} stroke-width="3" />
    </g>
  );
}

function Fencing() {
  return (
    <g>
      <path d="M20 74L72 22" stroke="#fff" stroke-width="4" stroke-linecap="round" />
      <path d="M76 74L24 22" stroke="#fff" stroke-width="4" stroke-linecap="round" />
      <circle cx="22" cy="72" r="9" fill={INK} />
      <circle cx="74" cy="72" r="9" fill={INK} />
      <path d="M48 44l6-14 6 14-6 4z" fill="#FFD23F" />
    </g>
  );
}

const ICONS = { bowling: Bowling, bocce: Bocce, 'free-throw': FreeThrow, golf: Golf, barber: Barber, fencing: Fencing } as const;
export type GameIconId = keyof typeof ICONS;

export function GameIcon({ id, size = 96 }: { id: string; size?: number | string }) {
  const Shape = ICONS[id as GameIconId];
  return (
    <svg class="qq-game-icon" viewBox="0 0 96 88" width={size} aria-hidden="true">
      {Shape ? <Shape /> : <circle cx="48" cy="44" r="24" fill="#fff" />}
    </svg>
  );
}
