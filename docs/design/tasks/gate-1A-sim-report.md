# Stage 1A integration gate — simulation half (int-1A-sim)

Scope: `src/sim/**`, `src/core/**`, `tools/sim/**` and their tests (worldgen: see section 7). Everything below was
checked by running it; numbers come from a shared 4-core machine at load average 9-20, so timings are noisy and
reported as measured.

## 1. What works end to end

All on a GENERATED world (seed 1, standard size, Lasius niger), headless and deterministic
(`src/sim/testing/e2e/stage1a.e2e.test.ts`, 4 tests, about 25 s):

- **(a) New game -> founding dig -> eggs -> brood development.** createNewGame places the founding queen on the
  kernel level set; she walks with `navTo` (locomotion, nav grid + walker) to a diggable loam site found with
  `nest.canDigAt`; with the founding record set to `digging` (stand-in for the founding module) she digs a ramp
  shaft (5 BU) and a room with the real `dig-bite` action primitive only (`src/sim/testing/e2e/foundingScript.ts`):
  the nest module expels the soil onto the founding mound (more than 50 `pellet-expelled`, mound volume > 0), the
  breach registers an entrance (`entrance-opened`), chamber detection registers the room (`chamber-registered`,
  about 12,500 ticks). With the opening phase set to `lay` she lays a batch with the `lay-egg` primitive; the eggs
  develop at exactly `devRate(T) / stageDu` with T the environment's temperature at the egg (cavity column, via
  `colony/envAdapter.broodTempC`), matched to 2 decimals over half a game day. Invariants hold at the end.
- **(b) 60 workers forage.** `setupColonyScenario` (`src/sim/testing/e2e/colonyScenario.ts`) carves a template nest
  through the nest module (`carveTemplateNest`: shaft, royal cell, nursery and food chambers, mound), establishes
  the queen, cheat-spawns 60 workers, 16 brood and a sugar spill. Scripted stand-ins for beh-forage call the real
  APIs: locomotion `navToTarget` (source, food chamber), `harvest-liquid` primitive, `discoverSource`,
  `colony.recordDelivery` (ledger) and `recordForagerReturn` (news / known sources), trail dabs with
  `sim.phero.deposit`. Checked: more than 10 deliveries booked into the stores; the colony's allocation hands out
  more than two tasks including forage/scout; the source enters `knownSourceIds`; trail laid on the surface decays,
  once nobody lays, at a rate inside the environment hook's range.
- **(c) Determinism.** Two runs of scenario (b) from the same seed give the same `stateHash` after 3,000 ticks;
  snapshot at 3,000 -> restore -> 3,000 more ticks equals the uninterrupted 6,000-tick run (GDD 03 App. E check 25's
  save / load clause, with real modules and scripted behaviours). Making this pass found and fixed three real
  determinism defects (section 3: chamber creep, stale chamber fields, mound changes not reaching the nav grid).
- **Soak** (`node tools/sim/run-ts.mjs tools/sim/soak.ts --days 3 --workers 60 --colony`): 3 game days (18,000 ticks),
  60 workers, 20 brood, sugar source, scripted foraging and brood care: **0 invariant violations** in 182 checks
  (9 invariants, section 5), per-system timing table in section 5.

## 2. What is still stubbed (owners in brackets) and how the scenarios stand in

- Behaviours: no Stage 1B behaviour exists [beh-forage, beh-nest]; the default behaviour stops idle ants. The
  scenarios use scripted behaviours/systems in `src/sim/testing/e2e/` (test support, never imported by game code).
- Founding flow [founding]: `cheat.completeFounding`, `cheat.setFoundingState`, opening phases, `nest.siteAt` are
  no-ops; scenario (a) writes `nest.founding.state = 'digging'` and `player.opening.phase = 'lay'` directly.
- Perception system (no-op) [beh-forage]; architect system (no-op) [architect].
- Combat, rivals, progression (alerts, milestones, diagnostics publishing), plants, creatures, human events,
  weather effects (moisture, rain wash), overwinter/reproduction: Stage 2 stubs, as the module map plans.
- `environment.isExposed` is a stub (false) [weather-effects]; the pheromone decay hook therefore treats only
  underground cells and interiors as sheltered.
- The generated world has **no food anchors** (`world.placements.foodAnchors` is empty until worldgen-life,
  Stage 1B), so `initEcology -> initSources` creates no sources on a new game; the path itself is real and covered
  by sources-core's tests. The scenarios cheat-spawn their food. Carrion drops (sources-core, T1 x4) do run:
  about 130 insect-small and 25 insect-medium sources exist after one game day (by design, removed after 3 gd).

## 3. Defects fixed (file — cause — fix)

Seams (work item 2):
- `src/sim/services.ts` — the entity index was a private copy without `refreshWalkers`, so locomotion always did a
  full refresh; the nest's plug-seeded D_seal and D_plan fields were missing until the first tick after a load. Now
  uses loco's `createEntityIndexImpl` and nestops' `registerNestFields`; ENTRANCE_SEED_PAD_BU moved to balance/nest.
- `src/sim/wiring.ts` (new), called by `createSim` — pheromone hooks were never installed (base half-life at 22 C
  everywhere, alarm diffusing into soil). Installs `decayModifier` (environment surface / cavity temperature,
  Tmicro, sunlit-porous / sheltered exposure, the colony species' trail half-life) and `isFree` (field > 0), plus
  the nest clutter speed factor (`nest.clutterSpeedMult`) for walkers in cavities via `registerSpeedFactor`.
- `src/sim/ants/actions/defs/dig.ts`, `ports.ts` — dig-bite timed bites with the bare material table; now uses the
  nest module's `digSpeedAt` (moisture, LOOSE fill and mound piles x2, crusts x0.3/0.7; GDD 03 §2.1-2.2) through
  a new port `nestDigSpeedAt` (the testkit fake keeps the old material-only rule).
- `src/sim/colony/allocation/demand.ts`, `src/sim/nest/plans/stimuli.ts` — colony dig demand was a local estimate;
  now nest's new `digDemand(sim, colonyId)`: occupied slots + free slots weighted by plan priority / normal.
- `src/sim/colony/envAdapter.ts` — brood outside a registered chamber (a founding cell before registration) was
  timed with the SURFACE temperature; now `environment.microTemp` (cavity column underground, Tmicro outside).
- `src/sim/nest/mounds.ts` — mound changes never reached the nav grid (`notifySurfaceChanged` had no caller):
  ground and climb costs under mounds went stale, and a loaded game (fresh grid) diverged from the running one.
- `src/sim/world/index.ts` — `shadeAt` stub (0) now reads the generated shade map.
- `src/sim/colony/index.ts` — `cheat.spawnAnts` put ants at the ground height (inside stones or primitives; one
  soak violation at tick 0); now placed with the kernel's `walkerPlace` from 2 BU above. Also new
  `killColonyBrood` so brood killed outside the colony module is counted by cause (`cheat.kill` uses it), and the
  `brood-died` event carries `colonyId`.
- `src/sim/species/data/lasius-niger.ts` — queen lacked drop, harvest-liquid, unseal-entrance,
  trophallaxis-give; gyne and male lacked sniff / antennate (GDD 01 §7.3 'Who'). A possessed founding queen could
  not reopen her plug or drop a pellet.
- `src/sim/sim.ts` — `setPlayerIntent` accepted a NaN direction (F3b's defence-in-depth request): sanitised.
- `src/sim/createGame.ts` — a winter start was refused only after generating the whole world (seconds).

Determinism found by scenario (c):
- `src/sim/nest/chambers/registry.ts` — a chamber without a detected region (a founding cell smaller than the core
  test) was re-derived every pass from its padded ellipsoid and crept up its shaft by a few voxels per pass; a load
  re-detected it differently. It now keeps its record and only ever shrinks.
- same file — a chamber whose centre or radii changed by less than CHAMBER_CHANGE_FRACTION kept nav fields seeded
  at the old centre (refresh only on big volume changes); a load seeded from the record. Now any seed change
  refreshes the nest fields.

Truncated review findings (work list 2):
- loco [major] "any nav-grid change rebuilds every flow field synchronously" — `src/sim/locomotion/grid/search.ts`,
  `navGridImpl.ts`: flow fields keep their shortest-path tree; the grid logs the cells each version changed
  (cost overlays, portals, re-derived areas — only cells whose edge costs can actually change); a stale field is
  repaired by resetting the branches that used a changed edge and re-running Dijkstra from their border. Edge costs
  are quantised to 1/4 mm (power of two, exact in float32), so a repaired field equals a full rebuild bit for bit
  (tested: `grid/flowRepair.test.ts`) and save/load stays deterministic. Standard map (250 x 250 cells): full build
  45.6 ms, repair after a local change 2.1 ms (min of 5). A change touching the seeds (a mound at the entrance)
  still resets most of the tree.
- loco [major] same finding, "A* budget is a count, not a cost" — new `planExpandBudget` (20,000 node expansions
  per tick, first plan always runs) next to the count budget (`runtime.ts takePlanBudget`).
- loco [major] non-finite destinations — already rejected (`startTrip` finite3); reviewer tests pass.
- loco [minor] contract layering — the persisted `NavScratch` shape moved to `src/sim/types/navScratch.ts`
  (locomotion re-exports it), so the save format no longer depends on an implementation file.
- loco [minor] groundY ignoring primitive tops — fixed by loco (reviewer test passes).
- loco [minor] entityIndex never wired — wired (above).
- nestops [minor] validation order — already in GDD order (`validate.ts` reports `unstable` after `too-large`).
- nestops [minor] dig-bite timing without moisture / LOOSE / crust — fixed (above).
- actions [minor] species data gaps — fixed (above).

Kernel-integration review minors (work item 4):
1. Non-finite query hangs PrimHash — `src/sim/world/primHash.ts` `query` returns nothing for non-finite bounds;
   `services.verify.test.ts` now includes Infinity positions.
2. Two test workers cannot walk out — the test controller flipped between "follow the exit field" and "walk away"
   at the rim; latched once at the opening, all 20 workers walk out (`testWorld.test.ts` now tests every worker).
3. `materialAt` allocates with overlays — `field.ts` overlayMaterialAt uses a scratch and `addOverlay`.
4. Soak timing negative — `tools/sim/soak.ts` subtracts only the checks made inside the run loop.
5. ENTRANCE_SEED_PAD_BU tunable outside balance — moved to `balance/nest.ts`.
6. Test nest chambers with zero capacity — `testNest.ts` fills capacity (nest's `capacityOf`), voxel count, seed.
7. `heightDeltas` not part of `field.height` — left (nobody writes deltas yet); owner below.

Tests that asserted stub behaviour, now asserting the real one: `testing/stubs.test.ts` (locomotion, nest, ants
real answers), `nest/nestops.verify.test.ts` (`it.fails` D_seal check is a plain `it`), `ants/actions/dig.test.ts`
(dig speed set through the nest port), `ants/actions/care.test.ts` (gyne may sniff), `pheromones/decay.test.ts`
AC2 (removes the environment modifier explicitly to test the base half-life). `createGame.test.ts` got
load-tolerant timeouts (each test generates a world).

## 4. Defects / gaps left (with reproduction)

- **Nest chamber detection cost** — about 0.3 ms per tick average in the soak but single passes up to tens of ms
  (soak `nest` max 271 ms under load); nestops' own report has the details. Repro: soak table below.
- **Locomotion first-tick spike** — `locomotion` max 1.1 s in the soak: the first tick attaches the world field to
  the 250 x 250 nav grid and builds the first flow field. Repro: soak, max column. Suggest attaching at createSim.
- **Flow repair near seeds** — a mound batch next to the entrance resets most of the entrance flow tree (cost
  close to a full build). Repro: `test-output` probe `probe-flow.ts` style: setCostMult next to the seed cell.
- **Brood in the soak** dies or piles up as pupae: the scripted care feeds and tends but nobody carries brood or
  sorts it (beh-nest). Not a module defect.
- `WorldDelta.heightDeltas` are not part of `field.height` (F-int minor 7): nobody writes them yet; worldgen /
  loco (GDD 04 check 19) must register them as height overlays when they do.
- Per-source hourly update stagger, sources-core's T2 data items, env-core's 3 h wood-cavity smoothing and live
  shade (findings 8b/c/f), nestops' 10 s stall debounce and bite ordering (need contract fields): left to their
  owners; see section 6.
- Perf tests under load: `kernel.perf.test.ts` BFS (166 ms vs 120 in the parallel suite), `pheromones/perf.verify`
  (7.9 ms vs 6) and `pheromones/caps.test.ts` AC7 (timed out at 120 s in the parallel suite) fail only in the full
  parallel run at load 18-20 and pass when run alone (checked).

## 5. Performance (soak, 3 game days, 60 workers, seed 1)

`node tools/sim/run-ts.mjs tools/sim/soak.ts --days 3 --workers 60 --colony --seed 1` — see the table appended in
section 9 (filled from the final runs). Invariants: walker-finite, walker-free-space, non-negative,
state-encodes, walker-in-bounds, walker-stuck-explosion (new: more than 25 % of >= 8 moving walkers without
progress for 120 s), nest-records-finite, pellets-valid, nest-chambers-reach-exit.

## 6. Every notes item and its outcome

(notes-1A.md sections that concern src/sim, src/worldgen, src/core, tools/sim; R = resolved here, O = owner's
later task, N = no action needed, W = worldgen, see section 7.)

**phero**: move balance to src/sim/balance — R (`balance/pheromone.ts`, rain precipNorm single-sourced from
environmentWeather). Install hooks — R (`wiring.ts`). Weather wash, human wipe, combat alarm, behaviour trail
laying, scent view — O (weather-effects, human-events, combat, beh-forage, scent-fx). loco steering via sense — N
(loco uses it). Decay staggering — N (phero did it). layer.ts 432 lines — O (phero). Pending counters vs rain — O.
GDD E11 at 32 C in the game — R (hook installed; the decay modifier is tested in `wiring.test.ts`).

**colony-core**: digDemand API — R (nest `digDemand`). chamberTemp / humidity — N (env-core real, nest upkeep
writes Chamber.temp/humidity). beh-nest / beh-forage / founding / overwinter APIs — O. progression stubs — O.
brood-died colonyId — R. Remedy registry id — O (design). AC3 tolerance and needRateP — O (orchestrator decision,
unchanged). Small per-tick allocations in brood/economy — O (measured 60-72 us/tick in the soak).

**actions**: balance re-export — R. devRate / stageDu re-export — R. loco items (tempFactor, isGripping, let-go,
carried item positions) — N (loco reads them). nestops items — R (dig speed); planDigAim for AI diggers — O
(beh-nest). AFK on/off and cycle-target contract fields — O (contracts owner; not added: no spec here asked for
them). species-data gaps — R. opening.layBatches — O (founding). lastInputTick reset on load — O (save).

**sources-core**: `export * from './ecology'` in balance — R. crop toxin/water fields, carrionMult, persisted
intake — O (contracts). actions/colony/beh-forage calls — N/O. worldgen-life anchors — W/O (none yet, section 2).
isEmpty vs units<=0 in food.ts — O (actions; harmless today).

**env-core**: createGame initialising thermal — not done (would change the first tick's state and the
env-core tests that pin "degraded until started"); left to env-core / game start. weather-effects /
human-events stubs — O. heatStress, progression alerts — O. nestops chamberTemp each 250 ticks — N (done).
locomotion bodySpeedMult with ant.tb — N (loco `tempSpeedFactor` uses speedMult(ant.tb)). Wood smoothing, live
shade, cover thickness — O.

**loco**: entity index — R. stubs.test — R. LOCO_TUNING / MATERIAL_GRIP re-export — R (`balance/locomotion.ts`).
nest crowding / squeeze factors — R for clutter (registered); crowding/squeeze — O (nestops never wrote them).
notifySurfaceChanged after prims / mounds — R for mounds; dynamic primitives — O (nobody moves prims yet).
setLocoObserver / integratePossessed from the game — app half. Micro state — N. All truncated findings: section 3.

**nestops**: action dig speed — R. stubs.test — R. field.diggability delegating to digSpeedAt — not done on
purpose (the field query stays the pure material table; the action uses the nest rule). nestTemplate vs species
data — O (species-data). clutterSpeedMult in loco — R. registerNestFields in createServices and `it.fails` — R.
DigPlan.blockSinceTick, bite ordering — O (contracts / actions). Stimuli use — R (digDemand). Detection cost — §4.

**worldgen-terrain**: dmath to core, R1 repair, lanes, GroundLayers depth, worker build — W/O. soak timing — R.
stubs.test loco — R. walker stalls at sharp kinks — O (kernel/worldgen; none seen in the soak).

**F3b-game** sim items: non-finite intent — R. possessedPose export — N (exported from locomotion index).
**render-ants** sim items: CALLOW on eclosion — N (colony sets it). Clump eggs carriedBy — N (actions sets it).
Corpse caste on Item — O (contracts). integratePossessed: the tick is authoritative, `possessedPose(sim)` is the
per-frame prediction (loco decision) — answer for the app half.
**render-world** sim items: mounds in the world field — N (height overlays since F-int). heightDeltas layout — O.
sunDirection — N (env-core real).
**F-int-foundation**: all seven review minors — section 3; NATURAL flags — N (nestops writes them at tick 0);
plan fields / nestops wiring — R; 02-kernel.md overlays doc — O (doc owner); TODO(integration) comments — R.
**F2-kernel**: wiring items — N (done by F-int). Perf note on Vitest getters — kept (wiring.ts closures are not hot
loops).

notes-truncated-findings.md: loco (all six) — section 3; nestops (three) — section 3; actions (one) — R;
worldgen-terrain (three minors) — section 7; render-* items — app half.

## 7. World generation

The world-generation engineer's review fixes were uncommitted and changing during this gate
(`git diff --stat src/worldgen`: 20 files, last edits about an hour before this report). Per the timing note no
worldgen file was edited here. Observations: `dlog(Infinity)` is already guarded in the working copy; the
generated world has no food anchors (worldgen-life); world generation takes about 5 s per standard world under
load (1 s idle per the worldgen report), which makes every test that generates a world slow. Worldgen test results
from the final run are in section 9.

## 8. What Stage 1B tasks must know

Behaviours never move ants directly and never touch the stores; these are the calls (all exported from the module
index):
- Locomotion: `navTo(sim, w, dest, arrive?, opts?)` point goal; `navToTarget(sim, w, {kind,id,pos})` entity /
  chamber / entrance / source goal; `navFollowField(sim, w, nestId, {kind,id})` nest field downhill;
  `navFollowTrail(sim, w, colony, channel, 'out'|'in')`; `navRetrace(sim, ant)` home by breadcrumbs; `navWander`;
  `navStop`; poll `w.nav.status` ('moving' | 'arrived' | 'failed' | 'idle'). `crumbAt / crumbCount` route memory.
  `registerSpeedFactor(sim, fn)` for spatial slowdowns; `notifySurfaceChanged(sim, min, max)` after moving a
  dynamic primitive (mounds already call it).
- Actions: `canDo(sim, ant, id, target)`, `begin(sim, ant, id, target, {repeat})`, `cancel`, `stopAction`; poll
  `ant.action` (null = done) and the `action-completed` / `action-failed` events. dig-bite times bites with the
  nest's substrate rule; a 'point' target aims the ramp slope, the heading is the ant's forward.
- Colony: `recordDelivery(sim, ant, sourceId, kind, c, p, toxin?, waitTicks?)` books an unload into the ledger;
  `recordForagerReturn(sim, ant, success, sourceId, tripTicks?)` news, known sources, recruitment;
  `shouldDepart`, `curfew`; nurses `nurseLoadMix` -> `withdrawFood(..., 'transit', ant)` -> `feedBrood`;
  `tendBroodAt`, `ecloseBrood`, `canLay` / `layEgg`, `queenRationMix`, `feedQueenFromReserve`,
  `nextCannibalVictim` / `cannibaliseBrood`, `taskCycleDone`, `killColonyBrood`.
- Ecology: `discoverSource(sim, colonyId, sourceId, antId)` on arrival; `nearestSource`, `footprintMm` (reach);
  harvesting goes through the `harvest-liquid` / `harvest-solid` / `pick-up` primitives.
- Nest: `claimDigSite` / `releaseDigSite`, `slotInReach`, `planDigAim(sim, ant, feet, headingOut)` (slope),
  `dumpPoint`, `digDemand` / `haulStimulus`, `bestBroodChamber`, `nearestEntrance`, `findChamberAt`;
  architect: `validatePlan(..., 'architect')`, `createPlan(..., 'architect')`.
- Pheromones: `sim.phero.deposit(colony, channel, pos, amount)`, `sim.phero.sense(...)`, `strongestNear`;
  constants TRAIL_DAB, TRAIL_DETECT etc. from `@/sim/balance`. Deposit trail and home on surfaces only.
- Environment: `microTemp(sim, pos, medium)`, `chamberTemp`, `surfaceActivity`, `forageGate`, `speedMult`.
- Founding: set `nest.founding.state` through your own module (the scenario writes it directly today) and the
  opening phase; `layEgg` pays founding eggs from the founding pool in the lay phases.
- Keep behaviour state in `ant.bb` (numbers only): scenario (c) shows that is what keeps save/load exact.
- The scripted stand-ins in `src/sim/testing/e2e/` show working call sequences for foraging, digging and care.

## 9. Final verification

(filled in below after the final runs)
