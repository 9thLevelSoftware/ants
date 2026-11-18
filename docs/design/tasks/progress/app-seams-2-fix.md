# app-seams-2-fix progress
Started. Plan: (1) focus line new-aim-behind-older fix (major), (2) minimap hidden repaint skip, (3) long aim text in focus line, (4) re-evaluate others (12a/12b/12d note), (5) typecheck + tests + harness.
## Done
(nothing yet)
- Done (code, untested yet): focus line: UiFocusAim.openIds (api.ts, hudSlices.ts focusAimOf), FocusLineClock tracks any new open id + shownId(); FocusLine.tsx uses shownId; unit tests added in focusLine.test.ts. CSS: .fd-focus two-line clamp. Minimap tick skips when hidden (getClientRects empty).
- Remaining: run typecheck+tests; browser check of focus line + minimap hidden (appSeams2-review.mjs / review2); item 12 re-look (12a cuticle, 12b far blocks), 12d note; report.
- DONE+verified: focus line new-aim fix (tests pass: src/ui/hud, src/game/uiBridge; reviewer's failing test now green; browser r03 shows "Where do the dead go?" in test-output/app-seams-2-fix/hud/r03*.png), long aim wraps 2 lines (r02 picture), minimap hidden skip (code only; browser review2 to rerun maybe).
- Next: look at firstplay beat 16 failure in logs (test-output/app-seams-2/firstplay-*.log), 12a/12b/12c, 12d note, report.
- Item 13 diag: firstplay resume (FIRSTPLAY_RESUME=test-output/app-seams-2/firstplay-checkpoint.txt) fails beat 16 "worker did not hand over her load". Added FIRSTPLAY_DEBUG per-give log in firstplay.mjs. Running resume once (12 min) -> test-output/app-seams-2-fix/fp16.log. Do not repeat more than twice.
- fp16 run in progress (started ~09:25, log test-output/app-seams-2-fix/fp16.log, 'done N' line at end). After: cuticle tuning try (clearcoatRoughness 0.2->~0.42, roughness 0.5->0.58 in tuning.ts; update cuticleLook.test), picture via appSeams2-look.mjs LOOK_TAG=fix2.
- fp16 diag result: cause is the SCRIPT (not sim): possessed worker stayed outside (nestId -1), mate position stale -> out-of-reach, unload-crop not-allowed-here outside. Fixed in tests/e2e/firstplay.mjs (walk inside, follow mate; helper followAnt in lib/firstplay-steps.mjs). Rerun #2 -> test-output/app-seams-2-fix/fp16b.log
- firstplay.mjs: added FIRSTPLAY_TRAIL_CHECKPOINT / FIRSTPLAY_AT_TRAIL (skip 16000-tick wait), mate filter fix (query.ant(o.id).nestId). Run #3 (resume from hand-over, full rest, writes test-output/app-seams-2-fix/trail-checkpoint.txt) -> fp-full.log. cuticle tuning edited (0.62/0.42) + test added, NOT yet viewed.
- wrote tests/e2e/appSeams2-blocks.mjs (ray list for 12b) - run after fp-full finishes (1 harness at a time).
- trail-checkpoint.txt written by run #3 (test-output/app-seams-2-fix/); use FIRSTPLAY_RESUME=that + FIRSTPLAY_AT_TRAIL=1 for fast iteration
- delivery section of firstplay.mjs rewritten to unload-crop in a food chamber (unload-crop needs foodPlace); trophallaxis approach dropped (followAnt removed). Fast run #4: RESUME=trail-checkpoint AT_TRAIL=1 -> fp-fast.log
- fast run #5 (shaft walk along heading then unload-crop) -> fp-fast2.log. If it fails again: time-box; report item 13 as open w/ diag (possessed worker cannot be walked down the shaft by script; unload-crop needs food chamber/any chamber when none).
