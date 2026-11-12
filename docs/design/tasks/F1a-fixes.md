# Task F1a-fixes — Minor correctness fixes in `src/core`

An independent review of `src/core` passed it with these minor findings. Fix each one at the root, add or adjust a test that pins the corrected behaviour, and keep every public signature unchanged (other engineers are already building on this API).

## You own
`src/core/**` only (source and tests). Do not change exported names, parameter orders or return types.

## Findings to fix
1. `rngRange(s, lo, hi)` is documented as `[lo, hi)` but can return exactly `hi` through floating-point rounding. Guarantee the half-open interval (callers index arrays with it). Check `rngInt`, `rngPick`, `rngShuffle` and `rngChance` for the same class of edge error and pin them with tests (including `lo === hi`, negative ranges, huge ranges).
2. `rngSeed` claims integers up to 2^53 are used in full, but distinct seeds collide. Either mix both 32-bit halves of the seed so distinct safe integers give distinct states, or correct the documentation and state the real guarantee; prefer fixing the mixing. The existing golden reference sequence for the documented reference seed must keep passing.
3. `smoothstep(e0, e1, x)` with `e0 === e1` returns 0 for every x. Make it a step at the edge (0 below, 1 at or above) and document it; check `invLerp` and `remap` for the same degenerate-range behaviour and define it explicitly.
4. `sdEllipsoid`: the documented inside-error bound is wrong (measured 2.6x for a 3:1 ellipsoid, not "about 2x") and the function is discontinuous at the centre. Correct the documented bounds from measurement across aspect ratios 1:1 to 6:1, make the value at and near the centre finite, continuous and negative, and add an `sdEllipsoidExact` (iterative, slower, documented cost) for callers that need true interior depth. Tests: sign correctness everywhere, continuity through the centre, exact version within 1 % of brute force.
5. Housekeeping: `tools/sim/hello-core.ts` was created outside the task's owned paths; it is fine to keep as the documented example — make sure `tools/sim/run-ts.mjs` references it in its header comment and that it still runs.

## Acceptance criteria
1. `npm run typecheck` clean and `npx vitest run src/core` green, with new tests for every item above.
2. No exported signature in `src/core` changed (compare with `git diff` of the export lines).
3. The RNG golden-sequence and noise golden-value tests are unchanged and still pass.
