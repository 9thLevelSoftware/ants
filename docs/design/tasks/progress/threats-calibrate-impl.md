# threats-calibrate — implementation progress

Started 2026-11-17 ~17:00 UTC. No earlier progress file existed.

## Done
- Read all docs (spec, threats-live spec/report/review, GDD 05 §2/§5/App E, GDD 06 §14, STATUS R1-R26, colony-life dir. 9).
- Tools: `tools/sim/threatFunnel.ts` +`--run-seed K` (reseeds all rng streams tool-side), `--workers N`, `--food C,P`;
  `tools/sim/threatTable.ts` exports `rates`/`worlds`; new `tools/sim/threatBatch.ts` (worlds x run seeds in one
  process, tables.md + DONE at the end, strikes-per-family table).
- Scratch tree for measurements: `$SCRATCH/tree-base` (copy of src+tools at 17:05, node_modules symlinked).

## In progress
- Baseline run (stop-gap tree, no ramp): `test-output/threats-calibrate/base-w60/` (5 worlds x run seeds 1,2, 60
  workers, Naturalist, 6 gd). Started 17:06 UTC. If cut off: check DONE file; rerun only missing worlds.
- Implementing R25 ramp in main tree.

## Remaining (in order)
1. Ramp (R25) + tests  2. Calibrate (R26)  3. Families report  4. Three core gaps repro  5. Typecheck/tests/perf  6. Report

## Decisions so far
- Ramp multiplies the per-kind colony-range siting chance: p = min(1, COLONY_RANGE_P x predatorMult) x ramp(workers).
  Colony-range territories = state territories with index >= world.placements.territories.length (worldgen ones keep
  their indices; no type change). Not drawn any more -> no re-occupation; resident leaves after SETTING_DESPAWN_GD
  (creature bb marker), not at once.
