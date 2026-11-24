# look-pass-6 impl progress
Started 23:40 UTC Nov 23 (container clock). Updated 00:20.
## Done
- Read docs. Scripts written: tests/e2e/look6-cell.mjs (record: FIRSTPLAY_SEED=00000001 FIRSTPLAY_UNTIL=08 L6_SAVE_OUT=<file> ... ; replay: L6_SAVE_IN=<file> with ?autostart=1; L6_CELLCAM=0 = old camera) and look6-sweep.mjs (queen teleported to 5 cell points).
- Saved real-founding game at beat 08, seed 1: test-output/look6/s1-cell.save (replay in ~3 min, record run 6 min).
- BEFORE pictures: test-output/look6/before/ (record, low), test-output/look6/sweep-before/ (sweep, low).
- Item 1 cause analysis: cell 18x10x16 mm, queen 8.5 mm; rig camera ends 0.8-1.7 L from her -> her fade dithers (GDD 6.5 rule1, 4x4 bayer = screen door), occlusion cone dithers soil and shows navy void behind, soil/near geometry planes. GDD silent on tight rooms -> cut the soil away (founding shot rule).
- Item 1 fix in progress: src/render/camera/cellCam.ts (CellCam + cellShotSubject), constants CELLCAM_*, foundingShotAt minRadiusBu param, ViewDirector.applyCellCam (+cellCamEnabled flag, views.cellCam(on) debug), ThirdPersonRig.speedMmS. Top mode (horizontal slice, up.y high) works: test-output/look6/sweep-after2/, after1/08. Cap texel too coarse (pale ring): adding texelMm to cutaway params (NestCutawayParams, CutawayParams, NestRenderer done). Throat/sloped tunnel (beats 09/10): horizontal slice cuts the queen -> adding SIDE mode (vertical section) for up.y < ~0.7.
## Remaining
item 1 side mode + unit tests + pictures at low/medium/high seeds 1+2 + worker in tunnel/crowded chamber; item 2 night; 3 outcome card framing; 4 smaller; 5 reduced motion; 6 final scripts; report docs/design/tasks/look-pass-6-report.md; MANUAL/README.
## Notes
- Do not run vitest while harness runs. Pale ring around cut = edge colour at coarse texels.
## 00:50 (second engineer, resumed after restart)
Tree typechecks clean; src/render/camera tests pass (79). Side mode exists in cellCam.ts (after7 pictures look decent at low; beat 10 shows queen not in frame after the script's orbit 160/zoom 1.3 - check). NO cellCam unit tests yet. Next: firstplay beats 07-10 seed 1 UNTIL=10 (clearance check), then cellCam tests, then pictures at 3 tiers, then items 2..6.
00:56 added cellCam.test.ts (12 pass), debug clearance().cutAway + ViewDirector.cameraInCutAway, firstplay accepts cutAway at beats 07/08; rerunning fp seed1 UNTIL=10 -> test-output/look6/fp-s1b
01:15 firstplay seed1 UNTIL=10 passes (fp-s1b)
01:30 cellCam: probeOrigin fix (probes started inside wall -> az stuck), side offset 0.3L, pitch 14. sealed-d/sl4-yaw0.png decent. Saves: s1-cell.save, s1-sealed.save. scripts look6-sealed/probe. Next: seed2 record, tiers, then item 2..
## 01:30 UTC (clock per uptime)
Done since: siteAdvice adds "It is the only weak reading." (item 4a; sim word is right per directions K: Q 0.71 < fair 0.72); item 3 code written (FoundingShotSubject.ant, applyLift, ViewDirector.foundingShotSide uses side view for queen on steep wall; shotSubject sets ant) - NOT yet typechecked/tested/pictured. seed 2 record running (test-output/look6/s2-rec; saves s2-cell.save, s2-sealed.save). Night: variants file test-output/look6/night/variants.json for tests/e2e/look3.mjs (LOOK3_VARIANTS; lights now accept hHH-weather e.g. h22-rain). NIGHT_LOOK (constants.ts) targetE 1.9 gives ground luma ~0.11: raise (look-pass-3 deliberately lowered it; integrator now wants readable).
TODO: item 4 rest (grey square = ?, tool rail icon, roster Where, overcast haze, title horizon, clover dots, weep vents), item 5, tests for new code (siteAdvice, foundingShot side), medium/high pictures, perf table vs look5, report.
