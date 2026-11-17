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
- 16:15 fix2 done (test-output/threats-live/fix2): strike worlds JS 1, wolf 2, ant-spider 3, centipede 1 (habitat 2),
  rove 4; loss 0.21/owgd (kitchen-door ant-spider 7 kills). Change for fix3: JS sited ON food sources on stems
  (plant/herd/object source >= 40 mm up, in ring) first, else vertical-prim feet. Started funnel fix3.
- 16:50 fix3 done: strike worlds JS 1, wolf 3, ant-spider 3, centipede 2 (=habitat), rove 4; loss 0.23/owgd.
  Change for fix4: COLONY_RANGE_MIN_BU {jumping-spider: 20} (colonySites.colonyRing); JS now on food stems at
  21-53 BU. Reviewer ring test adapted to colonyRing(kind)[0] (explain in report). Started funnel fix4.
  Cross-module finding: AI rescue of paralysed nestmates (GDD 05 §2.4, p 0.5) not implemented -> ant-spider bites ~always kill.
- 16:20 UTC fix4 done (FINAL CONFIG): strike worlds JS 5, wolf 2, ant-spider 5, centipede 1 (habitat 2), rove 2;
  loss 0.40/owgd (35 kills). Decision: keep fix4 config (AC2 lead), report loss conflict + levers (spec step 5:
  report, integrator rules). Tests: creatures + perception 27 files 184 pass. Next: presets.sh (gentle, harsh, off)
  -> test-output/threats-live/fix-gentle, fix-harsh, fix-off; then harness; then report section 12.
- report section 12 drafted (12.1-12.4) in docs/design/tasks/threats-live-report.md; remaining: 12.5 presets table
  (after presets.sh), 12.6 harness, 12.7 acceptance update, perf note.
- gentle done: 0.02/owgd (2 kills). waiting harsh + off.
