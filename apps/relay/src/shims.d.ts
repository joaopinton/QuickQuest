// transport.ts (condiviso con il browser) nomina BroadcastChannel; nel Worker non viene mai usato.
declare class BroadcastChannel {
  constructor(name: string);
  postMessage(data: unknown): void;
  addEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  removeEventListener(type: 'message', cb: (ev: MessageEvent) => void): void;
  close(): void;
}
declare const location: { protocol: string; host: string };
