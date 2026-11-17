# species-leafcutter fix round — progress
Started 2026-11-17 (no earlier progress file). Last update: see bottom.
## Done (code edited, tests not yet re-run unless noted)
- F1 seeded garden death: states.ts (no seeded exemption)
- F2 recovery: dynamics.ts gate subT <= HEALTH_RECOVER_TOXIN_MAX (0.1, balance)
- F10 tend-fungus secondary: actions.ts (onBegin re-times, effect reads ant.action.secondary, secondary wins over AI mode)
- F11 diag-garden seeded warn: diagnostics.ts (GARDEN_DIAG_FSUB_WARN)
- F3/F4/F5 refuse + waste restructure: waste is task `haul` now -> new behaviourHaul.ts (gw.* states, delegates to shared haul),
  refuse.ts (becomeRefuse, guard systems moving REFUSE ants off nurse/queen-care/garden to haul), wasteDump.ts
  (midden >= 25 BU from fungus, else surface heap, else near midden, else null = waste stays in W), allocation.ts
  (haul demand + ensureWasteHaulers), behaviourGarden.ts (waste job removed), actions.ts (waste: media/refuse only, becomeRefuse)
- Edit of src/sim/colony/allocation/groups.ts was DENIED by permissions -> do not retry; report as needsFromOthers
## In progress (10:45)
- running review.verify.test.ts + own tests
## Remaining
- tests for new behaviour; tunables (castes.ts, display.ts, behaviourCut, phorids); perf (index.ts gardenLess laying, noCutters/noProcessors memo)
- smaller gaps (phorid rate, reseed after W=0, syncGardens event, display lump pick-up, quarantined field)
- render: src/render/nest/species/fungus*, src/render/ants/species/atta* (do not exist) ; fungus chamber proposal; e2e; viability
- 10:45 all owned tests green (7 files, 41 tests) incl. new refuse.test.ts; review test 'waste ... nowhere to dump' precondition removed>0 amended (explained in file)
## 11:15 update
- done also: tunables moved to balance (castes, display, cut jitter, phorid step, diag thresholds, recovery c), perTick memos
  (atColonies, noCutters, noProcessors, staffOf), phorid denominator (every laden carrier once a trip), reseed only after W=0
  (state.ts reusableForGarden), syncGardens emits garden-state dead 'collapse', g.quarantined written, displayGuard.ts
  (pick-up refuses display lumps), playerPrompts.ts (fungusSelfPrompt adapter, NOT wired: targeting.ts is others'),
  cache.ts absorbLyingFragments (player put-down fragments join cache), fixround.test.ts (7 tests)
- tsc clean; owned tests 8 files / 48 tests green
## Next
- one life.ts run (suburban-garden seed 2) in background -> test-output/viab/fix-sg2.log ; then e2e harness (one run)
- e2e script changes: clear CALLOW on spawned castes, daylight for castes shot, assert planted/carried, refuse heap
## 11:30
- e2e script updated (chain carried+planted asserted; denser column wait; castes by day, callow flag cleared, wider spacing)
- chamberRhRule chained (index.ts) instead of overwritten
- life run in progress: test-output/viab/fix-sg1.log (--cache-any: founding reused, economy after hand-over is new code)
- NEXT after it ends: one harness run -> test-output/species-leafcutter-fix/e2e1 (look at PNGs), then report
- 10:47 life fix-sg1 at day 3 (9 workers, ~5 min/GD under load); expected done ~12:00. Do not restart it; read test-output/viab/fix-sg1.log
