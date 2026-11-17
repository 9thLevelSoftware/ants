# threats-calibrate fix round — progress

Started 2026-11-17 (fix engineer). Findings from review: (1 major) LONG soak fails 5/5; (2) Naturalist band edge;
(3) off/no-ramp runs one seed; (4) save->load per preset; (5) threatBatch resume key.

## Done
- read spec, report, soak.test.ts, soakScene.ts, LONG results test-output/creatures-soak-28d-*.json, review diag.

- finding 1 ROOT CAUSE (evidence test-output/threats-calibrate/fix-diag/alertDiag.ts): 59 of 62 predator-near cards in
  4 gd of the soak scene are raised by predatorStruck (threats-live addition), each held PREDATOR_NEAR_CLEAR_S 30 s =
  1.2 game-clock hours (1 h = 250 ticks = 25 s) -> every landed strike makes 1-2 daytime hours loud. At creatures commit
  64b8b2d (scratch tree) seed1 naturalist passed: minWindowShare 0.6, alertHours 7. Harsh bird 17>12 failed there too:
  test compared with unscaled BIRD_MAX_KILLS (GDD: x Predators setting -> 19 on Many) = test bug.
- FIX written: balance PREDATOR_STRUCK_CLEAR_S = 5; alerts.ts predatorStruck sets bb.alertClearAt, struckAlertTick
  (per tick, system.ts tickCreature) clears; lurk seen -> alertClearAt -1 (30 s rule). bird.ts export birdMaxKills;
  soakScene birdKillCap; soak.test.ts uses r.birdKillCap.
## In progress
- strikeAlert.test.ts additions; then run alerts tests, then LONG soak

## Remaining (order)
1. finding 1 (root cause, fix, run LONG once)
2. finding 5 threatBatch resume key
3. finding 4 save->load per preset
4. finding 3 off runs x2 seeds 6 gd
5. finding 2 report text
6. typecheck + tests in paths; report update
