# ADR-005 — Asset procedurali e vertex color invece di texture

- **Stato**: Accettato (resa visiva da confermare in S4)
- **Data**: 2026-11-04

## Contesto
Lo stile deve essere "alla Nintendo fatto bene" ma **leggero da caricare** su un sito, anche in 4G. Le texture PBR sono la parte più pesante di una scena 3D, sia in download sia in memoria GPU.

## Decisione
- Le forme regolari (birilli, palle, piste, campi, canestri, arredi) sono **geometria procedurale** generata in codice.
- I modelli necessari (Pupi, oggetti complessi) sono glTF compressi con meshopt, con **colori in vertex color** e **AO bakata in un secondo canale vertex color**.
- Lo shading "Soft Toy" usa una **ramp 1D di 4×1 px**, la hemisphere light e il rim fresnel: non servono texture per ottenere lo stile.
- Texture ammesse solo per piccoli decal (occhi dei Pupi, loghi, numeri), in un atlas condiviso ≤ 256×256.

## Conseguenze
- ✅ Download per gioco nell'ordine delle centinaia di KB, non dei MB.
- ✅ Look coerente: è impossibile "sbagliare stile" con una texture fotografica.
- ✅ Varianti di colore gratuite (colori dei giocatori, accenti).
- ⚠️ I dettagli fini (venature, tessuti) vanno resi con la geometria o non resi: è una scelta stilistica accettata.
- ⚠️ Chi crea gli asset deve lavorare con i vertex color in Blender (workflow documentato in [06 § 3](../06-rendering-physics.md#3-asset-pipeline)).
