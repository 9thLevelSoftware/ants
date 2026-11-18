# look-pass-4 impl progress (started 2026-11-18 10:38 UTC)
## Scripts (mine, in tests/e2e): look4-recon.mjs (hide named parts via layers; HIDE_PARTS=prefixes), look4-pose.mjs (opening + from-above shots), look4-prims.mjs (scratch)
Harness run ~60-90 s each: node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=high" --script <s> --out test-output/look4/<dir> --timeout 600000 --script-timeout 900000
## Findings
- Item 1 cause: the pale slab is a single draped LEAF (decor:draped mesh, kind 0 fresh maple atlas, len 60-110 mm) in src/render/world/decor/drapedMaterial.ts (dcItem leaf branch). Atlas is 256 px/cell so at ant eye it is a blurry flat green, edge from alpha is smooth. Fix = procedural veins + ragged edge + high-frequency mottle in the leaf branch (not terrain, not prim).
- Hiding unnamed meshes by visible= does not stick; use o.layers.set(5).
- orbit(0,-75) looks down; KeepHUD: KeyH did not hide HUD in my scripts.
## Done
(nothing finished yet)
## Remaining
1 fix leaf, check other ground patch kinds x5 archetypes (med+high); 2 far structures; 3 bare ground low tier; 4 minimap; 5 possession camera; 6 wording/overlap; 7 first read-out; 8 README; 9 e2e; report docs/design/tasks/look-pass-4-report.md
## Done (11:30 UTC)
- Item 1 code: leaf detail in drapedMaterial.ts + DECOR_LEAF tuning (detailFadeMm, warp, serration, veins...). Pictures test-output/look4/item1/{before,after}-*. Batch of 5 archetypes x high/medium running (tests/e2e/look4-batch.sh, OUT=test-output/look4/item1, bg) -> look at item1/<arch>-<q>/opening.png
- Item 6 code: rows.ts number-first (TAIL_WORDS/NUMBER_ONLY), blockingCard.ts handover blocks, OnboardingPrompts hides hint while blocking card. tests updated (hud.logic.test.ts, blockingCard.test.ts) pass. NO picture yet for 6.
## Done (11:50 UTC)
- Item 7 code: siteAdvice.ts (+test) + FoundingUi.site.advice + PlayPanels/founding.css line; focusAimOf newColony sticky while aim-find-site (test updated). No picture yet (take opening shot again).
- Item 4 code: minimap.ts food+structures+water in plate; model.ts smoothed paintPlate (test); Minimap.tsx paint shapes. No picture/cost number yet.
- Item 5 DECISION: GDD 01 s6.2 + GDD 08 s7.4 row 648 (Camera horizon Follow surface default / Keep level option) say camera up follows the surface; task says follow GDD if it differs -> NOT changing default; setting 'Keep level' exists. Maybe add pictures follow vs keep-level on a slope (optional).
## Remaining
item1 patch pictures (batch running -> look at test-output/look4/item1/*/opening.png), item 2 far structures (surfacePatch.ts material path), item 3 low tier ground detail, item 4/6/7 pictures, item 8 README, item 9 e2e, tests per folder, report
## Done (12:20 UTC)
- Item 2 code: materials/faceDetail.ts (+test) wired in surfacePatch.ts (WR_FACE: masonry plinth/brick courses/panel seams, metal seams, fogKeep 0.45). NOT yet pictured/looked at in browser (shader compile unverified!).
- Item 3 code: NEAR_GROUND floor (decor/tuning.ts, bladeShape.ts, drapedShape.ts, DecorRenderer.applyLod), GRIT_QUALITY test/low now 120 mm radius (test was 0 = no grit; first-play quality = `test`). nearGround.test.ts. DecorRenderer/leafFringe tests adapted. Cost numbers (draws/tris before/after) NOT measured yet: plan tests/e2e/look4-cost.mjs, before = revert constants temporarily.
- Item1 batch finished: pictures in test-output/look4/item1/<arch>-<high|medium>/opening.png (look at them all; only suburban/woodland/playground/car-park(high)/kitchen(high) looked at so far)
## Remaining
browser verification of 2/3 (shader compile), cost, item 4/6/7 pictures, item 8 README, item 9 e2e, folder tests, report
## Done (12:50 UTC)
- Item 8 README done (species flag test=1 only; one manual).
- Minimap paint fast path (uniform pixels) + bench: worst-case checker map 0.50 ms @176px / 2.07 ms @352px (old 0.14 / 0.57); repaint every 200 ms. tests/e2e/look4-minimap.mjs written, NOT run yet (--dpr 2).
- faceDetail.ts also does boards on thick wooden bodies (shed). 
- Cost batch (bg): tests/e2e/look4-cost.sh TAG=after OUT=test-output/look4/cost -> after-<tier>.log 'COST' lines; BEFORE numbers still to take (revert GRIT_QUALITY test/low + NEAR_GROUND to old values temporarily: test max0, low max700 radius90; NEAR_GROUND.mm=0), then restore!
- COST (opening pose seed 1, draws/tris before -> after): test 21/259200 -> 23/271700; low 47/490790 -> 47/525924 (+7.2% tris); medium 82/606509 -> 82/622117 (+2.6%); high 91/875694 -> 91/875694. Constants restored (verified).
