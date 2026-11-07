// Messaggi del core (docs/03 § 3). Envelope { v, t, p } con validazione scritta a mano:
// niente librerie di schema, per tenere leggero il bundle del controller.

/** 2: il profilo porta nome e aspetto completo del Piggy (prima solo colore e accessorio). */
export const PROTOCOL_VERSION = 2;

export type SlotId = 'P1' | 'P2' | 'P3' | 'P4';
export const SLOT_IDS: readonly SlotId[] = ['P1', 'P2', 'P3', 'P4'];

export type Platform = 'ios' | 'android' | 'altro';

export interface Capabilities {
  readonly gyro: boolean;
  readonly accel: boolean;
  readonly hz: number;
  readonly platform: Platform;
}

/** Aspetto e nome del Piggy scelti sul telefono (packages/ui `look.ts`). */
export interface Profile {
  /** Nome scelto, 0–12 caratteri (vuoto = "Piggy N" sullo schermo). */
  readonly name: string;
  readonly color: string;
  readonly color2: string;
  readonly pattern: string;
  readonly eyes: string;
  readonly mouth: string;
  readonly hat: string;
  readonly face: string;
  readonly neck: string;
}

export const PROFILE_NAME_MAX = 12;

export type PlayerState = 'connecting' | 'ready' | 'disconnected';

export interface LobbyPlayer {
  readonly slot: SlotId;
  readonly state: PlayerState;
  readonly profile: Profile | null;
}

export type ErrorCode = 'ROOM_FULL' | 'ROOM_NOT_FOUND' | 'UNSUPPORTED_DEVICE' | 'BAD_MESSAGE' | 'VERSION_MISMATCH' | 'KICKED';

export type RoomPhase = 'lobby' | 'starting' | 'playing';

/**
 * Evento di gioco generico, riconosciuto sul telefono (ADR-002) e interpretato dallo schermo.
 * `kind` dice cosa è successo (es. `shot`), `data` porta i numeri: niente oggetti annidati.
 */
export interface GameEvent {
  readonly kind: string;
  readonly data: Readonly<Record<string, number | string | boolean>>;
}

/** Feedback che lo schermo chiede a un telefono (o a tutti): vibrazione o click, e un testo breve. */
export type CueKind = 'tap' | 'select' | 'success' | 'error';
export const CUE_KINDS: readonly CueKind[] = ['tap', 'select', 'success', 'error'];

export interface Cue {
  readonly kind: CueKind;
  readonly text?: string;
}

/** Messaggi dal controller. */
export type ControllerMessage =
  | { t: 'hello'; p: { sessionToken: string | null; capabilities: Capabilities } }
  | { t: 'profile'; p: Profile }
  | { t: 'ping'; p: { at: number } }
  | { t: 'ready'; p: { layoutId: string } }
  | { t: 'select-game'; p: { gameId: string } }
  | { t: 'start'; p: { gameId: string } }
  | { t: 'game-event'; p: { gameId: string; e: GameEvent } }
  /** Solo dallo schermo (relay): feedback per un telefono (`slot`) o per tutti (`null`). */
  | { t: 'cue'; p: Cue & { slot: SlotId | null } }
  /** Solo dallo schermo (relay): chi deve tirare adesso, `null` se nessuno. */
  | { t: 'turn'; p: { activeSlot: SlotId | null } }
  /** Solo dallo schermo (relay): fine partita, tutti tornano in lobby. */
  | { t: 'end-game'; p: Record<string, never> }
  /** Solo dallo schermo (relay): toglie un giocatore dalla stanza. */
  | { t: 'kick'; p: { slot: SlotId } }
  | { t: 'bye'; p: Record<string, never> };

/** Messaggi verso il controller o lo schermo. */
export type ServerMessage =
  | { t: 'welcome'; p: { slot: SlotId; sessionToken: string } }
  | { t: 'lobby'; p: { players: readonly LobbyPlayer[]; phase?: RoomPhase; selectedGame?: string | null } }
  | { t: 'select-game'; p: { gameId: string } }
  | { t: 'start'; p: { gameId: string } }
  | { t: 'layout'; p: { gameId: string; layoutId: string; params?: Record<string, unknown> } }
  | { t: 'turn'; p: { activeSlot: SlotId | null } }
  /** Evento di gioco inoltrato allo schermo, con lo slot timbrato dall'host. */
  | { t: 'game-event'; p: { gameId: string; e: GameEvent; slot?: SlotId } }
  /** Feedback dallo schermo, consegnato al telefono. */
  | { t: 'cue'; p: Cue & { slot: SlotId | null } }
  | { t: 'pong'; p: { at: number } }
  | { t: 'error'; p: { code: ErrorCode } };

export type Message = ControllerMessage | ServerMessage;
export type Envelope<M extends Message = Message> = { v: typeof PROTOCOL_VERSION } & M;

export const MAX_MESSAGE_BYTES = 2048;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ACCESSORY = /^[a-z]{1,16}$/;
/** Lettere (anche accentate), cifre, spazi e poca punteggiatura: niente markup né controlli. */
const NAME = /^[\p{L}\p{N} '._-]*$/u;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const ID_REGEX = /^[a-z0-9_-]{1,32}$/;

export function encode(msg: Message): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...msg });
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const isSlot = (x: unknown): x is SlotId => typeof x === 'string' && (SLOT_IDS as readonly string[]).includes(x);

function isCapabilities(x: unknown): x is Capabilities {
  return isObj(x) && typeof x.gyro === 'boolean' && typeof x.accel === 'boolean'
    && typeof x.hz === 'number' && Number.isFinite(x.hz) && x.hz >= 0 && x.hz < 1000
    && (x.platform === 'ios' || x.platform === 'android' || x.platform === 'altro');
}

const isHex = (x: unknown): x is string => typeof x === 'string' && HEX.test(x);
const isToken = (x: unknown): x is string => typeof x === 'string' && ACCESSORY.test(x);

export function isProfile(x: unknown): x is Profile {
  return isObj(x)
    && typeof x.name === 'string' && Array.from(x.name).length <= PROFILE_NAME_MAX && NAME.test(x.name)
    && isHex(x.color) && isHex(x.color2)
    && isToken(x.pattern) && isToken(x.eyes) && isToken(x.mouth)
    && isToken(x.hat) && isToken(x.face) && isToken(x.neck);
}

const MAX_EVENT_FIELDS = 16;
const MAX_EVENT_TEXT = 32;
const MAX_CUE_TEXT = 80;

export function isGameEvent(x: unknown): x is GameEvent {
  if (!isObj(x) || typeof x.kind !== 'string' || !ID_REGEX.test(x.kind) || !isObj(x.data)) return false;
  const entries = Object.entries(x.data);
  return entries.length <= MAX_EVENT_FIELDS && entries.every(([k, v]) => /^[a-zA-Z][a-zA-Z0-9]{0,23}$/.test(k)
    && (isNum(v, -1e6, 1e6) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= MAX_EVENT_TEXT)));
}

function isCue(x: Obj): boolean {
  return typeof x.kind === 'string' && (CUE_KINDS as readonly string[]).includes(x.kind)
    && (x.text === undefined || (typeof x.text === 'string' && x.text.length <= MAX_CUE_TEXT))
    && (x.slot === null || isSlot(x.slot));
}

function isLobbyPlayer(x: unknown): x is LobbyPlayer {
  return isObj(x) && isSlot(x.slot)
    && (x.state === 'connecting' || x.state === 'ready' || x.state === 'disconnected')
    && (x.profile === null || isProfile(x.profile));
}

function validPayload(t: string, p: unknown): boolean {
  if (!isObj(p)) return false;
  switch (t) {
    case 'hello':
      return (p.sessionToken === null || (typeof p.sessionToken === 'string' && TOKEN.test(p.sessionToken)))
        && isCapabilities(p.capabilities);
    case 'profile':
      return isProfile(p);
    case 'ping':
    case 'pong':
      return typeof p.at === 'number' && Number.isFinite(p.at);
    case 'bye':
    case 'end-game':
      return true;
    case 'game-event':
      return typeof p.gameId === 'string' && ID_REGEX.test(p.gameId) && isGameEvent(p.e)
        && (p.slot === undefined || isSlot(p.slot));
    case 'cue':
      return isCue(p);
    case 'welcome':
      return isSlot(p.slot) && typeof p.sessionToken === 'string' && TOKEN.test(p.sessionToken);
    case 'lobby':
      return Array.isArray(p.players) && p.players.length <= 4 && p.players.every(isLobbyPlayer)
        && (p.phase === undefined || p.phase === 'lobby' || p.phase === 'starting' || p.phase === 'playing')
        && (p.selectedGame === undefined || p.selectedGame === null || (typeof p.selectedGame === 'string' && ID_REGEX.test(p.selectedGame)));
    case 'select-game':
    case 'start':
      return typeof p.gameId === 'string' && ID_REGEX.test(p.gameId);
    case 'ready':
      return typeof p.layoutId === 'string' && ID_REGEX.test(p.layoutId);
    case 'layout':
      return typeof p.gameId === 'string' && ID_REGEX.test(p.gameId)
        && typeof p.layoutId === 'string' && ID_REGEX.test(p.layoutId)
        && (p.params === undefined || isObj(p.params));
    case 'turn':
      return p.activeSlot === null || isSlot(p.activeSlot);
    case 'kick':
      return isSlot(p.slot);
    case 'error':
      return typeof p.code === 'string'
        && ['ROOM_FULL', 'ROOM_NOT_FOUND', 'UNSUPPORTED_DEVICE', 'BAD_MESSAGE', 'VERSION_MISMATCH', 'KICKED'].includes(p.code);
    default:
      return false;
  }
}

export type DecodeResult =
  | { ok: true; msg: Message }
  | { ok: false; code: 'BAD_MESSAGE' | 'VERSION_MISMATCH' };

/** Decodifica e valida un messaggio ricevuto. Non lancia mai eccezioni. */
export function decode(raw: unknown): DecodeResult {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return { ok: false, code: 'BAD_MESSAGE' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'BAD_MESSAGE' };
  }
  if (!isObj(data) || typeof data.t !== 'string') return { ok: false, code: 'BAD_MESSAGE' };
  if (data.v !== PROTOCOL_VERSION) return { ok: false, code: 'VERSION_MISMATCH' };
  if (!validPayload(data.t, data.p)) return { ok: false, code: 'BAD_MESSAGE' };
  return { ok: true, msg: { t: data.t, p: data.p } as Message };
}
