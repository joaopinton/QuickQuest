# Bocce — Brief

> Flusso della partita, modalità, assist e premi in discussione: [11 — Brainstorming § Bocce](../11-games-brainstorm.md#3-bocce).

| Campo | Valore |
|---|---|
| ID modulo | `bocce` |
| Giocatori | 1–4 (individuale o 2 vs 2), a turni |
| Fisica | Sì — riusa `rolling-ball.ts` e `surface-zones.ts` del bowling |
| Accento | Terracotta `#E07A4F` |
| Layout controller | `aim-action`, `wait` |
| Fattibilità | 🟢 Alta |
| Ordine | 2° gioco |

## Fantasia
*"Ho accostato la boccia a un dito dal pallino, poi l'avversario me l'ha bocciata via. Rivincita!"*

## Set
Una piazzetta mediterranea al tramonto: campo in terra battuta o sabbia di 4 × 24 m (versione da giardino, più corta: circa 15 m), sponde in legno, panchine, un ulivo, lucine appese. Boccino Ø 4 cm; bocce Ø 10,7 cm, circa 0,92 kg, nei colori dei giocatori (o delle squadre).

## Gesto
Stessa presa del bowling, **ma con due tipi di tiro decisi dal gesto stesso**:
| Tiro | Gesto | Riconoscimento |
|---|---|---|
| **Accosto** (punto) | Swing lento e basso, rilascio "accompagnato" | ω_s basso, telefono che al rilascio punta in basso o in avanti (pitch < 20°) → la boccia rotola presto |
| **Bocciata** (volo) | Swing più ampio, rilascio con il braccio più alto | Pitch al rilascio > 35° → parabola: la boccia vola e atterra vicino al bersaglio |

Mira con il trackpad (direzione), più la deviazione dal gesto. Lo spin laterale è possibile ma meno marcato che nel bowling.

## Simulazione
- **Resistenza al rotolamento** alta sulla sabbia (coefficiente da tarare, ~0,03–0,06) e **piccole irregolarità del terreno**: heightfield con rumore di 2–5 mm, così ogni campo "ha un carattere".
- Collisioni multiple tra bocce e boccino (CCD sulle bocce veloci).
- Atterraggio della bocciata: si perde energia in base alla durezza del terreno; piccolo sbuffo di polvere.

## Regole
Variante semplificata della petanque/bocce:
- Si lancia il boccino (anche lui con il gesto).
- A turno tira la squadra più lontana dal boccino.
- Il punto alla squadra più vicina: 1 punto per ogni boccia più vicina della migliore avversaria. Si gioca fino a 7 (veloce) o 11.
- **Misurazione** con animazione: un Pupo arbitro arriva con il metro quando due bocce sono quasi alla pari (< 3 cm).

## Juice
Vista dall'alto con un cerchio che indica la "boccia vincente"; "BACIO!" quando la boccia tocca il boccino; "BOCCIATA!" con slow-mo sull'impatto; tifo del pubblico seduto ai tavolini.

## Rischi
- L'accosto richiede un dosaggio fine della forza → curva di assist più "piatta" intorno alle velocità basse.
- La distinzione tra accosto e bocciata deve essere chiara: nei primi tiri compare un indicatore sul telefono ("Rotolo" / "Volo").

## Riuso dal bowling
Recognizer a pendolo (stesso stato macchina, soglie diverse), `rolling-ball`, `surface-zones`, camera "segui palla", sistema dei turni, gran parte del juice.
