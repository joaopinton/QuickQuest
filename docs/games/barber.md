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
Il telefono **è lo strumento**: lo si tiene come una macchinetta o un paio di forbici.
| Azione | Gesto | Riconoscimento |
|---|---|---|
| Muovere lo strumento | Inclinare e ruotare il telefono | **Orientamento → posizione sulla superficie della testa**: la direzione del telefono è un raggio che colpisce la testa del cliente (raycast su una sfera o capsula); è un puntamento relativo, non 1:1 nello spazio |
| Macchinetta | Tenere premuto il tasto grande | Taglia alla lunghezza del "pettine" scelto; **vibrazione continua** su Android (su iOS, tick ritmati e ronzio audio) |
| Forbici | Tap ritmici sul secondo tasto | Ogni tap è un taglio "a sforbiciata" con piccola area d'effetto |
| Lunghezza pettine | Swipe su/giù sul trackpad | 3 livelli |
| Ricalibrazione | Doppio tap | Lo strumento torna al centro della testa |

## Simulazione dei capelli (leggera)
- Il cuoio capelluto ha una **mappa UV** e una **DataTexture "lunghezze"** (es. 128×128, un byte per texel = lunghezza 0–255).
- I capelli si renderizzano come **shell texturing** (8–16 gusci di mesh che si allargano, con alpha test letto dalla mappa delle lunghezze e da un rumore): è economico, morbido, molto "giocattolo" e coerente con lo stile.
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
- **Input continuo**: il pad manda `tool` {x, y, clip, comb} a ~20 Hz solo nel proprio turno (più `snip`, `rotate`, `finish`); il relay già scarta gli eventi di chi non è di turno. Il puntatore è `createPointer` + `aimRates` di `packages/motion`.
- **Capelli**: mappa 128×128 (`screen/hair-map.ts`) → `DataTexture` letta da 16 gusci in una sola `InstancedMesh` (`screen/hair-shells.ts`). In Facile/Normale lo shader colora in menta i capelli ancora da tagliare (sagoma dell'assist).
- **Puntamento**: raycast logico su sfera con la stessa inclinazione della telecamera (`screen/pointing.ts`); il cursore rallenta vicino ai bordi del taglio (dwell).
- **Voto**: `screen/rules.ts` — errore medio pesato per area e zona, bonus simmetria, malus buchi; stelle × 100 + bonus tempo (da 3★).
- **Da fare**: prova del puntamento su telefoni veri (frangia), modalità Salone e Corsa del sabato, camera che segue la zona di lavoro.
