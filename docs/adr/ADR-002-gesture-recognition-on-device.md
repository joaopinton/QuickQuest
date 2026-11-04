# ADR-002 — Riconoscimento del gesto sul telefono

- **Stato**: Accettato
- **Data**: 2026-11-04

## Contesto
Lo skim iniziale inviava ogni evento grezzo di `deviceorientation` e `devicemotion` allo schermo, che avrebbe poi interpretato il gesto. Così:
- la rete trasporterebbe 60–100+ messaggi/s per telefono;
- jitter e perdite di pacchetti altererebbero la forma del segnale, e quindi l'**esito** del tiro;
- l'esito dipenderebbe dalla qualità della connessione: ingiusto e frustrante.

## Decisione
Il **recognizer gira sul telefono**, alla frequenza nativa dei sensori, e invia allo schermo:
1. un **evento gesto compatto** (es. `bowling.release {speed, spin, dir, tRelease, confidence}`) da cui dipende l'esito;
2. uno **stream di posa a 30 Hz** (quaternione + tasti) usato **solo per la visualizzazione** (braccio dell'avatar, mirino).

Lo schermo resta autoritativo: valida e limita i parametri ricevuti e simula la fisica.

## Conseguenze
- ✅ La latenza *ritarda* l'esito ma non lo *cambia*.
- ✅ Il traffico è ridotto di circa 3–5 volte, nei limiti del free tier.
- ✅ I recognizer sono logica pura e si testano su tracce registrate.
- ✅ Il feedback aptico al rilascio è immediato (locale).
- ⚠️ Il codice del recognizer va nel bundle del controller (piccolo, < 10 KB per gioco).
- ⚠️ Un client modificato potrebbe inviare valori "perfetti". È accettabile: è un party-game locale, e lo schermo limita comunque ai range plausibili.
