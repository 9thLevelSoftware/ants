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

## B5. The arms, each alone against the final tree

Base = the final tree of opening-fix (sim 741fec90; frozen as `/home/user/ws-base`, sim+tests hash bcebd900): year one
= opening-fix `draftfix15/` (15 to-winter runs from the close sweep's hand-overs `opening-fix/cache/*-b6f4323d.bin`),
year two = `test-output/winter-sugar/base-long/` (the five long-set hand-overs to game day 40, rerun with the sugar
observer; hashes equal the opening-fix long runs). Each arm: the same 15 hand-overs to winter (the five long-set
colonies' year one is their long run's, identical by determinism) and the same five long runs. Trees:
`test-output/winter-sugar/trees.txt`. Tables by `tools/sim/arm-table.py` (`armW-table.md`, `armT-table.md`), trade by
`tools/sim/arm-trade.py` (`trade-long.md`), per day by `tools/sim/sugar-table.py` (`item4-long-*.md`).

### Arm W - R41 alone (`/home/user/ws-armW`, hash 83ad1a93)

`needs.ts carbStockWanted` = max(target days x C rate, `winterPathC`), the colony cycle writing the path
(`economy.ts`, `WINTER_PATH_C_KEY`), read by `needC`, the forage want (so R39's tenders and the scout floor's
shortfall) and the intake target: round 13's R41 as direction 27a item 1 defined it, and nothing else of round 13
(R40 a's gate is already in the tree; R40 b, R42, R44, D33 not). Test `src/sim/colony/r41w.test.ts` in the arm tree (5).

| | base | arm W | bar |
|---|---|---|---|
| year one viable | 15 of 15 | 14 of 15 (we #3: 0.75 of R27; base 1.77) | >= 14 |
| workers at winter | 264 | 267 | >= 255 |
| workers at winter 2 | 113 | 115 | >= 105 |
| R34 >= 1.0 x | 4 of 5 | 5 of 5 | >= 4 |
| R27 at winter 2 >= 1.0 x | 3 of 5 | 4 of 5 (sg #2 0.33; pp #3 2.61) | >= 4 |

### Arm T - the tend floor (`/home/user/ws-armT`, hash e25875a5)

Item 4 points at tending (B4), so arm T was run: the smallest change that keeps a tender on a known herd while needC is
unmet is an ordering fix, not a new floor value: R39 already puts the herds' keep (`tendKeep` per workable herd) in
the tend demand, but GDD 02 §6.3's order serves it after forage and store. `allocation/demand.ts tendFloor`
(`TEND_FLOOR_KEY`): while needC > 0 on a workable surface, the keep, at most the tend demand; `targets.ts planTargets`
serves it right after the brood's care with the scout floor, before forage. No constant. Test
`src/sim/colony/allocation/tendFloor.test.ts` (2). The first tenders of year one were not late against the herds (B4),
so nothing was changed there.

| | base | arm T | bar |
|---|---|---|---|
| year one viable | 15 of 15 | 15 of 15 | >= 14 |
| workers at winter | 264 | 255 (sg #2 19 -> 15, cpv #2 12 -> 10, kd #3 17 -> 15) | >= 255 |
| workers at winter 2 | 113 | 113 | >= 105 |
| R34 >= 1.0 x | 4 of 5 | 5 of 5 | >= 4 |
| R27 at winter 2 >= 1.0 x | 3 of 5 | **5 of 5** (sg #2 3.58, pp #3 1.62) | >= 4 |

### The trade (year two of the five long runs; `trade-long.md`)

| | y2 eggs | y2 eclosions | y2 brood deaths | y2 larvae starved | y2 P delivered | summer (doy 5-15) eggs / potential | summer days potential > 10 and <= 1 egg | p-days gate share |
|---|---|---|---|---|---|---|---|---|
| base | 273 | 97 | 203 | 16 | 181.9 | 258 / 849 | 10 | 5.5 |
| arm W | 222 | 101 | 159 | 4 | 160.3 | 208 / 886 | 13 | 6.1 |
| arm T | 197 | 100 | 127 | 3 | 137.6 | 181 / 870 | 18 | 9.0 |

Both arms buy their sugar partly with protein: fewer foragers go for protein (P delivered -12 % / -24 %) and the
queen's `p-days` gate holds more of her summer potential (eggs -19 % / -28 %; W: pp #3 lays 1, 0, 0, 2 eggs on doy
12-15 against 11, 12, 6, 8; T: sg #2 0, 0 on doy 14-15, cpv #1 0, 0 on doy 14-15). The brood is not starved by it:
larvae starved 16 -> 4 / 3, brood deaths 203 -> 159 / 127, and the colony raises as many workers (eclosions 97 -> 101
/ 100; workers at the second winter 113 -> 115 / 113). The eggs not laid are eggs that died in the base. I read the
spec's "buys sugar by starving brood of protein or by stopping the queen in summer" as a cost in brood raised or a
laying stop for the season; neither arm has that (no colony stops for more than 2-4 days, and the year's eclosions
are not lower). The trade is reported here for the integrator to overrule.
