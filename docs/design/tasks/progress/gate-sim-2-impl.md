# gate-sim-2 implement — progress
Started 2026-11-23 ~16:50 UTC (session 1).
## Done
- Read docs. Runner scripts in test-output/gate-sim-2/ (freeze.sh NAME, run.sh, jobs.sh <list>).
- Item 2: variant f in live src/sim/locomotion/crumbs.ts (consumption lines removed). Frozen /home/user/scratch-g2f
  (tree ecff9be5 = live + f). Runs launched 16:58: jobs-f-0 (we#3 winter, we#1 h14), jobs-f-1 (sg#3 winter)
  -> test-output/gate-sim-2/item2-f. Compare with colony-life/round-15/arm-y1-r15e and h14-r15e.
## In progress
- Item 1 typecheck + folder tests (VITEST_MAX_WORKERS=1 while life runs go) -> test-output/gate-sim-2/vitest-*.txt
## Remaining (spec order)
1 red-test table; 2 finish (retraceResume15 case1 restate, D34); 3 mound mask probe; 4 kd#3 starve; 5 sg#2 digging;
6 R13/R14 table; 7 seams; 8 close sweep; 9 report
- 17:05 item 2 runs: we#3 (round-10 h/o) viable C 8.04/6.23=1.29x; sg#3 viable C 12.52/6.07=2.06x (r15e: 1.16x, 2.38x).
  we#1 h14 running. Item 1 fixes so far: time.test (winterPathC read calendar doy -> default-year doy28:
  colony/queen.ts winterPathRamp, balance PROSPECTIVE_WINTER_FROM_DOY = DEFAULT_SEASON_LENGTH_DAYS; test
  colony/winterPathSeason.test.ts red without); runner.test failure codes (ants/actions/types.ts whoWithinSpecies,
  runner.ts, granary/fungus actions); services.test CP loam restated (D36 to write).
- probes: tools/sim/probe/g2-nurse.ts (kd#3), g2-dig.ts (sg#2); copies in /home/user/scratch-r15e/tools/sim/probe.
  kd#3 probe on r15e running -> test-output/gate-sim-2/probe-kd3-r15e.txt
- 17:30 ITEM 2 ADOPTED (variant f): we#3 1.29x, sg#3 2.06x, we#1(h14) viable C 23.4/6.78 -> test-output/gate-sim-2/item2-f.
  retraceResume15 case 1 restated (crumbs behind kept: farCrumb > her dist + 7 BU). D34 still to restate.
  E23 green in folder run. NEW RED to check: behaviours/outdoor/review.verify "lasting threat" 2100 s > 1800 (variant f?)
  -> run it on /home/user/scratch-r15e vs live when the folder run ends.
- 17:30 ITEM 4 CAUSE: larvae pile 1.3 mm inside royal chamber WALL (2.5 BU room); locomotion/trip.ts snapToSurface rose
  straight up through soil to the ground -> nurses walk out of nest (probe-kd3-n7296.txt). FIX: trip.ts climbToFree
  (gradient climb). Test ants/behaviours/nest/buriedLarva.gate2.test.ts (2 cases, both red without fix).
  Paired runs kd#3 f15 (sweep-15 hand-over file): base /home/user/scratch-g2f -> item4-base, fix /home/user/scratch-g2-4
  -> item4-fix (running 17:27).
- Item 1 more: sfaReview.verify fixture (wait for built board), stall.soak (exclude locoStats().dozed: viab-loco dozing).
- R13/R14: sweep JSONs only have day rows (entrancesOpen 0 at day 0, 1 at day 1 in 15/15; no flooded share).
- 17:45 item 1: handoverStomach.verify case 1 restated to R2 intent (rationing is C-pool-empty: fixture 4 C no
  foragers; nurse mix C share up at 0.8; queen holds no C above keep; checks: no starvation death while held, no
  empty P pool with larvae, no rationing while C>0). workedExample restated: larval rates from constants (0.8 P, r(25)
  1.364 -> 0.909 C/1.819 P per larva/gd); needC 10.71->11.27, needP 12.9->9.90, dC 1.39->0.83, dP 0.05->3.05 (for R43 row).
- 17:25 ITEM 4 PAIRED (kd#3, sweep-15 h/o): base g2f larvae starved 7, eclosed 0, workers 9->9, VIABLE (C 8.08/3.96);
  fix g2-4: starved 0, eclosed 7, 9->16, NOT viable (C 4.15 / R27 need 6.23: bigger colony, more winter C need).
  Adopted (defect of execution); viability bar decides at close (kd archetype risk).
- weather.test restated (rng.ecology exists at creation; other streams untouched). DEVIATIONS: D34 restated, D36 new,
  R43 extended (workedExample, handoverStomach).
- ecology/sources 12 reds: T1 rules behind ECOLOGY_TIER const = 2 (R1, f55c559 Nov 16): unreachable; LEFT RED, report
  (needs per-game tier seam; owner ecology).
- item 7: granary/fungus stagger offsets made distinct (literals). Hash check running: probe-hash-g24.txt (g2-4) vs live.
- sg#2 dig probe on g2-4 running -> test-output/gate-sim-2/probe-sg2-dig.txt
- 17:40 CLOSE SWEEP STARTED from /home/user/frozen-gate2 (src hash 55c4dfff = live src/sim+worldgen+core) ->
  test-output/gate-sim-2/sweep (sweep-life.sh, fresh foundings into viab/cache). AFTER it: long runs
  `cd /home/user/frozen-gate2 && PAR=2 UNTIL_DAY=40 tools/sim/longrun-life.sh /home/user/foundress/test-output/gate-sim-2/sweep-long /home/user/foundress/test-output/viab/cache "woodland-edge:2 suburban-garden:2 car-park-verge:1 playground-park:3 kitchen-door:3"`
  then tables: cd test-output/colony-life && python3 ../../tools/sim/sweep-table.py ../gate-sim-2/sweep round-15/sweep ; longrun-table.py.
  DO NOT edit src/sim|worldgen|core until sweep done (else final tree != sweep tree). No other life runs meanwhile.
- Final source changes in the frozen tree: crumbs.ts (variant f), trip.ts (snapToSurface inNest climbToFree, item 4),
  queen.ts+balance/colony.ts (winterPath doy28), actions runner/types + granary/fungus actions (whoWithinSpecies),
  granary/rhythm.ts (window -> windowTicks: layering test). Stagger offsets TRIED and REVERTED (Lasius hash same
  beb35045/11e07a85/74d18776 over 18000 ticks, but fungus/scenario went red; probe-hash-g24*.txt).
- item 4 trip.ts restricted twice: (1) substrate<0 only (locoFix3.review stem test went red), (2) only item/brood
  goals with nestId>=0 (rivals/broodRaid App E 20 went red). Both green now; buriedLarva.gate2 red without fix.
- item 5: NOT a defect: sg#2 diggers dig architect tunnel plan 6490 (missing-type, 61.75 BU3) open from gd 0.06;
  sweep table "plans +/done" counts creations per day. C crash = 5 larvae x 0.909 C/gd. probe-sg2-dig-r15e.txt.
- lasting-threat review.verify: pre-existing flee/return loop; e fails seeds 2,6, f fails seed 5 of 1-6
  (threat-seeds-e.txt / -f.txt). Report, not fixed.
- Restated (stale): derive.test, speciesData.verify (R43), ids.test (38 alerts), gate1b seams (R39), weather.test.
- Load guards: locomotion/perf.test, pheromones/perf.verify (heavyLoad()).
- Left red (report): ecology/sources x12 (T1 behind ECOLOGY_TIER=2, R1), layering (4 test imports of @/game, @/content
  by other tasks), fungus/loop, granary/rhythm, granary/scenario (red on r15e too), review.verify lasting threat.
- 17:55 Report draft docs/design/tasks/gate-sim-2-report.md: items 2-5, R13/R14 (JSON part), seams, deviations,
  contracts written. PLACEHOLDERS left: SWEEP_SECTION, RED_TABLE, R14_PROBE, STILL, EVIDENCE.
  Live edits after freeze (test-only + 1 import): worldgen/populate/economy.ts import '@/sim/balance' (layering).
  item 5 candidate defect: diggers stuck in dig.stow holding pellets gd 9.5-11 (probe-sg2-dig-r15e.txt); trace after
  sweep only (slots).
- NEXT after vt-before DONE: `DIRS="" ./folders.sh after 1` (all folders) -> vt-after. After sweep: long runs (see
  above), R14 probe over the 15 sweep-15 hand-overs (tools/sim/probe/g2-r14.ts FILE ARCH SEED), tables, report.
- 18:21 INTEGRATOR NOTE: "Integrator ruling 1" is at the tail of docs/design/tasks/gate-sim-2.md: ecology/sources 12 reds
  get a tier argument defaulting to ECOLOGY_TIER after the sweep's runs (hash check on one cached run), not left red;
  item 4 accepted; item 5 accepted (one dig.stow trace if a slot is free); winterPathRamp accepted.
- 18:18 sweep so far: 8 done, sg#2 NOT viable (C 5.23/5.38=0.97x; sweep15 0.01x), rest viable. vt-after running.
- 18:45 SWEEP: sg#2 and sg#3 NOT viable (sg 1/3 -> archetype bar FAILS). Per spec: switch-off runs from this sweep's
  hand-overs (viab/cache ...-c8545e09.bin, run.sh mode g2): trees /home/user/scratch-g2-no2 (crumbs.ts of r15e =
  item 2 off), /home/user/scratch-g2-no4 (trip.ts of r15e = item 4 off), base frozen-gate2 -> off-item2/, off-item4/,
  off-base/ (jobs-off-0/1.txt, started automatically by startoff.sh after sweep DONE). Then revert the item that
  costs it, rerun sweep on affected colonies, then long runs.
- 18:52 SWEEP DONE: viable 12/15 (sg 1/3 FAIL; kd#3 NOT viable 0.98x). Table test-output/gate-sim-2/sweep-table.md
  (cd colony-life && python3 ../../tools/sim/sweep-table.py ../gate-sim-2/sweep round-15/sweep). Switch-off runs
  running (off-item2, off-item4, off-base; sg2, sg3, then kd3 via startoff2.sh). Long runs NOT started yet.
- 19:10 SWITCH-OFF RESULT: item 4 off -> sg#2 viable (C 7.91/4.41) and sg#3 viable (5.09/4.81); item 2 off -> both
  still NOT viable. => ITEM 4 REVERTED in live (trip.ts = r15e's; fix saved test-output/gate-sim-2/trip.ts.item4-reverted;
  buriedLarva.gate2.test.ts describe.skip with reason). kd#3 switch-offs cancelled (stop files).
  Frozen /home/user/frozen-gate2b (reverted tree). close2.sh (nohup) waits for off-base runs, then full sweep ->
  test-output/gate-sim-2/sweep2, then long runs -> sweep-long; writes close2.done. First sweep (item 4 in) kept in sweep/.
- 19:15 off-base: sg#3 restored = sweep exactly (6c3e00ef, NOT viable); sg#2 restored DIFFERS from the in-process sweep
  run (fddce888 vs cf83827c) and is viable -> sg#2 save/load continuation gap (report; likely pre-existing, untested on
  r15e for lack of slots). Item-4 cost clean on sg#3 (1 pair). sweep2 running (close2.sh). Probes archived to
  test-output/gate-sim-2/probes/ (still in tools/sim/probe: delete at the end after the R14 probe).
- 19:26 INTEGRATOR NOTE: "Integrator ruling 2" is at the tail of docs/design/tasks/gate-sim-2.md. Item 4 is NOT settled by
  the viability count: let close2.sh finish, then run the five long runs on the item-4 tree (frozen-gate2 ->
  sweep-long-item4); KEEP item 4 if (a) its five colonies together have >= the reverted tree's workers at the second
  winter and (b) no item-4 colony that entered winter at >= 0.95 of R27 loses > 15 % in the lapse or its queen; else the
  revert stands. Report both sweeps and both long tables side by side. No third sweep. Do not delete frozen-gate2.
