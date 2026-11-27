# app-seams-4 review progress (Opus reviewer)
Started 2026-11-24 19:55 UTC. Last update see bottom.
## Done
- read spec, report, docs; read all diffs since 51fbd5c in owned paths (ants fade, moon rim, creatures, flood water, planner, storesFull, card framing, e2e)
- npm run typecheck: clean (19:57)
- vitest task tests (occluderFade, lookFixes, lookReview3, weather, founding, storesFull, colonyTools): 17 files / 89 passed
- looked at implementer sheets: item3 fade low, item4 water, item5 cards final, probe-s1 12b, full-s2/10, full-s2/12
## In progress
- verify tests written+passing: src/render/ants/occluderFade.verify.test.ts, src/game/flows/founding/cellFootprint.verify.test.ts, src/game/views/colony/digPlanner.verify.test.ts (hover 0.6-1.2 ms strict), src/game/uiBridge/storesFull.verify.test.ts
- RUNNING (20:04 UTC): harness seed 3 FIRSTPLAY_UNTIL=12 -> test-output/app4-review/s3-u12 (log s3-u12.log); do not start another browser
## Remaining
- harness: seed 3 FIRSTPLAY_UNTIL=12 on final code (card framing unverified for s2/s3); maybe fade check
- final report
## Findings so far
- MAJOR: creatures not faded by the occluder rule (spec item 3 "ant (or any creature)"); no fade code in src/render/creatures
- MAJOR (acknowledged): leaf litter at night not fixed (item 6)
- card framing seeds 2/3 not verified on final code; seed 3 last picture shows cell touching top of frame (sheets/item5-cards-final.jpg)
- edge-on pale band of flood water still visible (full-s2/10-first-clutch.png)
- uncommitted working-tree decor revert (DecorRenderer/drapedMaterial/shared/tuning) - implementer's leaf revert, not committed
- creature moon rim numbers inline in GLSL (creatureChunk.ts), minor
- 20:06 HYPOTHESIS leaf floor: leaf3 variants changed only nightAlbedo.dry (fresh held 0.30); pale maple-shaped leaves = FRESH atlas (drapedMaterial.ts:44-66, uDcFreshTint*kf); summer freshTint 0.85-0.95 vs dryTint 0.5. Next after s3 run: look3 variants test-output/app4-review/leaf-fresh-variants.json (f40/f10/d04f10), shot h22-clear:observerlow:medium -> test-output/app4-review/leaf

## RESUMED Nov 27 06:05 UTC (new reviewer session, after restart 10)
- tree clean at 8acb348; the four verify tests above are committed (7dc744f). s3-u12 run was cut at beat 05 (pause).
- plan: re-run typecheck + task tests + verify tests; harness seed 3 (and 2) card framing; water edge; leaf; final report.
