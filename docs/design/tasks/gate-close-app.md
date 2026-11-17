# Task gate-close-app — First-playable gate, application half (Opus, visual)

## Goal
Prove by running the real game in a browser that a new player can start, play the opening, hand over to the first workers and watch the colony live, with every screen and view working; fix what stops that; list bluntly what a player would call broken or ugly. This task replaces steps 1 (app folders), 3, 4 (app items), 5 and 6 of `gate-1B-close.md`; a second engineer runs `gate-close-sim.md` at the same time and owns the sim.

## Read in full
`docs/STATUS.md` from the Nov 16 10:30 entry to the end (rulings R1–R15 binding). `gate-1B-app-report.md` §10. `docs/design/tasks/onboarding.md`, `overwinter-repro.md`, `input-gamepad-a11y.md`, `look-pass-2.md` and the "Hand-over" below.

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

## Hand-over
(Integrator fills in before launch.)
