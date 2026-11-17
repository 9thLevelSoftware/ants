# Task gate-close-app — First-playable gate, application half (Opus, visual)

## Goal
Prove by running the real game in a browser that a new player can start, play the opening, hand over to the first workers and watch the colony live, with every screen and view working; fix what stops that; list bluntly what a player would call broken or ugly. This task replaces steps 1 (app folders), 3, 4 (app items), 5 and 6 of `gate-1B-close.md`; a second engineer runs `gate-close-sim.md` at the same time and owns the sim.

## Read in full
`docs/STATUS.md` from the Nov 16 10:30 entry to the end (rulings R1–R19 binding). `gate-1B-app-report.md` §10. `docs/design/tasks/onboarding.md`, `overwinter-repro.md`, `input-gamepad-a11y.md`, `look-pass-2.md` and the "Hand-over" below.

## You own
`src/game/**`, `src/ui/**`, `src/render/**`, `src/audio/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`. Assertions in e2e scripts must not be weakened; where one is wrong say why. If a fix needs a `src/sim` file and is under 30 lines, first append one line to `test-output/gate-close/cross-edits.md` (file, what, why), then make it with a test; larger ones go in your report with a failing test or exact reproduction (seed, query string, steps).

## Work, in this order
1. **Typecheck and tests, folder by folder**: each folder of `src/render`, `src/game`, `src/ui`, `src/audio`, `src/content`, `src/input`. Table of red tests with owner and cause; fix real defects and stale expectations. Known red: `src/content/text/controls.test.ts`, `src/render/fx/scent/scentTrail.test.ts` (no forager trail — check again after the foraging fixes).
2. **Browser scripts on the real game** (one headless browser at a time; `quality=test` unless a picture is needed; flooding on, no cheats unless the script is about a cheat): `founding.mjs` seeds 1–3 to completion; `firstplay.mjs` to the end (25 beats, growth assert); `stage1a.mjs`; `controls.mjs`; `views.mjs`; `panels.mjs` both halves; `stage2.mjs` strict (no `STAGE2_SOFT`); `photo.mjs` quick; `onboarding.mjs`; `lifecycle.mjs`; `a11y.mjs`. Table: script, result, time, what failed and where. Fix failures at the cause.
3. **Seams** (do each; they are small):
   - R15: the `possessed-danger` diagnostic is critical in combat too.
   - The alert "Founding chamber flooding" repeats ×10 long after hand-over: after the opening it must name the chamber it is about, and repeats must collapse into one card that updates.
   - `PlayPanels.tsx` asks the hint engine whether a prompt may show, so `src/ui/hud/prompts/foundingGate.ts` (DOM bridge) can go.
   - The "Groom yourself" prompt must not show during the nuptial flight (`src/sim/ants/player/prompt.ts` — cross-edit).
   - Winter notice gets a journal entry; the overwinter prompt slows time like other blocking prompts.
   - Males drawn at the swarm in the flight screen if the renderer supports it in under an hour; otherwise report.
   - Night ant looks pale and glassy: lower the body fill, keep separability with the rim (`ANT_FILL` in `src/render/ants/tuning.ts`); show before/after at night and night rain.
   - Colony view: the closest view leaves the founding chamber about 110 px wide; allow a closer minimum for small nests (`CV_DIST_BU`), with the rig test updated.
4. **Play it through the harness**: 20 game minutes after hand-over at 1× then 4× on seed 1 (default archetype) and on one indoor archetype, a screenshot every 2 game minutes at `quality=high` in turn from observer, possession, colony slice and scent view; then one full day–night cycle at 8× with a shot every 2 game hours. Look at every picture. List everything a player would call broken or ugly, most serious first, with the picture's path. Fix what is yours within an hour each; report the rest.
5. **Frame time** at `low`, `medium`, `high` on the seed 1 colony after hand-over (median and p95 over 600 frames, draw calls, triangles), by the method of the app gate report.
6. **Build**: `npm run build:portable` and `npm run verify:portable`; run `firstplay.mjs` beats 1–6 against the portable build.
7. **Report** `docs/design/tasks/gate-close-app-report.md`: verdict per acceptance criterion, the tables, the ranked "still wrong" list with picture paths.

## Acceptance criteria
1. Typecheck clean; no red test in your folders without a report entry naming owner and cause.
2. `founding.mjs` seeds 1–3, `firstplay.mjs`, `stage1a.mjs`, `controls.mjs`, `stage2.mjs` strict, `onboarding.mjs`, `lifecycle.mjs` pass in the browser; any that does not is named with cause and what was tried.
3. Every seam in step 3 done or reported with the reason.
4. Portable build verified.
5. The ranked "still wrong" list is complete and every picture cited was looked at.

## Machine rules
4 cores shared with another engineer running colony-life sweeps. One headless browser at a time; global Playwright only (never install it); never the whole vitest suite in one process. Check `date -u` before writing a timestamp. Evidence under `test-output/gate-close/app/`.

## Hand-over (integrator, Nov 17 03:25 UTC)

**State of the tree.** Everything is on `main` (auto-snapshots every 10 minutes; do not run git commands that change the index). Three other engineers are working in this checkout right now: `colony-life` (all of `src/sim` except species modules, `src/worldgen`, `src/core`, `tools/sim`) and two species engineers (`src/sim/species/modules/**`, `src/sim/balance/species-*.ts`, `src/sim/colony/founding/species/**`). Type errors or red tests there may be work in progress: mention them, do not fix them. The cross-edit rule above stands for anything in `src/sim`.

**The sim does not grow colonies yet.** Sweep 9: 7 of 15 colonies viable, 0 eclosions after hand-over in 11 of 15. `colony-life` is fixing this in measured rounds (ledger `colony-life-ledger.md`); round 1 fixed an entrance stuck `sealing`, waste never hauled, stranded brood. So: `firstplay.mjs`'s growth assert and anything that needs second-generation workers may fail for sim reasons. Establish with evidence whether a failure is the app or the sim; an app failure you fix; a sim failure you report with seed, query string, the step and the value seen, and move on. Do not weaken the assert.

**Machine.** Load average is 10–13 on 4 cores (life runs, species tests). Browser scripts run 3–5× slower than on an idle machine: give every harness run a generous `--script-timeout`, and treat a timeout under load as "not measured", not as a failure — re-run it alone with a longer timeout before you call it red. `a11y.mjs` does not finish in one process under load: run `A11Y_SECTIONS=G,B,C-,C2,D,E` and `A11Y_SECTIONS=E2,F` separately. Frame-time numbers (step 5) are only valid when nothing else heavy is running: check `uptime` before and after and say so beside the numbers; if the load never drops, report the numbers as indicative and say that.

**look-pass-2 (landed).** Night look table (`NIGHT_LOOK`), ground snap for leaning stems, dithered skirt, boundary fog, night ant fill 0.8 → 2.2. Evidence `test-output/look2/r2/**`. Open, yours to check in step 4 and fix or report: night ant pale and glassy (seam in step 3); a thin lime-green strip at the map-edge horizon; the nearest facade and fence shapes read as pale straight-edged blocks; a white pillar, a leaf contact shadow, the car underbody, ragged open-end caps and a floating block were reported without coordinates — find them or say you could not; dusk, overcast and night rain were not re-shot.

**input-gamepad-a11y (fix round landed, review `reviews/input-gamepad-a11y.json`, progress `progress/input-gamepad-a11y-fix.md`).** Closed: RB modifier clash, pad rebinding gestures, scent-view yield, reduced-motion crossfade (0.2 s), player-pad picking, hold-duration setting, e2e fails on a broken section, flash reduction reaches the lightning renderer. Left for you:
- The **sound-cue indicators** toggle does nothing: wire it (audio + HUD are yours) or report exactly what is missing.
- **Flash reduction** is On by default and lightning then uses the 2 s soft glow (`LIGHTNING_REDUCED`): measure it against GDD 08 App E 25 (no frame-to-frame exposure rise above +0.5 EV; at most 5 brightening events in 20 s of storm) from frames, and fix if it does not hold.
- Seal and lay **by pad through the real founding phases** are not demonstrated (the e2e uses a stand-in carve): do it once by hand through the harness on seed 1 and report.
- The a11y engineer edited files outside their folders (`src/game/Game.ts`, `src/game/debug/debugApi.ts`, `src/game/views/viewDirector.ts`, `src/game/settings/schema.ts`, `src/render/camera/constants.ts`, `src/render/index.ts` `FrameInfo.reducedFlash`, `src/render/world/weather/WeatherRenderer.ts`): read those edits as their owner and keep or correct them.
- GDD 08 App E 21 names `foundress.settings.v1` for bindings, GDD 01 §5.7 names `foundress.bindings.v1`; the code follows GDD 01. Note it in the report as a document fix; no code change.

**Species.** Carpenter and harvester ants are being built; `available` stays false. Not your concern except: the new-game screen must not offer an unavailable species (check once).

**Report honestly.** The report is read by the integrator to decide whether to publish the first playable build. A short true list of what is broken is worth more than a pass.
