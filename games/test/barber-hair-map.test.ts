import { describe, expect, test } from 'vitest';
import { COMB_LENGTH, INITIAL_LENGTH } from '../barber/shared/haircuts';
import { dirFromUv, isScalp, mirrorColumn, uvFromDir, type Vec3 } from '../barber/shared/head';
import { cutAt, initialHairMap, lengthAt, SNIP_DEPTH, toLength } from '../barber/screen/hair-map';

const TOP: Vec3 = [0, 1, 0];
const FACE: Vec3 = [0, 0, 1];

describe('geometria della testa', () => {
  test('uv ↔ direzione: la faccia è a u = 0.25', () => {
    expect(dirFromUv(0.25, 0.5)[2]).toBeCloseTo(1);
    const uv = uvFromDir([0.3, 0.4, -0.5]);
    const back = dirFromUv(uv.u, uv.v);
    const n = Math.hypot(0.3, 0.4, 0.5);
    expect(back[0]).toBeCloseTo(0.3 / n);
    expect(back[2]).toBeCloseTo(-0.5 / n);
  });

  test('capelli in cima e sulla nuca, non sulla faccia', () => {
    expect(isScalp(TOP)).toBe(true);
    expect(isScalp(FACE)).toBe(false);
    expect(isScalp([0, -0.2, -0.98])).toBe(true);
  });

  test('colonna speculare: x → -x', () => {
    for (const c of [0, 10, 63, 64, 100, 127]) {
      const a = dirFromUv((c + 0.5) / 128, 0.3);
      const b = dirFromUv((mirrorColumn(c) + 0.5) / 128, 0.3);
      expect(b[0]).toBeCloseTo(-a[0], 5);
      expect(b[2]).toBeCloseTo(a[2], 5);
    }
  });
});

describe('mappa delle lunghezze', () => {
  test('il cliente arriva con i capelli lunghi solo sul cuoio capelluto', () => {
    const map = initialHairMap();
    expect(lengthAt(map, TOP)).toBeCloseTo(INITIAL_LENGTH, 1);
    expect(lengthAt(map, FACE)).toBe(0);
  });

  test('la macchinetta porta alla lunghezza del pettine dentro il raggio e non tocca fuori', () => {
    const map = initialHairMap();
    const res = cutAt(map, { dir: TOP, radius: 0.3, floor: COMB_LENGTH[0], kind: 'clip' });
    expect(res.removed).toBeGreaterThan(0);
    expect(res.dirtyRows).not.toBeNull();
    expect(lengthAt(map, TOP)).toBeCloseTo(COMB_LENGTH[0], 1);
    expect(lengthAt(map, [0, 0.2, -0.98])).toBeGreaterThan(0.7);
  });

  test('non allunga mai e un secondo passaggio uguale non toglie niente', () => {
    const map = initialHairMap();
    const brush = { dir: TOP, radius: 0.3, floor: COMB_LENGTH[2], kind: 'clip' as const };
    cutAt(map, brush);
    const before = Array.from(map.lengths);
    const again = cutAt(map, brush);
    expect(again.removed).toBe(0);
    expect(again.dirtyRows).toBeNull();
    cutAt(map, { ...brush, floor: 1 });
    expect(Array.from(map.lengths)).toEqual(before);
  });

  test('le forbici tolgono un po’ per volta, mai sotto il pettine', () => {
    const map = initialHairMap();
    const start = lengthAt(map, TOP);
    const snip = { dir: TOP, radius: 0.15, floor: COMB_LENGTH[1], kind: 'snip' as const };
    cutAt(map, snip);
    expect(lengthAt(map, TOP)).toBeCloseTo(start - SNIP_DEPTH, 1);
    for (let i = 0; i < 10; i++) cutAt(map, snip);
    expect(lengthAt(map, TOP)).toBeCloseTo(COMB_LENGTH[1], 1);
    expect(toLength(255)).toBe(1);
  });
});
