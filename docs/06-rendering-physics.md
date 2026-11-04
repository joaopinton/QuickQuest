# 06 — Rendering e fisica

## 1. Rendering

### Motore
- **Three.js**, `WebGLRenderer` su WebGL2, con antialias nativo (MSAA) quando il tier lo consente. `WebGPURenderer` si valuterà quando ci sarà un vantaggio misurabile ([ADR-003](adr/ADR-003-threejs-rapier.md)).
- Color management: output sRGB e tone mapping `ACESFilmic` molto leggero, oppure `AgX`, scelto nello spike S4. Lo stile è saturo: il tone mapping non deve "slavare" i colori.
- Nessun framework sopra Three.js, come react-three-fiber: il ciclo di gioco resta esplicito e il controllo totale sulle allocazioni.

### Loop
```
requestAnimationFrame(now):
  acc += min(now - last, 100ms)
  while acc >= FIXED_DT:            // FIXED_DT = 1/60 s
     game.fixedUpdate(FIXED_DT)     // fisica (con sottopassi) + logica
     acc -= FIXED_DT
  alpha = acc / FIXED_DT
  game.update(frameDt, alpha)       // interpolazione delle trasformazioni, animazioni, camera
  renderer.render(scene, camera)
```
- Le trasformazioni dei corpi fisici vengono **interpolate** tra l'ultimo stato e il precedente, così il movimento resta fluido anche su display a 120 Hz.
- Slow-mo: un `timeScale` globale (es. 0,25 nel replay dello strike) moltiplica il tempo che entra nell'accumulatore.
- Con la scheda nascosta (`visibilitychange`) il gioco va in pausa.

### Quality tier
Il tier si sceglie all'avvio con un micro-benchmark (2 s di scena di prova) più un'euristica sulla GPU (`WEBGL_debug_renderer_info` dove disponibile). Si adatta poi a runtime: se il frame time p90 resta sopra i 18 ms per 3 s, si scende di un tier.

| Impostazione | Low | Mid | High |
|---|---|---|---|
| Pixel ratio max | 1.0 | 1.25 | 1.5 |
| Antialias | FXAA | MSAA 4× | MSAA 4× |
| Ombre | Blob shadow (quad con gradiente) | 1 luce direzionale, shadow map 1024, PCF | 2048, PCF soft |
| Bloom | No | No | Leggero, solo sugli emissivi |
| Outline | No | Personaggi | Personaggi + oggetti chiave |
| Particelle | 50% | 100% | 100% |
| Riflessi pista (bowling) | Gradiente finto | Gradiente finto | Planar reflection a bassa risoluzione |

### Materiali "Soft Toy"
Sono definiti in [07 § Shading](07-art-direction.md#3-shading). In pratica `packages/engine/materials` espone:
- `softToy({ color, rampId, rim, ao })`: `MeshToonMaterial` estesa con `onBeforeCompile` per aggiungere rim fresnel, AO da vertex color e una ramp morbida da una texture 1D di 4×1 px;
- `softToyVertexColor(...)`: come sopra, con il colore preso dai vertex color, per mesh multi-colore senza texture;
- `emissiveSign(...)`: insegne e numeri luminosi (tabellone);
- **cache** dei materiali per parametri, così la stessa combinazione non viene compilata due volte.

Gli shader vengono compilati in anticipo durante il caricamento del gioco (`renderer.compileAsync`) per evitare scatti al primo frame.

---

## 2. Fisica

### Motore
- **Rapier3D** (`@dimforge/rapier3d-compat`, che incorpora il WASM), caricato con `import()` solo sullo schermo e solo per i giochi con `needsPhysics`. Il preload parte durante la lobby.
- **Lo schermo è autoritativo**: non serve determinismo cross-device, ma usiamo comunque passi fissi perché il comportamento sia riproducibile (replay, test).

### Configurazione di base
| Parametro | Valore | Note |
|---|---|---|
| Passo | 1/60 s con **sottopassi** configurabili per gioco | Bowling: 4 sottopassi (240 Hz) durante il Resolve, 1 in Aim |
| CCD | Attivo sulla palla e sugli oggetti veloci | Evita che la palla "attraversi" i birilli |
| Unità | Metri, chilogrammi, secondi | Dimensioni reali per credibilità |
| Gravità | −9,81 m/s² | |
| Sleep | Attivo | I birilli fermi non costano |

### Estensioni nostre (in `packages/engine/physics`)
| Modulo | Cosa aggiunge | Usato da |
|---|---|---|
| `rolling-ball.ts` | Resistenza al rotolamento (coppia opposta ∝ carico normale), passaggio scivolamento → rotolamento | Bowling, bocce, golf (green) |
| `surface-zones.ts` | Zone di superficie con attrito e resistenza diversi (olio, sabbia, erba) | Bowling, bocce, golf |
| `aero.ts` | Drag + effetto Magnus su sfere in volo: F = ½ρC_d A v² e F_M = S (ω × v) | Golf, tiri liberi |
| `replay.ts` | Registra le trasformazioni a passo fisso per il replay in slow-mo | Bowling (strike), golf |

### Debug
L'overlay di debug (tasto `` ` ``) mostra i wireframe dei collider di Rapier, i vettori di velocità e spin e un grafico delle forze di attrito.

---

## 3. Asset pipeline

### Regola d'oro: **niente texture, se si può evitare** ([ADR-005](adr/ADR-005-procedural-vertex-color-assets.md))
1. **Geometria procedurale** in codice, dove la forma è regolare:
   - birilli e palla del bowling: `LatheGeometry` da un profilo di 20–30 punti (pesa quasi zero byte);
   - pista, canaline, tabellone, campo da bocce, canestro: box arrotondati (`RoundedBoxGeometry`), tubi, estrusioni;
   - vegetazione semplice: cluster di icosfere deformate.
2. **Modelli** (Pupi, oggetti complessi come il tagliacapelli o il cliente del barbiere): Blender → glTF 2.0 → `gltf-transform`:
   - `meshopt` (compressione geometria, decoder ~ 10 KB), `quantize`, `prune`, `dedup`, `weld`;
   - colori in **vertex color**; AO **bakata in un secondo canale vertex color**;
   - niente texture PBR. Quando serve un decal (logo sul tabellone, numeri, volto dei Pupi) si usa un piccolo **atlas condiviso** in KTX2/Basis o WebP ≤ 256×256.
3. **Audio**: campioni brevi in AAC/M4A, compatibili con tutti i browser incluso iOS, mono 22–32 kHz per gli SFX; musica in loop da 30–60 s. Alcuni SFX procedurali via Web Audio (click, tick) pesano 0 byte.
4. **Font**: Fredoka + Nunito in WOFF2, subset latino base + latino esteso (italiano), `font-display: swap`.

### Convenzioni
- 1 unità = 1 metro. Asse Y in alto. Pivot alla base degli oggetti.
- Nomi dei nodi glTF in `kebab-case`, con un prefisso funzionale (`col-` per i collider custom, `anchor-` per i punti di aggancio, come `anchor-hand-r`).
- Ogni asset ha una licenza tracciata in `assets/LICENSES.md`, con originale o CC0 come vincolo.

---

## 4. Budget prestazioni

**Dispositivi di riferimento**
- iPad 9ª gen (A13), Safari aggiornato;
- laptop Windows con iGPU Intel di circa 5 anni (UHD 620), Chrome;
- telefono controller: iPhone 11 / Android di fascia media del 2021.

| Metrica | Budget | Dove si misura |
|---|---|---|
| Frame rate schermo | 60 fps (p95 frame time ≤ 16,7 ms) su tier Mid | Overlay debug + test perf |
| Draw call per frame | < 150 | `renderer.info` |
| Triangoli per frame | < 300k | `renderer.info` |
| Memoria GPU (geometrie + texture) | < 150 MB | `renderer.info.memory` + stime |
| Bundle `screen-core` (gzip) | < 120 KB | `size-limit` in CI |
| Bundle `engine` (Three.js + nostro, gzip) | < 250 KB | `size-limit` |
| Rapier (gzip) | da misurare in S3; si accetta ≤ 1 MB | `size-limit` (solo report) |
| Download per gioco, schermo (gzip) | < 3 MB esclusa la fisica | CI |
| Bundle **controller** completo (gzip) | **< 100 KB** | `size-limit` |
| Time to interactive del controller (4G) | < 2,5 s | Lighthouse mobile |
| Tempo dalla selezione del gioco alla scena pronta | < 3 s (Wi-Fi) | Misura in-app |

### Tecniche
- `InstancedMesh` per gli oggetti ripetuti (birilli, pubblico, coriandoli).
- Geometrie unite (`mergeGeometries`) per l'arredo statico.
- Ombre solo sugli oggetti che contano: palla, birilli, Pupo attivo.
- Nessuna allocazione nel loop caldo: vettori e quaternioni temporanei riutilizzati.
- Frustum culling di default; LOD solo se un gioco lo richiede (golf).
