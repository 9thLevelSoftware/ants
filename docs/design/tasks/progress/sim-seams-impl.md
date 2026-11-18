# sim-seams implementation progress

Started: (see date in git) by sim-seams engineer #1.

## Done
- Item 4 DONE (02:40 UTC): cause = system order. nest-flood (nest module) and fungus-phorid-deaths (species module) are phase
  'lifecycle' but sorted after the corpse pass `lifecycle` (ants module) -> flood-drowned ants (killAnt) swept without corpse,
  carried brood left carriedBy a removed id. Fix: src/sim/systems.ts END_OF_TICK_SYSTEM ranks 'lifecycle' last.
  Tests: commands.test.ts 'runs the corpse pass after lifecycle-phase systems...' (red without fix, checked), stale
  'places a module system by phase' fixed. commands.robust stagger test was red (species modules offsets); split: core
  strict + per-species; counts in test-output/sim-seams/stagger.txt (owners species/modules).

- Item 2 DONE (02:45): JournalEntry.calTick / EventLogEntry.calTick (types additive), journal.ts entryCalTick/entryDate,
  trim uses them; events.ts writes the spring season note on overwinter.report (calendar emits no time.season after the
  lapse jump), dedupe per season (mem 'seasonEntryKey'). Test progression/journalYear.test.ts (2 tests, both red without fix).
  App must date entries from calTick (src/game/uiBridge/panels/journalSlice.ts, src/ui/panels/journal/timeline.ts) -> report.

- Item 1 DONE (03:00): table test progression/triggerTable.test.ts (7 tests). Missing emitters found: world.zone-first-entry,
  world.micro-discovered (GDD 04, world module, nobody emits) -> stand-in progression/discovery.ts (poll), consts
  MICRO_DISCOVER_BU/MICRO_GRID_CELL_BU in balance/progression.ts. rival-discovered listener added to cx-formica /
  cx-pavement-wars (codexRules.ts rivalSeen). Table: test-output/sim-seams/trigger-table.tsv (probe probe/triggers.ts).
  T3 aims aim-find-wood, aim-plant-garden have no opener (reported).

## In progress
- item 3 rivals tick 1

## Remaining (order)
4 commands, 2 journal, 1 milestones table, 3 rivals tick1, 5 time auto-slow, 6 difficulty params, 7 bounds repro, 8 save table, report.

## Findings / decisions

## Evidence paths
test-output/sim-seams/
