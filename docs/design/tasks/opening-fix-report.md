# opening-fix report

Task spec: `docs/design/tasks/opening-fix.md` (with integrator ruling 1). Progress log:
`docs/design/tasks/progress/opening-fix-impl.md`. Two engineers worked on it: the first (Nov 23 ~22:40 - Nov 24 00:44
UTC, cut off by container restart 8) found both causes and built fixes 1 and 2; the second (from 00:46 UTC) carried
out ruling 1 (wide mound-mask probe, the floor at 4 workers), added the unplug draft, and ran the close.
A third engineer resumed after container restart 9 (05:29 UTC Nov 24): browser seeds 2-5 and the full runs, the R14
trace, the sweep tables and this report.
Final tree: frozen as `/home/user/frozen-openingfix` (sim tree hash `9a8cdf07`, 01:15 UTC Nov 24); `src/sim` was not
changed after the freeze (an R14 prototype was tried in the live tree and reverted, section 6).

## 0. Result in one screen

| | before (live tree, Nov 23) | after (final tree) |
|---|---|---|
| seed 2, browser | lapse ends `failed`, "Water filled the burrow" | **beats 01-13 pass, no stand-ins**: seal 223, 7 workers, open 6-7 game h after the hand-over (R14 missed) |
| seed 1, browser | entrance stays `reopening:130` (4 workers) | **beats 01-13 pass, no stand-ins**: seal 108, 4 workers, open 6-7 game h after the hand-over (R14 missed) |
| seed 2, headless | seal 93 voxels, queen drowns at t 6671 | seal 223, 11 workers, open 1000 ticks after hand-over |
| seed 1, headless | passes (12 workers; not the browser's game) | seal 165, 13 workers, open 500 |
| seeds 3 / 4 / 5, headless | 3 pass, 4 `reopening:235` for good, 5 pass | all pass; open 750 / 1287 / 750 ticks after the hand-over |
| seeds 3 / 4 / 5, browser | - | **all pass beats 01-13, no stand-ins**; open within 3 / 6 / 2 game h (R14 met / missed / met) |
| item 5: 5 paired sweep-15 hand-overs to winter | sweep 15: 4 of 5 viable | **5 of 5** |
| long runs (5 colonies, year two) | gate-sim-2: 85 -> 94 / 105 workers | **83 -> 108**; R34 1.0 x 4 of 5, 1.5 x 2 of 5 |
| sweep (15 fresh foundings) | gate-sim-2: 12 / 15 (sweep), 13 / 15 (sweep2) | **12 / 15**, every archetype >= 2 of 3 (spec bar 13: missed by one); workers at winter 249 (271 / 270) |

## 1. Per seed: cause, breaking commit, fix, test

### Seed 2 (`00000002`): the flood in the lapse

- **Cause.** It rains while the player digs (t 2576-5001); the open shaft takes ~6 BU^3 of water into the cell (the
  designed inflow at a flood-safe site, c 0.17). Both the round-9 tree and the live tree have that water at the lapse
  start. On the live tree the seal is small (plug 93 voxels against round 9's 229) and the script's walk-down leaves the
  queen on the cell floor (y -4, 3 mm in the water) instead of up the shaft. In the lapse the queen is held at rest
  (`founding/system.ts holdStill`) and the flee rule leaves founding queens to the founding module, so she drowned at
  t 6671 ("Water filled the burrow"). The read-out's "flood-safe" is right: the burrow did not fill; the queen stood in
  the water she had let in while digging.
- **Breaking commit: `995244e`** (round 14, the mound-mask hole probe in `nest/moundRelax.ts buildMask` reads the
  carve cavity alone). Bisect over `4ab0ebd..HEAD` with the headless opening: PASS on `4ab0ebd`, `0a54841`, `cbe7f4d`,
  `c712e20`, `819c2c3`; FAIL on `995244e`. Isolated by patching `819c2c3` with only that hunk (`t-xmask`, FAIL, plug 93)
  against only the commit's `nests.ts` hunk (`t-xnests`, PASS, plug 229). Outputs `test-output/opening-fix/bisect/`.
  The cavity-only probe lets spoil lie on the steep lip of the entrance funnel; it changes the seal the player's
  "hold E" makes there. The drowning itself is a latent defect the mask change only triggered.
- **Fix 1 (consequence) - `dryQueen`** (`src/sim/colony/founding/dryQueen.ts keepQueenDry`, called in the
  `timelapse` case of `founding/system.ts`): in the lapse a queen standing FLEE_WATER_DEPTH deep walks along the cavity
  to the dry floor nearest the cell's centre (by intent when possessed). DEVIATIONS D40. Kept (ruling 1).
- **Fix 3 (cause, ruling 1.1) - the wide mound-mask probe** (`buildMask`): the hole probe reads the field f at the
  ground minus MOUND_HOLE_PROBE_DEPTH with the **pile overlays left out** (new additive `WorldField.withoutOverlays`;
  terrain, ground deltas, primitives and carve stay), so it is as wide as round 12's (f with the piles) and depends only
  on state the cache key follows; the key now also follows dynamic primitives near the grid. DEVIATIONS D42.
  Adoption checks (ruling 1.1), all met:
  - `nest/moundMaskHeights.test`, `nest/moundRestore14.test` (and the other 6 mound files), `locomotion/pointFieldRestore.test`,
    `locomotion/pointFieldEvict.gate2.test`, `ants/behaviours/outdoor/determinism.perf.test`: green.
  - Save / restore of one cached colony: sg #2 (`test-output/viab/cache/...suburban-garden-2-...-211d103b.bin`, saved at
    tick 99748 as round 14 did) runs **equal for 36000 ticks** (`test-output/opening-fix/restore/sg2-wideprobe.txt`,
    probe `probe-restore14b`).
  - Seed 2's headless opening seals as round 9's did: **plug 223 voxels** (round 9: 229; live: 93); the queen at the
    lapse start is at y -3.9 on the cell floor, 1.6 BU from the cell centre (dryQueen walks her out if water rises); 11
    workers handed over (round 9: 6 headless / 7 browser).
- **Tests.** `founding/dryQueen.test.ts` (2; red without the hook: the queen drowns), `nest/moundMaskLip.test.ts` (new:
  lip cells where f is open but the cavity is not are kept clear, and stay so under a pile; red on the cavity-only
  probe), `founding/playerOpening.long.test.ts` (FOUNDRESS_LONG; seed 2 within R14).

### Seed 1 (`00000001`): the entrance not reopened

- **Cause.** After the hand-over the auto allocation gave `dig` nobody: with 4-7 nanitics (one possessed by the player)
  nurse, queen-care, the scout floor (R38), forage and store took every worker before `dig` in GDD 02 §6.3's order, so
  the throat stayed `reopening` with plug soil in it. Browser seed1-b (fix-1 tree, `test-output/opening-fix/firstplay/seed1-b.log`):
  seal 130, **4 workers**, `reopening:130` at the end of beat 13's 30 x 250 ticks. Round 9's browser seed 1 sealed
  130 voxels too but handed over **5** workers and dug. Headless seed 4 shows the same defect (4 workers,
  `reopening:235` for good). Second defect behind it (found on seed 4): even with diggers targeted, ants change task
  only at the end of a task cycle or by the 120 s surplus check, whose slack (actual > 1.2 x target + 1) never fires in
  a colony of four: the forager waiting in the cell and the store post kept their tasks for 8 game hours.
- **Breaking commit: none single.** The headless script does not reproduce the browser's seed-1 game exactly (the
  headless seed 1 hands over 12-13 workers and opens; the browser diverges by beat 06, tick 1591 vs 1569), and the
  failure depends on how many first workers a game hands over (4 fails, 5 dug). It is a latent allocation defect:
  the GDD order of the targets predates round 9; what changed between the two browser runs is the number of first
  workers the lapse hands over (5 -> 4; not bisected further, since a 4-worker hand-over fails on any tree with that
  order).
- **Fix 2 - the unplug floor** (`colony/allocation/demand.ts unplugFloor`, `targets.ts planTargets` /
  `serveUnplugFloor`, `balance/colony.ts UNPLUG_FLOOR_DIGGERS` = 2): while a nest has no `open` entrance and a
  `reopening` throat with plug soil, 2 diggers are served right after the brood's care, before the scout floor and
  forage. DEVIATIONS D41.
  **Ruling 1.2 (fewer than 5 first workers):** at the floor's turn the nurses first get their full demand, then the
  plug its diggers; the floor never lowers the nurse target and takes its diggers from queen-care's second half and the
  work outside. Four first workers with one possessed, demand nurse 1 / queen-care 2: nurse 1, queen-care 1, **1
  digger**; all four free: 2 diggers; 2 free with nurse 1 + queen-care 1: no digger (care first).
- **Fix 4 - the unplug draft** (`colony/allocation/unplugDraft.ts draftUnplugDiggers`, every allocation pass): while
  the floor is short of diggers, workers that are home, not nurses, and over their own task's target switch to `dig`.
  Seed-4 hand-over: entrance open 3000 -> 1750 ticks (snapshot probe), 1500 in the full headless run. DEVIATIONS D43.
- **Tests.** `colony/allocation/unplugFloor.test.ts` (3: the floor puts diggers on the plug, red without it; a 216-case
  grid of 2-4 free workers where the floor never lowers the nurse target and digs whenever the nurses and queen-care's
  first half leave a worker, red without the nurse top-up; the floor's conditions), `colony/allocation/unplugDraft.test.ts`
  (2), `founding/playerOpening.long.test.ts` (seed 1 within R14, seed 4 within beat 13's window).

## 2. Headless reproduction (item 2)

`tools/sim/opening.ts` (CLI) around `src/sim/colony/founding/playerOpeningKit.ts` (`runOpening`): the same commands
as beats 04-13 of `tests/e2e/firstplay.mjs` straight to the sim (site search, walk, bites, seal by holding E, lay
batches, Tend the brood, skip, Take a worker, 30 x 250 ticks). Hashes per beat and at the lapse start compare with the
browser's `FIRSTPLAY_DUMP=1` lines. Seed 2 matches the browser's failure (same site q 0.651, rBu 2, lapse `failed`).
Seed 1 does not match: the browser diverges by beat 06 (tick 1591 vs 1569; the browser's input timing), so its
hand-over differs (4 workers against 12); the reopen defect was reproduced headless on seed 4 instead, and on seed 2's
hand-over snapshot (`--save-handover`, `tools/sim/probe/reopenProbe.ts`).

| seed | live tree | fix-1 tree | final tree (`test-output/opening-fix/headless/fix3/`) |
|---|---|---|---|
| 1 | PASS, seal 225, 12 w, open 750 | PASS (same) | PASS, seal 165, 13 w, open 500 |
| 2 | FAIL lapse `failed`, seal 93 | PASS, seal 93, 6 w, open 4000 | PASS, seal 223, 11 w, open 1000 |
| 3 | - | PASS, seal 310, 8 w, open 750 | PASS, seal 361, 8 w, open 750 |
| 4 | - | FAIL `reopening:235` (4 w) | PASS, seal 235, 4 w, open 1500 by 250-tick polls, 1287 tick-exact (over R14's 1000) |
| 5 | - | - | PASS, seal 132, 4 w, open 750 |

## 3. Browser (items 1 and 6)

All runs on the final tree (`src/sim` == the frozen copy), `FIRSTPLAY_UNTIL=13 FIRSTPLAY_DUMP=1`, no stand-ins, no soft
failures, no console errors. Logs and pictures: `test-output/opening-fix/firstplay/seedN-final{.log,/}`; the hand-over
and reopen ticks are the `dump.jsonl` lines `12-outcome-card` and `reopen-check` (beat 13 polls every 250 ticks, so
"open + worker outside" is known to the 250-tick step).

| seed | site (q, word, r) | seal | eggs | first workers | hand-over (game time) | open + worker outside after | R14 (4 h = 1000 ticks) | headless (fix3) |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.713 poor, 2 BU | 108 | 12 | 4 | ~02:00, night | 1503-1753 ticks (6-7 h) | missed | seal 165, 13 w, open 500 (not the browser's game) |
| 2 | 0.651 poor, 2 BU | 223 | 12 | 7 | 19:46, night | 1503-1753 ticks (6-7 h) | missed | seal 223, 11 w, open 1000 |
| 3 | 0.711 poor, 2 BU | 312 | 12 | 7 | ~08:00, 25 C | 503-753 ticks (2-3 h) | **met** | seal 361, 8 w, open 750 |
| 4 | 0.767 fair, 2 BU | 235 | 12 | 4 | ~01:15, night | 1253-1503 ticks (5-6 h) | missed | seal 235, 4 w, open 1287 (tick-exact) |
| 5 | 0.623 poor, 2 BU | 104 | 12 | 4 | ~22:40, 23 C (heat) | 253-503 ticks (1-2 h) | **met** | seal 132, 4 w, open 750 |

Pictures 12 and 13 looked at for every seed: 12 = the outcome card ("First workers: N", queen's reserves) over the
queen in her cell; 13 = the open entrance in its crater mound (seed 2 at night, dark but readable; seeds 1 and 4 at dawn, a worker visible beside the mound in seed 1;
seed 3 by day). Seed 1's run is from 01:33 UTC (second engineer), on the same `src/sim`.

**Headless against browser (item 2, items 7).** No seed is an exact match. The state hash differs from tick 1 (beat 03)
on every seed because the configs differ in fields that do not change the world: the browser's New-colony screen sets
`seedText` to the typed code (`00000002`) and `cheats: false`; `openingSim` sets `seedText "2"`, `cheats: true` and a
fixed archetype / size (`playerOpeningKit.ts openingSim`). The world, the site the search picks and (for seeds 2 and 4)
the seal match; the games then drift with the input timing (the browser walks and digs per rendered frame, the
headless driver per fixed step), and the lapse amplifies it: seed 2 hands over 7 workers in the browser against 11
headless, seed 1 4 against 13. Seed 4 is the closest (hand-over tick 38810 against 38811, same seal and worker
count). That is why seeds 3-5 were run in the browser too.

**Full runs (item 6).** FULL_RUNS


## 4. Sweep check (item 5)

Run by `test-output/opening-fix/close.sh` / `close-resume.sh` from the frozen copy (tree `9a8cdf07`, the final tree),
fresh cache `test-output/opening-fix/cache`; 5 runs before the pause (01:14-01:39 UTC), 10 after restart 9 (05:27-06:16).
**The fixes change every game** (the wide mound-mask probe acts all game long; the unplug floor and draft act at every
hand-over until the entrance is open), so the full sweep was run, not only the paired hand-overs.

**Full sweep, 15 fresh foundings** (`test-output/opening-fix/sweep-table.md`, against gate-sim-2's sweep2;
`sweep-table-vs-sweep.md` against its first sweep):

| | gate-sim-2 sweep (item 4 in, 55c4dfff) | gate-sim-2 sweep2 (item 4 reverted, 43fbaf86) | **this tree (9a8cdf07)** |
|---|---|---|---|
| viable | 12 of 15 (sg #2, sg #3, kd #3 not) | 13 of 15 (pp #3, cpv #3 not) | **12 of 15** (sg #2, we #3, pp #3 not) |
| per archetype | sg 1 of 3 | all >= 2 | **all >= 2** (we 2, sg 2, pp 2, cpv 3, kd 3) |
| workers at winter (sum) | 271 | 270 | 249 |
| median intake / need P | 0.515 | 0.434 | 0.425 |

All three misses fail on one check only, R27 winter carbohydrate stores (0.59, 0.83, 0.77 of the need). The spec's bar
(viable >= 13 of 15 and >= 2 of 3 per archetype) is **missed by one**; integrator ruling 1.3's threshold (find the
cost by switch-off runs if viability drops below 12) is not crossed, so no switch-off runs were made. The first
workers are identical in all 15 runs on both trees (the foundings are equal up to the hand-over); the difference is
after it: 249 workers at winter against 270-271. **Not attributed**: the closing tree of gate-sim-2 (item 4 + the
point-field eviction fix + the tier argument) was never swept itself, and the machine had no free core for switch-off
runs while the close and the browser runs were going. If the integrator wants it attributed: run sg #2, we #3, pp #3
and two viable colonies from `test-output/opening-fix/cache` hand-overs with the mound-mask probe switched back
(`moundRelax.ts buildMask`) and with the unplug floor / draft off (`UNPLUG_FLOOR_DIGGERS = 0`).

**Item 5, the paired check** (`f15-table.md`): the five sweep-15 hand-overs of the long-run set, run to winter on this
tree from sweep 15's own hand-over files:

| run | sweep 15 viable / workers / C | this tree viable / workers / C |
|---|---|---|
| woodland-edge #2 | yes / 11 / 8.3 | yes / 13 / 11.47 |
| suburban-garden #2 | NO / 17 / 0.01 | yes / 17 / 5.95 |
| car-park-verge #1 | yes / 23 / 16.92 | yes / 23 / 24.96 |
| playground-park #3 | yes / 19 / 12.59 | yes / 21 / 10.19 |
| kitchen-door #3 | yes / 9 / 6.65 | yes / 10 / 6.65 |

Viability drops in none of the five (bar: at most one); one gains. **Met.**

**Long runs (year two, the same five colonies, fresh foundings on this tree;** `sweep-long/longrun-table.md`):

| | gate-sim-2 reverted | gate-sim-2 item 4 in (kept) | **this tree** |
|---|---|---|---|
| workers winter 1 -> winter 2 | 85 -> 94 | 85 -> 105 | **83 -> 108** |
| R22 spring >= 0.7 x winter | 5 of 5 | 5 of 5 | 5 of 5 |
| R34 winter 2 >= 1.0 x winter 1 (bar 4) | 4 of 5 | 4 of 5 | 4 of 5 |
| R34 >= 1.5 x (bar 3) | 0 of 5 | 1 of 5 | **2 of 5** |

Per colony at winter 2: cpv #1 36, kd #3 10, pp #3 28, sg #2 19, we #2 15 (kd #3 is the R34 miss, as on both earlier
trees).


## 5. Appendix E checks

The opening's acceptance checks that concern this task's rules (GDD 06 §5 founding, E15-E19 founding checks) are covered
by the existing `colony/founding/*.test.ts` (32 files of founding + allocation green on the final tree). New checks of
this task: R13 (a flood-safe site does not fill in the lapse; seed 2) and R14 (open within 4 game hours; seeds 1, 2) in
`playerOpening.long.test.ts`. Checks needing other modules: beats 07-08's camera assertions (look-pass-6, `src/render`).

## 6. Still wrong

1. **R14 (open within 4 game hours of the hand-over) is met when the hand-over is warm, missed when it is cold.**
   Browser: seed 3 (hand-over ~08:00, 25 C) opens within 503-753 ticks and seed 5 (~22:40 but 23 C, a hot night,
   plug 104) within 253-503; seeds 1, 2, 4 (cool nights, 12-15 C) take 1253-1753 ticks (5-7 game h).
   Beat 13 itself passes on all of them (its window is 30 x 250 ticks). **Trace (resume, item 3 of the integrator's
   note)** on the seed-4 hand-over snapshot (`tools/sim/probe/unplugTrace.ts`, archived; output
   `test-output/opening-fix/headless/trace-s4.txt`): plug 235 voxels, open at +1287 ticks, **the same tick the plug
   count reaches 0** - there is no stall at the surface in the player's opening (gate-sim-2's lead, the shaft's top
   sphere keeping 2 surface samples just below open, belongs to the plain-fill escape dig of `nest/escapeDig`, a
   different path: a founding plug is dug by `unseal-entrance`, not by a plan's spheres). The time is the bite rate:
   the unplugging digger ran `unseal-entrance` for 1092 ticks for about 60 bites, ~19 ticks a bite (0.625 s of nanitic
   work / work rate ~0.33 at the night's 12-15 C), each opening ~2 plug voxels, with at most UNPLUG_DIGGERS_MAX = 2
   diggers in the throat: 235 voxels / (2 x 2) x 19 ~ 1100 ticks. Warm, the same plug takes about a third of that (work rate ~1).
   So the night misses come from the plug size and the cold work rate, both balance, which the spec forbids changing
   here (no rebalancing). One small defect was found and **not** kept: the unplug stand point (`dig.ts unplugStep`,
   radius + 1.5 BU down the throat axis) lies inside the plug when the mouth is wide (seed 4: f = -2, no nav
   component), so a digger coming up from the cell fails the walk at once and is barred from unplugging for
   UNPLUG_RETRY_S (600 ticks). A prototype (stand at the nearest open point of her own nav component inside the
   throat) brought the second digger to the plug at +103 instead of +719, but the entrance opened at +1224 instead of
   +1287 (5 %), because the barred digger had meanwhile dug the founding plan through the same plug. Not worth
   changing every hand-over and restarting the sweep: reverted (06:05 UTC), the tree stayed the frozen one. Worth a
   small task: the stand point, and a pellet rule or a third digger if R14 must hold at night (a balance decision).
2. **The headless script is not an exact match of the browser on any seed** (section 3: config text fields from tick 1,
   input timing after that); every seed 1-5 was confirmed in the browser as well.
3. Pre-existing red tests in the touched folders (also red on HEAD `07583fe`): `nest/escapeDig.test` (gate-sim-2 §6
   item 8), `nest/architect/layout.test` (50 ms timing under load), `nest/flood/readersCost.verify.test`.

## 7. Contract changes (additive)

- `src/sim/world/field.ts` `WorldField.withoutOverlays(skip, fn)` (new method; the only implementation is FieldImpl).
- `src/sim/colony/allocation/index.ts` `refreshActual` exported (was module-private).
- `src/sim/colony/allocation/demand.ts` `unplugFloor` exported; `computeTargets(..., unplugFloor = 0)` new optional argument.

## 8. Evidence paths

- Headless: `test-output/opening-fix/headless/` (`live/`, `fix1/`, `fix2/`, `wide/`, `fix3/summary.txt`), probes'
  outputs `reopen-s4-*.txt`, `reopen-s2*.txt`.
- Bisect: `test-output/opening-fix/bisect/`.
- Restore: `test-output/opening-fix/restore/sg2-wideprobe.txt`.
- Browser: `test-output/opening-fix/firstplay/`.
- Sweep: `test-output/opening-fix/sweep/`, `f15/`, `sweep-long/`, `close.log`.
- Probes archived: `test-output/opening-fix/probes/`.
- R14 trace: `test-output/opening-fix/headless/trace-s4.txt` (frozen tree), `trace-s4-stand.txt` (the reverted prototype).
- Sweep tables: `test-output/opening-fix/sweep-table.md` (against gate-sim-2 sweep2), `sweep-table-vs-sweep.md` (against gate-sim-2 sweep), `f15-table.md`, `sweep-long/longrun-table.md`.
