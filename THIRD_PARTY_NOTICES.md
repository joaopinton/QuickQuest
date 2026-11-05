# Componenti di terze parti

## choijunhuk/phonemote

Codice adattato (riscritto sui nostri tipi) e tracce di sensori convertite da
<https://github.com/choijunhuk/phonemote>. I file adattati riportano la provenienza in testa:

- `packages/motion/src/axis-check.ts`, `adapter.ts` (ordine degli assi, rotazione dello schermo)
- `packages/motion/src/gyro-bias.ts`, `stillness.ts`, `one-euro.ts`, `grip.ts`, `pointer.ts`, `burst.ts`
- `packages/motion/test/traces/*.json` (da `traces/corpus/*.pmtrace`, con `scripts/convert-pmtrace.ts`)

```
MIT License

Copyright (c) 2026 choijunhuk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## web-haptics

Dipendenza npm `web-haptics` (<https://github.com/lochie/web-haptics>), MIT,
Copyright (c) 2025 Lochie Axon. Il testo della licenza è distribuito con il pacchetto.

## 1€ filter

Algoritmo di Casiez, Roussel e Vogel, *1 € Filter: A Simple Speed-Based Low-Pass Filter for
Noisy Input in Interactive Systems*, CHI 2012 (`packages/motion/src/one-euro.ts`).
