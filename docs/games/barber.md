# Barber shop — Brief

> Flusso della partita, modalità, assist e premi in discussione: [11 — Brainstorming § Barber shop](../11-games-brainstorm.md#6-barber-shop).

| Campo | Valore |
|---|---|
| ID modulo | `barber` |
| Giocatori | 1–4, a turni (ogni giocatore ha il suo cliente) o "salone": 2 in contemporanea su due clienti |
| Fisica | No (solo particelle dei capelli tagliati) |
| Accento | Menta retrò `#2EC4B6` |
| Layout controller | `pointer`, `wait` |
| Fattibilità | 🟡 Media |
| Ordine | 5° gioco |
| Stato | **Giocabile — MVP modalità Classica** (`games/barber/`): 3 clienti a testa, macchinetta + forbici, 3 pettini, poltrona a 90°, voto a stelle, assist, premi, telefono simulato |

## Fantasia
*"Ho seguito il modello, ho sfumato la nuca con la macchinetta che vibrava in mano e il cliente si è guardato allo specchio felicissimo."*

## Set
Bottega anni '60: pavimento a scacchi, poltrona da barbiere rossa, specchio con lampadine, barattoli e pettini colorati, insegna rotante a spirale (originale, nei colori dell'accento). Il **cliente** è un Piggy speciale, "peloso": un Piggy con una chioma morbida.

## Gesto
Il telefono **è lo strumento** e si tiene **dritto, in verticale**, come una macchinetta. Si muove come un mouse sulla testa: la macchinetta resta sempre appoggiata sulla cute e scorre nella direzione in cui si muove il telefono.
| Azione | Gesto | Riconoscimento |
|---|---|---|
| Muovere lo strumento | Girare (destra/sinistra) e inclinare (su/giù) il telefono | Il telefono manda dove guarda il suo retro (`packages/motion/aim.ts`, angoli dall'orientamento fuso, senza limiti né salti a ±180°); lo schermo ne usa i **movimenti**: 60° di telefono = 3,3 rad sulla testa. Niente centro da prendere e niente deriva; il rollio nel palmo non sposta niente |
| Cursore attaccato alla testa | Automatico | Il cursore è un punto della cute (longitudine, latitudine, `screen/pointing.ts`): si ferma sulla cima e poco sotto l'attaccatura, e la macchinetta 3D ci sta sempre appoggiata sopra |
| Tenere fermo il cursore | Automatico | Un "guinzaglio" di mezzo grado toglie il tremore della mano (dentro, la mira si assesta piano); vicino ai bordi del taglio il cursore rallenta (dwell) |
| Scegliere l'attrezzo | Toccare l'attrezzo sul carrello | Come le mazze del golf: macchinetta col **rialzo 0 / 3 / 6** (a zero, corto, medio) o **forbici**, disegnati in SVG (`shared/ToolArt.tsx`); quello in mano si alza e prende il colore del giocatore |
| Macchinetta | Tenere premuto il tasto grande | Taglia alla lunghezza del rialzo; **vibrazione continua** su Android (su iOS, ronzio audio) |
| Forbici | Tap sul tasto grande | Ogni tap è una sforbiciata con piccola area d'effetto |
| Girare la poltrona | Continuare a muoversi verso un lato | **Segue la macchinetta**: finché è entro ~26° dal centro della vista la testa sta ferma, oltre gira quel tanto che basta per tenerla davanti. Andando sempre a destra si passa sul lato e poi sulla nuca. Niente tasti; l'evento `rotate` resta per compatibilità (sposta il cursore di un quarto di giro) |

## Simulazione dei capelli (leggera)
- Il cuoio capelluto ha una **mappa UV** e una **DataTexture "lunghezze"** (es. 128×128, un byte per texel = lunghezza 0–255).
- I capelli si renderizzano come **shell texturing** (fino a 24 gusci, alpha-to-coverage letto dalla mappa delle lunghezze), ma con l'aspetto di capelli veri e non di un prato: le ciocche seguono un **flusso** (dal vortice sulla nuca verso il basso, i capelli lunghi si coricano), i fili sono fini e sparsi in 3D sulla radice, raggruppati in ciocche, con la luce dei capelli (**Kajiya-Kay**, due riflessi allungati) e un controluce. Dove i capelli sono corti la cute mostra la ricrescita, così una sfumatura passa dal pieno alla pelle.
- **Qualità adattiva**: se i frame restano lenti (TV, portatili deboli) i gusci scendono a 16 e poi a 10.
- Tagliare = scrivere nella DataTexture con un pennello (forma della macchinetta o delle forbici) dove punta lo strumento. Si aggiorna solo la regione toccata.
- Particelle di ciuffi che cadono (`InstancedMesh`), quantità ∝ capelli tolti.

## Regole e punteggio
- Ogni cliente arriva con una **richiesta**: una figurina del taglio desiderato (es. "sfumatura bassa", "cresta", "tutto a zero tranne il ciuffo").
- Il punteggio confronta la mappa delle lunghezze finale con quella target: errore medio pesato per zona, più bonus per la simmetria e malus per i "buchi".
- Il tempo è limitato (90 s per cliente). Reazione finale del cliente: felice, perplesso, scioccato. Sono sempre reazioni comiche, mai offensive.

## Rischi
- **Precisione del puntamento** con il solo orientamento, più il drift → assist "magnetico" verso il bordo della zona target, dwell (lo strumento rallenta vicino ai bordi), ricalibrazione con un doppio tap, e un'area di taglio un po' più grande del visibile.
- **Leggibilità**: il giocatore deve vedere dove taglia → anteprima del pennello sulla testa (cerchio luminoso) e camera che ruota da sola verso la zona su cui si lavora.
- **Feedback aptico su iOS** limitato → ronzio audio ritmico come sostituto.

## Implementazione (MVP)
- **Input continuo**: il pad manda `tool` {x, y, ax, ay, clip, comb, scissors} a ~20 Hz solo nel proprio turno (più `snip`, `rotate`, `finish`); il relay già scarta gli eventi di chi non è di turno. La mira è `createAimPointer` di `packages/motion`.
- **Capelli**: mappa 128×128 (`screen/hair-map.ts`) → `DataTexture` letta da 16 gusci in una sola `InstancedMesh` (`screen/hair-shells.ts`). In Facile/Normale lo shader colora in menta i capelli ancora da tagliare (sagoma dell'assist).
- **Puntamento**: cursore in longitudine/latitudine sulla testa, mosso dalle differenze di `ax`/`ay` (`screen/pointing.ts`); la poltrona lo segue (`followYaw`). L'attrezzo 3D è in `screen/tool-model.ts`.
- **Voto**: `screen/rules.ts` — errore medio pesato per area e zona, bonus simmetria, malus buchi; stelle × 100 + bonus tempo (da 3★).
- **Da fare**: prova del puntamento su telefoni veri (frangia), modalità Salone e Corsa del sabato, camera che segue la zona di lavoro.
