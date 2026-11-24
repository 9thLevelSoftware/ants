# winter-sugar report

Task spec: `docs/design/tasks/winter-sugar.md`. Progress log: `docs/design/tasks/progress/winter-sugar-impl.md`.
Evidence: `test-output/winter-sugar/` (git-ignored). One engineer, Nov 24 13:08 UTC onwards (no restart).

(Draft; sections are filled in as the runs return.)

## A. Leftovers of the opening

### A1. R14 restated (integrator ruling)

- Rule as checked: the entrance is `open` and a worker is on the surface away from it within 4 game hours counted
  from the first game hour after the hand-over in which the air at the nest mouth (`airTemp(sim, entrance pos)`) is at
  or above the forage gate's full band (`species.thermal.forageGate.b`, 18 C for Lasius). A hand-over that is warm
  starts the clock at once; one that stays cold until the entrance is open is within any clock.
- Code: `src/sim/colony/founding/playerOpeningKit.ts` (`runOpening`: `checks.reopened.warmFromTicks`, `fullBandC`;
  the wait samples the air every 25 ticks and floors the warm tick to the start of its game hour).
- Test: `src/sim/colony/founding/playerOpening.long.test.ts` (FOUNDRESS_LONG): seeds 1, 2, 4 with the browser's clutch
  and seed 4 with two lay batches (the 4-worker case), each held to warmFrom + 1000 ticks. 4 of 4 green
  (`test-output/winter-sugar/long-test.txt`). The 7500-tick bound of the old seed-4 case is gone.
- DEVIATIONS: R14 row restated (status built, on the headless opening).

### A2. The kit's clutch (24 eggs, as the browser script)

- `playerOpeningKit.ts` `layBatch` is now `tests/e2e/firstplay.mjs`'s: press, 10 ticks, release, then step 5 ticks at a
  time until the event log shows `action-completed` / `action-failed` for `lay-egg` (at most 600), then 5 ticks.
  `OpeningOptions.layBatches` (default 4; 2 = the old script's 12-egg clutch); `tools/sim/opening.ts --lay-batches N`.
- Headless seeds 1-5 now lay 24 eggs (12 with two batches).

### A3. The unplug stand point

- Cause (seed 4's hand-over, `tools/sim/probe/standProbe.ts`): the throat axis is vertical (dir 0,1,0, mouth 1.91 BU),
  the founding shaft leaves it at 55 deg; the plug fills the axis from -2.85 to +0.15 BU and below it the axis runs in
  plain soil (f = -0.5 BU at -2 .. -8 BU). The old stand point (e.radius + UNPLUG_STAND_BU = 3.41 BU down the axis) lay
  in soil, the cell's digger failed her walk at once and `unplugStep` barred her for UNPLUG_RETRY_S (600 ticks).
- Fix at the cause: `src/sim/nest/entrances.ts` `unplugStandPoint` (exported through `src/sim/nest/index.ts`): the free
  throat sample (field > 0) with closed PLUG soil as a face neighbour nearest to the digger, inside the unseal
  primitive's throat test less the walk's stall tolerance and at most e.radius out along the axis; the old axis point
  only when the plug has no free face in reach. `src/sim/ants/behaviours/nest/dig.ts` `unplugStep` walks there, and a
  walk that failed against the plug itself (at the point, or the point in soil) sets no UNPLUG_RETRY_S lockout (the
  DIG_BITE_FAILS_MAX cap stays). No new constant. DEVIATIONS D44.
- Test: `src/sim/ants/behaviours/nest/unplugStand.test.ts` (2 cases): a widened (1.9 BU) plugged mouth of the small
  test nest opens within 4000 ticks with every digger biting within 300 ticks of entering `dig.unplug` and none barred
  (on the tree without A3 the throat is still `reopening` after 4000 ticks), and the stand point is free space touching
  the plug, inside the throat test, below the opening (for mouths of 1.25 and 1.9 BU).
- Seed 4's hand-over snapshot (`test-output/opening-fix/headless/s4-handover.bin`, probe
  `tools/sim/probe/unplugTimes.ts`): before, the cell's digger is barred at +67 and never bites, a third digger joins at
  +1202, open at +1503; after, both diggers bite from +69 / +106, open at +1235.

Headless openings (`tools/sim/opening.ts`, 4 lay batches; `test-output/winter-sugar/opening/table.txt`; tree before A3 =
`/home/user/ws-a2` (A1 + A2 kit), after = `/home/user/ws-a3` (A1-A3); open = ticks after the hand-over, polled every 250
as the browser script; warm = R14's clock start, -1 = never warm before the entrance opened):

| seed | eggs | first workers | open + worker out, before A3 | after A3 | warm from | R14 restated before / after |
|---|---|---|---|---|---|---|
| 1 | 24 | 14 | 500 | 500 | 176 | met / met |
| 2 | 24 | 10 | 1500 | **500** | 0 | **missed** / met |
| 3 | 24 | 10 | 750 | 750 | 0 | met / met |
| 4 | 24 | 7 | 1750 | **1250** | -1 | met / met (cold throughout) |
| 5 | 24 | 5 | 500 | 500 | 0 | met / met |
| 4, two batches | 12 | 4 | 1750 | **1250** | -1 | met / met |
