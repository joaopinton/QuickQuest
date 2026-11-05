import type { ClientTransport, ControllerMessage, ServerMessage } from '@quickquest/protocol';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createControllerConnection, HOST_LOST_MS, JOIN_TIMEOUT_MS, type ControllerLayoutInfo } from './controllerConnection';

const caps = { gyro: true, accel: true, hz: 60, platform: 'ios' as const };

function fakeTransport() {
  const sent: ControllerMessage[] = [];
  let listener: ((m: ServerMessage) => void) | null = null;
  const t: ClientTransport = {
    id: 'x',
    send: (m) => { sent.push(m); },
    onMessage: (cb) => { listener = cb; return () => { listener = null; }; },
    close: () => {},
  };
  return { t, sent, deliver: (m: ServerMessage) => listener?.(m) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connessione del telefono', () => {
  test('welcome entro il timeout → live, poi il battito parte', async () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const p = c.join(caps);
    f.deliver({ t: 'welcome', p: { slot: 'P2', sessionToken: 'abcdefgh12' } });
    await expect(p).resolves.toEqual({ ok: true, mode: 'live', slot: 'P2' });
    vi.advanceTimersByTime(2100);
    expect(f.sent.some((m) => m.t === 'ping')).toBe(true);
  });

  test('nessuna risposta → demo; un welcome tardivo passa a live e rimanda il profilo', async () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const statuses: string[] = [];
    c.onStatus((s) => statuses.push(`${s.mode}:${s.slot}`));
    const p = c.join(caps);
    vi.advanceTimersByTime(JOIN_TIMEOUT_MS + 10);
    await expect(p).resolves.toEqual({ ok: true, mode: 'demo', slot: 'P1' });
    c.sendProfile({ color: '#9C6BFF', accessory: 'cap' });
    expect(f.sent.filter((m) => m.t === 'profile')).toHaveLength(0);
    f.deliver({ t: 'welcome', p: { slot: 'P3', sessionToken: 'abcdefgh12' } });
    expect(statuses).toEqual(['live:P3']);
    expect(f.sent.at(-1)).toEqual({ t: 'profile', p: { color: '#9C6BFF', accessory: 'cap' } });
  });

  test('errore dall’host', async () => {
    const f = fakeTransport();
    const p = createControllerConnection('K7RM', f.t).join(caps);
    f.deliver({ t: 'error', p: { code: 'ROOM_FULL' } });
    await expect(p).resolves.toEqual({ ok: false, code: 'ROOM_FULL' });
  });

  test('tolto dallo schermo: avvisa, dimentica il token e non manda più nulla', async () => {
    const removeItem = vi.fn();
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem });
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const kicked = vi.fn();
    c.onKicked(kicked);
    const p = c.join(caps);
    f.deliver({ t: 'welcome', p: { slot: 'P2', sessionToken: 'abcdefgh12' } });
    await p;
    f.deliver({ t: 'error', p: { code: 'KICKED' } });
    expect(kicked).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalled();
    const before = f.sent.length;
    vi.advanceTimersByTime(5000); // niente battito
    c.sendGameEvent('bowling', { kind: 'throw', data: {} });
    expect(f.sent).toHaveLength(before);
  });

  test('senza pong lo schermo risulta perso; un pong lo riporta live', async () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const statuses: string[] = [];
    c.onStatus((s) => statuses.push(s.mode));
    const p = c.join(caps);
    f.deliver({ t: 'welcome', p: { slot: 'P1', sessionToken: 'abcdefgh12' } });
    await p;
    vi.advanceTimersByTime(HOST_LOST_MS + 2100);
    expect(statuses).toContain('lost');
    f.deliver({ t: 'pong', p: { at: 1 } });
    expect(statuses.at(-1)).toBe('live');
  });

  test('ricezione messaggio layout e invio ready', () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const layouts: ControllerLayoutInfo[] = [];
    c.onLayout((l) => layouts.push(l));

    f.deliver({ t: 'layout', p: { gameId: 'bowling', layoutId: 'bowling-play' } });
    expect(layouts).toEqual([{ gameId: 'bowling', layoutId: 'bowling-play' }]);

    c.sendReady('bowling-play');
    expect(f.sent).toContainEqual({ t: 'ready', p: { layoutId: 'bowling-play' } });
  });

  test('dopo close() join non invia nulla e risolve subito', async () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    c.close();
    await expect(c.join(caps)).resolves.toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(f.sent).toHaveLength(0);
  });

  test('close() durante un join in corso lo chiude senza eccezioni', async () => {
    const f = fakeTransport();
    const c = createControllerConnection('K7RM', f.t);
    const p = c.join(caps);
    c.close();
    await expect(p).resolves.toEqual({ ok: false, code: 'ROOM_NOT_FOUND' });
  });
});
