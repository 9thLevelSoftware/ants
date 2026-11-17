# species-harvester implementation — progress (engineer 3)

Started 01:56 UTC Nov 17. Two earlier engineers cut off (01:24, 01:53); no progress file existed.

## Found in tree (from earlier engineers)
- src/sim/species/modules/granary/** : seeds, delivery, cohorts, state, paste, protein, economy, actions, behaviourMill/Care/Forage, rhythm, allocation, castes, middens, trunk, winter, display, diagnostics, counters, params, testkit; tests cohorts, castes, protein, rhythm, scenario, trunk.
- src/sim/balance/species-harvester.ts ; src/sim/colony/founding/species/messor.ts (registered in granary index).
- tests/e2e/species-harvester.mjs exists (check content).
- Evidence: test-output/harvester/life/life-messor-barbarus-playground-park-1.md (01:53): founding handover 12.4 gd with only 1 first worker; 0 deliveries; walker-stuck-explosion invariant (34 of 34 walkers) at tick 129000.

## Done this session
- 01:57 typecheck clean in my paths; `npx vitest run src/sim/species/modules/granary` 6 files / 27 tests pass (protein.test.ts is complete).
- Diagnosis of 1 first worker: founding mu in src/sim/colony/founding/care.ts is paid per wall GD; after the winter jump the
  spring cell is 13-16 °C (devRate ~0) and 7 of 9 larva:base deaths happen in spring days 1-4. Fix (mine): spring hold in
  src/sim/colony/founding/species/messor.ts (lapseSpringHold, FOUND_SPRING_RESUME_C 16 / STEP 0.25 / MAX 7 in balance) +
  test src/sim/colony/founding/species/messor.test.ts (not yet run).

## In progress
- 02:05 life run --workers 12 --cache-any (economy check) -> test-output/harvester/econ/pp1-w12.log

## Remaining (order)
1. typecheck + module tests green
2. founding yield (1 worker of 25 eggs) — diagnose
3. foraging of seeds after handover (0 deliveries)
4. e2e + screenshots; viability table

## Findings / decisions
