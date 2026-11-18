# Progress: independent sweep after colony-life round 6

Started 04:03 UTC Nov 18. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 04:03 UTC: `/home/user/frozen-sweep6` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `7d9f0409` = live tree at 04:03 (newest src/sim files: other engineers' verify tests
  progression/discovery, rivals/prepare, save/foundingPhases, 03:59-04:01).
- Command (started 04:03 UTC): `/home/user/frozen-sweep6/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-6/sweep /home/user/foundress/test-output/viab/cache`
  (restart-safe: skips runs whose JSON exists; summary.txt has tree hash per run).
- If cut off: re-run the same command (frozen copy survives on disk); delete /home/user/frozen-sweep6 at the end.
- Previous sweep table: test-output/colony-life/round-5/sweep-table.md (dir round-5/sweep).

## Review findings so far

## Remaining
- sweep, table (tools/sim/sweep-table.py round-6/sweep round-5/sweep), bars, regressions
- review of the round's diff (git diff b2809f0 on the round-6 files), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 6"
