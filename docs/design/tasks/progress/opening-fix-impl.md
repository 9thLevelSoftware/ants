# opening-fix-impl progress
Started Nov 23 23:40 UTC. Fresh start (no earlier progress file).
## Done
- (nothing yet) reading docs
## In progress
- reading docs
## Remaining
items 1-8 of spec
- 23:55 headless driver written: tools/sim/opening.ts (run: node tools/sim/run-ts.mjs tools/sim/opening.ts --seed N --out DIR). Seed 2 reproduces in 40 s: lapse ends `failed` (same site q 0.651 rBu 2 as browser r9). Output test-output/opening-fix/headless/live/
- bisect seed 2: PASS 4ab0ebd,0a54841,cbe7f4d,c712e20; FAIL 995244e (seal sealed:93 vs 229)
- 00:50 SEED 2 CAUSE: breaking commit 995244e = round 14's mound-mask hole probe (moundRelax.ts buildMask reads carve.cavity, not field f) - isolated by patching 819c2c3 with only that hunk (t-xmask FAIL) vs only nests.ts hunk (PASS). Mechanism: it rains during the player's dig (t 2576-5001), the open shaft takes ~6 BU^3 water (designed inflow at a flood-safe site, c 0.17); both trees have the water at lapse start. The mask change perturbs the seal (plug 93 vs 229 voxels); the script's walk-down then leaves the queen at the cell bottom (y -4, in 3 mm water) instead of up the shaft (y 14.7). In the lapse the queen is held at rest (system.ts holdStill) and fleeWater excludes founding queens -> she drowns at t 6671 (cause drowning). Latent defect; mask change is only the trigger.
- FIX 1 (in progress): src/sim/colony/founding/dryQueen.ts keepQueenDry (walks her by intent along cavityRoute to dryFloorAbove(level+margin)); wired in system.ts timelapse case after holdStill. Testing headless -> test-output/opening-fix/headless/fix1
- probes: tools/sim/probe/floodProbe.ts, waterProbe.ts (archive + delete at end). Scratch trees /home/user/scratch-of/t-* (delete at end). bisect outputs test-output/opening-fix/bisect/
- 01:15 FIX 1 done: dryQueen.ts + system.ts hook; test src/sim/colony/founding/dryQueen.test.ts (2 tests, red without hook: queen drowns, green with). Headless seed 2 passes 01-13 (6 workers; entrance opens 4000 ticks after hand-over = 16 gh > R14 4 h, but script waits 7500).
- firstplay.mjs: added FIRSTPLAY_DUMP=1 instrumentation (dump.jsonl per beat + lapse-start + reopen-check; instrumentation only).
- seed 1: headless on live PASSES (24 eggs/4 batches, 12 workers, open after 750 ticks) but browser fails (12 eggs, reopening:130) -> headless != browser for seed 1. Need browser run with FIRSTPLAY_DUMP to compare hashes (browser busy with look-pass-6).
- 01:35 browser seed1-a (live+fix1, DUMP): beats 01-07 ok, beat 08 FAILED "camera inside solid in the chamber" (app: look-pass-6 has src/render/camera + src/game/views edits in progress). Browser diverges from headless already by beat 06 (tick 1591 vs 1569). Headless now uses the game's 200-event log cap. Waiting for browser (one at a time) to run seed1-b with FIRSTPLAY_CONTINUE + FIRSTPLAY_CHECKPOINT (save after the reopen check) -> load headless to study the stuck reopen.
- running headless seeds 3,4,5 (item 7) -> test-output/opening-fix/headless/fix1/
- 02:05 SEED-1-TYPE CAUSE (found headless on seed 2's hand-over + seed 4 fails headless: reopening never opens): after the hand-over the auto allocation gives `dig` 0 workers (6 nanitics: nurse, queen-care, scout floor (R38), forage, store; one possessed by the player) -> throat stays `reopening` (exposed plug rim) -> no `open`. FIX 2: unplug floor: colony/allocation/demand.ts unplugFloor(), targets.ts planTargets serves UNPLUG_FLOOR_DIGGERS (balance/colony.ts, =2) diggers right after the brood's care while a nest has no open entrance and entranceToUnplug. seed-2 snapshot: open after 750 ticks (was 4000 / never). Probe tools/sim/probe/reopenProbe.ts + snapshot test-output/opening-fix/headless/s2-handover.bin (opening.ts --save-handover).
- headless seeds (fix1 tree): 3 PASS, 4 FAIL (reopen), 5 not yet run. CHANGES EVERY GAME after hand-over -> full sweep needed.
- 02:20 refactor: driver moved to src/sim/colony/founding/playerOpeningKit.ts (runOpening, Driver, openingSim); tools/sim/opening.ts = CLI; probes import the kit. Tests: src/sim/colony/allocation/unplugFloor.test.ts (2, red without floor), src/sim/colony/founding/playerOpening.long.test.ts (FOUNDRESS_LONG, seeds 1,2,4, R14). Typecheck clean in my paths.
- 02:30 DEVIATIONS rows D40 (dryQueen) and D41 (unplug floor) written. Waiting: headless seeds 4/5 on fix2 tree (task bi0vxvks6), browser seed1-b (fix1 tree, CONTINUE + CHECKPOINT test-output/opening-fix/firstplay/seed1-b.save).
- NEXT: founding + allocation folder tests; bisect seed 4 reopen (4ab0ebd vs live) for "breaking commit" of the reopen failure; then freeze tree -> /home/user/frozen-openingfix, run tools/sim/sweep-life.sh + longrun (5 runs); browser confirm seeds 1,2 (UNTIL=13) + full runs; report.

## RESTART 8 (container restart ~00:44 UTC Nov 24). Second engineer resumes at 00:46 UTC (real `date -u` from here on;
the stamps above ran ~2 h ahead: "02:30" above = ~00:30 UTC).
- Tree check 00:50 UTC: git clean at 07583fe (= snapshot 0404e5a + ruling 1). Fix 1 (dryQueen) + fix 2 (unplug floor) in tree.
- Found on disk (lost with the restart only in the notes): headless fix2/opening-4.json PASS (open after 3000 ticks, 4 workers),
  fix2/opening-5.json PASS (open after 750, 4 workers) - BUT these started ~00:30 before targets.ts's last edit (00:33).
  fix2b/opening-4.json (00:41, final tree, run with --save-handover) FAILS: reopening:235, no digger; while
  reopenProbe from that same s4-handover.bin opens after 3000 ticks. => suspect snapshot() perturbs the live sim, or
  restore != live. To check.
- NEXT (ruling 1): (a) unplug floor with <5 workers + unit test; (b) mound-mask probe rebuilt (direction 30b item 5);
  (c) snapshot side effect; then headless 1-5, browser 1,2, frozen-tree sweep + 5 long runs, report.
- 01:02 UTC done since restart:
  (a) RULING 1.1 wide mound-mask probe: src/sim/world/field.ts `withoutOverlays(skip, fn)` (additive WorldField method);
      src/sim/nest/moundRelax.ts buildMask probes f (sampleXYZ) with the pile overlays left out (ground deltas kept),
      maskSignature also keys dynamic prims near the grid. Guards green: nest/mound* (8 files), pointFieldRestore,
      pointFieldEvict.gate2, outdoor/determinism.perf. Seed 2 headless (test-output/opening-fix/headless/wide/):
      PASS, seal sealed:223 (round 9: 229, live: 93), 11 workers, queen at lapse y -3.9 (cell y 1.3), open after 1500.
      sg #2 36000-tick restore check RUNNING (tools/sim/probe/probe-restore14b.ts -> test-output/opening-fix/restore/sg2-wideprobe.txt).
  (b) RULING 1.2: targets.ts serveUnplugFloor: nurses' full demand first, then the floor's diggers (never lowers the
      nurse target); unplugFloor.test.ts case "a founding of 4 or 3 free workers" (216-case grid, red without the top-up).
  (c) NEW: allocation/unplugDraft.ts draftUnplugDiggers (each alloc pass, while dig actual < target and the floor
      holds: home ants over their task's target, not nurses, switch to dig). s4 hand-over probe: open 3000 -> 1750 ticks
      (reopen-s4-draft.txt). Needs a unit test.
- NEXT: unit test for the draft; allocation + founding + nest folder tests; headless seeds 1-5; browser.
- 01:13 UTC: unplugDraft.test.ts (2) + moundMaskLip.test.ts (red on cavity-only probe) written; long test reworked
  (seeds 1,2 at R14; seed 4 at beat 13's 7500). DEVIATIONS D41 updated, D42 (wide probe), D43 (draft) added.
  sg #2 restore (wide probe tree): EQUAL for 36000 ticks (test-output/opening-fix/restore/sg2-wideprobe.txt).
  Headless fix3 tree (test-output/opening-fix/headless/fix3/summary.txt, opening-1.json): ALL PASS
  s1 seal 165, 13 workers, open 500 | s2 seal 223, 11 w, open 1000 | s3 seal 361, 8 w, 750 | s4 seal 235, 4 w, 1500 (R14 miss) | s5 132, 4 w, 750.
  (the fix2b failure was the tree changing under a running process, not snapshot(): fix3 s4 ran with --save-handover and passed.)
  Folder tests: founding+allocation 32 files green; nest/world/balance 71 green, 3 red = also red on HEAD 07583fe
  (nest/escapeDig, nest/architect/layout perf, nest/flood/readersCost.verify) -> pre-existing.
- NEXT: freeze tree -> /home/user/frozen-openingfix; sweep-life.sh (fresh cache test-output/opening-fix/cache) + 5 long
  runs -> test-output/opening-fix/sweep, sweep-long (script test-output/opening-fix/close.sh). Browser seeds 1,2 meanwhile.
- 01:15 UTC: tree frozen -> /home/user/frozen-openingfix (tree 9a8cdf07); close.sh RUNNING (setsid; log test-output/opening-fix/close.log; sweep -> test-output/opening-fix/sweep, f15 -> .../f15, long -> .../sweep-long). Do NOT edit src/sim until it is done unless a fix is needed (frozen copy runs its own code anyway). Next: browser seeds 1,2 UNTIL=13.
- 01:27 UTC: browser seed1-final (UNTIL=13, DUMP) running -> test-output/opening-fix/firstplay/seed1-final; report draft written (placeholders BROWSER_*, SWEEP_*).
- 01:33 UTC: BROWSER seed1-final PASS beats 01-13, no stand-ins (4 workers, seal 108, open:0; hand-over tick ~26987 -> reopen-check 28740 = ~7 game h, R14 MISS; pictures 12/13 looked at: outcome card 'First workers: 4', open entrance on crater mound, a worker outside). Experiment floor-before-queen-care on s4 hand-over: no gain (1500 both; only 2 workers home) -> reverted, tree == frozen. Next: browser seed 2.

## RESTART 9. Third engineer resumes 05:29 UTC Nov 24 (date -u).
- Tree check 05:29 UTC: git clean at 04a155c; src/sim and tools/sim == /home/user/frozen-openingfix (diff -rq empty).
  close-resume.sh running (integrator, 05:27): sweep 5/15 done, rest running. Not touched by me.
- 05:30 UTC: browser seed 2 UNTIL=13 DUMP starting -> test-output/opening-fix/firstplay/seed2-final (+ .log).
