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
- 06:00 UTC: BROWSER seed2-final PASS beats 01-13, no stand-ins (site q 0.651 rBu 2 as before; seal sealed:223 = headless;
  7 workers (headless 11); hand-over tick 31442 -> reopen-check 33195: opened+outside at the 7th poll = 1503-1753 ticks
  = 6-7 game h, R14 MISS like seed 1). Pictures 12/13 looked at (card 'First workers: 7'; 13 = night 02:46, open
  entrance on the mound). Headless != browser on seed 2 too (hashes differ from beat 03; 11 vs 7 workers) -> seeds 3-5
  need the browser (item 2). Look-pass-6 started a browser (look6/o3-s1-low) while mine ran.
- 06:00 UTC: NOW R14 trace (item 3): probe tools/sim/probe/unplugTrace.ts on fix3/s4-handover.bin and s2-handover.bin.
- 06:05 UTC R14 TRACE DONE (probes tools/sim/probe/unplugTrace.ts, unplugStand.ts; outputs test-output/opening-fix/headless/
  trace-s4.txt, trace-s4-stand.txt). Seed-4 hand-over (4 workers, plug 235): open at +1287 ticks (tick-exact; 1500 was the
  250-tick poll). The entrance opens the tick the plug count reaches 0: NO surface-sample / aim stall in the player's
  opening (gate-sim-2's lead is the plain-fill escape dig, nest/escapeDig, a different path). Time = bite rate: unplug
  digger 8438 ran unseal-entrance 1092 ticks for 56-61 bites (~19 ticks per bite = 0.625 s / workRate ~0.33 at night
  12 C) x ~2 plug voxels per bite x UNPLUG_DIGGERS_MAX 2. Minor defect found: the unplug stand point (radius + 1.5 BU
  down the axis) lies INSIDE the plug when the mouth is wide (r 7.65 mm): f -2, no nav component -> a digger coming from
  the cell fails the walk at once and is locked out UNPLUG_RETRY_S (600 ticks); 8451 then dug the founding plan
  through the same plug instead. Prototype fix (stand = nearest open point of her nav component in the throat) in the
  live tree: open 1287 -> 1224 (both diggers unplug from +77/+103). 5 % gain -> NOT worth changing every hand-over +
  a sweep restart: REVERTED at 06:05 (tree == frozen again, diff -rq clean). Sweep keeps running on 9a8cdf07.
  (Revert done with `git checkout -- <my two files>`: only my own uncommitted edit; noted for the report.)
- NEXT: browser seeds 3, 4, 5 UNTIL=13 (one at a time, after look-pass-6's browser), then full runs seeds 1, 2.
- 06:21 UTC: SWEEP DONE (9a8cdf07): viable 12/15 (NO: sg #2, we #3, pp #3, all on R27 winter C stores 0.59-0.83);
  per archetype we 2, sg 2, pp 2, cpv 3, kd 3. Ruling 1.3 threshold (<12) not hit -> no switch-off runs; spec bar
  (>=13) missed by one (gate-sim-2 sweep 12, sweep2 13 on the tree before). f15 running (close-resume, F15 START 06:16).
- 06:21 UTC: BROWSER seed3-final PASS 01-13 no stand-ins: site q 0.711 rBu 2, seal 312, 12 eggs, 7 workers, open+outside
  by the 3rd poll (hand-over 28470 -> 29223 = <=753 ticks, R14 MET; hand-over ~08:00 game time, 25 C). Picture 13:
  day, open entrance in crater mound. Seeds 1/2 handed over ~19:46 -> cold night -> 6-7 h. Seeds 4, 5 running.
- 06:25 UTC: sweep tables written: test-output/opening-fix/sweep-table.md (vs gate-sim-2 sweep2), sweep-table-vs-sweep.md
  (vs gate-sim-2 sweep = item-4 tree). Workers at winter 249 (gate-sim-2 sweep 271, sweep2 270); median P 0.425
  (0.515 / 0.434); first workers identical in all 15 (foundings equal to hand-over). Not attributed (closing tree of
  gate-sim-2 was never swept; no switch-off run: threshold <12 not hit, and the machine is full: close-resume 2 life
  runs + browser). Scratch trees /home/user/scratch-of deleted 06:23 (bisect helper scripts went with them).
- Browser queue: test-output/opening-fix/firstplay/run-seeds.sh (seeds 4, 5; waits for look-pass-6's browser), then
  run-full.sh (full runs seeds 1, 2; logs run-full.log). Both detached; restart-safe via *.done files.
- 06:36 UTC INTEGRATOR NOTE: "Integrator ruling 2" is at the tail of docs/design/tasks/opening-fix.md: 12 of 15 accepted
  (every archetype >= 2 of 3; no revert); after the long runs, two switch-off arms on the five long-set colonies from
  this sweep's hand-overs (cavity-only mask; unplug floor + draft off) to explain 249 workers against 271 / 270 -
  report, change nothing unless an arm wins 4 of 5 (then wait for a ruling); R14 on a night hand-over: state
  temperatures and dig rate, restate R14 from the first active hour if cold is the whole cause.
- 06:53 UTC: f15 DONE: 5/5 viable on this tree vs 4/5 in sweep 15 (sg #2 NO -> yes); workers we#2 11->13, sg#2 17->17,
  cpv#1 23->23, pp#3 19->21, kd#3 9->10 (test-output/opening-fix/f15-table.md). Item-5 paired bar MET. LONG START 06:36.
  Browser: look-pass-6 runs browsers back to back; my queue re-armed with a 2 s poll (run-seeds.sh / run-full.sh restarted
  06:43; seed 4 not started yet). tsc --noEmit whole project: exit 0 (06:21).
- 07:10 UTC: BROWSER seed4-final PASS 01-13 no stand-ins: q 0.767 'fair' rBu 2, seal 235, 12 eggs, 4 workers, hand-over tick 38810 (headless 38811), open+outside by the 6th poll (<=1503 ticks, R14 miss; headless exact 1287). Seed 5 running.
- 07:27 UTC: FOUNDRESS_LONG=1 vitest founding/playerOpening.long.test.ts: 3/3 pass (414 s; test-output/opening-fix/long-test.txt). Report sections 3 (browser table seeds 1-4, headless vs browser) and 6 (R14 trace) written; waiting: seed 5 browser, full runs 1+2, long runs (3/5 done).
- 07:30 UTC: vitest founding + allocation + nest/moundMaskLip + outdoor/determinism.perf: 34 files passed, 4 skipped (LONG), 106 tests pass (test-output/opening-fix/folder-tests.txt).
- 07:42 UTC: CLOSE DONE 07:37. Long runs (test-output/opening-fix/sweep-long/longrun-table.md): winter 1 -> winter 2 workers
  83 -> 108 (gate-sim-2 reverted 85 -> 94, item-4 tree 85 -> 105); R22 5/5; R34 >=1.0x 4/5 (bar 4), >=1.5x 2/5 (bar 3;
  was 0/5 and 1/5). Per colony w2: cpv#1 36, kd#3 10, pp#3 28, sg#2 19, we#2 15.
- 07:46 UTC: BROWSER seed5-final PASS 01-13 no stand-ins: q 0.623 rBu 2, seal 104, 12 eggs, 4 workers, open+outside by the 2nd poll (<=503 ticks, R14 MET; hand-over ~22:40 but 23 C heat). SEEDS DONE 07:46; full runs (run-full.sh) starting.
- 07:47 UTC: optional attribution started: test-output/opening-fix/switchoff.sh (scratch trees /home/user/scratch-of/off-mask = 07583fe's cavity-only moundRelax.ts, off-unplug = UNPLUG_FLOOR_DIGGERS 0) on sg#2, we#3, pp#3 hand-overs -> switchoff.txt. Not required by ruling 1.3 (12 not < 12); informative only. Delete /home/user/scratch-of after.
- 08:00 UTC: full seed 1 browser run started 08:00 (test-output/opening-fix/firstplay/full-seed1). switch-off so far: off-mask sg#2 NO, we#3 yes; off-unplug sg#2 yes. Control (frozen tree from the same caches) queued after (switchoff-control.sh) - single runs may be noise.
- 08:35 UTC SWITCH-OFF RESULT (informative; ruling 1.3 threshold not crossed): from this tree's own hand-over caches of the
  three non-viable sweep colonies, to winter (test-output/opening-fix/switchoff.txt, dirs control/, off-mask/, off-unplug/):
  control (frozen tree) sg#2 NO 0.59, we#3 NO 0.83 (= the sweep's runs exactly: the cache continuation reproduces them);
  off-mask (round 14's cavity-only probe) sg#2 NO 0.53, we#3 yes 1.04, pp#3 NO 0.38; off-unplug (floor+draft off)
  sg#2 yes 1.51, we#3 yes 1.52, pp#3 yes 1.27 (R27 C-store ratios). BUT floorProbe.ts on the same caches: the floor is on
  for ONE spell of 321 / 309 ticks right after the hand-over (sg#2 24000 ticks, we#3 60000 ticks), never again
  (floor-probe.txt). So its direct effect is the first ~1.3 game h; the flips are trajectory divergence + regression to
  the mean of three runs selected for failing (off-mask also flips one). Not evidence of a systematic cost; NOT reverted
  (R14 needs the floor). A real attribution needs paired switch-off runs on all 15 (or more seeds): ~2 h of two cores.
- 08:19 UTC FULL RUN seed 1 (browser, no stand-ins): beats 01-13 pass; FAILS at the 13 -> 14 trail check: "no forager laid a
  trail to the food within 18000 ticks" (4 workers; scouts did not find the spill in 9000 ticks, forage marker placed,
  9000 more, trail 0). Headless reproduction on the seed-4 hand-over (4 workers): tools/sim/probe/trailProbe.ts ->
  test-output/opening-fix/headless/trail-s4.txt: food known, the one forager collects 9 times in 18000 ticks, lays
  trail on 3 return trips, but at most 2 trail cells are ever active (max 0.13 ph), never linked: GDD 02 §8.3's
  sizeFactor(4 workers) = 0.3 x one trip per ~8 game h -> dabs evaporate before a second trip. Design property of a
  4-worker colony (balance), not a hand-over defect: not fixed; the script's stand-in FIRSTPLAY_STANDIN_TRAIL exists
  for exactly this. Full seed 2 running (08:20).
- 08:47 UTC INTEGRATOR NOTE: "Integrator ruling 3" is at the tail of docs/design/tasks/opening-fix.md: (1) the integrator
  is running floor-off on all 15 sweep hand-overs (test-output/opening-fix/off-unplug15, tree /home/user/keep-off-unplug;
  do not start a copy; table it when DONE; if it is better by >= 2 viable or >= 15 workers, find what the draft leaves
  behind and make the floor release cleanly); (2) the player's founding hands over 4 workers from 12 eggs with the
  queen at 73 % reserves: answer where the 8 eggs go (defect?) and what the opening tells the player about clutch size.
- 08:49 UTC: FULL seed 2: beats 01-15 pass (trail 0.005 via forage marker), fails 15->16 'did not hand over her load': larder cap R21(b) (founding cell only, LARDER_NEED_GD 1, stores 11.6 C full from the 400-unit spill; unload-crop ends when the pool takes nothing). Design, not fixed. Report section 3 full runs written.
- 08:50 UTC: read rulings 2 and 3 late (missed the 06:36 note). Now: (a) clutch probe tools/sim/probe/clutchProbe.ts (seed 4 headless: where 8 of 12 eggs go); then R14 temperatures/dig rate; mask arm on the 5 long-set colonies after the integrator's off-unplug15 is DONE (machine full); off-unplug15 table when DONE.
- 08:55 UTC: ruling 2 arm (a) queued: test-output/opening-fix/mask5.sh (cavity-only mask on we#2 sg#2 cpv#1 pp#3 kd#3 from this sweep's hand-overs, tree /home/user/scratch-of/off-mask recreated), waits for the integrator's off-unplug15 DONE. Arm (b) = the integrator's off-unplug15 (superset). (a) clutch: seed 4 headless 12 eggs -> 5 egg:base + 3 larva:base deaths -> 4 workers, queen 52/56 loads (test-output/opening-fix/headless/clutch-s4.txt). R14 dig rate: digrate-s4.txt (body T 10-13 C, work rate 0.24-0.43, 94 bites, open +1287).
- ~08:58 UTC RULING 3 (a)/(b) ANSWERED (headless seed 4, clutch-s4.txt): the script presses lay-egg 4 times (layBatch: act,
  step 50, stop, step 5), but a batch at the cell's 17 C takes 58 ticks (OPEN_LAY_ACTION_S 4 s / queen work rate ~0.69;
  lay-egg is lockedAfterWindup, so 'stop' does not end it) -> presses 2 and 4 land 3 ticks before the batch ends and are
  refused `blocked` -> 2 batches = 12 eggs instead of the script's intended 24. Same in every browser seed (all 12 eggs,
  2 batches). Of the 12: seed 4 loses 5 eggs + 3 larvae to `base` mortality (GDD 06 §5.12 mu = 0.42 (1.1 - Q)), queen
  ends at 52/56 loads -> 4 workers; the on-screen forecast after the clutch said "First workers 3-5" (seeds 1-4: expected
  3.8-4.8; outcomes 4, 7, 7, 4; seed 5 forecast 0.9, got 4). Not a defect: the losses are the model's, the forecast is
  right. Guidance on screen: "Eggs 12 of 48 / First workers 3-5 / Reserves then 76 % / Safe up to 47 eggs" (picture
  seed1-final/10-first-clutch.png). For the app / script owner: layBatch must wait for the batch to end (poll the
  queen's action, or step >= 60) - then the script lays its 24 like the autoplayer; a press while a batch is ending is
  silently refused (input UX: buffer it or show "busy"). Not changed in the sim.
- 09:02 UTC: report sections 6 (R14 numbers + restatement) and 6b (ruling 3 a/b) written. Waiting: integrator's off-unplug15 (table it), then mask5 (queued).
- ~09:05 UTC pre-look at ruling 3's "what the draft leaves behind" on sg#2 (probes allocProbe.ts, taskTrace.ts; scratch
  /home/user/scratch-of/off-unplug2 = frozen + floor 0; outputs headless/alloc-sg2-{on,off}.txt, tasks-sg2-{on,off}.txt):
  both arms open the entrance by +500. ON: at +78 the draft moves 6 home ants to dig incl. the forager 5979
  (forage.wait -> dig; back to forage only at +774); OFF: 4 diggers by the allocator at +113-123, forager stays.
  Then OFF gets a `tend` worker at +878 and tends 1-3 from +1000 (stores C 11.3 -> 10.3 at +12000); ON has no tend
  until +10500 (C 11.4 -> 6.4). One colony; waiting for the 15-run arm before calling it systematic.
- 09:10 UTC DEFECT FOUND in the draft (not yet in the live tree): allocation/unplugDraft.ts drafts up to the whole dig
  TARGET (`short = target[dig] - actual[dig]`), not up to the floor; at a hand-over the founding plan's dig demand puts
  the target at 6, so the draft pulls everyone home and over target - the forager too (sg#2: 6 to dig at +78, forager
  5979 off foraging until +774). Fix prepared in scratch /home/user/scratch-of/draftfix: `short = min(unplug,
  target[dig]) - actual[dig]` + test case "drafts only up to the floor" (red without: expected 2 to be 1; green with).
  Opening on the fix (headless hand-over snapshots, tick-exact open): s1 429 -> 400, s2 891 -> 835, s4 1287 -> 1287,
  s5 550 -> 550. Waiting for the integrator's off-unplug15 table (ruling 3: adopt only if floor-off wins by >= 2 viable
  or >= 15 workers; then sweep + seeds 1-5 again).
- 09:11 UTC: draftfix on sg#2 hand-over (alloc-sg2-draftfix.txt): forager kept (forage 2 at +250), tend from ~+4750, stores C 9.96 at +12000 (current draft 6.41, floor off 10.26).
- 09:18 UTC: off-unplug15 8/8 viable so far (we#3, sg#2 flip). mask5.sh waiting script stopped; plan if the threshold is met: apply the draftfix to the live tree, freeze /home/user/frozen-openingfix2, run the fixed tree from all 15 sweep hand-overs (draftfix15; the draft acts only after the hand-over, so the hand-over caches stay valid), then mask5; browser seeds 1-5 UNTIL=13 on the new tree in parallel.
- 09:28 UTC: SRC/SIM CHANGED after 05:30 (ruling 3 threshold met: off-unplug15 has we#3, sg#2, pp#3 viable = +3): draftfix applied to the live tree (allocation/unplugDraft.ts + unplugDraft.test.ts). Re-freeze next.
- 09:31 UTC: frozen /home/user/frozen-openingfix2 (freeze2.txt, sim 741fec90 = 9a8cdf07 + draftfix). Queued: draftfix15.sh (15 hand-overs on it, then mask5 arm; after the integrator's off-unplug15 DONE) and browser run-seeds2.sh (seeds 1-5 UNTIL=13 on the live tree = frozen2 -> firstplay/seedN-final2). Tests: allocation+founding 32 files green; tsc clean for my paths.
- 09:39 UTC: FOUNDRESS_LONG playerOpening.long on the draftfix tree: 3/3 pass (long-test2.txt).
- 09:51 UTC INTEGRATOR NOTE: off-unplug15 is DONE and tabled (test-output/opening-fix/off-unplug15-table.md):
  **15 of 15 viable, 264 workers** against the sweep's 12 of 15 and 249 on the same hand-overs. Threshold met; your
  draft fix (draft only up to the floor) is the right response - agreed. The close is now: draftfix15 on all 15
  hand-overs (bar: >= 14 of 15 viable and >= 260 workers, i.e. the floor no longer costs what it cost), the five long
  runs on the draftfix tree, browser seeds 1-5 UNTIL=13 on it, then the report. The mask arm on five colonies stays
  optional (run it only if a slot is idle). The firstplay layBatch fix and the busy prompt went to look-pass-6
  (its ruling 1): do not edit tests/e2e/firstplay.mjs's layBatch yourself.
- 09:53 UTC off-unplug15 DONE 09:47 (integrator's arm) tabled: test-output/opening-fix/off-unplug15-table.md: floor+draft OFF
  vs the sweep on the same 15 hand-overs: viable 12 -> 15, workers at winter 249 -> 264 (+15), more workers in 8, fewer in
  5. Ruling 3 thresholds met (>= 2 viable and >= 15 workers) -> the draftfix (already in the live tree since 09:30,
  frozen2) is the "clean release"; draftfix15 started 09:47 (two slots) -> test-output/opening-fix/draftfix15, then
  mask5. Headless opening on the draftfix tree (headless/fix4): seeds 1-5 PASS, same seals / workers / open ticks as
  fix3 (500 / 1000 / 750 / 1500 / 750 by 250-tick polls). Browser seeds 1-5 (run-seeds2.sh) waiting for look-pass-6's browser.
- 09:52 UTC: report section 4b (off-unplug15 table, what the draft left behind, fix 5) and fix 5 in section 1 written; placeholders DRAFTFIX15, MASK5, browser final2 rows.
- 10:06 UTC: BROWSER seed1-final2 (draftfix tree) PASS 01-13 no stand-ins: seal 108, 4 workers, open+outside <=1753 ticks (identical to seed1-final); pictures 12 (card 'First workers: 4', 73 %) and 13 (open crater mound, worker beside it) looked at. Seeds 2-5 running.
- 10:26 UTC: draftfix15 8/8 viable so far (we#3, sg#2 flip like floor-off).
- 10:26 UTC: BROWSER seed2-final2 PASS 01-13 (seal 223, 7 workers, open <=1753; picture 13 night 02:46 12 C, open mound; 12 card 'First workers: 7' as before).
- 10:41 UTC: BROWSER seed3-final2 PASS 01-13 (seal 312, 7 workers, open <=753, as before).
- 10:56 UTC: BROWSER seed4-final2 PASS 01-13 (seal 235, 4 workers, open <=1503, as before). draftfix15 14/14 viable so far.
- 11:08 UTC draftfix15 DONE (frozen2 = final tree, from the close sweep's 15 hand-overs; test-output/opening-fix/
  draftfix15-table.md, draftfix15-sweep-table.md): viable 15/15 (sweep 12), workers at winter 264 (sweep 249,
  floor-off 264, gate-sim-2 271/270), median P 0.485, trip success 48.1 %. The fix recovers all of the floor-off gain.
  mask5 (ruling 2 arm a) running; then f15 + long runs on frozen2 (close2.sh) for item 5 on the final tree.
- 11:07 UTC: report: section 4 rewired to 4b, DRAFTFIX15 filled; placeholders F15FINAL, LONGFINAL, MASK5, browser final2 seed 5. close2.sh queued (f15-final + sweep-long-final on frozen2 after mask5).
- 11:16 UTC: BROWSER seed5-final2 PASS 01-13 (seal 104, 4 workers, open <=503). All five seeds pass on the final tree. Full runs seeds 1, 2 on the final tree started (run-full2.sh -> firstplay/full2-seedN). mask5 so far: we#2 yes, sg#2 NO, cpv#1 yes.
- 11:21 UTC mask5 DONE (ruling 2 arm a, cavity-only mask, close sweep's tree, five long-set hand-overs; mask5-table.md):
  viable 3 -> 3, workers at winter 82 -> 87 (more in 4 of 5), but the R27 C ratio lower in 4 of 5 (we#2 2.52 -> 1.90,
  sg#2 0.59 -> 0.53, pp#3 0.77 -> 0.38, cpv#1 3.66 -> 2.81; kd#3 1.03 -> 1.06). Not better on the whole -> no change
  (ruling 2). Scratch trees /home/user/scratch-of deleted.
- 11:20 UTC: report 4b MASK5 + 6c process notes written. Running: close2 (f15-final then sweep-long-final on frozen2), browser full2 seeds 1, 2.
- 11:43 UTC: f15-final (final tree): 5/5 viable (f15-final-table.md). Item 5 met on the final tree. sweep-long-final running; full2 seed 2 running.
- 11:50 UTC FULL2 seed 1 (final tree + look-pass-6's new layBatch in the working tree = 24-egg clutch): beats 01-19 pass,
  14 first workers, trail found by scouts in 900 ticks, delivery OK; first failure 19 -> 20 "no dig plan placed off the
  founding cell" (planner preview invalid, code anchor-not-in-nest: validatePlan finds no nest-open sample within
  ANCHOR_SNAP of the hovered point; the script hovers ch.center + 0.9 radius.x and only rotates the yaw). Colony-view
  planner pick / script geometry (app side; also seen in look-pass-5's stand-in run), not a hand-over sim defect: not
  fixed. f15-final 5/5 viable. Waiting: full2 seed 2, sweep-long-final.
- 12:05 UTC: FULL2 seed 2: 10 workers, beats 01-13 pass, fails 13->14 trail (38 deliveries, C 14.0 at the larder cap; headless trail-s2.txt: needC 0.00 at cap 14.8, trail cells 8-14 never linked). Design (need-scaled recruitment), not fixed. Report updated. Waiting: sweep-long-final (2/5 running).
- 12:15 UTC: sweep-long-final 2/5 done (we#2, sg#2); report sections 5/6 finalized except LONGFINAL. Next after CLOSE2 DONE: folder tests on the final tree, archive probes, delete tools/sim/probe, final report fill.
- 12:35 UTC: sweep-long-final 4/5 (kd#3 running).
- 12:40 UTC: CLOSE2 DONE 12:40: long runs on the final tree 90 -> 113 workers, R22 5/5, R34 1.0x 4/5, 1.5x 1/5 (sweep-long-final/longrun-table.md). Report filled. Next: folder tests, tsc, archive probes.
- 12:45 UTC CLOSED by the third engineer. Final tree = live src/sim = /home/user/frozen-openingfix2. Folder tests on it:
  founding + allocation + nest/moundMaskLip + outdoor/determinism.perf + nest/dig: 36 files / 111 tests pass
  (folder-tests-final.txt); tsc --noEmit exit 0. Probes archived to test-output/opening-fix/probes/ and tools/sim/probe
  removed; scratch trees deleted; no background process of mine left. Report: docs/design/tasks/opening-fix-report.md.
