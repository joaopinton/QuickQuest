// Lo schermo crea la stanza e fa da host finché non esiste il relay Cloudflare.
import {
  createLocalHost, createRoomHost, generateRoomCode, HEARTBEAT_MS, type LobbyPlayer,
} from '@quickquest/protocol';
import { useEffect, useState } from 'preact/hooks';

export interface ScreenRoom {
  readonly code: string;
  readonly players: readonly LobbyPlayer[];
  readonly joinUrl: string;
}

export function joinUrlFor(code: string, origin: string = window.location.origin): string {
  return `${origin}/c/${code}`;
}

export function useScreenRoom(): ScreenRoom {
  const [code] = useState(generateRoomCode);
  const [players, setPlayers] = useState<readonly LobbyPlayer[]>([]);

  useEffect(() => {
    const host = createRoomHost({ code, transport: createLocalHost(code), onLobby: setPlayers });
    const timer = setInterval(() => host.tick(), HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      host.close();
    };
  }, [code]);

  return { code, players, joinUrl: joinUrlFor(code) };
}
