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
    a.t.send({ t: 'profile', p: { name: '', color: '#9C6BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'glasses', face: 'none', neck: 'none' } });
    await until(() => lobbies.at(-1)?.[0]?.state === 'ready');
    expect(lobbies.at(-1)).toEqual([{ slot: 'P1', state: 'ready', profile: { name: '', color: '#9C6BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'glasses', face: 'none', neck: 'none' } }]);
    expect(a.inbox.at(-1)).toMatchObject({ t: 'lobby' });
    expect(host.players()).toHaveLength(1);
  });

  test('un messaggio malformato riceve BAD_MESSAGE e non cambia la stanza', async () => {
    const { lobbies, roomCode } = setup();
    const raw = new BroadcastChannel(`quickquest:${roomCode}`);
    const replies: unknown[] = [];
    raw.addEventListener('message', (e) => replies.push(e.data));
    cleanups.push(() => raw.close());
    raw.postMessage({ from: 'x', to: 'host', data: '{"v":2,"t":"profile","p":{"color":"javascript:"}}' });
    await until(() => replies.length > 0);
    expect(replies).toContainEqual({ from: 'host', to: 'x', data: '{"v":2,"t":"error","p":{"code":"BAD_MESSAGE"}}' });
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

  test('scelta del gioco e avvio partita inviano il messaggio layout al telefono', async () => {
    const { host, client } = setup();
    const a = client();
    a.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => a.inbox.some((m) => m.t === 'welcome'));
    a.t.send({ t: 'profile', p: { name: '', color: '#8E5BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'cap', face: 'none', neck: 'none' } });
    await until(() => a.inbox.some((m) => m.t === 'lobby' && m.p.players[0]?.state === 'ready'));

    // Selezione del gioco
    host.selectGame('bowling');
    await until(() => a.inbox.some((m) => m.t === 'lobby' && m.p.selectedGame === 'bowling'));
    expect(host.state().selectedGame).toBe('bowling');

    // Avvio della partita
    const started = host.startGame();
    expect(started).toBe(true);
    expect(host.state().phase).toBe('playing');

    // Il controller deve ricevere il messaggio layout
    await until(() => a.inbox.some((m) => m.t === 'layout'));
    const layoutMsg = a.inbox.find((m) => m.t === 'layout');
    expect(layoutMsg).toEqual({
      t: 'layout',
      p: { gameId: 'bowling', layoutId: 'bowling-play' },
    });

    // Il controller invia ready
    a.t.send({ t: 'ready', p: { layoutId: 'bowling-play' } });

    // Ritorno alla lobby
    host.returnToLobby();
    expect(host.state().phase).toBe('lobby');
    await until(() => a.inbox.at(-1)?.t === 'lobby' && (a.inbox.at(-1) as any).p.phase === 'lobby');
  });
});

describe('lancio col gesto dal telefono del giocatore di turno', () => {
  const ready = async (c: { t: ClientTransport; inbox: ServerMessage[] }) => {
    c.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => c.inbox.some((m) => m.t === 'welcome'));
    c.t.send({ t: 'profile', p: { name: '', color: '#9C6BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'glasses', face: 'none', neck: 'none' } });
  };

  test('bowling sul contratto: solo il telefono di turno lancia', async () => {
    const roomCode = `G${String(++code).padStart(3, '0')}`;
    const throws: [string, number][] = [];
    const host = createRoomHost({
      code: roomCode, transport: createLocalHost(roomCode), onLobby: () => {},
      onGameEvent: (slot, _gameId, e) => throws.push([slot, Number(e.data.speed)]),
    });
    cleanups.push(() => host.close());
    const mk = () => {
      const t = createLocalClient(roomCode);
      const inbox: ServerMessage[] = [];
      t.onMessage((m) => inbox.push(m));
      cleanups.push(() => t.close());
      return { t, inbox };
    };
    const a = mk();
    const b = mk();
    await ready(a);
    await ready(b);
    await until(() => host.players().filter((p) => p.state === 'ready').length === 2);
    expect(host.startGame('bowling')).toBe(true);

    host.setTurn('P1');
    await until(() => b.inbox.some((m) => m.t === 'turn' && m.p.activeSlot === 'P1'));
    b.t.send({ t: 'game-event', p: { gameId: 'bowling', e: { kind: 'throw', data: { speed: 7, spin: 0, dir: 0 } } } }); // non è il suo turno
    a.t.send({ t: 'game-event', p: { gameId: 'bowling', e: { kind: 'throw', data: { speed: 8, spin: 0.2, dir: 0.01 } } } });
    await until(() => throws.length > 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(throws).toEqual([['P1', 8]]);
    host.setTurn('P2'); // tocca a P2: un altro lancio di P1 non passa
    await until(() => a.inbox.some((m) => m.t === 'turn' && m.p.activeSlot === 'P2'));
    a.t.send({ t: 'game-event', p: { gameId: 'bowling', e: { kind: 'throw', data: { speed: 8, spin: 0, dir: 0 } } } });
    await new Promise((r) => setTimeout(r, 20));
    expect(throws).toHaveLength(1);
  });

  test('eventi di gioco: solo del gioco in corso e del giocatore di turno; i cue arrivano al telefono', async () => {
    const roomCode = `E${String(++code).padStart(3, '0')}`;
    const events: [string, string, string][] = [];
    const host = createRoomHost({
      code: roomCode, transport: createLocalHost(roomCode), onLobby: () => {},
      onGameEvent: (slot, gameId, e) => events.push([slot, gameId, e.kind]),
    });
    cleanups.push(() => host.close());
    const mk = () => {
      const t = createLocalClient(roomCode);
      const inbox: ServerMessage[] = [];
      t.onMessage((m) => inbox.push(m));
      cleanups.push(() => t.close());
      return { t, inbox };
    };
    const a = mk();
    const b = mk();
    await ready(a);
    await ready(b);
    await until(() => host.players().filter((p) => p.state === 'ready').length === 2);
    a.t.send({ t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: {} } } }); // partita non iniziata
    await new Promise((r) => setTimeout(r, 30)); // BroadcastChannel consegna in modo asincrono
    expect(events).toHaveLength(0);
    expect(host.startGame('golf')).toBe(true);
    // turno libero: tutti possono mandare eventi
    b.t.send({ t: 'game-event', p: { gameId: 'golf', e: { kind: 'club', data: { club: 'iron' } } } });
    await until(() => events.length === 1);
    host.setTurn('P1');
    await until(() => b.inbox.some((m) => m.t === 'turn' && m.p.activeSlot === 'P1'));
    b.t.send({ t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: {} } } }); // non è il suo turno
    a.t.send({ t: 'game-event', p: { gameId: 'bowling', e: { kind: 'shot', data: {} } } }); // gioco sbagliato
    a.t.send({ t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: { power: 0.5 } } } });
    await until(() => events.length === 2);
    await new Promise((r) => setTimeout(r, 20));
    expect(events).toEqual([['P2', 'golf', 'club'], ['P1', 'golf', 'shot']]);

    host.sendCue('P2', { kind: 'success', text: 'Birdie!' });
    host.sendCue(null, { kind: 'tap' });
    await until(() => a.inbox.some((m) => m.t === 'cue'));
    await until(() => b.inbox.filter((m) => m.t === 'cue').length === 2);
    expect(a.inbox.filter((m) => m.t === 'cue')).toEqual([{ t: 'cue', p: { kind: 'tap', slot: null } }]);
    expect(b.inbox.find((m) => m.t === 'cue')).toEqual({ t: 'cue', p: { kind: 'success', slot: 'P2', text: 'Birdie!' } });
  });

  test('un telefono non può cambiare turno né chiudere la partita', async () => {
    const roomCode = `H${String(++code).padStart(3, '0')}`;
    const host = createRoomHost({ code: roomCode, transport: createLocalHost(roomCode), onLobby: () => {} });
    cleanups.push(() => host.close());
    const t = createLocalClient(roomCode);
    const inbox: ServerMessage[] = [];
    t.onMessage((m) => inbox.push(m));
    cleanups.push(() => t.close());
    await ready({ t, inbox });
    await until(() => host.players()[0]?.state === 'ready');
    host.startGame('bowling');
    t.send({ t: 'turn', p: { activeSlot: 'P1' } });
    t.send({ t: 'end-game', p: {} });
    await new Promise((r) => setTimeout(r, 30));
    expect(host.state().activeSlot ?? null).toBeNull();
    expect(host.state().phase).toBe('playing');
  });

  test('chi entra a partita in corso riceve subito layout e turno', async () => {
    const roomCode = `J${String(++code).padStart(3, '0')}`;
    const host = createRoomHost({ code: roomCode, transport: createLocalHost(roomCode), onLobby: () => {} });
    cleanups.push(() => host.close());
    const mk = () => {
      const t = createLocalClient(roomCode);
      const inbox: ServerMessage[] = [];
      t.onMessage((m) => inbox.push(m));
      cleanups.push(() => t.close());
      return { t, inbox };
    };
    const a = mk();
    await ready(a);
    await until(() => host.players()[0]?.state === 'ready');
    host.startGame('bowling');
    host.setTurn('P1');
    const late = mk();
    late.t.send({ t: 'hello', p: { sessionToken: null, capabilities: caps } });
    await until(() => late.inbox.some((m) => m.t === 'turn'));
    expect(late.inbox.find((m) => m.t === 'layout')).toMatchObject({ p: { gameId: 'bowling' } });
    expect(late.inbox.find((m) => m.t === 'turn')).toEqual({ t: 'turn', p: { activeSlot: 'P1' } });
  });

  test('kick: solo lo schermo toglie un giocatore, il telefono riceve KICKED e lo slot si libera', async () => {
    const roomCode = `K${String(++code).padStart(3, '0')}`;
    const host = createRoomHost({
      code: roomCode, transport: createLocalHost(roomCode), onLobby: () => {},
      isScreen: () => false, // qui lo schermo chiama host.kick direttamente
    });
    cleanups.push(() => host.close());
    const mk = () => {
      const t = createLocalClient(roomCode);
      const inbox: ServerMessage[] = [];
      t.onMessage((m) => inbox.push(m));
      cleanups.push(() => t.close());
      return { t, inbox };
    };
    const a = mk();
    const b = mk();
    await ready(a);
    await ready(b);
    await until(() => host.players().filter((p) => p.state === 'ready').length === 2);

    // un telefono non può togliere un altro
    b.t.send({ t: 'kick', p: { slot: 'P1' } });
    await new Promise((r) => setTimeout(r, 30));
    expect(host.players().map((p) => p.slot)).toEqual(['P1', 'P2']);

    host.setTurn('P2');
    host.kick('P2');
    await until(() => b.inbox.some((m) => m.t === 'error'));
    expect(b.inbox.find((m) => m.t === 'error')).toEqual({ t: 'error', p: { code: 'KICKED' } });
    expect(host.players().map((p) => p.slot)).toEqual(['P1']);
    expect(host.state().activeSlot).toBeNull(); // era il suo turno: non resta appeso
    expect(a.inbox.some((m) => m.t === 'error')).toBe(false);
    host.kick('P3'); // slot vuoto: nulla
    expect(host.players()).toHaveLength(1);
  });
});
