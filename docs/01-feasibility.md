# 01 — Fattibilità

Verdetto generale: **il progetto è fattibile con tecnologie web standard e a costo zero**. Il rischio vero non è tecnico ma di *tuning*: il passo difficile è trasformare segnali di sensori rumorosi in un tiro che "si sente vero". Per questo la roadmap parte da spike di misura su telefoni reali ([09](09-roadmap.md)).

---

## 1. Fattibilità per tecnologia

### 1.1 Sensori di movimento dal browser
| Aspetto | Stato | Note |
|---|---|---|
| `DeviceMotionEvent` (accelerazione + `rotationRate`) | ✅ Supportato su iOS Safari e Android Chrome | `rotationRate` è in °/s; è `null` se manca il giroscopio. |
| `DeviceOrientationEvent` | ✅ | `alpha` dipende dalla bussola ed è rumoroso: **non lo usiamo** per lo yaw ([04](04-motion-input.md)). |
| Permesso iOS | ⚠️ Serve `DeviceMotionEvent.requestPermission()` chiamato **dentro un gesto dell'utente** (tap). | Va gestito nel flusso "Connetti". |
| HTTPS | ⚠️ Obbligatorio | Cloudflare Pages lo fornisce di default. |
| Frequenza di campionamento | ⚠️ Variabile per dispositivo | Si legge da `event.interval`. Tipicamente 60–100 Hz, ma **va misurata** (spike S1). Sotto i 30 Hz il telefono viene rifiutato. |
| Generic Sensor API (`Gyroscope`, `Accelerometer` con frequenza scelta) | Solo Chromium | Utile come miglioria su Android, non come base. |
| Coordinate iOS vs Android | ⚠️ Storicamente con segni e assi diversi | Le normalizza un `SensorAdapter`, coperto da test su tracce reali. |

**Conclusione:** l'orientamento si ricava bene dal giroscopio; le accelerazioni bastano per stimare i picchi (affondo, impatto). La **velocità lineare non si ottiene integrando l'accelerazione**, perché deriva in pochi decimi di secondo. Si stima invece dalla **velocità angolare × raggio del braccio**, lo stesso principio dei controller di movimento commerciali.

### 1.2 Feedback sul telefono
| API | iOS | Android | Decisione |
|---|---|---|---|
| `navigator.vibrate` | ❌ Non esiste in nessun browser iOS (W3C implementation report, 2026) | ✅ | Su Android si usa la vibrazione vera. |
| Tick aptico via `<input type="checkbox" switch>` | ⚠️ Comportamento non documentato (Safari 17.4+), può rompersi | — | Best-effort su iOS, dietro feature flag. |
| Suono (Web Audio) | ✅ dopo un gesto dell'utente; ⚠️ silenziato dallo switch muto | ✅ | Click brevi come feedback complementare. |
| Wake Lock | ✅ iOS 16.4+ | ✅ | Lo schermo del telefono resta acceso. |
| Fullscreen API | ❌ su iPhone | ✅ | Su iOS si suggerisce "Aggiungi a Home" (PWA) per avere più spazio. |

### 1.3 Rete
| Opzione | Pro | Contro | Verdetto |
|---|---|---|---|
| Socket.io su Render free | Familiare | Si spegne dopo 15 min di inattività, riavvio di ~1 min, possibili riavvii in qualsiasi momento | ❌ |
| **WebSocket su Cloudflare Workers + Durable Objects** | Nessun cold start percepibile, edge vicino agli utenti, stesso provider di Pages, piano free con WebSocket Hibernation | Limiti free giornalieri da verificare; ambiente runtime Workers | ✅ **Scelta** ([ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md)) |
| WebRTC DataChannel P2P | Latenza minima in LAN | Fallisce con client isolation o NAT simmetrico senza TURN; signaling comunque necessario | Evoluzione futura, con fallback al relay |

La porta 443 (WSS) passa i firewall delle reti universitarie e il CGNAT mobile. Due dispositivi su reti diverse (telefono in 4G, schermo su Eduroam) parlano comunque, perché si incontrano sul relay.

**Latenza attesa:** telefono → edge Cloudflare → schermo, tipicamente 20–80 ms in Italia, con picchi su 4G. È accettabile perché:
1. l'**esito** del tiro si calcola sul telefono, quindi la latenza lo *ritarda* senza *cambiarlo*;
2. la **posa** serve solo a visualizzare il braccio, e un buffer di interpolazione di circa 50 ms la rende fluida.

### 1.4 Rendering 3D nel browser
- **Three.js** su WebGL2 copre tutti gli schermi target, inclusi iPad e Safari. WebGPU è un'opzione futura.
- Uno stile *toon morbido* senza texture (vertex color + gradient ramp) costa poco alla GPU e alla rete. 60 fps sono realistici su iPad 9ª gen.
- Rischio: Smart TV con browser deboli. **Mitigazione:** non sono un target; si usa laptop + HDMI o cast.

### 1.5 Fisica
- **Rapier3D** (WASM) ha CCD per oggetti veloci, attrito per collider, passi fissi ed è sufficientemente veloce per 10 birilli + palla anche a 240 Hz.
- Peso del modulo `rapier3d-compat`: va misurato (spike S3). Si carica solo sullo schermo e solo quando un gioco lo richiede.
- Fenomeni che Rapier non modella nativamente e che richiedono codice nostro: **resistenza al rotolamento** (bocce su sabbia), **aerodinamica** con drag ed effetto Magnus (golf, basket), **olio della pista** (risolto con due collider ad attrito diverso, vedi [bowling](games/bowling.md)).

---

## 2. Fattibilità per gioco

Scala: 🟢 alta · 🟡 media · 🟠 medio-bassa.

| Gioco | Fattibilità | Gesto | Rischio principale | Mitigazione |
|---|---|---|---|---|
| **Bowling** | 🟢 | Swing dal basso, rilascio del pollice, rotazione del polso | Rendere credibile il mapping swing → velocità; tuning dei birilli | Tracce reali + curva di assist; sandbox con mouse (S3) |
| **Bocce** | 🟢 | Lancio dal basso: accosto morbido o bocciata | Resistenza al rotolamento sulla sabbia | Damping/forza custom; riuso del 70% della tecnologia del bowling |
| **Tiri liberi** | 🟢 | Spinta verso l'alto con flessione del polso | Dosare la potenza è difficile al primo tiro | Sweet spot assistito; arco guida visibile nei primi tiri |
| **Golf** | 🟡 | Backswing + downswing a due mani, faccia del bastone | Aerodinamica custom; molti contenuti (buche, terreno) | Si parte con driving range + putting green, poi 3 buche |
| **Barber shop** | 🟡 | Il telefono è il tagliacapelli: lo si inclina e lo si muove; tap per le forbici | Puntare in 3D con il solo orientamento (drift, precisione) | Capelli come mappa di "lunghezze" su DataTexture; dwell assist; ricalibrazione rapida |
| **Scherma** | 🟠 | Il telefono è il fioretto: orientamento 1:1, affondo come picco di accelerazione | Duello simultaneo 1v1 con latenza; nessun tracking di posizione; i giocatori potrebbero colpirsi | Timestamp sincronizzati per decidere chi tocca prima; finestre di parata generose; avvisi di distanza; **per ultimo** |

---

## 3. Rischi trasversali

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Frequenza dei sensori troppo bassa su alcuni Android | Media | Alto | Soglia minima nella verifica hardware; i recognizer sono robusti a 30–60 Hz |
| Differenze di assi e segni tra browser | Alta | Medio | `SensorAdapter` + test su tracce registrate da ogni piattaforma |
| Drift dello yaw | Alta | Medio | Yaw relativo, ricalibrazione automatica a ogni "tieni premuto" da fermo, tasto Ricalibra |
| Il giocatore lancia il telefono | Bassa | Alto | Meccanica "tieni premuto e rilascia il pollice", avviso laccetto, messaggio di sicurezza al primo avvio |
| Il trucco aptico iOS smette di funzionare | Media | Basso | Feature flag, suono come fallback |
| Limiti free di Cloudflare superati | Bassa | Medio | Hibernation; stream a 30 Hz; misura nello spike S2; si degrada lo stream prima dei messaggi di evento |
| Peso di Rapier | Media | Medio | Caricamento lazy; preload durante la lobby |
| Somiglianza eccessiva con Nintendo (legale) | Media | Alto | Regole esplicite in [07](07-art-direction.md#10-cosa-non-fare); nessun nome "Wii"; personaggi e audio originali |
| Scope creep (6 giochi) | Alta | Alto | Un gioco alla volta; la piattaforma prima di tutto; ogni gioco ha un vertical slice |

---

## 4. Spike tecnici prima di costruire

Gli spike sono prototipi usa-e-getta che rispondono a una domanda con un sì o un no. Dettagli e criteri sono in [09-roadmap § Fase 1](09-roadmap.md#fase-1--spike-gono-go).

| Spike | Domanda |
|---|---|
| **S1 — Sonda sensori** | Su un iPhone e su un Android di fascia media reali, che frequenza e qualità hanno accelerometro e giroscopio? Uno swing da bowling si distingue chiaramente? |
| **S2 — Latenza relay** | Quanto vale il RTT p95 telefono → DO → schermo in 4G e su Wi-Fi? Quanti "request" consuma una partita? |
| **S3 — Sandbox birilli** | Rapier con 10 birilli e una palla con spin produce strike, spare e hook credibili? Quanto pesa e quanto costa al frame? |
| **S4 — Shader Soft Toy** | Lo stile tiene 60 fps su iPad 9ª gen con la scena del bowling? Piace? |

## Fonti
- [Cloudflare Durable Objects — pricing e free tier](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [Render — free web services e WebSocket (changelog 2026)](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)
- [W3C Vibration API — implementation report](https://w3c.github.io/vibration/reports/implementation.html)
- [ios-vibrator-pro-max — trucco aptico con input switch](https://github.com/samdenty/ios-vibrator-pro-max)
- [MDN — DeviceMotionEvent.interval](https://www-igm.univ-mlv.fr/~forax/MDN/developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/interval.html)
