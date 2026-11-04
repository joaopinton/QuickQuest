# 07 — Art direction: lo stile "Soft Toy"

> **In una riga:** un mondo di giocattoli in vinile dipinti a mano. Opachi, saturi, morbidi, illuminati da un sole gentile. Tutto sembra si possa prendere in mano e stringere.

Obiettivo: lo *spirito* dei party-game Nintendo (amichevole, leggibile, gioioso, immediato) con un'identità **nostra**, riconoscibile e leggera da caricare.

---

## 1. Principi
1. **Leggibilità dal divano.** Il gioco si guarda da 3 metri: silhouette chiare, contrasto forte tra soggetto e sfondo, niente dettagli minuti.
2. **Morbidezza.** Nessuno spigolo vivo: tutto è arrotondato, smussato, "gonfio".
3. **Semplicità ricca.** Poche forme, pochi colori per oggetto, ma luce e animazione curate. La qualità viene da luce, movimento e suono, non dal numero di poligoni.
4. **Gioia.** Ogni azione ha una risposta che fa sorridere: un rimbalzo, un suono, una reazione del Pupo.
5. **Leggerezza tecnica.** Lo stile *nasce* senza texture ([ADR-005](adr/ADR-005-procedural-vertex-color-assets.md)).

---

## 2. Forme
- **Primitive arrotondate**: sfere, capsule, box con bevel generoso (raggio ≥ 15% del lato minore), tubi.
- **Proporzioni chunky**: gli oggetti di gioco sono leggermente sovradimensionati rispetto al reale *solo visivamente* (es. palla e birilli +10%). La fisica usa le misure reali.
- **Silhouette prima di tutto**: ogni oggetto importante deve essere riconoscibile anche come sagoma nera.
- **Dettagli come forme, non come texture**: le venature del legno sono 3–4 strisce di vertex color, non una foto.
- Densità poligonale: oggetti hero 2–8k triangoli, arredo 200–1.500, ambienti con forme ampie e pochi poligoni.

---

## 3. Shading
La ricetta "Soft Toy" (implementata in `packages/engine/materials`, vedi [06](06-rendering-physics.md#materiali-soft-toy)):

| Componente | Descrizione |
|---|---|
| **Ramp toon morbida** | 3 toni (ombra, mezzatinta, luce) con transizioni **sfumate** e non nette: è un toon "da giocattolo", non da cartone. Texture ramp 4×1 px. |
| **Hemisphere light** | Cielo (azzurro caldo) dall'alto, terra (colore del pavimento) dal basso: dà subito volume e colore all'ombra. |
| **Luce principale** | Una direzionale calda (sole o lampada) da 45°, con ombre morbide. |
| **Rim light** | Fresnel chiaro sui bordi (colore cielo o bianco caldo, intensità 0,25–0,4): stacca i soggetti dallo sfondo. È la firma dello stile. |
| **AO bakata** | Nei vertex color (2° canale): ancora gli oggetti a terra e nelle giunture. |
| **Ombre colorate** | Le ombre tendono al blu-viola (`#3B3F8C` al 25–35%), **mai grigio o nero**. |
| **Speculare** | Quasi assente. Solo oggetti "lucidi" (palla da bowling, metallo del tagliacapelli) hanno un highlight morbido e largo. |
| **Outline** | Facoltativo (inverted hull, 1,5–2 px equivalenti), solo sui personaggi e sugli oggetti interattivi nel tier Mid/High. Colore: tinta scura dello stesso oggetto, mai nero puro. |

**Niente**: PBR realistico, texture fotografiche, bloom esagerato, aberrazione cromatica, film grain, LUT cinematografiche cupe.

---

## 4. Palette

### Mondo
| Token | Hex | Uso |
|---|---|---|
| `--sky-300` | `#8FD3FF` | Cielo, rim light |
| `--sky-500` | `#4DB3F5` | Cielo profondo |
| `--grass-400` | `#7ED957` | Prati |
| `--grass-600` | `#3FAE4A` | Prati in ombra, fairway |
| `--cream-100` | `#FFF6E5` | Superfici chiare, sfondi caldi |
| `--cream-300` | `#FBE3B9` | Legno chiaro, pista bowling |
| `--wood-500` | `#D89A5B` | Legno |
| `--wood-700` | `#A8682F` | Legno scuro, dettagli |
| `--sand-300` | `#F2D59B` | Campo da bocce |
| `--shadow-tint` | `#3B3F8C` | Tinta delle ombre |

### UI
| Token | Hex | Uso |
|---|---|---|
| `--surface` | `#FFFFFF` | Card, pannelli |
| `--surface-alt` | `#F1F6FF` | Sfondi UI |
| `--ink-900` | `#1E2A4A` | Testo principale (blu notte, **non nero**) |
| `--ink-600` | `#4A5878` | Testo secondario |
| `--ink-300` | `#A9B4CC` | Disabilitato, bordi |
| `--primary-500` | `#2F7DF6` | Azione principale |
| `--primary-700` | `#1A56C4` | Bordo inferiore "3D" dei bottoni primari |
| `--accent-400` | `#FFD23F` | Evidenziazioni, stelle, record |
| `--success-500` | `#2FBF71` | Solo per significato: successo, connesso |
| `--danger-500` | `#F0505A` | Solo per significato: errore, fallo, disconnesso |

### Giocatori (forma + colore, così restano distinguibili anche da chi ha deficit cromatici)
| Slot | Colore | Hex | Simbolo |
|---|---|---|---|
| P1 | Ciliegia | `#EF4E5B` | ● |
| P2 | Oceano | `#3C8CF0` | ▲ |
| P3 | Limone | `#F7C531` | ■ |
| P4 | Menta | `#34C27A` | ◆ |

Colori corpo dei Pupi disponibili (8): i 4 sopra + Arancio `#FF9A3C`, Uva `#9C6BFF`, Confetto `#FF7EB6`, Laguna `#2EC4B6`.

### Accento per gioco
| Gioco | Accento | Hex | Atmosfera |
|---|---|---|---|
| Bowling | Viola neon | `#8E5BFF` | Sala bowling serale, luci calde e insegne |
| Bocce | Terracotta | `#E07A4F` | Piazzetta mediterranea, tardo pomeriggio |
| Tiri liberi | Arancio palla | `#FF8A2B` | Palestra di quartiere, parquet lucido |
| Golf | Verde fairway | `#3FAE4A` | Colline morbide, cielo limpido |
| Barber shop | Menta retrò | `#2EC4B6` | Bottega anni '60, piastrelle a scacchi |
| Scherma | Cremisi | `#E8455A` | Pedana su palco, riflettori |

L'accento colora la card del gioco, gli elementi HUD del gioco e il controller durante quel gioco.

---

## 5. Tipografia
| Ruolo | Font | Peso | Note |
|---|---|---|---|
| Display / titoli | **Fredoka** | 600–700 | Arrotondato, amichevole: "STRIKE!", nomi dei giochi, punteggi |
| Testo / UI | **Nunito** | 600–800 | Terminali arrotondati, molto leggibile anche piccolo |
| Numeri dei punteggi | Fredoka con `font-variant-numeric: tabular-nums` | 700 | Le cifre non "ballano" |

- Licenza **SIL OFL** per entrambi, self-hosted in WOFF2 con subset.
- Mai più di 2 famiglie.
- Testi di sistema in **frase normale**, non in maiuscolo. Il MAIUSCOLO è riservato agli esclamativi di gioco (STRIKE!, SPARE!, CANESTRO!).
- Scala sullo schermo (riferimento 1080p, scala con `clamp()`): display 120 / h1 72 / h2 52 / h3 40 / corpo 32 / piccolo 26 px. Nulla sotto i 24 px.
- Scala sul controller: display 40 / h1 28 / corpo 18 / piccolo 15 px.

---

## 6. Personaggi: i Pupi

### Concept
Creature-giocattolo **a forma di fagiolo**, vivaci e gentili. Sono il volto della piattaforma: si scelgono nella lobby e giocano al posto tuo.

### Anatomia
- **Corpo unico** a fagiolo o goccia rovesciata: testa e busto sono un solo volume, senza collo. Altezza nel mondo circa 1,2 m.
- **Occhi**: due ovali verticali bianchi con pupilla blu notte e un riflesso. Sono l'elemento espressivo principale (si chiudono, si stringono, diventano stelline o archetti).
- **Niente naso, niente capelli.** La bocca compare solo nelle emozioni, come forma semplice (arco, "o").
- **Guance** rosate opzionali (decal piccolo).
- **Braccia** corte a manopola (mano senza dita separate), con 2 segmenti per l'IK.
- **Gambe**: due piedini arrotondati, quasi capsule.
- **Accessori** (uno alla volta): berretto, fascia, cuffia, occhiali tondi, papillon, coroncina di foglie.

### Animazione (procedurale, nessun file di animazione pesante)
| Stato | Tecnica |
|---|---|
| Idle | Respiro (squash & stretch sinusoidale ±3%), battito di ciglia casuale, sguardo verso l'azione |
| **Braccio in gioco** | **IK a 2 segmenti guidato dal quaternione del telefono**: il braccio del Pupo *è* il braccio del giocatore |
| Camminata/passi | Saltelli brevi con squash all'atterraggio |
| Gioia | Salto con stretch + braccia in alto + occhi a archetto + coriandoli |
| Delusione | Corpo che si "affloscia" (squash verticale), occhi a mezz'asta, sospiro |
| Attesa turno | Guarda il giocatore di turno, piccoli dondolii |

### Cosa li rende *non*-Mii
I Pupi non hanno proporzioni umane, non hanno testa separata né facce costruite con occhi, naso, bocca, capelli e sopracciglia combinabili, e non hanno vestiti umani. Sono **oggetti-giocattolo con occhi**, più vicini a un pupazzo da tavolo che a un avatar umano.

---

## 7. Ambienti
- **Diorama.** Ogni gioco è un piccolo set teatrale: un'area di gioco curata, uno sfondo semplice (pareti, colline, cielo) e niente open world.
- **Profondità a strati**: primo piano (oggetto di gioco), piano medio (set), fondale (sagome piatte e colori desaturati del 20%).
- **Luce come atmosfera**: ogni gioco ha 1 preset di luce (colore cielo, sole, terra, rim) in `games/<id>/screen/lighting.ts`.
- **Pubblico**: Pupi in `InstancedMesh` con animazione di idle via vertex shader; esultano agli eventi.

---

## 8. Juice ed effetti
| Evento | Effetto |
|---|---|
| Rilascio | Leggero zoom della camera verso l'oggetto, whoosh, scia morbida sulla palla |
| Impatto | Camera shake breve (≤ 120 ms, ampiezza ∝ energia), particelle di "polvere" a stelline, hit-stop di 2–3 frame |
| Successo grande (strike, canestro pulito, buca in uno) | Slow-mo 0,25× di 1 s, coriandoli negli accenti del gioco, testo display che entra con overshoot a molla, jingle |
| Punteggio | I numeri contano verso l'alto con un "tic" per unità e rimbalzano a fine conteggio |
| Errore / fallo | Suono "bonk" simpatico, il Pupo si gratta la testa. Mai punitivo. |

Easing e curve: tutte dai token di motion ([08 § Motion](08-ui-ux.md#motion)).

---

## 9. Audio
- **Carattere**: acustico e giocattoloso. Legni, campanelli, marimba, battiti di mani, pizzicati, fischietti. Mixato pulito, frequenze medio-alte presenti, bassi controllati.
- **SFX di gioco**: credibili ma "arrotondati". Il crash dei birilli è vero, ma con meno rumore bianco e più "toc" legnosi.
- **UI**: click morbidi intonati su una scala (do maggiore pentatonica), così le sequenze di click suonano musicali.
- **Musica**: un tema per il menu (loop di 30–60 s, allegro, ~110 bpm) e un sottofondo per ogni gioco, a basso volume durante il gesto.
- **Voce**: niente voce parlata; tutt'al più "vocine" non verbali dei Pupi (sintetizzate o registrate in proprio).
- **Fonti**: composizioni e registrazioni **originali**, oppure librerie **CC0**. Licenze tracciate in `assets/LICENSES.md`.
- Mix: bus `music`, `sfx`, `ui`, `crowd`, con ducking della musica durante gli eventi importanti.

---

## 10. Cosa NON fare
Il progetto si *ispira* a un'esperienza, non copia un prodotto. Regole vincolanti:

- ❌ Nessun nome, logo o marchio Nintendo nel prodotto, nel codice stanza, negli URL, nel nome del progetto o del dominio ("Wii", "Mii", "Switch", "Joy-Con"…).
- ❌ Nessun asset, modello, texture, suono, jingle o musica estratti o imitati da giochi Nintendo.
- ❌ Niente personaggi con proporzioni o costruzione del viso come i Mii.
- ❌ Nessun font proprietario Nintendo (es. la famiglia Rodin usata nelle UI Nintendo) né imitazioni dirette.
- ❌ Non riprodurre layout riconoscibili dei menu (canali Wii, griglia del menu Home, schermate di Wii Sports o Switch Sports), né il loro suono di selezione.
- ❌ Nessun "cursore a mano" in stile puntatore Wii.
- ✅ Si possono usare liberamente meccaniche e generi (bowling, golf, swing con il controller), convenzioni universali (tenere premuto per tirare) e sensazioni (calore, semplicità, gioia).

Ogni nuovo asset passa una domanda di revisione: *"Una persona lo scambierebbe per un asset Nintendo?"* Se la risposta è sì o forse, si rifà.

---

## 11. Moodboard verbale
Per orientare chi crea asset, ecco i riferimenti per *qualità*, non da copiare:
- giocattoli in vinile designer e pupazzi in feltro (materiali opachi, colori pieni);
- diorami in plastilina e stop-motion (luce morbida, set piccoli e curati);
- illustrazione per bambini contemporanea (palette calde, ombre colorate);
- packaging di caramelle e gelati (accenti saturi, forme tonde, tipografia rotonda).
