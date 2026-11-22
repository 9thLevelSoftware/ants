# Progress: independent sweep after colony-life round 8

Started 05:57 UTC Nov 22. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 05:58 UTC: `/home/user/frozen-sweep8` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `edfbf82a` = live tree at 05:58 (src/sim equal to HEAD 2a8b227; newest src/sim file
  combat/hits.ts etc. Nov 18 10:40-10:47; tools/sim/longrun-life.sh 05:11 Nov 22).
- Command (started 05:58 UTC, nohup):
  `/home/user/frozen-sweep8/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-8/sweep /home/user/foundress/test-output/viab/cache`
  (restart-safe: skips runs whose JSON exists; summary.txt has tree hash per run).
- If cut off: re-run the same command (frozen copy survives on disk); then the five long runs from the same copy:
  `PAR=2 UNTIL_DAY=40 /home/user/frozen-sweep8/tools/sim/longrun-life.sh /home/user/foundress/test-output/colony-life/round-8/sweep-long /home/user/foundress/test-output/viab/cache "woodland-edge:2 suburban-garden:2 car-park-verge:1 playground-park:3 kitchen-door:3"`
  Delete /home/user/frozen-sweep8 at the end.
- Previous sweep table: test-output/colony-life/round-7/sweep-table.md.

## Review findings so far
- 06:08 Round-start commit = 8f72185 (src hash 44ff6ee0 = sweep-7 tree). Round code = `git diff 8f72185 HEAD` on
  src/sim (HEAD src/sim = live). tsc clean (`round-8/sweep-review/tsc.txt`). Folder tests: combat 13/13, nest/flood
  12/12 (+1 skipped), colony 67/69 (red founding/reopen, workedExample: known).
- Round tests on 8f72185 with the tests copied in (`sweep-review/vitest-roundtests-on-8f72185.txt`, scratch
  /home/user/scratch-r8start, delete at end): 18 of 21 cases red (assertions or the missing new export).
- workedExample red explained: with the care factor forced to 1 (scratch, deleted) it passes; larval C per larva is
  identical (0.909 both); the difference is larvae count 4.55 -> 4.67 (RNG trajectory), and the base already sits at
  3.7 % of the 5 % bound. Noise-limited test (10 seeds), not a rule change.
- F1 cost: new test `src/sim/nest/flood/readersCost.verify.test.ts` RED (kept): 300 ticks, carve every 10 ticks in a
  wet nest, one reader a tick: 30 buildSpill vs 6 for the throttled model (allows 7); 2.5 ms per build on the small
  test nest. Check locomotion / nest-flood ms in sweep 8 vs sweep 7.
- 06:15 Folder tests: outdoor 30/31 (red removal.verify, known), species/data 4/4, docs-final 8/8.
- R30 item not done: `balance/colony.ts DIAG_MORTALITY_REF_LIFESPAN_GD` still 26 (direction 15 says re-derive by
  measurement; ledger 09:18 derives realised ~36-39 gd under R30, "re-derived when the r30 arm is complete" - not done).
- FD1 does not fix the browser founding failure (direction 20.1: still fails after FD1); round's cause 6 says "Fixed".
- HB1 covers every hunt target (hunt.ts hunts springtail and mite only), so no multi-bite hunt left with the
  self-alarm flight. Restated fixtures (lossCap per WL4, physiology/table per R30, hunt crop filter) are ruling-driven.
- WL4 / R29c / FD1 read persisted state only (noticeTick in lifecycle, cen.* in acc, col.alloc in state): no
  determinism trap found by reading.

## Remaining
- sweep, table, bars, regressions; long runs + longrun-table.py
- review of the round's diff, tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 8"
- 06:22 Sweep 6 of 15 done (we1 NO, sg1 yes, cpv1 yes, pp1 NO, kd1 NO, we2 yes). Hand-overs NOT byte-equal to
  sweep 7's (R30 changes the founding's nanitic draws), first workers equal so far. worker:lost jumped: we #1 3,
  pp #1 6 (days 8-11 autumn; sweep 7 had 2 in all). Probe written: /home/user/frozen-sweep8/tools/sim/probe/probe-lost8.ts
  (logs each lost worker's last trip); run on pp #1 cached hand-over (test-output/viab/cache/*-40bc6741.bin) after
  the sweep (life-run slots).
- 07:05 SWEEP DONE 15/15 (tree edfbf82a, 05:58-06:55). Table `round-8/sweep-table.md` (sweep-table.py vs round-7/sweep);
  second script `sweep-review/bars-from-md.txt`: viability NOT met 9/15 (we 2, sg 2, pp 1, cpv 3, kd 1); R19 4 of 7
  (held 12 ok, ecl median 5 ok, P 0.269 FAIL, C 1.162 ok, trip 45.9 % FAIL, first>=9 14 ok, no-lost 12 FAIL).
  Sums vs sweep 7: winter 138 -> 194, eclosions 65 -> 60, old age 64 -> 1, lost 2 -> 10, predation 14 -> 14, starved 13 -> 1.
- pp #1 lost probe (`sweep-review/probe-lost-pp1.txt`, restore reproduces the sweep's deaths exactly): all 6 lost
  foragers end at one point (~920, -11, 3593 BU), 82.5 BU from the entrance, forage.return home-mode 2, jittering in
  place 1000+ s until RETURN_LOST_S. A homeward trap, not distance.
- sg #3 (0 trips all year): probe `probe-idle-sg3.txt`: entrance status `open` but plugVoxelCount 29 after the
  hand-over reopen; scout depart nav fails `leg` every hour; foragers wait (no source known). = the known red
  `founding/reopen.test` (plug soil left in the throat) met in a sweep run.
- F1 cost in the sweep: flee-water ms/tick median 0.014 -> 0.055 (x4), nest-flood 0.084 -> 0.042, total 4.05 -> 4.34.
- Next: we #1 lost probe running; then the five long runs (PAR=2, UNTIL_DAY=40) from the frozen copy.
- 07:26 long runs: we #2, sg #2 done (sweep-long/); cpv #1, pp #3 running, kd #3 next. Then longrun-table.py + round-8/long-final/table.py (copied), ledger.
