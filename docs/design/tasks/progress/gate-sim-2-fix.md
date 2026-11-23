# gate-sim-2 fix (review findings) — progress
Started 2026-11-23 (session 1). No prior fix progress file.
## Done
- read spec, impl + review progress files.
## In progress
- reproducing findings 1-6
## Remaining
1 ruling 2 (sweep-long-item4 + keep rule) 2 ruling 1 (ecology tier arg) 3 report winterPath attribution
4 escapeDig numbers 5 DEVIATIONS rows 6 sg#2 restore note
- 21:42 sweep-long-item4 is RUNNING (started 21:36 by another session, from /home/user/keep-gate2-item4, tree hash
  55c4dfff = first close sweep tree, checked). Do NOT start a second copy; wait for summary.txt (5 lines), then
  python longrun-table + keep rule. Next: ruling 1 (ecology tier arg) in live src meanwhile.
- 21:50 RULING 1 code DONE (live src): tier args in ecology/sources (season.isInSeason, lifecycle.updateSource,
  drops.runCarrionDrops/replaceCrumbs/dropCarrion, anchors.sourceFromAnchor, runtime.carrionFromItem, budget
  OfferOptions.tier, system.makeSourcesSystem(tier)), ecology/index initEcology(tier), createGame NewGameOptions
  .ecologyTier, testing/testWorld makeTestSim ecologyTier, sources/testkit makeSourceSim tier. 12 tests pass tier 1:
  `npx vitest run src/sim/ecology/sources` 118/118 green. tsc clean on my paths.
  PENDING: hash check (one cached Lasius run, needs a slot: wait until sweep-long-item4 ends; chromium running).
- ~21:48 DEVIATIONS: R43 split (R43-only numbers) + D37 (r(25) stage), D38 (ids 37->38, stall.soak dozed), D39 (tier
  arg), R39 row + seams restatement. tests/docs green 8/8.
- ~21:50 escapeDig traced (probe archived test-output/gate-sim-2-fix/zzEscapeProbe.tmp.test.ts.txt, output
  escape-probe.txt): top sphere 5 of the shaft has 18 targets, 2 closed at the ground surface (316,0,264 = 98,
  318,0,264 = 125 of OPEN_MIN 128) from 4.6 h to 8.6 h -> 16/18 < SPHERE_DONE 0.9; entrance opens only when those
  surface samples open. Experiment sampleInOpenAir >= 0 (REVERTED): plan completes 3.0 h but entrance never opens in
  10 h -> the slow part is opening the surface samples. Not fixed (dig rule, Lasius-wide; needs a sweep). Report it.
- 21:53 running folder tests (vt-a, bg) for ecology/sim/testing/actions/types; next: report edits; hash check + ruling 2 after long runs (~22:35).
- 21:58 report edits DONE (not depending on ruling 2): sec 0 R22 attribution removed; sec 1 rows 6 (escapeDig 8.76 h +
  mechanism) and 11 (ecology green); sec 6 items 3 (sg#2 restore: reviewer evidence), 7, 8; sec 5 DEVIATIONS list;
  sec 7 contracts. Keep-rule script: test-output/gate-sim-2-fix/keeprule.py (run from test-output/gate-sim-2:
  python3 ../gate-sim-2-fix/keeprule.py sweep-long sweep-long-item4 sweep). All 5 item-4 colonies entered winter
  >= 0.95 x R27 (sweep/: we2 2.12, sg2 0.97, cpv1 4.14, pp3 1.71, kd3 0.98) -> (b) applies to all five.
  TODO after long runs: keep rule; if KEEP: restore trip.ts from trip.ts.item4-reverted, un-skip buriedLarva.gate2,
  report says 12/15 (sg 1/3) bar not met; hash check (freeze live -> sg#2 g2 restore, compare e112bd51); report 0b.
- 22:00 frozen /home/user/gate2fix-hash (tree 2dbe19b5 = live with ruling-1 change) for the hash check; delete at the end.
- 22:00 vt-a: ecology/sources 118, plants 41, src/sim 128, testing 26/27 (layering case a: pre-existing, 4 test imports of @/game/@/content by other tasks), gate1b 19, actions 88, types 27 green. (DIRS with no test files makes folders.sh run the WHOLE suite: killed once; never pass such a dir.)
- 22:24 HASH CHECK PASSED: sg#2 g2 restore on frozen live (ruling-1 tree 2dbe19b5) finalHash e112bd51 = sweep2 in-process = reviewer restore (test-output/gate-sim-2-fix/hash-sg2-g2). /home/user/gate2fix-hash deleted. Waiting kd#3 item-4 long run.
- 22:31 KEEP RULE: KEEP item 4 ((a) 105 vs 94 at winter 2; (b) all five >= 0.95 R27, max lapse loss 14.3 % cpv1, no queen death; keeprule.md). Restored trip.ts from trip.ts.item4-reverted and buriedLarva.gate2.test.ts from keep-gate2-item4 (un-skipped). Next: tests, sg#2 restore day diff, report.
- 22:30 INTEGRATOR NOTE: "Integrator ruling 3" is at the tail of docs/design/tasks/gate-sim-2.md: item 4 KEPT (agreed);
  the restore gap exists only with item 4 (reviewer) - find the first differing tick and the term climbToFree reads
  that is not restored exactly, fix with a save/restore equality test if it is that kind of cause, timebox one hour,
  else report it in "still wrong" and close. Say in the report that sg #2 enters its second winter with 28 workers and
  0.5 C on the item-4 tree. /home/user/keep-gate2-item4 is yours to use for this and to delete at the end.
- 22:38 probe tools/sim/probe/g2f-restore.ts (A continuous vs B save/restore mid-run) on live (item 4 in), sg#2 c8545e09 hand-over -> test-output/gate-sim-2-fix/restore-item4.txt. sweep/ vs off-base sg#2 first differing day = 6 (pellets, nest volume).
- 22:50 handover probe tools/sim/probe/g2f-handover.ts: sg#2 item-4 tree, in-process vs hand-over restore: equal to +31000, FIRST DIFF by +32000 in rival colony 1 (fieldedIds, extra ant 71 in A). Save/restore at +3000 exact (restore-item4.txt). Refining (every tick from +31000).
- 23:00 fine probe: FIRST DIFF at +31664 (tick 60872): rival raider ant 10161 (task raid): A nav seek/entrance 2456 planTick 60871, B nav field legField loco:pt:942,-4,733 legNest 2382 planTick 60856 -> locomotion point-field cache differs in-process vs restored; raider goal = player brood in nest -> climbToFree. Investigating loco point fields.
- 23:08 rerun probe with watch on ant 10161 from +31644 -> handover-item4-watch.txt
- 23:20 ROOT CAUSE of sg#2 in-process vs restore gap: locomotion/nests.ts registerPointField FIFO eviction removed a field a raider was FOLLOWING (registry order is runtime-only, differs after load; A had it at index 0, B at 1). FIX: never evict a followed point field (followedPointFields over ants+creatures) + ensureField in update.ts legTarget/inNestLeg. Test src/sim/locomotion/pointFieldEvict.gate2.test.ts (red without). NOTE: changes Lasius trajectories where the registry overflows. Re-running handover probe -> handover-fixed.txt
- 23:35 handover probe after fix: EQUAL 40000 ticks (handover-fixed.txt). Running vt-b: locomotion, behaviours/nest, behaviours/outdoor, rivals, nest.
- 23:40 report: sec 0 rewritten (item 4 KEPT, 12/15 by the letter, alt 13/15), sec 0b ruling 2 tables + hash check + restore, sec 2 item 4 kept, sec 6 items 1,3 rewritten, sec 1 new tests, sec 7, sec 8. Remaining: vt-b results, archive probes (tools/sim/probe -> test-output/gate-sim-2-fix/probes), final tsc, StructuredOutput.
- 23:50 vt-b: locomotion 160/161 (perf crit 7 timing, known), behaviours/nest 81 green, outdoor 86/87 (review.verify lasting threat 2100.6 s, known, same number as before), rivals 108 green, nest 157/158 (escapeDig, known). Probes archived to test-output/gate-sim-2-fix/probes and tools/sim/probe removed. tsc clean. tests/docs + new tests green. DONE -> StructuredOutput.
