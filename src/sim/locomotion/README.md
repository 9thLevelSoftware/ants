# Locomotion (task loco)

Everything that gets ants and creatures from A to B, on top of the kernel's surface walker (`walker.ts`,
`walkerMath.ts`, `walkerParams.ts`: F2; viab-loco added the bracketed projection fallback). Pure TypeScript, no three / DOM.

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

`stalledAnts(sim, rt)` / invariant `walker-stall` (stallWatch.ts): ants that spent 600 ticks with nav status `moving`
within 0.25 BU of one point, added up across failed, re-issued and paused walks (leaving the sphere starts a new
window, an arrival ends it; time as the possessed ant, stunned, cold-held, in the air or held by a movement override
does not count), with position, normal, state, destination and target. `walker-in-bounds`: nothing outside [8 BU, side - 8 BU].

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
(not only cells whose centre is inside) x 20, and string-pulling never cuts a disc. While a colony has avoid discs,
its trips home follow a disc-weighted variant of the cached entrance flow field (key `nest:<id>|avoid`, signature
including the discs; a cell inside a disc carries the x 20 itself, since walkers descend the field to the lowest
neighbour; rebuilt in full on a grid change, never repaired), so a large outdoor force pays no A* per trip; a
two-cell lookahead that would cut a disc falls back to the next cell. A trail sensor reading inside a disc counts x 0.1; a
trail that goes on only inside a disc is not crossed as a gap: the walker turns out of the disc instead.

Steering: the leg's direction is normalised first, then separation (in nests and near the goal), the prefer-floor
bias (cavities), map-edge and avoid repulsion are added with their unitless weights.

## Stuck recovery

Progress = the leg's own metric (distance to the waypoint, field distance, flow cost). Planning a new leg is not
progress (its first metric is only a baseline; the window keeps running), so a walker whose legs keep ending
without arriving is caught. Climbing counts as progress: on a steep face (|up.y| < pinnedUpY) a new highest point 0.5 BU above the last
(`anchor.y`, reset per leg, waypoint and rung) re-baselines the metric, so a tall board is climbed and descended
instead of laddered mid-climb; going up and down the same wall is not progress.
No improvement of 0.5 BU in 2.5 s climbs one rung: replan, sidestep, back off, re-snap,
relocate (<= 2 per request, 6 BU toward the next waypoint / flow cell / field sample, event `ant-unstuck`), fail. Episodes per request are capped and every request has a timeout, so every walker ends `arrived` or `failed`.

A wander has no goal to replan toward or relocate along, so it has its own short ladder (`stuck.ts` wanderStuck):
no 0.5 BU of movement for `wanderStallS` (1 s) pivots the walker on the spot for `wanderPivotS` (its heading sweeps
round a quarter turn ahead, the pull to the wander centre ignored); a pivot that frees nothing, or more than
`wanderStallMax` stalls in one request, ends the wander `failed` with mode 'none' (callers that re-issue "while not
wandering" do so at once; the in-nest idle behaviour walks back toward its chamber's centre first).

Pinned walkers (`letGoPinned`): standing (speed 0) without progress for `pinnedS` (1 s), a walker with any request
lets go and drops, once per stuck window (the window is not restarted, so one that lands back on the same spot, wedged
in a crack or at a crease of the field, climbs the ladder): in a cavity on a steep slope, wall or overhang
(up.y < 0.7); on the surface when hanging (up.y < 0.7) or at a raised edge (a leaf tip it cannot wrap round) with its
next point at least 1 BU lower. A surface walker upside down (up.y < -0.5) that keeps circling under a sheet or a bulge
with its next point lower also lets go. The request goes on after the landing. Thin fins and lips of dug soil held walkers whose every step was rejected for many seconds (the 2-game-day
soak's longest continuous "moving, speed 0" run fell from 241 to 19 ticks).

A wander asked for again while it runs (same centre within 0.5 BU, radius and speed) is kept as it is: behaviours that
re-issue it every think no longer restart its ladder.

The kernel walker's projection falls back to a bracketed bisection along the gradient when Newton cycles (a crease
where blended solids meet), and hops a small value jump of the field on its free side (the terrain pseudo-distance
across a steep crest of a mound pile against an object, < 0.75 x foot offset): walker.ts bracketProject.

## Weather (weather.ts, puddles.ts; GDD 06 §3.3, §3.10)

- Stunned (`ant.bb[WX_STUN_KEY]` > tick: rain hits, collapses, combat, creatures): the ant does not walk (AI and
  possessed); its stuck window is held.
- Under water (`isUnderWater` of the nest flood module: a flooded nest voxel or a puddle >= WX_PUDDLE_AVOID_BU): speed
  x0.3 (AI and possessed); on the surface the walker's medium is `water` (in a nest it stays `cavity`).
- Wet surfaces (`surfaceWet` 0..1): grip x lerp(1, 0.9, wetness) outside nests, in the slope slip test.
- Puddles on the nav grid (the moisture grid is the 16 BU nav grid): cost x WX_PUDDLE_AVOID_COST at the avoid depth,
  blocked at WX_PUDDLE_BLOCK_BU (`setWetCells`, synced every tick from state). The possessed ant is never planned and
  may swim.

## Crowding (neighbours.ts)

Separation queries the crowd grid of the tick start, which stops after `separationMax` hits (own cell first): a dense
room costs no more than a sparse one. An ant wandering in carved space with at least `dozeCrowd` nestmates (ants of its colony) within the
separation radius dozes (stands, unstepped, stuck window held) for the last 3 s of each 4 s cycle (phase by id).

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
`nests.ts`, `routes.ts` queries - `stallWatch.ts` stall invariant - `weather.ts`, `puddles.ts` weather hooks -
`neighbours.ts` crowd grid - `runtime.ts` per-sim caches and counters - `scratch.ts` persisted per-walker
state (`nav.loco`) - `params.ts` tuning (BU) - `grid/*` the nav grid (`src/sim/world/navGrid.ts` is its entry) -
`testkit.ts`, `scenario.ts`, `possessedSweepKit.ts` test support.
