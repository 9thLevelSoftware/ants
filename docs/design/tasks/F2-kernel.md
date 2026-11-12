# Task F2 — Kernel: world field, carve grid, marching cubes, nest navigation, surface walker

## Goal
Port the proven nest spike into the production simulation layer as a small, pure, heavily tested kernel. Everything that moves or digs in the game sits on these functions; they must be correct, robust and allocation-free in hot paths.

## Read first
- `docs/01-design-seed.md` §3–4 (binding conventions) and `docs/design/tdd/00-contracts-guidance.md` §4 (Walker) and §7 (services).
- `docs/research/spike-nest.md` — ALL of it: what worked, parameter values, failure modes, the recommended production API. Then the spike code in `spikes/nest/**` (the pure logic files are your starting point).
- `src/sim/types/geom.ts` (shared types: `Primitive`, `HeightField`, `GroundLayers`, `ByteMap`, `CarveData`, `Breach`, materials, `PrimFlag`) and `src/core/README.md` (use `src/core`; do not duplicate it).
- `docs/02-design-directions.md` §K last bullet (two kinds of pre-existing passage) and, for parameters only, `docs/design/gdd/digests/03.md` (nest) and `docs/design/gdd/digests/01.md` (movement expectations).

## You own
- `src/sim/world/field.ts`, `src/sim/world/primHash.ts`, `src/sim/world/terrainSample.ts`
- `src/sim/nest/carve/**` (grid, brushes, sampling, breaches, marching cubes + tables)
- `src/sim/nest/nav/**` (BFS distance fields over open voxels)
- `src/sim/locomotion/walker.ts` (+ small private helpers next to it, e.g. `walkerMath.ts`)
- `src/sim/kernel.ts` (one factory that builds all of the above from a world + carve data)
- tests next to each file; `spikes/kernel-demo/**` (a visual demo page of the production kernel); `docs/design/tdd/02-kernel.md` (API reference)
Another engineer is writing the wider contracts (`src/sim/types/**` other than `geom.ts`, `src/sim/sim.ts`, stubs `index.ts` in module folders) at the same time: do not touch those, and do not depend on them. If `src/sim/world/index.ts`, `src/sim/nest/index.ts` or `src/sim/locomotion/index.ts` exist, leave them alone.

## Interfaces
Do not import the wider contracts. Define the kernel's own input as a structural type in `src/sim/kernel.ts`:
```ts
interface KernelWorldInput {
  size: number;            // world edge length, mm
  bu: number;              // body unit, mm (voxel = 0.5 * bu)
  terrain: HeightField;
  ground: GroundLayers;
  prims: Primitive[];
  terrainHoles?: ByteMap;  // cells where the ground term is removed (drains etc.)
}
```
(the game's `WorldData` will satisfy it structurally). The walker operates on a structural kinematics type matching contracts guidance §4 (`pos`, `up`, `fwd`, `prevPos`, `prevUp`, `prevFwd`, `speed`, `footOffset`, `medium`, `vel`, `gait`) — export it as `WalkerKin`.
Export clear interfaces (`WorldField`, `CarveGrid`, `NestNav`) from your files; they become the service contracts.

## Work
1. **World field** `f(p) = max(fSubstrate, fCavity)`, positive in free space.
   - Follow the spike's proven formula: `f = smin(smax(fSoil, fCavity, k), fHard, k)` with a small smoothing radius k (the spike used 1.5 mm at BU 4; express it in BU). Solids are split into a DIGGABLE group (terrain soil below any hard crust, plus primitives the played species can excavate) and a HARD group (everything else); carved space only opens the diggable group, so a tunnel can run under a paving slab and the slab becomes its ceiling. Which primitives are diggable is decided by a predicate supplied at kernel creation (`isDiggablePrim(prim)`: e.g. wood for carpenter ants), and for terrain by the ground layers (hard crust thickness, subsoil material) through a `canDigMaterial(material)` predicate.
   - Keep every mitigation in spike-nest.md section 5 that concerns the field and the walker (smooth min/max against corner jitter, the saturated-cavity placement rule, the thin-sheet guards, `surfaceChanged` re-projection after carves).
   - Terrain term from the heightfield (bilinear; slope-corrected vertical distance), terrain-hole mask, primitives through a spatial hash (rounded box, cylinder, capsule, ellipsoid via `src/core/math/sdf.ts`), dynamic primitives (`addPrim`, `removePrim`, `updatePrim`).
   - `height(x,z)`, `substrate(p)`, `cavity(p)`, `sample(p)`, `gradient(p, out)`, `project(p, offset, out, outNormal?)`, `sphereTrace(origin, dir, maxDist, radius)`, `segmentFree(a, b, radius)`, `materialAt(p)` (primitive material, or surface/subsoil by depth and crust thickness), `primAt(p, maxDist)`, `isUnderground(p)` (inside carved space within the substrate), a fast path when no primitive and no carve chunk is near.
2. **Carve grid** over `CarveData` (the arrays in it ARE the saved state: keep `keys`/`chunks`/`breaches` in sync so saving needs nothing else; an internal Map index is a derived cache with a `rebuild()`).
   - 16^3 chunks, voxel = 0.5 BU, openness bytes with iso 127.5; trilinear `openness(p)`; cavity pseudo-distance and gradient valid in a narrow band.
   - Brushes: `carveSphere(c, r, canDig?)` (smooth falloff; only voxels whose centre passes `canDig` open; returns carved volume in mm^3, blocked fraction, breach flag, dirty chunks), `carveCapsule(a, b, r, canDig?)` for tunnels, `fillSphere(c, r)`, and a `force` option for world-generation pre-carves.
   - Dirty-chunk tracking (`takeDirty()`), breach detection and recording, total open volume, iteration over open voxels of a chunk.
3. **Marching cubes** per chunk as plain typed arrays (positions, normals from the field gradient, per-vertex substrate distance for discarding fragments in open air, indices), watertight across chunk seams, inward-facing winding. Lookup tables in their own file.
4. **Nest navigation**: BFS distance fields over open voxels (26-connected with corner-cutting rules that prevent leaking through diagonal walls), keyed by target (a set of seed points such as entrances, or a chamber centre); incremental update when space is carved (monotone decrease), full rebuild when space is filled; `distanceAt(fieldId, p)`, `stepDir(fieldId, p, out)` (direction to the best neighbouring voxel), connected-component query (which open region a point belongs to), bounded memory, lazy creation and eviction of rarely used fields.
5. **Surface walker**: `walkerPlace(field, w, pos)` (snap to nearest surface), `walkerStep(field, w, desiredDir, speedMmPerS, dtSeconds)` (tangent step in substeps of at most half a voxel, re-projection to `f = footOffset`, parallel transport of the heading, gait accumulation, medium detection), `walkerLetGo` / ballistic fall and landing, and guards: never ends inside a solid, never produces NaN, recovers when a projection fails (returns a status so callers can react), no tunnelling through thin walls, stable at concave corners.
6. **Demo page** `spikes/kernel-demo/`: render the production kernel (terrain + primitives + a carved test nest + walkers; reuse the spike's rendering code) with `window.__spike`-style scripting, to prove the port visually.
7. **API reference** `docs/design/tdd/02-kernel.md`: every exported function with units, costs, parameter values that work, and known limits.

## Acceptance criteria
1. `npm run typecheck` clean; all kernel tests green in Node (no DOM, no three in `src/sim/**`).
2. Field tests: sign and gradient direction against analytic cases (flat ground, each primitive type, a carved sphere below ground, a carved sphere breaching the surface); `project` converges onto the level set within 0.02 BU from points up to 2 BU away; `sphereTrace` never overshoots into solid.
3. Walker tests on a test world with primitives and a carved nest: floor-to-wall transition keeps moving up the wall; walking over a box top edge continues down the far side; circling a cylinder; ceiling walk inside a chamber; descending the entrance shaft to the deepest chamber and returning using a BFS field; and a soak of 200 walkers x 5,000 random steps where every walker satisfies `sample(pos) >= 0.3 * footOffset` at every step and no NaN ever appears.
4. Carve tests: carve then fill restores solidity; carved volume matches the analytic sphere volume within 10 % for r >= 1 BU; `canDig` is respected; breaches are detected exactly when a brush crosses the substrate surface; `CarveData` round-trips through `encode/decode` and a rebuilt grid samples identically.
5. Marching-cubes tests: a closed cavity produces a watertight mesh (every edge shared by exactly two triangles) including across chunk seams; normals point into the cavity.
6. Nest-nav tests: incremental update equals a full rebuild after random carving; distance decreases monotonically along `stepDir` to the target; unreachable regions report unreachable.
7. Performance (measured and written into the API reference): walker step under 6 microseconds on open terrain and under 25 microseconds in tunnels on this machine; meshing a busy chunk under 3 ms; BFS over 100k open voxels under 60 ms; no per-step allocations in `field.sample`, `gradient`, `project`, `walkerStep` (verified by code reading and a simple heap-growth test).
8. Demo screenshots (taken with the harness and looked at): surface with the entrance hole; third person inside a tunnel; a walker on a chamber ceiling; a walker climbing a stem; AI walkers flowing through the nest.
