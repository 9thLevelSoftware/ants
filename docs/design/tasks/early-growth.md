# Task early-growth — The player's colony does not grow in its first days (Opus implement / Opus verify)

Written Nov 27 ~10:15 UTC by the integrator, after `winter-sugar` and `app-seams-4` landed.

## What is wrong
`tests/e2e/firstplay.mjs` now plays the first hour to beat 25 without stand-ins on seeds 1, 2 and 3. All three fail one
check, unchanged since the project began: **"no growth over game days 2-3 at 8x"**. After the hand-over the workers stay
flat (10-14), the brood shrinks, and the HUD raises "Brood growth has stalled". It is not only protein income: on seed
2 the brood fell 11 → 7 → 2 while protein in store rose 2.9 → 6.4; on seed 3 brood 10 → 9 → 8 with protein 1.8 → 5.9 →
4.2; seed 1 likewise (`docs/design/tasks/app-seams-4-report.md` §11, `reviews/app-seams-4.json`). The headless sweeps
grow in the same days (median eclosions 8-9 per colony to winter), so something in the player's game differs: the
24-egg clutch the script lays, the possessed worker, the markers and the food-chamber plan the script places, the
spills it drops, or the colony state the browser's hand-over leaves.

Reproduction (about 8 minutes each):
`FIRSTPLAY_SEED=0000000N FIRSTPLAY_RESUME=test-output/app4/sN-handover.save node tools/harness/play.mjs --root . --query 'test=1&quality=test' --script tests/e2e/firstplay.mjs`
(saves for seeds 1, 2, 3 in `test-output/app4/` and `test-output/app4-fix/s3-handover.save`; logs `test-output/app4-fix/s*r*.log`).

## Goal
The player's colony grows in its first game days the way the design says a healthy founding colony does (GDD 02 §5,
GDD 06 §5-§6: brood raised, first nanitics joined by new workers), so that the growth check passes on seeds 1-3 with
its assertion unchanged - by fixing what is wrong in the simulation, not the script. And close the small sim items
listed in B.

## Read in full
`docs/STATUS.md` from "### Nov 27" to the end; `docs/design/tasks/app-seams-4-report.md` (§11 and the full-run
verification), `winter-sugar-report.md`, `opening-fix-report.md`; `tests/e2e/firstplay.mjs` beats 12-25 (what the
script does to the colony); GDD 02 §3-§5 (brood, needs, nurses, allocation), GDD 06 §5-§6.

## You own
`src/sim/**`, `src/core/**`, `src/worldgen/**`, `tools/sim/**`, `docs/design/gdd/DEVIATIONS.md` (rows for what you
change), `docs/design/tasks/early-growth-report.md`. You may run `firstplay.mjs` and add instrumentation switches to it
(dumps, `FIRSTPLAY_UNTIL`); you may not change what a beat asserts. No other engineer is working now: the browser is
yours, one process at a time.

## Work, in this order
### A. Early growth
1. **Measure first, headless.** Load each hand-over save in a node script (`src/game/save` decodes them; if a save
   cannot be loaded headless, rebuild the state with `tools/sim/opening.ts` / `founding/playerOpeningKit.ts` at the
   24-egg clutch and say so) and step the days the browser plays (the script's 8x days 2-3), with and without each
   thing the script does after the hand-over (possession, markers, the food-chamber plan, spills, the protein crumb
   pile). Per game day: eggs laid, each brood stage's count, brood deaths by cause, nurse count and nurse feeding events,
   larvae fed / hungry, protein and sugar in store, the queen's laying permission and why. Compare with a headless
   sweep colony of the same size from the same day (the opening-fix cache hand-overs). Say plainly what kills the brood
   or stops the laying.
2. **Fix defects of execution at their cause**, each with a test red without it (nurses that do not reach the brood
   chamber, food not carried to it, the queen held from laying by a gate that misreads the colony, brood dropped or
   abandoned, a plan or a possessed ant pulling every nurse). A rule change only if item 1 shows no defect: then at most
   one rule, measured alone (bars below).
3. **Bars:** `firstplay.mjs` passes its growth check on seeds 1, 2, 3 (resumed from the hand-over saves, then one
   uninterrupted title-to-25 run on seed 1), assertion unchanged; and on the 15 cached hand-overs
   (`test-output/opening-fix/cache` or `winter-sugar/close2/cache`) to winter: viable ≥ 13 and ≥ 2 of 3 per archetype,
   workers at winter not lower than winter-sugar's close 2 (261) by more than 10; if the change acts before the
   hand-over, a fresh sweep instead. The five long runs only if the change touches the colony after its first year's
   summer.

### B. Small sim items (from the last three tasks)
4. `diag-nest-space` publishes its alert with `focus: null`: give it the chamber it is about (panels.mjs's "alert with
   focus" stand-in can then go).
5. The test world's hand-over: `cheat.completeFounding` does not finish the opening in `makeTestSim`, so `panels.mjs`
   strict needs a stand-in; make it finish (as in the game).
6. The architect's food-chamber plan shows "Stalled: No diggers free" in a 14-worker colony (seed 1, day 5): find why
   no digger is given to a plan the player sees, fix if a defect.
7. `harvest-liquid` keeps running with a full crop after a tapped drink (controls.mjs finding).
8. The flooded set's last partial layer fills breadth-first, so water from above shows straight diagonal edges
   (`nest/flood/spill.ts`): fill the last layer by height / distance to the lowest open sample instead, if it changes no
   flood volume (unit test on volumes).
9. winter-sugar review minors: `tendFloor`'s positive path and its wiring untested (add tests); DEVIATIONS D45's
   evidence column gives arm T alone's numbers - add the closing tree's (13 of 15, 261, R27 at winter 2 in 4 of 5);
   the restated R14 check cannot fail on time for a hand-over that stays cold (give it a bound in ticks too).
10. `nest/escapeDig` (8.76 game hours; a top sphere's surface samples just below open) and
    `nest/flood/readersCost.verify` (30 rebuilds against a throttle of 7): fix if the cause is a defect; else
    report with the cause.

### C. Close
11. Typecheck; tests folder by folder; `outdoor/determinism.perf`; the browser runs of item 3; report
    `docs/design/tasks/early-growth-report.md` with what killed the brood, what was fixed, the tables, and what is still
    wrong.

## Rules
Determinism; new state saved and restored; contracts additive; tunables in `src/sim/balance`; every fix with a test red
without it. At most two life runs at a time while a browser runs, three otherwise; never the whole vitest suite in
one process; disk is about 9 GB free - keep scratch trees small and delete them. Use `date -u` for every time you
write. Integrator rulings appear at the tail of this spec as "Integrator ruling N" and as an INTEGRATOR NOTE line at
the tail of your progress file: re-read both each time a run finishes and before you close.
If the task runs long, the must-haves are A (all of it) and items 4, 5, 9.

## Acceptance criteria
1. Item 1's measurement table exists and names the cause.
2. The growth check passes on seeds 1-3 with its assertion unchanged, or the remaining cause is named with evidence.
3. The 15-run check of item 3 holds.
4. B items done or reported with cause and owner.
5. Typecheck clean; tests green in touched folders; report complete.
