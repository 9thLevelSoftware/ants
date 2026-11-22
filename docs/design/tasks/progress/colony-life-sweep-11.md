# Progress: independent sweep after colony-life round 11

Started 17:54 UTC Nov 22. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 17:54 UTC: `/home/user/frozen-sweep11` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash (sweep-life.sh recipe) `be38bf9e` = live tree at 17:54. Live src = commit da0cfa6
  (git status: only the ledger and the deleted probe-hyg11.ts differ). Newest src/sim file 16:48 (notice.ts etc.).
- Command (started 17:54 UTC, background): `/home/user/frozen-sweep11/run-all.sh` = sweep-life.sh into
  round-11/sweep, then PAR=2 UNTIL_DAY=40 longrun-life.sh into round-11/sweep-long (we:2 sg:2 cpv:1 pp:3 kd:3).
  Restart-safe: re-run it (runs whose JSON exists are skipped).
- Previous sweep table: see ledger (round-10 sweep).
- Delete /home/user/frozen-sweep11 at the end. (/home/user/frozen-sweep10 was left by sweep 10; delete too.)

## Review findings so far

## Remaining
- sweep, table, bars, regressions; long runs + longrun-table.py
- review of the round's diff (git diff 9c1b728 da0cfa6 on src/sim + tools/sim), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 11"

## Log
- 17:57 tsc --noEmit clean (`round-11/sweep-review/tsc.txt`). Previous sweep = round-9/sweep (sweep 10 was stopped,
  direction 25). Round code = `git diff 9c1b728 da0cfa6` (live src = da0cfa6). Running folder tests one at a time,
  VITEST_MAX_WORKERS=1 (outdoor first).
- 17:59 wrote verify tests (not yet run): `ants/behaviours/outdoor/noticeSaveLoad.verify.test.ts` (runner wiring of
  noticeOutside on real ticks + save/load with pending notices), `colony/scoutsFirst.verify.test.ts` (R38.1: targets.ts
  serves the whole scout demand first, not the floor: 6 workers -> 2 scouts ahead of forage vs ruling's floor 1 / cap 1.5).
  Review notes: all round tests call noticeOutside directly (wiring unguarded); R38 items as worded otherwise.
- 18:01 behaviours/outdoor 34/34 files (`sweep-review/vitest-outdoor.txt`). Verify tests run (`vitest-verify.txt`):
  noticeSaveLoad.verify GREEN (non-scout holds a smelled report via the runner; save/load hash equal after 1500 ticks);
  scoutsFirst.verify case 1 RED (kept, minor: scouts 2 / forage 2 of 6 workers, ruling's floor 1, cap 1.5), control
  green. Now: colony folder (background). Sweep: we1 + sg1 at day 12.
- 18:04 colony folder: 75 passed, 2 failed of 81 files (`vitest-colony.txt`): workedExample (known) + my scoutsFirst
  verify (kept red). Sweep: we1 (viable, 18 -> 25) and sg1 (viable, 9 -> 11) done 18:01 (exit 1 is normal, as sweep 9).
  Running now (background, sequential, 1 worker): behaviours/nest, ecology/sources, creatures, plants, tests/docs,
  ants top-level -> `sweep-review/vitest-*.txt`.
- Next: `python3 tools/sim/sweep-table.py round-11/sweep round-9/sweep`, bars-from-md.py, leads9.py (copied to
  round-11/sweep-review), then longrun-table.py on sweep-long.
- 18:10 folder tests (1 worker): behaviours/nest 31/33 (red sfaReview.verify, stall.soak: known), ecology/sources 6/12
  files, 12 tests red (same 12 red on 30944ea and on e299de5 = colony-life start: pre-existing, older than this task;
  scratch copy deleted), creatures 34/34, plants 5/5, tests/docs 8/8, ants top-level 4/4. Sweep 4 of 15 done.
- 18:12 tools ready: sweep-table.py works on partial sweep; wrote round-11/sweep-review/sums11.py (sums + per-run leads,
  several dirs). First 4 runs viable, P intake lower than sweep 9 in all four (0.51/0.31/0.35/0.36). Waiting for sweep.
