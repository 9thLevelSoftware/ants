# Look pass 6 — report

Written 2026-11-24 by the third engineer on the task (the first two were cut off by machine restarts; their work is in the tree and in
`docs/design/tasks/progress/look-pass-6-impl.md`). Task: `docs/design/tasks/look-pass-6.md`.
Pictures are under `test-output/look6/` (git-ignored). Contact sheets of the main before / after pairs: `test-output/look6/sheets/`.
Every picture cited here was looked at with the Read tool. Tiers are the player's: low, medium, high.
The machine was shared with the simulation engineer's life runs and browser all day: frame times are SwiftShader numbers on a loaded machine.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean on my paths; tests green folder by folder | met (see "Verification"; the whole suite was not run) | "Verification" |
| 2 | Items 1-3: before / after pictures, same pose, three tiers, the after stands on its own | partial: met for item 2, item 3 and item 1 in the founding cell and shaft; NOT met for item 1's worker in a crowded chamber (ants between the camera and her are dithered, `cc/cc-after-noon-crowd-low.png`) | below, "Review fixes" |
| 3 | Draw calls and triangles within 5 % of look-pass-5's table | met | "Cost" |
| 4 | No frame-time regression at low from the night lighting | met (within noise) | "Cost" |
| 5 | This report with picture paths and the still-unfinished list | met | end of this file |

## Review fixes (independent review of this task, 24 Nov)

1. **Cell camera: soil between the camera and the queen** (`src/game/views/cellCam.verify.test.ts`, red at review: 8 of 532 fully-on frames). Reproduced, two causes, both fixed at the root:
   - *Cut chosen by a threshold.* During the blend from the view from above to the side view the pose is a mixture, and the cut switched at `es >= 0.5`. Now both cuts are finished and the one that leaves less soil in the line of sight
     (`ViewDirector.soilInSight`, the line from the camera's pose of the frame to her thorax sampled every 0.25 mm against `inCutAway`) is used.
   - *The 3 mm snap moved the plane.* `cut.center` was rounded on both axes after `cellSideShotAt` had fitted the section's offset to the free room, so the plane could move 2 mm toward the camera, into soil. `finishCut`
     (`render/camera/cellCam.ts`) now snaps the horizontal slice's centre as before, and the vertical section's centre only along the plane; the plane's own position is held (`CELLCAM_SECTION_HOLD_MM` 0.5 mm toward her, never nearer the
     camera than wanted) so the cut faces are not rasterised again on every step.
   - Found while fixing: the offset's free-room probe runs level at her thorax, and the camera looks down the line from above it; a low roof meets that line sooner. `sightRoom` also fits the offset against the sight lines at the side view's
     pitch, the view from above's pitch and the one between, so no soil stands between the plane and her on them (3 new tests in `cellCam.test.ts`; the reviewer's test is green: 0 of 532 frames blocked).
2. **Crowded chamber after picture** (`test-output/look6/cc/cc-after-noon-crowd-low.png`): the reviewer is right, criterion 2 is partial for this case. It is the possession camera among eight workers: ants between the camera and her are drawn through the
   4x4 ordered dither of GDD 01 6.5 rule 2, and the picture is hatched legs and bodies, not a picture of her. Not changed: the cell camera does not take over (she is not squeezed), and softening the dither or fading by distance departs from the GDD's rule.
   Needs a decision of the GDD owner. Listed under "Still unfinished".
3. **`markBusy` was dead code.** Confirmed with the reviewer's `promptBusy.verify.test.ts`: `runner.ts validate()` returns `blocked` for any running non-concurrent action and `prompt.ts` words `blocked` as "busy", so `promptView` already reads "Lay egg - busy"
   on every tick of the batch (at the batch's last ticks the primary line becomes "Pick up egg - busy": the egg she has laid). Removed `markBusy`, `PROMPT_BUSY` and the by-hand unit test; `promptBusy.test.ts` now drives a real press (ready, busy on every tick, the egg offered after).
   Ruling 1.2 is met by the simulation's own wording (pictures `lay/lay-{1-ready,2-busy,3-after}.png` are of that); what the integrator saw as a "silent refusal" is the press refused while the line already read busy; no buffering (GDD 01 and 08 5.3 are silent).
4. **Clearance allowance** now applies only while the cell camera blends (0 < weight < 1) in `clearField.testkit.ts` and `debug.ts walk()`, as the report said it did; `clearField.test.ts` (4 tests) pins it. `views.mjs` passes with the narrowed rule (`test-output/look6/views7.log`).
5. **Night pictures** at the observer camera and at medium and high for every hour and weather: see "Item 2", "Pictures (review)".
6. **Reduced motion is now a crossfade, not a dip.** `CameraTransition` 'crossfade': the new pose is live from the first frame and the output carries `stillFade` (0..1, eased) for the old picture; `src/game/crossfadeVeil.ts` keeps a 2D canvas over the game canvas, copies the
   game canvas after every render while reduced motion is on (`RenderApp.setAfterRender`; a WebGL canvas can only be read in the task that drew it), shows the copy at `stillFade` and hides it at the end. The 'dip' (long camera hops) still darkens the canvas.
   `Game.endGame` resets the canvas opacity and the veil, so quitting during a dip or crossfade leaves nothing on the title screen (the reviewer's reading of the code; checked in the browser). Picture: `test-output/look6/xfade/xf-1-mid.png` (both images at 53 %);
   `xf-0-before.png`, `xf-2-after.png`; numbers and the quit check in `xfade.json` (`tests/e2e/look6-xfade.mjs`). Tests: `rigs.test.ts` (crossfade), `crossfadeVeil.test.ts` (4), `foundingShot.test.ts`.
7. **Scripts.** `hud.mjs`: its first check failed because two cards the design put in front of the prompts (the outcome card, then the hand-over banner, `ui/hud/blockingCard.ts`, look pass 4) are not answered by a script written before them; it clicks Continue and Stay with the queen
   now (real clicks). Its next check ("the HUD read layout inside the frame loop") then failed on `HintCard.tsx`'s 5 Hz step-aside timer; the check now counts only layout reads made inside an animation-frame callback, which is what it says. Both seeds pass with `HUD_SHOTS=0`
   (`test-output/look6/hud2.log` seed 1, `hud3.log` seed 2: Colony orders, slider, possession, roster, alerts, reflow 0). That check is GDD 08 App E 26. `views.mjs` passes. `panels.mjs`, `controls.mjs` and `firstplay.mjs` seed 2 past beat 12 were not rerun (see "Not done").

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

**Pictures (review: the full grid).** Same pose, 12:00, 18:00, 22:00, 02:00, 05:00, clear and rain, ant height (surface) and observer height (observerlow), at all three tiers (`tests/e2e/look3.mjs`, `LOOK3_SHOTS=hNN-weather:view:quality`).
Low: ant height `night/c/c-h*-surface-low.png` (all ten), observer `night/c/` plus `night/d/d-*-observerlow-low.png` (the six that were missing); sheet `sheets/item2-night-observer-hours-low.png` (all ten, observer, low).
Medium: all twenty (ten hours-and-weathers, two views) `night/e/e-h*-{surface,observerlow}-medium.png`, sheet `sheets/item2-night-hours-medium-surface-observer.png`.
High: all twenty `night/f/f-h*-{surface,observerlow}-high.png`, sheet `sheets/item2-night-hours-high-surface-observer.png`. All looked at: at 22:00 and 02:00 the ground, the grass, the leaf litter and the ant read, cool and low in saturation, in clear and in rain;
05:00 is the dawn (warm in clear, grey in rain), 12:00 and 18:00 are the day references. The ant against the ground at 22:00 and 02:00 is still low in contrast (the ant is dark soil-brown on dark soil; her outline carries her), as listed under "Still unfinished" 8.

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
  `CHAMBER_WORDS`): `test-output/look6/roster/roster.png` (the staged colony, Roster opened with L; sheet `sheets/item4-roster-where.png`): Where reads "Tunnel", "Founding cell", "Garden bed", whole, no ids..
- **Buildings washed to pale grey at overcast.** The haze follows GDD 08 11.4 exactly (+20 % denser at overcast, `WEATHER_LOOK.overcast.hazeMult` 1.2, visibility 300 BU on
  the lawn, FogExp2): a building 300 BU away keeps 24 % of its own colour. I did not change it; a stronger or weaker haze would depart from the GDD. Not fixed, reported.
- **Title screen horizon** (a speckled band): the dithered fade-in of the world-edge skirt (`SKIRT_BLEND_BU` 80 BU of hashed alpha, green on brown) is the band.
  80 -> 28 BU: `test-output/look6/title/title-{low,medium,high}.png` before, `title/after-{low,medium,high}.png` after (the speckled line is now a smooth band;
  what speckle remains is the grass blades' own fuzz).
- **Clover head's white polka dots** (`test-output/look6/clover/clover-{low,medium}-before.png`): the shader finish drew big bright cell centres on a dark net and,
  at the rim, discarded the cell corners into a lattice of discs; with parts (medium) the core under them used the same cells in purple and white. Finer cells, a
  gentler 0.86..1.0 modulation, no discard, a uniform core under the parts: `clover/clover-medium-after.png`, `clover-low-after3.png` (low, `clover/clover-low-after3.png`: a smooth head with fine dimples, no discs; medium `clover/clover-medium-after.png`: no polka dots)..
- **Weep vents as white ticks** (`test-output/look5/item3/after/full.png`): the white bar is a plastic prim of the interior catalogue
  (`src/worldgen/catalog/interior/shell.ts`, "weep-vent grilles: one plastic bar splits the open perpend into two slots"), not a render fault; the prim is not mine.
  Not changed. Needs worldgen: a buff or dark bar colour. Reproduction: seed 1 archetype kitchen-door, observer 60 mm from the wall foot.

## Item 5: reduced motion and the light of the lapse

**Superseded by review fix 6 (a real crossfade).** *Cause found by looking.* The camera transition's `dip` (the dip-to-dark of a long camera hop and the 0.2 s crossfade of reduced motion, GDD 08 2.4 and 7.10) was
computed by `ViewDirector` and read by nobody: it was never drawn. `Game.renderScene` now draws it as the canvas opacity (the HUD is another element and stays);
the page behind is the game's dark ground. Seen in a browser with reduced motion on (`look6-rm.mjs`, `test-output/look6/rm/rm.json`): the opacity reaches 0.58 at the
darkest frame of the retake every 3 s and is back to 1 within 0.2 s. I have no picture of the dimmed frame: Playwright's screenshot redraws the frame (a resize with dt 0)
and the opacity is back to 1; the numbers are the evidence. Debug additions: `renderFrame({ dt })` draws a frame of that length, `__game.lighting()`.

**Light.** The founding shot lights the world as at 17:30 whatever the clock says; the light was cut in and out in one frame (night exposure 4.38 EV -> 0.48 EV, key
light 0.07 -> 2.97). `WorldRenderer` now crossfades the lighting state over `LIGHT_SWITCH_S` 1.2 s at each cut (`copyLighting` / `blendLighting`, tested in
`lookPass2.test.ts`). Measured (`test-output/look6/rm/rm-light.json`, frames of 0.15 s): shot starts, exposure 3.29, 2.59, 1.87, 1.21, 0.72, 0.49, 0.48; shot ends 0.68,
2.26, 2.99, 3.64, 4.13, 4.37, 4.38. The light does not jump.

## Item 6: the final scripts

- `firstplay.mjs`, the real founding (no cheat), `FIRSTPLAY_UNTIL=12` (or 10): seed 1 low `test-output/look6/fp-s1` beats 01-12 pass; seed 1 high `fp-s1b-high` 01-12 pass; seed 2 medium
  `fp-s2b-medium` 01-12 pass (outcome 7 workers, reserves 72 %); seed 2 low `fp-s2-low-retry` 01-10 pass. The first seed 2 low run failed at beat 08 (see "Not done"). Past 12: beat 13
  passes at seed 1 low (`o3-s1-low`: the real founding reaches the first workers at 10:47); beat 14 failed there ("no forager laid a trail to the food within 18 000 ticks") because the script laid 12 eggs and the colony handed over 4 workers: with the integrator's `layBatch` fix (below) seed 1 passes beats 01 to 15. Seed 2 past beat 12 was not run.
- `controls.mjs` (`test-output/look6/controls.log`): ok. It records the finding "after a tapped drink the action 'harvest-liquid' keeps running with a full crop" (input / sim, not mine).
- `views.mjs`: ok with the cell camera on (`views4`, `views5`, `views6` after the last cut-away change) and off (`views0`). The first run with the cell camera on failed at the shaft walk ("camera inside solid", field -2 mm): two
  causes, one in the check and one real. The checks (`views.walk`, `clearOk`) did not know that the cell camera stands in soil its cut-away removes (they now count a camera inside
  the cut-away, and free air during the 0.5 s blend, as clear; `src/game/views/debug.ts`, `tests/e2e/views.mjs`, `clearField.testkit.ts` for the three unit tests in
  `views.verify.test.ts` and `reviewFixes.test.ts`). The real one: during the blend into the cell camera the camera could cross soil that the cut-away does not remove (a frame
  at field -1.8 mm in the "release and re-possess down the shaft" test). `ViewDirector.applyCellCam` now cuts to the shot's pose at once where the blended pose would be inside
  uncut soil (`cellSnapped`). Pictures after that change are the same: `test-output/look6/r-s1-low-final/` (`sheets/item1-s1-low-final-after.png`).
- `panels.mjs` (`test-output/look6/panels.log`): every check passed up to "hudfix" at 844 s, then the script timed out at my 900 s limit on the loaded machine; not re-run.
- `hud.mjs` (not in the task's list): failed its first check; fixed in review ("Review fixes" 7), both seeds pass.
- Pictures I looked at: every one cited in this report; the staged night, tunnel and crowd pictures by contact sheet and the key ones at full size.

## Integrator ruling 1 (09:51 UTC): the first clutch and the lay prompt

**1. `firstplay.mjs` laid half its eggs.** `layBatch` pressed lay-egg, stepped 50 ticks, released and stepped 5: 55 ticks, and a batch at the cell's 17 C takes 58 and cannot be
stopped once wound up, so presses 2 and 4 landed three ticks early and were refused `blocked` (12 eggs where it meant 24). `layBatch` now presses, steps 10 ticks, releases (no
repeat), and polls the simulation's own events for the batch's `action-completed` / `action-failed` of lay-egg (at most 600 ticks, in steps of 5): no fixed step count. Every assertion
is as it was (`clutch.eggs >= 6`, the lapse, the outcome). Rerun, seed 1, quality low, the real founding, `FIRSTPLAY_UNTIL=15` (`test-output/look6/fp-s1-lay.log`): the clutch is 24 eggs in 4 batches (`checks.clutch`), the colony hands over 14 workers (it handed over 4), the trail check of beat 14 passes (`via: scouts`), and beats 01 to 15 pass; picture of beat 14: `test-output/look6/fp-s1-lay/14-worker-following-trail.png`.

**2. A press while a batch ends was silently refused.** The prompt line stayed "Lay egg" (available) while the simulation refused the press with `blocked`. GDD 01 9.3 words an action
that cannot be done at this moment as "verb - reason" and greys it (the simulation already words `blocked` as "busy", and does so for "Groom yourself" and "Dig" while any action runs);
GDD 01 and GDD 08 5.3 say nothing about buffering a press, so I show it busy and buffer nothing. (Review: the `markBusy` first written for this was dead code and is gone; the sim's own wording does it, see "Review fixes" 3.) Test:
`src/game/uiBridge/promptBusy.test.ts` (a real press: ready, busy on every tick, the egg offered after). Pictures from the real
founding replayed at beat 08, sealed, then pressed (`tests/e2e/look6-lay.mjs`): `test-output/look6/lay/lay-1-ready.png` ("Lay egg"), `lay-2-busy.png` ("Lay egg — busy", the
three lines dimmed), `lay-3-after.png` ("Lay egg" again); sheet `sheets/ruling1-lay-prompt-ready-busy-after.png`; the sim's events of the presses in `lay/lay.json`: started, failed `blocked`
(the second press), completed (6 eggs).

## Script assertions relaxed for the cell camera, and why each still catches a camera in uncut soil

The cell camera (item 1) puts the camera above the slice plane or behind the vertical section: in soil that the nest renderer removes (`render/nest/cutaway/cutPlane.ts`: everything above
the plane within `radius` horizontally of the centre; or the camera's side of the section). `ViewDirector.cameraInCutAway(p)` is true only then: the cell camera must be on (weight > 0),
`p` must lie within the cut's horizontal reach of its centre, and above the plane (or on the camera's side of the section, past its offset). A camera in soil outside the reach, below the
plane, behind the section or with the cell camera off is not "in the cut-away". Four checks were relaxed and nothing else:
1. `firstplay.mjs` beats 07 and 08, "the camera is inside solid in the shaft / in the chamber": `cam.clear.f > 0 || cam.clear.cutAway` (it was `f > 0`). `clear.cutAway` is that predicate on
   the camera's position of the shown frame. Inside solid outside the cut-away: f <= 0 and cutAway false: the check fails as before. (A frame is also taken before the check now, so a
   failure leaves its picture.)
2. `views.mjs` `clearOk` ("camera inside solid" in the open, wall, ceiling, tunnel and chamber cases): `c.f >= 0.5 R || c.cutAway`. The same predicate; the 0.5 R margin applies to every camera
   that is not in a cut-away.
3. `views.walk()` (`src/game/views/debug.ts`, the "shaft walk" and "chamber walk" minima): each frame's field value counts as the clearance if the camera is in the cut-away, and, while the cell
   camera blends in, free air closer to the wall than the margin (field 0.75 mm against 1 mm, seen once in the shaft test) counts as the margin: `fv > 0 && fv < margin && cell weight > 0`.
   A field value <= 0 outside the cut-away fails at once, with the cell camera on or off; free air under the margin fails when the cell camera is off or fully on. The blend allowance is the one
   weakening of the margin and it is for the 0.5 s blend only (0 < weight < 1: narrowed in review; it had been every frame with weight > 0).
4. The three unit tests of the possession camera's clearance (`views.verify.test.ts` two, `reviewFixes.test.ts` one, "f >= 0.5 R every frame" down the test shaft) use the same two rules through
   `clearFieldAt` (`src/game/views/clearField.testkit.ts`). They were red after the cell camera and one of them found a real defect: a frame of the blend into the cell camera that stood
   1.8 mm inside soil that is not cut. `ViewDirector.applyCellCam` now cuts to the shot at that frame (`cellSnapped`), and the test passes with the strict rule for blend frames inside solid.
How to check that they still catch: put the camera in the soil outside the cut (e.g. `views.cellCam(true)`, then `camera.setPose` below the plane) and the check reports f < 0 with
cutAway false; or run `views.mjs` with `VIEWS_CELLCAM=0` (all checks strict, passes: `test-output/look6/views0`).

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

- `npm run typecheck` (whole project): no errors after my last edit (10:46 UTC).
- `npx vitest run <folder>`, one folder at a time, while no harness was running: `src/render/camera` 94 passed; `src/render/nest` 60; `src/render/world/lighting` 59; `src/render/world/weather` 24;
  `src/render/world/boundary` 38 (1 skipped); `src/render/world/dressing` 36; `src/game/views` 155 (3 of them were red after the cell camera and are fixed, see item 6); `src/game/flows/founding` 25;
  `src/game/uiBridge` 78 (4 new: the busy lay prompt); `src/game/debug` 4; `tests/docs` 8. The whole suite was not run.
- New or changed tests: `shotSubject.test.ts` (the queen's frame), `foundingShot.test.ts` x2 (copy of the frame; the side view holds a sphere of a body length), `lookPass2.test.ts` (night bands, EV pins, the crossfade),
  `lighting.test.ts` (EV pins), the three clearance tests above, and `promptBusy.test.ts` (the lay prompt).
- Not covered by a unit test: `Game.renderScene` drawing the dip as canvas opacity (checked in the browser: `rm/rm.json`), `WorldRenderer`'s use of `blendLighting` (checked: `rm/rm-light.json`).

### Verification after the review fixes (24 Nov, 12:00-16:00 UTC)

- `npm run typecheck`: clean.
- `npx vitest run`, one folder at a time: `src/render/camera` 98 passed (incl. 3 new `cellCam.test.ts` tests, the crossfade test in `rigs.test.ts`), `src/game/views` 160 (incl. the reviewer's `cellCam.verify.test.ts`, now green, and the new `clearField.test.ts`),
  `src/game/uiBridge` 77 (`promptBusy.test.ts` rewritten, the reviewer's `promptBusy.verify.test.ts` unchanged and green), `src/game/accessibility` 8, `src/game/crossfadeVeil.test.ts` 4, `src/render/app` 32, `src/render/world/lighting` 59, `tests/docs` 8, `src/game/debug` 4.
- Browser: `look6-xfade.mjs` ok (crossfade, veil hidden afterwards, nothing left after quitting to the title); `hud.mjs` seeds 1 and 2 pass (`HUD_SHOTS=0`); `views.mjs` passes with the narrowed clearance rule (`VIEWS_SKIP_HIGH=1`, `views7.log`);
  `firstplay.mjs` seed 1 low rerun to beat 09 after the cut changes (`test-output/look6/fp-s1c/08-founding-chamber.png`, `09-sealed.png`: the queen whole in her cell, the soil cut away; the run was stopped by my 570 s limit before beat 10, it needs about 900 s on this machine).
- Not rerun after the review: `panels.mjs`, `controls.mjs`, `firstplay.mjs` seed 2 past beat 12 or seed 1 past beat 09. The whole suite was not run.

## Decisions and deviations

- The night is brighter than look pass 3 deliberately (the integrator's ruling in this task), `targetE` 4; the pinned band and EV numbers of two tests were changed with it.
- GDD 08 7.10 (cutaway) decides the tight-room camera, because GDD 01 6.2-6.5 and 08 11.5 are silent: recorded in `constants.ts`.
- GDD 08 11.4's overcast haze (+20 %) is kept as it is (item 4).
- The card's lift and fill changed (0.42 / 0.74 -> 0.55 / 0.55) for the 1280 x 720 reference card; other window sizes keep the proportions.
- The dip of a long camera hop is drawn as the game canvas's opacity (no extra full-screen element); the reduced-motion crossfade is a real blend of two images (a 2D canvas veil holding the last frame, `crossfadeVeil.ts`), as GDD 08 7.10 asks.
- Added debug hooks: `__game.renderFrame({ dt })`, `__game.lighting()`, `__game.views.hideLayer(name)`, `__game.views.cellCam(on)` (earlier pass).

## Needs from others (not mine to edit)

1. `src/worldgen/catalog/interior/shell.ts`: the weep-vent bar is bright white; a buff or dark colour removes the "white ticks".
2. `src/sim`: at seed 2 rain floods the founding chamber during the first brood (alert "Founding chamber flooding", seen in `fp-s2b-medium/08..11`); the card still reads
   "First workers: 7" because the colony survives. The site read-out calls the flood safety "Raised".
3. (closed) beat 14 of `firstplay.mjs` at seed 1 failed only because the script laid 12 eggs; see "Integrator ruling 1".

## Not done

- Seed 2 at low: only beat 07 (`s2-rec`) and the first failing run (`fp-s2`: beat 08 "the camera is inside solid in the chamber", state tunnel, field -2 mm, no cut-away). Not
  reproduced at medium (twice) with a picture; `firstplay.mjs` now takes the picture before the check and logs the cell camera's state: a retry at low (`fp-s2-low-retry`, beats 01-10) passed the same check with the cell camera on (cell weight 1, cut-away true), so the failure is intermittent and unexplained; it may be the camera's 1 s settle before the check on a loaded machine (the cell camera takes 0.3 s to engage and 0.5 s to blend in). Not closed.
- Medium and high pictures for seed 2 of beat 09 to 10 exist at medium only.
- The 45 degree possession-camera case of look pass 5 item 6 was not revisited.
- New moon against full moon at night was not pictured.

## Still unfinished, most serious first

1. **The flood sheet** (`render/world/weather/floodWater.ts`): in a flooded shaft or cell (seed 2, rain) the standing water is one flat sheet cut by the carve cells. Seen edge-on
   it is a thin pale band across the picture (`test-output/look6/fp-s2b-medium/10-first-clutch.png`), seen from above a pale blocky blue shape over the queen
   (`08-founding-chamber.png`, `fp-s2-low-retry/08-founding-chamber.png`). It reads as water now, not as a smudge, but not as a puddle with a shore.
2. **Dithered ants in a crowded chamber** (criterion 2 is partial because of this): ants between the camera and a possessed worker are drawn through the 4x4 ordered dither of GDD 01 6.5 rule 2; with eight workers round her the
   picture is hatched legs and bodies (`test-output/look6/cc/cc-after-noon-crowd-low.png`, `-high.png`). The rule is the design's; a softer dither or a fade by distance is a decision for the GDD owner.
3. **The cut when the cell camera takes over**: where the blend would cross uncut soil the picture cuts to the cell view at once (`cellSnapped`). Frames of that cut were not pictured.
   Where the queen stands at the rim of her cell after the script's orbit (beats 09 and 10 at medium and low, `r-s1-medium-cc1/s1medium-09-sealed.png`) she is whole but at the top left of the frame.
4. **The outcome card** leaves the queen whole above the card, but her head touches the card's top edge at seed 1 (`fp-s1b-high/12-outcome-card.png`); the cell is cut by the top of the frame.
5. **Seed 2 past beat 12** was not run with the fixed `layBatch`; beyond beat 15 of seed 1 was not run.
6. **Weep vents on the kitchen-door wall are white ticks** (world catalogue, `src/worldgen/catalog/interior/shell.ts`, not mine).
7. **Distant buildings at overcast** are pale grey shapes (GDD 08 11.4 haze, kept): `test-output/look6/o3-s1-low/05-site-readout.png`.
8. **Night**: the ant at 22:00 has almost the luminance of the ground (ant contrast 0.00-0.02, `night/a/*.log`; her outline carries her); pale leaf litter is brighter than the soil it lies on
   (`night/b/b-v1-h22-clear-observerlow-high.png`); new moon against full moon was not pictured.
9. **Seed 2 at low, beat 08**: one run failed the camera-clearance check, not reproduced (see "Not done").
10. **Frame times** (SwiftShader, loaded machine) mean nothing about a real GPU; the clover head's white (medium and low) is a flat white dome, brighter than a real clover.
