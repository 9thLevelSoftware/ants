# species-harvester fix round (reviewer findings) — progress

## Status
- 04:50 UTC: F1, F2, F5, F6, F9, F10 code done (F9/F10 tests not yet written). Now F3 (small workers mill soft seed).

## Done
- F1 seeds.ts refreshSite: emptied in-season node comes back only with rain since (SeedSite.emptiedTick, types additive).
- F2 behaviourPatrol.ts (new, registered in index.ts): gate patrollers turn home after GATE_PATROL_TRIP_S 20 s outside;
  PATROL_FAILSAFE_TICKS 500 -> 750 (balance).
- F5 events.ts (new): granary-state on state-mask change (GranaryState.stateMask additive), called from economy.ts.
- F6 cohorts.ts addSeeds fallback: same germ state + not germinating is a hard key.
- F9 counters.ts noteSeedDay + rhythm.ts lullMult: reference = mean of this year's seed days (seedDayMean/Count/Year, types additive).
- F10 delivery.ts putDownChamberId: chamber at the primitive's own put-down point.
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
