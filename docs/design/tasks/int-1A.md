# Task int-1A — Stage 1A integration gate (Opus)

## Goal
Make the Stage 1A modules work together inside the running game. Twelve modules were built in parallel against stubs and fakes; your job is to join them, fix what breaks at the seams, and prove the result with the full test suite, a headless soak and a browser run with the real renderers.

## Read first
- `docs/design/tasks/notes-1A.md` — every Stage 1A task's report (not done, needs from others, notes for the integrator, contract changes, unmet criteria). This is your work list: resolve each item or record why not.
- `docs/design/tasks/00-module-map.md`, `docs/design/tdd/01-contracts-map.md`, `docs/design/tdd/02-kernel.md`, `docs/03-architecture.md`.
- The module `index.ts` files under `src/sim/**`, `src/render/index.ts`, `src/game/Game.ts`.

## You own (for this task)
Integration edits anywhere in `src/**`, `tests/**` and `tools/**`, under these rules: fix a defect in the module where its root cause lives, keep each edit minimal, never weaken a test to make it pass (fix the code, or fix a test that is itself wrong and say why), keep the contracts additive, and list every file you touched with a one-line reason. Do not start Stage 1B features.

## Work
1. Baseline: run `npm run typecheck` and the full `npm test`; record failures. Fix every one at its root.
2. Seams: for each "needs from others" item in the notes, connect the real function (replace local adapters, fakes and stub calls with the owning module's implementation); remove test doubles from production paths; make sure every module registers its systems, command handlers, behaviours and soak invariants through its `index.ts`.
3. Tick order and cadence: check `src/sim/systems.ts` against the architecture's tick order with the real systems; check no system does unbounded work per tick.
4. Rendering: register the real world, nest and ant renderers in the sub-renderer registry (debug renderers remain only where no real one exists); connect time of day and weather inputs from the environment module, the underground switch, breach/hole masks, mound overlays, quality presets.
5. Game flow as far as Stage 1A allows: new game on a generated world (world-generation core), the founding queen placed and possessable, walking, digging through the action primitive with the ramp brush, pellets and a growing mound, entrance registration, laying an egg through the action primitive, time controls. Use debug cheats to spawn workers and food so the colony economy, allocation and pheromone systems run.
6. Headless soak: `tools/sim/soak.ts` for 3 game days on a generated world with 60 cheat-spawned workers, brood and food sources: zero invariant violations; report per-system timing.
7. Browser: extend `tests/e2e/smoke.mjs` (or add `tests/e2e/stage1a.mjs`) to drive the flow of step 5 with the real renderers and take screenshots on the surface, at the entrance, inside the dug tunnel, and in colony view if available. Look at them.
8. Write `docs/design/tasks/gate-1A-report.md`: what works end to end, what is still stubbed, defects fixed (file, cause), defects left (with reproduction), performance numbers, and what Stage 1B tasks must know.

## Acceptance criteria
1. `npm run typecheck` clean and the full `npm test` green (perf tests may use their documented load-tolerant mode).
2. The soak reports zero invariant violations over 3 game days and prints timings for every system.
3. The browser script passes with no console errors; its screenshots (looked at) show the generated world drawn by the real world renderer with real textures, the real ant model for the queen and workers, an entrance hole and mound after digging, and the tunnel interior drawn by the real nest renderer.
4. `stateHash()` determinism holds for the scripted run (two runs, same hash).
5. Every item in the notes file is accounted for in the gate report.
6. The classic build boots and passes the smoke script in the harness's `--static` mode.
