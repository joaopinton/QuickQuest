# 00 — Visione

## In una frase
Accendi lo schermo, inquadri un QR con il telefono e in 20 secondi stai tirando una palla da bowling che **sembra vera**. Nessuna app da installare, nessun account, nessun costo.

## Cos'è
Una piattaforma web di **party-game sportivi a controllo di movimento**:

- lo **schermo** (PC, Mac, iPad, oppure TV collegata via HDMI o cast) mostra la scena 3D;
- fino a **4 smartphone** fanno da controller: si tengono in mano come un attrezzo e il loro accelerometro e giroscopio leggono il gesto;
- ogni **gioco è un modulo** a sé: si aggiunge un gioco alla volta senza toccare il resto.

Giochi previsti, in ordine di sviluppo: **Bowling** → Bocce → Tiri liberi → Golf → Barber shop → Scherma.

## Pubblico
- Gruppi di amici o famiglie nello stesso ambiente: soggiorno, aula, festa.
- Chi gioca non deve saper "giocare ai videogiochi". Il gesto è quello reale: se sai tirare una boccia, sai giocare.
- Deve funzionare su qualunque rete: Wi-Fi di casa, hotspot 4G/5G, reti universitarie con client isolation (Eduroam).

## Pilastri

### 1. Sensazione reale
È il motivo per cui il progetto esiste. Ogni decisione tecnica e di design viene giudicata con una domanda: *"rende il gesto più vero?"*

- **Risposta immediata.** Il braccio dell'avatar a schermo segue il telefono in tempo reale. Il giocatore deve vedere il proprio movimento, non un'animazione pre-registrata.
- **Esito fedele al gesto.** Un tiro più veloce va più veloce. Una rotazione del polso produce effetto. L'esito si calcola sul telefono, alla massima frequenza dei sensori, quindi la rete non lo degrada (vedi [ADR-002](adr/ADR-002-gesture-recognition-on-device.md)).
- **Fisica credibile.** Dimensioni e masse reali, attriti plausibili, collisioni pulite.
- **Feedback multisensoriale.** Vibrazione o tick e suono sul telefono al momento del rilascio e dell'impatto; juice forte sullo schermo (camera, particelle, slow-mo, suono).
- **Indulgenza invisibile.** Gli *assist* correggono gli errori di misura dei sensori senza che il giocatore senta di essere aiutato.

### 2. Zero attrito, zero costi
- Si gioca solo dal browser: nessuna app nativa, nessuno store.
- Ci si collega con il QR. Il telefono che si disconnette si riprende il suo posto da solo.
- Hosting e infrastruttura stanno nei free tier: Cloudflare Pages + Workers.
- Il caricamento è leggero, perché lo stile grafico è pensato per pesare poco (vedi [07](07-art-direction.md) e [ADR-005](adr/ADR-005-procedural-vertex-color-assets.md)).

### 3. Modularità
- Il **core** (lobby, rete, input, rendering, UI, avatar) è uno solo.
- Ogni **gioco** implementa un contratto ([05](05-game-module-contract.md)) e viene caricato a richiesta.
- Aggiungere un gioco significa creare una nuova cartella e aggiungere una riga nel registro.

### 4. Identità visiva forte e originale
- Stile "alla Nintendo" nello spirito: amichevole, colorato, morbido, leggibile, gioioso.
- **Originale** nella forma: nessun asset, personaggio, font, suono o nome preso da Nintendo (vedi [07 § Cosa non fare](07-art-direction.md#10-cosa-non-fare)).

## Esperienza tipo
1. Su un laptop collegato alla TV si apre il sito e si preme **"Crea stanza"**. Compaiono un QR grande e 4 slot vuoti.
2. Ogni amico inquadra il QR, preme **"Connetti"**, accetta i permessi dei sensori e sceglie il colore del suo Piggy.
3. Il primo giocatore sceglie **Bowling** sullo schermo.
4. Sul telefono compare il controller del bowling: un trackpad per mirare e un grande tasto da tenere premuto.
5. Il giocatore tiene premuto, fa lo swing e rilascia. Il braccio del Piggy a schermo segue il movimento, la palla parte, il telefono fa "tock", i birilli volano e arriva lo **STRIKE!** con i coriandoli.
6. Si passa al turno successivo. Dopo 10 frame compare la classifica con le premiazioni.

## Non-obiettivi (per ora)
- Multiplayer online tra case diverse. La stanza è pensata per persone nello stesso ambiente; tecnicamente funzionerebbe anche a distanza, ma non è un requisito.
- Account, login, salvataggi cloud, classifiche globali.
- Monetizzazione, pubblicità, tracking.
- App native o versioni per Smart TV. Sulla TV si usa un laptop collegato via HDMI oppure il cast di una scheda.
- Telefoni senza giroscopio o senza accelerometro: vengono rifiutati ([ADR-006](adr/ADR-006-require-gyro-and-accelerometer.md)).
- Controllo solo touch o con gamepad.
- Tracking di posizione a 6 gradi di libertà. Il telefono fornisce orientamento e accelerazioni, non la sua posizione nello spazio.

## Metriche di successo
| Metrica | Obiettivo |
|---|---|
| Tempo da "apro il sito" a "primo tiro" | < 60 s con 1 giocatore |
| Tempo di connessione di un controller (scan → pronto) | < 20 s |
| Frame rate sullo schermo | 60 fps stabili su iPad 9ª gen / laptop con iGPU di 5 anni |
| Latenza percepita del braccio dell'avatar | < 120 ms (p95) |
| Download del primo gioco (schermo) | < 3 MB gzip, escluso il motore fisico |
| Playtest: "sembrava un tiro vero?" | ≥ 4/5 di media |
