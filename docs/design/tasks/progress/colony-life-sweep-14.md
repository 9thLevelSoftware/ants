# Progress: independent sweep after colony-life round 14

Started 09:27 UTC Nov 23. No earlier progress file; fresh start.

## Sweep
- Frozen copy of the tree at 09:30 UTC: `/home/user/frozen-sweep14` (src, tools, tests, configs; node_modules
  symlinked; no tools/sim/probe). Hash: round-14 recipe (sha256 of src/sim, src/worldgen, src/core, tools/sim *.ts
  without tests and probes) **e45f2148** = `round-14/treeP-hash.txt` (tree P); sweep-life.sh recipe `1543bf21`. Live
  tree = HEAD b8cbe36 for src (git status: ledger modified, tools/sim/probe files deleted). Newest src/sim file 07:41.
- `/home/user/frozen-sweep14/run-all.sh` (background): sweep-life.sh -> round-14/sweep (cache test-output/viab/cache),
  then PAR=2 UNTIL_DAY=40 longrun-life.sh -> round-14/sweep-long (we:2 sg:2 cpv:1 pp:3 kd:3). Restart-safe: re-run it.
  No JSON existed in round-14/sweep-long at 09:30.
- Previous sweep table: `round-12/sweep-table.md` (dir round-12/sweep); there was no independent sweep after round 13.
- Delete /home/user/frozen-sweep14 at the end.

## Review findings so far
- tsc clean 09:31 (`round-14/sweep-review/tsc.txt`).
- Round's code: `git diff 1930807 HEAD` (src = HEAD b8cbe36). `git diff 5be00d8 HEAD` (round 12's launch) on src/sim
  shows only R40 a gate (queen.ts colonyHasWintered), R40 c (brood.ts), point-field (nests.ts + 2 tests), mound mask
  (moundRelax.ts + 2 tests), wasteFall (+test), passageRescue14 test, round-13 restated tests: the claim "round 12 +
  those" holds.
- Entity index is fully refreshed every tick (sim.ts:63), so wasteFall moving item.pos leaves no stale index.
- pointField now calls cellCentreCutOff (2 nearestOpen + componentAt) on every call; callers are trip planning only
  (trip.ts), not per tick. OK.
- Folder tests running (`sweep-review/vitest-folders.sh`, one worker): colony, locomotion, nest, behaviours/nest,
  behaviours/outdoor, tests/docs -> `sweep-review/vitest-*.txt`.
- Probe scratch tree `/home/user/scratch-sweep14-probe` (copy of the frozen tree; DELETE at the end): probe
  `tools/sim/probe/probe-hang14.ts` (chamber heights, waste still hanging after wasteFall, brood off the floor) - to run
  on the five `round-13/cache-y2` files once vitest is done. Then test-strength checks there (revert nests.ts /
  moundRelax.ts / the cycle hook, run the round's tests).
- 09:46 folder tests done (one worker): colony 80/81 (workedExample), locomotion 26/27 (perf timing), nest 60/63
  (escapeDig, readersCost.verify, architect/layout timing), behaviours/nest 35/37 (sfaReview.verify, stall.soak),
  outdoor 36/37 (removal.verify), tests/docs 8/8. = the round's claims.
- probe-hang14 (`sweep-review/probe-hang14.txt`, 5 y2 caches + 200 ticks): chambers 1.8-2.1 BU floor to ceiling
  (WASTE_FALL_MAX_BU 6 ample); 0 waste hanging after wasteFall. BUT buried waste (field < -ITEM_BURIED_BU, onSurface
  false, haul priority 0) is counted as chamber waste: probe-buried14 on kd #3 (`probe-buried-kd3.txt`): royal chamber
  counts 9 waste (tolerance 3) for 12 gd, all buried spoiled-food at f -0.32..-0.35 BU. Cause: stores.ts
  spawnSpoiledItem puts it at centre.y - radii.y, and the registry's radii.y (1.5) exceeds the cavity's half-height
  (~1.03). Pre-existing (round 1), not wasteFall's; the round's "kd #3 most likely the same" is not borne out.
  Verify test (scratch copy, to copy into the live tree at the end): `colony/wasteFall.verify.test.ts` case 1 save ->
  load -> continue with hanging waste GREEN; case 2 spoiled food reachable RED (f -0.45, onSurface false).
- Test strength (`sweep-review/vitest-strength-prefix.txt`, scratch copy with the old code): pointFieldRestore,
  moundMaskHeights, moundRestore14, wasteFall case 2 all RED without their fixes. Scratch files restored.
- Sweep 8 of 15 done at 09:56 (we #1 NOT viable: starvation stage 2.25 gd, P 0.03).
- 10:23 **sweep done** (09:27-10:23, 15/15 on 1543bf21). Table `round-14/sweep-table.md` (sweep-table.py vs
  round-12/sweep), `sweep-review/bars-from-md.txt`: viability NOT met 13/15 (we 1/3: we #1 starvation stage 2.25 gd,
  we #3 R27 C 2.55 of 6.09 with P 8.6); R19 4/7 (P 0.427, trips 48.1 %, no-lost 12/15 fail). First workers = sweep
  12 in 15/15. sums.txt: winter 249 -> 255, eclosions 97 -> 102, hygiene 23 -> 2, starved 11 -> 3, flooding 7 -> 20,
  crushed 5 -> 8, lost 5 -> 3. cost.txt: behaviours 0.245 median (kd #1 0.297), all systems ~10 % slower (load: the
  integrator runs `round-14/sweep-p08` alongside, 2 more life runs).
- we #1 mechanism (`probe-deliver-we1*.txt`, `probe-trace-we1-7725.txt`): deliver share 0.286 of worker time (others
  <= 0.054): 2-7 foragers with full crops sit 2 BU from the open entrance at (3432.09, 5.32, 1199.02) BU in
  forage.deliver / tend.deliver toChamber, nav failed "leg" on nest:4936:chamber:5664, re-requested forever (DELIVER_MAX_S
  resets the phase, they never move). Same hand-over with the old mound mask: still stuck (mean 3.0); with round 13's
  pointField: 0.13 (single A/B, trajectories diverge); round 12's hand-over on this tree: 0.
- we #3: 91 hunting trips (75 ok, prey P 20.3) while C 1.9-4 under the winter need; 2 crumb sources known by the end
  with 14.7 C left, 3 items taken.
- Long runs started 10:23 (we:2, sg:2 first).

## Remaining
- sweep table (`python3 tools/sim/sweep-table.py round-14/sweep round-12/sweep`), bars by script, regressions
- long runs + longrun-table.py; R22 / R34 / R24
- review of the round's diff (`git diff 1930807 HEAD` on src/sim + tools/sim), tsc, folder tests, verify tests
- ledger section "### Independent sweep after round 14"

## Log
- 09:30 sweep started.
