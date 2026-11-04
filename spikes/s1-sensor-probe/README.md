# Spike S1 — Sonda sensori

Prototipo usa-e-getta per rispondere alla domanda di [docs/09 § S1](../../docs/09-roadmap.md#s1--sonda-sensori): **accelerometro e giroscopio dei telefoni reali bastano per uno swing da bowling che "si sente vero"?**

È una pagina statica senza build e senza dipendenze nel browser. Sul telefono:
1. **Sonda**: chiede i permessi e verifica in 1,5 s i criteri di [docs/04 § 2](../../docs/04-motion-input.md#2-permessi-e-verifica-hardware-obbligatoria) (eventi, frequenza, giroscopio, gravità).
2. **Assi**: tre pose ferme e una "danza lenta" di 12 s. Da qui ricava in automatico assi, segni e unità del browser, confrontando il giroscopio integrato con la gravità su 96 combinazioni possibili. Il risultato è la riga della tabella del `SensorAdapter`.
3. **Swing**: si tiene premuto il tasto, si fa lo swing e si alza il pollice, come nel gioco vero. Ogni tiro diventa una traccia con 1,5 s di dati prima della pressione e 0,5 s dopo il rilascio. Subito dopo compaiono la velocità stimata, la rotazione del polso e se lo swing è stato riconosciuto.
4. **Ritorno**: il telefono parte appoggiato, si muove e torna nello stesso punto. L'errore finale dice quanto deriva l'orientamento, e serve a scegliere il filtro.
5. **Sessione**: i criteri go/no-go con lo stato attuale, l'elenco delle tracce e l'esportazione in JSON.

La sessione si salva nel browser dopo ogni traccia, quindi ricaricare la pagina non fa perdere niente.

## Criteri go/no-go (da docs/09)

| Criterio | Dove si misura |
|---|---|
| `interval` mediano ≤ 20 ms su iPhone e Android medio (≤ 33 ms sull'economico) | Sonda |
| Swing "piano" e "forte" separabili: picco di \|ω_s\| ≥ +40% | Swing (≥ 3 tracce per tipo) |
| Rotazione del polso con segno coerente in ≥ 8 tracce su 10 | Swing, hook a sinistra e a destra |
| Mapping degli assi iOS/Android documentato | Assi |
| (in più) Un "annullo" non viene scambiato per uno swing | Swing, tipo "annullo" |

## Come aprirla sul telefono (serve HTTPS)

I browser danno accesso ai sensori solo in HTTPS. L'IP del PC in LAN (`http://192.168…`) non basta.

**Opzione A, tunnel Cloudflare (consigliata).** Non serve un account e funziona anche con il telefono in 4G o su reti con client isolation.

```bash
winget install --id Cloudflare.cloudflared
```

```bash
npm run serve
```

In un secondo terminale:

```bash
cloudflared tunnel --url http://localhost:5173
```

Apri sui telefoni l'indirizzo `https://….trycloudflare.com` che compare.

**Opzione B, hosting statico.** Carica `index.html`, `style.css` e la cartella `src/` su Cloudflare Pages (Direct Upload) o su Netlify Drop.

`serve.mjs` serve solo i file della pagina: `node_modules`, test e tracce non sono raggiungibili.

## Procedura

Per ogni telefono (almeno 1 iPhone, 1 Android di fascia media, 1 Android economico):

1. Scrivi il nome del dispositivo e premi **Avvia la sonda**.
2. Tab **Assi**: segui le istruzioni. Le pose ferme vanno su un tavolo; la danza va fatta **lentamente**, ruotando in tutte le direzioni.
3. Tab **Swing**: presa da bowling, cioè telefono in verticale nel palmo, schermo in alto, pollice sul tasto. Registra **5 tracce per tipo**: piano, medio, forte, hook a sinistra, hook a destra, annullo. Fallo fare ad **almeno 3 persone** diverse, segnando il nome nella nota.
4. Tab **Ritorno**: 3 prove.
5. Tab **Sessione**: controlla i criteri e premi **Scarica JSON** (o **Condividi**, per mandarlo al PC).

Obiettivo complessivo ([docs/04 § 7](../../docs/04-motion-input.md#7-tracce-registrazione-e-uso)): 30 o più tracce per piattaforma.

## Analisi sul PC

```bash
npm install
```

```bash
npm run analyze -- sessioni/*.json --split ../../fixtures/traces/bowling --out report.md
```

- Stampa un report in Markdown per ogni telefono: sonda, assi, verdetto, tabella degli swing e confronto dei filtri sulle prove "ritorno". I filtri confrontati sono il complementare con tre guadagni, Madgwick di [`ahrs`](https://github.com/psiphi75/ahrs) con tre `beta` e Mahony.
- Le metriche **si ricalcolano** con il codice attuale: se cambi le soglie in `src/swing.js` basta rilanciare.
- `--split` scrive ogni swing come fixture `.json.gz` in `fixtures/traces/bowling/<piattaforma>/`, il formato previsto per i test del recognizer.

Per provare l'analisi senza telefono:

```bash
node test/fake-session.mjs > sessione-finta.json
```

```bash
npm run analyze -- sessione-finta.json
```

## Test

```bash
npm test
```

40 test con `node:test` su dati sintetici con orientamento noto. Coprono:
- i criteri della sonda;
- il recupero del mapping degli assi, anche con unità e segni non standard;
- le metriche dello swing, indipendenti dalla presa;
- il segno della rotazione del polso, i criteri go/no-go e i filtri;
- la sessione e i percorsi serviti da `serve.mjs`.

La pagina nel browser **non** è coperta da test automatici: si verifica con i telefoni veri, ed è lo scopo dello spike.

## Struttura

```
index.html, style.css   la pagina (CSP restrittiva, nessuna risorsa esterna)
src/main.js             UI e flussi (unico file legato al DOM, insieme a chart.js)
src/chart.js            grafici a striscia su canvas
src/mapping.js          formato dei campioni grezzi, mapping assi, fit dalla danza lenta
src/probe.js            criteri della sonda
src/swing.js            metriche dello swing e criteri go/no-go
src/filters.js          filtro complementare, adattatore per ahrs, prova "ritorno"
src/session.js          modello della sessione e salvataggio
src/math.js             statistiche, vettori, quaternioni
analyze.mjs             report e fixture dal JSON scaricato
serve.mjs               server statico minimo (HTTP, da mettere dietro il tunnel)
test/                   test e generatore di tracce sintetiche
```

Formato dei campioni grezzi: array con le colonne `t, interval, lx, ly, lz, ax, ay, az, ra, rb, rg`.
- `t` = `event.timeStamp`;
- `l*` = `acceleration`;
- `a*` = `accelerationIncludingGravity`;
- `r*` = `rotationRate.alpha/beta/gamma`.

Si salvano **senza correzioni**, così il mapping si può rifare in seguito.

## Cose già emerse scrivendo lo spike

- **`ahrs` (Madgwick) produce `NaN`** quando la gravità misurata coincide esattamente con la stima, per esempio al primo campione con il telefono perfettamente in piano: il gradiente nullo viene normalizzato. L'adattatore aggiunge un dither di 1e-9 g. Da tenere presente se lo si adotta in `packages/motion`.
- `ahrs` parte dal quaternione identità, senza inizializzazione dalla gravità se non c'è il magnetometro, quindi serve un riscaldamento. Il suo `sampleInterval` è in **millisecondi**, anche se il README del pacchetto in un punto dice Hz.
- L'asse dello swing va stimato **prima** degli ultimi 150 ms. Se si includono, la rotazione del polso al rilascio lo sporca e la stima dello spin si dimezza. Il GDD lo prevede già (stima durante `armed` e `backswing`): va rispettato nel recognizer vero.

## Dopo lo spike

Con i report dei telefoni si aggiornano:
- la tabella di mapping del `SensorAdapter` ([docs/04 § 3](../../docs/04-motion-input.md#3-sensoradapter));
- la scelta del filtro ([docs/04 § 4](../../docs/04-motion-input.md#4-orientamento));
- le soglie del recognizer e il range di velocità ([GDD bowling § 3.3](../../docs/games/bowling.md#33-recognizer-gamesbowlingcontrollerrecognizerts)).

Se un criterio fallisce, si aggiorna l'ADR interessato prima della Fase 2.
