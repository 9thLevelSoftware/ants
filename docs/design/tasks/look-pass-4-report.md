# look-pass-4 report: what the integrator saw in the pictures of app-seams-2

Engineer 1 worked on Nov 18 and was cut off; engineer 2 (this report) resumed on Nov 22 and finished. All pictures are under
`test-output/look4/` (git-ignored). Every picture named here was looked at with the Read tool. Progress log: `docs/design/tasks/progress/look-pass-4-impl.md`.

Quality note: the first-play script (`tests/e2e/firstplay.mjs`) runs at `quality=test`, the lowest tier. Item 3 and the far-structure fix were therefore checked at `test`, not only at low, medium and high.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean; tests green folder by folder | met for my paths, one failure outside them | `npm run typecheck` clean (whole project). `src/ui` 437 pass; `src/render` 852 pass, 2 skipped; `src/game` 606 pass, 1 fails: `src/game/save/save.verify.test.ts` "bytes with trailing garbage..." (byte 11560 flipped still parses). I did not touch `src/game/save` (git: last change `eedb1b7`); it looks like another engineer's save-format work. `src/content`, `src/input`, `tools/harness` untouched. |
| 2 | Before/after pictures per item, same pose, looked at | met (see per item; item 2 cars not pictured) | below |
| 3 | Browser scripts of item 9 | partial: see item 9 | below |
| 4 | Draws and triangles at low/medium/high up by at most 10 % | met | table in item 3; minimap repaint cost in item 4 |
| 5 | This report | met | |

## Item 1: flat pale patches on the ground

Cause: the pale slab is one draped LEAF (`decor:draped`, fresh maple atlas cell, 60 to 110 mm) from `src/render/world/decor/drapedMaterial.ts`. The atlas has 256 px per cell, so at ant eye height it is a blurry flat green with a smooth alpha edge. Not terrain, not a decal.
Fix (shader, in the leaf branch of the draped material; tuning `DECOR_LEAF` in `decor/tuning.ts`): warped and serrated outline from noise, stalk and rib fan, a two-scale net of fine veins, yellowing blotches and dark flecks, relief fed to the normal. Detail fades out between 260 and 800 mm so it never shimmers far away.
Pictures (seed 3, suburban garden, high): before `item1/before-opening-seed3-high.png`, after `item1/after-opening-seed3-high.png` (ragged mottled edge); from above `item1/before-from-above-seed3-high.png` / `after-from-above-seed3-high.png` (veins visible). All five archetypes at medium and high: `item1/<archetype>-<medium|high>/opening.png`, all looked at; no patch visible in these shots reads as a flat single-colour polygon (the shots show litter, moss-like mottling and bare crust; I did not stage a shot of every ground patch kind). Honest limit: the leaf is still a large pale green area from the side; the detail is subtle at a glance, clear from above.

## Item 2: far structures are slabs

Findings:
- The pale slabs at 6 to 8 m in the first-play shot are wood-sound fence panels (20 mm thick, 1.75 m wide; probe: `tests/e2e/look4-fp-probe2.mjs`, hiding meshes by material). The board pattern (`FENCE_BOARDS`, `surfacePatch.ts`) existed but was washed out to about 3 % contrast by haze (`fogKeep` 0.55) and a near-white albedo.
- Fix: `FENCE_BOARDS` now has stronger gaps, a per-board tint, a silver-to-brown warm shift, a grain streak along each board, a 0.9 albedo factor and `fogKeep` 0.75 (haze tints, does not bleach). Before: `item2d/fp-until05/05-site-readout.png`; after: `item2e/fp-until05/05-site-readout.png` (weathered boarded fence). An over-dark intermediate (`fogKeep` 0.85) is `item2d/fp-until05b`.
- Brick, render, concrete, stone, mortar and metal bodies: `materials/faceDetail.ts` (new, wired into `surfacePatch.ts` like the fence boards): plinth band, brick courses with staggered joints, 1.2 x 0.6 m panel seams, metal standing seams and a fold line; thick wooden bodies (sheds, bins) get boards; all fade out under about 3 px per pattern period (no moire) and keep part of their colour through the haze (`FACE.fogKeep` 0.7). Material-kind driven, no per-seed cases. The shader compiles in the browser (no "Shader Error" in any log).
- Pictures: kitchen-door house wall now shows brick courses, a plinth and a window band: before `item2/before-kitchen-door-medium/2-worker-at-entrance.png`, after `item2/after-kitchen-door-medium/2-worker-at-entrance.png`. Five archetypes, two shots each (opening and worker at the entrance), medium: `item2/before-<arch>-medium/` and `item2c/after2-<arch>-medium/` (`1-opening.png`, `2-worker-at-entrance.png`). The suburban-garden worker shot shows the boarded fence at night.
- Not done / not verified: (a) I added a window band, pillars, wheels and a skirt to the parked cars of the boundary backdrop (`boundary/backdrop.ts`, tuning `carDetail`, `BACKDROP_HEX.tyre`) and kept the haze exemption for them; boundary tests pass, but no archetype and seed I tried showed a backdrop car, so there is no picture of it. (b) Curved props (the playground slide dome, cylinders) get no face detail; the playground opening still shows a smooth dome. (c) Pictures at low and high for the structures were not repeated after the final fence tuning; the fix is a shader constant that is the same on every tier (checked at `test` and `medium`).

## Item 3: bare ground at worker height

Quality the first-play script uses: `test`. Cause: `GRIT_QUALITY` gave `test` no grit at all and `low` only a 90 mm radius; grass and litter density at x0.25 left an empty plane.
Fix: `GRIT_QUALITY` test 700 / low 1000 grains within 120 mm (30 BU at BU 4); new `NEAR_GROUND` floor (`decor/tuning.ts`, `bladeShape.ts`, `drapedShape.ts`, `DecorRenderer.applyLod`): within 120 mm of the camera grass density never drops below 0.6 and litter below 0.7, easing back over the next 120 mm. Tests: `decor/nearGround.test.ts`.
Pictures (seed 1 suburban opening pose): `cost/before-<tier>/pose.png` against `cost/after-<tier>/pose.png` for test, low, medium, high. `before-test` is an empty brown plane; `after-test` has grit, litter and chips; `after-low` shows ragged leaf litter, grit and tufts.
Cost, opening pose, seed 1 (draw calls / triangles, before to after; same method as the gate report 5; numbers taken before the fence and car shader tweaks, which add no draw call):

| tier | draws | triangles |
|---|---|---|
| test | 21 to 23 | 259 200 to 271 700 (+4.8 %) |
| low | 47 to 47 | 490 790 to 525 924 (+7.2 %) |
| medium | 82 to 82 | 606 509 to 622 117 (+2.6 %) |
| high | 91 to 91 | 875 694 to 875 694 (0 %) |

All under 10 %.

## Item 4: minimap

Cause (found on the second look): the live plate is 64 zone cells (16 mm) over 176 px, and worldgen paints zones in 4-cell blocks, so the class borders were 11 px steps. Engineer 1's 4 x 4 B-spline could not smooth blocks that wide (picture `item6/r03-new-aim-behind-older.png` still showed stairs).
Fix: `src/ui/hud/minimap/model.ts` `paintPlate` now builds one indicator field per class over the window cells, blurs it (about 10 px radius, at most 5 cells), reads it bilinearly per pixel and cuts at one half with a short ramp: borders are smooth curves at the plate's pixel resolution. A single-class window is one fill. `Minimap.tsx` also draws water bodies (uneven pools), structure footprints (to scale, rotated), known food (diamonds), plus the existing entrances, possessed ant with heading, markers and trail. Data: `game/uiBridge/minimap.ts` (`structures`, `water`, `food`).
Pictures (352 px plate, `--dpr 2`): before (old nearest-cell painter, same data) `minimap2/before-plate-nearest.png`, after `minimap2/after-minimap.png`, whole frame `minimap2/after-frame.png`. Tests: `minimap/model.test.ts` (4-cell-block diagonal at the live resolution; disc), `model.verify.test.ts`, `game/uiBridge/minimap.test.ts`.
Repaint cost (node, minimum of 25, `paintPlate` only): worst case with a border in the window 1.1 ms at 176 px and 3.3 ms at 352 px; a one-class window 0.5 to 0.9 ms. Before the whole task the plate cost 0.14 ms at 176 px. Repainted every 200 ms (MINIMAP_REFRESH_MS), so about 0.5 % of one core. This is higher than "as it is now"; I judged the smooth border worth it but you may prefer the cheaper B-spline path with a coarser look. The structure and water shapes are Canvas 2D fills and are not in this number.

## Item 5: possession camera on slopes (decision for the integrator)

I did not change the default. GDD 01 section 6.2 and GDD 08 section 7.4 (Camera horizon: Follow surface default, Keep level option) say the camera's up follows the surface, and the task says to follow the GDD where it differs. The setting `camera.worldUpLock` ("Keep level") already exists and works. Pictures for the decision, same pose with each setting (`tests/e2e/look4-slope.mjs`, seed 3 suburban garden, low):
- slope: surface up (0.43, 0.85, -0.31) = about 32 degrees: `item5/slope20-follow.png` (camera tips with the ground, the horizon is gone, the ant seen almost from above) and `item5/slope20-keep-level.png` (level horizon, the ant on the slope in the corner). The terrain of this seed has at most a 20 degree ground slope, so there is no 45 degree slope to show; the file name says slope20 for the terrain gradient that was sampled.
- vertical stem (plant stem, up horizontal): `item5/stem-follow.png` (ant upright on the stem, background tipped) and `item5/stem-keep-level.png` (level horizon, ant climbing sideways).
Cost of changing the default: the walk test and the possession-camera tests assume follow; the task's 50 degree threshold rule with 0.5 s blend and hysteresis would be a rig change in `src/render/camera/thirdPersonRig.ts` (`upGoal`). Not done; say if you want it.

## Item 6: overlaps and wording

- The "Why?" hint card under the Tab/hand-over card: `ui/hud/blockingCard.ts` now counts the hand-over banner as a blocking card and `OnboardingPrompts.tsx` hides the hint while one is up. After: `item6/r03-new-aim-behind-older.png` (hand-over card alone at the top centre). (The minimap in that picture is from before the item 4 redo.)
- Inspector wording: `ui/panels/inspect/rows.ts` `rowValue`: words that describe the number now follow it ("64 % of stage", "0.1 game days at current conditions", "2 loads left", "3 BU down, below ground"), classifying words keep "damp (34 %)", and occupancy rows show the number only ("Ours using it 2"). Sweep of all inspectors (ant, brood, queen, chamber, food source, creature) by the row keys in `rows.ts`: changed rows are progress, ready-in, loads left, surface/air/below-ground depth rows, per-game-hour rates, mound/linked counts, size ("x 2.1 x our length"). Tests: `hud/hud.logic.test.ts`, `blockingCard.test.ts`. The brood-inspector picture (`fp-fast4/20`) needs a full firstplay run, which does not get that far (item 9); the wording is covered by the unit tests only.

## Item 7: first read-out says "Poor" and nothing else

GDD 06 section 5.7 words and GDD 08 section 9.3 one-word labels; GDD 01 opening has the aim line, not an arrow, so no arrow was added. `game/flows/founding/siteAdvice.ts` names the weakest factor in words with what to look for ("Shaded: look for open, sun-warmed soil."; "Open: look under a stone, a log or leaf litter."), shown under the read-out for Poor and Fair ground only (PlayPanels, `founding.css`). `hudSlices.ts` `focusAimOf` keeps the opening aim on the Focus line while no site is chosen ("Aim: Where is the ground sheltered, warm and diggable."). Before: `test-output/app-seams-2-fix/fence-high/hide-none.png`; after: any opening, e.g. `item1/suburban-garden-medium/opening.png`, `item2d/cars-s2/opening.png` (Fair/Poor with the line). Tests: `siteAdvice.test.ts`.

## Item 8: README

`species=` is honoured only with `test=1` (`src/game/flags.ts` line 26); the manual is `docs/MANUAL.md` (the `docs/manual/` folder does not exist). README corrected.

## Item 9: browser scripts on the final tree

Machine load was 6 to 10 during these runs (colony engineer's life runs).
- `firstplay.mjs`, one uninterrupted run, default seed 2: stopped at beat 11 (time-lapse) with "founding-lapse not on screen": the founding lapse ended in phase `failed` (6 eggs lost, one relay clutch; pictures 09 and 10 show the founding chamber flooding in rain, "Founding chamber flooding... 26 %"). Sim reason. Seed 1 (`FIRSTPLAY_SEED=00000001`): beats 1 to 12 pass, then "the first workers did not reopen the entrance and walk out ['reopening:116']" (entrance stays in `reopening`, `eggs 5 larvae 5 lost 2` at the lapse). Also a sim reason. No stand-ins used. Logs `firstplay.log`, `firstplay-s1.log`; pictures `firstplay/01..11`, `firstplay-s1/01..12`. The growth check and the trail beats (13 to 25) were never reached, so no growth numbers.
- `controls.mjs`: PASS (`e2e/controls.log`); its own finding: after a tapped drink the action `harvest-liquid` keeps running with a full crop (sim/action).
- `views.mjs`: PASS (`e2e/views.log`).
- `stage1a.mjs` strict: FAIL at the egg beat: "stand-in needed for egg: lay-egg refused (lay-egg:budget); 6 eggs cheat-spawned at the queen" (the queen's lay budget is spent in the harness's cheat-completed founding; sim rule). Non-strict run: see `e2e/stage1a-loose.log` (result appended below if it finished).
- `panels.mjs`: first run timed out at the 900 s script timeout under load after 14 beats passed (last OK: tools at 766 s); rerun with 2400 s: see below.

What I see in the firstplay pictures, besides the above:
- 04, 05: the opening ground and the boarded fence read well after the fix; the far car-park backdrop and lamp posts are hazy silhouettes, which is intended.
- 07: inside the shaft the queen and a pale blob (the egg or a dither artefact) sit in a flat orange tunnel texture; the flat dither cut-out near the camera is visible.
- 09, 10: the alert card for rising water in the founding chamber is titled "Queen under attack" ("rising water, founding chamber"): the GDD 08 alert table specifies this title for `queen-in-danger` (`src/content/text/alerts.ts`, asserted by `src/sim/nest/flood/founding.test.ts`) and the flood reuses it, so it reads wrongly for water; not changed, your call. The queen in 10 is drawn in dithered transparency very near the camera.
- 03: the intro card is clean; no prompt overlaps it.

## Files touched (mine)

`README.md`; `src/render/world/decor/{drapedMaterial,drapedShape,DecorRenderer,tuning,leafFringe.test,DecorRenderer.test,nearGround.test}`; `src/render/world/vegetation/bladeShape.ts`; `src/render/world/dressing/tuning.ts`; `src/render/world/materials/{faceDetail,faceDetail.test,surfacePatch}.ts`; `src/render/world/boundary/{backdrop,tuning}.ts`; `src/game/flows/founding/{siteAdvice,siteAdvice.test,flowView}.ts`; `src/game/uiBridge/{minimap,minimap.test,balance,hudSlices,uiBridge.hud.test}.ts`; `src/ui/hud/{blockingCard,blockingCard.test,hud.logic.test}.ts`, `src/ui/hud/prompts/OnboardingPrompts.tsx`; `src/ui/hud/minimap/{Minimap.tsx,model.ts,model.test.ts,model.verify.test.ts}`; `src/ui/panels/inspect/rows.ts`; `src/ui/screens/founding/{PlayPanels.tsx,founding.css,store.ts}`; `tests/e2e/look4-*.mjs|sh` (scripts for the pictures above). No change to shared contracts: `FoundingUi.site.advice` is a new optional field.
(`git diff 19a5875 HEAD` also lists sim, combat and `tools/sim` files; those are the colony engineer's snapshots, not mine.)

## Needs from others / notes for the integrator

- Sim: founding chamber flooding in rain at seed 2 (firstplay), entrance reopening stalls at seed 1, `lay-egg:budget` in stage1a strict, `harvest-liquid` running with a full crop; "Queen under attack" title for a flood alert.
- `src/game/save/save.verify.test.ts` fails (not mine).
- Decision for you: camera default (item 5); minimap repaint cost (item 4).
