# colony-life — independent sweep after round 1 (progress)

Started 02:19 UTC Nov 17. Tree: snapshot 9ccb488 + others' in-flight work (species modules) — each run's tree hash is
in `test-output/colony-life/round-1/sweep/summary.txt`.

## Sweep
- Script: `tools/sim/sweep-life.sh test-output/colony-life/round-1/sweep test-output/viab/cache` (skips runs whose
  JSON exists; restart it the same way to continue). Started 02:19 UTC.
- Runs finished: see summary.txt (10 of 15 at 03:19)

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

## 03:40 UTC — sweep DONE (15/15), A/B running (sweep-ab/, kd1 + cpv1 without F1-F3)
- Table body: test-output/colony-life/round-1/sweep-table.body.md (from tools/sim/sweep-table.py). Viable 9/15
  (sg 1/3, pp 1/3 -> bar NOT met). R19 3 of 7 (C 1.258 ok, first>=9 13/15 ok, no lost 14/15 ok; held 5/15, eclosions
  median 0, P 0.094, trip success 18.2 %). 12 runs flagged vs sweep 9 (mostly P intake down; sg2, pp2 viable -> not on
  P starvation stage while GROWING; pp3 C collapse, scouts find nothing).
- Leads: P sources <=300 BU known 0 at end in 13/15 runs; 316 scout trips found nothing; seed 3: 0 of 43 eggs
  hatched in 4 of 5 runs (untended/flooding/exposure, one-chamber nests).
- Remaining: A/B result, write sweep-table.md (header + body), ledger section, delete scratch nofix, final output.

## 03:45 UTC — COMPLETE
- A/B done (sweep-ab/): P lower with F1-F3 in both pairs (kd1 0.113 -> 0.065, cpv1 0.315 -> 0.078) but n=2 diverging
  runs; not attributed. Scratch tree nofix deleted.
- Ledger section "### Independent sweep after round 1" appended. sweep-table.md written. No processes left.
