# threats-calibrate — implementation progress

Started 2026-11-17 ~17:00 UTC. No earlier progress file existed.

## Done
- Read all docs (spec, threats-live spec/report/review, GDD 05 §2/§5/App E, GDD 06 §14, STATUS R1-R26, colony-life dir. 9).
- Tools: `tools/sim/threatFunnel.ts` +`--run-seed K` (reseeds all rng streams tool-side), `--workers N`, `--food C,P`;
  `tools/sim/threatTable.ts` exports `rates`/`worlds`; new `tools/sim/threatBatch.ts` (worlds x run seeds in one
  process, tables.md + DONE at the end, strikes-per-family table).
- Scratch tree for measurements: `$SCRATCH/tree-base` (copy of src+tools at 17:05, node_modules symlinked).

- R25 ramp DONE in main tree (typecheck clean, creatures folder 26 files / 186 passed / 6 skipped at 17:17 UTC):
  `balance/difficulty.ts` PREDATION_RAMP_WORKERS + predationRampWorkers/predationRamp; `config/presetDisplay.ts` row
  "Hunters settling by a growing colony"; `types/ecology.ts` CreatureTerritory.colonyRange?: number (cross-edit,
  logged in test-output/threats-calibrate/cross-edits.md); `colonyRange.ts` playerWorkers, colonyRangeDrawn x ramp,
  isColonyRangeTerritory (flag, legacy: beyond seeds + colony-range radius + in ring), drawnKinds; `director.ts`
  suspended(), rampCull() (bb.rampOut, despawn cause 'ramp' after SETTING_DESPAWN_GD), rebalance/occupy skip suspended.
  Test `predationRamp.test.ts` (13 tests). Tests given 40 workers: colonyRange.test, colonySites.test,
  threatsLive.verify.test (setup only).

- Core gap repros: `src/sim/ecology/creatures/coreGaps.repro.test.ts` ((a) it.fails rescue 0/6 seeds; (b) nanitic maxHp
  7.2 = GDD 05 §4.1 nanitic row; (c) it.fails known pit walked through). Verified the it.fails fail on assertions.
- Tools: threatFunnel `--until-winter 1`; threatBatch per-colony median line. Scratch trees: `$SCRATCH/tree-base`
  (stop-gap code, no ramp), `$SCRATCH/tree-ramp` (ramp code at 17:25). Queue script `$SCRATCH/queue.sh WAITDIR TREE OUT args`.

## In progress
- Baseline run (stop-gap tree, no ramp): `test-output/threats-calibrate/base-w60/` (5 worlds x run seeds 1,2, 60
  workers, Naturalist, 6 gd). Started 17:06 UTC. If cut off: check DONE file; rerun only missing worlds.
- Queued after base-w60: `test-output/threats-calibrate/ramp-found/` (tree-ramp, 5 worlds x r1,r2, hand-over to
  winter, Naturalist) = check (a).

## Remaining (in order)
1. Ramp (R25) + tests  2. Calibrate (R26)  3. Families report  4. Three core gaps repro  5. Typecheck/tests/perf  6. Report

## Findings so far
- base-w60 interim (7 runs): 60-worker colonies lose 1-6 per 6 gd; rates ~0.02-0.07 per outside-worker gd (in band
  at the low side) with the stop-gap constants -> likely no constant change needed at 60 workers.
- maxHp 7.2 = nanitic (lengthBu x NANITIC_SCALE 0.85 -> 0.614 mg -> 10 m^(2/3)); GDD 05 §4.1 and GDD 07 nanitic row
  = 7 hp. Code right; E12's 10 hp is for a regular worker.
- Gentle/Harsh/off 60-worker batches still to launch (on tree-ramp) after ramp-found; launch each separately (2 h
  background limit per command).

## Decisions so far
- Ramp multiplies the per-kind colony-range siting chance: p = min(1, COLONY_RANGE_P x predatorMult) x ramp(workers).
  Colony-range territories = state territories with index >= world.placements.territories.length (worldgen ones keep
  their indices; no type change). Not drawn any more -> no re-occupation; resident leaves after SETTING_DESPAWN_GD
  (creature bb marker), not at once.
