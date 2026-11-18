# app-seams-2 report (Sonnet implement)

Engineer: app-seams-2 impl. Two sessions: the first (05:07 to the 06:12 restart) wrote items 1 to 11 and most of 12; this one (06:13 on) finished 12, ran every
picture and e2e script again on the final tree and wrote this report. Progress log: `docs/design/tasks/progress/app-seams-2-impl.md`.
Evidence root (git-ignored): `test-output/app-seams-2/`. The machine had a load average of 5 to 10 throughout; one browser at a time.

## Summary

All thirteen items are done in code with tests. Pictures were taken and looked at for items 1, 2, 3, 4, 5, 6, 9, 12 (observer, quality, backdrop facade) and
for the manual. Items 12 (a), (c) and the slope half of (e) are **not demonstrated by a picture** as fixes (a: a modest change only; c: the disc could not be reproduced; e: the steepest ground near the colony is 16 degrees and the pair looks alike), and
item 13 is **not finished**: `firstplay.mjs` runs beats 1 to 15 and then stops at a simulation failure (beat 16), so not all 25 beats run. The far wall blocks
of the opening shot (b) were traced to the backdrop facade, not to prims; the facade is improved, the pale blocks in the suburban seed are **not** fixed.

## Fix round (after the independent review), 2026-11-18

Progress log: `docs/design/tasks/progress/app-seams-2-fix.md`. Evidence: `test-output/app-seams-2-fix/`.

* **Focus line, new aim behind an older one (major): fixed.** `UiFocusAim.openIds` (all open aims, oldest first; additive, optional) is filled by `focusAimOf`; `FocusLineClock.note` now starts the 30 s window
  for any open aim it has not seen (and still for a changed top aim), `shownId` words the announced aim while the window runs. Tests: `ui/hud/focusLine.test.ts` (new cases) and the reviewer's
  `focusLine.verify.test.ts` (now green). Picture: `hud/r03-new-aim-behind-older.png` (the line reads "Aim: Where do the dead go?" while the older aim stays open).
* **Long aims cut off: fixed.** `.fd-focus` is 304 dp wide with `min-height` 24 dp and wraps to at most two lines (`hud/r02-opening.png`).
* **Minimap repaint while hidden: fixed** (`Minimap.tsx` skips the frame and the paint while its box has no layout; `hud2.log`: compact layout, `shown:false`).
* **Item 13: all 25 beats now run, in two segments.** Beat 16 was a SCRIPT fault, not a sim one: the possessed worker stood outside (`nestId -1`; `unload-crop` answers `not-allowed-here` there) and aimed at a stale
  nestmate position (`out-of-reach`). The script now walks her down the shaft along the entrance-to-room heading into the room and unloads there (`unload-crop` needs a food chamber, or any chamber when the nest has none).
  Beats 17 to 25 had never been run: the colony-view beat framed the camera on the nest only, so the food was off screen (the forage marker click missed); it is now framed between nest and food. New options:
  `FIRSTPLAY_TRAIL_CHECKPOINT` / `FIRSTPLAY_AT_TRAIL=1` (continue from the trail check, no 16000-tick wait; about 8 minutes). Result `fp-fast4.log`: beats 14 to 25 all taken (`fp-fast4/`), the only failure left is
  the growth check, a sim reason: game days 2 to 3 at 8x: workers 6, 6, 6; brood 7, 1, 1; P 0.91, 1.38, 1.30; C 10.43, 10.8, 10.8. Beats 1 to 13 are from the earlier full runs (hand-over checkpoint of run 5); no stand-in is
  used in beats 14 to 25 (the trail came from the player's forage marker). No single 40-minute pass of all 25 beats was run on the final tree.
* **12(a) cuticle: second look.** `CUTICLE.roughness` 0.5 -> 0.62 and `clearcoatRoughness` 0.2 -> 0.42 (test asserts the floor): in the opening shot the gaster highlight is now a soft sheen, no hot spot
  (`blocks2/opening.png`, `fence-high/hide-none.png` at quality high). Still a glossy black ant, not matte; judged by eye only.
* **12(b) far blocks: root cause found, two fixes.** The pale slab in the suburban opening is NOT the backdrop facade: hiding sky, backdrop and skirt one by one left it (`hide/`), hiding `world:prims` removed it. It is a
  single garden fence panel prim (wood, 1.74 x 1.65 m x 20 mm) 3.5 m away, which the exp2 haze covers completely. (1) `surfacePatch.ts`: wooden instanced panel prims get upright boards (150 mm, dark gap, tint per board,
  faded out where a board is under about 3 px) from the prim's own size, and keep 55 % of their colour through the fog; test `materials/fenceBoards.test.ts`; picture `fence/hide-none.png` (quality low) reads as a board fence with a post;
  at quality high the boards are fainter (depth of field and grass in front) but the slab is gone (`fence-high/`). (2) The backdrop's garden fence is built of boards and posts and keeps part of its colour through the haze
  (`backdrop.ts`, `BACKDROP_FENCE_KEEP`; test in `facadeKeep.test.ts`): the far fences read as fences. The house facade of the kitchen-door seed is unchanged from before.
* **Not done / not demonstrated:** 12(c) (white crevice disc never reproduced), 12(e) slope camera pair, item 11 (`lifecycle.mjs` never run: no epitaph picture), a note for the integrator on 12(d): `stage1a.mjs`
  compares against the count before any switch; going back to the first preset keeps 7 textures and 24 programs that only other presets use (three caches them), so the warm-up baseline is the right figure.
* `tests/docs/docs-final.test.ts` now fails on `R29: LAY_FINISH_STEP_D28 in src/sim/balance/colony.ts`: `DEVIATIONS.md` names a symbol that another engineer's sim change removed; not in my paths.

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean; tests green in every folder touched; `tests/docs/docs-final.test.ts` green | **met** | `npm run typecheck`: no output. `npx vitest run src/ui src/game src/content src/input tests/docs src/render/app src/render/ants src/render/world/boundary src/render/world/sky src/render/world/lighting src/sim/config`: 204 files, 1537 tests passed, 1 skipped file (`test-output/app-seams-2/vitest.log`). |
| 2 | Pictures: minimap (observer, possession, marker, entrance, scent view), focus line (new colony, new aim), settings rows, New Game rules, intro card without prompt | **met** | `hud-final/` (below). `panels.mjs` passed (`panels.log`, `panels/`); `controls.mjs` passed (`controls.log`). |
| 3 | This report with picture paths and what is undone | **met** | this file |

## Items

1. **Minimap**: `src/game/uiBridge/minimap.ts` (data: 256 BU window round the camera target, north up, zones from the static zone map, entrances, markers, the possessed
   ant with its heading, scent trail cells when the scent view is on; constants in `uiBridge/balance.ts`), `src/ui/hud/minimap/{model.ts,Minimap.tsx}` (canvas, click
   pans the observer via the bridge's `panTo`), `hud.css` (hidden in the compact layout and while a drawer is open), setting Never / Always in Settings > Gameplay
   (`gameplay.minimap`, default Never). Tests: `uiBridge/minimap.test.ts`, `ui/hud/minimap/model.test.ts`. Pictures: `hud-final/02` (opening, ant arrow),
   `03-possession-minimap-scent.png` (arrow, entrance ring, two markers, trail, scent view on), `04-observer-minimap-scent.png` (observer: entrance, markers, trail, no arrow),
   `05-observer-after-click.png` (a click on the minimap moved the camera 485 mm; the window re-centred). Not pictured: the compact layout (CSS rule only).
2. **Focus line**: `UiSnapshot.focusAim` (`ui/api.ts`, `uiBridge/hudSlices.ts`), `ui/hud/{focusLine.ts,FocusLine.tsx}` (Auto: first two game days of a new colony, then 30 real seconds
   when a *different* aim opens; Always; Never; click opens Journal > Aims). Tests `ui/hud/focusLine.test.ts`, `uiBridge.hud.test.ts`. Pictures: `hud-final/02-opening-focus-minimap.png`
   (new colony: "Aim: Where is the ground sheltered, warm and diggable?" under the clock), `06-focus-line-new-aim.png` (a later aim, "Where does the nearest sugar lie?").
   Staging: the second picture closes the top aim by hand (no milestone fires in a cheat-staged game); the first aim is "not new" by design when the HUD first looks at it.
3. **Auto-slow settings**: Settings > Gameplay has "Slow down at a critical alert" (Pause / Slow to 1x / Off) and "Slow down at a warning" (Slow to 1x / Off) (`GameplayTab.tsx`);
   a new game starts with the preset's `autoSlowDefault` as the critical choice (`Game.newGame` -> `presetAutoSlow`, Gentle pauses, the others slow), so the preset row is in effect
   and `autoSlowDefault` is not in `UNWIRED_PARAMS`; the old rule override (`withGameRule`) is gone. Tests `time/autoSlow.test.ts`, `autoSlow.verify.test.ts`. Pictures `hud-final/09`, `10`.
4. **Rules not offered**: checked in a browser (`tests/e2e/appSeams2-rules.mjs`, `rules.log`): `winterMode` is honoured (time-lapse mode raises the banner and lapses to spring; real-time
   mode plays the winter days with no banner) and is now a New Game custom rule ("Winter", `NewGame.tsx`, `form.ts`). `extinctionEndsGame` works in the simulation, but no screen retires a colony,
   so a game with it off could not be ended: it is listed greyed with "Not in this build" and its help text says why. Picture `hud-final/12-new-game-custom-rules.png`.
5. **Strings**: the start help derives the species' day from data (`species.ts` `startOf`: "Natural begins on day 5 of Spring, when black garden ant queens found."); plural rule
   (`2 young rivals nearby`; picture 13 rows); `PRESET_TEXT` claims replaced by one `PRESET_SUMMARY` per preset in `presetDisplay.ts` that says what the preset changes (used by the cards); rule effect texts
   name the part not in effect ("Not in this build"); `controlsMarkdown()` puts the fixed pad chord in the gamepad column; the comment in `content/text/controls.ts` names `docs/MANUAL.md`;
   the Lineage note is in the manual (section on the title menu: "Shown only when there are lineage records"), and the claim "rules can be changed later in Settings" is gone (rules are fixed at world creation, said in the
   manual and on the screen: "Rival count and season length are fixed when the world is generated"). Tests `ui/screens/newgame/newgame.test.ts`, `content/text/controls.test.ts`.
   `presetDisplay.ts` was edited in the display strings only; the other engineer's `UNWIRED_PARAMS`, `UNWIRED_RULES`, `UNWIRED_WHY` were read and left as they are.
6. **Overlap**: `ui/hud/blockingCard.ts` (`isBlockingCardUp`: intro card, time-lapse, outcome and failure cards, winter banner/lapse/report, flight prompts) gates `ContextPrompts.tsx`. Picture `hud-final/01-intro-card.png`:
   the opening card with no "Groom yourself" / "F Dig" over it (BEFORE, the bug: `before-01-intro-card.png`). Test `blockingCard.test.ts`.
   Also found while looking at the journal pictures and fixed: the onboarding hint card ("Tab Next ant") and the founding hand-over card ("Stay with the queen / Take a worker") were drawn over an open journal book; `prompts/hint.css` and
   `screens/founding/founding.css` now hide them while a book is open. Picture `hint-journal/journal-with-hint.png` (hand-over just done, journal open: clean; the hint card's computed visibility is `visible` before and `hidden` with the journal open, `hint-journal.log`).
7. **Species flag**: `game/flags.ts`: `species=` is honoured only with `?test=1`; test `flags.test.ts`.
8. **One manual**: `docs/MANUAL.md` is the manual (sections 0 to 20; the old folder's HUD table, every-screen table, roster/journal/health, nest sections, species, settings extras, troubleshooting,
   pointer lock, browser keys and rebinding became sections 15 to 19; generated tables between `<!-- generated:NAME -->` markers, regenerated by `npm run sim -- tests/docs/regen-manual.mjs`);
   `docs/manual/` is deleted; `src/content/manual.test.ts`, `manual.verify.test.ts`, `text/controls.test.ts` point at the one file. Facts of items 1 to 5, 7 and 10 are in it.
9. **Journal dates**: `calTick` goes through `uiBridge/panels/journalSlice.ts` into `timeline.ts` (`dateLine`, `timeLine`, `milestonePins`) and `charts.ts` (`calDay`); `AimsTab`/`LogTab` pass it.
   Test `ui/panels/journal/calTick.test.ts`. Picture `hud-final2/07-journal-log-across-winter.png`: the event log after a played winter lists "Summer Day 1 Year 1", "Autumn Day 7 Year 1",
   "Winter Day 1 Year 1" and then "Spring Day 1 Year 2" in order, each with its own date; `08-journal-milestones-across-winter.png`: "First winter, Spring Day 1 Year 2" on a timeline with the winter band.
10. **Manual drift**: the opening grace period row has no "(not in effect)"; the count of rows not in effect and the generated tables follow `UNWIRED_PARAMS` / `UNWIRED_RULES`; New Game greys the same rows
    (picture `hud-final2/13-new-game-preset-rows.png`: "Threats during the opening: Not in this build"). `tests/docs/docs-final.test.ts` green (the `MANUAL_ONLY_UNWIRED_LABELS` exception was dropped).
11. **Epitaph by cheat**: `tests/e2e/lifecycle.mjs` kills with `cheat.kill` and a cause per ant (`killAll` takes no cause and is a sim file). **Not run in a browser** (long); reading only.
12. **Left open by look-pass-3**:
    * (a) cuticle, **partial / not demonstrated**: one set of values for queen, gyne, male and worker (`ants/tuning.ts` `CUTICLE`, `ANT_DAY_LOOK`: clearcoat x0.45 by day, a full gaster has no clearcoat, dark brown hair rim
      instead of beige, `morph/lasius.ts` unified, `fragmentChunk.ts`, `materials.ts`; test `ants/cuticleLook.test.ts`). The same-pose crops `crop-queen-before.png` / `crop-queen-after.png` are almost identical:
      the sky highlight on the gaster stays. A second tuning (`CUTICLE.roughness` 0.35 -> 0.5, `ANT_DAY_LOOK.clearcoatMul` 0.45 -> 0.3) was then taken in the same pose from the opening shot
      (`crop-queen-3way.png`: original | first change | second tuning; `look-before/`, `look-after/`, `look-after2/` `02-far-walls.png`): the highlight on the gaster is smaller and softer and the body is a little more matte;
      it still reads glossy, not matte chitin, and the legs were already dark in this seed. A modest, visible change, not a solved look. The same constants feed the Messor morphology (an unavailable species).
    * (b) far wall blocks, **partial**: they are not prims (no tall box prims exist): they are the boundary facade backdrop. `boundary/{meshBuilder,backdrop,edgeHaze,boundaryRenderer,tuning}.ts` now keep part of
      the facade's detail out of the haze (`BACKDROP_KEEP_HAZE`); test `facadeKeep.test.ts`. Kitchen-door seed 2, `kd-walls-before.png` vs `kd-walls-after.png`: the house at top right has windows and edges now. The
      pale blocks in the suburban seed 2 opening are something else (no facade in that backdrop, `keepOnes 0`) and are **not fixed**. The first attempt (a prim shader treatment) was reverted.
    * (c) white disc in the crevice, **not reproduced / not demonstrated**: `sky/skyDome.ts` has an "earth" backdrop colour below the horizon while the cutaway fade is active, set from `frame.occlusion` in
      `worldRenderer.ts`; test `sky/skyEarth.test.ts`; the crevice pictures (`look-before/03`, `look-after/03`) are alike because the disc did not appear in either.
    * (d) quality switches, **partly met**: no leak per switch (found by patching `createTexture` / `deleteTexture`: about 25 textures are deleted and recreated per switch, the count is flat after the first cycle).
      The one real retained waste was the sun shadow map staying allocated when a preset turns shadows off: `render/app/shadows.ts` frees it (test `shadows.test.ts`). `tests/e2e/look3-qs.mjs` now warms up one
      cycle and fails if geometries, textures or programs grow by more than 2 over the next five switches: result `qs-after.log`: textures 44 -> 44, programs 71 -> 71, geometries 67 -> 67; the
      count before the first switch (37 textures, 47 programs) is lower because presets upload the textures they draw and compile their programs on first use and three keeps them: the old "textures <= before + 4" check cannot be met by any
      game that visits a second preset, and stage1a's check should read the post-warm-up figure.
    * (e) same-pose pictures: `tests/e2e/appSeams2-poses.mjs`, run on the current tree (`poses-after/`) and on the tree before look pass 3 (`poses-before/`, `git archive 2fbf1a8~1`).
      Observer after the colony view (followed worker underground): BEFORE `A3` the orbit camera sits in the soil on the ant (`followId` 5571, camera y -23.7 mm); AFTER `A3` the observer is free above the nest
      (`followId` -1, y 128.6 mm). **Demonstrated.** Slope: the steepest ground within reach is 15.9 degrees, 329 BU from the entrance; `B1`/`B2` before and after look alike (the horizon sits a little higher after); **not demonstrated**.
13. **`firstplay.mjs` beat 11**: **cause found and fixed in the script; the 25 beats do not all run: beats 1 to 15 pass, beat 16 fails for a sim reason.**
    * Cause of beat 11: the founding flow (`src/game/flows/founding/**`) does not close the overlay. The simulation ends the lapse itself when every egg of the clutch is lost before an eclosion
      (`colony/founding/failure.ts` `broodLost`, rule of the fnd-review): the opening goes back to the lay phase for ONE relay clutch and the overlay is rightly gone. The script then waited for "Tend the brood"
      without laying the relay clutch. Now it logs the trace, lays the relay clutch with the same lay batches as the first one, and presses the button with a DOM click (Playwright's click kept losing the re-rendered button).
      The numbers: in 3 of my 5 full runs of seed 2 (1, 2 and 4) the first six eggs were all lost at lapse progress 0.028 (counters `eggs 6, lost 6`, queen reserves 0.95, site read-out "Poor", Q 0.71, warmth "Shaded"); in the
      first two the script failed before the relay outcome showed (the bugs above), in the fourth the relay clutch was lost too and the opening failed (`no-workers`, `phase: failed`); in runs 3 and 5 nothing was lost at the start
      (lapse trace at progress 0.32: eggs 3, larvae 6, lost 3) and beats 11 and 12 passed. The outcome differs from run to run
      on the same seed: that is a finding for the founding owner (a real founding in a "Poor" site loses its first clutch half a day in).
    * With that fixed, runs reached: beats 1 to 13 (run 3), then "no forager laid a trail to the food within 18000 ticks" even though the player placed a forage marker on the food: the colony does not send foragers out reliably (sim). Option
      `FIRSTPLAY_STANDIN_TRAIL=1` (new; listed in `result.standIns`) lays the trail by hand and re-spawns the food (the first spill is used up after 18000 ticks). Run 5 with it: beats 1 to 14 passed; a resumed run (checkpoint written after beat 13 with
      `FIRSTPLAY_CHECKPOINT`, `FIRSTPLAY_RESUME`) passed 14 and 15 (trail came from the player's forage marker this time, `via: forage-marker`, scent 0.022 mid-way) and fails at beat 16: "the worker did not hand over her load"
      (crop 0.379 after the gives; stores C 10.62 -> 10.50, deliveries 6 -> 9). Beats 17 to 25 were not reached.
    * The growth numbers at beat 14 (runs 5 and 6, tick 47016 to 49116): queen 1, workers 6, brood 5 to 9, stores C 10.5 to 10.7 / P 0.9 to 1.3, deliveries 6 to 9. The growth check itself (a late beat) was not reached.
    * Logs: `firstplay-full*.log`, `firstplay-resume.log`; pictures `firstplay-full*/`, `firstplay-resume/` (beats 1 to 15).

## Contradictions and decisions

* GDD 08 §3 says the Focus line shows "for the first 2 game days": the clock is the sim's game days (a cheat-staged colony is past them at hand-over).
* The minimap: GDD 08 says T2 and Never by default; the spec adds the compact-layout rule: both followed. The window is 256 BU; the trail layer needs the scent view (as specified).
* `autoSlowDefault`: made the default of the setting (spec option 1), not marked "not in effect".
* Precedence applied: design seed > design directions > GDD index > chapter; no conflict found that changed a rule.

## Things the owners of other files should know

* `README.md` is stale: line 113 still says the `species=` flag accepts all four ids (only `?test=1` does now) and line ~190 and others still point at `docs/manual/` (deleted).
* Alert text `winter-coming` (`content/text/alerts.ts`, parameters from `sim/colony/succession/alerts.ts`) reads "stores cover 28 of 7 days" when the stores last longer than the winter (seen in the event log picture): the sim should
  pass the days capped at the winter length, or the text should say "stores last 28 days, winter lasts 7". Not changed (sim file, and the design's wording is "stores cover 6 of 7 days").
* The queen status mini panel (Reserves / Drying / Health) is still visible at the left edge beside an open journal (`panels/11-journal-log-1280.png`).
* `tests/e2e/lifecycle.mjs` was not run (see item 11).
* Sim findings from `firstplay.mjs` (above): first clutch lost half a day into the lapse in about 3 of 5 runs of seed 2 (founding owner); no forager lays a trail to a sugar spill 22 BU from an open entrance within 18000 ticks even with the player's marker on it (colony/forage owner);
  `trophallaxis-give` by a possessed worker does not empty her crop (action owner).
* Several sim changes by other engineers were in the tree during my runs (`src/sim/createGame.ts`, `sim.ts`); I did not touch or test them.

## Pictures (all under `test-output/app-seams-2/`)

`hud-final/01..13` (first full run), `hud-final2/01..13` (second, with the journal across a winter: 07, 08), `before-01-intro-card.png`, `poses-before/`, `poses-after/`, `look-before/`, `look-after/`,
`kd-walls-before.png`, `kd-walls-after.png`, `crop-queen-before.png`, `crop-queen-after.png`, `panels/`, `firstplay-full/`.
Scripts: `tests/e2e/appSeams2.mjs`, `appSeams2-look.mjs`, `appSeams2-poses.mjs`, `appSeams2-rules.mjs`, `look3-qs.mjs`, `firstplay.mjs` (relay clutch, `FIRSTPLAY_STANDIN_TRAIL`).
