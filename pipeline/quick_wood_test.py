#!/usr/bin/env python3
"""
quick_wood_test.py — TEST RAPIDO (nessun DB): fa scorrere le texture-legno di
una cartella sul materiale del tavolo Talento e renderizza un PNG per ciascuna.

Eseguire DENTRO Blender (scheda Scripting -> Run, oppure blender -b ... -P ...).

Di default prova ad AUTO-rilevare il materiale-legno. Se non riesce (o se ci
sono piu' materiali con texture) stampa l'elenco e si ferma: in quel caso
imposta MATERIAL_NAME (o OBJECT_NAME) qui sotto e rilancia.
"""
import os
try:
    import bpy
except ImportError:
    raise SystemExit("Va eseguito dentro Blender (modulo bpy assente).")

# ============================ CONFIG ============================
TEXTURE_DIR  = r"C:\Users\matteomaggioni\poc config\textures\LEGNI ALPI"

MATERIAL_NAME = ""    # forza il materiale da modificare (vuoto = auto-rileva)
OBJECT_NAME   = ""    # in alternativa: oggetto del tavolo...
SLOT_INDEX    = 0     # ...e quale suo slot materiale

OUT_DIR     = ""      # vuoto = sottocartella "render_test" accanto al .blend
TRANSPARENT = True    # sfondo trasparente (come i layer del configuratore)
SAMPLES     = 0       # 0 = invariato; es. 64 per render piu' veloci (Cycles)
IMAGE_EXTS  = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".exr")
# ================================================================


def list_textures():
    if not os.path.isdir(TEXTURE_DIR):
        return []
    return sorted(f for f in os.listdir(TEXTURE_DIR)
                  if f.lower().endswith(IMAGE_EXTS))


def textured_materials():
    """Materiali (usati da mesh) che contengono almeno un nodo immagine."""
    found = {}
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for s in o.material_slots:
            m = s.material
            if m and m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
                found.setdefault(m.name, m)
    return found


def basecolor_node(mat):
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf:
        inp = bsdf.inputs.get('Base Color')
        if inp and inp.is_linked:
            src = inp.links[0].from_node
            if src.type == 'TEX_IMAGE':
                return src
    return next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)


def resolve_material():
    if MATERIAL_NAME:
        return bpy.data.materials.get(MATERIAL_NAME)
    if OBJECT_NAME:
        o = bpy.data.objects.get(OBJECT_NAME)
        if o and SLOT_INDEX < len(o.material_slots):
            return o.material_slots[SLOT_INDEX].material
        return None
    cand = textured_materials()
    return list(cand.values())[0] if len(cand) == 1 else None


def discover(textures):
    print("\n===== SCOPERTA =====")
    print(f"Cartella texture: {TEXTURE_DIR}")
    print(f"  texture trovate: {len(textures)}")
    for t in textures:
        print(f"    - {t}")
    print("Materiali con texture (candidati per il legno):")
    for name in textured_materials():
        print(f"    - {name}")
    print("Oggetti mesh e slot:")
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        slots = ", ".join(f"[{i}]{s.material.name if s.material else None}"
                          for i, s in enumerate(o.material_slots)) or "(nessuno slot)"
        print(f"    - {o.name}: {slots}")
    print("Imposta MATERIAL_NAME (o OBJECT_NAME) e rilancia.\n====================\n")


def main():
    textures = list_textures()
    if not textures:
        print(f"ERRORE: nessuna immagine in '{TEXTURE_DIR}'. Controlla il percorso.")
        return

    mat = resolve_material()
    if not mat:
        print("Non sono riuscito a scegliere il materiale-legno da solo.")
        discover(textures)
        return

    node = basecolor_node(mat)
    if not node:
        print(f"ERRORE: nel materiale '{mat.name}' non c'e' un nodo Image Texture.")
        return

    scene = bpy.context.scene
    scene.render.film_transparent = TRANSPARENT
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if TRANSPARENT else 'RGB'
    if SAMPLES and scene.render.engine == 'CYCLES':
        scene.cycles.samples = SAMPLES

    base = bpy.data.filepath or os.path.join(os.getcwd(), "untitled.blend")
    out_dir = OUT_DIR or os.path.join(os.path.dirname(base), "render_test")
    os.makedirs(out_dir, exist_ok=True)

    print(f"\nMateriale: '{mat.name}'  | nodo immagine: '{node.name}'  -> {out_dir}")
    for i, fname in enumerate(textures, 1):
        path = os.path.join(TEXTURE_DIR, fname)
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = 'sRGB'   # base color = sRGB
        node.image = img
        stem = os.path.splitext(fname)[0].replace(" ", "_")
        scene.render.filepath = os.path.join(out_dir, f"talento__{stem}.png")
        print(f"   [{i}/{len(textures)}] render {fname} ...")
        bpy.ops.render.render(write_still=True)

    print(f"\nFatto: {len(textures)} render in {out_dir}\nApri i PNG per confrontare le finiture.\n")


if __name__ == "__main__":
    main()
