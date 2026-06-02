-- =====================================================================
--  Amelie / configuratore - schema PIM portable (SQLite)
--  Modello dati per la pipeline di rendering a layer additivi.
--  1 riga di mappatura  ->  1 job di render  ->  1 PNG  ->  1 item di manifest
--
--  Convenzioni:
--   - gli id sono slug stabili (mai riusati)
--   - active 0/1 nasconde senza cancellare
--   - version / scene_version / render_settings_version pilotano il delta-rerender
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- A6  render_profile : impostazioni globali (riga singola, id=1)
-- ---------------------------------------------------------------------
CREATE TABLE render_profile (
  id                      INTEGER PRIMARY KEY CHECK (id = 1),
  render_settings_version INTEGER NOT NULL DEFAULT 1,  -- bump => rerender GLOBALE
  samples                 INTEGER NOT NULL DEFAULT 256,
  denoiser                TEXT    NOT NULL DEFAULT 'optix',
  color_mgmt              TEXT    NOT NULL DEFAULT 'AgX',
  format                  TEXT    NOT NULL DEFAULT 'PNG16'
);

-- ---------------------------------------------------------------------
-- A2  material_categories : i gruppi/tab della UI (Nubuck, Legni, ...)
-- ---------------------------------------------------------------------
CREATE TABLE material_categories (
  category_id TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,                  -- leather|fabric|wood|lacquer|metal
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
-- A1  materials : libreria condivisa (~400), referenziata da tutti i prodotti
-- ---------------------------------------------------------------------
CREATE TABLE materials (
  material_id   TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  category_id   TEXT NOT NULL REFERENCES material_categories(category_id),
  type          TEXT NOT NULL,                -- coerente con la categoria
  color_ref     TEXT,                         -- hex o Lab, per QA delta-E
  swatch_path   TEXT NOT NULL,                -- thumbnail UI
  blender_asset TEXT NOT NULL,                -- id materiale/node-group nella libreria .blend
  version       INTEGER NOT NULL DEFAULT 1,   -- bump => rerender dei suoi usi
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE INDEX idx_materials_category ON materials(category_id);

-- ---------------------------------------------------------------------
-- A1-bis  material_maps : set di texture PBR per materiale (1 materiale -> N map)
--   Il DB pilota il look: il worker Blender carica queste texture nel materiale.
--   Una sola map per (materiale, tipo). Bump materials.version quando cambi una map.
-- ---------------------------------------------------------------------
CREATE TABLE material_maps (
  material_id TEXT NOT NULL REFERENCES materials(material_id) ON DELETE CASCADE,
  map_type    TEXT NOT NULL CHECK (map_type IN (
                 'base_color','roughness','metallic','normal','ao',
                 'displacement','opacity','emission','specular','sheen','clearcoat')),
  file_path   TEXT NOT NULL,
  colorspace  TEXT NOT NULL DEFAULT 'Non-Color' CHECK (colorspace IN ('sRGB','Non-Color')),
  uv_scale    REAL NOT NULL DEFAULT 1.0,
  notes       TEXT,
  PRIMARY KEY (material_id, map_type)
);

-- ---------------------------------------------------------------------
-- A3  products : i ~200 prodotti + "contratto di scena"
-- ---------------------------------------------------------------------
CREATE TABLE products (
  product_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  scene_file      TEXT NOT NULL,                       -- .blend (scena+mapping gia' fatte)
  camera          TEXT NOT NULL DEFAULT 'CAM_hero',
  res_w           INTEGER NOT NULL DEFAULT 2048,
  res_h           INTEGER NOT NULL DEFAULT 1440,
  base_layer_path TEXT NOT NULL,                       -- layer statico (luci/ombre cotte)
  scene_version   INTEGER NOT NULL DEFAULT 1,          -- bump => rerender di tutti i layer del prodotto
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- ---------------------------------------------------------------------
-- A4  product_regions : le regioni (VARIABILI per prodotto)
-- ---------------------------------------------------------------------
CREATE TABLE product_regions (
  product_id          TEXT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  region_id           TEXT NOT NULL,
  label               TEXT NOT NULL,
  collection          TEXT NOT NULL,            -- collection/mesh nel .blend
  material_slot       TEXT NOT NULL,            -- slot pilotato dal worker
  z_order             INTEGER NOT NULL,         -- ordine di stacking in compositing
  accepts_types       TEXT NOT NULL,            -- csv tipi ammessi, es. 'leather,fabric'
  default_material_id TEXT REFERENCES materials(material_id),
  occluded_by         TEXT,                     -- region_id che la occlude (check additivo 4A)
  PRIMARY KEY (product_id, region_id)
);

-- ---------------------------------------------------------------------
-- A5-bis  allow-list per categoria : input ergonomico
--         (si espande nei materiali ammessi tramite la vista canonica)
-- ---------------------------------------------------------------------
CREATE TABLE product_region_allowed_category (
  product_id  TEXT NOT NULL,
  region_id   TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES material_categories(category_id),
  PRIMARY KEY (product_id, region_id, category_id),
  FOREIGN KEY (product_id, region_id)
    REFERENCES product_regions(product_id, region_id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- A5  override espliciti : eccezioni include/exclude sulla allow-list
-- ---------------------------------------------------------------------
CREATE TABLE product_region_material_override (
  product_id  TEXT NOT NULL,
  region_id   TEXT NOT NULL,
  material_id TEXT NOT NULL REFERENCES materials(material_id),
  mode        TEXT NOT NULL CHECK (mode IN ('include','exclude')),
  sort_order  INTEGER,
  PRIMARY KEY (product_id, region_id, material_id),
  FOREIGN KEY (product_id, region_id)
    REFERENCES product_regions(product_id, region_id) ON DELETE CASCADE
);

-- =====================================================================
--  VISTE
-- =====================================================================

-- Mappatura CANONICA prodotto-regione-materiale:
--   (materiali delle categorie ammesse)  UNION  (include espliciti)
--   filtrati per tipo accettato dalla regione,  MENO gli exclude espliciti.
CREATE VIEW v_product_region_material AS
WITH base AS (
  SELECT pr.product_id, pr.region_id, m.material_id
  FROM product_regions pr
  JOIN product_region_allowed_category ac
    ON ac.product_id = pr.product_id AND ac.region_id = pr.region_id
  JOIN materials m
    ON m.category_id = ac.category_id AND m.active = 1
  UNION
  SELECT o.product_id, o.region_id, o.material_id
  FROM product_region_material_override o
  JOIN materials m ON m.material_id = o.material_id AND m.active = 1
  WHERE o.mode = 'include'
)
SELECT b.product_id, b.region_id, b.material_id
FROM base b
JOIN product_regions pr
  ON pr.product_id = b.product_id AND pr.region_id = b.region_id
JOIN materials m ON m.material_id = b.material_id
WHERE instr(',' || pr.accepts_types || ',', ',' || m.type || ',') > 0
  AND NOT EXISTS (
    SELECT 1 FROM product_region_material_override x
    WHERE x.product_id = b.product_id AND x.region_id = b.region_id
      AND x.material_id = b.material_id AND x.mode = 'exclude'
  );

-- Lista JOB di render: 1 riga = 1 layer da renderizzare.
--   hash_input : stringa canonica deterministica (il planner puo' farne sha1)
--   cache_token: token leggibile per il ?v= del manifest (cambia col delta)
CREATE VIEW v_render_jobs AS
SELECT
  p.product_id,
  pr.region_id,
  prm.material_id,
  p.scene_file,
  p.camera,
  p.res_w,
  p.res_h,
  pr.collection,
  pr.material_slot,
  pr.z_order,
  m.blender_asset,
  'renders/' || p.product_id || '/' || pr.region_id || '__' || prm.material_id || '.png' AS out_path,
  p.scene_version || '|' || pr.region_id || '|' || prm.material_id || '|'
    || m.version || '|' || rp.render_settings_version AS hash_input,
  's' || p.scene_version || '.m' || m.version || '.r' || rp.render_settings_version AS cache_token
FROM v_product_region_material prm
JOIN products p         ON p.product_id = prm.product_id AND p.active = 1
JOIN product_regions pr ON pr.product_id = prm.product_id AND pr.region_id = prm.region_id
JOIN materials m        ON m.material_id = prm.material_id
CROSS JOIN render_profile rp;

-- Item di manifest (1:1 coi job), con URL del layer gia' cache-bustato.
CREATE VIEW v_manifest_item AS
SELECT
  j.product_id,
  j.region_id,
  m.category_id                          AS group_id,
  m.material_id                          AS item_id,
  m.label                                AS item_label,
  m.swatch_path                          AS swatch,
  j.out_path || '?v=' || j.cache_token   AS layer,
  m.label                                AS sort_label
FROM v_render_jobs j
JOIN materials m ON m.material_id = j.material_id;
