# threats-calibrate fix round — progress

Started 2026-11-17 21:25 UTC (fix engineer). Findings from review: (1 major) LONG soak fails 5/5; (2) Naturalist band
edge; (3) off/no-ramp runs one seed; (4) save->load per preset; (5) threatBatch resume key.

## Done
- finding 1 ROOT CAUSE (evidence test-output/threats-calibrate/fix-diag/alertDiag.ts): 59 of 62 predator-near cards in
  4 gd of the soak scene are raised by predatorStruck (threats-live addition), each held PREDATOR_NEAR_CLEAR_S 30 s =
  1.2 game-clock hours (1 h = 250 ticks = 25 s) -> every landed strike makes 1-2 daytime hours loud. At creatures commit
  64b8b2d (scratch tree) seed1 naturalist passed: minWindowShare 0.6, alertHours 7. Harsh bird 17>12 failed there too:
  test compared with unscaled BIRD_MAX_KILLS (GDD: x Predators setting -> 19 on Many) = test bug.
- FIX: balance PREDATOR_STRUCK_CLEAR_S = 5; alerts.ts predatorStruck sets bb.alertClearAt, struckAlertTick
  (per tick, system.ts tickCreature) clears; lurk seen -> alertClearAt -1 (30 s rule). bird.ts export birdMaxKills;
  soakScene birdKillCap; soak.test.ts uses r.birdKillCap.
- strikeAlert.test.ts: 2 tests pass (new: card clears at strike+5 s, hours stay quiet). diag 4 gd: minWindowShare
  0.33 -> 0.76, same deaths (62) -> the alert has no effect on predation.
- LONG soak run 1 after fix (21:42): seed1, gentle, harsh PASS; seed 2, 3 fail minWindowShare 0. Diag
  test-output/threats-calibrate/fix-diag/soakDiag2.ts (28 2): the 3 bad windows END IN WINTER (7/2/1 counted hours =
  last autumn hours incl. a bird event). E25 text: windows "of daytime hours outside founding and winter" -> soakScene
  now evaluates only windows ending at a counted hour; result gains minWindowCounted.
- LONG soak after window fix: 6/6 PASS (313 s). Results test-output/creatures-soak-28d-*.json (nat seeds 0.73/0.65/0.67,
  gentle 0.80, harsh 0.60 (5 counted h)).
- finding 5: tools/sim/threatBatch.ts runMismatch + refuse; test src/sim/ecology/creatures/threatTools.test.ts (4 pass).
- finding 4: predationRamp.test.ts save->load now it.each(PRESETS) (17 pass, 37 s under load).

## In progress (21:53 UTC)
- background script scratchpad/runs.sh: (1) main tree threatBatch predators off, 60 workers, run seeds 1,2, 6 gd ->
  test-output/threats-calibrate/ramp-w60-off-6gd/ ; (2) scratch tree of 75514ce (stop-gap, no ramp) base-found run
  seed 2 to winter -> test-output/threats-calibrate/base-found-r2/. If cut off: rerun the same commands (threatBatch
  resumes from result files). Scratch tree: /tmp/claude-0/.../scratchpad/base (rebuild: git archive 75514ce src tools
  vite.config.ts vitest.config.ts tsconfig.json package.json index.html + copy current tools/sim/threat*.ts + symlink
  node_modules).

## Remaining (order)
1. DONE finding 2 report text (§2.2 uncertainty para, §6 lever bullet; lever NOT measured: load 13, decided to skip)
2. report: §8 App E rows, alert fix, soak numbers, off runs, base-found r2
3. typecheck + all tests in src/sim/ecology/creatures + presetDisplay test
4. delete scratch trees
