#!/usr/bin/env python3
"""Process raw CC0 textures into public/assets/textures/<id>/{albedo,normal,rough[,opacity]}.jpg and write assets-src/records_textures.json.
usage: process_textures.py PROJECT_ROOT   (uses ImageMagick `convert`; every input is forced to the jpeg: decoder)"""
import json, os, subprocess, sys
root = sys.argv[1]
RAW = os.path.join(root, "assets-src/raw"); OUT = os.path.join(root, "public/assets/textures")
# id, source, source id, size, title-use, atlas?
T = [
 ("soil_garden", "ph", "farm_soil", 1024, "Garden soil / loam"),
 ("humus_forest", "ph", "forest_ground_04", 1024, "Forest floor humus with grit"),
 ("leaf_litter", "ph", "leaves_forest_ground", 1024, "Forest leaf-litter ground"),
 ("sand_playground", "ph", "playground_sand", 1024, "Playground / sandbox sand"),
 ("gravel_fine", "ph", "gravel_floor_02", 1024, "Fine grey gravel"),
 ("moss", "acg", "Moss001", 1024, "Moss carpet"),
 ("bark_oak", "ph", "bark_brown_01", 1024, "Tree bark (deep-furrowed, oak-like)"),
 ("bark_pine", "ph", "pine_bark", 1024, "Tree bark (plated pine bark)"),
 ("wood_decayed", "ph", "rough_wood", 512, "Weathered cracked decayed timber"),
 ("wood_mossy", "ph", "moss_wood", 512, "Moss-covered rotting planks"),
 ("wood_floor", "ph", "wood_floor_worn", 1024, "Worn wooden floor planks"),
 ("wood_furniture", "ph", "kitchen_wood", 512, "Kitchen / furniture wood"),
 ("concrete_paving", "ph", "concrete_pavement", 1024, "Concrete paving slabs with joints"),
 ("paver_interlock", "ph", "concrete_pavers", 512, "Interlocking concrete pavers"),
 ("asphalt", "ph", "asphalt_02", 1024, "Cracked asphalt"),
 ("brick", "ph", "red_brick", 1024, "Red brick wall"),
 ("plaster_wall", "ph", "painted_plaster_wall", 512, "Painted plaster wall"),
 ("tile_ceramic", "acg", "Tiles133B", 512, "White ceramic kitchen tiles (dirty)"),
 ("rubber_playground", "ph", "rubberized_track", 512, "Rubberised playground / track surface"),
 ("rubber_black", "acg", "Rubber001", 512, "Black rubber (tyre / gym mat)"),
 ("metal_painted", "acg", "PaintedMetal014", 512, "Painted metal, flaking paint over rust"),
 ("metal_galvanised", "ph", "corrugated_iron_02", 512, "Galvanised corrugated steel"),
 ("leaf_atlas_maple", "acg", "LeafSet028", 1024, "Fallen autumn leaves atlas (with opacity)", True),
 ("leaf_atlas_oak_dry", "acg", "LeafSet030", 1024, "Dry fallen leaves atlas (with opacity)", True),
 ("grass_blades_atlas", "acg", "Foliage008", 1024, "Grass-blade atlas (with opacity)", True),
]
def run(*a): subprocess.run(list(a), check=True)
recs = []
for row in T:
    mid, src, sid, size, title = row[:5]; atlas = len(row) > 5
    d = os.path.join(OUT, mid); os.makedirs(d, exist_ok=True)
    if src == "ph":
        b = os.path.join(RAW, "polyhaven", sid)
        paths = {"albedo": b + "/diff.jpg", "normal": b + "/nor.jpg", "rough": b + "/rough.jpg"}
        info = json.load(open(b + "/info.json"))
        authors = ", ".join(info["authors"].keys())
        page = "https://polyhaven.com/a/" + sid
        base = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/%s/%s_" % (sid, sid)
        urls = {"albedo": base + "diff_1k.jpg", "normal": base + "nor_gl_1k.jpg", "rough": base + "rough_1k.jpg"}
        title_full = info["name"] + " - " + title
        lic = "CC0 1.0 (https://polyhaven.com/license)"
    else:
        b = os.path.join(RAW, "ambientcg", sid)
        paths = {"albedo": b + "/%s_1K-JPG_Color.jpg" % sid, "normal": b + "/%s_1K-JPG_NormalGL.jpg" % sid, "rough": b + "/%s_1K-JPG_Roughness.jpg" % sid}
        if atlas: paths["opacity"] = b + "/%s_1K-JPG_Opacity.jpg" % sid
        info = json.load(open(b + "/info.json"))["foundAssets"][0]
        authors = "ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page)"
        page = "https://ambientcg.com/a/" + sid
        z = "https://ambientcg.com/get?file=%s_1K-JPG.zip" % sid
        urls = {k: z + " (member " + os.path.basename(v) + ")" for k, v in paths.items()}
        title_full = info["displayName"] + " - " + title
        lic = "CC0 1.0 (https://docs.ambientcg.com/license/)"
    for kind, p in paths.items():
        if not os.path.exists(p):
            print("missing", mid, kind); continue
        outp = os.path.join(d, {"albedo": "albedo", "normal": "normal", "rough": "rough", "opacity": "opacity"}[kind] + ".jpg")
        sz = "%dx%d!" % (size, size) if not (atlas and mid == "leaf_atlas_maple") else "%dx%d!" % (size, size // 2)
        if kind == "albedo":
            args = ["-quality", "85" if atlas else "82", "-sampling-factor", "4:2:0"]; proc = "resize to %s, JPEG q%s 4:2:0, metadata stripped" % (sz.rstrip("!"), "85" if atlas else "82")
        elif kind == "normal":
            args = ["-quality", "86", "-sampling-factor", "4:4:4"]; proc = "resize to %s, OpenGL-convention (+Y up) normal map kept, JPEG q86 4:4:4" % sz.rstrip("!")
        else:
            args = ["-colorspace", "Gray", "-quality", "80"]; proc = "resize to %s, converted to 8-bit greyscale, JPEG q80" % sz.rstrip("!")
            if kind == "opacity": proc = proc.replace("JPEG q80", "JPEG q80 (alpha/opacity mask; white=opaque)")
        run("convert", "jpeg:" + p, "-auto-orient", "-filter", "Lanczos", "-resize", sz, "-strip", "-depth", "8", *args, "jpeg:" + outp)
        recs.append({"id": "tex/%s/%s" % (mid, kind), "path": "public/assets/textures/%s/%s.jpg" % (mid, os.path.basename(outp)[:-4]),
                     "kind": "texture", "map": kind, "material": mid, "title": title_full, "author": authors, "source_page": page,
                     "download_url": urls[kind], "license": lic, "processing": proc, "bytes": os.path.getsize(outp), "atlas": atlas})
json.dump(recs, open(os.path.join(root, "assets-src/records_textures.json"), "w"), indent=1)
tot = sum(r["bytes"] for r in recs); print(len(recs), "files", tot / 1e6, "MB")
