# Progress: independent sweep after colony-life round 5

Started 00:50 UTC Nov 18. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 00:49 UTC: `/home/user/frozen-sweep5` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `fe11a0ad` = live tree at 00:49 (newest src/sim file colony/handover.ts 00:19).
- Command (started 00:50 UTC): `nohup /home/user/frozen-sweep5/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-5/sweep /home/user/foundress/test-output/viab/cache &`
  (restart-safe: skips runs whose JSON exists; summary.txt has tree hash per run).
- If cut off: re-run the same command (frozen copy survives on disk); delete /home/user/frozen-sweep5 at the end.

## Resumed 01:19 UTC after restart (second engineer)
- 6 runs done (we1 su1 pp1 cv1 ki1 we2, tree fe11a0ad); sweep restarted 01:19 with same command (Bash background).
- Live tree changed after 00:49 only in src/sim/environment/human/alerts*, progression/alerts* (other engineers); frozen copy = round 5.

## Review findings so far (00:58)
- Round diff = `git diff 8b4c207` (commits after it are snapshots; round's files listed in ledger "Fixes (round 5)").
- tsc clean 00:51 (`sweep-review/tsc.txt`). colony folder 62/63 files (red founding/reopen, known), `sweep-review/vitest-colony.txt`.
- Red-without-fix check (scratch copy, the fixed files at 8b4c207): larderProvision.verify, lossCapStores.verify,
  haulMidden.verify, padPrompt.test all RED -> engineer's claim confirmed. viability.test (restated R2 case) green on
  both trees (it does not pin P1).
- New `src/sim/colony/handoverStomach.verify.test.ts` (green): 7 workers, 13 fresh eggs, queen P 11.45: no stage worse
  than lean while she holds her provision; paid in to her keep by window end. P1 holds there.
- Code read: P1, WL2, M2, R27, S3/S6, SR: no lifespan/need/bar change; no new persisted state; no Math.random/Date.now.
  Lead (not a bug yet): laying permission reads pool P days only; with P1 the provision sits in the queen -> fewer eggs.
- **FINDING (major) 01:10**: P1 strands the provision: `handoverStomach.verify` case 2 RED (kept): 9 workers, 3 eggs
  hatching day 3, 16 C: queen keeps 7.37 of 8.6 P after the 3-gd window, pool P 0 from day 4. Sweep sg #1 same
  course (pool P 1.36-1.38 days 1-3, 0 day 4, rationing days 4-7, 6 larvae starved, 0 eclosed). Case 1 green.
- Predation: we #1 lost 7 workers to predation (days 6-10, 23 -> 15 workers); threats-calibrate said median 0. Check
  across sweep.
- Running: folder tests ants/behaviours/nest, ants/player, nest, balance (`sweep-review/vitest-*.txt`, folders.done).

## Remains
- sweep (15 runs), table, bars, regressions vs previous sweep (ledger names it)
- code review of round 5, typecheck, folder tests, verify tests
- ledger section "### Independent sweep after round 5"
