# Golf — Brief

> **Stato (2026-11-05): prima versione giocabile**, sul contratto modulo minimo ([05 § 6](../05-game-module-contract.md#6-implementazione-attuale)). Regole adattate da [choijunhuk/phonemote](https://github.com/choijunhuk/phonemote) (MIT, `golfState.ts`) in `games/golf/screen/rules.ts`: 3 buche procedurali con seme, mazze driver/ferro/wedge/putter, lie (tee, fairway, rough, bunker, green), faccia del bastone che apre o chiude il colpo, vento, pendenza del green, palla concessa entro 60 cm dal centro, raccolta a par + 5, tira chi è più lontano. Terreno a griglia di quote con colline e avvallamenti (`terrain.ts`) e fisica della palla integrata a passo fisso (`physics.ts`): drag, Magnus, rimbalzi sulla pendenza, rotolamento in discesa, buca vera (30 cm di raggio, la stessa per fisica e scena) con lip-out. Sul telefono (`games/golf/controller/`): presa a telefono fermo, mira dal rollio, colpo pieno riconosciuto da `burst.ts` senza tasto, putt tenendo premuto. Da tarare su telefoni veri: potenza, faccia e ampiezza del putt.

| Campo | Valore |
|---|---|
| ID modulo | `golf` |
| Giocatori | 1–4, a turni |
| Fisica | Sì — `games/golf/screen/physics.ts` (volo con drag + Magnus + vento, rimbalzi, rotolamento, buca) sul heightfield di `terrain.ts` |
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
Com'è fatta oggi (`games/golf/screen/physics.ts`, passo fisso 1/120 s, x a destra, y verso la bandiera, z in alto):
- **Volo**: gravità, resistenza dell'aria (∝ v²), effetto Magnus dal backspin (portanza, con un tetto) e dal sidespin (curva), vento laterale come aria che si muove. Ogni mazza ha angolo di lancio e backspin suoi (driver basso e teso, wedge alto). La velocità di lancio si **tara** cercando quella che su terreno piatto senza vento fa esattamente il carry della mazza (`launchSpeedFor`, bisezione con cache): così le distanze di `CLUB_CARRY_M` restano vere, ma in salita si atterra prima, in discesa dopo, e il vento sposta davvero.
- **Faccia**: un terzo circa decide la partenza, il resto inclina l'asse di rotazione (sidespin) e la palla curva in volo: faccia aperta = slice a destra, chiusa = hook. Dal rough e dalla sabbia la faccia conta di più e lo spin cala.
- **Rimbalzo**: la velocità si scompone sulla normale del terreno (quindi su una pendenza la palla schizza di lato). La parte normale torna con l'elasticità del terreno, più bassa negli impatti forti; quella lungo il terreno perde presa (di più se l'impatto è ripido) ed è frenata dal backspin: il wedge sul green morde e può tornare indietro di un metro, il driver sul fairway corre 25–35 m.
- **Rotolamento**: la gravità lungo la pendenza (5/7 g, palla che rotola) e la frenata dell'erba sotto la palla. Fuori dal green la frenata è più forte a palla veloce e più debole a palla lenta, così su un pendio vero la palla riparte a valle; sul green è costante (`GREEN_ROLL_REF / greenSpeed`), così il putt è misurabile: sul piano la palla fa `gradi × 0,09 × velocità del green` metri. Si ferma solo se la pendenza non vince l'attrito.
- **Buca**: un foro "da gioco" di 30 cm di raggio (`CUP_RADIUS_M`), **lo stesso disegnato sullo schermo**: se la palla passa sopra il foro che si vede, per la fisica è sopra il foro. Sopra il foro la palla perde appoggio e cade; se ci resta abbastanza (`CAPTURE_DROP_M`) è dentro: al centro entra fino a ~1,9 m/s, di striscio la corda è più corta e deve andare più piano. Più veloce salta il foro, o se è già scesa abbastanza sbatte sul bordo ed esce girando e perdendo velocità (lip-out). In volo: se tocca terra dentro il foro a meno di 3 m/s è in buca; più forte sbatte sulla parete dietro e schizza fuori in alto, più lenta. Palla ferma entro 60 cm dal centro: concessa.

## Terreno
`games/golf/screen/terrain.ts`: una griglia di quote a passo di 1 m (fino a 22 m oltre i paletti). Ogni cella è divisa in due triangoli lungo la stessa diagonale della mesh disegnata, e quota e gradiente si leggono su quei triangoli: la palla sta esattamente sul prato che si vede (niente palla che galleggia o affonda). Si calcola una volta per buca (cache) da:
- colline a campana col seme (`makeHills`): montagnette ai lati del fairway (1,5–5 m), ondulazioni e avvallamenti sul fairway, a volte un green rialzato e una conca davanti al green;
- tee piano a quota 0;
- green su un piano inclinato di lato (`slopeDegPerM × 2 %` di pendenza): il putt "rompe" verso il basso;
- conche: i bunker sono scodelle di sabbia, i laghetti stanno in una conca con il pelo dell'acqua a metà conca (`waterLevel`): su terreno piano la riva cade sull'ellisse del laghetto, e una palla che rotola vicino all'acqua ci scivola dentro.
- le zone non si sovrappongono: i bunker stanno fuori dal green (con 2,5 m d'erba) e lontani tra loro; i laghetti lontani da green, bunker e altri laghetti.
Sullo schermo (`terrain-mesh.ts`) la stessa griglia è il prato. I colori delle zone (fairway a strisce, rough, green, sabbia, fuori limite) si calcolano **per pixel** nello shader con la stessa logica di `lieAt`, quindi i bordi sono netti e coincidono con le regole; dai vertici arriva solo la luce delle colline. Il materiale scarta i pixel dentro la buca, che è un foro vero con pareti e bordo che seguono la pendenza del green. Gli overlay appoggiati sul prato (ombre, bordo della buca, cerchi) usano `polygonOffset`, e il prato esterno sta sotto il bordo della griglia: niente sfarfallio.

## Regole
Stroke play su 3 buche (MVP), punteggio relativo al par. Il putter si seleziona automaticamente sul green.

## Camera
Dietro il giocatore → segue la palla in volo (con indicatore della distanza) → camera all'atterraggio → panoramica del green con la linea di pendenza.

Com'è fatta oggi (`games/golf/screen/scene.ts`): la camera sta sempre dietro la palla, sulla linea palla → buca, e guarda verso la buca. In volo resta sulla linea del colpo; a palla ferma gira attorno alla palla e torna a mirare la buca, anche quando la palla l'ha superata. Più si è vicini, più la camera scende e si avvicina (putt); se una collina copre la palla, la camera sale finché la palla si vede. Le palle si disegnano più grandi da lontano (fino a 60 cm di raggio, se no sarebbero invisibili) e piccole da vicino (12 cm), così vicino alla buca stanno nel foro in proporzione. Dopo un colpo resta un attimo sulla palla ferma (`cameraFocusId`, `flow.ts`), così si vede la palla cadere in buca: la buca è un foro vero nel green, la bandiera si alza, la palla scivola dentro e rimbalza sul fondo.

## Effetti
Ogni contatto col terreno manda un evento `touchdown` per gli sbuffi d'erba o di sabbia sullo schermo.

Sullo schermo (`fx.ts`): scia a puntini del colore del giocatore, che sbiadisce a palla ferma; cerchio di mira dove cade la mazza scelta a piena potenza, vento compreso (`aimPreview`); bandierina che sventola col vento; scheda del colpo coi metri fatti.

## Acqua e fuori limite
Ostacoli in `games/golf/screen/hazards.ts`. Laghetti generati col seme (con un generatore a parte, così i semi vecchi tengono le stesse buche): a volte uno a lato del fairway e, sui par 3, a volte uno davanti al green da superare in volo. Mai su green, tee, bunker o oltre i paletti. Paletti bianchi a |x| = 48 m, dietro il tee e 35 m oltre il green; oltre, il prato è più scuro.

L'acqua è dove si vede: l'ostacolo (`underwater` in `terrain.ts`) è il punto con il terreno sotto il pelo dell'acqua, dentro il piano d'acqua disegnato (`WATER_SHEET_SCALE`); la riva che si vede è il confine.

Regole (semplificate): conta solo dove la palla tocca terra (in volo si passa sopra), ma anche rotolando si può entrare. Acqua: +1 colpo, e si droppa **dietro il punto da cui si è tirato**, 10 m più lontano dalla bandiera (`waterDrop`, mai dentro un ostacolo, mai più vicino alla bandiera di dove si era): buttarla in acqua non fa mai guadagnare strada. Dal tee si torna dietro il tee. Fuori limite: +1 colpo e si ritira da dove si era. Evento `penalty` → spruzzo (o sbuffo), la palla sparisce un attimo, la camera guarda lo spruzzo e poi va al drop; messaggio sullo schermo e cue d'errore al telefono. Il cerchio di mira diventa rosso se a piena potenza la mazza finisce in un ostacolo.

## Mazze
Sul telefono le mazze sono disegnate (`games/golf/shared/ClubArt.tsx`) e si sceglie toccandole: driver, ferro, wedge con la distanza massima; sul green c'è solo il putter. Il pad si allinea alla mazza suggerita dallo schermo leggendo il testo del turno (`clubFromTurnText`). La stessa mazza disegnata compare sullo schermo nel riquadro di chi tira.

## Rischi
- **Contenuti**: le buche richiedono level design → editor minimo di heightfield + oggetti (JSON) e partenza con 3 buche.
- **Swing a due mani**: rischio di colpire oggetti o persone → avviso di spazio dedicato, swing anche "a metà" accettato.
- **Precisione del rilevamento dell'impatto** → soglie tarate sulle tracce, con una finestra temporale generosa.
