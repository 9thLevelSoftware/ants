# Progress: independent sweep after colony-life round 15

Started 15:01 UTC Nov 23 (session 1). No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 15:03 UTC: `/home/user/frozen-sweep15` (src, tools, tests, configs; node_modules and
  test-output/viab symlinked). sweep-life.sh hash recipe **48db2e0d** (= live tree at 15:03). Live src = HEAD 5151a98 +
  six restated test files (= /home/user/scratch-r15e for src/sim, worldgen, core, tools/sim apart from those tests).
- `/home/user/frozen-sweep15/run-all.sh` (background, started 15:04): sweep-life.sh -> round-15/sweep, then
  PAR=2 UNTIL_DAY=40 longrun-life.sh -> round-15/sweep-long. Restart-safe: if no node life.ts is running, re-run it.
  No JSON existed in round-15/sweep-long at 15:03.
- Previous sweep table: `round-14/sweep-table.md` (dir round-14/sweep).
- Delete /home/user/frozen-sweep15 at the end.

## Review findings so far
- 15:10 tsc clean (`round-15/sweep-review/tsc.txt`). Folder tests running in background
  (`round-15/sweep-review/vitest-folders.sh`, one worker, restart-safe -> `vitest-*.txt`, `vitest-done.txt`).
- Round diff = `git diff ec35477` on src (no other src change since): nestNav nearestReached, phaseNest
  deliverLegFailed, hunt sugarTrip, wasteFall chamberFloorUnder / liftBuriedItem, crumbs retraceTarget (nearest
  start + consume), transitions route guard (AntFlag.HOMING), LARVA_P_REQ 0.8 + 5 restated tests + 2 fixtures.
- Read so far: no forbidden change (no lifespan / need / food / bar change; LARVA_P_REQ by 30a). Determinism: crumbIdx
  lives in nav.loco (persisted NavScratch), legFails in bb, HOMING in flags: all persisted; nearestReached / isLone
  pure over pass flags; no per-tick cost trap (nearestCrumb only at a retrace start, isLone only on an INF read).
- HOMING set only by startReturn; flee/hunt resumes to outbound only from an outbound phase, so no stale flag found.

## Remaining
table + bars, long table, review, verify tests, ledger section.
