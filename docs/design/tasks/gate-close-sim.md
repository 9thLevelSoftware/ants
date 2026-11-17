# Task gate-close-sim — First-playable gate, simulation half (Opus)

## Goal
Prove by running it that an unattended colony lives from the founding to its first winter with flooding on, on every Tier 1 archetype, and that the sim suite is green. Fix what stops that at its cause. Report bluntly what is still wrong. This task replaces steps 1 (sim folders), 2, 4 (sim items) and the sim-cost table of `gate-1B-close.md`; a second engineer runs `gate-close-app.md` at the same time.

## Read in full
`docs/STATUS.md` from the Nov 16 14:00 entry to the end (rulings R1–R15 are binding and take precedence over the GDD). `docs/design/tasks/viab-economy.md` (viability bar), `econ-growth.md`, `nest-fix3.md`, `loco-fix3.md` and the "Hand-over" below. `gate-1B-sim-report.md` §9 (cost method), §12 (defects L1–L13).

## You own
`src/sim/**`, `src/core/**`, `src/worldgen/**`, `tools/sim/**`. Fix at the cause in the module that owns the rule; small, reported changes; no rebalancing beyond what a ruling asks; contracts additive only; determinism rules in the design seed. If a fix needs a file outside your paths and is under 30 lines, first append one line to `test-output/gate-close/cross-edits.md` (file, what, why), then make it; larger ones go in your report with the exact lines needed.

## Work, in this order
1. **Typecheck and tests, folder by folder** (never the whole suite in one process): `src/core`, each folder of `src/sim`, `src/worldgen`, `tools`. Table of red tests with owner and cause. Fix each that is a real defect or stale expectation. Known red at hand-over: `src/sim/commands.test.ts` "ends with lifecycle" (`nest-flood` sorts after `lifecycle` — decide the right order, fix code or test, say why); nest-folder `sfaReview.verify`, `nestFixesReview`, `stall.soak`, `colony.scenario`, `haulE22.verify`.
2. **R13 — drainage scaled**: a flood-safe site must not reach 25 % flooded from stacked ordinary showers. Scale drainage so one ordinary shower (rain ≤ 0.5) drains from a flood-safe nest within 2 game hours; flood-prone sites still flood in a downpour unless drained (R12). Tests on a generated world for both.
3. **R14 — entrance open within 4 game hours of hand-over**, on every run of the sweep. `reopenTick`'s early branch has taken twice as long as designed in some runs: find out why and fix it. The escape dig measured 2.1–4.1 game hours; state the figure after your fix.
4. **Colony-life sweep against the viability bar, flooding on**: `node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until winter --cache test-output/viab/cache` for seeds 1–3 × woodland-edge, suburban-garden, playground-park, car-park-verge, kitchen-door (15 runs; at most 2 at a time). Bar: ≥ 2 of 3 viable per archetype. For every non-viable run: the cause from the run's own diagnostics, the fix, and a re-run of the affected runs only. Also report per run: first workers, workers at winter, trips per worker per game day, trip success, eggs laid, stores at winter, ants lost and why, entrance-open delay, strict "healthy" verdict. A colony that is viable but passive (no growth between first workers and autumn in a site with food in reach) is a defect to diagnose, not a pass.
5. **Small sim seams**: antlion pit height overlay (`createPit` registers the `-1 + r^1.35` profile through `kernel.setHeightOverlay`; the renderer already draws it); progression listeners for Stage 2 events with a table test that every milestone id has a reachable trigger; `progression/journal.ts yearOfEntry` wrong after the winter jump; `rivals-agents` set-up costing 1.7–5.5 s at tick 1 — move it out of the first tick (world creation or spread over ticks, deterministically); creatures parked at the map edge.
6. **Cost**: sim cost per tick at 300 / 800 / 1,500 workers by the method of the sim gate report §9, with the top five systems each, and every tick over 50 ms in a 2-game-day run with its system. Do not optimise beyond one-hour fixes; the perf task follows.
7. **Report** `docs/design/tasks/gate-close-sim-report.md`: verdict per acceptance criterion, the tables, and a complete "still wrong" list, most serious first.

## Acceptance criteria
1. Typecheck clean on your paths; no red test in your folders without a report entry naming owner and cause.
2. Viability bar met on all five archetypes with flooding on, or each failing run named with cause and the fix attempted.
3. R13 and R14 hold, each with a test and the sweep's figures.
4. No queen and no brood lost to water on a flood-safe site in the sweep.
5. Report complete.

## Machine rules
4 cores shared with another engineer who runs a headless browser. At most 2 life runs at a time; never the whole vitest suite in one process; no `process` in test files (no `@types/node`); delete probe files before you finish. Check `date -u` before writing a timestamp. Evidence under `test-output/gate-close/sim/`.

## Hand-over
(Integrator fills in before launch.)
