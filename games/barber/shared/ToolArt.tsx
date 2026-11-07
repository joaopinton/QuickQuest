// Attrezzi del barbiere disegnati in SVG, come le mazze del golf (games/golf/shared/ClubArt.tsx):
// forme piene e arrotondate, niente asset. La macchinetta è dritta, lame in alto, come la si tiene
// col telefono in verticale; il rialzo si vede sopra le lame, più alto = capelli più lunghi.
// Il colore del giocatore arriva da `currentColor` (fascia, tasto, anelli delle forbici).
import type { BarberTool } from './events';

const SHELL = '#2A2D34';
const SHELL_HI = '#454a55';
const GRIP = '#17191D';
const STEEL = '#cfd6de';
const STEEL_EDGE = '#8a94a0';
const GUARD = '#3a3f47';

/** Altezza del rialzo (unità del viewBox) per ogni macchinetta. */
const GUARD_H: Readonly<Record<Exclude<BarberTool, 'scissors'>, number>> = { clip0: 0, clip1: 9, clip2: 18 };

function Clipper({ guard }: { readonly guard: number }) {
  const bladeY = 26;
  const teeth = Array.from({ length: 8 }, (_, i) => 17 + i * 3.7);
  return (
    <>
      {guard > 0 && (
        <g>
          {teeth.map((x) => (
            <rect key={x} x={x - 0.9} y={bladeY - guard} width="1.8" height={guard + 1} rx="0.9" fill={GUARD} />
          ))}
          <rect x="14" y={bladeY - guard - 1.5} width="32" height="3" rx="1.5" fill={GUARD} />
        </g>
      )}
      {/* lame */}
      <rect x="15" y={bladeY} width="30" height="5" rx="1.2" fill={STEEL} stroke={STEEL_EDGE} stroke-width="1" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={17 + i * 3.25} y1={bladeY} x2={17 + i * 3.25} y2={bladeY + 2.6} stroke={STEEL_EDGE} stroke-width="0.9" />
      ))}
      {/* testina e corpo */}
      <rect x="14" y={bladeY + 5} width="32" height="10" rx="3" fill={SHELL} />
      <path d="M15 40 C 15 37, 45 37, 45 40 L 43 104 C 43 112, 17 112, 17 104 Z" fill={SHELL} />
      <path d="M19 42 L 21 100" stroke={SHELL_HI} stroke-width="3" stroke-linecap="round" />
      <rect x="16.5" y="56" width="27" height="5" rx="2" fill="currentColor" />
      <rect x="26.5" y="66" width="7" height="12" rx="3" fill="currentColor" />
      <path d="M17.5 84 L 42.5 84 L 43 104 C 43 112, 17 112, 17 104 Z" fill={GRIP} />
      {[89, 94, 99, 104].map((y) => (
        <line key={y} x1="20" y1={y} x2="40" y2={y} stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.6" />
      ))}
    </>
  );
}

function Scissors() {
  return (
    <>
      <path d="M30 60 L 24 8 C 23.5 5, 26 4, 27 7 L 33 58 Z" fill={STEEL} stroke={STEEL_EDGE} stroke-width="1" stroke-linejoin="round" />
      <path d="M30 60 L 36 8 C 36.5 5, 34 4, 33 7 L 27 58 Z" fill={STEEL} stroke={STEEL_EDGE} stroke-width="1" stroke-linejoin="round" />
      <path d="M28 60 L 20 82" stroke={STEEL_EDGE} stroke-width="4" stroke-linecap="round" />
      <path d="M32 60 L 40 82" stroke={STEEL_EDGE} stroke-width="4" stroke-linecap="round" />
      <circle cx="30" cy="60" r="2.6" fill={STEEL_EDGE} />
      <ellipse cx="18" cy="94" rx="9" ry="12" fill="none" stroke="currentColor" stroke-width="5" />
      <ellipse cx="42" cy="94" rx="9" ry="12" fill="none" stroke="currentColor" stroke-width="5" />
    </>
  );
}

export function ToolArt({ tool, class: className }: { readonly tool: BarberTool; readonly class?: string }) {
  return (
    <svg class={className} viewBox="0 0 60 122" aria-hidden="true" focusable="false">
      <ellipse cx="30" cy="117" rx="20" ry="3" fill="#000000" fill-opacity="0.12" />
      {tool === 'scissors' ? <Scissors /> : <Clipper guard={GUARD_H[tool]} />}
    </svg>
  );
}
