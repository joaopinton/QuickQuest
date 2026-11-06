# Bowling — Game Design Document

> Flusso della partita, modalità, assist e premi in discussione: [11 — Brainstorming § Bowling](../11-games-brainstorm.md#2-bowling).

| Campo | Valore |
|---|---|
| ID modulo | `bowling` |
| Giocatori | 1–4, a turni |
| Durata | ~4 min a giocatore (10 frame); modalità veloce: 3 frame |
| Fisica | Sì (Rapier) |
| Accento | Viola neon `#8E5BFF` |
| Layout controller | `aim-action`, `wait` |
| Stato | **Primo gioco: vertical slice nella Fase 3** |

## 1. Fantasia del giocatore
*"Ho sentito la palla partire dalla mia mano, e la curva che ho dato col polso ha centrato la tasca."*

Il bowling è il gioco ideale per partire: il gesto è naturale (pendolo dal basso), il rilascio è un momento preciso, l'esito si legge subito e la fisica dei birilli dà soddisfazione.

---

## 2. Set e misure
Le misure sono reali e la fisica le usa così come sono. Il visivo può esagerare palla e birilli del 10% ([07 § Forme](../07-art-direction.md#2-forme)).

| Elemento | Misura reale | Note |
|---|---|---|
| Pista: dalla linea di fallo al birillo 1 | 18,29 m | |
| Larghezza pista | 1,054 m (39 tavole) | Le tavole sono strisce di vertex color alternate |
| Canaline | ~0,235 m ciascuna, sezione semicircolare | Collider: due cilindri tagliati / trimesh semplice |
| Approccio (rincorsa) | 4,57 m | Dove si muove il Pupo |
| Frecce di mira | 7 frecce a ~4,6 m dalla linea di fallo | Riferimento visivo per mirare, come nel reale |
| Birilli | Alti 38,1 cm, Ø max 12,1 cm, 1,53 kg | Triangolo, passo 30,48 cm tra i centri |
| Palla | Ø 21,6 cm, 6,4 kg (14 lb) | Colore = colore del Pupo, con riflesso lucido |
| Zona oliata | primi 12 m (~40 ft) | μ ≈ 0,04 |
| Back end asciutto | ultimi ~6,3 m | μ ≈ 0,20 |
| Pin deck + pozzetto | dietro i birilli | I birilli che cadono nel pozzetto vengono rimossi |

### Ambiente
- Una sala bowling "serale e accogliente": la pista protagonista in primo piano; le piste vicine come set più scuri con Pupi di sfondo che giocano in loop; insegne al neon **originali** (birillo stilizzato, stelline); un pubblico di Pupi sulle panche dietro l'approccio.
- **Tabellone** sopra i birilli: monitor stilizzato con il frame corrente e il punteggio.
- **Pinsetter**: una barra sweeper che scende, spazza e risale (animazione procedurale).
- Luce: sala calda (ambra), la pista come superficie lucida (riflesso finto a gradiente, o planar reflection sul tier High), rim light viola dall'accento.

---

## 3. Controlli e riconoscimento del gesto

### 3.1 Presa
Il telefono si tiene **in verticale nel palmo, con lo schermo verso l'alto e il pollice sul tasto azione**, come se si reggesse la palla dal sotto. Il recognizer **non dipende dalla presa esatta** (vedi 3.3), quindi il giocatore può tenerlo come gli viene naturale.

### 3.2 Fasi del turno
| Fase | Controller (layout `aim-action`) | Schermo |
|---|---|---|
| **Mira** | Trackpad: trascinamento orizzontale. Un chip alterna **Sposta** (posizione sull'approccio, a scatti di 1 tavola) e **Ruota** (angolo della freccia di mira, ±6°). | Pupo sull'approccio, freccia di mira che proietta la linea sulla pista fino alle frecce |
| **Preparazione** | Il giocatore **tiene premuto** il tasto → vibrazione breve, il tasto si "abbassa" | Il Pupo porta la palla al petto; ricalibrazione automatica dello yaw (telefono fermo) |
| **Swing** | Il tasto resta premuto, il braccio va indietro e poi avanti | **Il braccio del Pupo segue la posa del telefono** (IK); i passi della rincorsa avanzano in proporzione alla fase dello swing, così il rilascio cade sulla linea di fallo |
| **Rilascio** | Il giocatore **alza il pollice** → l'evento parte subito, con feedback aptico locale immediato | La palla esce dalla mano con i parametri dell'evento |
| **Annullo** | Alzare il pollice senza swing valido | Il Pupo riporta la palla al petto ("Ripensamento!"), il turno non si consuma |

### 3.3 Recognizer (`games/bowling/controller/recognizer.ts`)
Stati: `idle → armed → backswing → forward → released | cancelled`.

1. **Asse dello swing, indipendente dalla presa.** Durante `armed` e `backswing` si accumula la direzione di ω, normalizzata e pesata per |ω|. L'asse dominante (media pesata, eventualmente PCA su 3×3) è l'**asse del pendolo**. La componente di ω lungo quell'asse è la **velocità angolare dello swing** ω_s.
2. **Ingresso in `backswing`**: |ω_s| > 2,5 rad/s per ≥ 60 ms.
3. **Ingresso in `forward`**: ω_s cambia segno (inversione in cima al backswing) e supera 2,5 rad/s nel verso opposto.
4. **Al rilascio** (pollice su, in `forward`), si calcolano:

| Parametro | Stima | Mapping di gioco |
|---|---|---|
| **Velocità** | v_misurata = ω_s(media degli ultimi 40 ms) × R, con R = 0,65 m (raggio del braccio; regolabile con l'impostazione "altezza") | `AssistCurve` → 4,0–10,5 m/s; curva a S centrata su 7,5 m/s; saturazione morbida |
| **Spin (effetto)** | Rotazione del polso: integrale della componente di ω **ortogonale** all'asse dello swing, lungo la direzione dell'avambraccio, negli ultimi 120 ms | Inclinazione dell'asse di rotazione della palla 0–45° e rev rate 0–35 rad/s; il segno decide l'hook a sinistra o a destra |
| **Direzione** | Differenza di yaw tra il piano dello swing al rilascio e la calibrazione | Deviazione dalla freccia di mira, smorzata dall'assist (Normale: ×0,5), clamp ±4° |
| **Timing** | Rilascio troppo presto (ω_s ancora debole, < 40% del picco) o troppo tardi (dopo il picco + 150 ms) | Penalità: palla "lofted" (rimbalzo) o più lenta e storta |
| **Confidenza** | Qualità del segnale: swing pulito, durata plausibile (0,4–2 s), nessuna saturazione | < 0,5 → il tiro vale comunque, ma con parametri "medi" e un messaggio sul telefono ("Prova uno swing più ampio") |

5. **Evento** inviato:
```ts
interface BowlingRelease {
  t: 'bowling.release';
  p: {
    speed: number;        // m/s, già mappata (4.0–10.5)
    spinAxisTilt: number; // rad, segno = verso dell'hook
    revRate: number;      // rad/s
    dirOffset: number;    // rad, deviazione dalla freccia di mira
    timing: number;       // -1 (presto) … 0 (perfetto) … +1 (tardi)
    confidence: number;   // 0..1
    tRelease: number;     // ms, clock del DO
    raw: { omegaS: number; wristRoll: number }; // per debug/tuning
  };
}
```
Lo schermo **valida e limita** ogni campo prima di usarlo.

### 3.4 Livelli di assist (impostazione per giocatore)
| Livello | Velocità | Direzione | Spin | Timing |
|---|---|---|---|---|
| **Facile** | Curva molto morbida verso 7–8 m/s | ×0,3 | ×0,7 | Finestra ampia |
| **Normale** (default) | Curva a S | ×0,5 | ×1,0 | Finestra media |
| **Pro** | Quasi lineare | ×0,9 | ×1,2 | Finestra stretta |

---

## 4. Fisica (`games/bowling/screen/physics.ts`)
- **Palla**: sfera con massa 6,4 kg e inerzia da raggio giratore reale (RG 2,50", I = m·RG²), CCD attivo, nessuno smorzamento, attrito palla 1,0 con regola di combinazione **`Min`**, così vince l'attrito della superficie, e restitution 0,7 (palla-birillo 0,6 con la media).
- **Pista**: **due collider box** contigui, *olio* (μ 0,04) e *back end* (μ 0,20). In questo modo l'hook emerge da solo: nell'olio la palla scivola conservando lo spin, nel back end l'attrito converte lo spin laterale in curva fino al rotolamento puro. Si regola con [`surface-zones.ts`](../06-rendering-physics.md#estensioni-nostre-in-packagesenginephysics).
- **Birilli**: corpo rigido con **collider composto** da convex hull ricavati dallo stesso profilo lathe della mesh (pancia, collo e testa separati), massa 1,53 kg, baricentro USBC a 14,9 cm dalla base e tensore d'inerzia del solido di rotazione (`computePinInertia`), restitution 0,5 tra birilli, attrito 0,25, CCD attivo. Nessuno smorzamento in volo: solo una resistenza al rotolamento quando il birillo è sdraiato sul pin deck. La base (primi 2 cm) è un **cilindro**: il contatto convex hull–pista in Rapier vibra e faceva "camminare" e cadere i birilli da soli.
- **Hitbox e birilli fermi**: un birillo in piedi sullo spot è un **corpo fisso** e non può cadere da solo. Prima di ogni sottopasso si controllano le hitbox: la palla è una sfera che spazza il tragitto del sottopasso, il birillo una capsula col raggio della pancia attorno al suo asse (`ballHitsPin`, `segmentDistance`). Quando la palla o un birillo già in moto entra nella hitbox di un birillo fermo, quel birillo diventa dinamico e da lì in poi è tutta fisica reale (`releaseHitPins`).
- **Conservazione**: Rapier integra le equazioni di Eulero complete (termine giroscopico incluso), quindi il momento angolare si conserva in volo e cambia solo per gli impulsi di contatto. Non ci sono forze aggiunte a mano: l'hook è solo attrito di Coulomb tra il punto di contatto che slitta e la pista.
- **Canaline**: collider semicircolari. La palla che ci entra viene "guidata" fino in fondo e non colpisce birilli.
- **Lancio**: la palla parte dalla posizione della mano del Pupo alla linea di fallo con:
  - velocità lineare = `speed` nella direzione della freccia di mira + `dirOffset`;
  - **linea di gioco** (`playingLine`): come un giocatore vero, chi fa hook parte dal lato da cui la palla rientra (fino a 29 cm dal centro) e tira leggermente verso l'esterno; la tabella è tarata in simulazione perché col tiro normale (7,5 m/s) e mira dritta la palla entri in tasca (7 cm dal birillo 1) con 0–3° d'ingresso. Più lenta curva di più (colpo alto), più veloce di meno (colpo leggero), la mira del telefono si somma. Mancini (spin < 0) a specchio;
  - velocità angolare = `revRate` da 10 a 27 rad/s attorno a un asse orizzontale ruotato fino a 30,6° dall'asse di rotolamento, entrambi proporzionali a `|spin|` (`releaseAngularVelocity`). La palla parte in slittamento (giri < v/R) e l'attrito la porta al rotolamento puro nel back end.
- **Sottopassi**: 4 (240 Hz) durante la fase Resolve.
- **Conteggio**: dopo che la palla ha superato i birilli o è caduta nel pozzetto si attende che tutti i birilli siano in *sleep*, con un **timeout di 4 s**. Un birillo è **abbattuto** se è inclinato oltre 25°, se si è spostato di oltre 12 cm dal suo spot o se è caduto nel pozzetto.
- **Spare**: tra il primo e il secondo tiro lo sweeper rimuove i birilli abbattuti e quelli in piedi tornano esattamente nel loro spot (sono "teletrasportati" sotto la copertura del pinsetter, come nel reale).

### Parametri di tuning esposti (pannello di sviluppo)
`oilLength`, `muOil`, `muDry`, `pinMass`, `pinCoMHeight`, `pinRestitution`, `ballMass`, `R_arm`, curve di assist, soglie del recognizer. Sono salvati in `games/bowling/tuning.json`, versionato.

---

## 5. Regole e punteggio (`games/bowling/screen/rules.ts`, logica pura)
- 10 frame per giocatore; 2 tiri per frame, salvo lo strike.
- **Strike** (X): 10 + i 2 tiri successivi. **Spare** (/): 10 + il tiro successivo.
- **10° frame**: dopo uno strike si hanno 2 tiri bonus, dopo uno spare 1 tiro bonus. Massimo 3 tiri.
- **Canalina**: 0 birilli (simbolo "G"). Il fallo non viene modellato: il Pupo si ferma sempre sulla linea.
- Ordine: P1 frame 1 → P2 frame 1 → … (come nel reale).
- **Test obbligatori**:
  - partita perfetta (12 strike) = 300;
  - tutti 9-/ seguiti da 9 = 190;
  - tutti spare 5/ con 5 bonus = 150;
  - tutte canaline = 0;
  - punteggi parziali di frame aperti dopo strike o spare.

---

## 6. Camera (`camera.ts`)
| Inquadratura | Quando | Descrizione |
|---|---|---|
| **Dietro il Pupo** | Mira e swing | 3 m dietro e 1,6 m in alto, guarda verso i birilli; leggera inclinazione verso la freccia di mira |
| **Segui palla** | Dopo il rilascio | Segue la palla da dietro e dall'alto con smorzamento; si abbassa progressivamente |
| **Pin cam** | Palla a 5 m dai birilli | Si stacca e si ferma a circa 3 m dai birilli, un po' rialzata e laterale, per vedere l'impatto |
| **Replay strike** | Solo strike / spare difficili | Laterale, slow-mo 0,25× sull'impatto (dal buffer di [`replay.ts`](../06-rendering-physics.md#estensioni-nostre-in-packagesenginephysics)) |
| **Reazione** | Dopo il conteggio | Primo piano del Pupo che esulta o si dispera, 1,5 s |

Le transizioni usano easing morbidi; nessun taglio brusco, salvo quello verso il replay.

**Festa dello strike** (implementata): appena cade il decimo birillo del primo tiro, nella scena (`strike-fx.ts`) esplodono coriandoli luminosi dal pin deck, una luce col colore del giocatore lampeggia, un'onda d'urto si allarga sulla pista e la camera trema per mezzo secondo (non con "riduci movimento"). A punteggio contato, al posto del banner normale compare `StrikeBurst`: lampo, raggi rotanti, due onde d'urto, scintille e "STRIKE!" lettera per lettera, poi il totale. Il rack resta in vista 2,7 s invece di 1,7. Replay e primo piano del Pupo non ci sono ancora.

---

## 7. Feedback e juice
| Momento | Schermo | Telefono |
|---|---|---|
| Tieni premuto | Il Pupo porta la palla al petto, suono "pronto" | Vibrazione 15 ms / tick |
| Swing | Il braccio segue il telefono; whoosh ∝ velocità | — |
| Rilascio | La palla tocca la pista con un "tud" (volume ∝ timing: perfetto = morbido), scia leggera | Vibrazione 30 ms + click (locale, immediato) |
| Rotolamento | Rombo continuo, con pitch e volume ∝ velocità | — |
| Hook nel back end | Scia che si colora leggermente nell'accento | — |
| Impatto | Hit-stop di 2 frame, camera shake ∝ energia, crash dei birilli stratificato (numero di impatti → numero di layer) | `cue` rumble ∝ birilli abbattuti |
| **Strike** | "STRIKE!" display con overshoot, coriandoli viola e gialli, pubblico in piedi, jingle, replay | Pattern "festa" |
| **Spare** | "SPARE!" e applausi | Pattern breve doppio |
| Canalina | "Ops!" simpatico, il Pupo si copre gli occhi | "bonk" |
| Info tiro | Pannello: **velocità km/h**, **effetto** (giri/min stimati), "In tasca!" se la palla entra nella tasca 1-3 / 1-2 | — |

---

## 8. HUD
- In alto a sinistra: simbolo, colore e Pupo del giocatore di turno, frame corrente ("Frame 4 · Tiro 2").
- In alto a destra: punteggio del giocatore di turno.
- Tra un turno e l'altro: **tabellone completo** di tutti i giocatori (stile segnapunti classico, con X e /), che entra dal basso per 2 s.
- Fine partita: podio, premi ("Più strike", "Braccio d'oro" per la velocità massima, "Mago dell'effetto" per lo spin massimo, "Costanza" per lo scarto minimo).

---

## 9. Modalità
| Modalità | MVP | Note |
|---|---|---|
| Partita completa (10 frame) | ✅ | |
| Partita veloce (3 frame) | ✅ | Per le feste |
| Allenamento (birilli infiniti, info tiro dettagliate, grafico dello swing) | Fase 4 | Utile anche per il tuning |
| Sfide (abbattere uno split specifico) | Futuro | |

---

## 10. Contenuti e asset
| Asset | Tipo | Stima |
|---|---|---|
| Pista, canaline, approccio, frecce | Procedurale | ~0 KB |
| Birillo e palla | `LatheGeometry` procedurale | ~0 KB |
| Pinsetter, tabellone, panche | Procedurale con box arrotondati | ~0 KB |
| Insegne al neon (2–3 forme originali) | SVG estrusi o glTF piccoli | < 30 KB |
| Pupi | Modulo condiviso `packages/avatar` | condiviso |
| Audio: rotolamento, 6–8 campioni di birilli, tud, applausi, jingle strike | M4A | < 600 KB |
| **Totale stimato** | | **< 1 MB** (fisica esclusa) |

---

## 11. Criteri di successo del vertical slice (Fase 3)
- [ ] 1 giocatore completa 10 frame con il telefono reale, senza bug bloccanti.
- [ ] Il braccio del Pupo segue il telefono con una latenza percepita < 120 ms (misurata con l'overlay).
- [ ] Velocità del tiro: chi tira "piano" e chi tira "forte" ottengono velocità chiaramente diverse (≥ 3 m/s di differenza) in 9 tiri su 10.
- [ ] Hook: ruotando il polso al rilascio, 4 testers su 5 riescono a far curvare la palla nel verso voluto entro 5 tiri.
- [ ] Strike possibili ma non banali: in 20 tiri di un tester medio, il 15–35% sono strike (livello Normale).
- [ ] 60 fps su iPad 9ª gen, tier Mid.
- [ ] Test di punteggio e recognizer verdi; copertura ≥ 80% su `rules.ts` e `recognizer.ts`.
- [ ] Playtest: "sembrava un tiro vero?" con media ≥ 4/5 su almeno 5 persone.

## 12. Domande aperte (da chiudere con gli spike)
- R_arm fisso o stimato dalla durata e dall'ampiezza dello swing? (S1)
- La rotazione del polso si misura in modo affidabile anche con una presa "strana"? (S1)
- Collider dei birilli: composto o convex hull? Qual è il compromesso tra realismo della caduta e costo? (S3)
- Serve la resistenza al rotolamento anche nel bowling, o bastano le due zone di attrito? (S3)
