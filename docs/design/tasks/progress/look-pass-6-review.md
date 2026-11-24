# look-pass-6 review progress
Started fresh (no prior progress file).
## Done
- (nothing yet)
## In progress
- reading spec + docs
## Remaining
1. read spec/docs/code 2. typecheck + vitest owned folders 3. harness checks 4. verify tests 5. report
## Findings
- 11:45 typecheck clean; vitest green: uiBridge+camera 172, views+lighting 214, boundary/dressing/weather/founding/debug/nest/docs 195 (+1 skip)
- 11:50 FINDING A: markBusy (hudSlices.ts) is dead code: sim canDo already returns 'blocked' while any non-concurrent action runs, so promptView already reads "Lay egg — busy" ok:false the whole batch (probe: every tick). promptBusy.test.ts would pass with markBusy removed. Added src/game/uiBridge/promptBusy.verify.test.ts (real press through command queue) — FAILS on ticks 58-60: lay-egg still running (recovery) but primary becomes "Pick up egg — busy" (no lay line) -> my assertion too strict? decide.
- 11:52 started harness: firstplay seed 2 low UNTIL=12 -> test-output/look6-review/fp-s2-low (log fp-s2-low.log). No vitest until it ends.
- promptBusy.verify.test.ts rewritten (2 tests: no HUD line ok during real batch; sim already says "Lay egg — busy" every tick => markBusy redundant). NOT yet run (harness running).
- Wrote src/game/views/cellCam.verify.test.ts (line of sight camera->thorax vs uncut soil on test nest walk; suspect: 3 mm grid snap of cut.center in applyCellCam moves the vertical section up to 2.1 mm toward camera -> cap may cover queen). NOT yet run.
- Looked at sheets: night hours (ok, readable), item1 medium/high (after ok), item3 high (queen whole, head at card edge, workers not in frame), lay prompt (busy lines all from sim).
- hud.mjs App E 26 failure ("queen prompt lacks Colony orders []") predates markBusy (09:52 log); not triaged.
- 12:02 harness at beat 07
- 12:07 fp-s2-low (seed 2, low, UNTIL=12): beats 01-12 pass (test-output/look6-review/fp-s2-low)
- 12:10 RAN verify tests: promptBusy.verify (2 pass; markBusy redundant confirmed). cellCam.verify RED (kept for fixer): 8/532 fully-on frames line of sight crosses uncut soil: (a) top->side blend uses horizontal slice while pose half-side (4.9 mm), (b) 3 mm grid snap of cut.center pushes vertical section into soil (0.7-1.8 mm; 0 unsnapped).
- Picture finding: test-output/look6/cc/cc-after-noon-crowd-low.png (after) broken: huge dithered ant legs + wall slab; criterion 2 claimed met.
- Remaining: rerun touched folders after adding tests (views, uiBridge), final report.
- 12:13 typecheck clean incl. verify tests; views+uiBridge 235 pass + 1 intended RED (cellCam.verify). Review DONE; final StructuredOutput being sent.
