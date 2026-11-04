# ADR-008 — Preact + signals per la UI (menu, HUD, controller)

- **Stato**: Accettato
- **Data**: 2026-11-04

## Contesto
Menu, lobby, HUD e layout del controller sono UI a componenti con stato (slot, turno, punteggi), mentre il gioco 3D è un canvas con un loop proprio. Serve un framework UI leggero, soprattutto per il controller (budget < 100 KB gzip in totale).

## Decisione
- **Preact** (~4 KB) + **@preact/signals** per lo stato reattivo, in un overlay DOM sopra il canvas.
- Il loop di gioco **non** passa da Preact: i giochi aggiornano Three.js direttamente e pubblicano sui signals solo lo stato che l'HUD deve mostrare (punteggio, turno, info tiro).
- Lo stile della UI è fatto con CSS custom properties dai token ([08 § 4](../08-ui-ux.md#4-design-system)); niente framework CSS utility-first, per tenere il controllo sull'identità visiva.

## Alternative considerate
| Opzione | Perché no |
|---|---|
| React | Circa 10 volte più pesante, senza vantaggi per questa UI |
| Svelte 5 | Ottimo e leggero; scartato solo per uniformità con l'ecosistema JSX/TS e per i signals di Preact, già adatti a uno stato condiviso con il loop |
| Vanilla DOM | Va bene per poche schermate; con lobby, HUD per gioco e layout dinamici diventa difficile da mantenere |
| UI dentro il canvas 3D | Testo meno nitido, accessibilità peggiore, più lavoro |

## Conseguenze
- ✅ Bundle minimo, JSX tipizzato, accessibilità DOM nativa (focus, screen reader).
- ✅ Separazione netta: rendering 3D nel loop, UI nel DOM.
- ⚠️ Attenzione al costo di layout dell'overlay durante il gioco: si animano solo `transform` e `opacity` e si evitano aggiornamenti a ogni frame.
