#!/usr/bin/env python3
"""Merge records_textures.json + records_audio.json -> assets-src/MANIFEST.md and public/assets/manifest.json.
usage: build_manifest.py PROJECT_ROOT"""
import json, os, subprocess, sys
root = sys.argv[1]
T = json.load(open(os.path.join(root, "assets-src/records_textures.json"))); A = json.load(open(os.path.join(root, "assets-src/records_audio.json")))
def size(p):
    o = subprocess.run(["identify", "-format", "%w %h", "jpeg:" + os.path.join(root, p)], capture_output=True, text=True).stdout.split()
    return [int(o[0]), int(o[1])]
items = []; mats = {}
for r in T:
    r["size"] = size(r["path"]); r["bytes"] = os.path.getsize(os.path.join(root, r["path"]))
    web = r["path"].replace("public/", "", 1)
    items.append({"id": r["id"], "path": web, "kind": "texture", "map": r["map"], "material": r["material"], "width": r["size"][0], "height": r["size"][1], "bytes": r["bytes"], "license": "CC0-1.0", "atlas": r["atlas"]})
    m = mats.setdefault(r["material"], {"title": r["title"], "atlas": r["atlas"], "maps": {}}); m["maps"][r["map"]] = web; m["size"] = r["size"]
for r in A:
    r["bytes"] = os.path.getsize(os.path.join(root, r["path"]))
    r["seconds"] = round(float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", os.path.join(root, r["path"])], capture_output=True, text=True).stdout.strip()), 2)
    items.append({"id": r["id"], "path": r["path"].replace("public/", "", 1), "kind": "audio", "category": r["subkind"], "seconds": r["seconds"], "loop": r["loop"], "bytes": r["bytes"], "license": "CC0-1.0", "note": r.get("note", "")})
total = sum(i["bytes"] for i in items)
man = {"root": "public/", "generated_by": "tools/assets/build_manifest.py", "total_bytes": total, "budget_bytes": 25_000_000,
       "notes": "Paths are relative to the site root (public/). All assets CC0 / public-domain; see assets-src/MANIFEST.md for sources. Normal maps are OpenGL (+Y up). Audio loop=true means the file is built to wrap seamlessly (tail crossfaded into head).",
       "materials": mats, "assets": items}
json.dump(man, open(os.path.join(root, "public/assets/manifest.json"), "w"), indent=1)
def esc(s): return str(s).replace("|", "\\|").replace("\n", " ")
L = []
L.append("# FOUNDRESS asset manifest\n")
L.append("All processed assets under `public/assets/` are derived from **CC0 1.0 / public-domain-dedicated** sources only. Raw downloads live in `assets-src/raw/<source>/` (not shipped). Processing scripts: `tools/assets/` (`fetch_polyhaven.py`, `fetch_ambientcg.sh`, `download_list.py` + `downloads.tsv`, `process_textures.py`, `process_audio.py`, `build_manifest.py`). Machine-readable list: `public/assets/manifest.json`.\n")
n_t = len(T); n_a = len(A)
L.append("Totals: %d texture files (%d materials), %d audio files, **%.2f MB** in `public/assets` (budget 25 MB; hosting cap 64 MB).\n" % (n_t, len(mats), n_a, total / 1e6))
L.append("## Licence verification notes\n")
L.append("- **Poly Haven** (polyhaven.com/license): \"Our assets are all licensed as CC0.\" Authors listed per asset via `api.polyhaven.com/info/<id>`.\n- **ambientCG** (docs.ambientcg.com/license): \"All ambientCG assets are provided under the Creative Commons CC0 1.0 Universal License.\" The asset pages do not name an individual author; credited as ambientCG.\n- **OpenGameArt**: every item was checked on its page for a `CC0` licence badge (one page, *Digging Underground*, offers several licences including CC0; CC0 is used). Authors are the uploader names shown on OGA; OGA cannot prove the uploader is the original recorder. The grasshopper clip is a trim of freesound.org/s/401939 (CC0, recorded by straget) as stated in its README.\n- **archive.org USC Sound Effect Archive (\"Red Library\", \"SSE Library\")**: the items carry `licenseurl = creativecommons.org/publicdomain/zero/1.0/`; item notes: digitised studio tapes provided by Craig Smith of USC, uploaded by an Internet Archive account. **Caveat (provenance tier B):** this is an uploader/archive assertion of CC0 over legacy studio effect libraries; the underlying rights chain is not documented. Used only where no better CC0 source was found (street/traffic/rain-heavy/crickets/mower/playground/broom/car/thud etc.). Files from these items are marked `provenance` in the `note` column. If the team wants a conservative posture, replace tier-B audio before any commercial release.\n- **Not reachable / not used:** freesound.org (HTTP 403 from the sandbox, API needs a key; the one Freesound clip used came via an OGA CC0 mirror), Wikimedia Commons (HTTP 429 rate limit on every attempt), kenney.nl (HTTP 403; the Kenney UI sounds come from Kenney's own CC0 upload on OpenGameArt).\n")
L.append("## Processing conventions\n")
L.append("- Textures: Lanczos resize (1024 for major, 512 for minor; atlases 1024 wide, leaf atlas 1024x512), metadata stripped. Albedo JPEG q82 4:2:0 (atlas q85); normal JPEG q86 4:4:4 (**OpenGL / +Y up**; Poly Haven `nor_gl`, ambientCG `NormalGL`); roughness 8-bit greyscale JPEG q80; atlas opacity = greyscale JPEG q80 (white = opaque). Sources are the 1K JPEG variants (already 1024 px), so no upscaling occurred. Normal quality was lowered from the brief's ~90 to 86 to keep the budget.\n- Audio: decoded with ffmpeg, excerpted, high-passed at 35 Hz (ambience beds use extra band-limits where stated), MP3 libmp3lame 96 kbps CBR, 44.1 kHz. Ambience: mono sources stay mono, stereo stay stereo; **loudness-normalised to -24 LUFS integrated** (underground rumble -26) with a safety limiter. SFX: mono, **peak-normalised to -3 dBFS** (loops -22 LUFS), leading silence trimmed, 4 ms fade-in and short fade-out. Loops (`loop: true`) are built as `[tail X-second equal-power crossfade into head] + body`, so the last sample flows into the first; crossfade X = 3 s (beds), 2 s (mowers), 4 s (rumble). MP3 has ~26 ms encoder delay; browsers that honour the LAME gapless tag loop cleanly, otherwise trim/crossfade at the Web Audio level or re-encode to Ogg/AAC.\n- **I cannot listen to audio in this environment.** Excerpts were chosen from titles, source descriptions, loudness/centroid analysis and spectrograms; each ambience bed's spectrogram was checked visually, but an ear check of every clip is still advisable.\n")
L.append("## Asset table\n")
L.append("| Output path | Title | Author | Source page | Direct download URL | Licence | Processing |\n|---|---|---|---|---|---|---|")
for r in T + A:
    title = r["title"] + ((" [" + r["note"] + "]") if r.get("note") else "")
    L.append("| `%s` | %s | %s | %s | %s | %s | %s |" % (r["path"], esc(title), esc(r["author"]), esc(r["source_page"]), esc(r["download_url"]), esc(r["license"]), esc(r["processing"])))
L.append("\n## Desired items NOT found under CC0 (synthesise procedurally) or only partly covered\n")
L.append("""| Desired item | Status | Detail |
|---|---|---|
| Wood gnaw (ant mandibles on wood) | **Not found** | No CC0 gnawing/chewing-wood recording located. `sfx/wood_rasp_01/02` are stand-ins (scrape/rasp on a wooden surface; 02 is sped up 25 %). Synthesise: filtered noise bursts at 8-25 Hz rate with a 1-4 kHz band-pass and tiny crackle impulses. |
| Rotten / decayed wood texture | **Partial** | `wood_decayed` (weathered, deeply cracked, grey timber) and `wood_mossy` (moss-covered planks) are the closest CC0 material; neither shows spongy brown-rot, fungal fruiting or punky grain. ambientCG `Wood036` was downloaded but rejected (blurry). Option: darken/desaturate + procedural cracks in the shader, or hand-paint a detail overlay. |
| Wind in leaves (distinct rustle) | **Partial** | `wind_leaves` is a park wind bed with gusts (OGA, Thimras); it has little leaf-rustle texture. A 20-rustles-of-dry-leaves pack (qubodup, CC0, `.7z`) exists on OGA (.7z archive; not fetched because 7-Zip is not installed here). Synthesise: band-passed (2-6 kHz) noise with stochastic amplitude grains over the wind bed. |
| Playground / children distant | Found (tier B) | `playground_distant` from the USC SSE library (children voices at play, low-passed). Contains audible children's voices in the far field; replace with a voice-less synthetic "distant crowd murmur" if voices are undesirable. |
| Heavy water-on-leaf / drip variety | Minimal | Only two drip excerpts (`water_drip_01/02`) from one source. |
| Giant footstep (heavy thud) | **Approximate** | Made from sandbag/hollow-wood impacts, low-passed and bass-boosted; no CC0 dedicated "huge footstep" found. Layer with `underground_rumble` or synthesise a sine-sweep + noise burst. |
| Insect wing buzz | **Unverified** | `insect_wing_buzz_01` comes from a clip titled "Buzzing Sound" (not confirmed as a fly) and `_02` from a bee swarm. For a single fly/wasp synthesise a 150-300 Hz sawtooth with FM jitter. |
| Underground rumble | **Approximate** | An engine-rumble effect, low-passed at 320 Hz (no CC0 earth/cave tone found). Synthesise: brown noise < 120 Hz + slow 0.05 Hz modulation. |
| Short cricket chirp | Found (tier B) | Excerpts of a two-cricket recording; `stridulation_grasshopper_01` (CC0 Freesound clip) offers a different stridulation. |
| Grass-blade atlas | Found | `grass_blades_atlas` (ambientCG Foliage008, single-blade scan with opacity); individual blades are separate quads. |
| Autumn/dry fallen leaves | Found | `leaf_atlas_maple` (non-square 1024x512 sheet) and `leaf_atlas_oak_dry`; the oak sheet's colour map has heavy blurred colour bleed outside the leaf shapes - rely on the opacity map. |
| Freesound / Wikimedia / Kenney.nl originals | Not reachable | See licence notes. Real field-recording gaps (daytime birdsong beyond two clips, true leaf rustle) would best be filled by a person with a Freesound API key: filter `license:"Creative Commons 0"`. |
""")
L.append("\n## Other caveats\n")
L.append("""- Soil/humus/gravel/sand colours differ in white balance (sand is yellow-brown, gravel is cold grey); grade in the material or splat shader if a unified palette is wanted.
- `rubber_playground` (red) comes from an athletics track scan; `rubber_black` is the tyre/gym-mat stand-in.
- `metal_painted` is flaking grey paint over rust (strong, high-contrast); `metal_galvanised` is corrugated steel (ridges tile vertically).
- Leaf/foliage atlases are not tileable; they are intended for cut-out cards. `leaf_atlas_maple` is 2:1.
- Raw sources are kept in `assets-src/raw/` (~620 MB, not part of the 25 MB budget; add to `.gitignore` or Git LFS if the repo should stay small).
""")
open(os.path.join(root, "assets-src/MANIFEST.md"), "w").write("\n".join(L))
print("total", total, "MB", total / 1e6, "items", len(items))
