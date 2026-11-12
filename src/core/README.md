# `src/core` — pure utilities

Imports nothing from the project and nothing from npm except `fflate` (in `serialize.ts`). No `three`, no DOM,
no `window`, no `Math.random`, no `Date.now`. Runs unchanged in the browser, in Vitest and in `tools/sim` runners.
Import from the barrel (`@/core`) or deep paths (`@/core/math/vec3`); both are supported.

## Modules

| Module | Purpose |
|---|---|
| `math/scalar.ts` | clamp, lerp/invLerp/remap, smoothstep, approach, wrapAngle/angleDelta (radians, (-PI, PI]), sign0. |
| `math/vec3.ts` | `Vec3 {x,y,z}` and out-param operations (`v3Add(out, a, b)` ...); safe `v3Normalize` returns the original length. |
| `math/quat.ts` | `Quat {x,y,z,w}`: axis-angle, robust fromUnitVectors, multiply (`a*b` applies b first), rotate, slerp, fromBasis (local +Z = fwd, +Y = up). |
| `math/noise.ts` | Integer-hash value/gradient noise, fbm and ridged in 2D/3D, `hash2i/hash3i`; bit-identical on every engine. Ranges in the file header. |
| `math/sdf.ts` | Signed distances for sphere, rounded box, capped (rounded) cylinder, capsule, ellipsoid (approximation, error documented) + world<->local transforms. |
| `rng.ts` | xoshiro128** with splitmix seeding; `RngState` is four plain uint32 numbers stored in SimState; `rngFork(seed, name)` for named streams. |
| `events.ts` | `EventBus<Map>`: `on/off/emit`, `onAny`, queued `queue/flush` with a loop guard; `EventMapOf<Union>` helper. |
| `spatial/hashGrid.ts` | `HashGrid3`: uniform 3D hash for point entities; O(1) clear, allocation-free queries (`queryRadius`, `queryBox`). |
| `spatial/grid2d.ts` | Plain-data typed 2D grid over world X/Z: cell mapping, clamped get, bilinear sample, analytic gradient. |
| `store.ts` | `Store<T extends {id, alive}>`: id index over a state array, deferred removal (`markDead` + `sweep`), `rebuild` after load. |
| `timeSeries.ts` | Fixed-capacity ring buffer as plain data (`{cap, len, head, data}`) with pure helpers. |
| `assert.ts` | `assert`, `assertFinite`, `unreachable`. |
| `log.ts` | Levelled, tagged logger; silent under Vitest unless `setLogLevel` is called; pluggable sink. |
| `serialize.ts` | Binary encode/decode of JSON-like values with typed arrays (exact type kept), gzip/gunzip, base64, one-line text form. Policy in the file header (NaN/Infinity rejected, undefined properties omitted). |
| `version.ts` | `FOUNDRESS_VERSION`. |

## Conventions

- Units: millimetres, Y up, right-handed (docs/01-design-seed.md §3). Angles in radians.
- Hot-path maths (`vec3`, `quat`, `scalar`, `sdf`, `noise`, `hashGrid`) never allocates: results go into an `out`
  argument passed first, which may alias the inputs. The only allocating functions are named constructors and
  factories (`vec3()`, `v3Zero()`, `v3UnitY()`, `v3Clone()`, `quat()`, `quatIdentityNew()`). There are no
  shared mutable constant vectors.
- **SDF sign: positive OUTSIDE the shape, negative inside.** The world field `f(p)` is positive in FREE space, so:
  a shape used as a **solid** contributes `+sd(p)` (fSubstrate = min over solids), a shape used as a **cavity**
  (carve brush, crack, void) contributes `-sd(p)` (fCavity = max over cavities), and `f = max(fSubstrate, fCavity)`.
  The flip happens only for cavities; say which convention a value uses whenever you pass one around.
- Determinism: everything here is a pure function of its inputs; randomness comes only from an explicit `RngState`.
  Noise uses only integer hashing; `rngGauss`, `quat*` trig and `sdf` square roots use `Math` functions.
