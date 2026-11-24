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
