# Tiri liberi — Brief

> Flusso della partita, modalità, assist e premi in discussione: [11 — Brainstorming § Tiri liberi](../11-games-brainstorm.md#4-tiri-liberi).

| Campo | Valore |
|---|---|
| ID modulo | `free-throw` |
| Giocatori | 1–4, a turni (o "a tempo": 60 s ciascuno) |
| Fisica | Sì — balistica + `aero.ts` (drag + backspin) + collisioni con ferro e tabellone |
| Accento | Arancio palla `#FF8A2B` |
| Layout controller | `action`, `wait` |
| Fattibilità | 🟢 Alta |
| Ordine | 3° gioco |

## Fantasia
*"Ho piegato il polso, ho spinto verso l'alto e ho sentito quel 'ciuff' perfetto della retina."*

## Set
Palestra di quartiere: parquet lucido a strisce di vertex color, linee del campo, tabellone in plexiglass con il quadrato, ferro arancione, retina bianca, gradinate con Pupi, luci da palestra. **Misure reali**: ferro a 3,05 m, Ø 45 cm; lunetta a 4,6 m dal tabellone; palla Ø 24 cm, 0,62 kg.

## Gesto
Il telefono si tiene in mano **come la palla**, con lo schermo verso il palmo o verso l'alto, a seconda di come viene naturale, e il pollice sul tasto.
| Fase | Gesto | Riconoscimento |
|---|---|---|
| Caricamento | Tenere premuto, piegare il gomito e portare il telefono sopra la fronte | Stato `armed`; si stima l'orientamento di partenza |
| Tiro | Spinta verso l'alto e in avanti, con flessione del polso | Picco di accelerazione lungo la direzione "su-avanti" + rotazione del polso (ω sull'asse laterale) |
| Rilascio | Alzare il pollice in cima alla spinta | Evento `freeThrow.release` |

Parametri stimati:
- **Angolo di uscita**: pitch del telefono al rilascio (ottimale 50–55°);
- **Potenza**: picco |a| e ω del polso → velocità iniziale;
- **Backspin**: dalla flessione del polso, ammorbidisce i rimbalzi sul ferro;
- **Deviazione laterale**: dallo yaw rispetto alla calibrazione.

## Simulazione
- Traiettoria con gravità, drag leggero e backspin (Magnus, piccolo).
- **Ferro**: anello di 16–24 sfere o capsule (compound collider), restitution 0,6. **Tabellone**: box, restitution 0,7.
- **Retina**: simulazione verlet semplice (anelli × segmenti, ~100 punti) con il passaggio della palla. Solo visiva, ma è fondamentale per il "ciuff".
- Il canestro si conta quando la palla attraversa il piano del ferro dall'alto verso il basso entro il raggio.

## Regole
- Partita classica: 10 tiri a testa e vince chi fa più canestri.
- Modalità "a tempo": 60 s, la palla torna subito; bonus per le serie.
- **Swish** (senza toccare ferro né tabellone) = punto bonus.

## Assist
- **Arco guida**: nei primi 3 tiri della partita compare una parabola tratteggiata che mostra dove sarebbe andato il tiro "perfetto".
- **Sweet spot**: nel range di potenza corretto (±8%) la velocità viene leggermente attratta verso il valore ideale.

## Juice
"CIUFF!" per lo swish, retina che si gonfia, palla che rimbalza sul parquet con lo squeak delle scarpe, pubblico che fa "ooooh" quando la palla balla sul ferro.

## Rischi
- La potenza è difficile da dosare senza un riferimento → sweet spot assistito + feedback sul telefono dopo il tiro ("un po' corto", "lungo").
- Movimento verticale e presa variabile → il recognizer usa la **direzione della gravità** per capire cosa significa "su", indipendentemente da come è tenuto il telefono.
