-- =====================================================================
--  Seed categorie reali Laurameroni (BOZZA - da rifinire con la sitemap)
--  Solo i RAGGRUPPAMENTI (material_categories). Le varianti colore
--  (materials) e i prodotti si popolano in un secondo momento.
--
--  Slug/etichette marcati "da confermare" nel chat vanno verificati:
--  pietre (marmi/onice/travertino), vetri (vetro/specchi) e le 5 linee
--  di laccato. Idempotente: usa INSERT OR IGNORE.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- impostazioni globali di render (serve quando aggiungerai i prodotti)
INSERT OR IGNORE INTO render_profile (id, render_settings_version, samples, denoiser, color_mgmt, format)
VALUES (1, 1, 256, 'optix', 'AgX', 'PNG16');

-- tipi di map standard (per i menu' a tendina e la FK delle texture)
INSERT OR IGNORE INTO map_types (map_type, label, colorspace, uses_strength) VALUES
  ('base_color','Base Color / Albedo','sRGB',0), ('roughness','Roughness','Non-Color',0),
  ('metallic','Metallic','Non-Color',0), ('normal','Normal','Non-Color',1),
  ('bump','Bump / Height','Non-Color',1), ('ao','Ambient Occlusion','Non-Color',0),
  ('displacement','Displacement','Non-Color',1), ('opacity','Opacity / Alpha','Non-Color',0),
  ('emission','Emission','sRGB',0), ('specular','Specular','Non-Color',0),
  ('sheen','Sheen','Non-Color',0), ('clearcoat','Clearcoat','Non-Color',0),
  ('transmission','Transmission','Non-Color',0), ('subsurface','Subsurface','Non-Color',0);

-- =====================================================================
--  CATEGORIE (= linee materiale). sort_order raggruppa per macro-famiglia.
-- =====================================================================
INSERT OR IGNORE INTO material_categories (category_id, label, type, sort_order) VALUES
  -- Pelli (A/B/C)
  ('nabuk',                     'Nubuck',                     'leather',  1),
  ('montana',                   'Montana',                    'leather',  2),
  ('savana',                    'Savana',                     'leather',  3),
  ('mellow',                    'Mellow',                     'leather',  4),
  ('cloud',                     'Cloud',                      'leather',  5),
  -- Tessuti / Velluti
  ('lamasoft',                  'Lamasoft',                   'fabric',  10),
  ('velluti-liquidi',           'Velluti Liquidi',            'fabric',  11),
  ('garza',                     'Garza',                      'fabric',  12),
  -- Legni
  ('plain-woods',               'Legni',                      'wood',    20),
  ('special-woods',             'Legni Speciali',             'wood',    21),
  -- Laccati
  ('laccato-lucido',            'Laccato Lucido',             'lacquer', 30),
  ('laccato-opaco',             'Laccato Opaco',              'lacquer', 31),
  ('laccato-opaco-spazzolato',  'Laccato Opaco Spazzolato',   'lacquer', 32),
  ('laccato-lucido-sfumato',    'Laccato Lucido Sfumato',     'lacquer', 33),
  ('laccato-oro',               'Laccato Oro',                'lacquer', 34),
  -- Metalli (Metallo Liquido)
  ('metallo-liquido-unlimited', 'Metallo Liquido Unlimited',  'metal',   40),
  ('metallo-liquido-decor',     'Metallo Liquido Decor',      'metal',   41),
  -- Pietre / Marmi
  ('quarzite',                  'Quarzite',                   'stone',   50),
  ('marmi',                     'Marmi',                      'stone',   51),
  ('onice',                     'Onice',                      'stone',   52),
  ('travertino',                'Travertino',                 'stone',   53),
  -- Ceramiche
  ('ceramiche-opache',          'Ceramiche Opache',           'ceramic', 60),
  -- Vetri / Specchi
  ('vetro',                     'Vetro / Cristallo',          'glass',   70),
  ('specchi',                   'Specchi',                    'glass',   71);
