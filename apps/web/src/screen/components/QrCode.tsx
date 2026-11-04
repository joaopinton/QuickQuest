// QR in SVG generato in locale (uqr): nessun servizio esterno vede il codice della stanza.
import { useMemo } from 'preact/hooks';
import { encode } from 'uqr';

export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 0 });
    const cells: string[] = [];
    qr.data.forEach((row, y) => row.forEach((on, x) => { if (on) cells.push(`M${x} ${y}h1v1h-1z`); }));
    return { size: qr.size, path: cells.join('') };
  }, [value]);
  return (
    <svg class="qr" viewBox={`-1 -1 ${size + 2} ${size + 2}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
      <path d={path} fill="#1E2A4A" />
    </svg>
  );
}
