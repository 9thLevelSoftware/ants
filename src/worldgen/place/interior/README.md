# worldgen-interior — the building and its kitchen slice

GDD 04 §5.7 (catalogue), §6.2 (micro-connections), §10 (climb routes, POIs), §11 (nav), §14 (boundary).
Templates live in `src/worldgen/catalog/interior/` (data in `dims.ts`, builders per part); placement in this
folder. Registered through the kit: placer `default/building-shell` (structures step, replaces the built-in
shell) and `interior/exterior-routes` (props step, after the outdoor paving exists).

## Layout of the code
| File | What |
|---|---|
| `room.ts` | frame from the zone layout: `u` along the house edge, `r` from the exterior wall's inner face into the room |
| `plan.ts` | the kitchen plan: door gap / weather strip, main run on the exterior wall, optional L-run, fridge, sink under the window, cooker, washer, pipes |
| `shellPlace.ts` | floor slab, cavity façade with vents and air bricks, sealed blocks, end/back walls, ceiling, door, window, pipes |
| `runPlace.ts` | base units, kickboards, countertops, sink, appliances, kick-space micro |
| `furnish.ts` | doormat, pet bowls, pedal bin, table and chairs, houseplant, counter items (each kept only if the human lanes survive) |
| `micro.ts` | skirting boards + skirting-gap, door-crack, pipe-penetration, weep-vent |
| `exterior.ts` | downpipe; props step: outside mouths of the building micro-connections re-seated on the final garden surface (sill top, paving), window-sill climb route |
| `solid.ts` | clearance at a point, dense (9^3) overlap test of a placed object, route-in-free-space test |
| `lanes.ts` | `interiorHumanAreas(world)`: 250 mm human grid, lanes door -> nodes, wipe/sweep/crevice areas (GDD 15) |
| `food.ts` | `interiorFoodSpots(world)`: which interior POI carries which food (for worldgen-life) |
| `testkit.ts` | test support: kernel on a world, waypoint walker, nav path with portals |

## Rules worth knowing
- Every passage is free space between primitives (directions §K): door crack under the leaf, pipe annulus in a
  square hole through all wall layers (with cavity closers), kickboard and skirting floor gaps, weep-vent slots.
- The floor slab lies under the room only; the walls stand on the terrain (-100). With that, no opening near the
  floor reads as walkable floor in the nav grid; pipe holes are raised until their bottom is more than
  `NAV_OVER_MAX + 1 BU` above the ground under the wall (Lasius: floor + 35, larger species higher, entering the
  service void behind the sink unit). The nav grid therefore reaches the room only through micro portals.
- Kickboard sections under a climb route sit on the floor (gap 0) so the route has a floor-to-face corner; one
  other section per run is guaranteed passable (the run's `kick-space` micro).
- Furniture is kept only if the dense overlap test finds no penetration (the kit's 3^3 lattice misses thin
  overlaps) and all its route nodes lie in free space. The pedal bin's route side is the one facing the room; a
  lid hinge bridges the 1-2 mm seam where the route crosses it (a walker turns into an open seam wider than twice
  its foot offset and stalls there).
- With an L-run, its kickboard butts against the main kickboard's front face, and no cooker or washer stands in
  the slot under the L counter's reach; a corner fridge cuts the end-wall skirting behind its side.
- Outside mouths (door crack on the threshold sill, pipe and weep vent on the garden surface) get their height in
  the props step, after the paving exists; the kick-space mouth behind the board keeps clear of the plinth legs.
- Climb-route nodes sit one foot offset off the surfaces; segments longer than 8 BU run along a surface (the kit
  resamples them), corners get their own nodes.
