# threats-live review progress
Started 14:39 UTC. Base commit before the task: 7e968bc (diff 7e968bc..HEAD shows the implementer's changes).
Done:
- read spec, report, all changed code (colonyRange, director, alerts, attack, conditions, hunters, queries, sense.ts)
- typecheck: 0 errors (14:41). vitest creatures+perception: 25 files 171 pass 5 skip (55 s)
In progress: harness run (test-output/threats-live-review/harness). Verify tests written: src/sim/ecology/creatures/threatsLive.verify.test.ts (6 tests, 3 FAIL as intended: memo reload divergence, rebalance churn 19/20 runs, pinned card lost)
Suspected findings to prove by test:
 F-a colonyRange WeakMap memo: raising Predators setting mid-game (few->normal) never sites new kinds until a reload
     -> reload diverges from uninterrupted run; GDD 06 §14 "adding threats spawns them at the normal rate"
 F-b rebalanceResidents + spawnPointOk churn: colony territory blocked by an ant within 20 BU -> far resident despawned and respawned every director run
 F-c possessedDangerAlerts overwrites combat 'pinned' card and then clears it (shared kind:subject key)
 F-d 'stuck' sub-cause mapped to paralysis; GDD 05 'stuck' = spill trap (naming)
 F-e AC2 not met (jumping spider 0/5 strike with habitat 4/5; ant-spider 2/5, rove 1/5)
Remaining: verify tests, harness run (one), final report.
15:00 update:
- harness run done: test-output/threats-live-review/harness/ (ok true; 3 shots looked at, match the claims; JS leap kills 7.2-hp worker)
- funnel predators off 1 gd woodland-edge: test-output/threats-live-review/off (all hunters alive avg ~0.02, 0 events) OK
- probe (deleted, tools/sim/threatReviewProbe.ts): woodland-edge snapshot 1 gd: jumping-spider 240 spawn+'no-surface' despawn per gd,
  rove 33/gd, from WORLDGEN territories whose centre is inside a solid (pre-existing churn, not new); wolf 'rebalanced' 1.
Remaining: final report via StructuredOutput.
15:02 DONE: report returned. Verdict fail (2 major: AC2 partial, memo reload divergence; minors: rebalance churn, pinned card, worldgen no-surface churn, objectRise rotation, stuck naming, AC3 bands/re-runs).
