# FOUNDRESS credits

This file lists every third-party file or package that the portable build ships: textures, audio, fonts and code libraries. It was written on 2026-11-18 from the repository at commit `fb15f3d`, by reading these records:

- `assets-src/records_textures.json` and `assets-src/records_audio.json`: one record per shipped asset file (author, source page, licence string, processing).
- `assets-src/MANIFEST.md`: the licence notes made when the assets were collected, and the processing steps.
- `public/assets/CREDITS.md` and `public/assets/manifest.json`: the credits that go into the build.
- `tools/build/config.mjs` (`SOFTWARE_LICENCES`), `src/ui/styles/fonts.ts` and `package.json`: the libraries and fonts.
- `node_modules/<package>/LICENSE`: the licence text of each package, copied into the build's own `CREDITS.md` by `tools/build/credits.mjs`.

`docs/CREDITS-AUDIT.md` says how each entry was checked and lists the entries whose source cannot be shown from the repository. Nothing was fetched from the network to write either file. The audio section was rewritten on 2026-11-18 after the provenance pass (original sounds replaced the archive.org and second-hand files).

The game's own code, its procedural ant and creature models, the icon set (`src/ui/icons/paths.ts`), the synthesised sound recipes (`src/audio/`), the 36 rendered sound files (`tools/audio/`) and the text are original work of this project.

## Textures

The portable build ships 19 texture sets (78 files in the source tree; the build leaves out six sets that no code references: `leaf_litter`, `bark_pine`, `wood_mossy`, `concrete_paving`, `paver_interlock`, `metal_galvanised`). All sets are resized and re-encoded copies; the maps are albedo, normal, roughness and, for the atlases, opacity. Each record gives the licence as stated on the source site: CC0 1.0.

| Material id | Maps | Work | Author | Source page | Licence as recorded |
|---|---|---|---|---|---|
| `soil_garden` | albedo, normal, rough | Farm Soil - Garden soil / loam | Amal Kumar | https://polyhaven.com/a/farm_soil | CC0 1.0 (https://polyhaven.com/license) |
| `humus_forest` | albedo, normal, rough | Forest Ground 04 - Forest floor humus with grit | Rob Tuytel, Rico Cilliers | https://polyhaven.com/a/forest_ground_04 | CC0 1.0 (https://polyhaven.com/license) |
| `sand_playground` | albedo, normal, rough | Playground Sand - Playground / sandbox sand | eye-candy.xyz | https://polyhaven.com/a/playground_sand | CC0 1.0 (https://polyhaven.com/license) |
| `gravel_fine` | albedo, normal, rough | Gravel Floor 02 - Fine grey gravel | Jenelle van Heerden, Dimitrios Savva | https://polyhaven.com/a/gravel_floor_02 | CC0 1.0 (https://polyhaven.com/license) |
| `moss` | albedo, normal, rough | Moss 001 - Moss carpet | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/Moss001 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `bark_oak` | albedo, normal, rough | Bark Brown 01 - Tree bark (deep-furrowed, oak-like) | Rob Tuytel | https://polyhaven.com/a/bark_brown_01 | CC0 1.0 (https://polyhaven.com/license) |
| `wood_decayed` | albedo, normal, rough | Rough Wood - Weathered cracked decayed timber | Rob Tuytel | https://polyhaven.com/a/rough_wood | CC0 1.0 (https://polyhaven.com/license) |
| `wood_floor` | albedo, normal, rough | Wood Floor Worn - Worn wooden floor planks | Dimitrios Savva | https://polyhaven.com/a/wood_floor_worn | CC0 1.0 (https://polyhaven.com/license) |
| `wood_furniture` | albedo, normal, rough | Kitchen Wood - Kitchen / furniture wood | Rob Tuytel | https://polyhaven.com/a/kitchen_wood | CC0 1.0 (https://polyhaven.com/license) |
| `asphalt` | albedo, normal, rough | Asphalt 02 - Cracked asphalt | Rob Tuytel | https://polyhaven.com/a/asphalt_02 | CC0 1.0 (https://polyhaven.com/license) |
| `brick` | albedo, normal, rough | Red Brick - Red brick wall | Rob Tuytel | https://polyhaven.com/a/red_brick | CC0 1.0 (https://polyhaven.com/license) |
| `plaster_wall` | albedo, normal, rough | Painted Plaster Wall - Painted plaster wall | Amal Kumar | https://polyhaven.com/a/painted_plaster_wall | CC0 1.0 (https://polyhaven.com/license) |
| `tile_ceramic` | albedo, normal, rough | Tiles 133 B - White ceramic kitchen tiles (dirty) | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/Tiles133B | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `rubber_playground` | albedo, normal, rough | Rubberized Track - Rubberised playground / track surface | Charlotte Baglioni | https://polyhaven.com/a/rubberized_track | CC0 1.0 (https://polyhaven.com/license) |
| `rubber_black` | albedo, normal, rough | Rubber 001 - Black rubber (tyre / gym mat) | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/Rubber001 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `metal_painted` | albedo, normal, rough | Painted Metal 014 - Painted metal, flaking paint over rust | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/PaintedMetal014 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `leaf_atlas_maple` | albedo, normal, rough, opacity | Leaf Set 028 - Fallen autumn leaves atlas (with opacity) | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/LeafSet028 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `leaf_atlas_oak_dry` | albedo, normal, rough, opacity | Leaf Set 030 - Dry fallen leaves atlas (with opacity) | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/LeafSet030 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| `grass_blades_atlas` | albedo, normal, rough, opacity | Foliage 008 - Grass-blade atlas (with opacity) | ambientCG (ambientCG.com contributors; per-asset author not listed on the asset page) | https://ambientcg.com/a/Foliage008 | CC0 1.0 (https://docs.ambientcg.com/license/) |


## Audio

All 45 audio files in `public/assets/` are shipped. **Nine are third-party** (table below): excerpts, loops or layers of OpenGameArt uploads, normalised and encoded to MP3, CC0 as declared on the page of the author who uploaded them. **The other 36 are original sounds of this project**, rendered by `tools/audio/` from seeded noise, filters, envelopes and resonators; they contain no third-party recording, so they need no credit and have no source page. They replaced, on 2026-11-18, the 26 files from Internet Archive items (provenance tier B) and ten second-hand OpenGameArt files; `docs/CREDITS-AUDIT.md` lists what was removed and why.

| File | Work | Author as recorded | Source page | Licence as recorded |
|---|---|---|---|---|
| `audio/ambience/birdsong_day.mp3` | Park ambiences - birds + Ambient Bird Sounds | Thimras; isaiah658 | https://opengameart.org/content/park-ambiences ; https://opengameart.org/content/ambient-bird-sounds | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/rain_light.mp3` | AMB Rain Loop 1 | Kresiek The Furry | https://opengameart.org/content/amb-rain-loop-1 | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/wind_leaves.mp3` | Park ambiences - wind | Thimras | https://opengameart.org/content/park-ambiences | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/room_fridge_hum.mp3` | Fridge Loop 1 | Kresiek The Furry | https://opengameart.org/content/fridge-loop-1 | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/gravel_grit_01.mp3` | Different steps on wood, stone, leaves, gravel and mud - gravel | TinyWorlds | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/crunch_01.mp3` | 7 Eating Crunches - crunch.1 | StarNinjas | https://opengameart.org/content/7-eating-crunches | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/crunch_02.mp3` | 7 Eating Crunches - crunch.3 | StarNinjas | https://opengameart.org/content/7-eating-crunches | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/wet_splat_01.mp3` | Squish Sounds Effects - squishsplat_impact | EZduzziteh | https://opengameart.org/content/squish-sounds-effects | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/wet_splat_02.mp3` | 40 CC0 water / splash / slime SFX - slime_03 | rubberduck | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | CC0 1.0 (as declared on the OpenGameArt page) |

Original sounds (`tools/audio/sounds/index.mjs` is the registry; `node tools/audio/render.mjs` renders them, byte-identical every time):

- `ambience/crickets_night`: night insects, dense and steady.
- `ambience/playground_distant`: voice-less distant play-area activity.
- `ambience/rain_heavy`: steady heavy rain.
- `ambience/street_suburban`: suburban street wash with far cars and birds.
- `ambience/traffic_distant`: distant city traffic, low rumble character.
- `ambience/underground_rumble`: deep earth rumble.
- `sfx/broom_sweep_01`: push broom on a dirty floor.
- `sfx/broom_sweep_02`: push broom, second take.
- `sfx/car_pass_01`: car driving past (older car, steady).
- `sfx/car_pass_02`: car passing in low gear.
- `sfx/cricket_chirp_01`: two crickets chirping.
- `sfx/cricket_chirp_02`: a cricket chirping three times.
- `sfx/crunch_03`: dry brittle crackle and crunch.
- `sfx/gravel_grit_02`: stone ticks from three sliding steps.
- `sfx/gravel_grit_03`: stone ticks, second take.
- `sfx/insect_wing_buzz_01`: a fly flying past.
- `sfx/insect_wing_buzz_02`: a swarm of bees.
- `sfx/lawnmower_loop`: petrol mower running (engine loop).
- `sfx/lawnmower_push_loop`: push reel mower (blade clicks and whirr).
- `sfx/soil_scrape_01`: blade scraping dry soil (played pitched up 12-19 semitones for ant scale).
- `sfx/soil_scrape_02`: shovel in soil: plunge, then two coarser strokes.
- `sfx/stridulation_grasshopper_01`: grasshopper stridulation, three phrases.
- `sfx/thud_giant_step_01`: giant footfall: heavy boom on a wooden floor.
- `sfx/thud_giant_step_02`: giant footfall: hollow wooden surface.
- `sfx/ui_click_01`: soft UI click.
- `sfx/ui_click_02`: softer, lower UI click.
- `sfx/ui_click_03`: short sharp UI tick.
- `sfx/ui_hover_01`: UI hover blip.
- `sfx/ui_switch_01`: UI toggle: two clicks.
- `sfx/water_drip_01`: a drip in a hollow room, with a second smaller drop.
- `sfx/water_drip_02`: a higher drip and two smaller ones.
- `sfx/wood_creak_01`: light wood creak.
- `sfx/wood_creak_02`: creaky wood, two long strokes.
- `sfx/wood_creak_03`: tree creak, long and low.
- `sfx/wood_rasp_01`: rough tooth drawn over wood (stand-in for gnawing).
- `sfx/wood_rasp_02`: finer, faster rasp (ant-scale gnaw).

Removed in the provenance pass (2026-11-18), no longer shipped: the 26 archive.org files (`ambience/crickets_night`, `rain_heavy`, `street_suburban`, `traffic_distant`, `playground_distant`, `sfx/soil_scrape_01/02`, `gravel_grit_02/03`, `wood_creak_01/02`, `wood_rasp_01/02`, `crunch_03`, `thud_giant_step_01/02`, `lawnmower_loop`, `lawnmower_push_loop`, `car_pass_01/02`, `broom_sweep_01/02`, `insect_wing_buzz_01/02`, `cricket_chirp_01/02`) and the second-hand OpenGameArt files (`sfx/stridulation_grasshopper_01`, `wood_creak_03`, `water_drip_01/02`, `ui_click_01/02/03`, `ui_hover_01`, `ui_switch_01`, `ambience/underground_rumble`). The ids are unchanged: each now plays an original sound.

The OpenGameArt clip "Digging Underground" (Almitory) was removed earlier because its page listed several licences with no provenance. `sfx/soil_dig_01` is not shipped.

## Fonts

Bundled as base64 data inside the game script (`src/ui/styles/fonts.ts`), Latin and Latin-extended subsets only. Licence: SIL Open Font License 1.1. The licence file of each package is `node_modules/<package>/LICENSE`; the portable build repeats the text in its `CREDITS.md`.

| Font | Package and version | Copyright line in the package licence |
|---|---|---|
| Inter (variable) | `@fontsource-variable/inter` 5.3.0 | Copyright 2016 The Inter Project Authors |
| Source Serif 4 (variable, roman and italic) | `@fontsource-variable/source-serif-4` 5.3.1 | "Google Inc." (the package licence names no further holder) |
| Atkinson Hyperlegible (400, 700) | `@fontsource/atkinson-hyperlegible` 5.3.0 | Copyright 2020 Braille Institute of America, Inc. |
| JetBrains Mono (500) | `@fontsource/jetbrains-mono` 5.3.0 | Copyright 2020 The JetBrains Mono Project Authors |

## Code libraries

Bundled into the game script (`tools/build/config.mjs`, `SOFTWARE_LICENCES`).

| Library | Version | Licence | Licence text |
|---|---|---|---|
| three | 0.187.0 | MIT | `node_modules/three/LICENSE` |
| postprocessing | 6.39.6 | Zlib | `node_modules/postprocessing/LICENSE.md` |
| preact | 11.2.0 | MIT | `node_modules/preact/LICENSE` |
| @preact/signals | 2.11.4 | MIT | `node_modules/@preact/signals/LICENSE` |
| @preact/signals-core | 1.14.5 (dependency of @preact/signals) | MIT | `node_modules/@preact/signals-core/LICENSE` |
| fflate | 0.8.3 | MIT | `node_modules/fflate/LICENSE` |

`postprocessing` contains the lookup images of the SMAA anti-aliasing filter as embedded data. No licence text for SMAA ships in the repository; see `docs/CREDITS-AUDIT.md`.

Development tools (vite, vitest, TypeScript, `@preact/preset-vite`, `@types/three`) are not shipped.

## Where the full texts are

- Build output: `dist-portable/CREDITS.md` (made by `npm run build:portable`): `public/assets/CREDITS.md` followed by the licence text of every library and font above.
- In the game: Credits, from the title screen.
- Source records: `assets-src/records_textures.json`, `assets-src/records_audio.json`, `assets-src/MANIFEST.md`.
