# Talento — pagina prodotto + configuratore (POC)

Clone **1:1 della pagina prodotto Talento** di laurameroni.com (stessi testi/immagini/struttura,
designer Edoardo Colzani) con il **configuratore** iniettato prima della sezione "Materie & finiture".
Gli URL del sito sono resi assoluti (CDN Laurameroni) così chrome/CSS/foto si caricano; il bundle
`app.min.js` del sito è rimosso perché in locale entrava in retry-loop sui chunk (stesso approccio
del clone Amelie). Compositing delle finiture fatto in browser su `<canvas>`.

## Come aprirla

**Modo 1 — doppio click** su `index.html`
Funziona da `file://` perché il manifest è inlined in `manifest.data.js`.
L'anteprima si compone correttamente; il pulsante *Salva immagine* può essere bloccato
da alcuni browser su `file://` (restrizione canvas) → in tal caso usa il Modo 2.

**Modo 2 — server locale (consigliato, tutte le funzioni)**
Dalla cartella del progetto (`poc config`):
```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8766 -Root .\web\talento2
```
poi apri http://localhost:8766/
(in alternativa: `python -m http.server 8766 --directory "web\talento2"`)

## Come funziona

- **`base.png`** — render completo del tavolo (struttura/incastri illuminati). È lo sfondo:
  così le fessure tra le gambe non mostrano "buchi neri".
- **`layers/<gruppo>__<opzione>.png`** — 137 render, uno per finitura per gruppo. Ogni layer è
  *beauty × maschera del gruppo* (maschera nel canale alpha), quindi copre solo la sua zona.
- Il browser compone: **base + over(big_b, big_a, small, top)** su `<canvas>` a risoluzione nativa
  (2560×1810), con crossfade al cambio finitura.
- **`manifest.json`** — descrive i 4 gruppi e le opzioni. `manifest.data.js` è lo stesso JSON
  inlined per far funzionare la pagina anche da `file://` (rigenerabile dal `.json`).

## I 4 gruppi configurabili

| Gruppo            | id      | Finiture                                  |
|-------------------|---------|-------------------------------------------|
| Piano             | `top`   | 13 legni ALPI · 8 marmi                    |
| Gamba grande A    | `big_a` | 13 legni · 23 laccati lucidi RAL           |
| Gamba grande B    | `big_b` | 13 legni · 23 laccati lucidi RAL           |
| Inserto           | `small` | 13 legni · 23 laccati · 8 marmi            |

I due montanti (A/B) sono indipendenti → versione **bicolore**. Le 5 gambe sono identiche.

## File

- `index.html` — pagina prodotto (clone reale Laurameroni) con il blocco `#talento-configurator`
- `configurator.css` — stile del configuratore (BEM `.lm-configurator__*`)
- `configurator.js` — engine: stato per gruppo, tab per tipo (Legno/Marmo/Laccato),
  caroselli paginati, compositing canvas, download PNG, lightbox a schermo intero
- `manifest.json` / `manifest.data.js` — dati (4 gruppi, 137 opzioni)
- `base.png`, `layers/`, `swatches/` — asset render
- `_preview_demo.jpg` — esempio di composizione (Colorado + gambe bicolore + inserto Rosso Levanto)

## Ottimizzazione peso (WebP clean+crop)

I layer sono serviti in **WebP ritagliati**: **463 MB → 3 MB (~153×)**, qualità visivamente identica.
Pipeline (`_png_to_webp.py` nella root del progetto):
1. **clean** — i PNG di render avevano rumore invisibile (alpha/RGB ~1–8) su tutta la cornice dietro
   `alpha=0`, incomprimibile: per questo ogni layer pesava ~3,2 MB. Azzerato sotto soglia `alpha<8`
   (lossless per il compositing "over").
2. **crop** — ogni layer ritagliato al bounding box del suo gruppo; i 4 `bbox [x,y,w,h]` sono nel
   manifest e l'engine disegna ogni layer al suo offset (`drawLayer()`), con fallback full-frame.
3. **webp** — quality 90 (PSNR 40–44 dB = impercettibile), con alpha.

Risultato: `base.webp` 91 KB · 137 layer 2,9 MB · **primo caricamento** (base + 4 layer) ~170 KB.
I PNG originali restano in `layers/*.png` + `base.png` come backup (442 MB, **non serviti**): si possono
archiviare/eliminare per liberare spazio. Per rigenerare i WebP dopo nuovi render: `python _png_to_webp.py`.
