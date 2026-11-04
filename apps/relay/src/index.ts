import { isValidRoomCode } from '@quickquest/protocol';

export { Room } from './room';

export interface Env {
  ROOM: DurableObjectNamespace;
}

const WS_PATH = /^\/ws\/room\/([^/]+)$/;

/** Instrada `/ws/room/<CODICE>?role=screen|controller` al Durable Object della stanza. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = WS_PATH.exec(url.pathname);
    if (!match) return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    const code = (match[1] ?? '').toUpperCase();
    const role = url.searchParams.get('role');
    if (!isValidRoomCode(code) || (role !== 'screen' && role !== 'controller')) {
      return new Response('Bad request', { status: 400 });
    }
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
