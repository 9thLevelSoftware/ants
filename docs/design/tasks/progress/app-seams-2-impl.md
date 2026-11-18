# app-seams-2 implement progress
Started 2026-11-18 05:07 UTC. (Machine restarts: read this first.)

## Done
(nothing yet)

## In progress
- Reading code, item 1 (minimap) ...

## Remaining (spec order)
1..13 per docs/design/tasks/app-seams-2.md

## Findings / decisions
- Repo is a git repo; git log works.


## Update 05:50-ish
Code written (typechecks, NOT yet tested/looked at): 
- item1 minimap: src/game/uiBridge/minimap.ts (+balance consts, install.ts bridge: minimap/minimapPlate/panTo), src/ui/hud/minimap/{model.ts,Minimap.tsx}, css at end of hud.css, HudRoot mounts it. Settings row = Never/Always segmented.
- item2 focus line: UiSnapshot.focusAim (api.ts, hudSlices.focusAimOf, uiBridge.ts), src/ui/hud/{focusLine.ts,FocusLine.tsx}.
- item3 auto-slow: GameplayTab rows added; Game.newGame writes presetAutoSlow into settings; withGameRule removed (autoSlow.ts/test).
TODO next: unit tests for 1-3, harness shots (tests/e2e script app-seams-2.mjs -> test-output/app-seams-2/), then items 4..13.

## Update (items 1,2,3,6 coded + tested)
- tests pass: src/game/uiBridge/minimap.test.ts, src/ui/hud/minimap/model.test.ts, src/ui/hud/focusLine.test.ts, src/ui/hud/blockingCard.test.ts, autoSlow.test.ts, uiBridge.hud.test.ts (focus slice)
- item 6: src/ui/hud/blockingCard.ts used by ContextPrompts (intro card/timelapse/outcome/failure/winter/flight prompts)
- harness script tests/e2e/appSeams2.mjs (run: node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/appSeams2.mjs --out test-output/app-seams-2/hud --timeout 300000 --script-timeout 1500000; ~3 min). First run OK: pictures 01..06 in test-output/app-seams-2/hud, BEFORE picture of overlap: test-output/app-seams-2/before-01-intro-card.png. 
- TODO in script: observer camera.free() for nicer view, mark aim-find-site done to show "new aim opens" focus line, scroll settings, zone-edge minimap shot.
- Decision item 4: winterMode offered after harness check; extinctionEndsGame = Not in this build (no UI to retire a colony; retireColony command has no screen).
- Next: items 4,5 (strings), 7, 8, 9, 10, 11, 12, 13. Another engineer's waiter loop `while pgrep -f tools/harness/play.mjs` is not mine.

## Update (~05:45): items 4,5,7 coded; 8 in progress
- item 4: winterMode verified honoured by harness (tests/e2e/appSeams2-rules.mjs, test-output/app-seams-2/rules.log: timelapse -> banner+lapse to spring; realtime -> plays winter days, no banner). Added 'winterMode' to form.ts RULE_KEYS + NewGame.tsx Winter control. extinctionEndsGame = listed "Not in this build" via presetRows NOT_OFFERED (no retire UI). 
- item 5: presetDisplay.ts (plural youngRivals, PRESET_SUMMARY reworded, RULE_DISPLAY.notInEffect), NewGame.tsx uses PRESET_SUMMARY + startOf() (species.ts), controls.ts fixed (fixed pad chords go to gamepad column, comment names docs/MANUAL.md), flags.ts species only with ?test=1 (item 7 done, flags.test.ts). README.md line 113 still says species flag accepts all (README not mine -> report).
- newgame.test.ts updated+passing; controls.test.ts RED until item 8 (points at docs/manual).
- item 8 plan: merge old docs/manual content (HUD table, every-screen table, roster/journal/health, nest sections, species, settings extras, troubleshooting, pointer-lock/browser keys/rebinding) as new sections 16-20 in docs/MANUAL.md; move tests (src/content/manual.test.ts, manual.verify.test.ts, text/controls.test.ts) to MANUAL.md; delete docs/manual/; keep key markers <!--key:id-->; update MANUAL for items 1-5,7,10 facts; regenerate generated tables (section 1.3 species, 1.6 presets+rules, 13 controls) with a script tests/docs/regen-manual.ts (npm run sim -- ...). tests/docs/docs-final.test.ts: drop MANUAL_ONLY_UNWIRED_LABELS (autoSlowDefault now in effect).
- Still to run: full appSeams2.mjs again (add: observer free cam, aim-done staging for new-aim focus line, scroll settings, NewGame screenshot w/ rules expanded).
