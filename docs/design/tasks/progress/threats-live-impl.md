# threats-live implementation progress

Started 2026-11-17 11:16 UTC (no earlier progress file existed).

## Done
- Read seed, architecture, contracts guidance, tech-stack, GDD 05 §2/§5/§6/App E, STATUS rulings, creature module.
- Tool `tools/sim/threatFunnel.ts` (observer, no behaviour change): per-kind funnel, territories with distance to
  entrance, worker range, bird gate, antlion crossings. Options --archetype --seed --days --preset --rules --out --tag.
- Probe 0.5 gd woodland-edge #1: nearest predator territory to the nest: jumping 2975 BU, wolf 1604, centipede 2424,
  rove 2156; no ant-spider / antlion territories. Ants forage within a few hundred BU -> predators never sense ants.

- Fix 1 written (not yet measured): src/sim/ecology/creatures/colonyRange.ts (director sites 1 territory per hunting
  kind with habitat in ring COLONY_RANGE_BU [60,170] around the player's first entrance after hand-over; occupancy
  nearest-colony-first + rebalance of far residents) + director.ts wiring + balance constants (creatures.ts tail).
  Test src/sim/ecology/creatures/colonyRange.test.ts (not yet run).
- predatorPerceivedBy() added to queries.ts (GDD 05 §2.4 detection 4 L x stealth) for the ant-side cross edit
  (src/sim/ants/perception/sense.ts threats(): currently flees ANY creature predator within 6 BU incl. hidden/dormant,
  antlions). Cross edit NOT applied yet: first count it in the after-placement funnel (observer antThreatS).
- "Before" code tree copy for before-runs: scratchpad/before-tree (HEAD versions of director.ts, balance/creatures.ts).
  woodland-edge + suburban-garden before runs used the main tree before my edits (started 11:22 / 11:25:39).

- Cross edit APPLIED in main tree: src/sim/ants/perception/sense.ts threats() uses predatorPerceivedBy; test
  src/sim/ants/perception/predatorDetect.test.ts (not yet run); logged in test-output/threats-live/cross-edits.md.
  scratchpad/placement-tree = main tree copy WITH placement fix, WITHOUT the sense.ts edit (for the counted repro).
- possessed-danger 'seized'/'stuck' alert: alerts.ts possessedDangerAlerts (called per tick from system.ts);
  test possessedDanger.test.ts (not yet run).

## In progress
- after3 DONE = FINAL naturalist (fix4-tree = main tree sim code): 7 kills / 103.6 owgd = 0.07 per owgd (0.28 per 100
  owh); strikes on worlds: wolf 4/5, ant-spider 2/5, rove 1/5, JS 0/5 (sense 4/5, select 3/5; stalk 8 mm/s cannot
  close on cruising ants), centipede 0/5 (habitat on 2/5; struck in after2), antlion: no pits on any of the 5.
- Running (13:10 UTC): scratchpad/presets.sh (fix4-tree): final-gentle, final-harsh (6 gd), final-off (3 gd) under
  test-output/threats-live/. Then: harness (test-output/threats-live/harness/threat-shots.mjs), perf (scratchpad/perf.sh
  before-tree vs main), benches (scratchpad/bench.sh forage before-tree vs main -> test-output/threats-live/bench-*).
- Report draft: docs/design/tasks/threats-live-report.md sections 1-3 written (causes, fixes, funnel after, design
  target derivation 0.061/owgd band 0.03-0.12). README of creatures updated. tables-naturalist.md written.

## Findings so far
- Cause candidate 1: territory placement (worldgen populate/territories.ts byArea: random cells over the whole zone,
  cap 4) puts residents kilometres (in BU) from the colony.
- Cause candidate 2: wind-up gate windupMaxTargetSpeed (hit radius / lead = 6.7 mm/s jumping spider) vs Lasius cruise 24 mm/s.
- Bird needs >= 30 workers (GDD 2.6): zero birds for 12-16 worker colonies is by design.
- Design loss band (derived): GDD 02 AGE_RATE_OUTSIDE 3 "x5 hazard approximated by wear plus real predation" ->
  predation ~2/33 = 0.06 deaths per outside-worker-gd (0.25 per 100 outside-worker-hours). Research ecology 7: spider
  hunts 3-6 per gd per area at dusk.

## Remaining (spec order)
2. Causes + failing tests. 3. Fixes. 4. Calibration 3 presets + off. 5. Colony before/after.
6. Player side + harness screenshots. Report docs/design/tasks/threats-live-report.md.
