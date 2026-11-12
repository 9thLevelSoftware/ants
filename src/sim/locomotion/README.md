# Locomotion (task loco)

Everything that gets ants and creatures from A to B, on top of the kernel's surface walker (`walker.ts`,
`walkerMath.ts`, `walkerParams.ts`: F2, not edited here). Pure TypeScript, no three / DOM.

## API (index.ts)

Behaviours never move walkers: they make a request and poll `nav.status` (`moving` -> `arrived` | `failed`).

| Call | What it does |
| --- | --- |
| `navTo(sim, w, dest, arriveDist?, opts?)` | trip to a point; legs composed automatically (see below) |
| `navToTarget(sim, w, target, arriveDist?, opts?)` | trip to an entity (re-resolved every second), entrance, chamber (its nest field), plan, nest, marker, point |
| `navToPoi(sim, w, poiId, ...)` | trip to a point of interest; elevated ones via their climb route |
| `navFollowField(sim, w, nestId, target, ...)` | one nest distance field downhill |
| `navClimb(sim, w, routeId, ...)` | one authored climb route, from the nearest node to the far end |
| `navWander(sim, w, centre, radius)` | heading noise, pulled back inside the radius; never arrives |
| `navFollowTrail(sim, w, colony, channel, dir?)` | three-sensor trail following; fails after TRAIL_LOST_S |
| `navRetrace(sim, ant)` | breadcrumbs home with shortcuts; arrives at crumb 0 (the entrance) |
| `navStop(sim, w)` | stand still (`idle`) |
| `placeOnSurface(sim, w, pos, dir?)` | spawn / teleport onto the level set; `dir` = hint for saturated cavity space |
| `integratePossessed(sim, ant, dt)` / `possessedPose(sim)` | per-frame PREDICTION of the possessed ant (state untouched) |
| `notifySurfaceChanged(sim, min, max)` | after dynamic primitives / mounds changed (walkers re-attach, nav grid re-derives) |
| `registerSpeedFactor(sim, f)` | extra speed multipliers owned elsewhere (nest crowding and squeezes, wet films) |
| `registerMovementOverride(sim, f)` | Tier 2 hook: flight, floating on water |
| `setLocoObserver(sim, pos)` | LOD observer (camera focus); default: possessed ant, else the player's nest |
| `locoStats(sim)` | diagnostic counters (plans, stuck episodes, ladder rungs, relocations, LOD skips ...) |

`NavOptions`: `arriveDist` (mm), `speed` (`'cruise'` = species cruise x temperature x health x load x callow,
`'run'` = the caste's sprint, or a fixed mm/s), `speedMult`.

## Trips

`navTo` resolves the goal (surface point, or a nest + field for points inside a nest) and plans one leg at a time:

1. inside a nest and the goal is elsewhere: the nest's exit field up to the entrance mouth, then out over the rim;
2. on the surface towards a nest: the goal nest's own cached entrance flow field (one per nest, so a trip into
   nest A is never captured by nest B's entrance) or A*, then into the hole;
3. on the surface: direct when close and clear (or within one nav cell), else A* on the 16 BU nav grid (budgeted
   per tick), string-pulled, through micro-portals the walker fits (clearance 0.45 x body length);
   elevated goals (more than 3 BU above the ground) go to a climb route's base, up the route, then direct;
   elevated walkers leave by the nearest route;
4. inside the goal nest: the goal's chamber / plan field, or a shared point field;
5. in carved space of no nest (a pit, a crack, a natural cavity): to the cavity's nearest opening, else straight
   toward the goal (climbing the walls).

Point goals are put on the walkable surface (a chamber centre drops to its floor, y = 0 under a mound rises to the
mound). Inside the goal nest a point goal is followed on its shared point field only until the walker is within
`pointSeekBU` (3 BU) of the field's bottom; the rest is a direct final seek aimed at the goal lifted by the foot
offset (the point field is quantised to 2 BU cells and seeded over 1 BU, so its bottom is not the goal: following
it there used to stall with status 'moving' and speed 0 - sim-fix-ants item 1). Arrival is measured from the surface point under the walker (its centre minus footOffset); the last leg
(the final seek, or the goal field) brakes so a step never covers more than about half the distance left and
pivots toward a goal beside or behind the walker (keeping `arrivePivotCreep` of its speed; the turning circle is
taken at the walker's real speed, so it pivots only near the goal), so any arrival radius works. A walker on its
last leg that made no progress for `arriveStallS` (0.6 s) within arriveDist of the destination counts as arrived
(other legs: the 2.5 s stuck window). A walker upside down in a cavity (up.y < -0.5) whose goal lies at least
1 BU lower and within 2.5 BU horizontally lets go and drops (GDD 01 `let-go`); the leg is planned again on landing.
When a request ends (arrived or failed) the ant thinks on the next tick, whatever its think cadence. Arrival points are jittered within the arrival radius so crowds spread out.

A leg is re-planned when it ends, when the walker enters or leaves a nest, lands after a fall, the carve grid
changed under it (flag persisted in its scratch), a moving target moved, or the colony's avoid markers changed.
Moving targets are re-resolved every second, and every tick once the walker is close.

Avoid markers (GDD 02 §12.2): an autonomous ant's planner prices every 16 BU cell whose square overlaps a disc
(not only cells whose centre is inside) x 20, and string-pulling never cuts a disc; while a colony has avoid discs,
trips home use A* instead of the cached entrance flow field. A trail sensor reading inside a disc counts x 0.1; a
trail that goes on only inside a disc is not crossed as a gap: the walker turns out of the disc instead.

Steering: the leg's direction is normalised first, then separation (in nests and near the goal), the prefer-floor
bias (cavities), map-edge and avoid repulsion are added with their unitless weights.

## Stuck recovery

Progress = the leg's own metric (distance to the waypoint, field distance, flow cost). Planning a new leg is not
progress (its first metric is only a baseline; the window keeps running), so a walker whose legs keep ending
without arriving is caught. No improvement of 0.5 BU in 2.5 s climbs one rung: replan, sidestep, back off, re-snap,
relocate (<= 2 per request, 6 BU toward the next waypoint / flow cell / field sample, event `ant-unstuck`), fail. Episodes per request are capped and every request has a timeout, so every walker ends `arrived` or `failed`.

## Level of detail

A walker with no request that stood still last tick is not stepped (it is re-attached by the carve-change check,
`notifySurfaceChanged`, and a staggered step every 16 ticks).

Walkers on the surface far from the observer step every 2nd (> 160 BU) or 4th (> 420 BU) tick with a longer dt;
`prevPos` is snapshotted every tick, so a skipped walker does not re-play its last step in the renderer. Trail
followers step at least every 2nd tick (the trail law is integrated over dt, but sensors must be read every
~1.2 BU or bends are walked past).

## Files

`index.ts` API - `system.ts` the per-tick system - `update.ts` per-walker request update - `trip.ts` goal
resolution and leg planning - `legs.ts` leg following - `modes.ts` wander / trail / retrace - `crumbs.ts`
breadcrumbs and path integration - `steer.ts` turning, separation, floor bias, edge and avoid repulsion -
`stuck.ts` recovery ladder - `possessed.ts` player movement and prediction - `speed.ts` speed composition -
`nests.ts`, `routes.ts` queries - `runtime.ts` per-sim caches and counters - `scratch.ts` persisted per-walker
state (`nav.loco`) - `params.ts` tuning (BU) - `grid/*` the nav grid (`src/sim/world/navGrid.ts` is its entry) -
`testkit.ts`, `scenario.ts` test support.
