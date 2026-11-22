# app-seams-3 progress (impl)
Started 2026-11-22 08:30 UTC.

## Item 1 DONE (08:35)
Cause: gzip header MTIME/XFL/OS, the ISIZE trailer and deflate-equivalent bit flips were unchecked (fflate writes wall-clock MTIME).
Fix: src/game/save/gzipFrame.ts (sealGzip, frameProblem, lengthMatches) used by container.ts. New saves: FEXTRA subfield `FC` = CRC32 of deflate body, MTIME 0.
Legacy saves (FLG 0) still open; fixture src/game/save/fixtures/legacySave.fixture.ts written by the OLD code. Test: src/game/save/container.frame.test.ts. `npx vitest run src/game/save` 110 pass.
Legacy limits: MTIME (4 bytes) and deflate-equivalent flips in legacy saves stay undetectable (nothing covers them).

## Remaining in order: 2 alert title, 3 backdrop cars, 4 stage1a egg beat, 5 epitaph cause + queen gloss, 6 report

## Item 2 DONE (08:45)
UI-side wording by cause: src/content/text/{alerts,index}.ts (alertText), src/game/uiBridge/hudSlices.ts (alertsOf rewords queen-in-danger). ALERT_TEXT left unchanged because src/sim/nest/flood/founding.test.ts reads ALERT_TEXT title.
Test src/game/uiBridge/queenAlertWording.test.ts; DEVIATIONS row D-APP3-1 (tests/docs/docs-final.test.ts green). Picture test-output/app-seams-3/alerts/queen-danger-cards.png (looked at: all 3 cards right). Script tests/e2e/appSeams3-alerts.mjs.
Also fixed: combat's raw cause tokens ('hostile-near','damage') were shown on the card.

## Item 3 DONE (08:50), no code change
Worlds with backdrop cars: edge runs of treatment 'road' (asphalt zone inside the edge). Compact worlds tried, 6 archetypes x seeds 1-3: road runs in woodland-edge s3, car-park-verge s1-3, field-margin s1-3 (7 of 18); none in suburban-garden, playground-park, kitchen-door. Density 0.18/m: 2 cars per 12 m run, ~3 per 16 m side.
Script tests/e2e/appSeams3-cars.mjs (car-park-verge seed 1 size=compact). Pictures test-output/app-seams-3/cars/: ant-0..2 (ant height at the edge: huge flat coloured blocks, hashed-alpha speckle, by design), meta-edge + meta-high (raised observer: read as cars: window band, pillars, wheels, bumpers), start-view-150 (from the queen's start 7.7 m away, 150 mm up: car silhouettes with window bands in haze beside in-map car props). Decision: leave. "Meta camera" interpreted as raised observer view.
Minor note: BACKDROP_FUZZ 0.85 speckles large faces at ant height (all backdrop shapes, not cars only).

## Remaining: 4 stage1a egg beat, 5 epitaph cause + queen gloss, 6 report

## Item 4 IN PROGRESS (08:50)
Reading: stage1a.mjs step 7 first does act('lay-egg') on a queen whose opening is still on the intro card (refused: canLay needs opening phase in FOUNDING_LAY_PHASES, src/sim/colony/queen.ts canLay) then plays the real opening (playOpeningToLay); the stand-in fires only if that also fails. Running once non-strict, STAGE1A_SKIP_HIGH=1, out test-output/app-seams-3/stage1a, log stage1a-run1.log (background; do not start another browser).

## Item 4 (08:?? see date) script fixed, strict run still to do at the very end
Non-strict run (log test-output/app-seams-3/stage1a-run1.log): ok, standIns [] : the real opening path reached 'lay' and laid 6 eggs (egg path laidInOpening 6). The "lay-egg refused (lay-egg:budget)" text came from the script's blind first act('lay-egg') before the opening (correct refusal: canLay in src/sim/colony/queen.ts needs an opening phase in FOUNDING_LAY_PHASES; reason id 'budget' is a misleading name for "not in lay phase" -> note for sim).
Script change (tests/e2e/stage1a.mjs step 7): the refusal outside the lay phase is now an asserted check (egg.refusedOutsideLayPhase), the stand-in message reports the real opening log. TODO at end: STAGE1A_STRICT=1 STAGE1A_SKIP_HIGH=1 run once (about 10 min, log test-output/app-seams-3/stage1a-strict.log).
Epitaph (item 5a): cheat.killAll books 'unknown' (src/sim/colony/index.ts:279 killAnt(sim,a.id,'unknown')); screen shows what the sim recorded -> needs-from-others. No UI fix possible.
Next: item 5b queen gloss: script tests/e2e/appSeams3-queen.mjs written; run before at test/medium/high -> tune CUTICLE (src/render/ants/tuning.ts; test quality has no physical material: roughness only) -> after.

## Item 5 DONE except report text
5a epitaph: nothing the UI can fix (cause 'unknown' set by cheat.killAll in sim, see above).
5b queen: pictures test-output/app-seams-3/queen-{before,after}-{test,medium,high}/ (01-default rear view, 02-side) + queen-compare-side.png, queen-compare-rear.png, queen-sheet-before*.png. Finding: she reads as satin chitin (not plastic) side-on at all presets; from behind a flat dark disc with the pale possession rim (intended, GDD 01 6.5). Change: LASIUS_QUEEN colours lifted to about the worker tone (src/render/ants/morph/lasius.ts). Modest effect. Script tests/e2e/appSeams3-queen.mjs.
TODO: run ants tests, typecheck, strict stage1a run, report docs/design/tasks/app-seams-3-report.md

## ALL DONE (09:35 UTC)
Strict stage1a run passed (standIns [], ok) with STAGE1A_SKIP_HIGH=1. Tests: src/game 619, src/content+ui/hud+tests/docs 226, src/render/ants 123, all green; typecheck clean in my paths. Report written: docs/design/tasks/app-seams-3-report.md. Nothing left.
