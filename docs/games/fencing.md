# Scherma — Brief

| Campo | Valore |
|---|---|
| ID modulo | `fencing` |
| Giocatori | 2, **simultanei** (1v1); con 3–4 giocatori, torneo a eliminazione |
| Fisica | Minima (collisioni lama–lama e lama–bersaglio con raycast/capsule, niente rigid body complessi) |
| Accento | Cremisi `#E8455A` |
| Layout controller | `duel`, `wait` |
| Fattibilità | 🟠 Medio-bassa |
| Ordine | 6° gioco (ultimo) |

## Fantasia
*"Ho parato all'ultimo istante, ho affondato e ho toccato per primo. Touché!"*

## Set
Pedana luminosa su un piccolo palco teatrale, riflettori, tabellone con le luci rossa e verde dei tocchi, pubblico di Pupi in platea. I due Pupi hanno maschere arrotondate nei colori dei giocatori.

## Gesto
Il telefono **è l'impugnatura del fioretto**: lo si tiene in verticale, con il lato superiore che rappresenta la punta.
| Azione | Gesto | Riconoscimento |
|---|---|---|
| Muovere la lama | Inclinare e ruotare il polso | **Orientamento 1:1** (quaternione → direzione della lama del Pupo) |
| Affondo | Spinta in avanti rapida, con il tasto azione premuto | Picco di accelerazione lungo l'asse della lama + tasto premuto → animazione di affondo |
| Parata | Rotazione rapida e laterale della lama | Picco di ω laterale + posizione della lama che intercetta quella avversaria |
| Passi avanti / indietro | Trackpad: swipe avanti/indietro | Il Pupo si muove sulla pedana |

## Simultaneità e latenza (il problema principale)
- I due telefoni arrivano allo schermo con latenze diverse (es. uno in 4G, uno in Wi-Fi).
- **Soluzione**: ogni evento (affondo, parata) porta un timestamp `t` nel **clock del DO**, sincronizzato ([03 § 4](../03-network-protocol.md#4-clock-sync)). Lo schermo aspetta un **buffer di giudizio** di circa 120 ms prima di risolvere un tocco, così ordina gli eventi per tempo reale e non per tempo di arrivo.
- Le parate hanno una **finestra generosa** (es. 150 ms prima dell'impatto) per compensare l'imprecisione residua.
- Se l'RTT p95 di uno dei due supera 150 ms compare un avviso, e si propone di mettere entrambi sulla stessa rete o di attivare l'upgrade WebRTC ([03 § 9](../03-network-protocol.md#9-evoluzione-futura-webrtc)).

## Regole
Ispirate al fioretto, semplificate: si vince con 5 tocchi; il bersaglio valido è il busto del Pupo; in caso di tocco simultaneo (< 80 ms) si assegna il punto a chi ha l'"iniziativa", cioè chi ha cominciato l'attacco per primo (l'indicatore è sullo schermo).

## Sicurezza
**Requisito di design**: i due giocatori stanno **uno accanto all'altro, rivolti allo schermo**, come davanti a uno specchio, con almeno 1,5 m di distanza tra loro. Lo schermo ricorda la disposizione prima di ogni incontro. Gli affondi sono gesti corti: non serve estendere il braccio completamente.

## Rischi
- Latenza ed equità → buffer di giudizio + clock sync + eventuale WebRTC.
- La fedeltà dell'orientamento 1:1 risente del drift dello yaw → ricalibrazione a ogni "En garde!" (entrambi puntano verso lo schermo e premono).
- Nessun tracking di posizione: la lama ruota attorno al polso del Pupo, non si sposta nello spazio. È accettabile, perché nei duelli in stile arcade conta l'orientamento.
- È il gioco più complesso: lo si affronta per ultimo, quando protocollo e motion sono collaudati.
