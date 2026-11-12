# Task F1c — Contracts synchronisation and freeze

## Goal
The code contracts (`src/sim/types/**`, task F1b) were written from chapter digests while the design consistency edit was still running. That edit is now finished and recorded 107 contract-affecting decisions. Apply them, apply the orchestrator's rulings below, complete the cross-module stub signatures, and leave the contracts FROZEN: after this task only additive changes are allowed, and about forty module tasks start building on them.

## Read first
1. `docs/design/gdd/00-index.md` — section B (canonical identifier registry: the final names), section D (contract-affecting decisions: old form -> final form; EVERY row must be applied or explicitly rejected with a reason), section C1 (time and calendar constants), section F (residual risks).
2. `docs/design/tdd/01-contracts-map.md` (F1b's map and its questions) and `docs/design/tdd/00-contracts-guidance.md`.
3. `src/sim/**` as it stands. The kernel (`src/sim/kernel.ts`, `src/sim/world/field.ts`, `src/sim/world/primHash.ts`, `src/sim/world/terrainSample.ts`, `src/sim/nest/carve/**`, `src/sim/nest/nav/**`, `src/sim/locomotion/walker.ts`) belongs to another engineer who is still finishing it: do not edit those files, and do not wire the kernel in (a later task does).

## You own (for this task)
`src/sim/types/**`, `src/sim/commands.ts`, `src/sim/sim.ts`, `src/sim/systems.ts`, `src/sim/services.ts`, `src/sim/createGame.ts`, `src/sim/time.ts`, `src/sim/entities/**`, `src/sim/save/**`, `src/sim/testing/**`, `src/sim/balance/**`, `src/sim/species/**`, the stub `index.ts` of each module folder (`world`, `nest`, `locomotion`, `pheromones`, `ants`, `colony`, `ecology`, `rivals`, `combat`, `environment`, `progression`), `src/worldgen/{index,params}.ts`, and `docs/design/tdd/01-contracts-map.md`. Tests next to those files.

## Orchestrator rulings (answers to the questions in the contracts map)
1. **Kernel interfaces**: the kernel's exported interfaces are the source of truth (as already done for `CarveGrid`). Keep `WorldField` and `NestNav` in `types/services.ts` clearly marked as the wiring task's responsibility; do not try to reconcile them now.
2. **Voxel flags** (`LOOSE` / `NATURAL` / `PLUG`): NOT in the kernel's `CarveData`. Add `WorldDelta.carveFlags: { keys: number[]; chunks: Uint8Array[] }` using the same chunk keys as the carve grid, owned and maintained by the nest module.
3. **Lazily allocated grids**: accepted.
4. **Colony-size thresholds**: simulated workers only (see 00-index); nothing in the contracts may carry a per-agent weight or a "real workers" estimate except the codex-only `SpeciesDef.wildColonySize`.
5. **Rival species**: add a light `RivalSpeciesDef` (size, speed, hit points, bite, colours, behaviour profile, nest template id) and route stat lookups through one function `getAntStats(sim, speciesId, caste)` so `spawnAnt` works for both playable and rival species.
6. **Time controls** live in the sim state (`env.time`), written by sim commands, read by the game loop: confirmed.
7. **Diagnostic ids** all carry the `diag-` prefix (00-index decision).
8. **`Colony.livingAnts`** bookkeeping in `spawnAnt` / `killAnt`: confirmed.
9. **Command handlers**: keep the compile-time completeness check, but build the table from per-module maps so that module owners never edit a shared file: each module `index.ts` exports `commandHandlers: Partial<CommandHandlerMap>`; `src/sim/commands.ts` merges them in a fixed order and a test fails if any command type has no handler or two modules claim the same type.
10. **Lasius male upkeep**: 0.06 C per game day (species data wins); make both fields agree.
11. **`dropTo1x` on possession commands**: confirmed.
12. **Mounds** stay heightfield patches in `WorldDelta.mounds` (GDD 03). The kernel will get a height-overlay hook in the wiring task; nothing to do here beyond keeping the type.
13. **Systems and behaviours registration** must follow the same no-shared-file principle as commands: `src/sim/systems.ts` imports `systems` arrays from each module `index.ts`; the behaviour table is assembled from `behaviours` arrays exported by module indexes (`ants`, species modules). Module owners then only ever edit files inside their own folder.

## Work
1. Apply every row of 00-index section D to the types, entity helpers, commands, events, diagnostics and stubs; bring every identifier union in line with registry B (final names only; no aliases left behind); make every calendar-dependent constant read the season length from config (no hard-coded 7 or 28 anywhere in `src/sim`).
2. Apply the rulings above.
3. Cross-module function signatures. Make sure each module stub exports these with final signatures and safe "not available" bodies, each annotated with its owner task key from `docs/design/tasks/00-module-map.md`:
   - locomotion: `navTo`, `navStop`, `navWander`, `navFollowTrail`, `navRetrace`, `integratePossessed`, `placeOnSurface`
   - nest: `canDigAt`, `digBite` (digger position, horizontal heading and slope — the ramp brush of `docs/research/spike-nest.md` §5 item 5), `dumpPellet`, `sealEntrance`, `unsealEntrance`, `claimDigSite`, `releaseDigSite`, `validatePlan`, `createPlan`, `cancelPlan`, `designateChamber`, `siteAt`
   - colony: `depositFood`, `withdrawFood`, `feedBrood`, `layEgg`, `requestTask`, `colonyDemand`
   - pheromones: `deposit`, `sample`, `senseDirection`
   - ecology: `harvest`, `nearestSource`, `discoverSource`
   - combat: `applyDamage`, `beginGrapple`, `releaseGrapple`
   - environment: `airTemp`, `surfaceTemp`, `soilTemp`, `chamberTemp`, `speedMult`, `lightLevel`, `sunDirection`, `isRaining`, `rainRate`
   - ants: `canDo`, `begin`, `cancel`, `currentPrompt`, `inspect`
   - progression: `publishDiagnostic`, `recordMilestone`, `unlockCodex`, `raiseAlert`
4. Update `docs/design/tdd/01-contracts-map.md`: a table of every rename made in this task (old -> new), every section-D row and its outcome, and the questions still open.
5. Add at the top of `src/sim/types/index.ts` a short comment: "FROZEN after task F1c: additive changes only (new optional fields, new union members appended, new helpers). Renames and removals need the orchestrator."

## Acceptance criteria
1. `npm run typecheck` clean for the whole project; `npm test` green (all existing tests adapted, none deleted without an equivalent).
2. Every section-D row is accounted for in the contracts map (applied, or rejected with a reason).
3. No identifier in `src/sim/types/ids*.ts` contradicts registry B; a test iterates every exported id array and asserts uniqueness and kebab-case (or the documented exception).
4. `grep` finds no hard-coded season or year length in `src/sim/**` (constants derive from config); a test runs the calendar helpers with season lengths 5, 7 and 10.
5. The command-handler completeness test passes with handlers contributed by module indexes; `systems.ts` and the behaviour table are assembled from module exports.
6. The determinism, snapshot round-trip and plain-data tests from F1b still pass.
7. Every stub function listed above exists, is typed, returns a safe value, and names its owner task.
