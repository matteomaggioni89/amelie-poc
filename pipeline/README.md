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
| `build.py` | costruisce il `.db`, valida, esporta manifest + job |
| `amelie_pim.db` | **il DB portable** (rigenerabile con `build.py`) |
| `out/` | artefatti generati: `manifest_*.json`, `render_jobs.csv` |

## Uso
```bash
python3 build.py          # ricrea amelie_pim.db da schema+seed e rigenera out/
```
Per popolare i dati in modo strutturato apri `amelie_pim.db` con un qualsiasi
editor SQLite (es. **DB Browser for SQLite**, DBeaver) e compila le tabelle,
oppure aggiungi `INSERT` in un file seed tuo e passalo con `--seed`.

## Come compilare (ordine consigliato)
1. `render_profile` — 1 riga (id=1) con le impostazioni di render.
2. `material_categories` — i gruppi/tab (Nubuck, Legni, …).
3. `materials` — i ~400 materiali condivisi (id stabile + `version`).
4. `products` — i ~200 prodotti + contratto di scena (.blend, camera, res).
5. `product_regions` — le regioni di ogni prodotto (`z_order`, `accepts_types`, default).
6. `product_region_allowed_category` — quali categorie sono ammesse per regione.
7. (opzionale) `product_region_material_override` — eccezioni include/exclude.

I materiali ammessi per ogni regione sono **calcolati** dalla vista
`v_product_region_material` (categorie ammesse ∪ include − exclude, filtrati
per `accepts_types`): non vanno scritti a mano uno per uno.

## Delta / idempotenza
Ogni job ha `cache_token = s{scene_version}.m{material_version}.r{render_settings_version}`
e una `key_sha1`. Bump della `version` di un materiale ⇒ cambia il token (e
quindi `?v=` nel manifest e la chiave del job) **solo** per i layer che lo usano:
si rigenera il minimo indispensabile.

## Validazioni automatiche (in `build.py`)
- `foreign_key_check` (nessuna riga orfana);
- regioni senza materiali ammessi;
- default di regione fuori dai materiali ammessi;
- **occlusione mutua** tra regioni dinamiche (vincolo del modello additivo:
  va pre-composta, vedi `occluded_by`).
