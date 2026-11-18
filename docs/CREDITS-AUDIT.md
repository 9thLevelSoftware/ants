# Credits audit

Audit of `CREDITS.md`: what the repository itself can show about the origin and licence of every third-party file the portable build ships. Written 2026-11-18 at commit `fb15f3d`. Nothing was fetched from the network. A source page that is quoted in a record was not opened again, so the audit cannot say whether that page still reads the same today.

## What "checked" means here

Each entry has one of these evidence levels. They say what the repository contains, not whether the licence claim is true in the world.

| Level | Meaning |
|---|---|
| **R** (record) | A committed record names the work, the author, the source page and a licence string: `assets-src/records_textures.json` or `assets-src/records_audio.json`, repeated in `assets-src/MANIFEST.md`, `public/assets/manifest.json` and `public/assets/CREDITS.md`. |
| **S** (site statement) | `assets-src/MANIFEST.md` quotes the licence statement of the source site (Poly Haven, ambientCG) or says that the licence badge of the source page was read (OpenGameArt, archive.org). |
| **M** (download metadata) | The original download is kept in `assets-src/raw/`. Its metadata file agrees with the record. **`assets-src/raw/` is git-ignored** (626 MB): it is in this checkout but not in a clone of the repository. |
| **L** (licence file in the package) | A licence text ships inside the npm package, in `node_modules/<package>/`. These are the files the build copies into `dist-portable/CREDITS.md`. |
| **H** (header) | The source file states its own origin in a comment. |

## Checks that were run

All run on 2026-11-18 with scripts kept in `test-output/docs-final/` (git-ignored, not part of the repository).

1. **Every shipped asset file has a record.** The build's own plan (`planAssets()` in `tools/build/assetPlan.mjs`) lists 105 asset files in the packs: 60 texture files in 19 sets and 45 audio files. Each of the 105 has a record, exists on disk, and the size in the record equals the size on disk. `public/assets/manifest.json` and the two record files each hold 123 entries with the same ids (78 texture files, 45 audio files). The six sets the build leaves out (`leaf_litter`, `bark_pine`, `wood_mossy`, `concrete_paving`, `paver_interlock`, `metal_galvanised`: 18 files, 3.07 MB) are not in `CREDITS.md`'s tables.
2. **Poly Haven authors against the downloaded metadata (level M).** For the 12 shipped Poly Haven sets, the `authors` field of `assets-src/raw/polyhaven/<id>/info.json` equals the author in the record: 12 of 12.
3. **ambientCG (level M).** All seven shipped ambientCG sets have `info.json` in `assets-src/raw/ambientcg/<id>/`. These files hold the search response of the site's API. They contain no licence field and no author field.
4. **Licence files in the downloads.** Of the 19 OpenGameArt downloads, three folders contain a text file: `x_antumdeluge_scrapes/LICENSE.txt` (the CC0 1.0 legal code), `x_antumdeluge_grasshopper/README.txt` ("Licensing: Creative Commons Zero (CC0)", recorded by straget, source freesound.org/s/401939) and `x_kenney_ui_sfx_set/readme.txt` (see the Kenney entry below). The other OpenGameArt downloads have no text file at all.
5. **Library and font licences (level L).** The licence file named in `SOFTWARE_LICENCES` (`tools/build/config.mjs`) exists for every entry, and `npm run build:portable` fails when one is missing. It was run on 2026-11-18 and passed.
6. **Static scan.** `node tools/build/verify-portable.mjs --scan-only --no-build` passed: size limits and forbidden patterns. This does not test licences.

## Entries and how each was checked

| Entry | Files shipped | Levels | Notes |
|---|---|---|---|
| Poly Haven textures | 12 sets, 36 files | R, S, M | Site statement quoted in `MANIFEST.md`: "Our assets are all licensed as CC0." Authors agree with the download metadata. No licence text for Poly Haven is in the repository; the claim rests on the quoted statement. |
| ambientCG textures | 7 sets, 24 files | R, S | Site-wide statement quoted in `MANIFEST.md`. The records credit "ambientCG" and name no individual author, because the asset pages do not. Downloaded metadata (M) exists but says nothing about licence or author. |
| OpenGameArt audio | 19 files | R, S (page badge read) | The CC0 claim is the uploader's, made on each page. The author names are the names on those pages; `public/assets/CREDITS.md` says OpenGameArt cannot prove the uploader is the original recorder. See the second-hand entries below. |
| archive.org audio (USC "Red Library" and "SSE Library" items) | 26 files | R, S (page `licenseurl` read) | **Unverified.** See the list below. |
| Fonts (Inter, Source Serif 4, Atkinson Hyperlegible, JetBrains Mono) | 12 font files inlined in the game script | L, H (`src/ui/styles/fonts.ts`) | OFL 1.1 text ships in each package. The copyright line of the Source Serif 4 package is only "Google Inc." |
| three, postprocessing, preact, @preact/signals, @preact/signals-core, fflate | bundled code | L | MIT, except postprocessing (Zlib). Versions are pinned in `package.json` and `package-lock.json`. |
| Icon set | inline SVG paths in the game script | H | `src/ui/icons/paths.ts` says "The set is original line work." Nothing else in the repository supports or contradicts that. |
| Sound recipes, ant and creature models, text | code | none needed | Written in this repository. |

## Assets whose provenance cannot be shown from the repository

These are named plainly. The repository holds no document that proves the licence of any of them. Replace or remove them if a conservative posture is required.

### 1. Twenty-six archive.org audio files

The records and `public/assets/CREDITS.md` mark these as provenance tier B. The only evidence is the `licenseurl` field read from each Internet Archive item. The items are digitised studio effect libraries, uploaded by an Internet Archive account. The repository does not document who owned the rights to the original tapes or whether the uploader could release them. The raw WAV downloads are in `assets-src/raw/archive/` (local only) and carry no licence file.

`ambience/crickets_night`, `ambience/rain_heavy`, `ambience/street_suburban`, `ambience/traffic_distant`, `ambience/playground_distant`, `sfx/soil_scrape_01`, `sfx/soil_scrape_02`, `sfx/gravel_grit_02`, `sfx/gravel_grit_03`, `sfx/wood_creak_01`, `sfx/wood_creak_02`, `sfx/wood_rasp_01`, `sfx/wood_rasp_02`, `sfx/crunch_03`, `sfx/thud_giant_step_01`, `sfx/thud_giant_step_02`, `sfx/lawnmower_loop`, `sfx/lawnmower_push_loop`, `sfx/car_pass_01`, `sfx/car_pass_02`, `sfx/broom_sweep_01`, `sfx/broom_sweep_02`, `sfx/insect_wing_buzz_01`, `sfx/insect_wing_buzz_02`, `sfx/cricket_chirp_01`, `sfx/cricket_chirp_02`.

### 2. OpenGameArt files that came second-hand

For these the page the record names is not the original source, so the repository cannot show who made the sound.

- `sfx/stridulation_grasshopper_01`: a trim by AntumDeluge of a freesound.org recording by straget. The local README says CC0. The Freesound page was never reachable (`assets-src/MANIFEST.md`: HTTP 403 from the sandbox).
- `sfx/wood_creak_03`: a Department64 recording "per OGA description", cleaned up by the uploader.
- `sfx/water_drip_01`, `sfx/water_drip_02`: credited on the page to Independent.nu and submitted by another account. The source file is named `atmosbasement.mp3_.flac`.
- `sfx/ui_click_01`, `sfx/ui_click_02`, `sfx/ui_click_03`, `sfx/ui_hover_01`, `sfx/ui_switch_01`: Kenney's UI set from OpenGameArt. The local `readme.txt` says "You may use these sounds in personal and commercial projects. Credit ... is not mandatory." It does not say CC0; CC0 comes from the OpenGameArt page, as recorded. The Kenney site itself was not reachable.
- `ambience/underground_rumble`: described in the record as "an engine-rumble effect, not a real earth recording". The licence claim is the same as for the other OpenGameArt files; the note is about what the sound is.

### 3. SMAA lookup images inside `postprocessing`

The `postprocessing` package embeds the lookup images of the SMAA filter as data (two `data:image` strings in `node_modules/postprocessing/build/index.js`). The package licence (Zlib, level L) covers the package. The repository has no licence text or attribution for SMAA's own authors, and no record of how the images are licensed. They load when the post-processing chain with SMAA is on.

### 4. Statements nobody can re-check offline

- `public/assets/CREDITS.md` says the licence status "was independently re-verified on 2026-11-12 against the source pages". This is a statement by whoever collected the assets. The pages are not stored in the repository, only quoted.
- The Poly Haven and ambientCG licence statements are quotes in `MANIFEST.md`. The repository holds no copy of those licence pages.

### 5. Not a provenance gap, but worth knowing

- Seven ambientCG sets have no named author. The credit is to ambientCG as a whole.
- The Source Serif 4 package licence names "Google Inc." as its only holder line.
- Left-out texture sets are in the source tree and in the records but not in the build; nothing in `CREDITS.md` depends on them.
- The audio files were chosen from titles, descriptions and spectrograms. `assets-src/MANIFEST.md` says the engineer could not listen to them. That is about quality, not licence.

## How to repeat the audit

```
node tools/build/verify-portable.mjs --scan-only --no-build   # static scan
npm run build:portable                                        # fails if a library licence file is missing
```

The record check (every shipped file has a record of the right size) is a short script over `planAssets()` from `tools/build/assetPlan.mjs`, `assets-src/records_*.json` and the files in `public/assets/`. It is not kept in the repository.
