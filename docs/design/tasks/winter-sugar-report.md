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

## B4. Measurement before any change (item 4)

New tool-side observer `tools/sim/lifeSugar.ts` (wired into `tools/sim/life.ts` as `report.sugar`; reads only): per
game day C delivered by source class (honeydew from a herd, honeydew film, nectar, crumb, sugar, fruit, other = C carried
with protein loads, unknown), C spent from the pool (worker upkeep, queen, larvae, spoiled, rations: the colony's
lifetime ledger), tend and forage worker-days, mean tend demand and tend target, workable / known herds, mean needC,
the carbohydrate forage want, stores and R27's need; and the first tick after the hand-over with an open entrance, then
the first tender (allocation actual), tend demand, workable herd and tender outside. Its runs are the same games as the
final tree's: rerun state hashes equal the opening-fix runs' (pp #3 long c84a5641, we #1 b8a036bd, we #3 7eae6e68).
`life.ts` also records `report.winter1` (state and viable verdict at the first tick of Winter 1) for runs that go on
past it (used from arm T on). Tables: `tools/sim/sugar-y1-table.py` (year one), `tools/sim/sugar-table.py` (per colony
and year from `report.sugar`).

Year one (15 hand-overs: `test-output/winter-sugar/item4-y1.md`; first tenders from 2-day reruns `base-y1short/`, the
year's numbers from opening-fix `draftfix15/`, which are the same games): **all 15 meet R27 (1.33-3.76 x)**. The first
tender after the entrance opens comes 0-18217 ticks after it (median ~550), always 90-600 ticks after the colony's first
workable herd: in year one tending starts as soon as a herd is known, and herd discovery is what sets it (we #2 knows
no herd until +13673, sg #3 until +9181). The lowest ratios (sg #3 1.33, sg #2 1.38, pp #3 1.48, we #2 1.54) are the
late or small herds. Year one is not where the winter sugar fails.

Year two (the five long runs, `item4-long-base.md`; columns per colony and year: first tender, tend worker-days and
share, herds, C in by source, C in, C out, days with needC > 0.05, unserved tend demand, winter C / R27):

| colony | y2 C in / out | needC > 0 days (doy 8-21) | tend unserved, worker-days (days at 0) | herds (doy 11) | winter 2 C / R27 |
|---|---|---|---|---|---|
| car-park-verge #1 | 77.8 / 74.5 | 2 | 0.0 (0) | 2 | 27.4 / 6.6 (4.13) |
| kitchen-door #3 | 51.2 / 46.0 | 3 | 0.0 (0) | 3 | 23.0 / 6.6 (3.47) |
| woodland-edge #2 | 47.3 / 45.2 | 5 | 4.7 (3) | 2 | 10.9 / 3.1 (3.47) |
| suburban-garden #2 | 52.3 / 58.0 | 14 | **38.6 (2)** | 4 | **3.7 / 5.6 (0.66)** |
| playground-park #3 | 48.3 / 65.6 | 14 | **15.5 (1)** | 2 | **0.7 / 8.6 (0.09)** |

**What separates them: demand asks, the allocation does not answer.** The two colonies short at winter 2 have needC >
0 on 14 of the summer and autumn days and spend more carbohydrate than they bring (30-40 workers and the summer brood),
yet on those days the tend target stays far under the tend demand: sg #2 doy 10-11 tend demand 10.8 / 12.1, target 0.0
/ 0.0 (needC 0.88 / 1.00); doy 15-16 demand 7.0, target 3.9-5.1; pp #3 doy 10-11 demand 6.0, target 1.2 / 0.2 (needC
0.95). GDD 02 §6.3's fixed order serves `forage` and `store` before `tend`, and on brood-peak days nurse + queen-care
+ forage + store take every worker: the herds the colony already works lose their tenders while carbohydrate is short
(herd honeydew in year two: 0.47 C per tender-day on sg #2 against ~0.15 C per forager-day). The three colonies that
meet R27 rarely ask (needC > 0 on 2-5 days) and leave little or no tend demand unserved. It is not herds in range (sg
#2 works 4 herds, more than any other) and not demand never asking. The stock target is not the gap either: in autumn
(doy 15-21) R6's autumn multiplier already makes the carbohydrate target the R27 need x 1.25 in every year, so R41's
winter path changes summer (doy 7-14) only - where the R27 need computed at the summer's cluster temperature reads
25-55 C against 6-9 at winter.
