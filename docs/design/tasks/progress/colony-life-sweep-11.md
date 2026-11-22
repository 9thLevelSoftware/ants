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
- 18:39 sweep 12 of 15 done (all viable except we #2: 8 -> 6, 2 crushed, as the round's arm); pp3, cpv3, kd3 left.
- 18:50 **sweep done** (17:54-18:49, all 15 on be38bf9e). Table round-11/sweep-table.md (sweep-table.py vs round-9/sweep);
  bars-from-md.txt: viability MET 14/15 (we 2/3), R19 6/7 (P 0.353 fails). sums.txt (sweep, sweep 9, arm-final11,
  round-10 arm-final). Long runs: restarted run-all.sh at 18:50 (killed the first one 1 min into the long runs: its
  background limit of 2 h would have cut them; sweep part skipped, re-run adds "skipped" lines to sweep/summary.txt).
- 18:54 Findings so far: (1) per-tick cost trap: behaviours system 0.25 -> 0.63-0.70 ms/tick median (round-10 arm-final
  -> arm-final11 / sweep, sweep-review/cost.txt); CPU profile kd #1 --perf 3000 (scratchpad): noticeOutside 69 % of
  runBehaviour, almost all in sourcesSmelledFrom -> lookup.ts grid build (rebuilt once per tick on first query; now
  queried nearly every tick). New verify test outdoor/noticeCost.verify.test.ts RED (kept): 2000 checks 1186 ms on new
  ticks vs 16 ms on one tick. (2) scoutsFirst minor (red). (3) sweep reproduces arm-final11 exactly on we2, sg2, cpv2,
  cpv3, kd3 (sweep-vs-arm.txt); kd #2 diverges (P 0.318 arm -> 0.052 fresh: smelled carrion 6, discovered 1).
  (4) P delivered 176 (sw9) -> 137; forage wgd 655 -> 516, tend 402 -> 520, scout 150 -> 242 (protein11.txt).
  Long runs running since 18:50.
- 19:05 long runs: we2, sg2 in year two; review of failing runs' leads in progress (we #2: 120 P large carcass never known; kd #2: carrion smelled by scouts 6x, found 1).
- 19:25 long runs: we2, sg2, cpv1 done; pp3, kd3 running. we #2 collapses in year two (3 at doy 15, 3 at winter 2).
- 19:36 long runs done 19:34 (longrun-table.md, long-detail.txt): spring 5/5, R34 2/5 and 0/5, R24 met. Ledger section
  "### Independent sweep after round 11" written. Scratch trees deleted, no process left. DONE.
