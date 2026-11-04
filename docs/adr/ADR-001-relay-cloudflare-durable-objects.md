# ADR-001 — Relay realtime su Cloudflare Workers + Durable Objects

- **Stato**: Accettato (da confermare con lo spike S2). Rivisto il 2026-11-04: il DO `Room` si scrive preferibilmente con **PartyServer**, da validare in S2.
- **Data**: 2026-11-04

## Contesto
Controller e schermo devono scambiarsi messaggi in tempo reale su qualsiasi rete, comprese reti diverse (4G e Wi-Fi) e reti con client isolation (Eduroam). Il P2P puro non è affidabile, quindi serve un punto d'incontro pubblico su WSS/443, a costo zero.

Lo skim iniziale proponeva **Node.js + Socket.io su Render.com free**. Dalla ricerca emerge che i servizi free di Render si spengono dopo 15 minuti senza traffico in ingresso, che il riavvio richiede circa un minuto e che Render può riavviare il servizio in qualsiasi momento, facendo cadere le connessioni esistenti.

## Decisione
Il relay gira come **Cloudflare Worker** con un **Durable Object per stanza**: backend SQLite, disponibile sul piano free, con **WebSocket Hibernation API**. Il frontend è su **Cloudflare Pages**, sullo stesso dominio; la route `/ws/*` punta al Worker.

### Come si scrive il DO: PartyServer (candidato)
[PartyServer](https://github.com/cloudflare/partykit/tree/main/packages/partyserver) è una classe base per Durable Objects mantenuta da Cloudflare. Non cambia l'architettura: resta un DO per stanza, sullo stesso runtime. Toglie però il codice ripetitivo:

| Bisogno del DO `Room` | Con PartyServer |
|---|---|
| Hibernation | `static options = { hibernate: true }` |
| Routing da URL a DO | `routePartykitRequest(req, env, { prefix: "ws" })` → `/ws/room/<CODICE>` |
| Rifiutare join non validi prima di aprire la socket (`UNSUPPORTED_DEVICE`, rate limit, codice inesistente) | `onBeforeConnect`, che può rispondere con un `Response` di errore |
| Stato per connessione (slot, ruolo schermo/controller, `sessionToken`) | `connection.setState()` (fino a 2 KB, sopravvive all'hibernation) |
| Inoltro allo schermo o a tutti i controller | `getConnection(id)`, `getConnections(tag)` con `getConnectionTags` (`screen`, `controller`, `p1`…`p4`) e `broadcast(msg, exclude)` |
| Ricaricare lo stato della stanza dopo il risveglio | `onStart()` legge `RoomState` dallo storage SQLite |
| Scadenza delle stanze inattive | `onAlarm()` |

La logica della stanza (validazione dello schema, slot, token, rate limit) resta nostra e si testa con `@cloudflare/vitest-pool-workers` indipendentemente dalla classe base.

**Verifica nello spike S2:** si confrontano due versioni minime del relay, una con PartyServer e una con il DO "puro" in stile [workers-chat-demo](https://github.com/cloudflare/workers-chat-demo). Si sceglie PartyServer se ha latenza e consumi equivalenti e il codice è più corto. Altrimenti si resta sul DO puro, e l'URL torna `/ws/<CODICE>`.

## Alternative considerate
| Opzione | Perché no |
|---|---|
| Render free + Socket.io | Cold start di ~1 min, spegnimento dopo 15 min, riavvii arbitrari |
| Railway / Fly.io | Free tier assente o limitato; serve gestire una VM o un container |
| Servizi realtime gestiti (Ably, Pusher, Supabase Realtime) | Limiti free sui messaggi al minuto stretti per uno stream a 30 Hz; vendor in più |
| PartyKit come piattaforma ospitata | Il vecchio servizio ospitato non serve: le sue librerie (PartyServer, PartySocket) girano direttamente sul nostro account Cloudflare |
| DO "puro" senza librerie | Resta l'alternativa di riferimento in S2 (vedi sopra) |
| WebRTC P2P puro | Fallisce con client isolation o NAT simmetrico senza TURN |

## Conseguenze
- ✅ Nessun cold start percepibile; edge vicino agli utenti; un solo provider per hosting e relay; niente CORS.
- ✅ Il DO serializza i messaggi della stanza: lo stato è coerente senza lock.
- ✅ Con l'hibernation non si paga il tempo inattivo.
- ✅ Con PartyServer, routing, hibernation e gestione delle connessioni sono già fatti; lato client lo affianca PartySocket ([ADR-007](ADR-007-native-websocket.md)).
- ⚠️ I limiti giornalieri del free tier vanno misurati (S2). Mitigazione: stream di posa solo dal giocatore di turno e degrado a 15 Hz.
- ⚠️ Il runtime dei Workers non è Node completo: niente Socket.io, si usano API web standard.
- ⚠️ Vendor lock-in moderato: il protocollo è indipendente dal trasporto, quindi un relay Node alternativo resta possibile. PartyServer aggiunge un legame in più con Cloudflare, ma la logica della stanza resta in moduli nostri separabili.
