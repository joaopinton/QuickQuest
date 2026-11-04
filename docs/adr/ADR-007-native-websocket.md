# ADR-007 — WebSocket con PartySocket invece di Socket.io

- **Stato**: Accettato. Rivisto il 2026-11-04: PartySocket sostituisce il wrapper scritto a mano (vedi [10 § 3](../10-references.md#3-rete-e-relay-cloudflare)).
- **Data**: 2026-11-04

## Contesto
Socket.io offre riconnessione, rooms e fallback al long-polling, ma:
- non gira nativamente sul runtime dei Cloudflare Workers ([ADR-001](ADR-001-relay-cloudflare-durable-objects.md));
- aggiunge circa 40 KB min al bundle del controller;
- il fallback al long-polling non ci serve (WSS è supportato ovunque nei browser target);
- le "rooms" coincidono già con i Durable Objects.

La prima versione di questo ADR prevedeva un wrapper nostro (circa 200 righe) per riconnessione, coda e heartbeat. La ricerca sui repository ha trovato **PartySocket** ([cloudflare/partykit](https://github.com/cloudflare/partykit)), mantenuto da Cloudflare, che fa già tutto questo.

## Decisione
Il protocollo resta WebSocket "puro": niente Socket.io, frame di testo per gli eventi JSON e frame binari per le pose ([03 § 3](../03-network-protocol.md#3-messaggi)).

Sul client il trasporto è **PartySocket**, usato come WebSocket generico verso il nostro URL `wss://<dominio>/ws/...` (non dipende da PartyKit lato server). Fornisce:
- riconnessione automatica con backoff configurabile;
- buffer dei messaggi mentre la connessione è giù, inviati alla riapertura;
- API compatibile con `WebSocket` (`send` accetta `string` e `ArrayBuffer`, `binaryType`).

Restano nostre, in `packages/protocol/transport`, poche righe sopra PartySocket:
- **Interfaccia `Transport`** (`send`, `sendPose`, `onMessage`, `onStatus`), così un domani si può aggiungere WebRTC DataChannel ([03 § 9](../03-network-protocol.md#9-evoluzione-futura-webrtc)) senza toccare i giochi.
- **Le pose non entrano mai nel buffer.** `sendPose` invia solo se la socket è `OPEN`, altrimenti scarta il frame: una posa vecchia non serve a niente. Il buffer di PartySocket resta per gli eventi, limitato con `maxEnqueuedMessages: 64`.
- **Ripresa della sessione.** A ogni evento `open` si rimanda `hello` con `sessionToken` (controller) o `room.resume` con `screenSecret` (schermo), come da [03 § 6](../03-network-protocol.md#6-riconnessione).
- **Backoff da gioco.** I default di PartySocket (primo tentativo dopo 1–5 s) sono troppo lenti per una partita. Si usano `minReconnectionDelay: 250`, `maxReconnectionDelay: 4000`, `reconnectionDelayGrowFactor: 2`, `connectionTimeout: 3000`, e si smette dopo 2 minuti mostrando "Connessione persa".
- **Heartbeat applicativo**: il `ping` di clock sync ([03 § 4](../03-network-protocol.md#4-clock-sync)) fa anche da heartbeat; se non arriva il `pong` per 3 volte di fila si chiude e si riapre la socket.

## Alternative considerate
| Opzione | Perché no |
|---|---|
| Socket.io | Non gira sui Workers, pesa circa 40 KB, long-polling inutile |
| Wrapper nostro su `WebSocket` nativo | Funziona, ma è codice in più da scrivere e testare per un problema già risolto |
| PartySocket con le opzioni di default | Backoff troppo lento e buffer illimitato, che accoderebbe anche le pose |

## Conseguenze
- ✅ Bundle piccolo, compatibile con i Workers, controllo totale su formato e frequenze.
- ✅ Frame binari per le pose (24 byte) senza overhead di serializzazione.
- ✅ Riconnessione e buffering già testati da altri; il nostro strato si riduce a poche decine di righe.
- ⚠️ Dipendenza esterna in più sul controller: il peso va controllato con `size-limit` nel budget di 100 KB gzip ([06 § 4](../06-rendering-physics.md#4-budget-prestazioni)).
- ⚠️ Le opzioni di backoff e buffer vanno verificate sul campo nello spike S2 (riconnessione dopo cambio rete Wi-Fi → 4G).
