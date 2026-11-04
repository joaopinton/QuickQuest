// Lo schermo crea la stanza e fa da host finché non esiste il relay Cloudflare.
import {
  createLocalHost,
  createRoomHost,
  createWsClient,
  generateRoomCode,
  HEARTBEAT_MS,
  relayUrl,
  type LobbyPlayer,
  type RoomHost,
  type RoomPhase,
  type WsClientTransport,
} from '@quickquest/protocol';
import { useEffect, useRef, useState } from 'preact/hooks';
import { usesRelay } from './controllerConnection';

export interface ScreenRoom {
  readonly code: string;
  readonly players: readonly LobbyPlayer[];
  readonly phase: RoomPhase;
  readonly selectedGame: string | null;
  readonly joinUrl: string;
  selectGame(gameId: string): void;
  startGame(gameId?: string): boolean;
  returnToLobby(): void;
}

export function joinUrlFor(code: string, origin: string = window.location.origin): string {
  return `${origin}/c/${code}`;
}

export function useScreenRoom(): ScreenRoom {
  const [code] = useState(generateRoomCode);
  const [players, setPlayers] = useState<readonly LobbyPlayer[]>([]);
  const [phase, setPhase] = useState<RoomPhase>('lobby');
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const hostRef = useRef<RoomHost | null>(null);
  const wsRef = useRef<WsClientTransport | null>(null);

  useEffect(() => {
    if (usesRelay) {
      // il Durable Object è l'host: lo schermo apre la stanza e riceve la lobby
      const link = createWsClient(relayUrl(code, 'screen'));
      wsRef.current = link;
      const off = link.onMessage((m) => {
        if (m.t === 'lobby') {
          setPlayers(m.p.players);
          if (m.p.phase) setPhase(m.p.phase);
          if (m.p.selectedGame !== undefined) setSelectedGame(m.p.selectedGame);
        }
      });
      return () => {
        off();
        link.close();
        wsRef.current = null;
      };
    }
    const host = createRoomHost({
      code,
      transport: createLocalHost(code),
      onLobby: (p, ph, sg) => {
        setPlayers(p);
        if (ph) setPhase(ph);
        if (sg !== undefined) setSelectedGame(sg ?? null);
      },
    });
    hostRef.current = host;
    const timer = setInterval(() => host.tick(), HEARTBEAT_MS);
    return () => {
      clearInterval(timer);
      host.close();
      hostRef.current = null;
    };
  }, [code]);

  const selectGame = (gameId: string) => {
    setSelectedGame(gameId);
    if (hostRef.current) {
      hostRef.current.selectGame(gameId);
    } else if (wsRef.current) {
      wsRef.current.send({ t: 'select-game', p: { gameId } });
    }
  };

  const startGame = (gameId?: string): boolean => {
    const chosen = gameId ?? selectedGame ?? 'bowling';
    setSelectedGame(chosen);
    if (hostRef.current) {
      return hostRef.current.startGame(chosen);
    } else if (wsRef.current) {
      wsRef.current.send({ t: 'start', p: { gameId: chosen } });
      return true;
    }
    return false;
  };

  const returnToLobby = () => {
    setPhase('lobby');
    if (hostRef.current) {
      hostRef.current.returnToLobby();
    }
  };

  return {
    code,
    players,
    phase,
    selectedGame,
    joinUrl: joinUrlFor(code),
    selectGame,
    startGame,
    returnToLobby,
  };
}
