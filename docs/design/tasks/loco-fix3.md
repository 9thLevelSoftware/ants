# Task loco-fix3 — Lost ants, relocation loops, an impossible crossing, failed trips (Opus implement / Opus verify)

## Goal
Ants must get where they are going. In colony-life runs on the current tree workers are counted `lost`, the same walkers are "relocated" hundreds of times on a climb, one generated world has a fence crossing the game's walker cannot make, and only 9–26 % of foraging trips succeed. Find the locomotion and navigation causes and fix them.

## Read in full
`docs/design/tasks/viab-loco.md` and its result in `docs/STATUS.md` (Nov 16 14:00 entry) and the Nov 16 17:10 entry (HEAD check). GDD 01 §§ on movement and climbing; `docs/design/tdd/02-kernel.md` (walker, nav grid). `src/sim/locomotion/**` (incl. `stallWatch.ts`), `src/worldgen/**` nav-grid construction, `src/worldgen/testing/walker.ts`.

## You own
`src/sim/locomotion/**`, the nav-grid construction and validation under `src/worldgen/**` (name the files you touch; world fingerprints may change: say so and update the snapshot tests that pin them, with before/after reachability numbers), `src/worldgen/testing/**`, `src/worldgen/kernel.test.ts`. Do not edit `src/sim/ants/behaviours/**` (`econ-growth` is working in `outdoor/`, `nest-fix3` in `nest/`), `src/sim/colony/**`, `src/sim/nest/**`. Where a behaviour asks locomotion for something impossible (a target inside a solid, a source on an unreachable leaf), report the call site and the numbers; add a locomotion-side answer that fails fast with a reason the behaviour can read (additive status), rather than letting the ant wander.

## Evidence to start from
1. `test-output/headcheck/sg2.log` (suburban-garden seed 2, `life.ts --until winter`, flooding on): 350 lines `[loco] relocated walker N from (...) to (...)`; walkers 6253, 6259, 6265, 6267, 6269 are moved again and again along a descent from about (8099, 60, 10829) mm to (8150, -16, 10868) mm, 6253 dozens of times between two points 0.3 mm apart; the run ends with `worker:lost 5`.
2. Kernel crossing suburban-garden #4: stuck at (3917, 219, 809) BU on a fence face; the nav grid connects cell 244 to 245 in row 50 through a strip about 1.5 BU wide under a board at a fence end, and the walker aims at the cell centre behind the fence. playground-park #3 crosses only with the test walker's extra "over" pass, which the game does not have.
3. Stall sites from the viability sweep: (2529.0, -16.1, 234.5) BU raid ant, woodland-edge #2; (2247.9, -0.2, 1157.2) BU `tend.wait`, car-park-verge #1.
4. Trip outcomes: kitchen-door #1: 67 trips, 9 % successful; suburban-garden #1: 55 trips, 26 %; woodland-edge #3: 35 trips, 0 %; woodland-edge #2 (viab sweep): 285 trips a day with almost no deliveries. `econ-growth` is investigating the behaviour side; you take the movement side: for each world classify every failed trip by where the ant was when it failed (never left the nest, no path, path found but walk failed, reached the source but could not take, could not get home) from the sim's own counters and a probe, and fix the classes that are locomotion or navigation.

## Work
1. Reproduce each item with a probe under `test-output/loco-fix3/` and a reduced fast test that fails before your fix.
2. **Relocation** must be a last resort that terminates: a relocated walker that is relocated again within a short window from the same place escalates (different recovery, then fail the walk with a reason), never loops; `lost` is reserved for ants that truly cannot be placed. No `console`/log spam: one line per escalation at most.
3. **Nav grid truth**: two cells are connected only if the game's walker can actually pass between them with its own ladder of manoeuvres. Either teach the follower to find an edge strip that the grid says exists, or stop the grid from counting strips narrower than the walker's clearance; verify on all 20 kernel crossings with the game's ladder only (`overs === 0`), and assert that in the test.
4. **Climbs to food** (aphid herds on stems, nectar on flower heads): ants reach the herd site and return, on at least the host plants of suburban-garden #1/#2 and woodland-edge #2/#3; a table of host plants tried and success.
5. Cost: locomotion per tick at 300 / 800 / 1,500 workers not worse than today (same probe as viab-loco; state the load).

## Acceptance criteria
1. Typecheck clean; `src/sim/locomotion` and the worldgen test files you touched green; the LONG stall-site test still 5 of 5.
2. suburban-garden #2 to Winter 1: zero `lost`, relocations ≤ 10 in the whole run, none repeated for the same walker at the same place.
3. 20 of 20 kernel crossings with the game's ladder (or each failure named with coordinates and the reason it is a world defect, plus the validation rule that would reject such a world).
4. Failed-trip classification table for the four worlds, before and after; the locomotion/navigation classes reduced to ≤ 5 % of trips.
5. Save/restore determinism unaffected (existing tests green).

## Machine rules
4 cores shared with five other engineers: never the whole vitest suite; at most 2 life runs at a time (`--cache test-output/viab/cache`); long tests behind `FOUNDRESS_LONG=1`; check `date -u` before writing timestamps. The shared tree changes under you (economy, nest and winter engineers): if a number moves for reasons that are not yours, say so and re-measure in a snapshot copy.
