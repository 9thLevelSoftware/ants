# colony-life — independent sweep after round 1 (progress)

Started 02:19 UTC Nov 17. Tree: snapshot 9ccb488 + others' in-flight work (species modules) — each run's tree hash is
in `test-output/colony-life/round-1/sweep/summary.txt`.

## Sweep
- Script: `tools/sim/sweep-life.sh test-output/colony-life/round-1/sweep test-output/viab/cache` (skips runs whose
  JSON exists; restart it the same way to continue). Started 02:19 UTC.
- Runs finished: see summary.txt (5 of 15 at 02:54)

## Review findings so far (updated 02:45 UTC)
- typecheck clean 02:22. src/sim/ants/behaviours/nest: 25 pass, 2 red (sfaReview.verify, stall.soak) = as claimed
  (output test-output/colony-life/round-1/sweep-review/vitest-beh-nest.txt).
- F1: NEW src/sim/nest/plugBaseline.verify.test.ts RED (kept): a 2 BU spoil ring over 5 ghost plug flags around a
  passable open entrance -> plugCount 0 -> 5 -> `sealing` (no exit field). The round's measured trigger is not fixed;
  F1 only changes the way back (needs workers to dig the count back to the baseline).
- F2: NEW src/sim/ants/behaviours/nest/spoiledHaul.verify.test.ts green (spoiled food reachable, hauled by nanitic).
- F3 diff read: same rescue path as before, care job only when no (dry) chamber to return to. No issue found yet.
- life.ts/lifeFunnel: tool-side observers (events.on + reads), no state writes seen. MINOR: FoundingObserver never
  stops listening, so `foundingFunnel` (md "Founding funnel") includes colony-life losses (we1: crushed 2, old-age 4).
- folder tests 02:31-02:40: nest 52 pass + escapeDig red + my plugBaseline.verify red; colony 51 pass + reopen.test red;
  balance+types ids.test red (38 vs 37). All as claimed. Outputs in test-output/colony-life/round-1/sweep-review/.
- tests vs round-start tree e299de5 (scratch copy, deleted): plugsReopen F1 case, boardStranded, wasteHaul (haul part,
  bulk refs stubbed) and my spoiledHaul.verify all RED there -> the round's tests do test the fixes.
- round's hash claims verified (after1 == after1-check). Sweep woodland-edge #1 (fresh founding) final hash ef574626
  == round's after1: fresh founding reproduces the cached hand-over.
- table script: tools/sim/sweep-table.py SWEEP [PREV] (bars, compare, regressions).

## Remains
- table script (tools/sim/sweep-table.py), bars, regressions vs sweep9-table.md
- code review of F1-F3, typecheck, folder tests, *.verify.test.ts
- ledger section "### Independent sweep after round 1"

## 02:58 UTC
- 5 of 15 done. Pattern so far: C intake up a lot (deliveries from day 1; sweep 9 had none before day 3), P intake
  down in 3 of 5 (kd1 0.27 -> 0.07, carrion deliveries 15 -> 0). 0 eclosions in all 5.
- Planned A/B after the sweep: scratch tree = working tree minus F1-F3 at
  /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/nofix (DELETE when done), run
  kitchen-door #1 (+ car-park-verge #1) there, out test-output/colony-life/round-1/sweep-ab/, to attribute the P drop.
