# Task F-int — Foundation integration (kernel + contracts)

## Goal
Join the two halves of the foundation that were built in parallel: the contracts/skeleton (task F1b) and the kernel (task F2). After this task the simulation runs on the real world field, carve grid, nest navigation and walker, the contract types are final enough for ~40 module tasks to build on, and a headless soak runner exists.

## Read first
- `docs/design/tdd/00-contracts-guidance.md`, `docs/design/tdd/01-contracts-map.md` (F1b's map, including everything marked PROVISIONAL and its questions), `docs/design/tdd/02-kernel.md` (kernel API).
- Task F1c has already synchronised the contracts with the design index; do not redo that.
- `src/sim/**` as it stands (types, skeleton, stubs, kernel).

## You own (for this task only)
`src/sim/types/**`, `src/sim/services.ts`, `src/sim/sim.ts`, `src/sim/createGame.ts`, `src/sim/testing/**`, `src/sim/balance/**`, the module stub `index.ts` files (signatures only), `docs/design/tdd/01-contracts-map.md`, and new `tools/sim/soak.ts`. Do NOT change the kernel files (`src/sim/world/field.ts`, `src/sim/world/primHash.ts`, `src/sim/world/terrainSample.ts`, `src/sim/nest/carve/**`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts`, `src/sim/kernel.ts`) except to fix a defect you can demonstrate with a test — report any such change.
The contracts were frozen by task F1c: additive changes only. If wiring the kernel needs a contract change that is not additive, stop and report it instead of making it.

## Work
1. Replace the provisional kernel service interfaces in `src/sim/types/services.ts` with the kernel's real exported interfaces (re-export them); make `Walker` in the contracts structurally compatible with the kernel's `WalkerKin`; fix every usage.
2. `createServices` builds the real kernel from `WorldData` and `state.worldDelta.carve` (via `createKernel`), supplying the diggability predicates from the species definition and a material table in `src/sim/balance/nest.ts` (dig factors per material per species from `docs/design/gdd/digests/03.md`; the nest task refines it later). Delete placeholder services that are now unused; keep fakes that tests of other modules will want (pheromone field, nav grid) clearly named as test doubles.
3. `createNewGame` places the founding queen on the surface at the world's queen start using the kernel's placement function; the world delta starts with any pre-carve operations from the world applied through the carve grid.
4. `makeTestWorld` / `makeTestSim` use the real kernel and gain options other tasks need: a few primitives (wall, table with a climb route, stone, stem), a standard pre-carved small nest (entrance shaft, three chambers, branch) registered in `state.nests`, N worker ants placed inside. Document the options at the top of the file.
5. Mound height overlays: mounds are heightfield patches in `WorldDelta.mounds` (GDD 03). Give the kernel's world field a small, tested hook for registered height overlays (a few small grids added to the terrain height in `height()` and in the terrain term, with correct gradients), and register the state's mounds through it in `createServices`. This is the one planned kernel change in this task.
6. Point the stub factories (`createWorldField`, `createNestNav`, …) at the real kernel and delete what is now dead.
6b. Apply the four late contract items from `docs/design/gdd/00-index.md` section "D7. Second pass": D7.1 calendar helpers `defaultYearDay` / `defaultYearDoy` in `src/sim/time.ts` (additive); D7.2 environment queries `thermalInputs(pos)` and `rainIntensityAt(pos)` as stubs plus the two EMA arrays in `env.thermal` (additive); D7.3 widen `Brood.destined` to every caste except `queen`; D7.4 the lineage record field is `peakWorkers` (rename it if the old name is still present — this one rename is authorised).
7. `tools/sim/soak.ts` (run with `node tools/sim/run-ts.mjs tools/sim/soak.ts --days N --seed S`): creates a game on the generated world, ticks N game days, checks invariants every 100 ticks (no NaN in any walker, every walker satisfies the kernel's free-space invariant, stores and counts non-negative, state encodes), prints per-system timing and a final summary as JSON. This becomes the standard soak tool; make invariants pluggable so later tasks add theirs.

## Acceptance criteria
1. `npm run typecheck` clean; ALL tests in the repository green (`npm test`), including F1b's determinism and snapshot tests now running on the real kernel.
2. No PROVISIONAL marker remains in `src/sim/types/**` (or each remaining one is justified in the contracts map).
3. `makeTestSim({ nest: 'small', workers: 20 })` produces a sim where workers stand inside the nest on valid surfaces, and a test walks one worker from the deepest chamber out to the surface using kernel nest-nav + walker only.
4. The soak tool runs 2 game days on a generated world with stub systems and reports zero invariant violations; its timing output lists every system.
5. The contracts map's PROVISIONAL section is updated (kernel items resolved), and a test proves a mound overlay raises `field.height` and that a walker walks over it.
6. Save round-trip (snapshot -> restore -> continue) still equals an uninterrupted run, with a non-empty carve grid in the state.
