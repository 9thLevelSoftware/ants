# look-pass-3 report (Sonnet implement)

Engineer: look-pass-3 impl (second session after the 18:55 restart; the first one left item 6 in code and the first "before" night shots).
Progress log: `docs/design/tasks/progress/look-pass-3-impl.md`. Evidence root: `test-output/look3/` (git-ignored).
Machine load average 7-12 on 4 cores throughout; every browser run was one at a time (SwiftShader, 3-4 minutes a shot).

**This report is a working copy written while the check runs were still going; section 5 and the verdict table are completed at the end
(see the bottom of the file for what was and was not measured).**

## 0. How the pictures were taken

`tests/e2e/look3.mjs` (new): the real game staged by `tests/e2e/lib/look2-stage.mjs` (founding cheat, seven workers by the entrance, possession on the
surface), one script and one pose for before and after, UI hidden (plates), luminance numbers from `look2-measure.mjs` logged per shot.
Views: `surface`, `observerlow`, `close` (400 x 225 px around the ant), `gyne` (a gyne and a male beside the worker), `mound`, `edge`, `queenstart`,
`slice`, `slopeup`/`slopedown`; lights: night, night-overcast, night-rain, dusk, dawn, noon. `LOOK3_VARIANTS=<json>` evaluates a patch in the page
between shots (live modules), which is how the night look and the ant fill were tuned on one staged game (`test-output/look3/tune/`).
**BEFORE pictures use the original code**: my render files were put back to commit `29d44ee` (the first snapshot after the restart) for that run only
(`test-output/look3/mine/stash.sh`, restored by `unstash.sh`), then the AFTER run used the new code. The sim keeps running between runs, so the poses
are the same script and the same staging, not bit-identical (the worker is a few mm elsewhere in some shots: look at the numbers, not at one mm).

| Folder | What |
|---|---|
| `test-output/look3/before/` | original code: night x 5 lights x (surface, observerlow); close, gyne, edge, mound, slope, queenstart, slice, quality test/medium; replete gaster |
| `test-output/look3/after/` | new code: same list (`after-*`), then the shots re-taken after a second round of fixes (`after2-*`: observerlow, slice, edge, gyne, queenstart, close) |
| `test-output/look3/tune/` | the tuning variants (`tune1..4-*`) |
| `test-output/look3/checks/` | browser scripts of acceptance 3 |
