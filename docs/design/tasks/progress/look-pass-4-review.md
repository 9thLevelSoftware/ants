# look-pass-4 review progress
Started 06:55 UTC Nov 22 (no earlier progress file).
## Done
- read spec, report, full diff 19a5875..HEAD for src/ui, src/game, src/render (owned code changed by the task)
- typecheck clean; vitest on touched folders (hud, panels/inspect, flows/founding, uiBridge, render world materials/boundary/decor/vegetation/dressing): 57 files, 319 pass, 1 skip
- harness probes (scripts in test-output/look4-review/: facade.mjs, facade2.mjs, log.mjs); BEFORE tree = scratchpad copy of HEAD with surfacePatch.ts from 19a5875 (scratchpad/oldtree, may be gone after restart)
  - CONFIRMED double brick: test-output/look4-review/facade-sill-crop.png vs facade-sill-crop-before.png (procedural grey course grid misaligned over scanned bricks)
  - CONFIRMED plinth stripe + coursing restart at partition band edge y=1050 (facade-medium3/facade-sill.png rows 300-336 lum 46 vs 60)
  - CONFIRMED stumps get board staves + bright seam lines at quadrant switch: log-medium/log2-*-900.png vs log-medium-before/
## In progress
- verify tests (bladeShape twin, faceDetail cylinder/bands, minimap cost, rows, siteAdvice)
## Remaining
- verify tests: bladeShape CPU twin near floor; faceDetail plinth on raised bands; minimap paintPlate cost / zoomed window; rows.ts; siteAdvice
- report
## Findings so far (candidates, verify before reporting)
- bladeVertex CPU twin lacks NEAR_GROUND floor (GLSL has it) -> twin out of sync (minor)
- faceDetail plinth/brick courses use prim-local y: partitioned facade bands (interior/shell.ts partition) get plinth stripes mid-wall?
- minimap repaint 0.14 -> 1.1 ms: spec says keep cost as now (major)
- kerb/plastic play equipment/curved props: no face detail (spec lists kerb, play equipment, car, furniture)
- item 2 tiers low/high not pictured; cars not pictured
