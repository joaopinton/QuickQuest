// Connessione del telefono alla stanza. Senza risposta dall'host entro 1,5 s si passa in demo:
// succede con un telefono vero finché il relay Cloudflare non esiste (il trasporto è locale).
import {
  createLocalClient, createWsClient, HEARTBEAT_MS, relayUrl, type Capabilities, type ClientTransport, type ErrorCode, type LobbyPlayer,
  type Profile, type RoomPhase, type ServerMessage, type WsClientTransport, type SlotId,
  type Cue, type GameEvent,
} from '@quickquest/protocol';

export const JOIN_TIMEOUT_MS = 1500;
/** Dopo 3 battiti senza pong lo schermo si considera perso. */
export const HOST_LOST_MS = HEARTBEAT_MS * 3;

export type JoinResult =
  | { readonly ok: true; readonly mode: 'live' | 'demo'; readonly slot: SlotId }
  | { readonly ok: false; readonly code: ErrorCode };

export type LinkStatus =
  | { readonly mode: 'live'; readonly slot: SlotId }
  | { readonly mode: 'demo'; readonly slot: SlotId }
  | { readonly mode: 'lost'; readonly slot: SlotId };

export interface ControllerLayoutInfo {
  readonly gameId: string;
  readonly layoutId: string;
  readonly params?: Record<string, unknown>;
}

export interface ControllerConnection {
  join(capabilities: Capabilities): Promise<JoinResult>;
  sendProfile(profile: Profile): void;
  sendReady(layoutId: string): void;
  /** Evento di un gioco sul contratto modulo (games/contract.ts). */
  sendGameEvent(gameId: string, e: GameEvent): void;
  /** Feedback chiesto dallo schermo (vibrazione/click e testo). */
  onCue(cb: (cue: Cue) => void): () => void;
  onLobby(cb: (players: readonly LobbyPlayer[], phase?: RoomPhase) => void): () => void;
  /** Cambio di turno: `activeSlot` è chi può lanciare adesso (`null` = nessuno). */
  onTurn(cb: (activeSlot: SlotId | null) => void): () => void;
  /** Tempo di andata e ritorno (ms) di ogni battito, per l'overlay di debug. */
  onRtt(cb: (rttMs: number) => void): () => void;
  onLayout(cb: (layout: ControllerLayoutInfo) => void): () => void;
  /** Cambi di stato dopo il join: benvenuto in ritardo (demo → live) o schermo perso. */
  onStatus(cb: (s: LinkStatus) => void): () => void;
  /** Lo schermo ci ha tolto dalla stanza: la connessione è già chiusa e il token dimenticato. */
  onKicked(cb: () => void): () => void;
  leave(): void;
  close(): void;
}

const tokenKey = (code: string) => `qq:token:${code}`;

function readToken(code: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

function writeToken(code: string, token: string | null): void {
  try {
    if (token) sessionStorage.setItem(tokenKey(code), token);
    else sessionStorage.removeItem(tokenKey(code));
  } catch {
    // storage non disponibile (navigazione privata): il rientro automatico non funzionerà
  }
}

/** Trasporto che non porta da nessuna parte: per i browser senza BroadcastChannel (iOS < 15.4). */
const nullTransport: ClientTransport = { id: 'none', send: () => {}, onMessage: () => () => {}, close: () => {} };

/** In produzione (o con VITE_RELAY=1) il telefono parla con il relay Cloudflare. */
export const usesRelay = import.meta.env.PROD || import.meta.env.VITE_RELAY === '1';

function defaultTransport(code: string): ClientTransport {
  try {
    return usesRelay ? createWsClient(relayUrl(code, 'controller')) : createLocalClient(code);
  } catch {
    return nullTransport;
  }
}

export function createControllerConnection(code: string, transport: ClientTransport = defaultTransport(code)): ControllerConnection {
  const lobbyListeners = new Set<(players: readonly LobbyPlayer[], phase?: RoomPhase) => void>();
  const turnListeners = new Set<(activeSlot: SlotId | null) => void>();
  const rttListeners = new Set<(rttMs: number) => void>();
  const cueListeners = new Set<(cue: Cue) => void>();
  const layoutListeners = new Set<(layout: ControllerLayoutInfo) => void>();
  const statusListeners = new Set<(s: LinkStatus) => void>();
  const kickedListeners = new Set<() => void>();
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let mode: 'live' | 'demo' | 'lost' | null = null;
  let slot: SlotId = 'P1';
  let lastProfile: Profile | null = null;
  let lastPong = Date.now();
  let isClosed = false;
  let pendingJoin: ((r: JoinResult) => void) | null = null;

  const send = (msg: Parameters<ClientTransport['send']>[0]) => {
    if (isClosed) return;
    try {
      transport.send(msg);
    } catch {
      // canale chiuso dal browser: il battito se ne accorgerà
    }
  };
  const setStatus = (next: LinkStatus) => {
    mode = next.mode;
    slot = next.slot;
    statusListeners.forEach((cb) => cb(next));
  };

  const startHeartbeat = () => {
    lastPong = Date.now();
    heartbeat ??= setInterval(() => {
      send({ t: 'ping', p: { at: Date.now() } });
      if (mode === 'live' && Date.now() - lastPong > HOST_LOST_MS) setStatus({ mode: 'lost', slot });
    }, HEARTBEAT_MS);
  };

  const handleWelcome = (msg: Extract<ServerMessage, { t: 'welcome' }>) => {
    writeToken(code, msg.p.sessionToken);
    startHeartbeat();
    if (pendingJoin) {
      pendingJoin({ ok: true, mode: 'live', slot: msg.p.slot });
      return;
    }
    // benvenuto arrivato dopo il timeout (schermo lento): si passa da demo a live
    setStatus({ mode: 'live', slot: msg.p.slot });
    if (lastProfile) send({ t: 'profile', p: lastProfile });
  };

  // dopo una riconnessione della socket il relay non ricorda più la connessione: nuovo hello
  let lastCapabilities: Capabilities | null = null;
  (transport as Partial<WsClientTransport>).onOpen?.((isReconnect) => {
    if (isReconnect && lastCapabilities) send({ t: 'hello', p: { sessionToken: readToken(code), capabilities: lastCapabilities } });
  });

  transport.onMessage((msg: ServerMessage) => {
    if (isClosed) return;
    switch (msg.t) {
      case 'lobby':
        lobbyListeners.forEach((cb) => cb(msg.p.players, msg.p.phase));
        break;
      case 'turn':
        turnListeners.forEach((cb) => cb(msg.p.activeSlot));
        break;
      case 'welcome':
        handleWelcome(msg);
        break;
      case 'layout':
        layoutListeners.forEach((cb) => cb(msg.p));
        break;
      case 'cue':
        cueListeners.forEach((cb) => cb(msg.p.text === undefined ? { kind: msg.p.kind } : { kind: msg.p.kind, text: msg.p.text }));
        break;
      case 'pong':
        lastPong = Date.now();
        rttListeners.forEach((cb) => cb(lastPong - msg.p.at));
        if (mode === 'lost') setStatus({ mode: 'live', slot });
        break;
      case 'error':
        if (msg.p.code === 'KICKED') {
          // niente rientro automatico: senza token un nuovo hello sarebbe un giocatore nuovo
          writeToken(code, null);
          kickedListeners.forEach((cb) => cb());
          shutdown();
          break;
        }
        pendingJoin?.({ ok: false, code: msg.p.code });
        break;
      default:
        break;
    }
  });

  function shutdown() {
    isClosed = true;
    pendingJoin?.({ ok: false, code: 'ROOM_NOT_FOUND' });
    if (heartbeat) clearInterval(heartbeat);
    transport.close();
  }

  return {
    join(capabilities) {
      if (isClosed) return Promise.resolve({ ok: false, code: 'ROOM_NOT_FOUND' } as const);
      return new Promise<JoinResult>((resolve) => {
        const timer = setTimeout(() => finish({ ok: true, mode: 'demo', slot: 'P1' }), JOIN_TIMEOUT_MS);
        function finish(r: JoinResult) {
          clearTimeout(timer);
          pendingJoin = null;
          if (r.ok) {
            mode = r.mode;
            slot = r.slot;
          }
          resolve(r);
        }
        pendingJoin = finish;
        lastCapabilities = capabilities;
        send({ t: 'hello', p: { sessionToken: readToken(code), capabilities } });
      });
    },
    sendProfile(profile) {
      lastProfile = profile;
      if (mode === 'live' || mode === 'lost') send({ t: 'profile', p: profile });
    },
    sendReady(layoutId) {
      send({ t: 'ready', p: { layoutId } });
    },
    sendGameEvent(gameId, e) {
      send({ t: 'game-event', p: { gameId, e } });
    },
    onCue(cb) {
      cueListeners.add(cb);
      return () => cueListeners.delete(cb);
    },
    onRtt(cb) {
      rttListeners.add(cb);
      return () => rttListeners.delete(cb);
    },
    onTurn(cb) {
      turnListeners.add(cb);
      return () => turnListeners.delete(cb);
    },
    onLobby(cb) {
      lobbyListeners.add(cb);
      return () => lobbyListeners.delete(cb);
    },
    onLayout(cb) {
      layoutListeners.add(cb);
      return () => layoutListeners.delete(cb);
    },
    onStatus(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    onKicked(cb) {
      kickedListeners.add(cb);
      return () => kickedListeners.delete(cb);
    },
    leave() {
      if (mode === 'live') send({ t: 'bye', p: {} });
      writeToken(code, null);
    },
    close() {
      shutdown();
    },
  };
}
