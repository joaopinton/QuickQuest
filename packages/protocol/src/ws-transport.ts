// Trasporto WebSocket verso il relay Cloudflare (ADR-001/007): riconnessione con backoff,
// coda limitata per i messaggi inviati mentre la socket è giù.

import { decode, encode, type ServerMessage } from './messages';
import { randomId, type ClientTransport } from './transport';

export const WS_MIN_DELAY_MS = 250;
export const WS_MAX_DELAY_MS = 4000;
export const WS_MAX_QUEUE = 64;

export type Role = 'screen' | 'controller';

export interface WsClientTransport extends ClientTransport {
  /** Chiamato a ogni (ri)apertura della socket: il telefono rimanda `hello`. */
  onOpen(cb: (isReconnect: boolean) => void): () => void;
}

export function relayUrl(code: string, role: Role, loc: { protocol: string; host: string } = location): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/ws/room/${code}?role=${role}`;
}

export function createWsClient(url: string, id: string = randomId()): WsClientTransport {
  const messageListeners = new Set<(m: ServerMessage) => void>();
  const openListeners = new Set<(isReconnect: boolean) => void>();
  const queue: string[] = [];
  let socket: WebSocket | null = null;
  let attempt = 0;
  let opened = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener('open', () => {
      const isReconnect = opened;
      opened = true;
      attempt = 0;
      openListeners.forEach((cb) => cb(isReconnect));
      queue.splice(0).forEach((raw) => ws.send(raw));
    });
    ws.addEventListener('message', (ev: MessageEvent) => {
      const res = decode(ev.data);
      if (res.ok) messageListeners.forEach((cb) => cb(res.msg as ServerMessage));
    });
    ws.addEventListener('close', () => {
      if (closed) return;
      const delay = Math.min(WS_MAX_DELAY_MS, WS_MIN_DELAY_MS * 2 ** attempt++) * (0.75 + Math.random() * 0.5);
      timer = setTimeout(connect, delay);
    });
  };
  connect();

  return {
    id,
    send(msg) {
      const raw = encode(msg);
      if (socket?.readyState === WebSocket.OPEN) socket.send(raw);
      else if (queue.length < WS_MAX_QUEUE) queue.push(raw);
    },
    onMessage(cb) {
      messageListeners.add(cb);
      return () => messageListeners.delete(cb);
    },
    onOpen(cb) {
      openListeners.add(cb);
      return () => openListeners.delete(cb);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}
