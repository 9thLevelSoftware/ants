# species-carpenter implementation progress

## Session 3 (started 01:56 UTC Nov 17)
State found (sessions 1-2 left no progress file):
- Done, tests green (6 files, 32 pass, 1 LONG-skipped; typecheck clean in my paths at 01:57):
  src/sim/species/modules/wood/** : woodState, moisture (MC/decay), biteRule (bite factors, cross grain, caste factor,
  MIN_WALL, MAX_CARVED), woodCell (chew cells), frass (pile units, visibility, windows, carved frac), sites,
  satellites (proposal, foundSatellite, shuttle rule, queen move), shuttle (nurse behaviour shuttle trip), castes
  (age-gated polymorphism, nanitic lifespans), broodMoisture (hazard, DRY_BONUS), drum, activity, diagnostics,
  invariants, hooks (dig-bite rules, nest depth rule, drum action). Tests: wood/brood/drum/founding/shuttle/activity.test.ts.
  src/sim/colony/founding/species/camponotus.ts, src/sim/balance/species-carpenter.ts.
- App. E 13 measured 11 of 20 pupae in 1 GD (test floor 10, LONG only) -> partial, reported.
- Life runs (01:31-01:45, test-output/carp/life/): woodland-edge 2/3 viable (we1 yes 12->10, we2 yes 12->10,
  we3 NO 10->7 old-age+crushed, 0 trips); kitchen-door 1/3 (kd1 NO 8 minors drowned d9-11; kd2 yes; kd3 NO crushed 3
  + lost 2). 0 eclosions after hand-over in all = biology (late-summer eggs overwinter as larvae, GDD 07 5.2.2).
  First workers 12 on 4 runs vs chapter 6-11.
- e2e tests/e2e/species-carpenter.mjs written; last run (01:48) got shots 01, 02 then SIGTERM (restart).
- Probes tools/sim/probe-carp-{death,night}.ts exist: DELETE before finishing.

## In progress now
- (02:00) investigating kd1 drowning + kd3 deaths; then e2e run; night numbers; soak.
- (02:12) e2e run r3 started 01:59 (test-output/species-carpenter/r3/), reached hand-over (12 minors, log-on-soil
  mc 28 decay 2); waiting for shots 01-04.
- (02:12) NEW src/sim/species/modules/wood/satellite.test.ts (architect rule 149 vs 150 workers, satelliteAuto,
  marker) - not yet run (harness running).
- Findings: kd1 drowning = 8 minors in the wood cavity (flee.run, nest flood). Flood inflow (src/sim/nest/flood/
  inflow.ts, not mine) uses ground-ring catchment at a log's side window as if it were a hole in the ground.
  Queen relocation: proposal only (col.wood.queenMove), no execution of the walk -> report as partial.
- (02:18) DONE words: src/content/text/words.ts additions (13 factor causes, 2 remedies, 5 diag values for wood);
  wood diagnostics cause 'season' renamed 'wood-drying' (collided with Lasius 'Laying season').
- (02:20) e2e r3 PASSED exit 0 but shot 04 shows no pile (1 loose frass; loop stopped at first loose item). Shots
  01 (log+opening), 02 (gallery inside wood, possessed minor + media + major), 03 (cutaway, weak) looked at.
  Changed e2e: frass loop now waits for a pile >= 1 unit (FRASS_STEPS 240), expect requires a pile.
- (02:20) satellite.test.ts green; wood+text tests 11 files 83 pass.
- Next: death probe kd1 (drowning), then e2e r4, then soak 28 d, night probe numbers, report.
- (02:24) death probe kd1 on current tree: no drowning any more (nest moved: log at y 40 mm, ground -17); deaths
  lost 1 (d9.4) + old-age 1. Drowning not reproduced -> not pursued.
- (02:25) RUNNING viability sweep test-output/carp/sweep2/run.sh (we + kd seeds 1-3, 2 at a time; done.txt lists
  finished runs). If cut off: rerun only missing runs.
- (02:20) sweep2 round 1: we1 viable (12->?; 0 trips), kd1 NOT (lost 3 + old-age 1; scouts 0 % trips:
  "scout timeout/curfew not-reached" = forage AI, not mine). e2e edited: media+major teleported ahead of the
  possessed minor for the castes shot (not yet run).
- (02:45) sweep2 DONE (test-output/carp/sweep2/): woodland-edge 3/3 viable (12->12, 12->11, 10->8), kitchen-door 1/3
  (kd1 lost 3 + old-age, scouts never reach food; kd2 yes 12->11; kd3 crushed 3 + lost 2). we3 3 invariant
  violations walker-stall (hauler haul.carry, loco). 0 eclosions (biology: late-summer eggs overwinter).
- (02:46) RUNNING suburban-garden seeds 1-3 (test-output/carp/sweep3/) as candidate second archetype.
- (03:00) sweep3 suburban-garden: sg1 NO (crushed 2, low C), sg2 yes, sg3 yes -> 2/3. Viability bar met on
  woodland-edge (3/3) + suburban-garden (2/3); kitchen-door 1/3 reported.
- (03:00) night probe we2 (test-output/carp/sweep3/night-we2.txt): ants OUTSIDE flat 2-3.75 at every hour (no night
  concentration in presence). Extended probe with departures/hour + tasks outside; rerunning (night-we2b.txt).
- (03:10) night probes done: night-we2b.txt (no forager departures in 3 d; outside = haul/dig at entrance + stuck
  scouts, flat over the day), night-we2-hungry.txt (stores 0.3/0.1 + 30 spawned minors: still ~0 forager
  departures). AC3 -> partial: gate unit-tested; full-sim foraging too rare to show a rhythm (forage AI, not mine).
- (03:11) RUNNING e2e r4 (test-output/species-carpenter/r4/).
