# Task viab-loco — Ants must not get stuck (stabilisation round, Opus)

## Why
Stuck ants are visible in the first minutes of play (the first worker the player takes over reads "scouting · stuck" on open flat ground: `test-output/fnd-close/seed1/10-worker-possessed.png`) and they cost small colonies their few foragers. Open items from the gates (`docs/design/tasks/gate-1B-sim-report.md` §12 L10, §9, §13; `docs/design/tasks/int-1B-sim.md` Addendum 3 item 11 and Addendum 5 item 5):
- stall sites with coordinates (L10): suburban-garden #1 surface (2664, 6.1, 2153) BU and nest (2990, -10, 2262); playground-park #2 entrance mouth (886, -3.5, 360); kitchen-door #3 nest (2007, -6.0, 1302); woodland-edge #1 nest (3439, -5.2, 1198); woodland-edge #2 surface (3015, 104.6, 486) (idle ant high on a plant);
- a possessed walker with constant input sometimes does not move on steep shaft walls or beside a log (generated seed 7 start site);
- the three LONG kernel crossings (suburban-garden #4, playground-park #3, kitchen-door #3): surface let-go / step-down, progress metric counting climbing, narrow-strip nav cells;
- creatures outside the map limit (playground-park #2, creatures 8005–8010 at x = 15968.00003, tick 33000: 52 invariant violations);
- weather hooks with no consumer: walker medium `water` at speed ×0.3 via `isUnderWater` (`src/sim/nest/flood/drown.ts`), the stun key `ant.bb['wx.stun']` (`WX_STUN_KEY`), puddle nav cost ×5 at depth ≥ `WX_PUDDLE_AVOID_BU` and block at ≥ `WX_PUDDLE_BLOCK_BU` (except a possessed swimmer), friction ×0.9 on wet surfaces (`surfaceWetness` in `src/sim/environment/moisture.ts`);
- cost: locomotion crowding dominates the tick at large populations (5.9 / 13.2 / 24.1 ms per tick at 300 / 800 / 1,500 workers against a 4 ms frame budget); the outdoor behaviour budget (500 outdoor ants ≤ 1.2 ms) measured 1.33–1.50 ms.

## You own
`src/sim/locomotion/**`, the nav grid/flow-field code it uses, the walker-in-bounds clamp wherever the walker lives (kernel walker: minimal, reported), and for the creatures bound only: the position clamp in `src/sim/ecology/creatures/**` movement. Tests beside them; `src/worldgen/testing/walker.ts` if the test walker must follow.

## Work
1. **A stall detector as an invariant**: in the sim's test invariants (or the life tool's per-day report) "an ant with nav `moving` whose position changed < 0.25 BU in 600 ticks" is a violation with position, state, target and surface normal. Reproduce each L10 site from the life tool's cache (`node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until-day 10 --cache test-output/int1b/cache`) or by placing an ant at the coordinates on that generated world with the recorded target; find each root cause; fix causes, not sites. Add each as a regression test (generated world, behind `FOUNDRESS_LONG` if slow, plus a reduced fast case).
2. **Possessed movement is never dead**: with a held movement input on any walkable surface (steep shaft wall, beside a log, plant stem, mound, plug rim) the possessed ant moves or slides along; build a sweep test: 200 random poses on generated worlds (surface, shaft, stems) × 8 input directions, 100 ticks each; zero "no displacement while not blocked by solid on all probes".
3. **The three LONG kernel crossings pass.**
4. **Bounds**: nothing ever leaves the map (walkers, creatures); test at all four edges.
5. **Weather hooks** listed above, with tests.
6. **Cost**: profile locomotion at 300 / 800 / 1,500 workers on a generated world (the gate's perf script is referenced in report §9); fix the top two costs in crowding/avoidance (spatial hashing reuse, staggered neighbour queries, sleeping idle ants); report before/after per-tick ms. Target: locomotion ≤ 40 % of its current cost at 1,500. Do not change behaviour outcomes beyond what the stall fixes require: the determinism tests (`src/sim/sim.test.ts` restore-at-N, cross-process) must stay green.

## Others are working in parallel
`weather-fix2` (nest flood model: drowning in dry weather is theirs), `viab-founding` (opening; its seal guide walks a possessed queen — it will send you reproductions through the integrator; the seed 7 start site beside a log is the known one), `viab-economy` (colony, foraging behaviours: do not edit `src/sim/ants/behaviours/**`; if a behaviour sets a bad target, report it with the reproduction).

## Acceptance
1. The stall invariant reports zero over `life.ts --until-day 10` on the six L10 runs. 2. Items 2–5 tests green. 3. Cost table with the target met or the remaining top cost named. 4. Typecheck clean; `src/sim/locomotion` tests green; `src/sim/sim.test.ts` green. Machine rules: 4 cores shared; never the whole suite.
