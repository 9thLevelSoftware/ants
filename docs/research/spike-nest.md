# Spike: nest / surface walker / third-person camera (verified by running)

Status: **works**. Free-form digging into a sparse carve grid, one surface-walking controller for ground, walls,
ceilings, stems, table undersides and tunnels, and a third-person camera that stays usable in 8 mm tunnels were all
built and proven in headless Chromium (SwiftShader WebGL2) and in Node (vitest). Every screenshot listed at the end
was produced by `spikes/nest/scripts/shots.mjs`, which **walks** the ant into each pose (teleports only set up start
points) and returns the walker/camera state for each shot. I looked at every image.

Conventions follow `docs/01-design-seed.md`: mm, Y up, BU = 4 mm (Lasius), voxel = 0.5 BU = 2 mm, carve chunk =
16^3 voxels = 32 mm, f(p) > 0 in free space.

## 1. How to run

```
# Node tests (pure layer: MC table + seams, walker scenarios, nav exactness, AI, costs)  ~1.5 s
npx vitest run --config spikes/nest/vitest.config.ts --silent=false
npx tsc --noEmit -p spikes/nest/tsconfig.json          # also clean under the root tsconfig (npm run typecheck)

# all required screenshots (deterministic, ?test=1 renders only on API calls)  ~25 s
node tools/harness/play.mjs --root spikes/nest --query "test=1" --script spikes/nest/scripts/shots.mjs \
     --out docs/research/spike-nest-img --width 1280 --height 720 --script-timeout 500000
node tools/harness/play.mjs --root spikes/nest --query "test=1" --script spikes/nest/scripts/bench.mjs   # costs
node tools/harness/play.mjs --root spikes/nest --script spikes/nest/scripts/input.mjs  # real rAF loop + real key/mouse events
node tools/harness/play.mjs --root spikes/nest --query "test=1" --script spikes/nest/scripts/digtest.mjs  # ramp dig
node tools/harness/play.mjs --root spikes/nest --query "test=1&hud=0" --script spikes/nest/scripts/specks.mjs # rim artefact probe
# interactive: npx vite spikes/nest  (WASD, drag = orbit, wheel = zoom, E dig, Space let go, C cutaway, X x-ray,
#              [ ] move cut plane, click in cutaway = dig marker, 1/2/3/0 = navTo C1/C2/C3/surface)
```

## 2. Files (pure logic is three-free and Node-runnable)

| File | Contents | three? |
|---|---|---|
| `sim/vec3.ts` | allocation-free vec3 ops, `rotateMinimal` (parallel transport), `rotateAxis` | no |
| `sim/rng.ts` | mulberry32, value noise / fbm | no |
| `sim/world.ts` | heightfield terrain (4 BU cells, bilinear), primitive SDFs (rounded box, ellipsoid, capsule, cylinder), 3D primitive spatial hash, `smin`/`smax` | no |
| `sim/carve.ts` | `CarveGrid`: sparse `chunkKey -> Uint8Array(4096)`, trilinear sampling, brushes, dirty set, breach spheres | no |
| `sim/field.ts` | `Field`: `f = smin(smax(fSoil, fCavity, k), fHard, k)`, gradient, normal, sphere trace | no |
| `sim/mc.ts` | marching cubes: generated 256-case table, per-chunk mesher with overlap, gradient normals, soil-distance attribute | no |
| `sim/walker.ts` | `SurfaceWalker` (step, project, transport, steer, let go, surfaceChanged, visual smoothing) | no |
| `sim/nav.ts` | `NavField`: Dial bucket BFS over open voxels, incremental after carve, lookahead steering | no |
| `sim/ai.ts` | `AIColony`: 0.1 s tick, shuttle deepest chamber <-> surface, prev/curr for interpolation | no |
| `sim/camera-rig.ts` | third-person rig maths (frame transport, collision, tunnel adaptation, near plane, fade) | no |
| `sim/scene.ts` | test world + code-generated nest | no |
| `sim/sim.test.ts` | 13 vitest tests | no |
| `render/materials.ts` | breach discard, cavity material (soil-skin discard, depth darkening, lantern, noise), cap material | yes |
| `render/meshes.ts` | terrain/primitive/ant geometry, `ChunkMeshes`, cutaway slice texture | yes |
| `main.ts`, `index.html` | app, input, camera modes, `window.__spike` API | yes |

## 3. What works (evidence)

* **Field (A)**. `f = smin(smax(fSoil, fCavity, k), fHard, k)` with k = 1.5 mm. Primitive hash (32 mm cells, a
  16 mm margin makes "empty cell" a valid distance bound). 94 ns per evaluation in Chrome.
  *Decision (deviation from the seed formula, recorded)*: primitives are split into **soil** (diggable, joins
  `fSoil`) and **hard** (stone, slab, stem, table, wall). The carve grid can only open soil, so a tunnel can run under
  the paving slab and the slab's underside becomes the tunnel ceiling (screenshot 12). The seed formula
  `max(fSubstrate, fCavity)` is the k -> 0 limit when everything is diggable.
* **Carve grid (B)**. Openness written as a LINEAR ramp `clamp(0.5 - sdf/ramp, 0, 1)` with ramp = 4 mm, so
  `fCavity = (open - 0.5) * ramp` is an exact signed distance within +-2 mm of a carved wall and a valid
  Lipschitz-1 bound beyond (it saturates). `carveSphere`, `fillSphere`, `carveEllipsoid`, `carveTunnel`, generic
  `applyBrush(aabb, sdf, mode)`; dirty chunks include the -1 neighbours that read changed samples through the
  overlap. Breach = a carve sphere with `-r < fSoil(centre) < r`, de-duplicated (a sphere whose centre is within
  0.4 r of an existing breach of >= radius is skipped; that only shrinks the discarded region, so it is safe).
* **Marching cubes (C)**. The case table is **generated**, not transcribed: per face, segments separate the open
  corners (ambiguous faces always separate the two open corners, a rule that depends only on the face, so neighbours
  agree), segments are oriented `d = o x n_face`, chained into loops and fan-triangulated (max 5 triangles per case).
  Test: a blob spanning 8 chunks has **0 non-manifold / mis-oriented edges** after merging vertices by exact
  position (seams are bit-identical because vertices are always interpolated low->high sample). Normals = central
  differences of the samples (needs samples -1..17), interpolated along the edge. Triangles face the cavity (normal
  agrees with geometric winding: test). Terrain and (diggable) primitive materials discard fragments inside breach
  spheres shrunk by 0.5 mm; cavity fragments are discarded above the soil (see 5.6). No see-through anywhere in the
  screenshots (01, 02, 02b, 11c, 12c).
* **Test nest (D)**: slanted shaft (~45 deg), 8 mm (2 BU) tunnel down to y = -124 mm, three 40 x 12 x 40 mm chambers
  at -36/-80/-118, a blind side branch, a tunnel surfacing under the west edge of the slab (09, 09b, 12, 12c).
  43 openness chunks, 40 meshed chunks, 12 252 triangles, 13 breach spheres.
* **SurfaceWalker (E)**. Tests (Node): flat ground stays at f = 0.600 +- 0.005; floor-to-wall keeps the heading
  exactly (`fwd = (0, 1.00, 0.005)` on the wall, sideways drift < 0.5 mm), normal change is monotone (<= 1 reversal),
  max 34 deg per frame; climbs the stem to +124 mm; climbs the table leg, through the concave leg/underside corner,
  walks the underside upside down, then wraps twice over the 6 mm thick table-top edges **without ever crossing the
  sheet** (min f 0.5999); walks into the entrance and down the shaft; "let go" from the table underside lands on the
  ground (f = 0.6 +- 0.1, up = +Y). In the browser every one of the 24 shots has f within 0.003 of the foot offset.
* **Player control (F)**. WASD camera-relative (desired direction = camera reference heading x/y in the tangent plane,
  ant turns at 7 rad/s and walks), drag-to-orbit with pointer events + pointer capture (no pointer lock), wheel zoom,
  E dig (every 0.25 s while held), Space let go. `input.mjs` drives the real rAF loop with real Playwright key and
  mouse events: the ant moved, the drag orbited the camera 31 mm, the wheel zoomed 26 -> 39 mm, holding E dug 3 times.
* **Camera (G)**. Orbit in the smoothed local frame with its own parallel-transported reference heading; sphere-trace
  collision; tunnel adaptation (26 -> 6.5 mm, FOV 50 -> 80 deg) from a 7-ray "roominess" probe; near plane from
  clearance; ant fade. Works in every shot: 03/10/11 (tunnel, 6.5-7.5 mm, near 0.16-0.9), 04/05 (chamber, partial
  tunnel factor 0.56-0.69), 12 (pulled in to 2.1 mm in the slab-exit pinch, ant alpha 0.8), 13 (1.5 mm, ant alpha
  0.48). Cutaway observer mode: renderer clipping plane + soil cap (slice texture) + optional x-ray (09, 09b), see 6.
* **Nav (H)**. Two distance fields (surface, deepest chamber) over 5 752 open voxels; every chamber reachable;
  incremental update after 20 digs gives **0 mismatches** vs a full rebuild. 50 AI walkers shuttle: 519 completed
  legs in 60 s simulated, 0 falls, min f 0.596 (never inside solid). Screenshots 09, 10, 10b, 09b.
* **Test API (I)**: `window.__spike` = `teleport(x,y,z,{heading,dir})`, `setInput({forward,turn,strafe,desired})`,
  `step(seconds,{render})` (fixed 1/60 s steps, AI on 0.1 s ticks, synchronous), `dig(radius?, 'ramp'|'body')`,
  `letGo()`, `walkerState()`, `navTo('surface'|'C1'|'C2'|'C3')` (BFS autopilot), `spawnAI(n)`, `aiState()`,
  `setCamera('third'|'cutaway'|'free', opts)`, `orbit`, `zoom`, `placeMarker(ndcX, ndcY)`, `setDigSlope`,
  `setVisible(layer)`, `stats()`, `bench()`, `render()`, `dispose()`; `window.__ready`.

## 4. Parameter values that worked

| Group | Parameter | Value |
|---|---|---|
| Grid | voxel / chunk / ramp | 2 mm (0.5 BU) / 16^3 = 32 mm / 4 mm (2 voxels) |
| Field | smooth min/max width k | 1.5 mm (max deviation k/4 = 0.375 mm) |
| Field | gradient step h | 0.05 mm central differences |
| Field | primitive hash | 32 mm cells, 16 mm margin |
| Walker | foot offset (body-centre height = level set) | **0.6 mm** (body radius ~0.5) |
| Walker | max substep | **1.0 mm** (half a voxel) |
| Walker | projection | Newton, <= 6 iterations, tol 0.004 mm, step clamp 1.5 s + 0.2 mm |
| Walker | substep acceptance | chord <= 2.5 s + 0.1; f(chord midpoint) > 0.2 foot; normal turn < 110 deg (cos > -0.35); else halve s (3x) |
| Walker | surface re-check | re-project when abs(f - foot) > 0.02 mm (and after every carve) |
| Walker | visual smoothing | up tau 0.07 s, forward tau 0.05 s (exponential), forward transported with the visual up |
| Walker | speed / turn | 48 mm/s (12 BU/s); player 7 rad/s steering toward input, scripts 3.5 rad/s tank turn |
| Fall | gravity / drag | 9810 mm/s^2, linear drag 14 /s (terminal ~700 mm/s), swept by sphere trace (radius 0.98 foot) |
| Camera | distance surface / tunnel / min | **26 / 6.5 / 0.9 mm** (x zoom 0.15-4) |
| Camera | FOV surface / tunnel | **50 / 80 deg** vertical; also widens up to 60 % of the way when pulled in hard |
| Camera | pitch surface / tunnel | 0.42 / 0.22 rad above the tangent plane (+ user offset) |
| Camera | collision radius / focus height | **0.3 mm** / 1.1 mm above the ant (limited by head room) |
| Camera | pull-in / ease-out | instant / tau 0.35 s; tunnel blend tau 0.35 s |
| Camera | roominess probe | 7 sphere traces (up, +-right, +-forward, 2 diagonals), 39 mm max; >= 26 mm = surface, <= 9 mm = tunnel |
| Camera | near / far | **near = clamp(0.45 x clearance, 0.03, 1.0) and <= 0.4 x distance**; far 4000 (seen: 0.14-1.0 mm) |
| Camera | ant fade | alpha 1 at >= 3.2 mm, 0.12 at <= 1.3 mm (smoothstep), depthWrite off when < 1 |
| Render | breach margin / max breaches | 0.5 mm / 64 uniform vec4 |
| Render | cavity skin (discard band below soil) | 0.2 mm (must stay < breach margin) |
| Dig | player brush | ramp capsule r = 4 mm (2 BU tunnel), length 3.5 mm, 30 deg below horizontal (world), floor through the feet |
| AI | tick / arrive / lookahead | 0.1 s / 9 cost units (~3 voxels) / 4 descent steps; steer 4 rad/s + 0.15 rad seeded wander |

## 5. Failure modes found, and mitigations

1. **Jitter / normal flip at concave corners** (floor-to-wall, leg-to-underside): with a sharp `min`, the level set
   has a crease and the numeric gradient flips between the two faces. *Mitigation*: polynomial smooth min/max with
   k = 1.5 mm in f (also for the cavity/soil `smax`, so rims are rounded). Result: monotone normal, <= 34 deg per
   frame, heading preserved. Cost: the ant floats <= 0.375 mm higher in corners (invisible).
2. **Saturated cavity field**: `fCavity` saturates at +-2 mm, so the gradient is zero more than 2 mm from any wall
   (chamber interiors). The walker never goes there, the camera only needs a bound, but **teleport/spawn** must
   sphere-trace along a hint direction first (`place()` does). A wider ramp would make chamber interiors exact at the
   cost of blurrier MC surfaces; 2 voxels is the sweet spot.
3. **Tunnelling through thin sheets**: guarded by substeps <= 1 mm (< 2 x foot offset), the chord-midpoint free-space
   test and the 110-degree normal-turn limit. The 6 mm table top was wrapped around at its edges twice, never
   crossed. Not yet tested: sheets thinner than ~1 mm (leaves, paper) - those need foot offset < half thickness or a
   one-sided "sheet" primitive.
4. **Helix drift**: walking "straight" on a cylinder (stem, round tunnel) is a geodesic helix; parallel transport is
   correct, so a tiny initial tilt makes ants spiral onto tunnel walls. Players steer (WASD is camera-relative) and AI
   steers to the nav lookahead; scripts use `setInput({desired})`. Production should give AI/possessed ants an
   optional "prefer floor" bias (steer the heading slightly toward -gravity's tangent projection) when walking
   tunnels, which is also what real ants mostly do.
5. **Digging (player)** - the most important design finding. (a) A sphere placed "ahead and below" a body-relative
   offset can **engulf the ant** (ground vanishes, the projection lands anywhere); (b) once the ant walks into a fresh
   pit it tips over the rim onto the near wall, the body frame rotates 90 deg and a body-relative dig curls back on
   itself; camera-relative aiming has the same compounding because the camera lives in the ant frame. *Mitigation*:
   the **ramp brush**: a capsule whose floor starts at the ant's feet and runs along the horizontal heading at a
   world-relative slope (default 30 deg, adjustable). Each dig extends the ramp the ant is standing on, the walker
   stays on its level set (f 0.600 +- 0.0005 over 26 digs), and the tunnel is straight (29 deg measured; 11, 11b).
   Plus `surfaceChanged()` re-projection after every carve for the player and nearby AI.
6. **Rendering artefacts at entrances**: (a) cavity-wall "fins" poking out of the slab into open air because the
   discard attribute was `min(soil, hard)` and linear interpolation across a triangle straddling the slab face
   extended the "underground" region; fixed by using **soil distance only** (walls inside hard primitives are hidden
   by the primitive anyway). (b) one-pixel specks near rims: where a carve sphere barely dips into the soil the MC
   "dish" lies within ~0.1 mm of the ground and chordal error lifts bits of it above the flat terrain triangles;
   fixed by discarding the cavity within a **0.2 mm skin below the soil** (< the 0.5 mm breach margin, so the
   terrain lip still hides the cut). Verified with `specks.mjs` (layer toggles + crops).
7. **Breach-sphere uniform budget**: 13 for the test nest, 23 after one dug tunnel, cap 64. Fine for a spike, not for
   a colony that opens many entrances. Production: a **2D hole-mask texture** over the terrain (R8 at 1 mm, rasterise
   `fCavity(x, H(x,z), z) > 0` locally on carve) - exact and unlimited; keep breach spheres only as the record.
8. **Coarse silhouettes**: an 8 mm tunnel is only 4 voxels across, so tunnel mouths have visibly polygonal outlines
   (04, 12) even though shading normals are smooth. Options: 0.25 BU voxels inside the nest (8x memory, still small:
   see costs), or vertex relaxation toward the true iso along the gradient after MC.
9. **Upside-down camera**: the frame-locked camera turns the world upside down on ceilings/undersides (05, 07). It is
   correct and readable, but needs a comfort option: blend the camera up-vector toward world up when |upVis.y| < 0.3
   (keep orbit and collision in the local frame).
10. **Camera in pinches**: at the slab exit the camera is squeezed to 2.1 mm (12); the fade (alpha 0.8) and the FOV
    widening keep it usable. A tighter spot would need a fallback "over-the-ant" view (straight above the ant along
    upVis) when the allowed distance < 1.5 mm for > 0.5 s.
11. **Underground light** without shadows: the sun lights tunnel walls as if there were no soil. *Mitigation*:
    depth-below-soil ambient darkening on the cavity material (0.85 -> 0.10 over 14 mm) plus a warm "lantern" term
    around the possessed ant (radius 12 mm). Undersides above ground needed a weak bounce light from below.
12. **AI**: ants pile up at the turn-around points (entrance, chamber) because there is no inter-ant avoidance; in a
    round tunnel they use floor, walls and ceiling alike (looks natural, 10). The surface field's seeds include the
    slab-side exit, so `navTo('surface')` from C1 may finish on the slab's side face (12b) - expected.
13. **Software-GL timings** are not GPU timings; Chromium's `performance.now()` is coarsened to 100 us, so only
    averages over many calls are meaningful (all cost numbers below are averages).

## 6. Cutaway observer mode - usable for dig markers?

Implemented as a global renderer clipping plane (z = const, keeps the far half) on terrain, primitives, cavity and
ants, plus a **soil cap**: a quad on the plane textured with a 1 mm slice of f (RGBA8: soil colour by depth, stone
grey, alpha = solidness, linear filtered, threshold 0.5) so tunnels and chambers appear as holes in a cut soil face
(09b); the cavity is rendered double-sided in this mode so the far half of each cut tunnel is visible through its
hole, with back faces tinted as a light "nest cast". **X-ray** makes the cap 30 % opaque (no depth write) and draws AI
ants on top at 2.5x scale: the whole nest reads as a 3D cast with traffic (09).

Verdict: **usable, with two complementary picking modes.** (1) Opaque slice: clicking the cap gives an exact 3D
point *in solid soil* on the plane (test: `on: "cap"`, f = +0.28 at the edge of a tunnel) - right for "dig a new
chamber here"; depth is chosen by moving the plane ([ ]), which is precise but needs two steps. (2) X-ray: clicking
the cast picks a point on an existing tunnel/chamber wall (09b marker: `on: "cavity"`, f = -0.06) - right for "extend
this tunnel" / "widen this chamber". What is missing for production: snapping markers to the nearest wall + showing
the marker's projection on the plane, a plane that follows the camera yaw (the spike's plane is axis-aligned, so
the view is mirrored when looking from the -z side), and drawing the possessed ant through the soil.
Slice rebuild cost: 700 x 300 texels at 1 mm (210 000 field evaluations) - measured **54-71 ms per plane move
including the material switch and one SwiftShader frame**; acceptable for an observer tool, and trivially movable to
a worker or 2 mm texels.

## 7. Measured costs

Chrome (headless shell, V8 JIT, `bench.mjs`) unless marked Node (vitest, includes test overhead). Machine: 4 cores,
SwiftShader.

| What | Result |
|---|---|
| Field evaluation `f(p)` | **94 ns** |
| Walker update, 1 substep (0.8 mm/frame) | **2.6 us** on ground, **1.8 us** in a tunnel (10.7 field evals/update); Node 6.5-11 us |
| AI walker tick (0.1 s at 48 mm/s = 5 substeps + lookahead) | **19-24 us per ant** -> 50 ants ~1.1 ms per 0.1 s tick |
| Camera rig update (7 probes + collision trace) | **12 us** |
| `carveSphere` r = 4 mm (2 BU) | **11 us** (~250 voxels written) |
| `carveSphere` r = 12 mm | 93 us |
| Player dig (ramp, 5 spheres) | carve **0.08 ms** + remesh **0.35 ms** (1.75 chunks) + nav update, 2 fields **0.19 ms** = ~0.6 ms |
| Meshing per chunk | initial 47 chunks: avg **0.45 ms**, median 0.2, p95 1.6, max 4.2 (first-call JIT); warm full remesh of 48 chunks: 9 ms = **0.19 ms/chunk** |
| Triangles | 12 252 for the test nest (40 chunks), avg ~300 per surface chunk |
| BFS full rebuild (Chrome) | 6 179 open voxels: 5.6-9.9 ms |
| BFS full rebuild vs open voxels (Node) | 7 377 -> 8.8 ms; 11 968 -> 16 ms; 30 400 -> 38 ms; 73 651 -> 96 ms (**~1.2-1.3 us per open voxel, linear**) |
| BFS incremental after a dig | 0.1-0.2 ms (Chrome); exact (0 mismatches vs rebuild) |
| World build (terrain + nest carve) | 20-28 ms |
| Memory per chunk | openness **4 096 B**; mesh (GPU, position+normal+aSub+index) **~6.2-6.7 KB** per surface chunk; nav **12 KB per field** (8 KB Uint16 distances + 4 KB passability) |
| Whole test nest | openness 176 KB (43 chunks), meshes 267 KB, nav 1.06 MB (2 fields) |
| Render (SwiftShader 1280x720, no post/shadows/MSAA, 76k tris, 44 draws) | tunnel 3p 182 ms, surface 3p 245 ms, cutaway x-ray 360 ms per frame (software GL only; not a GPU estimate) |

Scaling notes: allocated chunks are sparse - only ~3 % of the samples in an allocated chunk are open here (5 752 of
43 x 4 096) - so memory is dominated by per-chunk overhead, not by open volume. BFS is linear at ~1.25 us per open
voxel, so a nest 10x the test nest (~60 000 open voxels) rebuilds in ~75 ms: only ever do incremental updates at
runtime (exact for carves) and run full rebuilds (after fills / collapses) in a worker. Per-field memory should drop by
sharing one passability mask and storing distances only for allocated, non-empty chunks.

## 8. Recommended production API (TypeScript signatures)

```ts
// ---- src/sim/world/field.ts (pure) --------------------------------------------------------------------------
export interface FieldParams { blendK: number; gradH: number }          // 1.5 mm, 0.05 mm
export interface SolidField {
  /** signed pseudo-distance (mm), > 0 free. smin(smax(fSoil, fCavity, k), fHard, k) */
  f(x: number, y: number, z: number): number;
  /** unnormalised gradient into out, returns |grad| */
  grad(x: number, y: number, z: number, out: Vec3): number;
  normal(x: number, y: number, z: number, out: Vec3): number;
  fSoil(x: number, y: number, z: number): number;    // terrain + diggable primitives
  fHard(x: number, y: number, z: number): number;    // non-diggable primitives (hash-accelerated)
  sphereTrace(o: Vec3, dir: Vec3, maxT: number, radius: number, safety?: number): number;
}
export function createField(world: WorldGeometry, carve: CarveGrid, p: FieldParams): SolidField;

// ---- src/sim/nest/carve.ts (pure; state is plain data, the Map is a cache) ----------------------------------
export interface CarveState { voxel: number; ramp: number; chunkKeys: number[]; chunkData: Uint8Array[]; breaches: Breach[] }
export interface Breach { x: number; y: number; z: number; r: number }
export interface ChangeBox { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number; changed: number }
export class CarveGrid {
  static fromState(s: CarveState): CarveGrid;
  toState(): CarveState;
  openness(x: number, y: number, z: number): number;           // trilinear 0..1
  fCavity(x: number, y: number, z: number): number;            // (open - 0.5) * ramp
  applyBrush(aabbMin: Vec3, aabbMax: Vec3, sdf: (x: number, y: number, z: number) => number, mode: 'carve' | 'fill'): ChangeBox;
  carveSphere(c: Vec3, r: number): ChangeBox;
  carveCapsule(a: Vec3, b: Vec3, r: number): ChangeBox;        // chain of spheres; records breaches
  fillSphere(c: Vec3, r: number): ChangeBox;
  /** chunk keys whose mesh must be rebuilt (includes -1 neighbours); clears the set */
  drainDirty(): number[];
  /** raises on every edit; render/nav compare to detect changes */
  readonly version: number;
}
export function digRamp(grid: CarveGrid, feet: Vec3, up: Vec3, headingXZ: Vec3, p: { radius: number; length: number; slope: number }): ChangeBox;

// ---- src/sim/nest/mc.ts (pure; runs in a worker) ------------------------------------------------------------
export interface ChunkMesh { key: number; positions: Float32Array; normals: Float32Array; soil: Float32Array; indices: Uint16Array }
export function meshChunk(grid: CarveGrid, cx: number, cy: number, cz: number, fSoil: (x: number, y: number, z: number) => number): ChunkMesh | null;

// ---- src/sim/locomotion/walker.ts (pure; SoA in production) -------------------------------------------------
export interface WalkerParams { footOffset: number; maxSubstep: number; projIters: number; projTol: number; maxTurnCos: number;
  gravity: number; drag: number; speed: number; turnRate: number }
/** plain-data walker state; the colony stores these as Float32Array columns (pos, up, fwd, vel) + flags */
export interface WalkerState { pos: Vec3; up: Vec3; fwd: Vec3; vel: Vec3; falling: boolean; blocked: boolean }
export interface WalkerInput { forward: number; turn: number; desired?: Vec3 | null }
export function walkerPlace(s: WalkerState, F: SolidField, p: Vec3, heading: number, hintDir: Vec3, P: WalkerParams): boolean;
export function walkerMove(s: WalkerState, F: SolidField, distance: number, P: WalkerParams): number;   // returns covered
export function walkerSteer(s: WalkerState, desired: Vec3, maxAngle: number): number;
export function walkerTurn(s: WalkerState, angle: number): void;
export function walkerUpdate(s: WalkerState, F: SolidField, dt: number, input: WalkerInput, P: WalkerParams): void;
export function walkerLetGo(s: WalkerState, push?: number): void;
export function walkerSurfaceChanged(s: WalkerState, F: SolidField, P: WalkerParams): void;           // after carve/fill nearby
// render side: visual frame smoothing, interpolation between 0.1 s ticks
export interface VisualFrame { up: Vec3; fwd: Vec3 }
export function smoothVisualFrame(v: VisualFrame, s: WalkerState, dt: number, upTau: number, fwdTau: number): void;

// ---- src/sim/nest/nav.ts (pure) -----------------------------------------------------------------------------
export type NavSeed = (x: number, y: number, z: number) => boolean;
export class NavField {
  constructor(grid: CarveGrid, field: SolidField, seed: NavSeed);
  rebuild(): { open: number; settled: number };       // full Dial BFS (worker after fills)
  update(box: ChangeBox): { open: number; settled: number }; // exact, decrease-only, after carves
  get(i: number, j: number, k: number): number;        // 65535 = unreachable; costs 3/4/5 per face/edge/corner step
  nearest(p: Vec3): [number, number, number, number] | null;
  lookahead(p: Vec3, steps: number, out: Vec3): number; // steering target; returns distance at p or -1
}

// ---- src/render/camera/rig.ts (pure maths; render applies it) ------------------------------------------------
export interface CamParams { distSurface: number; distTunnel: number; minDist: number; fovSurface: number; fovTunnel: number;
  pitchSurface: number; pitchTunnel: number; radius: number; focusHeight: number; easeOutTau: number; tunnelTau: number;
  followRate: number; followDelay: number; roomOpen: number; roomTight: number; nearMin: number; nearMax: number; far: number;
  fadeStart: number; fadeEnd: number; worldUpBias?: number /* comfort option, 9. */ }
export interface CamOutput { pos: Vec3; target: Vec3; up: Vec3; fov: number; near: number; far: number; antOpacity: number;
  dist: number; desired: number; tunnel: number }
export class CameraRig {
  constructor(p: CamParams);
  orbit(dYaw: number, dPitch: number): void;
  zoomBy(f: number): void;
  reset(up: Vec3, fwd: Vec3): void;
  /** camera-relative move direction for WASD: ref*forward + (ref x up)*strafe */
  moveDirection(forward: number, strafe: number, out: Vec3): Vec3;
  update(dt: number, F: SolidField, antPos: Vec3, upVis: Vec3, fwdVis: Vec3, moving: boolean): CamOutput;
}
```

Debug API for `window.__game` (design seed section 4): keep the spike's verbs - `teleport`, `setInput` (incl.
`desired`), deterministic `step(seconds)`, `dig`, `letGo`, `walkerState`, `navTo`, `spawnAI`, `setCamera`,
`placeMarker`, `stats`, `bench` - they made every screenshot reproducible.

## 9. What I would do differently in production

* **SoA walkers + time slicing**: 2 500 ants x ~20 us = 50 ms per 0.1 s tick on one core if all are active.
  Store walker state in Float32Arrays, step only ants in the player's vicinity every tick and far/underground ants
  at a coarser rate (or along pre-computed nav polylines), and move the pure sim to a worker.
* **Analytic gradients** (terrain bilinear derivative, primitive SDF gradients, trilinear derivative of the carve
  grid, chain rule through smin/smax) instead of 6 extra evaluations: roughly 3x cheaper walker steps.
* **Hole mask texture** for terrain discards instead of breach-sphere uniforms (5.7).
* **Meshing in a worker** with transferable buffers; the mesher is already pure and per chunk (~0.2-0.5 ms).
* **Finer nest voxels** (0.25 BU) or MC vertex relaxation for rounder tunnel silhouettes (5.8); budget allows it.
* **Shared passability + sparse distance storage** for nav fields; distances relative to several seeds (entrances,
  each chamber, dig fronts) are cheap individually but add up at 12 KB/chunk each.
* **Dig UX**: ramp brush with a slope the player sets (e.g. scroll while holding E, or three presets: level / 30 deg /
  shaft), plus a ghost preview of the next capsule; chambers via a separate "widen" brush (flattened ellipsoid).
* **Comfort camera**: world-up bias on ceilings, over-the-ant fallback in pinches, optional auto-follow off.
* **Inter-ant avoidance** and floor preference for AI in tunnels.
* Keep the generated MC table (no transcription risk) but switch ambiguous faces to the asymptotic decider if the
  trilinear field topology must match the mesh exactly (currently a sub-voxel difference at saddles only).

## 10. Screenshots (`docs/research/spike-nest-img/`, 1280x720)

| File | Shows |
|---|---|
| `01-surface-entrance-3p.png` | surface, entrance hole ahead, third person |
| `02-hole-looking-down-3p.png` | ant at the rim, camera orbited high, looking into the shaft |
| `02b-hole-looking-down-free.png` | looking straight down into the hole (shaft walls, no see-through) |
| `03-tunnel-3p.png` | third person inside the descending tunnel (camera 7.4 mm, FOV 78) |
| `04-chamber-3p.png` | inside chamber C1 |
| `05-chamber-ceiling-3p.png` | ant on the chamber ceiling (frame-locked camera, world upside down) |
| `05b-chamber-ceiling-observer.png` | the same ant hanging from the ceiling, seen from the chamber floor |
| `06-stem-climb-3p.png`, `06b-stem-climb-side.png` | climbing the plant stem |
| `07-table-underside-3p.png`, `07b-table-underside-side.png` | upside down on the underside of the table top |
| `08-floor-to-wall-3p.png`, `08b-floor-to-wall-side.png` | mid floor-to-wall transition (visual up 45 deg) |
| `09-cutaway-xray-whole-nest.png` | cutaway x-ray of the whole nest with 50 AI ants |
| `09b-cutaway-slice-marker.png` | opaque soil slice through C2 and tunnels, AI ants inside, dig marker |
| `10-ai-tunnel-3p.png` | AI ants flowing through the C1-C2 tunnel on floor, walls and ceiling |
| `10b-ai-chamber-observer.png` | AI ants streaming through chamber C1 |
| `11-dig-new-tunnel-looking-back-3p.png` | after digging a new 30 deg tunnel: looking back up at daylight |
| `11b-dig-new-tunnel-cut.png` | the dug tunnel in cross-section (straight ramp) |
| `11c-dig-new-entrance-outside.png` | the new entrance from outside |
| `12-slab-exit-tunnel-3p.png` | at the exit beneath the slab edge (slab face forms the tunnel wall, camera squeezed to 2.1 mm) |
| `12b-slab-exit-emerged-3p.png`, `12c-slab-exit-outside.png` | the ant emerging on the slab's side face beside the hole |
| `13-camera-close-fade.png` | camera 1.5 mm from the ant: ant faded to alpha 0.48 |
