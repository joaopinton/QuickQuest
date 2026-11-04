import { describe, expect, test } from 'vitest';
import { encode, decode, type ServerMessage } from '../src/messages';
import { createRoomHost } from '../src/room-host';
import type { HostTransport } from '../src/transport';
import type { RoomState } from '../src/room';

const caps = { gyro: true, accel: true, hz: 60, platform: 'ios' as const };

function fakeTransport() {
  const sent: { to: string; msg: ServerMessage }[] = [];
  let handler: Parameters<HostTransport['onMessage']>[0] = () => {};
  const transport: HostTransport = {
    onMessage: (cb) => { handler = cb; return () => {}; },
    sendTo: (to, msg) => sent.push({ to, msg }),
    broadcast: (msg) => sent.push({ to: '*', msg }),
    close: () => {},
  };
  const deliver = (from: string, msg: Parameters<typeof encode>[0]) => handler(from, decode(encode(msg)));
  return { transport, sent, deliver };
}

describe('room host: persistenza e disconnessione', () => {
  test('onState riceve ogni cambio e initialState riporta in vita la stanza', () => {
    const a = fakeTransport();
    const saved: RoomState[] = [];
    const host = createRoomHost({ code: 'ABCD', transport: a.transport, onLobby: () => {}, onState: (s) => saved.push(s), makeToken: () => 'token-aaaaaaaa' });
    a.deliver('c1', { t: 'hello', p: { sessionToken: null, capabilities: caps } });
    expect(saved).toHaveLength(1);

    const b = fakeTransport();
    const revived = createRoomHost({ code: 'ABCD', transport: b.transport, onLobby: () => {}, initialState: saved[0] });
    b.deliver('c2', { t: 'hello', p: { sessionToken: 'token-aaaaaaaa', capabilities: caps } });
    expect(b.sent[0]?.msg).toMatchObject({ t: 'welcome', p: { slot: 'P1', sessionToken: 'token-aaaaaaaa' } });
    expect(revived.players()).toHaveLength(1);
  });

  test('disconnect segna lo slot disconnesso e pubblica la lobby', () => {
    const a = fakeTransport();
    const host = createRoomHost({ code: 'ABCD', transport: a.transport, onLobby: () => {} });
    a.deliver('c1', { t: 'hello', p: { sessionToken: null, capabilities: caps } });
    host.disconnect('c1');
    expect(host.players()[0]?.state).toBe('disconnected');
    expect(a.sent.at(-1)?.msg.t).toBe('lobby');
  });
});
