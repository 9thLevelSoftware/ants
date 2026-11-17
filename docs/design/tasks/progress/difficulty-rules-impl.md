# difficulty-rules implementation progress

(started this session; no earlier progress file existed)

## Findings so far
- Foundation already has: src/sim/balance/difficulty.ts (DIFFICULTY_PARAMS table, resolveRules, PRESET_RULES, invalidCustomRules),
  createGame wiring (defaultGameConfig, syncWorldParams), setDifficulty in src/sim/progression/index.ts, many systems reading
  `sim.state.config.difficulty.params.X` directly.
- Param keys NOT read anywhere in src (non-test): openingThreatsMax, openingGraceGd, forecastPanel, honeydewYieldMult,
  broodSurvivalMult, workerLifespanMult, starvationToleranceMult, queenLifespanMult, orphanDeclineMult, flightPredatorEvents,
  alertLeadWarnings. Rules foundingLeniency / foundingAssist / queenSenescence unread.
- Rule overlays currently applied ad hoc: weatherSeverity (weather.ts, temperature.ts only for 4 freq mults + heatOffset), humanActivity
  (human/rules.ts via custom), predators (creatures/conditions.ts via rules.predators).

## Plan
1. state-hash baseline (naturalist, short run) BEFORE wiring -> test-output/difficulty/baseline.json
2. difficulty.ts: accessors difficultyValue(sim,key), effectiveParams(config), rule overlays (severity, predators, humanActivity, leniency)
3. src/sim/config/rules.ts: validate/normalise/defaults/incompat, applyRulesAtCreation (season length, start season)
4. wiring one-liners; wire the unread keys where a system exists
5. display data (src/sim/config/presetDisplay.ts), tests, 3x 28-day runs, report

## Done
(nothing yet)

## Edits outside my paths (list for report)
(none yet)
snapshot A (baseline code copy, T0) at /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/snapA
- Hash probe: test-output/difficulty/hash.ts (run: node $SNAP/tools/sim/run-ts.mjs test-output/difficulty/hash.ts <preset> 1; ~2 min).
  Baselines in test-output/difficulty/baseline-<preset>.json (naturalist: h3000 dab32bfe, hHandover 6eccad55, hEnd dbfa796c). "After" run = snapA + my diffs only
  (others edit src concurrently, so never compare against live tree).

## Done (2026-11-17 07:xx)
- src/sim/balance/difficulty.ts: appended accessors (difficultyValue, valueIn, effectiveRule, effectiveParams, DIFFICULTY_KEYS, KEY_GROUP overlays,
  presetRuleValues, LENIENCY_PRESET, START_DAY_OF_SEASON_RULE, OPENING_GRACE_REF_GD). Overlay semantics: rule overrides the preset value only
  when explicit (difficulty.custom[key]) or rules[key] != preset-implied value; default rules return stored params untouched.
- src/sim/config/rules.ts (normalizeCustomRules, applyRules, applyPreset, naturalStart, startFor, ruleNotes, GENERATION_RULES), presetDisplay.ts
- DECISIONS: PRESET_RULES keep humanActivity/weatherSeverity 'normal' for all presets (GDD08 table says Low/Mild for gentle, but preset params
  already carry the scaling -> double count; 06 owns). openingGraceGd NOT wired to new spawn gating (would change naturalist behaviour):
  only scales HUMAN_GRACE_GD (0.25) by openingGraceGd/0.3.
## Remaining
typecheck new files; wiring one-liners (see list); tests (difficulty.test.ts table-driven, rules.test.ts, presetDisplay.test.ts, wiring test);
hash after = snapA + diffs; 3 runs; custom-rule zero-event runs; options.ts customRules hookup.
wiring edits done so far (outside paths): damage.ts, antThermal.ts, human/rules.ts, temperature.ts, weather.ts, effectsRain.ts, founding/{exposure,commands,clutch,care,view,readout}.ts, overwinter/begin.ts, reproduction/{rearing,launch}.ts, creatures/{conditions,bird,threat}.ts, plants/system.ts, sources/spawn.ts, collapse/index.ts, flood/inflow.ts, locomotion/speed.ts, actions/workRate.ts, rivals/{index,raids,founding}.ts. TODO: brood.ts survival, ants.ts lifespans (+brood.ts:383, wood/castes.ts:143), physiology starvation+orphan, human grace, options.ts customRules
after-hash run started (live tree == snapA + my edits, verified by diff -rq)

## Update 07:20
- DONE wiring (all non-test `difficulty.params.*` reads replaced by difficultyValue; rules via effectiveRule); also newly wired unread keys:
  honeydewYieldMult (plants/system.ts), broodSurvivalMult (colony/brood.ts perDu), workerLifespanMult + orphanDeclineMult + starvationToleranceMult
  (colony/physiology.ts), openingGraceGd (scales HUMAN_GRACE_GD in human/effects/common.ts), forecastPanel (founding/view.ts), foundingLeniency
  (founding/readout.ts autoOk). NOT wired (no consumer system exists): queenLifespanMult/queenSenescence (queens never die of age), openingThreatsMax
  (no founding threat director), flightPredatorEvents (possessed flight T3), alertLeadWarnings, foundingAssist (UI/hint).
- naturalist after-hash == baseline (dab32bfe/6eccad55/dbfa796c) BIT FOR BIT. gentle+harsh after runs in progress (test-output/difficulty/after-*.json)
- tests written (NOT yet run): balance/difficulty.table.test.ts, balance/difficulty.accessors.test.ts, config/rules.test.ts, config/presetDisplay.test.ts, config/wiring.test.ts
- tool: tools/sim/difficultyRun.ts (typechecks; not yet run)
- TODO: options.ts customRules hookup (game/newGame/options.ts), run my tests (one vitest at a time!), touched-module tests, 3x28-day runs, custom-rule run, report
snapB = live tree with newly-wired keys neutralized to naturalist values (gentle/harsh equivalence check)

## Update 07:35 (hash proof)
- NATURALIST after == before bit for bit (full chain: h3000 dab32bfe, handover 6eccad55, +1 day dbfa796c) with hash including config.
- gentle/harsh differ from baseline by design (newly wired keys). Equivalence check for the overlay logic: snapB (new keys neutralized) vs snapA with
  hash EXCLUDING config.difficulty.params (test-output/difficulty/hash*.ts updated): equal at tick 1/100/500/1500/3000 for gentle and harsh.
  Full-chain (to handover+1 day) in progress -> test-output/difficulty/np-snapA-<p>.json vs np-snapB-<p>.json
- options.ts hookup done (customRules/startSeason in NewGameOptions; applyRules in resolveNewGame). tools/sim/difficultyRun.ts typechecks.
- Another engineer (leafcutter) has WIP type errors in src/sim/species/modules/fungus (NOT mine). For vitest/28-day runs use a stable copy:
  snapC = snapA + my files (see list in this file).
snapC builder: /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/mksnapC.sh (uses /tmp/claude-0/-home-user/5d615ab8-0e9f-5b70-a250-dd35942c7bf1/scratchpad/mine.txt: my files only)
- 07:32 gentle+harsh full-chain equivalence proven (np-*.json equal). Next: run my vitest files, touched-module tests, snapC 28-day runs

## 07:40 status
- my vitest files PASS (103 tests: table 61, accessors, rules, presetDisplay, wiring). wiring test allow-lists fungus/economy.ts (diseaseMult, leafcutter's, not in 06 table).
- human/rules.ts humanActivityOff -> effectiveRule; temperature.ts severityMult removed (unused).
- NOW: 28-day runs one at a time using snapC (tools/sim/difficultyRun.ts, out test-output/difficulty/difficulty-<preset>-1.json): naturalist, gentle, harsh, then
  naturalist + rules {predators off, rivals 0, humanActivity off} (-custom.json). Run log: test-output/difficulty/run-*.log
- 07:38 custom-rules 28-day run (pid 22876) running, then chain naturalist,gentle,harsh (each ~? min). Outputs test-output/difficulty/difficulty-*.json; logs run-*.log
