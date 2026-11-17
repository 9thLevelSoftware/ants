# difficulty-rules review (adversarial verifier) — progress
Started 2026-11-17 09:10.
## Done
- read spec, seed, architecture, GDD 06 §14, owned code; wiring diff = git diff 331d105 HEAD on the 32 touched files (scratchpad/wiring.diff)
- typecheck clean; task tests: 6 files pass, 112 tests (+2 LONG skipped) at 09:19
## In progress
- checking setDifficulty, options.ts, createGame, calendar season length, BIRD_RATE equivalence, lifespan uses
## Remaining
1. write src/sim/config/*.verify.test.ts / src/sim/balance/difficulty.verify.test.ts
2. StructuredOutput report
## Findings so far (to verify)
- rivals:0 removes incipients (deviates from GDD 05, implementer's decision)
## 09:35 findings confirmed (probe: scratchpad/probe.ts via tools/sim/run-ts.mjs)
- MAJOR: PRESET_RULES humanActivity 'normal' on gentle/harsh (GDD 08 §3.7 says Low/High; GDD 04 §15.7 rule REPLACES so no double count).
  Effects: gentle 'low'==='normal' (0.5); explicit custom 'normal' on gentle -> 1.0 but implicit -> 0.5.
- MINOR: invalidCustomRules accepts prototype keys (toString, constructor) and THROWS on hasOwnProperty/__proto__ (normalizeCustomRules promises never throw)
- MINOR: rivals:0 removes incipients (GDD 05 line 651 says plus 1-3 incipients); openingGraceGd scales HUMAN_GRACE_GD (invented), OPEN_GRACE spawn gate missing
- note: 28-day runs: predatorStrikes 0 and birdVisits 0 in ALL presets; harsh colony extinct (workersEnd 0) -> human casualties 0
## Next: write src/sim/balance/difficulty.verify.test.ts + src/sim/config/rules.verify.test.ts
## 09:50 DONE
- tests written: src/sim/balance/difficulty.verify.test.ts (10 fail on purpose: humanActivity x5, prototype keys x5), src/sim/config/rules.verify.test.ts (1 fail on purpose: setDifficulty hasOwnProperty throws in tick); 12 pass; 3.9 s; typecheck clean
- report submitted via StructuredOutput. Nothing remaining.
