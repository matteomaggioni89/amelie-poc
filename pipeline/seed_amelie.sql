-- =====================================================================
--  Seed di esempio: prodotto "amelie" con 3 regioni (scocca, seduta, cordolo).
--  Sottoinsieme rappresentativo di materiali (id reali) da estendere.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- A6 ----------------------------------------------------------------
INSERT INTO render_profile (id, render_settings_version, samples, denoiser, color_mgmt, format)
VALUES (1, 1, 256, 'optix', 'AgX', 'PNG16');

-- A1-ter  tipi di map supportati (estendibile: basta aggiungere righe) -
INSERT INTO map_types (map_type, label, colorspace, uses_strength) VALUES
  ('base_color',   'Base Color / Albedo', 'sRGB',      0),
  ('roughness',    'Roughness',           'Non-Color', 0),
  ('metallic',     'Metallic',            'Non-Color', 0),
  ('normal',       'Normal',              'Non-Color', 1),
  ('bump',         'Bump / Height',       'Non-Color', 1),
  ('ao',           'Ambient Occlusion',   'Non-Color', 0),
  ('displacement', 'Displacement',        'Non-Color', 1),
  ('opacity',      'Opacity / Alpha',     'Non-Color', 0),
  ('emission',     'Emission',            'sRGB',      0),
  ('specular',     'Specular',            'Non-Color', 0),
  ('sheen',        'Sheen',               'Non-Color', 0),
  ('clearcoat',    'Clearcoat',           'Non-Color', 0),
  ('transmission', 'Transmission',        'Non-Color', 0),
  ('subsurface',   'Subsurface',          'Non-Color', 0);

-- A2  categorie -----------------------------------------------------
INSERT INTO material_categories (category_id, label, type, sort_order) VALUES
  ('legni',   'Legni',          'wood',    1),
  ('laccato', 'Laccato lucido', 'lacquer', 2),
  ('nubuck',  'Nubuck',         'leather', 1),
  ('savana',  'Savana',         'leather', 2),
  ('montana', 'Montana',        'leather', 3),
  ('mellow',  'Mellow',         'leather', 4),
  ('cloud',   'Cloud',          'leather', 5);

-- A1  materiali (estratto reale) + footprint reale della texture (cm) -------
INSERT INTO materials (material_id, label, category_id, type, color_ref, tile_width_cm, tile_height_cm, swatch_path, blender_asset, version) VALUES
  ('10_41',        'Ebano 10.41',  'legni',   'wood',    '#2a2320', 100, 100, 'swatches/wood_10_41.jpg',        'MATLIB.10_41',        1),
  ('10_32',        'Wenge 10.32',  'legni',   'wood',    '#3a2c22', 100, 100, 'swatches/wood_10_32.jpg',        'MATLIB.10_32',        1),
  ('10_16',        'Rovere 10.16', 'legni',   'wood',    '#9a7c54', 120, 120, 'swatches/wood_10_16.jpg',        'MATLIB.10_16',        1),
  ('lacca_panna',  'Lacca Panna',  'laccato', 'lacquer', '#efe7d6',  50,  50, 'swatches/wood_lacca_panna.jpg',  'MATLIB.lacca_panna',  1),
  ('lacca_sabbia', 'Lacca Sabbia', 'laccato', 'lacquer', '#d9c4a3',  50,  50, 'swatches/wood_lacca_sabbia.jpg', 'MATLIB.lacca_sabbia', 1),
  ('nubuck_2138',  'Nubuck 2138',  'nubuck',  'leather', '#2b2b2b',  70,  70, 'swatches/leather_nubuck_2138.jpg', 'MATLIB.nubuck_2138', 1),
  ('nubuck_2100',  'Nubuck 2100',  'nubuck',  'leather', '#cabfa9',  70,  70, 'swatches/leather_nubuck_2100.jpg', 'MATLIB.nubuck_2100', 1),
  ('savana_1001',  'Savana 1001',  'savana',  'leather', '#6f5b45',  70,  70, 'swatches/leather_savana_1001.jpg', 'MATLIB.savana_1001', 1),
  ('savana_1005',  'Savana 1005',  'savana',  'leather', '#8a6b4a',  70,  70, 'swatches/leather_savana_1005.jpg', 'MATLIB.savana_1005', 1),
  ('montana_1303', 'Montana 1303', 'montana', 'leather', '#4a3b30',  75,  75, 'swatches/leather_montana_1303.jpg','MATLIB.montana_1303',1),
  ('mellow_1408',  'Mellow 1408',  'mellow',  'leather', '#7d6552',  75,  75, 'swatches/leather_mellow_1408.jpg', 'MATLIB.mellow_1408', 1),
  ('cloud_1015',   'Cloud 1015',   'cloud',   'leather', '#b8a98f',  80,  80, 'swatches/leather_cloud_1015.jpg',  'MATLIB.cloud_1015',  1);

-- A1-bis  mappe per materiale (colorspace deriva da map_types) -------
--  strength: intensita' per normal/bump/displacement (ignorata per le altre)
INSERT INTO material_maps (material_id, map_type, file_path, strength) VALUES
  -- legno ebano: base + roughness + normal
  ('10_41', 'base_color', 'textures/wood/10_41/base_color.jpg', 1.0),
  ('10_41', 'roughness',  'textures/wood/10_41/roughness.jpg',  1.0),
  ('10_41', 'normal',     'textures/wood/10_41/normal.jpg',     1.0),
  -- legno rovere: usa BUMP al posto della normal (esempio di tipo alternativo)
  ('10_16', 'base_color', 'textures/wood/10_16/base_color.jpg', 1.0),
  ('10_16', 'roughness',  'textures/wood/10_16/roughness.jpg',  1.0),
  ('10_16', 'bump',       'textures/wood/10_16/height.jpg',     0.4),
  -- legno wenge
  ('10_32', 'base_color', 'textures/wood/10_32/base_color.jpg', 1.0),
  ('10_32', 'roughness',  'textures/wood/10_32/roughness.jpg',  1.0),
  ('10_32', 'normal',     'textures/wood/10_32/normal.jpg',     1.0),
  -- laccato lucido: base + roughness bassa + clearcoat
  ('lacca_panna',  'base_color', 'textures/lacquer/lacca_panna/base_color.jpg',  1.0),
  ('lacca_panna',  'roughness',  'textures/lacquer/lacca_panna/roughness.jpg',   1.0),
  ('lacca_panna',  'clearcoat',  'textures/lacquer/lacca_panna/clearcoat.jpg',   1.0),
  ('lacca_sabbia', 'base_color', 'textures/lacquer/lacca_sabbia/base_color.jpg', 1.0),
  ('lacca_sabbia', 'roughness',  'textures/lacquer/lacca_sabbia/roughness.jpg',  1.0),
  ('lacca_sabbia', 'clearcoat',  'textures/lacquer/lacca_sabbia/clearcoat.jpg',  1.0),
  -- pelle nubuck (con AO + normal)
  ('nubuck_2138', 'base_color', 'textures/leather/nubuck_2138/base_color.jpg', 1.0),
  ('nubuck_2138', 'roughness',  'textures/leather/nubuck_2138/roughness.jpg',  1.0),
  ('nubuck_2138', 'normal',     'textures/leather/nubuck_2138/normal.jpg',     1.0),
  ('nubuck_2138', 'ao',         'textures/leather/nubuck_2138/ao.jpg',         1.0),
  ('nubuck_2100', 'base_color', 'textures/leather/nubuck_2100/base_color.jpg', 1.0),
  ('nubuck_2100', 'roughness',  'textures/leather/nubuck_2100/roughness.jpg',  1.0),
  ('nubuck_2100', 'normal',     'textures/leather/nubuck_2100/normal.jpg',     1.0),
  -- pelle savana (condivisa tra seat e piping)
  ('savana_1001', 'base_color', 'textures/leather/savana_1001/base_color.jpg', 1.0),
  ('savana_1001', 'roughness',  'textures/leather/savana_1001/roughness.jpg',  1.0),
  ('savana_1001', 'normal',     'textures/leather/savana_1001/normal.jpg',     1.0),
  ('savana_1005', 'base_color', 'textures/leather/savana_1005/base_color.jpg', 1.0),
  ('savana_1005', 'roughness',  'textures/leather/savana_1005/roughness.jpg',  1.0),
  ('savana_1005', 'normal',     'textures/leather/savana_1005/normal.jpg',     1.0),
  -- altre pelli (set minimo)
  ('montana_1303', 'base_color', 'textures/leather/montana_1303/base_color.jpg', 1.0),
  ('montana_1303', 'roughness',  'textures/leather/montana_1303/roughness.jpg',  1.0),
  ('montana_1303', 'normal',     'textures/leather/montana_1303/normal.jpg',     1.0),
  ('mellow_1408',  'base_color', 'textures/leather/mellow_1408/base_color.jpg', 1.0),
  ('mellow_1408',  'roughness',  'textures/leather/mellow_1408/roughness.jpg',  1.0),
  ('mellow_1408',  'normal',     'textures/leather/mellow_1408/normal.jpg',     1.0),
  ('cloud_1015',   'base_color', 'textures/leather/cloud_1015/base_color.jpg', 1.0),
  ('cloud_1015',   'roughness',  'textures/leather/cloud_1015/roughness.jpg',  1.0),
  ('cloud_1015',   'normal',     'textures/leather/cloud_1015/normal.jpg',     1.0);

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
