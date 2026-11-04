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
- Gestisce le differenze note tra browser (segni invertiti, `rotationRate` in °/s, assi alfa/beta/gamma mappati diversamente). La tabella di mapping per piattaforma e versione si costruisce **con lo spike S1** e viene fissata da test sulle tracce registrate.
- Non dipende dall'orientamento dello schermo (portrait o landscape): gli eventi di moto sono sempre nel frame del dispositivo.
- Timestamp: `event.timeStamp` (monotono), convertito nel clock del DO tramite l'offset di sincronizzazione ([03 § 4](03-network-protocol.md#4-clock-sync)).

## 4. Orientamento
- **Fusione propria** di giroscopio + accelerometro con filtro complementare (o Madgwick, si sceglie in S1):
  - si integra il giroscopio per avere un orientamento reattivo;
  - la gravità corregge lentamente pitch e roll (guadagno basso, e quasi nullo durante movimenti bruschi, quando |a| si discosta da g).
- **Yaw relativo.** Non usiamo la bussola (`alpha` di `deviceorientation` assoluto): vicino a TV, altoparlanti e metallo è inaffidabile. Lo yaw deriva lentamente, e lo gestiamo con la calibrazione.
- Output: quaternione unitario, inviato a 30 Hz come posa e usato a piena frequenza dal recognizer.

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

### Perché il pollice e non un picco di accelerazione per il rilascio?
- È **deterministico**: il giocatore decide il momento esatto, come aprire la mano.
- Elimina i falsi positivi.
- Il telefono non lascia mai la mano: è sicuro.

## 7. Tracce: registrazione e uso
- Il **trace recorder** (in sviluppo, e anche in produzione dietro un parametro `?rec=1`) salva `SensorSample[]` grezzi + eventi del tasto + metadati (piattaforma, Hz, gesto dichiarato, note).
- Formato: JSON compresso, `fixtures/traces/<gioco>/<piattaforma>/<nome>.json.gz`.
- Usi:
  1. **Test:** ogni recognizer ha test di regressione sulle tracce ("lancio forte dritto" → velocità > 8 m/s, |spin| < 0,2; "lancio con hook a sinistra" → spin < 0; "tasto premuto e rilasciato senza swing" → nessun evento).
  2. **Tuning:** uno strumento di sviluppo mostra i grafici di ω e a con le fasi riconosciute sovrapposte.
  3. **Simulatore:** il simulatore di sviluppo riproduce le tracce come se fossero un telefono vero.
- Obiettivo minimo per il bowling: 30 tracce per piattaforma (iOS e Android), da almeno 3 persone diverse.

## 8. Feedback sul telefono
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
