#!/usr/bin/env python3
"""
Mini web-admin (senza dipendenze) per la libreria materiali.
Avvio:
    python3 admin.py            # poi apri http://localhost:8765
Scrive direttamente in pim.db (categorie, materiali, mappe).
Dopo le modifiche, lancia `python3 build.py` per rigenerare manifest e job.
"""
import json, os, sqlite3, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)               # repo root: serve swatches/ textures/
DB = os.path.join(HERE, "pim.db")
PORT = 8765

# tipi di map standard (idempotente: garantisce i menu' a tendina)
MAP_TYPES = [
    ("base_color", "Base Color / Albedo", "sRGB", 0),
    ("roughness", "Roughness", "Non-Color", 0),
    ("metallic", "Metallic", "Non-Color", 0),
    ("normal", "Normal", "Non-Color", 1),
    ("bump", "Bump / Height", "Non-Color", 1),
    ("ao", "Ambient Occlusion", "Non-Color", 0),
    ("displacement", "Displacement", "Non-Color", 1),
    ("opacity", "Opacity / Alpha", "Non-Color", 0),
    ("emission", "Emission", "sRGB", 0),
    ("specular", "Specular", "Non-Color", 0),
    ("sheen", "Sheen", "Non-Color", 0),
    ("clearcoat", "Clearcoat", "Non-Color", 0),
    ("transmission", "Transmission", "Non-Color", 0),
    ("subsurface", "Subsurface", "Non-Color", 0),
]


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON;")
    return con


def ensure_db():
    """Crea il DB dallo schema se manca; garantisce le righe di map_types."""
    if not os.path.exists(DB):
        con = sqlite3.connect(DB)
        with open(os.path.join(HERE, "schema.sql"), encoding="utf-8") as f:
            con.executescript(f.read())
        con.commit(); con.close()
        print(f"[admin] creato DB vuoto: {DB}")
    con = db()
    con.executemany(
        "INSERT OR IGNORE INTO map_types(map_type,label,colorspace,uses_strength) VALUES(?,?,?,?)",
        MAP_TYPES)
    con.commit(); con.close()


def bootstrap():
    con = db()
    cats = [dict(r) for r in con.execute(
        "SELECT * FROM material_categories ORDER BY sort_order, category_id")]
    mtypes = [dict(r) for r in con.execute(
        "SELECT * FROM map_types ORDER BY rowid")]
    mats = [dict(r) for r in con.execute(
        "SELECT * FROM materials ORDER BY category_id, material_id")]
    maps = {}
    for r in con.execute("SELECT * FROM material_maps ORDER BY material_id, map_type"):
        maps.setdefault(r["material_id"], []).append(dict(r))
    con.close()
    for m in mats:
        m["maps"] = maps.get(m["material_id"], [])
    return {"categories": cats, "map_types": mtypes, "materials": mats}


def upsert_category(d):
    con = db()
    con.execute("""INSERT INTO material_categories(category_id,label,type,sort_order)
                   VALUES(:category_id,:label,:type,:sort_order)
                   ON CONFLICT(category_id) DO UPDATE SET
                     label=excluded.label, type=excluded.type, sort_order=excluded.sort_order""",
                {"category_id": d["category_id"], "label": d["label"], "type": d["type"],
                 "sort_order": int(d.get("sort_order") or 0)})
    con.commit(); con.close()


def delete_category(cid):
    con = db(); con.execute("DELETE FROM material_categories WHERE category_id=?", (cid,))
    con.commit(); con.close()


def upsert_material(d):
    def num(v):
        return None if v in (None, "") else float(v)
    con = db()
    con.execute("""INSERT INTO materials
        (material_id,label,category_id,type,color_ref,tile_width_cm,tile_height_cm,
         tileable,swatch_path,blender_asset,version,active)
        VALUES(:material_id,:label,:category_id,:type,:color_ref,:tw,:th,:tileable,
               :swatch_path,:blender_asset,:version,:active)
        ON CONFLICT(material_id) DO UPDATE SET
          label=excluded.label, category_id=excluded.category_id, type=excluded.type,
          color_ref=excluded.color_ref, tile_width_cm=excluded.tile_width_cm,
          tile_height_cm=excluded.tile_height_cm, tileable=excluded.tileable,
          swatch_path=excluded.swatch_path, blender_asset=excluded.blender_asset,
          version=excluded.version, active=excluded.active""",
        {"material_id": d["material_id"], "label": d["label"], "category_id": d["category_id"],
         "type": d["type"], "color_ref": d.get("color_ref") or None,
         "tw": num(d.get("tile_width_cm")), "th": num(d.get("tile_height_cm")),
         "tileable": int(d.get("tileable", 1)), "swatch_path": d.get("swatch_path") or "",
         "blender_asset": d.get("blender_asset") or "",
         "version": int(d.get("version") or 1), "active": int(d.get("active", 1))})
    con.commit(); con.close()


def delete_material(mid):
    con = db(); con.execute("DELETE FROM materials WHERE material_id=?", (mid,))
    con.commit(); con.close()


def upsert_map(d):
    con = db()
    con.execute("""INSERT INTO material_maps(material_id,map_type,file_path,strength)
                   VALUES(:material_id,:map_type,:file_path,:strength)
                   ON CONFLICT(material_id,map_type) DO UPDATE SET
                     file_path=excluded.file_path, strength=excluded.strength""",
                {"material_id": d["material_id"], "map_type": d["map_type"],
                 "file_path": d["file_path"], "strength": float(d.get("strength") or 1.0)})
    con.commit(); con.close()


def delete_map(mid, mtype):
    con = db()
    con.execute("DELETE FROM material_maps WHERE material_id=? AND map_type=?", (mid, mtype))
    con.commit(); con.close()


ROUTES_POST = {
    "/api/category": upsert_category,
    "/api/material": upsert_material,
    "/api/map": upsert_map,
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _file(self, path, ctype):
        try:
            with open(path, "rb") as f:
                self._send(200, f.read(), ctype)
        except FileNotFoundError:
            self._send(404, b"not found", "text/plain")

    def log_message(self, *a):  # silenzia il log di default
        pass

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/index.html"):
            return self._file(os.path.join(HERE, "admin.html"), "text/html; charset=utf-8")
        if u.path == "/api/bootstrap":
            return self._send(200, bootstrap())
        # static dal repo root (swatch / texture preview), con guardia anti path-traversal
        if u.path.startswith(("/swatches/", "/textures/", "/layers/")):
            p = os.path.normpath(os.path.join(ROOT, u.path.lstrip("/")))
            if p.startswith(ROOT):
                ext = os.path.splitext(p)[1].lower()
                ctype = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                         ".webp": "image/webp"}.get(ext, "application/octet-stream")
                return self._file(p, ctype)
        return self._send(404, {"ok": False, "error": "not found"})

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def do_POST(self):
        u = urlparse(self.path)
        fn = ROUTES_POST.get(u.path)
        if not fn:
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            fn(self._body())
            return self._send(200, {"ok": True})
        except sqlite3.IntegrityError as e:
            return self._send(400, {"ok": False, "error": "Vincolo violato: " + str(e)})
        except Exception as e:
            return self._send(400, {"ok": False, "error": str(e)})

    def do_DELETE(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path == "/api/category":
                delete_category(q["id"][0])
            elif u.path == "/api/material":
                delete_material(q["id"][0])
            elif u.path == "/api/map":
                delete_map(q["material_id"][0], q["map_type"][0])
            else:
                return self._send(404, {"ok": False, "error": "not found"})
            return self._send(200, {"ok": True})
        except sqlite3.IntegrityError as e:
            return self._send(400, {"ok": False, "error": "In uso, non eliminabile: " + str(e)})
        except Exception as e:
            return self._send(400, {"ok": False, "error": str(e)})


def main():
    ensure_db()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://localhost:{PORT}"
    print(f"[admin] DB: {DB}")
    print(f"[admin] aperto su {url}  (Ctrl-C per fermare)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[admin] stop")


if __name__ == "__main__":
    main()
