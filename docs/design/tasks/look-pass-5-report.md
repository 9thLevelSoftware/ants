# look-pass-5 report: what still reads as unfinished in the browser

Written 2026-11-23 by the implementing engineer (Sonnet). Pictures are under `test-output/look5/` (git-ignored); every
picture named here was looked at with the Read tool. Progress log: `docs/design/tasks/progress/look-pass-5-impl.md`.
Machine load during the runs: 3 to 8 (the simulation engineer's life runs share the four cores), so every time and
frame-time number below is noisy; draw calls and triangles are not.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean on my paths; tests green folder by folder | met | `npm run typecheck` clean at 22:38. vitest per folder, all green: `src/render/camera` 72, `src/game/views` 148, `src/game/flows` 26, `src/game/uiBridge` 74, `src/ui/hud` 111 (see the note), `src/ui/panels/inspect` 5, `src/render/world/{boundary 38, materials 30, dressing 33, primitives 39}`, `src/content` 109, `tests/docs` 8. Note: in `src/ui/hud` the timing test `minimap/model.look4.verify.test.ts` ("repaint cost ... stays near the cost before the task") failed once under load and passed alone (6/6); I did not touch the minimap. |
| 2 | Before / after pictures for items 1-6 | met, with limits | Section "Items 1-6" below: every item has before and after pictures; item 4 and item 3 are improvements, not complete (the limits are written there); item 6's "45 degree slope" could not be staged (no 45 degree ground in the seed). |
| 3 | Item 7's scripts pass or are reported with the failing beat and its cause; the "still unfinished" list exists | partly met | A real, stand-in-free `firstplay.mjs` run passes only beats 1-12 (seed 1) and 1-10 (seed 2); both then fail for sim causes (listed). `controls`, `views`, `lifecycle`, `stage1a` strict, `save` (second run) and `panels` pass. The "still unfinished" list, most serious first, with pictures, is in section "Item 7". |
| 4 | Draws and triangles within 5 % | partly met | low 74 draws / 579 291 triangles against 80 / 550 555 (draws -7.5 %, triangles +5.2 %); medium 108 / 731 114 against 114 / 718 214 (+1.8 %); high 119 / 1 004 640 against 125 / 990 950 (+1.4 %). The low-quality triangle count is 0.2 points over the line. No render path I changed adds geometry (see "Cost"), and the two runs are not the same scene (64 ants against 82, tick 25 605 against 22 775), so I read the excess as scene variance, but I could not prove it. |
| 5 | This report | met | |

## Items 1-6

### 1. Outcome card framing, and the failure card (seeds 1 and 2)

Before: `test-output/look5/item1/before-s2/outcome-card.png` (and `test-output/firstplay-r9/seed2/12-outcome-card.png`):
the queen huge and cut off at the lower left, soil smeared, no cell in sight. Cause: the time-lapse, outcome card and
failure card all used the possession camera, nudged to yaw 150 / zoom 1.3 by `flow.ts`; a cell a few millimetres across
cannot be framed that way.

Fix: a founding shot. `src/render/camera/foundingShot.ts` (pure maths: the camera sits above the subject at pitch 52
degrees, looks tilted so the subject lands in the upper part of the frame above the card, with a slice cut-away just above
the animals' backs so the cell is a hole in a soil cap); `ViewDirector.setFoundingShot` uses it in the possess and the
observer view (the hand-over leaves the session in the observer view, which is why it first did nothing); the flow
(`flow.ts`, `flows/founding/shotSubject.ts`) turns it on for the time-lapse, the outcome card and the failure card and
off when they close. Subject = the queen, her brood and the workers within 10 BU, not the fitted chamber record (finding
below). Tests: `foundingShot.test.ts` (camera 5, views 4), `shotSubject.test.ts` (4).

After, final constants (cheat-completed opening, so the picture is about the camera, not the founding):
- seed 1: `test-output/look5/item1/final2-s1/outcome-card.png` (lapse: `lapse-start.png`): cell above the card, the queen and
  five workers inside it.
- seed 2: `test-output/look5/item1/final2-s2/outcome-card.png`: same.
- failure card (queen dead, seed 2): `test-output/look5/item1/final2-fail-s2/outcome-card.png`: the cell with the queen and
  the eggs above "The founding did not succeed".
- the real founding on seed 1 (no cheat): `test-output/look5/firstplay/seed1-until12b/{11-timelapse,12-outcome-card}.png`.
  Correction after the review (see "Review round" below): this paragraph blamed the simulation (the queen lays in the
  throat). That was wrong. The small empty-looking cell of the real run was the camera's own fault: workers up the shaft,
  above the cut plane and invisible, widened the subject sphere to 33 mm. Fixed; the real run now frames the cell
  (`test-output/look5-fix/shot-s1/{11-timelapse,12-outcome-card}.png`).
Earlier iterations: `item1/after{1..5}-*`, `item1/final-s2`.

### 2. White speckle on the backdrop faces

Before: `test-output/app-seams-3/cars/{ant-0,meta-edge}.png`. Cause: the backdrop shader's hashed-alpha fuzz
(`edgeHaze.ts`) applied to flat faces as well as to the soft silhouettes it was meant for. Fix: `MeshBuilder` gets a `fuzz`
flag per primitive (`aBdFuzz`): boxes 0, ellipsoid and cylinder sides 1; the shader multiplies the fuzz by it (cache key
v8). Test `boundary/fuzz.test.ts`. After: `item2/after-cars/*`, `item2/suburban-garden/{low,medium,high}-*.png`,
`item2/kitchen-door/*` (script `tests/e2e/look5-backdrop.mjs`). Flat faces have crisp, hazed silhouettes; the speckled
band along the horizon at the title (`firstplay/seed1/01-title.png`) is the rim haze and is unchanged.

### 3. Kitchen-door wall foot

Before: `item3/probe/full.png` (high) and `test-output/look4-fix/facade-tiers/facade-test-near.png`. Two causes found with
a debug-colour probe and scene-group hiding (`tests/e2e/look5-footprobe.mjs`, `item3/probe*`):
- the streaks: `vWrSz` / `vWrFoot` were interpolated varyings; a face exactly 250 mm tall (the foundation course, equal to
  `FACE.minFaceMm`) tested 249.99998 on thin pixel lines and lost its face detail there. Fix: `flat` varyings
  (`surfacePatch.ts`, key v7).
- the pale veil: the 65 mm vent-course brick bands are under `minFaceMm`, so they got no `fogKeep` and fully hazed to
  grey while the big bricks kept 70 % colour. Fix: a thin-band branch in `faceDetail.ts` (a band whose top is at least
  `minFaceMm` above the object foot keeps `fogKeep`). Tests: `faceDetail.test.ts` "wall foot".
No overlap or coplanar faces were found in the worldgen output (house-wall prims #21 y -100..150, #23-26 vent course
150..215, #32 215..2250, cavity fill #38: adjacent, not coplanar), so no worldgen cause.
After: `item3/after/full.png` (high), `item3/after-test/full.png`, `item3/after-medium/full.png`. Remaining: the weep-vent
plastic bars (2-3 mm wide) still read as white ticks.

### 4. Moulded plastic look

Before: `item4/before/*` (spring-rider, toy-bucket, slide, bench). Fix: `FINISH.plastic` and `wrPlastic`
(`dressing/finishGlsl.ts`: orange-peel stipple, part line, recessed rim, worn edges, dirt at the foot using the per-instance
foot height), tuning `PLASTIC`, `looks.ts` (slide, spring-rider, toy-spade, lost-ball and the default plastic use it; the
moulded finish also gets stipple, wear and foot dirt). `WR_FOOT` is now defined for the look materials too. Tests
`looks.test.ts` "moulded plastic parts", `plasticFinish.test.ts`. After: `item4/after2/*`, `item4/final-medium/*`,
`item4/final-high/*` (script `tests/e2e/look5-props.mjs`, DIST=170). Honest: the stipple and the part line show close up,
the dirt at the foot is subtle, the rim groove shows only on flat faces (there are none on the playground-park seed 1
egg, which is an ellipsoid). No new texture was added.

### 5. Resolved alert at the outcome card

Before: `test-output/firstplay-r9/seed2/12-outcome-card.png` ("Founding chamber flooding - Resolved" under the card).
GDD 08 section 6.3 gives a resolved card 4 real seconds; it does not say what happens under a card that takes the middle
of the screen. Decision: while a blocking card is up (first version: `blockingCardUp()`; narrowed in the review round to
`centreCardUp()`: intro card, time-lapse, outcome, failure, winter lapse and report) a
resolved card leaves at once and a card that clears during that time is dropped, not turned into "Resolved"; live alerts
stay. `AlertFeed` takes `cardUp` in its context (`ui/hud/alerts/feed.ts`, `store.ts` subscribes to the founding UI);
tests in `feed.test.ts`. After: `item1/final2-s2/outcome-card.png` (no alert card). Honest: I could not reproduce the
"before" state in the browser: the debug `cheat.raiseAlert` alert is dropped by the simulation on the next tick, so
`look5-outcome.mjs` (OUTCOME_ALERT=1) logs no card either before or after the clear (`item1/final3-alert-s2.log`). The
rule is covered by the unit tests only. The manual (section 8, alerts) says it.

### 6. Pictures never taken

First run (before): `item6/inspect-before/{queen,chamber-royal,chamber-nursery}-inspector.png`: the observer camera sat
above the ground looking at the grass, not at the nest, and the cards showed two defects. Final: `item6/inspect/`.
- queen inspector, `item6/inspect/queen-inspector.png`: label / value order and units are right (`Crop C 0.0 loads`,
  `Health healthy (100 %)`), nothing clipped (the script measures `scrollWidth` of every element in the card: none).
  Defect: `Age callow (0 game days)` on a queen that had lived days (the simulation never ages her `physioAgeGd`). The row is
  left off a queen's card (`game/uiBridge/inspectSlice.ts`); sim cause below.
- chamber inspector, `item6/inspect/chamber-royal-5727-inspector.png`, `item6/inspect-before/chamber-nursery-9775-inspector.png`:
  defect `Adults 0 / 14.774999999999999` (the simulation writes the capacity into the unit string as a raw float, the card
  wrapped it onto two lines). Fix: `tidyUnit` rounds numbers in a unit string to one decimal: `Adults 6 / 6.8`. Tests
  `inspectSlice.look5.test.ts`. Still odd: the same card reads `Crowding roomy` at 7 adults of 6.8 (sim, unconfirmed).
- brood inspector (egg, larva, pupa), `item6/inspect/brood-{egg,larva,pupa}-inspector.png`: defect `Ready in 1 game days`
  (fixed: singular, `ui/panels/inspect/rows.ts`, test `rows.look5.test.ts`); the pupa row reads `too cool (22.4 C)` and
  `too damp (75 %)` where the egg and larva at the same reading read comfortable (per-stage climate bands; plausible, not
  checked). Defect: a pinned egg could not be found in the chamber in the colony view (a millimetre across, the glow is
  lost): `game/views/colony/markerScene.ts` now also draws a ring on the pinned or hovered brood (a ring is visible in the
  final pictures).
- The brood in those pictures is a STAND-IN: the hand-over by `cheat.completeFounding` leaves no live brood (all of it has
  hatched), so the script stages three of each stage with `cheat.spawnBrood` in the founding chamber (logged `STAND-IN` in
  `item6/inspect.log`). They sit at the chamber record's centre, which is about 2.5 BU away from the carved open cell, so the
  ring is drawn beside the hole in the pictures (finding for the simulation: record against carve).
- possession camera, `item6/camera/`: shaft at 30, 55 and 80 % of the way from the entrance to the chamber
  (`shaft30-follow.png`, `shaft55-follow.png`, `shaft80-follow.png`) and the chamber (`chamber-follow.png`), each with
  "Follow surface" and "Keep level" (`*-keep-level.png`): the camera stays inside the tunnel, does not clip, does not tip
  to the sky, and the two settings give the same pose in a tunnel (the log shows equal `up`). Ground: the steepest ground
  within 8 m of the start on seed 1 is 15.9 degrees (`slope16-follow.png`: the camera stays level with the ground; the ant
  looks ghostly pale in night rain, a known problem); the flank of the biggest stone near the start,
  `flank45-follow.png`, settled at a 12 degree contact (the worker rolled to the stone's top). NOT DONE: no 45 degree
  surface exists within 8 m of the seed 1 start, and I did not build a ramp; the 45 degree case of the possession camera is
  therefore untested. The first flank pick (`item6/camera-try1/flank45-follow.png`) was a clover flower head, which shows
  its floret finish as big white polka dots up close, at night, and is not a slope to test on.

## Item 7: the first hour, without stand-ins

### Runs

| Run | Result | Pictures / log |
|---|---|---|
| `firstplay.mjs` seed 2 (19:11-19:25) | beats 01-10 pass; FAILS at beat 11 "founding-lapse not on screen": the lapse ended in phase `failed`, "Water filled the burrow" (11 eggs, rising-water alerts). Cause: sim, the founding chamber flooded in rain (same as look-pass-4 seed 2). | `firstplay/seed2/01..11`, `seed2.log`; 11 is the failure card over my shot. Beats 12-25 not reached. NOT a stand-in run. |
| `firstplay.mjs` seed 1 (19:26-19:38) | beats 01-12 pass (lapse, outcome card); FAILS after the card: "the first workers did not reopen the entrance and walk out [reopening:130]". Cause: sim, the entrance stays in `reopening` (as look-pass-4). | `firstplay/seed1/01..12` (11-12 re-taken with the final shot in `seed1-until12b/`), `seed1.log`. NOT a stand-in run. |
| `firstplay.mjs` seed 1, `FIRSTPLAY_AUTOFOUND=1` (STAND-IN: `cheat.completeFounding` replaces the player's dig, seal and clutch) | died at beat 16: "worker did not hand over her load" | `firstplay/seed1-standin/`, 20:17 |
| same, `FIRSTPLAY_CONTINUE=1` (soft failures: a failed check is recorded, the run goes on) | all beats 13-25 reached; 2 soft failures (below) | `firstplay/seed1-continue/` (13-25), `seed1-continue.log` |
| `controls.mjs` | PASS (6 min). Finding: after a tapped drink the action `harvest-liquid` keeps running with a full crop (sim/action). | `e2e/controls/`, `controls.log` |
| `views.mjs` | PASS | `e2e/views/` |
| `save.mjs` | first run FAIL (script timeout 600 s in part B, load); second run with a 1500 s timeout PASS (473 s); autosave of 1 557 ants blocks the main thread 49 ms (min of 7) | `e2e/save/`, `e2e/save2/` |
| `lifecycle.mjs` | PASS | `e2e/lifecycle/` |
| `stage1a.mjs` (`STAGE1A_STRICT=1`) | PASS, no stand-ins | `e2e/stage1a/` |
| `panels.mjs` | PASS with two labelled stand-ins: the hand-over is written directly (`opening.done`, the test world starts after the founding) and one alert linked to a chamber is written into `progression.alerts` (no module raises one) | `e2e/panels/01..25` |

So: no uninterrupted real run passes beyond beat 12 on seed 1 or beat 10 on seed 2. Beats 13-25 have been seen only
with the opening cheated.

### Causes of the failing beats

1. Seed 1, after the outcome card: the entrance stays in `reopening`; the first workers never walk out (sim, `src/sim`,
   not mine).
2. Seed 2, beat 11: the founding chamber floods in rain; the founding fails (sim; the site read-out had said flood
   safety "Raised": `seed2/05-site-readout.png`).
3. Beat 16 (stand-in run): a possessed forager's delivery added 0.33 to the stores for a crop she carried of 0.25 + what she
   had; the script says "did not hand over her load": sim or action layer, not mine to decide (`seed1-continue/16-worker-delivered.png`).
4. Beat 20 (stand-in run): the dig plan preview is invalid with `anchor-not-in-nest`; no plan can be placed off the founding
   cell. Whether this is the script's anchor choice or the app/sim anchor test I could not tell (`seed1-continue/20-colony-slice-marker-plan.png`).
5. Beat 14 (stand-in run): the worker meant to be following the trail is tending an aphid ("Tend - freeze - threat"), 0 of 5
   samples on the trail (`seed1-continue/14-worker-following-trail.png`).

### Still unfinished, most serious first

1. The opening cannot be played to its end in a browser on either test seed (causes 1 and 2 above): seed 1 stops after the
   card (`firstplay/seed1-until12b/12-outcome-card.png`, then nothing walks out), seed 2 floods
   (`firstplay/seed2/11-timelapse.png`, "Water filled the burrow"). Everything after beat 12 is verified only with the
   opening cheated.
2. Night scenes are almost black at ground level: the first workers leaving the nest
   (`firstplay/seed1-continue/13-first-workers-entrance.png`: one ant, barely visible), the entrance mound at 8x
   (`seed1-continue/21-day-2-8x.png`), the continued game (`seed1-continue/25-continued.png`), the dug mound
   (`seed1/06-digging-entrance-mound.png`). The known-problems line says night "reads like an overcast day"; the pictures
   say the opposite at these times. The player cannot see the colony at the moments the script shows.
3. A coarse screen-door dot pattern covers the queen and the soil near her whenever the possession camera sits very close
   inside the nest, with a large white noise patch at the lower left of one of them: `seed1/09-sealed.png`,
   `seed1/10-first-clutch.png`, `seed2/09-sealed.png`, and on the ants crowded around the camera in the nest (`item6/camera/chamber-follow.png`). Not investigated (the fade of the possessed ant when the camera is
   inside her radius is the likely source).
4. (Corrected in the review round.) The real founding's time-lapse and card showed a tiny cell with the queen as a dot
   (`seed1-until12b/11-timelapse.png`, `12-outcome-card.png`). Cause was the shot's subject sphere (workers above the cut
   plane counted), fixed; after: `test-output/look5-fix/shot-s1/`. What remains is true to the simulation: this queen sits
   at the low rim of the cell (y -16.66 mm, chamber record centre y -13.4 mm, 7 mm sideways), so she is in the upper
   middle of the frame with soil beside her, and the cell lies to one side.
5. Delivery and dig plans (causes 3 and 4 above): `seed1-continue/16-worker-delivered.png`,
   `seed1-continue/20-colony-slice-marker-plan.png`.
6. The site read-out calls a site "Poor" in red at Q 0.71 / 0.65 with five of seven rows at full dots
   (`seed1/05-site-readout.png`, `seed2/05-site-readout.png`): the word and the dots disagree; only Warmth is empty.
7. A grey blurry square floats above the queen in the seed 2 shaft (`seed2/07-inside-shaft.png`): unidentified (a sprite
   or puddle quad?).
8. The left tool rail's last icon is half hidden behind the "Queen's reserves" panel in the time-lapse
   (`seed1-until12b/11-timelapse.png`, rail icon at y 283, panel from y 289).
9. The roster's "Where" column cuts "Nursery ..." and prints chamber ids ("Royal 5740")
   (`seed1-continue/18-roster.png`).
10. Foggy outdoor pictures wash the buildings out to pale grey shapes (`seed1/04-queen-surface.png`,
    `seed1/05-site-readout.png`): the haze is strong at overcast.
11. The speckled band along the horizon at the title (`seed1/01-title.png`) is still there (rim haze, not the faces fixed
    in item 2).
12. Smaller: a clover flower head shows big white polka dots up close (`item6/camera-try1/flank45-follow.png`); the
    weep vents of the kitchen-door wall are white ticks (`item3/after/full.png`); a queen's age is 0 (sim); chamber
    `Crowding roomy` at 7 of 6.8 (sim); no brood after a cheat hand-over, so the brood inspector needs a stand-in.

Fixed here after the pictures: the queen's unit panel title was hidden behind the chamber meter in beats 07 and 08
(`seed1/07-inside-shaft.png`, `seed1/08-founding-chamber.png`, `seed2/07-inside-shaft.png`); `founding.css` now lifts the
readiness card and the queen meters (`.fo-ready` bottom 8.25 rem, `.fo-queen` 12.75 rem). Picture after:
`firstplay/seed1-hudfix/{07-inside-shaft,08-founding-chamber}.png` (title and "Depth / Room" no longer overlap).

## Cost (acceptance 4)

`tests/e2e/frametime.mjs`, `FRAMETIME_N=2`, seed 1, observer over the nest after the cheated hand-over
(`test-output/look5/cost.log`); previous numbers from `test-output/look4-fix/ft-final.log`.

| quality | draw calls now / before | triangles now / before | frame ms now (min) |
|---|---|---|---|
| low | 74 / 80 (-7.5 %) | 579 291 / 550 555 (+5.2 %) | 7 057 (software rendering, loaded machine) |
| medium | 108 / 114 (-5.3 %) | 731 114 / 718 214 (+1.8 %) | 6 539 |
| high | 119 / 125 (-4.8 %) | 1 004 640 / 990 950 (+1.4 %) | 8 680 |

By construction none of my render changes adds geometry: the fuzz is a vertex attribute, the varyings and the plastic
finish are shader code, the founding shot and the marker ring are not on screen in this frame. The runs differ in
content: 64 ants now against 82, the hand-over at tick 25 605 against 22 775 (the simulation engineer's changes since), so
the carved nest mesh and the ant triangles differ. I report the number as it is and do not claim it is zero. Frame
times in software rendering mean nothing about a real GPU.

## Item 8: manual and README

- `docs/MANUAL.md`: first brood (section 2 step 5 and 15.3: the camera looks into the cell through a cut), alerts (section 8: resolved
  cards leave at once under a blocking card), section 20 "Known problems" (entrance `reopening` stops the first workers at
  seed 1, flood at seed 2, delivery and dig-plan findings, the night, dot-pattern, time-lapse and colony-view findings
  above, the pointer to this report); the species flag note was already correct.
- `README.md`: the state-of-play bullet on the opening (reliable up to the result card, then the seed 1 and seed 2 causes),
  the look bullet, the "last checked" line.
- `npx vitest run tests/docs` passes (8). Ownership note: the task says `docs/manual/**`; the one manual is
  `docs/MANUAL.md` (the old folder is gone), I edited that.

## Decisions and deviations

- Item 5: the rule is a product decision (a Resolved card under a blocking card is never readable): written into the
  manual instead of the GDD, which I may not edit.
- Item 6: the queen's age row is hidden for queens rather than shown wrong; the capacity text is rounded in the bridge,
  not in the simulation (not mine).
- Item 7: `FIRSTPLAY_CONTINUE=1` and `FIRSTPLAY_AUTOFOUND` runs are labelled stand-in runs, not passes. `firstplay.mjs` logs
  the shot at the lapse and at the outcome (`shotAtLapse`, `shotAtOutcome`).
- Process slip: once I ran `vitest run tests/docs` while the `seed1-hudfix` harness run was still going (the rule is never
  both). The tests are text-only and passed; the harness picture was taken without trouble.
- Not done: the 45 degree possession-camera case (see item 6); the alert "before" picture (see item 5); a proof that the
  +5.2 % triangles at low are scene variance.

## Needs from others (simulation, not mine to edit)

1. `src/sim` entrance / hand-over: the entrance stays in `reopening` after a hand-dug opening at seed 1, so the first
   workers never walk out.
2. `src/sim` founding / weather: rain floods the founding chamber at seed 2 although the read-out says flood safety is
   "Raised".
3. `src/sim` actions: `harvest-liquid` keeps running with a full crop (controls.mjs finding); a possessed forager's delivery
   adds less than she carries.
4. `src/sim` nest records (weakened by the review): at seed 1 the chamber record and the queen's position differ (record
   centre y -13.4 mm, queen y -16.66 mm at the outcome; in another run 18 mm / 2.5 BU from the open space). This is NOT
   the cause of the time-lapse framing problem (the camera now frames the queen and brood and no longer needs the record),
   but the brood inspector's position and chamber occupancy may still disagree with the picture: not verified.
5. `src/sim/ants/player/inspect.ts`: a queen's `physioAgeGd` stays 0 (card said "callow, 0 game days"); the chamber card's unit
   strings carry raw floats (`/ 14.774999999999999`); `Crowding roomy` at 7 adults of 6.8.
6. Dig plan preview `anchor-not-in-nest` off the founding cell at seed 1: the anchor test (sim or app) needs a look by whoever
   owns plan placement; I could not tell whether the script's anchor is wrong.
7. `docs/design/gdd` 08 section 6.3: add the rule that a Resolved card does not stay under a blocking card.

## Files touched (mine)

`src/render/camera/{foundingShot.ts, foundingShot.test.ts, constants.ts, index.ts}`;
`src/game/views/{viewDirector.ts, foundingShot.test.ts}`; `src/game/views/colony/markerScene.ts`;
`src/game/flows/founding/{shotSubject.ts, shotSubject.test.ts, flow.ts}`;
`src/game/uiBridge/{inspectSlice.ts, inspectSlice.look5.test.ts}`;
`src/ui/hud/alerts/{feed.ts, feed.test.ts, store.ts}`; `src/ui/panels/inspect/{rows.ts, rows.look5.test.ts}`;
`src/ui/screens/founding/founding.css`;
`src/render/world/boundary/{meshBuilder.ts, boundaryRenderer.ts, edgeHaze.ts, fuzz.test.ts}`;
`src/render/world/materials/{surfacePatch.ts, faceDetail.ts, faceDetail.test.ts}`;
`src/render/world/dressing/{finishes.ts, finishGlsl.ts, tuning.ts, looks.ts, looks.test.ts, plasticFinish.test.ts}`;
`tests/e2e/{look5-outcome, look5-backdrop, look5-footprobe, look5-props, look5-inspect, look5-camera}.mjs`,
`tests/e2e/firstplay.mjs`, `tests/e2e/lib/firstplay-steps.mjs`; `docs/MANUAL.md`, `README.md`, this report, the progress file.

## Review round (look-pass-5-fix)

An independent reviewer found eight problems. What was done, with the reproduction and the evidence:

1. **Camera jumps when the subject sphere changes** (real). `ViewDirector` now frames an eased subject, not the raw one
   (`easeShotSubject` in `render/camera/foundingShot.ts`, constants `FSHOT_EASE_*`): exponential approach (0.5 s) with a
   speed cap on the radius (6 BU/s) and the centre (12 BU/s); the card's lift and fill ease too. The slice height is not
   eased (an animal must never be cut away). Reviewer's tests now pass (`foundingShot.verify.test.ts` "does not jump the
   camera in one frame"; `shotSubject.verify.test.ts` "moves continuously"); new tests: `views/foundingShot.test.ts`
   (eases and arrives; slice follows at once), `render/camera/foundingShot.test.ts` (rate cap, lift and fill).
2. **Workers above the cut plane widened the frame** (real, the main cause of the tiny cell). `shotSubject.ts`: a worker
   counts with a smooth weight: 1 up to 7 BU of the centre fading to 0 at 10 BU, times 1 at the plane fading to 0 one BU
   above it. Real seed 1 at the outcome: radius 10.2 mm (was 33 mm). Pictures `test-output/look5-fix/shot-s1/11-timelapse.png`
   and `12-outcome-card.png`: the cell is about twice as wide on screen, the queen and workers visible at its rim.
3. **Report blamed the sim** (reviewer right). Re-run on seed 1: queen y -16.66 mm, cut -14.26 mm in open space, so the
   sim cause was not what made the card small; the report and MANUAL are corrected. The reviewer's roof hypothesis is
   a real hazard in a low cell, so the plane is now kept under the roof: `shotSubject.ts` samples the carve field upward
   from the queen and puts the plane 0.1 BU under the first solid sample (never below her back). In the real run the
   probe found no roof closer than the usual 0.6 BU, so the picture did not change; the clamp is covered by unit tests only
   (`shotSubject.test.ts` "keeps the plane under the roof").
4. **Reduced motion: still every 3 s, constant warm light** (real, both done). Reduced motion now holds one still and
   retakes it with the 0.2 s crossfade every `FSHOT_STILL_S` = 3 real s and when the card opens or closes (test "holds one
   still and retakes it..."). The light: `FrameInfo.lightHour` (new optional field) makes the world slot light the world
   as at hour 17.5 (`FSHOT_LIGHT_HOUR`) while the shot is on, the sim's weather unchanged. Picture: the real seed 1 lapse
   at clock 01:40 is lit as late afternoon (`test-output/look5-fix/shot-s1/11-timelapse.png`). The light changes in one frame when
   the shot starts and ends (a dip-fade covers the start; not checked at the end).
5. **Resolved alerts dropped during normal play** (real). The rule now uses `isCentreCardUp` (intro card, time-lapse,
   outcome, failure, winter lapse and report), not the hand-over banner, the winter banner or the flight prompts
   (`ui/hud/blockingCard.ts`, `alerts/store.ts`; tests in `blockingCard.test.ts`). The original cause of a Resolved card
   standing across the lapse is still not found: the card expires by the real clock after 4 s, so a card standing for 75 s
   means it was raised again and again (a flapping alert) or the picture was taken within 4 s of a clear at the end of
   the lapse. I could not reproduce either in the browser. Open.
6. **MANUAL drift** (real): the interrupt sentence (the first-brood step of the founding) and the night sentence (the Rendering paragraph) are corrected, the
   alert rule updated.
7. **Comment claimed no allocation** (real): the header of `shotSubject.ts` now says what is true (nothing stored between
   calls; the closures are gone).

Verification: `npm run typecheck` clean on my paths; vitest per folder: `src/render/camera` + `src/game/flows` 21 files /
111 tests, `src/game/views` 24 / 154, `src/ui/hud` 18 / 114 (before the light change; the light change touches
`render/index.ts`, `render/slots/worldSlot.ts`, `game/Game.ts`, typecheck clean, covered by the harness run only).
Harness: `FIRSTPLAY_SEED=00000001 FIRSTPLAY_UNTIL=12 ... look5-verify-shot.mjs` (`test-output/look5-fix/shot-s1`), pictures
looked at.
