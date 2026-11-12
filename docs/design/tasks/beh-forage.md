# Task beh-forage — Outdoor behaviours: perception, scouting, foraging, tending, fleeing (Stage 1B, Opus)

## Goal
The autonomous outdoor life of the colony: what an ant can sense, how scouts explore and find food, how foragers are recruited, follow and reinforce trails, harvest, return and deliver, and how they respond to markers and danger. This is where pheromones, route memory and collective nutrition turn into visible colony behaviour.

## Read first
- `docs/design/tasks/gate-1A-sim-report.md` (§1 what works end to end, §2 what is stubbed, §8 what Stage 1B tasks must know — the public functions to call) and `docs/design/tasks/gate-1A-app-report.md` §7. The scripted stand-ins under `src/sim/testing/e2e/` show working call sequences against the real modules.
- GDD 02 (`docs/design/gdd/02-colony-simulation.md`): read in full the sections on perception, pheromones (deposition rules behaviours follow), route memory (breadcrumbs, retrace, shortcuts, route learning), the behaviour state machines for `scout`, `forage`, `tend` and `flee`, recruitment and information transfer, cooperative transport, marker semantics (`forage`, `avoid`, `rally`), collective nutrition (how demand shifts source choice and trail strength), and the forager-activation feedback. `docs/design/gdd/digests/02.md` gives the map.
- GDD 05 digest (source fields, harvesting, discovery cues) and `docs/02-design-directions.md` §J "AI navigation model".
- The modules you drive (read their `index.ts` exports and README/API docs): `src/sim/locomotion`, `src/sim/pheromones`, `src/sim/ants/actions` (every world change goes through action primitives), `src/sim/colony` (demand signals, deposits, activation), `src/sim/ecology/sources`, `src/sim/ants/behaviourRunner.ts` (how behaviours are registered and run).

## You own
`src/sim/ants/behaviours/outdoor/**` (register through its `index.ts` `behaviours` array) and `src/sim/ants/perception/**`. Constants in `src/sim/balance/foraging.ts`.

## Boundaries
- Behaviours never move ants or change the world directly: movement through locomotion requests, effects through action primitives (`canDo` / `begin`), food accounting through the colony ledger called by those primitives.
- Herd tending on plants, combat and predator avoidance arrive in Tier 2: implement `tend` for the Tier 1 static honeydew sites, `flee` for alarm pheromone and human-event cues, and leave documented hooks for the rest.
- If a function you need from another module is missing, add a thin local adapter and report it; do not edit other modules.

## Deliverables
1. Perception on a staggered cadence: contact, antennal and smell ranges from GDD 02; a compact percept (nearest food, nestmates met, pheromone strengths, markers, threats, the nest entrance) that behaviours read; what an ant can and cannot know is exactly what the chapter says.
2. Behaviours as state machines with the chapter's states, timings and failure handling: `scout` (depart, explore biased away from marked territory, investigate, assess, collect, return, report), `forage` (wait near the entrance, outbound along trail or lead, search, queue at a source, collect, return, deliver), `tend` (Tier 1 sites), `flee`.
3. Trail laying on the way home scaled by source quality and colony need; reinforcement; trail-ignorer fraction; behaviour when a trail dies or a source is depleted (memory of depleted sources).
4. Recruitment as information transfer inside the nest (a successful forager passes its lead), the activation feedback loop with the colony module, and route learning after repeated trips.
5. Marker responses: `forage` markers attract scouts and recruits, `avoid` markers repel, per GDD 02.
6. Decision logging into the ant's memory (reason codes) so the inspect card can explain what an ant is doing and why.
7. Cooperative transport if GDD 02 marks it Tier 1; otherwise a documented hook.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Headless scenario (test sim with the standard small nest, 40 workers, a sugar source 300 BU away and a carrion item 200 BU away): the colony discovers both, a trail to the sugar source forms, and the delivery rate over the following game hour is within the range GDD 02's economy implies (report the numbers); when the source is removed the traffic stops within the time the trail half-life implies and foragers do not keep walking to the empty spot.
3. With a protein deficit set in the colony, foragers shift toward the protein source; with a carbohydrate deficit, toward sugar (statistically clear over repeated seeds).
4. Every forager that leaves returns or dies of a recorded cause within a bound: no ant wanders forever, none is stuck in a state for longer than its state's timeout (test over 5 game hours, several seeds).
5. An `avoid` marker over the trail cuts traffic through it by at least 80 %; a `forage` marker at an undiscovered source brings its discovery forward.
6. All world changes in these scenarios come from action primitives (test double counts direct mutations: zero).
7. Determinism; performance on this machine: behaviours + perception for 500 outdoor ants average under 1.2 ms per tick (report).
