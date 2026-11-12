# FOUNDRESS — Architecture (orchestrator decisions)

Companion to `01-design-seed.md` (binding conventions) and `02-design-directions.md`.
The TDD under `docs/design/tdd/` and the contract files under `src/sim/types/` refine this; they must not contradict it.

## 1. Repository layout

```
index.html, package.json, tsconfig.json, vite.config.ts
public/assets/            textures, audio, manifest.json, CREDITS.md
docs/                     brief, seed, directions, architecture, research/, design/
tools/harness/play.mjs    headless Playwright playtest + screenshot harness
tools/sim/                Node runners for headless simulation (balance, soak)
src/
  core/                   pure utilities: math (vec3, quat, noise, sdf), rng, events, ids, spatial grids, serialize
  sim/                    PURE simulation (no three, no DOM) — runs in Node
    types/                THE CONTRACTS: SimState and all shared data types, commands, events
    balance/              all tunable constants
    species/              SpeciesDef data + economy modules (honeydew, granary, fungus, wood nesting)
    world/                runtime world queries: height, field f(p), gradient, primitive hash, zones, sphere trace, nav grid
    nest/                 carve grid, marching cubes (pure), chambers, dig plans, nest nav fields, architect, mound
    locomotion/           surface walker, steering, path following, climb routes, falling
    pheromones/           sparse 3D pheromone field
    ants/                 lifecycle, perception, action primitives, behaviours (task state machines), player control
    colony/               brood, queen, stores + nutrition, task allocation, directives, markers, reproduction
    ecology/              food sources, plants/aphids, creature AI
    rivals/, combat/      rival colonies and fighting
    environment/          calendar, weather, temperature, human-activity events, overwintering
    progression/          milestones, journal, diagnostics ("why"), stats history, lineage record
    save/                 snapshot / restore / migrate (pure part)
    sim.ts                createSim(), tick(), ordered system list, command queue, event flush
  worldgen/               PURE deterministic generator: params + seed -> WorldData + initial entities
  render/                 three.js: app (renderer, quality, post), camera, world, nest, ants, creatures, fx
  input/                  keyboard / mouse / gamepad abstraction and bindings
  game/                   Game orchestrator: loop, modes, possession, settings, save manager (IndexedDB), UI bridge, debug API
  ui/                     Preact + signals: shell, menus, HUD, panels, styles
  audio/                  Web Audio engine: ambience layers, positional foley, synth fallbacks, optional music
  main.ts
```

## 2. Layering rules

- `core` imports nothing from the project. `sim` and `worldgen` import only `core` (and each other's types).
- `render`, `audio`, `ui`, `input` may READ sim state and subscribe to sim events; they never mutate sim state. They talk to the sim through `Game` (commands, player intent).
- `game` is the only place that wires everything together.
- No `Math.random`, `Date.now`, `performance.now` in `sim`/`worldgen` (seeded RNG + tick counter only).
- `SimState` is plain data (JSON-like + typed arrays). Runtime services (spatial hashes, nav fields, carve-grid wrappers) are derived caches rebuilt by `createSim(state)`.

## 3. Simulation model

- `Sim` = `{ state, services (world, carve, nestNav, surfaceNav, phero, species), events, rng, tick(), enqueue(command), setPlayerIntent(intent) }`.
- Systems are functions `(sim, dt) => void` run in a fixed order each 0.1 s tick. Periodic systems self-throttle by tick count and stagger per-entity work.
- Tick order: commands -> environment (time, weather, human events) -> ecology (sources, plants) -> colony allocation -> queen/eggs -> brood -> perception -> ant behaviours -> player control -> creature AI -> locomotion -> combat -> nest (carve ops, chambers, nav fields, architect) -> pheromones -> colony economy/stats -> rivals -> progression (milestones, diagnostics) -> lifecycle (deaths, spawns) -> flush events.
- Entities are plain objects in arrays with stable numeric ids and free lists: ants (target up to ~2500 simulated across all colonies), brood, items, food sources, creatures, nests (entrances, chambers, dig plans, mounds), markers.
- Ants and creatures share the surface-walker kinematics. Behaviours are small state machines built on a shared library of **action primitives** that the player-controlled ant also uses.
- Events are queued during a tick and dispatched after it (typed union: entity lifecycle, carve/chunk dirty, deliveries, combat, milestones, alerts, weather, human events, sound cues).
- Every balancing number lives in `sim/balance` or species data.

## 4. Composition and parallel work

- The foundation creates every module as a file with its final exported signature and a minimal body, plus composition roots (`sim/systems.ts`, `render/index.ts`, `ui/App.tsx`, `game/Game.ts`). Implementers fill in their own files; composition roots change only by adding registrations.
- **File ownership is exclusive.** A module owner edits only files in their owned paths. Shared contracts (`src/sim/types/**`, `src/core/**`) may be extended additively (new optional fields, new union members, new helpers) — never renamed or removed — and every such change is listed in the owner's report.
- Each module has unit tests next to it (`*.test.ts`, vitest, Node environment for sim/worldgen).

## 5. Verification hooks (required from the foundation on)

- URL flags: `?test=1` (no intro animation, audio off, render on demand, deterministic), `&seed=N`, `&quality=low|medium|high|ultra`, `&species=...`, `&autostart=1` (skip menus straight into a generated game).
- `window.__game` debug API: `ready` promise; `newGame(opts)`; `step(ticks)` (advance the sim synchronously without rendering); `renderFrame()`; `summary()` (compact JSON of time, weather, colony population by caste and task, stores, brood, nest, alerts, possessed ant); `query.*`; `possess(idOrRole)`, `release()`, `setIntent()`, `act()`, `teleport()`; `command(cmd)`; `camera.*`; `cheat.*` (add food, spawn ants, set time/weather, spawn creature, complete founding, trigger event); `ui.open/close/screen`; `perf()`.
- `tools/harness/play.mjs` drives the real game in headless Chromium for scripted playtests and screenshots.
- `tools/sim/*` run the pure sim in Node for long soak/balance runs (e.g. 60 game days in seconds), asserting invariants: no NaN positions, no ants inside solids, population and stores never negative, no stuck-agent explosions.

## 6. Rendering

- Three.js WebGLRenderer (WebGL2). Sub-renderers with `init(ctx) / update(frame) / dispose()`: terrain (chunked LOD), primitives/objects, vegetation + draped decor (instanced, streamed around the camera), sky/sun/weather, carve meshes + mounds, ants (instanced, vertex-shader animation), brood/items, creatures, effects (particles, scent view, markers), post-processing.
- Quality presets scale resolution, shadow size, post chain and instance densities; `test` quality disables everything expensive.
- Budgets at High on an integrated GPU: < 350 draw calls, < 1.5 M triangles, sim <= 4 ms per frame at 1x with 1000 ants.

## 7. Persistence

- Save = `{ meta, state }`; static world is regenerated from `WorldParams` + seed on load (generator version recorded), dynamic world deltas live in state (carve chunks, consumed/moved resources, mounds, markers, pheromones).
- IndexedDB (structured clone keeps typed arrays): autosave + 5 slots. Export/import: binary encoding + gzip (fflate) to a `.foundress` file, with copy/paste text fallback. All storage access is wrapped in try/catch and the game works without it.
- Lineage and codex unlocks are stored separately from saves.
