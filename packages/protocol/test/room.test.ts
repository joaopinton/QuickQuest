import { describe, expect, test } from 'vitest';
import type { Capabilities } from '../src/messages';
import {
  applyDisconnect,
  applyHello,
  applyLeave,
  applyProfile,
  applyReturnToLobby,
  applySeen,
  applySelectGame,
  applyStart,
  createRoom,
  expireStale,
  lobbyPlayers,
} from '../src/room';

const caps: Capabilities = { gyro: true, accel: true, hz: 60, platform: 'android' };
let n = 0;
const makeToken = () => `token-${String(++n).padStart(4, '0')}`;
const hello = (state: ReturnType<typeof createRoom>, connectionId: string, sessionToken: string | null = null, c = caps) =>
  applyHello(state, { connectionId, sessionToken, capabilities: c, now: 1000, makeToken });

describe('reducer della stanza', () => {
  test('i giocatori prendono gli slot in ordine P1…P4', () => {
    let s = createRoom('K7RM');
    const slots: string[] = [];
    for (const id of ['a', 'b', 'c', 'd']) {
      const r = hello(s, id);
      s = r.state;
      if (r.reply.t === 'welcome') slots.push(r.reply.p.slot);
    }
    expect(slots).toEqual(['P1', 'P2', 'P3', 'P4']);
  });

  test('il quinto giocatore riceve ROOM_FULL e lo stato non cambia', () => {
    let s = createRoom('K7RM');
    for (const id of ['a', 'b', 'c', 'd']) s = hello(s, id).state;
    const r = hello(s, 'e');
    expect(r.reply).toEqual({ t: 'error', p: { code: 'ROOM_FULL' } });
    expect(r.state).toBe(s);
  });

  test('un telefono senza giroscopio viene rifiutato', () => {
    const r = hello(createRoom('K7RM'), 'a', null, { ...caps, gyro: false });
    expect(r.reply).toEqual({ t: 'error', p: { code: 'UNSUPPORTED_DEVICE' } });
    expect(r.state.players).toHaveLength(0);
  });

  test('chi rientra con il token si riprende lo slot e il profilo', () => {
    let s = createRoom('K7RM');
    const first = hello(s, 'a');
    s = applyProfile(first.state, 'a', { name: '', color: '#9C6BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'cap', face: 'none', neck: 'none' });
    s = hello(s, 'b').state;
    s = applyDisconnect(s, 'a');
    expect(lobbyPlayers(s)[0]?.state).toBe('disconnected');
    const token = first.reply.t === 'welcome' ? first.reply.p.sessionToken : '';
    const again = hello(s, 'a2', token);
    expect(again.reply).toEqual({ t: 'welcome', p: { slot: 'P1', sessionToken: token } });
    expect(lobbyPlayers(again.state)[0]).toEqual({ slot: 'P1', state: 'ready', profile: { name: '', color: '#9C6BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'cap', face: 'none', neck: 'none' } });
  });

  test('la stessa connessione che ripete hello (doppio tap) non occupa due slot', () => {
    let s = hello(createRoom('K7RM'), 'a').state;
    const again = hello(s, 'a');
    s = again.state;
    expect(again.reply).toMatchObject({ t: 'welcome', p: { slot: 'P1' } });
    expect(s.players).toHaveLength(1);
  });

  test('stanza piena con un giocatore sparito: il nuovo arrivato prende il suo slot', () => {
    let s = createRoom('K7RM');
    for (const id of ['a', 'b', 'c', 'd']) s = hello(s, id).state;
    s = applyDisconnect(s, 'c');
    const r = hello(s, 'e');
    expect(r.reply).toMatchObject({ t: 'welcome', p: { slot: 'P3' } });
    expect(r.state.players).toHaveLength(4);
  });

  test('un token sconosciuto vale come nuovo ingresso', () => {
    const r = hello(createRoom('K7RM'), 'a', 'token-inventato');
    expect(r.reply.t).toBe('welcome');
  });

  test('uscita esplicita: lo slot si libera e viene riassegnato', () => {
    let s = createRoom('K7RM');
    s = hello(s, 'a').state;
    s = hello(s, 'b').state;
    s = applyLeave(s, 'a');
    const r = hello(s, 'c');
    expect(r.reply.t === 'welcome' && r.reply.p.slot).toBe('P1');
  });

  test('stati della lobby: connecting → ready', () => {
    let s = hello(createRoom('K7RM'), 'a').state;
    expect(lobbyPlayers(s)).toEqual([{ slot: 'P1', state: 'connecting', profile: null }]);
    s = applyProfile(s, 'a', { name: '', color: '#EF4E5B', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'none', face: 'none', neck: 'none' });
    expect(lobbyPlayers(s)[0]?.state).toBe('ready');
  });

  test('applyProfile e applyDisconnect ignorano connessioni sconosciute', () => {
    const s = hello(createRoom('K7RM'), 'a').state;
    expect(applyProfile(s, 'zzz', { name: '', color: '#EF4E5B', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'none', face: 'none', neck: 'none' })).toBe(s);
    expect(applyDisconnect(s, 'zzz')).toBe(s);
  });

  test('expireStale segna disconnesso chi non si fa sentire', () => {
    let s = hello(createRoom('K7RM'), 'a').state; // lastSeen 1000
    s = hello(s, 'b').state;
    s = applySeen(s, 'b', 7000);
    s = expireStale(s, 7500, 6000);
    expect(lobbyPlayers(s).map((p) => p.state)).toEqual(['disconnected', 'connecting']);
  });

  test('scelta del gioco, avvio e ritorno alla lobby', () => {
    let s = createRoom('K7RM');
    expect(s.phase).toBe('lobby');
    expect(s.selectedGame).toBeNull();

    s = applySelectGame(s, 'bowling');
    expect(s.selectedGame).toBe('bowling');

    // Avvio senza giocatori pronti fallisce
    const failNoPlayers = applyStart(s);
    expect(failNoPlayers.ok).toBe(false);

    // Con un giocatore pronto
    s = hello(s, 'a').state;
    s = applyProfile(s, 'a', { name: '', color: '#8E5BFF', color2: '#FFF6E8', pattern: 'none', eyes: 'round', mouth: 'smile', hat: 'cap', face: 'none', neck: 'none' });

    const startOk = applyStart(s);
    expect(startOk.ok).toBe(true);
    expect(startOk.state.phase).toBe('playing');
    expect(startOk.state.selectedGame).toBe('bowling');

    // Ritorno alla lobby
    const returned = applyReturnToLobby(startOk.state);
    expect(returned.phase).toBe('lobby');
    expect(returned.selectedGame).toBe('bowling');
  });

  test('le funzioni non mutano lo stato originale', () => {
    const s0 = createRoom('K7RM');
    const s1 = hello(s0, 'a').state;
    expect(s0.players).toHaveLength(0);
    expect(Object.isFrozen(s1.players)).toBe(true);
  });
});
