# Progress: independent sweep after colony-life round 9

Started 11:50 UTC Nov 22. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 11:50 UTC: `/home/user/frozen-sweep9` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `6b9881e1` = live tree at 11:50 (src equal to HEAD a642e00; newest src/sim file
  founding/sealBelowThroat.test.ts 11:19, founding/dig.ts 11:14).
- Command (started 11:50 UTC): `/home/user/frozen-sweep9/run-all.sh` = sweep-life.sh into round-9/sweep, then
  PAR=2 UNTIL_DAY=40 longrun-life.sh into round-9/sweep-long (we:2 sg:2 cpv:1 pp:3 kd:3). Restart-safe: re-run it.
- Previous sweep table: test-output/colony-life/round-8/sweep-table.md.
- Delete /home/user/frozen-sweep9 at the end.

## Review findings so far

## Remaining
- sweep, table, bars, regressions; long runs + longrun-table.py
- review of the round's diff, tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 9"

## Log
- 11:56 tsc clean (`round-9/sweep-review/tsc.txt`); founding folder 24 files green / 3 skipped, 79 tests (`vitest-founding.txt`).
- R35 (direction 22, 11:41) is NOT in the tree (no PROSPECTIVE_P_PER_WORKER in src); round closed 11:49 without it.
- New verify test RED (kept): `src/sim/ants/behaviours/nest/tendDraft.verify.test.ts` case 1: nearest draftable
  worker that cannot nurse (Atta major, nurse weight 0) is given the pile, requestTask refuses, nobody else drafted.
  Control case green.
- New verify test RED (kept): `src/sim/colony/founding/sealLongShaft.verify.test.ts` case 1: an open shaft at 15 deg
  (12 BU deep, way to the air > SEAL_FLOOD_RADIUS_BU 40) reads sealed and goes to `lay` with SG3; green on a scratch
  tree with dig.ts of dd966f1 (`/home/user/scratch-sweep9-nosg3`, delete at end).
- Minor: new Math.hypot in sealGuide.ts backTick (SG1) against the no-Math.hypot rule (file already uses it widely).
- 12:15 folder tests (VITEST_MAX_WORKERS=1, `round-9/sweep-review/vitest-*.txt`): colony w/o founding 49/50 + 1 skipped
  (red workedExample, known); nest 58/61 (red escapeDig known, readersCost.verify kept, architect/layout.test perf
  under load 57-70 ms > 50, untouched by the round); locomotion 25/25 (+1 skipped); behaviours/nest 29/32 (red
  sfaReview.verify, stall.soak known; my tendDraft.verify case 1); behaviours/outdoor 30/31 (removal.verify known);
  docs-final 8/8.
- Round tests on pre-fix code (scratch, files of dd966f1 swapped in): reopenPlugLeft, ladderJitter, sealBackStall x2,
  founding/reopen.test all red -> claims hold.
- New guard (GREEN): `behaviours/nest/tendDraftSave.verify.test.ts`: save->load mid-window / window start while piles
  are overdue: hash equal after 4 windows, drafts happened.
- Finding: startPose.long.test's Fair bar is "all but one per archetype" over 1-3 Fair starts (kd 0 of 1 passes);
  it was green on the 09:20/10:08 trees that failed 3 of 25 at the seal -> it does not guard SG1-SG3. Poor floor 60 %
  vs the 86 % the test itself derives.
- Sweep 6/15 at 12:09.
- 12:22 sweep 10/15 done; leads script round-9/sweep-review/leads9.py (checked on sweep 8: matches its ledger sums).
- 12:40 SWEEP DONE 15/15 (tree 6b9881e1, 11:50-12:40). Table `round-9/sweep-table.md` (sweep-table.py vs round-8/sweep);
  second script `sweep-review/bars-from-md.txt`: viability NOT met 9/15 (we 1, sg 2, pp 2, cpv 3, kd 1); R19 6 of 7
  (only P 0.478 fails; trip 56.8 % ok, lost 13/15 ok). Sums vs sweep 8 (`sweep-review/sums.txt`): winter 194 -> 208,
  eclosions 60 -> 100, predation 14 -> 41, lost 10 -> 5, crushed 9 -> 13. Brood: untended 80 -> 6, hygiene 9 -> 41,
  exposure 6 -> 25. 4 of 6 non-viable fail R27 carbohydrate stores while holding P (we1, we3, sg3, pp3) = R35's case;
  kd1/kd2 starvation stage with P intake 0.125/0.025. Leads: `sweep-review/leads9.txt`.
- 12:40 long runs started (sweep-long), we2 + sg2 first.
