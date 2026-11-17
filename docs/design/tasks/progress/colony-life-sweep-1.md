# colony-life — independent sweep after round 1 (progress)

Started 02:19 UTC Nov 17. Tree: snapshot 9ccb488 + others' in-flight work (species modules) — each run's tree hash is
in `test-output/colony-life/round-1/sweep/summary.txt`.

## Sweep
- Script: `tools/sim/sweep-life.sh test-output/colony-life/round-1/sweep test-output/viab/cache` (skips runs whose
  JSON exists; restart it the same way to continue). Started 02:19 UTC.
- Runs finished: (see summary.txt)

## Review findings so far (02:35 UTC)
- typecheck clean 02:22. src/sim/ants/behaviours/nest: 25 pass, 2 red (sfaReview.verify, stall.soak) = as claimed
  (output test-output/colony-life/round-1/sweep-review/vitest-beh-nest.txt).
- F1: NEW src/sim/nest/plugBaseline.verify.test.ts RED (kept): a 2 BU spoil ring over 5 ghost plug flags around a
  passable open entrance -> plugCount 0 -> 5 -> `sealing` (no exit field). The round's measured trigger is not fixed;
  F1 only changes the way back (needs workers to dig the count back to the baseline).
- F2: NEW src/sim/ants/behaviours/nest/spoiledHaul.verify.test.ts green (spoiled food reachable, hauled by nanitic).
- F3 diff read: same rescue path as before, care job only when no (dry) chamber to return to. No issue found yet.
- life.ts/lifeFunnel: tool-side observers (events.on + reads), no state writes seen.

## Remains
- table script (tools/sim/sweep-table.py), bars, regressions vs sweep9-table.md
- code review of F1-F3, typecheck, folder tests, *.verify.test.ts
- ledger section "### Independent sweep after round 1"
