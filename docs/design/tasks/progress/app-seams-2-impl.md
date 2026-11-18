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

## Update (~05:50): items 8, 10 DONE (manual)
- docs/MANUAL.md is the only manual (sections 0-20; new 15-19 merged from old folder; generated tables between <!-- generated:NAME --> markers via `npm run sim -- tests/docs/regen-manual.ts`); docs/manual/ deleted; tests re-pointed: src/content/manual.test.ts, manual.verify.test.ts, text/controls.test.ts; tests/docs/docs-final.test.ts dropped MANUAL_ONLY_UNWIRED_LABELS. `npx vitest run src/content tests/docs` green (117).
- README.md lines 113 & 170 are stale (species flag, docs/manual) -> README not mine, report it.
- NEXT: item 9 (journal calTick), 11 (lifecycle.mjs killAll cause), 12 (render), 13 (firstplay beat 11), then rerun appSeams2.mjs w/ improvements + NewGame shots, run panels.mjs + controls.mjs, report.

## Update (~05:58): items 9, 11 DONE in code
- 9: calTick through journalSlice (entries, events, aims via journal entries), timeline.ts dateLine/timeLine/milestonePins + charts.calDay take calTick; AimsTab/LogTab pass it. Test src/ui/panels/journal/calTick.test.ts. Harness picture of the journal across a winter: TODO (script step in appSeams2.mjs: cheat.setTime into winter then open Journal > Milestones/Log).
- 11: tests/e2e/lifecycle.mjs kills with cheat.kill + cause per ant (killAll can't take a cause: sim file; report). Not run in browser (long).
- NEXT: item 12 (render, 5 sub-items), 13 firstplay beat 11; then big harness run + panels.mjs + controls.mjs + report.

## Update (~06:05): item 13 investigation running; item 12 reading
- firstplay beat 11: added lapseTrace logging to tests/e2e/firstplay.mjs and step(50); run FIRSTPLAY_UNTIL=11 -> test-output/app-seams-2/firstplay-11.log (running in background at 06:00; check).
- item 12 plan (in order): (d) quality-switch dispose (look3-qs.mjs counts), (c) crevice earth backdrop = sky dome below-horizon dark when fade.occlusion>0 (skyDome.ts uniform earth/earthAmt, worldRenderer.ts sets), (a) cuticle: ANT day clearcoat cut + dark sheen colour (tuning.ts/fragmentChunk.ts/materials.ts), (b) far wall silhouette in prim material, (e) same-pose pictures. Be honest: partial where not proven by pictures.

## Update (~05:45 UTC by the machine clock): item 12 code in place for (a),(b),(c); pictures pending
- (c) sky dome earth backdrop: src/render/world/sky/skyDome.ts (EARTH_BACKDROP, earthAmt/earthColor), worldRenderer.ts sets earthAmt from frame.occlusion; test skyEarth.test.ts
- (b) far structures: STRUCTURE_LOOK in src/render/world/lighting/constants.ts; materials/surfacePatch.ts (WR_STRUCT: plinth, storey window bands, trim, haze keep via fog_fragment); test in worldRenderer.test.ts
- (a) cuticle: ants/tuning.ts (ANT_DAY_LOOK, CUTICLE.sheenColor/sheen, GASTER_MEMBRANE.clearcoatCut 1.0), fragmentChunk.ts, materials.ts, morph/lasius.ts unified; test ants/cuticleLook.test.ts
- BEFORE tree for pictures: /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/old-root (git archive HEAD c970361 + node_modules symlink): run harness with --root <that> for before, --root . for after. Script tests/e2e/appSeams2-look.mjs (needs LOOK_TAG only for naming; use --out).
- firstplay beat 11 run still in progress in background (test-output/app-seams-2/firstplay-11.log); beat 06 reached at 05:36.
- STILL TODO: (d) quality-switch disposal check via look3-qs.mjs, (e) same-pose slope + observer-after-colony pictures, run old/new look pictures, rerun appSeams2.mjs w/ NewGame+journal shots, panels.mjs + controls.mjs, report.

## Update (~06:05 machine clock): item 12 pictures taken
- (b) REAL cause: the far pale blocks are the boundary facade backdrop (NOT prims; no tall box prims exist). My prim-shader attempt was REVERTED. Implemented facade haze keep in src/render/world/boundary (meshBuilder keep/keepNow, backdrop.ts keepNow around the house facade, edgeHaze.ts aBdKeep/uBdKeepHaze, boundaryRenderer backdropLook.keepHaze, tuning BACKDROP_KEEP_HAZE 0.6; test facadeKeep.test.ts). Pictures kitchen-door seed 2: test-output/app-seams-2/kd-walls-before.png vs kd-walls-after.png (top-right house now has visible windows/edges; the left pale block unchanged). Suburban seed 2 has no facade in the backdrop (keepOnes 0) -> the pale blocks there are something else; unexplained.
- (a) cuticle: crops crop-queen-before/after.png near identical (specular highlight stays): NOT demonstrated; code kept (tests).
- (c) earth backdrop: could not reproduce the white disc (crevice shots look-before/after 03/04 same); code kept + test; NOT demonstrated.
- NEXT: look3-qs (d), appSeams2.mjs final run (script extended: new-aim focus line, journal across winter, settings bottom, New Game + custom rules + preset rows), controls.mjs, panels.mjs, firstplay full run (relay clutch handling added), report.

## Update (06:20 UTC, resumed after 6th restart; tree clean apart from others' untracked reviews; everything above is committed in 948fb75)
- Working on 12(d) quality-switch leak: qs.log (06:01) shows textures m0 37 -> 46 after first switch to low then flat (low 46, high 77, test 46). renderApp.applyRendererQuality already disposes post. Diagnosing with GL createTexture/deleteTexture stack patch (scratchpad qs-gl.mjs -> test-output/app-seams-2/qs-gl).
- Then: appSeams2.mjs final run (script updated at 06:13), controls.mjs, panels.mjs, firstplay, report.

## Update (06:35 UTC): item 12(d) DONE (partial-honest)
- Cause found by GL createTexture/deleteTexture patching (scratchpad qs-gl2.mjs; logs test-output/app-seams-2/qs-gl2.log): no per-switch leak (created/deleted churn ~25 textures per switch, count flat after first cycle). Real retained waste: the sun shadow map stayed allocated when a preset turned shadows off -> src/render/app/shadows.ts now disposes it (test src/render/app/shadows.test.ts). Remaining first-visit growth (m0 37 -> 44; programs 47 -> 71) = lazily uploaded textures/compiled programs of the presets visited; flat afterwards.
- tests/e2e/look3-qs.mjs: warm-up cycle, asserts flat (<= +2) over the five switches after warm-up. After-run: test-output/app-seams-2/qs-after.log (mw 44 == m1 44 textures; 71 programs; 67 geometries).
- NEXT: same-pose pictures (12e) check state; appSeams2.mjs full run; controls.mjs; panels.mjs; firstplay; report.

## Update (06:50 UTC): final pictures partly taken
- appSeams2.mjs full run OK (test-output/app-seams-2/hud-final/01..13, log hud-final.log). Looked at 01,02,03,04,05,06,09,10,11,12,13: good (intro card no prompt; focus line; minimap in possession w/ ant arrow+entrance+marker+trail, observer, click pan; settings rows; New Game text/day 5/custom rules not-in-build tags/preset rows). 07/08 (journal across winter) were covered by the winter lapse overlay: script fixed (skip lapse, Continue into spring, .ui-book tabs) -> needs rerun of appSeams2.mjs for 07/08 (~10 min).
- New: tests/e2e/appSeams2-poses.mjs (observer round trip + slope climb), to run on current tree (poses-after) and on old tree 5c5fe19 (git archive into scratchpad old-look3, node_modules symlink) for poses-before.
- Queue: poses-after, poses-before, appSeams2 rerun, panels.mjs, controls.mjs, firstplay.mjs (full 25 beats), vitest of my dirs + typecheck, report docs/design/tasks/app-seams-2-report.md.
- NOTE: grep '"ok"' in harness logs matches log lines with "ok":true: wait on process exit instead.

## Update (07:00 UTC): item 12(e) pictures taken
- tests/e2e/appSeams2-poses.mjs; after: test-output/app-seams-2/poses-after/, before (git archive 2fbf1a8~1 = before look-pass-3, in scratchpad/old-look3): poses-before/. 
  A (observer after colony view, followed ant underground): BEFORE A3 = orbit camera inside the nest on the ant (followId stays 5571, y=-23.7); AFTER A3 = free over the nest on the surface (followId -1, y=128.6, f=15.6). Clear pair.
  B (slope): steepest ground within reach is 15.9 deg at 329 BU; both pictures look alike (horizon a bit higher in after); NOT convincing -> report partial; the 'before' queen sat in the shaft (teleport differs between trees).
- NEXT: rerun appSeams2.mjs (07/08 journal across winter, script fixed), then panels.mjs, controls.mjs, firstplay.mjs, vitest of my dirs, typecheck, report.

## Update (07:12 UTC): done runs
- appSeams2.mjs rerun OK: hud-final2/ (07/08 journal across winter fine: entries keep own dates Spring Y1 ... Spring Y2; hint card "Tab Next ant" overlapped the journal -> hint.css now hides .hn-card while a .ui-book-wrap is open: NOT re-pictured yet).
- Found string: alert 'winter-coming' reads "stores cover 28 of 7 days" when stores exceed winter (sim passes x=28; content template src/content/text/alerts.ts:37) -> report (sim clamp / wording), not fixed.
- panels.mjs PASS (ok:true, test-output/app-seams-2/panels, log panels.log).
- NEXT: controls.mjs, firstplay.mjs, vitest of my dirs, typecheck, report.

## Update (07:25 UTC)
- controls.mjs PASS (test-output/app-seams-2/controls.log). typecheck clean (no output). vitest of my dirs + tests/docs + src/render/{app,ants,world/boundary,sky,lighting} + src/sim/config: 204 files / 1537 tests pass (log test-output/app-seams-2/vitest.log).
- Started firstplay.mjs full run 07:25 (test-output/app-seams-2/firstplay-full, log firstplay-full.log; ~40 min). While it runs: write report docs/design/tasks/app-seams-2-report.md (no heavy processes!).

## Update (07:40 UTC)
- Report written: docs/design/tasks/app-seams-2-report.md with two placeholders to fill: CUTICLE_RESULT_PLACEHOLDER (12a), FIRSTPLAY_RESULT_PLACEHOLDER (13). firstplay full run in progress (started 07:25; log firstplay-full.log).
- After firstplay: try 12(a) once more (CUTICLE.roughness 0.35 -> ~0.5 and clearcoatMul 0.45 -> 0.3), crops via tests/e2e/appSeams2-look.mjs (LOOK_TAG naming only; --out test-output/app-seams-2/look-after2, seed 2 quality high, ~2 min); keep only if the crop changes visibly; rerun src/render/ants tests.

## Update (07:50): firstplay run 1 failed at beat 11 relay: finding
- Beat 11 cause (reported): the founding flow does NOT close the overlay; the SIM ends the lapse at progress 0.028 because all 6 eggs were lost (counters eggs 6 / lost 6, reserves 0.95; site read-out "Poor", Q 0.71, Warmth shaded) -> broodLost() -> relay clutch (back to phase 'lay'). The script's relay handling then waited for founding-tend without laying again -> timeout. Fixed: layBatch x4 then loop layBatch+step until founding-tend visible (tests/e2e/firstplay.mjs). Rerunning full firstplay (log firstplay-full2.log).
