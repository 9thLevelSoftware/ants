# Stage 1B integration gate — simulation half (int-1B-sim)

Scope: `src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**` and their tests. Everything below was checked by
running it on the shared 4-core machine (load average 8-10 for the whole session; other engineers were running
founding-close, rivals and ui-panels work at the same time), so every timing is noisy and is reported as measured.

<!-- SECTION:SUMMARY -->

## 1. Suite baseline and diet

`npm run typecheck`: clean at the start and at the end of the gate (the only errors seen in between were other
engineers' work in progress in `src/ui/**`).

Baseline (`test-output/full-suite-nov15.txt`, 16:41): 23 failures in 17 files. The gate's folder-by-folder run
(`test-output/int1b/folders.sh`, one vitest process per folder, 2 workers, load 8-10) after the fixes below:

<!-- SECTION:FOLDERS -->

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


## 5. Colony life on every Tier 1 archetype

<!-- SECTION:SWEEP -->

## 6. Economy check

<!-- SECTION:ECONOMY -->

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

<!-- SECTION:ROBUST -->

## 9. Performance

<!-- SECTION:PERF -->

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
| Stale test expectations | `types/d7.test.ts`, `ecology/plants/testkit.ts`, `testing/stubs.test.ts`, `behaviourRunner.test.ts` | start day 9, literal season lengths, real combat/progression, more behaviours | updated, no assertion weakened beyond the stated rulings |


## 12. Defects left (with reproduction)

<!-- SECTION:LEFT -->

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


## 14. Founding opening at the end of the gate

<!-- SECTION:FOUNDING -->

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
last carve-grid change; persisted so a restored save re-checks walkers on the same ticks). Runtime-only (not
contracts): `WorldField.geomVersion` (field.ts class member), `FlagStore.version`, `LocoRuntime.possessedOverriddenId`,
`NestRuntime.deepVolBox`. New exports: `combat` `stingRefusal`, `stingContact`; `colony/queen`
`queenReserveFeedAllowed`; `nest/plans/targets` `sampleAboveGround`; worldgen `checkStartRule` returns two more
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
| `src/sim/balance/nest.ts` | comment on `FOUNDING_CELL_STATES` (value unchanged after the revert) |
| `src/sim/types/d7.test.ts` | follows the species start day (9 since founding-close) |
| `src/worldgen/place/interior/interior.test.ts`, `src/worldgen/place/outdoor/outdoor.test.ts` | suite diet: full seed sweeps behind `FOUNDRESS_LONG` |
| `src/sim/testing/gate1b/seams.test.ts`, `player.test.ts`, `midlife.test.ts`, `midlifeKit.ts`, `soak.long.test.ts` | the gate's tests |
| `tools/sim/life.ts`, `lifeMetrics.ts`, `lifeHealth.ts`, `lifeSummary.ts` | colony-life tool |
| `docs/design/tasks/gate-1B-sim-report.md` | this report |

