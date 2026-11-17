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
- (04:33) e2e fix1 PASSED (test-output/species-carpenter/fix1): pile 13 items = 1.3 units at foot of log (inLog false), shots looked at: 04 pile+grains at log foot (dark: mound renderer soil colour), 02 media+major ahead but queen ghost near camera, 01 opening not visible, 03 slab. Edited e2e: queen moved out for 02, closer 01. RUNNING soak life.ts we2 --days 28 -> test-output/carp/fixsoak
- (04:43) soak DONE test-output/carp/fixsoak: 0 invariant violations / 28 d (woodland-edge 2, real hand-over); queen + 5 minors starve in the winter lapse (C 0.66 into winter; colony overwinter/economy). RUNNING e2e fix2 -> test-output/species-carpenter/fix2
- (04:58) e2e fix2 PASSED, shots looked at (02 castes readable, queen out; 01 opening still not readable; 04 frass at log foot, pile dark = renderer). Writing report.
