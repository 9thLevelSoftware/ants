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

## 07:44 UTC
- Sweep: 8 of 15 done (we1 NO, sg1 yes, cpv1 NO, pp1 NO, we2 yes, kd1 NO, sg2 NO, pp2 NO), all tree 44ff6ee0.
  The sweep is a Bash background job of this session; if the session died, re-run the command above.
- Review outputs: `test-output/colony-life/round-7/sweep-review/`. tsc clean (07:13). Folder tests (live tree = 44ff6ee0):
  nest 57/58 (red escapeDig, known), outdoor 29/30 (red removal.verify, known), environment/human + time.test + world
  21/21, sim root 21/22 (red services.test diggability, carpenter's), colony 64/65 (red founding/reopen, known),
  ants/behaviours/nest 28/30 (red sfaReview.verify, stall.soak: known, red on 948fb75 too); worldgen tests importing
  createGame 4/5 (red maps.verify E5 Camponotus door: red on c970361 too, not round 7's).
- Every new/restated test of the round is red on c970361 (round start) with the test copied in: 6 of 6 cases
  (scratch `/home/user/scratch-r7rev-c97`, delete at the end).
- Code read: RM (moundRelax + groundDelta), SF3 (tendHerd), seams (schedule, createGame, sim.ts). Sound; m.base is
  the static terrain, so base + groundDeltaAt is the pressed ground (no double count).
- Restore probe on the fresh sweep-7 pp #1 hand-over (`probe-restore-pp1.txt`): 6 of 6 splits equal at +600 ticks,
  but split 30024 differed at +40 and healed. Cause found (`probe-restore-diff*-pp1.txt`, `probe-spill*-pp1.txt`):
  flood readers (`nest/flood/runtime.ts spillForReaders`) read the last built spill cache in a live game but build
  the current geometry in a loaded one; between a carve and the next rebuild slot of a wet nest they differ (710 vs
  714 samples); clearing the live caches at the split removes the difference. Pre-existing (not round 7), lead.
- Probes in /home/user/frozen-sweep7/tools/sim/probe/ (copy sources to sweep-review as .ts.txt before deleting).
