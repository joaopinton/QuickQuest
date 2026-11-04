# Golf — Brief

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

## Rischi
- **Contenuti**: le buche richiedono level design → editor minimo di heightfield + oggetti (JSON) e partenza con 3 buche.
- **Swing a due mani**: rischio di colpire oggetti o persone → avviso di spazio dedicato, swing anche "a metà" accettato.
- **Precisione del rilevamento dell'impatto** → soglie tarate sulle tracce, con una finestra temporale generosa.
