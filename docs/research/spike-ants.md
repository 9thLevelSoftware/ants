# Spike: procedural, instanced, vertex-animated ants (verified by running)

Code: `spikes/ants/` (TypeScript + three r187, no new npm dependencies). Run it with the harness:

```
node tools/harness/play.mjs --root spikes/ants --query "scene=hero"                       # one screenshot
node tools/harness/play.mjs --root spikes/ants --script spikes/ants/shots.mjs \
     --out docs/research/spike-ants-img --width 1280 --height 720                         # every screenshot below
node tools/harness/play.mjs --root spikes/ants --query "post=0&msaa=0&shadows=1&scene=crowd&n=0" \
     --script spikes/ants/bench.mjs --script-timeout 1400000                              # frame time vs count
```

Verdict: **yes.** One merged geometry per variant and LOD, one material per variant and LOD, all animation in the vertex
shader from 112 bytes of per-instance data. 2000 animated ants with carried items cost 8-12 draw calls and ~1 ms of
CPU per frame for LOD bucketing; the anatomy holds up in a 3 mm-wide close-up (toothed mandibles, faceted compound eyes,
elbowed 12-segment antennae, coxa/femur/tibia/5 tarsomeres + claws, petiole scale, banded gaster with setae).
Feet are planted exactly while walking straight (measured drift 2e-14 mm over 25 stances).

__BENCH_SUMMARY__

## 1. Files

| File | What |
|---|---|
| `params.ts` | `AntParams` (the parameter object) + presets `worker`, `queen`, `gyne`, `male`, `major`, `media`, `minim` |
| `mesh-builder.ts` | tiny indexed mesh builder: superellipse lofts, tubes, ellipsoids, slabs, setae, mirroring, per-piece smooth normals |
| `ant-geometry.ts` | `buildAnt(params) -> AntVariant` (4 LOD geometries + wing geometry + rig constants), `PART` ids, `bakePupa()` |
| `ant-shader.ts` | GLSL injected with `onBeforeCompile`: `makeAntMaterial` (physical LOD0 / standard), `makeAntDepthMaterial` (shadows), `makeWingMaterial` |
| `items.ts` | brood + items (`eggs larva cocoon pupa crumb pellet seed leaf droplet`) and `carriedGeometry(item, variant)` |
| `crowd.ts` | `AntRenderer` (instanced batches per variant x LOD, CPU frustum cull + LOD bucketing, wings, carried items) + throw-away walker sim |
| `main.ts` | scene, lighting, soil shader, post chain, scenes `hero lineup scale items poses lod crowd`, `window.__spike` API |
| `shots.mjs`, `bench.mjs` | harness scripts that produced the screenshots and the numbers in this document |

## 2. Geometry recipe

Body frame (binding for shader and CPU): mm, **+Y up, +Z forward (head), +X = the ant's left**, origin on the ground
under the mid coxae. Instance matrices map it to the world (same convention as `Object3D.lookAt`: +Z looks at the target).
Everything is built at nominal size, then uniformly scaled so mandible tip to gaster tip equals `bodyLength` exactly.

1. **Mesosoma**: loft of superellipse sections (exponent 2.5) along Z. A side profile table (top, bottom, half width vs
   position) per `profile`: `worker` (pronotum dome, mesonotum, **metanotal groove**, rounded propodeum with declivity),
   `alate` and `male` (large scutum dome + scutellum for the flight muscles). Catmull-Rom interpolated, 20 rings at LOD0.
   Neck collar ellipsoid; optional propodeal / pronotal spines (tapered tubes); dealate queens get dark **wing stubs**.
2. **Legs**: three pairs attached ventrally at 17 / 50 / 76 % of the mesosoma (front coxae far forward under the pronotum).
   Standard worker lengths as fraction of body length (coxa, femur, tibia, tarsus): front .085/.19/.155/.19,
   mid .06/.205/.18/.205, hind .065/.245/.235/.265, times `legs.length`. Each segment is generated **in its own
   segment-local frame** (x along the segment from the proximal joint): coxa (fat cone), femur with trochanter knob and
   flattened section, tibia widening distally with an **apical spur** (front leg: the antenna-cleaning calcar), tarsus as
   **5 tarsomeres** (40/16/13/11/20 %) with constrictions and **two claws**, erect setae on the tibiae. Left legs are built
   once; right legs are the same vertices mirrored in local z (winding flipped), legs 3-5.
   Rest foot positions: direction from the attachment 43 deg forward / 4 deg / 43 deg back, reach =
   coxa·sin(coxa angle) + tarsus·cos(tarsus angle) + 0.74·(femur + tibia), so knees sit near the dorsum (not spidery).
3. **Petiole**: `shape: 'scale'` (Formicinae): an upright, thin, broad plate (superellipse loft along +Y, 2.4 % of body
   length thick) on a short stalk. `shape: 'node'` (Myrmicinae): peduncle + rounded node, and with `nodes: 2` a wider
   postpetiole node behind it.
4. **Gaster**: loft along an axis pitched 0.1 rad down; `segments` tergite bands with decreasing length; each band's last
   ring is a slightly flared **lip** (1.012 R), followed by two hidden **intersegmental-membrane rings** (0.955 R,
   `aux = 1`) and the next band's first ring, so the plates read as overlapping sclerites. Sparse erect setae on the
   posterior tergite margins, an **acidopore nozzle with a fringe of hairs** (coronula) at the tip. Band index per vertex
   lets the shader spread the plates for a full crop.
5. **Head** (built in a head-local frame, then tilted down by `head.tilt` about the neck): loft with dorsal-view width and
   side-view height profiles (broadest behind the eyes, narrowing to the clypeus), superellipse `squareness`, flattened
   venter, optional **posterior emargination** (`notch`, heart-shaped major heads). **Compound eyes**: ellipsoids set into
   the side wall, glossy, with ommatidial **facets** made in the fragment shader (3D cellular domes + derivative bump
   mapping; facet size = eye length / 17). **Ocelli** (3) for queens/males. **Maxillary palps** (bent tubes). Setae plus a
   clypeal fringe.
6. **Mandibles**: a star-shaped outline (convex outer margin; masticatory margin with `teeth` triangular teeth; basal
   margin) extruded as a slab thinning toward the tip, hinge at the anterolateral corner of the head, tips crossing the
   midline when closed; teeth darkened. Built left, mirrored right.
7. **Antennae (elbowed)**: scape from a socket on the frons (condyle bulb, curved, thickening apically) directed up/out/
   forward; funiculus from the elbow with `segments` beads (pedicel longer, gradually thickening, no club for Lasius;
   12 for males) bending forward-down. Setae on the scape. Rig stores socket, elbow and the elbow hinge axis.
8. **Wings** (`wings: 'full'`): separate geometry because it is blended. Fore- and hindwing per side: an outline strip
   (narrow base, broadest at ~60 %, rounded tip) laid flat over the gaster (raised to clear its dorsal surface; forewing
   above hindwing), double-faced, uv = (span, chord). Venation is drawn in the fragment shader: costa, Sc+R, pterostigma,
   Rs, M, Cu and cross-veins giving the formicine single cubital cell; thin-film iridescence (`MeshPhysicalMaterial.iridescence`).

Every vertex gets a colour (head, mesosoma, gaster, legs, tarsi, antenna, mandible, teeth, eye, hair) so one material serves the
whole body. Per-piece smooth normals are computed by the builder so parts do not smooth into each other.

### LOD contents (same generator, `LODS` table)

| LOD | used when ant is | content |
|---|---|---|
| 0 | >= 48 px tall-ish (projected body length), max 160 ants | everything above, physical material (clearcoat cuticle + pubescence sheen), casts shadows |
| 1 | 22-48 px | 6-7 radial sections, no coxae/hairs/palps/teeth/ocelli, gaster bands without membranes, eyes as 3x4 ellipsoids |
| 2 | 9-22 px | 4-5 radial sections, femur/tibia/tarsus 3-sided capless tubes, no mandibles or petiole stalk |
| 3 | < 9 px | head/mesosoma/gaster bipyramids, 2-sided ribbon femur + tibia, no antennae; still animated by the same shader |

__TRIS_TABLE__

## 3. Shader and attribute design

Injected into three's own `MeshPhysicalMaterial` (LOD0), `MeshStandardMaterial` (LOD1-3, items) and `MeshDepthMaterial`
(shadow pass, assigned as `customDepthMaterial`), so lights, PCF shadows, fog, environment reflections, tone mapping and colour
management are untouched. Injection points: `#include <common>` (declarations + `antDeform()`), `<beginnormal_vertex>`
(runs `antDeform`, sets `objectNormal`), `<begin_vertex>` (`transformed = antP`), `<color_vertex>` (membrane colour + tint),
fragment `<roughnessmap_fragment>` (per-part roughness override, smooth cuticle roughness noise), `<normal_fragment_maps>`
(eye facets), `<lights_physical_fragment>` (sheen gain per part). The depth material only replaces `<begin_vertex>`
(its `beginnormal` is behind `USE_DISPLACEMENTMAP`). `customProgramCacheKey` = `ant-body-p|s`, `ant-depth`, `ant-wing`: all
variants share 4 programs; per-variant numbers are uniforms.

### Per-vertex attributes (geometry)

| Attribute | Type | Meaning |
|---|---|---|
| `position` | vec3 f32 | rest position, body frame (mm). **LEG vertices: segment-local position** (x along the segment from its proximal joint, y/z the cross-section). A manual `boundingSphere` is set. |
| `normal` | vec3 f32 | rest normal (segment-local for LEG vertices) |
| `color` | vec3 f32 | linear base colour |
| `aRig` | vec4 f32 | x **part id**, y **side** (+1 left, -1 right) or **leg index** 0-5 (L1 L2 L3 R1 R2 R3), z **leg segment** (0 coxa, 1 femur, 2 tibia, 3 tarsus) or **gaster band**, w **aux** |
| `uv` | vec2 f32 | wings only (span 0..1, chord 0 trailing .. 1 leading) |

Part ids (`PART`): 0 BODY (mesosoma, neck, spines, stubs, setae), 1 HEAD (aux 0 cuticle / 1 compound eye / 2 ocellus),
2 MANDIBLE, 3 SCAPE, 4 FUNICULUS, 5 LEG, 6 GASTER (aux 1 = intersegmental membrane), 7 WING, 8 ITEM (aux = roughness),
9 PETIOLE. 52 bytes per vertex (could be packed to ~24 with half floats + normalized bytes; not needed yet).

### Per-instance attributes (`InstancedBufferAttribute`, `DynamicDrawUsage`, 112 bytes per instance)

| Attribute | Type | Meaning |
|---|---|---|
| `instanceMatrix` | mat4 | body frame -> world: translation on the walking surface, rotation = surface frame (up = surface normal, +Z = heading), uniform scale (size variation) |
| `aGait` | vec4 | x **gait phase** in cycles (CPU: `phase += distance / (strideMm * scale)`), y **speed** relative to cruise (0 = standing), z **turn rate** (-1..1, + = left), w per-ant **random** 0..1 |
| `aPose` | vec4 | x **head raise** 0..1 (carrying), y **gaster** -1 (curled forward under the body: formicine spray posture) .. +1 (raised alarm display), z **gaster swell** 0..1 (crop fullness), w **mandible gape** 0..1 |
| `aTint` | vec4 | rgb colour multiplier (individual variation, callow workers, debug), a **idle fidget** amount 0..1 |

Uniforms per variant (shared `Uniform` object `uTime` for all): `uLegA[3]` (left coxa attachment xyz, w = tarsus angle),
`uFoot[3]` (left rest foot xyz on y = 0, w = coxa angle), `uLegLen[3]` (coxa, femur, tibia, tarsus), `uGaitP` (stride mm,
lift mm, duty factor, body bob mm), `uNeck`, `uHeadUp`, `uMand`, `uSocket`, `uElbow`, `uElbowAxis`, `uGasterPivot`,
`uGasterC`, `uGasterAxis`, `uGasterP` (radial swell gain, axial gap per band, band count, petiole follow fraction),
`uPetPivot`, `uGrip`, `uGroom`, `uMembrane`, `uFacet`. Right-side joints are mirrored in the shader.

### What `antDeform()` does

* **Body**: bob `bobMm * cos(4 pi phase)` (each tripod), yaw 0.035 rad and roll 0.03 rad sway at the stride frequency,
  idle breathing sway, and a lift of 0.42 stride when the gaster is curled for spraying. Applied to every non-leg part.
* **Legs: analytic IK per vertex, feet in the instance frame.** Alternating tripod: A = L1 R2 L3, B = R1 L2 R3 (+0.5 phase),
  plus a 0.03-cycle metachronal lag per pair. With duty factor `beta` (0.55 worker) and stride `L`: in stance
  (`lp < beta`) the foot target is `rest + (0, 0, L*beta*(0.5 - lp/beta))`, so the foot moves backward in the body frame
  at exactly the body speed (`phase` advances by distance/stride, body moves `L*beta` while the foot moves `-L*beta`):
  **no sliding**. Swing: smoothstep forward over `1 - beta`, lift `sin(pi u) * liftMm * moving`. Then: attachment `A`
  (after body sway), leg plane through A and the foot (normal `n = cross(d, up)`), coxa end `H` at the coxa angle,
  tarsus start `T` rising from the foot at the tarsus angle, two-bone IK `H -> knee -> T` (law of cosines, knee up/out
  via `perp = cross(n, dirD)`), and each segment vertex is placed in the frame (x = segment axis, z = n, y = z x x).
  Segments stay rigid because every segment length is preserved. Idle: one foreleg periodically lifts to the head
  (`uGroom`) and wiggles: antenna grooming.
* **Head** (and everything attached to it): pitch `-0.55 * headRaise` + gait nod + idle look-around, yaw from the turn
  rate. **Mandibles** rotate about the head's up axis by `0.75 * gape` (+ idle chewing). **Antennae**: scape sweeps about
  the head up axis (amplitude higher when idle/walking, random rate per ant) and pitches; funiculus flicks about the elbow
  hinge axis; carrying holds them lower. Side parts are mirrored to the canonical left side, rotated, mirrored back.
* **Gaster**: swell = radial gain `1 + 0.38 s` (membrane rings +12 %), axial lengthening, and plates spread apart by
  `band * gap * s`, so the hidden membranes open up; their vertex colour blends to `uMembrane` (pale) with `s`:
  a replete/full-crop forager. Then rotation about the petiole-gaster pivot, shared 45 % with the petiole.
* **Items** (`PART.ITEM`): attached to the head frame; the instance scale is cancelled about the grip point
  (`length(instanceMatrix[0].xyz)`), so a big worker does not carry a bigger cocoon.

Carried items and wings are separate `InstancedMesh`es whose instance buffers are filled with **the carrier's** instance
data; because they run the same `antDeform()` they follow the head/body exactly, including in the shadow pass.

## 4. Presets (`params.ts`)

__PRESET_TABLE__

Colours are linear-converted sRGB hex: Lasius workers dark brown-black with paler tarsi and reddish-brown mandibles
(BWARS: "greyish brown to dark brownish black"), queens brownish black and glossier, males black with paler legs; the
generic polymorphic preset is dark with a red-brown head (harvester-like). Lasius niger itself is only weakly size-variable
(minim/nanitic 0.85 scale); the major/media/minim presets demonstrate allometric polymorphism (head width grows faster than
body length) for Messor/Atta/Camponotus and also exercise 2-node petioles and spines.

## 5. Brood and items (`items.ts`)

Item-local frame: mm, +Z away from the carrier, origin = the point held between the mandibles. Carry pose per item
(head raise, gape, extra pitch): `carriedGeometry()` bakes the item at the variant's grip point, tagged `PART.ITEM`.

__ITEM_TABLE__

## 6. LOD and shadow strategy

* CPU per frame (`AntRenderer.update`): sphere-frustum test per ant, projected size `px = bodyLength*scale/dist *
  viewportH/(2 tan(fov/2))`, nearest-first sort, buckets LOD0 >= 48 px (capped at 160 ants), LOD1 >= 22 px, LOD2 >= 9 px,
  else LOD3; each bucket's instance buffers are rewritten and uploaded with `addUpdateRange(0, count*itemSize)`.
* **Shadows only from LOD0** (`castShadow` + `customDepthMaterial` only on the LOD0 batch and near carried items). Mid/far
  ants are a few pixels tall; their contact shadow is not missed. The directional light's shadow camera is re-fitted
  around the camera target every frame (half size = 0.55 x camera distance, clamped 6-260 mm, `normalBias` scaled with it),
  so close-ups get crisp leg shadows and crowd views still get shadows near the focus.
* Wings and carried items are drawn for LOD0/LOD1 only.
* Draw calls = per variant: up to 4 LOD batches + wings + one batch per (carried item kind x near/mid). The 2000-ant crowd
  with 9 item kinds: 8-12 calls.

## 7. Costs

__COSTS__

## 8. Problems found and how they were solved (read before porting)

* **CPU culling with a stale camera**: `camera.matrixWorldInverse` is only refreshed inside `render()`; bucketing before
  the render used last frame's frustum and culled the hero ant after every camera move. Call `camera.updateMatrixWorld()`
  before building the frustum.
* **Mirrored legs**: generate right legs as a *mirror* of the left legs in the segment-local z axis (and flip winding);
  the shader frame `(axis, cross(n, axis), n)` is right-handed for both sides, so fore/aft details land on the correct side.
* **Spray posture**: rotating the gaster forward under the body alone drives it into the ground; the body must rise on its
  legs (feet planted, IK absorbs it) by ~0.4 stride for the curl to clear.
* **Wings vs queen gaster**: wings at mesosoma height cut through the tall gaster of queens; each span station is lifted to
  clear the gaster's dorsal surface (forewing above hindwing to avoid z-fighting). They are blended
  (`depthWrite: false`, `renderOrder` after bodies), so they need their own geometry.
* **Pubescence sheen and clearcoat** make a dark ant look like grey plastic if overdone: sheen 0.3 with a dark sheen colour,
  clearcoat 0.3 / roughness 0.38 was the balance; per-part overrides (eyes glossy 0.22, ocelli 0.08).
* **Hairs** must be thin (base radius 0.085 % of body length) and not light-coloured or they read as thorns.
* **Proportions that read wrong at first**: antenna/leg radius (now 0.92 % and 1.55 % of body length), funiculus pointing
  down (looked like a third pair of front legs), a separate clypeus ellipsoid (looked like a nose), mandible hinge under the
  head (looked like fangs). All fixed by looking at colour-coded close-ups (temporarily set `mandible`/`tarsi` colours).
* **Pupa**: baking the folded pupa needs the same segment-local leg frames as the shader; pupal limbs are made 1.7x plumper.
* **Known limitations (not fixed in the spike)**:
  * Feet slide while **turning** (stance targets are fixed in the body frame and rotate with the heading). Fix in
    production: add yaw-since-touchdown compensation (stance foot rotated by `-turnRate * timeSinceTouchdown` about the
    body origin) or, for LOD0 only, per-leg world-space foot anchors written by the CPU.
  * Legs assume the walking surface is the instance's local plane. On curved/uneven surfaces add 6 foot height offsets
    per instance (or sample a heightfield texture in the vertex shader) for LOD0/1.
  * Ant-ant interpenetration in dense crowds (a sim problem, not rendering).
  * Software GL does not compile shaders in parallel: the first frame with all programs takes ~1-2 s.

## 9. Recommended production API (TypeScript)

```ts
// src/render/ants/morphology.ts  (pure data; can live next to species data)
export type PetioleShape = 'scale' | 'node';
export interface AntMorphology {                       // = spike AntParams
  name: string; bodyLength: number;                   // mm, mandible tip to gaster tip
  head: { length: number; width: number; height: number; squareness: number; tilt: number; notch: number };
  mesosoma: { length: number; width: number; height: number; profile: 'worker' | 'alate' | 'male' };
  gaster: { length: number; width: number; height: number; segments: number; fullness: number };
  petiole: { nodes: 1 | 2; shape: PetioleShape; height: number };
  mandible: { length: number; teeth: number; width: number };
  eye: { size: number; position: number }; ocelli: boolean;
  antenna: { scape: number; funiculus: number; segments: number; thickness: number };
  legs: { length: number; thickness: number };
  spines: { propodeal: number; pronotal: number };
  wings: 'none' | 'stubs' | 'full'; wingLength: number; hairs: number;
  colors: Record<'head' | 'mesosoma' | 'gaster' | 'legs' | 'tarsi' | 'antenna' | 'mandible' | 'teeth' | 'eye' | 'membrane' | 'hair' | 'wingMembrane' | 'wingVein', string>;
  roughness: number; sheen: number; clearcoat: number;
  gait: { stride: number; lift: number; duty: number };   // stride/lift as fraction of bodyLength
}

// src/render/ants/geometry.ts
export const PART: { readonly BODY: 0; readonly HEAD: 1; readonly MANDIBLE: 2; readonly SCAPE: 3; readonly FUNICULUS: 4; readonly LEG: 5; readonly GASTER: 6; readonly WING: 7; readonly ITEM: 8; readonly PETIOLE: 9 };
export interface AntRig { /* uniforms, see section 3 */ strideMm: number; grip: Vec3; /* ... */ }
export interface AntVariant { id: number; morphology: AntMorphology; rig: AntRig; lods: BufferGeometry[]; wings: BufferGeometry | null; tris: number[] }
export function buildAntVariant(m: AntMorphology, id: number): AntVariant;        // ~10-20 ms each, cache per species/caste
export function bakeStaticPose(v: AntVariant, pose: 'pupa' | 'corpse' | 'callow'): BufferGeometry;

// src/render/ants/items.ts
export type CarryKind = 'eggs' | 'larva' | 'cocoon' | 'pupa' | 'crumb' | 'pellet' | 'seed' | 'leaf' | 'droplet' | 'prey' | 'corpse';
export interface CarryItemDef { kind: CarryKind; geometry: BufferGeometry; carry: { pitch: number; gape: number; raise: number }; transparent?: boolean }

// src/render/ants/renderer.ts  (render layer; reads sim state, never mutates it)
export interface AntInstanceSoA {                    // filled by the sim->render adapter each frame (interpolated), length >= count
  count: number;
  variant: Uint16Array;
  position: Float32Array;  // xyz, mm, on the walking surface
  frame: Float32Array;     // quaternion xyzw: +Y = surface normal, +Z = heading
  scale: Float32Array;
  gait: Float32Array;      // phase (cycles), speed01, turn (-1..1), seed
  pose: Float32Array;      // headRaise, gaster (-1..1), swell, gape
  tint: Float32Array;      // r, g, b, idle
  carried: Uint8Array;     // 0 = none, else CarryKind index + 1
}
export interface AntLodSettings { nearPx: number; midPx: number; farPx: number; maxNear: number; shadows: boolean; hairs: boolean; physicalLod0: boolean }
export interface AntRenderer {
  readonly object: Object3D;                         // add to the scene once
  addVariant(m: AntMorphology): number;              // returns variant id
  addCarryItem(def: CarryItemDef): void;
  setLod(s: Partial<AntLodSettings>): void;          // quality presets map here (Low: maxNear 40, no physical, no hairs)
  update(instances: AntInstanceSoA, camera: PerspectiveCamera, viewportHeightPx: number, timeSeconds: number): void;
  stats(): { visible: [number, number, number, number]; culled: number; drawCalls: number; triangles: number };
  dispose(): void;
}
export function createAntRenderer(capacity: number): AntRenderer;

// shared gait math (pure, also usable by the sim for footprints / pheromone dabs / sound)
export function advanceGaitPhase(phase: number, distanceMm: number, strideMm: number, scale: number): number;
export function footTarget(rig: AntRig, leg: 0 | 1 | 2 | 3 | 4 | 5, phase: number, speed01: number): { x: number; y: number; z: number; stance: boolean };
```

Ownership: `gait.phase` is render state derived from distance travelled (the sim does not need it), so the adapter keeps
a per-ant phase and advances it by the interpolated displacement each frame; the possessed ant uses the same function so
its feet stay planted at any speed. `pose.*` and `carried` come from sim state (task, alarm level, crop fill).

## 10. Screenshots (`docs/research/spike-ants-img/`, all looked at)

__SHOTS__
