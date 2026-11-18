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

## 04:36 UTC
- Sweep 6 of 15 done. tsc clean 04:22. Folder tests (live tree, `round-6/sweep-review/vitest-*.txt`): colony 64/65
  (red founding/reopen, known), ecology/creatures 30/30, ants/behaviours/outdoor 28/30 (red removal.verify known +
  my storesFullTenders.verify), sim root (heightDeltaRestore, wiring, sim) green.
- Lead under study: in we1, pp1, cpv1 the C stores crash to 0 on days 2-5 after the hand-over (round 5 on the SAME
  hand-over, identical day 0, rose); 0 trips started on day 2 (we1) / days 2-4 (pp1). Probe `probe-wait-we1.txt`:
  no C source known to the colony until gd 6; scouts (probe-scout-we1.txt) explore normally, repeatedly freeze on
  threat 69. A/B running (`round-6/sweep-review/ab/ab.sh`, restart-safe; scratch trees /home/user/scratch-r6-{nosf,
  nop1d,nor28} + cache copies /home/user/scratch-r6-cache): we1, pp1 to game day 7, each fix reverted alone.
- Delete at the end: /home/user/frozen-sweep6, /home/user/scratch-r6-*, scratch-r6-cache.

## 05:01 UTC
- Sweep 12 of 15 (viable: sg1, we2, cpv2, we3).
- A/B result (`round-6/sweep-review/ab/`, abtable.py): the early C crash of we1/pp1 is NOT round 6's code: from the
  sweep-6 hand-over the round-6 tree, each fix reverted alone (nosf/nop1d/nor28), b2809f0 and b2809f0+round-6 all
  give 0 trips on day 2 and C 0 by day 2-3; the round-6 tree from the sweep-5 hand-over (cache 532b26d6, r6h5)
  gives 13 trips on day 2 like sweep 5. Hand-overs differ (RNG streams, human events, carve) though first workers,
  gd and queen reserves are equal: founding-time changes by other engineers move the RNG. Run-by-run regressions vs
  sweep 5 are hand-over noise; read mechanisms and medians.
- Lead: no source known at hand-over in either; C provision lasts ~1 gd; 12 of 18 idle, 2 scouts; whether C is found
  by day 2 decides rationing.
