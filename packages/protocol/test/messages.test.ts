import { describe, expect, test } from 'vitest';
import { decode, encode, MAX_MESSAGE_BYTES, type Message } from '../src/messages';

const caps = { gyro: true, accel: true, hz: 60, platform: 'ios' as const };

describe('codec dei messaggi', () => {
  test('round-trip dei messaggi validi', () => {
    const msgs: Message[] = [
      { t: 'hello', p: { sessionToken: null, capabilities: caps } },
      { t: 'hello', p: { sessionToken: 'abcDEF123_-x', capabilities: caps } },
      { t: 'profile', p: { color: '#EF4E5B', accessory: 'cap' } },
      { t: 'ping', p: { at: 12 } },
      { t: 'ready', p: { layoutId: 'bowling-play' } },
      { t: 'select-game', p: { gameId: 'bowling' } },
      { t: 'start', p: { gameId: 'bowling' } },
      { t: 'bye', p: {} },
      { t: 'welcome', p: { slot: 'P2', sessionToken: 'abcDEF123_-x' } },
      {
        t: 'lobby',
        p: {
          players: [{ slot: 'P1', state: 'ready', profile: { color: '#3C8CF0', accessory: 'none' } }],
          phase: 'playing',
          selectedGame: 'bowling',
        },
      },
      { t: 'layout', p: { gameId: 'bowling', layoutId: 'aim', params: { difficulty: 'normal' } } },
      { t: 'turn', p: { activeSlot: 'P1' } },
      { t: 'error', p: { code: 'ROOM_FULL' } },
      { t: 'error', p: { code: 'KICKED' } },
      { t: 'kick', p: { slot: 'P3' } },
      { t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: { power: 0.7, faceDeg: -3, kind: 'full', ok: true } } } },
      { t: 'game-event', p: { gameId: 'golf', e: { kind: 'club', data: {} }, slot: 'P2' } },
      { t: 'cue', p: { kind: 'success', slot: 'P1', text: 'Birdie!' } },
      { t: 'cue', p: { kind: 'tap', slot: null } },
    ];
    for (const m of msgs) expect(decode(encode(m))).toEqual({ ok: true, msg: m });
  });

  test('versione diversa → VERSION_MISMATCH', () => {
    expect(decode(JSON.stringify({ v: 2, t: 'ping', p: { at: 1 } }))).toEqual({ ok: false, code: 'VERSION_MISMATCH' });
  });

  test.each([
    ['non stringa', 42],
    ['JSON rotto', '{'],
    ['tipo sconosciuto', JSON.stringify({ v: 1, t: 'boom', p: {} })],
    ['colore non esadecimale', JSON.stringify({ v: 1, t: 'profile', p: { color: 'red', accessory: 'cap' } })],
    ['accessorio con caratteri strani', JSON.stringify({ v: 1, t: 'profile', p: { color: '#ffffff', accessory: '<img>' } })],
    ['token troppo corto', JSON.stringify({ v: 1, t: 'hello', p: { sessionToken: 'x', capabilities: caps } })],
    ['capabilities incomplete', JSON.stringify({ v: 1, t: 'hello', p: { sessionToken: null, capabilities: { gyro: true } } })],
    ['slot inesistente', JSON.stringify({ v: 1, t: 'welcome', p: { slot: 'P9', sessionToken: 'abcdefgh' } })],
    ['troppi giocatori', JSON.stringify({ v: 1, t: 'lobby', p: { players: Array(5).fill({ slot: 'P1', state: 'ready', profile: null }) } })],
    ['gameId non valido in select-game', JSON.stringify({ v: 1, t: 'select-game', p: { gameId: 'Bowling!!' } })],
    ['layoutId mancante in layout', JSON.stringify({ v: 1, t: 'layout', p: { gameId: 'bowling' } })],
    ['turn con slot non valido', JSON.stringify({ v: 1, t: 'turn', p: { activeSlot: 'P9' } })],
    ['kick senza slot valido', JSON.stringify({ v: 1, t: 'kick', p: { slot: null } })],
    ['messaggio enorme', 'x'.repeat(MAX_MESSAGE_BYTES + 1)],
    ['evento senza kind', JSON.stringify({ v: 1, t: 'game-event', p: { gameId: 'golf', e: { data: {} } } })],
    ['evento con oggetto annidato', JSON.stringify({ v: 1, t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: { a: { b: 1 } } } } })],
    ['evento con numero infinito', JSON.stringify({ v: 1, t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: { a: 1e9 } } } })],
    ['evento con troppi campi', JSON.stringify({ v: 1, t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i])) } } })],
    ['evento con chiave strana', JSON.stringify({ v: 1, t: 'game-event', p: { gameId: 'golf', e: { kind: 'shot', data: { __proto__x: 1 } } } })],
    ['cue sconosciuto', JSON.stringify({ v: 1, t: 'cue', p: { kind: 'boom', slot: null } })],
    ['cue senza slot', JSON.stringify({ v: 1, t: 'cue', p: { kind: 'tap' } })],
    ['cue con testo lungo', JSON.stringify({ v: 1, t: 'cue', p: { kind: 'tap', slot: null, text: 'x'.repeat(81) } })],
  ])('rifiuta: %s', (_name, raw) => {
    expect(decode(raw)).toEqual({ ok: false, code: 'BAD_MESSAGE' });
  });
});
