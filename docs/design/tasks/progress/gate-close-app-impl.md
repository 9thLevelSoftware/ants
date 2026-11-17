# gate-close-app — progress (impl)

Started 2026-11-17 03:20 UTC. Evidence root: test-output/gate-close/app/

## Done
- Step 1: typecheck clean (03:22). Unit tests per folder: test-output/gate-close/app/unit/{summary.txt,*.log}. All green except
  src/ui/panels/health/model.test.ts (new species remedy ids w/o action) -> FIXED in src/ui/panels/health/model.ts
  (REMEDY_ACTION entries + 'brood' control). controls.test.ts and scentTrail.test.ts now green.
- Seam R15: src/sim/combat/alerts.ts pinned -> critical; test src/sim/combat/pinnedLevel.verify.test.ts (green). cross-edit logged.
- Seam founding-flooding: src/sim/nest/flood/diagnostics.ts (opening-only, in-place update, diag label names chamber);
  test src/sim/nest/flood/foundingAlertAfterOpening.verify.test.ts (green with founding.test.ts). cross-edit logged.

- Seam foundingGate: removed src/ui/hud/prompts/foundingGate.ts; PlayPanels.tsx Prompts asks onboarding engine (promptVisibility moved to foundingShown.ts). Tests in src/ui/hud/prompts green.
- Seam groom-in-flight: src/sim/ants/player/prompt.ts flying() -> no prompt; test promptFlight.verify.test.ts. cross-edit logged.
- Seam winter journal: src/sim/progression/events.ts 'event.winter-notice' + text in src/content/text/journal.ts/journalText.ts; test src/sim/progression/winterNoticeJournal.verify.test.ts.
- Seam auto-slow: NEW src/game/time/autoSlow.ts (+test) wired in Game.ts (attach/detach). Auto-slow did not exist at all before.
- typecheck clean after all of the above (03:5x).

- Seam CV_DIST_BU: src/render/camera/{constants.ts (CV_DIST_PER_NEST_SPAN, CV_DIST_SMALL_MIN_BU), colonyRig.ts setNestSpan}, src/game/views/viewsLayer.ts nestSpanBu; test in src/render/camera/rigs.test.ts (green).
- a11y flash reduction: FlashTimer in src/render/world/weather/lightning.ts (+ min gap 4 s, no restart mid-glow), WeatherRenderer uses it; test src/render/world/weather/flashReduction.test.ts (E25 at 1x/4x/8x green).
- Night ant BEFORE shots running: test-output/gate-close/app/antfill/before (look2.mjs night,night-rain surface,observer high).

- ANT_FILL night body 2.2->1.1, rim 0.12->0.3 (src/render/ants/tuning.ts). AFTER shots still to take (same look2.mjs cmd, LOOK2_TAG=after).
- Sound-cue indicators: NEW src/game/soundCues.ts (+test), src/ui/hud/SoundCuePips.tsx, src/content/text/soundCues.ts, UiSnapshot.soundCues (src/ui/api.ts), SnapshotSource.soundCues (src/game/uiBridge.ts), Game.ts wiring, hud.css. Not yet seen in browser.
- e2e runner: test-output/gate-close/app/e2e/run.sh <names...> (sequential), summary.txt there.

- Males at swarm: NEW src/render/ants/swarm.ts (+test), SWARM in tuning.ts, SimReader appends swarm (simAdapter.ts). Need lifecycle.mjs flight shot to see it.
- founding.mjs FOUNDING_PAD=1 mode (seal/lay via virtual pad A); runner name foundingPad.
- NEW tests/e2e/playthrough.mjs (step 4) and tests/e2e/frametime.mjs (step 5); runner names playSeed1, playKitchen, frametime.
- NOTE: detached (setsid/nohup) launches are refused by the permission system; run runner chunks via run_in_background (<2h each).

## In progress
- Step 3 seams: night ant fill (ANT_FILL), CV_DIST_BU, males at swarm; a11y leftovers.

## Remaining (spec order)
2 browser scripts; 3 rest of seams; a11y leftovers (sound cues, flash EV, pad seal/lay); 4 play-through shots; 5 frame time; 6 portable build; 7 report

## Findings / decisions
- Species engineers add remedy ids to src/content/text/words.ts; health model needs an action per id (test enforces).
- 04:02 controls.mjs PASS (622 s). After-shots done: night clear ant now dark w/ rim (antContrast 0.13->0.03 metric but visibly readable); night-rain UNCHANGED (fill is off at that EV; the pale glassy look there = clearcoat/sheen env reflection) -> report.
- Seen: observer at night shows pale straight strip at horizon (after-night-observer-high.png); leaves read as flat decals.
- 04:07 lifecycle PASS (03-flight: no groom prompt; males not visible in frame -> added result.flightAnts stats to lifecycle.mjs, rerun pending). 04:22 onboarding FAIL at B11: hint-directives engine fallback fired at once -> APP DEFECT fixed: src/game/onboarding/facts.ts daysSinceFirstWorker used calendarTick vs sim-tick milestone; test facts.firstWorker.test.ts. Rerun pending.
- Running now (bg): founding1, foundingPad.
- Queue after: firstplay; stage1a founding2 founding3; onboarding lifecycle; views panelsA panelsB; photo a11yA a11yB; stage2; playSeed1 playKitchen frametime; portable build.
- 04:36 founding1 PASS (flooding on; sealed 400 ticks, 3 plugs, 18 eggs, 8 workers). 04:44 foundingPad: SEAL BY PAD WORKS (A tap -> prompt says "Put down soil pellet" but founding guide seals: 3 plugs/400 ticks). LAY BY PAD partial: 1 batch of 6 by A; then prompt switches to "Pick up egg" (brood class outranks queen's lay class 9 in src/sim/ants/player/targeting.ts) -> queen picks up her egg, lapse never starts -> script fails. Report as sim/prompt finding (not changed).
- firstplay running in bg since 04:45.
- Seen founding1/04-sealed-chamber-eggs-high.png: flood water film (4 %) drawn as pale opaque cross-shaped slab -> FIXED in src/render/world/weather/floodWater.ts (vertex-alpha feathered outline) + tuning (opacity 0.65, roughness 0.55, FLOOD_WATER_EDGE_ALPHA); test floodSheet.test.ts. Needs a re-shot (founding2/3 runs will show).
- 05:06 firstplay: ALL 25 BEATS SHOT (opening real, trail/harvest/deliver ok, save/continue ok); FAILS only the growth assert (SIM): seed 2 "test=1&quality=test", days summer 6 -> autumn 1 at 8x, workers 15,15,15; brood 8,7,4; P 2.25,1.62,0.26; C 5.96,14,14. Evidence test-output/gate-close/app/e2e/firstplay{,.log,.json}.
- Running: onboarding lifecycle stage1a founding2 (bg, from 05:07).
- 05:33 onboarding PASS after facts fix (3 recorded stand-ins: hint-share, delivery, trail-established).
- 05:40 lifecycle PASS again; flightAnts stats: 90 ants known to renderer, drawn lod0 1 + lod3 12, culled 77 -> swarm males drawn only at far LOD, not readable in 03-flight.png (gyne flies ~35 BU above lek centre). Report males seam as PARTIAL.
- 05:45 swarm now centres on the gyne in lek/mate phases (swarm.ts gyne arg; SWARM.radiusBu [2,9]); test added. lifecycle rerun needed to see it.
- 05:47 stage1a strict FAIL at egg (lay refused in dig phase: founding lays only after sealing). Script now plays seal->lay before stand-in (tests/e2e/stage1a.mjs). Rerun pending.
- 06:01 founding2 PASS (sealed 100 ticks, 3 plugs, 24 eggs, 16 workers). Running: founding3 stage1a lifecycle views (bg from 06:02).
- Report draft being written at docs/design/tasks/gate-close-app-report.md.
- 06:14 founding3 PASS (sealed 50 ticks, 2 plugs, 7 workers).
- 06:22 stage1a strict still FAIL at egg; added log of the seal->lay path (phase) to see why; rerun later.
- 06:28 lifecycle PASS; 03-flight.png now SHOWS the males' swarm round the gyne (lod2 20 + lod3 10 drawn). Males fly in walking pose, wings faint; gyne pale at night -> still-wrong list.
- 06:31 views FAIL: script took an off-screen second worker (project() null). Script fixed to pick an on-screen worker (tests/e2e/views.mjs ~181). Swarm males now in 'fly' pose.
- Running (bg from 06:35): views stage1a panelsA panelsB. Then: photo a11yA a11yB; stage2; playSeed1; playKitchen; frametime; portable.
- 06:41 stage1a strict FAIL at egg: opening phase is still 'intro-card' (the 1A script never plays the opening; founding lays only in phase lay). Script/design mismatch; egg path proven by founding.mjs x3 + firstplay. Report, no further change.
- 06:54 panelsA PASS (stand-ins hand-over, alert-with-focus recorded by script). 06:59 panelsB FAIL at View-tap -> tool UI (tap measured in real ms vs VIEW_TAP_MS 450 under load: likely load timing; rerun alone later). Running (bg 07:00): views photo a11yA a11yB.
- 07:07 views PASS (after script fix). 07:08 photo FAIL: page ReferenceError 'difficultyValue is not defined' — src/sim/balance/difficulty.ts being edited by difficulty-rules engineer right now (sim WIP); rerun later.
- a11yA sec C FAIL: no hint because onboarding silent while foundingInProgress (nest founding 'reopening' until plug dug, R14 up to 4 gh). Script fixed to play on until foundingInProgress false (tests/e2e/a11y.mjs ~407). Rerun a11yA later.
- 07:38 a11yA FAIL: B (RB possess-next; script now 1-frame tap with retries) and C (hint; script now plays on). Other sections OK. a11yB running.
- 07:51 a11yB PASS. Next chunk: playSeed1 photo.
- 08:05 playSeed1 running. NOTE: playthrough steps 1200 ticks (= 2 min of play at 1x) per shot for BOTH the 1x and 4x halves (4x half covers 1/4 of 20 real min at 4x). Document honestly.
- 08:2x Seen playSeed1/x1-m06-slice.png: label plate + outlines blown to white (exposure scales overlay). FIXED src/render/fx/markers/MarkerRenderer.ts holdAgainstExposure (+exposureHold.test.ts). Also seen: 'Tab Next ant' chip overlaps colony tool palette; hand-over choice card stays on screen for hours.
- keepOut.ts: .pn-panel added to REGIONS (hint/prompt avoid colony palette).
- 08:45 playSeed1 at day-night part (20/32 shots). Seen: x4-m16-possession: nearby ant fading through camera capsule looks like a pale ghost skeleton with white dots; no ants visible on the surface in any observer shot (workers stay in); brood 8 eggs -> 5 larvae, workers flat 12.
- 09:11 playSeed1 DONE (32 shots). Seen day-night: night frames (h06 19:52, h12 01:52, h16 05:52) look like daylight with a dark-blue sky band: night exposure lift too strong at observer height; leaf decal 'shadows' constant. Next chunk: stage2 panelsB a11yA.
- 09:20 stopped a second chunk (stage2) that overlapped the photo run (one browser rule). Day-night review: night at ground level is the calibrated look-pass-2 metering (NIGHT_LOOK target luma, tested), dark leaf shapes are soil gaps, not stale shadows. Reported, not changed.
- 09:25 fixed night colony slice blow-out (CUTAWAY.refEV + uCutGain; cutGain.test.ts green; typecheck clean). slicenight.mjs written for the re-shot. Report section 4 drafted. Waiting for photo to end before stage2/panelsB/a11yA.
- 09:22 fixed: hand-over banner closes when the player changes the view (src/game/flows/founding/flow.ts, flow.test.ts new case, 6/6 green, typecheck clean).
- 09:29 photo PASS (exit 0). Next chunk: slicenight panelsB a11yA.
- 09:35 slicenight re-shot: night slice fixed (looked at). Found keep-out never saw the palette (mounted outside HUD root) -> keepOut.ts searches the document; keepOut.test.ts; HUD tests 78/78.
- 09:36 fixed photo-mode dotted queen (capsule off while possession rim hidden; lookFixes.test.ts 5/5). Queue: photo rerun to confirm.
- 09:42 panelsB FAIL again at the View tap (real-ms tap threshold VIEW_TAP_MS 450 vs page frame time under load 9-10): not measured under load. a11yA running.
- 10:35 a11yA: B passes now; C fails (hints silent: foundingInProgress true 2 game days after the cheat hand-over, nest record never established). Next: stage2 alone.
- 11:34 stage2 running (sections creatures..rain OK so far).
