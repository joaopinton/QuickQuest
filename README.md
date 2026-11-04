# quickquest

Party game sportivi nel browser: lo schermo grande mostra il gioco e fino a 4 telefoni fanno da controller di movimento. Le scelte di progetto sono descritte in [docs/](docs/README.md).

## Avvio

Serve [pnpm](https://pnpm.io) 10 o superiore.

```bash
pnpm install
```

```bash
pnpm dev
```

- Sul PC apri `http://localhost:5173` e premi **Crea una stanza**.
- Senza telefono, in sviluppo, premi **Aggiungi un telefono di prova**: si apre `/c/CODICE?sim`, un telefono simulato nella stessa finestra del browser. Lo slot sullo schermo diventa "pronto" quando scegli il Pupo.
- Con il telefono vero i sensori richiedono HTTPS. Puoi usare `HTTPS=1 pnpm dev`: installa un certificato locale con mkcert, quindi va lanciato a mano. In alternativa usa il tunnel descritto in `spikes/s1-sensor-probe/README.md`.
- In sviluppo schermo e telefono si parlano via `BroadcastChannel` (stessa finestra del browser). Per provare il relay vero in locale: `pnpm relay:dev`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm test` | Test unitari (Vitest) |
| `pnpm coverage` | Test con copertura (soglia 80%) |
| `pnpm typecheck` | TypeScript strict su tutto il workspace |
| `pnpm build` | Build di produzione in `apps/web/dist` |
| `pnpm size` | Build e controllo dei budget di peso (telefono < 100 KB, home < 150 KB) |
| `pnpm cf:deploy` | Build e deploy su Cloudflare (sito + relay in un unico Worker, `apps/relay`) |
| `pnpm e2e` | Test end-to-end con Playwright e screenshot in `e2e/screenshots/` |

## Struttura

```
apps/relay          Worker Cloudflare + Durable Object `Room` (relay WebSocket)
apps/web            sito, lobby, flusso del telefono (Preact + Vite)
packages/ui         design system "Soft Toy": token, componenti, Pupi, testi
packages/protocol   messaggi, codici stanza, reducer della stanza, trasporti
packages/motion     sonda dei sensori
games/registry.ts   catalogo dei giochi
spikes/             prototipi usa-e-getta (S1: sonda sensori)
docs/               architettura, design, roadmap, ADR
```
