# quickquest — documentazione di progetto

> Nome: **quickquest** (scelto il 2026-11-04). È una piattaforma web di party-game sportivi: uno schermo grande mostra il gioco e fino a 4 smartphone fanno da controller di movimento, direttamente dal browser.

Stato: **Fase 1–2**. Documentazione completa; spike S1 in `spikes/s1-sensor-probe`; sito pubblico, lobby e accesso dal telefono in `apps/web` con relay locale (vedi [02 § Stato attuale](02-architecture.md#stato-attuale-del-codice)). Data: novembre 2026.

## Indice

| # | Documento | Contenuto |
|---|---|---|
| 00 | [Visione](00-vision.md) | Cos'è, pilastri, pubblico, non-obiettivi |
| 01 | [Fattibilità](01-feasibility.md) | Analisi tecnica per tecnologia e per gioco, rischi, mitigazioni |
| 02 | [Architettura](02-architecture.md) | Componenti, monorepo, deploy, sicurezza, testing |
| 03 | [Rete e protocollo](03-network-protocol.md) | Stanze, messaggi, clock sync, latenza, riconnessione |
| 04 | [Input di movimento](04-motion-input.md) | Sensori, verifica hardware, calibrazione, riconoscimento gesti |
| 05 | [Contratto modulo gioco](05-game-module-contract.md) | Come si aggiunge un gioco, ciclo di vita, API |
| 06 | [Rendering e fisica](06-rendering-physics.md) | Three.js, Rapier, budget prestazioni, pipeline asset |
| 07 | [Art direction](07-art-direction.md) | Lo stile "Soft Toy": forme, shading, palette, avatar, audio |
| 08 | [UI/UX](08-ui-ux.md) | Flussi schermo e controller, design system, token |
| 09 | [Roadmap](09-roadmap.md) | Fasi, spike go/no-go, milestone |
| 10 | [Repository di riferimento](10-references.md) | Repo GitHub da usare come dipendenze o da studiare |
| 11 | [Brainstorming dei giochi](11-games-brainstorm.md) | Come si svolge una partita in ogni gioco: turni, regole, modalità, assist, premi, decisioni aperte |

### Giochi
| Gioco | Documento | Stato |
|---|---|---|
| Bowling | [games/bowling.md](games/bowling.md) | GDD completo, **primo gioco** |
| Bocce | [games/bocce.md](games/bocce.md) | Brief |
| Tiri liberi | [games/free-throw.md](games/free-throw.md) | Brief |
| Golf | [games/golf.md](games/golf.md) | Brief, prima versione giocabile |
| Barber shop | [games/barber.md](games/barber.md) | Brief |
| Scherma | [games/fencing.md](games/fencing.md) | Brief |
| Template | [games/_template.md](games/_template.md) | Per i GDD futuri |

Flusso di partita, modalità e idee per tutti i giochi: [11 — Brainstorming](11-games-brainstorm.md).

### Architecture Decision Records
| ADR | Decisione |
|---|---|
| [ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md) | Relay su Cloudflare Workers + Durable Objects (non Render), DO scritto con PartyServer da validare in S2 |
| [ADR-002](adr/ADR-002-gesture-recognition-on-device.md) | Riconoscimento del gesto sul telefono |
| [ADR-003](adr/ADR-003-threejs-rapier.md) | Three.js + Rapier3D (binding ora in `dimforge/rapier`) |
| [ADR-004](adr/ADR-004-monorepo-typescript-vite.md) | Monorepo pnpm + TypeScript + Vite |
| [ADR-005](adr/ADR-005-procedural-vertex-color-assets.md) | Asset procedurali e vertex color invece di texture |
| [ADR-006](adr/ADR-006-require-gyro-and-accelerometer.md) | Giroscopio + accelerometro obbligatori |
| [ADR-007](adr/ADR-007-native-websocket.md) | WebSocket con PartySocket invece di Socket.io |
| [ADR-008](adr/ADR-008-preact-ui-overlay.md) | Preact + signals per la UI overlay |

## Glossario

| Termine | Significato |
|---|---|
| **Schermo** (screen) | Il dispositivo che mostra il gioco: PC, Mac, iPad, TV via HDMI o cast. È **autoritativo**: fisica, regole e punteggio girano qui. |
| **Controller** | Lo smartphone del giocatore, in un browser su `/c/:room`. |
| **Stanza** (room) | La sessione di gioco, identificata da un codice di 4 caratteri. Corrisponde a un Durable Object. |
| **Relay** | Il Worker Cloudflare che inoltra i messaggi tra controller e schermo. |
| **Slot** | Il posto del giocatore nella stanza, da P1 a P4, con un colore associato. |
| **Posa** (pose) | L'orientamento del telefono, come quaternione, inviato in streaming a 30 Hz. Serve solo per la visualizzazione. |
| **Evento gesto** | Il risultato compatto di un gesto riconosciuto sul telefono, per esempio `bowling.release`. Da questo dipende l'esito del tiro. |
| **Recognizer** | La macchina a stati che, sul telefono, trasforma i dati dei sensori in eventi gesto. |
| **Cue** | Un comando dallo schermo al telefono: vibrazione, suono o cambio di UI. |
| **Traccia** (trace) | Una registrazione grezza dei sensori in JSON, usata come fixture di test e per il tuning. |
| **Assist** | I parametri che rendono il gioco più indulgente del reale senza togliere la sensazione di controllo. |
| **Pupo / Pupi** | Gli avatar originali del progetto. |
| **Soft Toy** | Il nome dello stile grafico. |
