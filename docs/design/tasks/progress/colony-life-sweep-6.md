# Progress: independent sweep after colony-life round 6

Started 04:03 UTC Nov 18. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 04:03 UTC: `/home/user/frozen-sweep6` (src, tools, configs; node_modules symlinked).
  src/sim+worldgen+core hash `7d9f0409` = live tree at 04:03 (newest src/sim files: other engineers' verify tests
  progression/discovery, rivals/prepare, save/foundingPhases, 03:59-04:01).
- Command (started 04:03 UTC): `/home/user/frozen-sweep6/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-6/sweep /home/user/foundress/test-output/viab/cache`
  (restart-safe: skips runs whose JSON exists; summary.txt has tree hash per run).
- If cut off: re-run the same command (frozen copy survives on disk); delete /home/user/frozen-sweep6 at the end.
- Previous sweep table: test-output/colony-life/round-5/sweep-table.md (dir round-5/sweep).

## Review findings so far

## Remaining
- sweep, table (tools/sim/sweep-table.py round-6/sweep round-5/sweep), bars, regressions
- review of the round's diff (git diff b2809f0 on the round-6 files), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 6"

## 04:24 UTC
- Sweep: 4 of 15 done (we1 NO, sg1 yes, pp1 NO, cpv1 NO), all tree 7d9f0409. Sweep job is a Bash background job of
  this session; if the session died, re-run the command above (skips finished runs).
- Review of the round's diff (`git diff b2809f0` on the ledger's round-6 files) read: P1d, RS, WL3, R28, SF.
- FINDING (SF, verify RED kept): `src/sim/ants/behaviours/outdoor/storesFullTenders.verify.test.ts`: room for 1.5
  crops, 6 tenders depart within 9 ticks: `tendersOut` counts only tenders with nestId < 0, not tenders already
  walking up the tunnel.
- FINDING (RS incomplete, determinism, verify RED kept): `src/sim/nest/moundMaskFootprint.verify.test.ts`: the mound
  mask cache (nest runtime) is not dropped when a footprint presses the ground on the grid; footprints deeper than
  MOUND_HOLE_PROBE_DEPTH_BU read as holes in a fresh build. pp3 cached hand-over: state hash differs 21-141 ticks after
  every one of 8 loads (`round-6/probe-restore-review-pp3.txt`); we1 cache: 6 splits x 300 ticks equal. First diff =
  mound 4060 relaxation; its cached mask 744 hole cells vs fresh 782.
- Probes live in /home/user/frozen-sweep6/tools/sim/probe/ (deleted with the frozen copy at the end).
- Remaining: rest of sweep, table, bars, regressions, tsc + folder tests (colony, ecology/creatures,
  ants/behaviours/outdoor, nest, sim root, overwinter), ledger section.
