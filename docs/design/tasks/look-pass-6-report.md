# Look pass 6 — report

Written 2026-11-24 by the third engineer on the task (the first two were cut off by machine restarts; their work is in the tree and in
`docs/design/tasks/progress/look-pass-6-impl.md`). Task: `docs/design/tasks/look-pass-6.md`.
Pictures are under `test-output/look6/` (git-ignored). Contact sheets of the main before / after pairs: `test-output/look6/sheets/`.
Every picture cited here was looked at with the Read tool. Tiers are the player's: low, medium, high.
The machine was shared with the simulation engineer's life runs and browser all day: frame times are SwiftShader numbers on a loaded machine.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean on my paths; tests green folder by folder | VERIFY_STATUS | "Verification" |
| 2 | Items 1-3: before / after pictures, same pose, three tiers, the after stands on its own | met for 1, 2, 3 with the caveats listed | below |
| 3 | Draw calls and triangles within 5 % of look-pass-5's table | met | "Cost" |
| 4 | No frame-time regression at low from the night lighting | met (within noise) | "Cost" |
| 5 | This report with picture paths and the still-unfinished list | met | end of this file |

## Item 1: the possession camera inside the founding cell and the shaft

**Causes** (pictures `test-output/look6/before/s1-low-09-sealed.png`, `s1-low-10-first-clutch.png`; the same frames with the cell camera switched off at
medium and high: `r-s1-medium-cc0/`, `r-s1-high-cc0/`):
- The cell is 18 x 10 x 16 mm round a queen of 8.5 mm. The possession rig's camera cannot back off in it: it ends 0.8 to 1.7 body lengths from her, inside
  her fade radius, so her body is drawn through the 4x4 ordered dither of GDD 01 6.5 rule 1 (the "screen-door dots"), and the occlusion cone of the same rule
  dithers the soil between camera and ant and shows the dark earth behind it. With the camera that close the near plane clips the wall into flat planes.
- The "block of white noise" at the bottom of the frame is what the camera sits in: the digging's dust puffs (soft pale discs, `render/fx/particles`) piled on
  the dithered soil. The "pale strip" is a wall facet cut by the near plane. I did not separate the two further: neither occurs with the cell camera.

**Fix** (GDD 01 6.2-6.5 and GDD 08 11.5 are silent about a room this small, so GDD 08 7.10's rule decides: cut the soil away, do not push the camera into her):
`src/render/camera/cellCam.ts` (new, pure maths, `cellCam.test.ts` 12 tests), `ViewDirector.applyCellCam`, constants `CELLCAM_*`.
When the rig's camera is squeezed (closer than 1.9 body lengths for 0.3 s, underground) the picture becomes the founding shot's view of her: above and behind
her with a horizontal slice through the open air over her back, or, for a queen on a steep wall or under a low roof (a horizontal slice would cut her), a view
from her side through a vertical section a little in front of her (`cellSideShotAt`). Her fade and the occlusion cone are off, the cut faces are rasterised with
0.1 BU texels (the colony view's 0.5 BU gave a pale ring), the camera is aimed at the open side of her room, follows her heading and orbits with the player.
The "cell cut-away" count as clear air in the e2e clearance check (`views.cameraInCutAway`).

**Pictures** (queen, real founding, `firstplay.mjs` or its replay `look6-cell.mjs`):
- seed 1, low: `test-output/look6/fp-s1/{08..10}-*.png` (real founding); before at low: `test-output/look6/before/`.
- seed 1, medium and high, before (cell camera off) and after, replayed from the same save at beat 08: `test-output/look6/r-s1-{medium,high}-cc{0,1}/`;
  sheet `test-output/look6/sheets/item1-s1-medium-high-before-after.png`. Before: the camera is inside the queen, her gaster fills the frame and is
  dithered; after: the queen is whole in her cell, undithered, the walls read as soil.
- seed 2: `test-output/look6/rec-s2-medium/{08-founding-chamber,s2medium-08-chamber,s2medium-09-sealed,s2medium-10-first-clutch}.png` (medium) and
  `test-output/look6/fp-s2b-medium/` (medium, real founding to beat 12). Low: `test-output/look6/s2-rec/07-inside-shaft.png` only (see "Not done").
- a worker in a tunnel and in a crowded chamber on a live colony (cheat-founded colony, 8 more workers round her in the chamber): low `test-output/look6/cc/cc-{before,after}-noon-{nest,tunnel,crowd}-low.png`,
  medium and high `cc-{before,after}-noon-{tunnel,crowd}-{medium,high}.png`, `cc-after-noon-nest-{medium,high}.png`. Draw calls and triangles are the same
  before and after at medium (tunnel 295 640 / 295 640, crowd 546 326 / 546 326): the cell camera does not take over for a worker in a tunnel or a chamber
  (she is not squeezed), so these pictures show that nothing got worse. In the crowded chamber ants between the camera and the possessed worker are dithered
  (GDD 01 6.5 rule 2, working as designed): `cc-after-noon-crowd-low.png` shows hatched legs at the left edge. That reads as noise; it is listed as unfinished.
  A second finding in `fp-s2` at low is listed under "Not done".

## Item 2: night

**Cause.** Look pass 3 had lowered the night metering to `targetE` 1.9 so that "night does not read like an overcast day": the ground came out at display
luminance 0.11 clear and 0.107 in rain (`test-output/look6/night/a/n-v0-h22-rain-surface-low.png`, `b/b-v0-*`), dark soil on a dark field, the first workers
barely visible. GDD 08 11.2 asks that night "must stay readable" (+1.2 EV); the manual's intent is a night that reads like an overcast day.

**Fix.** `NIGHT_LOOK.targetE` 1.9 -> 4 and `maxEV` 5.5 -> 6.5 (`render/world/lighting/constants.ts`): the camera's exposure rises, the moon key, the cool
fill, the low saturation and the soft moon shadows are unchanged, so the night stays cool and recognisably night (stars, blue key) while the ground, the ants,
the entrance and food within 60 BU read. Tried and rejected: `targetE` 6 (ground 0.31, `b/` and `a/n-v2-h22-rain-surface-low.png`) reads as a grey overcast day.
Measured in the game (same pose, `look3.mjs`, seed 1), ground luminance before -> after at low: clear 02:00 0.144 -> 0.243, rain 22:00 0.107 -> 0.191; at medium
rain 22:00 0.111 -> 0.206; at high clear 02:00 0.134 -> 0.254. By day the same pose reads 0.30 to 0.33 (`night/c/`).
`lookPass2.test.ts` and `lighting.test.ts` were re-pinned (bands 0.16..0.30, EV pins 4.1 / 4.3, dusk 2.33).

**Pictures.** Same pose, 12:00, 18:00, 22:00, 02:00, 05:00, clear and rain, ant height, low: `night/c/c-h{12,18,22,2,5}-{clear,rain}-surface-low.png`
(sheet `sheets/item2-night-hours-clear-rain-low.png`), observer height `night/c/c-h*-observerlow-low.png`. Before / after at medium and high, rain 22:00 and
clear 02:00: `night/b/b-{v0,v1}-*` (v0 = before, v1 = after). Before at low: `night/a/n-v0-*`. Beat 13 of `firstplay.mjs` no longer falls at night in the real
founding (it now reads 10:47 clear: `test-output/look6/o3-s1-low/13-first-workers-entrance.png`), so the night is shown by the staged scene above, not by beat 13.
Not covered: new moon against full moon (the staged game has one moon phase; the model test covers moonIllum 0.2 to 1).

## Item 3: the real founding's outcome card and the time-lapse

**Causes** (before: `test-output/look6/o3-s1-low/11-timelapse.png`, `12-outcome-card.png`; look5-fix `shot-s1/12-outcome-card.png`):
1. The queen stands on the wall of the cell (surface normal horizontal, up.y 0.01): the horizontal slice cut her. The founding shot now takes the cell
   camera's choice (`FoundingShotSubject.ant`, `ViewDirector.foundingShotSide`: side view through a vertical section for a queen on a steep wall).
2. The subject sphere was the spread of the animals round their centre (4 mm in a cell with one egg pile): smaller than her half length, so she filled the
   frame and was cut at its edge. The side view now holds a sphere of at least one body length.
3. The card covers the middle: at 0.42 lift and 0.74 fill she stood from 64 to 354 px of 720 and the card from 280 down covered her head. Now
   `FSHOT_CARD_LIFT` / `FSHOT_CARD_FILL` 0.55 / 0.55: she stands above the card, whole.
`firstplay.mjs` now stops after beat 12 with `FIRSTPLAY_UNTIL=12` (it used to run on to 13 and the trail check).

**Pictures** (real founding, no cheat): seed 1 low `test-output/look6/fp-s1/{11-timelapse,12-outcome-card}.png` (sheet `sheets/item3-s1-real-beats-09-12-low.png`, the
queen is large and whole in the time-lapse, partly under the card in the outcome card: this is the first fix, before the 0.55 / 0.55 change); seed 1 high, after all
three: `test-output/look6/fp-s1b-high/{09..12}-*.png` (sheet `sheets/item3-s1-high-real-beats-09-12-after.png`: queen whole above the card, her head touching its
top edge); seed 2 medium, after: `test-output/look6/fp-s2b-medium/{07..12}-*.png` (sheet `sheets/item3-s2-medium-real-beats-07-12-after.png`: first workers 7, reserves 72 %,
queen whole above the card). The simulation engineer's fix landed: both seeds pass beats 01 to 12 with the real founding (seed 2 with a flood alert during the lapse).

## Item 4: the smaller ones

- **"Poor" with five of seven rows full.** The word is the sim's (`word: poor`, chamber Q 0.71 against the fair threshold 0.72: directions K); the dots are per
  factor and Warmth is the empty one. The word was right; the advice now names the weak reading: "Shaded: look for open, sun-warmed soil. It is the only weak
  reading." (`siteAdvice.ts`, test in `siteAdvice.test.ts`). Picture: `test-output/look6/o3-s1-low/05-site-readout.png`.
- **The grey blurry square in the seed-2 shaft** is the **flood-water sheet** of the rain seeping into the shaft (`render/world/weather/floodWater.ts`), seen
  edge-on over the lowest cells of a sloping tunnel. Proof: with particles off, ghosts hidden and caps hidden the square stays
  (`test-output/look6/fp-s2/07x-{no-particles,no-ghosts,no-caps}.png`, sheet `sheets/item4-grey-square-probes-s2.png`). Recoloured from a dark grey-green film to a
  cool blue-green glossy sheet with a firmer edge (`weather/tuning.ts`): `test-output/look6/fp-s2b-medium/07-inside-shaft.png`, `08-founding-chamber.png`.
  It still is a flat sheet cut by the carve cells: listed as unfinished.
- **The left tool rail's last icon under "Queen's reserves"** in the time-lapse: the gauge is now at 23 rem (it was 20 rem, over the rail's fifth icon):
  `fp-s1/11-timelapse.png` shows the five icons whole.
- **The roster's "Where" column** printing chamber ids ("Royal 5740", cut as "Nursery ..."): it prints the chamber's kind in words (`rosterSlice.ts`, `words.ts`,
  `CHAMBER_WORDS`): HUD_ROSTER_RESULT.
- **Buildings washed to pale grey at overcast.** The haze follows GDD 08 11.4 exactly (+20 % denser at overcast, `WEATHER_LOOK.overcast.hazeMult` 1.2, visibility 300 BU on
  the lawn, FogExp2): a building 300 BU away keeps 24 % of its own colour. I did not change it; a stronger or weaker haze would depart from the GDD. Not fixed, reported.
- **Title screen horizon** (a speckled band): the dithered fade-in of the world-edge skirt (`SKIRT_BLEND_BU` 80 BU of hashed alpha, green on brown) is the band.
  80 -> 28 BU: `test-output/look6/title/title-{low,medium,high}.png` before, `title/after-{low,medium,high}.png` after (the speckled line is now a smooth band;
  what speckle remains is the grass blades' own fuzz).
- **Clover head's white polka dots** (`test-output/look6/clover/clover-{low,medium}-before.png`): the shader finish drew big bright cell centres on a dark net and,
  at the rim, discarded the cell corners into a lattice of discs; with parts (medium) the core under them used the same cells in purple and white. Finer cells, a
  gentler 0.86..1.0 modulation, no discard, a uniform core under the parts: `clover/clover-medium-after.png`, `clover-low-after3.png` CLOVER_RESULT.
- **Weep vents as white ticks** (`test-output/look5/item3/after/full.png`): the white bar is a plastic prim of the interior catalogue
  (`src/worldgen/catalog/interior/shell.ts`, "weep-vent grilles: one plastic bar splits the open perpend into two slots"), not a render fault; the prim is not mine.
  Not changed. Needs worldgen: a buff or dark bar colour. Reproduction: seed 1 archetype kitchen-door, observer 60 mm from the wall foot.

## Item 5: reduced motion and the light of the lapse

**Cause found by looking.** The camera transition's `dip` (the dip-to-dark of a long camera hop and the 0.2 s crossfade of reduced motion, GDD 08 2.4 and 7.10) was
computed by `ViewDirector` and read by nobody: it was never drawn. `Game.renderScene` now draws it as the canvas opacity (the HUD is another element and stays);
the page behind is the game's dark ground. Seen in a browser with reduced motion on (`look6-rm.mjs`, `test-output/look6/rm/rm.json`): the opacity reaches 0.58 at the
darkest frame of the retake every 3 s and is back to 1 within 0.2 s. I have no picture of the dimmed frame: Playwright's screenshot redraws the frame (a resize with dt 0)
and the opacity is back to 1; the numbers are the evidence. Debug additions: `renderFrame({ dt })` draws a frame of that length, `__game.lighting()`.

**Light.** The founding shot lights the world as at 17:30 whatever the clock says; the light was cut in and out in one frame (night exposure 4.38 EV -> 0.48 EV, key
light 0.07 -> 2.97). `WorldRenderer` now crossfades the lighting state over `LIGHT_SWITCH_S` 1.2 s at each cut (`copyLighting` / `blendLighting`, tested in
`lookPass2.test.ts`). Measured (`test-output/look6/rm/rm-light.json`, frames of 0.15 s): shot starts, exposure 3.29, 2.59, 1.87, 1.21, 0.72, 0.49, 0.48; shot ends 0.68,
2.26, 2.99, 3.64, 4.13, 4.37, 4.38. The light does not jump.

## Item 6: the final scripts

SCRIPTS_RESULT

## Cost (acceptance 3 and 4)

`tests/e2e/frametime.mjs`, seed 1, observer over the nest after the cheated hand-over, `FRAMETIME_N=3` (`test-output/look6/ft-day.log`), against look-pass-5's table
(`look-pass-5-report.md` "Cost"). My changes add no geometry to this scene (no cell camera, no founding shot on screen); the run is the same staged scene
(hand-over tick 25 605 in both).

| quality | draw calls now / look 5 | triangles now / look 5 | min frame ms now (look 5) |
|---|---|---|---|
| low | 75 / 74 (+1.4 %) | 582 939 / 579 291 (+0.6 %) | 6 743 (7 057) |
| medium | 107 / 108 (-0.9 %) | 733 935 / 731 114 (+0.4 %) | 8 910 (6 539, load) |
| high | 120 / 119 (+0.8 %) | 1 008 278 / 1 004 640 (+0.4 %) | 10 881 (8 680, load) |

Night against day at low, same scene (`ft-night.log`, 23:30, rain): 74 draw calls, 579 939 triangles, min 6 921 ms against 6 743 ms by day (+2.6 %, inside the run-to-run
noise; the night look changes uniforms, not draws). The worker views of item 1 at low differ by +7 % to +14 % in triangles between the before and the after run
(nest 282 312 -> 316 374, tunnel 174 632 -> 187 214, crowd 337 000 -> 384 708) but are identical at medium (tunnel 295 640 / 295 640, crowd 546 326 / 546 326): each run stages
its own colony by cheat, so I read the low difference as ants and not as the camera. The cell camera's cut faces (finer texels) are on screen only while a possessed ant
is squeezed in a cell, which is not the table's scene.

## Verification

VERIFY_BODY

## Decisions and deviations

- The night is brighter than look pass 3 deliberately (the integrator's ruling in this task), `targetE` 4; the pinned band and EV numbers of two tests were changed with it.
- GDD 08 7.10 (cutaway) decides the tight-room camera, because GDD 01 6.2-6.5 and 08 11.5 are silent: recorded in `constants.ts`.
- GDD 08 11.4's overcast haze (+20 %) is kept as it is (item 4).
- The card's lift and fill changed (0.42 / 0.74 -> 0.55 / 0.55) for the 1280 x 720 reference card; other window sizes keep the proportions.
- The canvas-opacity dip is a deviation from "the app draws a full-screen fade": no extra element, the same visual.
- Added debug hooks: `__game.renderFrame({ dt })`, `__game.lighting()`, `__game.views.hideLayer(name)`, `__game.views.cellCam(on)` (earlier pass).

## Needs from others (not mine to edit)

1. `src/worldgen/catalog/interior/shell.ts`: the weep-vent bar is bright white; a buff or dark colour removes the "white ticks".
2. `src/sim`: at seed 2 rain floods the founding chamber during the first brood (alert "Founding chamber flooding", seen in `fp-s2b-medium/08..11`); the card still reads
   "First workers: 7" because the colony survives. The site read-out calls the flood safety "Raised".
3. `src/sim`: beat 14 of `firstplay.mjs` fails at seed 1 (no forager laid a trail to the food within 18 000 ticks, `o3-s1-low.log`).

## Not done

- Seed 2 at low: only beat 07 (`s2-rec`) and the first failing run (`fp-s2`: beat 08 "the camera is inside solid in the chamber", state tunnel, field -2 mm, no cut-away). Not
  reproduced at medium (twice) with a picture; `firstplay.mjs` now takes the picture before the check and logs the cell camera's state: RETRY_RESULT
- Medium and high pictures for seed 2 of beat 09 to 10 exist at medium only.
- The 45 degree possession-camera case of look pass 5 item 6 was not revisited.
- New moon against full moon at night was not pictured.

## Still unfinished, most serious first

STILL_UNFINISHED
