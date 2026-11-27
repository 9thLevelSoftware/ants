# app-seams-4 fix progress
Started 2026-11-27. Findings: F1 s3 trail beat, F2 flood water edge-on, F3 creatures occluder fade, F4 night leaf fresh albedo, F5 card framing s3, F6 fadeDbg alloc, F7 creature moon rim inline, F8 dig hint text, F9 FIRSTPLAY_UNTIL=12b.
## Done
(nothing yet)
## In progress
reading docs
- 2026-11-27 fixed F6 (AntRenderer fadeDbg in place), F7 (creatureChunk uses ANT_MOON_RIM/ANT_FILL.cool), F8 (dig hint in markers/model.ts + MANUAL), F9 (done('12b')). Not yet re-tested. Now: F4 leaf variants f18/f25 (test-output/app4-review/leaf2)
- F4: DECOR_LEAF.nightAlbedo.fresh 0.4 -> 0.18 chosen from variants (test-output/app4-review/leaf2); still to: re-shoot 22:00/02:00 clear+rain, fix DEVIATIONS D-APP4-5, MANUAL line 824, report. NEXT: F3 creatures occluder fade
- F3 code written (creature occluder fade: aHide attr, CreatureRenderer.setOccluderSubject, AntRenderer.occluderSubject, CreaturesSlot). TODO: typecheck, tests (creatures fade test), render check
- wrote src/render/creatures/occluderFade.test.ts; typecheck clean after F3 code
- F3 done+tested (occluderFade.test.ts passes). NEXT F2 flood water edge-on, then F5 card, F1 trail beat, visuals round
- F2 code: nest FLOOD_VOLUME tint (params.ts, nestUniforms uFlood*, glsl.ts, NestRenderer.setFloodLevel, nestSlot.floodLevel), flood sheet grazing alpha + darker tint (weather/tuning FLOOD_WATER, floodWater.ts). app4-water.mjs got colony-view-edge shot. Running app4-water APP4_TAG=fix -> test-output/app4-fix/water
- F2: first fix run seen from above ok (darker). Need edge-on picture: only via firstplay seed2 beat 10 (queen on steep wall -> side cell cam). Plan: after F5 code, run firstplay seed 2 and 3 UNTIL=12b and look at beat 10 + 12 + 12b
- 06:49 RUNNING firstplay seed 2 UNTIL=12b CARDPROBE -> test-output/app4-fix/s2-u12 (log s2-u12.log). don't start another browser
- F5 part 1 done: viewDirector.nextShotSubject retakes the picture at once (crossfade) when the card changes lift/fill; shotAskChanged in foundingShot.ts + test (not yet run). part 2 (cell small) waits for seed2/3 CARDPROBE data
- F5 part 2: card now hangs from 62vh (founding.css .fo-card-wrap padding-top; cardFraming.CARD_TOP_FRACTION; tests updated incl reviewer cellFootprint.verify.test.ts: only the old card geometry constant swapped). floodLevel now nearest nest to camera. app4-water.mjs got APP4_SIDE walk to side cell cam: fix3-08-cell-side.png shows blue pool volume. flood sheets straight diagonal edges = sim BFS flooded-set shape (report as sim). TODO: run vitest (founding, camera, creatures, ants, nest, weather, uiBridge, views/colony, slots), then F1
- DECISION: F5 size: sphere fit gives cell ~1/3 of band (reviewer test shows 0.323). Possible further fix = yaw-fixed rect fit (stop orbit during card, cellFootprint(yaw), kx from width): NOT DONE yet; do after F1 if budget. cardFraming.test.ts perspectiveGrow range loosened (fill bigger now). reviewer test 'at least a third' now fails at 0.323 -> either do rect fit or adjust threshold with note
- 07:05 RUNNING firstplay seed 3 full w/ CHECKPOINT test-output/app4-fix/s3-handover.save -> test-output/app4-fix/s3 (log s3.log) - goal: get the hand-over save to explore F1 (trail beat) and 12b card on seed 3. Analysis so far F1: colony with full sugar larder + protein need: needC=0 -> activation.ts knownSourceNeed 0 for sugar-only source -> no recruit; correct beat form = spawn what the colony needs / follow real trail
- F5 rect-fit code written: cellFootprintFramed (cellFootprint.ts), cardFraming kx/kq, FoundingShotSubject.yawRad, shotSubject frame param, flow.shotSubjectNow, viewDirector holds yaw/no orbit; test src/game/flows/founding/cellFootprintFramed.test.ts NOT YET RUN (harness running)
