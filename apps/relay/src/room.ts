import { DurableObject } from 'cloudflare:workers';
import {
  createRoomHost, createRoom, decode, encode, isValidRoomCode, lobbyPlayers, randomId, rewritePoseSlot,
  type HostTransport, type RoomHost, type RoomState, type ServerMessage,
} from '@quickquest/protocol';
import type { Env } from './index';

type Role = 'screen' | 'controller';
interface Attachment {
  readonly id: string;
  readonly role: Role;
}

/** Una stanza inattiva per tanto tempo viene cancellata. */
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const STATE_KEY = 'state';

/**
 * Durable Object di una stanza (ADR-001). Riusa `createRoomHost`: il DO è l'host,
 * lo schermo è un osservatore/controller che riceve la lobby e può avviare giochi,
 * i telefoni parlano solo con il DO.
 * Con la WebSocket Hibernation API l'oggetto può essere scaricato dalla memoria:
 * lo stato della stanza sta nello storage SQLite, l'identità di ogni socket nell'attachment.
 */
export class Room extends DurableObject<Env> {
  private host: RoomHost | null = null;
  private listener: Parameters<HostTransport['onMessage']>[0] | null = null;

  private sockets(): { ws: WebSocket; a: Attachment }[] {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() as Attachment }));
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(encode(msg));
    } catch {
      // socket già chiusa: la pulizia arriva da webSocketClose
    }
  }

  private toScreens(msg: ServerMessage): void {
    this.sockets().filter((s) => s.a.role === 'screen').forEach((s) => this.send(s.ws, msg));
  }

  private transport(): HostTransport {
    return {
      onMessage: (cb) => {
        this.listener = cb;
        return () => { this.listener = null; };
      },
      sendTo: (to, msg) => this.sockets().filter((s) => s.a.id === to).forEach((s) => this.send(s.ws, msg)),
      broadcast: (msg) => this.sockets().forEach((s) => this.send(s.ws, msg)),
      close: () => {},
    };
  }

  /** Crea l'host (una volta per risveglio) partendo dallo stato salvato. */
  private async getHost(code: string): Promise<RoomHost | null> {
    if (this.host) return this.host;
    const stored = await this.ctx.storage.get<RoomState>(STATE_KEY);
    if (!stored) return null;
    this.host = createRoomHost({
      code,
      transport: this.transport(),
      onLobby: () => {},
      initialState: stored,
      onState: (s) => { void this.ctx.storage.put(STATE_KEY, s); },
      // il lancio del giocatore di turno va solo agli schermi, con lo slot timbrato dall'host
      onThrow: (slot, params) => this.toScreens({ t: 'throw', p: { ...params, slot } }),
      isScreen: (id) => this.sockets().some((s) => s.a.id === id && s.a.role === 'screen'),
    });
    return this.host;
  }

  private async touch(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = (url.pathname.split('/').pop() ?? '').toUpperCase();
    const role = url.searchParams.get('role') as Role;
    if (!isValidRoomCode(code)) return new Response('Bad request', { status: 400 });

    // La stanza nasce quando si collega uno schermo; i telefoni non la creano.
    if (role === 'screen' && !(await this.ctx.storage.get(STATE_KEY))) {
      await this.ctx.storage.put(STATE_KEY, createRoom(code));
    }

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    const attachment: Attachment = { id: randomId(), role };
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment(attachment);
    await this.touch();

    const host = await this.getHost(code);
    if (!host) {
      this.send(server, { t: 'error', p: { code: 'ROOM_NOT_FOUND' } });
      server.close(1008, 'ROOM_NOT_FOUND');
    } else if (role === 'screen') {
      const s = host.state();
      this.send(server, { t: 'lobby', p: { players: lobbyPlayers(s), phase: s.phase, selectedGame: s.selectedGame } });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment;
    const code = await this.codeFromStorage();
    if (!code) return;
    const host = await this.getHost(code);
    if (!host) return;

    if (typeof message !== 'string') {
      // Frame binario (posa): ammesso solo dai controller (docs/03 § 3.3)
      if (a.role !== 'controller') return;
      const player = host.state().players.find((p) => p.connectionId === a.id);
      if (!player) return;
      const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
      if (rewritePoseSlot(bytes, player.slot)) {
        // Inoltro diretto verso gli schermi
        this.sockets().filter((s) => s.a.role === 'screen').forEach((s) => {
          try { s.ws.send(bytes); } catch {}
        });
      }
      await this.touch();
      return;
    }

    this.listener?.(a.id, decode(message));
    await this.touch();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onGone(ws);
  }

  private async onGone(ws: WebSocket): Promise<void> {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (!a || a.role !== 'controller') return;
    const code = await this.codeFromStorage();
    if (code) (await this.getHost(code))?.disconnect(a.id);
  }

  private async codeFromStorage(): Promise<string | null> {
    return (await this.ctx.storage.get<RoomState>(STATE_KEY))?.code ?? null;
  }

  override async alarm(): Promise<void> {
    this.sockets().forEach((s) => s.ws.close(1001, 'ROOM_EXPIRED'));
    this.host = null;
    await this.ctx.storage.deleteAll();
  }
}
