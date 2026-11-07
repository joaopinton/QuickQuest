# 09 — Roadmap

Principio: **prima la piattaforma, poi un gioco eccellente, poi gli altri.** Ogni fase si chiude con criteri verificabili. Gli spike della Fase 1 possono cambiare le decisioni: in quel caso si aggiorna l'ADR corrispondente.

```
Fase 0  Documentazione            ✅ (questo documento)
Fase 1  Spike go/no-go            S1 sensori · S2 relay · S3 birilli · S4 shader
Fase 2  Piattaforma               monorepo · relay · lobby/QR · verifica sensori · calibrazione · strumenti dev
Fase 3  Bowling vertical slice    1 giocatore · 10 frame · gesto · braccio Bubù · juice
Fase 4  Bowling completo          4 giocatori · rifinitura · risultati · allenamento · playtest
Fase 5+ Altri giochi              Bocce → Tiri liberi → Golf → Barber shop → Scherma
```

---

## Fase 0 — Documentazione
- [x] Visione, fattibilità, architettura, protocollo, input, contratto dei giochi, rendering, art direction, UI/UX, GDD del bowling, brief degli altri giochi, ADR.

## Fase 1 — Spike go/no-go
Gli spike sono prototipi **usa-e-getta** in `spikes/`, fuori dal codice di prodotto. Durata indicativa: 1–3 giorni ciascuno.

### S1 — Sonda sensori
- **Cosa**: una pagina statica HTTPS che chiede i permessi, mostra in tempo reale i grafici di ω e a, misura `interval`, registra tracce di swing (bowling: piano, medio, forte, con hook a sinistra e a destra, annullo) e le scarica in JSON.
- **Dispositivi**: almeno 1 iPhone (iOS recente), 1 Android di fascia media, 1 Android economico.
- **Go se**:
  - `interval` mediano ≤ 20 ms su iPhone e su Android medio (≤ 33 ms accettato sull'economico);
  - swing "piano" e "forte" separabili: picco di |ω_s| che differisce di ≥ 40%;
  - la rotazione del polso al rilascio è visibile con segno coerente in ≥ 8 tracce su 10;
  - mapping degli assi iOS/Android documentato nella tabella del `SensorAdapter`.
- **Output**: 30+ tracce in `fixtures/traces/bowling/`, tabella assi, scelta tra filtro complementare e Madgwick.
- **Implementazione**: [`spikes/s1-sensor-probe`](../spikes/s1-sensor-probe/README.md), con procedura, analisi e generazione delle fixture.

### S2 — Latenza relay
- **Cosa**: un Worker + DO minimale che fa da echo/relay; telefono e schermo inviano ping a 30 Hz e la pagina misura il RTT. Il relay si scrive in due versioni, con **PartyServer** e con un DO "puro", e il client usa **PartySocket** ([ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md), [ADR-007](adr/ADR-007-native-websocket.md)). Si prova anche il **dead-reckoning** della posa ([03 § 5](03-network-protocol.md#5-latenza-e-interpolazione)), confrontando il ritardo percepito con e senza.
- **Scenari**: entrambi su Wi-Fi di casa · telefono in 4G e schermo su Wi-Fi · rete con client isolation (es. università o hotspot).
- **Go se**:
  - RTT p95 telefono → schermo < 120 ms in tutti gli scenari;
  - nessuna disconnessione in 30 min di stream continuo;
  - i consumi di una sessione di 15 min stanno entro il 5% del limite giornaliero free (verificati sulla dashboard Cloudflare e sulla [pagina prezzi](https://developers.cloudflare.com/durable-objects/platform/pricing));
  - passando da Wi-Fi a 4G il controller si riconnette da solo in < 3 s e riprende il suo slot.
- **Output**: scelta tra PartyServer e DO puro, opzioni di backoff di PartySocket confermate, parametri iniziali del dead-reckoning.

### S3 — Sandbox birilli
- **Cosa**: Three.js + Rapier, pista con due zone di attrito, 10 birilli, palla lanciata con mouse e slider (velocità, spin, direzione).
- **Go se**:
  - strike, spare, split e hook credibili a giudizio di 3 persone;
  - fisica stabile (niente birilli che vibrano o compenetrano) a 240 Hz;
  - costo della fisica < 3 ms per frame su iPad 9ª gen durante l'impatto;
  - peso di Rapier misurato e accettabile (≤ 1 MB gzip), confrontando `@dimforge/rapier3d-compat` e `@dimforge/rapier3d` ([ADR-003](adr/ADR-003-threejs-rapier.md)).

### S4 — Shader Soft Toy
- **Cosa**: la scena del bowling con i materiali Soft Toy (ramp, hemisphere, rim, AO nei vertex color), un Bubù statico e i tre quality tier.
- **Go se**:
  - 60 fps sul tier Mid su iPad 9ª gen e sul laptop iGPU di riferimento;
  - 5 persone, viste le immagini, descrivono lo stile con aggettivi come "morbido", "giocattolo", "amichevole" e nessuna lo scambia per un gioco esistente specifico.

**Se uno spike fallisce**: si aggiorna l'ADR e il documento di riferimento, e si rivaluta il piano prima della Fase 2.

---

## Fase 2 — Piattaforma
| Blocco | Deliverable | Criterio di chiusura |
|---|---|---|
| Monorepo | pnpm + TS strict + Vite + Vitest + ESLint (con regole di confine) + Prettier + CI GitHub Actions | `pnpm test` e `pnpm build` verdi in CI |
| Protocol | Tipi, codec JSON e binario, validatori, versione | Test round-trip e limiti; copertura ≥ 90% |
| Relay | Worker + DO Room: creazione, join, slot, token, riconnessione, rate limit, scadenza | Test con `vitest-pool-workers` |
| Lobby (schermo) | Home, Crea stanza, QR, slot P1–P4, selezione gioco con card | E2E Playwright: crea stanza → 2 controller simulati → selezione |
| Controller | Benvenuto, permessi, **verifica sensori obbligatoria**, scelta Bubù, calibrazione, attesa, layout `menu` | Su telefono reale: un dispositivo senza giroscopio viene rifiutato con il messaggio corretto (si verifica con il simulatore di sviluppo in modalità "senza giroscopio") |
| Motion | SensorAdapter, fusione, calibrazione, PoseStreamer, primitive recognizer, trace recorder | Test su tracce S1 |
| Engine | Loop a passo fisso, scene manager, quality tier, materiali Soft Toy, audio, fx, Rapier lazy | Scena demo a 60 fps |
| Avatar | Bubù procedurale, 8 colori + accessori, idle, IK del braccio dalla posa | Il braccio segue il telefono in lobby (minigioco "saluta!") |
| UI | Token, componenti base, i18n `it` | Revisione visiva su 1080p e telefono |
| Strumenti dev | Simulatore controller, replay delle tracce, overlay di debug, **Controller Lab** (telefono 3D che segue quello reale, grafici dei sensori, tuning dal vivo) | Si gioca un turno senza telefono; nel Lab il telefono 3D segue quello reale senza assi invertiti su iPhone e Android |
| Deploy | Pages + Worker su un dominio, staging per branch | URL pubblico funzionante in HTTPS |

## Fase 3 — Bowling vertical slice
Riferimento: [GDD bowling § 11](games/bowling.md#11-criteri-di-successo-del-vertical-slice-fase-3).
- Set, fisica, recognizer, regole e punteggio, camera, juice, HUD per **1 giocatore**, partita completa.
- Tuning su tracce reali e playtest (≥ 5 persone).

## Fase 4 — Bowling completo
- 1–4 giocatori, tabellone multigiocatore, schermata risultati con premi.
- Livelli di assist, modalità veloce, modalità allenamento.
- Rifinitura audio e visiva, ottimizzazione dei tier, accessibilità.
- **Release pubblica v0.1** (solo bowling).

## Fase 5+ — Giochi successivi
| # | Gioco | Motivazione dell'ordine | Prerequisiti nuovi |
|---|---|---|---|
| 5 | Bocce | Riusa il 70% del bowling | Resistenza al rotolamento, heightfield, gesto accosto/bocciata |
| 6 | Tiri liberi | Gesto nuovo ma semplice, fisica contenuta | `aero.ts`, retina verlet |
| 7 | Golf | Più contenuti e aerodinamica | Heightfield + editor buche minimale, swing a due mani |
| 8 | Barber shop | Nessuna fisica, ma puntamento e rendering dei capelli nuovi | Shell texturing, DataTexture, puntamento relativo |
| 9 | Scherma | Simultaneo 1v1, il più esigente su latenza ed equità | Buffer di giudizio, (opzionale) WebRTC |

Ogni gioco segue la [checklist "nuovo gioco"](05-game-module-contract.md#5-checklist-nuovo-gioco): GDD → spike del gesto → vertical slice → completo.

---

## Checklist di playtest (per ogni gioco)
- [ ] Persone nuove al gioco capiscono il gesto entro 3 tentativi, con solo il tutorial.
- [ ] Domanda: "Sembrava un gesto vero?" (1–5) → media ≥ 4.
- [ ] Domanda: "Ti sei sentito in controllo del risultato?" (1–5) → media ≥ 4.
- [ ] Nessuno ha rischiato di lanciare il telefono o di colpire qualcuno.
- [ ] Si testano almeno 1 iPhone e 1 Android.
- [ ] Si osserva: dove le persone esitano, cosa chiedono, quando ridono.
