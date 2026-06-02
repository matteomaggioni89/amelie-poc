# Pipeline PIM (SQLite portable)

Database singolo-file che descrive **prodotti**, **materiali condivisi** e
**mappatura prodotto↔regione↔materiale** per la pipeline di rendering a layer
additivi. Da qui si generano in automatico:

- il **manifest runtime** (uno per prodotto, a N regioni) per il frontend;
- la **lista job** di render (un layer per riga) per la farm.

`1 mappatura → 1 job → 1 PNG → 1 item di manifest` (biiezione).

## File
| file | cosa |
|---|---|
| `schema.sql` | DDL: tabelle, vincoli (FK/CHECK), viste di espansione |
| `seed_amelie.sql` | dati di esempio (Amelie, 3 regioni) da estendere |
| `manifest_query.sql` | query SQL che assembla il manifest JSON a N regioni |
| `admin.py` + `admin.html` | **mini web-admin** per inserire materiali e categorie |
| `build.py` | valida il `.db` ed esporta manifest + job (non lo sovrascrive) |
| `amelie_pim.db` | **il DB portable** (la fonte dei dati; ignorato da git) |
| `out/` | artefatti generati: `manifest_*.json`, `render_jobs.csv`, `material_maps.csv` |

## Inserire i dati — web-admin (consigliato)
```bash
python3 admin.py          # apre http://localhost:8765
```
Interfaccia con menù a tendina e validazioni per **categorie** e **materiali**
(con le relative texture). Scrive direttamente in `amelie_pim.db`. Nessuna
dipendenza: solo Python standard. Se il DB non esiste lo crea vuoto.

In alternativa puoi editare `amelie_pim.db` con **DB Browser for SQLite**/DBeaver,
o aggiungere `INSERT` in un file seed e passarlo con `--seed`.

## Generare gli artefatti
```bash
python3 build.py          # usa il DB ESISTENTE, rigenera out/ (NON sovrascrive)
python3 build.py --reset  # ricrea il DB da schema+seed (DISTRUTTIVO, per demo/dev)
python3 build.py --dump   # esporta anche data.sql (backup testuale versionabile)
```
> Il `.db` è ignorato da git perché diventa la fonte dati viva (editata
> dall'admin). Per versionarlo/salvarlo come testo usa `--dump`: `data.sql`
> ricostruisce il DB ed è diff-abile.

## Come compilare (ordine consigliato)
1. `render_profile` — 1 riga (id=1) con le impostazioni di render.
2. `map_types` — i tipi di texture supportati (già pre-caricati; estendibile).
3. `material_categories` — i gruppi/tab (Nubuck, Legni, …).
4. `materials` — i ~400 materiali condivisi (id stabile, `version`, **footprint cm**).
5. `material_maps` — le texture di ogni materiale (base_color/roughness/normal/bump/…).
6. `products` — i ~200 prodotti + contratto di scena (.blend, camera, res).
7. `product_regions` — le regioni di ogni prodotto (`z_order`, `accepts_types`, default).
8. `product_region_allowed_category` — quali categorie sono ammesse per regione.
9. (opzionale) `product_region_material_override` — eccezioni include/exclude.

### Libreria materiali condivisa
`materials` è la libreria unica: un materiale è definito **una volta** e
richiamato da più prodotti/regioni per `id` (es. `savana_1001` usato su `seat`
e `piping`).

- **Scala fisica reale**: `materials.tile_width_cm` / `tile_height_cm` indicano
  la dimensione reale (cm) che la texture rappresenta. Il worker Blender imposta
  la scala del Mapping node come `UV_reali / footprint`, così il disegno della
  texture esce nella misura corretta a prescindere dalla dimensione del modello.
  `tileable=0` per texture non ripetibili (es. una stampa unica).
- **`map_types`** è una lookup **estensibile** (aggiungere un tipo = inserire una
  riga, niente `ALTER`): definisce il `colorspace` corretto una volta sola
  (sRGB per base_color/emission, Non-Color per le map dati).
- **`material_maps`** (1 materiale → N map): una map per `(materiale, tipo)`,
  `file_path` + `strength` (intensità per normal/bump/displacement). Il colorspace
  non si scrive a mano: deriva da `map_types`. Tipi inclusi: base_color, roughness,
  metallic, **normal**, **bump**, ao, displacement, opacity, emission, specular,
  sheen, clearcoat, transmission, subsurface.

I materiali ammessi per ogni regione sono **calcolati** dalla vista
`v_product_region_material` (categorie ammesse ∪ include − exclude, filtrati
per `accepts_types`): non vanno scritti a mano uno per uno.

## Delta / idempotenza
- Il `?v=` del **manifest** usa `cache_token = s{scene_version}.m{material_version}.r{render_settings_version}`
  (leggibile, URL stabili): bump di `materials.version` ⇒ cambia solo per i layer che lo usano.
- La **`key_sha1`** dei job (lato farm) include una **firma del render look** del
  materiale (footprint cm + set di map: tipo/path/colorspace/strength): se cambi
  una texture o la scala fisica la chiave cambia e la farm rigenera **anche senza**
  ricordarsi di bumpare `version`.

## Artefatti generati (`out/`)
- `manifest_<product>.json` — manifest runtime a N regioni (frontend).
- `render_jobs.csv` — 1 riga per layer (farm).
- `material_maps.csv` — set PBR per materiale (il worker lo carica nel materiale).

## Validazioni automatiche (in `build.py`)
- `foreign_key_check` (nessuna riga orfana);
- regioni senza materiali ammessi;
- default di regione fuori dai materiali ammessi;
- **occlusione mutua** tra regioni dinamiche (vincolo additivo, vedi `occluded_by`);
- materiali usati senza map `base_color`;
- materiali `tileable` senza `tile_width_cm`/`tile_height_cm` (scala fisica indefinita).
