# look-pass-5 review — progress
Started 2026-11-23. Reviewer (adversarial).
## Done
- nothing yet
## In progress
- reading spec + docs
## Remaining
- read code in owned paths; typecheck; run tests; verify tests; harness check; report
## Findings so far
- 22:58 typecheck clean; vitest camera/flows-founding/uiBridge/hud-alerts/panels-inspect/boundary/materials/dressing: 48 files 302 pass.
- code read: full diff 6cd38ed..HEAD on owned paths.
## Candidate findings (to verify)
- shotSubject: radius jumps when a worker crosses the 10 BU reach (no smoothing in ViewDirector) -> camera zoom pops
- reduced motion: static shot, no 3 s still crossfade (GDD 08 7.10, App E 18)
- 23:10 KEY EVIDENCE: test-output/look5/firstplay/seed1-until12b.log "shot at lapse": queen y -16.16 at chamber edge (NOT shaft throat; chamber c y -13.65 r {9,5,8}), cutY -13.76; picture 11 shows queen under soil cap at frame centre -> app cut-height rule, not sim. Report blames sim using the older run (seed1-until12, queen y +4.55).
- outcome subject radius 33 mm because workers up the shaft (y +5.8, above cutY) are counted in the 10 BU reach -> cell tiny.
## Next
- write verify tests: shotSubject.verify, views/foundingShot.verify, camera/foundingShot.verify, materials WR_FOOT verify
- harness run 1: wrapper on firstplay seed1 UNTIL 11 + probe field at queen + alt cut picture (tests/e2e/look5-verify-shot.mjs)
- maybe A/B cost run in scratch copy
- 23:04 verify tests written: src/game/flows/founding/shotSubject.verify.test.ts (2 FAIL on purpose: radius jump 39.9 mm across 10 BU reach; worker above cut widens frame), src/game/views/foundingShot.verify.test.ts (1 FAIL on purpose: camera moves 82.6 mm in one frame), src/render/camera/foundingShot.verify.test.ts (5 pass), src/render/world/dressing/plasticFinish.verify.test.ts (3 pass)
- 23:05 RUNNING harness: tests/e2e/look5-verify-shot.mjs seed 1 UNTIL 11 -> test-output/look5-review/shot-s1 (~12 min). If cut off: re-run it, do not redo tests.
- 23:15 A/B cost prep: scratch copy at /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/ab/tree (snapshot of HEAD tree, node_modules symlink) + look5.patch (31 files, git diff 6cd38ed on src/render|game|ui). Plan: run frametime N=2 on copy as-is (B), then patch -R -p1 and run again (A).
- doc findings: MANUAL l.152 "step in (E) or let it play" (interrupts T2, never raised: src/sim/colony/founding/commands.ts respond()); MANUAL l.822 contradicts itself (night "overcast day" vs "almost black"); MANUAL l.252 lists fewer blocking cards than blockingCard.ts (intro card, hand-over banner, winter banner, flight prompts too).
- 23:20 harness run 1 DONE (ok): test-output/look5-review/shot-s1/{11-timelapse,r11-lapse-as-shipped}.png: real seed-1 lapse shows queen + eggs in the cell (good). Queen at y +4.55 (throat), ceiling 8.2 mm above her, cut 2.4 mm above: open. So "throat => empty cell" explanation in report is wrong; the empty-cell run (implementer until12b) had queen at chamber EDGE y -16.16 under the cap.
- NEXT: A/B cost run B (copy as-is) then A (patch -R) with frametime N=2 -> test-output/look5-review/cost-{B,A}.log
- 23:30 cost-B done (identical to implementer: low 74/579291). copy reverted with patch -R; running cost-A
- 23:38 cost-A done: low 74/579291 (same), medium 108/730820 (B +0.04%), high 119/1004052 (B +0.06%) -> AC4 met, +5.2% was scene variance. scratch copy deleted. Remaining: final test run of verify files, StructuredOutput.
- 23:40 DONE: final verify run 3 intended fails / 12 pass; typecheck clean. Report returned via StructuredOutput.
