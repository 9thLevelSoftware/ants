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

- Item 3 DONE (03:10): rivals/prepare.ts builds rival nests at createNewGame (initRivals -> rivalsImpl().prepare) on a
  short-lived Sim assembled from createServices (importing sim.ts from rivals breaks the module cycle). Tick path kept
  for old saves. Evidence test-output/sim-seams/rivalCost.txt (before 1475-1955 ms at tick 0, after <=4 ms),
  rivalHash-*.txt (2 gd hash 94b6f8b0 -> 74069060: differs because ids interleave with human scheduler at tick 0,
  rivalDiff-we1.txt). Test rivals/creation.test.ts (3). founding.test.ts imports reordered (ecology import cycle, not mine).
  First tick still ~670 ms from OTHER systems (to measure + report).

- Item 5 DONE: app owns auto-slow (Game.ts emits time.auto-slow). Doc comment on the event type (types/eventsWorld.ts),
  test src/sim/time.autoSlow.test.ts. App is wiring autoSlowDefault itself (look-pass-3 review, src/game/time/autoSlow.ts
  withGameRule, in flight 03:10) -> autoSlowDefault NOT put on UNWIRED list.
- Item 6 DONE: src/sim/timeGrace.ts (inOpeningGrace / openingGraceEndTick; no grace while opening at intro-card = scenes);
  cross-edits logged test-output/sim-seams/cross-edits.md (human/index.ts newDay, creatures/director.ts predators+bird).
  Test src/sim/timeGrace.test.ts (3). presetDisplay.ts: openingGraceGd off UNWIRED_PARAMS, UNWIRED_WHY added; test updated.
  creatures (30 files) + human (15) folders green. tests/docs/docs-final.test.ts now RED: MANUAL.md line 70 still says
  grace "(not in effect)" -> report for docs/app-seams-2 owner.

## In progress
- item 7 bounds repro, then item 8 save table, then report.

## Remaining (order)
4 commands, 2 journal, 1 milestones table, 3 rivals tick1, 5 time auto-slow, 6 difficulty params, 7 bounds repro, 8 save table, report.

## Findings / decisions

## Evidence paths
test-output/sim-seams/
