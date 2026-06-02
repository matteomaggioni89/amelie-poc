-- Genera un manifest runtime (JSON) per ogni prodotto attivo, a N regioni,
-- assemblando regions -> groups -> items dalle viste. Una riga per prodotto:
--   (product_id, manifest_json)
-- L'ordinamento e' forzato con subquery ORDER BY (z_order, sort_order, label).
SELECT
  p.product_id AS product_id,
  json_object(
    'product', p.product_id,
    'scene', json_object(
      'base_layer', p.base_layer_path || '?v=s' || p.scene_version,
      'width',  p.res_w,
      'height', p.res_h
    ),
    'regions', (
      SELECT json_group_array(json_object(
        'id',      pr.region_id,
        'label',   pr.label,
        'z',       pr.z_order,
        'default', pr.default_material_id,
        'groups', (
          SELECT json_group_array(json_object(
            'id',    mc.category_id,
            'label', mc.label,
            'type',  mc.type,
            'items', (
              SELECT json_group_array(json_object(
                'id',     mi.item_id,
                'label',  mi.item_label,
                'swatch', mi.swatch,
                'layer',  mi.layer
              ))
              FROM (
                SELECT * FROM v_manifest_item mi
                WHERE mi.product_id = pr.product_id
                  AND mi.region_id  = pr.region_id
                  AND mi.group_id   = mc.category_id
                ORDER BY mi.sort_label
              ) mi
            )
          ))
          FROM (
            SELECT mc.* FROM material_categories mc
            WHERE EXISTS (
              SELECT 1 FROM v_manifest_item mi
              WHERE mi.product_id = pr.product_id
                AND mi.region_id  = pr.region_id
                AND mi.group_id   = mc.category_id
            )
            ORDER BY mc.sort_order
          ) mc
        )
      ))
      FROM (
        SELECT * FROM product_regions pr
        WHERE pr.product_id = p.product_id
        ORDER BY pr.z_order
      ) pr
    )
  ) AS manifest_json
FROM products p
WHERE p.active = 1
ORDER BY p.product_id;
