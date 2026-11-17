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

## Status 18:00 UTC
- base-w60 DONE: Naturalist 60 workers, 10 runs: 41 deaths / 26,118 outside worker-h = 0.04 per owgd (in band) ->
  decision: NO constant change (COLONY_PAUSE_KINDS [], COLONY_RANGE_MIN_BU {} kept, comments updated).
- ramp-found RUNNING (4 of 10 done at 18:15). Detached chain `$SCRATCH/chain.sh` (setsid nohup, log
  `$SCRATCH/chain.log`) runs after it: ramp-w60-gentle -> ramp-w60-harsh -> ramp-w60-off -> base-found (tree-base, r1,
  to winter). If the machine restarted: check which dirs have DONE and relaunch only the missing ones with queue.sh
  (first arg '' = no wait). Then perf: `$SCRATCH/perf.sh $SCRATCH/tree-base before OUT` and main tree `after`.
- Bird: 0 events in 10 x 60-worker runs: hourly gate eligible 3-10 h/run, but the quiet share is 0 (human-event
  warnings) so requestMajorThreat cancels birds -> report (I11 / human events).

- 18:45 ramp-found DONE: (a) met — predation deaths per colony to winter 2,0,0,0,0,0,0,0,0,0 (median 0), 10,506
  outside worker-h. Chain now on ramp-w60-gentle.

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

## Session 2 (started 18:58 UTC after the 18:55 restart)
- threatBatch.ts now resumes: a run whose funnel-*.json exists is read, not re-run (copied into both scratch trees).
- 18:59 relaunched ramp-w60-gentle (woodland-edge r1,r2 kept) via `$SCRATCH/chain2.sh` (log `$SCRATCH/chain2.log`).
  Next, one at a time: ramp-w60-harsh, ramp-w60-off, base-found (base-found optional: stop-gap tree to winter).
- 19:03 typecheck whole tree 0 errors; creatures folder 27 files, 187 passed / 2 expected fail / 6 skipped.
- predationRamp.test.ts: shrink test is now per preset (it.each; Gentle with custom predators normal since Few draws
  nothing on woodland-edge #1): 15 tests green.
- Queued (detached): chain3 = ramp-w60-harsh then ramp-w60-off (wait on gentle DONE); chain4 = ramp-w60-nat-check
  (tree-ramp Naturalist w60 woodland-edge + car-park-verge r1, to show equal to base-w60) after off.
- After those: perf before/after ($SCRATCH/perf.sh tree-base before, main tree after) — nothing else running then.
- base-found (no-ramp founding year) optional, last.
- 19:12 chain5 (detached): waits for ramp-w60-nat-check DONE, then perf (perf.sh tree-base `before`, tree-ramp `after`
  -> test-output/threats-calibrate/perf.txt, then perf.DONE; if cut off mid-way delete perf.txt and rerun), then
  base-found (tree-base, r1, --until-winter 1; the earlier chain had forgotten --until-winter).
- Summary helper: `python3 $SCRATCH/summ.py DIR...` (totals per batch dir: owh, deaths, rate, strikes/kills per family).
- Report placeholders left: BEFORE_RAMP (§2.1), PRESETS_TABLE, GENTLE_RATE/HARSH_RATE (§2.2/§6), PERF_TABLE (§5),
  ACCEPTANCE. At the end: delete $SCRATCH/tree-base and tree-ramp (spec: delete scratch trees).
- 19:29 ramp-w60-gentle DONE: 10 runs, 24,039 owh, 7 deaths = 0.007/owgd (JS 0/0, wolf 38/4, ant-sp 32/3). Harsh running (chain3).
- 19:58 harsh 7/10 runs done.
