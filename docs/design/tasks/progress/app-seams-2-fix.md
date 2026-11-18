# app-seams-2-fix progress
Started. Plan: (1) focus line new-aim-behind-older fix (major), (2) minimap hidden repaint skip, (3) long aim text in focus line, (4) re-evaluate others (12a/12b/12d note), (5) typecheck + tests + harness.
## Done
(nothing yet)
- Done (code, untested yet): focus line: UiFocusAim.openIds (api.ts, hudSlices.ts focusAimOf), FocusLineClock tracks any new open id + shownId(); FocusLine.tsx uses shownId; unit tests added in focusLine.test.ts. CSS: .fd-focus two-line clamp. Minimap tick skips when hidden (getClientRects empty).
- Remaining: run typecheck+tests; browser check of focus line + minimap hidden (appSeams2-review.mjs / review2); item 12 re-look (12a cuticle, 12b far blocks), 12d note; report.
- DONE+verified: focus line new-aim fix (tests pass: src/ui/hud, src/game/uiBridge; reviewer's failing test now green; browser r03 shows "Where do the dead go?" in test-output/app-seams-2-fix/hud/r03*.png), long aim wraps 2 lines (r02 picture), minimap hidden skip (code only; browser review2 to rerun maybe).
- Next: look at firstplay beat 16 failure in logs (test-output/app-seams-2/firstplay-*.log), 12a/12b/12c, 12d note, report.
- Item 13 diag: firstplay resume (FIRSTPLAY_RESUME=test-output/app-seams-2/firstplay-checkpoint.txt) fails beat 16 "worker did not hand over her load". Added FIRSTPLAY_DEBUG per-give log in firstplay.mjs. Running resume once (12 min) -> test-output/app-seams-2-fix/fp16.log. Do not repeat more than twice.
