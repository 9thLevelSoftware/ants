# Stage 1B integration gate — simulation half (int-1B-sim)

Scope: `src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**` and their tests. Everything below was checked by
running it on the shared 4-core machine (load average 8-10 for the whole session; other engineers were running
founding-close, rivals and ui-panels work at the same time), so every timing is noisy and is reported as measured.

**Verdict: partial.** A colony founds itself, reopens its nest, forages, raises brood, digs and stays deterministic on
generated worlds with no player (save -> restore -> continue now holds there too, section 17), and the Addendum 3 / 4
/ 5 items are done or assigned; but acceptance 2 is not met. After the review round the health judge applies the
task's definitions strictly (section 4); by it the sweep on the final code is in section 5 (sweep 4), and sweep 3's
data re-judged gives 1 of 15. The unhealthy runs are diagnosed: founding failures (founding-close's seal), locomotion
stall sites (any stuck day now fails), and the economy of an incipient colony that is handed over at the end of
summer with an empty pool and enters autumn with 7-16 workers. The performance verdict is now against the
architecture's budget (sim <= 4 ms per frame at 1x with 1000 ants, docs/03-architecture.md §6): **not met** at any
measured size (section 9).

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | typecheck clean; every test under `src/sim`, `src/worldgen`, `src/core` green; suite time under target or offenders listed | **not met** | typecheck 0 errors in these paths except another engineer's in-progress `environment/human/schedule.long.test.ts`; failures remain, each with owner and reproduction (sections 12, 17); suite 28 min under load, offenders listed |
| 2 | colony-life tool; every Tier 1 archetype >= 2 of 3 seeds healthy over 10 game days; every unhealthy seed diagnosed | **not met** | tool done (section 4, strict judge since the review); sweep 4 in section 5; diagnoses in section 5 |
| 3 | player-in-the-loop tests pass | **met** | `gate1b/player.test.ts` 4/4 (section 7); the review's strict "more foragers -> strictly more deliveries" test passes; "brood production off" has no directive in the current design (recorded) |
| 4 | mid-life save/restore determinism; 300-worker 5-day soak with zero invariant violations | **met** for this gate's modules | `gate1b/midlife.test.ts` (now asserting a live plan and fed larvae at the save), the review's generated-world test (woodland-edge #1 after the real hand-over, FOUNDRESS_LONG) green; the nest volume divergence it found is fixed (section 17). `stage1a.e2e` (c) still diverges, now from another engineer's in-progress `nest-flood` system (L12) |
| 5 | performance tables for 300 / 800 / 1,500 workers with a budget verdict per system | tables **met**; budget **not met** | section 9: tick 5.9 / 13.2 / 24.1 ms against the architecture's 4 ms per frame; the nest system's multi-second tamp ticks are fixed (section 17) |
| 6 | no production path uses a stand-in / test double / stub where a real module exists | **met** for the simulation side | grep in section 16; the three application-half imports of the test world are listed for the app engineer |
| 7 | every simulation item of `notes-1B.md` accounted for | **met** | section 13 |

## 1. Suite baseline and diet

`npm run typecheck`: clean at the start and at the end of the gate (the only errors seen in between were other
engineers' work in progress in `src/ui/**`).

Baseline (`test-output/full-suite-nov15.txt`, 16:41): 23 failures in 17 files. The gate's folder-by-folder run
(`test-output/int1b/folders.sh`, one vitest process per folder, 2 workers, load 8-10) after the fixes below:

Final run at the end of the gate (`test-output/int1b/folders2/`, 01:34-02:05; the five folders touched after it
re-run in `folders3/`, 02:08-02:16), one vitest process per folder, 2 workers, machine load 7-10:

| Folder | Result | Time | Failing tests (owner, section 12) |
|---|---|---|---|
| src/core | 187 passed | 8 s | |
| src/sim/types | 27 passed | 4 s | |
| src/sim/balance, src/sim/save | no test files | 1 s | |
| src/sim/entities | 6 passed | 4 s | |
| src/sim/world | 34 passed | 6 s | |
| src/sim/locomotion | 94 passed | 34 s | |
| src/sim/pheromones | 71 passed | 72 s | (the two load-sensitive perf tests passed this time) |
| src/sim/nest | 236 passed, 2 failed | 87 s | `sfcDeterminism` midden-blocked case, `spoilScenario` midden-blocked (L5, founding-close guard) |
| src/sim/ants | 237 passed, 1 failed, 7 skipped | 236 s | `tendHerd` "establishes tending" 0.47 vs 0.5 (L4) |
| src/sim/colony (includes `founding/`) | 157 passed, 1 failed, 4 skipped | 62 s | `seams.test` midden-blocked (L5) |
| src/sim/ecology | 300 passed, 5 skipped | 33 s | |
| src/sim/combat | 72 passed, 1 skipped | 8 s | |
| src/sim/environment | 171 passed | 38 s | |
| src/sim/progression | 226 passed, 1 skipped | 11 s | |
| src/sim/rivals | 101 passed, 3 skipped | 40 s | |
| src/sim/species | 131 passed | 6 s | |
| src/sim/testing | 41 passed, 2 failed, 1 skipped | 90 s | `stage1a.e2e` (b) trips 39 vs deliveries 40, (c) save/restore (L3); (a) green again |
| src/sim/*.test.ts (17 files) | 112 passed | 79 s | |
| src/worldgen | 220 passed, 4 failed, 43 skipped | 850 s | interior kitchen-door connection; outdoor climb-route POI, micro-connection usefulness, solids interpenetrate (L7, worldgen owners at work) |

**Baseline 23 failures in 17 files -> 10 failures in 7 files**, every one listed with its owner in section 12
(none of them is in a file this gate changed the behaviour of, except `stage1a.e2e` (b)/(c), which were red before).
`npm run typecheck` (`tsc --noEmit -p tsconfig.json`, which includes `tools/sim`): **0 errors** at 02:40 (earlier in
the night the only errors were other engineers' work in progress in `src/render/fx/scent`).

**Suite time.** Sum of the folders: about 1,670 s (28 min) under load 7-10 with one process per folder (each pays
the transform start-up); the 5-minute target is **not met**. Offenders: `src/worldgen` 850 s
(`place/interior/interior.test.ts` 132 s even at 3 default seeds, was 493 s; `place/outdoor/outdoor.test.ts` 32 s,
was much longer at 10 seeds; `maps.verify` and `pipeline.test` about 80-90 s each), `src/sim/ants` 236 s,
`stage1a.e2e` 65 s, `nest/spoilScenario` 25 s, `tendHerd` 14 s. Diet applied: interior full sweep (10 seeds,
5 Camponotus) and outdoor full sweep behind `FOUNDRESS_LONG` / `FOUNDRESS_FULL` (`interior.test`, `outdoor.test`);
the gate's own soak is LONG-only. Worldgen went 1,779 s -> 850 s.

## 2. Addendum 3 items

Per item: fixed / not fixed / not a defect, with the evidence (test names; logs in `test-output/int1b/`).

| # | Item | Outcome | Evidence and cause |
|---|---|---|---|
| 1 | `sim.test.ts` restore-at-N | **fixed** | First divergence found by a state diff at the first tick after the restore: walker positions. Cause: `locomotionSystem` re-attached every walker when `sim.carve.version !== rt.carveVersion`; the runtime counter starts at -1 in a restored Sim, so a restored game ran `surfaceCheck` on its first tick and the uninterrupted one did not. Fix: a persisted `worldDelta.carveChangedTick` (written by a carve listener the services install) decides the re-attach, so both runs check on the same ticks. `sim.test.ts` 8/8; new `gate1b/midlife.test.ts` (save mid-life with trails, carriers, brood) green. |
| 2 | `commands.robust` stagger collision | **fixed** | Two collisions. `allocation` vs `tend-demand`: the tend-demand stop-gap system is gone (item 8). `environment-effects` (every 50, offset 30) vs `progression-stats` (every 250, offset 130): `PROGRESSION_STATS_OFFSET` 130 -> 131 (the first free offset after colony-stats, computed over all periodic systems). |
| 3 | Layering | **fixed** | `costTable.ts` takes its clock from the calling test (`measureCost(n, { clock })`); `locomotion/update.ts` local `window` renamed `stallWindowS`; the worldgen layering items had been fixed by their owners (green at the gate). |
| 4 | `behaviourRunner.test.ts`, `stubs.test.ts` | **fixed** | The runner test checks the Stage 1B task set as a subset plus "every entry is a real task" (combat, rivals and ecology-plants keep adding behaviours: `raid` appeared during the gate). The stubs test asserts the real combat (`applyDamage(queen, 5)` deals 0 < d <= 5) and progression (typed results). |
| 5 | `checkStart` regenerate | **fixed** | `checkStartRule` now also reports `good` and `onlyContentShort` (every place rule holds, only the content-bound parts fail: good sites and a nest patch nearby; for a wood nester without catalogue wood both are wood). `checkStart` sets `regenerate: false` for that case when `contentLimited` holds, as `checkFound`/`checkConnect` do. `pipeline.test.ts` "wood nesters without catalogue wood" passes (1 attempt, R2). The integrator's note said "good count short" only; the dig-patch clause had to be included because the same missing wood also leaves `dig=none`. |
| 6 | `removal.verify` scout re-entries | **test changed, ruling** | GDD 02 §10.1/§10.2: an exploring scout is sent nowhere; its correlated walk may cross an emptied spot. The per-ant "keeps going there" limit now ignores entries made in `scout.explore`; those entries still count for the stop time. Result: per-ant visits [2, 1], last visit 1362 s after removal (bound 4136 s). The behaviour was not changed. |
| 7 | Load-sensitive tests | **re-run** | `sfaReview` feed-queen and `populate.verify` (3): green on a re-run at load 9. Still red only under load: `pheromones/perf.verify` (6.3 vs 6 ms) and `pheromones/stagger` (1.10 vs 1.0 ratio), architect layout 50 ms and the outdoor determinism.perf budget (see section 9). Founding `outcome.verify` / `rules.verify` belong to founding-close (in progress). |
| 8 | `tend` demand | **fixed** | `computeDemand` sets `d.tend = herdTendDemand(sim, colonyId)`; `TEND_DEMAND_ADAPTER = false` and `tendDemandSystem` is no longer in the ecology system list (kept exported for the plants unit test). Test: `gate1b/seams.test.ts` "colony allocation computes the tend demand". `tendHerd.test.ts` "establishes tending" is red (min tend 0.47 vs 0.5 in the last quarter); it is equally red with the old adapter restored (0.47), so the cause is elsewhere (see section 12). |
| 9 | `fleeTask` rest | **fixed** | Hands back `rest` when hp < `FIGHT_EXIT_FLEE_HEALTH` (0.25) x maxHp, else `idle`. Test in `gate1b/seams.test.ts`. |
| 10 | Action library combat shells | **fixed** | Native `dodge` and `sting` shells in `ants/actions/defs/combat.ts` (rules through ports: `dodgeRefusal`/`startDodge`, `stingRefusal`/`stingContact`/`stingHit`); the bite shell asks `combat.mayBite` (stunned / pinned not facing: `blocked`), sets its cooldown to the caste's `combatStats().biteCycleS`, has no fixed cue (combat emits `bite` with hardness) and passes the attacker id; spray asks `sprayDisabled` (`conditions`) and passes the attacker id. `combat.applyDamage` resolves a named attacker's bite/spray as it did for an unnamed one. `installActionAdapters` is a no-op (nothing patches `ACTION_DEFS`). `src/sim/combat` 72/72, `ants/actions` green. |
| 11 | Surface locomotion traps | **not fixed** | Not reached: the colony-life runs showed no surface relocations that blocked a colony, and the three LONG kernel crossings run worldgen's own test walker (`src/worldgen/testing/walker.ts`, which mirrors locomotion constants), so a locomotion change alone would not turn them green. Left for a locomotion task with the reproduction sites listed in the worldgen-fixes report. |
| 12 | Possessed prediction vs overrides | **fixed** | Locomotion records when a movement override moved the possessed ant (`rt.possessedOverriddenId`); the per-frame predictor holds the tick pose then (it may not run the overrides itself: they write state). Test: `gate1b/seams.test.ts` "the per-frame prediction holds a possessed ant...". |
| 13 | Health regeneration | **fixed** | Workers regenerate at `HEALTH_REGEN_IN_NEST` 0.25/gd in the nest with crop C > 0 and `HEALTH_REGEN_ELSEWHERE` 0.1/gd otherwise (GDD 05 §4.7, under GDD 02 §1.4's conditions); the queen keeps `HEALTH_REGEN_RATE` 0.2. Combat's top-up is now 0 (it tops up only what its rate exceeds the colony's). Test in `gate1b/seams.test.ts` (measured 0.25 and 0.1 within 20-30 %). Precedence: GDD 05 owns recovery, GDD 02 the conditions. |
| A4 | `feedQueenFromReserve` stage check | **fixed** | `queenReserveFeedAllowed(col)` (S2..S4) inside `colony/queen.ts`; every caller is gated. Test in `gate1b/seams.test.ts`. |


## 3. Seams (work item 2)

Found by running a colony after the real founding on generated worlds (sections 4-5), each fixed where its cause
lives:

- **Founding reopen could not be dug (nest validator).** After the hand-over the founding module asks the nest for
  a shaft through the plug. On woodland-edge #1 every request was refused `non-diggable` without an event: the
  nest's shaft clamp (`SHAFT_LEN_BU` minimum, tilt cone) extends the shaft about 3 BU above the ground, into a leaf
  lying over the opening, and 10 of 46 target samples were inside that leaf (> `PLAN_NON_DIGGABLE_MAX` 0.1). The
  validator now ignores hard surface objects above the ground (a new `sampleAboveGround` predicate in
  `nest/plans/targets.ts`): they stay hard samples, never targets, and do not count toward the non-diggable share. An
  entrance may open under cover (stones and leaves are the best sites in GDD 04/06). Result: the entrance went
  `sealed -> sealing -> open` within 2 game hours of the hand-over and the first workers walked out.
- **First workers could never find a flower (perception).** Flower heads sit 14-31 BU above the ground on their
  stems; their odour radius is 10 BU (GDD 05 §1.2), measured in 3D, so no ground ant ever smelled one. A raised
  source is now smelled in plan view from the ground below it (`ants/perception/sense.ts`; the query radius grows by
  the source's height, cached per source). Locomotion already routes a trip to an elevated goal up the plant's climb
  route. Ruling recorded: GDD 05's odour radius is read in plan view for raised sources.
- **An incipient colony with an empty pool could not scout (foraging).** After the hand-over the pool is empty (the
  queen keeps her reserves, GDD 06 §5.13 (c)); a departing scout gets no ration, and GDD 02 §1.4's hungry return
  (crop C < 0.05 and reserve < 50 %) turned every scout home at the entrance, for ever. The hungry return now applies
  only while the pool holds `HUNGER_RETURN_POOL_MIN_C` (0.1 C): going home cannot feed the ant otherwise. With it
  the first deliveries came on the first day after the reopen.
- **Nest system cost (entrance checks).** `checkEntrances` re-ran a throat BFS over field samples for every
  entrance every 10 ticks: 33 % of a small colony's whole tick in a CPU profile (`test-output/int1b/prof/`). The
  status is a function of the carve grid, the voxel flags, the field geometry, the pile grids over the throat and
  the entrance record; `evaluateEntrance` now skips when none of them changed (runtime memo keyed on
  `carve.version`, a new `FlagStore.version`, a new `field.geomVersion` and a fingerprint of the pile cells over the
  throat). A restored game evaluates once more and gets the same answer (save/load tests green).
- **Odour query cost.** The plan-view rule's per-tick lift computation is cached per source object.
- **Already connected by the fix tasks and verified here:** behaviours run on the real perception, pheromones,
  sources, colony delivery (`recordDeliveryCount`) and nest functions; the architect plans from real needs and real
  diggers dig them (a nursery was added and dug on day 1 in every run that reached it); founding runs the real seal,
  laying and brood model (`cheat.completeFounding` carves the template with debug carve commands, everything after
  is the normal code); new games use the populated world's queen start, food anchors (75 sources on woodland-edge
  #1 at the start) and suitability maps; `ensureThermal` runs on the weather system's first tick (state-only, so a
  save is unaffected) and is no longer called from the game layer, so it was not moved into `createNewGame`, which
  has no Sim (decision); a nest the queen dug registers its founding cell and entrance by itself (checked in every
  sweep run: `chambers {founding|royal}` from day 0).
- **`FOUNDING_CELL_STATES`:** `site-search` was removed and put back. The founding module sets `digging` on the
  first bite only after the intro card; nest tests (`freeDig.test`, `nestFixes.verify` check 8) and a queen digging
  during the intro card dig in `site-search`, and lost their founding cell without it.


## 4. The colony-life tool

`tools/sim/life.ts` (helpers `lifeMetrics.ts`, `lifeHealth.ts`, `lifeSummary.ts`), run through
`tools/sim/run-ts.mjs`:

```
node tools/sim/run-ts.mjs tools/sim/life.ts --seed 1 --archetype woodland-edge [--species lasius-niger]
     [--difficulty naturalist] [--days 10 | --until-day 10] [--out DIR] [--workers N --food C,P] [--perf T]
     [--start-day D] [--cache DIR] [--every 500]
node tools/sim/run-ts.mjs tools/sim/lifeSummary.ts DIR [--tables]     # re-judge and tabulate a sweep
```

New game on the generated world (Naturalist, cheats on), the founding to hand-over with `cheat.completeFounding`
(the founding module's own state machine, seal, laying, real-environment time-lapse, hand-over; 3.5 game days in
about 65-80 s), then N game days with no player (`--until-day D`: until game day D counted from the start).
Per game day: population by caste and brood stage, mean larval hunger, the queen's laying potential, C and P stores
and the starvation stage, trips started, deliveries (count, C, P, by source kind), deaths by caste and cause, brood
deaths, eggs laid, eclosions, dig plans created / completed, pellets made / dumped / lying in the player's nest,
nest volume, chambers by type, open entrances, trail cells >= `TRAIL_DETECT`, ants outside, ants per behaviour state
and per task, ants stuck (nav `moving`, less than 1 BU in 3 game minutes, able to move at their body temperature)
and in-nest states past 1.5 x their timeout, action refusals by reason, invariant violations (every 500 ticks), and
ms per tick with the six slowest systems. Output: JSON plus a Markdown table (`--out`), the final `stateHash`, and a
health verdict (`lifeHealth.ts`; the rules are written at the top of that file). `--cache` keeps a snapshot taken at
the hand-over (development only: the sweep runs without it); `--perf T` measures 3 segments of T ticks after a 600
tick warm-up and reports the fastest; `--workers/--food` cheat a colony size for the economy and performance runs.
Per day the tool also lists every stuck ant (task, state, nav mode, where) and the game time the queen could lay
(potential > 0.5 egg/gd and laying protein permitted).

Two health rules were made precise while diagnosing (recorded as rulings; both are stated in `lifeHealth.ts`):
larvae count as starved at two day ends in a row with mean hunger >= 0.8, not at one (a larva that has just hatched
has an empty gut, hunger 1, and is fed within hours: car-park-verge #1, day 5, one larva); and "the queen lays at
least once" applies only when laying was possible for at least 0.25 gd of some day (GDD 02 §3.3: the workers
withhold laying protein from a lean colony; an incipient colony after a late-summer hand-over is lean most of the
time, and GDD 02 §3.1's season factor ends laying in autumn).

**Strict judge (review round).** The reviewer found the judge looser than the task's definition; it now reads:

- *larvae are fed*: no larva of the player colony starves on any day (was: on at most one day), and mean larval
  hunger is not >= 0.8 at two day ends in a row (the hatchling ruling above stays);
- *the population grows along the GDD 02 curve within its tolerance*: workers at the end >= first workers (was
  0.75 x), daily growth <= +30 %, the queen lays when laying was possible, and the brood pipeline follows GDD 02's
  development curve: once the first clutch has had its 3.9 development units (§2.2-2.3, r(T) from the day-end brood
  chamber temperature, which the tool now records; autumn and winter days count 0 because autumn larvae enter
  diapause, §2.8), at least one worker must have eclosed. Ruling: GDD 02 states no tolerance for an incipient colony;
  by its own development model a colony handed over at Summer 5 cannot add a worker before spring, so a literal "the
  worker count rises" can never be met in this window. The verdict therefore also records `netGrowth` (workers at
  the end > first workers), and the sweep table shows it, so the literal reading stays visible;
- *no ant is stuck beyond its state timeout*: any day with a stuck ant (moving, under 1 BU in 3 game minutes) or an
  ant past 1.5 x its in-nest state timeout fails (was: two such days in a row);
- the tool's per-day counters (eggs laid, plans created / completed, pellets dumped) count the player colony only
  (rival colonies lay, plan and dig since Stage 1B; `lifeMetrics.ts`); the `nestVolumeBu3` column divided an
  already-BU³ value by BU³ once more (fixed).

The development cache (`--cache`) file name now carries a hash of the `src/sim`, `src/worldgen` and `src/core`
sources, so a snapshot founded by other code is never restored (sweeps 2-3 had restored sweep 1's hand-overs).


## 5. Colony life on every Tier 1 archetype

Every Tier 1 archetype, seeds 1-3, Lasius, Naturalist, from the default start date (`startDoy` 9 = Summer 2) to game
day 10 (`life.ts --until-day 10`): the founding (3-4.6 gd) plus 5-7 game days of colony life. The hand-over falls on
about Summer 5-6, so from day 2-3 on every run is in autumn.

Three sweeps were run:

- **Sweep 1** (22:45-23:26, `test-output/int1b/sweep/`): fresh founding on the code of that time; its hand-over
  snapshots are the cache the later sweeps restore. Healthy: woodland-edge #1, suburban-garden #1 and #3,
  kitchen-door #1 (suburban-garden #2 crashed on a half-saved file of mine and is not counted).
- **Sweep 2** (`test-output/int1b/sweep2/`): the same hand-overs with the fixes of section 11 up to the unplugging.
- **Sweep 3** (00:32-01:01, `test-output/int1b/sweep3/`, final code): the result below. The founding phase is the
  same as in sweep 1 (restored snapshot, so the founding column shows sweep 1's founding).

**Sweep 4 (review round, 03:52-04:28, `test-output/int1b-fix/sweep4/`, `summary.md`): fresh founding on the final
code of this round, strict judge (section 4). Result: 0 of 15 healthy; acceptance 2 is not met.** The tree now also
holds the weather-effects and human-events work that landed during the round, and it dominates the result:

| archetype | seed | founding (gd, first workers) | workers end | deliveries | eggs | eclosed | net growth | verdict | main failure |
|---|---|---|---|---|---|---|---|---|---|
| woodland-edge | 1 | handover 3.531, 16 | 10 | 21 | 24 | 0 | no | unhealthy | growth: 5 workers drowned |
| woodland-edge | 2 | handover 2.716, 16 | 0 | 32 | 36 | 0 | no | unhealthy | stores, larvae fed, growth: 12 workers and the queen drowned, 4 starved |
| woodland-edge | 3 | failed 0.552 | 0 | 0 | 0 | 0 | no | unhealthy | founding: the queen drowned in her sealed cell |
| suburban-garden | 1 | failed 0.582 | 0 | 0 | 0 | 0 | no | unhealthy | founding (as above) |
| suburban-garden | 2 | handover 2.813, 16 | 15 | 44 | 28 | 0 | no | unhealthy | larvae fed (10 starved), growth |
| suburban-garden | 3 | handover 7.111, 2 | 1 | 0 | 0 | 0 | no | unhealthy | founding: 2 first workers |
| playground-park | 1 | handover 3.899, 10 | 1 | 9 | 10 | 0 | no | unhealthy | growth: 9 workers and the queen drowned |
| playground-park | 2 | handover 2.816, 15 | 5 | 8 | 46 | 0 | no | unhealthy | stores, larvae fed; 52 invariant violations: creatures 8005-8010 outside the map limit (x = 15968.00003) |
| playground-park | 3 | failed 2.529 | 0 | 0 | 0 | 0 | no | unhealthy | founding: seal never completes (L1, as in sweep 3) |
| car-park-verge | 1 | failed 0.590 | 0 | 0 | 0 | 0 | no | unhealthy | founding: drowned |
| car-park-verge | 2 | failed 2.429 | 0 | 0 | 0 | 0 | no | unhealthy | founding: seal (L1) |
| car-park-verge | 3 | failed 0.577 | 0 | 0 | 0 | 0 | no | unhealthy | founding: drowned |
| kitchen-door | 1 | failed 0.567 | 0 | 0 | 0 | 0 | no | unhealthy | founding: drowned |
| kitchen-door | 2 | handover 2.826, 15 | 2 | 43 | 46 | 0 | no | unhealthy | larvae fed, growth: 13 workers and the queen drowned |
| kitchen-door | 3 | failed 0.564 | 0 | 0 | 0 | 0 | no | unhealthy | founding: drowned |

Deaths by cause over the sweep: drowning 49 (4 queens in colony life, 6 founding queens), starvation 9, old age 2,
crushed 1, lost 1. Diagnosis of the drownings (`test-output/int1b-fix/fprobe.ts 3 woodland-edge`): the founding
queen dies `drowning` at tick 3,311, 0.55 gd into the game, in her sealed cell, with the weather `overcast` and
`precip` 0; identical with every file of this review round reverted to HEAD. The cause is the nest flood model that
landed during the round (`src/sim/nest/flood/**`, weather-effects): L12. Sweep 3's data (before that work)
re-judged with the strict judge gives 1 of 15 (suburban-garden #3). Neither result says anything new about this
gate's own modules; the economy, seal and stall-site diagnoses below remain the open causes once the flooding is
fixed. The creatures outside the map limit are the creatures module's (L12).

**Sweep 3 result (before the review round, lenient judge): 5 of 15 healthy; only woodland-edge reaches 2 of 3.
Acceptance 2 is not met.** Two of the ten unhealthy
runs are founding failures (founding-close's seal), one fails only on the founding worker count, and the rest are
the economy of an incipient colony entering autumn with an empty pool, plus locomotion stall sites (section 12, L10).

| archetype | seed | hand-over (gd, workers) | verdict | failed checks | workers end | deliveries | eggs | chambers end | ms/tick | stateHash |
|---|---|---|---|---|---|---|---|---|---|---|
| woodland-edge | 1 | handover 3.531, 16 | healthy | - | 16 | 24 | 6 | royal 1, nursery 1 | 3.402 | 572e35f0 |
| woodland-edge | 2 | handover 2.716, 16 | UNHEALTHY | foraging, stores, larvae fed, growth | 7 | 11 | 73 | royal 1, nursery 1 | 4.617 | f875d569 |
| woodland-edge | 3 | handover 3.972, 11 | healthy | - | 10 | 57 | 16 | royal 1, nursery 1, food 1 | 3.164 | d00b8fd4 |
| suburban-garden | 1 | handover 3.925, 14 | UNHEALTHY | stuck | 13 | 25 | 20 | royal 1, nursery 1, food 1 | 2.707 | 2b67834d |
| suburban-garden | 2 | handover 2.813, 16 | UNHEALTHY | stores | 15 | 41 | 21 | royal 1, nursery 1 | 3.457 | ac81f65e |
| suburban-garden | 3 | handover 4.583, 9 | healthy | - | 9 | 5 | 4 | royal 1, nursery 1 | 3.476 | c81f9f37 |
| playground-park | 1 | handover 3.899, 10 | healthy | - | 10 | 11 | 13 | royal 1, nursery 1 | 2.832 | 9b0a3a6f |
| playground-park | 2 | handover 2.816, 15 | UNHEALTHY | stores, stuck | 14 | 31 | 6 | royal 1, nursery 1 | 3.374 | c9b7c153 |
| playground-park | 3 | failed 2.529, 0 | UNHEALTHY | founding, foraging | 0 | 0 | 0 | founding 1 | 2.365 | 495e82cb |
| car-park-verge | 1 | handover 3.591, 13 | UNHEALTHY | stores | 13 | 17 | 3 | royal 1, nursery 1 | 2.762 | 6b615a52 |
| car-park-verge | 2 | failed 2.429, 0 | UNHEALTHY | founding, foraging | 0 | 0 | 0 | founding 1 | 4.885 | 27714fc7 |
| car-park-verge | 3 | handover 4.34, 9 | UNHEALTHY | foraging, stores | 8 | 2 | 0 | royal 1, nursery 1 | 2.95 | 29967b62 |
| kitchen-door | 1 | handover 3.484, 15 | healthy | - | 15 | 18 | 24 | royal 1, nursery 1, food 1 | 2.431 | 2322b2ef |
| kitchen-door | 2 | handover 2.826, 15 | UNHEALTHY | larvae fed | 15 | 58 | 51 | royal 1, nursery 1 | 2.534 | f7b80353 |
| kitchen-door | 3 | handover 4.568, 7 | UNHEALTHY | founding, stores, stuck | 7 | 9 | 3 | founding 1 | 2.246 | 85768e61 |

**woodland-edge #1** per day (row 0 = the hand-over; days are game days from the start of the game):

| day | season | workers | eggs/larvae/pupae | C | P | stage | trips | deliveries (C/P) | eggs laid | eclosed | chambers | pellets in nest | trail cells | outside | stuck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | summer | 16 | 0/0/0 | 0 | 0 | rationing | 0 | 0 (0/0) | 0 | 0 | founding 1 | 0 | 0 | 0 | 0 |
| 1 | summer | 16 | 0/0/0 | 0.956 | 0 | brood-sacrifice | 6 | 5 (2.49/0) | 0 | 0 | royal 1, nursery 1 | 46 | 34 | 5 | 0 |
| 2 | autumn | 16 | 0/0/0 | 1.693 | 0.497 | fed | 4 | 6 (2.73/0.6) | 0 | 0 | royal 1, nursery 1 | 9 | 117 | 4 | 0 |
| 3 | autumn | 16 | 2/0/0 | 0.935 | 0.897 | lean | 2 | 5 (2.14/0.5) | 4 | 0 | royal 1, nursery 1 | 0 | 83 | 1 | 0 |
| 4 | autumn | 16 | 2/0/0 | 0.341 | 1.297 | lean | 2 | 3 (0.64/0.5) | 0 | 0 | royal 1, nursery 1 | 0 | 39 | 1 | 0 |
| 5 | autumn | 16 | 4/0/0 | 0.774 | 1.297 | fed | 1 | 3 (1.68/0) | 2 | 0 | royal 1, nursery 1 | 0 | 36 | 1 | 0 |
| 6 | autumn | 16 | 3/1/0 | 1.207 | 0.765 | fed | 2 | 2 (1.11/0) | 0 | 0 | royal 1, nursery 1 | 0 | 40 | 0 | 1 |

**suburban-garden #3** per day (row 0 = the hand-over; days are game days from the start of the game):

| day | season | workers | eggs/larvae/pupae | C | P | stage | trips | deliveries (C/P) | eggs laid | eclosed | chambers | pellets in nest | trail cells | outside | stuck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | summer | 9 | 0/0/0 | 0 | 0 | rationing | 0 | 0 (0/0) | 0 | 0 | royal 1 | 0 | 0 | 0 | 0 |
| 1 | autumn | 9 | 0/0/0 | 0.303 | 0 | rationing | 10 | 1 (0.7/0.05) | 0 | 0 | royal 1 | 73 | 20 | 2 | 0 |
| 2 | autumn | 9 | 3/0/0 | 0.235 | 0.547 | lean | 1 | 1 (0.7/0.05) | 3 | 0 | royal 1, nursery 1 | 25 | 13 | 3 | 0 |
| 3 | autumn | 9 | 2/0/0 | 0.079 | 0.547 | lean | 2 | 0 (0/0) | 0 | 0 | royal 1, nursery 1 | 3 | 5 | 4 | 0 |
| 4 | autumn | 9 | 2/0/0 | 0.438 | 0.904 | lean | 5 | 3 (1.01/0.05) | 1 | 0 | royal 1, nursery 1 | 3 | 19 | 2 | 0 |
| 5 | autumn | 9 | 1/0/0 | 0.264 | 0.904 | lean | 1 | 0 (0/0) | 0 | 0 | royal 1, nursery 1 | 3 | 8 | 1 | 0 |

**playground-park #1** per day (row 0 = the hand-over; days are game days from the start of the game):

| day | season | workers | eggs/larvae/pupae | C | P | stage | trips | deliveries (C/P) | eggs laid | eclosed | chambers | pellets in nest | trail cells | outside | stuck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | summer | 10 | 0/0/0 | 0 | 0 | rationing | 0 | 0 (0/0) | 0 | 0 | founding 1 | 0 | 0 | 0 | 0 |
| 1 | summer | 10 | 4/0/0 | 0.667 | 0.947 | lean | 1 | 4 (1.43/1.2) | 4 | 0 | royal 1 | 67 | 5 | 2 | 0 |
| 2 | autumn | 10 | 8/0/0 | 0.212 | 0.638 | lean | 1 | 2 (0.99/0.05) | 4 | 0 | royal 1, nursery 1 | 34 | 3 | 2 | 0 |
| 3 | autumn | 10 | 10/0/0 | 0.541 | 0.738 | lean | 2 | 3 (1.47/0.1) | 4 | 0 | royal 1, nursery 1 | 0 | 10 | 3 | 0 |
| 4 | autumn | 10 | 10/0/0 | 0.338 | 0.713 | lean | 0 | 1 (0.7/0.05) | 1 | 0 | royal 1, nursery 1 | 0 | 7 | 1 | 0 |
| 5 | autumn | 10 | 10/0/0 | 0.433 | 0.763 | lean | 1 | 1 (0.7/0.05) | 0 | 0 | royal 1, nursery 1 | 0 | 17 | 1 | 1 |
| 6 | autumn | 10 | 9/0/0 | 0.171 | 0.763 | lean | 0 | 0 (0/0) | 0 | 0 | royal 1, nursery 1 | 0 | 13 | 0 | 0 |

**car-park-verge #1** per day (row 0 = the hand-over; days are game days from the start of the game):

| day | season | workers | eggs/larvae/pupae | C | P | stage | trips | deliveries (C/P) | eggs laid | eclosed | chambers | pellets in nest | trail cells | outside | stuck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | summer | 13 | 0/0/0 | 0 | 0 | rationing | 0 | 0 (0/0) | 0 | 0 | founding 1 | 0 | 0 | 0 | 0 |
| 1 | summer | 13 | 0/0/0 | 0 | 0 | brood-sacrifice | 4 | 1 (0.5/0) | 0 | 0 | royal 1, nursery 1 | 52 | 13 | 1 | 0 |
| 2 | autumn | 13 | 0/0/0 | 1.5 | 0 | brood-sacrifice | 10 | 4 (2.21/0) | 0 | 0 | royal 1, nursery 1 | 4 | 49 | 3 | 0 |
| 3 | autumn | 13 | 3/0/0 | 0.387 | 1.312 | lean | 3 | 6 (1.4/1.6) | 3 | 0 | royal 1, nursery 1 | 1 | 34 | 2 | 0 |
| 4 | autumn | 13 | 3/0/0 | 1.021 | 1.312 | fed | 3 | 3 (1.65/0) | 0 | 0 | royal 1, nursery 1 | 0 | 28 | 0 | 0 |
| 5 | autumn | 13 | 3/0/0 | 0.42 | 1.312 | lean | 1 | 2 (0.62/0) | 0 | 0 | royal 1, nursery 1 | 0 | 26 | 1 | 0 |
| 6 | autumn | 13 | 3/0/0 | 0.028 | 1.812 | lean | 0 | 1 (0.2/0.6) | 0 | 0 | royal 1, nursery 1 | 0 | 22 | 0 | 0 |

**kitchen-door #1** per day (row 0 = the hand-over; days are game days from the start of the game):

| day | season | workers | eggs/larvae/pupae | C | P | stage | trips | deliveries (C/P) | eggs laid | eclosed | chambers | pellets in nest | trail cells | outside | stuck |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | summer | 15 | 0/0/0 | 0 | 0 | rationing | 0 | 0 (0/0) | 0 | 0 | royal 1 | 0 | 0 | 0 | 0 |
| 1 | summer | 15 | 0/0/0 | 0 | 0 | brood-sacrifice | 3 | 0 (0/0) | 0 | 0 | royal 1, nursery 1 | 48 | 0 | 2 | 0 |
| 2 | autumn | 15 | 16/0/0 | 0.002 | 2.25 | rationing | 9 | 10 (0.14/3.62) | 16 | 0 | royal 1, nursery 1 | 42 | 7 | 6 | 1 |
| 3 | autumn | 15 | 23/0/0 | 0.3 | 2.94 | lean | 2 | 3 (1.61/0.01) | 7 | 0 | royal 1, nursery 1, food 1 | 18 | 10 | 2 | 0 |
| 4 | autumn | 15 | 19/3/0 | 0 | 2.02 | rationing | 2 | 1 (0.08/0.0) | 1 | 0 | royal 1, nursery 1, food 1 | 2 | 14 | 4 | 2 |
| 5 | autumn | 15 | 12/5/0 | 0 | 0.971 | rationing | 1 | 2 (0.58/0.05) | 0 | 0 | royal 1, nursery 1, food 1 | 1 | 12 | 4 | 0 |
| 6 | autumn | 15 | 5/2/0 | 0 | 0.957 | rationing | 0 | 2 (0.08/0.0) | 0 | 0 | royal 1, nursery 1, food 1 | 1 | 7 | 3 | 0 |


**Diagnosis of every unhealthy seed** (sweep 3 unless noted; the probes are `test-output/int1b/*.ts`):

| Run | Failed checks | Root cause | Status |
|---|---|---|---|
| woodland-edge #2 | foraging, stores, larvae fed, growth | **No carbohydrate found.** Nearest flowers 942-1095 BU, honeydew films 229-541 BU, starch crumbs 194-257 BU; carrion 48-104 BU. The colony's 2 scouts (GDD 02 §6.2 at N = 16: max(1, 0.32) + 0.8 = 1.8, cap 2.4) explored to 266 BU in 30 game hours without reaching a carbohydrate source (`fooddist.ts`); the pool held no C from the hand-over on, S4 from day 2, 31 larvae starved. The world meets the populate guarantee (>= 2 carbohydrate sources within 400 BU); the scouting capacity of a 16-worker colony does not find them in time. | open: economy (section 6, L2) |
| woodland-edge #3 | (sweep 1: foraging, growth) | **Workers trapped outside** a `reopening` entrance: all 11 at the mouth with nav `failed/seek` for 16 h, workers dying `lost`. Home trips and the nest flow field used only `open` entrances. | **fixed** (home entrance fallback); healthy in sweeps 2 and 3 |
| suburban-garden #1 | stuck | A returning scout stuck on the surface at (2664, 6.1, 2153) BU, nav `path`, for more than a game day; three idle ants stalled in one spot of the nest on day 5. Locomotion stall sites (no behaviour can move the walker). | open: locomotion (L10) |
| suburban-garden #2 | stores | S3/S4 from day 4: 13-15 deliveries a day on days 3-4, then none on days 5-7 (trips 7, 5, 1): autumn activity with an empty pool. | open: economy |
| playground-park #2 | stores, stuck | S4 on days 4-7 **with 5.7-8.3 C in store** but P 0: the S2-S4 exit needs C > 0.5 and P > 0.1 together (GDD 02 §5.7) and protein deliveries were 0.2-0.6 a day; from day 5 no trips (autumn). Stuck: three different ants at the entrance mouth (886, -3.5, 360) on days 4-6. In sweep 1 the same colony laid no egg in a 0.55 gd laying window: the queen's gut was kept full of C (fixed, section 11). | partly fixed; economy and a locomotion site open |
| playground-park #3 | founding | The seal never completes (cell `sealed` at tick 184, back to `ready` at 185); the queen dies of desiccation at 2.5 gd. | open: founding-close (L1) |
| car-park-verge #1 | stores | S3 at the first two day ends (the pool is empty at the hand-over by design), then fed / lean. Fails only the two-day S3 rule. | not a defect of its own: hand-over economy |
| car-park-verge #2 | founding | The seal never completes; desiccation at 2.4 gd. | open: founding-close (L1) |
| car-park-verge #3 | foraging, stores | Sweep 1: the reopened throat kept 211 plug voxels (`reopening` all run), haulers walked at pellets buried in the plug, a forager stuck on a flower head. Sweep 3: those are gone, but 0-2 deliveries a day: a flower 8 BU from the nest is found 12 game hours after the hand-over, but in autumn the surface activity is 0.01-0.3 most of the day (`scouttrace.ts`). | plug and buried pellets **fixed**; economy open |
| kitchen-door #2 | larvae fed | 13 larvae starved over 3 days (pool 0-0.5 C), everything else healthy. | open: economy |
| kitchen-door #3 | founding, stores, stuck | 7 first workers (expected 8-16, founding-close), S3 for 3 days, one hauler stuck for 3 days in the nest at (2007, -6.0, 1302), nav `field` (in-nest stall site). | open: founding-close, locomotion |

What changed between the sweeps because of the fixes: woodland-edge #3 unhealthy -> healthy (home fallback);
car-park-verge #3 lost its plug, buried-pellet and stuck failures; playground-park #1 unhealthy -> healthy (growth:
the laying-window rule and the queen gut fix); the incipient-colony runs move between healthy and unhealthy from one
code change to the next (suburban-garden #1 healthy in sweep 1, stuck in sweep 3): their margin is a fraction of a
load of food per day.

## 6. Economy check

Method: woodland-edge #1, the founding to hand-over (summer start, `--start-day 1`, hand-over at about Summer 4.5),
then `cheat.spawnAnts` adds N workers (age 4 gd) and the colony runs two summer game days; figures are game day 2
(day 1 carries the spawn transient). Two set-ups: **empty stores** (C 1, P 1: the colony forages for its need, the
case C13 budgets) and **stocked** (C N/2, P N/4: above the stock target). `test-output/int1b/economy2/` and
`economy/`; numbers from the `life.ts` JSON (need = the colony's need-rate EMAs, GDD 02 §5.5).

| Workers (spawned + first) | need C / P (loads/gd) | intake C / P (day 2) | trips / deliveries | foragers + scouts | eggs laid / potential at day end | yield per forager (EMA) | stage |
|---|---|---|---|---|---|---|---|
| 20 + 16 | 4.75 / 6.67 | 5.4 / 3.4 | 12 / 14 | 18 + 1 | 11 / 8.1 | 1.20 | lean |
| 100 + 16 | 8.54 / 1.64 | 9.3 / 3.1 | 39 / 21 | 48 + 2 | 13 / 13.6 | 0.50 (floor) | lean |
| 300 + 16 | 22.1 / 4.07 | 25.7 / 7.2 | 69 / 65 | 28 + 15 | 40 / 17.7 | 1.06 | lean |
| 300 + 16, stocked (C 150, P 75) | 21.5 / 8.7 | 8.6 / 1.3 | 19 / 25 | 60 + 6 | 42 / 19.4 | 0.50 | fed |

Against `00-index.md` C13 and GDD 02:

- **Intake tracks need at 100-300 workers** (C 1.1-1.2 x need, P 1.8-1.9 x the current P need): the colony feeds
  itself on Tier 1 summer food, as C13 says for N = 300 ("feeds itself; protein-limited"). The current need is
  below C13's "full need" (57 C / 77 P at N = 300) because C13 counts a steady-state brood of 74 eggs/gd; two days
  after the spawn the brood is 67 eggs and 9 larvae.
- **Laying is protein-limited**, the designed Lasius bottleneck: 40 eggs/gd at N = 300 with the workers withholding
  laying protein while the colony is `lean` (C13: 15-25 eggs/gd at N = 50 in T2, slower in T1).
- **A stocked colony forages little** (stocked row): with stores above the target, need ~ 0 and departures fall to
  the spontaneous rate, 1/240 s x 0.25 x fEnv 0.59 = 0.37 per waiting forager per game day, measured 0.3-0.45. This
  is the GDD 02 §6.5-6.6 design (stores full -> need 0), not a fault.
- **Deviation recorded (C13 vs GDD 02 §6.6):** C13's trip budget assumes "about 25 s waiting for activation", which
  GDD 02 §6.6 itself gives only while successful returns are frequent (one per ~17 s); below that "departures fall to
  the spontaneous rate (mean wait ~330 s at moderate need)". An incipient colony (7-16 workers) is always in that
  regime: 0.5-1.5 trips per forager per game day in the sweep, against C13's 2.0. The measured mean surface activity
  over two summer days is 0.597 (C13 assumes 0.6), so the environment is as budgeted.
- **N = 20 (36 workers) is outside the C13 table** and is the case that fails in section 5: P intake 3.4 against a
  P need of 6.7 with the brood growing, C barely covered; in autumn (activity falls, flowers end) it collapses.

No balance value was changed for the economy: where C13 applies (100-300 workers, summer) the model meets it. The
incipient-colony gap is recorded for the Stage 2 balance pass (L2): candidate levers are the founding hand-over
(founding-close: start date, a fed pool at the hand-over), the scout share at small N, and overwintering.

## 7. Player in the loop

`src/sim/testing/gate1b/player.test.ts` (4 tests, about 10 s, all green):

- A possessed worker is teleported beside a real sugar spill, drinks with `harvest-liquid` (real source, crop
  filled), walks home by player intent (direction held toward the entrance until within 2 BU), is teleported into
  the food chamber (steering a tunnel by intent is the application's camera-relative input) and unloads with
  `unload-crop`: the colony C store rises by more than half the crop.
- Directives: the same 30-worker colony and source with allocation forage 70 % against forage 5 % / nurse 75 %:
  more departures and at least as many deliveries in 1/6 gd; `stayIn` holds every departure.
- `setAutoExpand off` -> no plan created and no architect proposal in 3000 ticks with 40 workers; `auto` -> at
  least one.
- Markers: forage/avoid marker responses are covered by beh-forage's `markers.test.ts` and the reviewer tests
  (green in the ants folder); the dig-plan marker path is the nest's `planDig` command (nest folder green).
- Not testable as written: "brood production off -> no new eggs". No such directive exists in the design any more:
  GDD 02 §12.1 replaced `production` by `alateInvestment` (0 keeps all eggs workers), and laying is never switched
  off by a directive. Recorded as a spec/design difference.


## 8. Robustness

- **Mid-life save / restore.** `gate1b/midlife.test.ts`: a 40-worker foraging colony (the beh-forage scenario world)
  saved at tick 3000 with a trail laid, foragers outside, loads in crops and on mandibles, a dig plan in progress and
  brood being fed (the test asserts each of these is present at the save), restored into a new Sim and run 1,200
  ticks more: identical `stateHash` to the uninterrupted run (green, see section 1); `sim.test.ts` restore-at-N green (item 1). The colony-life tool restores
  every sweep-2/3 run from a hand-over snapshot taken in another process; those runs complete normally.
- **300-worker soak, generated world** (`life.ts --seed 1 --archetype woodland-edge --workers 300 --food 300,150
  --days 5`, `test-output/int1b/soak/`): 316 workers for 5 game days (30,000 ticks), every invariant checked every 500
  ticks (60 checks): **0 violations**. 8.5 ms per tick on average; 307 workers at the end (9 deaths: old age of the
  aged spawn); stores 274 -> 235 C, 128 -> 82 P; 1-8 of 316 ants stuck per day (stall sites, section 12).
  The scenario version (`gate1b/soak.long.test.ts`, `FOUNDRESS_LONG=1`: 300 workers, three sources, 30 larvae,
  5 game days, invariants every 500 ticks) also passes: 0 violations (`test-output/int1b/soak/soak.long.log`).
- **Determinism across processes.** woodland-edge #1 from its hand-over snapshot to game day 10 in two separate node
  processes (sweep 3 at 00:32 and a re-run at 01:22): final `stateHash` 572e35f0 both times. (The re-run also
  carried the combat presence skip of section 9, which is therefore behaviour-neutral on that run.) Same seed, same
  command, same hash, also between sweep 1 runs and the snapshot: the snapshot is the state those runs had.

## 9. Performance

`life.ts --perf 300 --workers N --food N/2,N/4 --start-day 1` on woodland-edge #1 (hand-over snapshot, N workers
spawned at the hand-over), 600 ticks warm-up, then 3 segments of 300 ticks; per system the minimum segment mean,
ms per tick. Machine load average 6.5-9.9 during the runs (4 cores shared with other agents), so these are upper
bounds. Runs 1-2 before and run 3 after the combat fix below; the table is run 3.

| System | 300 (+16) | 800 (+16) | 1,500 (+16) | Budget (source) | Verdict |
|---|---|---|---|---|---|
| **whole tick** | **5.93** | **13.18** | **24.10** | **4 ms per frame at 1x with 1,000 ants** (docs/03-architecture.md §6, the binding budget the task names; at 1x a frame holds at most one tick) | **over at every size** (about 16-17 ms interpolated at 1,000). GDD 06's 10 ms `SIM_FRAME_BUDGET_MS` is the game loop's speed step-down threshold, not the simulation budget; the first version of this report judged against it by mistake (review round) |
| locomotion | 2.54 | 7.78 | 15.70 | none of its own | dominant; see the crowding note |
| behaviours (all) | 0.59 | 1.19 | 1.61 | in-nest 1.5 ms at 800 (Addendum) | **meets** at 800 |
| perception | 0.42 | 0.68 | 0.92 | (part of the outdoor 1.2 ms) | - |
| combat | 0.33 | 0.81 | 1.59 | none | was 1.18 / 6.78 / 21.89 (fixed) |
| nest | 0.24 | 0.49 | 0.34 | GDD 03 §16 per-operation budgets | mean fine; spikes, see below |
| pheromones | 0.24 | 0.30 | 0.31 | GDD 02 App F (4 ms per frame for colony systems at 1,000 ants) | meets |
| actions | 0.17 | 0.28 | 0.37 | - | - |
| economy + allocation + brood + queen + task-reeval | 0.12 | 0.29 | 0.43 | 4 ms per frame at 1,000 ants (GDD 02 App F item 10) | **meets** |
| creatures + director | 0.20 | 0.27 | 0.24 | - | - |
| ant-thermal | 0.07 | 0.15 | 0.25 | - | - |
| ants outside | 34 | 79 | 141 | outdoor 1.2 ms at 500 outdoor ants (Addendum) | not reached in these runs (at most 141 ants outside). At the design point the existing `ants/behaviours/outdoor/determinism.perf.test.ts` (FOUNDRESS_LONG, 500 outdoor-task ants) measured 1.50 ms minimum (reviewer, load about 5): **over**; the Addendum's "profile and fix the top two costs" is not done (open, section 17) |

- **Combat fixed:** 22 ms of the 44 ms tick at 1,500 workers was the encounter scan (`combat/recruit.ts`): every
  fighter-capable ant queried its recognition radius every 5 ticks and walked all neighbours, i.e. all nestmates in
  a crowded nest. A per-tick plan-view presence grid of each colony's ants now skips the scan when no other colony's
  ant can be in range; the loop only ever acted on other colonies' ants, so the result is unchanged (cross-process
  hash identical, combat folder green). Combat 21.9 -> 1.6 ms, whole tick 43.8 -> 24.1 ms at 1,500.
- **Crowding note:** the cheat puts 1,375 ants into a 2-3 chamber founding nest, so every neighbour query in
  locomotion (separation, `queryRadius`) returns hundreds of ants; locomotion's 15.7 ms at 1,500 is a worst case. A
  grown nest of 1,500 has dozens of chambers.
- **Nest spikes** (`test-output/int1b/nestspike.ts`, woodland-edge #1, one game day): `tampDuePellets` takes 1.3-1.6 s
  in single ticks every 3,000 ticks (the passage-rule retries of pellets that do not fit, all due on the same tick);
  `checkEntrances` 50-200 ms in some ticks (the entrance memo is defeated while mound relaxation changes the pile
  cells over the throat). In the colony-life sweep the nest system's per-day maximum was 0.7-2 s. **Tamp fixed in the
  review round** (section 17): retries are phase-shifted by item id across the retry period and a refused pellet
  whose inputs did not change is not re-tried; the same probe now shows no tamp tick above 53 ms (from 1.3-1.6 s),
  and in steady state 67 of 69 due retries are skipped. Still open (L11): `checkEntrances` 50-95 ms in some ticks.
- Earlier measurement (before the entrance memo, section 3): the nest system was 2.7 ms per tick for 16 workers with
  4.6 s single-tick spikes; after it about 1 ms.

## 10. Balance changes

Every value changed (old -> new), all in `src/sim/balance/**`:

| Constant | File | Old -> new | Evidence |
|---|---|---|---|
| `PROGRESSION_STATS_OFFSET` | progression.ts | 130 -> 131 | collided with `environment-effects` (every 50, offset 30) on tick 120 mod 250; 131 is the first free offset after colony-stats (`commands.robust` stagger test) |
| `TEND_DEMAND_ADAPTER` | ecology.ts | true -> false | the colony allocation computes `tend` (Addendum 3 item 8) |
| `HEALTH_REGEN_IN_NEST` (new) | colony.ts | 0.25 / gd | GDD 05 §4.7 (was the colony's 0.2 everywhere, plus combat's top-up to 0.25 in the nest) |
| `HEALTH_REGEN_ELSEWHERE` (new) | colony.ts | 0.1 / gd | GDD 05 §4.7 (was 0.2 outside) |
| `HUNGER_RETURN_POOL_MIN_C` (new) | foraging.ts | 0.1 loads | an incipient colony with an empty pool could never scout (section 3) |
| `FOUNDING_CELL_STATES` | nest.ts | unchanged after a revert | see section 3 |
| `ITEM_BURIED_BU` (new) | nest.ts | 0.3 BU | items deeper than this inside solid soil are buried: no haul job, absorbed when tamped (section 5, car-park-verge #3) |
| `UNPLUG_DIGGERS_MAX` (new) | nestwork.ts | 2 | diggers unplugging one `reopening`/`sealing` throat at a time (section 5) |
| `UNPLUG_STAND_BU` (new) | nestwork.ts | 1.5 BU | the unplugging digger's stand point inside the opening |
| `UNPLUG_RETRY_S` (new) | nestwork.ts | 60 s | back-off after a failed unplug attempt |
| `STATE_TIMEOUT_S['dig.unplug']` (new key) | nestwork.ts | 240 s | timeout of the new `dig.unplug` state (as `dig.stow`) |
| `STARVE_ALERT_GRACE_GD` (new) | colony.ts | 1.0 gd | stores alerts wait this long after the founding hand-over (Addendum 5 request 1) |
| `IDLE_STILL_BU` (new) | nestwork.ts | 0.25 BU | an idle ant that did not move over a whole idle cycle walks back to the room centre on a planned path |
| `BURIED_LIFT_BU` (new, review round) | nest.ts | 2 BU | how far up a pellet buried under tamping fill is searched for the risen floor (section 17) |
| `PRESENCE_CELL_BU`, `PRESENCE_MARGIN_BU`, `PRESENCE_MAX_COLONIES` (moved, review round) | combat.ts | 8 BU, 2 BU, 30 (unchanged values) | were inline in `combat/recruit.ts` |

No other balance value was changed; the economy check (section 6) recommends none beyond these.


## 11. Defects fixed

| Defect | File(s) | Cause | Fix |
|---|---|---|---|
| Restored game diverged on its first tick | `locomotion/system.ts`, `services.ts`, `types/world.ts` | carve-change trigger was a runtime counter (-1 after a load) | persisted `carveChangedTick` |
| Two periodic systems on one tick | `balance/progression.ts`, `ecology/index.ts` | offsets 130 / 30 coincide every 250 ticks; the tend stop-gap ran at the allocation tick | offset 131; stop-gap removed |
| Clock / `window` in sim code | `ants/testing/costTable.ts`, `locomotion/update.ts` | measurement helper read `performance.now`; local named `window` | injected clock; rename |
| Content-limited wood nester regenerated 8 times | `worldgen/validate/checks.ts`, `maps/start.ts` | v-start never set `regenerate: false` | content-bound failure goes straight to repair |
| Tend demand from a plants-side adapter | `colony/allocation/demand.ts` | colony allocation did not compute `tend` | `herdTendDemand` in `computeDemand` |
| Badly hurt fleeing ant went idle | `ants/behaviours/outdoor/fleeTask.ts` | always handed back `idle` | `rest` below 0.25 health |
| Combat patched the action table at run time | `ants/actions/defs/combat.ts`, `ports.ts`, `combat/*` | no native dodge / sting shells; bite cue fixed; no attacker id | native shells, permissions via ports |
| Possessed ant twitched when pinned | `locomotion/possessed.ts`, `system.ts`, `runtime.ts` | per-frame predictor ignored movement overrides | hold the tick pose when an override moved it |
| Health regeneration 0.2/gd everywhere | `colony/physiology.ts`, `balance/colony.ts`, `combat/injuries.ts` | GDD 05 §4.7 split not applied | 0.25 in nest with crop C, 0.1 elsewhere |
| Reserve feed of the queen ungated in colony code | `colony/queen.ts` | only the ants-side primitive checked the stage | stage check inside `feedQueenFromReserve` |
| Founding reopen never dug | `nest/plans/validate.ts`, `targets.ts` | shaft overshoot into a leaf over the opening counted as non-diggable | surface objects above ground are not targets |
| No ground ant could smell a flower | `ants/perception/sense.ts` | 3D odour distance to a flower head 14-31 BU up | plan-view odour for raised sources |
| Incipient colony could never scout | `ants/behaviours/outdoor/engine.ts`, `balance/foraging.ts` | hungry return with an empty pool ended every trip at the entrance | hungry return only while the pool can feed |
| Nest system ~40 % of a small colony's tick | `nest/entrances.ts`, `nest/flags.ts`, `world/field.ts` | throat BFS for every entrance every 10 ticks | memo on input versions + pile fingerprint |
| Stale nest-volume cache after a nest grew | `nest/chambers/upkeep.ts`, `nest/runtime.ts` | per-chunk cache clipped to the old box | cache dropped when the box changes |
| Overlapping piles summed in publish order | `world/field.ts` | restored games register overlays in state order | overlays kept in id order |
| Workers outside a `reopening` entrance could never get home (woodland-edge #3: all 11 workers at the mouth for days) | `locomotion/nests.ts`, `locomotion/runtime.ts` | home trips and the nest flow field seeded only `open` entrances; a throat dug through but still narrower than NAV_CLEAR is `reopening` | `homeEntranceStatus`: with no `open` entrance, walkers head for a `reopening` (else `sealing`) one; exits unchanged (GDD 03 §4.2 D_exit) |
| A reopened entrance stayed narrow for good (car-park-verge #3: 211 plug voxels left, `reopening` all run) | `ants/behaviours/nest/dig.ts`, `ants/actions/defs/dig.ts`, `nest/entrances.ts`, `colony/allocation/demand.ts` | no behaviour ran `unseal-entrance`, and the action refused `reopening` throats | new `dig.unplug` state (GDD 03 §4.2 "plug being dug", §13 "nanitics dig it"): up to 2 diggers bite the plug until the entrance is `open`; `entranceToUnplug` query (never while a `seal` plan or a `seal-entrance` runs); one digger of dig demand per such entrance |
| Haulers walked at buried pellets for days (car-park-verge #3: pellets inside the founding plug, carve sample 0, 0.5 BU deep) | `ants/behaviours/nest/places.ts`, `nest/tamp.ts` | `onSurface` accepted any point inside solid; tamping found no floor for a buried pellet | buried items are no haul job; a pellet buried in a plug is absorbed when it is tamped; one buried under tamping fill (LOOSE) rides up onto the risen floor (review round, section 17) |
| Idle ants stood at one spot for days with nav `moving` (woodland-edge #1) | `ants/behaviours/nest/idle.ts` | each idle cycle re-issued a wander from a spot where locomotion cannot move the walker | after a cycle without movement the ant walks back to the room centre on a planned path (the spot itself is a locomotion stall, section 12) |
| The queen's gut was kept full of carbohydrate, so permitted laying protein did not fit (playground-park #2, sweep 1: no egg in a 0.55 gd laying window; the carers fed 0 P for a whole day) | `colony/stores.ts` | `feedFromCrop` filled the queen's gut in the crop's C:P mix whatever she held | past the GDD 02 §3.3 retinue C target (0.3) the queen takes only protein |
| An entrance the first workers dug open flipped back to `sealing` on its next check (plug remnants in the throat sphere), raising `midden-blocked` with a passable throat (founding `alarms.test`) | `nest/entrances.ts` | `open -> sealing` on any plug voxel in the throat | GDD 03 §4.2 "first plug added": only when the plug count grows |
| Combat encounter scan 22 ms per tick at 1,500 workers | `combat/recruit.ts` | every scan walked all neighbours (all nestmates in a crowded nest) | per-tick colony presence grid; scan skipped when no other colony is in range (result unchanged) |
| Stale test expectations | `types/d7.test.ts`, `ecology/plants/testkit.ts`, `testing/stubs.test.ts`, `behaviourRunner.test.ts` | start day 9, literal season lengths, real combat/progression, more behaviours | updated, no assertion weakened beyond the stated rulings |


## 12. Defects left (with reproduction)

Each with the owner it belongs to and how to reproduce it.

| # | Defect | Owner | Reproduction and what is known |
|---|---|---|---|
| L1 | **Founding never seals on two worlds** (playground-park #3, car-park-verge #2): the queen digs the template, the opening sits in `seal` with the founding cell `ready`; on playground-park #3 the cell went `sealed` at tick 184 and back to `ready` at 185, on car-park-verge #2 it never sealed; the queen dies of `desiccation` after 2.4-2.5 gd (`opening.failed` cause `desiccation`). | founding-close (fc1 leak-driven sealing is in progress on the seal) | `node tools/sim/run-ts.mjs tools/sim/life.ts --seed 3 --archetype playground-park` (or `--seed 2 --archetype car-park-verge`): "founding failed after 2.5 gd, 0 workers". |
| L2 | **Incipient colonies run short of food in autumn** (7-16 workers, an empty pool at the hand-over, low surface activity, carbohydrate or protein not found in time; sections 5 and 6): see the per-run diagnoses there. | balance / Stage 2 (overwinter, ECOLOGY_TIER 2 herds) and founding-close (start date) | the sweep runs in section 5. |
| L3 | `stage1a.e2e`: (b) fixed in the review round (the test counted trips on surviving ants only; a forager that delivered and then died of old age, or drowned, took its trip counter with it: now compared per living ant). (c) the gate's own cause (nest volume refreshed on different ticks after a restore) is fixed (section 17); (c) now diverges at tick 5,360 inside another engineer's in-progress `nest-flood` system (L12). (a) red again: the eggs drown (`flooding`, the new nest flood model), L12. | weather-effects (a, c) | `npx vitest run src/sim/testing/e2e/stage1a.e2e.test.ts` (105 s); probes `test-output/int1b-fix/e2ea.ts`, `e2ec2.ts`. |
| L4 | `tendHerd.test` "establishes tending": the mean tend share in the last quarter is 0.47 against 0.5. The same with the old tend-demand adapter restored (0.47), so not caused by item 8. | ecology-plants / beh-forage | `npx vitest run src/sim/ants/behaviours/outdoor/tendHerd.test.ts`. |
| L5 | `colony/seams.test` midden-blocked, `nest/sfcDeterminism` (midden blocked case) and `nest/spoilScenario` (a closed nest raises midden-blocked): red since founding-close's `foundingInProgress` guard in `colony/midden.ts` (their file, in progress) withholds the flag for a nest whose founding state is not `established`. | founding-close | the three files in `src/sim/colony` / `src/sim/nest`. |
| L6 | Load-sensitive performance tests: `pheromones/perf.verify` (6.3 vs 6 ms), `pheromones/stagger` (ratio 1.10 vs 1.0), architect layout 50 ms, outdoor `determinism.perf` budget. Green on a quiet machine in their owners' runs; the machine ran at load 8-15 for the whole gate. | pheromones / architect / beh-forage | `npx vitest run src/sim/pheromones`. |
| L7 | Worldgen: kitchen-door interior "at least one passable indoor-outdoor connection" (fails on one of the 3 default seeds, not a timeout); outdoor "every micro-connection passable" / "useful by the chapter definition" / "no two solids interpenetrate". | worldgen-outdoor / worldgen-interior (wgo-fix in progress) | `npx vitest run src/worldgen/place`. |
| L8 | The application half imports the test world (`src/game/title/titleWorld.ts`, `src/game/newGame/options.ts`, `startSession.ts`). | int-1B-app | stand-in grep in section 16. |
| L9 | Overwintering is not implemented: a run past the end of autumn starves in the cold (section 15). | Stage 2 overwinter task | `life.ts --seed 1 --archetype woodland-edge --days 10` (10 days after the hand-over). |
| L10 | Locomotion stall sites (a walker with nav `moving` that does not move for game hours) and Addendum 3 item 11 (surface traps in the LONG kernel crossings, not reached). Sites seen in the sweep: suburban-garden #1 surface (2664, 6.1, 2153) BU (returning scout, > 1 gd) and nest (2990, -10, 2262) (idle ants); playground-park #2 entrance mouth (886, -3.5, 360); kitchen-door #3 nest (2007, -6.0, 1302) (hauler, 3 gd); woodland-edge #1 nest (3439, -5.2, 1198) (idle ants; the idle recentre of section 11 makes them leave the spot but they return to it); woodland-edge #2 surface (3015, 104.6, 486) (idle ant high on a plant). | locomotion | `life.ts --seed S --archetype A --until-day 10 --cache test-output/int1b/cache`, the run's Markdown lists the stuck ants per day. |
| L11 | Nest-system single-tick spikes: tamp fixed (section 17); `checkEntrances` still 50-95 ms in some ticks while mound relaxation changes the pile cells over a throat. | nestops | `node tools/sim/run-ts.mjs test-output/int1b/nestspike.ts woodland-edge 1 6000`. |
| L12 | **Drowning in dry weather** (sweep 4: 6 founding queens in their sealed cells at 0.55-0.59 gd, 49 drowning deaths in all; weather overcast, precip 0) and other weather-effects work in progress (seen at the end of the review round, not this gate's code; each checked by re-running with this round's files reverted to HEAD: same failures): `nest-flood` makes a restored game diverge (mound heights differ after the system at tick 5,360 of `stage1a.e2e` (c); runtime caches in `nest/flood/runtime.ts` are the first suspect); eggs drown in `stage1a.e2e` (a); mound rain erosion moves `nestFixes.verify` App. E check 5 to 0.5004 % (limit 0.5 %); `beh-nest` `colony.scenario` (larval hunger 0.61 vs 0.6), `sorting` (80 % moved after 4,942 ticks vs 3,000), `starvation` (the queen died before the last worker); founding `system.test` passive player ("no queen"). Also `founding/rules.verify` fails to load (`systems.ts` assembleSystems: a module system is `undefined`, an import-order cycle), unchanged with this round's `wiring.ts` reverted. | weather-effects / human-events / creatures (walker-in-bounds: creatures at x = 15968.00003 on playground-park #2) | the files named; `test-output/int1b-fix/e2ec2.ts` prints the first diverging system; `fprobe.ts 3 woodland-edge` the founding drowning. |
| L13 | GDD 02 App. E 25 with real behaviour (`gate1b/workedExample.long.test.ts`, FOUNDRESS_LONG, new in the review round): C intake 10.35 (10-14 ok), **P intake 9.26 (11-15), eggs 6 (8-16), stock change P +7.74 (+-3)**; C change +1.23 ok. Laying protein is withheld for most of the day (`layingProteinPermitted` false at the 1,500-tick samples) while P piles up in the store, so the queen lays 6 instead of 12 and P intake is spent nowhere. A balance / colony-core defect (GDD 02 §3.3 permission rule vs §15), not fixed here. | colony-core / balance | `FOUNDRESS_LONG=1 npx vitest run src/sim/testing/gate1b/workedExample.long.test.ts` (8 s); probe `test-output/int1b-fix/e25p.ts done`. |

## 13. notes-1B.md items

Every simulation-side item (`src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**`) of
`docs/design/tasks/notes-1B.md`, by source report. "fix task" = closed by sim-fix-ants / sim-fix-colony and
verified here by running (tests green or behaviour seen in the colony-life runs); "here" = fixed at this gate;
"open" = not done, with the owner.

| Report | Item | Outcome |
|---|---|---|
| beh-forage | count-only delivery API; adapters import colony internals | fix task (`recordDeliveryCount`; verified: deliveries booked in every sweep run) |
| beh-forage | `cheat.injectReturn` radius | fix task (colony tests green) |
| beh-forage | allocator reassigns outside foragers | fix task |
| beh-forage | unload-to-chamber primitive, `out.ration` ledger key | fix task (`unload-crop`; used by the player test) |
| beh-forage | behaviourRunner.test stale | here (item 4) |
| beh-forage | passive home deposits owner | fix task (sim-fix-ants 4-6) |
| beh-forage | avoid-weighted flow field / trail x0.1 in avoid | fix task (disc-weighted flow field); trail weighting inside avoid not re-checked |
| beh-forage | no-op `perception` placeholder | fix task (runner test asserts one real perception system) |
| beh-forage | balance index re-export | fix task (`balance/index.ts`) |
| beh-forage | Tier 1 spill evaporation / carrion 3 gd | fix task (spill: no decay at T1; carrion: GDD 05 §1.2 keeps 3 gd) |
| beh-forage | stores-full alert | fix task |
| beh-forage | 1.2 ms outdoor budget | open (section 9) |
| beh-forage | scouting depends on chance / delivery rate | **here, root causes**: raised sources were never smelled; the hungry return blocked every scout with an empty pool (section 3) |
| beh-nest | five care operations through careActs | fix task (primitives `load-crop`, `unload-crop`, `feed-queen`, `assist-eclosion`, `cannibalise`) |
| beh-nest | internal dump / midden-blocked | fix task (`internalDumpSite`, `reportMiddenBlocked`) |
| beh-nest | board rebuilt every tick / 1.5 ms | fix task (aligned board, persisted `nurseryBoards`); budget open (section 9) |
| beh-nest | reach/approach workaround for the locomotion stall | fix task (stall share 0.56 % -> 0.01 %); `walkStalled` safety net kept by them |
| beh-nest | waste spawns floating / bulk 1.0 | not re-checked (no waste in the runs) |
| beh-nest | oversized dig pellets | not re-checked; no stuck pellets in the sweep's player nests |
| beh-nest | cheat.setChamberClimate vs environment.chamberTemp | open (colony-core / env-core) |
| beh-nest | midden site publication | fix task (dump site query) |
| architect | layout 50 ms at 400 workers | open (section 9: 52 ms CPU at load 21 in the fix task; not re-measured idle) |
| architect | `acceptPlan` no-op; plan bounds cube | fix task |
| architect | spoil piles inside the nest | fix task (urgency + passage rule); sweep: pellets in the player's nest at the end of each run in section 5 |
| architect | `need` parameter for createPlanImpl; kernel carveShape; incremental nav components | open (nestops / kernel, performance) |
| architect | Messor granary counting | open (T3) |
| nest-fixes | founding readiness / state transitions | founding module (done by founding; verified in every sweep founding) |
| nest-fixes | site abandonment §13.4 | open (founding / nestops) |
| nest-fixes | covered entrance alert | fix task (`entrance-closed` event + alert) |
| nest-fixes | stage1a e2e findDigSite null | resolved upstream (e2e (a) runs; it now fails on an egg count, section 12) |
| worldgen-outdoor | kernel.test walker traps | open (item 11) |
| worldgen-outdoor | pipeline R2 fixture | here (item 5, the fixture was right; checkStart was the cause) |
| worldgen-outdoor | terrain tree-pit exemption, maps kitchen floor / E5 | owners fixed (worldgen folder: those tests green) |
| worldgen-outdoor | rasterColumns speed, opChunks export | worldgen-fixes (done there) |
| worldgen-outdoor | 4 of 2069 climb routes | open (worldgen-outdoor) |
| worldgen-interior | interior.test indoor-outdoor connection timeout | still red (fails, not timing out: section 12); default run now 3 seeds (diet) |
| worldgen-interior | WorldData.lanes, sink film, nav water footprint | open (contracts / worldgen-terrain) |
| worldgen-life | site-food map-wide, rival pre-carves, Camponotus kitchen-door | not for this gate (Addendum 3) |
| worldgen-life | maps.verify Messor modules, walker Math.hypot, layering populate | owners fixed (worldgen folder green on these) |
| worldgen-fixes | checkStart regenerate | here (item 5) |
| worldgen-fixes | LONG kernel crossings | open (item 11) |
| worldgen-fixes | maps.verify 91 s, pipeline.test 80 s | open offenders (section 1) |
| sim-fix-ants | species caste action tables for the new primitives | open (species-data; the primitives' `who()` grants them) |
| sim-fix-ants | feedQueenFromReserve stage check | here (A4) |
| sim-fix-ants | clutter speed factor cost | open (nest; not in the top costs of the sweep profile) |
| sim-fix-ants | wander can end `failed` (creatures note) | no change needed |
| sim-fix-colony | hauler wiring to internalDumpSite / pelletHaulUrgency | fix task (sim-fix-ants side done) |
| sim-fix-colony | alerts go nowhere | progression is real now (stubs test updated) |
| sim-fix-colony | layout timing, nestFixes.verify check 5 | open (layout); check 5 green in the nest folder |
| founding | site-search out of FOUNDING_CELL_STATES | tried and reverted (section 3) |
| founding | nestops detach-cavity function, plan through plug | the reopen is now dug (section 3, validator); detach open |
| founding | env-core chamber temperature / start date | founding-close in progress (startDoy 9 landed) |
| founding | colony minim rule / canLay clutch cap | open (founding-close) |
| founding | `readiness` refusal for seal-entrance | open (actions) |
| founding | beh-nest reopen plan not dug | **here**: the plans were never created (validator refused them); now dug in every run |
| founding | reduced system list during the lapse (nest system 420 us of 680 us) | improved by the entrance memo; a reduced list not done |
| save | `installPersistence` wiring | application half |
| species-data | getAntStats -> derive.ts; larvaFood -> larvalCost; SEXUAL_STAGE_DU_MULT scope; caste 'worker' assumptions | open (entities / colony-core; T3 species not playable at T1) |
| species-data | speciesGame Infinity in diag-nest-space | fixed upstream (species folder 131/131 green) |
| progression | colony / overwinter / reproduction / world emitters | open (Stage 2 modules) |
| progression | stubs.test obsolete | here (item 4) |
| progression | alerts.handover stub case | colony folder green on it |
| creatures | combat stub applyDamage | combat is real (stubs test updated) |
| creatures | nest `disturb` hook, flight/hop/burrow locomotion | open (Stage 2) |
| creatures | 28-day soak rerun with the real colony | open (Stage 2 balance pass) |
| combat | action library shells, attacker id, bite/spray permissions, adapters | here (item 10) |
| combat | flee -> rest | here (item 9) |
| combat | health regeneration | here (item 13) |
| combat | possessed prediction vs overrides | here (item 12) |
| combat | behaviourRunner fight/patrol, removal.verify scouts, stubs | here (items 4, 6) |
| combat | injury effects in perception / locomotion / allocation, cheat.combatFlags persistence | open (Stage 2) |
| ecology-plants | tend demand in computeDemand | here (item 8) |
| ecology-plants | import loop creatures/ports -> combat -> colony -> ecology | not reproduced (ecology folder 300/300 green) |
| ecology-plants | ECOLOGY_TIER 2, cull-aphid action, mow hooks | not for this gate |
| int-1A-sim | ensureThermal at game creation | decision: stays on the weather system's first tick (section 3) |
| int-1A-sim | dead NavScratch fields, contract fields (afkRelease ...) | open (contracts owner, save-format bump) |
| int-1A-sim | stage1a e2e on the changing seed-1 world | (a) and (b) red again on the current world (section 12) |


## 13a. Addendum 5 requests from founding round 3

| # | Request | Outcome |
|---|---|---|
| 1 | No `food-c-low` / `food-p-low` / `colony-starving` while `foundingInProgress`; a grace period after the hand-over; never "brood is being sacrificed" without brood | **done** (`colony/starvation.ts`): the stores alerts are held while `foundingInProgress` holds and for `STARVE_ALERT_GRACE_GD` (1 gd) after the hand-over (the lapse end tick); when the hold ends, the alerts of the current stage are raised once; `colony-starving` says "the stores are empty and the workers are going hungry" when there is no brood. The stages themselves are unchanged (they drive the colony's behaviour). |
| 2 | `last-ants`: empty title; raised during the opening | **done** (`progression/deaths.ts`; review round): never raised (and cleared) while the opening runs, whatever the count (the first nanitics eclose one by one during the time-lapse, so 2-3 living ants is a healthy founding); a failed opening gets the normal rule. `progression.verify` and `wording.test` now mark their test colony's opening done (their test world's opening record sat at its intro card). The empty title is on purpose: alerts carry tokens and the interface words them from `content/text` `alertText` (`src/game/uiBridge/hudSlices.ts` does so when `title` is empty); the simulation does not import interface text (layering), so a surface that shows it blank is the application half's. |
| 3 | `reopening -> sealed` when the passage closes again; a `natural` entrance when a founding cavity breaks into a world cavity | first part **done** (`nest/entrances.ts`, additive `Entrance.passSeen`): a `reopening` throat that had a passage and loses it is `sealed` again; one still being dug through stays `reopening`. Second part **not done** (needs the breach rules for pre-carved world cavities; nestops). |
| 4 | `seal-entrance` aim / reach by the hole patch; defer a deep press to the guide | **not done** (the seal guide is founding-close's; the action change needs their guide's aim point; left with them). |
| 5 | Possessed walker on steep shaft walls / beside a log; "Scout · scouting · stuck" on flat ground | **not done** (locomotion; same class as the stall sites in section 12, L10). |
| 6 | Tests that assume a start on day of year 10 | checked: `createGame.test`, `environment/weatherStart.test`, `types/d7.test` follow `startDoy` 9; no other test in `src/sim`, `src/worldgen`, `src/core` failed on the start day in the final folder run (section 1). |

Also from the founding hand-over (seen in the colony-life runs, now handled here): the workers dig out a `reopening`
plug themselves (`dig.unplug`, section 11), and walkers that left through a not-yet-open throat can come home through
it.

## 14. Founding opening at the end of the gate

Run after everything else (02:17-02:24), as Addendum 4 asks:

- **Founding folder tests** (`src/sim/colony/founding/`, inside the colony folder run of section 1): green, including
  founding-close's new `alarms.test` ("the opening raises no false alarms"), which this gate's unplugging first made
  red (the first workers dug the plug open, its remnants flipped the entrance back to `sealing` on the next check and
  `midden-blocked` was raised) and then green again with the GDD 03 §4.2 "first plug added" rule (section 11).
- **Headless real-action founding on generated seeds 1-3** (`FOUNDRESS_LONG=1 FOUNDRESS_SEEDS=n npx vitest run
  src/sim/colony/founding/generated.long.test.ts`, one seed per process, logs in `test-output/int1b/founding/`):
  - seed 1: walk to the site (q 0.87), dig (85 bites, shaft at tick 3934, chamber at 5233), cell `ready`; **the seal is
    refused** `seal-entrance: no-target` six times and the opening stays in `seal` (expected `lay`).
  - seed 2: the cell's dig readiness reaches 0.89 only; the opening stays in `dig` (expected `seal`).
  - seed 3: as seed 1 (seal refused `no-target`).
  - The founding-outcome half of the same file passes on all three seeds (lapse 2.8-4.6 GD, 9-16 workers, all
    accepted).
  - The same seed-1 failure with this gate's nest and action changes reverted (checked: identical refusals), so it is
    founding-close's open seal work (their Addendum 5 request 4 names the `no-target` refusal), reported, not fixed
    here, as Addendum 4 instructs.
- The colony-life sweep (section 5) runs the founding through `cheat.completeFounding` (template carve, then the
  real seal, laying, lapse and hand-over): 13 of 15 worlds reach the hand-over with 7-16 first workers; on
  playground-park #3 and car-park-verge #2 the seal never completes (L1).

## 15. What Stage 2 tasks must know

- **Overwintering decides the first year.** The default Lasius start (startDoy 9) hands over at about summer day 5;
  ten game days after the hand-over run into winter, and winter is not implemented (no dormancy, no time-lapse): a
  run that long starves in the cold with idle foragers (woodland-edge #1, 10 days after hand-over: stages S3 from
  day 8, see section 5). The overwinter task must make the colony dormant (MET x0.3, no foraging) and must expect an
  incipient colony with 1-3 loads of C in store at the start of autumn.
- **An incipient Lasius colony does not lay in autumn.** `fSeason` is 0.6/0.2 in autumn and `fTempQ` 0 below 14 °C
  in the royal chamber; with the late-summer hand-over the queen lays a first batch at most. GDD 07's y1 target
  (12-25 workers at the end of year 1) is met by not growing; growth starts in spring.
- **Tier 1 food is thin for a 15-worker colony.** Deliveries are 1-7 per day; stores stay at 0-2 loads. Any Stage 2
  hazard (predators, rain, human events) that costs foragers will push such a colony into S3. Herds (ECOLOGY_TIER 2)
  and nectar refills are what the C13 budget counts on.
- **Raised food is found from the ground** by its plan-view odour (section 3); creatures' or rivals' perception
  that copies the ant perception should do the same.
- **Determinism rules learnt here:** a system's per-tick trigger must be state (or a function of state), never a
  runtime counter (`carveChangedTick`); runtime memos must key on every input (entrance memo: carve, flags, field
  geometry and the pile cells, which mound relaxation edits in place); overlapping overlays must be combined in a
  state-defined order.
- **Combat now owns its rules behind ports:** the action library's bite/spray/sting/dodge shells call `combat` through
  `ports` (late-bound). New combat primitives should follow that pattern; nothing may patch `ACTION_DEFS`.
- **The hand-over is the colony's weakest moment.** The pool is empty, the entrance is plugged, the first workers
  must dig it out (`dig.unplug`) and find food with 1-2 scouts before autumn. GDD 02 §6.6's activation loop never
  ignites at that size (spontaneous departures only), so 7-16 workers make 0.5-1.5 trips each per day. Any Stage 2
  change to the opening, the start date or Tier 2 food must be checked with `tools/sim/life.ts` on all five
  archetypes (the sweep script is `test-output/int1b/sweep3.sh`).
- **Entrance states:** walkers come home through a `reopening` / `sealing` throat when no entrance is `open`; an open
  entrance only goes `sealing` when a plug is added; a `reopening` throat that loses its passage is `sealed` again.
- **Open performance items** (section 9) and the defects in section 12.


## 16. Stand-in check (acceptance 6) and files touched

**Stand-in check (acceptance 6).** The production code path imports no test support:

```
grep -rnE "from '[^']*(testing|testkit|doubles|e2e|fixtures|verifyKit|freeDigKit|soakScene)[^']*'" \
  src/sim src/worldgen src/core src/game src/render src/ui --include=*.ts --include=*.tsx \
  | grep -vE "\.test\.ts|/testing/|testkit|/e2e/|verifyKit|soakScene|fixtures\.ts"
```

Result: the sim-side hits (`colony/founding/sealKit.ts`, `progression/codexFixtures.ts`,
`ecology/sources/referenceWorld.ts`, `nest/freeDigKit.ts`, `nest/nestTestKit.ts`) are themselves test kits that
only tests import (checked with a second grep for importers). Three application-half files import the test world:
`src/game/title/titleWorld.ts` (title backdrop), `src/game/newGame/options.ts` and `startSession.ts` (the
`testWorld` new-game option); they are the application engineer's (listed in section 12 for them). The local
adapters the Stage 1B tasks left are gone or inert: `TEND_DEMAND_ADAPTER = false` (system unlisted), combat's
`installActionAdapters` is a no-op, the foraging adapter uses `recordDeliveryCount`, careActs replaced by
primitives. The founding module's `reopen.ts unplugRemnants` (a local adapter over `unsealEntrance`) remains: it is
founding-close's file.

**Contract changes (additive).** `src/sim/types/world.ts`: `WorldDelta.carveChangedTick?: number` (tick of the
last carve-grid change; persisted so a restored save re-checks walkers on the same ticks). `src/sim/types/nest.ts`:
`Entrance.passSeen?: boolean` (a `reopening` throat had a passage; losing it again closes the entrance; since the review round set to `false`, never deleted, and every entrance the nest module creates starts `false`). `Nest.detectDue?: boolean` (review round: chamber detection pending, persisted; new nests start `true`, a save without it counts as due). Colony-core
accumulator key `starve.held` (`col.core.acc`, already a free-form record). Runtime-only (not
contracts): `WorldField.geomVersion` (field.ts class member), `FlagStore.version`, `LocoRuntime.possessedOverriddenId`,
`NestRuntime.deepVolBox`. New exports: `combat` `stingRefusal`, `stingContact`; `colony/queen`
`queenReserveFeedAllowed`; `nest/plans/targets` `sampleAboveGround`; `nest` `entranceToUnplug`; `locomotion/nests`
`homeEntranceStatus`; a new behaviour state `dig.unplug` (states are strings; GDD 02 §10 lists `dig.*`); worldgen `checkStartRule` returns two more
fields (`good`, `onlyContentShort`); ports gained `combatMayBite`, `combatStats`, `combatSprayDisabled`,
`combatDodgeRefusal`, `combatStartDodge`, `combatStingRefusal`, `combatStingContact`, `combatStingHit`.

**Files touched** (one line each):

| File | Why |
|---|---|
| `src/sim/types/world.ts` | `WorldDelta.carveChangedTick` (save/load determinism) |
| `src/sim/services.ts` | carve listener writing `carveChangedTick` |
| `src/sim/locomotion/system.ts` | state-based re-attach trigger; record override-moved possessed ant |
| `src/sim/locomotion/runtime.ts` | `possessedOverriddenId` |
| `src/sim/locomotion/possessed.ts` | predictor holds the tick pose under an override |
| `src/sim/locomotion/update.ts` | `window` -> `stallWindowS` (layering) |
| `src/sim/ants/testing/costTable.ts`, `src/sim/ants/behaviours/nest/cost.perf.test.ts` | clock injected by the test (layering) |
| `src/sim/ants/behaviourRunner.test.ts` | task-set check as subset + validity |
| `src/sim/testing/stubs.test.ts` | real combat and progression |
| `src/sim/balance/progression.ts` | stats offset 131 |
| `src/sim/balance/ecology.ts`, `src/sim/ecology/index.ts`, `src/sim/colony/allocation/demand.ts` | tend demand in allocation, adapter off |
| `src/sim/ecology/plants/testkit.ts` | `SeasonLengthDays` type instead of literal `5 \| 7 \| 10` (time.test hard-coded-length rule) |
| `src/worldgen/maps/start.ts`, `src/worldgen/validate/checks.ts` | content-limited start: no regeneration |
| `src/sim/ants/behaviours/outdoor/removal.verify.test.ts` | exploring scouts excluded from the per-ant limit (ruling) |
| `src/sim/ants/behaviours/outdoor/fleeTask.ts` | flee -> rest when badly hurt |
| `src/sim/balance/colony.ts`, `src/sim/colony/physiology.ts`, `src/sim/combat/injuries.ts` | GDD 05 §4.7 regeneration |
| `src/sim/colony/queen.ts` | reserve feed gated by starvation stage |
| `src/sim/ants/actions/defs/combat.ts`, `defs/index.ts`, `ports.ts`; `src/sim/combat/index.ts`, `sting.ts`, `dodge.ts` | native dodge / sting shells, bite/spray permissions and attacker id, no table patching |
| `src/sim/nest/plans/validate.ts`, `targets.ts` | surface objects above the ground are not non-diggable targets (founding reopen) |
| `src/sim/ants/perception/sense.ts` | raised sources smelled in plan view; cached lift |
| `src/sim/balance/foraging.ts`, `src/sim/ants/behaviours/outdoor/engine.ts` | hungry return only when home can feed |
| `src/sim/nest/entrances.ts`, `src/sim/nest/flags.ts`, `src/sim/world/field.ts` | entrance evaluation memo (version counters, pile fingerprint); overlays kept in id order |
| `src/sim/nest/chambers/upkeep.ts`, `src/sim/nest/runtime.ts` | nest volume cache dropped when the nest box changes |
| `src/sim/balance/nest.ts` | comment on `FOUNDING_CELL_STATES` (value unchanged after the revert); `ITEM_BURIED_BU` |
| `src/sim/locomotion/nests.ts`, `src/sim/locomotion/runtime.ts` | home entrance fallback (`homeEntranceStatus`) for trips home and the nest flow seeds |
| `src/sim/nest/entrances.ts`, `src/sim/nest/index.ts` | `entranceToUnplug` query; `open -> sealing` only when a plug is added |
| `src/sim/ants/actions/defs/dig.ts` | `unseal-entrance` accepts `reopening` throats |
| `src/sim/ants/behaviours/nest/dig.ts`, `src/sim/balance/nestwork.ts` | `dig.unplug` state and its constants; `IDLE_STILL_BU` |
| `src/sim/ants/behaviours/nest/idle.ts` | recentre after an idle cycle without movement |
| `src/sim/ants/behaviours/nest/places.ts`, `src/sim/nest/tamp.ts` | buried items |
| `src/sim/colony/stores.ts` | queen takes only protein past her C target |
| `src/sim/colony/starvation.ts`, `src/sim/balance/colony.ts` | stores alerts held during the founding and its grace period; no "brood is being sacrificed" without brood (Addendum 5 request 1) |
| `src/sim/progression/deaths.ts` | no `last-ants` while the opening runs (request 2) |
| `src/sim/types/nest.ts`, `src/sim/nest/entrances.ts` | `Entrance.passSeen`; `reopening -> sealed` when the passage closes again (request 3) |
| `src/sim/combat/recruit.ts` | encounter presence skip (performance) |
| `src/sim/testing/e2e/stage1a.e2e.test.ts` | (a)/(b) count the player colony's eggs, deliveries and trips only (rival colonies have brood and forage since Stage 1B) |
| `src/sim/types/d7.test.ts` | follows the species start day (9 since founding-close) |
| `src/worldgen/place/interior/interior.test.ts`, `src/worldgen/place/outdoor/outdoor.test.ts` | suite diet: full seed sweeps behind `FOUNDRESS_LONG` |
| `src/sim/testing/gate1b/seams.test.ts`, `player.test.ts`, `midlife.test.ts`, `midlifeKit.ts`, `soak.long.test.ts` | the gate's tests |
| `tools/sim/life.ts`, `lifeMetrics.ts`, `lifeHealth.ts`, `lifeSummary.ts` | colony-life tool (stuck-ant listing, laying window, need rates, per-system perf minima) |
| `docs/design/tasks/gate-1B-sim-report.md` | this report |


## 17. Review round (independent reviewer's findings)

Each finding was reproduced first; probes are in `test-output/int1b-fix/`. The reviewer's tests in
`src/sim/testing/gate1b/gate1b.verify.test.ts` are unchanged and all pass (the LONG one with `FOUNDRESS_LONG=1`).

| # | Finding | Reproduced | Outcome |
|---|---|---|---|
| 1 | Save -> restore -> continue diverges on a generated world (rival nest `volumeOpen`) | yes: woodland-edge #1 hand-over + 1,500 ticks, first diverging tick +47, nest 5171 `volumeOpen` 323.1012006701331 vs 323.1012007166533 | **fixed at the cause.** Not a summation-order difference: the per-chunk volume caches of both games were identical, and a fresh computation in the uninterrupted game equalled the restored value. The uninterrupted game held a `volumeOpen` computed at an earlier detection (its shallow samples read the live mound piles, which had since relaxed), while the restored game re-detected every nest at its first turn because the "detection due" set was runtime state that a new runtime starts all-dirty. The trigger is now persisted (`Nest.detectDue`, set by the carve listener and `markNestDirty`, cleared by the detection), and the nest runtime (its carve listener) is installed when the Sim is created (`wiring.ts`), so no carve is missed. Same rule as section 15: a per-tick trigger must be state. Evidence: the probe equal for 6,000 ticks after the restore (`vprobe.ts`); the reviewer's LONG test green (244 s); `midlife.test` green. |
| 2 | Acceptance 2 not met; health judge looser than the spec | yes (the judge's own rules) | **judge fixed** (section 4, strict rules; `netGrowth` recorded beside the verdict; player-colony-only counters; development cache keyed on the code). Sweep 3 re-judged: 1 of 15 healthy. Sweep 4 on the final code: 0 of 15, dominated by drowning from the nest flood model that landed meanwhile (section 5, L12). Acceptance 2 stays **not met** (the colony economy after a late-summer hand-over, founding-close's seal, locomotion stall sites). |
| 3 | `last-ants` raised during the opening once nanitics eclose | yes (reviewer test: `last-ants` n = 3) | **fixed**: never raised while the opening runs (section 13a). Two progression tests that used a test world whose opening record sits at its intro card now mark the opening done. |
| 4 | Performance verdict against the wrong budget; unbounded tamp retries | yes: 69 refused pellets in rival nests, 19 ms each per retry, all due on one tick | **verdict corrected** (section 9: over the 4 ms budget at every size). **Tamp fixed**: retries phase-shifted by item id across `TAMP_RETRY_S`; a refused pellet is not retried while nothing it reads changed (runtime memo in `nest/tampRetry.ts` keyed on per-chunk carve stamps, the piles over it when it is near the ground, moved objects near it, the voxel flags at the pellet and the pellet; a tamp is a pure function of these, so the memo cannot change a result, and the restore probe stays equal). Single tamp ticks 1.3-1.6 s -> at most 53 ms; tamp total over one game day 2.8 s -> 1.8 s on the first day of a new runtime (each refused pellet is tried once), near 0 after. |
| 5 | Acceptance 1 not met (failing tests, 28-min suite) | yes | partly: `stage1a.e2e` (b) fixed (test counted trips on surviving ants only); (c)'s gate cause fixed (finding 1); the rest is listed with owners (L3, L5-L7, L12). Not met. |
| 6 | Colony-life counters count other colonies' eggs, plans, pellet dumps | yes (reviewer test: counted 1) | **fixed** (`lifeMetrics.ts`: eggs by the brood's colony or the queen's, plans by the player's nests, dumps by the pellets the player's ants made). |
| 7 | `dig.unplug` digs out any `sealing` plug | yes (reviewer test: entrance returned) | **fixed**: `entranceToUnplug` offers `reopening` throats only (GDD 03 §4.2: an open entrance goes `sealing` only when a plug is added, i.e. someone closes it on purpose); the seal-plan and `seal-entrance` checks stay, and the O(N) ant scan now runs only while a reopening throat with plug voxels exists. |
| 8 | Sweeps 2-3 judged the founding from sweep-1 snapshots | yes (cache key had no code tag) | **fixed** (cache file name carries an FNV-1a hash of the simulation sources); sweep 4 founds afresh. |
| 9 | GDD 02 App. E 25 not covered with real behaviour | yes | **test added** (`gate1b/workedExample.long.test.ts`, FOUNDRESS_LONG); it fails on P intake, eggs and the P stock change (L13: laying protein withheld while P piles up). Recorded, not fixed (colony-core balance). |
| 10 | Outdoor 1.2 ms budget: 1.50 ms measured | not re-measured (machine shared; the reviewer's figure taken as is) | **open**: the profile-and-fix of the top two outdoor costs is not done. |
| 11 | `midlife.test` does not assert what the report says | yes | **fixed**: asserts a live dig plan and larvae fed during the run (`fedC + fedP > 0`; the brood factory starts at 0) at the save. |
| 12 | Buried-pellet rules disagree (haulers vs tamping) | yes, by reading; and absorbing them all broke `spoilUnits` (a heap in a tunnel vanished instead of staying a squeeze) | **fixed**: a pellet buried in a plug is absorbed as before; one buried under tamping fill rides up onto the risen floor (`BURIED_LIFT_BU`), where haulers (`onSurface`) and the next tamp reach it. |
| 13 | Hot-path allocations and inline constants in the combat presence skip | yes | **fixed**: one presence record per Sim, maps cleared per tick; `PRESENCE_CELL_BU`, `PRESENCE_MARGIN_BU`, `PRESENCE_MAX_COLONIES` in `balance/combat.ts`. Combat folder green. |
| 14 | `Entrance.passSeen` optional-and-delete | yes | **fixed**: set to `false`, never deleted; entrances the nest module creates start `false` (the field stays optional for older saves: contracts are additive). |

Tests run in this round (machine load 3-7): `src/sim/nest` + `src/sim/testing/gate1b` after the last change 286 passed,
4 failed (`sfcDeterminism` and `spoilScenario` midden-blocked: L5; `nestFixes.verify` check 5: L12 erosion;
`architect/layout` 63-79 ms against 50 ms at 400 workers: L6, the same 69-79 ms with this round's nest runtime,
wiring and nest factory reverted); an earlier run caught 2 `spoilUnits` failures from a first buried-pellet fix
(absorbing every buried pellet), green after the lift fix; `src/sim/progression`,
`src/sim/combat`, `src/sim/entities` green after the two test-fixture updates; `src/sim/testing` + `src/sim/sim.test.ts`
283 passed, 2 failed (`stage1a.e2e` (a), (c): L12); `src/sim/ants/behaviours/nest`, `src/sim/colony/allocation`,
`src/sim/colony/founding`: 4 failed + 1 file failing to load, all L12 (each re-run with this round's files reverted
to HEAD: same failures). `npm run typecheck`: no errors in `src/sim`, `src/core`, `src/worldgen`, `tools/sim` except
another engineer's `src/sim/environment/human/schedule.long.test.ts` (`process` not typed).

Files touched in this round: `src/sim/types/nest.ts` (`detectDue`, `passSeen` doc), `src/sim/entities/nests.ts`
(`detectDue: true`), `src/sim/nest/runtime.ts` (persisted detection flag, chunk stamps), `src/sim/wiring.ts` (nest
runtime at Sim creation), `src/sim/nest/tampRetry.ts` (new: staggered retries, refusal memo),
`src/sim/nest/tamp.ts` (buried-pellet lift; the schedule moved out), `src/sim/nest/system.ts` (import),
`src/sim/balance/nest.ts` (`BURIED_LIFT_BU`), `src/sim/nest/entrances.ts` (`entranceToUnplug` reopening only,
`passSeen` false), `src/sim/nest/naturalCavities.ts`, `src/sim/nest/pellets.ts`, `src/sim/testing/testNest.ts`
(`passSeen: false`), `src/sim/progression/deaths.ts` (no `last-ants` during the opening),
`src/sim/progression/progression.verify.test.ts`, `src/sim/progression/wording.test.ts` (opening done in the
fixture), `src/sim/combat/recruit.ts`, `src/sim/balance/combat.ts` (presence constants, no per-tick maps),
`src/sim/nest/spoilUnits.test.ts` (retry schedule by item phase), `src/sim/testing/e2e/stage1a.e2e.test.ts` ((b)
per living ant), `src/sim/testing/gate1b/midlife.test.ts`, `midlifeKit.ts` (assertions),
`src/sim/testing/gate1b/workedExample.long.test.ts` (new, App. E 25), `tools/sim/lifeHealth.ts` (strict judge),
`tools/sim/lifeMetrics.ts` (colony filters, brood temperature, volume column), `tools/sim/life.ts` (code-tagged
cache, `netGrowth`), `tools/sim/lifeSummary.ts` (eclosed and net-growth columns), this report.
