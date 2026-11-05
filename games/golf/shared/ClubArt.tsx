// Mazze disegnate in SVG, stile "Soft Toy" (docs/07): forme piene e arrotondate, niente asset.
// Il colore del giocatore arriva da `currentColor` e tinge la testa (o il badge sul ferro).
import type { Club } from './clubs';

const METAL = '#cfd6de';
const METAL_EDGE = '#8a94a0';
const SHAFT = '#a7b0ba';
const GRIP = '#2b2f36';

function Shaft({ to }: { readonly to: readonly [number, number] }) {
  return (
    <>
      <line x1="44" y1="8" x2={to[0]} y2={to[1]} stroke={SHAFT} stroke-width="3.2" stroke-linecap="round" />
      <line x1="44" y1="8" x2="42.9" y2="32" stroke={GRIP} stroke-width="7.5" stroke-linecap="round" />
      <line x1="42.2" y1="12" x2="41.6" y2="28" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" stroke-linecap="round" />
    </>
  );
}

function Grooves({ ys, from, to }: { readonly ys: readonly number[]; readonly from: number; readonly to: number }) {
  return (
    <>
      {ys.map((y) => (
        <line key={y} x1={from} y1={y} x2={to} y2={y - 1.5} stroke={METAL_EDGE} stroke-width="1.3" stroke-linecap="round" />
      ))}
    </>
  );
}

function Head({ club }: { readonly club: Club }) {
  switch (club) {
    case 'driver':
      return (
        <>
          <Shaft to={[37, 94]} />
          <path d="M37 92 C 22 89, 6 96, 6 106 C 6 115, 22 118, 38 113 C 47 110, 49 98, 37 92 Z" fill="currentColor" stroke="rgb(0 0 0 / 0.25)" stroke-width="1.5" />
          <ellipse cx="22" cy="100" rx="10" ry="4" fill="#ffffff" fill-opacity="0.38" transform="rotate(-8 22 100)" />
          <path d="M40 96 C 46 102, 44 110, 38 113" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round" />
        </>
      );
    case 'iron':
      return (
        <>
          <Shaft to={[36, 94]} />
          <path d="M34 91 L 40 95 L 38 112 C 31 115, 16 115, 11 111 C 9 107, 12 103, 17 103 Z" fill={METAL} stroke={METAL_EDGE} stroke-width="1.5" stroke-linejoin="round" />
          <Grooves ys={[106, 109.5]} from={15} to={34} />
          <circle cx="29" cy="101" r="3.4" fill="currentColor" />
        </>
      );
    case 'wedge':
      return (
        <>
          <Shaft to={[36, 92]} />
          <path d="M34 88 L 40 92 L 39 113 C 32 117, 13 117, 8 111 C 6 103, 12 96, 19 97 Z" fill={METAL} stroke={METAL_EDGE} stroke-width="1.5" stroke-linejoin="round" />
          <Grooves ys={[102, 105.5, 109]} from={12} to={34} />
          <path d="M9 111 C 16 115, 30 115, 39 112" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </>
      );
    case 'putter':
      return (
        <>
          <Shaft to={[35, 104]} />
          <rect x="31" y="100" width="7" height="8" rx="2" fill={METAL_EDGE} />
          <rect x="8" y="104" width="46" height="11" rx="4" fill="currentColor" stroke="rgb(0 0 0 / 0.25)" stroke-width="1.5" />
          <rect x="12" y="106.5" width="20" height="2.5" rx="1.25" fill="#ffffff" fill-opacity="0.45" />
          <line x1="31" y1="104.5" x2="31" y2="114.5" stroke="#ffffff" stroke-opacity="0.8" stroke-width="1.5" />
        </>
      );
  }
}

export function ClubArt({ club, class: className }: { readonly club: Club; readonly class?: string }) {
  return (
    <svg class={className} viewBox="0 0 60 122" aria-hidden="true" focusable="false">
      <ellipse cx="30" cy="117" rx="24" ry="3" fill="#000000" fill-opacity="0.12" />
      <Head club={club} />
    </svg>
  );
}
