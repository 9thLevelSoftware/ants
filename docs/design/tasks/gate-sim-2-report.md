# gate-sim-2 — simulation gate after colony-life: report

Engineer: gate-sim-2 implementer, Nov 23 16:50-UTC onward (one session; progress file
`docs/design/tasks/progress/gate-sim-2-impl.md`). Evidence: `test-output/gate-sim-2/` (git-ignored; paths below are
relative to it unless they start with `src/`, `docs/` or `test-output/`).

## 0. Result in one screen

- **Close sweep (`sweep2/`, final tree, src hash 43fbaf86): viable 13 of 15, every archetype >= 2 of 3 — viability bar
  MET.** woodland-edge 3/3, suburban-garden 3/3, playground-park 2/3 (pp #3: C 0.99 x of its R27 need), car-park-verge
  2/3 (cpv #3: 0.63 x), kitchen-door 3/3. R19 4 of 7 (P intake 0.434, first workers >= 9 in 11, no-lost in 12: not
  met; not chased).
- The first close sweep (`sweep/`, item 4 in) had 12 of 15 with suburban-garden 1 of 3; the switch-off runs showed item
  4 cost it (section 2), item 4 was reverted and the sweep run again in full on the reverted tree (`sweep2/`).
- Kept from this task: item 2 (retrace variant f), the time.test fix (winter path on the default year), the runner's
  failure code fix, the layering rename, restated stale tests, load guards. Reverted: item 4 (a real defect fix,
  section 2 and section 6 item 1), the species-module stagger offsets. Not built: item 3. Item 5: no defect of the
  kind named; one candidate found (section 6 item 5).
- Red tests in the folders of this task: 49 before, 33 after; every remaining red is in section 1 with its cause and
  owner. `npm run typecheck` clean.

## 0a. Close sweep tables

Tables by `tools/sim/sweep-table.py` against sweep 15 (`colony-life/round-15/sweep`): `sweep2-table.md` (final), and
`sweep-table.md` (first close sweep, item 4 in). Sums over the 15 JSONs (`sums.py`, `sums.txt`):

| sweep | tree | viable | first workers | workers at winter | eclosions | larvae starved | median P / C intake | median trip success | crushed / lost / predation |
|---|---|---|---|---|---|---|---|---|---|
| sweep 15 (colony-life close) | 48db2e0d | 14 | 161 | 258 | 116 | 8 | 0.344 / 1.278 | 51.6 % | 12 / 4 / 1 |
| first close sweep (items 2 + 4) | 55c4dfff | 12 | 161 | 271 | 131 | 1 | 0.515 / 1.147 | 56.7 % | 8 / 6 / 6 |
| **close sweep (item 2; item 4 reverted)** | **43fbaf86** | **13** | 161 | **270** | 118 | 10 | 0.434 / 1.196 | 53.5 % | 4 / 4 / 1 |

Foundings are the same in all three (first workers and hand-over days equal run by run): the founding code did not
change. Per-run regressions of the final sweep against sweep 15 (from the table): pp #3 and cpv #3 viable -> NOT
viable (both short of winter carbohydrate), intake C lower in 8 runs, we #3 eclosions 7 -> 1; sg #2 NOT viable ->
viable. kd #3 again raises no worker (7 larvae starved: item 4's defect, reverted). One sweep of chaotic runs
(direction 13): the counts are the bar's, the per-run differences are not evidence on their own.

**Long runs (to day 40 of year 2, the same five runs as sweep 15, from the frozen tree, `longrun-life.sh`):**
`test-output/gate-sim-2/sweep-long/` and `sweep-long-table.md` (`tools/sim/longrun-table.py`); sweep 15's at
`test-output/colony-life/round-15/sweep-long/longrun-table.md`.

| run | winter 1 workers (sweep 15 -> final) | spring d1 | y2 eggs / eclosed | winter 2 workers, C | R34 >= 1.0 x |
|---|---|---|---|---|---|
| car-park-verge-1 | 23 -> 26 | 20 -> 23 | 53 / 28 -> 37 / 23 | 31, 19.5 -> 32, 20.5 | yes -> yes |
| kitchen-door-3 | 9 -> 9 | 8 -> 8 | 13 / 2 -> 30 / 8 | 2, 0 -> 8, 9.0 | no -> no |
| playground-park-3 | 19 -> 20 | 18 -> 19 | 37 / 20 -> 40 / 20 | 23, 16.4 -> 22, 4.5 | yes -> yes |
| suburban-garden-2 | 17 -> 17 | 7 -> 14 | 0 / 0 -> 37 / 16 | 2, 18.0 -> 19, 13.5 | no -> yes |
| woodland-edge-2 | 11 -> 13 | 10 -> 12 | 28 / 12 -> 30 / 11 | 13, 24.8 -> 13, 23.7 | yes -> yes |

- **R22** (spring >= 0.7 x winter 1): 4 of 5 -> **5 of 5** (bar 4 of 5, met). sg #2 no longer loses its queen to
  starvation over the winter (sweep 15: queen:starvation 1, worker:starvation 9, winter C 0; final: winter C 8.0,
  no starvation death). That is the winter-path fix (`queen.ts winterPathRamp`): sweep 15's sg #2 entered winter
  with no carbohydrate.
- **R24** (first year-2 egg): sg #2 "-" -> doy 3; the other four unchanged (3, 6, 5, 3).
- **R34** (second winter >= 1.0 x / >= 1.5 x winter 1): 3 of 5 -> **4 of 5** at 1.0 x (bar 4 of 5, met); 0 of 5 ->
  0 of 5 at 1.5 x (bar 3 of 5, not met; a growth bar, a known limit per the integrator note). kd #3 still fails
  (8 workers against 9). pp #3 ends year 2 with C 4.5 against 16.4: one chaotic run, not traced.


## 1. Red-test table (item 1)

Method: `npm run typecheck` (clean before and after), then `test-output/gate-sim-2/folders.sh` — every folder of
`src/core`, `src/sim`, `src/worldgen`, `tools`, `tests/docs` run on its own (files directly in the folder, one vitest
worker while life runs went on). Before = the live tree at 16:56 with only variant f in (`vt-before/`, per-folder `.txt`
and `.json`; `vt-before/summary.txt`); after = the final tree (`vt-after/`). The failing-test lister is
`scratchpad fails.py` reproduced in section 9.

Verdicts: **defect** (fixed at its cause, test unchanged), **stale** (a number or fixture made stale by a ruling or a
later rule; restated from the constants, old -> new in DEVIATIONS, no tolerance widened, no assertion dropped),
**timing** (wall-clock budget under load: load guard `src/sim/testing/perfLoad.ts heavyLoad()`, strict mode
`FOUNDRESS_PERF_STRICT=1`), **mine** (made red by a change of this task and fixed in it), **left red** (cause and owner
given).

| # | test (folder) | red since | cause | verdict | action | after |
|---|---|---|---|---|---|---|
| 1 | `colony/workedExample` §15 need rates | round 8 | the chapter's larval terms assume 1.2 P per larva and r(25) = 1.2 (0.5 gd stage); the constants give 0.8 P (R43) and r(25) = 1.364 (0.44 gd): per larva 0.909 C / 1.819 P per gd | stale | totals, stock changes and per-larva components derived from the constants with the chapter's other terms (R43 row) | green |
| 2 | `colony/handoverStomach.verify` case 1 | round 15 (R43) | rationing entered on the **empty carbohydrate pool** (fixture: 4 C, no foragers; at 0.8 the nurse load carries more C) while the protein pool is full (1.05 = stomach room) and the queen holds no C above her keep; R2's provision is not withheld | stale (R2 not broken) | restated to R2's intent: no starvation death, no empty P pool with larvae, no rationing with C in the pool while she holds her provision | green |
| 3 | `behaviours/outdoor/appendixE23` | round 15 (variant e) | the retrace's consumption cut the carrion trail | defect (variant e) | item 2: variant f | green |
| 4 | `behaviours/nest/sfaReview.verify` (marker removed mid-window) | before round 15 | fixture expects the board built by tick 2 of a window; nurses no longer read the board every tick (think cadence) | stale fixture | waits for a window whose board is built, then removes the marker; all assertions kept | green |
| 5 | `behaviours/nest/stall.soak` | since viab-loco item 6 | idle ants dozing in a crowded room (designed standing, `locomotion/system.ts dozing`) counted as "moving at speed 0": 7722 of 7784 stalled ant-ticks (`tools/sim/probe/g2-stall.ts`) | stale | dozed ticks (`locoStats().dozed`) taken out of the count; limit unchanged (1 %) | green |
| 6 | `nest/escapeDig` case 1 (closed nest reopened within 2.5 game h) | at least Nov 22 06:25 (`git archive` bisect: red at 9c2e6ea (never opened in 8 h), 1dc8d36, 9de71c1, 0a54841 (opened after 870 ticks = 3.5 h)) | the 16-worker test nest's escape dig is chaotic: 520 ticks when written, 870 on Nov 22 trees, green once in this task's first folder run, red again on the final tree | left red (not one change; an execution-speed bound) | owner nest (escape dig: one face of a 2 BU shaft at a time sets the time; R14's 4 h bound is not built as a rule) | red |
| 7 | `nest/flood/readersCost.verify` | written red (sweep-8 review, Nov 22) | flood readers rebuild the spill geometry per carve (F1: save / load equality) while the model rebuilds per 5 s; measured cost 0.04 ms/tick (colony-life ledger) | left red (design trade-off) | owner nest/flood: needs a determinism-preserving cache design | red |
| 8 | `nest/architect/layout` 50 ms | timing | 76.9 ms at load 6-7 (the existing guard skips at load > 8) | timing | guard already present; not widened | red (timing) |
| 9 | `locomotion/perf` criterion 7 | timing | 5.9 ms > 5 (2 x budget) under load | timing | `heavyLoad()` guard added, strict mode kept | red (timing at load ~6; guard only above load 8) |
| 10 | `ants/actions/runner.test` failure codes | before round 15 | `mill-seed` gained a `who` hook (Messor minors); the runner read any `who` as "the species has it" and answered `caste` for a Lasius worker (GDD 01 §7.1: `species`) | defect | `ActionDef.whoWithinSpecies` on species-module caste exceptions (mill-seed, cut-leaf, process-leaf); runner answers `species` for them | green |
| 11 | `ecology/sources` x12 (budget x3, drops x4, integration, lifecycle T1 carrion, season T1 flowers, tier1 spill x2) | Nov 16 (R1) | they test Tier 1 rules; `ECOLOGY_TIER` is the constant 2 since R1 (f55c559), so the T1 paths cannot be reached by a game or a test | left red (unreachable code) | owner ecology/sources: needs a per-game tier switch (test seam) or the T1 rules retired with the tests | red |
| 12 | `src/sim/time.test` no hard-coded season length | round 10 (R35) | `PROSPECTIVE_WINTER_FROM_DOY = 7` and `winterPathC` read the calendar's own doy: with 5- or 10-day seasons the winter path started in another season | defect | `queen.ts winterPathRamp(doy28)` on the default-year day; constant = `DEFAULT_SEASON_LENGTH_DAYS`; test `colony/winterPathSeason.test.ts` (red without); no Lasius hash change at 7-day seasons | green |
| 13 | `tests/docs/docs-final` | ? | see after-run | - | - | green (8 / 8) |
| 14 | `src/sim/services.test` CP diggability | species-carpenter | GDD 07 §5.2.6 "no soil nests" made CP's loam 0 | stale | restated to the constant (D36) | green |
| 15 | `environment/weather.test` streams | populate (Nov 16+) | a new game creates `rng.ecology` at creation; the test expected only `rng.weather` to exist after a year of weather | stale | restated: the streams that exist before the weather are unchanged after it, and only `rng.weather` is added | green |
| 16 | `pheromones/perf.verify` decay with modifier | written red (reviewer) | timing, 7.1 ms > 6 under load | timing | `heavyLoad()` guard | green |
| 17 | `behaviours/outdoor/review.verify` lasting threat | chaotic | flee -> return -> flee loop at a standing alarm on the way home; variant e 2 / 6 seeds over the bound, f 1 / 6 | left red (pre-existing) | owner outdoor behaviours (flee / return) | red |
| 18 | `rivals/broodRaid` App. E 20 | this task (item 4, 2nd version) | raiders' goals moved into a cavity | mine | item 4 restricted to in-nest item / brood goals | green (moot: item 4 reverted) |
| 19 | `locomotion/locoFix3.review` stem climb | this task (item 4, 1st version) | goal in a stem moved sideways | mine | item 4 restricted | green (moot: item 4 reverted) |
| 20 | `species/derive.test`, `species/speciesData.verify` | round 15 (R43) | GDD 07 larval costs at 1.2 P | stale | derived from `LARVA_P_REQ`, `LARVA_C_REQ` (R43 row) | green |
| 21 | `species/modules/fungus/loop`, `granary/rhythm`, `granary/scenario` | red on the hand-over tree too | not traced (Atta loop collects no staphylae; Messor patrol gate lets foragers out at midday; granary without care sprouts 40 % < 50 %) | left red | owners leafcutter / harvester modules | red |
| 22 | `testing/layering` (2 cases) | Nov 16-17 | (a) four test files import `@/game` / `@/content` (`config/rules.verify`, `nest/flood/founding`, `progression/winterNoticeJournal.verify`); (b) a local variable named `window` in `granary/rhythm.ts` | (a) left red, (b) defect | (b) renamed `windowTicks`; (a) owners of those tests (they belong under `tests/`) | red (case a only) |
| 23 | `testing/gate1b/seams` tend demand | round 12 (R39) | tend demand follows the carbohydrate want, not the slots | stale | restated to R39's bounds (<= slots, >= min(slots, keep), > 0) | green |
| 24 | `types/ids.test` alert count | weather-effects (Nov 16) | additive `founding-flooding` (38 kinds) | stale | count restated with the additive member named | green |
| 25 | `worldgen/layering` | Nov 17-22 | `populate/economy.ts` imported `@/sim/balance/ecology` (not the barrel); `populate.verify.test` and `testing/walker.ts` import sim modules outside the list | partial | economy.ts import fixed; the test / walker imports left (owner worldgen populate, wgf) | red (test / walker imports only) |
| 26 | `worldgen/pipeline` x3 | ? | woodland-edge / playground-park standard take 3 attempts (CPU 9.7 / 8.6 s against 2 x budget); a forced first-attempt failure takes 4 attempts (expected 2) | left red (not traced) | owner worldgen: validation fails on attempts that used to pass | red |
| 27 | `worldgen/maps/maps.verify` E5 door cracks | ? | order of the two door-crack states (`['open','sealed']` vs `['sealed','open']`) | left red (not traced) | owner worldgen maps | red |
| 28 | `worldgen/place/outdoor` x6, `outdoor.verify` fence | ? (wgo-fix work) | floating curled leaves, climb-route walker stuck on herb / fruit-tree routes, a tyre-to-arch route ending 442 mm from its POI, 3 micro-connections impassable, 4 not "useful", a fence side without a gap | left red (not traced; this task did not touch the placers) | owner worldgen outdoor (wgo-fix F4-F9 is listed in progress) | red |
| 29 | `worldgen/place/interior` App. E 4 | ? | `TypeError: Cannot read properties of undefined (reading 'push')` in the 10-seed kitchen-door connection test | left red (not traced) | owner worldgen interior | red |

Also new in this task: `colony/winterPathSeason.test.ts` (green; red without the fix),
`ants/behaviours/nest/buriedLarva.gate2.test.ts` (skipped: item 4 reverted, see section 2; red on the final code).
Count in the folders of this task (before -> after, `vt-before/summary.txt`, `vt-after/summary.txt`; the after-run
had item 4 in, the folders it touches were run again on the final tree in `vt-final/`): 49 failing tests before, 33 after (lists: `python3 fails.py vt-before` / `vt-after`, the script is in section 8).


## 2. Items 2-5

### Item 2 — crumb retrace "variant f" (ADOPTED)
- Change: `src/sim/locomotion/crumbs.ts retraceTarget` keeps the nearest-crumb start of variant e and drops the
  consumption (`crumbLen = target + 1`). Probe evidence for the cause was sweep 15's (App. E 23 red from the
  consumption half only).
- Adoption check (spec: we #3 and sg #3 from round 10's hand-overs viable with R27 C met, we #1 from sweep 14's
  hand-over viable), tree `scratch-g2f` = hand-over tree + variant f, runs in `item2-f/`:

  | colony (hand-over) | variant e (`colony-life/round-15/arm-y1-r15e`, `h14-r15e`) | variant f (`item2-f`) |
  |---|---|---|
  | we #3 (round 10) | viable, C 7.32 / R27 6.31 = 1.16 x | **viable, C 8.04 / 6.23 = 1.29 x** |
  | sg #3 (round 10) | viable, C 14.88 / 6.24 = 2.38 x | **viable, C 12.52 / 6.07 = 2.06 x** |
  | we #1 (sweep 14) | viable, C 28.2 / 6.42 | **viable, C 23.4 / 6.78** |

  One run each (direction 13: a claim per colony from its paired runs; the sweep is the tree's measure).
- Tests: `behaviours/outdoor/appendixE23` green (folder run), `outdoor/removal.verify` green, `retraceResume15`
  case 1 restated to the rule as it is now: the crumbs behind her are KEPT (the farthest crumb lies more than a crumb's
  spacing beyond her — red with variant e's consumption), the resumed retrace still walks home (unchanged assertions).
  D34 restated.
- Side finding: `behaviours/outdoor/review.verify` "a lasting threat on the way" went red in the before-run with
  variant f (forager outside 2101 s > 1800 s, 102 flee runs). Seed sweep of the same scenario
  (`tools/sim/probe/g2-threat.ts`, archived): variant e exceeds the bound on seeds 2 and 6 of 1-6, variant f on seed 5
  (`threat-seeds-e.txt`, `threat-seeds-f.txt`). Both variants show the same flee -> return -> flee loop at a standing
  alarm on the way home (62-159 flee runs); the test's seed is chaotic. Pre-existing defect, not a cost of variant f;
  left red (section 6).

### Item 3 — mound-mask hole probe (NOT BUILT)
Not built. Reason: the must-haves (items 1, 2, 8, 9) and the two defects found under items 4 and 5 took the time; the
probe needs its own A/B on three hand-overs, the four restore / determinism tests and a 36000-tick restore equality
before the close sweep, and a second close sweep if adopted. Round 14's cavity-only probe stays
(`src/sim/nest/moundRelax.ts buildMask`); the known limit and its A/B table stand as written in the colony-life
ledger ("Known limits", item 3). Note for whoever builds it: the base ground of the mask (`m.base` + `groundDeltaAt`)
is already restore-exact; a "substrate without pile overlays" reading at `g - depth` is negative by construction away
from a cavity, so round 12's width came from the cavity / pile terms of the whole field, not from the bare substrate.

### Item 4 — kd #3: larvae starve with protein in store (cause found and fixed, then REVERTED at the close)
- Reproduced from sweep 15's own hand-over (`viab/cache/founded-...-kitchen-door-3-...-325775ec.bin`) on the
  hand-over tree (`probe-kd3-r15e.txt`, probe `g2-nurse.ts`): 7 larvae starved at gd 2.3-2.6 (same as the sweep).
- Trace of one nurse (`probe-kd3-n7296.txt`, probe `g2-nurse1.ts`): the larvae lay in one pile at
  (8067.5, -59.4, 5205.8), **1.3 mm inside the wall** of the 2.5 BU royal chamber (field -1.3). A nurse with a full
  crop asked the walk for the larva; `locomotion/trip.ts resolveTarget` -> `snapToSurface` moved a goal inside a solid
  **straight up until free space**: through 46 mm of soil to the ground at y -13. Every feeding nurse walked out of the
  nest to the ground above the pile, failed, passed, came back, and started over (state `nurse.feed`, chamber -1 or
  nest -1, for hours). Store -> nurse worked; nurse -> larva did not.
- Fix: `src/sim/locomotion/trip.ts` — an item or brood goal that lies in a nest (`nestId >= 0`) and inside the soil
  next to its cavity moves to the nearest carved space along the field gradient (`climbToFree`, at most 16 steps,
  within SNAP_MAX_BU, accepted only below the substrate surface). All other goals keep the old rule (vertical rise).
  Two narrower versions were needed because the first ones broke other tests (recorded so nobody repeats them):
  (1) a general gradient climb broke `locomotion/locoFix3.review` (goal up a stem: the climb planner expects the
  vertical rule); (2) restricting it to carved space still broke `rivals/broodRaid` App. E 20 (raiders' goals). The
  final form is green on both.
- Test: `src/sim/ants/behaviours/nest/buriedLarva.gate2.test.ts` (2 cases): a goal 1 mm inside a chamber's side wall
  snaps to within 1 BU in the chamber (was 52 mm away, on the ground); three larvae 1 mm in the floor of a nursery are
  fed by their nurses with no nurse-tick outside the nest (was 114 nurse-ticks outside, larvae unfed). Both red with
  the `climbToFree` call removed.
- Paired evidence, kd #3 from sweep 15's hand-over to winter (one pair; `item4-base` = hand-over tree + variant f,
  `item4-fix` = + the first version of the fix; the final version acts identically for brood goals):

  | | larvae starved | eclosed | workers at winter | viable | C / R27 need |
  |---|---|---|---|---|---|
  | base | 7 | 0 | 9 | yes | 8.08 / 3.96 |
  | fix | **0** | **7** | **16** | **no** | 4.15 / 6.23 (0.67 x) |

  The fix does what it should (the brood is raised); the bigger colony then needs more winter carbohydrate than it has
  (R27) — the known "colonies that end short of sugar" limit, not a cost of the fix. The sweep judges the archetype.
- No new state: the change is a pure function of the field.
- **Reverted at the close (spec item 8).** The first close sweep (fix in, `sweep/`) had suburban-garden 1 of 3 and 12 of
  15 viable. Switch-off runs from that sweep's own hand-overs (`off-item2/`, `off-item4/`, base `off-base/`):

  | colony | close sweep (items 2 + 4) | item 2 off (variant e) | item 4 off |
  |---|---|---|---|
  | sg #2 | NOT viable, C 5.23 / 5.38 (0.97 x), 19 workers | NOT viable, 4.71 / 4.80 (0.98 x) | **viable**, 7.91 / 4.41 (1.79 x) |
  | sg #3 | NOT viable, C 4.72 / 6.40 (0.74 x), 16 workers | NOT viable, 6.14 / 6.79 (0.90 x) | **viable**, 5.09 / 4.81 (1.06 x) |

  Item 4 costs both (more brood raised, a larger winter need than the carbohydrate the colony gathers); item 2 does
  not. `trip.ts` is back at the hand-over version (the fix is kept in `test-output/gate-sim-2/trip.ts.item4-reverted`),
  `buriedLarva.gate2.test.ts` is `describe.skip` with the reason in its header (both cases red on the reverted code:
  the defect stands), and the second close sweep (`sweep2/`) runs on the reverted tree. The defect is listed first
  in section 6: it is real, and it is the integrator's call whether the winter-carbohydrate limit is ruled first.

### Item 5 — sg #2: "digging with no open plan" (NO DEFECT; one candidate found, not fixed)
- Reproduced sweep 15's run from its own hand-over on the hand-over tree (`probe-sg2-dig-r15e.txt`, probe
  `g2-dig.ts`; same plan ids and days as the sweep's table).
- What the diggers dig: **an open architect plan existed the whole time**: tunnel plan 6490 (need `missing-type`,
  61.75 BU^3) created at gd 0.06, dug slowly (1-2 diggers, often `stalled: no-diggers`) until it completed at gd 7.2;
  then chamber plan 10923 (68.5 BU^3, created gd 7.4). Pellets of days 4-11 are `dig.bite` on those plans. The sweep's
  "plans +/done" column counts plans **created / completed that day**, which read as "no open plan". Dig demand = the
  plans' slots (2, then 8), target 1-4: the allocation rule as built.
- The carbohydrate collapse (C 8.5 -> 3.8 between gd 2.0 and 2.75) coincides with the hatching larvae: at 25 C a larva
  eats 0.909 C/gd (section 1, workedExample), five larvae 4.5 C/gd; tend target 0-1 then (R39). Rule behaviour; a
  change would be a new allocation rule (not in scope).
- **Candidate defect seen, not fixed (time; needs its own trace):** from gd 9.5 three of the four diggers stand in
  `dig.stow` holding a pellet for 0.3-1.5 gd (ages up to 1840 ticks at unchanged positions, two outside on the pile),
  so the chamber plan gets no pellets for 1.25 gd while the colony's carbohydrate runs out. Mechanism suspected:
  `carryTo('mound')` fails -> `recover` (put-down) -> `dig.claim` -> `dig.stow` again with the pellet still held
  (a loop like round 15's deliver livelock). Listed in section 6.



## 3. R13 / R14 from sweep 15's data (item 6)

From sweep 15's JSONs (`colony-life/round-15/sweep/life-*.json`; script inline in this report's history, output
`r13r14-from-sweep15.md`). The JSONs hold one row per game day: entrances open at the day-0 row (the hand-over tick)
and at the day-1 row, brood deaths by cause and adult deaths by cause; they hold **no** chamber flooded share and no
site flood rating, so R13's "peak flooded share on a flood-safe site" cannot be read from them, and R14's 4-hour bound
can only be bounded by a day.

| run | hand-over gd | entrances open at day row 0 / 1 | brood lost to flooding | adults drowned | queen |
|---|---|---|---|---|---|
| car-park-verge-1 | 3.691 | 0 / 1 | 6 | 0 | alive |
| car-park-verge-2 | 4.788 | 0 / 1 | 0 | 0 | alive |
| car-park-verge-3 | 4.171 | 0 / 1 | 0 | 0 | alive |
| kitchen-door-1 | 3.582 | 0 / 1 | 1 | 1 | alive |
| kitchen-door-2 | 4.931 | 0 / 1 | 2 | 0 | alive |
| kitchen-door-3 | 4.404 | 0 / 1 | 10 | 0 | alive |
| playground-park-1 | 4.181 | 0 / 1 | 0 | 0 | alive |
| playground-park-2 | 4.791 | 0 / 1 | 0 | 0 | alive |
| playground-park-3 | 3.923 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-1 | 4.184 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-2 | 4.868 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-3 | 4.417 | 0 / 1 | 1 | 0 | alive |
| woodland-edge-1 | 3.625 | 0 / 1 | 0 | 0 | alive |
| woodland-edge-2 | 4.929 | 0 / 1 | 0 | 0 | alive |
| woodland-edge-3 | 4.408 | 0 / 1 | 0 | 0 | alive |

- **R14 (entrance open within 4 game hours of the hand-over):** all 15 hand over with no open entrance (day-0 row 0)
  and have one open by the day-1 row (and departures on day 1): open within 24 game hours in 15 of 15. The 4-hour
  bound is not measurable from the JSON. A probe that restores each hand-over and ticks to the first open entrance
  (`tools/sim/probe/g2-r14.ts`, archived) gives the hours, run on the final tree over the 15 sweep hand-overs
  (`test-output/viab/cache/founded-lasius-niger-<arch>-<seed>-naturalist-d-325775ec.bin`, one process at a time;
  output `test-output/gate-sim-2/r14-probe.txt`): every hand-over starts with its entrance `reopening`, and the
  entrance is open after 0.88-3.82 game h (median 1.38; we #1 3.06, we #3 3.82, cpv #1 3.15, pp #2 3.13, kd #3 3.53,
  the other ten 0.88-1.75). **R14 holds in 15 of 15** (all within 4 game hours; the slowest, we #3, has 0.18 h to
  spare). The same probe reads the site's raw flood risk at the nest origin (`assessSite`): 0.000-0.059, the highest
  at we #2 0.055 and we #3 0.059.
- **R13 (no flood-safe site reaches 25 % flooded in the brood / royal chamber from ordinary showers):** not readable
  (no flooded share in the JSON). Losses to water: brood lost to flooding in 5 of 15 runs (cpv #1 6, kd #3 10, kd #2 2,
  kd #1 1, sg #3 1), one adult drowned (kd #1), no queen lost. kd #3 is the flood-prone nest named in the colony-life
  limits. Neither ruling is traced further (the spec allows tracing only if items 1-5 left time; they did not).


## 4. Leftover seams (item 7)

- **Antlion pit height overlay:** not done. `src/sim/ecology/creatures/antlion.ts createPit` only pushes a hazard
  record; walkers walk flat over the pit (the renderer draws the cone). Registering the profile with
  `kernel.setHeightOverlay` also needs the overlay rebuilt on restore from the hazard list and removed when the pit
  goes; that is a state / restore change with its own determinism test, not a small seam. Owner: creatures.
- **Creatures parked at the map edge:** not examined (time). Owner: creatures.
- **`lay-egg` returning `budget` outside the opening's lay phase:** checked, working as built: `ants/actions/defs/care.ts`
  refuses with `budget` whenever `colony.canLay` says no and the queen is not protein-short — the colony's egg budget
  (GDD 02 §3.2). After a cheat-completed founding the budget is refilled by the laying system on its own cadence; the
  refusal is the rule, not a defect. Whether the cheat should prime the budget is the app / cheat side's call.
- **Stagger offsets of the species modules' periodic systems:** pairs that fire on the same ticks (offset 0, periods
  multiples of each other): granary `economy` (25) with `castes` (10), `patrol-gate` (10), `trunk-trail` (20),
  `winter` (50), `middens` (100), `display` (100), `seed-sources` (250), `diagnostics` (250); fungus `garden` (25)
  with `castes` (50), `phorid-deaths` (50), `display` (100), `leaf-sites` (250), `diagnostics` (250); every one of
  them also with the environment's fast step (25, offset 0) and the overwinter / succession checks (5, offset 0).
  Wood's systems already have distinct offsets. **Tried and reverted:** distinct offsets 1-8 within each module.
  Lasius hash unchanged (sg #2 of sweep 15, 18000 ticks: beb35045 / 11e07a85 / 74d18776 with and without,
  `probe-hash-g24.txt`, `probe-hash-g24o.txt`), but `species/modules/fungus/scenario` ("cutters but no processor ->
  the chain names processing") went red (its diagnostics cadence moved) and `granary/rhythm` failed differently, so
  the change was reverted; the list above is the hand-over. Owner: species modules (harvester, leafcutter).


## 5. DEVIATIONS rows written

- **D34** restated (variant f: nearest-crumb start, crumbs behind kept; the variant-f adoption numbers).
- **D36** new: Camponotus digs only wood and insulation (GDD 07 §5.2.6 over GDD 03 §2.1's soil column);
  `services.test` restated to the constant.
- **R43** extended (old -> new numbers of the tests restated here): GDD 02 §15 worked example (larval 0.80 C / 2.40 P
  -> 0.909 / 1.819 per larva and gd; need C 10.71 -> 11.27, P 12.90 -> 9.90; stock change C +1.39 -> +0.83,
  P +0.05 -> +3.05); `handoverStomach.verify` case 1 restated to R2's intent; GDD 07 larval costs
  (`species/derive.test`: CP major 2.33 -> 1.55 P, CP gyne 10.1 -> 6.7 P, MB major 3.0 -> 2.0 P, AT major 6.7 ->
  5.0 FL; `speciesData.verify`: AT gyne by the mass rule 42 -> 31.5 FL).
- Not deviations (defects fixed at their cause, the GDD's rule unchanged): the winter path read on
  the default year (`queen.ts winterPathRamp`), the runner's failure code (`whoWithinSpecies`).


## 6. Still wrong (most serious first)

1. **Larvae next to a chamber wall cannot be fed (item 4's defect, fix reverted).** A brood or item goal lying a
   little inside the soil is lifted straight up to the ground by `locomotion/trip.ts snapToSurface`; nurses walk out
   of the nest and back. kd #3 of sweep 15 raised 0 of 29 eggs this way. The fix (`trip.ts.item4-reverted`, test
   `buriedLarva.gate2`) raises the brood, and then small colonies end short of winter carbohydrate (sg #3: viable
   1.06 x without it, 0.74 x with it). Needs a ruling: fix it and accept, or rule the winter-carbohydrate limit first.
2. **Colonies that end short of winter carbohydrate (R27)** — the colony-life limit, unchanged: three of the first close
   sweep's misses were 0.97 x, 0.98 x and 0.74 x of the need; needC does not carry the winter need (R41, withdrawn).
3. **sg #2 save -> load continuation differs** from the in-process run on the same tree (first close sweep's tree:
   in-process final hash cf83827c, NOT viable; restored from the same hand-over fddce888, viable). sg #3 restores
   exactly. A restore-equality gap like round 14's; not traced; it makes every paired claim on sg #2 that compares a
   restored run with an in-process one unsafe.
4. **Foragers loop between a standing alarm and the way home** (`behaviours/outdoor/review.verify` "lasting threat"):
   62-159 flee runs per forager, over the trip bound on 1-2 of 6 seeds with either retrace variant.
5. **Diggers holding a pellet in `dig.stow` for up to 1.5 gd** (sg #2 of sweep 15, gd 9.5-11, three of four diggers;
   the plan got no pellets for 1.25 gd while the colony's carbohydrate ran out). Suspected stow -> fail -> claim ->
   stow loop; not traced (item 5).
6. **Growth bars** R19 (P intake, first workers >= 9, no-lost), R34 — see the sweep tables; not chased (spec).
7. **Tier 1 food rules are unreachable** (`ECOLOGY_TIER` constant 2): 12 red tests in `ecology/sources` test code the
   game cannot run. Retire them or add a per-game tier switch.
8. **Escape dig of a closed nest** takes 3.5 h or more in the test nest (`nest/escapeDig`), against 2.5 h in its test
   and 4 h in R14; R13 / R14 are still not built as checked rules, and the sweep JSONs cannot show either (no
   flooded share, day resolution only).
9. **Flood readers rebuild the spill model per carve** (`nest/flood/readersCost.verify`, by design for save / load
   equality; 0.04 ms/tick measured in colony-life).
10. **Worldgen reds not traced here:** `place/outdoor` (floating leaves, climb routes stuck, impassable / useless
    micro-connections, a fence side without a gap), `place/interior` App. E 4 (TypeError), `pipeline` (3 attempts
    where 1-2 were enough; forced-failure regeneration 4 attempts instead of 2), `maps.verify` E5 order, layering of
    `populate.verify.test` / `testing/walker.ts`.
11. **Messor / Atta module reds** red on the hand-over tree too: `fungus/loop` (no staphylae collected),
    `granary/rhythm` (foragers leave at midday), `granary/scenario` (granary without care sprouts 40 % < 50 %).
12. **Layering:** four sim test files import `@/game` / `@/content` (they belong under `tests/`).
13. **Mound-mask hole probe** (item 3) not built; round 14's cavity-only probe stays (trip success / kd #3 flooding
    limit of colony-life).
14. **Antlion pits have no height overlay** (walkers cross them flat); **creatures parked at the map edge** not
    examined; the species modules' periodic systems still share offset 0 (pairs in section 4).
15. **Timing tests under load:** `nest/architect/layout` (70-77 ms > 50) and `locomotion/perf` (6.0 > 5 ms) fail at
    load 6-7, below the guard's skip threshold (2 per core = 8): numbers to recheck on an idle machine with
    `FOUNDRESS_PERF_STRICT=1`.


## 7. Contract changes (additive)

None in `src/sim/types/**` or `src/core/**`. Additive within owned module APIs: `ActionDef.whoWithinSpecies?`
(`src/sim/ants/actions/types.ts`), `winterPathRamp(doy28)` (new export, `src/sim/colony/queen.ts`). No new persisted state.


## 8. Evidence paths

All under `test-output/gate-sim-2/` unless noted.
- Runner scripts: `freeze.sh`, `run.sh` (modes winter / h14 / h15 / f15 / g2 / y2), `jobs.sh`, `folders.sh`
  (folder-by-folder vitest), `close2.sh`, `bisect.sh` (one test file on a `git archive` of a commit), `sums.py`.
- Tests: `vt-before/`, `vt-after/`, `vt-final/` (per folder `.txt` + vitest `.json`, `summary.txt`). Failing-test
  lister (scratch): `python3 - DIR` over the JSONs, listing `assertionResults` with status `failed`.
- Item 2: `item2-f/` (we #3, sg #3 from round-10 hand-overs; we #1 from sweep 14's), compare
  `colony-life/round-15/arm-y1-r15e`, `h14-r15e`; `threat-seeds-e.txt`, `threat-seeds-f.txt`.
- Item 4: `probe-kd3-r15e.txt`, `probe-kd3-n7296.txt`, `item4-base/`, `item4-fix/`, `trip.ts.item4-reverted`;
  switch-off: `off-item2/`, `off-item4/`, `off-base/`.
- Item 5: `probe-sg2-dig-r15e.txt` (and a partial run on the item-4 tree, `probe-sg2-dig-g24-partial.txt`).
- Item 7: `probe-hash-g24.txt`, `probe-hash-g24o.txt`.
- Item 6: `r13r14-from-sweep15.md`, `r14-probe.txt`.
- Sweeps: `sweep/` (first close sweep), `sweep2/` (close sweep), `sweep-long/` (long runs), tables
  `sweep-table.md`, `sweep2-table.md`, `sweep-long-table.md`, `sums.txt`.
- Probes used (removed from `tools/sim/probe/`, archived in `probes/*.ts.txt`): g2-nurse, g2-nurse1, g2-dig,
  g2-stall, g2-threat, g2-hash, g2-larva, g2-r14.
- Scratch trees deleted at the end (`/home/user/scratch-g2f`, `scratch-g2-4`, `scratch-g2-no2`, `scratch-g2-no4`,
  `frozen-gate2`, `frozen-gate2b`; probes copied into `/home/user/scratch-r15e/tools/sim/probe` removed again).
- For a reviewer putting files back: the production changes of this task are `src/sim/locomotion/crumbs.ts`
  (-> `retraceResume15` case 1 red, `appendixE23` red with the consumption lines restored), `src/sim/colony/queen.ts`
  + `src/sim/balance/colony.ts` (-> `colony/winterPathSeason` and `time.test` red), `src/sim/ants/actions/runner.ts` +
  `types.ts` + granary / fungus `actions.ts` (-> `runner.test` "failure codes" red),
  `src/sim/species/modules/granary/rhythm.ts` (-> `testing/layering` DOM case red),
  `src/worldgen/populate/economy.ts` (-> one more entry in `worldgen/layering`).

