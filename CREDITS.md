# FOUNDRESS credits

This file lists every third-party file or package that the portable build ships: textures, audio, fonts and code libraries. It was written on 2026-11-18 from the repository at commit `fb15f3d`, by reading these records:

- `assets-src/records_textures.json` and `assets-src/records_audio.json`: one record per shipped asset file (author, source page, licence string, processing).
- `assets-src/MANIFEST.md`: the licence notes made when the assets were collected, and the processing steps.
- `public/assets/CREDITS.md` and `public/assets/manifest.json`: the credits that go into the build.
- `tools/build/config.mjs` (`SOFTWARE_LICENCES`), `src/ui/styles/fonts.ts` and `package.json`: the libraries and fonts.
- `node_modules/<package>/LICENSE`: the licence text of each package, copied into the build's own `CREDITS.md` by `tools/build/credits.mjs`.

`docs/CREDITS-AUDIT.md` says how each entry was checked and lists the entries whose source cannot be shown from the repository. Nothing was fetched from the network to write either file.

The game's own code, its procedural ant and creature models, the icon set (`src/ui/icons/paths.ts`), the synthesised sound recipes (`src/audio/`) and the text are original work of this project.

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

All 45 audio files in `public/assets/audio/` are shipped. They are excerpts, loops or layers of the recordings named below, normalised and encoded to MP3. Most rows are CC0 as declared on the source page. The rows whose source page is on archive.org (the "Red Library" and "SSE Library" items) are **provenance tier B**: the CC0 mark is the uploader's assertion over old studio effect libraries, and the repository holds no document that shows the rights chain. See `docs/CREDITS-AUDIT.md`.

| File | Work | Author as recorded | Source page | Licence as recorded |
|---|---|---|---|---|
| `audio/ambience/birdsong_day.mp3` | Park ambiences - birds + Ambient Bird Sounds | Thimras; isaiah658 | https://opengameart.org/content/park-ambiences ; https://opengameart.org/content/ambient-bird-sounds | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/crickets_night.mp3` | R24-14 Cricket Chirps Outside | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Animals_Misc | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/ambience/rain_light.mp3` | AMB Rain Loop 1 | Kresiek The Furry | https://opengameart.org/content/amb-rain-loop-1 | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/rain_heavy.mp3` | R30-25a Steady Heavy Rain | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Nature_Rain | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/ambience/wind_leaves.mp3` | Park ambiences - wind | Thimras | https://opengameart.org/content/park-ambiences | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/street_suburban.mp3` | R10-01 Suburban Ambience-Noise | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Ambience_1 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/ambience/traffic_distant.mp3` | R20-05 Distant Traffic in City | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Ambience_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/ambience/playground_distant.mp3` | AMBSchl Kids play on school playground outdoors | USC Sound Effect Archive / Sunset Editorial Collection (SSE Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/SSE_Library_AMBIENCE | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/ambience/room_fridge_hum.mp3` | Fridge Loop 1 | Kresiek The Furry | https://opengameart.org/content/fridge-loop-1 | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/ambience/underground_rumble.mp3` | underwater or space engine rumble (deep_rumble) | gmason | https://opengameart.org/content/underwater-or-space-engine-rumble | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/soil_scrape_01.mp3` | DIRTMisc Digging with shovel; poking ground | USC Sound Effect Archive / Sunset Editorial Collection (SSE Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/SSE_Library_DIRT_SAND | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/soil_scrape_02.mp3` | R08-57 Digging with Shovel | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Tools | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/gravel_grit_01.mp3` | Different steps on wood, stone, leaves, gravel and mud - gravel | TinyWorlds | https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/gravel_grit_02.mp3` | R10-10 Sliding Steps on Gravel | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Footsteps_1 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/gravel_grit_03.mp3` | R10-10 Sliding Steps on Gravel | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Footsteps_1 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/wood_creak_01.mp3` | R22-34 Light Wood Creaks | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/wood_creak_02.mp3` | R04-51 Creaky Wood | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Creaks | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/wood_creak_03.mp3` | Tree Creaking | Department64 (original recording, per OGA description); cleaned up by AntumDeluge (OGA uploader) | https://opengameart.org/content/tree-creaking | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/wood_rasp_01.mp3` | R18-40 Scrape or Sweep Wood Surface | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/wood_rasp_02.mp3` | R18-40 Scrape or Sweep Wood Surface | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/crunch_01.mp3` | 7 Eating Crunches - crunch.1 | StarNinjas | https://opengameart.org/content/7-eating-crunches | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/crunch_02.mp3` | 7 Eating Crunches - crunch.3 | StarNinjas | https://opengameart.org/content/7-eating-crunches | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/crunch_03.mp3` | R04-38 Crackling and Crunching | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_4 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/water_drip_01.mp3` | Dripping water loop | Independent.nu (credited on the OGA page; submitted to OGA by qubodup) | https://opengameart.org/content/dripping-water-loop | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/water_drip_02.mp3` | Dripping water loop | Independent.nu (credited on the OGA page; submitted to OGA by qubodup) | https://opengameart.org/content/dripping-water-loop | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/wet_splat_01.mp3` | Squish Sounds Effects - squishsplat_impact | EZduzziteh | https://opengameart.org/content/squish-sounds-effects | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/wet_splat_02.mp3` | 40 CC0 water / splash / slime SFX - slime_03 | rubberduck | https://opengameart.org/content/40-cc0-water-splash-slime-sfx | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/thud_giant_step_01.mp3` | R28-56 Sand Bags Dropped onto Wood Floor | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Impacts | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/thud_giant_step_02.mp3` | R28-55 Thumps on Large Hollow Wooden Surface | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Impacts | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/lawnmower_loop.mp3` | VEHAtv go cart or lawnmower idling | USC Sound Effect Archive / Sunset Editorial Collection (SSE Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/SSE_Library_VEHICLES | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/lawnmower_push_loop.mp3` | MACHGrdn-MOWER Manual push lawn mower | USC Sound Effect Archive / Sunset Editorial Collection (SSE Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/SSE_Library_MACHINES | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/car_pass_01.mp3` | R03-50 Auto Drive By | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Cars_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/car_pass_02.mp3` | R20-14 Car Passes By in Low Gear | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Cars_3 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/broom_sweep_01.mp3` | R18-41 Push Broom, Dirty Floor | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/broom_sweep_02.mp3` | R18-41 Push Broom, Dirty Floor | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Foley_Props_2 | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/insect_wing_buzz_01.mp3` | R01-30 Buzzing Sound | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Animals_Misc | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/insect_wing_buzz_02.mp3` | ANMLInsc Bees swarming | USC Sound Effect Archive / Sunset Editorial Collection (SSE Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/SSE_Library_ANIMALS | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/cricket_chirp_01.mp3` | R28-16 Two Competing Crickets | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Animals_Misc | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/cricket_chirp_02.mp3` | R28-16 Two Competing Crickets | USC Sound Effect Archive / Sunset Editorial Collection (Red Library); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive | https://archive.org/details/Red_Library_Animals_Misc | CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat |
| `audio/sfx/stridulation_grasshopper_01.mp3` | Grasshopper (stridulation; original recording by straget, freesound.org/s/401939, CC0) | AntumDeluge (trim) / straget (recording) | https://opengameart.org/content/grasshopper | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/ui_click_01.mp3` | 51 UI sound effects - click1 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/ui_click_02.mp3` | 51 UI sound effects - click3 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/ui_click_03.mp3` | 51 UI sound effects - mouseclick1 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/ui_hover_01.mp3` | 51 UI sound effects - rollover5 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 (as declared on the OpenGameArt page) |
| `audio/sfx/ui_switch_01.mp3` | 51 UI sound effects - switch10 | Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 1.0 (as declared on the OpenGameArt page) |

Notes taken from `public/assets/CREDITS.md`:

- `sfx/stridulation_grasshopper_01` is a trim of freesound.org/s/401939 (recorded by straget, CC0), as republished on OpenGameArt by AntumDeluge.
- `sfx/wood_creak_03` is a Department64 tree-creak recording, cleaned up and republished by AntumDeluge on OpenGameArt.
- `sfx/water_drip_01` and `sfx/water_drip_02` are credited on OpenGameArt to Independent.nu (submitted by qubodup).
- The Kenney UI sounds come from Kenney's own upload on OpenGameArt.
- The OpenGameArt clip "Digging Underground" (Almitory) was removed from the build because its page listed several licences with no provenance. `sfx/soil_dig_01` is not shipped.

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
