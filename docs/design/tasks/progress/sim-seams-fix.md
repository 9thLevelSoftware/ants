# sim-seams-fix progress
Started. Findings to handle: (1 major) zone-crossed fires for queen; (2) createNewGame throws without rivals/wiring; (3) stagger tests check nothing; (4) founding phases test (reviewer added, just verify).
Done: none yet.
- F1 (queen zone crossing): edited progression/discovery.ts (WORKER_CROSS_KEY memory, worker-only), milestoneRules.ts (zoneCrossing, on+poll), triggers.ts (WORKER_CASTES). Testing next.
- F1 DONE: discovery.verify + triggerTable (new test "the queen and a male entering another zone ...") + milestones green.
- F2 (late-bind trap) in progress.
- F2 DONE: rivals/late.ts rivalsImplIfLoaded; init.ts initRivals(ctx, world, impl = loaded-or-null) falls back to first-tick build; test creation.test.ts "creating a game without the heavy half loaded ..."; probe test-output/sim-seams-fix/createOnly.ts (THROWS before, ok after).
- F3 (stagger allowlist) in progress.
- F3 DONE: commands.robust.test.ts KNOWN_PAIRS allowlist (pairs from test-output/sim-seams-fix/staggerPairs.txt) + self-check test; 14 green.
- Next: full runs of my folders (progression, save, root cmd/time, rivals), typecheck, report update.
- ALL DONE 04:17 UTC: typecheck clean; my folders green except known time.test.ts (human/schedule.ts:48, not mine). Report section "Review fixes" appended to docs/design/tasks/sim-seams-report.md; rivals README row updated.
