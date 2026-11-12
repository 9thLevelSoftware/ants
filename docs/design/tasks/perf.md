# Task perf — Performance: simulation level of detail, render budgets, quality presets (Stage 3, Opus)

## Goal
Meet the performance contract: 60 fps at Medium on an integrated-GPU laptop at 1080p, with a 1,000-ant colony costing no more than 4 ms of simulation per frame at 1x — verified with measurements, not guesses.

## Read in full
`docs/03-architecture.md` §6 (budgets), GDD 08's performance contract paragraph and the Settings graphics options, `docs/research/tech-stack.md` §3 (what software rendering can and cannot tell us), `docs/research/spike-look.md` (cost breakdown by stage and preset). The soak tool (`tools/sim/soak.ts`) and `window.__game.perf()`.

## You own
`tools/perf/**` (benchmarks and a report generator), `docs/perf-report.md`. Changes inside other modules are authorised for this task when they are measured improvements: keep each change small, covered by the module's existing tests, and list file, change and before/after numbers in your report.

## Deliverables
1. Benchmarks: headless simulation cost per system for 300 / 1,000 / 1,500-ant colonies with rivals and creatures (from saved soak states); render cost breakdown per sub-renderer and post stage at each quality preset using the stepped, frozen-clock method.
2. Simulation level of detail and scheduling fixes for the top offenders (staggering, cadence, spatial queries, allocation in hot paths), each proven by numbers.
3. Render fixes for the top offenders (draw-call batching, LOD distances, shadow settings, instance densities per preset), each proven by numbers; quality presets retuned from the measurements; auto-detect thresholds set.
4. A memory check (heap after 28 simulated days stays bounded; no leaks across new game -> end game -> new game).
5. `docs/perf-report.md`: methodology, tables, what was changed, what remains.

## Acceptance criteria
1. Simulation: 1,000 player ants plus the normal rival/creature load average at most 4 ms per frame at 1x on this machine (equivalently, the per-tick cost times ticks per frame), and 8x speed holds without falling behind for a 300-ant colony (report measured numbers).
2. Rendering: draw calls and triangles at High stay within the architecture budget in three representative views (lawn, kitchen, inside a busy nest); relative cost ratios between presets are as designed.
3. No test regressions; determinism tests still pass.
4. Three consecutive new-game/end-game cycles do not grow the heap beyond the stated tolerance.
