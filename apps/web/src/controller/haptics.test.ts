import { describe, expect, test, vi } from 'vitest';
import { createHaptics, PATTERNS, type ClickPlayer, type HapticEngine } from './haptics';

function fakes() {
  const engine: HapticEngine & { calls: unknown[] } = { calls: [], trigger(i) { this.calls.push(i); }, destroy: vi.fn() };
  const click: ClickPlayer & { clicks: number[] } = { clicks: [], unlock: vi.fn(), click(k) { this.clicks.push(k); }, close: vi.fn() };
  return { engine, click };
}

describe('haptics', () => {
  test('i preset passano a web-haptics con i loro pattern', () => {
    const { engine, click } = fakes();
    const h = createHaptics({ engine, click, canVibrateAnytime: false });
    h.play('success');
    h.play('tap');
    expect(engine.calls).toEqual([PATTERNS.success, PATTERNS.tap]);
  });

  test('l’impatto cresce con l’intensità', () => {
    const { engine, click } = fakes();
    const h = createHaptics({ engine, click });
    h.impact(0);
    h.impact(2);
    const [soft, hard] = engine.calls as { duration: number; intensity: number }[][];
    expect(hard![0]!.duration).toBeGreaterThan(soft![0]!.duration);
    expect(hard![0]!.intensity).toBe(1);
  });

  test('eventi dallo schermo: vibra su Android, click su iPhone', () => {
    const android = fakes();
    createHaptics({ ...android, canVibrateAnytime: true }).cue('success');
    expect(android.engine.calls).toHaveLength(1);
    expect(android.click.clicks).toHaveLength(0);

    const ios = fakes();
    const h = createHaptics({ ...ios, canVibrateAnytime: false });
    h.unlock();
    h.cue('error');
    expect(ios.engine.calls).toHaveLength(0);
    expect(ios.click.clicks).toHaveLength(1);
    expect(ios.click.unlock).toHaveBeenCalled();
  });

  test('un motore che fallisce non rompe il gioco; destroy libera tutto', () => {
    const { click } = fakes();
    const broken: HapticEngine = { trigger: () => { throw new Error('no'); }, destroy: vi.fn() };
    const rejecting: HapticEngine = { trigger: () => Promise.reject(new Error('no')), destroy: vi.fn() };
    expect(() => createHaptics({ engine: broken, click }).play('tap')).not.toThrow();
    expect(() => createHaptics({ engine: rejecting, click }).play('tap')).not.toThrow();
    const h = createHaptics({ engine: broken, click });
    h.destroy();
    expect(broken.destroy).toHaveBeenCalled();
    expect(click.close).toHaveBeenCalled();
  });
});
