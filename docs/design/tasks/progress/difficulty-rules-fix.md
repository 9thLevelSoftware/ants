# difficulty-rules-fix progress
Started. Nothing done yet. Plan: read difficulty.ts, rules.ts; fix findings 1..7 in order.
## Done so far
- F1: PRESET_RULES gentle humanActivity low, harsh high (difficulty.ts)
- F3: invalidCustomRules uses Object.hasOwn
- F5: removed openingGraceGd coupling in human/effects/common.ts (+OPENING_GRACE_REF_GD); added UNWIRED_PARAMS/UNWIRED_RULES + inEffect flags in presetDisplay.ts + test
- F4 decision: keep rivals:0 => incipients 0 (AC3 wording), report as open ruling vs GDD 05 sec 7 / 00-index
## Remaining: F6 lifespan scaling at overwinter, F7 test hygiene (a-f), F2 AC3 evidence (extend tools/sim/difficultyRun.ts with live predator sampling; short multi-seed runs, LONG), typecheck + tests
- F6 workerLifespanGd accessor (difficulty.ts) used in physiology.ts + overwinter/begin.ts; F7 a,b,c,d,e,f done (BIRD_RATE=PREDATOR_SETTING_MULT, winter-start removed, naturalStart shared via createGame, severityMult restored in temperature.ts). NEXT: typecheck, tests, AC3 evidence
- typecheck clean; difficulty+config tests pass (147). NEXT: run tests near touched files (colony/physiology, overwinter, human effects, bird, createGame, temperature), then AC3 evidence runs
- schedule.test.ts (human, not mine) fixed: rules.humanActivity = preset-implied (E23 broke with gentle=low). NEXT: run ui newgame, worldgen params, commands tests; AC3 evidence (extend tools/sim/difficultyRun.ts)
- tools/sim/difficultyRun.ts extended (predatorTelegraphs, livePredatorsAvg, workersOutsideAvg). Running probe: harsh 6d seed1 -> test-output/difficulty/ac3/. Cmd: node tools/sim/run-ts.mjs tools/sim/difficultyRun.ts --preset harsh --days 6 --seed 1 --workers 60 --food 30,15 --cache test-output/difficulty/cache --out test-output/difficulty/ac3
- probe harsh 6d s1: livePredatorsAvg 7.72, telegraphs 0, strikes 0 (predators never target ants; creature-module behaviour), humanEvents 67 cas 2. Running gentle then naturalist 6d (same cmd) in background
