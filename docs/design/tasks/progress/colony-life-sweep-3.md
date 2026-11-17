# colony-life independent sweep after round 3 (progress)

Started 10:40 UTC 2026-11-17.

## Sweep
- Frozen copy of the tree at /home/user/frozen-sweep3 (src, tools, configs; node_modules symlinked), made 10:40 UTC.
  Tree hash (src/sim + src/worldgen + src/core *.ts) 2e2c79d2. Delete the copy at the end.
- Command: /home/user/frozen-sweep3/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-3/sweep /home/user/foundress/test-output/viab/cache
  (restart-safe: re-run the same command; runs with a JSON are skipped). sweep-life.sh now cds to its own tree.
- Runs finished: see test-output/colony-life/round-3/sweep/summary.txt.
- Table: python3 tools/sim/sweep-table.py test-output/colony-life/round-3/sweep PREV > test-output/colony-life/round-3/sweep-table.md
  (PREV = previous sweep named in the ledger; check).

## Review findings so far (10:48)
- H2a, H2b, H1m: each round test red without its fix (checked in a scratch copy, scratchpad/nofix; delete at end).
  Reverts (E1, N1/N2, phaseNest) clean: no diff vs e614493 in ants/behaviours/nest, balance/weather.ts.
- NEW RED `src/sim/ants/behaviours/outdoor/huntReturn.verify.test.ts`: H2b with a real `timeout` return (trip clock
  > TRIP_TURN_S): hunt phase is awayFromHome -> tripClock sends it home every think -> flips hunt<->return (3 flips
  in 30 s, longest hunt 5 ticks, 0 hits; control trail-lost: 0 flips, 115 ticks, kill). Bug, keep red.
- NEW GREEN `src/sim/ecology/creatures/preyContact.verify.test.ts`: H2a contact window = no escape roll for any bite
  by any ant for 2 s (GDD per-bite reading would roll each). Documented deviation; minor note for the integrator.
- R21 (ruling 09:20, direction 5, binding) not implemented by round 3; round's own bench: 62 refused prey loads.
- Other engineers' commits since e614493 touch shared sim (difficulty rules: temperature.ts, weather.ts,
  physiology.ts, brood.ts, founding/*): compare first workers with round 2 to see if the founding changed.
- Spec direction 6: this sweep also needs 5 long runs (year 2 day 15), one per archetype, seed viable at winter.

- 11:05 tsc clean; folder tests (outputs round-3/sweep-review/vitest-*.txt): ecology/creatures 18/18 files,
  outdoor 26/28 (red removal.verify known + my huntReturn.verify), nest 26/28+3 skipped (sfaReview.verify, stall.soak
  known), balance 3/3. Sweep 4/15 done (~12 min per pair). Founding identical to round 2 (we #1 16 @3.53, sg #1 12 @3.909).
- Round-2 sweep trip reasons: timeout 79 of 870 trips (stuck 143, source-depleted 40): sizes the H2b timeout defect.
- Long runs: tools/sim/longrun-life.sh (copied into the frozen tree), --until-day 34, out round-3/sweep-long.

## Remaining
- typecheck, folder tests (ecology/creatures, ants/behaviours/outdoor, ants/behaviours/nest, balance), table, bars,
  long runs (after the sweep), ledger section, delete /home/user/frozen-sweep3 and scratchpad/nofix.
