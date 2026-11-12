# Task worldgen-interior — The building: exterior, door and interior slice (Stage 1B, Opus, visual)

## Goal
The "people's homes" part of the world: the building's outer walls and door with its threshold gap, and the interior slice behind it (kitchen/utility room) with floor, walls, cabinets with kick-space, table and chairs, appliances, bin, pet bowl and food-bearing counters — all at true scale, climbable where the design says, with the routes and micro-connections that make it explorable by an ant.

## Read first
- GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): read in full the building exterior and kitchen/utility interior catalogue tables, the micro-connection kinds that concern buildings (door crack, pipe penetrations, wall and floor gaps, cabinet kick-space, vents), climb routes and points of interest for furniture and counters, surface properties of interior materials (grip on glass, glazed tile, metal), the nav-grid rules for walls, and what the map boundary looks like around the building. `docs/design/gdd/digests/04.md` gives the map.
- `docs/02-design-directions.md` §K (passages in built structures are free space between primitives).
- `src/worldgen/kit/**` and its documentation, `src/worldgen/pipeline.ts`, the layout data the terrain task produces for the `interior` zone (floor slab, wall footprint), `src/sim/types/world.ts`, `docs/design/tdd/02-kernel.md`.

## You own
`src/worldgen/catalog/interior/**` and `src/worldgen/place/interior/**`, registered with the pipeline through the kit's mechanism.

## Boundaries
- Food on counters, crumbs under the table, the pet bowl's contents and bait stations are food anchors placed by `worldgen-life`; you create the furniture, surfaces and containers and mark the points of interest where such food belongs.
- Human activity events are a Tier 2 task; you provide the lanes and areas they use (walking lanes, the area a broom sweeps) as data if GDD 04 defines them.

## Deliverables
1. The building shell: wall boxes with correct thickness and height, the door with its threshold and under-door gap, a window sill if specified, the wall-floor junction; a ceiling at true height (visual closure), interior floor material areas.
2. Interior templates and placement: cabinets and counters with kick-space, table and chairs, appliances with the gaps behind and under them, bin, pet bowl, shelves or other objects in the chapter's tables — built from primitives with materials and flags, arranged in a plausible room layout that varies with the seed.
3. Building micro-connections: door crack, pipe penetrations, gaps at skirting or under units — each passable by the species' standard worker and connecting indoors to outdoors or one interior region to another, generated as free space between primitives.
4. Climb routes and points of interest: floor to counter top via cabinet faces, table top via legs and underside edge, bin rim, bowl rim, window sill — as waypoint routes that a surface walker can follow.
5. Visual checks: screenshots of generated interiors from ant height (world renderer if present, otherwise the debug renderer) and map PNGs, looked at.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; imports limited to `src/core`, `src/sim/types`, the kernel and `src/worldgen`.
2. Over 10 seeds for archetypes that include a building: the interior is enclosed (a flood fill of the nav grid from outside reaches inside ONLY through generated micro-connections or an open door state if the chapter defines one); at least the required number of indoor-outdoor connections exists and each is passable.
3. Furniture does not interpenetrate, rests on the floor, and leaves the walking lanes the chapter requires.
4. Every climb route (counter, table, bin, bowl, sill) can be followed by a kernel walker waypoint to waypoint and back, for a sample across seeds; the table route includes the underside-to-top edge transition.
5. A walker starting outside reaches the pet bowl point of interest using only the nav grid, a micro-connection and the climb route.
6. Screenshots from ant height inside the kitchen have been looked at: the room reads as a kitchen at true scale (floor, towering cabinets, table legs, the door gap with light under it); describe them in the report.
