# species-leafcutter review — progress (reviewer 1)

Started 10:00 UTC Nov 17. Last update 10:20 UTC. No earlier review progress file existed.

## Done
- read seed, architecture, spec, addendum, GDD 07 §5.4 + §6.4 + App E, GDD 06 §5.15, all owned code + tests
- npm run typecheck: clean (10:07). Own tests: 5 files / 21 tests pass (30 s).

## In progress (10:25)
- writing src/sim/species/modules/fungus/review.verify.test.ts (pure + kit scenarios)

## Remaining (in order)
1. finish verify tests, run them (npx vitest run src/sim/species/modules/fungus/review.verify.test.ts)
2. harness e2e run (one only) -> test-output/species-leafcutter-review/, look at screenshots
3. StructuredOutput report

## Findings so far (to verify with tests)
- A seeded garden starved to ~0 never dies (states.ts nextState excludes 'seeded' from G<deadG) -> never garden-less
- health recovery needs subT<=1e-6 but LEAF_TRAITS give almost every plant t>0 -> gardens never recover in play
- minims haul waste (noProcessors deviation) -> become REFUSE (lifespan x0.5) in a minim-only colony
- REFUSE flag never read by allocator: refuse workers can be made nurses (GDD 6.4.4 forbids)
- waste with no midden + no open entrance: put down in place (in the garden chamber); W drops, item never cleared
- tend-fungus: check() honours `secondary`, durationS/effect ignore it (plant pulp secondary harvests/tends)
- player HUD (targeting.ts) never offers cut-leaf / tend-fungus / process-leaf: possession by caste not playable
- diag-garden says ok for a starving 'seeded' garden (the colony's only garden after hand-over)
- magic numbers inline: castes.ts MAJOR_GATE_GD/EMPHASIS_SPAN/{c:0.1,p:0.3}, display.ts DISPLAY_*, behaviourGarden GARDEN_CHAIN_MAX
- WASTE_DUMP_MIN_BU declared, unused
- soak log: scout 21 worker-gd for Atta (module does not zero scout demand; outside ages x3)

## 10:25 update
- src/sim/species/modules/fungus/review.verify.test.ts written: 16 tests, 9 pass, 7 RED (confirmed defects):
  seeded-never-dies, herbage-no-recovery, minims-become-refuse (W=1 start), refuse-made-nurse (3425 ant-ticks),
  waste-left-in-garden (entrance held sealed: 6 items in chamber, W 0), tend-fungus secondary harvests, diag ok seeded
- probes deleted (zz-probe.verify.test.ts). Next: e2e harness run (one), then report.

## 10:40 update
- e2e running in background: node tools/harness/play.mjs ... --out test-output/species-leafcutter-review/e2e1
  (log e2e1.log, json e2e1.json). If cut off: check EXIT line in e2e1.log, look at the PNGs, do NOT rerun twice.
- extra findings: refuse workers reassigned to cut/forage (seen in probe); impl r2 summary shows garden still 'seeded' G 0.62

## 10:55 — e2e done, report being written
- e2e1 EXIT 0, 8 first minims (forced seal + completeFounding); shots looked at: 01 single minim carrier (no column),
  01b possessed carrier (prompt only Put down/Drop), 02 garden lumps in the FOUNDING cell (no fungus chamber),
  03 castes: major/media/small media NOT distinguishable at a glance, workers pale. No refuse heap. chain carried 0,
  planted 0 at check; garden seeded 0.71 -> 0.62 GU, staphylae 0.
- final: verify file 16 tests (9 pass, 7 red). Nothing left but the StructuredOutput report.
