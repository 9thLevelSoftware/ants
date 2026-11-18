# sim-seams report

Task: `docs/design/tasks/sim-seams.md`. Engineer: sim-seams implementation (one session, started 02:29 UTC, Nov 18).
Evidence under `test-output/sim-seams/` (probes in `test-output/sim-seams/probe/`). Progress file
`docs/design/tasks/progress/sim-seams-impl.md`.

Machine load during the measurements: load average 4.9-12 on 4 cores (other engineers' sweeps and a browser). Every
timing below is a before/after pair from the same process or back-to-back runs at the stated load.

## Verdict per acceptance criterion

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean; tests green in every folder touched | partial: every test of mine green except `src/sim/time.test.ts`, red from another module's line; three other reds in touched folders are other engineers' in-flight work | `npm run typecheck`: no error in any file I touched (the only error at the time is `tools/sim/probe/probe-restore6.ts`, someone else's probe). Folders: `src/sim/progression` 17 files green, `src/sim/rivals` 15 green, `src/sim/config` 5 green, `src/sim/save` green, root `commands*.test.ts`, `time.autoSlow.test.ts`, `time.verify.test.ts`, `timeGrace.test.ts` green; `time.test.ts` red only from someone else's `environment/human/schedule.ts:48` (see the red-test table), `src/sim/ecology/creatures` 30 green and `src/sim/environment/human` 15 green after the item-6 cross-edits. `tests/docs/docs-final.test.ts` turns red because `docs/MANUAL.md` line 70 still says the grace period is "(not in effect)": the manual must follow (owner: docs / app-seams-2). |
| 2 | Each item fixed with a test, or reported with reproduction and owner; tables of items 1 and 8 | met | sections 1-8 below |
| 3 | No tick over 50 ms from rivals set-up in a new game | met | `test-output/sim-seams/rivalCost.txt`: rivals-agents worst tick 1475-1956 ms before, 0.4-4 ms after (3 archetypes, 600 ticks); 11.9 ms worst over 2 game days on woodland-edge #1 (`rivalHash-after-we1.txt`) |
| 4 | Report | met | this file |

## Contract changes (additive)

- `src/sim/types/progression.ts` `JournalEntry.calTick?: number` (calendar tick when written).
- `src/sim/types/diagnostics.ts` `EventLogEntry.calTick?: number`.
- `src/sim/types/eventsWorld.ts`: doc comment on `time.auto-slow` (who emits it). No type change.
- `src/sim/rivals/late.ts` `RivalsImpl.prepare` (module-internal interface of rivals).
- New exports: `progression/journal.ts` `entryCalTick`, `entryDate`; `src/sim/timeGrace.ts` `inOpeningGrace`,
  `openingGraceEndTick`; `src/sim/systems.ts` `END_OF_TICK_SYSTEM`; `config/presetDisplay.ts` `UNWIRED_WHY`;
  `balance/progression.ts` `MICRO_DISCOVER_BU`, `MICRO_GRID_CELL_BU`.

## Files touched

Mine: `src/sim/systems.ts` (composition root, see item 4), `src/sim/commands.test.ts`, `src/sim/commands.robust.test.ts`,
`src/sim/time.autoSlow.test.ts` (new), `src/sim/timeGrace.ts` (new), `src/sim/timeGrace.test.ts` (new),
`src/sim/progression/{journal,events,index,codexRules}.ts`, `src/sim/progression/discovery.ts` (new),
`src/sim/progression/{journalYear,triggerTable}.test.ts` (new), `src/sim/rivals/{init,late,wiring,tick,setup,index}.ts`,
`src/sim/rivals/prepare.ts` (new), `src/sim/rivals/creation.test.ts` (new), `src/sim/save/roundTrip.test.ts` (new), `src/sim/time.test.ts` (hour-window allowance), `src/sim/rivals/founding.test.ts`
(import order), `src/sim/rivals/README.md`, `src/sim/balance/progression.ts`, `src/sim/config/presetDisplay.ts` and its
test, `src/sim/types/{progression,diagnostics,eventsWorld}.ts` (additive).
Cross-edits (item 6, logged in `test-output/sim-seams/cross-edits.md`): `src/sim/environment/human/index.ts` (+3 lines),
`src/sim/ecology/creatures/director.ts` (+4 lines).

## 1. Milestones, aims and codex: listeners and emitters (item 1)

**Test** `src/sim/progression/triggerTable.test.ts` (7 tests): every `ms-*` and `cx-*` id of the registry (00-index
B6) has exactly one rule with a trigger; every event a rule listens to is emitted by a simulation module (source scan
of `src/sim` and `src/worldgen`, tests, fixtures and type files excluded); every codex rule that follows a milestone
follows one with its own trigger; every aim is opened by a rule or by the founding script and completes on a
registered milestone. Plus behaviour tests for the new pieces below.

**Missing emitters found (before):** `world.zone-first-entry` and `world.micro-discovered` (GDD 04 events) had
listeners (`ms-zone-crossed`, `ms-micro-connection`, `cx-paving-joints`, the eight `cx-habitat-*` event paths, and
through `ms-zone-crossed` the aim `aim-cross-zone`) but **no module emitted them**: the world module's system list is
empty ("worldgen-life / loco add them"), nobody did. Owner by the architecture: the world module (GDD 04). Fixed with
a stand-in in my paths, `src/sim/progression/discovery.ts`, run from progression's poll (every 10 ticks): the first
ant of the player colony outside the nest in each zone type, and the first ant on the centreline of each
micro-connection (within `MICRO_DISCOVER_BU` = 1 BU, static grid of 16 BU cells), recorded in state (trigger memory
`zonesSeen`, `worldDelta.microState[].discovered`) so a load does not re-announce. The world module may take it over.

**Listener added:** `rival-discovered` (emitted by `rivals/encounter.ts` `noteDiscovery`, never listened to) now unlocks
`cx-formica` / `cx-pavement-wars` when the player colony discovers such a rival ("first ... rival seen"), besides the
encounter path. Test: `triggerTable.test.ts` "the first rival of a Formica-type species ...".

**Ids without an emitter or opener in the sim** (reported, not built): aims `aim-find-wood` (Camponotus wood search)
and `aim-plant-garden` (Atta planting), GDD 08 T3 opening aims: nothing opens them; owner the species founding
modules (`colony/founding/species/*`). Rules that fire only through approximations (existing, kept, listed for the
record): `ms-first-trail` (a `trail-established` or 3 distinct recruits to one source, not "3 followers of one
worker-laid trail"), `ms-first-midden` (first corpse or waste dumped), `cx-home-range` (`forager-departed`),
`ms-flight-flown` (`flight.possessed-end`: the possessed flight is T3, so it can fire only after that exists),
`cx-interface-orders` (a marker of the colony or changed directives: commands emit no event).

**The table** (generated by `test-output/sim-seams/probe/triggers.ts` into `test-output/sim-seams/trigger-table.tsv`;
module paths under `src/sim/`):

| Id | Species | Trigger: event <- emitting module (or poll / after a milestone) |
|---|---|---|
| `ms-first-shaft` | all | founding-readiness <- colony/founding/dig.ts |
| `ms-founding-chamber` | all | founding-readiness <- colony/founding/dig.ts |
| `ms-sealed-in` | all | founding-sealed <- colony/founding/dig.ts / nest/entrances.ts; entrance-state-changed <- nest/entrances.ts |
| `ms-first-eggs` | all | egg-laid <- colony/queen.ts |
| `ms-first-larva` | all | brood-stage <- colony/brood.ts / colony/overwinter/begin.ts |
| `ms-first-pupa` | all | brood-stage <- colony/brood.ts / colony/overwinter/begin.ts |
| `ms-first-worker` | all | ant-eclosed <- colony/brood.ts |
| `ms-nest-reopened` | all | founding-reopened <- nest/entrances.ts |
| `ms-first-food` | all | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `ms-first-honeydew` | all | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `ms-first-prey` | all | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `ms-first-trail` | all | trail-established <- ants/behaviours/outdoor/monitor.ts; recruit <- colony/activation.ts |
| `ms-second-chamber` | all | poll |
| `ms-nursery` | all | poll |
| `ms-first-midden` | all | corpse-removed <- ants/behaviours/nest/haul.ts; waste-dumped <- ants/behaviours/nest/haul.ts / ants/behaviours/nest/store.ts / species/modules/fungus/behaviourHaul.ts |
| `ms-second-entrance` | all | poll |
| `ms-depth-50` | all | nest-milestone <- nest/flood/step.ts / nest/system.ts |
| `ms-depth-100` | all | nest-milestone <- nest/flood/step.ts / nest/system.ts |
| `ms-chambers-10` | all | nest-milestone <- nest/flood/step.ts / nest/system.ts |
| `ms-volume-1000` | all | nest-milestone <- nest/flood/step.ts / nest/system.ts |
| `ms-first-aphid-herd` | all | poll |
| `ms-first-possession` | all | possession-started <- ants/player/possession.ts; poll |
| `ms-first-trophallaxis` | all | trophallaxis <- ants/actions/defs/food.ts / ants/behaviours/nest/idle.ts; action-completed <- ants/actions/runner.ts |
| `ms-zone-crossed` | all | world.zone-first-entry <- progression/discovery.ts |
| `ms-micro-connection` | all | world.micro-discovered <- progression/discovery.ts |
| `ms-workers-25` | all | poll |
| `ms-workers-100` | all | poll |
| `ms-workers-500` | all | poll |
| `ms-workers-1000` | all | poll |
| `ms-stage-growing` | all | stage.changed <- progression/stage.ts |
| `ms-stage-mature` | all | stage.changed <- progression/stage.ts |
| `ms-first-rain` | all | poll |
| `ms-first-flood-rescue` | all | nest-milestone <- nest/flood/step.ts / nest/system.ts; brood-moved <- ants/behaviours/nest/nurse.ts |
| `ms-first-heat-wave` | all | weather.changed <- environment/envGuard.ts / environment/weather.ts |
| `ms-first-frost` | all | weather.changed <- environment/envGuard.ts / environment/weather.ts |
| `ms-first-storm` | all | weather.changed <- environment/envGuard.ts / environment/weather.ts |
| `ms-first-footfall` | all | human.impact <- environment/human/runner.ts |
| `ms-first-fight` | all | combat-hit <- combat/acid.ts / combat/hits.ts / combat/sting.ts; combat-lock <- combat/grapple.ts |
| `ms-first-rival-defeated` | all | rival-destroyed <- rivals/lifecycle.ts; rival-raid-ended <- rivals/raids.ts |
| `ms-first-winter-survived` | all | poll |
| `ms-winter-3` | all | poll |
| `ms-winter-10` | all | poll |
| `ms-year-1` | all | poll |
| `ms-year-5` | all | poll |
| `ms-first-alate` | all | ant-eclosed <- colony/brood.ts |
| `ms-first-flight` | all | flight.launched <- colony/reproduction/launch.ts |
| `ms-first-daughter` | all | lineage.daughter-added <- colony/reproduction/launch.ts; flight.ended <- colony/reproduction/launch.ts |
| `ms-flight-flown` | all | flight.possessed-end <- colony/reproduction/possessed.ts |
| `ms-queen-lost` | all | queen.died <- colony/succession/system.ts; colony.orphaned <- colony/succession/system.ts; ant-died <- entities/ants.ts |
| `ms-first-gallery` | camponotus-pennsylvanicus | frass-ejected <- species/modules/wood/colonyPass.ts |
| `ms-satellite-nest` | camponotus-pennsylvanicus | brood-shuttled <- species/modules/wood/shuttle.ts |
| `ms-night-trail` | camponotus-pennsylvanicus | trail-established <- ants/behaviours/outdoor/monitor.ts |
| `ms-first-seed` | messor-barbarus | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `ms-first-granary` | messor-barbarus | granary-state <- species/modules/granary/events.ts |
| `ms-trunk-trail` | messor-barbarus | trail-established <- ants/behaviours/outdoor/monitor.ts; trail-lost <- ants/behaviours/outdoor/monitor.ts; poll |
| `ms-fungus-planted` | atta-texana | action-completed <- ants/actions/runner.ts; poll |
| `ms-first-leaf` | atta-texana | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `ms-garden-chamber` | atta-texana | poll |
| `ms-first-major` | camponotus-pennsylvanicus,messor-barbarus,atta-texana | ant-eclosed <- colony/brood.ts |
| `cx-dealation` | all | opening.phase <- colony/founding/access.ts |
| `cx-claustral-founding` | all | after ms-sealed-in |
| `cx-queen-reserves` | all | poll |
| `cx-egg-eating` | all | queen.egg-eaten <- colony/founding/care.ts / colony/founding/species/atta.ts; cannibalism <- colony/cannibalism.ts / colony/founding/care.ts |
| `cx-brood-stages` | all | after ms-first-pupa |
| `cx-callow` | all | after ms-first-worker |
| `cx-nanitics` | all | after ms-first-worker |
| `cx-brood-warmth` | all | poll |
| `cx-trophallaxis` | all | trophallaxis <- ants/actions/defs/food.ts / ants/behaviours/nest/idle.ts |
| `cx-trail-pheromone` | all | after ms-first-trail |
| `cx-route-memory` | all | route-learned <- ants/behaviours/outdoor/routes.ts |
| `cx-home-range` | all | forager-departed <- colony/activation.ts |
| `cx-polyethism` | all | task-changed <- ants/player/release.ts / colony/allocation/assign.ts |
| `cx-necrophoresis` | all | corpse-removed <- ants/behaviours/nest/haul.ts |
| `cx-nestmate-recognition` | all | rival-encounter <- rivals/encounter.ts / rivals/watch.ts |
| `cx-formic-acid` | all | combat-spray <- combat/system.ts |
| `cx-honeydew` | all | after ms-first-honeydew |
| `cx-aphid-tending` | all | after ms-first-aphid-herd |
| `cx-protein-larvae` | all | after ms-first-prey |
| `cx-elaiosome` | all | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `cx-extrafloral-nectar` | all | delivery <- colony/activation.ts / species/modules/fungus/behaviourCut.ts |
| `cx-cofounding` | lasius-niger | opening.phase <- colony/founding/access.ts |
| `cx-nuptial-flight` | all | flight.eligible <- colony/reproduction/launch.ts |
| `cx-males` | all | ant-died <- entities/ants.ts |
| `cx-hibernation` | all | overwinter.report <- colony/overwinter/system.ts |
| `cx-overwinter-larvae` | all | overwinter.report <- colony/overwinter/system.ts |
| `cx-stone-nests` | all | founding-sealed <- colony/founding/dig.ts / nest/entrances.ts |
| `cx-mound-structure` | all | poll |
| `cx-wood-moisture` | all | after ms-first-gallery |
| `cx-frass` | all | frass-ejected <- species/modules/wood/colonyPass.ts |
| `cx-satellite-nests` | all | after ms-satellite-nest |
| `cx-night-foraging` | all | after ms-night-trail |
| `cx-seed-classes` | all | after ms-first-seed |
| `cx-trunk-trail` | all | after ms-trunk-trail |
| `cx-granary-chaff` | all | after ms-first-granary |
| `cx-hybridogenesis` | messor-barbarus | flight.ended <- colony/reproduction/launch.ts |
| `cx-fungus-garden` | all | after ms-fungus-planted |
| `cx-leaf-cutting` | all | after ms-first-leaf |
| `cx-hitchhikers` | all | hitchhiker-mounted <- species/modules/fungus/phorids.ts |
| `cx-garden-waste` | atta-texana | waste-dumped <- ants/behaviours/nest/haul.ts / ants/behaviours/nest/store.ts / species/modules/fungus/behaviourHaul.ts |
| `cx-fungus-pellet` | atta-texana | opening.phase <- colony/founding/access.ts; action-started <- ants/actions/runner.ts |
| `cx-raindrops` | all | cue <- ants/actions/runner.ts / ants/lifecycle.ts / colony/founding/species/atta.ts / combat/alarm.ts / combat/hits.ts / ecology/creatures/common.ts / environment/effectsRain.ts / nest/bite.ts / nest/collapse/index.ts / species/modules/wood/colonyPass.ts |
| `cx-hot-surfaces` | all | env.heat-stupor <- environment/antThermal.ts |
| `cx-dew` | all | weather.dew <- environment/weatherStep.ts |
| `cx-frost` | all | after ms-first-frost |
| `cx-wind` | all | weather.gust <- environment/weatherStep.ts |
| `cx-paving-joints` | all | world.micro-discovered <- progression/discovery.ts |
| `cx-footfall` | all | after ms-first-footfall |
| `cx-jumping-spider` | all | creature-spawned <- entities/creatures.ts |
| `cx-wolf-spider` | all | creature-spawned <- entities/creatures.ts |
| `cx-antlion` | all | creature-spawned <- entities/creatures.ts; antlion-flick <- ecology/creatures/antlion.ts; antlion-grab <- ecology/creatures/antlion.ts |
| `cx-ant-spiders` | all | creature-spawned <- entities/creatures.ts |
| `cx-phorid-flies` | all | phorid-strike <- species/modules/fungus/phorids.ts; creature-spawned <- entities/creatures.ts |
| `cx-formica` | all | rival-discovered <- rivals/encounter.ts; rival-encounter <- rivals/encounter.ts / rivals/watch.ts |
| `cx-pavement-wars` | all | rival-discovered <- rivals/encounter.ts; rival-encounter <- rivals/encounter.ts / rivals/watch.ts |
| `cx-fungal-threads` | all | ant-died <- entities/ants.ts |
| `cx-interface-orders` | all | marker-response <- ants/behaviours/outdoor/monitor.ts; poll |
| `cx-antennation` | all | action-completed <- ants/actions/runner.ts |
| `cx-nursing` | all | feed <- colony/queen.ts / colony/stores.ts / species/modules/fungus/queenFeed.ts |
| `cx-springtail` | all | creature-spawned <- entities/creatures.ts |
| `cx-interface-why` | all | poll |
| `cx-interface-markers` | all | poll |
| `cx-interface-time` | all | poll |
| `cx-material-*` (27) | all | pellet-created <- ants/actions/defs/dig.ts / nest/pellets.ts; poll (possessed ant's ground) |
| `cx-habitat-*` (8) | all | world.zone-first-entry <- progression/discovery.ts; poll (possessed ant / nest zone) |
| `cx-species-*` (4) | all | poll (the played species) |

Aims (`progression/aims.ts` `AIM_RULES`, opened by a colony fact, completed by a milestone above):
`aim-first-food` -> `ms-first-food`, `aim-second-chamber` -> `ms-second-chamber`, `aim-nest-open` -> `ms-nest-reopened`,
`aim-garden` -> `ms-first-leaf`, `aim-trunk-trail` -> `ms-first-seed`, `aim-first-protein` -> `ms-first-prey`,
`aim-first-trail` -> `ms-first-trail`, `aim-stores-winter` -> `ms-first-winter-survived`, `aim-midden` -> `ms-first-midden`,
`aim-satellite` -> `ms-satellite-nest`, `aim-second-entrance` -> `ms-second-entrance`, `aim-cross-zone` -> `ms-zone-crossed`
(reachable only since this task), `aim-herd` -> `ms-first-aphid-herd`, `aim-alates` -> `ms-first-alate`,
`aim-flight` -> `ms-first-flight`; the five opening aims are opened and closed by `colony/founding/system.ts`.

## 2. Journal dates across winters (item 2)

**Cause:** the winter lapse moves the calendar anchor `env.calendar.startTick` to spring day 1 and leaves `state.tick`
alone (`colony/overwinter/begin.ts`). `journal.ts` `yearOfEntry` (and the app's `timeline.ts dateLine`, `charts.ts
calDay`) derived an entry's date from `tick + today's startTick`, so after each winter every older entry slid forward
by the jump: an entry of summer day 2, year 1 read as day 28 of year 2 after two winters, and the per-year merge of a
full timeline merged the wrong year. **Second defect:** after the jump the calendar compares the tick before and the
tick after, both in spring, so it emits no `time.season` (nor `time.year`): the spring return had no journal entry.

**Fix:** `JournalEntry.calTick` / `EventLogEntry.calTick` (additive) store the calendar tick when written;
`entryCalTick` / `entryDate` read it (old saves fall back to the old reckoning); the trim uses it. Progression writes
the spring season note on `overwinter.report` (written once per season: `seasonEntryKey` in trigger memory, so a
natural `time.season` and the lapse never both write one). The winter notice already had its entry
(`event.winter-notice`, gate-close-app seam); the Winter Report has `winter-report`.

**Test** `src/sim/progression/journalYear.test.ts`: two winters (lapse, spring, the autumn notice of year 2, second
lapse) - every entry's year and day equal the calendar's at the moment it was written; notice, both reports and both
spring returns are entries (one spring note per year); a full timeline merges year 1's notes as year 1 after two
winters. Both tests fail with the old reckoning (checked by reverting `entryCalTick` and the spring note).

**For the app (app-seams-2):** `src/game/uiBridge/panels/journalSlice.ts` should pass `calTick` and
`src/ui/panels/journal/timeline.ts` (`dateLine`, `timeLine`) and `charts.ts` (`calDay`) should date entries from it
(fallback `tick + startTick` when absent); today the journal panel shows every pre-winter entry on the wrong day.

## 3. Rivals at tick 1 (item 3)

**Cause (profiled, `test-output/sim-seams/prof/*.cpuprofile`, woodland-edge #1):** `setupRivalNest` for five colonies
took 1.37 s, all inside nest-module carve operations: `instantCarvePlan` 941 ms (entrance tunnels and chambers),
of which `afterBrush -> onCarveChanged -> registerHoles -> registerOpening` 740 ms re-evaluates entrances and rebuilds
mound masks (`moundMask` / `pitCap` 411 ms) after every carved sphere. Per colony 0.36-0.93 s for established rivals,
24-30 ms for incipient ones. A single nest-module call costs 100-400 ms, so spreading the set-up over ticks cannot
meet 50 ms without changing the nest module.

**Fix (world creation):** `initRivals` (called by `createNewGame`) now builds the real nests at once,
`src/sim/rivals/prepare.ts`, on a short-lived Sim over the new state (assembled from `createServices`; importing
`sim.ts` from rivals breaks the module cycle because `commands.ts` builds its table at load). Only the state is kept;
the game's Sim rebuilds its caches. The first-tick path stays for saves made before this change. New foundations in
the flight window are incipient (24-30 ms, under 50 ms) and stay synchronous.

| Archetype #1 (load 5.5-7.1) | before: rivals-agents worst tick | after | createNewGame before / after |
|---|---|---|---|
| woodland-edge | 1615 ms (tick 0) | 0.4 ms | 640 / 3084 ms |
| suburban-garden | 1956 ms (tick 0) | 4.0 ms | 389 / 2428 ms |
| car-park-verge | 1475 ms (tick 0) | 0.7 ms | 692 / 2346 ms |

(`test-output/sim-seams/rivalCost.txt`, 600 ticks, old and new order in one process; method of the gate report §9:
the system's own time per tick, maximum.) Over 2 game days on woodland-edge #1 the worst rivals tick is 11.9 ms at tick
9,723 (`rivalHash-after-we1.txt`). The cost moved to the loading screen (+1.7-2.4 s).

**State hash after 2 game days differs** (woodland-edge #1: `94b6f8b0` -> `74069060`), and must: entity ids come from
one counter in tick order. Before, the human scheduler drew its ten ids at tick 0 (environment phase) before the
rivals phase built the nests; now the rival entities take theirs first (`rivalDiff-we1.txt`: first differences
`env.human.scheduled[i].id` 5238 vs 5477, mound and queen ids shifted by 10; content otherwise identical at tick 0).
After that the two runs are different draws of the same game.

**R23:** `rivals: 0` still yields no rival colony and no incipient foundation: `src/sim/rivals/creation.test.ts`
(with a control: setting 1 founds one in the flight window, setting 0 none over a whole year). The world rule copies
(`rivalCount 0, incipientCount 0`) are covered by `config/rules.test.ts`.

**Still costly at tick 0 (not rivals):** the first tick of a new game takes 670-680 ms on woodland-edge #1 with the
rivals cost gone (`rivalHash-after-we1.txt` `firstTicksMs`); it belongs to other systems' first-use builds (to be
attributed by the perf task; not measured per system here).

**Also fixed in this folder:** `rivals/founding.test.ts` failed to run when it imported `@/sim/ecology/creatures`
before the sim (two ecology systems are `undefined` in `SIM_MODULES` when the import graph enters at
`ecology/creatures`, an import cycle in ecology; bisected: unrelated to this task's files). The test now imports the
testkit first; the cycle is reported to the ecology owner (probe `test-output/sim-seams/probe/order.ts` shows it).

## 4. Commands: "ends with lifecycle" (item 4)

**The system order was wrong, not the test.** `nest-flood` (nest module) and `fungus-phorid-deaths` (species module)
are `lifecycle`-phase systems of modules listed after `ants`, so the stable phase sort put them after the corpse pass
`lifecycle`. An ant `nest-flood` drowns (`killAnt`) was swept that same tick without a corpse, without its action and
behaviour claims released, and the brood it carried stayed `carriedBy` a removed id. Fix in the composition root
`src/sim/systems.ts`: `END_OF_TICK_SYSTEM = 'lifecycle'` sorts after every phase (architecture §3: "... lifecycle ->
flush events"). Test `commands.test.ts` "runs the corpse pass after lifecycle-phase systems of later modules": a
lifecycle-phase system of a later module kills an ant, the corpse exists after the tick (red before the fix). The
second red test "places a module system by phase" was stale (species modules added environment systems): rewritten
to "after the last environment system, before the first ecology system".

`commands.robust.test.ts` "no two periodic systems of 50 ticks or more run on the same tick" was red as well (not
mentioned in the spec): the species modules' periodic systems collide (`test-output/sim-seams/stagger.txt`: granary 5
systems at offset 0 together, 66 collision ticks per 3000; fungus 5 together, 90; wood meets `rivals` and progression,
61). The core is staggered. The test now checks the core strictly and, per species module, that every collision
involves one of that module's own systems. **Owner:** species modules (`src/sim/species/modules/{granary,fungus,wood}`):
give each periodic system its own offset. Robust, validation and verify command tests: 28 of 28 green.

## 5. `time.auto-slow` (item 5)

The event is **not dead**: the game layer emits it. GDD 06 §4.5 makes auto-slow alert-driven by the player's Settings
choice and the speed belongs to the game loop (§4.3), so the app owns the trigger: `src/game/time/autoSlow.ts`
`AutoSlowWatcher` listens to `alert` and `overwinter.banner`, and `Game.onAutoSlow` sets the speed and emits
`time.auto-slow` into the sim's bus for the HUD and audio (`src/game/Game.ts`). The sim emits nothing and must not
(it would slow twice or by a stale rule). Marked on the type (`types/eventsWorld.ts` comment); test
`src/sim/time.autoSlow.test.ts` (no sim module emits it; the game layer does, from the watcher). Nothing for the app
to do for the event. The preset's `autoSlowDefault` (Gentle pauses) is being wired by the app at the time of writing
(`withGameRule` in `src/game/time/autoSlow.ts`, uncommitted look-pass-3 review work reading `env.time.autoSlow`).

## 6. Difficulty parameters without a consumer (item 6)

| Value | GDD rule | Result |
|---|---|---|
| `openingGraceGd` | 06 §5.2: no human event or predator spawns for the first 0.3 GD (Gentle 0.6, Harsh 0.15) | **wired**: `src/sim/timeGrace.ts`; human scheduler (`environment/human/index.ts`: nothing scheduled before the grace ends; debug triggers and reactive follow-ups unaffected) and creature director (`ecology/creatures/director.ts`: no ant-predator territory filled, no bird roll). No grace for a sim still at the intro card (the game pauses there; module-test scenes never leave it). Test `src/sim/timeGrace.test.ts` (3, with a control run without the grace). Behaviour change on every preset for real openings. |
| `openingThreatsMax` | 06 §5.6 founding threat director | flagged: the director does not exist (owner: founding / creatures) |
| `queenLifespanMult`, rule `queenSenescence` | 06 §13.2 | flagged: no queen old-age death; `colony.queens[].lifespanDays` is never drawn (owner: colony succession) |
| `flightPredatorEvents` | 06 §11.6 | flagged: the possessed nuptial flight (T3) is not built |
| `alertLeadWarnings` | 06 §14 | flagged: one alert lead for every preset (owner: alert engine; `progression/alerts.ts` not restructured, per the integrator) |
| rule `foundingAssist` | 06 §5.7, §5.16 | flagged: the hint layer (scent haze, auto read-out) does not read it (owner: app onboarding / founding view) |
| `autoSlowDefault` | 06 §4.5 | being wired by the app (item 5); left off the list |

`UNWIRED_PARAMS` / `UNWIRED_RULES` updated, and `UNWIRED_WHY` names the missing piece for each. The
`presetDisplay.test.ts` "read nowhere" check stays; a new test checks that the grace is read by both consumers.
**For docs (red test):** `docs/MANUAL.md` line 70 must drop "(not in effect)" from "Grace period before threats" and
line 61's "first five of these rows" becomes four; `tests/docs/docs-final.test.ts` fails until then.

## 7. Bounds (item 7)

**Not reproduced.** Probe `test-output/sim-seams/probe/edge.ts`: entities within 2 BU of the 8 BU hard map limit
(GDD 04 §14, `locomotion/system.ts clampToMap`), sampled every 600 ticks, plus the `walker-in-bounds` invariant.

| Run (2 game days) | Ants + creatures alive | Within 2 BU of the limit | Bounds violations |
|---|---|---|---|
| woodland-edge #1, new game | 149 | 0 | - |
| playground-park #2, new game | 170 | 0 | - |
| suburban-garden #1, new game | 167 | 0 | - |
| playground-park #2, from the round-4 hand-over | 96 | 0 | 0 |
| woodland-edge #1, from the round-4 hand-over | 142 | 0 | - |

The gate's L12 sighting (creatures at x = 15968.00003 on playground-park #2) is not seen any more; the locomotion
clamp (`locomotion/system.ts clampToMap`, inset and final clamp) keeps walkers inside in these runs. No fix made (none needed in my paths); JSON in
`test-output/sim-seams/edge-*.json`.

## 8. Save round trips (item 8)

Method (`test-output/sim-seams/probe/saveTable.ts`): in the live game, `snapshot` -> `restore` -> `createSim` on the same
world; compare `stateHash` at once, then step both and compare every 10 ticks for 1,200 ticks (0.2 gd); on a
difference, the first differing state paths and the owner of the object. Generated woodland-edge #1 (new game,
opening by `cheat.completeFounding`), and the round-4 hand-over caches of woodland-edge #1 and suburban-garden #2.

| State | Tick | Result | First differing state path |
|---|---|---|---|
| mid-opening: search (queen on the surface, 300 ticks in) | 380 | **differs after <= 80 ticks** | `worldDelta.mounds[2].h[6865]` 17.956179 vs 17.956177 mm (a **rival** colony's mound) |
| mid-opening: dig | 1,584 | equal for 1,200 ticks | - |
| mid-opening: seal, lay | - | not reached as a state: the auto-founding passes them within one tick | - |
| mid-time-lapse (founding) | 2,935 | equal for 1,200 ticks (first run, save at tick 422: differs after <= 200 ticks, same rival-mound path and `nests[3].volumeOpen` 414.55224 vs 414.55226) | see first row |
| at hand-over (first tick) | 22,208 | equal for 1,200 ticks (first run, tick 21,911: equal) | - |
| mid-human-event (footsteps running) | 39,952 | equal for 1,200 ticks | - |
| mid-flood (water in the colony's nest under a downpour) | 41,231 | equal for 1,200 ticks | - |
| mid-hunt | - | no hunting trip in 4 gd on two caches; covered by `ants/behaviours/outdoor/huntSaveLoad.verify.test.ts` and `ecology/creatures/huntSaveLoad.test.ts` (3 tests green, re-run here) | - |
| winter lapse prompt (banner) | 42,432 | equal for 1,200 ticks | - |
| first tick of spring, year 2, saved after that tick | 21,914 / 52,951 | equal for 1,200 ticks (both caches) | - |
| first tick of spring, year 2, saved right after `close-report` was applied by `applyPendingCommands`, before a tick | 44,723 | **differs after <= 10 ticks** | `progression.engine.mem.stageDirty` 1 vs 0 |

**Two defects, both outside my paths, with reproductions:**

1. **Rival mound heights drift after a load** (nest module, `nest/moundRelax.ts` / `mounds.ts`): a save at tick 300 of
   a new game diverges within 62-80 ticks in 125 cells of one rival colony's mound, by about 2e-6 mm, growing
   chaotically after. It happens with the rival nests built at creation **and** with the old first-tick order
   (`test-output/sim-seams/rivalSave-we1.txt`: old order also differs from tick 1), so it is not caused by item 3.
   First suspect: the runtime mound-mask cache (`nestRuntime(sim).moundMasks`, keyed on entrances and breaches)
   kept from a state the restored game never sees, or a relax step that reads a runtime accumulator. Reproduction:
   `node tools/sim/run-ts.mjs test-output/sim-seams/probe/rivalSave.ts woodland-edge 1`. Owner: nest (colony-life).
2. **Events queued by commands applied while paused are lost in a save** (`src/sim/sim.ts applyPendingCommands`
   queues the events of the commands it applies but flushes nothing; a snapshot taken before the next tick drops
   them, so the loaded game misses e.g. `overwinter.end` and its listeners: here `markStageDirty`). GDD 06 §15 rule 4
   says a save made while paused is identical. The Winter Report is closed while paused and the `post-winter`
   autosave follows it, so this is a real path. Fix (sim.ts owner): flush the event queue at the end of
   `applyPendingCommands`, as a tick does; or the Game takes paused saves only after a flush. Saved after the next
   tick, the same state round-trips (row above).

Committed test (cheap, test world): `src/sim/save/roundTrip.test.ts` - winter banner, first ticks of spring after the
lapse, early opening with all systems: equal for 300 ticks.

## Appendix E checks touching these modules

| Check | Where |
|---|---|
| GDD 06 E1 (tick and day), E12 (speed rules), E14 (orders while paused) | existing `src/sim/time*.test.ts`, `commands.robust.test.ts` (possession speed), `commands.verify.test.ts` (paused commands) - green |
| GDD 06 E21 (milestones once, dated, not refired on reload) | `progression/milestones.test.ts` (existing, green); dates across winters now right: `journalYear.test.ts` |
| GDD 06 E24 (queen death journaled) | `progression/progression.test.ts` parts (existing); extinction / epitaph need colony succession |
| GDD 06 E13 (cannot keep up), E25 (lineage, autosave) | game layer, not testable here |
| GDD 05 E17-E21, E24 (territory, escalation, orphan decline, brood raid, agent budget, determinism) | `src/sim/rivals/*.test.ts` (existing; E21 and E24 full runs under FOUNDRESS_LONG) - green |
| GDD 05 E22 (established rivals never exceed the setting), R23 | `rivals/creation.test.ts` (new) for rivals 0 |
| GDD 06 §5.2 grace (no App E number) | `src/sim/timeGrace.test.ts` (new) |

## Red tests seen in or next to my folders (not mine to fix)

| Test | Cause | Owner |
|---|---|---|
| `src/sim/time.test.ts` "never writes 7 or 28" | `src/sim/environment/human/schedule.ts:48` hard-codes the week (`* 7) / 2`, `* 7) / 5`): should use `WEEK_DAYS` and a weekend-days constant. My own hits (`config/presetDisplay.ts` `seasonLengthDays: 7`) fixed; hour windows `W(7, 21)` allowed in the check | human events |
| `src/sim/types/ids.test.ts` "registry counts" | 38 alert kinds against 37 expected: another engineer added an alert kind in flight | colony-life / alerts |
| `src/sim/services.test.ts` "diggability per species" | diggability 0 where the table says 0.6: in-flight nest / world edit | nest |
| `tests/docs/docs-final.test.ts` | manual still marks the grace "(not in effect)" (item 6) | docs / app-seams-2 |
| `src/sim/rivals/founding.test.ts` (fixed by import order) | ecology import cycle: entering at `ecology/creatures` leaves `SIM_MODULES` ecology systems 3-4 undefined (`test-output/sim-seams/probe/order.ts`) | ecology |

## Decisions and contradictions

- Item 4: the composition root `src/sim/systems.ts` holds the fix (no module owner; editing nest-flood's phase would
  have been a nest edit). `lifecycle` is the end-of-tick corpse pass by architecture §3.
- Item 1: emitters for the two GDD 04 world events live in progression as a stand-in, because the world module has
  no systems and nobody owned them; the world module can take them over unchanged.
- Item 3: world creation instead of spreading over ticks, because one nest-module carve call costs 100-400 ms. The
  state hash after 2 gd changes (ids, explained above). The set-up Sim is assembled locally instead of calling
  `createSim` (import cycle); a hook in `createNewGame` would be cleaner (owner of createGame.ts / sim.ts).
- Item 6: the grace does not apply while the opening shows the intro card: in the game the clock is paused there
  (GDD 06 §5.1), and every module-test scene sits at the intro card; applying it there turned 13 creature tests red.
  `autoSlowDefault` is not listed as unwired because the app is wiring it now (item 5).
- Item 7: no fix made; nothing parks at the edge in five 2-gd runs.
- GDD 06 §8 and 00-index B6 agree on the ids; no contradiction found. GDD 06 §5.6 (founding threat director) and
  §13.2 (queen lifespan) describe systems that do not exist (item 6 table).

## Needs from others

- App (app-seams-2): date journal entries from `calTick` (item 2); manual line 70 / 61 (item 6).
- Nest (colony-life): rival mound drift after a load (item 8.1); a batched entrance re-evaluation during instant
  plan carves would make rival set-up and other instant carves 3-5 times cheaper (item 3 profile).
- `src/sim/sim.ts` owner: flush events at the end of `applyPendingCommands` (item 8.2); optionally a creation hook
  so rivals can use `createSim` (item 3).
- Species modules: stagger offsets (item 4). Human events: week constants in `schedule.ts` (red `time.test.ts`).
- Founding species modules: openers for `aim-find-wood`, `aim-plant-garden` (item 1). World module: own
  `progression/discovery.ts`'s two events if it prefers (item 1).
- The first tick of a new game still costs about 670 ms in systems other than rivals (perf task).

