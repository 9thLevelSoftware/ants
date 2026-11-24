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

**Full runs (item 6).** One uninterrupted run per seed, no `FIRSTPLAY_UNTIL`, no stand-ins, `FIRSTPLAY_DUMP=1`
(`test-output/opening-fix/firstplay/full-seed1{.log,/}`, `full-seed2{.log,/}`; 08:00-08:48 UTC). Both pass beats 01-13
again (a second, independent confirmation of acceptance criterion 1) and stop later on a beat of the colony half:

- **Seed 1: first failure at the 13 -> 14 trail check**, "no forager laid a trail to the food within 18000 ticks"
  (4 workers; the script's sugar spill 88 mm from the entrance, 9000 ticks of waiting, then the player's forage marker
  on it and 9000 more; `trail 0` at the midpoint). **Cause: sim balance by design, not a hand-over defect.**
  Reproduced headless on the 4-worker seed-4 hand-over (`tools/sim/probe/trailProbe.ts`, archived; output
  `test-output/opening-fix/headless/trail-s4.txt`): the spill is known at once, the one forager harvests it 9 times in
  18000 ticks (about one trip per 8 game hours; the other three workers are nurse / queen-care / store) and switches
  trail laying on for 3 return trips, but at most 2 trail cells are ever active (max 0.13 ph) and they never link the
  source to the entrance: GDD 02 §8.3's dab size scales with sizeFactor(N), 0.3 at 4 workers
  (`SIZE_FACTOR_MIN`, full strength at 75), and one weak trip every 8 hours evaporates before the next. A 4-worker
  colony forages alone (and it has 4 workers because the script's clutch is 12 eggs, not the 24 it means: section 6b); beat 14's expectation (a trail within 3 game days) holds for the 7-worker seed 2 (below) but not
  for 4 workers. Not changed (rebalancing is out of this task's scope); the script already has the recorded stand-in
  `FIRSTPLAY_STANDIN_TRAIL` for this case. For the integrator / app: either the script waits for a 7+-worker colony or
  uses the stand-in when the colony has fewer than N0 = 10 workers, or a design decision on trail strength in tiny colonies.
- **Seed 2: beats 14 (worker following the trail, `trail 0.005`, via the forage marker) and 15 (harvesting) pass;
  first failure at 15 -> 16**, "the worker did not hand over her load" (crop 0.24 C kept; the colony's C store 11.599 ->
  11.600). This is the failure the spec quotes from the Nov 23 stand-in run. **Cause: the larder cap (ruling R21 (b)),
  by design, not a defect.** The nest still has only its founding cell, so the stores are a larder of
  `LARDER_NEED_GD` = 1 game day of the colony's need (`balance/colony.ts`, `colony/stores.ts poolCapacity`); the 400-unit
  spill the script spawns filled it before the possessed worker came home (11.6 C was already in store at the start of
  her walk), and `unload-crop` ends at once when the pool takes nothing (`ants/actions/defs/nestCare.ts`). R21 (b) makes
  that refusal the trigger for the first food chamber (`larderRefusedTick`), so the cap is the designed path to it.
  Not changed. For the app / script owner: deliver to a nestmate (`trophallaxis-give`), or wait for the food chamber,
  or surface the refusal ("the stores are full") to the player; and the script could assert on the refusal reason
  instead of the crop.

Neither failure is in the opening (beats 01-13), and neither is a sim defect of the hand-over kind this task fixed, so
neither was fixed here (spec item 6: "fix it if it is a sim defect of the same kind").



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
runs while the close and the browser runs were going. **Switch-off runs anyway (informative, after the close finished):** the three non-viable colonies' own hand-over files
(`test-output/opening-fix/cache`), run to winter on scratch copies of the final tree with one change off
(`test-output/opening-fix/switchoff.txt`; R27 C-store ratio, viable at >= 1):

| colony | control (final tree) | mound probe back to round 14's cavity-only | unplug floor + draft off |
|---|---|---|---|
| suburban-garden #2 | 0.59 NO | 0.53 NO | 1.51 yes |
| woodland-edge #3 | 0.83 NO | 1.04 yes | 1.52 yes |
| playground-park #3 | 0.77 NO | 0.38 NO | 1.27 yes |

The controls reproduce the sweep's own runs exactly (the continuation from the hand-over file is the same game). The
floor-off column looks like a cost of the floor, but `tools/sim/probe/floorProbe.ts` on the same hand-overs shows the
floor on for **one spell of 229-321 ticks right after the hand-over and never again** in 10 game days
(`test-output/opening-fix/floor-probe.txt`): its only direct effect is who digs for the first ~1.3 game hours. The flips
are the chaotic divergence of a whole season from a small early difference, plus regression to the mean (the three
runs were picked for failing; the mask switch flips one of them too). This is not evidence of a systematic cost, and
the floor stays (R14 and seed 1 need it). A real attribution needs paired switch-off runs over all 15 foundings (or
more seeds): about two hours of two cores.

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
   **Ruling 2's question, numbers** (`tools/sim/probe/digRateProbe.ts`, output
   `test-output/opening-fix/headless/digrate-s4.txt`, seed-4 hand-over, game hours after it):

   | hour after hand-over | diggers' mean body T | mean work rate | unseal bites | plug voxels left |
   |---|---|---|---|---|
   | 1 | 11.4 C | 0.33 | 10 | 201 |
   | 2 | 10.6 C | 0.29 | 11 | 164 |
   | 3 | 9.9 C | 0.24 | 11 | 138 |
   | 4 | 10.9 C | 0.31 | 23 (second digger joins) | 80 |
   | 5 | 13.0 C | 0.43 | 34 | 9 |
   | open at +1287 ticks (5.1 h), 94 bites | | | | |

   Both diggers stay on the plug the whole time once there (no rest rule, no allocation gap); the one other hold is the
   stand-point lockout above (the second digger arrives at +719 instead of +103, cost ~63 ticks). So cold is the cause:
   Lasius' work rate at 10-13 C is a quarter to a half of its rate at 18 C and above (the forage gate's full band starts
   at b = 18 C), and a bite is 0.625 s of nanitic work divided by it. Weighted by the work rate, the seed-4 plug took
   **1.7 full-rate game hours**. Proposed restatement (ruling 2): *R14 - the entrance is open within 4 game hours of the
   hand-over, counting only time at full work rate (equivalently: within 4 game hours of the first hour in which the
   diggers' body temperature reaches the forage gate's full band, 18 C for Lasius)*; seed 4 then meets it (it even opens
   before the morning warms), and seeds 1 and 2 (same 12-15 C night, plugs of 108 and 223) open in 6-7 game hours of
   cold work, which is the same rate.
2. **The headless script is not an exact match of the browser on any seed** (section 3: config text fields from tick 1,
   input timing after that); every seed 1-5 was confirmed in the browser as well.
3. Pre-existing red tests in the touched folders (also red on HEAD `07583fe`): `nest/escapeDig.test` (gate-sim-2 §6
   item 8), `nest/architect/layout.test` (50 ms timing under load), `nest/flood/readersCost.verify.test`.

## 6b. Integrator ruling 3 (a) and (b): why a player's founding hands over 4 workers

**(a) Where 8 of 12 eggs go.** Headless seed 4 (`tools/sim/probe/clutchProbe.ts`, archived; output
`test-output/opening-fix/headless/clutch-s4.txt`): 12 eggs laid; 5 eggs and 3 larvae die of `base` mortality (GDD 06
§5.12 step 2, mu = 0.42 (1.1 - Q) per GD, Q 0.767, over the long development of a 17 C cell), none of flood, intruder,
cannibalism or starvation; the queen ends at 52.5 of 56 loads (the 73-76 % shown on the card). 4 workers is what the
game's own forecast predicted: the forecast panel after the clutch read "First workers 3-5" (seeds 1-4: expected
3.8-4.8; outcomes in the browser 4, 7, 7, 4; seed 5's forecast 0.9, outcome 4). The GDD's calibration (clutch 12 at
Q 0.5-0.7: 3.8-5.7 workers at 19.5 C) agrees. **No defect in the lapse**; the queen keeps her reserves because the
clutch is small, not because the brood is starved.

**The real cause of the small clutch: the script lays 2 batches, not the 4 it presses.** `firstplay.mjs` (and the
headless driver, which copies it) presses `lay-egg` four times (`layBatch`: press, 50 ticks, release, 5 ticks). In the
cell's 17 C a batch takes 58 ticks (`OPEN_LAY_ACTION_S` 4 s divided by the queen's work rate ~0.69; `lay-egg` is
`lockedAfterWindup`, so the release does not end it), so presses 2 and 4 come 3 ticks before the running batch ends and
are refused `blocked` (`clutch-s4.txt`: `t 5855 action-failed lay-egg blocked`). Every browser seed shows `batches: 2`,
`eggs: 12`. With the four batches the script means to lay (24 eggs, as the sweeps' autoplayer does) the same model gives
8-16 first workers.

**(b) What the opening tells the player.** After each batch the HUD shows (picture `seed1-final/10-first-clutch.png`):
"Eggs 12 of 48 / First workers 3-5 / Reserves then 76 % / Safe up to 47 eggs". The guidance is there and is honest; it
invites a much larger clutch (safe up to 44-48 on seeds 1-5). For the app engineer / script owner: (1) `layBatch` must
wait for the batch to end (poll the queen's action, or step at least 60 ticks) - then the script lays the clutch it
intends; (2) a press that lands while a batch is ending is refused silently - buffer it or show that the queen is busy,
since a player pressing at a steady rhythm in a cool cell loses every other press the same way. Nothing changed in the
sim (no design number touched without a ruling).

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
