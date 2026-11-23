# gate-sim-2 review progress
- Started 21:14 UTC. Implementer's code is committed (HEAD 9410830); working tree has doc diffs + deleted probes only.
## Done
- typecheck clean (21:20).
- New test src/sim/locomotion/retraceVariantF.verify.test.ts (walked flee, then resumed retrace): GREEN (2 cases).
## In progress
- running touched tests; checking rulings 1/2 compliance.
## Findings so far
- MAJOR: integrator ruling 2 (item 4 long runs on item-4 tree -> sweep-long-item4, keep rule) NOT done, not
  mentioned in report; frozen-gate2 deleted despite "Do not delete" (copy /home/user/keep-gate2-item4 exists).
  Impl progress file shows the 20:31 binding note was read.
- MAJOR: ruling 1 (ecology/sources tier argument, 12 reds) not done; report says "left red".
- 21:30 tests of touched files run: green except layering x2 (reported). ecology/sources 12 red confirmed.
- New verify tests (green): src/sim/ecology/sources/tierReach.verify.test.ts (T1 reachable via tier arg -> report
  claim "unreachable by a test" false), src/sim/nest/escapeDigLong.verify.test.ts (escape dig opens at 8.76 h on live
  tree, red on hand-over tree 6cd38ed too: pre-existing; report says "3.5 h").
- Live tree hash = sweep2 tree 43fbaf86 (checked). sweep2 13/15 table verified. R14 probe file matches report.
- determinism.perf green.
- 21:26 STARTED one life run (ruling 2 item 5 check, sg#2 restore on scratch-r15e from sweep-15 hand-over 325775ec)
  -> test-output/gate-sim-2-review/r15e-sg2-f15/ ; compare finalHash with sweep 15 in-process 633b09ce.
  If restart: check summary.txt there; do not start a second copy.
- Finding: winterPathRamp is a no-op on the 28-day year (doy28 == doy at 7-day seasons) but report section 0 credits
  it for sg#2 keeping its queen (R22) -> misattribution.
- Finding: DEVIATIONS lacks old->new for ids.test (37->38), seams tend (= slots -> bounds), stall.soak (dozed excluded).
- 21:35 added src/sim/ants/actions/failCode.verify.test.ts (not run yet: waits for the life run to end).
- item2-f evidence checked (1.29x / 2.06x / 3.45x, viable).
- 21:31 RESULT: sg#2 restore on scratch-r15e from sweep-15 hand-over = 633b09ce = sweep 15 in-process hash: restore EXACT
  on the hand-over tree. So the fddce888/cf83827c gap of the first close sweep's tree is newer than this task's start.
- 21:32 STARTED restore check on final tree copy (scratchpad/frozen-live) sg#2 g2 mode -> test-output/gate-sim-2-review/live-sg2-g2;
  compare with sweep2 sg#2 in-process finalHash.
