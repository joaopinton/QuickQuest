# Golf — Brief

> **Stato (2026-11-05): prima versione giocabile**, sul contratto modulo minimo ([05 § 6](../05-game-module-contract.md#6-implementazione-attuale)). Regole adattate da [choijunhuk/phonemote](https://github.com/choijunhuk/phonemote) (MIT, `golfState.ts`) in `games/golf/screen/rules.ts`: 3 buche procedurali con seme, mazze driver/ferro/wedge/putter, lie (tee, fairway, rough, bunker, green), faccia del bastone che apre o chiude il colpo, vento, pendenza del green, palla concessa entro 45 cm, raccolta a par + 5, tira chi è più lontano. Volo e rotolamento sono **analitici** (niente Rapier né aerodinamica per ora). Sul telefono (`games/golf/controller/`): presa a telefono fermo, mira dal rollio, colpo pieno riconosciuto da `burst.ts` senza tasto, putt tenendo premuto. Da tarare su telefoni veri: potenza, faccia e ampiezza del putt.

| Campo | Valore |
|---|---|
| ID modulo | `golf` |
| Giocatori | 1–4, a turni |
| Fisica | Sì — `aero.ts` (drag + Magnus) per il volo, `rolling-ball` + `surface-zones` per rimbalzi e rotolamento, heightfield per il terreno |
| Accento | Verde fairway `#3FAE4A` |
| Layout controller | `pad-action`, `wait` |
| Fattibilità | 🟡 Media (più contenuti, aerodinamica custom) |
| Ordine | 4° gioco |

## Fantasia
*"Ho caricato lo swing, ho chiuso la faccia del bastone all'ultimo e la palla è partita con un draw perfetto."*

## Set
Colline morbide in stile diorama: fairway a strisce (vertex color), rough più scuro, bunker di sabbia, green con bandierina, alberi a "lecca-lecca", laghetto. Cielo limpido, nuvole a forma di cuscino. **MVP: driving range + putting green + 3 buche corte (par 3).**

## Gesto
Il telefono si tiene **a due mani**, come l'impugnatura di un bastone, con lo schermo verso il giocatore e il pollice sul tasto.
| Fase | Controller | Riconoscimento |
|---|---|---|
| Mira | Trackpad 2D: direzione del colpo; tasto per cambiare bastone (driver, ferro, wedge, putter) | — |
| Address | Tenere premuto, telefono fermo in basso | Ricalibrazione dello yaw e della posizione "faccia square" |
| Backswing | Il telefono sale dietro le spalle | Si misura l'**angolo di backswing** (dalla rotazione integrata: ¼, ½, ¾, pieno) |
| Downswing | Discesa veloce | Picco di ω → **velocità della testa del bastone** = ω × R_bastone (dipende dal bastone) |
| Impatto | Passaggio per il punto di address (stesso orientamento) | Si rileva il passaggio per lo zero dell'angolo; a quell'istante si leggono la **faccia** (roll relativo → aperta o chiusa) e il **percorso** (yaw della velocità angolare) |
| Rilascio tasto | Può avvenire dopo; non decide l'impatto | — |

- **Faccia aperta / chiusa** → slice / hook (spin laterale).
- **Percorso in-out / out-in** → push / pull.
- **Putting**: gesto corto a pendolo, con velocità più fine e assist della "linea" sul green.

## Simulazione
- **Volo**: integrazione propria (non Rapier) con gravità, drag e Magnus (backspin → portanza, side spin → curva) e vento opzionale.
- **Atterraggio**: rimbalzo con restitution e attrito che dipendono dalla superficie (fairway, rough, green, bunker, acqua = penalità).
- **Rotolamento** sul green: heightfield con pendenze; si usa la stessa `rolling-ball`.
- **Terreno**: heightfield generato da poche "colline" parametriche più colori per zona (niente texture).

## Regole
Stroke play su 3 buche (MVP), punteggio relativo al par. Il putter si seleziona automaticamente sul green.

## Camera
Dietro il giocatore → segue la palla in volo (con indicatore della distanza) → camera all'atterraggio → panoramica del green con la linea di pendenza.

Com'è fatta oggi (`games/golf/screen/scene.ts`): la camera sta sempre dietro la palla, sulla linea palla → buca, e guarda verso la buca. In volo resta sulla linea del colpo; a palla ferma gira attorno alla palla e torna a mirare la buca, anche quando la palla l'ha superata. Più si è vicini, più la camera scende e si avvicina (putt). Dopo un colpo resta un attimo sulla palla ferma (`cameraFocusId`, `flow.ts`), così si vede la palla cadere in buca: la buca è un foro vero nel green, la bandiera si alza, la palla scivola dentro e rimbalza sul fondo.

## Rimbalzi e rotolamento
All'atterraggio la palla rimbalza e poi rotola (`touchdown`, `rules.ts`). La corsa dopo l'atterraggio è una quota del carry che dipende dal terreno e dalla mazza (driver corre, wedge ha effetto e si ferma). Fairway: due rimbalzi; green: uno, morbido; rough: uno basso; sabbia: nessuno, la palla si pianta. Mentre rotola, la frenata è quella del terreno sotto la palla in quel momento: dal fairway nel rough rallenta, nella sabbia si ferma. Ogni contatto manda un evento `touchdown` per gli sbuffi d'erba o di sabbia sullo schermo.

Sullo schermo (`fx.ts`): scia a puntini del colore del giocatore, che sbiadisce a palla ferma; cerchio di mira dove cade la mazza scelta a piena potenza, vento compreso (`aimPreview`); bandierina che sventola col vento; scheda del colpo coi metri fatti.

## Acqua e fuori limite
Ostacoli in `games/golf/screen/hazards.ts`. Laghetti generati col seme (con un generatore a parte, così i semi vecchi tengono le stesse buche): a volte uno a lato del fairway e, sui par 3, a volte uno davanti al green da superare in volo. Mai su green, tee, bunker o oltre i paletti. Paletti bianchi a |x| = 48 m, dietro il tee e 35 m oltre il green; oltre, il prato è più scuro.

Regole (semplificate): conta solo dove la palla tocca terra (in volo si passa sopra), ma anche rotolando si può entrare. Acqua: +1 colpo, drop fuori dall'acqua sulla linea verso il punto di partenza. Fuori limite: +1 colpo e si ritira da dove si era. Evento `penalty` → spruzzo (o sbuffo), la palla sparisce un attimo, la camera guarda lo spruzzo e poi va al drop; messaggio sullo schermo e cue d'errore al telefono. Il cerchio di mira diventa rosso se a piena potenza la mazza finisce in un ostacolo.

## Mazze
Sul telefono le mazze sono disegnate (`games/golf/shared/ClubArt.tsx`) e si sceglie toccandole: driver, ferro, wedge con la distanza massima; sul green c'è solo il putter. Il pad si allinea alla mazza suggerita dallo schermo leggendo il testo del turno (`clubFromTurnText`). La stessa mazza disegnata compare sullo schermo nel riquadro di chi tira.

## Rischi
- **Contenuti**: le buche richiedono level design → editor minimo di heightfield + oggetti (JSON) e partenza con 3 buche.
- **Swing a due mani**: rischio di colpire oggetti o persone → avviso di spazio dedicato, swing anche "a metà" accettato.
- **Precisione del rilevamento dell'impatto** → soglie tarate sulle tracce, con una finestra temporale generosa.
