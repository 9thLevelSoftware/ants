# look-pass-4 review progress
Started 06:55 UTC Nov 22 (no earlier progress file).
## Done
- read spec, report, full diff 19a5875..HEAD for src/ui, src/game, src/render (owned code changed by the task)
- typecheck clean; vitest on touched folders (hud, panels/inspect, flows/founding, uiBridge, render world materials/boundary/decor/vegetation/dressing): 57 files, 319 pass, 1 skip
- harness probes (scripts in test-output/look4-review/: facade.mjs, facade2.mjs, log.mjs); BEFORE tree = scratchpad copy of HEAD with surfacePatch.ts from 19a5875 (scratchpad/oldtree, may be gone after restart)
  - CONFIRMED double brick: test-output/look4-review/facade-sill-crop.png vs facade-sill-crop-before.png (procedural grey course grid misaligned over scanned bricks)
  - CONFIRMED plinth stripe + coursing restart at partition band edge y=1050 (facade-medium3/facade-sill.png rows 300-336 lum 46 vs 60)
  - CONFIRMED stumps get board staves + bright seam lines at quadrant switch: log-medium/log2-*-900.png vs log-medium-before/
- CONFIRMED acceptance 4 fails at low by the spec's method (tests/e2e/frametime.mjs FRAMETIME_N=2, seed 1 colony observer): tris 510773 -> 570857 (+11.8 %, repeated, deterministic); medium 712481->739517 (+3.8 %), high 985772->987012; draws 80/114/128 unchanged. Logs test-output/look4-review/frametime-{before,after,after2}.log; before tree scratchpad/oldrender (HEAD + src/render from 19a5875)
- verify tests written (failing ones are findings): src/render/world/vegetation/bladeShape.look4.verify.test.ts (1 fail: CPU twin), src/ui/hud/minimap/model.look4.verify.test.ts (3 fail: 1-block zone erased, 1-block strip erased, cost x3.8-5 vs nearest painter), src/ui/panels/inspect/rows.look4.verify.test.ts (1 fail: food loads rounded to 0), src/game/flows/founding/siteAdvice.verify.test.ts (1 fail: Leaf-covered -> 'look for leaf litter')
## In progress
- DONE: typecheck clean incl. new tests; final report being returned (StructuredOutput). Nothing left to run.
## Remaining
- verify tests: bladeShape CPU twin near floor; faceDetail plinth on raised bands; minimap paintPlate cost / zoomed window; rows.ts; siteAdvice
- report
## Findings so far (candidates, verify before reporting)
- bladeVertex CPU twin lacks NEAR_GROUND floor (GLSL has it) -> twin out of sync (minor)
- faceDetail plinth/brick courses use prim-local y: partitioned facade bands (interior/shell.ts partition) get plinth stripes mid-wall?
- minimap repaint 0.14 -> 1.1 ms: spec says keep cost as now (major)
- kerb/plastic play equipment/curved props: no face detail (spec lists kerb, play equipment, car, furniture)
- item 2 tiers low/high not pictured; cars not pictured
