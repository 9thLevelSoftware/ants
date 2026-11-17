# threats-live implementation progress

Started 2026-11-17 11:16 UTC. **Finished 14:40 UTC** - report `docs/design/tasks/threats-live-report.md` complete.

## Done (all)
- Causes C1-C6 found with funnel counts (test-output/threats-live/before, placement-only, after1-3) and tests.
- Fixes: colonyRange.ts (+director occupancy/rebalance/settingCull), perception cross edit (sense.ts, logged in
  test-output/threats-live/cross-edits.md), rove beetle by day in litter, ant-spider approach 15, predator-near on a
  landed strike, possessed-danger seized/stuck.
- Tests: colonyRange, predatorDetect (perception), possessedDanger, strikeAlert, huntSaveLoad, predatorsOff.
  Final: typecheck 0 errors; creatures + perception folders 25 files / 171 passed.
- Calibration: gentle 0.01 / naturalist 0.07 / harsh 0.16 deaths per outside-worker-gd; off 0.
- Perf, harness (screenshots looked at), forage benches before/after.
- Scratchpad trees deleted; no background processes left.

## Nothing remaining. If resumed: do not re-run anything; read the report.
