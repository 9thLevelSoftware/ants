# quiet-time implementation progress (engineer: Sonnet, started 2026-11-17 22:55 UTC)

## Done
- Read task spec, GDD 05 §6, GDD 04 §15, GDD 08 §6, runner.ts/cues.ts, alerts.ts, diagnostics.ts, threat.ts quiet tracker.

## In progress
- Step 1: tools/sim/quietRun.ts (observer)

## Remaining
- Step 1 table (before), steps 2-5, report docs/design/tasks/quiet-time-report.md

## Findings / decisions
- Quiet tracker: src/sim/ecology/creatures/threat.ts (quietTick); hour loud if any warning/critical alert active >=25% samples or threat active. human warn() in human/runner.ts raises at first cue, clears at endRun.

## Update 23:20 UTC
- DONE: tools/sim/quietRun.ts works (import threatFunnel FIRST, cycle issue). Run ~3 min per 6gd on loaded box. Run in background w/ --out.
- BEFORE evidence: test-output/quiet-time/before/quiet-suburban-garden-1-naturalist.{md,json} (share 0.28; food-p-low 1681s never cleared, brood-stalled 1365s, nest-flooding crit 650s, human warnings car 13x/footsteps 14x/children/mowing 254s one alert)
- Key fact: human events last real-time seconds (1 clock hour = 25 s); mowing 240 s = ~10 loud hours. Plan: human alert raised only when player ants in the predicted impact area within lookahead; clears when out/after impact; per-site key + cooldown; state in HumanEventRun additive fields.
- 23:35 implemented human/alerts.ts + touchAlert/expireAlert in progression/alerts.ts + constants HUMAN_ALERT_* in balance/human.ts; runner.ts wired (warn() removed). Next: run human folder tests, rerun 6gd measure (after1)
- 23:50 frozen trees: scratchpad/quiet-base (orig human alert) and quiet-after (my code); batch script scratchpad/quiet-batch.sh <tree> <outdir> (4 worlds x 6gd, w60). Outputs test-output/quiet-time/{before,after1}

## Update 23:09 UTC (earlier timestamps in this file were wrong; it is real time now)
- Human tests pass with new alert (npx vitest run src/sim/environment/human: 48 passed).
- Written, NOT YET RUN: src/sim/environment/human/alerts.test.ts, src/sim/progression/alerts.life.test.ts (also added ease rule in raiseAlert: lower level from same diagnosticId falls back; touchAlert/expireAlert).
- Batch running (after1, 4 worlds x normal/w60) in background via nohup; wait for test-output/quiet-time/after1.log "BATCH-DONE"; then run the base batch into test-output/quiet-time/before (suburban normal already there).
- Finding after1 suburban normal: human warnings now absent; run share 0.38 (was 0.28); remaining loud = food-p-low (colony, standing 1681 s, never cleared), brood-stalled (colony), nest-flooding crit 650 s (nest), heat-danger (env). Real trouble -> colony engineer.
- Idea for report: ruling needed - quiet tracker counts acknowledged / UI-collapsed warnings as loud.
- Remaining: run new tests, perf check of checkHumanAlert, E25 whole game runs (--until-winter, 2 worlds nat + gentle/harsh), LONG test, report, folder tests (human, progression), typecheck.
- 23:31 new tests pass (9). after1 batch done (test-output/quiet-time/after1; no outsideOnly field - old tool). Started base batch -> before1 (new tool, has outsideOnly). Then run final after batch -> after2 with final code.
- 23:33 tool: added outsideOnly + --counts mode; wrote human/quiet.long.test.ts (LONG, strict mode env FOUNDRESS_QUIET_STRICT). Waiting for before1 batch (log test-output/quiet-time/before1.log). Next: counts table (--counts 1 on suburban/kitchen), after2 batch with final code (copy src+tools to scratchpad/quiet-after2), LONG test run, folder tests human+progression, report.
- 23:56 before1 batch done. after2 batch started (frozen final tree scratchpad/quiet-after) -> test-output/quiet-time/after2 / after2.log
