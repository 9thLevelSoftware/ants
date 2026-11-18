# sim-seams review — progress (reviewer)
Started 2026-11-18 ~03:54 UTC. No earlier progress file. Tree was clean (impl committed; base b2809f0).
## Done
- read spec, sim-seams-report.md, all new/changed code (git diff b2809f0 HEAD on owned paths)
- typecheck: clean
- vitest commands*/time*/timeGrace/presetDisplay/save: 66/67, only red = time.test.ts (environment/human/schedule.ts:48, not theirs)
- vitest src/sim/progression 16 files 246 pass; src/sim/rivals 14 files 104 pass 3 skip
- system order verified (test-output/sim-seams-review/order.ts)
- autoSlowDefault IS wired in HEAD (Game.ts:139 withGameRule) -> item 6 list truthful; unwired params grep-verified unread
- NEW TESTS: src/sim/progression/discovery.verify.test.ts (4; 1 RED = queen bug), src/sim/rivals/prepare.verify.test.ts (3 green),
  src/sim/save/foundingPhases.verify.test.ts (1 green: seal + lay round trips)
- test-output/sim-seams-review/lateBind.ts: importing only createGame -> createNewGame throws on rival sites (rivalsImpl not provided)
## In progress
- none; final output being written
- cross-edit tests: creatures director+bird, environment/human: 17 files green
## Remaining
- final StructuredOutput
## Findings
- MAJOR discovery.ts: queen (any caste) triggers zone-first-entry -> ms-zone-crossed during opening search; GDD 06 "a worker"
- minor: createNewGame now depends on rivals/wiring.ts being loaded (late binding) — throws otherwise
- minor: commands.robust per-species stagger tests vacuous
- minor: item 8 seal/lay/mid-hunt not covered by impl (now covered by reviewer test for seal/lay)
