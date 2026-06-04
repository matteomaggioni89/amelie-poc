#!/usr/bin/env python3
"""
inspect_blend.py — Estrae la struttura di un file .blend per la pipeline.
Va eseguito DENTRO Blender (usa il modulo bpy), non con python normale.

Uso (Windows, PowerShell), con percorsi tuoi:
  & "C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe" -b ^
    "C:\\Users\\matteomaggioni\\poc config\\blender\\talento.blend" ^
    -P "C:\\Users\\matteomaggioni\\poc config\\amelie-poc\\pipeline\\inspect_blend.py"

Oppure dalla scheda "Scripting" di Blender: apri talento.blend, incolla questo
file e premi Run. Scrive un JSON accanto al .blend: <nome>_scene.json
e ne stampa un riassunto nella console di sistema.
"""
import json
import os

try:
    import bpy
except ImportError:
    raise SystemExit("Questo script va eseguito dentro Blender (modulo bpy assente).")


def image_nodes(mat):
    """Per ogni texture: file, colorspace e a quale ingresso del Principled va."""
    out = []
    if not (mat.use_nodes and mat.node_tree):
        return out
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            dest = []
            for o in n.outputs:
                for link in o.links:
                    dest.append(f"{link.to_node.name}.{link.to_socket.name}")
            out.append({
                "file": bpy.path.abspath(n.image.filepath) if n.image.filepath else "(packed/no path)",
                "colorspace": getattr(n.image.colorspace_settings, "name", None),
                "feeds": dest,
            })
    return out


def mapping_scale(mat):
    """Scala dell'eventuale nodo Mapping (utile per la scala fisica in cm)."""
    if not (mat.use_nodes and mat.node_tree):
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'MAPPING':
            try:
                s = n.inputs['Scale'].default_value
                return [round(s[0], 4), round(s[1], 4), round(s[2], 4)]
            except Exception:
                return None
    return None


def collection_tree(coll):
    return {
        "name": coll.name,
        "objects": sorted(o.name for o in coll.objects),
        "children": [collection_tree(c) for c in coll.children],
    }


def main():
    scene = bpy.context.scene
    r = scene.render

    mesh_objects = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        mesh_objects.append({
            "name": obj.name,
            "collections": sorted(c.name for c in obj.users_collection),
            "dimensions_m": [round(d, 4) for d in obj.dimensions],  # bounding box reale (metri)
            "slots": [
                {"index": i, "material": (s.material.name if s.material else None)}
                for i, s in enumerate(obj.material_slots)
            ],
        })

    materials = []
    for mat in bpy.data.materials:
        if mat.users == 0:
            continue
        materials.append({
            "name": mat.name,
            "users": mat.users,
            "use_nodes": mat.use_nodes,
            "textures": image_nodes(mat),
            "mapping_scale": mapping_scale(mat),
        })

    data = {
        "blend_file": bpy.data.filepath,
        "active_scene": scene.name,
        "scenes": [s.name for s in bpy.data.scenes],
        "render": {
            "engine": r.engine,
            "resolution_x": r.resolution_x,
            "resolution_y": r.resolution_y,
            "resolution_percentage": r.resolution_percentage,
            "film_transparent": getattr(r, "film_transparent", None),
        },
        "active_camera": scene.camera.name if scene.camera else None,
        "cameras": sorted(o.name for o in bpy.data.objects if o.type == 'CAMERA'),
        "lights": [
            {"name": o.name, "type": o.data.type}
            for o in bpy.data.objects if o.type == 'LIGHT'
        ],
        "collections": [collection_tree(scene.collection)],
        "mesh_objects": mesh_objects,
        "materials": materials,
    }

    base = bpy.data.filepath or os.path.join(os.getcwd(), "untitled.blend")
    out_path = os.path.splitext(base)[0] + "_scene.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("\n================ RIASSUNTO SCENA ================")
    print(f"Scena attiva : {data['active_scene']}  (scene: {', '.join(data['scenes'])})")
    print(f"Render       : {data['render']['engine']} "
          f"{data['render']['resolution_x']}x{data['render']['resolution_y']} "
          f"@{data['render']['resolution_percentage']}%  "
          f"film_transparent={data['render']['film_transparent']}")
    print(f"Camera attiva: {data['active_camera']}  (camere: {', '.join(data['cameras']) or '—'})")
    print(f"Luci         : {len(data['lights'])}  "
          f"({', '.join(l['name'] for l in data['lights']) or '—'})")
    print(f"Oggetti mesh : {len(data['mesh_objects'])}")
    for o in data["mesh_objects"]:
        slots = ", ".join(f"[{s['index']}]{s['material']}" for s in o["slots"]) or "(nessuno slot)"
        print(f"   - {o['name']}  | coll: {', '.join(o['collections'])}  | {slots}")
    print(f"Materiali    : {len(data['materials'])}")
    for m in data["materials"]:
        print(f"   - {m['name']}  | texture: {len(m['textures'])}  | scale: {m['mapping_scale']}")
    print(f"\nJSON scritto in: {out_path}")
    print("=================================================\n")


if __name__ == "__main__":
    main()
