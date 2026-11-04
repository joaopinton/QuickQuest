# <Nome gioco> — Game Design Document

| Campo | Valore |
|---|---|
| ID modulo | `<id>` |
| Giocatori | min–max, a turni / simultaneo |
| Durata | |
| Fisica | Sì / No |
| Accento | `--game-<id>` `#xxxxxx` |
| Layout controller | dalla libreria [08 § 2](../08-ui-ux.md#libreria-di-layout-del-core-packagesuicontroller) |
| Stato | Brief / GDD / In sviluppo / Rilasciato |

## 1. Fantasia del giocatore
Una frase in prima persona: che cosa deve *sentire* il giocatore?

## 2. Set e misure
Misure reali usate dalla fisica, ambiente, atmosfera, luce.

## 3. Controlli e riconoscimento del gesto
- Presa del telefono
- Fasi del turno (tabella controller ↔ schermo)
- Recognizer: stati, soglie, stima dei parametri
- Evento inviato (interfaccia TypeScript)
- Livelli di assist

## 4. Fisica / simulazione
Corpi, collider, superfici, estensioni custom, parametri di tuning.

## 5. Regole e punteggio
Regole complete + casi di test obbligatori.

## 6. Camera
Tabella delle inquadrature.

## 7. Feedback e juice
Tabella momento → schermo → telefono.

## 8. HUD

## 9. Modalità

## 10. Contenuti e asset
Tabella con le stime di peso; totale entro il budget di [06](../06-rendering-physics.md#4-budget-prestazioni).

## 11. Criteri di successo del vertical slice
Checklist misurabile.

## 12. Domande aperte
