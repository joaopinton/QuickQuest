# 08 — UI/UX

Due superfici molto diverse, un solo design system:
- **Schermo**: si guarda da lontano, ci interagisce raramente una sola persona (mouse, touch su iPad o telecomando). Deve essere grande, leggibile e scenografico.
- **Controller**: si usa da vicino, con il pollice e senza guardarlo durante il gesto. Deve essere grande, essenziale e tattile.

---

## 1. Flussi

### 1.0 Sito pubblico (implementato in `apps/web/src/screen`)
| Pagina | Contenuto |
|---|---|
| `/` Home | Hero allineato a sinistra con la scena SVG (cielo, colline a strati di carta, 3 Piggy, parallasse leggero), poi i "3 passi", la vetrina bento dei giochi e il requisito del giroscopio. **Sul telefono** in primo piano c'è l'inserimento del codice. |
| `/come-si-gioca` | 3 passi illustrati e animati, il gesto del bowling con un Piggy che fa lo swing, consigli di sicurezza, requisiti, invito a creare la stanza |
| `/giochi` | Catalogo bento; il dettaglio di ogni gioco si apre in un dialog |
| `*` | 404 con un Piggy perso |

- **Logo**: "quickquest" in Fredoka 700 minuscolo. Il puntino della i è una pallina gialla che rimbalza al caricamento; la seconda q ha una scia.
- **Tagline**: «Lo sport vero, col telefono in mano.»
- Le transizioni di pagina sono un ingresso con molla (`page-in`). La "iris" con View Transitions API è rimandata a quando ci sarà il passaggio lobby → gioco.

### 1.1 Schermo
```
┌ Home ──────────────────────────┐
│  Logo + Piggy che saltellano     │
│  [ Crea stanza ]  (primario)    │
│  Impostazioni · Crediti         │
└────────────────────────────────┘
        ▼
┌ Lobby ─────────────────────────────────────────────┐
│  QR GRANDE         Codice: K7RM                     │
│  "Inquadra con il telefono"                         │
│  ┌P1 ●┐ ┌P2 ▲┐ ┌P3 ■┐ ┌P4 ◆┐  ← slot: vuoto (tratteggio)│
│  │Piggy│ │ …  │ │    │ │    │     / in connessione   │
│  └────┘ └────┘ └────┘ └────┘     / pronto (rimbalzo)│
│  [ Scegli il gioco ] (attivo con ≥1 giocatore)      │
└────────────────────────────────────────────────────┘
        ▼
┌ Selezione gioco ───────────────────────────────────┐
│  Card grandi con l'accento del gioco, icona,        │
│  giocatori min–max, durata. I giochi futuri sono   │
│  visibili ma "In arrivo".                          │
│  Si sceglie dallo schermo O dal telefono di P1     │
│  (swipe/tap: il telefono di P1 fa da telecomando). │
└────────────────────────────────────────────────────┘
        ▼
  Caricamento (Piggy che palleggia + suggerimento sul gesto)
        ▼
  Tutorial al primo avvio del gioco (gesto mostrato da un Piggy, 10 s, saltabile)
        ▼
  Partita (HUD minimo: di chi è il turno, punteggio compatto)
        ▼
  Risultati (podio dei Piggy, premi divertenti: "Braccio d'oro", "Re dell'effetto"…)
  [ Rigioca ]  [ Cambia gioco ]  [ Torna alla lobby ]
```

- **Il telefono di P1 fa da telecomando** per i menu: sul controller compare un layout `menu` con frecce grandi e OK. Nessuno deve alzarsi per usare il mouse.
- Un giocatore può entrare o uscire tra una partita e l'altra; durante una partita il suo slot resta riservato.

### 1.2 Controller
```
Benvenuto ("Ti stai unendo alla stanza K7RM")  →  [ Connetti ]
   → permessi (iOS)  →  "Muovi un po' il telefono…" (sonda sensori)
   → ✖ Non compatibile   (schermata finale, spiega cosa manca)
   → ✔ Scegli il tuo Piggy (colore + accessorio; anteprima che salta)
   → Avviso di sicurezza (solo la prima volta)
   → Calibrazione ("Punta il telefono verso lo schermo e premi")
   → Attesa ("Guarda lo schermo!")  ⇄  Layout di gioco quando è il tuo turno
```

---

## 2. Layout del controller

### Principi
- **Portrait**, uso con una mano. Il tasto azione sta nella **metà inferiore**, raggiungibile col pollice.
- **Zona sicura**: rispetta `env(safe-area-inset-*)`; niente controlli nei 24 px vicino ai bordi (gesti di sistema).
- **Niente elementi piccoli.** Il target minimo è 64×64 px; il tasto azione occupa almeno il 40% dell'altezza.
- **Si gioca senza guardare.** Durante il gesto lo stato si capisce dal **tatto e dal suono**, non dalla vista.
- **Colore del giocatore** come sfondo leggero (tinta al 12%) + simbolo dello slot, così ognuno riconosce il proprio telefono.
- Disattivati: zoom, selezione del testo, menu contestuale, pull-to-refresh, scroll (`touch-action: none`, `user-select: none`, `overscroll-behavior: none`).

### Layout tipo (bowling, fase Aim/Gesture)
```
┌───────────────────────────────┐
│ ● P1  Bowling     📶 ok   ⚙︎   │  barra di stato (connessione, impostazioni)
├───────────────────────────────┤
│                               │
│   ◀  TRACKPAD: trascina  ▶    │  sposta la posizione e l'angolo di partenza
│        ┄┄┄┄●┄┄┄┄              │  indicatore della posizione corrente
│                               │
├───────────────────────────────┤
│                               │
│                               │
│        ╭───────────────╮      │
│        │   TIENI       │      │  TASTO AZIONE (grande, colore giocatore)
│        │   PREMUTO     │      │  premuto: si "abbassa", il colore si satura,
│        │  e lancia!    │      │  feedback aptico; durante lo swing pulsa
│        ╰───────────────╯      │
│                               │
├───────────────────────────────┤
│ [ ↺ Ricalibra ]               │
└───────────────────────────────┘
```

### Libreria di layout del core (`packages/ui/controller`)
| Layout | Componenti |
|---|---|
| `wait` | Piggy animato, "Tocca a P2", ultima giocata |
| `menu` | Frecce su/giù/sinistra/destra + OK + Indietro |
| `action` | Solo tasto azione (giochi senza mira) |
| `aim-action` | Trackpad orizzontale + tasto azione (bowling, bocce) |
| `pad-action` | Trackpad 2D + tasto azione (golf: mira + bastone) |
| `pointer` | Area di stato + 2 tasti (barber: forbici e tosatrice) |
| `duel` | Tasto azione + tasto parata (scherma) |

I giochi compongono questi blocchi; layout nuovi solo se servono davvero.

---

### Strumenti di sviluppo sul telefono
- `?debug`: overlay con RTT (mediana e p95 dei battiti ping/pong), frequenza dei sensori, ordine degli assi, offset del giroscopio e stato "fermo".
- `?rec`: bottone ● REC per registrare una traccia dei sensori ([04 § 7](04-motion-input.md#7-tracce-registrazione-e-uso)).
- La barra "Movimento" mostra **fermo** in verde quando il telefono è tenuto immobile.
- Feedback aptico: vedi [04 § 8](04-motion-input.md#8-feedback-sul-telefono). Su iPhone vibra solo dentro un tocco.

## 3. HUD sullo schermo
- **Minimo durante il gesto.** In alto a sinistra solo il turno (simbolo, colore, Piggy), in alto a destra il punteggio compatto.
- **Informazioni dopo il gesto**: velocità, effetto, distanza, in un pannello che compare e scompare.
- **Tabellone completo** (es. 10 frame del bowling) tra un turno e l'altro, con animazione d'ingresso dal basso.
- Indicatore "telefono disconnesso" sullo slot del giocatore, con un pulse rosso morbido.
- Niente testo sotto i 24 px a 1080p. Contrasto testo/sfondo ≥ 4,5:1 (WCAG AA). I pannelli hanno sempre uno sfondo pieno o semi-opaco: niente testo direttamente sulla scena 3D.

---

## 4. Design system

### Token (CSS custom properties in `packages/ui/tokens.css`)
Colori e tipografia sono in [07](07-art-direction.md#4-palette). In più:

```css
:root {
  /* Raggi: volutamente NON uniformi */
  --radius-sm: 10px;   /* chip, badge */
  --radius-md: 18px;   /* input, card piccole */
  --radius-lg: 28px;   /* card, pannelli */
  --radius-pill: 999px;/* bottoni */

  /* Spaziature (scala 4) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-6: 24px; --space-8: 32px; --space-12: 48px; --space-16: 64px;

  /* Ombre colorate (mai grigie) */
  --shadow-soft: 0 6px 20px rgb(59 63 140 / 0.16);
  --shadow-lift: 0 12px 32px rgb(59 63 140 / 0.22);
  --shadow-press: 0 2px 6px rgb(59 63 140 / 0.18);
  --edge-3d: 0 6px 0 var(--primary-700);     /* bordo inferiore "giocattolo" dei bottoni */

  /* Motion */
  --dur-instant: 90ms;
  --dur-fast: 160ms;
  --dur-base: 260ms;
  --dur-slow: 420ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: linear(0, 0.36 12%, 0.82 26%, 1.04 38%, 1.08 46%, 1.03 58%, 0.99 72%, 1);
  --ease-squish: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Componenti
| Componente | Aspetto | Stati |
|---|---|---|
| **Bottone primario** | Pillola, `--primary-500`, testo bianco Nunito 800, bordo inferiore "3D" (`--edge-3d`) | *hover*: sale di 2 px, ombra `lift` · *focus*: anello giallo `--accent-400` di 4 px con offset · *press*: scende di 6 px (il bordo 3D sparisce), `--ease-squish` al rilascio · *disabled*: `--ink-300`, niente bordo 3D |
| **Bottone secondario** | Pillola bianca, bordo 3D `--ink-300`, testo `--ink-900` | come sopra |
| **Card gioco** | `--radius-lg`, metà superiore nell'accento del gioco con illustrazione o render del set, metà inferiore bianca | *hover/focus*: si inclina di 2° e sale; *selezionata*: bordo accento di 6 px + rimbalzo |
| **Slot giocatore** | Cerchio grande con simbolo + Piggy | vuoto (bordo tratteggiato animato), in connessione (spinner a puntini), pronto (Piggy che salta + "ding"), disconnesso (Piggy grigio + pulse rosso) |
| **Pannello** | Bianco, `--radius-lg`, `--shadow-soft` | entra con scala da 0,9 a 1 e `--ease-spring` |
| **Toast** | Pillola in alto, icona + testo breve | entra dall'alto, esce dopo 3 s |
| **Numero grande** (punteggi) | Fredoka 700, tabular-nums | conta e rimbalza |

### Motion
- **Transizioni di schermata**: "iris" circolare in uscita (cerchio che si chiude sull'elemento scelto), poi il nuovo contenuto entra con `--ease-spring`.
- **Durate**: UI micro 90–160 ms; pannelli 260 ms; scene 420 ms. Niente animazione oltre i 600 ms che blocchi l'input.
- **Si animano solo `transform` e `opacity`** (compositor).
- **`prefers-reduced-motion`**: le transizioni diventano dissolvenze, niente camera shake, slow-mo ridotto e coriandoli dimezzati.

---

## 5. Accessibilità
- Contrasto ≥ 4,5:1 per i testi, ≥ 3:1 per le icone importanti.
- Giocatori distinti da **colore + simbolo + posizione**.
- Ogni informazione sonora ha un equivalente visivo.
- Navigazione da tastiera e telecomando nei menu dello schermo (focus visibile, frecce + Invio).
- Il controller funziona con una sola mano; la mano usata (destra o sinistra) è un'impostazione che specchia il layout e la stima del gesto.
- Testi brevi, verbi d'azione, tono amichevole ("Tieni premuto e lancia!", non "Premere il pulsante per eseguire il lancio").

---

## 6. Lingua e tono
- MVP in **italiano**, con tutte le stringhe in file i18n (`packages/ui/i18n/it.json`) per aggiungere l'inglese senza toccare il codice.
- Tono: caldo, ironico, mai sarcastico verso chi sbaglia. Gli errori sono simpatici ("Ops! La palla aveva altri programmi").
- Messaggi d'errore sempre con una **azione suggerita** ("Telefono disconnesso — si sta ricollegando…", "Permesso negato — tocca qui per riprovare").
