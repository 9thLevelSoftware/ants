# Progress: independent sweep after colony-life round 7

Started 07:11 UTC Nov 18. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 07:11 UTC: `/home/user/frozen-sweep7` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `44ff6ee0` = live tree at 07:11 (newest src/sim files: balance/nestwork.ts,
  ants/behaviours/nest/board.ts, nurse.test.ts at 07:08 = T1 revert, equal to HEAD).
- Command (started 07:11 UTC): `/home/user/frozen-sweep7/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-7/sweep /home/user/foundress/test-output/viab/cache`
  (restart-safe: skips runs whose JSON exists; summary.txt has tree hash per run).
- If cut off: re-run the same command (frozen copy survives on disk); delete /home/user/frozen-sweep7 at the end.
- Previous sweep table: test-output/colony-life/round-6/sweep-table.md (dir round-6/sweep).

## Review findings so far

## Remaining
- sweep, table (tools/sim/sweep-table.py round-7/sweep round-6/sweep), bars, regressions
- review of the round's diff (git diff 948fb75 on the round-7 files), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 7"
