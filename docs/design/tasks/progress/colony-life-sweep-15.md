# Progress: independent sweep after colony-life round 15

Started 15:01 UTC Nov 23 (session 1). No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 15:03 UTC: `/home/user/frozen-sweep15` (src, tools, tests, configs; node_modules and
  test-output/viab symlinked). sweep-life.sh hash recipe **48db2e0d** (= live tree at 15:03). Live src = HEAD 5151a98 +
  six restated test files (= /home/user/scratch-r15e for src/sim, worldgen, core, tools/sim apart from those tests).
- `/home/user/frozen-sweep15/run-all.sh` (background, started 15:04): sweep-life.sh -> round-15/sweep, then
  PAR=2 UNTIL_DAY=40 longrun-life.sh -> round-15/sweep-long. Restart-safe: if no node life.ts is running, re-run it.
  No JSON existed in round-15/sweep-long at 15:03.
- Previous sweep table: `round-14/sweep-table.md` (dir round-14/sweep).
- Delete /home/user/frozen-sweep15 at the end.

## Review findings so far
- 15:10 tsc clean (`round-15/sweep-review/tsc.txt`). Folder tests running in background
  (`round-15/sweep-review/vitest-folders.sh`, one worker, restart-safe -> `vitest-*.txt`, `vitest-done.txt`).
- Round diff = `git diff ec35477` on src (no other src change since): nestNav nearestReached, phaseNest
  deliverLegFailed, hunt sugarTrip, wasteFall chamberFloorUnder / liftBuriedItem, crumbs retraceTarget (nearest
  start + consume), transitions route guard (AntFlag.HOMING), LARVA_P_REQ 0.8 + 5 restated tests + 2 fixtures.
- Read so far: no forbidden change (no lifespan / need / food / bar change; LARVA_P_REQ by 30a). Determinism: crumbIdx
  lives in nav.loco (persisted NavScratch), legFails in bb, HOMING in flags: all persisted; nearestReached / isLone
  pure over pass flags; no per-tick cost trap (nearestCrumb only at a retrace start, isLone only on an INF read).
- HOMING set only by startReturn; flee/hunt resumes to outbound only from an outbound phase, so no stale flag found.

- 15:20 Folder tests on the live tree (one worker; `sweep-review/vitest-*.txt`): colony 81/83 (workedExample,
  handoverStomach.verify), locomotion 27/28 (perf timing), nest 61/64 (layout timing, escapeDig, readersCost.verify),
  behaviours/nest 35/37 (sfaReview.verify, stall.soak), behaviours/outdoor 39/40 (appendixE23; includes my new
  `outdoor/round15.verify.test.ts`), ants/actions 10/11 (runner.test), tests/docs 1/1. = the round's claims.
- 15:21 Test-strength + App. E 23 isolation running in scratch `/home/user/scratch-sweep15-probe` (DELETE at end):
  `sweep-review/strength.sh` -> `vitest-strength.txt`.

- 15:23 Strength (`vitest-strength.txt`): every round-15 test is RED with its production file back at ec35477
  (loneVoxel15, deliverRecovery15 + my 2 solid-load cases, sugarTripHunt15 case 1, wasteFall.verify case 2 with old
  stores.ts, retraceResume15 x2, wasteFall15 lift case with the lift off). My verify tests (round15.verify: solid load
  re-plan / unload in place, save->load->continue mid-retrace with consumed crumbs) GREEN on the final tree.
- **App. E 23 isolation**: old crumbs.ts -> E23 green; variant e with only the consumption off (nearest start kept)
  -> E23 GREEN and outdoor/removal.verify GREEN (only retraceResume15's explicit consumption assertion red). So the
  consumption half of variant e is what breaks E23; the nearest start alone fixes removal.verify. Arms not measured.

- 15:31 Sweep runs done so far: we1, sg1, pp1, cpv1, we2, kd1, sg2 (NOT viable: R27 C 0.01 for 4.39; C 9.6 -> 0
  by doy ~16; forage:C trips 1 of 6 ok, 0 departures days 9-12), pp2. First workers equal sweep-p08's in the runs so far
  (same foundings at 0.8): compare with both round-14/sweep (the bar's previous sweep) and round-14/sweep-p08.

- 15:55 **Sweep done** (15 runs, all tree 48db2e0d, 15:02-15:55). Table `round-15/sweep-table.md` (sweep-table.py vs
  round-14/sweep); vs sweep-p08 `sweep-review/compare-p08.md`; bars by second script `sweep-review/bars-from-md.txt`.
  **Viability MET** (14 of 15; sg 2 of 3, others 3 of 3; sg #2 R27 C 0.01 / 4.39). **R19 NOT met 5 of 7**: P 0.344
  FAIL, first >= 9 11 of 15 FAIL; held 15/15, ecl 8, C 1.278, trips 51.6 %, no-lost 13/15 ok.
  Sums (`sweep-review/sums.txt`): workers 258 (p08 273, s14 255), ecl 116 (123, 102), eggs 374 (349, 302); P delivered
  122 (p08 138): carrion 11.2 (18.8), forage:P trips 16 (33). vs p08 (same foundings 15/15): workers better 3 / worse 9 /
  equal 3. kd #3: 0 eclosions, 7 larvae starved with P 1.4-4.8 in store (days 2-5), egg flooding 10, hygiene 9.
  Deliver share max 3.8 % (item 1 bar < 6 %). Cost `sweep-review/cost.txt`: behaviours 0.259 median, kd #1 0.293.
- Long runs started ~15:56 (we:2 sg:2 first).

- 16:32 Long runs done: we #2 (11 -> spring 10 -> W2 13), sg #2 (17 at W1 with C 0 -> spring 7, queen starved),
  cpv #1, pp #3; kd #3 running (~16:45). Probe scratch deleted.

- 16:50 Long table `round-15/sweep-long/longrun-table.md`: R22 spring 4/5 (met), R34 3/5 at 1.0 x, 0/5 at 1.5 x
  (79 -> 71), R24 met. Ledger section "### Independent sweep after round 15" written. Frozen tree deleted. DONE.

## Remaining
Nothing.
table + bars, long table, review, verify tests, ledger section.
