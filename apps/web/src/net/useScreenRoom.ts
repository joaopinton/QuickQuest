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
  type SlotId,
  type ThrowParams,
  type WsClientTransport,
} from '@quickquest/protocol';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
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
  /** Chi può lanciare adesso dal proprio telefono (`null` = nessuno). */
  setActiveSlot(slot: SlotId | null): void;
  /** Lanci fatti col gesto dal telefono del giocatore di turno. */
  onThrow(cb: ThrowListener): () => void;
}

export type ThrowListener = (slot: SlotId, params: ThrowParams) => void;

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
  const throwListeners = useRef(new Set<ThrowListener>());
  const emitThrow: ThrowListener = (slot, params) => throwListeners.current.forEach((cb) => cb(slot, params));

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
        } else if (m.t === 'throw' && m.p.slot) {
          emitThrow(m.p.slot, { speed: m.p.speed, spin: m.p.spin, dir: m.p.dir });
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
      onThrow: emitThrow,
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
    } else if (wsRef.current) {
      // senza questo il relay resterebbe "in partita": telefoni bloccati e schermo riportato in gioco
      wsRef.current.send({ t: 'end-game', p: {} });
    }
  };

  const setActiveSlot = (slot: SlotId | null) => {
    if (hostRef.current) hostRef.current.setTurn(slot);
    else wsRef.current?.send({ t: 'turn', p: { activeSlot: slot } });
  };

  // identità stabile: chi si iscrive non deve ri-iscriversi a ogni render
  const onThrow = useCallback((cb: ThrowListener) => {
    throwListeners.current.add(cb);
    return () => { throwListeners.current.delete(cb); };
  }, []);

  return {
    code,
    players,
    phase,
    selectedGame,
    joinUrl: joinUrlFor(code),
    selectGame,
    startGame,
    returnToLobby,
    setActiveSlot,
    onThrow,
  };
}
