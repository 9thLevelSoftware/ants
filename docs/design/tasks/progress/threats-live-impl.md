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
- BEFORE funnel DONE (5 archetypes x 6 gd naturalist, round-3 snapshots): every stage 0 for every kind on all 5;
  nearest hunting territory 511-1604 BU from entrance, worker range p90 99-221 BU. test-output/threats-live/before/.
- Tests green: creatures folder (21 files), colonyRange/possessedDanger/predatorDetect, perception folder, combat predators.
- Running (scratchpad/after1.sh, background): placement-only tree 2 archetypes x 3 gd -> test-output/threats-live/placement-only,
  then scratchpad/fix2-tree (frozen copy of main tree with placement + perception fixes) 5 x 6 gd -> test-output/threats-live/after1.
  Main tree can be edited meanwhile (runs use the frozen copies).

- placement-only DONE (test-output/threats-live/placement-only, 3 gd): woodland JS sense 1382 s, select 26, 1 telegraph,
  1 strike, 1 hit, 1 kill; approaches end in 'recover' (ant out of range); ants perceived predators BEYOND GDD
  detection 179 s vs within 18 s (perception cause confirmed); wolf sense 4 s; rove/centipede sense 0 (night only).
- Fix 3 (main tree, after fix2-tree copy was frozen): rove beetle also active by day in litter zones (GDD 05 §2.2a
  "dusk/night; day in litter"): conditions.roveBeetleActive, ROVE_DAY_ZONES, director.visitorActive, hunters.ts.
- Observer: outsideByPhaseS added (after fix2-tree copy). huntSaveLoad.test.ts written (not run yet).

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
