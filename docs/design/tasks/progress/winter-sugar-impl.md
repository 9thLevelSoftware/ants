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
