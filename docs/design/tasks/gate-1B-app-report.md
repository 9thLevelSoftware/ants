# Stage 1B gate — application half (int-1B-app) report

The first playable now runs end to end in the browser on the real screens: the title with its live backdrop, the
New colony screen, world generation with an honest progress bar (in a worker in the portable build), the founding
queen in third person, the founding dig, the first workers, an autonomous colony the player can join (possess any
ant), direct (Colony orders, markers, dig plans), inspect (Roster, inspect card, observer follow, colony slice) and
save / continue from the pause menu. Two founding steps still fail in the browser (sealing, and the workers'
reopening of the plug); both belong to the founding-close task that is still running (no "founding round 3"
commit in `git log` at the time of writing), so the first-play script reaches the colony beats through two
recorded stand-ins.

Evidence: `tests/e2e/firstplay.mjs` (harness, `test` quality, 1280 x 720), outputs in `test-output/gate1b/`
(git-ignored): `fp2/` (the real founding, stops at sealing), `fp5/` (complete run with the two stand-ins),
`controls/`, `chain/` (quality switch, sweep, portable, existing scripts, perf).

## 0. Acceptance status

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | typecheck clean; tests under `src/render`, `src/game`, `src/ui`, `src/input` green | partial | `npm run typecheck`: 0 errors in my paths (the only errors in the tree are in other engineers' files: `src/sim/testing/zzint1b-diff.test.ts`, `tools/sim/life*.ts`). `npx vitest run src/game src/ui src/render/slots src/render/camera src/render/app src/input`: 835 / 837; the 2 failures are the ui-panels reviewer tests in `src/ui/panels/journal/journal.verify.test.ts` (work in progress of the ui-panels engineer, not touched here). Baseline before my changes: 1185 / 1186 over `src/render src/game src/ui src/input` (the one failure, `autosave.fixes.test.ts`, was a malformed test fixture and is fixed) |
| 2 | `firstplay.mjs` passes with no console errors and no stand-ins | **not met** (as written) | The script exists and passes (`ok: true`, 0 console errors) with `FIRSTPLAY_AUTOFOUND=1` and two recorded stand-ins (`result.standIns`): the opening completed by `cheat.completeFounding`, and the plug carved open when the first workers did not reopen it. Without the stand-ins it runs the real founding through beats 01-08 (title, new colony, intro card, queen, site read-out, dig and mound, shaft, founding chamber) and stops at sealing: `{"entrances":["sealing:128"]}` after 16 seal attempts (fp2). Owner: founding-close (fc1 "leak-driven sealing", in progress) |
| 3 | every existing browser script passes (`stage1a` strict) | see section 6 | |
| 4 | visual sweep reported, every defect fixed or assigned | see section 4 | |
| 5 | performance reported; no leak over two game cycles | see section 5 | |
| 6 | portable build verified; short first play in both hosting situations | see section 7 | |
| 7 | every application item of `notes-1B.md` accounted for | met | section 9 |

## 1. What the player can do now

- Boot to the title (left-column menu over a live, slowly drifting backdrop), open **New colony** (species,
  locality, size, rules, seed), **Begin**: the loading screen names the worldgen stage from the generator's own
  progress (in the Blob-URL worker in the portable build, on the main thread otherwise), then the intro card.
- As the founding queen: walk, run, climb, antennate the ground for the site read-out, dig the shaft and the
  founding chamber (the readiness bar fills, the mound grows at the mouth). Sealing does not complete yet
  (founding-close).
- After the hand-over (reached by cheat today): take a worker, follow the trail to food, drink, carry it home and
  hand it to a nestmate; the queen's **Colony orders** (I) with working sliders; the **Roster** (L); select and
  follow an ant from the observer with its inspect card; the colony view with the slice cutaway, a forage marker
  and a dig plan placed off the founding chamber; time at 8x while observing.
- **Pause → Save → Return to title → Continue** gives the identical state (`stateHash` equal); the save now records
  the view and the observer camera, so the player comes back where they left.
- Every control works without pointer lock (RMB drag orbits); keys and gamepad stick move the possessed ant;
  rebinding a key changes the prompt chip.

## 2. First-play screenshots (`test-output/gate1b/fp5/` unless noted; all looked at)

| Beat | File | Judgement |
|---|---|---|
| Title | `01-title.png` | Good. FOUNDRESS wordmark and menu in the left column over the live backdrop (two ants, a pebble, soil). A hard vertical edge in the sky where the left scrim ends (x about 770) — ui-shell's scrim gradient. |
| New colony | `02-new-colony.png` | Good. Species cards, locality list, size, seed field (typed 00000002 → code 0000-0002), rules, Begin. |
| World + intro card | `03-world-intro-card.png` | Good. The card over the generated world; the HUD time cluster and queen panel readable. The "Saving to this browser is not available here" toast of the first run is gone (IndexedDB open no longer times out behind the main-thread generation). |
| Queen on the surface | `04-queen-surface.png` (also `fp2/`) | Fair. After the camera retune the queen sits in the lower middle (y 477 of 720), at 3.5 L, with the ground in front; seen from straight behind she is still foreshortened (the reference shows a three-quarter view; auto-follow puts the camera behind the heading, GDD 01 §6.2). Pale untextured house masses in the background (look pass). |
| Site read-out | `fp2/05-site-readout.png` | Good. Queen in profile, large; "Poor Q 0.65" with seven factor rows; the "+2 more" chip sits just under the read-out (ui-panels HUD stacking). |
| Digging, mound | `fp2/06-digging-entrance-mound.png` | Fair. Night (22:05: the dig takes the evening); the mound and hole read as a dark red-brown patch, low contrast at night. |
| Inside the shaft | `fp2/07-inside-shaft.png` | Good. Camera behind and above the queen in the funnel, warm underground look, no sky, walls solid (camera f > 0). The founding "Chamber" bar overlaps the possessed-ant panel bottom-left (ui-panels, known). |
| Founding chamber | `fp2/08-founding-chamber.png` | Good. Queen large in the cell, "The chamber is ready", "Seal the entrance" prompt. Two prompts name E at once ("Put down soil pellet" and the founding "Seal the entrance") — ambiguous (founding / actions). |
| Sealing, clutch, time-lapse, outcome | — | Not reached: sealing fails (above). |
| First workers at the entrance | `13-first-workers-entrance.png` | Weak. 19:43 (dusk): the hole and pellets are visible but no worker is in the frame. |
| Worker following the trail | `14-worker-following-trail.png` | Fair. Worker on the trail (scent > 0 at 20 of 20 samples), prompts "Drink sugar / Dig / Drop soil pellet"; the background is a washed-out white wall mass (house primitive, look pass). |
| Harvesting | `15-worker-harvesting.png` | Fair. "Drink sugar — crop full", crop 0.6 C. The spill itself is not visible from behind the worker. |
| Delivered | `16-worker-delivered.png` | Good. In the tunnel among nestmates and the queen; crop 0.6 → 0.18 after trophallaxis. A stale "E Drink sugar" prompt shows in the nest (actions' prompt target). |
| Queen, Colony orders | `17-queen-colony-orders.png` | Good. Drawer readable; ArrowRight on the Forage slider switched Auto off (75 / 15 / 10 / 0). Workers near the queen dithered (camera capsule rule). |
| Roster | `18-roster.png` | Good. 21 ants, quick-possess buttons, sortable table. |
| Observer follow + inspect | `19-observer-follow-inspect.png` | Fair. Follow orbit inside a tunnel is very close (ants fill the right half); the card is readable. One ant on the right reads blue-metallic (highlight tint). |
| Colony view, slice, marker, plan | `20-colony-slice-marker-plan.png` | Fair. Slice through the founding level: the two chambers outlined, the forage marker ring around the spill, the dashed dig-plan ghost. The nest is small at this zoom and the cut face has no labels in slice mode; a large white blob at the top edge is an unidentified surface shape (to check: a cut primitive drawn with the cutaway patch). The inspect card shows a "Soil-pellet" with taste / amount rows (inspect text for items, actions/progression). The old light-blue disc is gone (debug fx slot replaced). |
| Day 2 at 8x | `21-day-2-8x.png` | Fair. HUD at 8x; workers 20. |
| Day 3 at 8x | `22-day-3-8x.png` | Fair as a frame; **no growth**: workers 20 → 20, brood 13 → 0, P stores 1.9 → 0.07 (protein starvation with only a sugar spill near the nest; season turned to autumn on day 7). Sim balance, reported to the simulation half. |
| Pause → Save | `23-pause-save.png` | Good after the fix: in the first run the HUD drew over the Save book; the shell's screens now sit above the HUD. |
| Title, Continue | `24-title-continue.png` | Good. Continue shows "Lasius niger · Autumn · Day 2 · Year 1 · 20 workers" and the date. |
| Continued | `25-continued.png` | **Bad in this run**: same state (hash equal) but the observer camera came back at a stale pose looking into fog beside a plant stem. Fixed afterwards (the save meta records the camera; the loader puts the observer back) — to be confirmed by the next firstplay run. Two alerts "Protein stores low 0.0 days left" and "Carbohydrate stores low 0.0 days left" with 18 C stored (the carbohydrate alert contradicts the stores; colony diagnostics). |

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
| Founding queen small and centred in the open-view possession shot | `src/render/camera/possessionStates.ts`, `thirdPersonRig.ts` | Open state 3.5 L at 12° (GDD 5 L / 20°, within its ranges) and an aim lift of 0.45 L so the ant sits in the lower middle (measured y 477 of 720 instead of 417). Camera tests unchanged and green. |
| Save / load did not restore the view | `src/game/save/{types,meta,manager,blocks,gameHost}.ts`, `Game.ts` (`adoptSim`) | The meta records the view and the observer camera; the loader reopens the colony view or the observer pose. `Game.adoptSim(sim)` replaces the private cast in `gameHost.ts` (fakes in the two gameHost tests mirror it). A failed load now restores the title backdrop. |
| `autosave.fixes.test.ts` red | `src/game/save/autosave.fixes.test.ts` | The fixture set `ant.combat = {}`; the combat movement now reads it. Uses `emptyCombat()`. |
| Low / Medium grass and litter density differ from GDD 04 §9 | `src/render/app/quality.ts` | 0.25 / 0.5 (were 0.4 / 0.7); decor's own factor reads the presets, so the result is the GDD factor. |
| Wording rows of codex-content for my files | `src/game/possessionEvents.ts`, `src/input/actions.ts`, `Game.ts` | 8x / opening / step-down toasts, possession refusals in words (no raw reason ids), "Colony orders", "Mouse look: drag or captured", "not available here". |
| Small seams | `Game.ts`, `src/game/save/install.ts`, `gameHost.ts`, `debugApi.ts`, `perf.ts` | DoF focus instant under reduced motion; `UiLoading.kind`; `settingsNotice()`; `__game.ui.hud/alerts/prompts/inspect` forward to the HUD hook, `__game.ui.audio.{status,cueLog}`, `__game.assets.backendFor`; `perf().uiBridgeMs / uiBridgeMaxMs`. |
| Packaging minors | `tools/build/{config,assetPlan,portable,verify-portable}.mjs` | Audio shipped by reference scan (src/audio names all 45 ids); `@preact/signals-core` licence in CREDITS; build failures clean their temp folder; `verify:portable` rebuilds when the output is older than `src/` (`--no-build` to skip). |

New test files: `src/render/slots/gate1b.test.ts`, `src/game/gate1b.test.ts`. New scripts: `tests/e2e/firstplay.mjs`
(+ `tests/e2e/lib/firstplay-steps.mjs`), `controls.mjs`, `sweep.mjs`, `perf1b.mjs`, `qualitySwitch.mjs`; the short
first play added to `tests/e2e/portable.mjs`. New debug read-outs (registerQuery, `src/game/debug/gateQueries.ts`):
`query.sources`, `query.scent`, `query.growth`, `query.broodList`, `query.sweepSpots`.

<!-- sections 4-7: filled from the chain runs -->

## 8. What a player would hit in the first ten minutes (most serious first)

1. **The entrance cannot be sealed** (founding-close, in progress): after the chamber is ready, holding E in the
   throat builds a plug that never closes (`sealing:128` after 16 attempts on seed 2). The opening cannot be
   completed without the cheat.
2. **The first workers reopen the plug very slowly or not at all** while the queen stays possessed in the cell
   (`sealing:8` to `sealing:35` after 7 500 ticks in the browser runs; in Node with nobody possessed it opens about
   3 000 ticks after the hand-over). Founding / beh-nest.
3. **The colony does not grow on a sugar-only start**: over game days 2-3 workers stay at 20, brood falls 13 → 0,
   P stores to 0.07; "Carbohydrate stores low, 0.0 days left" shows with 18 C stored. Colony balance and
   diagnostics (simulation half).
4. **The founding dig takes the whole evening** (14:28 → 22:05 game time for 3 BU): the mound and entrance shots
   are at night and hard to read. Design / founding pacing.
5. **Prompt ambiguity**: two prompts name E at once in the founding chamber; a stale "Drink sugar" prompt follows
   a worker into the nest; a drink started with a tap keeps running with a full crop, so every prompt reads
   "busy" (actions / player prompts).
6. **HUD stacking**: the "+2 more" chip under the site read-out, the founding Chamber bar over the possessed panel
   (ui-panels, being fixed now).
7. **Look**: pale primitive house masses and map edge, washed-out sky walls behind the worker (look pass).

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
| packaging review | Inline `<script>` scan in index.html; prefix allow-list; tools/build tests outside vitest | **left** (minor; packaging owner) |
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
