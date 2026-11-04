import { afterEach, describe, expect, test } from 'vitest';
import type { LobbyPlayer, ServerMessage } from '../src/messages';
import { createRoomHost, type RoomHost } from '../src/room-host';
import { createLocalClient, createLocalHost, type ClientTransport } from '../src/transport';

const caps = { gyro: true, accel: true, hz: 60, platform: 'ios' as const };
/** Aspetta che la condizione diventi vera (BroadcastChannel consegna in modo asincrono). */
async function until(pred: () => boolean, timeoutMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > end) throw new Error('timeout in attesa della condizione');
    await new Promise((r) => setTimeout(r, 5));
  }
}
let code = 0;
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((c) => c()); });

function setup(now = () => 1000) {
  const roomCode = `T${String(++code).padStart(3, '0')}`;
  const lobbies: (readonly LobbyPlayer[])[] = [];
  const host: RoomHost = createRoomHost({ code: roomCode, transport: createLocalHost(roomCode), onLobby: (p) => lobbies.push(p), now });
  cleanups.push(() => host.close());
  const client = (): { t: ClientTransport; inbox: ServerMessage[] } => {
    const t = createLocalClient(roomCode);
    const inbox: ServerMessage[] = [];
    t.onMessage((m) => inbox.push(m));
    cleanups.push(() => t.close());
    return { t, inbox };
  };
  return { host, lobbies, client, roomCode };
}

describe('host locale della stanza su BroadcastChannel', () => {
  test('hello → welcome; profile → lobby "ready" per schermo e telefoni', async () => {
    const { host, lobbies, client } = setup();
    const a = client();
    a.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => a.inbox.length > 0);
    expect(a.inbox[0]).toMatchObject({ t: 'welcome', p: { slot: 'P1' } });
    a.t.send({ t: 'profile', p: { color: '#9C6BFF', accessory: 'glasses' } });
    await until(() => lobbies.at(-1)?.[0]?.state === 'ready');
    expect(lobbies.at(-1)).toEqual([{ slot: 'P1', state: 'ready', profile: { color: '#9C6BFF', accessory: 'glasses' } }]);
    expect(a.inbox.at(-1)).toMatchObject({ t: 'lobby' });
    expect(host.players()).toHaveLength(1);
  });

  test('un messaggio malformato riceve BAD_MESSAGE e non cambia la stanza', async () => {
    const { lobbies, roomCode } = setup();
    const raw = new BroadcastChannel(`quickquest:${roomCode}`);
    const replies: unknown[] = [];
    raw.addEventListener('message', (e) => replies.push(e.data));
    cleanups.push(() => raw.close());
    raw.postMessage({ from: 'x', to: 'host', data: '{"v":1,"t":"profile","p":{"color":"javascript:"}}' });
    await until(() => replies.length > 0);
    expect(replies).toContainEqual({ from: 'host', to: 'x', data: '{"v":1,"t":"error","p":{"code":"BAD_MESSAGE"}}' });
    expect(lobbies).toHaveLength(0);
  });

  test('i messaggi indirizzati a un altro telefono non arrivano', async () => {
    const { client } = setup();
    const a = client();
    const b = client();
    a.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => a.inbox.some((m) => m.t === 'welcome') && b.inbox.some((m) => m.t === 'lobby'));
    expect(a.inbox.some((m) => m.t === 'welcome')).toBe(true);
    expect(b.inbox.some((m) => m.t === 'welcome')).toBe(false);
    expect(b.inbox.some((m) => m.t === 'lobby')).toBe(true); // la lobby è per tutti
  });

  test('il quinto telefono riceve ROOM_FULL e la lobby attuale', async () => {
    const { client } = setup();
    const first4 = [client(), client(), client(), client()];
    for (const c of first4) c.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => first4.every((c) => c.inbox.some((m) => m.t === 'welcome')));
    const e = client();
    e.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => e.inbox.some((m) => m.t === 'error') && e.inbox.at(-1)?.t === 'lobby');
    expect(e.inbox).toContainEqual({ t: 'error', p: { code: 'ROOM_FULL' } });
    expect(e.inbox.at(-1)).toMatchObject({ t: 'lobby' });
  });

  test('battito: silenzio → disconnesso, ping → di nuovo online; bye libera lo slot', async () => {
    let clock = 1000;
    const { host, lobbies, client } = setup(() => clock);
    const a = client();
    a.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => a.inbox.some((m) => m.t === 'welcome'));
    clock = 9000;
    host.tick();
    expect(lobbies.at(-1)?.[0]?.state).toBe('disconnected');
    a.t.send({ t: 'ping', p: { at: 1 } });
    await until(() => a.inbox.some((m) => m.t === 'pong'));
    expect(lobbies.at(-1)?.[0]?.state).toBe('connecting');
    expect(a.inbox).toContainEqual({ t: 'pong', p: { at: 1 } });
    a.t.send({ t: 'bye', p: {} });
    await until(() => lobbies.at(-1)?.length === 0);
    expect(lobbies.at(-1)).toEqual([]);
  });
});
