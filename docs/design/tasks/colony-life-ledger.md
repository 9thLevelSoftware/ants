# colony-life — ledger

Running record of the colony-life rounds (spec `colony-life.md`). Each round appends a section; read the earlier
ones before changing anything they record.

Baseline sweep: `test-output/econ-growth-review/sweep9-table.md` (sweep 9, flooding on): viable 7 of 15, 11 of 15
with no eclosion after the hand-over, median trip success 17 %, median intake/need P 0.14, C 0.87.

## Round 1

Engineer: round 1 (restarted once: an earlier engineer of this round was cut off by the 01:24 container restart;
its funnel tool `tools/sim/lifeFunnel.ts`, two "before" runs and an unfinished queen-care fix were in the
snapshot `8627b1d`). Evidence: `test-output/colony-life/round-1/`.

Method notes
- Before/after pairs start from the **same hand-over snapshot** (the cut-off engineer's `5b682f5d` hand-overs,
  copied to `test-output/colony-life/round-1/cache/*-any.bin`, run with `--cache-any`), so a difference is the
  colony-life code, not a different founding. Other engineers edit `src/sim` too, so a fresh founding would change
  with every edit of theirs.

Status: **round 1 complete** (02:20 UTC). Engineers: three (cut off by the 01:24 and 01:53 restarts; the third
finished the round: verification, tried-and-reverted, deviations, next). Tree = snapshot `9ccb488` plus this ledger.

### Funnel of the studied runs (before = HEAD 0098d97 without the cut-off engineer's queen-care change; `round-1/before/`)

| | woodland-edge #1 | kitchen-door #3 |
|---|---|---|
| hand-over | 3.53 gd, 16 workers | 4.56 gd, 7 workers (seed 3) |
| workers at winter / viable | 13 / no (stores 0.67 gd) | 5 / no (workers) |
| worker time | nest.work 42 %, wait 24 %, travel 17 %, idle 10 %, search 3 %, handling 0.5 % | nest.work 59 %, wait 16 %, travel 13 % |
| task time (worker-gd) | forage 35.8, haul 22.3, queen-care 17.7, tend 15.1, nurse 14.6, scout 13.9 | queen-care 13.3, forage 7.7, scout 7.4, store 7.2, haul 6.5 |
| trips (counted) / success | 70 / 26 % (scout not reached 29, tend not reached 13) | 17 / 24 % |
| trips per day | 4, 7, 2, 6, then **0** from day 5 to winter | 0 |
| deliveries C / P | 5.5 / 1.6 loads (nectar, honeydew, carrion) | 1.2 / 0.07 |
| eggs laid after hand-over | 10 | 10 |
| brood losses | pupa:untended 4, pupa:hygiene 3, egg:untended 1, larva:hygiene 1 (7 of 7 pupae lost) | egg:untended 7, egg:hygiene 3 (10 of 10) |
| eclosed after hand-over | 0 | 0 |
| waste items hauled to the midden | **0** | **0** |
| deaths | old-age 3 | old-age 1, lost 1 |

Probes (`round-1/probe/`, tools deleted after use): `brood-*.txt` brood per chamber, untended age, waste per
chamber, nursery jobs every 0.1 gd; `haul-we1.txt` every waste item with the haul rule's inputs; `entrance-*.txt`
entrance status and plug count.

### Causes found (measured)

1. **Entrance stuck `sealing` (woodland-edge #1).** At 5.59 gd (2.06 gd after the hand-over) the plug count in the
   throat jumped 8 -> 13 (the 8 are founding remnants; a mound pile raised the ground over ghost plug samples) and
   the entrance went `open -> sealing`. The way back was `plug === 0`; the count fell to 7, never to 0, so the
   entrance stayed `sealing` to winter. `sealing` seeds no exit field and gives no midden: trips 0 from day 5,
   colony shut in for 3.4 of its 6.0 gd of colony life, C stores 4.1 -> 0.26 (not viable), no waste or soil hauled.
2. **Waste is never hauled** (both runs: 0 `waste-dumped` events). (a) entrance not `open` -> no midden point
   (cause 1); (b) every waste item is spawned with the default bulk 1.0 and the first workers (nanitics) have
   carryCap 0.75, so `findHaulJob` skips every item; (c) spoiled food is spawned at the food chamber's centre, 0.8
   BU above the floor (`onSurface` false). Brood-corpses and meconium pile up in the brood chambers (5-6 per
   chamber in woodland-edge #1) -> hygiene hazard 0.1 per item over 3 -> 7 of 20 brood lost to hygiene.
3. **Brood care**: (a) queen-carers picked the eggs up and put them down in a founding cell too small to put them
   out of the queen's reach, ~500 times a gd, eggs died untended (kitchen-door #3, 7 of 10; the cut-off engineer's
   diagnosis, fix in the tree, its test red); (b) brood lying outside any chamber (put at a dry spot by a flood
   evacuation) with no dry chamber to return to gets **no job at all**: no tend, no feed (kitchen-door #3 after
   (a): 3 eggs untended at 7.66-7.76 gd; woodland-edge #1: 6 larvae starved during a night evacuation).

### Ranking by measured loss (the two runs)

1. Entrance stuck `sealing` — woodland-edge #1: foraging 0 for 3.4 of 6.0 gd after the hand-over; C stores to
   0.26 (the run's only failed viability check); waste and soil hauling stopped with it. 1 run of 2 (not seen in
   kitchen-door #3, whose entrance stayed `open`); how often across the sweep is not known: the sweep logs do not
   record entrance status (sweep 9: trips fall to 0 in the last days of most runs, which this would explain only
   in part: weather and season also stop foraging).
2. Waste never hauled — both runs: 0 of ~25 waste items removed; 7 of 20 brood lost to hygiene (35 %), and the
   waste lowers the chamber's brood-sorting score.
3. Stranded brood without a job — kitchen-door #3: 3 eggs untended (after the queen-care loop was taken out);
   woodland-edge #1 (one probe run): 6 larvae starved after a night evacuation. Smaller and weather-dependent.
4. Not fixed this round (measured, smaller or not yet understood): queen-care loop of egg collection (see "tried
   and reverted"); only 10 eggs laid after the hand-over in each run (queen laying potential > 0.5 egg/gd only 29 % /
   14 % of the time; "winter reserve short" 56 % of the time on woodland-edge #1); 2 of 6-7 workers in
   `queen-care.feed` most of the time on kitchen-door #3 (13.3 of ~50 worker-gd); scouts' trips that find nothing
   count as failed trips (29 of 70 on woodland-edge #1); the funnel's trip reasons all read `unlogged`.

### Fixes (round 1)

F1. **`sealing` -> `open` when the added plug is gone** (cause 1). `src/sim/nest/entrances.ts` `evaluateEntrance`:
    on `open -> sealing` the remnant count is kept in the new additive field `Entrance.plugBaseline`
    (`src/sim/types/nest.ts`); `sealing -> open` when the count is back to it (was: `plug === 0`). GDD 03 §4.2 reads
    "plug removed -> open"; remnants were already tolerated on the `open` side. Test: `src/sim/nest/plugsReopen.test.ts`
    "a `sealing` entrance with founding remnants" (4 remnants, 2 added, both removed -> `open`; red with the old rule).
F2. **Waste items get a bulk** (cause 2b, 2c). `WASTE_BULK` in `src/sim/balance/colony.ts` (meconium 0.05, cocoon
    0.05, spoiled food 0.3, brood corpse egg 0.02 / larva 0.3 / pupa 0.4: GDD 05 bulk = mass / 2 mg); used by
    `spawnWaste` (`src/sim/colony/brood.ts`) and `spawnSpoiledItem` (`src/sim/colony/stores.ts`), which also puts
    the spoiled item on the chamber floor instead of at its centre. Test:
    `src/sim/ants/behaviours/nest/wasteHaul.test.ts` (a nanitic hauler, carryCap 0.746, takes a dead pupa to the
    midden within 0.15 gd; red without the bulk). Note: the old `haulStore.test` fixture gave its waste bulk 0.5 by
    hand, which is why no test saw this.
F3. **Stranded brood is cared for where it lies** (cause 3b). `src/sim/ants/behaviours/nest/board.ts` `jobFor`:
    brood outside every chamber with no (dry) chamber to go back to gets a feed job (hungry larva) or a tend job
    (egg/pupa due), via the new `careJob` shared with the in-chamber path (was: no job). Test:
    `src/sim/ants/behaviours/nest/boardStranded.test.ts` (red with the old board).

### Before / after (same hand-over snapshots; `round-1/before/` vs `round-1/after1/`; F1+F2+F3, queen-care change taken out)

| | woodland-edge #1 before | after | kitchen-door #3 before | after |
|---|---|---|---|---|
| workers hand-over -> winter | 16 -> 13 | 16 -> 10 | 7 -> 5 | 7 -> 6 |
| viable | no (stores) | no (workers) | no (workers) | **yes** |
| stores at winter C / P (gd of adult C) | 0.26 / 0 (0.67) | **3.53 / 0.79 (10.7)** | 5.50 / 0.61 (40.7) | 5.20 / 0.69 (29.1) |
| deliveries days 5-9 | 1, 1, 1, 1, 0 | 0, 2, 5, 6, 2 | - | - |
| trips / success | 70 / 26 % | 83 / 27 % | 17 / 24 % | 12 / 17 % |
| intake / need C, P | 0.72, 0.10 | **1.02**, 0.14 | 0.47, 0.10 | 0.14, 0 |
| brood losses | pupa:untended 4, pupa:hygiene 3, egg:untended 1, larva:hygiene 1 | pupa:untended 4, larva:base 1, larva:starvation 1, egg:untended 1; **hygiene 0** | egg:untended 7, egg:hygiene 3 | egg:flooding 5, egg:untended 4, egg:base 1; **hygiene 0** |
| eclosed after hand-over | 0 | 0 (2 pupae alive at winter) | 0 | 0 |
| deaths | old-age 3 | old-age 4, crushed 2 | old-age 1, lost 1 | old-age 1 |

Reading: F1 removed woodland-edge #1's failure cause (stores 0.67 -> 10.7 gd; C intake/need 0.72 -> 1.02); its new
failure is 6 worker deaths (2 crushed, 4 of old age (R11); the runs diverge after day 2, so the crushing is not attributed to the fixes) with
no eclosion. F2 removed every hygiene loss in both runs. Kitchen-door #3 turns viable, but still raises nothing:
its eggs now die of flooding (night rain in the one founding chamber) and untended. **Neither run ecloses a
worker**: the growth bar is not moved by this round.

Check (third engineer): `entrances.ts` was last written at 01:53, after the `after1` runs (01:48), so both runs were
repeated on the tree as it stands (`round-1/after1-check/`): final state hashes equal to `after1` (woodland-edge #1
`ef574626`, kitchen-door #3 `165e6e93`). The table above is the tree's.

### Verification (02:10-02:20 UTC)

- `npm run typecheck`: clean.
- Folder tests (outputs in `round-1/probe/vitest-*.txt`):
  - `src/sim/nest`: 52 files pass, 1 red: `escapeDig` (reopenTick trigger: never opens in 6 h). `plugsReopen` green.
  - `src/sim/ants/behaviours/nest`: 25 pass, 2 red: `sfaReview.verify` (move-brood marker save/load, board built one
    period early: 11 vs 12), `stall.soak` short window (22 % of in-nest ant-ticks at "moving, speed 0", target < 1 %).
    `wasteHaul`, `boardStranded` green.
  - `src/sim/colony`: 50 pass, 1 red: `founding/reopen.test.ts` (2 plug-soil voxels left in the throat).
  - `src/sim/balance`, `src/sim/types`: 1 red: `ids.test` (ALERT_KINDS 38, test expects 37).
- Every red test is red with the same numbers at the round's start commit `e299de5` and in a scratch copy of HEAD
  with F1-F3 taken out: none comes from this round. `escapeDig`, `sfaReview.verify` and `stall.soak` are on
  `gate-close-sim.md`'s known-red list; `reopen.test` is a lead in the spec. Not fixed here (integrator: no new
  causes in round 1); see "Next".

### Tried and reverted

- **Queen-care egg collection only when the drop point is out of the queen's reach** (cause 3a; first engineer,
  snapshot `8627b1d`: `queenCare.ts` `eggDropPoint` / `eggNearQueen`, test `eggCollect.test.ts`). A carer would
  collect an egg only if the egg pile it would carry it to lies beyond `EGG_COLLECT_BU` of the queen; otherwise the
  egg stays where she laid it. The second engineer took it out before the `after1` runs, with its red test.
  Re-measured by the third engineer in a scratch tree (the test: 0.5 gd, 2 carers, founding-size chamber): pick-ups
  11 for 5 eggs without the change, 6 for 4 eggs with it; the test's bound (pick-ups <= eggs) is red either way, the
  roomy-chamber case green either way. Reverted because it halves the pick-ups but does not stop them, the test does
  not reproduce the run's rate (~500 a gd), so the mechanism is not understood yet. The second engineer's extended
  test (nurses, untended count) is kept at `round-1/probe/eggCollect.test.ts.wip.txt`. Note for whoever takes this
  up: `eggNearQueen` uses `Math.hypot` (not allowed in sim code); the reverted change had replaced it.

### GDD deviations

None. `WASTE_BULK` is new (waste items had the item default 1.0); its values follow GDD 05 §1 (bulk = item mass /
2 mg; the dead aphid of the same chapter, 1 mg, is bulk 0.5). F1 implements GDD 03 §4.2 "plug removed -> open" as
written. No ruling, lifespan, need or hand-over provision changed.

### Next (for round 2; the independent sweep comes first)

1. **No worker ecloses after the hand-over** in either run (the growth bar). woodland-edge #1 after F1-F3: 4 pupae
   die `pupa:untended` while nurses spend the pupa's untended gap (0.6-0.8 gd) in `nurse.carry` / `nurse.load` next
   to it (`probe/tend-we1-after1.txt`: ~200 samples `nurse.carry(near)`, claims `nurse/nurse.carry`): pupae are
   carried between two chambers and not tended. Start there.
2. **kitchen-door #3 forages nothing**: 0 counted trips on every day of colony life, before and after (day rows);
   intake/need C 0.14 after; it lives on the hand-over stores. 7 first workers in one founding chamber (the seed-3
   lead), 2 of them in `queen-care.feed` most of the time. Its eggs die of flooding (5, night rain in the one
   chamber), untended (4) and in the queen-care egg loop (above).
3. **Laying**: 10 eggs after the hand-over in each run; laying potential > 0.5 egg/gd only 29 % / 14 % of the time;
   "winter reserve short" 56 % of the time on woodland-edge #1 (funnel).
4. **In-nest locomotion**: `stall.soak` 22 % of in-nest ant-ticks moving at speed 0 (red since before this round);
   kitchen-door #3 has `walker-stuck-explosion` invariant violations before and after (11 of 11 moving walkers
   without progress > 1200 ticks). Locomotion is this task's; it may be a large part of the 42-59 % "nest.work" time.
5. **Founding reopen** leaves plug soil in the throat (`reopen.test`: 2 voxels): F1 tolerates remnants, but they are
   what let the entrance flip to `sealing`. `escapeDig`: the founding escape plan never opens with the founding
   system on.
6. **Funnel counters**: trip reasons all read `unlogged`; scout trips that find nothing count as failed (29 of 70 on
   woodland-edge #1). Fix before reading trip success off the funnel.
7. woodland-edge #1 after F1: 2 workers crushed (runs diverge after day 2; not attributed to F1-F3).

### Independent sweep after round 1

Independent engineer, 02:19-03:42 UTC Nov 17. Table: `test-output/colony-life/round-1/sweep-table.md` (made by
`python3 tools/sim/sweep-table.py test-output/colony-life/round-1/sweep test-output/econ-growth-review/sweep9`;
runs by `tools/sim/sweep-life.sh`; logs and `summary.txt` in `round-1/sweep/`). Tree = snapshot `9ccb488` (F1-F3);
during the sweep only other engineers' Messor files (`species-harvester.ts`, `species/modules/granary/*`) and this
review's two test files changed. Fresh founding on every run (no code-tagged hand-over existed); woodland-edge #1
ends with state hash `ef574626`, the round's `after1` hash, so the round's cached hand-overs equal a fresh founding.
**This table (`round-1/sweep-table.md`) is the one the next round compares with.**

**Viability bar: NOT met** — viable 9 of 15 (sweep 9: 7). woodland-edge 2/3, suburban-garden **1/3**,
playground-park **1/3**, car-park-verge 2/3, kitchen-door 3/3.

**Growth bar R19: NOT met** (3 of 7 checks):

| check | value | sweep 9 |
|---|---|---|
| workers at winter >= first workers, >= 10 of 15 | **5 of 15** | 3 |
| median eclosions after hand-over >= 4 | **0** (10 of 15 runs: none) | 0 |
| median intake/need P >= 0.7 | **0.094** | 0.141 |
| median intake/need C >= 0.9 | 1.258 ok | 0.873 |
| median trip success >= 50 % | **18.2 %** | 16.7 % |
| first workers >= 9, >= 13 of 15 | 13 of 15 ok | 13 |
| no `worker:lost`, >= 13 of 15 | 14 of 15 ok | 10 |

Regressions against sweep 9 (12 runs flagged by the script; the main ones):
- **suburban-garden #2 and playground-park #2: viable -> NOT viable** while growing (16 -> 17 and 16 -> 22 workers,
  7 eclosions each): failed check "starvation stage" (worse than lean for 2.20 / 2.05 gd, limit 2): protein. Both
  spend the hand-over P on the first brood and sit at P 0 from day 3-4 to winter (rationing, brood sacrifice).
- **playground-park #3**: intake C 0.98 -> 0.06, P 0.47 -> 0.03, trip success 17 -> 0 %, C stores 0 at winter,
  larvae starved 0 -> 4. 21 trips, all scouts, all `timeout`/`curfew not-reached`; every source within 300 BU
  (nectar C 6, crumb C 4.2) unknown to the colony at the end.
- **suburban-garden #3**: intake P 0.73 -> 0, trip success 10 -> 0 % (11 scout trips, none reached anything).
- intake P down by more than 0.05 in 8 runs (kitchen-door #1 0.27 -> 0.07, car-park-verge #1 0.17 -> 0.08 and larvae starved 3 -> 6,
  playground-park #1 0.12 -> 0.05). woodland-edge #1 net workers -1 -> -6 (2 crushed, 4 old age).
- Gains: woodland-edge #3, suburban-garden #1, kitchen-door #1 and #3 not viable -> viable; C intake/need up in 11
  runs (deliveries from day 1 now; sweep 9 had none before day 3); `worker:lost` 5 runs -> 1; runs with a day ending
  with no `open` entrance 5 -> 2 (sweep 9: playground-park #3 7 days, car-park-verge #3 8 days; now 1 day each in
  woodland-edge #2 and car-park-verge #3).
- A/B for the P drop (`round-1/sweep-ab/`: working tree minus F1-F3, same hand-overs): kitchen-door #1 P 0.113
  (without) vs 0.065 (with), not viable (9 workers) vs viable (12); car-park-verge #1 P 0.315 vs 0.078, larvae
  starved 6 vs 6. P is lower with the fixes in both pairs, but two diverging runs do not attribute it; the sweep-9
  -> now drop on kitchen-door #1 (0.27 -> 0.11) is mostly there without F1-F3 (tree changes since sweep 9). Not
  called a regression of this round; flagged for measurement (lead 2).

Review of the round (code: `git diff e299de5 HEAD` on `nest/entrances.ts`, `types/nest.ts`, `balance/colony.ts`,
`colony/brood.ts`, `colony/stores.ts`, `ants/behaviours/nest/board.ts`, `tools/sim/life.ts`, `lifeFunnel.ts`):
- Verified: typecheck clean (02:22). Folder tests (outputs `round-1/sweep-review/vitest-*.txt`): `ants/behaviours/nest`
  25 pass, red `sfaReview.verify`, `stall.soak`; `nest` 52 pass, red `escapeDig` + this review's
  `plugBaseline.verify`; `colony` 51 pass, red `founding/reopen.test`; `balance`+`types` red `ids.test` (38 vs 37).
  Same red set as the round reported. The round's tests fail on the round-start tree `e299de5` (scratch copy):
  `plugsReopen` F1 case, `boardStranded`, `wasteHaul` (also with the bulk asserts stubbed: corpse never dumped) — they
  test the fixes. The `before`/`after1`/`after1-check` hashes are as claimed. No lifespan, need, provision, bar or
  ruling test changed; no seed/archetype special case; `plugBaseline` is persisted; no wall clock; no `Math.hypot`
  added; per-tick cost unchanged in kind (F3 adds a care check per lying brood item per board build).
- **F1 (finding, major): the trigger is not fixed.** `src/sim/nest/plugBaseline.verify.test.ts` (new, RED, kept): a
  2 BU spoil ring over 5 ghost plug flags around a passable `open` entrance raises `plugCount` 0 -> 5 with no plug
  added, and the entrance goes `sealing` (no exit field: GDD 03 §4.2 says `open -> sealing` on "first plug added").
  This is the round's measured trigger on woodland-edge #1. F1 only changes the way back (`sealing -> open` at the
  remnant baseline), which needs workers to dig the count back down (founding/reopen.ts remnant plans); until then
  the colony is shut in. The sweep shows it rarely now (2 runs, 1 day each), so the cost is small, but the cause is
  in `plugCount` / `evaluateEntrance` (pile soil over PLUG flags counted as plug).
- F2: sound. New `src/sim/ants/behaviours/nest/spoiledHaul.verify.test.ts` (green): spoiled food from `spoil()` lies in
  reach and a nanitic takes it to the midden within 0.3 gd; on `e299de5` the same item is out of reach (`onSurface`
  false) and never hauled. Sweep: hygiene losses 2 in 166 eggs' worth of brood (pupa 1, larva 1).
- F3: sound; same rescue path as before, care job only with no (dry) chamber to return to; no finding.
- Minor (tool): `tools/sim/lifeFunnel.ts` `FoundingObserver` never stops listening, so `foundingFunnel` and the md line
  "Founding funnel" include colony-life losses (woodland-edge #1: "adult deaths worker:crushed 2, old-age 4" all
  happened after the hand-over).
- Minor (tool): the day rows' "trips" (`forager-departed`) read 0 on most days while 10-145 trips end per run: most
  trips start outside the activation path; and the funnel's trip count differs from `report.econ` (car-park-verge
  #1: 60 vs 145). Use one counter before reading trip success off either.

Leads from the failing runs' own diagnostics (most costly first):
1. **Scouts find nothing; sources within 300 BU stay unknown.** 364 scout trips in the sweep, 319 of them
   `timeout`/`curfew not-reached` fail; at winter the colony knows 0 of the P sources within 300 BU in 13 of 15 runs
   (2-11 such sources holding 0.5-8.7 P loads). Kills playground-park #3 (C stores 0, nectar C 6 unknown) and
   suburban-garden #3 (0 successful trips). Scout trips are 44 % of all trips; non-scout trip success median 48 %.
2. **Protein**: median P intake/need 0.094; P stores 0 at winter in 6 runs; larvae starved 14 (car-park-verge #1 6,
   playground-park #3 4). The five growing runs eat the hand-over P with the first brood and then stall; two of them
   fail viability on it (above). No prey item taken in any run (items taken: crumb, carrion only) — R18's prey
   patches are still not hunted. `tend` trips: 111 `curfew not-reached` fail.
3. **Seed 3 brood never hatches**: in 4 of 5 seed-3 runs (woodland-edge, suburban-garden, car-park-verge,
   kitchen-door #3; 7-9 first workers, one founding chamber at hand-over) 0 of 43 eggs hatched: untended 23,
   flooding 10, exposure 4, base 4, temperature 2; nest.work 51-61 % of worker time, queen-care 11.9-15.1 worker-gd.
   This is the queen-care egg loop / one-chamber flooding of round 1 (causes 3a, next 2) across a whole seed.
   Workers 9 -> 7 on two of them fails viability.
4. **Eggs lost untended in every archetype**: `egg:untended` 44 of 166 eggs laid after the hand-over (all runs),
   `pupa:untended` 7 (woodland-edge #1 4: round 1's next 1, nurses carrying pupae between chambers).
5. **Laying**: 10 eggs (median) after the hand-over; queen potential > 0.5 egg/gd 14-51 % of the time; "winter reserve
   short" 95 % of the time on playground-park #3, 25-42 % on the five growing runs.
6. **In-nest stalls**: stuck ant-gd 7.3-16.7 on the five growing runs (0.4-4.7 on the others); invariant
   `walker-stuck-explosion` on suburban-garden #3, `walker-stall` (raid ants) on suburban-garden #1, playground-park #3.
7. F1 trigger (above): pile soil over ghost plug flags counts as an added plug.

## Round 2

Engineer: round 2 (started 03:45 UTC Nov 17). Evidence: `test-output/colony-life/round-2/`.

Progress (kept current; a successor continues from here)
- 03:45 started: read spec, ledger, STATUS. Next: reproduce the sweep's major findings (F1 trigger, protein loss on
  suburban-garden #2 / playground-park #2), then account the failing runs.
- 03:47 G1 (sweep finding "F1 trigger") done in the tree: `entrances.ts` `forgetGhostPlugs` (an `open` entrance drops
  the PLUG flag of ghost samples, so spoil piled on them later is no plug). `plugBaseline.verify` red without it
  (counted 5, `sealing`), green with it. Next: account (funnel) for the failing runs.
- 03:50 tool fixes (sweep minors) in the tree: `lifeFunnel.ts` `FoundingObserver.stop()` called by `life.ts` at the
  hand-over; funnel trips now end when `ant.mem.trips` rises (the one writer is phaseNest `finishTrip` ->
  `recordForagerReturn`, the same count as `report.econ.trips`), reason = what the ant turned home with; trips abandoned
  before leaving are listed apart; new `funnel.tripsHome` and `funnel.scouting` (scout reach, time out, odour passes,
  discoveries). Day column renamed "departures (activation path only)". Hand-overs of the sweep copied to
  `round-2/cache/*-any.bin` (suburban-garden 2/3, playground-park 2/3, kitchen-door 3, car-park-verge 1).
  Now running: `round-2/before/` suburban-garden #2 and playground-park #3 (`--cache round-2/cache --cache-any`).

- 03:58 measured while the `before` runs go: prey patches (GDD 05 §2.3) within 300 BU of the nest at the hand-over
  (probe on the cached states): suburban-garden #2 2 (nearest edge 36 BU, K 222 + 72), playground-park #3 2 (95 BU,
  K 172 + 402), kitchen-door #3 3 (118 BU), car-park-verge #1 2 (202 BU). A springtail is 0.25 P; K 222 at r 0.8/gd
  sustains ~44 catches (11 P) a gd. **No behaviour bites patch prey**: `fightTargets.ts` leaves "free prey to the
  foraging behaviours" and no foraging behaviour calls `preyNear` (R18: hunting is a forage behaviour). The ecology
  seams exist (`preyNear`, `preyEvades`, combat `bite` -> `creatureKilled` -> patch count -1, remains item).
  Decision: implement hunting (H1) in the outdoor engine (new `outdoor/hunt.ts`), patch knowledge as additive
  `PreyPatch.knownBy`, known patches in `knownCapacity`. Writing it now.
- 04:12 `before` runs done (`round-2/before/`, current tree incl. G1, same hand-overs as the sweep): suburban-garden #2
  104 trips 33 % ok, P intake/need 0.076, 7 eclosed, starvation stage 2.2 gd (not viable) - same numbers as the sweep;
  playground-park #3 22 trips 0 % ok, C 0.064, P 0.027, 4 larvae starved. Scouting (new funnel line): sg #2 40 scout
  trips reach median 219 BU (the 220 BU small-colony range) in 104 s; nearest approach to a P source's odour edge
  median 106 BU; discovered 2 sources (honeydew). pp #3 26 trips, median reach 149 BU, P edge 219 BU, 0 discovered.
- 04:12 H1 hunting in the tree (`outdoor/hunt.ts`, engine/phaseNest/phaseTravel/transitions/phaseScout/keys/flavours
  hooks, `balance/foraging.ts` HUNT_* + PATCH_FORAGERS_MAX, `types/ecology.ts` `PreyPatch.knownBy`,
  `colony/allocation/demand.ts` known patches as P capacity) plus H1b `combat/damage.ts`: a creature killed by the hit
  no longer marks the attacker "fighting" (the hunter deposited alarm and fled from it before picking up the remains:
  13 kills -> 6 deliveries in the test; after: 15 -> 11). Test `outdoor/hunt.test.ts` (3 cases; the two behaviour
  cases red with hunting switched off: 0 deliveries / patch unknown). Now running `round-2/after1/` sg #2, pp #3.
- 04:28 `after1` (H1 + H1b, `round-2/after1/`): suburban-garden #2 **viable** (was not): P intake/need 0.076 -> 0.254,
  starvation stage 2.20 -> 0 gd, laying permitted 6 % -> 63 % of the time, eggs 10 -> 14, 11 springtails + 3 mites
  subdued, 8 prey loads home (1.66 P); eclosed 7 -> 4 (3 pupae untended), workers 16 -> 16 (was 17). playground-park #3
  unchanged in kind: C 0 from day 5 (scouts find no C source; 2 springtails caught, none home), not viable.
  Found on the way: the funnel showed 116 "tend untracked not-reached fail" trips in sg #2 after1: an ant made forager
  or tender in the nest with a full crop (deliver first) unloads it through `finishTrip`, which counted a trip
  (colony counters, ant.mem.trips, recruitment contacts) and booked the crop as a delivery (false intake).
- 04:28 C1 in the tree: `outdoor/phaseNest.ts` `finishTrip` books the delivery, the return and the route only when the
  trip went outside (`K.wentOut`, set by the trip clock; the same rule `startReturn` already used to abandon a trip).
  Test `outdoor/tripCount.test.ts` (red without: trips 1, deliveries 1; green). Folder tests so far (outputs
  `round-2/vitest/`): outdoor 22/23 files (red `removal.verify`, also red on the round-start tree 151cc41 in a scratch
  copy, same numbers), combat 12/12, nest 54/55 (red `escapeDig`, known; `plugBaseline.verify` now green), colony
  51/52 (red `founding/reopen.test`, known).
  Next: rank causes (below), then after2 runs (all fixes) on sg #2, pp #3, car-park-verge #1, kitchen-door #3.

### Funnel of the studied runs (`round-2/before/`, round-start tree + G1, the sweep's hand-overs)

| | suburban-garden #2 | playground-park #3 |
|---|---|---|
| hand-over | 2.79 gd, 16 workers | 3.59 gd, 12 workers |
| workers at winter / viable | 17 / no (worse than lean 2.20 gd: protein) | 10 / no (C stores 0, worse than lean 2.90 gd) |
| worker time | nest.work 30 %, wait 22 %, nest.idle 19 %, travel 22 % | nest.work 41 %, nest.idle 31 %, wait 16 %, search 4 % |
| task time (worker-gd) | tend 42.0, forage 33.9, nurse 28.1, idle 26.0, queen-care 19.1 | idle 26.5, queen-care 17.0, forage 14.8, scout 11.9, nurse 11.9 |
| trips home / ok | 104 / 34 (scouts 0 of 31 found anything) | 22 / 0 (all scouts) |
| scouting | 40 trips, median reach 219 BU in 104 s, 2 sources found | 26 trips, median reach 149 BU in 192 s, 0 found |
| P path | P sources within 300 BU: carrion 2.2 P (known 0); 2 prey patches (K 294, edge 36 BU), 0 prey taken; P in: honeydew 1.24, "unknown" 0.46 (C1 artefact); fed to larvae 9.8 P (hand-over P) | carrion 0.9 P, crumb 0.3 P, 2 patches (K 574, edge 95 BU), none known; P in 0.14 ("unknown"); fed to larvae 1.5 P |
| brood after hand-over | 10 laid, 10 hatched, 7 pupated, 7 eclosed; laying protein permitted 6 % of the time | 10 laid, 7 hatched, 0 pupated; larva:starvation 4 |
| deaths | old-age 5, lost 1 | old-age 2 |

### Ranking by measured loss (round 2; the sweep table `round-1/sweep-table.md` + this round's runs)

1. **Protein is never taken from prey patches** (R18). Every probed nest has 2-3 patches within 300 BU (K 72-574,
   nearest edge 36-202 BU); no behaviour bit patch prey (0 prey items in 15 sweep runs). P intake/need median 0.094
   (bar 0.7); laying protein permitted 5-10 % of the time on the growing runs; two growing runs lost viability on
   protein (sg #2, pp #2). Fixed this round (H1), measured on sg #2: P 0.076 -> 0.254, viable.
2. **Scouts find little** (sweep: 319 of 364 scout trips fail, 44 % of all trips). pp #3 starves of C with nectar C 6 and
   a crumb C 4.2 unknown within 300 BU (not viable), sg #3 0 successful trips. Scouting line: a small colony's scout
   walks one ray to the 220 BU range (sg #2 median reach 219 BU in 104 s of its 300 s) and turns home; a raised flower
   is smelled but not reached (pp #3: smelled 1, discovered 0). Not fixed this round.
3. **Brood lost before eclosion**: egg:untended 44 of 166 eggs, seed-3 runs 0 of 43 eggs hatched (4 runs), 2 of them
   not viable (workers 9 -> 7); sg #2 after1 still loses 3 pupae + 3 eggs untended. Not fixed this round.
4. **Trip count artefact** (C1, fixed): in-nest crop unloading counted as trips and deliveries.
5. **Ghost plugs under spoil** (G1, fixed): 2 runs with one shut day each in the sweep.
- 04:33 S1 in the tree (cause 2, the part measured): `outdoor/phaseScout.ts` `bestHeading`: a small colony's scout
  (range SMALL_SCOUT_RANGE_BU < SCOUT_MAX_RANGE_BU) takes no leg that would end beyond its range less one leg; if no
  leg fits it heads home. Test `outdoor/scoutRange.test.ts`: trips without S1 162/153/92/160/176/173 s, all at the
  220 BU range (red, median > 180 s wanted); with S1 green. Not addressed: flowers smelled but not reached (lift
  12-45 BU on stems), slow scouts on pp #3 (path 1.8 BU/s).
  Running: `round-2/after2/` car-park-verge #1, kitchen-door #3 (H1 + H1b + C1, started before S1).
- 04:37 `after2` (H1 + H1b + C1, before S1/B1): car-park-verge #1 viable (as in the sweep), trips 145 -> 52 and
  success 8 -> 19 % (C1: the sweep's 145 included in-nest unloadings), P intake 0.078 -> 0.037 (the sweep's
  "unknown" P 0.454 were in-nest crops booked as deliveries, gone with C1), larvae starved 6 -> 1, eclosed 0 (6 larvae
  in diapause at winter); its patches (edge 202 BU) were never entered: no patch prey appeared, no hunting.
  kitchen-door #3 unchanged (eggs 10 -> 0 hatched: untended 4, flooding 5), patches at 118 BU never entered, scouts'
  median reach 70 BU.
- 04:37 B1 in the tree (cause 3, the part measured): `colony/brood.ts`: brood being carried gets `lastTendedTick`
  each brood tick (the carrier handles it; the pile clock starts at the put-down). Probe
  (`round-2/probe-eggs-kd3.txt`, kd #3 hand-over, every 0.02 gd): a queen-carer held 6 eggs 1.70 -> 1.86 gd, they
  were put down at 0.27 gd "untended" (> UNTENDED_GD 0.25) and two died `untended` at 1.92 / 1.97; the nest flooded
  (0.08-0.18) at 1.92 and every ant froze (`flee.freeze`) for > 0.1 gd. Test `colony/broodCarried.test.ts` (red
  without: 0.35 gd untended after the put-down; green).
  Running: `round-2/after3/` playground-park #3, suburban-garden #3 (all fixes: G1 H1 H1b C1 S1 B1).
- 04:43 C1 had a hole, found by `outdoor/tendHerd.test` (red: 0 honeydew delivered): the herd branch walks tenders out
  and back itself (`tendHerd.ts`, `tendHerdStates.ts` set the trip clock `K.out0` directly), so `K.wentOut` never
  became 1 and C1 dropped every herd delivery from the books (the food still reached the pool). Fixed: both places
  set `K.wentOut = 1`; tendHerd tests green. **The `after2` runs (cpv #1, kd #3) carry the hole**: their C intake
  undercounts herd honeydew (cpv #1 C 1.107); they are kept for P / brood / patch figures only. `after3` restarted
  (04:43) on the fixed tree: playground-park #3, suburban-garden #3.
- 04:53 `after3` (all fixes) playground-park #3 **viable** (was not): C intake/need 0.064 -> 0.813, P 0.027 -> 0.166,
  trips 22 -> 32, success 0 -> 31 %; scouts (13 trips, median 374 s out) found the crumb (114 BU) and a carrion; 1
  prey and 2 carrion loads home; larvae starved 4 -> 5, eclosed 0. suburban-garden #3 still not viable (workers
  9 -> 7, old age): C 0.132 -> 0.306, trips 10 (success 0 -> 20 %), eggs 9 -> 0 hatched (untended 7, as before: B1
  did not reach this run's loss). Running now: after3 sg #2 and kd #3; probing sg #3's eggs.

### Sweep findings (round 1 review) -> what this round did

- F1 trigger (major): **real, fixed (G1)**. `plugBaseline.verify` was red (5 ghost flags under a 2 BU ring: count
  0 -> 5, `sealing`); `nest/entrances.ts` `forgetGhostPlugs`: while an entrance is `open`, the PLUG flag of a closed
  sample above the ground (a ghost: plug fill that landed in air, already not counted by `plugCount`) is dropped at
  each evaluation, so soil piled on it later is soil, not a plug. Closed throats keep their flags (the founding seal
  and reopen rules read them). Green now; nest folder otherwise unchanged (`escapeDig` red as before).
- Protein loss on sg #2 / pp #2 (major): **real; cause found and fixed (H1)**: no behaviour hunted the prey patches
  (R18), so the growing runs spent the hand-over P on the first brood and had no protein after it. sg #2 viable again
  with H1 (P 0.076 -> 0.254). pp #2 not re-run this round.
- Founding funnel counts colony-life losses (minor): fixed in the tool (`FoundingObserver.stop()` at the hand-over).
- Trip counters disagree (minor): fixed in the tool (funnel trips end on `ant.mem.trips`, = `report.econ.trips`;
  the day column is labelled as departures) and found a sim defect behind part of it (C1: in-nest unloading counted
  as trips and deliveries; the sweep's trip counts and intake include it, e.g. cpv #1 145 trips / P 0.454 "unknown").

### Fixes (round 2)

G1. Ghost plugs under spoil (above). `src/sim/nest/entrances.ts`. Test `src/sim/nest/plugBaseline.verify.test.ts`
    (the review's, red -> green).
H1. **Hunting patch prey** (R18; GDD 05 §2.3, §1.5; GDD 02 §10.2 "prey: combat first"). New
    `src/sim/ants/behaviours/outdoor/hunt.ts`: (1) engine interrupt `huntCheck`: a forager or scout outside, not
    laden, in outbound / search / explore / investigate, that has patch prey within HUNT_NOTICE_BU 5 (springtail;
    mite only under a protein deficit) chases it (new phase `hunt` = 14, state names the flavour's collect), and the
    colony learns the patch (`PreyPatch.knownBy`, additive optional bitmask in `src/sim/types/ecology.ts`);
    (2) `updateHunt`: `bite` through the action library (combat resolves evasion, damage and the kill, ecology turns
    the body into a food item and lowers the patch count), then `pick-up` of the remains, home as a solid load
    (delivery kind `prey`); a chase ends after HUNT_CHASE_S 20 s; (3) departures: `choosePatch` scores known patches
    with the source rule's terms (P of a catch x the colony's weights x crowding / (walk both ways + HUNT_EXPECT_S 40 s
    x K / count)) against the best known source; a hunting trip walks to the patch centre and searches the disc for
    HUNT_PATCH_SEARCH_S 90 s. `src/sim/colony/allocation/demand.ts` counts known patches as P capacity (catches a day
    = count + regrowth + immigration, at most PATCH_FORAGERS_MAX 6 foragers). Hooks: engine.ts, phaseNest.ts
    (departure), phaseTravel.ts (patch search), transitions.ts / phaseScout.ts (bout reset, `prey` delivery kind),
    keys.ts, flavours.ts; constants in `src/sim/balance/foraging.ts`. Test `outdoor/hunt.test.ts` (foragers' hunting
    trips deliver >= 3 prey loads a day; a scout meeting a springtail catches it and the patch becomes known; a known
    patch is P capacity) - the behaviour cases red with hunting switched off.
H1b. `src/sim/combat/damage.ts`: a hit that kills the creature no longer marks the attacker as fighting (GDD 02 §8
    alarm deposit). Measured: hunters deposited alarm on each one-bite kill and fled from it before picking up the
    remains (13 kills -> 6 deliveries in the hunt test; after 15 -> 11). A creature that survives the hit still makes a
    fight. Combat folder green.
C1. Trips that never went out are not trips: `outdoor/phaseNest.ts` `finishTrip` books delivery, return, route and
    `mem.trips` only when `K.wentOut`; the herd branch (`tendHerd.ts`, `tendHerdStates.ts`) now sets `K.wentOut`
    (it runs its own trip clock). Tests `outdoor/tripCount.test.ts` (red without), `outdoor/tendHerd.test.ts` (it caught
    the herd hole).
S1. Small-colony scouts search inside their range: `outdoor/phaseScout.ts` `bestHeading`. Test
    `outdoor/scoutRange.test.ts` (red without: trips 92-176 s, all ending at the 220 BU range).
B1. Carried brood is tended: `colony/brood.ts`. Test `colony/broodCarried.test.ts` (red without: 0.35 gd).
Tool: `tools/sim/lifeFunnel.ts` (trip count, founding stop, `scouting`, `preyPatches`), `tools/sim/life.ts`.

### Before / after (same hand-over snapshots, `--cache round-2/cache --cache-any`)

before = `round-2/before/` (round-start tree + G1) for sg #2 and pp #3, the sweep (`round-1/sweep/`, same hand-overs)
for sg #3 and kd #3; after = `round-2/after3/` (G1 H1 H1b C1 S1 B1). Trip and intake figures of the "before" columns
include the C1 artefact (in-nest unloadings counted as trips and as "unknown" deliveries).

| run | viable | workers hand-over -> winter | eclosed (eggs laid) | intake/need C | P | trips / success | larvae starved | worst-stage stretch gd | prey loads home |
|---|---|---|---|---|---|---|---|---|---|
| suburban-garden #2 before | no | 16 -> 17 | 7 (10) | 1.459 | 0.076 | 104 / 33 % | 0 | 2.20 | 0 |
| suburban-garden #2 after | **yes** | 16 -> 19 | 7 (12) | 1.544 | **0.133** | 116 / 36 % | 0 | 0.50 | 11 (1.9 P) |
| playground-park #3 before | no | 12 -> 10 | 0 (10) | 0.064 | 0.027 | 22 / 0 % | 4 | 2.90 | 0 |
| playground-park #3 after | **yes** | 12 -> 10 | 0 (10) | **0.813** | 0.166 | 32 / 31 % | 5 | 0 | 1 (+2 carrion) |
| suburban-garden #3 before (sweep) | no | 9 -> 7 | 0 (9) | 0.132 | 0 | 10 / 0 % | 0 | 0 | 0 |
| suburban-garden #3 after | no | 9 -> 7 | 0 (9) | 0.306 | 0.016 | 10 / 20 % | 0 | 0 | 0 |
| kitchen-door #3 before (sweep) | yes | 7 -> 6 | 0 (10) | 0.144 | 0 | 12 / 17 % | 0 | 0 | 0 |
| kitchen-door #3 after | **no** | 7 -> 4 | 0 (10) | 0.279 | 0.02 | 8 / 13 % | 0 | 0 | 0 |

Reading: protein from patches works where a patch lies in the colony's reach (sg #2: 16 kills, 11 loads home, laying
permitted 6 -> 22 % of the time; pp #3: patch 95 BU, 3 kills). Where the nearest patch is 118-202 BU out (kd #3, cpv #1,
sg #3) no scout or forager entered it and nothing changed for protein. S1 + the hunting trips took pp #3 from C
starvation to viable (crumb at 114 BU found). The seed-3 runs (sg #3, kd #3) still hatch nothing: eggs die
`untended` (7 / 6) and flooding; kd #3 lost 3 workers in its last days (crushed day 1 by a human event, drowned and
lost on day 8): one run, not attributed. Not measured this round: the other 11 sweep runs (the independent sweep does
that); sg #2 eclosions 7 = before (the P that came in fed larvae of the first brood; laying permitted only 22 %).

### Verification (05:05 UTC)

- `npx tsc --noEmit`: clean (earlier in the round other engineers' `render/ants/swarm.test.ts`,
  `species/modules/wood/wood.verify.test.ts`, `species/modules/granary/fixes.test.ts` had errors; not touched).
- Folder tests (outputs `round-2/vitest/`): `ants/behaviours/outdoor` 24/25 files (red `removal.verify`, red with the
  same numbers on the round-start tree 151cc41 in a scratch copy, deleted); `ants/behaviours/nest` 26/28 (red
  `sfaReview.verify` 11 vs 12, `stall.soak` 22 %: as in round 1); `nest` 54/55 (red `escapeDig`, known;
  `plugBaseline.verify` green now); `colony` 52/53 (red `founding/reopen.test`, known); `combat` 12/12; `types` +
  `balance` red `ids.test` (ALERT_KINDS 38 vs 37, known).
- Runs: `round-2/before/`, `after1/` (H1 + H1b), `after2/` (+ C1 with the herd hole: C intake undercounted),
  `after3/` (all fixes); probes (`probe-eggs-kd3.txt`, `probe-eggs-sg3.txt`) by tools deleted after use.

### Tried and reverted

- A `forager-returned` sim event to reconcile the trip counters: it needs an entry in `src/audio/eventMap.ts` (the
  audio map is exhaustive over event types; not this task's folder). The funnel reads `ant.mem.trips` instead.
- Hunting without H1b: hunters fled from their own alarm after each kill (above).

### GDD deviations

- S1: GDD 02 §10.1 sends a scout home at `distance > SCOUT_MAX_RANGE`. For a small colony (R3's 220 BU range, a
  viab-economy number, not the GDD's 700) the range now bounds the walk and the scout returns on time, hunger or
  curfew. The large-colony rule is unchanged.
- H1: HUNT_NOTICE_BU, HUNT_CHASE_S, HUNT_REMAINS_BU, HUNT_PATCH_SEARCH_S, HUNT_EXPECT_S, PATCH_FORAGERS_MAX are new
  (GDD 05 §2.3 gives the spawn rate, escape chances and yields, not the forager's search times); derivations in
  `balance/foraging.ts`. No need, lifespan, provision, bar or ruling test changed; no seed or archetype case.
- B1: GDD 02 §2.5 counts a pile's untended time; carried brood was already exempt from the hazard, now its clock also
  restarts at the put-down.

### Next (for round 3; the independent sweep comes first)

1. **Patches out of reach**: kd #3 (nearest patch edge 118 BU), cpv #1 (202 BU), sg #3 (186 BU): nobody enters them,
   so no hunting. Scouts of these runs reach a median 65-160 BU. Check the sweep's patch line per run (`preyPatches`
   in the funnel) and whether worldgen's R18 top-ups (`worldgen/populate/finalize.ts`) place patches near the start.
2. **Protein still far below the bar** where hunting works (sg #2 P 0.133, 16 kills in 6 gd): hunting trips per day,
   their success, and the remains lost after a kill (16 kills, 11 loads home).
3. **Seed-3 brood** (sg #3, kd #3): eggs still die `untended` (7 / 6) and of flooding; one founding chamber, ~1 nurse
   among 7-9 workers (dig takes 4-5); queen-care keeps collecting eggs. B1 removed one path (carried past the limit).
4. **Flowers smelled but not reached** (pp #3, sg #2): investigate gives up after 30 s at a raised flower.
5. kd #3 after: 3 workers lost (crushed day 1, drowned + lost day 8), one run; watch `worker:lost` in the sweep.

Status: **round 2 complete** (05:05 UTC). Probe tools and scratch copies deleted; no processes left running.

### Independent sweep after round 2

Independent engineer, 05:07-06:35 UTC Nov 17. Table: `test-output/colony-life/round-2/sweep-table.md` (made by
`python3 tools/sim/sweep-table.py test-output/colony-life/round-2/sweep test-output/colony-life/round-1/sweep`; runs by
`tools/sim/sweep-life.sh test-output/colony-life/round-2/sweep test-output/viab/cache`; logs, `summary.txt` in
`round-2/sweep/`). Tree = the round's tree (G1 H1 H1b C1 S1 B1); during the sweep only other engineers' Messor/wood files
and this review's test files changed (the `summary.txt` hash covers test files, the cache tag does not). Fresh founding
on every run; the founding is the same as round 1's (first workers and hand-over times equal in all 15 runs). Check of
the cache path: woodland-edge #2 restored from its hand-over with an inert change (below) ends with the sweep run's state
hash `0999a6a3`, so cached hand-overs equal a fresh founding. **This table (`round-2/sweep-table.md`) is the one the next
round compares with.** Tool change: `sweep-table.py` now also prints intake/need without the deliveries booked as
`unknown` (before C1, in-nest unloadings were booked as `unknown` intake, so round-1 numbers overstate intake).

**Viability bar: NOT met** - viable 8 of 15 (round 1: 9). woodland-edge **1/3**, suburban-garden 2/3, playground-park
2/3, car-park-verge 3/3, kitchen-door **0/3**. 6 of the 7 failures are the workers check (old age with nothing eclosed),
1 is the starvation stage (kitchen-door #2, protein).

**Growth bar R19: NOT met** (3 of 7 checks, as in round 1):

| check | value | round 1 |
|---|---|---|
| workers at winter >= first workers, >= 10 of 15 | **4 of 15** | 5 |
| median eclosions after hand-over >= 4 | **0** (10 of 15 runs: none) | 0 |
| median intake/need P >= 0.7 | **0.031** (without `unknown`: 0.030) | 0.094 (0.047) |
| median intake/need C >= 0.9 | 1.016 ok (without `unknown`: 0.982) | 1.258 (1.148) |
| median trip success >= 50 % | **24.7 %** | 18.2 % (inflated by C1's false trips) |
| first workers >= 9, >= 13 of 15 | 13 of 15 ok | 13 |
| no `worker:lost`, >= 13 of 15 | 13 of 15 ok | 14 |

Regressions against round 1 (same hand-overs; 14 runs flagged by the script, the main ones):
- **viable -> NOT viable: woodland-edge #2** (15 -> 11, was 15 -> 19; eclosed 7 -> 2; pupa:untended 6, egg:untended 7,
  crushed 3), **woodland-edge #3** (7 -> 5), **playground-park #1** (13 -> 9; 2 `worker:lost`), **kitchen-door #1**
  (15 -> 11, need 12), **kitchen-door #2** (grows 15 -> 19 but worse than lean 2.50 gd on protein: P 0.21 -> 0.025,
  stores P 0 at winter), **kitchen-door #3** (7 -> 4: crushed, drowned, lost, as the round reported).
- not viable -> viable: suburban-garden #2, playground-park #2 and #3, car-park-verge #3 (the round's sg #2 / pp #3 gains
  hold in the sweep).
- C intake/need down by more than 0.1 in 9 runs (median 1.258 -> 1.016; without `unknown` 1.148 -> 0.982): sg #1
  0.93 -> 0.44, cpv #3 1.72 -> 0.79, kd #1 1.85 -> 1.01, we #3 0.52 -> 0.25 (without `unknown`).
- Eclosions down in 4 of the 5 seed-2 runs (we #2 7 -> 2, sg #2 7 -> 5, cpv #2 9 -> 4, kd #2 9 -> 7).
- A/B (`round-2/sweep-ab/`, round-start tree `151cc41` via `git archive`, same hand-overs, `--cache-any`): woodland-edge #2
  15 -> 19, 7 eclosed, viable; kitchen-door #1 15 -> 12, viable - round 1's outcomes. So both losses come with this
  round's code. But they are not one fix's mechanism: three perturbed variants of the round-2 tree on woodland-edge #2
  gave without B1 viable (8 eclosed, 2 deaths), without C1 viable (8 eclosed, 6 deaths), without the known-patch
  capacity term identical to the sweep (that colony never knew a patch); kitchen-door #1 without the patch capacity term
  viable at exactly 12 workers. Single runs diverge chaotically after any change; several viability verdicts sit within
  one worker of the line. The aggregate numbers are the evidence; per-run flips are not attributable.

Review of the round (code: `git diff 151cc41` on the files the round lists; outputs `round-2/sweep-review/`):
- Verified: `tsc --noEmit` clean (05:13 and 06:35). Folder tests: `ants/behaviours/outdoor` 24 of 26 files (red
  `removal.verify`, known, and this review's `huntSourceTrip.verify`), `nest` 54/55 (`escapeDig`, known;
  `plugBaseline.verify` green), `colony` 52/53 (`founding/reopen`, known), `combat` + `types` + `balance` only `ids.test`
  (known), `ants/behaviours/nest` `sfaReview.verify` + `stall.soak` (known). Same red set as the round reported.
- In a scratch copy (deleted) each new test is red with its fix taken out: `broodCarried`, `tripCount`, `scoutRange`, and
  `hunt.test`'s two behaviour cases (huntCheck and choosePatch switched off). They test the fixes.
- Not allowed list: no lifespan, need, provision, bar or ruling-test change; no seed or archetype case; new constants are
  in `balance/foraging.ts` and listed as deviations. Determinism: `knownBy`, `PHASE.hunt` and the hunt keys are persisted
  state; no wall clock, no `Math.random`, no `Math.hypot` added in sim code. New
  `src/sim/ants/behaviours/outdoor/huntSaveLoad.verify.test.ts` (green): a game saved while ants hunt continues with the
  same state hash as the uninterrupted one. Per-tick cost: `huntCheck` runs at the travel think cadence with one
  spatial query; `huntersOf` loops over all ants per known patch, but only in a departure decision.
- G1, S1 (range less one leg = 208 BU), B1, H1b: sound, no finding.
- **H1 (finding, minor): prey caught on a trip to a known source is booked as that source.** huntCheck keeps the trip's
  `K.src`; `transitions.ts` `noteKind` reads the kind from it, so the remains come home as `nectar` (or `honeydew`), and
  `recordForagerReturn` / route memory credit that source. `src/sim/ants/behaviours/outdoor/huntSourceTrip.verify.test.ts`
  (new, RED, kept): delivery `nectar c0 p0.25 src32`. Intake totals are right (c/p are the load's); the funnel's
  `prey` count undercounts hunting (the round's "16 kills, 11 loads home" may be partly this).
- **H1 (finding, major on effect): hunting catches little of the prey it meets.** Sweep: 864 springtails and 195 mites
  appeared ahead of colony foragers/scouts (they appear only there), 53 + 11 were subdued, 41 prey loads came home (P 7.9
  in 15 runs). Probe (`round-2/sweep-review/probe-hunt-*.txt`, tool deleted; the sweep's hand-overs): suburban-garden #1
  72 appeared, 21 chased, **0 caught** (71 vanished); woodland-edge #3 (nest 4 BU from its patch) 74 appeared, 27 chased,
  1 caught. Of the 72 on sg #1 the nearest ant was in `forage.return` / `scout.return` with an empty crop (33; return is
  not a phase that may break off), already hunting (21), outbound/explore/search (17). Chased prey got within 0.1-0.6 BU
  of the hunter and still vanished. From the code (not measured): a springtail rolls its escape (0.6 on open ground) on
  every touch within 1 L (`preyFauna.ts` jump on touch, every 2 s) before the bite rolls it again, so a catch costs
  ~6 approaches on lawn instead of the ~2 `HUNT_EXPECT_S` assumes; the round's `hunt.test` world may be litter (0.25).
- Checked, no finding: endChase after a chase that interrupted a source search restarts the search at the patch centre
  (observed 120 BU off the source), but the forager still found its source (test deleted); a nanitic crop return mark is
  0.8 x 0.614 = 0.491 < SUCCESS_CROP 0.5, yet foragers (13 of 13) and tenders (8 of 8) with a full crop counted as
  successful (test deleted, output `sweep-review/naniticCrop-checked-no-defect.txt`).

Leads from the failing runs' own diagnostics (most costly first):
1. **Nothing laid after a late hand-over ecloses before winter.** All 5 seed-2 runs (hand-over 2.75-2.81 gd, brood
   21-24 C on days 1-2, egg stage 0.95-0.99 gd) eclose 2-7; all 10 seed-1/3 runs (hand-over 3.48-4.59 gd, brood 12-18 C
   on days 1-2, egg stage 1.5-3.0 gd) eclose 0. Same split in round 1. This alone holds the eclosions median at 0 and
   `held` at 4-5 of 15; 6 of 7 viability failures are old-age losses with no eclosion (deaths: old-age 31, crushed 7,
   lost 3, drowning 1). Check whether the first clutch after the hand-over is laid too late (laying potential > 0 only on
   days 1-2 of seed-1 runs; 0 the whole run on we #1, cpv #1, kd #1) or develops too slowly at autumn brood temperature.
2. **Protein**: median P intake/need 0.031. Patches out of reach (nearest edge 174-244 BU: we #1, pp #1, cpv #1, cpv #3,
   sg #3, kd #2) - no prey at all; in reach, the catch rate above. kd #2 fails viability on protein only (laying
   permitted 0 the whole run, P stores 0); larvae starved 20 (we #1 8, cpv #1 6, pp #3 5).
3. **Seed-3 brood**: 4 of 5 seed-3 runs hatch 0 of 40 eggs (untended 20, flooding 6, exposure 4); pp #3 hatched 7.
4. **Brood losses, all runs**: egg:untended 42 of 172 eggs, pupa:untended 15 (we #2 6, against 2 in round 1 and 0 in
   the two perturbed variants).
5. **Locomotion / stuck**: `walker-stuck-explosion` on we #2 (14 violations) and kd #2 (11); stuck ant-gd 16.2 (pp #2),
   12.5 (kd #2), 9.6 (sg #2); cpv #2 131 forage trips abandoned before leaving the nest (`stuck never-left`); pp #1's two
   `worker:lost` were tenders stuck in `tend.return` at (972, -9.5, 3490) BU on days 5-6.
6. **C intake fell in 9 runs** (above). kd #1 A/B on the same hand-over: honeydew loads 32 -> 10, tend 21.9 -> 13.1
   worker-gd, forage 18.2 -> 28.5; not the patch capacity term (variant without it: honeydew 8 loads). Cause not
   isolated; also 76 `tend crop-full` trips booked as failures against 79 ok (not the nanitic crop arithmetic, above).
7. `unknown` deliveries remain after C1 (kd #1 9 loads, P 0.515; probe sg #1: ants in `scout.depart` / `rest` /
   `forage.wait` unloading 0.02-0.06 C with no source): a smaller accounting artefact of the same kind.

## Round 3

Engineer: round 3 (started 06:37 UTC Nov 17). Evidence: `test-output/colony-life/round-3/`. Method per the integrator
direction of 06:45 in `colony-life.md`: benches from the 15 hand-over snapshots, fixes accepted on bench medians.

Progress (kept current; a successor continues from here)
- 06:40 read spec, ledger, STATUS. Copied the 15 hand-overs of sweep 2 (`test-output/viab/cache`, tags fe66cb2b /
  d1834f5c / 10481b17, written 05:10-06:05 by the sweep) to `round-3/cache/*-any.bin` (bench and before/after input).
  Next: reproduce the sweep's major finding (hunting conversion), then build the benches.
- 06:50 benches written: `tools/sim/bench-colony.ts` (`--mode nest|forage`, one hand-over snapshot, to winter; nest =
  stores topped up every game hour to 2 gd of the need rates via `cheat.addFood`; forage = need-rate EMAs held every
  tick at the hand-over colony's rates x 30 / its workers, need indices recomputed from the stores; both report the
  life funnel (`lifeFunnel.ts`) and day rows; forage adds a prey funnel: appeared ahead of a colony ant, nearest ant's
  state, chased, bite escapes, touch jumps, outcome, remains lifted, loads home) and `tools/sim/bench-sweep.sh MODE OUT`
  (15 runs, 2 at a time, restart-safe). Decision: "30 workers with full brood" = the hand-over colony's own rates
  (its first brood) scaled to 30 workers. ~32 s per gd under load.
  Running now (06:50): forage bench baseline, all 15 -> `round-3/bench-forage-before/` (`bench-sweep.sh forage ...`;
  if cut off, re-run the same command: finished runs are skipped).
- 06:50 (correction) baselines run from a **frozen copy of the round-start tree** (HEAD e614493 + the bench tools) at
  `$SCRATCH/base` (scratchpad `.../scratchpad/base`, node_modules symlinked), so my edits do not leak into "before".
  `bench-sweep.sh` now runs the tree it lives in. If the copy is lost after a restart: re-create it with
  `cp -r src tools vite.config.ts tsconfig.json package.json` + `git show HEAD:<each file this round changed>`.
  Running: forage bench before -> `round-3/bench-forage-before/` (started 06:49).
- 06:50 probe (scratch test, a lawn test world, 30 springtails put 3 BU ahead of outbound foragers): 28 chased, 11
  caught (39 %); 17 vanished after the 20 s chase ended. Per chase 0-23 jumps; about 2 of every 3 jumps are the
  touch-jump (no bite), 1 of 3 a bite escape: the springtail rolls its 0.6 escape on contact within 1 L and again on
  the bite -> about 0.16 catch per approach instead of the GDD's 0.4 ("escapes per bite attempt", GDD 05 §2.3).
  In the minor finding's case fixed in the tree: `hunt.ts` lifting the remains drops `K.src` (delivery booked `prey`).
- 06:53 in the tree (forage side; not yet benched):
  H2a `ecology/creatures/preyFauna.ts`: one escape roll per contact (a springtail that stays when touched is not rolled
  again by a bite in the same 2 s contact window). Test `ecology/creatures/prey.test.ts` "one escape roll per contact"
  (bite lands on 13 % of approaches without, wanted 30-50 %; green with ~40 %). Probe after: chased 29, caught 22 (76 %).
  H2b `outdoor/hunt.ts` + `keys.ts` (`K.returnWhy`, set by `transitions.ts` startReturn): an ant going home empty after
  a failed trip (timeout, source gone/crowded, trail lost, stuck) may break off for patch prey; not after curfew,
  weather, hunger, fatigue, threat, recall. After the chase it resumes the return with its reason. Test
  `outdoor/hunt.test.ts` case 4 (red without).
  H1-minor `hunt.ts`: lifting the remains drops `K.src`; `huntSourceTrip.verify` green.
  Next: wait for forage-before, then forage-after (H2a+H2b) on all 15; write the nest bench runs meanwhile.
- 07:06 forage-before 4 of 15 done (we #1, sg #1, pp #1, cpv #1): P intake / bench need median 0.012, C 0.88;
  sg #1 (patch edge 80 BU): 189 patch prey appeared ahead of colony ants, 72 chased, 3 caught, 1 load home; the
  other three have their nearest patch edge at 179-210 BU and saw 0-8 prey. Real-world chase probe (sg #1 hand-over,
  H2a in, `round-3/hunt-sg1*.txt`): 5 chases in 1.8 gd, 1 caught; misses are mostly the combat hit roll (0.7 x
  sqrt(1.5/4) = 0.43, GDD 05 §4.2) after the escape roll: GDD-consistent, not changed.
  Tool `tools/sim/bench-table.py DIR [BEFORE]` (per-run rows + medians). Bench JSON now has `care` (per day: nurse /
  queen-care / haul / dig / idle worker-gd, larva-gd, hungry larva-gd, untended egg+pupa gd).
  Decision: no worldgen change this round (patch placement): it would change every world and void the 15 cached
  hand-overs the benches stand on. Recorded as a lead (R18 reach) instead.
