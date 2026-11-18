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

## 07:59 UTC
- Sweep 14 of 15 (kd #3 running). Hand-overs are byte-identical to sweep 6's (`cmp` against round-7/cache): the
  sweep against sweep 6 is a paired comparison on the same hand-overs (round-6 tree vs round-7 tree, both in-process),
  so the 30-run direction-13 pairing is not run separately (decision; see ledger). 10 of the first 10 runs: same
  workers, eclosions, intakes, every day sample equal (`sweep-review/daydiff.py`); final hash equal in 4, differs in
  6 (a state detail that never reaches the day samples, e.g. mound shapes after RM).
- Verify tests written: `ants/behaviours/outdoor/storesFullRelease.verify.test.ts` (2 cases, green: held tenders
  leave once room opens; save/load while held equal over 600 ticks), `nest/flood/readersRestore.verify.test.ts`
  (RED, kept: running game reads 3798 spill samples, loaded game 3968 right after a carve in a wet nest).
- Lead: queen-care 0.11-0.17 of worker task time vs nurse 0.04-0.18 (GDD 02 §6.2 queen-care demand 2 fixed; §6.3
  pass 1 gives every task ceil(0.5 D) first).
- Remaining: kd #3, table, bars (two scripts), ledger section, delete /home/user/frozen-sweep7 and
  /home/user/scratch-r7rev-c97 (copy probe sources to sweep-review/*.ts.txt first).

## 08:10 UTC — done
- Sweep 15/15 (tree 44ff6ee0), table `test-output/colony-life/round-7/sweep-table.md`; bars by both scripts: viability
  NOT met 4/15 (we 2, sg 1, pp 0, cpv 1, kd 0); R19 4 of 7. 14 of 15 hand-overs = sweep 6's; 13 runs identical in every
  day sample; regression flagged only pp #3 (changed hand-over).
- Ledger section "### Independent sweep after round 7" written. Scratch trees deleted (probe sources kept in
  sweep-review/*.ts.txt; restored-run cache copy deleted); no process running.
