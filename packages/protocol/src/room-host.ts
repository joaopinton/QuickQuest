// Host della stanza: collega un HostTransport al reducer. Oggi gira nella scheda dello schermo.

import type { LobbyPlayer, RoomPhase, ServerMessage, SlotId, ThrowParams } from './messages';
import {
  applyDisconnect,
  applyHello,
  applyLeave,
  applyProfile,
  applyReturnToLobby,
  applySeen,
  applySelectGame,
  applyStart,
  applyTurn,
  createRoom,
  expireStale,
  lobbyPlayers,
  throwerSlot,
  type RoomState,
} from './room';
import { randomId, type HostTransport } from './transport';

export const HEARTBEAT_MS = 2000;
export const STALE_MS = 6000;

export interface RoomHostOptions {
  readonly code: string;
  readonly transport: HostTransport;
  readonly onLobby: (players: readonly LobbyPlayer[], phase?: RoomPhase, selectedGame?: string | null) => void;
  readonly now?: () => number;
  readonly makeToken?: () => string;
  readonly staleMs?: number;
  /** Stato da cui ripartire (Durable Object risvegliato dall'ibernazione). */
  readonly initialState?: RoomState;
  /** Chiamato a ogni cambio di stato che va persistito. */
  readonly onState?: (state: RoomState) => void;
  /** Lancio valido del giocatore di turno: va consegnato allo schermo. */
  readonly onThrow?: (slot: SlotId, params: ThrowParams) => void;
  /**
   * La connessione è uno schermo? Solo gli schermi possono cambiare turno o chiudere la partita
   * via messaggio (relay). Con l'host locale lo schermo chiama i metodi direttamente.
   */
  readonly isScreen?: (connectionId: string) => boolean;
}

export interface RoomHost {
  readonly code: string;
  /** Da chiamare periodicamente: segna disconnessi i telefoni silenziosi. */
  tick(): void;
  /** Connessione chiusa senza `bye`: lo slot resta riservato per il rientro. */
  disconnect(connectionId: string): void;
  players(): readonly LobbyPlayer[];
  state(): RoomState;
  selectGame(gameId: string): void;
  startGame(gameId?: string): boolean;
  returnToLobby(): void;
  /** Lo schermo indica chi può lanciare adesso (`null` = nessuno, es. palla in pista). */
  setTurn(activeSlot: SlotId | null): void;
  close(): void;
}

export function createRoomHost(opts: RoomHostOptions): RoomHost {
  const {
    code, transport, onLobby, now = Date.now, makeToken = randomId, staleMs = STALE_MS, initialState, onState, onThrow,
    isScreen = () => false,
  } = opts;
  let state: RoomState = initialState ?? createRoom(code);

  const makeLobbyMsg = (s: RoomState): ServerMessage => ({
    t: 'lobby',
    p: {
      players: lobbyPlayers(s),
      phase: s.phase,
      selectedGame: s.selectedGame,
    },
  });

  const publish = (next: RoomState) => {
    if (next === state) return;
    state = next;
    onState?.(state);
    const players = lobbyPlayers(state);
    onLobby(players, state.phase, state.selectedGame);
    transport.broadcast(makeLobbyMsg(state));
  };

  const selectGame = (gameId: string) => {
    publish(applySelectGame(state, gameId));
  };

  const startGame = (gameId?: string): boolean => {
    const chosen = gameId ?? state.selectedGame ?? 'bowling';
    const r = applyStart(state, chosen);
    if (!r.ok) return false;
    publish(r.state);
    // Invia layout del gioco selezionato a tutti i controller
    transport.broadcast(layoutMsg(chosen));
    return true;
  };

  const layoutMsg = (gameId: string): ServerMessage => ({ t: 'layout', p: { gameId, layoutId: `${gameId}-play` } });
  const turnMsg = (): ServerMessage => ({ t: 'turn', p: { activeSlot: state.activeSlot ?? null } });

  const returnToLobby = () => {
    publish(applyReturnToLobby(state));
  };

  const setTurn = (activeSlot: SlotId | null) => {
    const next = applyTurn(state, activeSlot);
    if (next === state) return;
    state = next;
    onState?.(state);
    transport.broadcast(turnMsg());
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
        if (!changed) transport.sendTo(from, makeLobbyMsg(state));
        // telefono entrato (o rientrato) a partita in corso: gli si dà subito il gioco e il turno
        if (r.reply.t === 'welcome' && state.phase === 'playing' && state.selectedGame) {
          transport.sendTo(from, layoutMsg(state.selectedGame));
          transport.sendTo(from, turnMsg());
        }
        break;
      }
      case 'throw': {
        // solo il telefono del giocatore di turno può lanciare: gli altri vengono ignorati
        const slot = throwerSlot(state, from);
        if (!slot) break;
        setTurn(null); // un tiro alla volta: il prossimo lo riapre lo schermo
        onThrow?.(slot, { speed: msg.p.speed, spin: msg.p.spin, dir: msg.p.dir });
        break;
      }
      case 'turn':
        if (isScreen(from)) setTurn(msg.p.activeSlot);
        break;
      case 'end-game':
        if (isScreen(from)) returnToLobby();
        break;
      case 'profile':
        publish(applyProfile(state, from, msg.p));
        break;
      case 'select-game':
        selectGame(msg.p.gameId);
        break;
      case 'start':
        startGame(msg.p.gameId);
        break;
      case 'ready':
        // Notifica di layout pronto dal controller
        break;
      case 'ping': {
        const wasOffline = state.players.some((p) => p.connectionId === from && !p.connected);
        const next = applySeen(state, from, now());
        // il battito aggiorna solo lastSeen: si ripubblica la lobby solo se qualcuno torna online
        if (wasOffline) publish(next);
        else if (next !== state) {
          state = next;
          onState?.(state);
        }
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
    disconnect: (id) => publish(applyDisconnect(state, id)),
    players: () => lobbyPlayers(state),
    state: () => state,
    selectGame,
    startGame,
    returnToLobby,
    setTurn,
    close: () => {
      unsubscribe();
      transport.close();
    },
  };
}
