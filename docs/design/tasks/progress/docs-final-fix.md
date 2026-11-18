# docs-final-fix progress
Started 2026-11-18. Plan: fix 10 reviewer findings in README.md, docs/MANUAL.md, docs/design/gdd/DEVIATIONS.md (+CREDITS untouched).
New test file (decision): tests/docs/docs-final.test.ts (vitest include has tests/**) compares MANUAL section 13 + 1.6 tables with generators, DEVIATIONS R1-R28 + pointers.
## Findings status (all 10 reproduced as real unless noted)
- [ ] 1 autoSlowDefault not read -> mark not in effect (manual 1.6 row, s8, s15) + wrong string
- [ ] 2 focus line / minimap (settings exist, no consumer; aims only in Journal>Aims) -> manual s2, s12
- [ ] 3 DEVIATIONS missing D24 rove day, D25 footfall card, D26 loco, D27 scout range (S1), D28 startDoy 9 ruling
- [ ] 4 R2/R20 misquote (GDD 06 5.13 clause c; 1.6 window 9..12 default 10)
- [ ] 5 manual "young colonies nearby" -> "young rivals nearby"
- [ ] 6 Photo mode LS+RS in keyboard column (generator bug; table kept, note + wrong string)
- [ ] 7 fixed keys (Shift+1-7, Ctrl+Z, Q/E planner, Shift+wheel)
- [ ] 8 rule table "-" for preset values; "seven rules" vs 8
- [ ] 9 species URL flag accepts unavailable ids
- [ ] 10 vague code pointers (R13 R14 R16 D8 D14 D22 D23)
- [ ] test file written + run; typecheck
## Update (after first edits)
Done: MANUAL edits for findings 1,2,5,6,7,8,9 (+README species row); DEVIATIONS edits for 3,4,10 (D24-D28 added, section C rows, pointers; dev-pointers script 163 pointers bad 0).
Remaining: update DEVIATIONS header text (rows count D1-D28), section E note; write tests/docs/docs-final.test.ts; run it + typecheck; check README layout mention; final report. Not done: README unchanged besides species flag row.
## FINAL: all 10 findings fixed; tests/docs/docs-final.test.ts (8 tests pass, ~2 s); typecheck clean. Only the report remains.
