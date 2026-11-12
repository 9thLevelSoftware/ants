# Task F1b — Contracts, simulation skeleton and module stubs

## Goal
Create the shared data contracts of the whole game and a simulation skeleton that already ticks, saves and restores, so that ~40 later module tasks can be built in parallel against real, compiled types. The code you write here is the single source of truth for the contracts: be precise, consistent and conservative.

## Read first (in this order)
1. `docs/design/tdd/00-contracts-guidance.md` — the binding shapes and style (all of it).
2. `docs/03-architecture.md` (§2 layering, §3 simulation model and tick order, §4 composition, §5 verification hooks, §7 persistence) and `docs/02-design-directions.md` §J and §K (canonical identifiers, units, ratified decisions).
3. `src/core/README.md` and the exported APIs of `src/core` (use them; do not duplicate them).
4. `src/sim/types/geom.ts` — written by the orchestrator; shared with the kernel task. Use it. Extend it additively only if essential.
5. All eight chapter digests in `docs/design/gdd/digests/01.md … 08.md` — especially their sections 2 (identifiers), 4 (state required), 5 (commands and events), 6 (diagnostics). When a digest is terse or ambiguous, open the chapter's appendices A–D (at the end of each file in `docs/design/gdd/`) for exact semantics. If a digest is missing when you start, wait a few minutes; if still missing, read that chapter's appendices directly.
6. `docs/design/tasks/00-module-map.md` — the module list and paths. The stub files you create must match these paths exactly.

## You own
- `src/sim/types/**` (except `geom.ts`: additive extension only)
- `src/sim/sim.ts`, `src/sim/systems.ts`, `src/sim/services.ts`, `src/sim/createGame.ts`, `src/sim/commands.ts`, `src/sim/time.ts`, `src/sim/entities/**` (spawn/despawn helpers), `src/sim/save/**`, `src/sim/testing/**`
- `src/sim/balance/**` (an `index.ts` plus one small file per domain holding only the constants YOU need; module owners add theirs later)
- `src/sim/species/registry.ts`, `src/sim/species/index.ts`, `src/sim/species/data/lasius-niger.ts` (a minimal but valid definition so the simulation can run; full data comes in a later task)
- One stub `index.ts` in each module directory: `src/sim/world`, `src/sim/nest`, `src/sim/locomotion`, `src/sim/pheromones`, `src/sim/ants`, `src/sim/colony`, `src/sim/ecology`, `src/sim/rivals`, `src/sim/combat`, `src/sim/environment`, `src/sim/progression` (see "Stubs" below)
- `src/worldgen/index.ts` and `src/worldgen/params.ts` (placeholder generator, see below)
- `docs/design/tdd/01-contracts-map.md`
Do not touch `src/core/**`, `src/main.ts`, config files, `spikes/**`, or any kernel file (`src/sim/world/field.ts`, `src/sim/world/primHash.ts`, `src/sim/nest/carve/**`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts`) — another engineer is writing the kernel at the same time.

## Work
### 1. Types (`src/sim/types/`)
One file per concept, a barrel `index.ts`. Follow the contracts guidance exactly for: style rules (§1), `SimState` root (§3), `Walker` and `NavState` (§4), `Ant` (§5), the other entities (§6), services and `Sim` (§7), `PlayerIntent`, `Command`, `SimEvent` (§8).
- `ids.ts`: every canonical identifier set from directions §J plus the additions listed in the digests, as string-literal unions WITH exported `as const` arrays for iteration (`CASTES`, `TASKS`, `CHAMBER_TYPES`, …). Where two chapters name the same thing differently, pick the directions §J name, else the name used by the chapter that owns the topic, and record the choice in the contracts map.
- Entities: `Ant`, `Brood`, `Colony` (including directives, stores, per-task headcounts, abstract-colony fields for rivals, module state slots for granary / fungus garden / herds / satellites as optional sub-objects), `Item`, `FoodSource`, `PlantState`, `Creature`, `Nest` (entrances, chambers, dig plans, mounds), `Marker`.
- `environment.ts`, `player.ts`, `progression.ts` (stage, milestones, journal entries, statistics time series using core `TimeSeries`, codex unlock flags, lineage record shape), `diagnostics.ts`.
- `world.ts`: `WorldData` (static world from worldgen). It MUST contain these fields with exactly these names and types, because the kernel task consumes them structurally: `size: number` (world edge length, mm), `bu: number` (mm), `terrain: HeightField`, `ground: GroundLayers`, `prims: Primitive[]`, and optional `terrainHoles?: ByteMap` (cells where the ground term is removed, e.g. drains). Beyond those: terrain `HeightField`, `GroundLayers`, zone map and zone table, moisture / shade / shelter maps, `prims: Primitive[]`, `objects: WorldObject[]` (template id, primitive ids, tags, climb routes, points of interest), water bodies, micro-connections, nav-blocked map, pre-carve operations, placement tables for food anchors / plants / creature territories / rival sites, queen start, world size, BU, fingerprint. `WorldDelta` (dynamic world, in `SimState`): `CarveData`, dynamic primitives, object state changes, consumed anchors.
- `species.ts`: `SpeciesDef` and `CasteDef` per GDD 07's schema (digest 07; if that digest is not available yet, define the schema from guidance + directions §H and mark it PROVISIONAL in the contracts map).
- `config.ts`: `GameConfig`, `WorldParams`, difficulty presets id, custom rules (season length is configurable: 5 / 7 / 10 days).
- `commands.ts`, `events.ts` (unions with a `type` discriminant; `SimEventMap = EventMapOf<SimEvent>`), `intent.ts`.
- `services.ts`: interfaces for `WorldField`, `CarveGrid`, `NestNav`, `NavGrid`, `PheromoneField`, `EntityIndex` per guidance §7. The first three are implemented by the kernel task running in parallel: if its files already exist when you get here (`src/sim/world/field.ts`, `src/sim/nest/carve/index.ts`, `src/sim/nest/nav/index.ts`), align your interfaces with what they export; otherwise write them from the guidance and mark them `PROVISIONAL (kernel)` in comments and in the contracts map — an integration pass will reconcile them.
- Every field carries a unit comment. No file over ~400 lines.

### 2. Skeleton
- `src/sim/time.ts`: `TICKS_PER_SECOND = 10`, `SECONDS_PER_DAY = 600`, helpers `dayOf`, `timeOfDay`, `seasonOf`, `yearOf`, `dayOfYear` that read the season length from config (never hard-code 7).
- `src/sim/entities/*`: `spawnAnt`, `spawnBrood`, `spawnItem`, `spawnSource`, `spawnCreature`, `createColony`, `createNest`, `placeMarker` and matching `kill…/remove…` helpers: allocate ids from `state.nextId`, fill every field with a sane default, register in the store, queue the lifecycle event. These are the ONLY way entities get created.
- `src/sim/services.ts`: `createServices(state, world)` builds stores (`Store<T>` from core over the state arrays), the entity index, and placeholder implementations of the kernel-owned services (a terrain-only field that samples the heightfield, an empty carve grid, an empty nest nav, a trivially open nav grid, an in-memory pheromone field stub) kept in `src/sim/testing/placeholders/`. They must be safe no-ops, never throw.
- `src/sim/systems.ts`: the ordered `System` list exactly as architecture §3 gives the tick order, each entry imported from its module's stub `index.ts`. `src/sim/sim.ts`: `createSim(state, world?)`, `tick()` (runs systems honouring `every`, increments tick, sweeps stores, flushes events), `enqueue(cmd)`, `setPlayerIntent`, `integratePossessed` (delegates to a locomotion stub).
- `src/sim/commands.ts`: a handler table with an entry for EVERY command type (handlers may be no-ops annotated `// owner: <module>`); commands are applied at the start of the next tick.
- `src/sim/createGame.ts`: `createNewGame(config)` -> `{ state, world }`: generates the world, creates the player colony with a founding queen at the queen start, initial environment and progression state.
- `src/sim/save/`: `snapshot(sim): Uint8Array` and `restore(bytes): { state }` using core `encode/decode` (+ version field and a migration hook), plus `stateHash(state)` for determinism tests.
- `src/sim/testing/testWorld.ts`: `makeTestWorld(opts)` — a small deterministic `WorldData` (configurable size, flat or gentle noise terrain, optional few primitives) and `makeTestSim(opts)`.
- `src/worldgen/index.ts`: `generateWorld(params): WorldData` placeholder (gentle noise terrain, uniform loam layers, no primitives, a queen start in the middle) with the final function signature; the worldgen tasks replace its body.

### 3. Stubs
Each module `index.ts` exports its system objects with their final names and a no-op `run`, plus the function signatures other modules will call (for example locomotion's `navTo`, `navStop`, `navWander`, `navFollowTrail`, `navRetrace`; the action library's `canDo` / `begin`; colony's `addFood` / `takeFood`), implemented as safe no-ops that return a sensible "not available" value. Add a one-line comment naming the task key from the module map that will replace each stub.

### 4. Contracts map
`docs/design/tdd/01-contracts-map.md`: (a) a table mapping every "state required", command, event and diagnostic item from the eight digests to the type/field that represents it, or to `deferred` with a reason; (b) every naming conflict you resolved and how; (c) everything marked PROVISIONAL; (d) the list of systems in tick order with their owner task; (e) questions for the orchestrator.

## Acceptance criteria
1. `npm run typecheck` is clean for the whole project.
2. Tests (Vitest, Node): a new game on the test world ticks 2,000 times with no throw; two runs with the same seed give identical `stateHash`; snapshot -> restore -> re-encode is byte-identical; restoring at tick N and running M more ticks equals an uninterrupted run of N+M ticks.
3. A test walks a fresh `SimState` recursively and asserts it contains only primitives, plain objects, arrays and typed arrays (no class instances, functions, Maps, Sets, `undefined` values).
4. A test asserts every `Command['type']` has a handler and every system in `systems.ts` has a unique name.
5. Events queued during a tick are delivered after the tick, in order (test).
6. Every canonical identifier set has a union type and an iterable const array.
7. The contracts map covers every digest item (covered or explicitly deferred).
8. `src/sim/**` and `src/worldgen/**` import nothing from `three`, the DOM, or anything outside `src/core`, `src/sim`, `src/worldgen`.
