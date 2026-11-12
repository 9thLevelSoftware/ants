# Task loco — Locomotion and navigation (Stage 1A, Opus)

## Goal
Everything that makes ants and creatures get from A to B: steering, the navigation request API that behaviours call, the coarse surface nav grid, routing in and out of nests, climb routes, stuck recovery, the per-tick locomotion system, and the per-frame movement of the possessed ant.

## Read first
- `docs/design/tdd/02-kernel.md` and the kernel sources (`src/sim/world/field.ts`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts`) — you build on these and do not modify them.
- `docs/02-design-directions.md` §J "AI navigation model" and §K (speeds, passages).
- GDD 01 (`docs/design/gdd/01-modes-controls-camera.md`): section 4 (movement of the possessed ant: camera-relative mapping, edge latch, speeds, grip and let-go) in full. GDD 02: the sections on perception, route memory (breadcrumbs, shortcuts, route learning) and cooperative transport speeds. GDD 04: the sections on the coarse navigation grid, climb routes and points of interest, surface properties (grip, slope limits), water. Use the digests (`docs/design/gdd/digests/01.md`, `02.md`, `04.md`) to find them.
- `src/sim/types/**` (`Walker`, `NavState`, `Ant`, `Creature`, `WorldData`, services) and the stub `src/sim/locomotion/index.ts`.

## You own
`src/sim/locomotion/**` except the kernel files `walker.ts` / `walkerMath.ts`; `src/sim/world/navGrid.ts`; `src/sim/world/entityIndex.ts`. Replace the stub `src/sim/locomotion/index.ts` keeping its exported names and signatures (extend additively).

## Boundaries
- You implement movement only. Behaviours (other tasks) decide where to go by calling `navTo` / `navStop` / `navWander` / `navFollowTrail` / `navRetrace` and polling `nav.status`.
- Pheromone sensing goes through the `PheromoneField` service interface (another task implements it; test with a fake).
- Speed multipliers from temperature, load, health and age are inputs read from the entity (or passed by a small function in the stub of the owning module); do not compute physiology here.
- Flight of alates and floating on water are Tier 2: leave hooks, implement "avoid water" in planning now.

## Deliverables
1. `NavGrid` service: coarse 16 BU grid built from `WorldData` (blocked cells, costs), dynamic updates, A* with path smoothing using `field.segmentFree`, cached flow fields to each colony's nest entrances (rebuilt when entrances change).
2. Steering on the surface walker: seek/arrive, wander (bounded region option), light separation, trail following (three-sensor sampling on the tangent plane), breadcrumb retrace with shortcuts, nest distance-field following on cavity walls, climb-route following along authored waypoints.
3. Navigation requests and planning: destination kinds (position, entrance, chamber, entity, climb point of interest); automatic composition of surface path + entrance + nest field for trips into or out of a nest; arrival tolerance; replan triggers.
4. Stuck detection and recovery ladder (replan, sidestep, back off, re-snap to surface, and as a last resort relocate along the path with a logged event), with counters exposed for diagnostics.
5. `locomotionSystem`: integrates every walker each tick (ants and creatures), drops breadcrumbs, accumulates gait, maintains `nestId` / medium, updates the entity spatial index, and applies a level-of-detail policy (entities far from the observer take coarser steps) that keeps the kernel's safety invariant.
6. `integratePossessed(sim, dtSeconds)`: per-frame movement of the possessed ant from `PlayerIntent` (project the desired direction onto the tangent plane, edge latch across wall/edge transitions, cruise and hurry speeds, grip/let-go), consistent with the fixed tick.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. In a test world with primitives and a carved nest: 200 AI walkers travel from the deepest chamber to a surface target 500 BU away and back; at least 99 % arrive within twice the ideal travel time; none ends inside a solid.
3. A target behind a tall wall is reached through a gap found by the nav grid; a table-top point of interest is reached and left along a climb route.
4. A walker follows a synthetic pheromone trail with a bend and a 3-cell gap; a walker retraces 40 breadcrumbs home and uses a shortcut when the direct segment is free.
5. Carving away part of a tunnel while walkers are en route triggers recovery; all walkers eventually arrive or report `failed` (never loop forever) — bounded by a test.
6. Determinism: same seed, same final positions. Soak: 1,000 walkers x 10,000 ticks with no NaN and the kernel invariant holding.
7. Performance on this machine, measured and reported: `locomotionSystem` for 1,000 walkers averages under 2.5 ms per tick with the LOD policy described.
8. Possessed movement: walking into a wall climbs it; walking off a table edge continues down the side without flipping the heading; hurry speed is 1.6x cruise.
