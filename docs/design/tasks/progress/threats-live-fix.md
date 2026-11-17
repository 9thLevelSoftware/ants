# threats-live fix round (reviewer findings) — progress

Started ~15:20 UTC. No earlier progress file existed.
## Done (code, typecheck clean in my paths; tests NOT yet run)
- F3 pinned card: alerts.ts possessedDangerAlerts leaves any foreign possessed-danger card alone.
- F6 'stuck' -> 'paralysed' cause (alerts.ts, README, possessedDanger.test.ts + new 'paralysed' test).
- F2 memo: colonyRange.ts WeakMap removed; director.ts calls ensureColonyRangeTerritories on hourly runs only.
- F4/F5 rebalance churn + no-surface retry: director.ts rebalance requires spawnPointOk on the near site;
  failed spawn -> vacantUntilTick = +TERRITORY_NO_SURFACE_RETRY_GD (balance/creatures.ts).
- F6b objectRise: new src/sim/ecology/creatures/colonySites.ts (uprightPrim with rotation, VISUAL_ONLY skipped,
  site at the prim foot facing the colony); AC2 lead: sites near the colony's nearest food sources (pause points),
  constants COLONY_PAUSE_SOURCES/COLONY_SOURCE_NEAR_BU/COLONY_SOURCE_CANDIDATES/UPRIGHT_MAX_TILT_DEG/... in balance.
- tools/sim/threatSites.ts prints sources within 300 BU.
## In progress
- tests: new colonySites.test.ts (uprightPrim, sites by sources, no-surface retry) + reviewer verify + possessedDanger + colonyRange green (19). conditions.ts cache now keyed by difficulty/rules refs (reviewer test needed it: same-tick setting change).
- next: threatSites on 5 snapshots, then funnel after4
## Remaining
- tests for uprightPrim, no-surface retry; funnel after4; report update; harness screenshot
- 15:11 UTC: funnel fix1 started (scratchpad funnel.sh -> test-output/threats-live/fix1, naturalist, 5 worlds x 6 gd,
  ~14 min). Siting now: JS 52/133/72/136/123 BU (we/sg/pp/cpv/kd); ground kinds 40-65 BU near nearest sources.
  If interrupted: check test-output/threats-live/fix1/DONE; rerun missing worlds only.
- 15:40 fix1 round KILLED after 2 worlds (results in test-output/threats-live/fix1, keep as evidence): near sites by
  busy sources never filled (spawnPointOk blocked) and ant-spider at sources killed 7 on woodland-edge.
  Changes: director.spawnPointFor (8 alt points SPAWN_ALT_OFFSET_BU=25 around a blocked centre, home stays centre);
  COLONY_PAUSE_KINDS = [jumping-spider, rove-beetle] only at sources, others route rule. director.test.ts
  'never spawns within 20 BU' rewritten to the property (spawn point >= 20 BU from ants; none when all alt blocked).
- next: funnel fix2 (same script, out test-output/threats-live/fix2)
