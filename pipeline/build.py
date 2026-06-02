#!/usr/bin/env python3
"""
Compila il DB PIM portable (SQLite) da schema.sql + seed, lo valida e
genera gli artefatti derivati: manifest runtime per prodotto e lista job.

Uso:
  python3 build.py [--db amelie_pim.db] [--seed seed_amelie.sql]

Output (in pipeline/out/):
  manifest_<product>.json   - manifest runtime a N regioni (per il frontend)
  render_jobs.csv           - 1 riga per layer da renderizzare (per la farm)
"""
import argparse, csv, hashlib, json, os, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run_script(con, path):
    with open(os.path.join(HERE, path), encoding="utf-8") as f:
        con.executescript(f.read())


def build(db_path, seed):
    if os.path.exists(db_path):
        os.remove(db_path)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON;")
    run_script(con, "schema.sql")
    run_script(con, seed)
    con.commit()
    return con


def validate(con):
    problems = list(con.execute("PRAGMA foreign_key_check;"))
    if problems:
        print("ERRORE: foreign_key_check ha trovato righe orfane:", problems)
        sys.exit(1)
    # ogni regione deve avere almeno un materiale ammesso
    empty = con.execute("""
        SELECT pr.product_id, pr.region_id
        FROM product_regions pr
        WHERE NOT EXISTS (SELECT 1 FROM v_product_region_material v
                          WHERE v.product_id=pr.product_id AND v.region_id=pr.region_id)
    """).fetchall()
    if empty:
        print("ATTENZIONE: regioni senza materiali ammessi:", empty)
    # il default di ogni regione deve essere tra i materiali ammessi
    bad_default = con.execute("""
        SELECT pr.product_id, pr.region_id, pr.default_material_id
        FROM product_regions pr
        WHERE pr.default_material_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM v_product_region_material v
                          WHERE v.product_id=pr.product_id AND v.region_id=pr.region_id
                            AND v.material_id=pr.default_material_id)
    """).fetchall()
    if bad_default:
        print("ATTENZIONE: default non tra i materiali ammessi:", bad_default)
    # check occlusione mutua tra regioni dinamiche (vincolo additivo, punto 4A)
    mutual = con.execute("""
        SELECT a.product_id, a.region_id, b.region_id
        FROM product_regions a JOIN product_regions b
          ON a.product_id=b.product_id AND a.occluded_by=b.region_id
        WHERE b.occluded_by = a.region_id
    """).fetchall()
    if mutual:
        print("ATTENZIONE: occlusione mutua (va pre-composta, non additiva):", mutual)


def export_manifests(con, out_dir):
    sql = open(os.path.join(HERE, "manifest_query.sql"), encoding="utf-8").read()
    n = 0
    for product_id, manifest_json in con.execute(sql):
        obj = json.loads(manifest_json)  # valida che sia JSON ben formato
        path = os.path.join(out_dir, f"manifest_{product_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        n += 1
        print(f"  manifest_{product_id}.json  ({len(obj['regions'])} regioni)")
    return n


def export_jobs(con, out_dir):
    rows = con.execute("""
        SELECT product_id, region_id, material_id, scene_file, camera,
               res_w, res_h, collection, material_slot, z_order,
               blender_asset, out_path, hash_input, cache_token
        FROM v_render_jobs
        ORDER BY product_id, z_order, material_id
    """).fetchall()
    cols = [d[0] for d in con.execute("SELECT * FROM v_render_jobs LIMIT 0").description]
    path = os.path.join(out_dir, "render_jobs.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols + ["key_sha1"])
        for r in rows:
            d = dict(zip(cols, r))
            key = hashlib.sha1(d["hash_input"].encode()).hexdigest()[:12]
            w.writerow(list(r) + [key])
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(HERE, "amelie_pim.db"))
    ap.add_argument("--seed", default="seed_amelie.sql")
    args = ap.parse_args()

    con = build(args.db, args.seed)
    validate(con)

    out_dir = os.path.join(HERE, "out")
    os.makedirs(out_dir, exist_ok=True)

    print(f"DB:        {args.db}")
    for tbl in ("materials", "products", "product_regions"):
        c = con.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
        print(f"  {tbl}: {c}")
    print("Manifest:")
    nm = export_manifests(con, out_dir)
    nj = export_jobs(con, out_dir)
    print(f"Job di render (layer): {nj}  -> out/render_jobs.csv")
    print(f"Manifest generati: {nm}  -> out/manifest_*.json")
    con.close()


if __name__ == "__main__":
    main()
