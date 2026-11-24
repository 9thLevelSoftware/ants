# app-seams-4 report

Written 2026-11-24 by the app engineer of `app-seams-4`. Times are UTC. Pictures under `test-output/app4/` (git-ignored); every picture cited was looked at.

## 0. Result in one screen

Items 1 to 5 are done and seen in the browser; item 6 is done for ants and creatures and not finished for the leaf litter; item 7 gives one clean full run (seed 1) and two runs (seeds 2, 3) that reach beat 25 and fail the growth check for a sim-side cause.

- Item 1 (dig plan, beat 19 -> 20): the planner was the cause (a pick more than 2 BU from a wall was refused); picks within 8 BU now snap to the nest wall; the script places the plan as a player. Section 1.
- Item 2 (full larder): the possessed panel says "Stores full - dig a food chamber"; the script plays the full larder by planning the chamber. Section 2.
- Item 3: ants between the camera and the possessed ant fade with alpha (no dither); draws and triangles did not rise. Section 3.
- Item 4: the flood water is a smooth-shored, darker, more transparent sheet with a ripple; the queen shows through it. Section 4.
- Item 5: the outcome card's picture frames the whole cell (the 3D cavity under the slice plane, queen in the middle third, perspective grown). Section 5.
- Item 6: faint cool moon rim on ants and creatures; leaf litter at ant height still reads brighter than the soil. Section 6.
- Item 7: seed 1 passes; seeds 2 and 3 fail "no growth over game days 2-3" (protein stops, sim economy); controls, views, hud, save, lifecycle and stage1a strict pass (stage1a after a script fix), panels strict cannot (two sim-side stand-ins). Section 7.
- Still unfinished, most serious first: section 8.

## 1. Item 1: the dig plan on seed 1 (whose fault)

**Reproduced as a player does it** (`tests/e2e/app4-planner.mjs`, the colony view framed on the cell, the Dig tool, clicks on the soil of the slice at 0.5 to 12 BU
beyond the wall of the cell, twelve directions each, the ghost turned through all 24 yaws): `test-output/app4/planner-before/pl-table.json`.
Every click 3 BU or more from the wall was refused with `anchor-not-in-nest` ("Start from a tunnel or chamber of this nest", picture `planner-before/pl-last.png`:
the ghost cross-hatched and the reason on it), whichever way the ghost turned; clicks within 2 BU worked. **The planner was the cause, not (only) the script**:
a founding cell is 3 to 4 BU across (12 cells of 0.5 BU at the plane: area 12 BU^2 on seed 1), so "beside the cell" is 4 to 8 BU from its wall, and the pick
snapped only within 2 BU (`ANCHOR_PICK_SNAP_BU`, GDD 03 14.2). The script was also wrong in what it hovered (the chamber record's centre + 0.9 x its x radius:
the record is 5 BU or more off the real cell, `shotSubject.ts` header), which is why it failed on all 24 turns.

**Fix.** `src/game/views/colony/digPlanner.ts`: a pick on soil that is not within 2 BU of a wall (the first, exact measure stays) snaps to the nest's own wall between the
click and the nearest open sample of the nest within `ANCHOR_PICK_REACH_BU` = 8 BU (`wallToward`: march from the open sample toward the click, bisect onto the wall, the
field's normal). Beyond 8 BU the ghost keeps saying why. DEVIATIONS row D-APP4-2. Test: `colonyTools.test.ts` ("a click on the soil of the slice beside the cell snaps to
the nest wall": clicks at 1, 3, 5, 7 BU anchor on the wall and are not refused; 20 BU is refused with the reason's words).
**After** (`test-output/app4/planner-after/`, same script and save): the table has `anchor-not-in-nest` only for clicks 9 and 12 BU out (`pl-table.json`);
a click 4 BU out gives an amber ghost with its warning ("Too close to the surface, another entrance or another room above or below - click again to confirm",
`pl-valid.png`), a click that lands on another plan shows "Overlaps another plan" cross-hatched (`pl-invalid.png`).
`firstplay.mjs` now places the plan the way the probe does (`placeChamberPlan` in `tests/e2e/lib/firstplay-steps.mjs`: the first wall from the cell's centre in
twelve directions, 2.5 BU of soil, hover, turn the ghost, click, confirm). The old "forage marker was not placed" soft failure of the baseline run was a second script
defect (the colony camera was moved and `views.project` read straight away: the camera drawn is the one the click is projected with; `render(1)` after every
`colonyCamera`).

## 2. Item 2: a worker with food and a full larder

**What the game did and showed.** The sim side was already right (GDD 02: the pool's cap is a larder of a day's need, `unload-crop` ends at once when it takes nothing, the
AI worker rests with a full crop, the `stores-full` alert follows after `STORES_FULL_ALERT_GD` with "dig a food chamber"). The app showed nothing at the moment that
matters: a possessed worker standing in the nest with a crop she cannot hand over had no word anywhere until the alert came, hours of game time later.
**Fix.** The possessed panel says it at once under her crop meter: "Stores full - dig a food chamber" (`UiPossessed.storesFull`, `hudSlices.carriesIntoFullStores`: the alert's own test,
`poolSpace` under `STORES_FULL_SPACE`, for the kind she carries; `PossessedPanel.tsx`, `STORES_FULL_NOTE` in `content/text/words.ts`). Tests: `src/game/uiBridge/storesFull.test.ts`
(room / no room for sugar, protein judged against protein room, empty crop). DEVIATIONS D-APP4-6; MANUAL section 14 "Stores full".
**The script.** The trail check (13 -> 14) on a colony that wants no sugar: after the 9000-tick wait, if no trail and the `stores-full` alert is up, `firstplay.mjs` plans the food chamber
the alert asks for with the dig planner (as a player would; recorded in `result.findings`), then waits again; the forage-marker step stays. Beat 16 records whether the note shows
(`checks.delivery.storesFullNote`). No assertion was weakened.

## 3. Item 3: ants between the camera and the possessed ant

**Rule** (integrator ruling; DEVIATIONS D-APP4-1): an ant whose body is inside the cone from the camera to the possessed ant (a third of its width at the camera, 0.6 body lengths at the subject,
the ant's own half length added; soft edges) and nearer the camera than half the boom is not drawn; its alpha fades out with time constant 0.1 s and back in with 0.16 s; every other
ant is solid; the possessed ant is never faded away (rule 1's dither of her own fade is unchanged). `src/render/ants/occluderFade.ts` (pure), the per-ant `hidden` smoother in
`AntRenderer` (one frame of lag on the subject), the instance attribute `aFootB.w` -> `vAntA` -> `diffuseColor.a`, body and carried-item materials blended only while an ant is
mid-fade (`setFadeBlend`: both programs stay cached, the crowd is opaque the rest of the time), a fully faded ant is not written to any batch (no draw, no shadow).
Tests: `occluderFade.test.ts` (zone, soft edge monotone and continuous, the smoother's time constants), `lookFixes.test.ts` (the renderer end to end: mid-fade blended, hidden then not
drawn, back with alpha, the subject never, photo mode / no subject nothing).
**Pictures** (`tests/e2e/app4-fade.mjs`: the possessed worker in the entrance tunnel, other workers teleported onto the camera-subject line, frames 0 / 3 / 8 / 40 of 33 ms):
low `sheets/item3-fade-sequence-low.jpg`, medium `sheets/item3-fade-medium.jpg` (the control, rule off, bottom right of that sheet: the near ant stays solid), crowded chamber and high
`sheets/item3-fade-crowd-high.jpg`. The near ant is whole at frame 0, a ghost at frame 8, gone at frame 40; the possessed worker is solid throughout; no hatching anywhere.
The earlier crowd pictures (`test-output/app4/crowd/cc-noon-*-low.png`) are the nests' own staging and show no ant in the zone (`faded 0`); they are kept as the "nothing got worse" check.

## 4. Item 4: flood water that reads as water

**Before** (`test-output/look6`, seed 2's flooded cell): a flat sheet cut by the carve cells, a blocky pale shape with stair-stepped edges (299 cells x 2 triangles).
**Now** (`src/render/world/weather/floodShore.ts`, `floodWater.ts`, `tuning.ts` `FLOOD_WATER`): the sheet is a lattice mesh over the cavity (820 triangles on the staged cell, 0 extra draw calls) whose vertices carry the carve
openness at the water level (`aShore`) and the water depth under them (`aDepth`, a downward march of the field); the fragment shader draws the outline as the iso-contour of the shore and of the depth
(`min((shore - 0.5) / 0.5, depth / depthSoftMm)`: smooth, not the cell grid; a soft edge where the water meets the wall), tints and fades by depth (shallow water is paler and more transparent, the deep middle darker
and less transparent: a cool blue-green, darker than before), a Fresnel term on the alpha, a thin bright meniscus at the wall and a faint specular ripple. The queen stands in the water and is seen through it from
the cell camera. Tests: `floodSheet.test.ts` (shore geometry, depth attribute, `waterDepthMm`, shader patch).
**Pictures:** `test-output/app4/sheets/item4-water-before-after.jpg` (seed 2's flooded cell, cell camera and colony view, before and after), `sheets/item4-water2.jpg` (the final depth-based shore,
`water2/after2-08-cell-camera.png`, `after2-colony-view-low.png`, `after2-colony-view-high.png`), and the outdoor puddle in rain for comparison (`water2/after2-outdoor-puddle.png`).
The outline is smooth, the water is darker and more transparent than before, the queen is visible through it. The outdoor puddle (the reference the spec names) is itself a pale polygon with straight edges at a grazing
angle and, at night, a black one (`sheets/item6-night-final.jpg`): the flood sheet is now the better-looking of the two; the puddle (decor `water` layer, `src/render/world/decor`) is listed as unfinished below.
Cost: no extra draw call, 820 triangles against 598, medium/high scene counts unchanged within noise (section 9).

## 5. Item 5: the outcome card's picture

**Cause** (found with `tests/e2e/app4-card.mjs`, which projects the field onto the screen: `card6/s1-14-overlay.png`, `card7/s1-14-overlay.png`): the slice shows the cell as one blob from above, but the queen
stands in the throat of the shaft, where the cell reaches the plane, and the cell itself lies 15 to 20 mm under her. A circle on the plane (the first fix) framed the throat only (10 mm), the visible blob was 30 mm: the cell was still
cut by the top of the frame (`card4/s1-12-outcome-card.png`). Two more causes on the way: `easeShotSubject` did not carry the new `minRadiusBu` field, and workers walking the throat widened the subject.
**Fix.** `src/game/flows/founding/cellFootprint.ts`: the open voxels of the carve field at or under the slice plane that connect (6-connected, 1 mm grid, 10 BU each way, 12 BU deep) to the queen; the bounding sphere is measured by
its reach on the screen at the shot's pitch (a height difference counts cos(pitch)) and its centre is moved from the box's centre toward the queen until she stands in the middle third of it. `shotSubject.ts` frames that sphere
behind a card (`wholeCell`; brood is kept inside, workers are not counted), `cardFraming.ts` turns the card's size into the shot's `lift` and `fill` (the free band between 1.5 rem from the top and 1 rem above the card),
`foundingShot.ts` carries `minRadiusBu`. Tests: `cardFraming.test.ts` (the band arithmetic end to end through `foundingShotAt`, the 3D footprint, a cell under a throat, null cases), `shotSubject.test.ts` (the card subject).
**Pictures:** seed 1 `card9/s1-13-outcome-card-settled.png` (cell whole between the HUD band and the card, queen in the upper middle of the band, the card clear of it); the real foundings of seeds 1 to 3 in `sheets/item5-cards.jpg`
and `u12-s1/`, `u12-s2/`, `full-s3/12b-outcome-card-settled.png` (the settled card: the camera eases to the cell over a second or two, beat 12 of `firstplay.mjs` is taken at 0.5 s and still shows the ease; beat 12b is taken settled).
Seed 1 on the final code (`probe-s1/12b-outcome-card-settled.png`) shows the cell whole, the queen inside it, the card clear of it. The first settled run of seed 1 (`u12-s1`, before the perspective term) still lost the top of the cell:
the slice plane is the nearest part of the cell to the camera and is drawn larger, so the sphere is grown by `perspectiveGrow(fill)` (about 11 %, `cardFraming.ts`, test in `cardFraming.test.ts`). Seeds 2 and 3
(`sheets/item5-cards-final.jpg`) were taken before that term and show the cell whole, small; with it they are about 11 % smaller still (not re-shot). The price of keeping the queen in the middle third of the sphere is a small
cell when she stands at its end: the cell fills about half of the free band (listed below).

## 6. Item 6: night contrast

**Ants and creatures.** A faint cool rim light on the moon side: `ANT_MOON_RIM` (floor 0.25, ramps from -0.15 to 0.65 of the dot with the moon direction) weights the existing `ANT_FILL.rim` term by the moon side
(`uMoonDir`, `uMoonK` from `AntRenderer.setMoon`, fed by `antsSlot` from `LightingState.keyDir` and `nightW`), `ANT_FILL.rim.night` 0.15 -> 0.28 (the mean over the body stays under 0.22: pinned in `lookReview3.test.ts`);
creatures: `CREATURE_MOON_RIM` emissive chunk in `creatureChunk.ts`, fed by `creaturesSlot` (rewritten as a `CreaturesRenderer` subclass). The ground's exposure is untouched (`ground=0.215` with and without the rim in `rimperf.log`).
The variants (rim 0.15 / 0.30 / 0.55) are in `sheets/item6-rim-variants-22h.jpg`; the chosen value is the smallest one that separates the ant from the soil (antContrast 0.00 -> 0.04 to 0.10 in the staged shots).
**Leaf litter.** `DECOR_LEAF.nightAlbedo` (dry / fresh) scales the draped leaves' albedo by the night weight (`DecorRenderer`: `uDcDry`, `uDcFreshTint`; stats `leafNight`, `leafDryK`).
**Not finished.** Measured in the observer's low view at 22:00 clear (`leaf2`, `leaf3`, `leaf4`): the pale dry leaves still read 0.42 to 0.46 of the display range against the soil's 0.18 (`sheets/item6-leaf-final.jpg`); albedos of 0.04, 0.07 and 0.10 read the same (a floor
that is not the decor leaf's albedo), 0.4 -> 0.15 moved the mean from 0.56 to 0.465, and lifting the leaf roughness to 1 at night (tried, removed) moved it by 6 % only. The setting kept is 0.15 / 0.4, which brings the median of the leaf region under the soil's and the brightest tenth from 0.475 to 0.353 (the first calibration, `leaf2`
numbers in `decor/tuning.ts`); where the floor comes from is not found (not the draped material's albedo, translucency or specular; the next suspects are the terrain's own surface patch and a second layer under the leaf). Pictures at ant height on the surface read better than the low observer's.
**Pictures:** `sheets/item6-night-final.jpg` (22:00 and 02:00 clear, 22:00 rain, at ant height on the surface and from the observer's low camera, medium quality; the files are `nightf/nf-*.png`), `sheets/item6-rim-variants-22h.jpg`,
`sheets/item6-leaf-variants.jpg`. Draw calls and triangles with the rim off / on (same staged scene, `rimperf.log`): medium 89 / 668,876 -> 89 / 670,572 (+0.25 %), high 102 / 947,607 -> 102 / 958,807 (+1.2 %); low is not
comparable (the staged scene differs between the two runs: 86 vs 57 draws before any rim code ran).

## 7. Item 7: the first hour, three uninterrupted runs

`tests/e2e/firstplay.mjs` from the title to beat 25, `--script-timeout 6000000`, no stand-ins (`result.standIns` empty on all three), one browser at a time (`test-output/app4/run-full.sh`, log `run-full.log`).

| Seed | Run | Beats | Result |
|---|---|---|---|
| 1 | 16:36 - 16:55 (1132 s of script) | 25 of 25 | passed; one finding: "no scout discovered a sugar spill 88 mm from the open entrance in 9000 ticks" (the trail formed through a forage marker the script placed as a player, after 13,200 ticks); beat 16 shows "Stores full - dig a food chamber" in the possessed panel (`full-s1/16-worker-delivered.png`, `checks.delivery.storesFullNote true`) |
| 2 | 16:55 - 17:17 | 25 of 25 | one failed check, assertion unchanged: "no growth over game days 2-3 at 8x" workers 10, 10, 10, brood 8, 8, 5, protein stores 1.5, 1.74, 1.56, sugar 10.4 -> 14; the HUD shows "Brood growth has stalled (protein)" and "Protein stores low, 0.3 days left" (`full-s2/22-day-3-8x.png`); the founding chamber flooded in this run (beats 9 to 11: "Queen in danger - rising water", the new water sheet over the cell, `full-s2/09-sealed.png`, `10-first-clutch.png`) |
| 3 | 17:17 - 17:38 | 25 of 25 | the same failed check: workers 11, 11, 11, brood 9, 9, 7, protein 1.7, 1.65, 2.0, sugar 13.6 -> 33.9; alerts "Protein stores low" and "Brood growth has stalled (nurses)" (`full-s3/22-day-3-8x.png`) |

**Cause of the two failed checks (not the app):** after the hand-over the colony gathers sugar (the only source in reach is the sugar spill the script lays for beats 13 to 15, as a player would find one) and stays at 10 to 11
workers with its brood dwindling: no protein comes in, the larvae are not fed and the colony does not grow in days 4 to 6 although its sugar larder is full (seed 3's grows to 34). Seed 1 passes by one worker (14 -> 15) on the same pattern. It is the economy
(forage targeting of protein when the sugar larder is full, and the nurses' limit the second alert names), owner: the sim engineer of colony economy / foraging. The same check failed on an older build
(`test-output/app-seams-2-fix/fp-fast4.log`: workers 6, 6, 6 and brood 7 -> 1). Reproduction: `test-output/app4/s2-trail.save` and `s3-trail.save` (the game exported right after the trail check, day 4), then 6000 ticks twice at 8x
(`window.__game.query.growth()` before and after each); logs `full-s2.log`, `full-s3.log`; pictures `sheets/full-s2-a..d.jpg`, `full-s3-a..c.jpg`. The assertion was not touched.

The other scripts, strict (`run-others.sh`, `others/*.log`):

| Script | Result |
|---|---|
| `controls.mjs` | passed (finding: "after a tapped drink the action 'harvest-liquid' keeps running with a full crop", owner: sim ants / action primitives) |
| `views.mjs` | passed |
| `hud.mjs` | passed, no stand-ins |
| `save.mjs` | passed |
| `lifecycle.mjs` | passed |
| `stage1a.mjs` | failed first on "camera inside solid in the chamber {f: -2, cutAway: true}": the cell camera (look pass 6) sits in the soil on purpose with the soil between it and the ant cut away; `views.mjs` accepts `cutAway` and `stage1a.mjs` had not been updated. It now accepts it (a camera in solid with no cutaway still fails); rerun strict: passed |
| `panels.mjs` | strict cannot pass, two stand-ins, both sim side: (1) the hand-over: the test world (`makeTestSim`) starts after the founding with `player.opening` un-done and `cheat.completeFounding` does not finish it there (tried: the opening stayed un-done and the alert card of section 2 never showed); (2) the alert with a chamber focus: `nestSpaceDiag.ts` publishes `focus: null`, so no alert carries a chamber for the click-through (GDD 08 App. E check 11). Run non-strict in its two halves (`PANELS_ONLY=health,alert,nest,journal,codex`, `PANELS_ONLY=markers,hudfix,keys,tools,sizes`; the alert section needs the health section before it, alone it fails on "the expanded diagnostic is scrolled into view"): both pass with exactly those two stand-ins listed (`others/panels5.log`, `panels-markers,hudfix,keys,tools,sizes.log`). |

## 8. Still unfinished, most serious first

1. **The colony does not grow in days 4 to 6 on seeds 2 and 3** (section 7): protein income stops, brood dwindles, alerts say so. Sim economy / foraging. Repro saves and logs above. A player would see "Brood growth has stalled" on day 6 of the first hour.
2. **Pale leaf litter at night, ant-height observer view**: still 2.5 times the soil's luminance (section 6); the floor is not the decor leaf's albedo; not located.
3. **`diag-nest-space` publishes no chamber focus** and the test world's opening is never done (section 7, panels): two stand-ins left in `panels.mjs`; sim.
4. **The architect's food-chamber plan sits "Stalled: No diggers free"** with 14 workers on seed 1, day 5 (seen in the colony view of the first baseline run): the colony has a full larder and no way to dig the chamber the alert asks for unless the player assigns diggers; sim (architect / allocation). The script plays it as a player (plans the chamber, raises the digging share).
5. **Outdoor puddle**: a pale polygon with straight edges at a grazing angle in rain, a black polygon at night (`water2/after2-outdoor-puddle.png`, `sheets/item6-night-final.jpg`); the flood sheet in the nest is now the better one. `src/render/world/decor` water layer.
6. **Outcome card**: the picture is small (half the free band) when the queen stands at an end of a deep cell, and a pale cut piece of ground-level geometry (a stone or leaf above the slice plane) shows next to the HUD's top corners on seeds 2 and 3 (`sheets/item5-cards-final.jpg`); seeds 2 and 3 were not re-shot after the perspective term.
7. **The trail forms only through the player's forage marker on seed 1** (13,200 ticks, no scout found the spill in 9000): forage / scouting; the first hour's "worker follows a trail" beat is the player's doing there.
8. **Colony orders panel at 1280 x 720** is cut at the bottom (the Defend row, `full-s1/17-queen-colony-orders.png`, `full-s3/17-...`); it scrolls, but nothing says so.
9. **Observer pose of beat 22 on seed 3** has a grass blade across the lens (`full-s3/22-day-3-8x.png`): `clearPose` ignores plants near the camera (script).
10. **The queen's prompt "E Drink sugar" in the nest** at beats 16 to 19 with no sugar to drink (seen in `full-s1/17-queen-colony-orders.png`): check with the possession prompt owner; unverified.
11. **Colony view at its closest zoom, the time-lapse light, the kitchen-door weep vents, far buildings at overcast**: unchanged from look pass 6.

## 9. Acceptance

| Criterion | Status | Evidence |
|---|---|---|
| Typecheck clean on my paths | met | `npx tsc --noEmit -p .` prints nothing |
| Tests green folder by folder | met | `src/render/world/weather` 29, `src/render/ants` 134, `src/render/creatures` 130, `src/render/slots` 38, `src/render/camera` 98, `src/render/world/decor` 45, `src/game/flows/founding` 34, `src/game/views` 161, `src/game/uiBridge` 79, `src/ui/hud` 114, `src/content` + `src/input` 215, `tests/docs/docs-final.test.ts` 8 (`test-output/app4/vitest2.log`, `run-probe.log`, `run-leaf4.log`) |
| Before / after pictures for items 1 to 6 under `test-output/app4/` | met | `planner-before/after`, `sheets/item3-*`, `sheets/item4-*`, `card4` -> `probe-s1`, `sheets/item5-*`, `sheets/item6-*`; item 6's leaf part is not finished (section 6) |
| Unit tests: planner anchor, occluder fade rule, stores-full feedback | met | `colonyTools.test.ts`, `occluderFade.test.ts` + `lookFixes.test.ts`, `storesFull.test.ts` |
| Item 7: three full runs or each failing beat with cause / owner | partial | seed 1 passes; seeds 2 and 3 reach beat 25 and fail the growth check, cause and owner in section 7 |
| Draw calls / triangles low / medium / high not up more than 5 % on the same staged scene | met (low not comparable) | fade rule medium on vs off: 70 -> 67 draws, 306,631 -> 284,565 triangles; moon rim off vs on: medium 89 -> 89 / 668,876 -> 670,572, high 102 -> 102 / 947,607 -> 958,807 (+1.2 %), low 86 -> 57 draws between two runs of the same staging before the rim code existed (the staged scene is not stable at low); flood sheet 820 vs 598 triangles, no extra draw call |
| Report with picture paths and the unfinished list | met | this file |

## 10. Files, contract changes, notes for the integrator

Contract changes (additive): `UiPossessed.storesFull?` (`src/ui/api.ts`); `FoundingShotSubject.minRadiusBu?` (`src/render/camera/foundingShot.ts`, carried by `copyShotSubject` and `easeShotSubject`); `AntRenderStats` fields `faded`, `hiddenAnts`, `fadeOn`, `fadeMaxWeight`, `fadeDbg`;
the instance attribute `aFootB.w` of the ant batches now means "hidden" 0..1 (the old subject-dither capsule uniforms `uCapA/B/R/Opacity` are gone; the subject's own fade is unchanged); `foundingShotSubject(sim, out, wholeCell)` takes a third argument; `cellFootprint(field, anchor, planeY, bu)` is new (`flows/founding`).
DEVIATIONS rows D-APP4-1 to 6. MANUAL: opening steps 4 and 6, stores full (section 14), planner step 2, flooding, ants fade, the rendering limits paragraph.
Scripts: new `app4-planner.mjs`, `app4-card.mjs`, `app4-card2.mjs` (the handover saves hold no card: unused), `app4-water.mjs`, `app4-fade.mjs`, `app4-probe.mjs`; `firstplay.mjs` (plan placement as a player, `render(1)` after every `colonyCamera`, the full-larder step, beat 12b, `FIRSTPLAY_CARDPROBE`), `stage1a.mjs` (cutAway), `panels.mjs` (comment only).
Queue scripts under `test-output/app4/run-*.sh`. One 8-test vitest file ran while a harness was running (2 s), noted in the progress file.
For the sim owner: sections 7 and 8, items 1, 3, 4, 7 and the controls finding.
