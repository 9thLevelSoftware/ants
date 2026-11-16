# Task gate-1B-close — Close the first-playable gate after the stabilisation round (Opus, visual)

## Goal
The first-playable gates (`gate-1B-sim-report.md`, `gate-1B-app-report.md`) failed acceptance: colonies were not viable and the scripted first play could not run to the end. Four stabilisation tasks have since landed (`weather-fix2`, `viab-founding`, `viab-economy`, `viab-loco`), and the Stage 2 renderers, photo mode, onboarding and the audio pass are in. Your job is to prove, by running the real game, that a new player can start a game, play the opening, hand over to the first workers and watch the colony live to its first winter; to fix what stops that; and to report honestly what is still wrong.

## Read in full
`docs/STATUS.md` from the Nov 16 04:50 entry to the end. Both gate reports (§12 defects L1–L13, §15, §17 of the sim report; §10 of the app report). The four stabilisation specs and their results (the integrator pastes the result summaries below under "Hand-over"). `docs/design/tasks/viab-economy.md` rulings R1–R6 and the viability bar (binding).

## You own
Everything needed to close seams between modules, with these limits: fix at the cause in the module that owns the rule; keep each change small and reported; no rebalancing beyond what a ruling asks; contracts additive only. Tests you add go beside the code they test. `tests/e2e/**` scripts may be repaired but assertions must not be weakened; where an assertion is wrong say why.

## Work, in this order
1. **Typecheck and the suite, folder by folder** (never the whole suite in one process): `src/core`, `src/sim/<each folder>`, `src/worldgen`, `src/render/<each folder>`, `src/game`, `src/ui`, `src/audio`, `src/content`, `tools`. Table of red tests with owner and cause; fix every red test that is a real defect or a stale expectation; list the rest.
2. **Colony-life sweep against the viability bar**: `node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until winter` for seeds 1–3 × the five Tier 1 archetypes (15 runs; run at most 2 at a time; use `--cache`). Bar: ≥ 2 of 3 viable on each archetype. For each non-viable run give the cause from the run's own diagnostics, fix what is a defect, and re-run only the affected runs. Report the strict "healthy" verdict too.
3. **Browser, the real game** (one headless browser at a time, `quality=test` unless a picture is needed): `tests/e2e/founding.mjs` seeds 1–3 to completion without cheats; `tests/e2e/firstplay.mjs` to the end (25 beats, growth assert); `stage1a.mjs`; `controls.mjs`; `views.mjs`; `panels.mjs` (both halves); `stage2.mjs` **without** `STAGE2_SOFT`; `photo.mjs` quick; `onboarding.mjs`. Table: script, result, time, what failed and where. Fix failures at the cause.
4. **Open seams from STATUS** (do those that are small; list the rest with exact lines needed): antlion pit height overlay in the sim (`createPit` registers the `-1 + r^1.35` profile through `kernel.setHeightOverlay`, renderer already draws it); progression listeners for Stage 2 events (`rival-discovered` and whatever the codex/aims expect; table test that every milestone id has a reachable trigger); `src/content/text/controls.test.ts`; default pad bindings for the books; `checkEntrances` 50–95 ms spikes (L11); bounds (creatures parked at the map edge).
5. **Play it yourself through the harness for 20 game minutes after hand-over at 1× then 4×** on seed 1 and one other archetype, with screenshots every 2 game minutes at `quality=high` (observer, possession, colony slice, scent view). Look at every picture. List everything a player would call broken or ugly, most serious first, with the picture's path. Fix what is yours to fix in an hour; report the rest.
6. **Build**: `npm run build:portable` and `npm run verify:portable`; run `firstplay.mjs` beats 1–6 against the portable build.
7. **Report** `docs/design/tasks/gate-1B-close-report.md`: verdict per acceptance criterion, the tables above, sim cost per tick at 300 / 800 / 1,500 workers (same method as the sim gate report §9), frame time at the three quality levels, what Stage 3 must know.

## Acceptance criteria
1. Typecheck clean; no red test without an entry in the report naming owner and cause.
2. Viability bar met on all five archetypes, or the report names each failing run with its cause and the fix attempted.
3. `founding.mjs` seeds 1–3, `firstplay.mjs`, `stage1a.mjs`, `controls.mjs`, `stage2.mjs` (not soft) pass in the browser; any that does not is named with its cause.
4. Portable build verified.
5. The report's "what is still wrong" section is complete and blunt.

## Machine rules
4 cores; other engineers may be running; one headless browser at a time; at most 2 life runs at a time; never the whole vitest suite in one process; global Playwright only. Check `date -u` before writing a timestamp. Evidence under `test-output/gate1b-close/`.

## Hand-over
(Integrator: result summaries of weather-fix2, viab-founding, viab-economy, viab-loco, stage2-look-fix, onboarding, audio-pass go here before launch.)
