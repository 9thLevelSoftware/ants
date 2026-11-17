# species-harvester implementation — progress (engineer 3)

Started 01:56 UTC Nov 17. Two earlier engineers cut off (01:24, 01:53); no progress file existed.

## Found in tree (from earlier engineers) — all present, tests green
- src/sim/species/modules/granary/** : seeds, delivery, cohorts, state, paste, protein, economy, actions, behaviourMill/Care/Forage,
  rhythm, allocation, castes, middens, trunk, winter, display, diagnostics, counters, params, testkit; tests cohorts (E15-18),
  castes (E5), protein (E19), rhythm (AC3), scenario (E15/E17/E20, paste bottleneck, patrol gate), trunk.
- src/sim/balance/species-harvester.ts ; src/sim/colony/founding/species/messor.ts (registered in granary index).
- tests/e2e/species-harvester.mjs written but NEVER RUN yet (no test-output/species-harvester).
- words for diag causes exist in src/content/text/words.ts (lines ~147-243).

## Done this session (02:15)
- Founding yield fix: spring hold in src/sim/colony/founding/species/messor.ts (lapseSpringHold; FOUND_SPRING_RESUME_C 16,
  STEP 0.25, MAX 7 in balance). Cause: founding mu (colony/founding/care.ts) paid per wall GD; spring cell 13-16 °C
  -> 7 of 9 larva:base deaths in spring days 1-4. Test src/sim/colony/founding/species/messor.test.ts (2 tests, pass).
- Forage fixes (behaviourForage.ts): seed acceptance per visit = 1-(1-p)^SEED_LOOKS_PER_VISIT(6) (was one p draw per
  node-day -> almost no seed trips); diet filter (no honeydew; scouts + foragers). allocation.ts: tend demand 0 for
  honeydew pref 0 (life run had 15 worker-gd of `tend` and honeydew deliveries).
- New test forage.test.ts (size-matched acceptance; media foragers fill the granary in 0.5 GD) - pass.
- `npx vitest run src/sim/species/modules/granary src/sim/colony/founding/species/messor.test.ts`: 8 files 31 tests pass.

## Evidence
- test-output/harvester/econ/ (old code, --workers 12): 46 deliveries, mostly honeydew, seed 1-2/day, no granary.
- test-output/harvester/life2/pp1.log : life run with the fixes (started 02:15).

## Remaining (order)
1. read life2 result; check first workers and seed deliveries/granary fill/milling
2. viability table: playground-park + second archetype (choose: open sunny sand/lawn), seeds 1-3 (<=2 runs at once)
3. e2e browser run tests/e2e/species-harvester.mjs + LOOK at screenshots
4. 28-day soak (tools/sim/soak.ts) with messor
5. report

## Findings / decisions
- walker-stuck-explosion invariant at tick 129000 (winter, 33 of 34 walkers) in both life runs: not mine (creatures/locomotion in winter?).
- cheat.spawnAnts pos null puts workers outside idle (probe) — note for life --workers runs.
- Architect: REQUIRED_TYPES messor has granary at 30 workers (balance/architect.ts, not mine); the §6.3.5 count rule
  ceil(targetStock/1600) is 1 for any colony < ~1,000 workers, so not implemented further.
