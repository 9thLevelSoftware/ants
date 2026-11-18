# app-seams-2 review progress (Opus verify)
Started 2026-11-18 09:00 UTC. Read this first after a restart.

## Done
- read spec, seed, arch, tech-stack, impl report, GDD 08 §3.4/§5.1/§6/§7.4; diff 21e97ab..tree of owned paths read
- typecheck clean (09:01); vitest of touched dirs: 52 files / 406 pass
- verify tests written (kept): src/ui/hud/focusLine.verify.test.ts (1 FAILS on purpose: new aim behind older open aim never shows the line in Auto),
  src/game/uiBridge/minimap.verify.test.ts (pass), src/ui/hud/minimap/model.verify.test.ts (pass), src/game/flags.verify.test.ts (pass)
- looked at impl pictures hud-final2/01,02,03,04,06,07,12,13 and hint-journal/journal-with-hint.png

## In progress
- own harness run of tests/e2e/appSeams2.mjs -> test-output/app-seams-2-review/hud

## Remaining
- look at own pictures; maybe look3-qs.mjs; manual/docs checks; StructuredOutput

## Findings so far
- MAJOR focus line Auto triggers on top-aim id change, not on aim.opened (test above)
- item 12(a),(b),(c),(e-slope), 13, 11 partial: as impl reported
- minor: focus line truncates long aims at 304 dp (title tooltip only)

## Update 09:25 UTC
- own harness runs DONE: tests/e2e/appSeams2-review.mjs -> test-output/app-seams-2-review/hud (r01..r05), appSeams2-review2.mjs -> hud2 (s01..s03), look3-qs.mjs -> app-seams-2-review/qs.log (same counts as impl: m0 37 tex, mw 44, flat after)
- confirmed in browser: new aim (aim-midden) opening behind open older aim -> focus null (r03 log). Compact 700x400 -> minimap hidden. Focus click opens Journal Aims.
- regen-manual: no drift (MANUAL restored byte-identical)
- now: controls.mjs run (~6 min) -> test-output/app-seams-2-review/controls.log; then StructuredOutput

## Update 09:40 UTC — DONE
- controls.mjs PASS ok:true (test-output/app-seams-2-review/controls.log). panels.mjs not re-run (12 min; impl log ok).
- firstplay.mjs and lifecycle.mjs not run (long; impl reports beat 16 failure / not run).
- verify tests: 1 intended failure (focusLine.verify: new aim behind older one). Review finished; StructuredOutput sent.
