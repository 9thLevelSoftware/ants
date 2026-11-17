# look-pass-3 impl progress
Started 2026-11-17 18:47 UTC. Engineer: Sonnet impl.
## Done
(nothing yet; read spec + gate-close-app-report)
## In progress
orientation: reading code (NIGHT_LOOK, ant material, cameras)
## Remaining (spec order)
1 night look; 2 ant cuticle; 3 cameras (follow slope, possession low-room stage1a strict, observer after colony view); 4 dressing (leaves, mound foot, horizon strip, far buildings); 5 colony labels DOF; 6 HUD/text (pad View tap in frames, auto-slow flash + time.auto-slow event, newgame inEffect marking, season strings day 5 spring); 7 playthrough rerun; report docs/design/tasks/look-pass-3-report.md
## Evidence root
test-output/look3/
## Notes
- 18:58 wrote tests/e2e/look3.mjs (before/after shot driver, LOOK3_SET=night|ants or LOOK3_SHOTS=light:view:quality,...; reuses tests/e2e/lib/look2-stage.mjs). Launched BEFORE night set -> test-output/look3/before/ (log before-night.log).
- notes: dawn = hour 3.9 (sun symmetric about 12.0). Crop can't be set via __game (no sim handle); gaster look goes through spikes/render-ants-demo 'replete' scene (read-only for me).

- 19:07 (clock) item 6 CODE written, NOT yet run through tests/typecheck (wait until harness idle):
  * pad tap in frames: src/input/sources.ts (PAD_TAP_MAX_POLLS 2; polls counted; tap ms = frames*17; hold pulse needs >2 polls), src/ui/nav/padReader.ts (same), tests added in src/input/inputState.test.ts + src/ui/nav/nav.test.ts (also changed the old 'reports edges' test to a 3-poll press).
  * auto-slow flash + event: src/game/time/autoSlow.ts (apply gets `why`), Game.ts onAutoSlow (setSpeed, emits sim event time.auto-slow, autoSlowFlashes++), uiBridge.ts + ui/api.ts (UiSpeed.autoSlowFlash, optional), TimeCluster.tsx + hud.css (is-flash, 900 ms), tests in autoSlow.test.ts, uiBridge.hud.test.ts.
  * New Game: src/ui/screens/newgame/presetRows.ts (+NewGame.tsx PresetDetails, unwired rules disabled 'Not in this build', screens.css), test newgame.test.ts.
  * season strings: species.ts (Lasius card 'spring', foundingSeasonOf() from sim data startDoy), Loading.tsx, NewGame.tsx, content/text/alerts.ts sample. LIST for report: species card, loading summary, alerts sample; sim/species/data/lasius-niger.ts foundingSeason 'summer' (sim, not mine); game/title/titleWorld.ts vignette 'summer day 3' (backdrop only).
- BEFORE night shots running (test-output/look3/before, log before-night.log): ~2 min per shot.
- 18:59 session 2 (restarted 18:55): re-read spec+gate report; before night shots exist only for night:surface and night:observerlow (high) in test-output/look3/before; running item-6 unit tests now
- 19:00 item6 unit tests green + typecheck clean (fixed species.ts castes comment bug). Running 'before' for remaining night lights in bg (before-night2.log). Plan: tune via runtime patch (import('/src/render/world/lighting/constants.ts') in page, mutate NIGHT_LOOK) -> add LOOK3_EVAL/variants to look3.mjs
- 19:20 added NIGHT_LOOK.envKeep (constants.ts, timeOfDay.ts); look3.mjs has LOOK3_VARIANTS (runtime eval patches); before shots for 5 lights x (surface,observerlow) done in test-output/look3/before. Now tuning night via test-output/look3/tune/v1.json
- 19:35 DONE (code+tests): night look re-metered (constants.ts NIGHT_LOOK targetE 1.7/minEV 2.2/envKeep 0.35/overcastSky darker, night keys saturation 0.5/0.55, STARS_DOF_GAIN 0.05; timeOfDay.ts envKeep); lookPass2.test/lighting.test pins updated (EV 2.89 clear, 3.07 rain; ground luma band 9..17 %). Measured (tune1-a): ground 0.164->0.111 (clear), 0.160->0.103 (rain). Variants run showed 'b' (targetE 1.3) too dark.
- 19:35 ant shader edits (NOT yet seen in a picture): vertexChunk.ts/fragmentChunk.ts vAntK (clearcoat gain on stretched membranes; rim gain 0.3 on legs/antennae = tuning.ANT_FILL_RIM_THIN); membrane colours darker in morph/*.ts. Scripts: tests/e2e/look3.mjs (+slopeup/slopedown views, LOOK3_VARIANTS), tests/e2e/look3-replete.mjs (ants demo, replete gaster).
- NEXT: run 'ants' set at night for fill variants (ANT_FILL tuning), then after-night set, then cameras (slope repro via look3 slopeup/slopedown; stage1a strict), dressing, colony label DOF, playthrough.
- 19:48 DONE code+unit tests (no picture yet): label depth (MarkerRenderer.ts AlwaysDepth depthWrite), mound rim rag (moundRenderer.ts MOUND_RIM_RAG_MM), facade structure (boundary/backdrop.ts + tuning.ts), leaf contact fringe+lit edge (decor/drapedMaterial.ts, DECOR_LEAF in decor/tuning.ts; lift/curl NOT changed: drapedShape.verify test needs them), camera slope lift (camera/constants.ts CAM_SLOPE_LIFT_*, thirdPersonRig.ts, test), tight-room camera radius shrink (CAM_TIGHT_*, thirdPersonRig.ts radiusScale, tests), observer after colony view (game/views/viewSwitch.ts observerAfterColony + test), highlight rim gain on thin parts (fragmentChunk.ts).
- PLAN for pictures: BEFORE set must use original code: back up my edited files (cp to test-output/look3/mine/), `git show HEAD:path > path` for render files, run before set (look3.mjs shots), restore. Then AFTER set. Still to run: stage1a strict, panels.mjs, photo/views/controls/firstplay, playthrough, perf draws/tris per quality.
- tune3 (ant fill variants e0/e1/e2, night close high/test) running -> test-output/look3/tune/tune3-*.png
- 19:53 !! BEFORE-run mechanics: test-output/look3/mine/stash.sh puts ORIGINAL render files (commit 29d44ee) in place and keeps mine in test-output/look3/mine/new/; unstash.sh restores mine. IF A RESTART HAPPENS WHILE STASHED: run unstash.sh FIRST (check 'ls test-output/look3/mine/STASHED'). Do not edit src while stashed.
- 20:10 BEFORE run started (run-before.sh; stashed until test-output/look3/mine/before-done exists). ANT_FILL chosen night body 0.7 rim 0.22 (tune4 e1).
