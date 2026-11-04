// Astrazione del trasporto (ADR-007): oggi BroadcastChannel tra schede, domani PartySocket.

import type { ControllerMessage, DecodeResult, ServerMessage } from './messages';
import { decode, encode } from './messages';

/** Lato telefono. */
export interface ClientTransport {
  readonly id: string;
  send(msg: ControllerMessage): void;
  onMessage(cb: (msg: ServerMessage) => void): () => void;
  close(): void;
}

/** Lato host della stanza (oggi lo schermo, domani il Durable Object). */
export interface HostTransport {
  onMessage(cb: (from: string, result: DecodeResult) => void): () => void;
  sendTo(to: string, msg: ServerMessage): void;
  broadcast(msg: ServerMessage): void;
  close(): void;
}

// ---------- implementazione locale con BroadcastChannel ----------

export interface ChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  close(): void;
}
export type ChannelFactory = (name: string) => ChannelLike;

const defaultFactory: ChannelFactory = (name) => new BroadcastChannel(name);
const channelName = (code: string) => `quickquest:${code}`;
export const HOST_ID = 'host';
const ALL = '*';

interface Packet {
  readonly from: string;
  readonly to: string;
  readonly data: string;
}

const isPacket = (x: unknown): x is Packet => typeof x === 'object' && x !== null
  && typeof (x as Packet).from === 'string' && typeof (x as Packet).to === 'string' && typeof (x as Packet).data === 'string';

/** Id casuale di 24 caratteri base64url, usato per connessioni e token di sessione. */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createLocalHost(code: string, factory: ChannelFactory = defaultFactory): HostTransport {
  const ch = factory(channelName(code));
  const post = (to: string, msg: ServerMessage) => ch.postMessage({ from: HOST_ID, to, data: encode(msg) } satisfies Packet);
  return {
    onMessage(cb) {
      const handler = (ev: MessageEvent) => {
        if (!isPacket(ev.data) || ev.data.to !== HOST_ID) return;
        cb(ev.data.from, decode(ev.data.data));
      };
      ch.addEventListener('message', handler);
      return () => ch.removeEventListener('message', handler);
    },
    sendTo: post,
    broadcast: (msg) => post(ALL, msg),
    close: () => ch.close(),
  };
}

export function createLocalClient(code: string, factory: ChannelFactory = defaultFactory, id: string = randomId()): ClientTransport {
  const ch = factory(channelName(code));
  return {
    id,
    send: (msg) => ch.postMessage({ from: id, to: HOST_ID, data: encode(msg) } satisfies Packet),
    onMessage(cb) {
      const handler = (ev: MessageEvent) => {
        if (!isPacket(ev.data) || ev.data.from !== HOST_ID || (ev.data.to !== id && ev.data.to !== ALL)) return;
        const res = decode(ev.data.data);
        if (res.ok) cb(res.msg as ServerMessage);
      };
      ch.addEventListener('message', handler);
      return () => ch.removeEventListener('message', handler);
    },
    close: () => ch.close(),
  };
}
