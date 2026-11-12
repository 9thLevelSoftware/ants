# Task int-1A-sim — Stage 1A integration gate, simulation half (Opus)

## Goal
Make the Stage 1A simulation modules work together. They were built in parallel against stubs and fakes; join them, fix what breaks at the seams, close the open review findings, and prove the result with the full test suite and the headless soak. A second engineer is doing the application half (renderers, game flow, browser run) at the same time.

## Read first
- `docs/design/tasks/notes-1A.md` — every Stage 1A task's report (not done, needs from others, notes for the integrator, contract changes, unmet criteria, unfixed minor findings). This is your work list for everything that concerns `src/sim/**`, `src/worldgen/**`, `src/core/**` and `tools/sim/**`: resolve each item or record why not.
- `docs/design/tasks/notes-truncated-findings.md` — review findings that never reached the engineers who fixed their tasks (a workflow fault). For the simulation tasks in it (`loco`, `nestops`, `actions`, `worldgen-terrain`): check each against the code; fix every major one (notably: any nav-grid change rebuilding every flow field synchronously) and every minor one that is a real defect rather than taste.
- `docs/design/tasks/00-module-map.md`, `docs/design/tdd/01-contracts-map.md`, `docs/design/tdd/02-kernel.md`, `docs/03-architecture.md` §3.

## You own (for this task)
Integration edits anywhere under `src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**` and their tests. Rules: fix a defect where its root cause lives; keep each edit minimal; never weaken a test to make it pass (fix the code, or fix a test that is itself wrong and say why); contracts stay additive; list every file you touched with a one-line reason. Do not edit `src/render/**`, `src/game/**`, `src/ui/**`, `tests/e2e/**` (the application-half engineer owns those) — if you find a defect there, describe it precisely in your report. Do not start Stage 1B features.
Timing note: the world-generation engineer is still applying review fixes under `src/worldgen/**` when you start. Do everything else first and come to world generation last; if its files are still changing under you then, do not edit them — report what you found instead.

## Work
1. Baseline: `npm run typecheck` and the full `npm test`; record failures; fix every simulation-side failure at its root (including tests that still expect stub behaviour and must now assert the real behaviour).
2. Seams: for each "needs from others" item, connect the real function — replace local adapters, test doubles in production paths and stub calls with the owning module's implementation (for example: the real entity index and nav grid in `createServices`; pheromone hooks installed with the environment's decay modifier and the field's free-space test; nest fields kept current by the nest module; locomotion speed factors from physiology and environment; the dig-bite action using the nest module's bite timing with moisture, loose soil and crust; colony capacity from real chambers; environment temperatures feeding brood development; sources created from the generated world's placement tables).
3. Registration: every module contributes its systems, command handlers, behaviours and soak invariants through its `index.ts`; `src/sim/systems.ts` runs them in the architecture's tick order; no system does unbounded work per tick; balance constants that modules left in their own folders are re-exported from `src/sim/balance`.
4. The seven minor findings of the kernel-integration review (in the notes): at least fix the non-finite query position that hangs the primitive hash, the two test workers that cannot walk out of the test nest, the allocation in `materialAt` when overlays exist, and the soak tool's timing report.
5. End-to-end simulation scenarios as tests (headless, deterministic), using debug cheats where Stage 1B behaviours are missing: (a) a new game on a generated world: the queen is placed, walks via locomotion to a diggable spot, digs a shaft and chamber through the action primitive (pellets, mound growth, entrance registration, chamber detection), lays eggs, brood develops with the environment's temperatures; (b) 60 cheat-spawned workers with scripted navigation between the nest and a food source: deposits enter the ledger, allocation assigns tasks, pheromone deposits decay; (c) save -> restore -> continue equals an uninterrupted run.
6. Soak: `tools/sim/soak.ts` for 3 game days on a generated world with 60 workers, brood and food sources: zero invariant violations; per-system timing table.
7. Write `docs/design/tasks/gate-1A-sim-report.md`: what works end to end, what is still stubbed, defects fixed (file, cause), defects left (with reproduction), performance numbers, every notes item and its outcome, and what Stage 1B tasks must know (the public functions behaviours should call, with one-line descriptions).

## Acceptance criteria
1. `npm run typecheck` clean; every test under `src/sim`, `src/worldgen`, `src/core` green (perf tests may use their documented load-tolerant mode).
2. The three end-to-end scenarios pass as tests; determinism holds (same seed, same `stateHash`).
3. The soak reports zero invariant violations over 3 game days and timings for every system; the simulation cost with 60 workers is reported per system.
4. Every simulation item in both notes files is accounted for in the gate report.
5. No production code path uses a test double or a stub where a real module exists (grep-based check listed in the report).
