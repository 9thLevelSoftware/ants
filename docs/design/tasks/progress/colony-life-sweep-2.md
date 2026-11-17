# Progress: independent sweep after colony-life round 2

Started 05:08 UTC (2026-11-17). Fresh start (no earlier progress file).

## Sweep
- Command: `nohup tools/sim/sweep-life.sh test-output/colony-life/round-2/sweep test-output/viab/cache &` (restart-safe: skips
  runs whose JSON exists; summary.txt records the tree hash per run). Started 05:08.
- If cut off: `ps aux | grep life.ts`; if none of ours runs, re-run the same command (finished runs are kept if their
  tree hash in summary.txt matches; only Messor/granary files of other engineers changed at the start).
- Table: `python3 tools/sim/sweep-table.py test-output/colony-life/round-2/sweep test-output/colony-life/round-1/sweep > test-output/colony-life/round-2/sweep-table.md`
  (previous sweep = round-1/sweep, as the ledger says). Script columns = sweep9 + first workers + worker:lost.
- Runs finished: see test-output/colony-life/round-2/sweep/summary.txt

## Review findings so far (05:15)
- H1 (minor, accounting + credit): prey caught on a trip to a known source is booked as that source's kind and credited
  to the source (noteKind reads K.src). Test `src/sim/ants/behaviours/outdoor/huntSourceTrip.verify.test.ts` RED
  (delivery "nectar c0 p0.25 src32"). Output test-output/colony-life/round-2/sweep-review/vitest-huntSourceTrip.txt.
- Checked, no finding: endChase after a source search restarts the search at the patch centre (seen: centre moved
  120 BU) but the forager still found its source; test deleted (inconclusive).
- G1, C1, B1, S1, H1b read; no finding yet. S1 bound = 220 - 12 = 208 BU.

## Remains
- typecheck; folder tests outdoor, nest, colony, combat, types+balance (one at a time)
- table, bars, regressions, ledger section
