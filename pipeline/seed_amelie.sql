-- =====================================================================
--  Seed di esempio: prodotto "amelie" con 3 regioni (scocca, seduta, cordolo).
--  Sottoinsieme rappresentativo di materiali (id reali) da estendere.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- A6 ----------------------------------------------------------------
INSERT INTO render_profile (id, render_settings_version, samples, denoiser, color_mgmt, format)
VALUES (1, 1, 256, 'optix', 'AgX', 'PNG16');

-- A2  categorie -----------------------------------------------------
INSERT INTO material_categories (category_id, label, type, sort_order) VALUES
  ('legni',   'Legni',          'wood',    1),
  ('laccato', 'Laccato lucido', 'lacquer', 2),
  ('nubuck',  'Nubuck',         'leather', 1),
  ('savana',  'Savana',         'leather', 2),
  ('montana', 'Montana',        'leather', 3),
  ('mellow',  'Mellow',         'leather', 4),
  ('cloud',   'Cloud',          'leather', 5);

-- A1  materiali (estratto reale) ------------------------------------
INSERT INTO materials (material_id, label, category_id, type, color_ref, swatch_path, blender_asset, version) VALUES
  ('10_41',        'Ebano 10.41',    'legni',   'wood',    '#2a2320', 'swatches/wood_10_41.jpg',        'MATLIB.10_41',        1),
  ('10_32',        'Wenge 10.32',    'legni',   'wood',    '#3a2c22', 'swatches/wood_10_32.jpg',        'MATLIB.10_32',        1),
  ('10_16',        'Rovere 10.16',   'legni',   'wood',    '#9a7c54', 'swatches/wood_10_16.jpg',        'MATLIB.10_16',        1),
  ('lacca_panna',  'Lacca Panna',    'laccato', 'lacquer', '#efe7d6', 'swatches/wood_lacca_panna.jpg',  'MATLIB.lacca_panna',  1),
  ('lacca_sabbia', 'Lacca Sabbia',   'laccato', 'lacquer', '#d9c4a3', 'swatches/wood_lacca_sabbia.jpg', 'MATLIB.lacca_sabbia', 1),
  ('nubuck_2138',  'Nubuck 2138',    'nubuck',  'leather', '#2b2b2b', 'swatches/leather_nubuck_2138.jpg', 'MATLIB.nubuck_2138', 1),
  ('nubuck_2100',  'Nubuck 2100',    'nubuck',  'leather', '#cabfa9', 'swatches/leather_nubuck_2100.jpg', 'MATLIB.nubuck_2100', 1),
  ('savana_1001',  'Savana 1001',    'savana',  'leather', '#6f5b45', 'swatches/leather_savana_1001.jpg', 'MATLIB.savana_1001', 1),
  ('savana_1005',  'Savana 1005',    'savana',  'leather', '#8a6b4a', 'swatches/leather_savana_1005.jpg', 'MATLIB.savana_1005', 1),
  ('montana_1303', 'Montana 1303',   'montana', 'leather', '#4a3b30', 'swatches/leather_montana_1303.jpg','MATLIB.montana_1303',1),
  ('mellow_1408',  'Mellow 1408',    'mellow',  'leather', '#7d6552', 'swatches/leather_mellow_1408.jpg', 'MATLIB.mellow_1408', 1),
  ('cloud_1015',   'Cloud 1015',     'cloud',   'leather', '#b8a98f', 'swatches/leather_cloud_1015.jpg',  'MATLIB.cloud_1015',  1);

-- A3  prodotto ------------------------------------------------------
INSERT INTO products (product_id, name, scene_file, camera, res_w, res_h, base_layer_path, scene_version) VALUES
  ('amelie', 'Amelie', 'scenes/amelie.blend', 'CAM_hero', 2048, 1440, 'renders/amelie/base.png', 1);

-- A4  regioni (variabili per prodotto) ------------------------------
INSERT INTO product_regions (product_id, region_id, label, collection, material_slot, z_order, accepts_types, default_material_id, occluded_by) VALUES
  ('amelie', 'shell',  'Scocca',  'REG_shell',  'MAT_shell',  10, 'wood,lacquer', '10_41',       NULL),
  ('amelie', 'seat',   'Seduta',  'REG_seat',   'MAT_seat',   20, 'leather,fabric','nubuck_2138', NULL),
  ('amelie', 'piping', 'Cordolo', 'REG_piping', 'MAT_piping', 30, 'leather',      'savana_1001', NULL);

-- A5-bis  allow-list per categoria ----------------------------------
INSERT INTO product_region_allowed_category (product_id, region_id, category_id) VALUES
  ('amelie', 'shell',  'legni'),
  ('amelie', 'shell',  'laccato'),
  ('amelie', 'seat',   'nubuck'),
  ('amelie', 'seat',   'savana'),
  ('amelie', 'seat',   'montana'),
  ('amelie', 'seat',   'mellow'),
  ('amelie', 'seat',   'cloud'),
  ('amelie', 'piping', 'savana');

-- A5  esempio di override: escludi una singola pelle dalla seduta ----
-- INSERT INTO product_region_material_override (product_id, region_id, material_id, mode) VALUES
--   ('amelie', 'seat', 'cloud_1015', 'exclude');
