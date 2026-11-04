# ADR-003 — Three.js per il rendering, Rapier3D per la fisica

- **Stato**: Accettato (peso e prestazioni di Rapier da confermare in S3). Rivisto il 2026-11-04: aggiornata la provenienza del pacchetto Rapier.
- **Data**: 2026-11-04

## Contesto
Serve un rendering 3D leggero, che funzioni su Safari e iPad, adatto a uno stile toon morbido e a scene piccole. Serve anche una fisica rigid-body con CCD per oggetti veloci (palla contro birilli) e attriti per superficie.

## Decisione
- **Three.js** (WebGL2), senza framework sopra: niente react-three-fiber, il ciclo di gioco resta esplicito.
- **Rapier3D**, caricato solo sullo schermo e solo per i giochi che lo dichiarano (`needsPhysics`).
- Le estensioni fisiche che Rapier non offre (aerodinamica, resistenza al rotolamento, zone di superficie) sono moduli nostri in `packages/engine/physics`.

### Quale pacchetto Rapier
Il vecchio repository `dimforge/rapier.js` è **archiviato**. I binding JavaScript/TypeScript ora vivono nel repository principale [dimforge/rapier](https://github.com/dimforge/rapier), nella cartella `typescript/`. I pacchetti npm continuano a uscire con lo stesso nome dal nuovo repository: al 2026-11-04 `@dimforge/rapier3d-compat` è alla **0.21.0** e il registry punta a `github.com/dimforge/rapier`.

Quindi per noi non cambia il nome della dipendenza, cambia solo dove si leggono changelog, issue ed esempi.

| Pacchetto | Come carica il WASM | Quando usarlo |
|---|---|---|
| `@dimforge/rapier3d-compat` | WASM incorporato in base64 nel JS: funziona con qualsiasi bundler, ma la codifica base64 pesa di più e il WASM non si mette in cache separatamente | **Default** per gli spike e per la Fase 2 |
| `@dimforge/rapier3d` | File `.wasm` separato, scaricato in streaming e messo in cache dal browser | Se in S3 il peso del compat supera il budget; richiede `vite-plugin-wasm` |

**Da fare in S3:** si misura il peso gzip delle due varianti e il tempo di inizializzazione su iPad, si fissa la versione esatta nel `package.json` e si annota qui la scelta. Non si usa più nessun riferimento a `rapier.js`.

## Alternative considerate
| Opzione | Perché no |
|---|---|
| Babylon.js | Completo ma più pesante; il vantaggio "batterie incluse" serve poco a uno stile senza PBR |
| PlayCanvas | Ottimo, ma orientato al suo editor cloud |
| react-three-fiber | Comodo per la UI, ma aggiunge React nel loop di gioco e rende meno esplicite le allocazioni |
| cannon-es / ammo.js | cannon-es: CCD debole. ammo.js: pesante e con API scomoda |
| Fisica fatta a mano | Le collisioni tra 10 birilli sono il caso peggiore da scrivere a mano |

## Conseguenze
- ✅ Ecosistema maturo, glTF, molta documentazione.
- ✅ Rapier: CCD, attrito per collider, passi fissi, prestazioni WASM; il progetto è attivo e i binding JS sono mantenuti insieme al motore.
- ⚠️ Il peso di Rapier compat (WASM incorporato) va misurato. Mitigazione: caricamento lazy, preload in lobby e, se serve, la variante non-compat.
- ⚠️ Serve scrivere il proprio "engine layer" (loop, scene, quality tier). È voluto, e resta contenuto.
