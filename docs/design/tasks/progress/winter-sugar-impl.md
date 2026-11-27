# winter-sugar implementation progress

Started 2026-11-24 13:08 UTC (fresh; no earlier engineer).

## Done
- tools/sim/lifeSugar.ts (new observer, wired into tools/sim/life.ts as report.sugar): per day C in by source class,
  C out by use, tend/forage worker-gd, tend demand/target, herds workable/known, needC, wantC, storesC, R27 need;
  firsts: entrance open, first tender, first tend demand, first workable herd, first tender outside (ticks after start).
- Frozen trees (13:14): /home/user/ws-base (= live sim 741fec90 tree + new tools; sim+test hash bcebd900),
  /home/user/ws-armW (base + R41: needs.ts carbStockWanted/WINTER_PATH_C_KEY, needC/intakeTarget, demand.ts forageWant,
  economy.ts writes the path; test src/sim/colony/r41w.test.ts 5/5 green there; hash 83ad1a93).
- Queue started 13:15 UTC: test-output/winter-sugar/runq.sh jobs-1.txt (detached; base + arm W: 5 long runs to day 40
  then 10 year-one runs to winter, from opening-fix/cache b6f4323d hand-overs). Outputs base-long, armW-long, base-y1,
  armW-y1 under test-output/winter-sugar/. Restart-safe: rerun `nohup setsid bash runq.sh jobs-1.txt &` there.
- Finding: year one of a long run == the to-winter run from the same hand-over (day states equal), so an arm =
  10 to-winter + 5 long runs.

- A1 (live): playerOpeningKit.ts R14 clock (`warmFromTicks`: first game hour after the hand-over with airTemp at the
  mouth >= forageGate.b), playerOpening.long.test.ts restated (seeds 1, 2, 4 with 4 batches + seed 4 with 2 batches,
  bound = warmFrom + 4 h). DEVIATIONS R14 row restated.
- A2 (live): kit layBatch = firstplay.mjs's (press, 10 ticks, release, wait for action-completed/failed lay-egg in the
  event log); option layBatches (default 4); tools/sim/opening.ts --lay-batches.
- A3 (live): nest/entrances.ts unplugStandPoint (+ nest/index.ts export); ants/behaviours/nest/dig.ts unplugStep uses
  it, and no UNPLUG_RETRY_S lockout for a walk failed against the plug. Test ants/behaviours/nest/unplugStand.test.ts
  (2 cases; green live, both red on ws-base: plug never opened in 4000 ticks / no export). DEVIATIONS D44.
  Probe tools/sim/probe/unplugTimes.ts on opening-fix headless/s4-handover.bin: before open +1503, 2nd digger
  barred at +67 never bit; after open +1235, both bite from +69 / +106.
- Opening runs seeds 1-5 (+ seed 4 two batches) on /home/user/ws-a2 (A1+A2 kit, no A3) and /home/user/ws-a3
  (A1-A3) running: test-output/winter-sugar/opening/run.sh -> a2/, a3/, a2-b2/, a3-b2/, summary.txt.
- tools/sim/sugar-table.py (item 4 table from report.sugar).

## In progress
Waiting for base/armW runs; after the opening runs: unit tests of founding, allocation, nest, behaviours/nest dig;
then FOUNDRESS_LONG playerOpening.long.

## Remaining (order)
A1 R14 restated, A2 layBatch port, A3 unplug stand point; B4 table (from base runs); B5 arm T?; B6 adopt; B7 third year;
C8 fresh sweep + long; C9 report.

## Findings / decisions
- autumnStockMult (R6) already raises the C target to the R27 need x 1.25 in autumn (doy 15-21) in every year; so R41
  changes summer (doy 7-14) only, plus forageWant/tenders. pp #3 y2 (sweep-long-final): C 0-4 all summer and autumn,
  income < use with 30-40 workers + brood; tend 2-3 vs forage 9-14. Not "demand never asking" there.
- Arm W = round 13's carbStockWanted read by needC, forageWant (tenders) and intakeTarget (R41 per direction 27a item
  1); no other round-13 rule.

## Evidence paths
test-output/winter-sugar/

## Log
- 13:50 unit tests founding + allocation + dig/unplugStand/digHaul + nest entrance tests: 42 files / 150
  tests green (test-output/winter-sugar/tests-A.txt). Base rerun of pp #3 long: finalHash c84a5641 == sweep-long-final
  (observer neutral). Arm W pp #3 winter 2: C 21.3 / R27 8.1 (2.61) vs base 0.7 / 8.6.
- Opening (headless, 4 batches = 24 eggs): seed 2 open 1500 -> 500 with A3 (warm at hand-over); seed 4 1750 -> 1250
  (cold all the way); seeds 1, 3 unchanged (500, 750). R14 restated: seed 2 before A3 misses (1500 > 0 + 1000).
- life.ts: report.winter1 (state + viable verdict at the first tick of Winter 1 for runs that go on) added 13:5x for
  later runs (not in base/armW queue runs, which started before).
- 14:08 A1-A3 DONE. FOUNDRESS_LONG playerOpening.long 4/4 green live (test-output/winter-sugar/long-test.txt).
  Opening table test-output/winter-sugar/opening/table.txt. Remaining: wait base/armW; item 4 table; arm T decision.
- 14:19 Item-4 lead (pp #3, sg #2 y2 base): on brood-peak days (y2 doy 10-11, 15-16) tend DEMAND 6-12 but
  tend TARGET 0-1: GDD 6.3 order serves forage + store before tend; tenders (0.47 C per tender-day) dropped while
  needC 0.9-1. Arm T built in /home/user/ws-armT (hash e25875a5): demand.ts tendFloor/TEND_FLOOR_KEY (R39 keep per
  workable herd while needC > 0 and workable), served with the scout floor before forage (targets.ts planTargets);
  test src/sim/colony/allocation/tendFloor.test.ts there (2 cases green). Queued: jobs-2.txt via chain2.sh (starts
  when jobs-1 prints QUEUE DONE in queue.log). If arm T is dropped: kill chain2.sh.
- 14:31 /home/user/ws-armWT ready (arm T + arm W), for the pair only if each alone is not worse. Tables:
  tools/sim/arm-table.py --base base-y1all base-long --arm armW-y1 armW-long (base-y1all = symlinks of draftfix15 for
  the 5 long colonies + base-y1). frozen-openingfix2 deleted (ws-base = same sim).
- 15:03 Long runs base + arm W done. base: w2 113, R34 4/5, R27 w2 3/5 (pp3 0.09, sg2 0.66). arm W: w2 115,
  R34 5/5, R27 w2 4/5 (sg2 0.33 fails). y2 eggs base 273 -> W 222 (eclosions 97 -> 101, larvae starved 16 -> 4): check
  the laying trade before adopting. Item 4 (long): failing colonies = needC>0 on 14 summer/autumn days AND tend demand
  unserved 15.5 / 38.6 worker-days (target << demand); meeters needC>0 2-5 days, unserved 0-4.7. Points at tending ->
  arm T queued (jobs-2). Tables: test-output/winter-sugar/item4-long-base.md, item4-long-armW.md.
- 15:04 Arm W trade found: y2 summer P delivered pp3 41.7 -> 27.0, cpv1 34.2 -> 30.8; queen held by p-days
  on y2 doy 11-14 (pp3: eggs doy 12-15 base 11,12,6,8 -> W 1,0,0,2). Spec: a rule that buys sugar by stopping the
  queen in summer is not adopted -> arm W likely NOT adopted (decide with its y1 table).
- Requeued for speed: killed runq jobs-1 + chain2 (the 2 running life processes base-y1 we3, armW-y1 we1 continue,
  their summary lines will be missing). New runner runq2.sh (counts all life.ts processes) on jobs-3.txt: armT-long x5
  first, then the remaining base/armW y1, then armT-y1. Restart: cd test-output/winter-sugar; nohup setsid bash
  runq2.sh jobs-3.txt &  (skips done JSONs; also rerun base-y1 we3 / armW-y1 we1 if their JSON is missing).
- 15:32 Arm T long: sg2 w2 C:need 16.8:4.7 (3.58; base 0.66), pp3 12.2:7.5 (1.62; base 0.09), we2 5.14;
  workers w2 sg2 19 (22), pp3 26 (28), we2 12 (9). cpv1, kd3 running.
- 15:51 Arm T long done: w2 113 (=base), R34 5/5, R27 w2 5/5. Trade like W: y2 eggs 273 -> 197, P delivered
  y2 156 -> 113 (W 130), eclosions 97 -> 100, larvae starved 16 -> 3, brood deaths 203 -> 127; no multi-day laying stop
  except sg2 doy 14-16, cpv1 doy 14-15 (0 eggs). Same reading for W (pp3 doy 12-15). Decision rule I apply: the trade
  clause fails a rule if eclosions or larvae fed/starved get worse or laying stops for the summer; neither does.
  Appended armWT-long x5 to jobs-3.txt (pair, long runs first; y1 of the pair only if the long runs are not worse).
- 15:52 Requeued again: base year-one reruns cut to 2 game days after the hand-over (base-y1short, mode
  day7: only the first-tender ticks are new; whole-year numbers = draftfix15, identical games). Runner runq2.sh on
  jobs-4.txt: base-y1short x10, armW-y1 remaining, armT-y1 x10, armWT-long x5. Running outside it: armW-y1 we3,
  base-y1 sg1 (full). Trade table tools/sim/arm-trade.py -> test-output/winter-sugar/trade-long.md.
- 16:28 ARM W TABLE DONE (test-output/winter-sugar/armW-table.md): y1 14/15 viable (we3 0.75 R27, base
  1.77), workers 264 -> 267; long 113 -> 115, R34 5/5, R27 w2 4/5 (sg2 0.33). Meets item 6's bars; trade eggs -19 %,
  eclosions +4. Item 4 y1 table test-output/winter-sugar/item4-y1.md (all 15 meet R27; first tender follows the first
  workable herd by 90-600 ticks). Report sections A and B4 drafted. Waiting: armT-y1 x10, armWT-long x5.
- 16:55 ARM T TABLE DONE (armT-table.md): y1 15/15, workers 255 (bar 255), long 113, R34 5/5, R27 5/5.
  Both arms meet the bars alone -> pair (ws-armWT) long runs next in queue. Arm T PORTED to the live tree (allocation
  demand.ts / index.ts / targets.ts + tendFloor.test.ts; these 3 files were identical to ws-base before).
- 17:42 Pair long (armWT-long): w2 120 (T 113, W 115, base 113), R34 5/5, R27 5/5, eclosions 106, larvae
  starved 1, eggs 209. Better than T by 7 workers -> pair year one started: jobs-5.txt (armWT-y1 x10, runq2.sh).
  Rule I set: adopt the pair if its y1 meets the bars (>= 14 viable, >= 255); else T alone. Then the close:
  test-output/winter-sugar/close/close.sh (freezes live -> /home/user/frozen-wintersugar; sweep + long; pp3/sg2 to
  day 60 = item 7). Live tree has T ported; W must be ported too if the pair is adopted (needs.ts, economy.ts,
  demand.ts forageWant + r41w.test.ts from ws-armWT).
- 18:19 PAIR y1 (armWT-table.md): 14/15 (we3 0.75 R27 again, as in W alone: R41 costs we3 its year-one
  sugar in both trees with it), workers 257. DECISION: adopt ARM T ALONE (meets every bar, keeps 15/15 in year one;
  pair's +7 workers at w2 on 5 runs does not outweigh a systematic year-one loss). Live tree = A1-A3 + arm T.
  CLOSE STARTED: test-output/winter-sugar/close/close.sh (frozen /home/user/frozen-wintersugar; sweep -> close/sweep,
  cache close/cache; long -> close/sweep-long with pp3, sg2 to day 60 = item 7). Restart-safe: rerun close.sh.
- 18:29 Live folder tests: colony 90 files / 374 green (tests-colony-live.txt), behaviours/nest 39 / 83 green,
  nest 65 / 334 + 2 known reds (escapeDig, flood/readersCost.verify; both red on ws-base too). DEVIATIONS D45 (tend
  floor) written. Waiting for close (sweep started 18:19).
- 19:22 CLOSE SWEEP DONE: 13 of 15 viable (pp3 0.89, kd3 0.89 of R27; every archetype >= 2 of 3); bar >= 14
  NOT met by one (not under 13, so no revert question). Fresh foundings == opening-fix cache hand-overs (same first
  workers / gd), so the close sweep is A3 + T on the arms' hand-overs. Switch-off on the two failing colonies: A3 off
  (= arm T alone): both viable (1.88, 1.93); T off (= A3 alone, /home/user/ws-a3): queued jobs-6.txt ->
  switchoff-T/ (runq2 now counts only node processes). Paired A3+T vs T over 15: workers 256 vs 255, sum winter C
  169.6 vs 196.6; herd discovery shifts both ways (kd3 2818 -> 12658, pp3 3911 -> 896): chaos via early hours.
  NOTHING REVERTED. Long runs of the close running.
- 06:03 UTC Nov 27 INTEGRATOR NOTE (after the pause and restart 10): "Integrator ruling 1" is at the tail of
  docs/design/tasks/winter-sugar.md: T adopted, W not; A3 stays but trace its paired cost on pp #3 / kd #3's first
  game day (timebox 1 h; fix the release if it is a defect, then 15 + 5 again; else close on A1-A3 + T at 13 of 15);
  rerun the lost long run(s); then the report.
- 06:06 UTC Nov 27 RESUMED (new engineer). Tree checked: live sim hash 8724d2e2 == /home/user/frozen-wintersugar
  (A1-A3 + T), git clean except integrator's STATUS. switchoff-T (A3 alone, ws-a3) done: pp3, kd3 both viable.
  close/sweep-long: 4 JSONs (kd3 lost). Trace (ruling 1, timebox to ~07:15): firsts from JSONs: kd3 with A3 first
  workable herd +12904 (without A3 +3054); pp3 with A3 +1114 but 1 herd known d2-3 (without: 3). Writing probe
  tools/sim/probe/firstDay.ts (restore close cache bin, 1 game day, both trees).
- 06:11 TRACE DONE (ruling 1; probes tools/sim/probe/firstDay.ts + unplugTimes.ts bite counts; outputs
  test-output/winter-sugar/trace/). Probe reproduces life.ts (open 218/253 pp3, first tender 1162/4602). Same start
  hash both trees. NO DEFECT: every unplugger leaves dig.unplug within 2-3 ticks of the open, no lockout after open,
  diggers' dig task ends at the same ticks in both trees (pp3 +552..558); allocation identical through H2.
  kd3: A3 = 2 unpluggers biting (39 bites, open +246); T = 1 biter + 3 barred (32 bites, open +236); so a different
  worker is free at ~H3 (2nd scout 7296 vs 7303); T's 7303 finds the herd at 286 BU at +3035, A3's scouts find
  nothing on day 1 (herd +12904). pp3: A3 opens 35 ticks sooner and finds herd 6072 (97 BU) at +1094 (T +4149) but
  knows 1 herd doy 10-12 vs 3 (T): C in doy 12 0.74 vs 5.86; scouting allocation same (2). Paired 15: A3+T higher
  in 4, lower in 8, equal 3 -> exploration chaos. DECISION: close on A1-A3 + T at 13/15 (ruling branch 2).
  kd3 long rerun started 06:11 (frozen-wintersugar, PAR=1, close/kd3-rerun.out); old log kept as
  kitchen-door-3.lost-nov24.log. Next: delete ws-* trees, tests/typecheck, close tables, report.
- 06:25 Year probe tools/sim/probe/unplugYear.ts (hand-over to Winter 1). T-without-A3 tree rebuilt as
  /home/user/ws-T2 (frozen + dig.ts A3 hunk reversed; reproduces arm T: kd3 +6000 hash 6aaa572a, winter C 11.752).
  ws-a2/a3/armT/armW/armWT/base DELETED (patches kept: armW-src/armW.patch, trace/*.patch). kd3: NO reopening
  after the hand-over one in year one in either tree; dig.unplug worker-ticks 356 (A3) vs 299; end hash A3T 8fb157ed
  == close sweep. Running pp3 year probe both trees, then tests + report.
- 06:48 kd3 long rerun DONE 06:29 (close/sweep-long 5/5): close long = w2 108, R34 4/5 (we2 0.80), R27 w2
  4/5 (pp3 0.87), R22 5/5 (tables close/close-vs-armT-table.md, close/sweep-long/longrun-table.md). pp3 year probe:
  no reopening in year 1 either tree (unplug worker-ticks 339 A3 / 404 T); hashes == sweep runs. Paired 15 (A3+T vs
  T): delivered C 334.5 vs 364.9, P 156.3 vs 135.8, trips 794 vs 739 (no traffic loss; a C/P mix shift), C lower in
  11/15. Early probe (earlyOut.ts, 3000 ticks, all 15 both trees) -> trace/early.txt running. Timebox closes ~07:05:
  verdict no defect -> close on A1-A3 + T. Next: tests/typecheck, report, delete ws-T2 + frozen at the end.
- 06:54 DEFECT FOUND in A3 (early probe: A3 opens SLOWER on 6/15, sg1 559 vs 270, sg2 535 vs 323).
  unplugTimes on sg1: with A3 diggers 8373, 8361, 8363 walk ~50 ticks then are BARRED 600 ticks with 0 bites (A3's
  stand point unreachable -> walk 'failed' not counted as against-plug); without A3 both bite from +104. sg2: 5998
  barred. => ruling branch 1: fix, red test, rerun 15 + 5 on the fixed tree. Diagnosing the stand point now.
- 07:09 A3 RELEASE FIX in live src/sim/ants/behaviours/nest/dig.ts (unplugStep: bb 'bn.ua' UNPLUG_AXIS; a
  walk to the face point that ends with canDo(unseal-entrance) = out-of-reach switches her to the axis point, no fail
  counted). Cause (tools/sim/probe/standTrace.ts, trace/stand-sg1-A3T.txt): sg1 face point s -2.27 r 1.68 (crack
  beside the plug), walker 'arrives' at s -5.5 (3.3 BU off, outside the 4.38 BU throat test) -> 4 fails -> barred.
  Fixed tree (ws-fix): sg1 open +263 (A3 559, T 270), sg2 +311 (535/323); pp3/kd3 first 3000 ticks IDENTICAL to A3
  (trace/early-fix.txt) -> their 0.89 will not change. Test src/sim/ants/behaviours/nest/unplugStandReach.test.ts
  (stubs approach for dig.unplug + face point): green live, red on frozen-wintersugar. Next: typecheck, folder tests,
  freeze -> /home/user/frozen-wintersugar2, close2.sh (fresh sweep + long), report.
- 07:12 Checks on the fixed live tree: typecheck clean (whole project); behaviours/nest + actions/dig.test:
  41 files / 93 tests green (tests-behnest-fix.txt); outdoor/determinism.perf green (determinism-perf-fix.txt).
  CLOSE 2 STARTED 07:12: test-output/winter-sugar/close2/close.sh (frozen /home/user/frozen-wintersugar2, tree
  bf7364d3 = live; fresh sweep -> close2/sweep + close2/cache, then long runs -> close2/sweep-long, pp3/sg2 to day 60).
  Restart-safe: cd close2; nohup setsid bash close.sh &. ws-fix, ws-T2 deleted. frozen-wintersugar (old close)
  kept until the report is written. Next: DEVIATIONS D44 amendment, report.
- 07:34 close2 sweep 4/15 done (all viable so far). Headless openings on the fixed tree
  (opening/run-fix.sh -> opening/fix, fix-b2) = the A3 numbers (500/500/750/1250/500, b2 1250). FOUNDRESS_LONG
  playerOpening.long running (-> long-test-fix.txt). Report: B6 (trace + fix) written; C, acceptance, limits to write
  when close2 is done.
- 07:58 Fixed tree tests: FOUNDRESS_LONG playerOpening.long 4/4 green (long-test-fix.txt, 601 s); colony
  90 files / 374 green (tests-colony-fix.txt); nest 65 green + the 2 known reds (escapeDig, flood/readersCost.verify;
  same as Nov 24 and on ws-base: pre-existing, not this task's). close2 sweep 10/15, all viable so far.
