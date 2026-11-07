# 03 — Rete e protocollo

## 1. Topologia
Tutti i dispositivi aprono un WebSocket sicuro (`wss://<dominio>/ws/room/<ROOM>` con PartyServer, oppure `/ws/<ROOM>` con un DO puro: si decide in S2, vedi [ADR-001](adr/ADR-001-relay-cloudflare-durable-objects.md)) verso il Worker, che lo inoltra al **Durable Object** della stanza. **Un DO corrisponde a una stanza**: l'istanza è unica in tutto il mondo e serializza tutti i messaggi della stanza, quindi non servono lock.

Il DO usa la **WebSocket Hibernation API**: tra un messaggio e l'altro l'oggetto non consuma tempo di calcolo fatturato.

## 2. Stanza

### Codice
- 4 caratteri dall'alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (31 simboli, senza 0/O/1/I).
- Lo genera il Worker. Se il DO con quel nome è già attivo, ne genera un altro.
- QR → `https://<dominio>/c/ABCD`. Il codice è mostrato anche in grande per chi vuole digitarlo.

### Stato nel DO
```ts
interface RoomState {
  code: string;
  createdAt: number;
  phase: 'lobby' | 'playing';
  screen: { socketId: string; secretHash: string } | null;
  slots: Array<{
    slot: 1 | 2 | 3 | 4;
    color: PlayerColor;
    avatar: AvatarSpec;
    tokenHash: string;          // per la riconnessione
    connected: boolean;
    lastSeen: number;
    capabilities: SensorCapabilities;
  }>;
}
```
Lo stato persistente (SQLite del DO) contiene solo lo stretto necessario per sopravvivere a un'ibernazione: slot, token hash, fase.

### Ciclo di vita
| Evento | Effetto |
|---|---|
| Lo schermo crea la stanza | Nuovo DO; lo schermo riceve `code` + `screenSecret` |
| Un controller entra (in `lobby`) | Gli viene assegnato il primo slot libero; riceve `slot` + `sessionToken` |
| Un controller entra durante `playing` | Accettato **solo** con `sessionToken` valido (riconnessione) |
| 5° controller | Rifiutato: `error{code:'ROOM_FULL'}` |
| Il controller si disconnette | Lo slot resta riservato per 120 s (`connected:false`); lo schermo mostra "P2 si sta ricollegando…" e mette in pausa se tocca a lui |
| Lo schermo si disconnette | I controller vedono "Schermo disconnesso"; la stanza vive 60 s in attesa dello schermo (con `screenSecret`) |
| Inattività | Un alarm chiude la stanza dopo 10 min senza schermo o 2 h totali |

## 3. Messaggi

### 3.1 Formato
Due tipi di frame sullo stesso WebSocket:

| Tipo | Codifica | Uso | Affidabilità |
|---|---|---|---|
| **Evento** | Frame di testo JSON | Controllo, lobby, eventi gesto, cue | Ordinato e affidabile (TCP) |
| **Posa** | Frame binario (ArrayBuffer) | Stream di orientamento a 30 Hz | Ordinato; i frame vecchi vengono scartati se ne arriva uno più nuovo |

Ogni evento JSON ha la forma:
```ts
interface Envelope<T extends string, P> {
  v: 1;              // versione del protocollo
  t: T;              // tipo
  id?: number;       // id per ack (solo dove serve)
  ts?: number;       // timestamp del mittente (ms, clock locale)
  p: P;              // payload
}
```

### 3.2 Catalogo eventi (core)

**Controller → relay/schermo**
| `t` | Payload | Note |
|---|---|---|
| `hello` | `{ role:'controller', room, sessionToken?, capabilities, ua }` | `capabilities` = esito della verifica sensori ([04](04-motion-input.md)). Senza `gyro && accel` il relay rifiuta. |
| `profile` | `{ color, avatar }` | Scelta del Bubù |
| `ping` | `{ t0 }` | Clock sync |
| `ready` | `{ layoutId }` | Layout di gioco caricato |
| `input.*` | dipende dal gioco | Eventi del trackpad, del tasto e dei gesti (es. `bowling.release`) |
| `calibrated` | `{}` | Il giocatore ha ricalibrato |

**Schermo → relay → controller**
| `t` | Payload | Note |
|---|---|---|
| `welcome` | `{ slot, color, sessionToken }` | Generato dal relay |
| `pong` | `{ t0, t1, t2 }` | Clock sync (il relay risponde direttamente) |
| `lobby` | `{ players[], phase }` | Stato della lobby per tutti |
| `controller.layout` | `{ gameId, layoutId, params }` | Il telefono carica il controller del gioco e mostra quel layout |
| `turn` | `{ activeSlot }` | Di chi è il turno: gli altri telefoni mostrano "Attendi" |
| `cue` | `{ kind:'haptic'|'sound'|'flash', pattern, intensity }` | Feedback sul telefono |
| `error` | `{ code, message }` | `ROOM_FULL`, `ROOM_NOT_FOUND`, `UNSUPPORTED_DEVICE`, `VERSION_MISMATCH`, `RATE_LIMITED` |

**Schermo ⇄ relay**
| `t` | Payload |
|---|---|
| `room.create` | `{}` → risposta `room.created { code, screenSecret }` |
| `room.resume` | `{ code, screenSecret }` |
| `room.phase` | `{ phase }` (`lobby` o `playing`) |
| `kick` | `{ slot }` |

Gli eventi specifici di ogni gioco sono definiti nel package `shared/` del gioco e registrati nel protocollo con il prefisso `<gameId>.` (es. `bowling.release`, `bowling.aim`).

### 3.3 Frame di posa (binario, 24 byte)
```
offset  tipo     campo
0       uint8    tipo frame (0x01 = posa)
1       uint8    slot (impostato dal relay, quello del client viene ignorato)
2       uint16   seq (wrap-around)
4       uint32   ts  (ms del clock del controller, troncati)
8       int16×4  quaternione x,y,z,w  (valore / 32767)
16      uint16   |accelerazione| in centesimi di m/s²
18      uint8    pulsanti (bit0 = azione, bit1 = trackpad toccato, …)
19      uint8    flag (bit0 = calibrato)
20      int16×2  trackpad x,y (-32767..32767) o riservato
```
30 Hz × 24 byte ≈ **0,7 KB/s** per controller. Il relay sovrascrive il campo `slot` (il controller non può fingersi un altro giocatore) e inoltra senza decodificare il resto.

## 4. Clock sync
Serve per (a) interpolare la posa e (b) confrontare i tempi tra controller nei giochi simultanei (scherma).

- Algoritmo in stile NTP: il controller invia `ping{t0}`, il relay risponde `pong{t0,t1,t2}`, il controller registra `t3`.
  - `offset = ((t1 - t0) + (t2 - t3)) / 2`, `rtt = (t3 - t0) - (t2 - t1)`.
- Il riferimento è il clock del **DO**: lo schermo fa la stessa sincronizzazione, così tutti condividono la stessa base temporale.
- 8 campioni al join, poi 1 ogni 5 s. Si tiene l'offset del campione con RTT minimo tra gli ultimi 8.
- Gli eventi gesto includono `tRelease` nel clock del DO.

## 5. Latenza e interpolazione
- Lo schermo tiene per ogni controller un **buffer di pose** e le mostra con un ritardo fisso di circa **50 ms** (adattivo: `max(50, jitter p95)`), interpolando i quaternioni con slerp. Se i dati mancano estrapola per massimo 100 ms, poi congela.
- Gli **eventi gesto** vengono applicati appena arrivano. La simulazione di un tiro parte da quell'istante con i parametri calcolati sul telefono, quindi la latenza aggiunge al massimo circa 100 ms di attesa percepita prima che la palla parta.
- Per mascherare la latenza, il rilascio della palla a schermo è sincronizzato con l'animazione del braccio: la palla "esce dalla mano" quando arriva l'evento, e la posa è già allineata grazie al buffer.

### Dead-reckoning della posa (idea presa da Pocket Sports, vedi [10 § 1](10-references.md#1-progetti-telefono--controller-i-più-vicini-al-nostro))
Il buffer di 50 ms rende il braccio fluido ma lo mostra *in ritardo*. Durante uno swing veloce (fino a 10 rad/s) 50 ms di ritardo sono circa 30° di differenza tra telefono e braccio del Bubù, e si notano. Per compensare, lo schermo **proietta la posa in avanti**:

1. Il frame di posa porta già il quaternione e il timestamp `ts` nel clock del DO ([§ 3.3](#33-frame-di-posa-binario-24-byte)). Lo schermo ricava la **velocità angolare** ω dalla differenza tra gli ultimi due quaternioni ricevuti (non serve un campo nuovo nel frame).
2. L'orizzonte di proiezione è il ritardo reale: `h = nowDO − ts`, cioè latenza di rete più buffer, limitato a **80 ms**.
3. La posa mostrata è `q_mostrata = q_interpolata ⊗ exp(ω · h / 2)`.
4. Lo smoothing è **adattivo**: forte quando |ω| è piccolo (telefono fermo, si nasconde il rumore), quasi nullo quando |ω| è grande (swing, conta la reattività).
5. Al rilascio (`bowling.release` e simili) la proiezione si spegne e il braccio converge sulla posa effettiva in 60 ms, per evitare che "superi" il punto di rilascio.

Il dead-reckoning cambia **solo la visualizzazione**. L'esito del tiro continua a venire dall'evento calcolato sul telefono ([ADR-002](adr/ADR-002-gesture-recognition-on-device.md)). Si misura nello spike S2 (ritardo percepito con e senza) e si regola dal Controller Lab ([02 § Sviluppo locale](02-architecture.md#sviluppo-locale)).

**Budget di latenza (obiettivo p95)**
| Tratta | Obiettivo |
|---|---|
| Sensore → evento (sul telefono) | < 20 ms |
| Telefono → DO → schermo | < 80 ms |
| Schermo: ricezione → pixel | < 25 ms (1–2 frame) |
| **Totale gesto → reazione a schermo** | **< 120 ms** |

## 6. Riconnessione
- Il client usa **PartySocket** ([ADR-007](adr/ADR-007-native-websocket.md)) con backoff esponenziale (250 ms → 4 s, con jitter) e massimo 2 minuti di tentativi. Durante la disconnessione gli eventi restano in un buffer limitato (64 messaggi), le pose si scartano.
- Il controller conserva `{ room, sessionToken }` in `sessionStorage`. Se ricarica la pagina, rientra direttamente.
- Lo schermo conserva `{ room, screenSecret }` in `sessionStorage`. Se ricarica, chiede `room.resume`.
- Durante la disconnessione del giocatore di turno il gioco va in **pausa** con un overlay amichevole.

## 7. Versioning
- `v` nell'envelope. Se la versione del controller non coincide con quella dello schermo, il relay risponde `VERSION_MISMATCH` e il controller ricarica la pagina, perché probabilmente ha una cache vecchia.
- Si aggiungono campi solo in modo retro-compatibile; ogni rottura aumenta `v`.

## 8. Budget sul free tier (da verificare in S2)
Una partita di bowling a 4 giocatori dura circa 15 min:
- **Pose:** si inviano solo dal controller di turno e solo durante la fase di gesto, circa 30% del tempo → 30 Hz × 900 s × 0,3 ≈ 8.100 frame.
- **Eventi:** qualche centinaio.

Con le regole di fatturazione dei DO sui messaggi WebSocket (i messaggi in ingresso contano come frazione di una request), una partita resta nell'ordine di poche centinaia o migliaia di request equivalenti: molto sotto il limite giornaliero free. **I numeri vanno confermati sulla pagina prezzi ufficiale** durante lo spike S2.

Regola di degrado: se ci si avvicina ai limiti, lo stream di posa scende a 15 Hz. Gli eventi non si toccano mai.

## 9. Evoluzione futura: WebRTC
Quando servirà ridurre ulteriormente la latenza (scherma):
1. Il DO fa da canale di signaling (offer/answer/ICE).
2. Controller e schermo provano un DataChannel `unordered, maxRetransmits:0` per le pose e uno `ordered` per gli eventi.
3. Se l'ICE fallisce in 3 s (client isolation, NAT simmetrico) si resta sul relay.

Il protocollo è identico sui due trasporti: serve solo un'astrazione `Transport` con `send` e `onMessage`.
