# Task F1a — Project scaffold and `src/core`

## Goal
Turn the spike-era project setup into the production scaffold and build the pure core utility layer that every other module depends on. Correctness here matters more than anywhere else: these functions sit under the whole simulation.

## Read first
- `docs/design/tdd/00-contracts-guidance.md` §1 (style), §2 (`src/core` contents), §9 (testing)
- `docs/03-architecture.md` §1, §2, §8
- `docs/research/tech-stack.md` (existing config, harness, gotchas)

## You own
- `package.json` (scripts and config only — do not change dependency versions except adding the one dev dependency below), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`
- `src/core/**`
- `src/main.ts` (minimal boot placeholder only; the app shell task replaces it later)
- `tools/sim/run-ts.mjs` (a tiny runner, see below)
- You may delete `tests/smoke.test.ts` once equivalent coverage exists under `src/core`. Do not touch `spikes/**`, `tools/harness/**`, `docs/**`, `public/**`, `assets-src/**`.

## Work
1. **Config**
   - `tsconfig.json`: keep `strict`; set `noUncheckedIndexedAccess` to **false**; add path alias `@/*` -> `src/*`; keep `verbatimModuleSyntax`, `moduleResolution: bundler`, Preact JSX settings; include `src`, `spikes`, `tests`, `tools/sim`, config files.
   - `vite.config.ts`: alias `@` -> `src`; `base: './'`; keep the existing `classic` mode (single IIFE) working; `resolve.dedupe: ['three']`; production root is `index.html` at the project root; output `dist/`.
   - `vitest.config.ts`: Node environment; alias `@`; include `src/**/*.test.ts` and `tests/**/*.test.ts`.
   - `package.json` scripts: `dev`, `build` (module build to `dist/`), `build:classic` (single IIFE build to `dist-classic/`), `typecheck`, `test` (vitest run), `test:watch`, `play` (harness), `sim` (`node tools/sim/run-ts.mjs`). Keep the existing spike scripts working.
   - A way to run TypeScript entry points in Node with the `@/` alias for headless simulation tools: `tools/sim/run-ts.mjs <file.ts> [args...]`. Prefer a solution with no new dependency (e.g. Vite's programmatic `ssrLoadModule` / the vite-node that ships with Vitest); if none is reliable, add `tsx` as an exact-version dev dependency. Prove it by running a tiny TS file that imports from `@/core`.
   - `index.html` + `src/main.ts`: a minimal page with a full-window canvas and a `#ui` root that imports something from `@/core`, logs the version, and sets `window.__ready = true`. Verify it with the harness (`node tools/harness/play.mjs --root . --no-ready`? — use whatever flags are correct; it must report ok) and with `npm run build` + `npm run build:classic` + the harness in `--static` mode on both outputs.
2. **`src/core`** exactly as listed in the contracts guidance §2, each file with focused tests next to it:
   - `math/vec3.ts`: `Vec3` interface; out-param ops (set, copy, add, sub, scale, addScaled, negate, dot, cross, length, lengthSq, distance, distanceSq, normalize (safe: returns zero vector untouched and reports length), lerp, projectOnPlane, reject, min/max, equalsApprox); `vec3(x,y,z)` constructor; constants as factories (never shared mutable constants).
   - `math/quat.ts`: `Quat`; identity, fromAxisAngle, fromUnitVectors (robust for parallel and antiparallel inputs), multiply, rotateVec3, slerp, fromBasis(fwd, up), normalize.
   - `math/scalar.ts`: clamp, clamp01, lerp, invLerp, remap, smoothstep, approach, wrapAngle, angleDelta, sign0.
   - `math/noise.ts`: deterministic integer-hash value noise and gradient noise in 2D and 3D, fbm with octaves/lacunarity/gain, a ridged variant, and `hash2i/hash3i` returning floats in [0,1). No `Math.sin`-based hashing. Output ranges documented and tested.
   - `math/sdf.ts`: signed distance (positive OUTSIDE the solid, negative inside) for rounded box, capped cylinder (with optional rounding), capsule, ellipsoid (bound-corrected approximation — document its error), and helpers to transform a point into a primitive's local space from position + quaternion. Tests compare against brute-force nearest-surface sampling within a tolerance and check sign correctness and continuity.
   - `rng.ts`: `RngState` as a plain array of four uint32 (e.g. xoshiro128** or sfc32) seeded via splitmix; pure functions `rngSeed(seed)`, `rngNext`, `rngFloat`, `rngRange`, `rngInt` (inclusive bounds, unbiased), `rngPick`, `rngChance`, `rngGauss`, `rngShuffle`, `rngFork(seed, streamName)` (string-hashed independent streams). Tests: determinism, uniformity sanity (chi-square with loose bounds), independence of forks.
   - `events.ts`: typed `EventBus<M>` with `on` (returns unsubscribe), `off`, `emit`, and queued delivery (`queue`, `flush` — handlers may queue more; flush drains in order with a guard against infinite loops).
   - `spatial/hashGrid.ts`: uniform 3D spatial hash for entities with numeric ids: `clear`, `insert(id, x, y, z)`, `queryRadius(x, y, z, r, out: number[])`, `queryBox`; allocation-free in steady state (reuses buckets). Tests against brute force with random points, including negative coordinates.
   - `spatial/grid2d.ts`: typed 2D grid (`Float32Array`/`Uint8Array` backed) with world<->cell mapping, clamped get, bilinear sample, and gradient.
   - `store.ts`: `Store<T extends { id: number; alive: boolean }>` over a plain array: `add`, `get(id)`, `has`, `list` (the live array), `markDead(id)`, `sweep()` (swap-remove dead entities, returns removed), `rebuild()` (after load), `count`. Tests cover id lookup after swap-removal and iteration safety when entities die during iteration.
   - `timeSeries.ts`: fixed-capacity ring buffer stored as plain data (`{ cap, len, head, data: number[] }`) with push/at/toArray/min/max helpers (pure functions, so it can live in saved state).
   - `assert.ts` (`assert`, `assertFinite`, `unreachable`), `log.ts` (levelled logger, silent under Vitest unless enabled).
   - `serialize.ts`: `encode(value): Uint8Array` / `decode(bytes): unknown` for JSON-like values that may contain typed arrays at any depth (preserving their exact type), plus `gzip`/`gunzip` wrappers over fflate and base64 text helpers (`toBase64`, `fromBase64`) for the copy/paste save fallback. Round-trip tests with nested typed arrays, large arrays, unicode strings, `-0`, `NaN` rejection policy (document it).
   - `index.ts` barrels are fine but keep deep imports working.

## Acceptance criteria
1. `npm run typecheck` passes with zero errors for the whole project (spikes included).
2. `npm test` passes; `src/core` has at least 80 meaningful test cases across the files above, including the brute-force comparisons for SDFs and the hash grid, and RNG determinism.
3. `npm run build` and `npm run build:classic` succeed; the harness reports `ok: true` for the dev server root, for `dist/` served from a sub-path (`--static --mount /a/b/`), and for `dist-classic/`.
4. `node tools/sim/run-ts.mjs <a small ts file importing @/core>` works and is documented at the top of the runner.
5. `src/core` imports nothing from outside `src/core` except `fflate` (in `serialize.ts`).
6. No function in a hot-path module (`vec3`, `quat`, `scalar`, `sdf`, `hashGrid`) allocates objects per call (out-params / reuse), verified by reading the code.
7. A short `src/core/README.md` lists each module with a one-line purpose and the sign conventions (SDF positive outside; the world field elsewhere flips it).
