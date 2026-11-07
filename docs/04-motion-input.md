# 04 — Input di movimento

Il pilastro "sensazione reale" si gioca qui. In sintesi: **il telefono misura, filtra e riconosce il gesto; lo schermo mostra e simula.**

## 1. Pipeline sul telefono

```
devicemotion (60–100+ Hz)
   │  accelerationIncludingGravity, acceleration, rotationRate, interval
   ▼
SensorAdapter ── normalizza assi/unità/segni per piattaforma → SensorSample {t, gyro[rad/s], acc[m/s²], accG[m/s²]}
   ▼
OrientationFilter ── fusione giroscopio + gravità → quaternione q (yaw relativo)
   ▼
Calibration ── applica l'offset di yaw "verso lo schermo"
   ├──► PoseStreamer (30 Hz) ──► frame binario di posa ──► schermo (solo visualizzazione)
   ▼
Recognizer del gioco (macchina a stati, alla frequenza nativa)
   ▼
Evento gesto {speed, spin, dir, tRelease, confidence} ──► schermo (decide l'esito)
```

Tutto vive in `packages/motion`. I giochi forniscono solo il loro `Recognizer`, costruito con le primitive comuni.

## 2. Permessi e verifica hardware (obbligatoria)

Requisito: **il telefono si collega solo se ha sia accelerometro sia giroscopio funzionanti** ([ADR-006](adr/ADR-006-require-gyro-and-accelerometer.md)).

### Flusso
1. **Contesto sicuro.** Se `!window.isSecureContext` compare un errore (succede solo in sviluppo).
2. **API presenti.** Se `DeviceMotionEvent` non esiste → *non compatibile*.
3. **Tap su "Connetti"** (è necessario: iOS concede i permessi solo dentro un gesto).
   - Se esiste `DeviceMotionEvent.requestPermission`, si chiama: con un rifiuto compare la schermata *"Permesso negato"* con le istruzioni per riabilitarlo (Impostazioni → Safari → Movimento e orientamento, oppure ricaricare la pagina).
   - Si chiede anche `DeviceOrientationEvent.requestPermission`, se esiste: alcuni iOS lo richiedono separatamente.
   - Nello stesso tap si sblocca l'`AudioContext` e si chiede il Wake Lock.
4. **Sonda sensori, 1,5 s.** Si chiede al giocatore di *"tenere il telefono in mano e muoverlo un po'"* con un'animazione e si raccolgono gli eventi:

| Controllo | Criterio di superamento |
|---|---|
| Eventi ricevuti | ≥ 30 eventi `devicemotion` in 1,5 s |
| Frequenza | `interval` mediano ≤ 33 ms (≥ 30 Hz). Tra 20 e 33 ms si mostra un avviso "precisione ridotta" ma si accetta. |
| **Giroscopio** | `rotationRate` non è null e ha alfa/beta/gamma **non tutti costanti**: varianza > soglia su almeno un asse, oppure, se il telefono è perfettamente fermo, rumore > 0 |
| **Accelerometro** | `accelerationIncludingGravity` non è null e il modulo è circa 9,8 m/s² (±25%) a riposo |
| Coerenza | il giroscopio integrato e l'inclinazione dalla gravità concordano entro una tolleranza (rileva sensori finti o fusi male) |

5. **Esito.**
   - ✅ si invia `hello{capabilities}` con `{ gyro:true, accel:true, hz, platform }`.
   - ❌ compare la schermata **"Questo telefono non ha i sensori necessari per giocare"**, con il dettaglio di cosa manca. **Non c'è join** e non viene occupato nessuno slot.
6. Anche il relay rifiuta un `hello` senza `gyro && accel` (`UNSUPPORTED_DEVICE`). È un controllo di coerenza: un client modificato potrebbe mentire, ma non è un rischio di sicurezza.

> Il simulatore di sviluppo ([02 § Sviluppo locale](02-architecture.md#sviluppo-locale)) bypassa la sonda solo nella build di sviluppo.

## 3. SensorAdapter
Normalizza in un sistema di riferimento unico, **il frame del dispositivo**:
- **X** verso destra dello schermo del telefono, **Y** verso l'alto (lato superiore), **Z** uscente dallo schermo.
- Giroscopio in **rad/s**, accelerazioni in **m/s²**.
- Gestisce le differenze note tra browser (`rotationRate` in °/s, assi alfa/beta/gamma mappati diversamente).
- **Ordine degli assi verificato, non indovinato** (`axis-check.ts`, da PhoneMote D27). PhoneMote ha misurato su Chrome Android `rotationRate.alpha/beta/gamma` = x/y/z invece del z/x/y della specifica. Durante la calibrazione il telefono confronta le due letture con la fisica: la gravità è ferma nel mondo, quindi nel frame del telefono ruota di −ω. Vince l'ordine che prevede meglio come si è mossa `accelerationIncludingGravity`; se nessuno la spiega bene (errore relativo > 0,6) o il movimento è poco, non si cambia nulla. L'esito si salva in `sessionStorage` ed è visibile in `?debug`.
  - ⚠️ Le tracce di PhoneMote non bastano a confermare il loro risultato: la gravità lì è ricostruita dall'orientamento e i segni della ricostruzione non sono verificabili. Va confermato su telefoni veri (Android e iPhone).
- **Schermo ruotato**: se `screen.orientation.angle ≠ 0`, giroscopio e accelerazioni si ruotano attorno a Z per tornare agli assi del telefono in verticale (Chrome non lo fa).
- **Offset del giroscopio** (`gyro-bias.ts`): stimato solo in finestre di 500 ms in cui ogni asse resta sotto 3 °/s, limitato a 2 °/s, sottratto prima del filtro. Una mira lenta (≈ 8 °/s) non apre mai la finestra.
- **Telefono fermo** (`stillness.ts`): |ω| mediato con costante di tempo di 300 ms; fermo sotto 8 °/s, di nuovo in movimento sopra 16 °/s. Separazione misurata da PhoneMote: tavolo 0,17 °/s, mano ferma 3,3, camminata 54, swing > 300.
- Timestamp: `event.timeStamp` (monotono), convertito nel clock del DO tramite l'offset di sincronizzazione ([03 § 4](03-network-protocol.md#4-clock-sync)).

## 4. Orientamento
- **Fusione propria** di giroscopio + accelerometro con filtro complementare (o Madgwick, si sceglie in S1):
  - si integra il giroscopio per avere un orientamento reattivo;
  - la gravità corregge lentamente pitch e roll (guadagno basso, e quasi nullo durante movimenti bruschi, quando |a| si discosta da g).
- **Yaw relativo.** Non usiamo la bussola (`alpha` di `deviceorientation` assoluto): vicino a TV, altoparlanti e metallo è inaffidabile. Lo yaw deriva lentamente, e lo gestiamo con la calibrazione.
- Output: quaternione unitario, inviato a 30 Hz come posa e usato a piena frequenza dal recognizer.
- **Integrazione trapezoidale** (PhoneMote D39): si integra la media tra il campione precedente e quello attuale, non la ω istantanea. Su uno swing registrato dimezza l'errore d'assetto a due secondi.
- I riconoscitori dei giochi ricevono i campioni fusi con `tracker.subscribe()`: ω senza offset, accelerazioni, quaternione, `up` (alto del mondo nel frame del telefono) e stato "fermo".

## 5. Calibrazione
- **Calibrazione iniziale**, dopo il join: *"Punta il telefono verso lo schermo e premi il tasto"*. Lo yaw corrente diventa lo zero.
- **Ricalibrazione automatica.** Quando il giocatore preme il tasto azione con il telefono quasi fermo (|ω| < soglia per 150 ms), lo yaw si riallinea alla direzione neutra prevista dal gioco. Nel bowling è "palla davanti al petto, verso la pista".
- **Tasto "Ricalibra"** sempre disponibile sul controller.
- Lo schermo può chiedere una calibrazione (`cue{kind:'flash', pattern:'calibrate'}`) se rileva un drift evidente, per esempio una mira sistematicamente fuori schermo.

## 6. Recognizer

### Struttura comune
```ts
interface Recognizer<E> {
  reset(): void;
  onSample(s: FusedSample): void;          // FusedSample = SensorSample + q + tSync
  onButton(id: ButtonId, down: boolean, t: number): void;
  onTrackpad(x: number, y: number, phase: 'start'|'move'|'end'): void;
  readonly state: string;                   // per debug/HUD
  onEvent(cb: (e: E) => void): void;
}
```

### Primitive condivise (`packages/motion/recognize`)
| Primitiva | Cosa fa |
|---|---|
| `RingBuffer<FusedSample>` | Ultimi N campioni (es. 1 s) per le analisi a ritroso |
| `PeakDetector` | Picchi di |ω| o |a| con isteresi e tempo minimo |
| `SwingPhaseTracker` | Segue la fase di uno swing pendolare su un asse: indietro → inversione → avanti |
| `ReleaseEstimator` | Al rilascio stima la velocità tangenziale (ω × raggio), la direzione (yaw) e la rotazione del polso negli ultimi 100 ms |
| `StillnessDetector` | Rileva il telefono fermo: per la calibrazione e per annullare gesti accidentali |
| `AssistCurve` | Mappa un valore misurato su un valore di gioco, con dead-zone, saturazione e curva a S |

### Esempio: bowling
```
idle ──(tasto giù)──► armed ──(ω_pitch < -soglia: braccio va indietro)──► backswing
backswing ──(inversione del segno di ω_pitch)──► forward
forward ──(tasto su)──► RELEASE → evento bowling.release
qualsiasi ──(tasto su senza swing valido)──► idle + "cancel" (la palla resta in mano)
```
I dettagli di stima di velocità, spin e direzione sono nel [GDD del bowling](games/bowling.md#3-controlli-e-riconoscimento-del-gesto).

### Colpi senza tasto (`burst.ts`) e puntatore (`pointer.ts`)
Per i giochi senza tasto (golf, tennis, scherma) il colpo si riconosce al picco di |ω|, da `SwingDetector` di PhoneMote: si arma sopra 400 °/s e si riarma sotto 110 °/s; la cattura riprende i campioni appena prima dell'armo e si chiude quando |ω| scende al 60% del picco o dopo 400 ms; serve un'accelerazione lineare di almeno 12 m/s². Un colpo più forte che inizia entro 120 ms da un altro lo sostituisce (`replacesPrevious`, D29: backswing seguito dal colpo vero). La potenza è relativa alla scala del giocatore (D42).
Il puntatore integra yaw e pitch letti nel frame del mondo (vale con qualsiasi presa), con filtro 1€, deadzone di 2 °/s con isteresi e ricentratura. Per il barbiere c'è anche la **mira dal retro** (`aim.ts`): col telefono dritto conta la direzione del retro, letta dall'orientamento fuso (non integrando velocità con una zona morta, che si mangiava i movimenti lenti). Manda una mira senza limiti (`ax`, `ay`) di cui il gioco usa i movimenti, come un mouse, più un guinzaglio anti-tremore di mezzo grado. `grip.ts` misura rollio e beccheggio con il segno rispetto alla presa catturata, dalla gravità e non dagli angoli di Eulero.

### Perché il pollice e non un picco di accelerazione per il rilascio?
- È **deterministico**: il giocatore decide il momento esatto, come aprire la mano.
- Elimina i falsi positivi.
- Il telefono non lascia mai la mano: è sicuro.

## 7. Tracce: registrazione e uso
- Il **trace recorder** (`?rec` sul telefono, bottone ● REC) registra gli eventi `devicemotion` e scarica un JSON con le colonne `t, agx, agy, agz, lx, ly, lz, ra, rb, rg` (`packages/motion/src/trace.ts`).
- Le tracce dei test stanno in `packages/motion/test/traces/`. Le prime sei vengono da PhoneMote, convertite con `node scripts/convert-pmtrace.ts <cartella .pmtrace> <uscita>`: due da un telefono vero (`real-rest`, `real-swing`), quattro sintetiche (tavolo, camminata, dieci swing, sensore bloccato). `corpus.test.ts` controlla che a riposo e camminando non scatti nessun colpo, che ogni swing scatti una volta sola, e il comportamento di offset, fermo e puntatore.
- Usi:
  1. **Test:** ogni recognizer ha test di regressione sulle tracce ("lancio forte dritto" → velocità > 8 m/s, |spin| < 0,2; "lancio con hook a sinistra" → spin < 0; "tasto premuto e rilasciato senza swing" → nessun evento).
  2. **Tuning:** uno strumento di sviluppo mostra i grafici di ω e a con le fasi riconosciute sovrapposte.
  3. **Simulatore:** il simulatore di sviluppo riproduce le tracce come se fossero un telefono vero.
- Obiettivo minimo per il bowling: 30 tracce per piattaforma (iOS e Android), da almeno 3 persone diverse.

## 8. Feedback sul telefono
Implementato in `apps/web/src/controller/haptics.ts` sopra `web-haptics` (MIT): su Android `navigator.vibrate`, su iPhone lo switch nascosto che Safari accompagna con un tick. Su iOS il tick arriva solo dentro un gesto dell'utente (tap o rilascio del pollice); per gli eventi mandati dallo schermo (`haptics.cue`) su iOS si suona invece un click breve, con l'audio sbloccato al tap su "Connetti". Da verificare sugli iPhone con iOS 26.5, dove alcuni progetti segnalano che il trucco dello switch non funziona più.

| Momento | Android | iOS |
|---|---|---|
| Rilascio palla | `vibrate(30)` | tick con switch (best-effort) + click audio |
| Impatto birilli | `vibrate([20,30,60])`, intensità ∝ birilli abbattuti | tick + suono "crash" breve |
| Errore o fallo | `vibrate([10,40,10])` | suono "bonk" |
| Tocca a te | `vibrate(80)` | suono "ding" + flash dello schermo |

- Il pattern lo decide **lo schermo** (con `cue`) o il **recognizer locale** (il rilascio è immediato e non aspetta la rete).
- L'audio del telefono rispetta un'impostazione "Suoni controller ON/OFF". Su iOS lo switch muto fisico lo silenzia: è un limite noto e accettato.

## 9. Sicurezza fisica
- Al primo avvio compare una schermata breve: *"Tieni il telefono ben saldo. Non lanciarlo! Se hai un laccetto, usalo. Lascia spazio intorno a te."*
- Nessun gioco richiede di aprire la mano: si rilascia sempre il pollice dal tasto.
- Nella scherma (1v1) i giocatori stanno uno accanto all'altro rivolti allo schermo, non uno di fronte all'altro.
