# Task F-int — Foundation integration (kernel + contracts)

## Goal
Join the two halves of the foundation that were built in parallel: the contracts/skeleton (task F1b) and the kernel (task F2). After this task the simulation runs on the real world field, carve grid, nest navigation and walker, the contract types are final enough for ~40 module tasks to build on, and a headless soak runner exists.

## Read first
- `docs/design/tdd/00-contracts-guidance.md`, `docs/design/tdd/01-contracts-map.md` (F1b's map, including everything marked PROVISIONAL and its questions), `docs/design/tdd/02-kernel.md` (kernel API).
- `docs/design/gdd/00-index.md` if it exists: the section "Contract-affecting decisions" lists renames and payload changes decided by the design consistency edit — apply them. If the file does not exist yet, skip that step and say so in your report.
- `src/sim/**` as it stands (types, skeleton, stubs, kernel).

## You own (for this task only)
`src/sim/types/**`, `src/sim/services.ts`, `src/sim/sim.ts`, `src/sim/createGame.ts`, `src/sim/testing/**`, `src/sim/balance/**`, the module stub `index.ts` files (signatures only), `docs/design/tdd/01-contracts-map.md`, and new `tools/sim/soak.ts`. Do NOT change the kernel files (`src/sim/world/field.ts`, `src/sim/world/primHash.ts`, `src/sim/world/terrainSample.ts`, `src/sim/nest/carve/**`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts`, `src/sim/kernel.ts`) except to fix a defect you can demonstrate with a test — report any such change.
This is the LAST point at which contract names may be renamed (no module depends on them yet). After this task: additive changes only.

## Work
1. Replace the provisional kernel service interfaces in `src/sim/types/services.ts` with the kernel's real exported interfaces (re-export them); make `Walker` in the contracts structurally compatible with the kernel's `WalkerKin`; fix every usage.
2. `createServices` builds the real kernel from `WorldData` and `state.worldDelta.carve` (via `createKernel`), supplying the diggability predicates from the species definition and a material table in `src/sim/balance/nest.ts` (dig factors per material per species from `docs/design/gdd/digests/03.md`; the nest task refines it later). Delete placeholder services that are now unused; keep fakes that tests of other modules will want (pheromone field, nav grid) clearly named as test doubles.
3. `createNewGame` places the founding queen on the surface at the world's queen start using the kernel's placement function; the world delta starts with any pre-carve operations from the world applied through the carve grid.
4. `makeTestWorld` / `makeTestSim` use the real kernel and gain options other tasks need: a few primitives (wall, table with a climb route, stone, stem), a standard pre-carved small nest (entrance shaft, three chambers, branch) registered in `state.nests`, N worker ants placed inside. Document the options at the top of the file.
5. Contract review pass. Read every type with the eyes of the module owners who will use it (module map: `docs/design/tasks/00-module-map.md`) and fix: missing fields that a digest lists as required and that are not deliberately deferred; inconsistent naming (same concept, two names); fields without unit comments; any `Map`/`Set`/class/function in state; ids that should be unions; optional fields that should be required with a default. Apply the "Contract-affecting decisions" from the GDD index. Keep the contracts map accurate.
6. Cross-module function signatures in the stubs: make sure these exist with sensible signatures, because parallel tasks will code against them — locomotion (`navTo`, `navStop`, `navWander`, `navFollowTrail`, `navRetrace`, `integratePossessed`), nest (`digBite` taking digger position + heading + slope, `dumpPellet`, `sealEntrance`, `unsealEntrance`, `claimDigSite`, `releaseDigSite`, `canDigAt`), colony (`depositFood`, `withdrawFood`, `feedBrood`, `layEgg`, `requestTask`), pheromones (`deposit`, `sample`, `senseDirection`), ecology sources (`harvest`, `nearestSource`), combat (`applyDamage`, `beginGrapple`), environment (`airTemp`, `surfaceTemp`, `chamberTemp`, `speedMult`, `lightLevel`, `sunDirection`, `isRaining`), ants/actions (`canDo`, `begin`, `cancel`), progression (`publishDiagnostic`, `recordMilestone`, `unlockCodex`). Each stub returns a safe "not available" value and names its owner task.
7. `tools/sim/soak.ts` (run with `node tools/sim/run-ts.mjs tools/sim/soak.ts --days N --seed S`): creates a game on the generated world, ticks N game days, checks invariants every 100 ticks (no NaN in any walker, every walker satisfies the kernel's free-space invariant, stores and counts non-negative, state encodes), prints per-system timing and a final summary as JSON. This becomes the standard soak tool; make invariants pluggable so later tasks add theirs.

## Acceptance criteria
1. `npm run typecheck` clean; ALL tests in the repository green (`npm test`), including F1b's determinism and snapshot tests now running on the real kernel.
2. No PROVISIONAL marker remains in `src/sim/types/**` (or each remaining one is justified in the contracts map).
3. `makeTestSim({ nest: 'small', workers: 20 })` produces a sim where workers stand inside the nest on valid surfaces, and a test walks one worker from the deepest chamber out to the surface using kernel nest-nav + walker only.
4. The soak tool runs 2 game days on a generated world with stub systems and reports zero invariant violations; its timing output lists every system.
5. The contracts map lists every rename made in this task (old -> new) and every question still open for the orchestrator.
6. Save round-trip (snapshot -> restore -> continue) still equals an uninterrupted run, with a non-empty carve grid in the state.
