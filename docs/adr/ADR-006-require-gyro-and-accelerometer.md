# ADR-006 — Giroscopio e accelerometro obbligatori

- **Stato**: Accettato (decisione del product owner)
- **Data**: 2026-11-04

## Contesto
Alcuni smartphone economici non hanno il giroscopio, oppure lo emulano male. Senza giroscopio non si ricava un orientamento affidabile né la velocità angolare dello swing, e il pilastro "sensazione reale" ([00](../00-vision.md#1-sensazione-reale)) cade. Si era valutata una modalità alternativa solo-touch.

## Decisione
- Prima del join il controller esegue una **verifica hardware** (descritta in [04 § 2](../04-motion-input.md#2-permessi-e-verifica-hardware-obbligatoria)): devono esserci **sia l'accelerometro sia il giroscopio**, funzionanti, con una frequenza ≥ 30 Hz.
- Se la verifica fallisce, il telefono **non si collega**: compare una schermata che spiega cosa manca e non viene occupato nessuno slot.
- Anche il relay rifiuta un `hello` senza `capabilities.gyro && capabilities.accel`.
- **Nessuna modalità solo-touch** e **nessun gamepad** per i giocatori.
- Eccezione solo per gli sviluppatori: il simulatore di controller esiste soltanto nella build di sviluppo e non viene distribuito in produzione.

## Conseguenze
- ✅ Esperienza uniforme: chiunque giochi ha la stessa qualità di input.
- ✅ Meno codice: niente percorsi alternativi da mantenere e bilanciare.
- ⚠️ Una piccola parte di telefoni (economici o vecchi) resta esclusa. Il messaggio deve essere chiaro e gentile, e suggerire di usare un altro telefono del gruppo.
- ⚠️ Il controllo lato client si può aggirare con un client modificato. Non è un problema di sicurezza, solo di esperienza.
