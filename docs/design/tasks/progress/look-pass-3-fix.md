# look-pass-3-fix progress (started 03:09 UTC Nov 18; times below are real `date -u`)
## Done (code + unit tests green unless noted; pictures still to take)
- F7 slope lift follows the camera offset not the heading: src/render/camera/thirdPersonRig.ts slopeLiftFor(), constants.ts (MIN_SPEED removed). lookPass3.verify.test.ts GREEN.
- F8 mound foot: MOUND_RIM_RAG_MM 0.3 + albedo mottle (moundRenderer.ts, uses wrNoise); moundRag.verify.test.ts GREEN.
- F3 leaf fringe: blended alpha (CustomBlending in the OPAQUE pass), 8 taps, DECOR_LEAF in decor/tuning.ts (drapedMaterial.ts). Test src/render/world/decor/leafFringe.test.ts.
- F4/F5 wings + cuticle: tuning.ts WING_LOOK, ANT_NIGHT_LOOK, GASTER_MEMBRANE, ANT_FILL.rim.night 0.15; fragmentChunk/vertexChunk read them. Test src/render/ants/lookReview3.test.ts.
- F2 chamber camera: radiusMm is the GDD radius again; collision sphere shrinks separately (collisionScale); src/render/camera/closePose.ts (findClosePose, centreInGap) + motionGuard rescue + rig.guardCamera; out.clearanceHonoured; test closePose.test.ts. Reported radius shrinks ONLY in a room lower than 2x clearance.
- F1 stage1a memory check: tests/e2e/stage1a.mjs measures after one warm cycle (+ programs). Evidence test-output/look3fix/qs3.log: cycle 1,2,3 identical (textures 46/77/46, programs 71/86/71): first-visit cache, not a leak.
- F6 far walls: materials/farFacade.ts + surfacePatch macro block (streaks, storey lines, grime), plaster tint 0.9; dry-leaf night albedo DECOR_LEAF.nightAlbedo via DecorFrame.nightW (worldSlot sets it).
- F11 inline numbers moved to tuning (wings, gaster membrane, fringe, mound). F13 autoSlowDefault: src/game/time/autoSlow.ts withGameRule + Game.ts + test.
- backdrop tuning comment: no door.
## Running / next
- stage1a STRICT browser run in background since 03:2x -> test-output/look3fix/stage1a.log (ends with exit=N). Monitor armed.
- THEN (one harness at a time): look3.mjs shots (LOOK3_TAG=fix; noon:queenstart, noon:observerlow, night:observerlow, night:close, night:gyne, night:edge, dusk:observerlow) -> test-output/look3fix/shots; photo.mjs quick, views.mjs, controls.mjs, panels.mjs, firstplay 1-20 if time; look at pictures.
- THEN full folder vitest: src/render, src/game, src/ui(not touched), src/input(not touched). typecheck (only tools/sim/probe error is not mine).
- THEN report: append section to docs/design/tasks/look-pass-3-report.md (fix the wrong claims: CAM_TIGHT easing, backdrop door, 'finished').
## Do not repeat
- the quality-switch investigation (done). Do not run vitest at the same time as a harness run (short single-file runs were ok).
03:40 stage1a STRICT PASSED (exit 0, no stand-ins): test-output/look3fix/stage1a.log. 04-chamber-queen shows queen in room (camera ok) but a white dithered cutaway halo (sky dome seen through discarded terrain in crevice state) - open, report.
03:50 look3 batch (test-output/look3fix/shots.log, tag fix) running; run_checks.sh queued (photo quick, views quick, controls, panelsA/B, hud) -> test-output/look3fix/checks/_order.log. firstplay not queued (long).
04:05 FOUND: leaf fringe blend was order dependent (white halo: drawn before terrain). Fixed with DECOR_LEAF.renderOrder=1 (decorBlock.ts). Restarted look3 batch (out shots2/, log shots.log) + run_checks.sh. Do NOT pkill play.mjs (shared machine; use TaskStop / kill own pid). Old shots/ dir = BROKEN white halo (keep as evidence of the bug only).
04:30 report section 11 drafted (sections 9-12 numbers: finalize 12 with browser results)
04:20 photo quick PASSED; unit render 829 / game 583 passed (before wing roughness tweak; ants re-run green). wing roughness/specular tweak added after: re-run photo quick at the end for the queen picture. Chain continuing (views, controls, panelsA/B, hud).
