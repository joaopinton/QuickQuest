# 11 — Brainstorming: come funziona ogni gioco

> Data: 2026-11-06. Questo documento raccoglie **come dovrebbe svolgersi una partita** in ognuno dei sei giochi: il giro del turno tra telefono e schermo, le regole, le modalità, cosa fa chi aspetta, i casi limite. È un brainstorming: le idee hanno un'etichetta di priorità e le scelte non ancora prese stanno in fondo a ogni sezione. Quando un'idea viene decisa, si sposta nel GDD o nel brief del gioco ([games/](games/)) e qui resta il rimando.
>
> Etichette: **[MVP]** serve alla prima versione giocabile · **[Dopo]** quando il gioco è completo · **[Forse]** da provare in playtest prima di decidere.

## Indice
1. [Regole comuni a tutti i giochi](#1-regole-comuni-a-tutti-i-giochi)
2. [Bowling](#2-bowling)
3. [Bocce](#3-bocce)
4. [Tiri liberi](#4-tiri-liberi)
5. [Golf](#5-golf)
6. [Barber shop](#6-barber-shop)
7. [Scherma](#7-scherma)
8. [Idee trasversali](#8-idee-trasversali)
9. [Confronto rapido](#9-confronto-rapido)
10. [Decisioni da prendere](#10-decisioni-da-prendere)

---

## 1. Regole comuni a tutti i giochi

### 1.1 Struttura di una partita
Ogni gioco segue la stessa sequenza, così chi ha giocato a un gioco sa già muoversi negli altri.

| Fase | Schermo | Telefoni | Durata |
|---|---|---|---|
| **Impostazione** | Scheda del gioco: modalità, numero di round, assist per giocatore, squadre | P1 sceglie con il layout `menu`; gli altri vedono le scelte | libera |
| **Intro** | Il set si presenta con un giro di camera; due righe di regole | `wait` con "Preparati!" | ≤ 8 s, saltabile |
| **Tutorial del gesto** | Animazione del Pupo che fa il gesto, con le tre fasi (presa, movimento, rilascio) | La stessa animazione in piccolo + indicazioni su come tenere il telefono | Solo alla prima partita della stanza a quel gioco, poi saltabile |
| **Tiro di prova** [MVP] | "Prova!": il colpo si gioca ma non conta | Layout del gioco con l'etichetta "prova" | 1 per giocatore, solo al primo turno |
| **Partita** | Il gioco vero | Layout del gioco per chi è di turno, `wait` per gli altri | Vedi ogni gioco |
| **Risultati** | Podio, premi, statistiche | Il proprio piazzamento e il proprio premio | ~10 s |
| **Dopo** | "Rivincita" · "Altro gioco" · "Torna alla lobby" | P1 sceglie con `menu` | — |

### 1.2 Il giro del turno
Uguale per tutti i giochi a turni (tutti tranne la scherma):

1. **Annuncio**: lo schermo mostra Pupo, colore e nome del giocatore ("Tocca a Verde!"); il telefono di quel giocatore vibra due volte e passa al layout del gioco. Gli altri telefoni passano a `wait`.
2. **Preparazione**: mira, scelta dell'attrezzo, eventuale presa da fermo (che serve anche a ricalibrare lo yaw).
3. **Gesto**: il telefono riconosce il gesto e invia **un solo evento** con i parametri ([ADR-002](adr/ADR-002-gesture-recognition-on-device.md)).
4. **Risoluzione**: lo schermo simula e mostra l'esito; il telefono riceve un `cue` (vibrazione e testo breve: "Forte! 28 km/h", "Un po' corto").
5. **Punteggio**: lo schermo aggiorna il tabellone; il tabellone completo compare tra un giocatore e l'altro, non a ogni colpo.
6. **Passaggio**: chi tocca dopo viene annunciato.

**Casi limite comuni** [MVP]:
- **Annullo**: un gesto non valido (troppo debole, troppo corto) non consuma il turno. Il telefono dice cosa è mancato ("Swing più ampio").
- **Inattività**: dopo 45 s senza gesto compare "Ci sei, Verde?" sullo schermo e sul telefono; dopo altri 30 s il turno passa e il colpo vale come il peggiore possibile (bowling 0 birilli, golf +1 colpo) — oppure, in modalità amichevole, si salta senza penalità. [Forse]: renderlo un'impostazione della partita.
- **Disconnessione del giocatore di turno**: il gioco va in pausa sul suo turno per 30 s con "Aspettiamo Verde…". Se torna riprende da dove era; se no, P1 sceglie tra "Aspetta ancora", "Salta il turno" e "Togli dalla partita".
- **Pausa globale**: già presente (palco a tutta finestra con pausa); in pausa i gesti vengono ignorati e il telefono di turno lo dice.

### 1.3 Chi aspetta
Il layout `wait` non deve essere morto: è lì che una festa si annoia o si diverte.
- [MVP] Punteggio proprio e di chi gioca, "tocca a te tra 2 turni".
- [Dopo] **Tasto "Tifo!"**: un tocco fa comparire sullo schermo un'emoji o un applauso del colore del giocatore (al massimo 1 ogni 2 s per telefono, niente durante il gesto di chi tira, per non distrarre).
- [Dopo] **Minimappa** per i giochi di posizione (bocce, golf): la situazione vista dall'alto, così si discute la strategia.
- [Forse] **Pronostico**: prima del colpo, chi aspetta tocca "Ce la fa / Non ce la fa"; chi indovina più spesso vince il premio "Veggente". Niente punti in partita, solo il premio.

### 1.4 Assist e handicap
- Tre livelli per giocatore: **Facile**, **Normale** (default), **Pro**, come nel [GDD del bowling § 3.4](games/bowling.md#34-livelli-di-assist-impostazione-per-giocatore). Ogni gioco definisce cosa cambia (tabella nella sua sezione).
- Il livello si sceglie in Impostazione accanto al Pupo e si vede nel tabellone con una piccola icona: nessuno deve sentirsi "imbrogliato".
- [Dopo] Handicap numerico per partite miste genitori/bambini: punti di partenza (bowling, bocce) o colpi regalati (golf).

### 1.5 Sicurezza
- Prima del primo gesto ampio della partita (bowling, golf, tiri liberi, scherma) lo schermo mostra per 3 s: "Tieni il telefono saldo · lascia spazio intorno a te".
- [Dopo] Consiglio della cinghietta o della cover con presa, nella pagina "Come si gioca".
- I gesti ampi accettano anche la versione "a metà": nessun gioco deve richiedere il braccio teso al massimo per ottenere il massimo.

### 1.6 Telefono simulato
Ogni gioco deve essere giocabile con il telefono simulato (`?sim`): ogni evento gesto ha un equivalente con tasti e slider. È il prerequisito per i test e2e e per lavorare senza telefono (come oggi `simulatedThrow` nel bowling).

### 1.7 Premi di fine partita
Ogni gioco assegna 3–5 premi, **almeno uno raggiungibile da chi arriva ultimo** (il premio consolazione comico). I nomi sono nella sezione di ogni gioco.

---

## 2. Bowling

> GDD completo: [games/bowling.md](games/bowling.md). Qui solo il flusso e le idee nuove.

### 2.1 Come si svolge
- **Unità di turno**: un frame (1 o 2 tiri; fino a 3 nel decimo). Ordine P1 → P4 frame per frame.
- **Giro del turno**:
  1. "Tocca a Viola · Frame 4" → telefono in `aim-action`.
  2. Il giocatore si mette in posizione sull'approccio (oggi la mira viene dalla direzione dello swing: ci si gira col corpo).
  3. **Tiene premuto**: il Pupo porta la palla al petto, il telefono vibra; da fermo si ricalibra lo yaw.
  4. **Swing** indietro e avanti; il braccio del Pupo segue il telefono.
  5. **Alza il pollice**: la palla parte. Sul telefono: "31 km/h · un po' a sinistra".
  6. Conteggio dei birilli → se non è strike, secondo tiro con i birilli rimasti evidenziati.
  7. Tabellone di 2 s, poi il prossimo giocatore.
- **Palla che si ferma sulla pista** (tiro lentissimo): dopo 6 s la palla viene "risucchiata" dal ritorno, si contano i birilli caduti.

### 2.2 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Classica (10 frame) | [MVP] | Regole ufficiali |
| Veloce (3 frame) | [MVP] | Per le feste; il terzo frame si gioca come un decimo (tiri bonus) |
| Allenamento | [Dopo] | Birilli infiniti, dati del tiro completi, grafico dello swing |
| A squadre (2 vs 2) | [Dopo] | Formato "a staffetta": i compagni si alternano i frame (A1 frame 1, A2 frame 2…), punteggio unico di squadra |
| Sfida degli split | [Dopo] | 10 configurazioni di birilli difficili, 1 tiro ciascuna; vince chi ne chiude di più |
| Strike o niente | [Forse] | Solo il primo tiro di ogni frame conta: 1 punto per strike, nient'altro. Veloce e caotica |

### 2.3 Assist
Già definiti nel GDD (velocità, direzione, spin, finestra di timing). In più:
- [Dopo] **Linea dello spare** in Facile: dopo il primo tiro una linea tratteggiata sulla pista suggerisce dove mirare per i birilli rimasti.
- [Dopo] **Mancino**: impostazione per giocatore che specchia la linea di gioco (già prevista per spin < 0) e il braccio del Pupo.

### 2.4 Chi aspetta
Tabellone proprio sul telefono; il tasto "Tifo!" non si può usare tra il "tieni premuto" e il rilascio di chi tira.

### 2.5 Premi
"Più strike" · "Braccio d'oro" (velocità massima) · "Mago dell'effetto" (spin massimo) · "Costanza" (scarto minimo tra frame) · consolazione: **"Amico delle canaline"** (più canaline).

### 2.6 Domande aperte
- Serve la posizione sull'approccio col trackpad o basta girarsi col corpo? Oggi il gesto da solo funziona: il trackpad potrebbe restare solo in Facile.
- Replay dello strike: slow-mo laterale o solo festa? Il replay costa un buffer di stati (06 § replay).

---

## 3. Bocce

> Brief: [games/bocce.md](games/bocce.md).

### 3.1 Come si svolge
Una partita è fatta di **mani**. In ogni mano si lancia il pallino, poi tutte le bocce; alla fine si contano i punti.

- **Bocce per giocatore**: 1 vs 1 → 4 bocce ciascuno · 2 vs 2 → 2 a testa (4 per squadra) · 3 giocatori → 3 a testa · 4 individuali → 2 a testa. In campo non ci sono mai più di 9 bocce.
- **Giro della mano**:
  1. **Pallino**: lo lancia chi ha vinto la mano precedente (alla prima mano P1). È valido se si ferma tra 5 e 12 m (campo da giardino di 15 m) e ad almeno 50 cm dalle sponde laterali; se no lo rilancia l'avversario più a sinistra nel tabellone. Il gesto è lo stesso della boccia, la fisica più leggera.
  2. **Prima boccia**: la tira chi ha lanciato il pallino.
  3. **Poi tira sempre chi è più lontano** (la squadra o il giocatore la cui boccia migliore è più lontana dal pallino), finché ha bocce. Chi non ha più bocce passa. È la regola che rende le bocce interessanti, ma è anche la meno intuitiva: lo schermo la deve spiegare ogni volta ("Tocca a Rosso: è più lontano di 42 cm").
  4. **Conteggio**: a bocce finite, vista dall'alto con i cerchi di distanza; la squadra più vicina segna 1 punto per ogni sua boccia più vicina della migliore avversaria. Se due bocce di squadre diverse sono a meno di 3 cm, arriva il Pupo arbitro con il metro (animazione di 2 s, poi verdetto).
- **Fine partita**: a 7 punti (veloce) o 11 (classica). Con 3–4 giocatori individuali: a 7, o dopo 6 mani chi ha più punti.
- **Casi limite**:
  - Boccia oltre la sponda di fondo o fuori campo: **morta**, si toglie.
  - Sponde laterali: valide, la boccia rimbalza (è parte del divertimento).
  - Pallino spinto fuori dal campo: mano nulla se entrambe le parti hanno ancora bocce; altrimenti i punti vanno a chi ha ancora bocce da giocare (1 punto per boccia rimasta).
  - Boccia ferma a contatto col pallino ("bacio"): è a distanza 0, festa.

### 3.2 Gesto e controller
- Presa e pendolo del bowling (stesso recognizer, soglie più basse).
- **Accosto o bocciata** si decidono dal gesto (pitch al rilascio, vedi brief). [MVP] Nei primi tiri e sempre in Facile, sul telefono c'è un indicatore "Rotolo / Volo" che si accende durante lo swing, così il giocatore vede cosa sta per fare.
- [Forse] In Facile il tipo di tiro si sceglie con un interruttore sul telefono e il gesto decide solo la forza.
- **Mira**: girandosi col corpo come nel bowling. In più, durante la mira, lo schermo mostra da dietro il campo con una freccia; niente previsione del punto d'arrivo (toglierebbe il dosaggio, che è il gioco).

### 3.3 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Partita a 7 / a 11 | [MVP] | Regole sopra |
| Una mano | [MVP] | Una sola mano, per provare |
| Bersaglio | [Dopo] | Niente pallino: cerchi disegnati sulla sabbia (10/5/2 punti) e 5 bocce a testa. Vince chi totalizza di più. Ottima per imparare il dosaggio |
| Bocciata al barattolo | [Forse] | Una lattina sul campo, da colpire in volo: a ogni centro si allontana di 1 m |

**Terreno** [Dopo]: si sceglie a inizio partita tra terra battuta (veloce), sabbia (lenta, irregolare) ed erba (molto lenta, rimbalzi morbidi). Cambia la resistenza al rotolamento e il carattere del campo.

### 3.4 Assist
| Livello | Forza | Direzione | Tipo di tiro |
|---|---|---|---|
| Facile | Curva piatta intorno alle velocità basse (dosaggio più facile) | ×0,3 | Interruttore Rotolo/Volo [Forse] |
| Normale | Curva a S | ×0,5 | Dal gesto, con indicatore |
| Pro | Quasi lineare | ×0,9 | Dal gesto, senza indicatore |

### 3.5 Chi aspetta
[Dopo] Minimappa dall'alto sul telefono, con le bocce colorate e le distanze dal pallino: è il gioco in cui il "consiglio del compagno" conta di più.

### 3.6 Camera
Dietro il giocatore in mira → segue la boccia → **vista drone dall'alto** quando tutte le bocce sono ferme, con un cerchio intorno alla boccia vincente → primo piano sul pallino se c'è il metro.

### 3.7 Premi
"Accosto d'oro" (boccia più vicina della partita) · "Bocciatore" (più bocce avversarie spostate) · "Baci" (più contatti col pallino) · consolazione: **"Gita in sponda"** (più bocce morte).

### 3.8 Domande aperte
- Il campo da 15 m sta in una vista leggibile su una TV? Da provare con la vista drone.
- Quante mani servono in media per arrivare a 7? Se troppe, la "veloce" va a 5.
- Il lancio del pallino è divertente o è un tempo morto? [Forse] posizionamento automatico casuale in Facile.

---

## 4. Tiri liberi

> Brief: [games/free-throw.md](games/free-throw.md).

### 4.1 Come si svolge
- **Unità di turno**: un tiro. Si gioca **a giri**: tutti tirano il tiro 1, poi tutti il tiro 2, e così via. Un tiro dura pochi secondi, quindi nessuno aspetta a lungo, e la tensione sale verso l'ultimo giro.
- **Giro del turno**:
  1. "Tocca ad Arancio · tiro 4 di 10" → telefono in `action`.
  2. Il Pupo è in lunetta con la palla; [Forse] palleggio rituale se il giocatore scuote il telefono verso il basso (non serve, ma fa ridere).
  3. **Tiene premuto** e porta il telefono sopra la fronte (caricamento).
  4. **Spinta verso l'alto** con flessione del polso, **pollice su** in cima.
  5. Volo della palla; esito: canestro, swish, ferro-dentro, ferro-fuori, tabellone, air ball.
  6. Sul telefono il consiglio: "Corto", "Lungo", "A sinistra", "Perfetto!".
- **Punteggio**: canestro 2 punti, **swish** 3 punti (il bonus premia il tiro pulito). Air ball 0 e un "ooh" del pubblico.
- **Spareggio**: in parità, tiri a oltranza a "morte improvvisa" tra i pari.

### 4.2 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Classica (10 tiri) | [MVP] | Sopra |
| A tempo (60 s) | [MVP] | Un giocatore alla volta, la palla torna subito; serie di 3 canestri di fila = moltiplicatore ×2 finché non si sbaglia |
| Giro del campo | [Dopo] | 5 posizioni intorno all'area a distanze crescenti (lunetta, angoli, da tre); si avanza solo se si segna, 2 tentativi per posizione. Vince chi arriva più lontano col minor numero di tiri. Distanze diverse = potenza diversa: è la vera prova del dosaggio |
| P-U-P-O | [Dopo] | Chi segna sceglie la posizione del tiro successivo e gli altri devono ripeterlo; chi sbaglia prende una lettera. Con P-U-P-O completo si è fuori. Ultimo in gara vince |
| Due canestri | [Forse] | Due giocatori **simultanei**, schermo diviso, 60 s: è un modo per avere un tiri liberi "di contatto". Richiede di fare due scene a 60 fps |

### 4.3 Assist
| Livello | Arco guida | Sweet spot di potenza | Direzione |
|---|---|---|---|
| Facile | Sempre | ±12%, attrazione forte | ×0,3 |
| Normale | Primi 3 tiri | ±8% | ×0,5 |
| Pro | Mai | Nessuno | ×0,9 |

### 4.4 Feedback chiave
Il "ciuff" della retina è il momento per cui si gioca: suono pulito, retina che si gonfia, telefono con una vibrazione morbida e lunga. Sul ferro: rimbalzi lenti in slow-mo leggero (0,6×) quando la palla balla, con il pubblico che trattiene il fiato.

### 4.5 Premi
"Mano calda" (serie più lunga) · "Solo retina" (più swish) · "Freddo come il ghiaccio" (canestro decisivo all'ultimo giro) · consolazione: **"Mattoncino"** (più ferri presi).

### 4.6 Domande aperte
- Il caricamento "telefono sopra la fronte" funziona con tutti i modi di tenere il telefono? Il recognizer usa la gravità per capire cos'è "su": da verificare con tracce vere (spike del gesto).
- 2 punti / 3 per lo swish o 1 / +1 come nel brief? Proposta: 2/3, si legge meglio nel tabellone.

---

## 5. Golf

> Brief con lo stato attuale: [games/golf.md](games/golf.md). Il golf è già giocabile: qui il flusso come è oggi e le idee per completarlo.

### 5.1 Come si svolge
- **Unità di turno**: un colpo. Su ogni buca **tira chi è più lontano dalla bandiera** (già nelle regole); dal tee l'ordine è chi ha fatto meno colpi alla buca prima (onore), alla prima buca P1.
- **Giro del turno** (come è implementato):
  1. "Tocca a Verde · 142 m dalla bandiera · vento 3 m/s da sinistra". Sul telefono le mazze disegnate, con quella suggerita già scelta.
  2. **Mazza**: si tocca driver, ferro o wedge; sul green c'è solo il putter.
  3. **Presa**: telefono fermo per 400 ms → vibrazione. Si ricalibra la "faccia square".
  4. **Mira**: si ruota il telefono (rollio) per spostare il cerchio di mira, ±15°.
  5. **Colpo pieno**: swing senza tasto, riconosciuto dal picco del movimento; la faccia del bastone viene dalla torsione durante il colpo.
  6. **Putt**: si tiene premuto il tasto, si fa il pendolo e si rilascia; conta l'ampiezza.
  7. Volo, rimbalzi, rotolamento; camera che segue la palla. Sul telefono "168 m · leggero slice".
- **Fine buca**: palla in buca, concessa entro 60 cm, o raccolta a par + 5. Tabellone di buca con il punteggio rispetto al par.
- **Penalità**: acqua +1 e drop all'indietro; fuori limite +1 e si ritira (implementato).

### 5.2 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Stroke play (3 buche) | [MVP] ✅ | Implementata |
| Percorso da 6 o 9 buche | [Dopo] | Procedurale con seme; **codice del percorso** di 4 caratteri per rigiocare lo stesso percorso un'altra sera |
| Match play | [Dopo] | Buca per buca: chi fa meno colpi vince la buca. Con 3–4 giocatori: punti 3/2/1/0 per buca |
| Scramble a squadre | [Dopo] | In ogni squadra tirano tutti dalla stessa posizione, si gioca il colpo migliore (lo sceglie lo schermo: il più vicino alla bandiera, fuori dagli ostacoli). È la modalità più "da festa" del golf: nessuno resta indietro |
| Più vicino alla bandiera | [Dopo] | Un par 3, un colpo a testa per 3 giri; conta la distanza dalla buca |
| Driving range | [Dopo] | Bersagli a 50/100/150/200 m con punti; utile anche per tarare potenza e faccia |
| Sfida di putt | [Forse] | 5 putt da distanze e pendenze crescenti |

### 5.3 Assist
| Livello | Faccia | Potenza | Altro |
|---|---|---|---|
| Facile | Errore di faccia ×0,4 | Il colpo pieno tende alla distanza piena della mazza | Linea del putt sul green; 1 mulligan (ripeti il colpo) per buca |
| Normale | ×1,0 | Dal gesto | Cerchio di mira con il vento |
| Pro | ×1,3, il rough conta di più | Dal gesto | Niente cerchio di mira, solo la freccia |

### 5.4 Chi aspetta
[Dopo] Minimappa della buca sul telefono con la posizione di tutte le palle e la distanza dalla bandiera; è anche il modo per capire perché tocca a qualcun altro.

### 5.5 Tempo
Il golf è il gioco più lento. Idee per tenerlo vivo:
- [MVP] Camera veloce: niente attese oltre ~1 s quando la palla è ferma (già c'è il focus breve con `cameraFocusId`).
- [Dopo] **Putt simultanei**: quando tutti sono sul green e lontani tra loro, i putt si possono giocare in rapida successione senza tabellone in mezzo.
- [Forse] Limite di 30 s per colpo con un orologio morbido (solo un avviso, nessuna penalità).

### 5.6 Premi
"Bombardiere" (drive più lungo) · "Cecchino" (colpo più vicino alla bandiera da fuori green) · "Mani di velluto" (putt più lungo imbucato) · consolazione: **"Pescatore"** (più palle in acqua).

### 5.7 Domande aperte (dal brief, ancora aperte)
- Taratura di potenza, faccia e ampiezza del putt su telefoni veri.
- Le colline procedurali danno buche sempre giocabili? Serve un controllo automatico del seme (la palla deve poter arrivare al green da tee in 1–3 colpi senza ostacoli obbligati).
- Il colpo senza tasto rischia falsi positivi quando il giocatore si sistema: la presa a telefono fermo basta come "sicura"?

---

## 6. Barber shop

> Brief: [games/barber.md](games/barber.md).

### 6.1 Come si svolge
- **Unità di turno**: un cliente, 90 s. Si gioca **a giri**: in ogni giro ogni giocatore ha un cliente, e **tutti ricevono la stessa richiesta** (stesso taglio target), così il confronto è giusto e si ride delle differenze.
- **Giro del turno**:
  1. Il cliente entra e si siede; sopra la testa una **figurina** del taglio richiesto (vista di fronte e di lato), più una battuta ("Solo una spuntatina, eh").
  2. Il giocatore vede il conto alla rovescia di 3 s; il telefono passa al layout `pointer`.
  3. **Puntamento**: inclinando il telefono si muove un cerchio luminoso sulla testa. Doppio tap = lo strumento torna al centro.
  4. **Taglio**: tenere premuto il tasto grande = macchinetta (vibra finché taglia); tap ritmici sul secondo tasto = forbici.
  5. **Girare il cliente**: swipe orizzontale sul trackpad ruota la poltrona di 90° (fronte, lato, nuca, altro lato). [Dopo] La camera si avvicina da sola alla zona su cui si lavora.
  6. **Pettine** (lunghezza della macchinetta): swipe verticale, 3 livelli, indicati sul telefono e accanto al cerchio.
  7. Allo scadere (o con "Finito!" se si vuole chiudere prima, con bonus tempo): il cliente si guarda allo **specchio**.
- **Voto**: da 1 a 5 stelle, calcolato dall'errore della mappa delle lunghezze rispetto al target, pesato per zona (frangia e nuca contano di più), più bonus simmetria e malus "buchi".

| Precisione | Stelle | Reazione del cliente |
|---|---|---|
| ≥ 90% | ★★★★★ | Felicissimo, si fa un selfie |
| 75–90% | ★★★★ | Contento, mancia |
| 55–75% | ★★★ | Perplesso, si tocca la testa |
| 35–55% | ★★ | "…grazie?" |
| < 35% | ★ | Scioccato, si mette un cappello (sempre comico, mai offensivo) |

- **Punti partita**: stelle × 100 + bonus tempo (fino a 50). Vince chi totalizza di più dopo 3 clienti.

### 6.2 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Classica (3 clienti) | [MVP] | Sopra |
| Salone | [Dopo] | 2 giocatori **simultanei** su due poltrone, schermo diviso, stessa richiesta |
| Corsa del sabato | [Dopo] | 3 minuti, clienti a raffica con tagli semplici: conta quanti se ne servono con almeno 3 stelle |
| Cliente misterioso | [Forse] | La richiesta è solo a parole ("Qualcosa di giovanile") e i Pupi spettatori votano con il tasto "Tifo!": il voto è del pubblico, non dell'algoritmo |
| Bottega libera | [Forse] | Niente tempo né voto; alla fine una "foto" del cliente da tenere |

**Strumenti in più** [Dopo]: rasoio per i clienti con la barba, spruzzino colorato per le tinte (scrive in una seconda mappa, quella del colore).

### 6.3 Assist
| Livello | Puntamento | Pennello | Altro |
|---|---|---|---|
| Facile | Magnetico verso il bordo della zona target, rallenta vicino ai bordi | +30% del visibile | Sagoma del target in trasparenza sulla testa |
| Normale | Rallenta vicino ai bordi | +15% | Sagoma solo nei primi 10 s |
| Pro | Diretto | = visibile | Nessuna sagoma |

### 6.4 Chi aspetta
Guarda lo schermo: è il gioco più divertente da guardare. [Dopo] il tasto "Tifo!" qui è un "Nooo!" quando il barbiere sta per rovinare la frangia.

### 6.5 Premi
"Mani d'oro" (media stelle più alta) · "Fulmine" (più bonus tempo) · "Simmetria perfetta" · consolazione: **"Stilista d'avanguardia"** (il voto più basso della partita).

### 6.6 Domande aperte
- Il puntamento da solo orientamento è abbastanza preciso per una frangia? È il rischio principale: serve uno spike del puntamento prima del GDD.
- La rotazione a scatti di 90° basta o serve una rotazione libera?
- Su iOS senza vibrazione continua, il ronzio audio dal telefono basta come feedback della macchinetta?

---

## 7. Scherma

> Brief: [games/fencing.md](games/fencing.md).

### 7.1 Come si svolge
- **Incontro 1 vs 1**, entrambi in piedi uno accanto all'altro, rivolti allo schermo ([brief § Sicurezza](games/fencing.md#sicurezza)).
- **Giro di un assalto**:
  1. **"En garde!"**: entrambi puntano il telefono verso lo schermo e tengono premuto → ricalibrazione. I Pupi si mettono in guardia al centro della pedana.
  2. **"Prêts? Allez!"**: dopo un conto alla rovescia di 1 s si combatte. Nessun turno: è tempo reale.
  3. Si muove la lama ruotando il polso (orientamento 1:1), si avanza e indietreggia con lo swipe, si affonda con la spinta in avanti e il tasto, si para con una rotazione rapida laterale.
  4. **Tocco**: luce del colore del giocatore sul tabellone, "Touché!", slow-mo di mezzo secondo sul tocco.
  5. **"Halte!"**: i Pupi tornano in guardia, punto assegnato, nuovo "En garde".
- **Fine incontro**: a 5 tocchi, oppure dopo 3 minuti chi ne ha di più (in parità: un tocco a morte improvvisa).

### 7.2 Meccanica (proposta per renderla leggibile)
Senza tracking di posizione la scherma rischia di diventare "agitare il telefono". Proposta: **quattro linee** di attacco e difesa, lette dalla direzione della lama.

| Concetto | Regola |
|---|---|
| **Linee** | La punta della lama sta in uno di 4 quadranti: alta-dentro, alta-fuori, bassa-dentro, bassa-fuori. Lo schermo li disegna leggermente sulla sagoma dell'avversario |
| **Misura** | L'affondo arriva solo se i Pupi sono "a misura" (distanza giusta, indicata da una linea a terra che si illumina). Fuori misura l'affondo va a vuoto e lascia scoperti per 400 ms: avvicinarsi diventa una scelta |
| **Affondo** | Colpisce la linea in cui sta la punta al momento della spinta |
| **Parata** | Riesce se, nella finestra di 150 ms prima del tocco, la lama del difensore si sposta **nella linea dell'attacco** con una rotazione rapida |
| **Risposta** | Dopo una parata riuscita, chi ha parato ha 500 ms di "priorità": se tocca in quel tempo il punto è suo anche in caso di tocco doppio |
| **Tocco doppio** | Entro 80 ms: punto a chi ha l'iniziativa (ha cominciato l'attacco per primo o ha la risposta) |
| **Spinta a vuoto** | Affondi ripetuti senza misura stancano il Pupo (brevissimo rallentamento): si scoraggia lo "spam" |

### 7.3 Modalità
| Modalità | Priorità | Come funziona |
|---|---|---|
| Incontro (5 tocchi) | [MVP] | Sopra |
| Allenamento contro il manichino | [MVP] | **Rende il gioco giocabile da 1**: un manichino che attacca su linee annunciate con un attimo d'anticipo, poi sempre più veloce. Serve anche come tutorial delle parate |
| Torneo (3–4 giocatori) | [Dopo] | Girone all'italiana a 3 tocchi (con 3 o 4 giocatori sono 3 o 6 incontri brevi), poi finale a 5 tra i primi due. Chi non combatte fa il tifo |
| Duello rapido | [Dopo] | Al meglio di 3 tocchi singoli: un tocco e si ricomincia |
| A squadre (2 vs 2) | [Forse] | Staffetta: i compagni si danno il cambio ogni 3 tocchi, punteggio di squadra fino a 9 |

### 7.4 Assist
| Livello | Finestra di parata | Linee | Altro |
|---|---|---|---|
| Facile | 220 ms | Mostrate sempre, con la linea dell'attacco avversario che lampeggia | Misura più lunga |
| Normale | 150 ms | Mostrate | — |
| Pro | 100 ms | Nascoste | Misura stretta |

Con livelli diversi tra i due giocatori, l'incontro resta giusto perché l'assist cambia solo la propria difesa, non l'attacco.

### 7.5 Rete
Buffer di giudizio di ~120 ms e timestamp nel clock del DO, come nel brief. Prima dell'incontro lo schermo misura l'RTT dei due telefoni; se p95 > 150 ms per uno dei due, avviso e proposta di stessa rete.

### 7.6 Premi
"Muro" (più parate) · "Fulmine" (tocco più rapido dopo l'Allez) · "Contropiede" (più risposte a segno) · consolazione: **"Spadaccino generoso"** (più tocchi subiti).

### 7.7 Domande aperte
- Le quattro linee sono leggibili sulla TV da 3 m? Prototipo 2D prima del 3D.
- Il manichino basta come modalità a 1 giocatore o serve un avversario CPU vero?
- Con il torneo a 4, quanto aspetta chi è eliminato? Il girone all'italiana evita eliminazioni, ma allunga.

---

## 8. Idee trasversali

### 8.1 Serata (modalità multi-gioco) [Dopo]
Una "playlist" di 3 giochi in versione veloce (es. Bowling 3 frame → Tiri liberi 5 tiri → Bocce una mano). A ogni gioco: 3 punti al primo, 2 al secondo, 1 al terzo, 0 al quarto. Alla fine **Podio della serata** con il Pupo campione con la coppa. È la modalità che trasforma la piattaforma in una festa vera, e si può aggiungere appena ci sono due giochi.

### 8.2 Squadre
Dove ha senso, le squadre sono **2 vs 2 con i colori degli slot** (P1+P3 contro P2+P4, modificabile in Impostazione): bocce (regola naturale), bowling a staffetta, golf scramble, scherma a staffetta, tiri liberi a somma.

### 8.3 Profilo nella stanza
Senza account: la stanza ricorda per la serata livello di assist, mano dominante e statistiche di ogni Pupo (sono già persistenti nella stanza, [03](03-network-protocol.md)). Si azzera quando la stanza scade.

### 8.4 Replay [Forse]
Per bowling (strike), tiri liberi (canestro decisivo) e golf (colpo in buca da fuori green): 3 s di replay rallentato, saltabile da chi è di turno. Costa un buffer di stati per gioco: da valutare dopo il primo.

### 8.5 Gesti e telefoni: regole di design
- Un gioco ha **al massimo un gesto principale** e un gesto secondario (es. scherma: affondo + parata). Tutto il resto è tasti o trackpad.
- Ogni gesto ha **un momento di presa a telefono fermo** (tenere premuto o stare fermi): serve a ricalibrare e a dire "ora faccio sul serio", e riduce i falsi positivi.
- Il telefono **dice sempre perché** un gesto non è valido, con parole semplici.

---

## 9. Confronto rapido

| | Bowling | Bocce | Tiri liberi | Golf | Barber shop | Scherma |
|---|---|---|---|---|---|---|
| Giocatori | 1–4 | 1–4 (2 vs 2) | 1–4 | 1–4 | 1–4 | 2 (1 con manichino; torneo 3–4) |
| Turno | Frame | Boccia, tira chi è più lontano | Tiro, a giri | Colpo, tira chi è più lontano | Cliente da 90 s, a giri | Simultaneo |
| Gesto | Pendolo + pollice | Pendolo (rotolo o volo) | Spinta in alto + polso | Swing a due mani / pendolo per il putt | Puntamento + tasti | Lama 1:1, affondo, parata |
| Durata tipica (4 giocatori) | 15 min (veloce: 5) | 12 min | 8 min | 15 min (3 buche) | 10 min | 6 min (torneo: 15) |
| Momento clou | Strike | Bacio / bocciata | Ciuff | Palla in buca | Specchio | Touché |
| Modalità a 1 giocatore | Sì | Sì (Bersaglio) | Sì | Sì | Sì | Manichino |
| Stato | Giocabile, fisica reale | Brief | Brief | Giocabile (3 buche) | Giocabile (Classica) | Brief |

---

## 10. Decisioni da prendere
In ordine di urgenza, con la proposta di questo brainstorming.

| # | Decisione | Proposta | Quando |
|---|---|---|---|
| 1 | Tiro di prova al primo turno in tutti i giochi | Sì, 1 per giocatore, non conta | Prima del rilascio del bowling |
| 2 | Politica per inattività e disconnessione del giocatore di turno | Pausa di 30 s, poi P1 sceglie | Con il bowling a 4 giocatori (Fase 4) |
| 3 | Mira del bowling: trackpad o solo corpo | Solo corpo; trackpad solo in Facile | Playtest bowling |
| 4 | Punteggio dei tiri liberi | 2 per canestro, 3 per swish | GDD dei tiri liberi |
| 5 | Bocce: tipo di tiro dal gesto o da interruttore in Facile | Dal gesto con indicatore; interruttore da provare | Spike del gesto delle bocce |
| 6 | Golf: percorsi più lunghi e codice del percorso | 6 e 9 buche con codice di 4 caratteri | Dopo la taratura su telefoni veri |
| 7 | Scherma: meccanica a quattro linee | Prototipo 2D prima del GDD | Prima della Fase 9 |
| 8 | Barber: spike del puntamento | Necessario prima del GDD | Prima della Fase 8 |
| 9 | Modalità Serata | Appena ci sono due giochi completi | Fase 5 |
| 10 | Tasto "Tifo!" sul `wait` | Sì, con limite di frequenza | Fase 4 |
