#!/usr/bin/env python3
"""
quick_wood_test.py — TEST RAPIDO (nessun DB): applica una serie di materiali
"legno" a una parte del tavolo Talento e renderizza un PNG per ciascuno.

Eseguire DENTRO Blender (scheda Scripting -> Run, oppure blender -b ... -P ...).

COME USARLO
  1) Lancialo una prima volta SENZA configurare nulla: stampa l'elenco di
     oggetti mesh (con i loro slot materiale) e dei materiali presenti, poi esce.
  2) Compila il blocco CONFIG qui sotto con i nomi giusti e rilancialo.
"""
import os
try:
    import bpy
except ImportError:
    raise SystemExit("Va eseguito dentro Blender (modulo bpy assente).")

# ======================= CONFIG (compila questi) =======================
TABLE_OBJECT = ""        # nome dell'oggetto la cui finitura cambia (es. "Piano").
                          # Lascia "" per la modalita' SCOPERTA (elenca e esce).
SLOT_INDEX   = 0          # quale slot materiale dell'oggetto sostituire.

# I materiali-legno da provare. Devono ESSERE i nomi dei materiali:
#  - gia' presenti in talento.blend, OPPURE
#  - presenti nel file LIBRARY_BLEND qui sotto (verranno importati).
WOODS = ["10_41", "10_32", "10_16", "10_74", "11_05", "11_06", "l22_231z"]

LIBRARY_BLEND = r""       # es: r"C:\Users\matteomaggioni\poc config\blender\amelie.blend"
                          # Lascia "" se i materiali sono gia' dentro talento.blend.

OUT_DIR     = r""         # cartella output PNG. Lascia "" = sottocartella "render_test"
                          # accanto al .blend.
TRANSPARENT = True        # sfondo trasparente (come i layer del configuratore).
SAMPLES     = 0           # 0 = lascia invariato; es. 64 per un test piu' veloce.
# =======================================================================


def discover():
    print("\n===== SCOPERTA (configura poi TABLE_OBJECT/WOODS e rilancia) =====")
    print("Oggetti mesh e relativi slot materiale:")
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        slots = ", ".join(f"[{i}]{s.material.name if s.material else None}"
                          for i, s in enumerate(o.material_slots)) or "(nessuno slot)"
        print(f"   - {o.name}: {slots}")
    print("Materiali presenti nel file:")
    for m in bpy.data.materials:
        if m.users:
            print(f"   - {m.name}")
    print("=================================================================\n")


def get_material(name):
    """Restituisce il materiale: dal file corrente o importato da LIBRARY_BLEND."""
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    if LIBRARY_BLEND:
        with bpy.data.libraries.load(LIBRARY_BLEND, link=False) as (src, dst):
            if name in src.materials:
                dst.materials = [name]
        if name in bpy.data.materials:
            return bpy.data.materials[name]
    return None


def main():
    if not TABLE_OBJECT:
        discover()
        return

    obj = bpy.data.objects.get(TABLE_OBJECT)
    if not obj:
        print(f"ERRORE: oggetto '{TABLE_OBJECT}' non trovato. Usa la modalita' scoperta.")
        return
    if SLOT_INDEX >= len(obj.material_slots):
        print(f"ERRORE: lo slot {SLOT_INDEX} non esiste su '{TABLE_OBJECT}' "
              f"(slot disponibili: {len(obj.material_slots)}).")
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

    print(f"\nOggetto: {TABLE_OBJECT}  slot {SLOT_INDEX}  -> {out_dir}")
    done, skipped = 0, []
    for w in WOODS:
        mat = get_material(w)
        if not mat:
            skipped.append(w)
            print(f"   ! '{w}' non trovato (ne' nel file ne' in LIBRARY_BLEND) - salto")
            continue
        obj.material_slots[SLOT_INDEX].material = mat
        scene.render.filepath = os.path.join(out_dir, f"talento__{w}.png")
        print(f"   render: {w} ...")
        bpy.ops.render.render(write_still=True)
        done += 1

    print(f"\nFatto: {done} render in {out_dir}")
    if skipped:
        print(f"Saltati (materiale non trovato): {', '.join(skipped)}")
    print("Apri i PNG per confrontare le finiture.\n")


if __name__ == "__main__":
    main()
