# look-pass-3 report (Sonnet implement)

Engineer: look-pass-3 impl (second session after the 18:55 restart; the first one left item 6 in code and the first "before" night shots).
Progress log: `docs/design/tasks/progress/look-pass-3-impl.md`. Evidence root: `test-output/look3/` (git-ignored).
Machine load average 7-12 on 4 cores throughout; every browser run was one at a time (SwiftShader, 3-4 minutes a shot).

**This report is a working copy written while the check runs were still going; section 5 and the verdict table are completed at the end
(see the bottom of the file for what was and was not measured).**

## 0. How the pictures were taken

`tests/e2e/look3.mjs` (new): the real game staged by `tests/e2e/lib/look2-stage.mjs` (founding cheat, seven workers by the entrance, possession on the
surface), one script and one pose for before and after, UI hidden (plates), luminance numbers from `look2-measure.mjs` logged per shot.
Views: `surface`, `observerlow`, `close` (400 x 225 px around the ant), `gyne` (a gyne and a male beside the worker), `mound`, `edge`, `queenstart`,
`slice`, `slopeup`/`slopedown`; lights: night, night-overcast, night-rain, dusk, dawn, noon. `LOOK3_VARIANTS=<json>` evaluates a patch in the page
between shots (live modules), which is how the night look and the ant fill were tuned on one staged game (`test-output/look3/tune/`).
**BEFORE pictures use the original code**: my render files were put back to commit `29d44ee` (the first snapshot after the restart) for that run only
(`test-output/look3/mine/stash.sh`, restored by `unstash.sh`), then the AFTER run used the new code. The sim keeps running between runs, so the poses
are the same script and the same staging, not bit-identical (the worker is a few mm elsewhere in some shots: look at the numbers, not at one mm).

| Folder | What |
|---|---|
| `test-output/look3/before/` | original code: night x 5 lights x (surface, observerlow); close, gyne, edge, mound, slope, queenstart, slice, quality test/medium; replete gaster |
| `test-output/look3/after/` | new code: same list (`after-*`), then the shots re-taken after a second round of fixes (`after2-*`: observerlow, slice, edge, gyne, queenstart, close) |
| `test-output/look3/tune/` | the tuning variants (`tune1..4-*`) |
| `test-output/look3/checks/` | browser scripts of acceptance 3 |

## 1. Items, most serious first (each: picture before and after, cause, fix)

### 1. Night at ground level (S4)

Cause: `NIGHT_LOOK` metered the moonlit ground to a target (`targetE` 2.45, floor `minEV` 2.6) that put +3.4 EV on the frame, the night keys kept
saturation 0.7 / 0.75, and the sky-environment light (PMREM) was lifted with the exposure too: a mid-blue sky, saturated leaves and white pebbles read as an
overcast day (ground luma 0.164 in clear, 0.160 in rain).
Fix (`src/render/world/lighting/constants.ts`, `timeOfDay.ts`): `targetE` 1.7, `minEV` 2.2, night key saturation 0.5 / 0.55, a darker overcast night
sky (`overcastSkyRgb`), new `NIGHT_LOOK.envKeep` 0.35 (the share of the sky-environment light kept at night), `STARS_DOF_GAIN` 0.05 (the DoF star discs read as
falling snow). The moon key and the fill are unchanged, so the ant, the ground within 5 BU and the trail cues stay readable (the ant keeps its own form light, item 2).
Tests (`lookPass2.test.ts`, `lighting.test.ts`): exposure pins 3.418 -> 2.891 (clear) and 3.593 -> 3.065 (rain), dusk 2.24 -> 2.13; the ground-luma band
12..25 % became 9..17 % (model 0.132 at the calibration albedo; game: 0.095-0.123 measured); new asserts: night saturation below 0.6 and the environment light
below half of the daytime one. Reasoning for the band: 0.10 median luma on the ground is a dark scene in which the 8-bit ground still shows texture
(see the pictures), and the old 0.16 was what made it read as day.

Median luminance of the ground within 20 body lengths / of the whole frame, same script and pose (`look2-measure`), quality high, seed 1:

| Light, view | before ground / frame | after ground / frame |
|---|---|---|
| night, surface | 0.164 / 0.207 | 0.111 / 0.149 |
| night overcast, surface | 0.168 / 0.281 | 0.107 / 0.138 |
| night rain, surface | 0.160 / 0.237 | 0.095 / 0.138 |
| dusk, surface | 0.231 / 0.412 | 0.124 / 0.224 |
| dawn, surface | 0.262 / 0.497 | 0.183 / 0.378 |
| night, observer low (frame) | 0.159 | 0.107 |
| night overcast, observer low (frame) | 0.165 | 0.103 |
| night rain, observer low (frame) | 0.166 | 0.098 |
| dusk, observer low (frame) | 0.261 | 0.149 |
| dawn, observer low (frame) | 0.314 | 0.240 |

Pictures (each pair looked at): `test-output/look3/before/before-<light>-<surface|observerlow>-high.png` and `test-output/look3/after/after-<light>-<...>-high.png`
for `night`, `night-overcast`, `night-rain`, `dusk`, `dawn`. Clear night: dark navy sky, desaturated grass, dark ground with the pebbles no longer white;
overcast and rain: a dark cool lid, wet leaves dull. Dusk and dawn stay warm and bright, as dusk and dawn should (they blend into the night look over the sun's
elevation 2 .. -6 degrees; the dusk exposure moved with the night target: 2.24 -> 2.13 at the horizon).
Tuning on one staged game with patched live modules: `test-output/look3/tune/tune1-*` (variant `a` kept, `b` with targetE 1.3 was too dark: ground 0.082).

### 2. Ants at night, in rain and underground (S5, S8, S12, S15, S16)

One cause for most of it: the night ant was lit by three things at once, each tuned alone. The form light (`ANT_FILL`) lifted the black cuticle to mid-grey, the
possession highlight and the form light's rim drew every thin part (legs, antennae: all silhouette) as a full-strength pale line, and the sky reflection in the
clearcoat was lifted with the night exposure. Result: grey glass with white wire legs at quality high, wire sketches at quality test, milky bodies in rain.
Fixes (`src/render/ants/`): `ANT_FILL` night body 1.1 -> 0.7 and rim 0.3 -> 0.22; new `ANT_FILL_RIM_THIN` 0.3: the rim gain on legs and scapes/funiculi
(vertex varying `vAntK.y`, applied to the form light and to the possession highlight); `NIGHT_LOOK.envKeep` (item 1) takes the reflected sky out of the clearcoat
at night, which is also the night-rain fix; a stretched gaster membrane gets a dull clearcoat (`vAntK.x` 0.1 on a swollen membrane) and the membrane
colour of the four species is a dull pale brown (Lasius `#bba98a` -> `#8c7a5e`, others similarly) instead of near white; the wings take a faint cool edge light and a
higher alpha at night (`uFillK`, `WING_EMISSIVE`) so a clear membrane does not vanish against a dark ground.
Pictures (400 x 225 px around the possessed ant, `close` view): `before/before-night-close-high.png` -> `after/after-night-close-high.png`; `before-night-rain-close-high` ->
`after-night-rain-close-high`; quality test (the wire sketch of the first workers, S12): `before/before-night-close-test.png` -> `after/after2-night-close-test.png`;
gyne and male at night (S8): `before/before-night-gyne-high.png` -> `after/after2-night-gyne-high.png`; replete gaster (S16, the ants demo because the game has no full-crop cheat):
`before/before-replete-a.png` -> `after/after-replete-a.png` (white rings -> thin dull tan lines). Tuning variants: `tune/tune4-e0|e1|e2-*` (e1 kept).
Not changed / open: S5 (the pale see-through ant ahead of the possessed worker in a tunnel, `playSeed1/x4-m16-possession.png`) could not be reproduced with the
harness today; from the picture it is a callow worker (pale golden by design, GDD 08 11.6) seen through depth of field in the warm underground light, not a material
defect, so it is unchanged. The gaster of a night ant still has a soft grey highlight (it reads as polished chitin, no longer as glass).

### 3. Cameras (S10, stage1a strict, observer after the colony view)

* **Slope**: the open-state orbit sits in the surface's tangent plane behind the ant, so climbing a slope the view looks up it at the sky with the ant at the lower
  edge. `ThirdPersonRig` now raises the orbit elevation by `CAM_SLOPE_LIFT_K` (0.85) x the pitch of the heading above the horizon, at most 40 degrees, eased over 0.4 s
  (`src/render/camera/constants.ts`, `thirdPersonRig.ts`); the flat and downhill cases add nothing. Test `thirdPersonRig.test.ts` "slope lift": the settled view pitch on
  a 20/30/40 degree uphill slope is below 0.45 x the slope (20.8 degrees without the lift on a 20 degree slope, 9 or less with it). **Picture: not shown.** The steepest
  flank within 16 BU of the entrance of seed 1 is 10 degrees, and the worker ended up on a vertical face in the `slopeup` shot (`after/after-noon-slopeup-high.png`, the camera
  rolls with the surface as designed), so the steep scene of `firstplay/14` could not be staged by cheat; the unit test is the evidence.
* **Low room (stage1a strict)**: the guard moved the camera to the pivot base when no position cleared f >= 0.5 R, and in a queen's cell 0.4 mm below the ceiling the base
  itself did not. The camera sphere now shrinks to what fits at the pivot base (down to 8 % of the GDD radius, eased back over 0.5 s; `radiusMm` reports the effective
  radius, so "f >= 0.5 x radius" holds wherever any camera can stand): `CAM_TIGHT_*`, `ThirdPersonRig.fitRadius`. Tests `thirdPersonRig.test.ts` "tight room". Browser:
  `STAGE1A_STRICT=1 STAGE1A_SKIP_HIGH=1 stage1a.mjs`: the chamber camera check (row 5 of the gate report) **passes** (`checks/stage1a.log`: egg path 6 laid by the real opening,
  shaft interior camera f 1.78 mm / radius 2, `04-chamber-queen.png`); the run then stops at the later check "GPU resources grew across quality switches" (section 5).
* **Observer after the colony view**: leaving the colony view for the observer followed the released ant, and an ant released from underground put the orbit camera inside the nest
  (`check4/rain-pip.png` of the gate round). `observerAfterColony` (`src/game/views/viewSwitch.ts`): an underground followed ant is not followed; the observer stays free
  at the colony camera's pose. Test `src/game/views/observerAfterColony.test.ts` (3). Not pictured (the scene needs a whole colony view round trip).

### 4. World dressing at ant height (S9, S11, S13, far structures)

* **Leaves (S9)**: the draped leaf layer is held within 0.034 BU of the ground by a hug rule that the verify tests pin (a lift of 0.048 BU made one ray sample fall off the card in
  `drapedShape.verify.test.ts`), so the card cannot get a thickness of its own. Instead (`drapedMaterial.ts`, `DECOR_LEAF` in `decor/tuning.ts`): the cut margin is a lit edge
  (+45 %), and the ground beside the margin gets a stippled dark contact fringe (density 1.0 at the margin, reach 0.11 of the card, four alpha taps, leaves only, near leaves only). Picture:
  `before/before-noon-observerlow-high.png` -> `after/after2-noon-observerlow-high.png` (the leaves now sit in a dark rim instead of lying on the soil like stickers). **Partial**: a
  leaf is still flat, the fringe is a 2-4 px dither at this size; a real curl would need the hug rule changed (draped-decor owner).
* **Horizon strip at night (S11)**: the first rows of the skirt are lawn green and, metered by the night exposure, a lime strip along the horizon. `SKIRT_NIGHT_ALBEDO` 0.3 darkens the skirt with the
  night weight (`boundaryRenderer.update`, test `nightHaze.test.ts`). Picture: `before/before-night-edge-high.png` -> `after/after2-night-edge-high.png` (a dark soft horizon, no strip).
* **Mound foot (S13)**: the footprint edge is where the interpolated pile crosses `MOUND_MIN_PILE_MM`, a straight line per cell. The cut-off is now raised by up to
  `MOUND_RIM_RAG_MM` (1.3 mm of pile) by a two-octave world-space noise: a ragged scatter of crumbs. Picture: `checks/firstplay/13-first-workers-entrance.png` and `checks/founding/09-handover-entrance.png`
  against the gate round's `founding1/09-handover-entrance.png` (see section 5 for what was looked at). A cheat-staged game has no mound, so no look3 shot.
* **Far structures**: the backdrop house (`boundary/backdrop.ts`) was one pale box; it has a plinth, a roof with eaves, two storeys of windows with sills and a door now
  (`BACKDROP_SIZE.facade*`, `BACKDROP_HEX`). Picture: see section 5 (`after/after3-noon-edge-high.png` against `before/before3-noon-edge-high.png`, if the run finished).
  **Not fixed**: the pale flat blocks of `firstplay/04-queen-surface.png` are worldgen structures (plaster prims) drawn by the primitive layer, hazed and sunlit to a flat white at
  that distance; they need windows and trim in the worldgen catalogue or a prim-material change that I did not make (reproduction: `checks/firstplay/04-queen-surface.png`, seed 2, quality test).

### 5. Colony view labels (S18)

Cause as the gate round found it: the label sprites have no depth, so the depth-of-field pass blurred them with the ground behind. First attempt (the sprites write their own depth) made
it **worse**: `after/after-noon-slice-high.png` shows the label blurred wider than before, because the label's depth is not the focus depth. Reverted. Fix: the colony view is read, not
photographed, so it draws without depth of field (`COLONY_VIEW_DOF_STRENGTH` 0, `viewDofStrength`, accessibility controller; test in `accessibility.test.ts`). Picture:
`before/before-noon-slice-high.png` -> `after/after2-noon-slice-high.png` (the label text is sharp). The original smear needed a particular focus distance and did not show in the
before picture of this pose, so the improvement is by construction and the check is that the label is crisp.

### 6. HUD and text

* **Pad View tap**: the pad poller counted a tap by real milliseconds, so one slow frame turned a tap into a hold. Both pad readers (`src/input/sources.ts`, `src/ui/nav/padReader.ts`) now count a
  press seen in at most `PAD_TAP_MAX_POLLS` = 2 polls as a tap (reported as that many nominal 17 ms frames), whatever the clock says; a hold needs more than two polls. Tests:
  `src/input/inputState.test.ts`, `src/ui/nav/nav.test.ts` (the old "reports edges" test now presses over three polls). Browser: `panels.mjs` second half
  (`PANELS_ONLY=markers,hudfix,keys,tools,sizes`, `checks/panelsB.log`): "a tap of View puts the pad focus on the tool UI" **passes** (first try, 4 retries allowed as before); the run
  then stops at the next assertion, "the D-pad reaches an overlay button" (focus stayed on the forage tool after nine D-pad lefts), which the gate round never reached
  because it failed at the tap. Whether that is mine: `checks/panelsB-orig.log` is the same half with the original readers (see section 7).
* **Speed control flash and `time.auto-slow`**: `AutoSlowWatcher.apply` now says why (`AutoSlowWhy`), `Game.onAutoSlow` sets the speed, emits the sim event `time.auto-slow` (alert kind,
  level, `slow`/`pause`) and counts a flash; `UiSpeed.autoSlowFlash` -> `TimeCluster` adds `is-flash` to the selected speed button for one 900 ms animation (`hud.css`, a 300 ms fade in reduced
  motion). Unit tests: `autoSlow.test.ts`, `uiBridge.hud.test.ts`. Browser (`tests/e2e/look3-hud.mjs`, `checks/hud2.log`): at 8x a critical alert drops to 1x, the selected button carries
  `is-flash` with `animation-name: fd-speed-flash`, `flashes` = 1 and the event `{"type":"time.auto-slow","alertKind":"nest-collapse-risk","level":"critical","action":"slow"}` was seen on the
  bus. No picture: the animation lasts 900 ms and a frame takes seconds here, so the whole check runs in one page call (DOM read, as for the sound-cue pips of the gate round).
* **New Game rules**: `src/sim/config/presetDisplay.ts` rows whose `inEffect` flag is false show a "Not in this build" tag and are disabled (`presetRows.ts`, `NewGame.tsx` `PresetDetails`,
  `screens.css`; test `newgame.test.ts`). Picture: `checks/firstplay/02-new-colony.png` (the rules column; the detail rows are inside the folded "What Naturalist changes").
* **Season of the founding flight (R20, day 5, spring)**, every player-facing string that names it:
  1. `src/ui/screens/newgame/species.ts` Lasius card `foundingSeason` 'summer' -> 'spring', and `foundingSeasonOf(id)`, which reads the season from the sim data's `opening.startDoy.default`
     (day 5 of a 7-day season = spring) so the screens cannot drift from the data again;
  2. `src/ui/screens/Loading.tsx` ("Season ... natural start") and `NewGame.tsx` (the Natural start option) use `foundingSeasonOf`;
  3. `src/content/text/alerts.ts` sample text for the flight alert;
  4. `checks/firstplay/04-queen-surface.png` shows "Spring . Day 5 . Year 1" in the clock after the opening (looked at).
  Left, not mine: `src/sim/species/data/lasius-niger.ts` still has `foundingSeason: 'summer'` (sim data), and the title screen's backdrop vignette
  (`src/game/title/titleWorld.ts`, "summer day 3") is a backdrop, not text about the founding flight.

## 7. Acceptance criteria, one by one

Final night numbers after the last small lift (targetE 1.9 / minEV 2.3, section 1 table is at 1.7): `after/final-night-surface-high.png` ground 0.127 / frame 0.165, `final-night-overcast-surface-high`
0.119 / 0.154, `final-night-rain-observerlow-high` frame 0.115, `final-night-close-high` ground 0.120 (before: 0.164, 0.168, 0.166, 0.164). Pins and band tests are at 1.9 (EV 3.051 clear, 3.226 rain, ground model 0.147).

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Typecheck clean; tests green folder by folder | see section 8 (filled when the last run finished) | section 8 |
| 2 | Before/after pictures for every item, same script and pose, each looked at | **partial** | items 1, 2, 4 (leaves, horizon strip), 5 have pairs; item 3 has unit tests only (the steep slope and the colony-view round trip could not be staged by cheat); the mound foot and the backdrop house have no same-pose pair (a cheat-staged game has no mound, and the `noon:edge` pose faces no house: `before3`/`after3-noon-edge-high.png` are identical); the far world-structure blocks are not fixed |
| 3 | `stage1a.mjs` strict, `panels.mjs` both halves, `photo.mjs` quick, `views.mjs`, `controls.mjs`, `firstplay.mjs` beats 1-20 | **partial**, see below | `test-output/look3/checks/` |
| 4 | Draw calls and triangles at low / medium / high on the seed 1 colony not above +10 % | **met** | below |
| 5 | Report with the picture paths | **met** | this file |

Acceptance 3 in detail (`checks/<name>.log`; browser runs at load average 7-12, each alone):

| Script | Result |
|---|---|
| `views.mjs` | **pass** (`views.log`) |
| `controls.mjs` | **pass** (`controls.log`) |
| `stage1a.mjs` strict (`STAGE1A_SKIP_HIGH=1`) | the chamber camera check, which was red in the gate round, **passes**; the run stops at "GPU resources grew across quality switches" (textures 44 -> 55, limit +4). That failure is **not mine**: `look3-qs.mjs` on the ORIGINAL code (`checks/qsold.log`) gives the same textures 37 -> 46 (+9) after test -> low -> high -> test -> low -> test, and the same with and without the colony view round trip. The first switch to `low` creates 9 textures that are kept; stage1a's gate round probably passed it because of a different game state. Owner: render-app (quality switch disposal) |
| `panels.mjs` first half (health, alert, nest) | **pass** (`panels.log`: health 123 s, alertClickThrough, nest); the journal tab click then timed out at 30 s under load (not measured); `PANELS_ONLY=journal,codex` alone: **pass** (`panelsA2.log`) |
| `panels.mjs` second half | **pass** after one fix (`panelsB2.log`): the View tap passes; the D-pad assertion "reaches an overlay button" was **red before my change too** (`panelsB-orig.log`, original readers): the marker palette and the overlay column are two roots of the pad's `tools` layer and the D-pad stopped at the edge of a root, so the overlay column could not be reached by the pad at all. `moveFocusAcross` (`src/ui/nav/focusMove.ts`, `controller.ts`) goes on to the next root of the layer. Note: with the original pad readers the View tap also passed in that run (it retries up to four times), so the browser does not demonstrate the tap fix; the unit tests with a long frame do |
| `photo.mjs` quick | see the end of this section |
| `firstplay.mjs` | beats 1-13 **pass** (pictures `checks/firstplay/01..13-*.png`); beat 14 fails "no forager laid a trail to the food within 18000 ticks": the sim's foraging gap (integrator note), so beats 14-20 are **not measured** |
| `founding.mjs` | **pass** (`founding.log`, 12 pictures) |
| `look3-hud.mjs` | **pass** (`hud2.log`) |

Draw calls and triangles, same method as the gate report section 5 (`frametime.mjs`, seed 1, hand-over, one game minute, observer 25 BU back and 15 BU up over the entrance, 8 frames per quality,
`checks/frametime.log`):

| Quality | draw calls (gate round -> now) | triangles (gate round -> now) |
|---|---|---|
| low | 84 -> 81 (-3.6 %) | 501 195 -> 500 051 (-0.2 %) |
| medium | 118 -> 115 (-2.5 %) | 701 837 -> 699 833 (-0.3 %) |
| high | 127 -> 123 (-3.1 %) | 971 250 -> 966 980 (-0.4 %) |

Same-pose pairs of the look3 shots agree: observer low at high quality 98 -> 98 / 0.99 -> 1.00 M (night), 103 -> 105 / 1.00 -> 1.02 M (noon), dusk 108 -> 108, dawn 106 -> 105; the
shots with the ant in frame differ by the state of the sim between the runs (118 -> 204 draws is a different number of ants and leaves in view, not the change). The facade adds a few boxes
to the backdrop mesh only where a house edge is built. Frame times were not measured for the report (SwiftShader under load: 6-19 s a frame, indicative only).
