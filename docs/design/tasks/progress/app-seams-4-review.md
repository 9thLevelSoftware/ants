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
- 06:10 typecheck clean; vitest render/ants, render/world/weather, render/creatures, game/flows/founding, game/uiBridge, game/views/colony: 68 files / 439 passed (incl. the 4 verify files)
- 06:15 app4-card2 on handover saves is useless: the handover save shows phase done, no card (implementer cards/s3.log "card false"). Killed.
- 06:22 RUNNING: FIRSTPLAY_SEED=00000003 FIRSTPLAY_UNTIL=12b firstplay quality=test -> test-output/app4-review/s3-u12 (log s3-u12.log)
- 06:25 wrote src/render/ants/occluderRenderer.verify.test.ts (possess faded ant -> solid at once; fadeDbg array per frame = expected FAIL, minor). NOT YET RUN (harness running)
- findings added: MAJOR edge-on pale band of flood water seen in implementer's own full-s2/10-first-clutch.png and sheets/item4-water-before-after.jpg bottom-left; minor planner hint text still "Point at a nest wall"; minor fadeDbg per-frame array (AntRenderer.ts update)
- 06:28 seed 3 on final code: 12b settled card = cell whole, queen central, but SMALL (about 90 px of a ~240 px band, upper part); beat 12 (0.5 s) shows the cell cut by the card's top edge (camera still easing). UNTIL=12b does not stop (done('12') vs prefix '12b'): run continues to 25, letting it finish for item 7 evidence.
- leaf: fresh-atlas hypothesis supported by code (drapedMaterial.ts: fresh = tDcFresh*uDcFreshTint, scaled by nightAlbedo.fresh 0.4; implementer varied only dry 0.04..0.10 -> no change); maple-shaped pale leaves in nightf pictures. Variant run still planned after firstplay.
- 06:40 seed 3 run ended FAIL at 13->14: 'no forager laid a trail within 18000 ticks' (waited 24000: food-chamber path + forage marker taken, trail 0; c 14 p 1.9, 10 workers). Implementer's full-s3 found a trail by scouts in 4200 ticks. No src/sim diff since 3af6006. vitest occluderRenderer.verify: 1 pass, 1 expected fail (fadeDbg). typecheck clean.
- 06:41 RUNNING leaf variants look3 -> test-output/app4-review/leaf (log leaf.log)
- 06:50 leaf variants done (test-output/app4-review/leaf): fresh 0.40 -> 0.10 turns the pale maple leaves dark (lf-f40 vs lf-f10): cause = FRESH atlas albedo (DECOR_LEAF.nightAlbedo.fresh), not an unknown floor. CONFIRMED.
- 06:52 REVIEW COMPLETE: verdict fail (majors: seed 3 13->14 not reproducible; flood water edge-on band / pale; creatures not faded; leaf litter wrong knob). Structured output sent.
