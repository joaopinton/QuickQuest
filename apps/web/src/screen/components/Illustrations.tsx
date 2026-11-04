// Piccole illustrazioni dei passi: schermo con QR, telefono che inquadra, pollice sul tasto.
const INK = '#1E2A4A';

export function ScreenWithQr() {
  return (
    <svg class="illo illo--screen" viewBox="0 0 200 150" aria-hidden="true">
      <rect x="20" y="14" width="160" height="104" rx="18" fill={INK} />
      <rect x="30" y="24" width="140" height="84" rx="10" fill="#DFF3FF" />
      {/* l'animazione CSS sostituirebbe l'attributo transform: si anima il gruppo interno */}
      <g transform="translate(76 38)"><g class="illo__qr">
        <rect width="48" height="48" rx="6" fill="#fff" />
        <rect x="6" y="6" width="12" height="12" rx="2" fill={INK} />
        <rect x="30" y="6" width="12" height="12" rx="2" fill={INK} />
        <rect x="6" y="30" width="12" height="12" rx="2" fill={INK} />
        <rect x="26" y="26" width="6" height="6" fill={INK} />
        <rect x="34" y="34" width="8" height="8" fill={INK} />
        <rect x="22" y="36" width="4" height="4" fill={INK} />
      </g></g>
      <rect x="84" y="118" width="32" height="10" fill={INK} />
      <rect x="62" y="128" width="76" height="8" rx="4" fill={INK} />
    </svg>
  );
}

export function PhoneScanning() {
  return (
    <svg class="illo illo--scan" viewBox="0 0 200 150" aria-hidden="true">
      <g class="illo__phone">
        <rect x="70" y="12" width="64" height="124" rx="16" fill={INK} />
        <rect x="76" y="22" width="52" height="104" rx="10" fill="#fff" />
        <path d="M86 40h10M86 40v10M118 40h-10M118 40v10M86 108h10M86 108v-10M118 108h-10M118 108v-10" stroke="#2F7DF6" stroke-width="4" stroke-linecap="round" />
        <rect class="illo__beam" x="84" y="72" width="36" height="4" rx="2" fill="#FFD23F" />
      </g>
      <circle cx="40" cy="44" r="8" fill="#FFD23F" />
      <circle cx="164" cy="104" r="6" fill="#FF7EB6" />
    </svg>
  );
}

export function ThumbButton() {
  return (
    <svg class="illo illo--thumb" viewBox="0 0 200 150" aria-hidden="true">
      <rect x="60" y="8" width="80" height="136" rx="18" fill={INK} />
      <rect x="67" y="18" width="66" height="116" rx="12" fill="#F1EBFF" />
      <g class="illo__button">
        <rect x="76" y="70" width="48" height="50" rx="16" fill="#6A3FD9" />
        <rect x="76" y="64" width="48" height="50" rx="16" fill="#8E5BFF" />
        <path d="M92 89h16" stroke="#fff" stroke-width="4" stroke-linecap="round" />
      </g>
      <path class="illo__swoosh" d="M30 120 Q100 150 170 70" fill="none" stroke="#FFD23F" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 12" />
    </svg>
  );
}
