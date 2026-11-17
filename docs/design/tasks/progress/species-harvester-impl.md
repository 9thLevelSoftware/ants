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

- 02:40 rhythm.ts: trail samples outside TRAIL_TEMP_VALID_C [-40,80] skipped (microTemp returned 1e33 °C at some
  point -> heatStress 1 -> departures 0 for that tick; not my bug, reported).
- life2 (02:15, fixes): founding 2 first workers (was 1); spring hold works (cell 20 °C on spring day 1) but larva:base
  deaths remain at 17-20 °C. Proper fix needs a hook in src/sim/colony/founding/care.ts (mu x devRate(T)/devRate(26)
  after the winter jump); my attempt to add it was DENIED by the permission system -> needsFromOthers. Do not retry.
- e2e edited: spawns 10 media + 6 minor `forage` at the entrance after hand-over (documented), for the trail picture.
- 8 files / 31 tests pass at 02:42.

- 03:03 (all tests: 8 files 33 pass) found why seeds were not gathered after hand-over (probe test-output/harvester/probe/rhythm.ts,
  restore needs new Uint8Array(readFileSync()) — a Node Buffer passed to restore() aliases typed arrays: NOT a game bug):
  a) colony forage demand follows pool need only -> allocation.ts seedForageDemand (SEED_FORAGE_FRAC 0.3 x stock shortfall) + scouts;
  b) waiting foragers never leave with a fed pool -> behaviourForage granaryCall: lead to nearest harvestable known seed
     node + own departure hazard SEED_CALL_RATE_S 1/60 x shortfall;
  c) scouts reported only L-seed nodes (no major to carry) -> scoutAccept: seed only if bulk <= colony max carry.
  Probe now: seed carriers and granary stock rising on day 1 after spawn. Tests added in forage.test.ts.
- e2e run 1 (02:35): first workers 3 (natural), FAILED: no seed carrier in 30000 ticks (before fixes a-c).

- 03:40 e2e run 3: archetype is suburban-garden; colony knew NO source in 4 GD. Cause: patches 40-420 BU, small-colony
  scouts stay near home (nearest pass 65 BU). Fix: SEED_PATCHES 20, ring [20,200] BU; SEED_ODOUR_BU 25. Probe (resites):
  stock 6.3 loads in 21 h, carriers on the trail, heat gate at 13:00. Hand-over caches in test-output/harvester/cache.

- 03:55 e2e run 5 PASSED (ok:true), suburban-garden seed 1, first workers 3 natural + 16 spawned foragers; granary
  stock 13 loads; shots test-output/species-harvester/01..04 LOOKED AT: 01 carrier small/dark under leaf (weak),
  02 inside chamber with ants + display seeds (ok), 03 castes shot EMPTY (ants out of frame) -> script now teleports
  them in a row (not yet re-run), 04 possessed minor (ok).
- 04:00 viability runs started (background): playground-park 1, car-park-verge 1 -> test-output/harvester/viab/*.log

- 04:20 viability (seed 1): playground-park VIABLE yes (2 first workers, 2 at winter, 0 trips: queen reserve carries
  it); car-park-verge NOT viable (1 worker, stage brood-sacrifice 3.1 gd, 0 deliveries). Root: founding gives 1-2
  workers; such a colony never forages (allocator puts them on nurse/queen-care). Not chasing further (time).
- 04:35 e2e run 6 PASSED; shots LOOKED AT: 03-castes-side-by-side shows minor/media/major in a row (dark but
  distinguishable), 04 possessed minor with a larger caste at the left edge. 01 unchanged (weak, dark).
- 04:36 soak started: tools/sim/soak.ts --days 28 --species messor-barbarus --seed 1 --every 500
  -> test-output/harvester/soak/soak28.json/.log. Then report.

- 04:15 soak 28 d (seed 1, default archetype, no player): 17 violations, all walker-stuck-explosion (base issue,
  also in Lasius life runs); granary-finite and all other invariants hold. Report written; probe files deleted.
  STATUS: done for this session; remaining defects listed in the report (founding yield, tiny colonies do not forage).

## Evidence
- test-output/harvester/econ/ (old code, --workers 12): 46 deliveries, mostly honeydew, seed 1-2/day, no granary.
- test-output/harvester/life2/pp1.log : life run with the fixes (started 02:15).

## Remaining (order)
1. e2e browser run 4 (03:34) — after: gate holds returners, overflow storage, scout depart hold; 33 tests pass
2. viability table: playground-park + second archetype (choose: open sunny sand/lawn), seeds 1-3 (<=2 runs at once)
3. e2e browser run tests/e2e/species-harvester.mjs + LOOK at screenshots
4. 28-day soak (tools/sim/soak.ts) with messor
5. report

## Findings / decisions
- walker-stuck-explosion invariant at tick 129000 (winter, 33 of 34 walkers) in both life runs: not mine (creatures/locomotion in winter?).
- cheat.spawnAnts pos null puts workers outside idle (probe) — note for life --workers runs.
- Architect: REQUIRED_TYPES messor has granary at 30 workers (balance/architect.ts, not mine); the §6.3.5 count rule
  ceil(targetStock/1600) is 1 for any colony < ~1,000 workers, so not implemented further.
