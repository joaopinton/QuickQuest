// Stato della stanza come reducer puro. Lo usa oggi l'host locale (schermo) e domani il
// Durable Object "Room" (ADR-001): stessa logica, trasporto diverso.

import type { Capabilities, LobbyPlayer, Profile, RoomPhase, ServerMessage, SlotId } from './messages';
import { SLOT_IDS } from './messages';

export interface RoomPlayer {
  readonly slot: SlotId;
  readonly sessionToken: string;
  readonly connectionId: string | null;
  readonly connected: boolean;
  readonly profile: Profile | null;
  readonly lastSeen: number;
}

export interface RoomState {
  readonly code: string;
  readonly phase: RoomPhase;
  readonly selectedGame: string | null;
  readonly players: readonly RoomPlayer[];
  /** Giocatore che può lanciare adesso (deciso dallo schermo); assente o null = nessuno. */
  readonly activeSlot?: SlotId | null;
}

export interface HelloInput {
  readonly connectionId: string;
  readonly sessionToken: string | null;
  readonly capabilities: Capabilities;
  readonly now: number;
  readonly makeToken: () => string;
}

export interface Reduction {
  readonly state: RoomState;
  readonly reply: ServerMessage;
}

const freeze = <T>(items: T[]): readonly T[] => Object.freeze(items);

export function createRoom(code: string): RoomState {
  return { code, phase: 'lobby', selectedGame: null, players: freeze([]) };
}

function updatePlayer(state: RoomState, match: (p: RoomPlayer) => boolean, patch: Partial<RoomPlayer>): RoomState {
  if (!state.players.some(match)) return state;
  return { ...state, players: freeze(state.players.map((p) => (match(p) ? { ...p, ...patch } : p))) };
}

/** Ingresso o rientro di un controller (docs/03 § 6). */
export function applyHello(state: RoomState, input: HelloInput): Reduction {
  const { connectionId, sessionToken, capabilities, now, makeToken } = input;
  if (!capabilities.gyro || !capabilities.accel) {
    return { state, reply: { t: 'error', p: { code: 'UNSUPPORTED_DEVICE' } } };
  }
  // stesso token, oppure stessa connessione che ripete hello (doppio tap, nessun sessionStorage)
  const returning = state.players.find((p) => (sessionToken !== null && p.sessionToken === sessionToken) || p.connectionId === connectionId);
  if (returning) {
    const next = updatePlayer(state, (p) => p === returning, { connectionId, connected: true, lastSeen: now });
    return { state: next, reply: { t: 'welcome', p: { slot: returning.slot, sessionToken: returning.sessionToken } } };
  }
  // Stanza piena: si libera lo slot del giocatore disconnesso da più tempo (chi chiude la scheda
  // senza "bye" perde il token con sessionStorage e non potrebbe mai tornare).
  const abandoned = state.players.length >= SLOT_IDS.length
    ? [...state.players].filter((p) => !p.connected).sort((a, b) => a.lastSeen - b.lastSeen)[0]
    : undefined;
  const kept = abandoned ? state.players.filter((p) => p !== abandoned) : state.players;
  const taken = new Set(kept.map((p) => p.slot));
  const slot = SLOT_IDS.find((s) => !taken.has(s));
  if (!slot) return { state, reply: { t: 'error', p: { code: 'ROOM_FULL' } } };
  const player: RoomPlayer = { slot, sessionToken: makeToken(), connectionId, connected: true, profile: null, lastSeen: now };
  return {
    state: { ...state, players: freeze([...kept, player]) },
    reply: { t: 'welcome', p: { slot, sessionToken: player.sessionToken } },
  };
}

const byConnection = (id: string) => (p: RoomPlayer) => p.connectionId === id;

export function applyProfile(state: RoomState, connectionId: string, profile: Profile): RoomState {
  return updatePlayer(state, byConnection(connectionId), { profile });
}

export function applySeen(state: RoomState, connectionId: string, now: number): RoomState {
  return updatePlayer(state, byConnection(connectionId), { lastSeen: now, connected: true });
}

/** Connessione persa: lo slot resta riservato per il rientro. */
export function applyDisconnect(state: RoomState, connectionId: string): RoomState {
  return updatePlayer(state, byConnection(connectionId), { connected: false, connectionId: null });
}

/** Uscita esplicita: lo slot si libera. */
export function applyLeave(state: RoomState, connectionId: string): RoomState {
  if (!state.players.some(byConnection(connectionId))) return state;
  return { ...state, players: freeze(state.players.filter((p) => p.connectionId !== connectionId)) };
}

/** Lo schermo toglie un giocatore: lo slot si libera e il suo token non vale più. */
export function applyKick(state: RoomState, slot: SlotId): { state: RoomState; connectionId: string | null } {
  const player = state.players.find((p) => p.slot === slot);
  if (!player) return { state, connectionId: null };
  const players = freeze(state.players.filter((p) => p.slot !== slot));
  const activeSlot = state.activeSlot === slot ? null : state.activeSlot;
  return { state: { ...state, players, activeSlot }, connectionId: player.connectionId };
}

/** Segna disconnessi i giocatori che non si fanno sentire da più di `timeoutMs`. */
export function expireStale(state: RoomState, now: number, timeoutMs: number): RoomState {
  const stale = (p: RoomPlayer) => p.connected && now - p.lastSeen > timeoutMs;
  if (!state.players.some(stale)) return state;
  // connectionId resta: se il telefono torna a battere, il ping lo rimette online.
  return { ...state, players: freeze(state.players.map((p) => (stale(p) ? { ...p, connected: false } : p))) };
}

/** Scelta del gioco dalla lobby. */
export function applySelectGame(state: RoomState, gameId: string): RoomState {
  return { ...state, selectedGame: gameId };
}

/** Avvio della partita: richiede almeno un giocatore pronto. */
export function applyStart(state: RoomState, gameId?: string): { state: RoomState; ok: boolean; error?: string } {
  const targetGame = gameId ?? state.selectedGame;
  if (!targetGame) {
    return { state, ok: false, error: 'NO_GAME_SELECTED' };
  }
  const readyPlayers = state.players.filter((p) => p.connected && p.profile !== null);
  if (readyPlayers.length === 0) {
    return { state, ok: false, error: 'NO_READY_PLAYERS' };
  }
  return {
    state: {
      ...state,
      phase: 'playing',
      selectedGame: targetGame,
      activeSlot: null,
    },
    ok: true,
  };
}

/** Ritorno alla lobby a fine partita o interruzione. */
export function applyReturnToLobby(state: RoomState): RoomState {
  return {
    ...state,
    phase: 'lobby',
    activeSlot: null,
  };
}

/** Lo schermo indica chi è di turno: solo quel telefono potrà lanciare. */
export function applyTurn(state: RoomState, activeSlot: SlotId | null): RoomState {
  if ((state.activeSlot ?? null) === activeSlot) return state;
  return { ...state, activeSlot };
}

/**
 * Chi può mandare un evento di gioco: un giocatore della partita in corso. Se lo schermo ha
 * indicato un turno, solo il giocatore di turno; se il turno è libero (`null`), chiunque.
 */
export function gameEventSlot(state: RoomState, connectionId: string): SlotId | null {
  if (state.phase !== 'playing') return null;
  const player = state.players.find(byConnection(connectionId));
  if (!player) return null;
  if (state.activeSlot && player.slot !== state.activeSlot) return null;
  return player.slot;
}

/** Connessioni a cui consegnare un messaggio per uno slot (o per tutti i giocatori). */
export function connectionsFor(state: RoomState, slot: SlotId | null): string[] {
  return state.players
    .filter((p) => p.connected && p.connectionId !== null && (slot === null || p.slot === slot))
    .map((p) => p.connectionId as string);
}

/** Vista della lobby da mandare allo schermo e ai controller. */
export function lobbyPlayers(state: RoomState): LobbyPlayer[] {
  return [...state.players]
    .sort((a, b) => a.slot.localeCompare(b.slot))
    .map((p) => ({
      slot: p.slot,
      state: !p.connected ? 'disconnected' : p.profile ? 'ready' : 'connecting',
      profile: p.profile,
    }));
}
