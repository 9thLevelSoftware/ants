# Stage 1B gate — application half (int-1B-app) report

The first playable now runs end to end in the browser on the real screens: the title with its live backdrop, the
New colony screen, world generation with an honest progress bar (in a worker in the portable build), the founding
queen in third person, the founding dig, the first workers, an autonomous colony the player can join (possess any
ant), direct (Colony orders, markers, dig plans), inspect (Roster, inspect card, observer follow, colony slice) and
save / continue from the pause menu. The final first-play run (`test-output/gate1b/chain4/firstplay/`) goes from
the title through the player's own founding (site read-out, dig, chamber, seal, clutch, time-lapse, outcome, the
workers reopening the plug) to the colony beats and a save / continue with the same state, **with no stand-in and
no console error**. The founding-close fixes for sealing and reopening landed while this gate ran; the earlier runs
(`fp2/`, `fp5/`) that needed two recorded stand-ins are kept for the record.

Evidence: `tests/e2e/firstplay.mjs` (harness, `test` quality, 1280 x 720), outputs in `test-output/gate1b/`
(git-ignored): `chain4/firstplay/` (the full run, no stand-ins), `fp2/` and `fp5/` (earlier runs), `controls/`,
`chain/`, `chain2/`, `chain3/` (quality switch, sweep, portable, existing scripts, perf).

## 0. Acceptance status

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | typecheck clean; tests under `src/render`, `src/game`, `src/ui`, `src/input` green | met | `npm run typecheck`: 0 errors in the whole tree (final run). `npx vitest run src/game src/ui src/render/slots src/render/camera src/render/app src/input`: all green (see the final numbers in section 6); `node --test tools/build/portable.verify.test.mjs` 15 / 15. Baseline before my changes: 1185 / 1186 over `src/render src/game src/ui src/input` (the one failure, `autosave.fixes.test.ts`, was a malformed test fixture and is fixed) |
| 2 | `firstplay.mjs` passes with no console errors and no stand-ins | met | `chain4/firstplay`: `ok: true`, `standIns` none, `consoleErrors` [], 24 beats in 21.6 min. Founding: site Q 0.65 "poor", shaft 208 bites to 7.4 BU, readiness 1, sealed with 4 seal actions (`sealed:138`), 24 eggs (forecast 11-21 workers), lapse skipped by the real button, outcome 14 workers at 40 % reserves, plug reopened by the workers (`open:40`) and a worker outside. Colony: scouts found the spill and a trail formed in 2 400 ticks, trail walk 5 / 7 samples on scent, harvest crop 0 → 0.61 C, delivery crop → 0.21 and stores 0.61 → 2.95 C, Colony orders auto → 35 / 35 / 30 / 0, Roster 15 ants, follow + inspect, forage marker, a valid dig plan, save → title → continue hash `0662fa36` = `0662fa36`, view `observer` restored with its pose |
| 3 | every existing browser script passes (`stage1a` strict) | partial | all pass (section 6) except `stage1a.mjs` strict, which stops at its own recorded stand-in for pellet hauling (beh-nest 1B, simulation half) |
| 4 | visual sweep reported, every defect fixed or assigned | met | section 4 (5 archetypes + the car-park under-car frames) |
| 5 | performance reported; no leak over two game cycles | met | section 5: 333-379 ants, `test` and `low`, 5 min at 8x, GPU memory back to 35 geometries / 48 textures after each cycle |
| 6 | portable build verified; short first play in both hosting situations | met | section 7: `verify:portable` OK (strict), the short play passes from a sub-path (save / continue same hash) and in the sandboxed iframe (no storage there: the disabled Save with its notice is checked) |
| 7 | every application item of `notes-1B.md` accounted for | met | section 9 |

## 1. What the player can do now

- Boot to the title (left-column menu over a live, slowly drifting backdrop), open **New colony** (species,
  locality, size, rules, seed), **Begin**: the loading screen names the worldgen stage from the generator's own
  progress (in the Blob-URL worker in the portable build, on the main thread otherwise), then the intro card.
- As the founding queen: walk, run, climb, antennate the ground for the site read-out, dig the shaft and the
  founding chamber (the readiness bar fills, the mound grows at the mouth), seal the entrance, lay the clutch,
  "Tend the brood" for the time-lapse (skippable), read the outcome card; the first workers reopen the plug.
- After the hand-over: take a worker, follow the trail to food, drink, carry it home and hand it to a nestmate;
  the queen's **Colony orders** (I) with working sliders; the **Roster** (L); select and follow an ant from the
  observer with its inspect card; the colony view with the slice cutaway, a forage marker and a dig plan placed off
  the founding chamber; time at 8x while observing.
- **Pause → Save → Return to title → Continue** gives the identical state (`stateHash` equal); the save now records
  the view and the observer camera, so the player comes back where they left.
- Every control works without pointer lock (RMB drag orbits); keys and gamepad stick move the possessed ant;
  rebinding a key changes the prompt chip.

## 2. First-play screenshots (`test-output/gate1b/chain4/firstplay/` unless noted; all looked at)

| Beat | File | Judgement |
|---|---|---|
| Title | `01-title.png` | Good. FOUNDRESS wordmark and menu in the left column over the live backdrop (two ants, a pebble, soil). A hard vertical edge in the sky where the left scrim ends (x about 770) — ui-shell's scrim gradient. |
| New colony | `02-new-colony.png` | Good. Species cards, locality list, size, seed field (typed 00000002 → code 0000-0002), rules, Begin. |
| World + intro card | `03-world-intro-card.png` | Good. The card over the generated world (20 s generation); no storage toast any more. |
| Queen on the surface | `04-queen-surface.png` | Fair. The queen in the lower middle (measured y 477 of 720, x 640) at 3.5 L; seen from straight behind she is foreshortened (auto-follow, GDD 01 §6.2). Pale untextured house masses behind (look pass). |
| Site read-out | `05-site-readout.png` | Good. Queen in profile, large; "Poor Q 0.65" with its factor rows; the "+2 more" chip sits just under the read-out (ui-panels HUD stacking). |
| Digging, mound | `06-digging-entrance-mound.png` | Fair. The dig takes the evening; the mound and hole are a dark red-brown patch at night. |
| Inside the shaft | `07-inside-shaft.png` | Good. Tunnel camera behind and above the queen (f 1.78 mm, never inside solid); warm underground look. The founding "Chamber" bar overlaps the possessed-ant panel (ui-panels). |
| Founding chamber | `08-founding-chamber.png` | Good. "The chamber is ready", "Seal the entrance". Two prompts name E at once (founding / actions). |
| Sealed | `09-sealed.png` | **Weak.** Sealed (`sealed:138`), but the frame looks up the throat from below the queen: the cone-occlusion dither cuts a large stippled disc of pale sky through the terrain around her, so the sealed plug does not read as closed. Views (occlusion near the throat) / founding camera. Prompts right after sealing offer "E Open entrance" (founding). |
| First clutch | `10-first-clutch.png` | Good. Queen large in the cell with her eggs; the clutch panel (24 of 48, first workers 11-21, reserves then 42 %, safe up to 35); "Tend the brood". Orange status triangle: a warning-level diagnostic other than the four by-design founding ones (which the pulse now skips); the old red mark is gone. |
| Time-lapse | `11-timelapse.png` | Good. "First brood" title, counters (9 eggs, 11 larvae), progress bar, Space Skip; reserves 88 %, brood lost 4. |
| Outcome | `12-outcome-card.png` | Good. "First workers: 14 · Queen's reserves: 40 %", Continue; the workers around the queen in the cell. |
| First workers at the entrance | `13-first-workers-entrance.png` | Fair. 00:22 at night: the reopened entrance in its mound, readable; no worker in the frame at that instant. |
| Worker following the trail | — | Not shot in this run: the possessed worker reached the food in 7 steps, before the beat's sample (it fires at the 13th); 5 of 7 samples were on scent. In `fp5/14-worker-following-trail.png`: worker on the trail, prompts, washed-out house wall behind (look pass). |
| Harvesting | `15-worker-harvesting.png` | Fair. Crop 0 → 0.61 C; the spill itself is hidden behind the worker. |
| Delivered | `16-worker-delivered.png` | Good. In the tunnel among nestmates; crop → 0.21 after trophallaxis, stores 0.61 → 2.95 C. |
| Queen, Colony orders | `17-queen-colony-orders.png` | Good. Drawer readable; ArrowRight on the Forage slider switched Auto off (35 / 35 / 30 / 0). |
| Roster | `18-roster.png` | Good. 15 ants, quick-possess buttons, sortable table. |
| Observer follow + inspect | `19-observer-follow-inspect.png` | Fair. Follow orbit in a tunnel is very close; the card is readable. |
| Colony view, slice, marker, plan | `20-colony-slice-marker-plan.png` | Fair. Slice through the founding level, the forage marker ring, the dashed dig-plan ghost (valid). The nest is small at this zoom; no labels in slice mode (views). No light-blue disc. |
| Day 2 at 8x | `21-day-2-8x.png` | Fair. HUD at 8x. |
| Day 3 at 8x | `22-day-3-8x.png` | Fair as a frame; **the colony starves for protein**: workers 14 → 14, brood 7 → 2, C 2.9 → 13.2 but P 0.03 → 0 ("The colony is starving", "Brood growth has stalled ×21", "Protein stores low"). With only a sugar spill near the nest the foragers find no protein in two days; season turns to autumn. Simulation balance / world food (reported). |
| Pause → Save | `23-pause-save.png` | Good. The Save book above the HUD (fixed stacking). |
| Title, Continue | `24-title-continue.png` | Good. Continue names the colony, season, day and workers. |
| Continued | `25-continued.png` | Good. Same state (hash `0662fa36` both sides) and **the same observer pose as before the save** (compare 22): the save meta's camera is restored. |

## 3. Defects fixed (file — cause)

| Defect | File(s) | Cause and fix |
|---|---|---|
| The live game showed the boot placeholder screens; New colony, Load, Settings, Codex, Credits unreachable | `src/ui/App.tsx` | App still rendered `src/ui/boot`. Now `HudRoot` + `FoundingOverlay` + `ScreenRouter` (ui-shell's router installs its own stylesheet, scale, keys, gamepad navigation). |
| Nothing persisted (no saves, settings, bindings) | `src/main.ts` | `installPersistence(game)` was never called. Called after boot without blocking it; awaited before `__ready` in test mode so scripts can use `__game.saves`. |
| Save storage reported unavailable at the first game ("Saving to this browser is not available here") | `src/game/save/indexedDbStorage.ts` | The 6 s open timeout ran while main-thread world generation blocked the event loop; the timer fired before the queued success event. The timer now adopts a request that is already `done`. |
| Pause menu's Save / Load book drawn under the HUD | `src/ui/screens/ScreenRouter.tsx`, `src/ui/styles/base.css` | The router root had no stacking order against the HUD's `z-index: 10`; new `.ui-screens { z-index: 20 }`. |
| Quality switch High → Low ghosting | `src/render/app/renderApp.ts`, `src/render/app/look/directGrade.ts`, `spikes/look-gallery/main.ts` | EffectComposer leaves `renderer.autoClear = false`; nothing restored it when the chain was disposed. `applyRendererQuality` restores it and `DirectGrade.render` clears its target whatever the flag; the gallery workaround is removed. Unit test `render/slots/gate1b.test.ts`; browser proof `tests/e2e/qualitySwitch.mjs` (section 5). |
| Frame nearly black under large bodies (parked car) | new `src/render/slots/shadeAdapt.ts`, `worldSlot.ts`, `slots/params.ts` | The exposure meters the whole sky. The world slot now owns the final exposure and adds a local deep-shade term from the world's static sky-occlusion map at the subject (log2(1/(1 − 0.8·occ)), capped at +1.6 EV, fading out 40 mm above the ground, eased 0.8 s). Open ground adds 0 EV, so sunlit scenes are unchanged. Unit-tested; `perf().renderers.world['shade.ev']`; sweep shots `*-4b-under*` (section 4). |
| Light-blue unlit disc beside the nest in the colony view | new `src/render/slots/fxSlot.ts`, `src/render/index.ts` | The `fx` slot still ran the debug renderer, which draws every marker as a flat unlit disc (0x40a0ff) in every view. A real (empty) fx slot replaces it; markers and plans are drawn by the views layer's MarkerRenderer in the colony view. |
| `<button autofocus>` console error in a cross-origin frame | `src/ui/components/Button.tsx`, `focus.ts` (`useAutoFocusRef`), `src/ui/hud/AlertsFeed.tsx`, `src/ui/boot/Title.tsx`, `PauseMenu.tsx`; `tools/build/verify-portable.mjs` | Focus by ref in an effect; `verify:portable` is strict by default (`--lenient` keeps the mechanism, the known-issue list is empty). |
| Worldgen worker built but unused | `src/game/newGame/startSession.ts`, `loading.ts`, `Game.ts` | `generateAsync` uses `loadWorkerSource` + `blobWorkerFactory` + `generateWorldAsync` (main-thread fallback inside). Loading progress comes from the generator's reports mapped onto the UI's stage weights (first 75 %); attempts counted from the report; a superseded load is cancelled after generation. |
| HUD stand-ins: hand-over written directly, alerts pushed into state | `src/game/uiBridge/hudSlices.ts`, `src/game/debug/cheats.ts`, `tests/e2e/hud.mjs` | The feed reads `activeAlerts(sim)`; alerts raised with `tokens` and no title are worded with `alertText` (no empty cards); Colony orders follows `queenHandedOver`. hud.mjs completes the opening with the real founding cheat and raises alerts through progression's publisher (`__game.cheat.raiseAlert / clearAlert`). |
| "Only 1 ant remains" critical alert lit through the whole founding (the red dot) | `src/game/uiBridge/hudSlices.ts` (adapter) | Progression raises `last-ants` for the lone founding queen; the bridge hides it until the hand-over and the need is reported to the sim half. |
| Red status mark on the colony pulse through the whole founding (the "alert dot" next to "Queen founding") | `src/game/uiBridge/hudSlices.ts` (adapter) | The pulse status took the colony's starvation stage and every diagnostic; through the claustral founding the stores, intake and trail diagnostics are "bad" by design. Until the hand-over the status now follows the queen's reserves (warn < 25 %, bad < 10 %) and skips those four diagnostics; after it, unchanged. Unit test in `src/game/gate1b.test.ts`; the portable play frames show the green ring. Reported to the sim half |
| Founding queen small and centred in the open-view possession shot | `src/render/camera/possessionStates.ts`, `thirdPersonRig.ts` | Open state 3.5 L at 12° (GDD 5 L / 20°, within its ranges) and an aim lift of 0.45 L so the ant sits in the lower middle (measured y 477 of 720 instead of 417). Camera tests unchanged and green. |
| Save / load did not restore the view | `src/game/save/{types,meta,manager,blocks,gameHost}.ts`, `Game.ts` (`adoptSim`) | The meta records the view and the observer camera; the loader reopens the colony view or the observer pose. `Game.adoptSim(sim)` replaces the private cast in `gameHost.ts` (fakes in the two gameHost tests mirror it). A failed load now restores the title backdrop. |
| `autosave.fixes.test.ts` red | `src/game/save/autosave.fixes.test.ts` | The fixture set `ant.combat = {}`; the combat movement now reads it. Uses `emptyCombat()`. |
| Low / Medium grass and litter density differ from GDD 04 §9 | `src/render/app/quality.ts` | 0.25 / 0.5 (were 0.4 / 0.7); decor's own factor reads the presets, so the result is the GDD factor. |
| Wording rows of codex-content for my files | `src/game/possessionEvents.ts`, `src/input/actions.ts`, `Game.ts` | 8x / opening / step-down toasts, possession refusals in words (no raw reason ids), "Colony orders", "Mouse look: drag or captured", "not available here". |
| Small seams | `Game.ts`, `src/game/save/install.ts`, `gameHost.ts`, `debugApi.ts`, `perf.ts` | DoF focus instant under reduced motion; `UiLoading.kind`; `settingsNotice()`; `__game.ui.hud/alerts/prompts/inspect` forward to the HUD hook, `__game.ui.audio.{status,cueLog}`, `__game.assets.backendFor`; `perf().uiBridgeMs / uiBridgeMaxMs`. |
| Packaging minors | `tools/build/{config,assetPlan,portable,verify-portable,forbidden}.mjs` | Audio shipped by reference scan (src/audio names all 45 ids); `@preact/signals-core` licence in CREDITS; build failures clean their temp folder; `verify:portable` rebuilds when the output is older than `src/` (`--no-build` to skip) and prints the short play's result; the forbidden-pattern scan matches credit URLs by exact host (a look-alike host such as `ambientcg.com.evil.example` no longer passes) and scans inline `<script>` / `<style>` in `index.html` (the two open review findings). |

New test files: `src/render/slots/gate1b.test.ts`, `src/game/gate1b.test.ts`. New scripts: `tests/e2e/firstplay.mjs`
(+ `tests/e2e/lib/firstplay-steps.mjs`), `controls.mjs`, `sweep.mjs`, `perf1b.mjs`, `qualitySwitch.mjs`; the short
first play added to `tests/e2e/portable.mjs`. New debug read-outs (registerQuery, `src/game/debug/gateQueries.ts`):
`query.sources`, `query.scent`, `query.growth`, `query.broodList`, `query.sweepSpots`.

## 4. Visual sweep of the generated worlds (`tests/e2e/sweep.mjs`, seed 1, `test-output/gate1b/chain/sweep/`)

Per archetype: the queen at the start, beside the largest object near her, among plants, indoors (kitchen-door),
under a raised body, the map edge (observer looking out), the colony view (slice), one `high` shot. All 32 frames
looked at; the camera was clear of solid in every frame (f >= 0.77 mm, radius 2). Generation 13-22 s per world in
the browser on the main thread; `test`: 31-80 draw calls, 0.26-0.37 M triangles; `high`: 94-162 draw calls,
0.78-1.23 M triangles (inside the < 350 / < 1.5 M High budget).

| Defect seen | Where (file) | Root | Status |
|---|---|---|---|
| False "Protein / Carbohydrate stores low, 0.0 days left" cards at the start of every founding | all `*-1-start.png` | sim (colony diagnostics raise store alerts for the claustral founding) | **fixed on the app side** (adapter hides them until the hand-over) and reported |
| Founding queen reads pale grey under the overcast sky at `high` | `*-7-high.png` | render-ants (clearcoat reflecting the sky; look-pass note) | assigned: render-ants |
| Crevice camera among plant stems: stems and leaves stippled by the occlusion dither, the ant hidden | `car-park-verge-3-plants.png` | views (crevice state among thin plant prims) + look-pass dither | assigned: views / look-pass |
| Map edge reads as fog: soil, a flat green band, then haze; no silhouettes | `*-5-edge.png` | render-world boundary (look pass) | assigned: look pass (known: "pale primitive masses") |
| Pale untextured masses: house walls, a white ellipsoid stone, a huge flat pale ellipsoid on the woodland start | `woodland-edge-1-start.png`, `car-park-verge-1-start.png`, fp5 `14`/`15` | look pass (materials) / worldgen-outdoor (the flat ellipsoid) | assigned |
| Kitchen interior washed out by haze (table legs and bin pale, low contrast) | `kitchen-door-4-interior.png` | look pass (interior fog / exposure) | assigned |
| The worlds read sparse around the start (bare soil, one leaf, distant pale props) | `*-1-start.png` | worldgen-outdoor density near the start / decor at `test` (grass density 0.25) | assigned (worldgen-life / look) |
| Colony slice over a world with no nest: a featureless disc; over pre-carved cavities: pale cut faces with dotted outlines, no labels | `*-6-colony.png` | views / render-nest (labels only in x-ray) | assigned: views |
| No floating or sunk ants, no z-fighting, no missing textures, no visible tiling seen in these frames | — | — | — |
| Deep shade under a raised body | `kitchen-door-4b/4c-under*.png` (the kitchen roof; no occlusion) | — | the car-park car case is in section 5 |

## 5. Performance and resources (`tests/e2e/perf1b.mjs`, seed 2, 1280 x 720, SwiftShader on the shared 4-core machine)

Setup: the opening completed by cheat, 280 workers spawned round the start (333-379 ants alive during the run),
observer above the nest. Timings are minimums of six frames; the machine had load 8-14 (other engineers' runs).

| Measure | `test` | `low` |
|---|---|---|
| Draw calls | 58 | 87 |
| Triangles | 378 546 | 639 130 |
| Render CPU per frame (ms) | 165 | 224 |
| Frame wall time in SwiftShader (ms, incl. GPU read-back) | 8 838 | 11 366 |
| Simulation per tick (ms, about 330 ants) | 5.66 | 5.69 |
| UI bridge per snapshot (ms; `refreshUi`, median of 20) | 0.1 (timer resolution) | 0.1 |

8x play, 24 000 ticks (40 game minutes = 5 real minutes at 8x), drawn every 1 200 ticks: simulation 3.3-9.5 ms per
tick (median about 5 ms, i.e. about 40 ms of simulation per real frame at 8x: the speed limiter would step down on
this machine), JS heap 269 MB at every sample (no growth at the browser API's resolution), GPU geometries 78 → 92
(the nest meshes grow as the colony digs; flat over the last 10 000 ticks), textures 49, programs 58-59.

Two new-game / quit cycles (title → game → title): geometries 32 → 55 → **35** → 55 → **35**, textures 48 at every
step, programs 57 → 59 → 59 → 59 → 59. **No leak** across the second cycle (the 3 extra geometries after the first
game are the title's own ants, rebuilt the same each time).

Quality switch proof (`tests/e2e/qualitySwitch.mjs`, seed 2, observer at a fixed pose, UI hidden): High boot →
Low switch vs a Low boot RMSE **0.044**, back to High vs the High boot **0.011** (for scale: High vs Low 26.3).
`test-output/gate1b/chain/qs-sw/`. The ghosting is gone.

Deep shade under a parked car: see the car-park run in section 7 (`shade.ev` in `perf().renderers.world`).

Deep shade under a parked car (`car-park-verge`, seed 1, `test-output/gate1b/chain2/sweepcar/`): the queen placed
under the car body at a sky occlusion of about 0.8 gets `shade.ev` = **+1.52 EV** (cap 1.6); `4b-under.png` (test)
and `4c-under-high.png` read as grey asphalt with the cracks and grit visible and the queen's cuticle highlights
clear, where the look review's frame was nearly black. The same world's open start (`1-start.png`) adds 0 EV and is
unchanged. The washed-out band at the top of the under-car frames is the car's underside lost in distance fog
(look pass).

## 6. Existing browser scripts (all on the live game, harness defaults unless noted)

| Script | Result | Run / notes |
|---|---|---|
| `smoke.mjs` | pass | `test-output/gate1b/smoke/` |
| `determinism.mjs` | pass | same hash for the same seed (`993e6ecd`), a different one for seed 2 |
| `newGameCancel.mjs` | pass | three superseded loads cancelled cleanly ("Preparing the view" seen), the next start draws its ants |
| `save.mjs` | pass | reload → load gives the saved hash, file and text round trips, every corrupt / foreign input refused in words |
| `views.mjs` | pass (`VIEWS_SKIP_HIGH=1` to fit the chain) | open / wall / ceiling / tunnel / crevice states, picking, colony slice; the light-blue disc is gone (`07-colony-slice.png`) |
| `flow.mjs` | pass (after a fix) | E24 waited on one slow frame; it now waits for the condition (up to 60 s) instead of a fixed frame count (`chain2/flow`) |
| `hud.mjs` | pass (after two fixes) | the real founding cheat + skip-lapse loop instead of writing `opening.done`; alerts through progression's publisher; the inspect step now picks a worker of the player's colony (seed 1 has a neighbouring colony whose ants inspect as "Stranger") (`chain3/hud`) |
| `crash.mjs`, `genFailure.mjs`, `debugRender.mjs` | pass | `chain3/` |
| `panels.mjs` | pass | ui-panels' script; it still records its own two stand-ins (an alert with a chamber focus written into `progression.alerts`; `opening.done` written on the test world). Owner: ui-panels |
| `look.mjs` (gallery) | pass | suburban-garden at High → Low → High after removing the gallery's autoClear workaround: no ghosting in the Low frames (`chain3/look`) |
| `dressing.mjs` | pass | `DRESSING_SKIP_LEAK=1` (the leak check is covered by `perf1b.mjs`, section 5) (`chain3/dressing`) |
| `founding.mjs` | pass | founding-close's script, after its sealing fix landed during this gate: sealed in 500 ticks with one plug, 18 eggs, lapse, outcome 10 workers, hand-over, the failure-and-retry game (`chain3/founding`) |
| `stage1a.mjs` strict | **fail** | stops at its recorded stand-in "pellet hauling" (`cheat.spawnPellets` instead of haulers): the strict mode refuses any stand-in, and hauling spoil out of the nest is beh-nest's (1B) — no worker carries pellets out in this run. All its earlier beats pass (surface, entrance, tunnel camera, shaft 30 bites, room 13 chambers) |
| `controls.mjs` (new) | pass | section 8 lists its two findings |
| `portable.mjs` | pass | inside `verify:portable`, section 7 |

## 7. Portable build

`npm run verify:portable` (strict by default now; it rebuilt the folder because `src/` was newer): **OK**.
Static checks pass (no module scripts, no `import(`, one `fetch(` in the asset loader, classic-script parse, no
absolute URLs; the scanner now also reads inline `<script>` / `<style>` and matches credit URLs by exact host — the
two "REVIEW FINDING" tests in `tools/build/portable.verify.test.mjs` pass, 15 / 15). Size 26.95 MB in 7 files (19
texture sets, 45 audio files; 18 unreferenced files, 3.07 MB, left out).

| Hosting | Boot, render, packs | Short first play | Screenshot |
|---|---|---|---|
| Sub-path (`--static --mount`) | pass | New colony with real clicks, seed typed, Begin; generation in the Blob-URL worker; a key closes the intro card; the queen walks; Esc → Save → slot 1 → Esc → Return to title → Continue: **same `stateHash`** | `test-output/portable/subpath/play.png` |
| `<iframe sandbox="allow-scripts allow-pointer-lock">` (opaque origin) | pass, no console error (the autofocus error is gone) | the same up to the pause menu; the opaque origin has no IndexedDB, so the Save book shows its buttons disabled with "Saving to this browser is not available here. Use Export to keep your colony." — the script checks the notice and returns to the title (no save to continue from, by design) | `test-output/portable/iframe/play.png` |

Numbers from the final run (`chain4/verifyportable.out`): the worker source (419 kB, served from the embedded
pack) answers a bad request with `worldgen.error` and generates a world in 1.9-2.4 s on its own; the short play's
New colony → playing took **11.2 s (sub-path) / 9.2 s (iframe)** with generation in the Blob-URL worker
(`backendFor('workers/worldgen.js')` = `embedded`), against 20 s on the main thread in the dev build. Sub-path
storage: IndexedDB, persistent, "Saved.", continue `sameState: true`; iframe: `storageOk: false` (expected).

Both play frames show the founding queen at 3.5 L in the lower middle beside a log, with the colony pulse's status
ring green (the red founding dot is gone, section 3).

## 8. What a player would hit in the first ten minutes (most serious first)

1. **The colony starves for protein after the hand-over** (simulation balance / world food): with the start's
   sugar the stores reach 13 C, but P stays at 0 for two game days, brood falls 7 → 2 and no new worker hatches;
   the alerts say so clearly ("The colony is starving", "Brood growth has stalled ×21"). Earlier runs showed the
   same (fp5: workers 20 flat, brood 13 → 0). Also "Carbohydrate stores low, 0.0 days left" was seen with 18 C stored
   (fp5; colony diagnostics).
2. **The sealed throat frame** (`09-sealed.png`): the occlusion dither opens a large disc of sky through the terrain
   when the camera looks up the throat from below, so the plug does not read as sealed (views / look).
3. **Earlier runs only**: sealing failed (`sealing:128`) and the first workers did not reopen the plug in fp2 / fp5;
   both fixed by founding-close during this gate (the final run seals with 4 actions and the workers reopen it).
4. **The founding dig takes the whole evening** (14:28 → 22:05 game time for 3 BU): the mound and entrance shots
   are at night and hard to read. Design / founding pacing.
5. **Prompt ambiguity**: two prompts name E at once in the founding chamber; a stale "Drink sugar" prompt follows
   a worker into the nest; a drink started with a tap keeps running with a full crop, so every prompt reads
   "busy" (actions / player prompts).
6. **HUD stacking**: the "+2 more" chip under the site read-out, the founding Chamber bar over the possessed panel
   (ui-panels, being fixed now).
7. **Look**: pale primitive house masses and map edge, washed-out sky walls behind the worker (look pass).
8. **Scouts sometimes miss food beside the nest** (beh-forage): in one run (`chain2/firstplay`) no scout found a
   sugar spill 88 mm from the open entrance in 18 000 ticks, and a Node probe of the same seed shows the foragers
   parked in `forage.wait` (no known source) while the two scouts rest or wander 1.5 m away. In the final run the
   scouts found it in 2 400 ticks. firstplay now waits 9 000 ticks and then marks the food with a forage marker (a
   player action, recorded in `result.findings`); the final run did not need it.
9. **T (antennate) reaches the action but the action fails** for a worker on open ground in the controls run
   (`action-failed:antennate`; controls.mjs now records the failure reason as a finding, not yet re-run): the key
   works, the action itself refuses (actions / player prompts).

## 9. Notes items (`notes-1B.md`) for the application paths and their outcome

Legend: **done** (fixed or wired here), **decision**, **left** (owner named), **sim** (simulation half / module owner).

| Source | Item | Outcome |
|---|---|---|
| beh-forage, beh-nest, architect, nest-fixes, worldgen-*, sim-fix-*, species-data, creatures, combat, ecology-plants, int-1A-sim | Items concern `src/sim/**` / `src/worldgen/**` only | **sim** (not app items; none touch my paths) |
| render-decor | Align QUALITY_PRESETS density.grass / litter with GDD 04 §9 | **done** (`quality.ts`) |
| render-decor | decor.setQuality together with the world | **done** before this gate (world slot) and verified |
| render-decor | Weather looks on decor, clippings, wind strength, terrain height accessor | **left** (weather-effects T2, human-events T2, render-world owner) |
| render-decor | Ant feet vs drawn terrain up to 1 mm | **left** (render-ants / locomotion) |
| render-integration | HUD edge glyph from `Game.atLocalityEdge` | **left** (ui-hud: needs a UiSnapshot field and a glyph; the game side exists) |
| render-integration | Failed load returns to the title without the backdrop | **done** (`gameHost.loadingEnd` enters the title) |
| render-integration | Title dim overlay hides the backdrop | **done** by switching App to the ui-shell router (left-column title, screenshot 01) |
| render-integration | Material library keeps 256² and 512² sets; edge-haze GLSL duplicate | **left** (look-pass / sky owner) |
| render-integration | Title "Low cap"; map edge reads as primitive masses | **decision** kept (render-integration) / **left** look pass (sweep shots) |
| look-pass | autoClear after the post chain is disposed; gallery workaround | **done** (RMSE switch vs boot 0.044 Low, 0.011 High) |
| look-pass | Queen / worker cuticle pale grey under an overcast sky | **left** (render-ants) |
| look-pass | Rosette leaves sunk into the soil | **left** (worldgen-outdoor) |
| look-pass | Dark under a parked car | **done** (deep-shade exposure, section 3; frames in section 4) |
| founding | Integrator: `site-search` out of FOUNDING_CELL_STATES | **sim** (nest balance) |
| founding | Time-lapse camera for the released queen | **done by founding** (the flow orbits the possession camera in the cell); checked in code, not reached in the browser |
| founding | Sealing, reopening, clutch cap, interrupt beats, reduced-motion stills | **left** (founding-close; sealing and reopening seen failing here) |
| founding | Waste alert and empty red card | **done** on the app side: tokens-only alerts are worded; `last-ants` hidden during the opening (adapter); midden guard is founding-close's |
| views | ui-hud reads inspect / hover from picking | **done** (views → Game.inspect → bridge; screenshot 19) |
| views | Marker palette (ui-panels), ceiling comfort setting | **left** (ui-panels; settings schema owner — no `camera.ceilingComfort` field yet) |
| views | Debug fx-slot discs under the rings | **done** (real fx slot) |
| views | DoF focus instant under reduced motion | **done** (`Game.renderScene`) |
| views | Terrain / primitive occlusion dither | **done by look-pass** (world materials read WorldFrame.occlusion) |
| views | Tremor cues, flying alates, camera-state subscribers | **left** (human-events / T2 / audio) |
| views | Pale possessed-ant rim at the shaft mouth | **left** (render-ants; not seen in this gate's shots) |
| ui-hud | Game.hover / inspect from picking | **done** (views) |
| ui-hud | Forward `__game.ui.*` to `window.__hud` | **done** (`hud/alerts/prompts/inspect`) |
| ui-hud | Real hand-over and alert publisher instead of stand-ins | **done** (hud.mjs uses the founding cheat and `cheat.raiseAlert`) |
| ui-hud | `.fd-drawer` as a gamepad layer in gamepadNav | **left** (ui-shell; drawerPad / padGuard workarounds stay) |
| ui-hud | Next-event driver, journal / health hooks | **left** (game loop T2; ui-panels) |
| packaging | Worker wiring | **done** |
| packaging | `<button autofocus>`; strict verify by default | **done** |
| packaging | Audio reference scan | **done** (45 of 45 audio ids referenced by `src/audio/assetIds.ts`) |
| packaging | Debug probe for the asset loader | **done** (`__game.assets.backendFor`) |
| packaging review | signals-core licence; temp dir on failure; stale build | **done** |
| packaging review | Inline `<script>` scan in index.html; prefix allow-list; tools/build tests outside vitest | **done** for the scan and the allow-list (15 / 15 `node --test`); the tests stay on `node:test` (vitest collects only `src/` and `tests/`) |
| packaging review | Lazy pack grouping has no effect (all texture packs load at world init) | **left** (render-world: pass the world's material ids to `library.ready`) |
| ui-shell | App renders ScreenRouter | **done** |
| ui-shell | `contrastReport` on `__game.ui`, setCurrentBindings on rebinding | **left** for contrastReport (the game does not import the UI); bindings sync works (controls rebind check) |
| ui-shell | `settingsNotice()`, `UiLoading.kind` | **done** |
| save | `installPersistence(game)` in main.ts | **done** |
| save | `Game.adoptSim(sim)` | **done** |
| save | `UiSnapshot.lastSave` from `manager.lastSaveInfo()` | **left** (needs a bridge input; the pause menu omits the "Saved …" line) |
| save | Lineage / hint writers | **left** (progression) |
| audio | Start on the first gesture; never in test mode | **verified in code** (gesture-gated context on window); not exercised in a non-test browser run |
| audio | `__game.ui.audio.status / cueLog` | **done** |
| audio | Settings status line, alarm-shimmer toggle | **left** (ui-shell / settings) |
| codex-content | Wording rows for src/game, src/input | **done** (toasts, labels); rows for ui-shell / ui-hud screens **left** to their owners |
| progression | HUD switch-over (`activeAlerts`, `alertText`, `queenHandedOver`) | **done** |
| int-1A-app | Game.ts over 400 lines | **left**: now about 730 lines; split proposal: move newGame / adoptSim / endGame into `game/session/lifecycle.ts` |
| int-1A-app | LOD observer deterministic carrier | **sim / architecture** (unchanged) |
