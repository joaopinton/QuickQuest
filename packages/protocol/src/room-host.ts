// Host della stanza: collega un HostTransport al reducer. Oggi gira nella scheda dello schermo.

import type { LobbyPlayer, ServerMessage } from './messages';
import {
  applyHello, applyLeave, applyProfile, applySeen, createRoom, expireStale, lobbyPlayers, type RoomState,
} from './room';
import { randomId, type HostTransport } from './transport';

export const HEARTBEAT_MS = 2000;
export const STALE_MS = 6000;

export interface RoomHostOptions {
  readonly code: string;
  readonly transport: HostTransport;
  readonly onLobby: (players: readonly LobbyPlayer[]) => void;
  readonly now?: () => number;
  readonly makeToken?: () => string;
  readonly staleMs?: number;
}

export interface RoomHost {
  readonly code: string;
  /** Da chiamare periodicamente: segna disconnessi i telefoni silenziosi. */
  tick(): void;
  players(): readonly LobbyPlayer[];
  close(): void;
}

export function createRoomHost(opts: RoomHostOptions): RoomHost {
  const { code, transport, onLobby, now = Date.now, makeToken = randomId, staleMs = STALE_MS } = opts;
  let state: RoomState = createRoom(code);

  const publish = (next: RoomState) => {
    if (next === state) return;
    state = next;
    const players = lobbyPlayers(state);
    onLobby(players);
    const msg: ServerMessage = { t: 'lobby', p: { players } };
    transport.broadcast(msg);
  };

  const unsubscribe = transport.onMessage((from, result) => {
    if (!result.ok) {
      transport.sendTo(from, { t: 'error', p: { code: result.code } });
      return;
    }
    const msg = result.msg;
    switch (msg.t) {
      case 'hello': {
        const r = applyHello(state, { connectionId: from, sessionToken: msg.p.sessionToken, capabilities: msg.p.capabilities, now: now(), makeToken });
        transport.sendTo(from, r.reply);
        const changed = r.state !== state;
        publish(r.state);
        // se la stanza non è cambiata nessuno ha ricevuto la lobby: la si manda a chi ha chiesto
        if (!changed) transport.sendTo(from, { t: 'lobby', p: { players: lobbyPlayers(state) } });
        break;
      }
      case 'profile':
        publish(applyProfile(state, from, msg.p));
        break;
      case 'ping': {
        const wasOffline = state.players.some((p) => p.connectionId === from && !p.connected);
        const next = applySeen(state, from, now());
        // il battito aggiorna solo lastSeen: si ripubblica la lobby solo se qualcuno torna online
        if (wasOffline) publish(next);
        else state = next;
        transport.sendTo(from, { t: 'pong', p: { at: msg.p.at } });
        break;
      }
      case 'bye':
        publish(applyLeave(state, from));
        break;
      default:
        // i messaggi del server non arrivano all'host: si ignorano
        break;
    }
  });

  return {
    code,
    tick: () => publish(expireStale(state, now(), staleMs)),
    players: () => lobbyPlayers(state),
    close: () => {
      unsubscribe();
      transport.close();
    },
  };
}
