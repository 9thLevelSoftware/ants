# app-seams-3-fix progress
Plan: finding 1 is real (applyAppearance overwrites caste colours). Fix = optional `ownColours` flag on AntMorphology (types.ts), set on LASIUS_QUEEN (gyne inherits), applyAppearance skips body/gaster colour when set. Then re-take before/after (harness, one at a time) and compare pixels; update report. Finding 2 = rerun strict stage1a without SKIP_HIGH if machine allows. Finding 3 = note only.
Done: (nothing yet)
Done: ownColours flag impl + ownColours.test.ts + reviewer test green (127 ants tests). Now: harness after-shots -> test-output/app-seams-3/queen-fix-{test,medium,high}; then compare vs queen-before-*
Done: harness queen-fix-{test,medium,high} taken; pixels differ (max 18/46/33 default, 24/68/56 side); zoom sheet test-output/app-seams-3/queen-fix-zoom-side.png looked at: modest warm lift visible. Now: strict stage1a WITHOUT SKIP_HIGH (log test-output/app-seams-3/stage1a-strict-full.log), then update report.
Done: report 5b/needs updated. Waiting for strict full run, then add result to report item 4 + acceptance row 3 (item 5 evidence).
Done: report 5b/needs updated. Waiting for strict full run, then add result to report item 4.
Done: strict full passed, report updated. Remaining: final typecheck + vitest src/game/save src/render/ants, then StructuredOutput.
