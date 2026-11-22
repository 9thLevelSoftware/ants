# Progress: independent sweep after colony-life round 10

Started 16:04 UTC Nov 22. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 16:05 UTC: `/home/user/frozen-sweep10` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `465af0d7` = live tree at 16:05 (HEAD 3ea1d69 + uncommitted R37b: predator.ts,
  balance/creatures.ts, sated.test.ts, colonyRangeStrike.test.ts; newest src/sim file colonyRangeStrike.test.ts 16:02).
- Command (started 16:05 UTC, background): `/home/user/frozen-sweep10/run-all.sh` = sweep-life.sh into
  round-10/sweep, then PAR=2 UNTIL_DAY=40 longrun-life.sh into round-10/sweep-long (we:2 sg:2 cpv:1 pp:3 kd:3).
  Restart-safe: re-run it (runs whose JSON exists are skipped).
- Previous sweep table: test-output/colony-life/round-9/sweep-table.md (dir round-9/sweep).
- Delete /home/user/frozen-sweep10 at the end.

## Review findings so far

## Remaining
- sweep, table (tools/sim/sweep-table.py round-10/sweep round-9/sweep), bars, regressions; long runs + longrun-table.py
- review of the round's diff (git diff 30944ea on src/sim + tools/sim), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 10"

## Log
- 16:07 tsc --noEmit clean (`round-10/sweep-review/tsc.txt`).
- 16:10 ecology/creatures folder 32/32 files green (`sweep-review/vitest-creatures.txt`). Colony folder running.
- Review so far (code read: R35 queen/needs/economy/stores/allocation, R37 attack/colonyRange, R37b predator,
  LV1 choice, item 4 tendDraft/leak/dig/sealGuide/startPose.long): rules match directions 22/23/24a as worded;
  no forbidden change seen; state keys persisted (core.acc need.rateForageP, alloc.prospForage; creature bb
  satedUntil/ignoreColony/ignoreUntil). Possible holes being checked: R37b only via startFeed (ant-spider venom
  kill path), playerWorkers() O(ants) per colony-range acquisition.
- Wrote `src/sim/ecology/creatures/sated.verify.test.ts` (behavioural R37b check), not yet run.
- 16:14 colony folder (incl. founding) 74 of 75 files + 4 skipped (`sweep-review/vitest-colony.txt`): red only
  workedExample 0.0659 > 0.05 (base value, known).
- 16:15 new verify tests GREEN (`sweep-review/vitest-verify-creatures.txt`): `creatures/sated.verify.test.ts`
  (resident jumping spider, a lone worker always in reach, 1.6 gd: kills at ticks 18 and 7243, satiation window
  7200, no strike in between); `creatures/colonyRangeStrike.verify.test.ts` (landStrike direct: ramp 0 -> 0 of 40
  colony-range strikes land, resident 40 of 40; ramp 0.2 -> 69 of 400). Finding (test strength): the round's
  colonyRangeStrike.test case 1 passes without R37's landStrike share (R37b refuses first: hit null); the new
  verify file guards the share in landStrike.
- 16:15 running: behaviours/outdoor, behaviours/nest, docs folder tests (one worker, sequential).
- 16:21 behaviours/outdoor 31/32 (red removal.verify, known), behaviours/nest 31/33 + 3 skipped (red
  sfaReview.verify, stall.soak, known), docs 8/8 (`sweep-review/vitest-*.txt`). Now running
  FOUNDRESS_LONG=1 startPose.long.test.ts (not run by the round) -> `sweep-review/startPose-long.txt`.
- 16:22 sweep 4 of 15 done (we1, sg1, pp1, cpv1). First workers equal sweep 9's and arm-final's: the
  fresh foundings reproduce the sweep-9 hand-overs, so sweep 10 vs round-10/arm-final is a pair whose only sim
  difference is R37b (cpv #1 identical on every colony metric; predation 6/1/2 -> 0/0/0 on we1/sg1/pp1).
