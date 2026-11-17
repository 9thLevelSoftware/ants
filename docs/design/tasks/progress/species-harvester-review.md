# species-harvester review (adversarial) — progress

Started 04:00 UTC Nov 17. No earlier review progress file existed.

## Done
- Read spec, addendum, GDD 07 §5.3/§6.3/App E, all module code, founding messor.ts, e2e script.
- typecheck: 0 errors in owned paths (3 elsewhere: render/ants/swarm.test.ts, outdoor/hunt.test.ts).
- vitest granary + messor founding: 8 files 33 pass (40 s).

- Verify tests written (src/sim/species/modules/granary/granary.verify.test.ts 7 tests, loop.verify.test.ts 3 tests):
  RED (defects): seed node respawn (252 units in 0.5 GD vs rain 11), gnaw at COHORTS_MAX loses degermed,
  granary-state never emitted, patrol gate opens only by fail-safe (500 ticks, 0 returns; PATROL_TRIP_S 180 s = 1800 ticks).
  GREEN: 3-minor colony starts granary in kit (impl claim of tiny colonies not foraging is NOT reproduced at kit level),
  save/restore equality, numeric edges, paste release P not lost, fresh seed at cap.

- e2e harness run done (ok:true, 9.8 min): test-output/harvester-review/e2e.log + e2e/01..04.png LOOKED AT.
  01 one dark ant on a leaf, no seed visible, no trail; 02 royal (proto-granary) chamber with white sphere display seeds;
  03 castes in a row, very dark; 04 possessed minor, larger caste cut at left edge. paste 0, no chaff/midden shot.
- final: typecheck clean in owned paths; 10 files, 43 tests: 39 pass, 4 red (the defects above).

## In progress
- report (StructuredOutput). DONE after that.

## Remaining
1. verify tests: seed node respawn, gnaw at COHORTS_MAX, small colony forage (red), granary-state event, patrol staffing
2. harness e2e run + look at screenshots (test-output/harvester-review/)
3. report

## Findings so far (code reading, to confirm by test)
- seeds.ts refreshSite: emptied (retired) grass-seed node re-created every 250 ticks in season with 0.25*capacity units -> unlimited seed.
- cohorts.ts gnawLoads/addSeeds at COHORTS_MAX: gnawed loads may merge back into a non-degermed cohort.
- granary-state event (GDD 07 App C) never emitted -> ms-first-granary milestone never fires.
- relocation of seeds from damp granary (GDD 6.3.4) not implemented; RELOCATE_LOADS, relocateHumidity unused; midden haul not implemented; WINTER_STOCK_GD unused.
- cut-seed-head never used by AI.
- summer lull reference = spring seed intake, but grass-seed window is doy 10-20 (not spring) -> lull never active.
- small colonies (<4 workers) do not forage (admitted); founding yields 1-3 vs 5-8 (admitted); viability not met (admitted).
- 04:35 more findings: patrol gate always opens by fail-safe (PATROL_TRIP_S 180 s > PATROL_FAILSAFE_TICKS 50 s).
  Impl life report playground-park-1: 0 eggs laid in 12 gd after hand-over, P flat 0.3, one forager in forage.deliver
  for ~half the worker time; nanitic-only colony cannot mill (GDD: minors mill sprouted only; majors from N>=40) -> design hole.
- e2e harness running -> test-output/harvester-review/e2e.log, shots in test-output/harvester-review/e2e/
