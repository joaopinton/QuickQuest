# 02 — Architettura

## 1. Vista d'insieme

```
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Controller P1│  │ Controller P2│  │ Controller P3│  │ Controller P4│
   │  /c/ABCD     │  │  /c/ABCD     │  │  /c/ABCD     │  │  /c/ABCD     │
   │ sensori →    │  │              │  │              │  │              │
   │ recognizer → │  │   (idem)     │  │   (idem)     │  │   (idem)     │
   │ eventi+posa  │  │              │  │              │  │              │
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
          │ WSS 443         │                 │                 │
          ▼                 ▼                 ▼                 ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ Cloudflare Worker  /ws/:room  →  Durable Object "Room" (1 per stanza)│
   │  - assegna slot, token di sessione        - valida schema e dimensioni│
   │  - inoltra controller ⇄ schermo           - rate limit, scadenza      │
   └───────────────────────────────┬────────────────────────────────────┘
                                   │ WSS 443
                                   ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ Schermo  "/"   (AUTORITATIVO)                                        │
   │  lobby · registro giochi · gioco attivo (Three.js + Rapier) · HUD    │
   │  regole · punteggio · avatar · audio · invio cue ai controller       │
   └────────────────────────────────────────────────────────────────────┘

   Asset statici (HTML/JS/CSS/glTF/audio): Cloudflare Pages, stesso dominio
```

### Principi
1. **Lo schermo è autoritativo.** Fisica, regole, punteggio e turni girano solo sullo schermo. I controller *propongono* input, lo schermo *decide*.
2. **Il relay inoltra, non ragiona.** Non conosce le regole dei giochi. Valida forma e dimensione dei messaggi, gestisce stanze e slot.
3. **Il telefono riconosce il gesto.** Il recognizer gira alla frequenza nativa dei sensori e manda eventi compatti ([ADR-002](adr/ADR-002-gesture-recognition-on-device.md)).
4. **Core stabile, giochi plug-in.** I giochi dipendono dal core, mai il contrario, e mai un gioco da un altro ([05](05-game-module-contract.md)).
5. **Il controller pesa poco.** Il bundle del controller non contiene Three.js né Rapier.

---

## 2. Stack

| Livello | Scelta | Perché |
|---|---|---|
| Linguaggio | TypeScript strict | Contratti tra moduli e protocollo tipizzati end-to-end |
| Build | Vite | Code-splitting, dev server veloce, HTTPS locale per i sensori |
| Monorepo | pnpm workspaces | Package condivisi tra web app e relay ([ADR-004](adr/ADR-004-monorepo-typescript-vite.md)) |
| Rendering | Three.js (WebGL2) | Leggero, maturo, glTF ([ADR-003](adr/ADR-003-threejs-rapier.md)) |
| Fisica | `@dimforge/rapier3d-compat` (binding ora nel repo `dimforge/rapier`) | WASM, CCD, passi fissi; variante non-compat da valutare in S3 ([ADR-003](adr/ADR-003-threejs-rapier.md)) |
| UI overlay | Preact + @preact/signals | ~5 KB, componenti dichiarativi per menu e HUD ([ADR-008](adr/ADR-008-preact-ui-overlay.md)) |
| Relay | Cloudflare Workers + Durable Objects (SQLite, WebSocket Hibernation), scritto con **PartyServer** se lo conferma S2 | Free, nessun cold start, edge ([ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md)) |
| Hosting statico | Cloudflare Pages | Free, HTTPS, deploy da GitHub |
| Trasporto | WebSocket con **PartySocket** sul client | Riconnessione e buffer già pronti, niente Socket.io ([ADR-007](adr/ADR-007-native-websocket.md)) |
| QR | [`uqr`](https://github.com/unjs/uqr) (SVG, senza dipendenze) | Solo lato schermo |
| Test | Vitest, `@cloudflare/vitest-pool-workers`, Playwright | Unit, relay, e2e |
| Lint/format | ESLint + Prettier | Standard |

---

## 3. Struttura del monorepo

### Stato attuale del codice
Già presenti (2026-11-04):
- `apps/web`:
  - sito pubblico (Home, Come si gioca, Giochi, 404);
  - lobby `/stanza` con QR;
  - flusso del telefono `/c/:code`: codice, permessi, sonda, Bubù, sicurezza, attesa.
- `packages/ui`: token, componenti, Bubù in SVG e i18n.
- `packages/protocol`:
  - messaggi core e codici stanza;
  - **reducer della stanza**, lo stesso che userà il DO;
  - `Transport` con `LocalTransport` su `BroadcastChannel`.
- `packages/motion`: sonda sensori portata dallo spike S1.
- `games/registry.ts`: solo i meta dei giochi.

Finché il relay Cloudflare non esiste:
- **lo schermo fa da host** della stanza;
- schermo e telefono simulato (`/c/CODICE?sim`, solo in sviluppo) si parlano tra schede dello stesso browser;
- un telefono vero, senza risposta entro 1,5 s, entra in **modalità demo**.

Per passare al relay vero si sostituisce solo il `Transport`, con PartySocket ([ADR-007](adr/ADR-007-native-websocket.md)).


```
quickquest/
├── apps/
│   └── web/                         SPA unica, due entry logiche
│       ├── src/screen/              "/"      lobby, selezione giochi, runtime gioco
│       ├── src/controller/          "/c/:room" connessione, verifica sensori, layout dinamici
│       ├── src/dev/                 simulatore controller, Controller Lab, trace recorder (solo build di sviluppo)
│       └── public/_headers          CSP e header di sicurezza per Pages
├── workers/
│   └── relay/                       Worker + Durable Object "Room"
├── packages/
│   ├── protocol/                    tipi messaggi, codec JSON/binario, versione, validazione
│   ├── motion/                      SensorAdapter, filtri, fusione orientamento, primitive recognizer, tracce
│   ├── engine/                      shell Three.js, loop, scene, asset, quality tier, audio, fisica lazy
│   ├── avatar/                      Bubù: generazione procedurale, IK braccio, animazioni
│   └── ui/                          design token (CSS), componenti Preact condivisi
├── games/
│   ├── registry.ts                  elenco GameDefinition (1 riga per gioco)
│   └── bowling/
│       ├── screen/                  scena, fisica, regole, camera, HUD
│       ├── controller/              layout + recognizer del gesto
│       ├── shared/                  tipi degli eventi del gioco (inclusi nel protocollo)
│       └── test/                    punteggio, recognizer su tracce
├── fixtures/traces/                 tracce sensori registrate (per piattaforma e gesto)
└── docs/
```

### Regole di dipendenza
```
games/*  ──►  packages/engine, motion, avatar, ui, protocol
apps/web ──►  games/registry, packages/*
workers/relay ──► packages/protocol   (e nient'altro)
packages/motion ──► packages/protocol
packages/engine ──X──► games/*         (vietato)
games/a ──X──► games/b                  (vietato)
```
Le regole vengono imposte con `eslint-plugin-boundaries` o con i path TS.

### Code splitting
| Chunk | Contenuto | Chi lo carica |
|---|---|---|
| `controller` | UI controller, motion, protocol | Telefono |
| `screen-core` | lobby, UI, protocol, QR | Schermo, all'avvio |
| `engine` | Three.js + engine + avatar | Schermo, in preload durante la lobby |
| `physics` | Rapier WASM | Schermo, al primo gioco che lo richiede |
| `game-<id>-screen` | scena e regole del gioco | Schermo, alla selezione del gioco |
| `game-<id>-controller` | layout e recognizer del gioco | Telefono, quando lo schermo lo richiede |

---

## 4. Ciclo di vita dell'applicazione

### Schermo
```
Boot → Home → CreaStanza → Lobby (attende ≥1 controller)
     → SelezioneGioco → CaricamentoGioco → Partita → Risultati → SelezioneGioco …
```
- Il preload di `engine` parte appena si entra in Lobby.
- Se lo schermo perde la connessione al relay prova a ricollegarsi alla **stessa stanza** per 60 s. Dopo, la stanza scade.

### Controller
```
Apri link → Benvenuto → [tap] Connetti → Permessi → Verifica sensori
          → (fallita) Schermata "telefono non compatibile"  ✖ fine
          → (ok) Join → Scelta Bubù → Attesa → Layout di gioco ⇄ Attesa → …
```
- La logica di gioco sul controller (layout + recognizer) si carica quando lo schermo invia `controller.layout`.

---

## 5. Deploy

| Componente | Dove | Come |
|---|---|---|
| `apps/web` build | Cloudflare Pages | Push su `main` → build `pnpm --filter web build` |
| `workers/relay` | Cloudflare Workers | `wrangler deploy` da CI (GitHub Actions) |
| Routing | Stesso dominio | Pages serve gli statici; la route `/ws/*` è legata al Worker. Niente CORS, nessun secondo dominio. |
| Anteprime | Pages preview per branch | Il relay di staging è un Worker separato (`relay-staging`) |

### Sviluppo locale
- `pnpm dev`: Vite in HTTPS (certificato locale con `vite-plugin-mkcert`), perché i sensori richiedono un contesto sicuro anche in LAN.
- `wrangler dev` per il relay in locale.
- Il telefono reale si collega all'IP del PC in LAN. In alternativa si usa un tunnel (Cloudflare Tunnel) quando la rete ha client isolation.
- **Simulatore controller** (`/dev/sim`, solo nella build di sviluppo): una seconda scheda che si comporta da telefono, con slider per l'orientamento, mouse per lo swing e **replay delle tracce registrate**. Non viene incluso in produzione (`import.meta.env.DEV`), quindi resta valido il requisito che in produzione si colleghino solo telefoni con giroscopio.
- **Controller Lab** (`/dev/lab`, solo nella build di sviluppo; idea presa da Pocket Sports, vedi [10 § 1](10-references.md#1-progetti-telefono--controller-i-più-vicini-al-nostro)): una pagina dello schermo che mostra **un telefono 3D che segue quello reale** collegato alla stanza. Accanto ci sono i grafici in tempo reale di ω e |a|, lo stato del recognizer, gli eventi gesto con il loro `confidence`, RTT e jitter, e il confronto tra posa ricevuta, interpolata e proiettata con il dead-reckoning ([03 § 5](03-network-protocol.md#5-latenza-e-interpolazione)). I parametri di filtro, smoothing e recognizer si regolano dal vivo con un pannello [tweakpane](https://github.com/cocopon/tweakpane). Serve a fare tuning con il telefono vero in mano, e a controllare a colpo d'occhio che assi e segni siano giusti su un dispositivo nuovo.

---

## 6. Sicurezza

Il modello di minaccia è modesto: nessun dato personale, nessun pagamento. Proteggiamo comunque il servizio da abusi e scherzi.

| Minaccia | Contromisura |
|---|---|
| Ingresso in stanze altrui indovinando il codice | Codice di 4 caratteri su un alfabeto di 31 simboli (~920k combinazioni); rate limit dei tentativi di join per IP; la stanza accetta join solo in Lobby, salvo riconnessioni con token |
| Furto di uno slot | Token di sessione casuale (128 bit) emesso al join; serve per riprendersi lo slot |
| Flood di messaggi | Limite per connessione (es. 60 msg/s per lo stream, 20/s per gli eventi); i messaggi in eccesso vengono scartati, e oltre una soglia la connessione si chiude |
| Messaggi malformati o enormi | Dimensione massima (2 KB per evento, 64 byte per frame di posa); validazione dello schema nel DO e di nuovo sullo schermo |
| Un controller che si finge lo schermo | Il ruolo `screen` viene fissato alla creazione della stanza da un `screenSecret` che resta sullo schermo |
| XSS tramite il nome del giocatore | Nessun testo libero nell'MVP: si sceglie un colore e un Bubù. Se in futuro si aggiungono nomi, verranno resi solo come testo, mai come HTML |
| Header e CSP | `_headers` di Pages: CSP `default-src 'self'`, `connect-src 'self' wss:`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` che abilita `accelerometer` e `gyroscope` solo per `self` |
| Stanze zombie | Il DO usa un alarm che chiude la stanza dopo 10 min senza schermo o 2 h di vita |

Nessun segreto nel codice: il deploy usa i token di Cloudflare nei secret della CI.

---

## 7. Strategia di test

| Livello | Cosa | Strumento |
|---|---|---|
| Unit | Codec del protocollo (round-trip, limiti), clock sync, punteggio bowling (casi classici: partita perfetta = 300, tutti spare, 10° frame), filtri e fusione dell'orientamento, mapping degli assist | Vitest |
| Recognizer | Ogni recognizer gira su **tracce reali registrate** (`fixtures/traces/*`) e deve produrre l'evento atteso (velocità entro una tolleranza, spin col segno giusto, nessun falso rilascio) | Vitest |
| Relay | Creazione stanza, join, quarto slot pieno, riconnessione con token, rate limit, scadenza | `@cloudflare/vitest-pool-workers` |
| E2E | Schermo + controller simulato: crea stanza → join → bowling → tiro → punteggio aggiornato | Playwright (due browser context) |
| Visuale | Screenshot della lobby e della scena del bowling a 1080p e 768p | Playwright screenshot |
| Prestazioni | Frame time sulla scena di riferimento; budget del bundle in CI (`size-limit`) | Script CI |
| Manuale | Playtest su telefoni reali (checklist in [09](09-roadmap.md)) | Persone |

Copertura ≥ 80% su `packages/*` e sulla logica dei giochi (regole, recognizer). Il codice di rendering puro è escluso dal conteggio e viene verificato con screenshot e playtest.

---

## 8. Osservabilità (leggera)
- Lo schermo mostra un overlay di debug (tasto `` ` ``) con fps, draw call, RTT per controller, Hz dei sensori per controller, pacchetti persi.
- Il relay produce log strutturati (stanza creata o chiusa, errori di validazione), consultabili con `wrangler tail`. Nessun dato personale.
- Nessuna analytics di terze parti.
