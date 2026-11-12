# FOUNDRESS — Contract guidance (orchestrator's technical backbone)

Binding shapes and style for the shared code contracts. The foundation engineers turn this into real
files (`src/core/**`, `src/sim/types/**`, service interfaces, composition roots) and fill in the breadth
from the GDD appendices (State required / Commands / Events / Diagnostics). Where this file gives a
shape, use it; where it is silent, follow its style.

## 1. Style rules

- State is plain data: `interface` + string-literal unions. No `enum`, no classes, no functions, no `Map`/`Set`, no `undefined`-vs-missing semantics inside persisted state (use `null` or `-1`).
- Numeric ids are unique for the lifetime of a game (`state.nextId++`); `-1` means none. Never reuse ids. References are by id and are resolved through runtime stores, which return `undefined` for dead entities — so stale references are harmless by construction.
- Every field has a comment with its unit (mm, BU, ticks, loads, °C, 0..1). Ticks are integers. Durations in state are ticks.
- Vectors are `{x, y, z}` objects (`Vec3`); maths helpers take an `out` parameter first and never allocate in hot paths.
- Additive evolution only: new optional fields, new union members, new helpers. Never rename or remove.
- Imports use the `@/` alias for `src/` (configured in tsconfig, Vite and Vitest).
- Files stay small and single-purpose (target < 400 lines); one exported concept per file where practical.

## 2. `src/core` (pure, no project imports)

- `math/vec3.ts` (`Vec3`, out-param ops), `math/quat.ts` (minimal: fromUnitVectors, rotate, slerp, fromBasis), `math/scalar.ts` (clamp, lerp, smoothstep, remap, approach, angle helpers).
- `math/noise.ts`: integer-hash based value/gradient noise + fbm in 2D/3D — deterministic across browsers (no `Math.sin` in hashing).
- `math/sdf.ts`: signed distances **positive outside the solid** for rounded box, capped cylinder, capsule, ellipsoid (bound-corrected), plus a transform helper (point into primitive space). The world field converts these to the game convention (positive in free space) — document this clearly.
- `rng.ts`: small fast seeded generator with its state as a plain array of uint32 (`RngState`) that lives in `SimState`; pure functions `rngFloat(s)`, `rngRange`, `rngInt`, `rngPick`, `rngChance`, `rngGauss`, and `rngFork(seed, streamName)` for independent named streams (worldgen sub-steps must not disturb each other).
- `events.ts`: typed `EventBus<EventMap>` with `on/off/emit` and a queued mode (`queue(event)`, `flush()`).
- `spatial/hashGrid.ts`: uniform 3D hash grid for entity queries (`insert`, `clear`, `queryRadius(pos, r, out)`), allocation-free in steady state. `spatial/grid2d.ts`: typed 2D grid helper with bilinear sampling.
- `store.ts`: `Store<T extends {id:number; alive:boolean}>` — runtime wrapper over a state array: `add`, `get(id)`, `list` (alive entities), deferred `remove` applied at end of tick with swap-remove, `rebuild()` after load.
- `timeSeries.ts` (fixed-capacity ring buffer stored as plain arrays), `assert.ts`, `log.ts` (levelled, silent in tests), `serialize.ts` (typed-array aware binary encoding + gzip via fflate).

## 3. `SimState` root (in `src/sim/types/state.ts`)

```ts
interface SimState {
  version: number;                 // save format version
  generatorVersion: number;        // worldgen version used
  config: GameConfig;              // species, difficulty, rule toggles, WorldParams (seed, size, archetype)
  rng: RngState;                   // main simulation stream
  nextId: number;
  tick: number;                    // integer, 10 ticks per game second
  env: EnvironmentState;           // calendar derived values cache, weather, wind, soil moisture, active/scheduled human events
  worldDelta: WorldDelta;          // everything dynamic about the world: carve chunks, breaches, dynamic primitives (mounds, moved objects), consumed/changed resources
  colonies: Colony[];              // [0] is the player's colony
  ants: Ant[];
  brood: Brood[];
  items: Item[];                   // loose or stored things: soil pellets, food pieces, seeds, leaf fragments, corpses, refuse
  sources: FoodSource[];           // persistent food nodes
  plants: PlantState[];            // dynamic state of climbable/host plants (herds, nectar)
  creatures: Creature[];
  nests: Nest[];                   // entrances, chambers, dig plans, mounds, substrate
  markers: Marker[];
  phero: PheromoneState;           // sparse per-colony, per-channel fields in serialisable form
  player: PlayerState;             // possessed ant id, view hints the sim needs, founding/time-lapse phase
  progression: ProgressionState;   // stage, milestones, journal, diagnostics, statistics time series, codex unlock flags for this game
}
```

The static world (`WorldData`: heightfield, zone/material maps, primitives, objects with climb routes and points of interest, water, nav-blocked grid, pre-carves, spawn tables) is NOT in `SimState`; it is regenerated from `config.world` and held by the `Sim` as a service.

## 4. Kinematics shared by ants and creatures

```ts
interface Walker {
  pos: Vec3; up: Vec3; fwd: Vec3;           // on the level set f = footOffset; up = surface normal; fwd tangent
  prevPos: Vec3; prevUp: Vec3; prevFwd: Vec3; // previous tick, for render interpolation
  speed: number;                             // mm/s actually travelled last tick
  footOffset: number;                        // mm
  medium: 'surface' | 'cavity' | 'air' | 'water';
  vel: Vec3;                                 // used only while medium === 'air' (falling / flying)
  gait: number;                              // stride phase, advanced by distance / stride length
  nav: NavState;                             // steering request + status (owned by locomotion)
}
```

`NavState` = `{ mode: 'none'|'seek'|'path'|'field'|'trail'|'retrace'|'climb'|'wander', dest: Vec3, destKind, destId, arriveDist, path: Vec3[]|null, pathIdx, fieldNest, fieldTarget, status: 'idle'|'moving'|'arrived'|'failed', stuckTicks, desiredDir: Vec3, desiredSpeed }`.
Behaviours never move entities directly: they call locomotion functions (`navTo(sim, w, dest)`, `navStop`, `navWander`, `navFollowTrail`, `navRetrace`) and poll `nav.status`.

## 5. Ant

```ts
interface Ant extends Walker {
  id: number; alive: boolean;
  colony: number; caste: Caste;
  bornTick: number; lifespanTicks: number;
  hp: number; maxHp: number;
  cropC: number; cropP: number;              // loads carried in the crop
  energy: number;                            // 0..1 personal reserve; starvation damage at 0
  carry: { kind: 'none' | 'item' | 'brood'; id: number };
  task: Task; taskTick: number;              // current job and when it was assigned
  state: string; stateTick: number;          // behaviour FSM state and when it was entered
  target: TargetRef;                         // { kind, id, pos } generic target slot
  action: ActionInProgress | null;           // { id: ActionId, startTick, durationTicks, target: TargetRef }
  mem: AntMemory;                            // breadcrumbs (ring of Vec3), known source id, home entrance id, trips, last success tick
  nestId: number; chamberId: number;         // where it currently is (-1 outside / not in a chamber)
  combat: CombatState | null;
  flags: number;                             // bit flags: POSSESSED, TRAIL_ON, ALARMED, WINGED, FOUNDING, ...
  pose: number;                              // render pose hint (carrying, alarm, feeding, digging, ...)
  thinkTick: number;                         // next tick the behaviour runs (staggering)
  bb: Record<string, number>;                // behaviour scratch values (numbers only, serialisable)
}
```

- Behaviours are modules `{ task, enter(sim, ant), update(sim, ant), exit(sim, ant) }` registered in a table keyed by `Task`; species modules may register more.
- **Action primitives** (`src/sim/ants/actions/*`) are the only code that changes the world on behalf of an ant: `canDo(sim, ant, actionId, target)` and `begin(sim, ant, actionId, target)`; a per-tick action system completes them after `durationTicks` and applies effects. The possessed ant goes through exactly the same functions.

## 6. Other entities (shapes to elaborate from the GDD)

- `Colony`: id, species, isPlayer, fidelity (`'full' | 'abstract'`), queenId, nest ids, stores `{ c, p }` plus module state (granary, fungus gardens, herds, satellites), directives (allocation targets, production, toggles), per-task headcounts cache, known sources, relations, reproduction state, abstract-colony numbers for rivals, statistics counters.
- `Brood`: id, colony, stage, destined caste, progress 0..1, fed C/P, hunger, pos, chamberId, carriedBy.
- `Item`: id, kind, pos, nutrients, count (stackable piles), carriedBy, chamberId, decay.
- `FoodSource`: id, kind, pos + up (surface point), objectId/plantId, amount, capacity, regen/decay, unit profile, discovered-by flags, guarded/tended state.
- `Creature extends Walker`: id, kind, hp, state machine fields like ants (state, target, timers), home territory.
- `Nest`: id, colony, substrate, entrances `{id, pos, dir, radius, sealed, moundId}`, chambers `{id, type, center, radii, volume, capacity, temp, humidity, flooded}`, dig plans `{id, kind, chamberType, spheres[{c, r, done}], frontier, priority, source, status, blockedReason}`, mounds.
- `Marker`: id, kind, pos, radius, colony, params.
- `EnvironmentState`, `ProgressionState`, `PlayerState`, `Diagnostic { id, system, status: 'ok'|'warn'|'bad', label, value, factors: {cause, weight, detail}[], remedies: string[], sinceTick }`.

## 7. Runtime services on `Sim` (derived, never persisted)

```ts
interface Sim {
  state: SimState;
  world: WorldData;                 // static, from worldgen
  field: WorldField;                // height(x,z), substrate(p), cavity(p), sample(p), gradient(p,out), project(p,offset,out), sphereTrace(o,dir,max,r), materialAt(p), diggability(p, species)
  carve: CarveGrid;                 // sparse chunks, brushes, dirty set, breaches, marching-cubes mesh builder (pure arrays)
  nestNav: NestNav;                 // BFS fields per nest: to entrances, to chambers; incremental update on carve
  navGrid: NavGrid;                 // coarse 2D grid: blocked/cost, path queries, flow fields to entrances
  phero: PheromoneField;            // deposit, sample, gradient-ish sensing, evaporate, wash
  index: EntityIndex;               // spatial hash over ants, creatures, items, sources, brood
  stores: { ants, brood, items, sources, creatures, ... }  // Store<T> wrappers
  species: SpeciesDef;              // player's species; getSpecies(id) for others
  events: EventBus<SimEventMap>;    // queued during a tick, flushed after
  tick(): void;
  enqueue(cmd: Command): void;
  setPlayerIntent(intent: PlayerIntent): void;   // world-space desired direction + held actions for the possessed ant
  integratePossessed(dtSeconds: number): void;   // per-frame movement of the possessed ant between ticks
}
```

- `createNewGame(config): { state, world }`, `createSim(state, world?)` (regenerates the world when not supplied), `snapshot(sim)`, `restore(saved)`.
- Systems: `type System = { name: string; every?: number; run(sim: Sim): void }`, listed in order in `src/sim/systems.ts`. Each module exports its system(s); the list is the only shared registration point.
- Time helpers in `src/sim/environment/calendar.ts`: `TICKS_PER_SECOND = 10`, `SECONDS_PER_DAY = 600`, `DAYS_PER_SEASON = 7`, `dayOf(tick)`, `timeOfDay(tick)` (0..1), `seasonOf(tick)`, `yearOf(tick)`.

## 8. Outside the simulation

- `PlayerIntent = { dir: Vec3 /* world-space desired direction, length 0..1 */, hurry: boolean, held: ActionId[] }`. The game layer converts camera-relative input into `dir`; the sim projects it onto the ant's tangent plane.
- `Command` union (`type` discriminant): possess, release, action (begin an action primitive for the possessed ant), setDirectives, placeMarker, removeMarker, planDig, cancelPlan, designateChamber, setAutoExpand, founding steps, skip time-lapse, debug/cheat commands (guarded by a flag).
- `SimEvent` union (`type` discriminant) covering entity lifecycle, carve chunk changes and breaches, deliveries, combat, milestones, alerts with cause, weather and human events, and `cue` events for audio/visual effects `{ type: 'cue', cue: CueId, pos, strength }`.
- Rendering: `SubRenderer { init(ctx), onGameStart?(sim), update(frame), onGameEnd?(), dispose() }` with `RenderContext { renderer, scene, camera, quality, assets, game }` and `FrameInfo { dt, time, alpha /* tick interpolation */, sim, view, underground }`. Sub-renderers are registered in `src/render/index.ts`.
- UI: Preact components read a `UiSnapshot` signal store refreshed by `game/uiBridge.ts` a few times per second, and call `game.*` methods (which enqueue commands). UI never touches `SimState` directly.
- `Game` (in `src/game/Game.ts`) owns: mode (`title | loading | playing | paused | epitaph`), view (`possess | observer | colony | photo`), the sim, the renderer, input, audio, settings, saves, the debug API (`window.__game`, see architecture §5).
- Settings (graphics, audio, controls, accessibility, gameplay) are a plain object persisted in localStorage with try/catch.

## 9. Testing conventions

- Vitest, Node environment for `core`, `sim`, `worldgen`. Tests live next to code as `*.test.ts`.
- Every sim module ships invariant tests (no NaN, conservation where it applies, determinism: same seed -> same state hash after N ticks).
- A tiny deterministic test world helper (`src/sim/testing/testWorld.ts`) builds a small `WorldData` (flat or simple terrain, a few primitives, optional pre-carved nest) so module tests do not depend on full world generation.
- Browser checks go through `tools/harness/play.mjs` with `?test=1` and the `window.__game` API; screenshots are looked at, not just produced.
