# FOUNDRESS — Kernel API reference (task F2)

The kernel is the pure geometric core everything that moves or digs sits on: the world field `f(p)`, the carve
grid (negative space) with its brushes, breaches and marching-cubes mesher, the nest navigation fields, and the
surface walker. It is a port of the nest spike (`docs/research/spike-nest.md`, `spikes/nest/**`) onto the shared
types in `src/sim/types/geom.ts` and `src/core`. Pure TypeScript: no three, no DOM, no `Math.random`, no
`Date.now`; runs in Node (Vitest) and the browser.

Conventions (binding, `docs/01-design-seed.md` §3): millimetres, Y up, right-handed. **BU** = body unit of the
played species (Lasius 4 mm). Every length below is mm unless a column says BU; values "in BU" scale with the
species. `f > 0` is free space (air or carved cavity), `f < 0` is inside a solid.

## 1. Files

| Path | Contents |
|---|---|
| `src/sim/kernel.ts` | `KernelWorldInput`, `createKernel()` (wires everything), default dig predicate |
| `src/sim/world/field.ts` | `WorldField` service: `f`, gradient, projection, sphere trace, materials, dynamic primitives; `smin`/`smax`; `FIELD_TUNING` |
| `src/sim/world/primHash.ts` | primitive evaluation cache (`PrimEntry`), analytic SDF gradients, 3D spatial hash `PrimHash` |
| `src/sim/world/terrainSample.ts` | bilinear height + slope, byte-map lookup, terrain-hole distance |
| `src/sim/nest/carve/keys.ts` | chunk keys (SAVE FORMAT), sample indexing, `VoxelBox`, dirty-chunk rule, `OPEN_FRACTION` |
| `src/sim/nest/carve/grid.ts` | `CarveGrid` service over `CarveData` (state = the arrays; Map = cache) |
| `src/sim/nest/carve/brushes.ts` | sphere / capsule / ellipsoid / fill brushes, volume, canDig, breach detection |
| `src/sim/nest/carve/breaches.ts` | breach record de-duplication and pruning |
| `src/sim/nest/carve/mcTables.ts`, `mc.ts` | generated marching-cubes tables; per-chunk mesher (typed arrays) |
| `src/sim/nest/nav/graph.ts` | shared passability per chunk, 26-neighbour steps and the corner-cutting rule |
| `src/sim/nest/nav/distanceField.ts` | one BFS field (Dial buckets): full rebuild and exact incremental update |
| `src/sim/nest/nav/components.ts` | connected components (canonical labels) |
| `src/sim/nest/nav/nestNav.ts` | `NestNav` service: named fields, lazy build, change log, LRU eviction, queries |
| `src/sim/locomotion/walker.ts` | `WalkerKin`, `walkerPlace`, `walkerStep`, `walkerLetGo`, `walkerSurfaceChanged`, `walkerSnapshot` |
| `src/sim/locomotion/walkerParams.ts`, `walkerMath.ts` | walker tuning (BU) and transport helpers |
| `src/sim/kernel.testWorld.ts` | deterministic test worlds (flat; the spike scene + test nest) for tests and the demo |
| `spikes/kernel-demo/**` | visual demo of the production kernel (`window.__spike`), screenshots in `shots/` |

Barrels: `src/sim/nest/carve/index.ts`, `src/sim/nest/nav/index.ts`. Tests sit next to the files
(`*.test.ts`); `src/sim/kernel.perf.test.ts` holds the performance and allocation checks.

## 2. Decisions (read before using the field)

1. **Field formula** (spike-proven): `f = smin( smax(fSoil, fCavity, k), fHard, k )`, k = 0.375 BU (1.5 mm).
   `fSoil` = diggable group: terrain (all layers) and primitives with `isDiggablePrim(p)`; `fHard` = every other
   primitive. Carved space opens only the diggable group: a tunnel under a paving slab gets the slab underside as
   its ceiling. The seed's `max(fSubstrate, fCavity)` is the k -> 0 limit.
2. **Terrain layers are protected at carve time, not by the field grouping.** The default dig predicate
   (`kernel.canDigAt`) refuses samples in a hard crust (`depth < crustMm` and `!canDigMaterial(surface)`) or a
   hard subsoil. World-generation pre-carves pass `force: true` and CAN open the crust: this is how "cracks through
   a monolithic crust" (directions §K, two kinds of pre-existing passage) exist. A tunnel dug under asphalt keeps a
   skin of at most half a voxel below the crust as its ceiling. (Spec wording put the crust in the HARD field group;
   that would make §K cracks impossible with `CarveData` as defined, so this is a recorded deviation.)
3. **Hard primitives are never openable**, not even by `force` (a pre-carved hollow inside a hard log cannot be
   represented; mark such primitives `DIGGABLE`). The default predicate allows samples up to half a voxel inside a
   hard primitive so the cavity iso surface reaches the primitive (exact slab ceiling); nav passability excludes
   them (`hard(p) <= 0`).
4. **Saturated cavity field.** `fCavity = (openness - 0.5) * ramp` is exact within +-ramp/2 (0.5 BU) of a carved
   wall and saturates beyond: gradient 0 in chamber interiors and in deep uncarved soil (where `f = -0.5 BU`).
   `project()` handles that with a 14-direction probe; `walkerPlace()` sphere-traces along a hint direction first.
5. **Breach** = the brush opened a SOLID sample (substrate <= 0) that has an open-AIR face neighbour (substrate > 0).
   Exact at voxel resolution, false under a hard cover (slab, crust) even when the soil surface is close. Records
   are brush spheres (de-duplicated); for rendering prefer `field.isHoleAt(x, z)` as a hole mask (spike §5.7).
6. **Carved volume** uses a box filter one voxel wide across the ramp (`OPEN_FRACTION`); brush results count only
   the SOLID part (open-air parts of entrance brushes do not count). Bias +6 % at r = 1 BU, +1.4 % at 2 BU, < 1 %
   from 3 BU (curvature of the filter), so the 10 % criterion holds from r = 1 BU.
7. **Fill semantics**: `fillSphere(c, r)` makes the sphere solid with its surface at r; afterwards closed samples
   with no open 26-neighbour are cleared to 0, so carve(r) + fill(r) restores the bytes exactly and chunks that
   become all-solid are removed from `CarveData`.
8. **Nav corner-cutting rule** (strict): an edge step needs both face neighbours passable, a corner step all three
   face and three edge neighbours. This matches the MC table (which separates diagonal open corners), so cavities
   touching only at a voxel edge/corner are disconnected in both.
9. **Walker steering is instant**: `walkerStep` points the heading at the tangent part of `desiredDir` when that
   part is >= 25 % of it, otherwise keeps the parallel-transported heading (so pushing "into" a wall climbs it).
   Turn-rate limits, edge latch, floor preference in tunnels and avoidance belong to locomotion (task `loco`).
10. **Tunables** live in `FIELD_TUNING` (field.ts), `CARVE_TUNING` (carve/params.ts), `NAV_TUNING`
    (nav/params.ts), `WALKER_TUNING` (walkerParams.ts), in BU where they scale. The kernel did not own
    `src/sim/balance`; the integrator may re-export them from `src/sim/balance/kernel.ts`.
11. **Vitest speed note**: under Vitest (vite-node) every imported binding is read through a getter on a module
    object, several times slower inside tight loops. Hot modules re-bind such imports as local consts
    (`const x = xImp`); in the browser build the two forms are identical. Keep this pattern in hot code.

## 3. Kernel factory — `src/sim/kernel.ts`

```ts
interface KernelWorldInput { size: number; bu: number; terrain: HeightField; ground: GroundLayers;
                             prims: Primitive[]; terrainHoles?: ByteMap }      // WorldData satisfies it
createKernel(world: KernelWorldInput, carveData: CarveData, opts?: KernelOptions): Kernel
KernelOptions = { canDigMaterial?(m), isDiggablePrim?(p), field?: Partial<FieldParams>, nav?: { maxFields?, maxBytes? } }
```

| Member | Meaning |
|---|---|
| `bu, world, field, carve, nav, walker` | the services; `walker` = `walkerParamsForBU(bu)` |
| `canDigAt(x, y, z)` | default dig predicate (decision 2/3): false deeper than 0.5 voxel inside a hard primitive; true inside a diggable primitive or in open air (strictly above the terrain); else `canDigMaterial(crust or subsoil by depth)`. Cost 0.4 us. |
| `carveSphere / carveCapsule / carveEllipsoid (…, opts)` | grid brushes with `canDig` defaulting to `canDigAt` |
| `fillSphere(c, r, opts)` | grid fill (canDig ignored) |
| `meshChunk(key, opts?)` | `meshChunk` with the field's soil distance as the discard attribute |
| `meshKeys()` | all keys that may carry a mesh (stored chunks and their -x/-y/-z neighbours) |
| `rebuild()` | after replacing `CarveData` contents (load): grid index + nav from scratch |

Wiring done by the factory: `carve.setSubstrateProbe(field.substrateXYZ)` (breaches, volume),
`createNestNav(carve, { isBlocked: hard(p) <= 0 })` (listens to the grid). Throws if
`carveData.voxel != 0.5 * bu`. `DEFAULT_DIGGABLE_MATERIALS` = loam, humus, sand, clay, gravel, wood-decayed,
insulation (Lasius; placeholder until SpeciesDef.dig is wired). Default `isDiggablePrim`: `DIGGABLE` flag AND
`canDigMaterial(p.material)`.

## 4. World field — `WorldField` (`src/sim/world/field.ts`)

`createWorldField(world, carve | null, { isDiggablePrim?, params? })`. Primitives with `VISUAL_ONLY` are ignored.

| Method | Returns / units | Cost (Node, this machine) | Notes |
|---|---|---|---|
| `sample(p)`, `sampleXYZ(x,y,z)` | f, mm | 74-170 ns open terrain, 100-240 ns in a tunnel under a slab | full formula; fast path skips the grid when `fSoil > ramp/2 + k` and primitives when the hash cell is empty |
| `gradient(p, out)`, `gradientXYZ` | f; `out` = analytic gradient, \|g\| ~ 1 near surfaces | 120-230 ns | terrain plane normal, primitive SDF gradients, trilinear carve derivative, chained through smin/smax (convex weights keep Lipschitz-1) |
| `normal(p, out)` | \|grad\|; out = unit normal (+Y if degenerate) | as gradient | |
| `project(p, offset, out, outNormal?)` | boolean | 0.18 us typical; 11 us when the probe runs (chamber interior) | Newton, step <= 1.5\|f-offset\| + 0.05 BU, 12 iterations, tol 0.001 BU; where \|grad\| < 0.1 a 14-direction sphere-trace probe (3 BU) finds the nearest crossing first. Tested: converges within 0.02 BU from points up to 2 BU away (terrain, all primitive shapes, carved sphere incl. its saturated interior, tunnels). |
| `newtonProject(q, offset, maxMove, iters, stopTol, acceptTol, outGrad)` | boolean | | the walker's local projection (no probe) |
| `isNearLevel`, `isClear`, `isInSubstrate` | boolean | 1 evaluation | boolean predicates for hot callers |
| `sphereTrace(o, dir, maxDist, radius)` | t, mm | ~maxDist / (0.9 f) evals, cap 512 | step = max(0.9 (f - r), 0.005 BU); never overshoots (tested with dense sampling). In open air f saturates at the hash margin (4 BU) so long traces take ~maxDist/3.6 BU steps. |
| `segmentFree(a, b, radius)` | boolean | one trace | |
| `height(x, z)` | mm | 35 ns | bilinear; edge heights extended outside the grid |
| `substrate(p)`, `substrateXYZ` | smin(fSoil, fHard), carve ignored | ~f | > 0 = open air |
| `soil(p)`, `hard(p)` (+XYZ) | group distances | ~f | `soil` is the MC discard attribute; `hard` saturates at the margin |
| `cavity(p)` | carve pseudo-distance | ~0.1 us | > 0 inside carved space |
| `materialAt(p)` | `MaterialId` | 0.37 us | nearest primitive within 0.25 BU, else crust (depth < crustMm) / subsoil |
| `primAt(p, maxDist)` | `Primitive \| null` | 0.27 us | nearest primitive whose surface is within maxDist (or containing p) |
| `isUnderground(p)` | boolean | 2 evals | substrate < 0 and f > 0 |
| `isHoleAt(x, z)` | boolean | 0.18 us | f > 0 just (0.1 BU) below the terrain surface: carved entrance or terrain hole (hole mask for renderers) |
| `addPrim`, `removePrim(id)`, `updatePrim` | | 8 us (hash insert, small box) | dynamic primitives (mounds, moved objects); call `walkerSurfaceChanged` for walkers nearby |
| `evals`, `minHeight`, `params`, `bu`, `size`, `carve` | | | `evals` counts evaluations (profiling) |

Terrain: `(y - H) / sqrt(1 + |grad H|^2)` (exact for planes, good for gentle relief). Terrain holes (`terrainHoles`
byte map, any cell size): the ground term becomes `smax(fTerrain, dHole)` where `dHole` is the horizontal signed
distance to the hole cells (exact within one cell, saturating beyond), so a drain is a vertical shaft with
rounded rims. Primitives: values from `src/core/math/sdf.ts` (box = rounded box with `size` = outer half
extents and `round`; cylinder `x` radius / `y` half height / `round`; capsule `x` radius / `y` inner half
length; ellipsoid radii), analytic gradients (ellipsoid: implicit-surface normal). Spatial hash: 8 BU cells,
4 BU margin; unlisted primitives are bounded by the margin (`min(margin, ...)` keeps f continuous across cells).

`FIELD_TUNING` (BU unless noted): blend 0.375, hashCell 8, hashMargin 4, projTol 0.001, projIters 12, projSlack
0.05, probeDist 3, traceSafety 0.9, traceMinStep 0.005, traceMaxIters 512, materialPrimDist 0.25,
holeProbeDepth 0.1.

## 5. Carve grid — `CarveGrid` (`src/sim/nest/carve/*`)

**Representation.** Samples on voxel corners: sample (i, j, k) at (i v, j v, k v), v = 0.5 BU. Chunk (cx, cy, cz)
owns 16^3 samples; index `li | lj << 4 | lk << 8`. Openness byte 0 (solid) .. 255 (open), iso 127.5 (open =
`>= 128`). Brushes write a LINEAR ramp `clamp(0.5 - sdf / ramp, 0, 1) * 255` with ramp = 2 voxels = 1 BU.
`chunkKey(cx,cy,cz) = (cx+1024) + (cy+1024)*2048 + (cz+1024)*2048^2` is part of the save format (coordinates in
[-1024, 1023]: 8192 BU each way). `CarveData` (`voxel`, `keys`, `chunks`, `breaches`) is edited in place and is the
complete saved state; the key -> index Map is rebuilt by `rebuild()`.

| Method | Returns / units | Cost | Notes |
|---|---|---|---|
| `createCarveGrid(data)` | | linear in chunks | validates 4096-byte chunks, builds the index |
| `openness(x,y,z)` | 0..1 trilinear | ~0.1 us | |
| `cavity(x,y,z, g?)` | mm, gradient into g | ~0.1 us | analytic trilinear derivative; `cavityTo(out, slot, …)` writes into a Float64Array |
| `sampleAt(i,j,k)`, `chunk(cx,cy,cz)` | byte / array | Map lookup with last-key cache | |
| `carveSphere(c, r, opts)` | `BrushResult` | r = 1 BU: ~40 us; r = 3 BU: ~90 us (incl. default canDig, breach probes near the surface, listener) | |
| `carveCapsule(a, b, r, opts)` | `BrushResult` | ~proportional to AABB volume | tunnels; one brush, breach records along the axis |
| `carveEllipsoid(c, radii, opts)` | `BrushResult` | | axis-aligned (chambers) |
| `fillSphere(c, r, opts)` | `BrushResult` (volume = solid volume closed) | r = 1 BU: ~16 us incl. residual cleanup on box+1 | canDig ignored; prunes breaches whose centre closed; drops all-solid chunks |
| `takeDirty()` | sorted chunk keys | | keys whose MESH changed: sample s is read by chunks c with 16c-1 <= s <= 16c+17 (cells + normal overlap) |
| `dirtyCount()`, `meshKeys()`, `openVolume()` | | | `openVolume` = sum of OPEN_FRACTION over all samples (includes the parts of brushes in open air) |
| `forEachOpenSample(key, fn)` | | 4096 per chunk | iterates samples >= 128 (global indices) |
| `setSubstrateProbe(fn)`, `addListener(fn)`, `removeListener(fn)` | | | the kernel sets the probe; NestNav listens |
| `version`, `breaches`, `voxel`, `ramp`, `data` | | | |

`BrushOptions = { canDig?: (x,y,z) => boolean; force?: boolean; recordBreach?: boolean }` — only samples whose
position passes `canDig` are opened (`force` ignores it).
`BrushResult = { volume (mm^3, solid part), blockedFraction (0..1 of wanted samples refused), breach, dirty (keys),
changed, opened, closed, box }`. `CarveChange = { kind, box, opened, closed }` is sent to listeners.

**Marching cubes** — `meshChunk(grid, cx, cy, cz, { substrate?, gradient? }): ChunkMesh | null` with
`ChunkMesh = { key, cx, cy, cz, positions (Float32, mm), normals (unit, into the cavity), substrate (Float32 per
vertex: soil-group distance, > 0 = open air -> discard; -1e6 if no function), indices (Uint16) }`. Tables are
generated at load (ambiguous faces always separate the open corners), triangles wind counter-clockwise seen from
the cavity, seam vertices are bit-identical (interpolated low -> high sample): tested watertight (every edge in
exactly two oppositely oriented triangles) across 8 chunks. Normals: central differences of the samples
interpolated along the edge (= gradient of the cavity term; smooth and seam-exact), or the `gradient` callback
(e.g. the field gradient). Cost: 0.27 ms for the busiest test-nest chunk (1 356 triangles), 0.66 ms for a sponge
chunk (5 096 triangles); allocates only the four output arrays.

## 6. Nest navigation — `NestNav` (`src/sim/nest/nav/*`)

`createNestNav(grid, { isBlocked?, maxFields = 32, maxBytes = 64 MB })` (the kernel passes `isBlocked = hard <= 0`).
Graph: passable samples (open and not blocked), 26-connected, step costs 3/4/5 (face/edge/corner, ~3x the voxel
length), strict corner-cutting rule (decision 8). Distances are Uint16 cost units (65535 = unreachable) per chunk,
returned in mm.

| Method | Returns | Notes |
|---|---|---|
| `setTarget(id, { points, radius })` | | seeds = passable samples within `radius` of any point; a point with none within radius uses its nearest open sample (2 voxels). Lazy: built on first query. Redefining resets the field. |
| `removeTarget(id)`, `hasTarget(id)`, `targets()` | | |
| `distanceAt(id, p)` | mm, `Infinity` | graph distance of p's nearest passable sample (+ the offset to it); Infinity if unreachable or p is not within ~2 voxels of open nest space |
| `stepDir(id, p, out)` | distance at p | unit direction from p to the best neighbouring sample (steepest descent); out = 0 at the target or when unreachable. Tested: distance strictly decreases along descent steps until 0. |
| `lookahead(id, p, steps, out)` | distance at p | position of the sample after `steps` descent steps (steering target; the demo AI uses 4) |
| `componentAt(p)` | label or -1 | canonical labels (smallest chunk key/sample first); change on every edit, never persist |
| `nearestOpen(p, out)` | boolean | |
| `build(id)`, `flush()`, `rebuildAll()`, `stats()`, `dispose()` | | `stats` = fields, builtFields, slots, bytes, rebuilds, updates, evictions |

Updates: the grid listener only records changes. On the next query (or `flush()`), passability is refreshed for
the changed boxes; carves are applied to each built field incrementally and EXACTLY (affected samples in each box
+1 are re-seeded from their neighbours under the new rules, Dial relaxation spreads from there; tested equal to a
full rebuild after 40 random carves); anything that closed a sample frees every field (full rebuild on next use);
a field more than 512 boxes behind is rebuilt. LRU eviction keeps at most `maxFields` built fields within
`maxBytes`; an evicted field keeps its seeds and rebuilds on demand. Memory: passability 4 KB + 108 B per chunk
(shared), 8 KB per chunk per built field, 16 KB per chunk for component labels when used.

Costs (Node, best of 6): full BFS over 106 719 open voxels 40 ms (0.37 us/voxel; under heavy machine load up to
~60-100 ms), building the shared passability for them 36 ms (once, then incremental), incremental update after a
dig 0.3-0.4 ms, test-nest fields 1-3 ms.

## 7. Surface walker — `src/sim/locomotion/walker.ts`

```ts
interface WalkerKin { pos; up; fwd; prevPos; prevUp; prevFwd: Vec3; speed /*mm/s*/; footOffset /*mm*/;
                      medium: 'surface' | 'cavity' | 'air' | 'water'; vel /*mm/s*/: Vec3; gait /*0..1*/ }
type WalkStatus = 'ok' | 'blocked' | 'fell' | 'falling' | 'landed' | 'failed'
```
`WalkerKin` matches the contracts' `Walker` without `nav`/`radius` (structural; an `Ant` can be passed directly).

| Function | Notes |
|---|---|
| `createWalkerKin(footOffset)` | fresh state (allocates) |
| `walkerPlace(field, w, pos, { dir?, heading? }, params?)` | snaps to the nearest surface; where \|grad\| < 0.2 or f > 2.5 foot it first sphere-traces along `dir` (default -Y, up to 100 BU). Heading = tangent part of `heading` (default current fwd). Resets prev*, vel, speed. Returns false (unchanged) if no surface. |
| `walkerStep(field, w, desiredDir \| null, speed, dt, params?)` | see below; returns `WalkStatus` |
| `walkerLetGo(field, w, push?)` | medium 'air', vel = up * push (default 6 BU/s) |
| `walkerSurfaceChanged(field, w, params?)` | after carve/fill/primitive change nearby: local re-projection (<= 0.375 BU), else lets go. Returns attached?. |
| `walkerSnapshot(w)` | copies pos/up/fwd into prev* (call once per tick before stepping) |

`walkerStep` on a surface: (1) if \|f - foot\| > 0.005 BU re-attach (else 'fell'); (2) heading -> tangent part of
`desiredDir` if >= 25 % of it; (3) move `speed * dt` in substeps <= 0.25 BU (half a voxel): tangent step, Newton
projection onto `f = footOffset` (<= 6 iterations, tol 0.001 BU, step clamp 1.5 s + 0.05 BU), accept if error
< 0.0075 BU, chord < 2.5 s + 0.025 BU, chord midpoint f > 0.2 foot and the normal turned < 110 deg, else halve s (3x)
and finally 'blocked'; (4) parallel transport fwd by the rotation old up -> new normal; (5) speed, gait
(+distance / 0.5 BU stride), medium ('cavity' when inside the substrate). In the air: v += g dt, v /= (1 + drag dt)
(g = 9810 mm/s^2, drag 14 /s, terminal ~700 mm/s), swept by sphere trace with radius 0.9 foot; on contact project
and keep the heading ('landed'); a buried walker (fill closed over it) pops out upwards on landing; below the
lowest terrain - 256 BU -> 'failed'. Guard: any step ending with f < 0.3 foot or a non-finite value is REVERTED
and returns 'failed'. NaN inputs are ignored.

Tested scenarios (scene world, BU 4): flat ground at the foot offset; floor-to-wall keeps heading straight up the
wall (drift < 0.5 mm, <= 1 normal reversal); over the slab's top edge and down the far side onto the ground;
two full turns around the table leg at constant radius and height; onto and along a chamber ceiling (medium
cavity); entrance shaft -> deepest chamber -> back out along BFS fields; let go from the table underside and land;
re-attach after a small dig, fall into a pit, pop out after being buried; soak 200 walkers x 5 000 random steps
(speeds 0-12 BU/s, random dirs, random let-go): f >= 0.3 foot at every step, no NaN, ~0 failures.

`WALKER_TUNING` (BU unless noted): footOffset 0.15, maxSubstep 0.25, projIters 6, projTol 0.001, acceptTol 0.0075,
projSlack 0.05, chordFactor 2.5, chordSlack 0.025, midMinFoot 0.2, maxTurnCos -0.35 (110 deg), substepRetries 3,
reprojTol 0.005, reattachMax 0.375, minSteer 0.25, gravity 9810 mm/s^2, drag 14 /s, fallRadiusFoot 0.9,
letGoPush 6 BU/s, maxFallBelow 256, placeTrace 100, stride 0.5, minClearanceFoot 0.3.

## 8. Measured performance (criterion 7)

Machine: 4 cores, Node 22 via Vitest, shared with other engineers' jobs (numbers are best-of-N; under load expect
up to 2x). Reproduce with the exact budgets: `FOUNDRESS_PERF_STRICT=1 npx vitest run src/sim/kernel.perf.test.ts
--reporter verbose` (prints `KERNEL_PERF {...}`); in the normal parallel suite the assertions allow 2x for machine load.

| What | Result | Budget |
|---|---|---|
| Walker step, open terrain, one 0.1 s AI tick at cruise 6 BU/s (3 substeps) | **1.0 us** (2.6 us under load) | < 6 us |
| Walker step, tunnel under the slab (soil + carve + hard primitive) | **1.3 us** (3.2 us under load) | < 25 us |
| Walker step per 1/60 s frame | 0.45 us open, 0.65 us tunnel | |
| Field evaluation | 74 ns open, 101 ns tunnel; gradient 121 ns | |
| Meshing the busiest test-nest chunk / a sponge chunk | 0.27 ms (1 356 tris) / 0.66 ms (5 096 tris) | < 3 ms |
| BFS full rebuild, 106 719 open voxels | **40 ms** (0.37 us/voxel) | < 60 ms / 100k |
| BFS incremental after a dig | 0.3-0.4 ms | |
| Per-step allocations (sample, gradient, project, walkerStep) | none in our code (code reading); after 240 000 iterations with a forced full GC the heap grew 110-160 KB (JIT/IC data); scavenges took 2-8 % of the run | none |
| Browser (Chrome headless, demo): AI ant tick incl. 4-step nav lookahead | 12 us | |
| Demo world build (terrain + test nest carve + 2 BFS) / mesh 38 chunks | 47 ms / 47 ms (first-call JIT) | |

About allocations: V8 boxes a double (16-byte HeapNumber) when a non-inlined call returns it or receives it as an
argument. Hot helpers therefore write scalar results into typed arrays or fields (`R`, `PRIM_D`, `this.fv`,
`cavityTo`) and the walker uses boolean predicates, but boxing at some call boundaries remains; it is short-lived
young-generation garbage, never retained (the heap test forces a full GC and checks retained growth < 0.25 MB).

## 9. Known limits and follow-ups

- **Sheets thinner than ~2 x foot offset** (leaves, paper < 0.3 BU) are not guaranteed against tunnelling; they need
  a one-sided sheet primitive (spike §5.3).
- **Helix drift** in round tunnels and on stems: parallel transport makes a "straight" walk a geodesic helix; AI
  steering and the possessed ant's camera-relative input correct it; loco should add a prefer-floor bias.
- **Saturated cavity interiors** (decision 4): nothing projects from the middle of a chamber without a hint;
  `project()` probes 3 BU, `walkerPlace` traces along `dir`.
- **Breach spheres can overlap refused crust** next to a breach elsewhere on the same brush (render artefact
  risk); renderers should rasterise `field.isHoleAt` into a hole mask instead of trusting spheres alone.
- **Terrain layers per byte-map cell**: crust thickness and diggability jump at cell borders (only visible where a
  tunnel runs under a crust boundary).
- **Ellipsoid primitives**: the core approximation overestimates interior depth (sign and surface exact); the
  gradient used is the implicit normal.
- **Dynamic primitives** do not notify walkers: call `walkerSurfaceChanged` for walkers within a few BU.
- **Nav fills** cost a full rebuild per field on next use (~0.4 us/voxel): run large rebuilds off the hot tick.
- **Walker speed above ~25 BU/s at 0.1 s ticks** means > 10 substeps per tick: fine for correctness, scale the
  cost estimate.
- **Strict corner rule** makes distances in narrow diagonal tunnels slightly longer than Euclidean (< 5 % in tests).

## 10. Demo

`spikes/kernel-demo/` renders the production kernel on the spike scene with the spike's render code (materials
copied unchanged; meshes adapted to the kernel). `node tools/harness/play.mjs --root spikes/kernel-demo --query
"test=1" --script spikes/kernel-demo/scripts/shots.mjs --out test-output/kernel-demo --width 1280 --height 720
--script-timeout 300000`. API `window.__spike`: `teleport(x,y,z,{heading,dir})`, `setInput({forward,turn,desired})`,
`step(seconds,{render})`, `letGo()`, `walkerState()`, `navTo('C1'|'C2'|'C3'|'exit'|'deep')`, `spawnAI(n)`,
`aiState()`, `setCamera('third'|'free', opts)`, `render()`, `stats()`, `dispose()`. Reviewed screenshots and the
walker state of each are kept in `spikes/kernel-demo/shots/` (surface with the entrance hole, looking down the hole,
third person in a tunnel, a walker on a chamber ceiling from behind and from the floor, climbing the stem, AI
walkers flowing through a tunnel and a chamber).
