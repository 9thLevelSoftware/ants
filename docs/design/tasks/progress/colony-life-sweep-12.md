# Progress: independent sweep after colony-life round 12

Started 21:00 UTC Nov 22. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 21:00 UTC: `/home/user/frozen-sweep12` (src, tools, configs; node_modules symlinked;
  tools/sim/probe absent). Hash: round-12 recipe (sha256 of src + tools *.ts/*.mjs without probes) `925f45e8` = the
  round's `final-tree-hash.txt`; sweep-life.sh recipe (md5 of src/sim + worldgen + core *.ts) `90126ef7`. Live tree =
  the same at 21:00 (newest src/sim file 20:09 tendHerd.test.ts).
- Sweep: `/home/user/frozen-sweep12/run-sweep.sh` (sweep-life.sh -> round-12/sweep, cache test-output/viab/cache),
  started 21:00 UTC in the background. Restart-safe: re-run it (runs whose JSON exists are skipped).
- Long runs after it: `/home/user/frozen-sweep12/run-long.sh` (PAR=2 UNTIL_DAY=40 longrun-life.sh -> round-12/sweep-long,
  we:2 sg:2 cpv:1 pp:3 kd:3). No JSON existed in round-12/sweep-long at 21:00.
- Previous sweep table: `round-11/sweep-table.md` (dir round-11/sweep).
- Delete /home/user/frozen-sweep12 at the end.

## Review findings so far
- tsc clean 21:02 (`round-12/sweep-review/tsc.txt`). Round's code = `git diff c2ed6cb HEAD` on src/sim (snapshots
  27a7661 + b4dce8c); working tree differs only in the ledger and the deleted tools/sim/probe files.
- lookup.ts incremental grid: bucket order now history-dependent (swap-remove), but all three callers of
  forEachSourceNear sort by (d2, id) or tie-break by id -> no save/load divergence. OK.
- nurse.ts cannibalise "eggs first" re-check counts carried eggs too, while nextCannibalVictim skips carried eggs:
  candidate livelock; verify test written `nest/cannibalEggsFirst.verify.test.ts` (NOT YET RUN).
- hygiene26 case 1 may pass without the nurse-waste rule (a second hauler is allocated anyway): checking on base
  copy `/home/user/scratch-sweep12-base` (git archive c2ed6cb + hygiene26.test.ts copied in; NOT YET RUN). Delete it.
- scoutSmellReport case 3 calls rememberSmelled directly (phaseScout wiring not covered). Minor.
- round's own arm (sweep-table.py on arm-final12 vs arm-final11): worker:lost in 4 of 15 (R19 lost check would fail).
- Folder tests running in background (sweep-review/vitest-*.txt, vitest-done.txt).

## Remaining
- sweep, table (`python3 tools/sim/sweep-table.py round-12/sweep round-11/sweep`), bars, regressions; long runs + longrun-table.py
- review of the round's diff (git diff HEAD on src/sim + tools/sim; base of the round: c2ed6cb / da0cfa6), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 12"

## Log
- 21:00 sweep started.
