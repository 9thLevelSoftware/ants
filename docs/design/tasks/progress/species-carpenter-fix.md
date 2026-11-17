# species-carpenter fix round — progress
Started fresh (no earlier fix file) 04:01 UTC Nov 17.
## Done (wood + text tests 14 files 99 pass 1 skip; typecheck clean in my paths at 04:15; 3 unrelated errors
## in src/render/ants/swarm.test.ts and src/sim/ants/behaviours/outdoor/hunt.test.ts)
- caches: index.ts `announced` -> persisted col.wood.castesAnnounced (contract colonyModules.ts additive);
  colonyPass ejectedSeen removed -> newlyEjected(sinceTick = tick - WOOD_DIAG_TICKS) (stateless).
- pile units: frass.ts pileUnits(mound) = absorbed items / 10. Reviewer test rewritten to real settle path.
- frass fall: NEW frassFall.ts + system 'wood-frass-fall' + frassFall.test.ts (3 tests). Balance consts.
- climate seam: satellites.ts climateOf + broodMoisture.ts use colony envAdapter chamberTempC/broodTempC.
  E13 LONG re-measured with setClimateOverride 22/26: 10 of 20 (was 11 at raw ~20/20). shuttle.test.ts updated.
- shuttle capacity: assignShuttles fills best-score satellites up to free room (brood + in-flight trips).
- marker: satelliteWoodRefusal (thin/crumbling/used/cap 4 out + 2 interior) used by marker + bestCandidate.
- NEW siteStates.ts (isolation = no navGrid path between open entrances for 1 GD; orphan flag 7 GD; decay 4 ->
  satellite abandoned), NEW returns.ts (young brood / abandoned brood back to parent by satellite nurses),
  siteStates.test.ts (5 tests). NestSite.orphan additive. diagnostics: no hideFrass remedy (not built),
  late-brood share + orphan factors; words.ts 3 factor words. woodState ensure key without allocation.
- wall-thin prompt: NOT changed (needs ActionFailReason member + prompt.ts REASONS line, other owners) -> needsFromOthers.
## Remaining (order)
1. e2e: frass pile units from mounds only; castes shot readable; run harness once; look at shots
2. soak with a working colony (life.ts we2 short?), 3. report
- (04:16) RUNNING e2e fix1 -> test-output/species-carpenter/fix1 (background); e2e edited (pile units by items, castes from camera dir, closer shots)
- App E (GDD 07) for this module: 10 brood.test, 11 wood.test, 12 frassFall.test + verify (outdoor; interior visibility
  1.0 path only via founding.test tally), 13 shuttle.test LONG 10/20 (partial), 14 castes test; 8 = honeydew module (other).
- NEXT after e2e: life.ts we2 --days 28 soak (test-output/carp/fixsoak), then final tests + report.
