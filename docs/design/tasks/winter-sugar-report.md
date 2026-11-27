# winter-sugar report

Task spec: `docs/design/tasks/winter-sugar.md`. Progress log: `docs/design/tasks/progress/winter-sugar-impl.md`.
Evidence: `test-output/winter-sugar/` (git-ignored). Two engineers: the first from Nov 24 13:08 UTC to the pause at
20:06 UTC (A, B, the arms and the first close sweep); the second from Nov 27 06:03 UTC after container restart 10
(integrator ruling 1: the trace of A3's paired cost, the A3 release fix it found, the second close, this report).
The scratch trees the arms ran from (`/home/user/ws-base`, `ws-armW`, `ws-armT`, `ws-armWT`, `ws-a2`, `ws-a3`) were
deleted on Nov 27 for disk; their source differences are kept as patches (`armW-src/armW.patch`,
`trace/armT-on-base.patch`, `trace/A1-A3-on-T.patch`) and their trees' hashes in `trees.txt`.

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
- **Amended on Nov 27 (integrator ruling 1, section B6):** A3 as first built could bar diggers in a new way - when the
  nearest free face of the plug is a crack no walk reaches. A walk to the face point that ends with the digger out of
  the bite's reach now sends her to the old axis point instead of counting against her (`dig.ts unplugStep`, bb
  `bn.ua`; test `src/sim/ants/behaviours/nest/unplugStandReach.test.ts`, red without; D44 amended). The headless
  openings below are from before the amendment; the amendment changes nothing on them where the face point is
  reachable (seed 4's case).

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

### The pair (arm W + arm T, `/home/user/ws-armWT`) and the adoption (item 6)

Both arms alone meet item 6's bars, so the pair was run on the same 15 + 5 (`armWT-table.md`):

| | base | arm W | arm T | W + T | bar |
|---|---|---|---|---|---|
| year one viable | 15 | 14 (we #3) | **15** | 14 (we #3) | >= 14 |
| workers at winter | 264 | 267 | 255 | 257 | >= 255 |
| workers at winter 2 | 113 | 115 | 113 | 120 | >= 105 |
| R34 >= 1.0 x | 4 of 5 | 5 of 5 | 5 of 5 | 5 of 5 | >= 4 |
| R27 at winter 2 >= 1.0 x | 3 of 5 | 4 of 5 | **5 of 5** | 5 of 5 | >= 4 |
| y2 eggs / eclosions / larvae starved | 273 / 97 / 16 | 222 / 101 / 4 | 197 / 100 / 3 | 209 / 106 / 1 | - |

**Adopted: arm T alone** (the tend floor, DEVIATIONS D45). It meets every bar, keeps year one at 15 of 15 and brings
all five colonies into the second winter over their R27 need, and it is the cause item 4 found (an ordering defect
against R39's own keep), with no new constant. R41 (arm W) is not adopted: with it woodland-edge #3 enters its first
winter at 0.75 of the R27 need in both trees that carry it (W alone and the pair: the same 4.5 C for 6.0; 1.77 in the
base and with T alone), a systematic year-one cost and the same kind of cost that withdrew R41 in round 14; its gain over
T alone is +7 workers at the second winter on five runs (pair) and nothing on R27. The pair's trade is the same as T's.
Arm T's cost: 9 fewer workers at the first winter (264 -> 255, at the bar), 3 colonies of 15 lower by 2-4.

## B6. Integrator ruling 1: A3's paired cost traced (Nov 27)

The ruling (spec tail): arm T adopted, R41 not; A3 stays, but its paired cost on the close's 15 hand-overs (A1-A3 + T:
13 of 15 viable, 169.6 C at winter in sum; T without A3: 15 of 15, 196.6 C) is to be explained, with a one-hour
timebox, by tracing the first game day of playground-park #3 and kitchen-door #3 with and without A3.

Probes (all tool-side, `tools/sim/probe/`): `firstDay.ts` (task / state changes, discoveries, hourly allocation and
positions over one game day), `unplugTimes.ts` (now with bites per digger), `unplugYear.ts` (every unplugging episode
from the hand-over to Winter 1), `earlyOut.ts` (open time, worker-ticks outside and first discoveries in the first
3000 ticks, one line), `standTrace.ts` (each digger in dig.unplug tick by tick: where she is on the throat axis, the
stand point, her walk). Trees: the close's frozen tree (A1-A3 + T) and T without A3 rebuilt as the frozen tree with
`dig.ts`'s A3 hunk reversed (`/home/user/ws-T2`; it reproduces arm T exactly: kd #3 hash at +6000 6aaa572a as
`firstDay.ts` on the old arm-T tree, winter C 11.752 as `armT-long`). Both start from the close's own hand-overs
(`close/cache`, same state hash in both trees). The probes reproduce the life runs (pp #3: open +218 / +253, first
tender +1162 / +4602, end hash at winter c4a64ee7 = the close sweep's). Outputs: `test-output/winter-sugar/trace/`.

**What the two failing colonies show (no defect there):**

| | playground-park #3, A3 + T / T | kitchen-door #3, A3 + T / T |
|---|---|---|
| unpluggers (bites) | 7013 21, 7011 20 / 7013 26, 7011 25 | 7294 21, 7307 18 / 7294 20, 7303 12 (7307, 7305, 7296 barred at once for 600 ticks: the defect A3 fixes) |
| entrance open | +218 / +253 | +246 / +236 |
| unpluggers out of dig.unplug after the open | 2 and 7 ticks / 2 and 2 | 2 and 2 / 2 and 3 |
| diggers released from the dig task | +552 to +558 in both trees (the same allocation pass) | allocation identical through hour 2 in both |
| first herd discovered / first tender | +1094 (97 BU) / +1162 ; T: +4149 / +4602 | none on day 1 (first workable herd +12904) ; T: +3035 at 286 BU by the second scout / +3160 |
| herds known doy 10-13 | 1, 1, 1, 2 / 3, 3, 3, 3 | - |
| C delivered doy 10-13 | 9.0 / 16.5 | - |
| unplugging episodes after the hand-over in year one | none in either tree; worker-ticks in dig.unplug for the year 339 / 404 | none in either tree; 356 / 299 |
| winter C : R27 | 6.8 : 7.6 (0.89) / 15.0 : 8.0 (1.89) | 5.3 : 5.9 (0.89) / 11.8 : 6.1 (1.92) |

No digger is held after the entrance is open, the release comes at the same allocation pass in both trees, and no
second unplugging happens in the year. What A3 changes on these two is who unplugs: on kd #3 two diggers bite instead
of one biter and three barred workers, so a different worker is free when the second scout slot opens in hour 3
(7296 instead of 7303); T's 7303 finds the herd at 286 BU, A3's scouts find nothing that day. On pp #3 the entrance
opens 35 ticks sooner and the colony finds the near herd early but the other two late. Over all 15 (first close against
arm T) the year's deliveries are not smaller with A3 (trips 794 / 739, deliveries 1466 / 1441) but their mix is: C 334.5 / 364.9, P 156.3
/ 135.8 - the herds are found later in 9 of 15 and sooner in 3. I read that as the early hours' chaos the herd
discovery has always shown (one chaotic run proves nothing, direction 13), not a mechanism.

**What the other thirteen showed (a defect, now fixed):** `earlyOut.ts` on all 15 (`trace/early.txt`): with A3 the
entrance opened later than without it on 6 of 15 (suburban-garden #1 +559 against +270, sg #2 +535 / +323, pp #1 +310
/ +204, cpv #2 +204 / +159). `unplugTimes.ts` and `standTrace.ts` on sg #1 (`trace/unplug-suburban-garden-1-*.txt`,
`trace/stand-sg1-A3T.txt`): A3's stand point there is a crack beside the plug (1.68 BU off the axis against a 1.38 BU
mouth, field 0.3 BU) that no walk reaches; the walker took the diggers to the nearest cell it could reach, 3.3 BU short
and outside the bite's throat test (4.38 BU from the mouth), `approach` reported `arrived`, every think counted a
fail and after DIG_BITE_FAILS_MAX the digger was barred for UNPLUG_RETRY_S - three diggers barred without a bite, the
plug opened by a fourth at +559. On sg #2 one of the two diggers was barred the same way. This is the kind of defect
the ruling describes ("changes who is free in another way"): A3 created a new way to bar a digger while fixing the old.

**The fix (`dig.ts unplugStep`):** a walk to the face point that ends with the digger out of bite reach
(`canDo('unseal-entrance')` = `out-of-reach`) counts nothing against her: she walks to the old axis point instead (bb
`bn.ua`, reset when she enters dig.unplug), and only that walk can count towards the lockout. Seed 4's case (the axis
point in soil, the face point reachable) is untouched. No constant. Test `src/sim/ants/behaviours/nest/unplugStandReach.test.ts`:
the walk is stubbed for diggers in dig.unplug (it "arrives" where she stands, out of reach, as on sg #1) and the face
point replaced; she must walk to the axis point before any lockout - green on the fixed tree, red on the close's tree
("she walks to the axis point: expected undefined to be defined"). DEVIATIONS D44 amended. Open times with the fix
(`trace/early-fix.txt`, same 15 hand-overs): sg #1 +263, sg #2 +311, pp #1 +177, pp #2 +193; equal to the A3 tree on
the other eleven, among them pp #3 and kd #3, whose first 3000 ticks are identical with and without the fix (same
worker-ticks outside, same discoveries) - so the fix cannot change those two colonies' year.

Per the ruling: the 15 and the five long runs were run again on the fixed tree (section C, close 2), and the task
closes on it.

## B7. A third year for the two fragile colonies (item 7)

From the closing tree (close 2), playground-park #3 and suburban-garden #2 ran on through the second winter to game day
60 (year 3 doy 16) from their fresh foundings (`close2/sweep-long/`, `UNTIL_DAY=60`). pp #3 is the same game as on the
first close's tree (every day row equal); sg #2's year changes from its hand-over's first hours (the A3 release fix).

| | playground-park #3 | suburban-garden #2 |
|---|---|---|
| enters winter 2 (workers, C : R27 need) | 23, 6.1 : 7.0 (**0.87**) | 24, 17.9 : 5.7 (3.11) |
| lowest C after it | 0.0 on y3 doy 9 (C 1.96 at spring 3, 0.60 on doy 3) | 12.4 (y3 doy 16) |
| **spring 3** (doy 1): workers, queen | **21, alive** | **18, alive** |
| deaths winter 2 -> y3 doy 16 | old age 10, predation 6; none from starvation | old age 9, lost 3, drowning 3, crushed 1 |
| year 3 to doy 16: eggs / eclosions | 78 / 39 | 47 / 12 |
| starvation stage in year 3 | lean from doy 3; **rationing on doy 9-11, 13-14** (C 0.0-1.0) | rationing on doy 9 only |
| workers y3 doy 15 | 35 (47 on doy 16) | 22 |

A colony short of sugar at its second winter does not die of it in this model: pp #3's winter lapse and its spring
stand on the stores it has (no worker starves, the queen lives), it reaches spring 3 with 21 of its 23 workers - but it
comes out with no carbohydrate, runs lean from spring and rations through the summer brood peak of year 3 (doy 9-14)
while it grows to 35-47 workers on protein (78 eggs, 39 eclosions). sg #2, which entered winter 2 with three times its
need, spends spring and summer 3 fed.

## C. Close

### C8. Fresh sweep and long runs on the closing tree (close 2)

Tree: the live tree after ruling 1's fix, frozen as `/home/user/frozen-wintersugar2` (sim + worldgen + core hash
bf7364d3 = live). `tools/sim/sweep-life.sh` from it: 15 fresh foundings (`close2/cache`; byte-identical to the first
close's hand-overs, e.g. woodland-edge #1 9d00f377...), each to Winter 1 (`close2/sweep/`, table
`close2/sweep-table.md`); then the five long runs from the same foundings to the second winter (pp #3 and sg #2 on to
day 60). Script `test-output/winter-sugar/close2/close.sh` (restart-safe).

**Year one (15 fresh foundings):**

| | opening-fix final (base) | arm T alone | close 1 (A1-A3 + T) | **close 2 (A1-A3 fixed + T)** | bar |
|---|---|---|---|---|---|
| viable | 15 of 15 | 15 of 15 | 13 of 15 | **13 of 15** (pp #3, kd #3: 0.89 of R27) | >= 14 of 15 |
| per archetype | 3 of 3 each | 3 of 3 each | pp 2, kd 2, others 3 | **pp 2, kd 2, others 3** | >= 2 of 3 |
| workers at winter | 264 | 255 | 256 | **261** | (item 6: >= 255) |
| C in store at winter, sum | - | 196.6 | 169.6 | **185.6** | - |
| R19 growth bar | 4 of 7 | - | 5 of 7 | **5 of 7** (median P intake / need 0.39 < 0.7; first workers >= 9 in 11 of 15 < 13) | 7 of 7 |

What the fix changed (the four colonies whose diggers it released, section B6): sg #1 2.76 -> 3.93 x R27 (14 -> 18
workers), pp #1 1.13 -> 3.08 (20 -> 18), sg #2 2.77 -> 2.17 (16 -> 15), pp #2 2.47 -> 2.44 (16 -> 20); the other eleven
are the first close's games (their day rows are equal; the final state hashes differ only by the new blackboard key).

**The viability bar (>= 14 of 15) is missed by one, as on the first close**, and the two colonies that miss it are the
same games as there: kitchen-door #3 and playground-park #3, 0.89 of their R27 need. Their cause is in section B6 (who
unplugs decides who is free in hour 3, and the herd discovery that follows); it is not a defect I could find, so
nothing was reverted. Without A3 both are viable (arm T: 1.92 and 1.89), with A3 alone and no tend floor too (1.62,
1.07; `switchoff-T/`, the first engineer's switch-off runs) - on these two colonies the loss needs A3's changed first
hours and the tend floor together; each alone keeps them viable.

**The five long runs (to the second winter; pp #3 and sg #2 on to day 60):** `close2/sweep-long/longrun-table.md`,
against arm T alone `close2/close2-vs-armT-table.md`, against the opening-fix final tree `close2/close2-vs-base-table.md`,
against the first close `close2/close2-vs-close1-table.md`.

| colony | winter 1 workers | winter 2 workers | R34 (w2 / w1) | C : R27 need at winter 2 | queen at w2 | y2 eggs : eclosed |
|---|---|---|---|---|---|---|
| woodland-edge #2 | 10 | 8 | **0.80** | 13.1 : 2.7 (4.90) | alive | 18 : 7 |
| suburban-garden #2 | 15 | 24 | 1.60 | 17.9 : 5.7 (3.11) | alive | 42 : 22 |
| playground-park #3 | 20 | 23 | 1.15 | 6.1 : 7.0 (**0.87**) | alive | 64 : 21 |
| car-park-verge #1 | 29 | 39 | 1.34 | 22.7 : 8.3 (2.75) | alive | 47 : 25 |
| kitchen-door #3 | 15 | 20 | 1.33 | 13.3 : 5.4 (2.48) | alive | 45 : 15 |

| | opening-fix final | arm T alone | close 1 | **close 2** | bar (item 6) |
|---|---|---|---|---|---|
| workers at winter 2, sum | 113 | 113 | 108 | **114** | >= 105 |
| R34 >= 1.0 x | 4 of 5 | 5 of 5 | 4 of 5 | **4 of 5** (we #2 0.80) | >= 4 of 5 |
| R34 >= 1.5 x | 1 of 5 | 2 of 5 | 0 of 5 | **1 of 5** | (colony-life: 3 of 5) |
| R22 spring >= 0.7 x winter | 5 of 5 | - | 5 of 5 | **5 of 5** | 4 of 5 |
| R27 at winter 2 >= 1.0 x | 3 of 5 | 5 of 5 | 4 of 5 | **4 of 5** (pp #3 0.87) | >= 4 of 5 |

The first close's kitchen-door #3 long run (lost in the restart) was rerun on that tree on Nov 27 (06:11-06:29) and
is in `close/sweep-long/`; woodland-edge #2, pp #3, car-park-verge #1 and kd #3 are the same games on both closing
trees. The sweep and the long runs read their second-winter row as the first winter row of year 2 for all five.

### C9. DEVIATIONS rows (`docs/design/gdd/DEVIATIONS.md`)

- **R14** restated (A1): the 4-hour clock starts at the first game hour after the hand-over with the air at the nest
  mouth at or above the forage gate's full band; checked on the headless opening.
- **D44** (A3): the unplug stand point at the plug's free face; no lockout for a walk that failed against the plug.
  **Amended Nov 27** (ruling 1): a walk to the face point that ends out of bite reach sends the digger to the axis
  point instead of counting against her; `unplugStandReach.test.ts`.
- **D45** (arm T, adopted): the tend floor - while needC > 0 on a workable surface, the herds' keep is served before
  forage, with the scout floor; no constant.
- Not added: R41 (arm W) stays withdrawn (not adopted, section B5).

## Verification (final tree, Nov 27)

- `npm run typecheck`: clean (whole project, after the fix).
- `npx vitest run src/sim/ants/behaviours/nest src/sim/ants/actions/dig.test.ts`: 41 files / 93 tests green, 3
  skipped (`test-output/winter-sugar/tests-behnest-fix.txt`).
- `npx vitest run src/sim/colony`: 90 files / 374 tests green (`tests-colony-fix.txt`).
- `npx vitest run src/sim/nest`: 65 files green, **2 red that are not this task's**: `nest/escapeDig.test.ts` (the
  escape shaft does not open) and `nest/flood/readersCost.verify.test.ts` (30 spill rebuilds against a throttle of 7).
  Both were red on Nov 24 on the opening-fix final tree before any change of this task (the first engineer's
  `tests-nest-live.txt`; same two on `/home/user/ws-base`); they are left for their owner and listed below.
- `src/sim/ants/behaviours/outdoor/determinism.perf.test.ts`: green (`determinism-perf-fix.txt`).
- FOUNDRESS_LONG `src/sim/colony/founding/playerOpening.long.test.ts` on the final tree: 4 of 4 green, 601 s
  (`long-test-fix.txt`).
- Headless openings on the closing tree (`opening/run-fix.sh` -> `opening/fix`, `opening/fix-b2`): seeds 1-5 open at
  500 / 500 / 750 / 1250 / 500 ticks and the two-batch seed 4 at 1250 - the same as with A3 before the fix.
- Red without the change: `unplugStandReach.test.ts` red on the first close's tree (no fix); `unplugStand.test.ts` and
  `tendFloor.test.ts` red without A3 / arm T (first engineer, `tests-A.txt`, section A3 and B5).

## Acceptance criteria

1. **Met.** A1-A3 done with their tests; `playerOpening.long` green on the restated R14 including the 4-worker case
   (4 of 4, on the final tree too).
2. **Met.** Item 4's tables (`item4-y1.md`, `item4-long-*.md`) and their reading (B4): demand asks, the allocation
   does not answer - tend target far under tend demand on the short colonies' brood-peak days.
3. **Met.** Arm W and arm T each alone on the 15 + 5, with tables; the pair too; the decision follows item 6's bar
   (T adopted, W not; confirmed by integrator ruling 1).
4. **Partial.** The close sweep (close 2) is 13 of 15 viable - every archetype >= 2 of 3, but one under the bar of 14.
   The cause was investigated and reported before any revert (B6: one real defect in A3 found and fixed; the two
   remaining failures are the same games with and without the fix and are not explained by a defect); nothing was
   reverted.
5. **Met, with two pre-existing reds.** Typecheck clean; behaviours/nest and colony green; nest green except the two
   tests that were red before this task; `outdoor/determinism.perf` green.
6. **Met.** This report.

GDD Appendix E checks: this task changes no rule that an Appendix E check of GDD 02 §3-§5 or GDD 06 §8 states
directly; the colony folder's existing App E tests (stores, needs, allocation, overwinter) stay green. R27's winter
line is checked by the sweeps (`lifeViable.ts`), not by a unit test.

## What is still wrong (most serious first)

1. **Two colonies of 15 enter their first winter short of sugar on the final tree** (playground-park #3 and
   kitchen-door #3, 0.89 of R27), so the viability bar of 14 is missed by one. Neither is a defect I could find: with
   A3 the plug's diggers are different workers, so a different worker is free when the second scout slot opens, and
   the herds those colonies need are found hours to days later (B6). The paired cost is real on these hand-overs -
   on the first close (A3 before its fix) the 15 colonies deliver 8 % less carbohydrate and 15 % more protein in year one than without it (trips and
   deliveries are not fewer), and herds were found later in 9 of 15 - but it reads as early-hours chaos in herd
   discovery, which direction 13 warns one run cannot settle. A run-to-run spread of herd discovery this large (kd #3:
   +3054 against +12904 ticks from the same hand-over) is itself the weakness: a colony's year hangs on one scout's
   luck in its first game day.
2. **A colony short at winter 2 survives the winter but starves through the next summer** (B7: pp #3 rations on 5 of
   the first 16 days of year 3 with 35-47 workers). Nothing in the model makes a colony with low carbohydrate in
   spring raise less brood or forage harder for sugar early; R41's winter path (arm W) did not hold either.
3. **R34 >= 1.5 x in 1 of 5** (the colony-life bar is 3 of 5) and woodland-edge #2 shrinks over year two (10 -> 8,
   0.80 x): unchanged from the opening-fix tree (1 of 5, we #2 0.82 x there).
4. **R19 growth bar 5 of 7**: median protein intake / need 0.39 (bar 0.7) and first workers >= 9 in 11 of 15 (bar 13)
   - pre-existing (4 of 7 on the opening-fix tree).
5. **Arm T's trade** (B5): in year two the colonies lay 28 % fewer eggs and bring in 24 % less protein; eclosions and
   workers at winter 2 do not fall and fewer larvae starve, so item 6's clause was read as not triggered - the
   integrator agreed in ruling 1, but the trade stands.
6. **Two red tests in `src/sim/nest`** (escapeDig, flood/readersCost.verify), red since before this task.
7. The browser script `tests/e2e/firstplay.mjs` still polls R14 as 4 hours from the hand-over (app side, not this
   task's files); the headless kit holds the restated clock.

## Decisions and contradictions recorded

- Ruling 1's timebox (one hour) was used for the trace of pp #3 / kd #3; the A3 defect was found at its end by the
  15-colony early probe, not on those two. I treated it as the ruling's first branch (a defect in how A3 changes who
  is free), fixed it, and reran the 15 + 5 on the fixed tree.
- The ruling's rerun bar (>= 14 of 15, >= 255 workers) is not met on the viability count (13); I closed on the fixed
  tree as the ruling says ("close on that tree") rather than reverting A3: the fix removes a real lockout on four
  colonies and changes nothing on the two failures.
- The release fix uses `canDo('unseal-entrance')`'s `out-of-reach` reason as the test of "the walk ended out of bite
  reach", so the rule is the primitive's own throat test, not a second copy of it.
