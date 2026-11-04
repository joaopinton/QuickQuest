# ADR-004 — Monorepo pnpm + TypeScript + Vite

- **Stato**: Accettato
- **Data**: 2026-11-04

## Contesto
Il codice deve essere condiviso tra web app (schermo + controller), relay (Worker) e giochi: il protocollo, i tipi degli eventi, la logica dei recognizer. I giochi si aggiungono nel tempo e devono restare isolati.

## Decisione
- **Monorepo pnpm workspaces**: `apps/web`, `workers/relay`, `packages/*`, `games/*` (struttura in [02 § 3](../02-architecture.md#3-struttura-del-monorepo)).
- **TypeScript strict** ovunque.
- **Vite** per la web app: code-splitting per controller, engine, fisica e giochi; HTTPS locale.
- **Una sola SPA** con due entry logiche (`/` e `/c/:room`) e chunk separati, invece di due app: si condividono deploy, dominio e UI kit.
- Regole di confine tra package imposte via lint.

## Conseguenze
- ✅ Tipi condivisi end-to-end: un cambio di protocollo rompe la compilazione ovunque serva.
- ✅ Aggiungere un gioco = aggiungere un package.
- ⚠️ Un po' di configurazione iniziale (tsconfig con riferimenti, regole lint).
- ⚠️ Bisogna vigilare perché il chunk del controller non importi l'engine: lo controllano `size-limit` e il lint.
