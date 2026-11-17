# species-harvester fix round (reviewer findings) — progress

## Status
- 05:10 UTC: all findings coded; fixes.test.ts 10 pass; typecheck clean in my paths. diag-mb-patrol now warns only
  on a patroller > 1 h late (patrolOverdueTicks). e2e script reworked (carrier in good light near another carrier,
  planDig granary + cheat.instantPlan, castes at 10:00, possessed view with castes ahead, chaff midden required).
- RUNNING (background, started 05:06): life.ts playground-park seeds 1, 2 -> test-output/harvester/viab2/pp{1,2}.log/.json
  (status file test-output/harvester/viab2/status). NEXT: pp3 + car-park-verge 1-3 (2 at a time), then e2e harness.
- F2 extra: shared patrol return stops at the hole outside (nestId -1) -> behaviourPatrol enterNest walks into the
  entrance chamber; GATE_PATROL_TRIP_S 15, PATROL_FAILSAFE_TICKS 1000. rhythm.test passes again (gate opened on returns).

## Done
- F1 seeds.ts refreshSite: emptied in-season node comes back only with rain since (SeedSite.emptiedTick, types additive).
- F2 behaviourPatrol.ts (new, registered in index.ts): gate patrollers turn home after GATE_PATROL_TRIP_S 20 s outside;
  PATROL_FAILSAFE_TICKS 500 -> 750 (balance).
- F5 events.ts (new): granary-state on state-mask change (GranaryState.stateMask additive), called from economy.ts.
- F6 cohorts.ts addSeeds fallback: same germ state + not germinating is a hard key.
- F9 counters.ts noteSeedDay + rhythm.ts lullMult: reference = mean of this year's seed days (seedDayMean/Count/Year, types additive).
- F10 delivery.ts putDownChamberId: chamber at the primitive's own put-down point.
- F3 paste.ts millSecondsPerLoad (small workers soft seed x SMALL_MILL_TIME_MULT 3), behaviourCare 'mill' job when
  paste short, allocation.ts moves unmet mill demand (no mill-weight workers) to store; behaviourMill pasteEnough true at demand 0.
- F7 relocate.ts (new) + behaviourCare 'relocate' job/state store.care-carry + allocation relocateDemand; middens.ts
  header documents haul rule n/a; WINTER_STOCK_GD removed (unused).
- F8 behaviourForage cutHeadNow (SEED_HEAD_CUT_BELOW_UNITS 3); plant sites always M class (seeds.ts newSite).
## 05:58 status
- allocation.ts gathererFloor (GATHERERS_MIN 1): with the granary short one worker scouts/forages, queen care gives way
  (pp1 probe: 2 workers were nurse + queen-care, 0 trips in 11 gd). scenario.test.ts: E17 + paste-bottleneck scenarios
  now run with surfaceActivity 0 (isolate in-nest mechanics). Granary suite 11 files / 54 pass.
- BLOCKER found (not mine, locomotion/nest nav): pp1 probe: forager with a seed in forage.deliver, at y -9 mm in the
  shaft, nav failed 'leg' every think, 32 BU from the founding chamber; never delivers. Repro: probe ho.ts on
  test-output/harvester/viab2/cache/founded-messor-barbarus-playground-park-1-naturalist-d-fe66cb2b.bin.
- pp3 killed (stale code). NEXT: e2e harness alone, then viability reruns with final code.
## 06:40 e2e
- run 1/2 (test-output/harvester-fix/e2e*): 3 natural first workers; 01 seed carrier LOOKED AT (media with a visible seed,
  on a leaf, no column). Failed at the granary: planDig via window.__game.command made no plan in the browser
  (node probe plan2.ts: the same command works on the sim). Run 3: refused 'overlaps-plan' (architect plan on +x side). Run 4: tries 4 sides of the royal chamber.
## Viability so far (test-output/harvester/viab2)
- pp2: real founding never handed over in 16 gd; forced seal failed (egg/larva flooding 18, queen exhaustion). Founding, not granary.
- pp1 (running): hand-over 2 workers; days 1-7 trips 0, brood 4 eggs -> 0 by day 4, P flat 0.3. To probe with
  test-output/harvester/probe/ho.ts (args: cache file, archetype, seed, days) after pp1 ends. Delete probe dir at end.
- pp3 started 05:20 (background shell, & - make sure it ends).
## Decisions
- F3: small workers (minor, media < 1.2 BU) mill seed hardness <= crackLimitMinor (0.3) at SMALL_MILL_TIME_MULT x major time
  (deviation from GDD 07 6.3.6 'minors only sprouted'); species data gives minors mill weight 0 (not my file) so the
  shortfall of able millers is moved onto store (granary-care) demand, and care workers mill when paste is short.
- F7 midden haul: chaff is placed 8-20 BU out, so 'pile within 6 BU' can never happen -> not applicable (documented).

## Remaining (in order)
1. F1 seed node respawn (seeds.ts refreshSite)
2. F2 patrol gate fail-safe vs patrol trip (rhythm.ts)
3. F5 granary-state event
4. F6 gnaw at COHORTS_MAX (cohorts.ts)
5. F10 delivery chamber lookup mismatch
6. F9 summer-lull reference
7. F8 AI cut-seed-head
8. F7 relocation/midden hauling
9. F3 milling by nanitic minors (design hole)
10. F4 e2e screenshots
