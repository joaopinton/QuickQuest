// Messaggi del core (docs/03 § 3). Envelope { v, t, p } con validazione scritta a mano:
// niente librerie di schema, per tenere leggero il bundle del controller.

export const PROTOCOL_VERSION = 1;

export type SlotId = 'P1' | 'P2' | 'P3' | 'P4';
export const SLOT_IDS: readonly SlotId[] = ['P1', 'P2', 'P3', 'P4'];

export type Platform = 'ios' | 'android' | 'altro';

export interface Capabilities {
  readonly gyro: boolean;
  readonly accel: boolean;
  readonly hz: number;
  readonly platform: Platform;
}

export interface Profile {
  readonly color: string;
  readonly accessory: string;
}

export type PlayerState = 'connecting' | 'ready' | 'disconnected';

export interface LobbyPlayer {
  readonly slot: SlotId;
  readonly state: PlayerState;
  readonly profile: Profile | null;
}

export type ErrorCode = 'ROOM_FULL' | 'ROOM_NOT_FOUND' | 'UNSUPPORTED_DEVICE' | 'BAD_MESSAGE' | 'VERSION_MISMATCH';

export type RoomPhase = 'lobby' | 'starting' | 'playing';

/** Messaggi dal controller. */
export type ControllerMessage =
  | { t: 'hello'; p: { sessionToken: string | null; capabilities: Capabilities } }
  | { t: 'profile'; p: Profile }
  | { t: 'ping'; p: { at: number } }
  | { t: 'ready'; p: { layoutId: string } }
  | { t: 'select-game'; p: { gameId: string } }
  | { t: 'start'; p: { gameId: string } }
  | { t: 'bye'; p: Record<string, never> };

/** Messaggi verso il controller o lo schermo. */
export type ServerMessage =
  | { t: 'welcome'; p: { slot: SlotId; sessionToken: string } }
  | { t: 'lobby'; p: { players: readonly LobbyPlayer[]; phase?: RoomPhase; selectedGame?: string | null } }
  | { t: 'select-game'; p: { gameId: string } }
  | { t: 'start'; p: { gameId: string } }
  | { t: 'layout'; p: { gameId: string; layoutId: string; params?: Record<string, unknown> } }
  | { t: 'turn'; p: { activeSlot: SlotId } }
  | { t: 'pong'; p: { at: number } }
  | { t: 'error'; p: { code: ErrorCode } };

export type Message = ControllerMessage | ServerMessage;
export type Envelope<M extends Message = Message> = { v: typeof PROTOCOL_VERSION } & M;

export const MAX_MESSAGE_BYTES = 2048;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ACCESSORY = /^[a-z]{1,16}$/;
const TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const ID_REGEX = /^[a-z0-9_-]{1,32}$/;

export function encode(msg: Message): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, ...msg });
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isSlot = (x: unknown): x is SlotId => typeof x === 'string' && (SLOT_IDS as readonly string[]).includes(x);

function isCapabilities(x: unknown): x is Capabilities {
  return isObj(x) && typeof x.gyro === 'boolean' && typeof x.accel === 'boolean'
    && typeof x.hz === 'number' && Number.isFinite(x.hz) && x.hz >= 0 && x.hz < 1000
    && (x.platform === 'ios' || x.platform === 'android' || x.platform === 'altro');
}

export function isProfile(x: unknown): x is Profile {
  return isObj(x) && typeof x.color === 'string' && HEX.test(x.color)
    && typeof x.accessory === 'string' && ACCESSORY.test(x.accessory);
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
      return true;
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
      return isSlot(p.activeSlot);
    case 'error':
      return typeof p.code === 'string'
        && ['ROOM_FULL', 'ROOM_NOT_FOUND', 'UNSUPPORTED_DEVICE', 'BAD_MESSAGE', 'VERSION_MISMATCH'].includes(p.code);
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
