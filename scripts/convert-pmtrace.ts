// Converte le tracce `.pmtrace` di choijunhuk/phonemote (MIT) nel formato dei nostri test
// (packages/motion/test/traces/*.json): campioni come li darebbe `devicemotion`.
//
// Uso: node scripts/convert-pmtrace.ts <cartella con i .pmtrace> <cartella di uscita>
//
// Formato PhoneMote: una riga JSON d'intestazione, poi un frame per riga in esadecimale,
// 14 (v1) o 17 (v2) float32 little-endian: playerId, seq, timestamp, orientation α β γ,
// rotationRate α β γ (°/s, canali grezzi), acceleration x y z (gravità esclusa), buttons,
// screenOrientation, version, motionSeq, flags.
// L'accelerazione con gravità non c'è: si ricostruisce dall'orientamento,
// accG = acc + g · [−cosβ sinγ, sinβ, cosβ cosγ].
// I frame il cui motionSeq non avanza (sensore bloccato) vengono scartati: nel browser
// `devicemotion` semplicemente non arriverebbe.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const G = 9.80665;
const DEG = Math.PI / 180;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

interface Header { readonly note?: string; readonly synthetic?: boolean }

function decode(hex: string): number[] {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) out.push(view.getFloat32(i, true));
  return out;
}

function convert(text: string) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const header = JSON.parse(lines[0]!) as Header;
  const samples: number[][] = [];
  let lastMotionSeq: number | null = null;
  let lastT: number | null = null;
  for (const line of lines.slice(1)) {
    const f = decode(line.trim());
    const t = f[2]!;
    const motionSeq = f.length >= 17 ? f[15]! : null;
    if (motionSeq !== null ? motionSeq === lastMotionSeq : t === lastT) continue;
    lastMotionSeq = motionSeq;
    lastT = t;
    const beta = f[4]! * DEG;
    const gamma = f[5]! * DEG;
    const gx = -Math.cos(beta) * Math.sin(gamma) * G;
    const gy = Math.sin(beta) * G;
    const gz = Math.cos(beta) * Math.cos(gamma) * G;
    const [lx, ly, lz] = [f[9]!, f[10]!, f[11]!];
    // [t, accG x y z, acc x y z, rotationRate alpha beta gamma]
    samples.push([r3(t), r3(lx + gx), r3(ly + gy), r3(lz + gz), r3(lx), r3(ly), r3(lz), r3(f[6]!), r3(f[7]!), r3(f[8]!)]);
  }
  return {
    source: 'choijunhuk/phonemote (MIT), traces/corpus',
    note: header.note ?? '',
    synthetic: header.synthetic === true,
    columns: ['t', 'agx', 'agy', 'agz', 'lx', 'ly', 'lz', 'ra', 'rb', 'rg'],
    samples,
  };
}

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  process.stderr.write('Uso: node scripts/convert-pmtrace.ts <cartella .pmtrace> <cartella di uscita>\n');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(inDir).filter((n) => n.endsWith('.pmtrace'))) {
  const out = convert(readFileSync(join(inDir, name), 'utf8'));
  const target = join(outDir, `${basename(name, '.pmtrace')}.json`);
  writeFileSync(target, `${JSON.stringify(out)}\n`);
  process.stdout.write(`${name} → ${target} (${out.samples.length} campioni)\n`);
}
