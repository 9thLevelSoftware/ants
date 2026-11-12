# Task worldgen-outdoor — Outdoor object catalogue and placement (Stage 1B, Opus, visual)

## Goal
Fill the generated world's outdoor zones with their physical content at true scale: every object of the forest floor, lawn, garden beds, pavement/patio, parking and playground catalogues, built from solid primitives, with climb routes, points of interest, decor-layer descriptors and the outdoor micro-connections.

## Read first
- GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): read in full the object catalogue tables for forest, lawn, garden beds, pavement/patio, car park and playground (dimensions, primitive construction, materials, flags, placement rules, densities), the micro-connection catalogue (the outdoor kinds: paving joints, expansion gaps, gaps under kerbs and fences, drain grilles, root channels) with its passability rule, the sections on climbable structures, authored climb routes and points of interest, decor rules (grass, draped leaves/petals/litter as visual-only layers), pre-existing cavities, and water. `docs/design/gdd/digests/04.md` gives the map.
- `docs/02-design-directions.md` §E and §K (two kinds of pre-existing passage).
- `src/worldgen/kit/**` and its documentation (the placement toolkit you must use), `src/worldgen/pipeline.ts` (how placer steps register and in which order they run), `src/sim/types/world.ts`, `src/sim/types/geom.ts`, `docs/design/tdd/02-kernel.md`.

## You own
`src/worldgen/catalog/outdoor/**` (object templates as data + small builder functions) and `src/worldgen/place/outdoor/**` (placement steps), registered with the pipeline through the mechanism the kit documents.

## Boundaries
- The building (exterior walls, interior, door) is another task; so are food anchors, creature territories, rival sites and the map-wide micro-connection guarantee (`worldgen-life`). You place the outdoor micro-connections that belong to your objects (joints between your slabs, gaps under your kerbs and fences, drains, root channels).
- Visual-only decor (grass blades, draped leaves, petals, litter) is NOT placed as objects: emit compact decor descriptors (density maps, palettes, size ranges per zone) into `WorldData` for the renderer.

## Deliverables
1. Templates for every outdoor catalogue object in GDD 04, each a function from parameters (size variation, seed) to primitives with materials and flags, plus its climb routes and points of interest where the chapter defines them (plant stems and leaves for future herds/nectar, table/bench tops, bin rims, play equipment bases).
2. Placement steps per zone following the chapter's rules and densities: spacing, alignment (slab grids with joint widths, kerb lines, fence lines, planting rows), terrain snapping, footprint collision, level-of-detail of placement (large structures first), deterministic RNG streams.
3. Outdoor micro-connections generated with their objects, respecting the passability rule (gap sizes in BU), and pre-carved cavities in ground or wood recorded as pre-carve operations.
4. Decor descriptors per zone for the renderer; water bodies (puddle basins, bowls, gullies) per the chapter.
5. Tests and visual checks: PNG maps through `tools/sim/worldmap.ts` extended with an objects layer, and screenshots of generated worlds through whatever renderer exists (the world renderer if present, otherwise the debug renderer), looked at.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; imports limited to `src/core`, `src/sim/types`, the kernel and `src/worldgen`.
2. Over 10 seeds per archetype, object counts per zone are within the chapter's density tolerances; no two solid objects interpenetrate beyond the allowed embedding (sampled with the kernel field); every object rests on the terrain.
3. Every climb route can actually be followed: a kernel walker steered waypoint to waypoint reaches the point of interest and returns, for a sample of at least 200 routes across seeds.
4. Every generated micro-connection is passable by the species' standard worker (clearance test with the field) and connects two regions that are otherwise farther apart by the chapter's "useful" definition.
5. Generation of a standard world including these steps stays within the pipeline's time budget (report times); fingerprints remain deterministic.
6. The maps and screenshots for all Tier 1 archetypes have been looked at and show plausible, recognisable places at ant scale (a paved area reads as paving with joints and a kerb, a lawn has stepping stones and plants, a playground has a sand pit edge and equipment bases); describe them in the report.
