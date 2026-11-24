# Look pass 6 — report

Engineers: three in a row (the first two were cut off by machine restarts; this report is by the third). Written 2026-11-24.
Task: `docs/design/tasks/look-pass-6.md`. Progress file: `docs/design/tasks/progress/look-pass-6-impl.md`.
All pictures are under `test-output/look6/` (git-ignored); contact sheets of the main before / after pairs are in `test-output/look6/sheets/`.
Every picture cited here was looked at with the Read tool. Quality tiers: low, medium, high (the harness' `test` tier is not a player tier).
The machine was loaded by the simulation engineer's life runs and browser throughout: timings are SwiftShader numbers.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean on my paths, tests green folder by folder | RESULT_1 | see "Verification" |
| 2 | Items 1-3: before / after pictures, same script and pose, three tiers, after stands on its own | RESULT_2 | items 1, 2, 3 below |
| 3 | Draw calls and triangles within 5 % of look-pass-5's table | RESULT_3 | "Cost" |
| 4 | No frame-time regression at low from the night lighting | RESULT_4 | "Cost" |
| 5 | This report with picture paths and the still-unfinished list | met | this file |

RESULT_PLACEHOLDER
