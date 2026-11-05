import { describe, expect, test } from 'vitest';
import { createRttStats } from './rtt';

describe('statistiche RTT', () => {
  test('mediana e p95 sugli ultimi battiti', () => {
    const s = createRttStats(5);
    expect(s.summary).toBeNull();
    for (const v of [100, 10, 20, 30, 40, 200]) s.add(v);
    expect(s.summary).toMatchObject({ count: 5, medianMs: 30, lastMs: 200 });
    expect(s.summary!.p95Ms).toBeGreaterThan(150);
  });

  test('ignora valori impossibili', () => {
    const s = createRttStats();
    s.add(-5);
    s.add(Number.NaN);
    expect(s.summary).toBeNull();
  });
});
