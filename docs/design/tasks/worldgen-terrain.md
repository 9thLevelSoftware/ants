# Task worldgen-terrain — World generation core: layout, terrain, maps, validation, placement kit (Stage 1A, Opus)

## Goal
The deterministic generator pipeline that turns `WorldParams` into a `WorldData`: zone layout from an archetype, the heightfield, ground layers and environmental maps, the validation and repair loop, and the placement toolkit that the object catalogue tasks (next stage) plug into. After this task a generated world has correct zones, terrain and maps but few objects.

## Read first
- `docs/design/tasks/notes-foundation.md` — reports of the foundation tasks, including the integration task that wired the kernel into the simulation (`sim.kernel`, `sim.field`, `sim.carve`, `sim.nestNav`, height overlays for mounds, `makeTestSim` options, the soak tool). Read the sections for F2-kernel and F-int-foundation and act on every item addressed to your task.
- GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): read in full the sections on map sizes, regions and archetypes, the zone model, surface properties per material, the generation pipeline (all steps, random streams, validation checks, regeneration and repair, determinism rules and fingerprint), the coarse navigation grid, nesting suitability per species, the map boundary, and world persistence. Skim the object catalogue, micro-connections, climb routes and human activity sections so that the kit you design supports them. `docs/design/gdd/digests/04.md` gives the map.
- `docs/02-design-directions.md` §E, §J, §K.
- `src/sim/types/world.ts`, `src/sim/types/geom.ts`, `src/worldgen/index.ts` (placeholder to replace), `src/core` (noise, rng forks, grids), and `docs/design/tdd/02-kernel.md` (the kernel consumes your output).

## You own
`src/worldgen/**` except `catalog/**`, `place/**` and `populate/**` (next-stage tasks). That includes `index.ts`, `params.ts`, `pipeline.ts`, `layout/**`, `terrain/**`, `maps/**`, `validate/**`, `kit/**`, `worker/**`, and the debug tool `tools/sim/worldmap.ts`.

## Boundaries
- Objects, plants, food anchors, creature territories, rival sites and micro-connections are placed by next-stage tasks through your kit: the pipeline must call registered placer steps in the order GDD 04 defines and work (with a sparser world) when none is registered.
- Only what is needed for a zone to exist physically belongs here (ground levels, kerb and step height differences in the heightfield, the building's floor slab and outer wall footprint as primitives so that the interior is enclosed and the nav grid is right).

## Deliverables
1. `WorldParams` handling: seed, size class, archetype, region/climate, species (BU), generator version.
2. Zone layout per archetype (zone mix, adjacency, physical size rules for built zones), producing the zone map and zone table.
3. Heightfield synthesis per zone (relief, micro-relief, level steps between zones, drainage tendency) using integer-hash noise only.
4. Maps: ground layers (surface material, crust thickness, subsoil), moisture, shade and shelter (from large structures), catchment/puddle capacity inputs, the coarse nav-blocked map, per-species nesting-suitability maps kept separate from travel accessibility.
5. The pipeline with separate named RNG streams per step, a time budget, the validation checks GDD 04 names (those that need next-stage content are implemented and reported as "not applicable yet" when that content is absent), regeneration attempts, the repair step, and the fingerprint hash.
6. The placement kit: place an object template made of primitives (snapping to terrain, footprint collision tests, zone and spacing rules), record pre-carve operations, register climb routes and points of interest, register placement tables — as a small documented API in `src/worldgen/kit/`.
7. `generateWorld(params, onProgress?)` in `src/worldgen/index.ts` (replacing the placeholder, same signature) and a worker entry with a main-thread fallback, structured so the classic single-file build can run it from a Blob URL.
8. `tools/sim/worldmap.ts`: writes PNG maps (zones, height, materials, moisture, shade, suitability) for a given set of params, run with `node tools/sim/run-ts.mjs`. Generate them for every archetype and LOOK at them.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; `src/worldgen/**` imports only `src/core`, `src/sim/types`, and kernel modules.
2. Determinism: identical params give identical fingerprints in repeated runs; different seeds differ; the fingerprint covers every array in `WorldData`.
3. Every Tier 1 archetype generates a valid world at all three size classes; standard size takes under 3 s in Node on this machine (report the times).
4. Zone area fractions are within the tolerance GDD 04 states for each archetype over 20 seeds; built zones respect their physical size rules.
5. Ground layers agree with zones (hard crust under asphalt and paving, none under lawn); the heightfield has no discontinuities other than intended steps; world borders behave as the chapter specifies.
6. Each species has at least the required number of suitable founding cells reachable from the queen start (validation check), over 20 seeds per archetype.
7. The kernel builds from every generated world and a walker can cross the map along the nav grid.
8. The PNG maps for the five archetypes have been looked at and show sensible layouts (described in the report).
