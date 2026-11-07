# 10 — Repository di riferimento

Ricerca su GitHub del 2026-11-04. ★ = stelle, la data è l'ultimo push. Per ogni repo è indicato **come usarlo**:
- 🧩 **dipendenza**: si installa e si usa;
- 📖 **studio**: si legge il codice e si copia o adatta ciò che serve;
- 🎨 **riferimento visivo**.

---

## 1. Progetti "telefono = controller" (i più vicini al nostro)

| Repo | ★ | Uso | Perché è utile |
|---|---|---|---|
| [qwendor/pocketsports](https://github.com/qwendor/pocketsports) | 0 · 2026-10 | 📖 **Da studiare per primo** | Party game sportivo nel browser con i telefoni come controller di movimento: 12 modalità, tra cui **bowling, golf, 3-point contest e swordplay**. Il modulo `MotionInput` trasforma i sensori in quaternione con heading rimosso alla calibrazione, aggiunge velocità angolare, accelerazione e stima di velocità/posizione con zero-velocity update, e invia pacchetti a 30 Hz. Lato host `RemoteCtrl` fa **dead-reckoning con la velocità angolare per il tempo di volo del pacchetto** e smoothing adattivo (forte da fermo, leggero in movimento). Ha un "Controller Lab" con un telefono 3D che segue quello reale, i parametri per sport (`BOWL_CFG`, `GOLF_CFG`, `BB_CFG`…) e un modo test con bot da console. Usa WebRTC con TURN. |
| [ckuzu3/phone-party-games](https://github.com/ckuzu3/phone-party-games) | 0 · 2026-10 | 📖 | 19 giochi in Three.js con il telefono come controller di movimento (tennis, **bowling**, **basket**, **golf**, boxe…), JS senza dipendenze e server Python su LAN. La presa non conta: la forza viene dall'accelerazione grezza e le rotazioni sono misurate rispetto alla gravità. Utile da confrontare sulle soglie dei gesti. |
| [Hartwich/Open-Party-Lab](https://github.com/Hartwich/Open-Party-Lab) | 9 · 2026-10 | 📖 | Piattaforma con schermo condiviso, controller sui telefoni, server autoritativo e **SDK per minigiochi**, con struttura monorepo `apps/` + `packages/`. È un buon confronto per il nostro [contratto modulo](05-game-module-contract.md). |
| [tim4724/Tiny-Track-Party](https://github.com/tim4724/Tiny-Track-Party) | 1 · 2026-11 | 📖 | Gara di macchinine con il telefono come **tilt controller**; attivo. |
| [steviebuilds/tinnendo-twitch](https://github.com/steviebuilds/tinnendo-twitch) | 0 · 2026-08 | 📖 | Laptop come console e telefono come controller di movimento ("swing like a racket"), in TypeScript. |
| [briossant/ombres](https://github.com/briossant/ombres) | 3 · 2026-09 | 📖🎨 | Party game in Three.js + TS + WebSocket con i telefoni come controller e rendering NPR. Utile per la struttura TS e per lo stile non fotorealistico. |
| [elizabethsiegle/beatswipe](https://github.com/elizabethsiegle/beatswipe) | 2 · 2025-01 | 📖 | Telefoni come controller su **Cloudflare Workers + Durable Objects**: è esattamente il nostro relay ([ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md)). |
| [rodwilco/rumpus](https://github.com/rodwilco/rumpus) | 12 · 2026-07 | 📖 | Piattaforma in stile Jackbox (TV + telefoni) su LAN: lobby, stanze, flusso dei giocatori. |
| [greggman/HappyFunTimes](https://github.com/greggman/HappyFunTimes) | 396 · 2020 | 📖 | Lo storico "telefoni come controller" per giochi locali, con esempi di sync Three.js (`hft-syncthreejs`) ed emulazione Gamepad API. Datato ma pieno di idee su lobby e gestione dei giocatori. |

> ⚠️ Pocket Sports e simili si dichiarano "Wii Sports-style": se ne prende **il codice e le idee tecniche**, non nomi, grafica o suoni ([07 § 10](07-art-direction.md#10-cosa-non-fare)).

## 2. Sensori e fusione dell'orientamento

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [psiphi75/ahrs](https://github.com/psiphi75/ahrs) | 97 · 2026-02 | 🧩 | **Madgwick e Mahony** in JS: giroscopio + accelerometro → quaternione. Candidato diretto per l'`OrientationFilter` di [04](04-motion-input.md#4-orientamento), da valutare nello spike S1. |
| [dorukeker/gyronorm.js](https://github.com/dorukeker/gyronorm.js) | 644 · 2020 | 📖 | Normalizza accelerometro e giroscopio tra dispositivi. Datato: si studiano le **tabelle di normalizzazione** per il nostro `SensorAdapter`. |
| [adtile/Full-Tilt](https://github.com/adtile/Full-Tilt) | 323 · 2019 | 📖 | Normalizzazione di deviceorientation e quaternioni cross-browser; vecchio ma documenta le differenze storiche tra browser. |

## 3. Rete e relay (Cloudflare)

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [cloudflare/partykit](https://github.com/cloudflare/partykit) (PartyServer + **PartySocket**) | 1.3k · 2026-08 | 🧩 | **PartyServer**: Durable Object con WebSocket, lifecycle e broadcast semplificati. **PartySocket**: client WebSocket con riconnessione, buffering e resilienza, cioè quello che volevamo scrivere a mano in [ADR-007](adr/ADR-007-native-websocket.md). **Proposta**: usare PartySocket sul client al posto del wrapper fatto in casa, e valutare PartyServer per il DO. |
| [cloudflare/workers-chat-demo](https://github.com/cloudflare/workers-chat-demo) | 1.1k · 2026-04 | 📖 | Esempio ufficiale di chat con DO + WebSocket (stanze, rate limit): base per il DO `Room`. |
| [mavisakalyan/cloudflare-ws-gameserver](https://github.com/mavisakalyan/cloudflare-ws-gameserver) | 2 | 📖 | Relay WebSocket per giochi con stanze e msgpack su Workers + DO: molto vicino al nostro relay. |
| [Brayden/townies](https://github.com/Brayden/townies) | 58 | 📖 | Gioco multiplayer in **Three.js + Durable Objects**: integrazione end-to-end. |
| [cloudflare/templates](https://github.com/cloudflare/templates) | 2.2k · 2026-11 | 🧩 | Template ufficiali di Workers e DO per il bootstrap del relay. |
| [dmotz/trystero](https://github.com/dmotz/trystero) | 2.8k · 2026-11 | 📖 | WebRTC P2P "senza server" con matchmaking su reti pubbliche. Riferimento per l'evoluzione WebRTC ([03 § 9](03-network-protocol.md#9-evoluzione-futura-webrtc)). |

## 4. Fisica

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [dimforge/rapier](https://github.com/dimforge/rapier) (bindings in `typescript/`) | 6k · 2026-11 | 🧩 | ⚠️ **Novità**: il vecchio repo `dimforge/rapier.js` è **archiviato**; i binding JS/TS ora vivono nel repo principale, in `rapier/typescript`. In S3 si verifica quale pacchetto npm usare. |
| [iliagrigorevdev/bowling](https://github.com/iliagrigorevdev/bowling) | 8 · 2019 | 📖 | "Bowling with accurate physics", Three.js + ammo.js. Utile per i **parametri fisici di birilli e palla** (masse, collider, attriti) come punto di partenza in S3. |
| [winchxyz/wumpus-torture-simulator](https://github.com/winchxyz/wumpus-torture-simulator) | 21 · 2026-09 | 📖🎨 | Sandbox di ragdoll in stile cartoon con **Three.js + Rapier**, senza build e senza asset: è vicino al nostro approccio procedurale. |
| [notchris/mini-golf-3d](https://github.com/notchris/mini-golf-3d) | 14 · 2023 | 📖 | Mini-golf 3D **con editor di livelli** (three.js + cannon.js): idee per l'editor delle buche del golf. |
| [subprotocol/verlet-js](https://github.com/subprotocol/verlet-js) | 3.8k · 2019 | 📖 | Motore verlet minimale, da usare come riferimento per la **retina del canestro** ([free-throw](games/free-throw.md)). |
| [gkjohnson/three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 3.5k · 2026-11 | 🧩 | Raycast veloci su mesh: puntamento sulla testa nel **barber shop**, hit test nella scherma. |

## 5. Rendering e stile "Soft Toy"

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | 117k | 🧩 | Motore di base. Esempi utili: `MeshToonMaterial`, `CCDIKSolver` per l'IK del braccio dei Bubù, `RoundedBoxGeometry`, `LatheGeometry`. |
| [FarazzShaikh/THREE-CustomShaderMaterial](https://github.com/FarazzShaikh/THREE-CustomShaderMaterial) | 1.4k · 2025-10 | 🧩 | Estende i materiali standard con shader propri senza riscriverli: il modo più pulito per aggiungere **rim light, AO dai vertex color e ramp morbida** ([07 § 3](07-art-direction.md#3-shading)). |
| [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) | 2.9k · 2026-11 | 🧩 | Post-processing efficiente (FXAA/SMAA, bloom) per i tier Mid/High. |
| [OmarShehata/webgl-outlines](https://github.com/OmarShehata/webgl-outlines) | 415 · 2022 | 📖 | Outline in post-process basato su normali e depth: alternativa all'inverted hull per i contorni dei Bubù. |
| [gkjohnson/three-jumpflood-demo](https://github.com/gkjohnson/three-jumpflood-demo) | 113 · 2025-12 | 📖 | Outline e glow con Jump Flood: contorni spessi e morbidi in stile giocattolo. |
| [Faraz-Portfolio/demo-2023-toon-shader](https://github.com/Faraz-Portfolio/demo-2023-toon-shader) | 2 · 2026-06 | 📖 | Replica in Three.js del nodo Color Ramp di Blender: utile per far combaciare la **ramp** tra Blender e il gioco. |
| [spxrshofficial/fur-gl](https://github.com/spxrshofficial/fur-gl) | 0 · 2026-05 | 📖 | Pelo con **shell instancing**: la tecnica prevista per i capelli del [barber shop](games/barber.md). |
| [Lulzx/rat-runner](https://github.com/Lulzx/rat-runner) | 0 · 2026-07 | 📖 | Shell fur di qualità con alpha-to-coverage in Three.js, sempre per il barber. |
| [Alchemist0823/three.quarks](https://github.com/Alchemist0823/three.quarks) | 1.2k · 2026-05 | 🧩 | Sistema di particelle e VFX: coriandoli, polvere, ciuffi di capelli. |
| [code-yeongyu/wobble-rush-3d](https://github.com/code-yeongyu/wobble-rush-3d) | 3 | 🎨 | Racer 3D "original toy-like" nel browser: riferimento di stile giocattoloso. |
| [StarKnightt/summer-cycle](https://github.com/StarKnightt/summer-cycle) | 70 · 2026-11 | 🎨📖 | Gioco toon-shaded in Three.js, tutto procedurale: ottimo per vedere toon, luci e cielo senza asset. |
| [Puiching-Memory/rainy-night-konbini](https://github.com/Puiching-Memory/rainy-night-konbini) | 0 · 2026-10 | 🎨📖 | Diorama toon-shaded **senza Blender e senza asset esterni**: è l'approccio "diorama" di [07 § 7](07-art-direction.md#7-ambienti). |

## 6. Animazione, IK, matematica

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [pmndrs/maath](https://github.com/pmndrs/maath) | 1.3k · 2026-11 | 🧩 | Damping, easing, utility per vettori e quaternioni: smoothing della camera e della posa. |
| [tweenjs/tween.js](https://github.com/tweenjs/tween.js) | 10k · 2026-10 | 🧩 | Tween per camera, UI 3D e sweeper del bowling. |
| [jsantell/THREE.IK](https://github.com/jsantell/THREE.IK) | 591 · 2023 | 📖 | IK FABRIK per Three.js. Per i 2 segmenti del braccio dei Bubù basta un IK analitico, da scrivere in poche righe; qui c'è il riferimento. |

## 7. Audio

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [KilledByAPixel/ZzFX](https://github.com/KilledByAPixel/ZzFX) | 808 · 2026-11 | 🧩 | SFX procedurali in < 1 KB: click della UI, tick, "bonk", ding. Peso quasi zero ([07 § 9](07-art-direction.md#9-audio)). |
| [chr15m/jsfxr](https://github.com/chr15m/jsfxr) | 462 · 2026-05 | 🧩 | Generatore di effetti sonori, per creare e esportare SFX originali. |
| [goldfire/howler.js](https://github.com/goldfire/howler.js) | 25k · 2025-11 | 🧩 (opzionale) | Audio cross-browser, con sblocco su iOS, sprite e bus. In alternativa si usa direttamente Web Audio. |

## 8. Tooling

| Repo | ★ | Uso | Note |
|---|---|---|---|
| [donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform) | 2.1k · 2026-10 | 🧩 | Pipeline degli asset: meshopt, quantize, prune ([06 § 3](06-rendering-physics.md#3-asset-pipeline)). |
| [liuweiGL/vite-plugin-mkcert](https://github.com/liuweiGL/vite-plugin-mkcert) | 771 · 2026-07 | 🧩 | HTTPS locale fidato per Vite, così i sensori funzionano sul telefono in LAN senza avvisi. |
| [Menci/vite-plugin-wasm](https://github.com/Menci/vite-plugin-wasm) | 434 · 2026-03 | 🧩 (se serve) | Per caricare Rapier in versione non-compat (WASM separato, più leggero da cacheare). |
| [preactjs/signals](https://github.com/preactjs/signals) | 4.5k · 2026-10 | 🧩 | Stato reattivo tra loop di gioco e HUD ([ADR-008](adr/ADR-008-preact-ui-overlay.md)). |
| [unjs/uqr](https://github.com/unjs/uqr) | 784 · 2026-04 | 🧩 | Generazione di QR in SVG, piccola e senza dipendenze, per la lobby. |
| [cocopon/tweakpane](https://github.com/cocopon/tweakpane) | 4.6k · 2026-03 | 🧩 | **Pannello di tuning** per i parametri di fisica e recognizer ([bowling § 4](games/bowling.md#4-fisica-gamesbowlingscreenphysicsts)). |
| [mrdoob/stats.js](https://github.com/mrdoob/stats.js) | 9.2k | 🧩 | FPS e frame time nell'overlay di debug. |
| [ai/size-limit](https://github.com/ai/size-limit) | 7k · 2026-11 | 🧩 | Budget dei bundle in CI ([06 § 4](06-rendering-physics.md#4-budget-prestazioni)). |

---

## Impatto sulle decisioni già prese

> ✅ **Applicato il 2026-11-04**: punti 1–3 in [ADR-007](adr/ADR-007-native-websocket.md), [ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md) e [ADR-003](adr/ADR-003-threejs-rapier.md); punto 4 in [03 § 5](03-network-protocol.md#5-latenza-e-interpolazione), [02 § Sviluppo locale](02-architecture.md#sviluppo-locale) e [09 § Fase 2](09-roadmap.md#fase-2--piattaforma). Il punto 5 si decide in S1.

1. **ADR-007 (WebSocket nativo)** → si può sostituire il wrapper fatto in casa con **PartySocket**. Il protocollo resta lo stesso, si risparmiano circa 200 righe da scrivere e testare.
2. **ADR-001 (relay su DO)** → **PartyServer** semplifica il DO `Room`. È da valutare nello spike S2, insieme a un DO "puro" in stile `workers-chat-demo`.
3. **ADR-003 (Rapier)** → `rapier.js` è archiviato: in S3 si verifica il pacchetto npm attuale, che viene da `dimforge/rapier/typescript`.
4. **Input di movimento** → da Pocket Sports prendiamo due idee:
   - **dead-reckoning lato schermo**: si proietta la posa in avanti con ω per la latenza misurata. Riduce il ritardo percepito del braccio del Bubù e si aggiunge al buffer di interpolazione di [03 § 5](03-network-protocol.md#5-latenza-e-interpolazione);
   - un **Controller Lab** (telefono 3D che segue quello reale, con le letture dei sensori), da inserire tra gli strumenti di sviluppo della Fase 2.
5. **Orientamento** → `psiphi75/ahrs` è il primo candidato per il filtro (Madgwick), contro un filtro complementare scritto da noi (S1).

---

## Aggiornamento del 2026-11-05

Seconda ricerca su GitHub, mirata a **giochi da cui prendere idee** e a **funzioni per migliorare il controllo**. Sono elencati solo i repo nuovi rispetto alle sezioni precedenti. ⚠️ Un repo senza licenza si può solo **studiare**: il codice non si copia.

### 9. Altri progetti "telefono = controller"

| Repo | ★ · licenza | Uso | Perché è utile |
|---|---|---|---|
| [choijunhuk/phonemote](https://github.com/choijunhuk/phonemote) | 0 · MIT · 2026-10 | 📖 **Da studiare per primo** | TS, 9 giochi (tennis, bowling, tiro con l'arco, golf, sci…). Il telefono manda solo **frame grezzi binari** (68 byte) e la loro interpretazione avviene tutta sul PC: pipeline `normalize → fuse → detect → GameAction`, e una regola ESLint impedisce alle scene di leggere i sensori. `ARCHITECTURE.md` (in coreano) raccoglie 64 decisioni prese misurando telefoni veri: **assi di `rotationRate` di Chrome diversi dalla specifica**, correzione per la rotazione dello schermo, solo RTT (niente latenza one-way), Wake Lock riacquisito su `visibilitychange`. Debug overlay con RTT mediana/p95, Hz e perdita di pacchetti. Contiene anche un giocatore da tastiera che sintetizza frame di sensori. |
| [doncebay/tennis-training](https://github.com/doncebay/tennis-training) | 3 · MIT · 2026-09 | 📖 | Tennis con il telefono come racchetta. Lo swing si rileva al **picco della velocità angolare**, e la velocità dello swing dà la potenza; **il timing decide la direzione** (in anticipo = incrociato, in ritardo = lungolinea). Il giocatore si muove da solo verso la palla. Sul telefono c'è un "pock" sonoro a ogni colpo. JS senza build. |
| [kuehn-lars/CouchCourt](https://github.com/kuehn-lars/CouchCourt) | 6 · MIT · 2026-10 | 📖 | Tennis locale multiplayer **pensato per iPhone/Safari**: un solo tap per il permesso dei sensori, dritto/rovescio riconosciuti dal gesto, forza = intensità dello swing. TS + Vite + Three.js. |
| [veersaraf/kaleydo-world](https://github.com/veersaraf/kaleydo-world) | 0 · MIT · 2026-10 | 📖🎨 | Tennis, bowling, **duello con la spada**, tiro con l'arco, home run derby. Tutto generato via codice (niente modelli, texture o file audio), con split screen per il versus locale. Da studiare per la [scherma](games/fencing.md). |
| [rghvagrwl/putt-pals](https://github.com/rghvagrwl/putt-pals) | 0 · **nessuna licenza** · 2026-08 | 📖 (solo studio) | Minigolf da party, con due controlli: **fionda trascinando sul touch** oppure **swing vero (mira con la bussola + potenza dall'accelerometro)**. Il giocatore che si riconnette ritrova la sua palla e i turni AFK vengono saltati. Utile per il [golf](games/golf.md). |
| [PHMFG/boom-pets](https://github.com/PHMFG/boom-pets) | 1 · MIT · 2026-10 | 📖 | 8 minigiochi con joystick + un tasto e una ruota che estrae il gioco. Bot nei posti vuoti, il telefono che cade riprende il suo personaggio, `?solo&autostart` per una partita di soli bot. Ogni partita viene registrata e **`pnpm report` produce un report di playtest**. |
| [foster-curtis/phone-controller-games](https://github.com/foster-curtis/phone-controller-games) | 0 · MIT · 2026-11 | 📖 | Monorepo pnpm molto simile al nostro. `packages/controller-kit` contiene shell del telefono, widget di input, gesti e **dev harness**; `game-kit` loop a passo fisso e RNG con seed. Controllo del bundle per ogni gioco. |
| [vucinatim/air-jam](https://github.com/vucinatim/air-jam) | 8 · MIT · 2026-11 | 📖 | Framework open source alternativo ad AirConsole (React, TS). Da confrontare con il nostro [contratto modulo](05-game-module-contract.md). |
| [stixez/ac-playtest](https://github.com/stixez/ac-playtest) | 0 · MIT · 2026-10 | 📖 | Playtest **scriptati con Playwright**: schermo + N telefoni simulati, con touch "trusted", ingressi e uscite. Idea da portare nei nostri `e2e/`. |

### 10. Controllo: librerie e tecniche

| Repo | ★ · licenza | Uso | Note |
|---|---|---|---|
| [lochie/web-haptics](https://github.com/lochie/web-haptics) | 2.8k · MIT · 2026-09 | 🧩 | Feedback aptico sul web mobile, **anche su iOS**, dove `navigator.vibrate` non esiste: oggi le nostre chiamate in `Calibrate.tsx` e `BowlingPad.tsx` sull'iPhone non fanno nulla. Su iOS funziona solo dentro un gesto dell'utente (tap), quindi va bene per i bottoni ma non per la vibrazione all'impatto durante uno swing. |
| [samdenty/ios-vibrator-pro-max](https://github.com/samdenty/ios-vibrator-pro-max) | 278 · nessuna licenza · 2026-06 | 📖 | Polyfill di `navigator.vibrate` per Safari, con lo stesso trucco dello switch nascosto. Il README spiega bene i limiti: da iOS 18.4 serve l'interazione dell'utente. Altri repo segnalano che con iOS 26.5 il trucco non funziona più: va **verificato su un iPhone vero**. |
| [casiez/OneEuroFilter](https://github.com/casiez/OneEuroFilter) (npm `1eurofilter`) | 264 · 2026-08 | 🧩 (verificare la licenza npm) | **Filtro 1€**: smoothing adattivo (forte da fermi, quasi nullo in movimento). È la forma standard dello "smoothing adattivo" di Pocket Sports, per la **mira col telefono** del bowling e il puntamento del barber, senza aggiungere ritardo agli swing. Sono poche righe: si può anche riscrivere seguendo il paper. |
| [herenickname/timesync](https://github.com/herenickname/timesync) | 0 · MIT · 2025-12 | 🧩/📖 | Fork TS di `enmasseio/timesync`: offset del clock tra telefono e schermo via WebSocket. Serve se vogliamo **marcare il gesto con l'ora del telefono** e collocarlo con precisione sulla timeline dello schermo (timing del tennis, rilascio del bowling). |
| [GordonLesti/dynamic-time-warping](https://github.com/GordonLesti/dynamic-time-warping) | 52 · MIT · 2017 | 📖 | DTW in JS: riconosce un gesto confrontandolo con un template registrato. Utile per i gesti "a forma" (affondo della scherma, taglio col rasoio) dove una soglia sola non basta. |
| [wcchoi/dollar-q](https://github.com/wcchoi/dollar-q) | 17 · MIT · 2019 | 📖 | Riconoscitore **$Q** in JS, per gesti disegnati sul touch, per esempio un minigioco di disegno o un menu a gesti. |

### 11. Giochi singoli da studiare (fisica e gameplay)

| Repo | ★ · licenza | Note |
|---|---|---|
| [bridge-mind/tideline](https://github.com/bridge-mind/tideline) | 10 · MIT | Pesca 3D in Three.js, procedurale e senza build: lancio e recupero si adattano bene a un **minigioco di pesca** con il telefono come canna. |
| [dammafra/hook-a-fish](https://github.com/dammafra/hook-a-fish) | 43 · **AGPL** | Pesca da luna park in Three.js. Licenza AGPL: si guarda solo come riferimento visivo, il codice non si copia. |
| [LiamOsler/curling](https://github.com/LiamOsler/curling) | 0 · nessuna licenza | Curling 3D in Three.js: la fisica degli scivolamenti e degli urti è vicina a quella delle **bocce** ([bocce](games/bocce.md)). Solo studio. |

### Cosa conviene fare (proposta)

1. **Haptics su iOS** con `web-haptics` per i bottoni e le conferme del telefono. È piccolo e sistema un buco reale: l'iPhone oggi non vibra mai.
2. **Filtro 1€** sulla mira col telefono del bowling, al posto di uno smoothing fisso o in aggiunta a esso.
3. Leggere le decisioni D1–D64 di **PhoneMote**, soprattutto gli assi di `rotationRate` misurati, e confrontarle con `packages/motion/src/adapter.ts`.
4. Per i prossimi giochi: **tennis-training / CouchCourt** per il timing dello swing (utile anche per la scherma), **putt-pals** per i due modi di controllo del golf, **kaleydo-world** per la spada.
5. Debug overlay con **RTT p95, Hz e perdita di pacchetti** sul modello di PhoneMote, da affiancare al Controller Lab già previsto.
