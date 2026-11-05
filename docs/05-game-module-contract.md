# 05 — Contratto modulo gioco

Obiettivo: **aggiungere un gioco senza toccare il core**. Un gioco è una cartella in `games/<id>/` più una riga in `games/registry.ts`.

## 1. Anatomia di un gioco

```
games/<id>/
├── index.ts            export della GameDefinition
├── shared/             tipi degli eventi del gioco (inclusi in protocol)
│   └── events.ts
├── screen/             tutto ciò che gira sullo schermo
│   ├── index.ts        factory ScreenGame
│   ├── scene.ts        costruzione della scena (geometrie procedurali, materiali Soft Toy)
│   ├── physics.ts      setup del mondo fisico
│   ├── rules.ts        regole e punteggio (logica pura, testata)
│   ├── camera.ts       regia della camera
│   └── hud.tsx         componenti HUD (Preact)
├── controller/         tutto ciò che gira sul telefono
│   ├── index.ts        factory ControllerGame
│   ├── layout.tsx      layout UI del controller
│   └── recognizer.ts   riconoscimento del gesto
├── assets/             glTF/audio specifici (piccoli)
└── test/
```

## 2. Interfacce

```ts
// games/<id>/index.ts
export interface GameDefinition {
  id: string;                         // 'bowling'
  version: string;                    // semver del modulo
  meta: {
    name: string;                     // 'Bowling'
    tagline: string;                  // 'Tira, curva, strike!'
    icon: string;                     // percorso SVG
    accent: string;                   // token colore, es. '--game-bowling'
    players: { min: number; max: number };   // es. 1..4
    mode: 'turn-based' | 'simultaneous';
    needsPhysics: boolean;            // carica Rapier prima di init
    estMinutes: number;               // durata indicativa
  };
  loadScreen(): Promise<{ default: ScreenGameFactory }>;          // import() dinamico
  loadController(): Promise<{ default: ControllerGameFactory }>;  // import() dinamico
}
```

### Lato schermo
```ts
type ScreenGameFactory = (ctx: ScreenContext, opts: MatchOptions) => ScreenGame;

interface ScreenGame {
  init(): Promise<void>;                          // costruisce la scena; può caricare asset
  start(): void;                                  // avvia il flusso partita
  onEvent(slot: Slot, e: GameEvent): void;        // eventi gesto/trackpad dal controller
  onPose(slot: Slot, pose: InterpolatedPose): void;   // posa interpolata, ogni frame
  onPlayerConnection(slot: Slot, connected: boolean): void;
  fixedUpdate(dt: number): void;                  // passo fisso (fisica, logica)
  update(dt: number, alpha: number): void;        // per frame (animazioni, camera)
  pause(reason: PauseReason): void;
  resume(): void;
  dispose(): void;                                // libera geometrie, materiali, corpi fisici
}

interface ScreenContext {
  three: { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera };
  physics: PhysicsWorld | null;                   // valorizzato se meta.needsPhysics
  quality: QualityTier;                           // 'low' | 'mid' | 'high'
  materials: SoftToyMaterials;                    // libreria di materiali dello stile
  avatars: AvatarService;                         // crea Pupi per gli slot, IK braccio dalla posa
  audio: AudioService;                            // sfx, musica, bus
  hud: HudService;                                // mount di componenti Preact sull'overlay
  fx: FxService;                                  // coriandoli, camera shake, slow-mo, popup testo
  players: ReadonlyArray<PlayerInfo>;             // slot, colore, avatar, connesso
  net: {
    toController(slot: Slot, msg: ScreenToControllerMsg): void;   // layout, cue, turno
    broadcast(msg: ScreenToControllerMsg): void;
  };
  flow: MatchFlowService;                         // macchina di flusso comune (vedi §3)
  results: { submit(r: MatchResult): void };      // fine partita → schermata risultati
  clock: { now(): number };                       // clock sincronizzato con il DO
}
```

### Lato controller
```ts
type ControllerGameFactory = (ctx: ControllerContext) => ControllerGame;

interface ControllerGame {
  layouts: Record<string, LayoutComponent>;       // es. { aim: AimLayout, wait: WaitLayout }
  createRecognizer(): Recognizer<GameEvent>;
  onCue?(cue: Cue): void;                         // opzionale: gestione custom dei cue
  dispose(): void;
}

interface ControllerContext {
  motion: MotionService;        // campioni fusi, calibrazione, stato sensori
  send(e: GameEvent): void;     // evento verso lo schermo
  haptics: HapticsService;      // vibrate / tick iOS / suono
  ui: { setLayout(id: string, params?: unknown): void };
  player: PlayerInfo;           // il mio slot e colore
}
```

### Registro
```ts
// games/registry.ts
import bowling from './bowling';
export const GAMES: GameDefinition[] = [bowling /*, bocce, freeThrow, … */];
```

## 3. Flusso partita comune (MatchFlow)

La maggior parte dei giochi segue lo stesso ritmo. Il core fornisce una macchina a stati configurabile, così ogni gioco non deve reinventarla:

```
Intro (presentazione, 3 s, saltabile)
  └► per ogni round:
       per ogni giocatore (turn-based) | tutti insieme (simultaneous):
         TurnIntro ("Tocca a P2!", cue sul telefono)
           └► Aim       (controller: layout 'aim'; trackpad + posa)
           └► Gesture   (recognizer attivo; attesa dell'evento)
           └► Resolve   (simulazione; l'input è bloccato)
           └► Score     (punteggio + juice)
  └► Results (classifica, premi, "Rigioca" / "Cambia gioco")
```

- I giochi forniscono **hook** per ogni fase (`onAimStart`, `onGesture`, `isResolved`, `scoreTurn` …) e possono saltarne alcune.
- Il flusso invia automaticamente `turn` e `controller.layout` ai telefoni.
- **Pausa automatica** se il giocatore di turno si disconnette; **salta turno** dopo 120 s.

## 4. Regole per i moduli
1. **Nessun import tra giochi.** Ciò che serve a più giochi va in `packages/`, per esempio il modello della palla che rotola, condiviso tra bowling e bocce, finisce in `packages/engine/physics/rolling-ball.ts`.
2. **Logica pura separata dal rendering.** `rules.ts` e i recognizer non importano Three.js e si testano con Vitest.
3. **Tutto quello che si crea va liberato in `dispose()`.** Geometrie, materiali, corpi Rapier, listener. Un test verifica che dopo `dispose` restino 0 corpi fisici e che `renderer.info.memory` torni alla baseline.
4. **Budget per gioco** ([06](06-rendering-physics.md#4-budget-prestazioni)): download, draw call e triangoli. Lo misura la CI.
5. **Stile obbligatorio.** Si usano i materiali di `ctx.materials` e i token colore. Niente materiali PBR ad hoc ([07](07-art-direction.md)).
6. **Il controller resta leggero.** La cartella `controller/` non può importare Three.js né Rapier (lo impone una regola lint).
7. **Eventi tipizzati** in `shared/events.ts`, con validatore. Lo schermo valida ogni evento ricevuto e ne limita i valori (es. velocità nel range plausibile).

## 5. Checklist "nuovo gioco"
- [ ] GDD scritto da `games/_template.md`
- [ ] Spike di fattibilità del gesto, con tracce registrate
- [ ] `GameDefinition` + riga nel registro
- [ ] Recognizer + test su tracce
- [ ] Regole e punteggio + test
- [ ] Scena con i materiali Soft Toy, entro il budget
- [ ] Layout del controller conforme al design system
- [ ] Cue aptici e sonori definiti
- [ ] E2E Playwright: un turno completo con il controller simulato
- [ ] Playtest con almeno 3 persone su telefoni reali (iOS e Android)

## 6. Implementazione attuale

Dal 2026-11-05 tutti i giochi giocabili (bowling e golf) passano dal contratto:
- `games/contract.ts`: `ScreenGameProps` (giocatori, `subscribeEvents`, `setActiveSlot`, `sendCue`, `onEndGame`) e `ControllerPadProps` (slot, turno, tracker con `press`/`release`/`cancel`, haptics, taratura `swingProfile`, `onRecalibrate`, ultimo cue, `send`);
- `games/loaders.ts`: `import()` dinamici di `Screen` e `Pad` per ogni gioco, `isPlayable(id)` per la lobby (giocabile = ha i loader, nessun caso speciale);
- protocollo: `game-event { gameId, e: { kind, data } }` dal telefono (validato: `data` piatto, ≤ 16 campi, numeri finiti, stringhe ≤ 32), inoltrato allo schermo solo per il gioco in corso e, se c'è un turno, solo dal giocatore di turno; `cue { slot | null, kind, text? }` dallo schermo ai telefoni, che lo trasformano in vibrazione o click.

Eventi per gioco:

| Gioco | `kind` | `data` | Codec |
|---|---|---|---|
| bowling | `throw` | `speed` (m/s), `spin` (−1..1), `dir` (rad) | `games/bowling/shared/events.ts` (`throwEvent` / `parseThrowEvent`) |
| golf | `shot`, `club` | v. `games/golf/controller/GolfPad.tsx` | `games/golf/screen/flow.ts` |

Il vecchio messaggio dedicato `throw` è stato tolto dal protocollo: il bowling chiude il turno da sé (`setActiveSlot(null)` mentre la palla è in pista) e manda l'esito del tiro al telefono con un cue.
