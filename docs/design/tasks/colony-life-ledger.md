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
- 07:20 NOTE: other engineers (difficulty rules, leafcutter) are changing many `src/sim` files in this checkout
  (brood.ts, physiology.ts, combat/damage.ts, founding/*, ...; commit 331d105 and snapshots). Benches therefore run on
  frozen copies: `base` = e614493 + bench tools; `h2` = base + my four files (hunt.ts, keys.ts, transitions.ts,
  preyFauna.ts). Each after-copy = base + this round's files only. The auto-snapshot loop commits my files too.
  forage-before 8/15 at 07:17 (median P/need 0.024; pp #2 25 kills, 20 loads, 4.8 P; sg #2 16 kills).
  Plan when it ends: nest-before (base, PAR=1) and forage-after (h2, PAR=1) side by side.
- 07:38 **forage bench before** done (`round-3/bench-forage-before/table.md`, base tree, demand of 30 workers):
  median trips 45, success 26 %, C/need 0.78, **P/need 0.012**. Protein path: patch prey met in 9 of 15 runs (only
  where the nearest patch edge is <= 130 BU), chased 0-144, caught 0-25 (median chase conversion 0 %; pp #2 24 %, sg #2
  11 %, cpv #2 14 %, sg #1 4 %), prey loads home 0-20 (only pp #2 brings real protein: 4.8 P). Carrion within 300 BU:
  1-12 pieces at the end of every run (P 0.6-15 loads), **known 0** in 13 of 15; scouts make 4-30 trips in 8 gd,
  nearest approach to a P source's odour edge median ~130 BU. Crumbs (we #2 1.9 P, pp #2 1.0 P) are the other P.
  Running (07:35): nest-before (base, PAR=1) -> `round-3/bench-nest-before/`, forage-h2 (h2, PAR=1) ->
  `round-3/bench-forage-h2/`, one process each. If cut off: re-run `PAR=1 $S/base/tools/sim/bench-sweep.sh nest ...`
  and `PAR=1 $S/h2/tools/sim/bench-sweep.sh forage ...` (out dirs above, cache `round-3/cache`).
- 07:58 **nest-bench finding (we #1, food guaranteed: P in store 15-31 loads)**: 6 of 9 larvae starve. Probe
  (`round-3/probe-nurse-we1*.txt`, tool deleted): from t+2.55 to t+3.10 gd **no feed at all**; the two nurses spent
  the 0.55 gd in `nurse.carry` (+ rest); `brood-moved` shows larva 13450 carried royal 5673 -> royal 5673 **89 times**
  (others 2-9 times). Cause: the warmer nursery 13561 (14.2 C vs royal 12.3 C) is the sorting `best`, but its pile
  points lie inside the royal chamber's ellipsoid (chamber assignment = deepest ellipsoid, `nest/chambers/registry.ts`),
  so every put-down lands back in the royal chamber and the board posts the same move again; a hungry larva in the
  "wrong" chamber only ever gets the combined move + feed job (board.ts), carried by nurses with empty crops -> never
  fed; all 8 larvae empty from t+2.6, 6 starve at t+3.03-3.16 (LARVA_STARVE_GD 0.5).
  Fixes in the tree: N1 `ants/behaviours/nest/sorting.ts` (a chamber is a sorting destination for a group only if its
  pile point lies in it by the put-down rule), N2 `board.ts` (a larva with an empty gut, hungerTicks > 0, is fed where it
  lies; sorted once it has food). Test `ants/behaviours/nest/sortReach.test.ts` (2 cases, each red without its fix).
  Next: copy `n1` = h2 + sorting.ts + board.ts; nurse probe there, then nest bench n1.
- 08:15 correction of the 07:58 entry (probe with the job and destination of each carry): the 89 carries of larva
  13450 were **flood evacuations to a dry spot** (job `evacuate`, dest DRY_SPOT -2; the nest had no dry chamber while it
  took water), not sorting. `dryDropPoint` searched a place dry by FLEE_DRY_MARGIN_BU 1 BU; the board evacuates a lying
  item within BROOD_EVAC_MARGIN_BU 1 BU of the water while the nest takes water: the put-down item was inside the band
  and was evacuated again at the next board build (every 2 s), a few mm each time. N1/N2 (sorting) **reverted** (they
  did not change the we #1 probe: same deaths, same carries). Fix E1 in the tree: `ants/behaviours/nest/floodEvac.ts`
  `dryDropPoint` searches with BROOD_EVAC_MARGIN_BU + new BROOD_DRY_DROP_SLACK_BU 1 (`balance/weather.ts`). Test
  `ants/behaviours/nest/dryDrop.test.ts` (red without: drop point dry by < 2 BU). Probe after (`probe-nurse-we1-e1.txt`):
  carries 1-2 per larva (was 89), feeds 100 -> 122, starvation 7 -> 2, but hygiene 3 + exposure 1 (evacuated larvae in
  the royal chamber with 7-15 waste items) and nurses resting (2 of 2 at once for ~0.15 gd) remain.
  Copy `n1` = base + hunt/keys/transitions/preyFauna + floodEvac/weather (sorting/board as base).
- 08:20 forage-h2 stopped after 4 runs (kept: `round-3/bench-forage-h2-partial/`; sg #1 chase conversion 4 % -> 29 %,
  10 kills, but 4 remains lifted and 0 loads home - to check on the full after-bench). One after-tree for both benches:
  `n1`. Running: nest-before (base, PAR=1, 5 of 15 done), forage-after (n1, PAR=1) -> `round-3/bench-forage-after/`;
  nest-after (n1, PAR=1) -> `round-3/bench-nest-after/` starts when nest-before ends (one background chain). If cut
  off: re-run the three `bench-sweep.sh` commands (finished runs are skipped). Meanwhile: folder tests.
- 08:45 nest-before 7/15 (`bench-table.py round-3/bench-nest-before`): food guaranteed, seed-1 runs lay 10-12 eggs,
  pupate 0-2, **eclose 0**; larvae starved 0-6, untended 0-4; laying potential > 0.5 egg/gd 22-31 % of the time;
  brood 12.5-18 C on days 1-3 falling to 6-10 C by day 5-8. Seed-2 (21-24 C): 24-25 eggs, eclose 2-4, untended 6-18.
  **Calendar ceiling** (an egg laid on colony day 0-3 developed at each day's brood temperature, r(T) = (T-10)/11, larvae
  stop at doy 19, winter at doy 22): none of the seed-1 eggs can eclose before winter even with perfect care; of seed 2
  only sg #2's day-0 egg (colony day 5). So the eclosion bar is limited by time and temperature -> integrator direction 3.
  Queued (after forage-after): `tools/sim/bench-startday.sh round-3/bench-startday "7 5" "woodland-edge:1 woodland-edge:3"`
  (fresh foundings with `life.ts --start-doy D --days 1 --cache`, then the nest bench from each hand-over;
  `bench-colony.ts --snapshot FILE --tag -doyD`). Bench artefact noted: the 2-gd top-up can fill the stores (P up to
  51 loads on sg #2), returning foragers then wait in `deliver` (41 % of worker time on sg #2) - same in before and after.
- 08:55 sg #1 forage-after: 10 kills, 4 remains lifted, 0 prey loads booked (before: 3, 2, 1). Probe
  (`probe-lift-sg1*.txt`): the hunter carries the remains home and puts them down in the nest, but `depositFood` accepts
  nothing: the colony has no food/general chamber (pile capacity 0, GDD 03 §6.4) and its P "social stomach"
  (0.15 P x 12 workers = 1.8) is full from the hand-over provision; the item stays lying in the chamber, unbooked
  (`stores-full`, the ant rests). Not a hunting defect; the protein ceiling of a small nest without a food chamber
  (food chambers exist at winter in 5 of 15 forage-before runs) is a lead. A tried change (solid loads put down only
  inside a chamber, `phaseNest.ts`) changed nothing in the probe: reverted.
- 09:00 forage-after 7/15: sg #2 kills 16 -> 47 (chase conversion 11 -> 25 %), we #2 0 -> 2; but sg #2 P/need 0.072 ->
  0.056: P stores sit at 2.4-2.7 loads the whole run = the P social stomach (0.15 x 16-18 workers, no food chamber):
  23 trips "item-collected ... fail" = remains refused by `depositFood`. On the forage bench (30-worker demand) the P
  ceiling, not the catch, limits booked protein where prey is in reach. In the real runs P is near 0 most of the time,
  so the ceiling there bites only in the first days (hand-over provision). Bench limitation recorded; lead for next round:
  P storage of a small nest (stomach 0.15 P/worker; first food chamber by `missing-type` only at 25 workers).
- 09:15 **nest bench before** done (`round-3/bench-nest-before/table.md`; food guaranteed): 231 eggs laid in 15 runs
  (median 11), eclosed median **0** (seed 1 and 3: 0 in all 10; seed 2: 1-10), workers at winter < hand-over in 12 of 15.
  Brood losses with food guaranteed: egg:untended 61, hygiene 42 (egg 23, larva 11, pupa 8), larva:starvation 30,
  pupa:untended 18, base 17, flooding 7, exposure 6, eclosion-failed 4. Laying potential > 0.5 egg/gd 14-51 % of the time
  (seed 1/3 runs 14-31 %, brood 11-17 C). nest-after (n1) started 09:13.

### Funnel of the studied runs (benches, round-3 start tree; medians over the 15 hand-overs)

| | forage bench (demand of 30 workers) | nest bench (stores topped up to 2 gd) |
|---|---|---|
| trips / success | 45 / 26 % | - |
| intake / bench need C, P | 0.78, **0.012** | (food guaranteed) |
| protein path | patch prey met in 9 of 15 (only runs with a patch edge <= 130 BU); chased 0-144, caught 0-25 (median 0); carrion within 300 BU known 0 in 13 of 15; P stores at the social-stomach ceiling where prey is caught | - |
| scouting | 4-30 trips in 8 gd, nearest approach to a P odour edge ~130 BU | - |
| eggs laid / eclosed | - | 11 / **0** (seed 2: 20-30 / 1-10) |
| brood losses (all runs) | - | egg:untended 61, hygiene 42, larva:starvation 30, pupa:untended 18 |
| brood temperature days 1-3 | - | median 15.2 C (seed 1/3 10.6-18.3 C, seed 2 20.4-23 C), falling to 5-10 C by day 5-8 |
| calendar ceiling | - | an egg laid on colony day 0-3 at the measured temperatures ecloses before winter in 1 of 7 runs checked (sg #2 day 0) |

### Ranking by measured loss (round 3)

1. **Calendar and brood temperature** (nest bench): with food guaranteed, 0 eclosions in all 10 seed-1/3 runs; at their
   brood temperatures no egg laid after the hand-over can become a worker before winter (larvae stop at doy 19). This
   alone holds the eclosion median at 0. Lever (direction 3): the default start day - integrator's ruling; the start-day
   bench (doy 7, 5) is queued (`round-3/bench-startday/`).
2. **Brood care fails with food guaranteed**: 79 eggs/pupae untended, 42 hygiene, 30 larvae starved of 231 eggs. One
   mechanism found and fixed (E1: flood-evacuation loop, we #1); nurse rest at 2 of 2 nurses and waste in the royal
   chamber remain (we #1 probe).
3. **Protein**: P/need 0.012 on the forage bench. (a) patches out of reach in 6-8 of 15 runs (lead, worldgen);
   (b) chase conversion 4-24 % where prey is met (fixed H2a, H2b); (c) carrion in reach never found (scouting);
   (d) P storage ceiling of a nest without a food chamber (0.15 P per worker) refuses caught prey on the bench.
- 09:52 **forage bench after** done (`round-3/bench-forage-after/table.md`, tree n1): over the 15 hand-overs patch prey
  appeared 1049 -> 1014, chased 485 -> 525, **kills 61 -> 123**; chase conversion (median over the 7 runs with >= 5
  chases) **4.7 % -> 23.7 %**; prey-kind P booked 5.4 -> 6.4 loads; trips that came home with remains the stores refused
  ("forage item-collected ... fail") 23 -> 62. Medians over all 15 hardly move (P/need 0.012 -> 0.013, trips 45 -> 55,
  success 26 -> 26 %): 8 runs meet no prey, and where prey is caught the P social-stomach ceiling refuses most of it on
  this bench. Hunting fix accepted on its mechanism counter (kills, conversion); the booked-P outcome is capped by the
  P storage ceiling (lead 3d). Running: nest-after (n1) 2/15, start-day benches (base).
- 10:06 start-day bench, first result (`round-3/bench-startday/`, base tree, fresh founding): woodland-edge #1 at
  `--start-doy 7` hands over after 2.74 gd with **18** first workers (doy 9: 3.53 gd, 16), brood 22 -> 15 C on days
  1-3 (doy 9: 15-16 C); with food guaranteed 26 eggs, 12 hatched, **11 pupated** (doy 9: 2), but **0 eclosed: 9 pupae
  died untended**, 1 exposure. So an earlier start moves the calendar ceiling, and the next loss is pupa care
  (pupa:untended; untended egg+pupa gd 5.1 on day 7 with 2.4 nurse worker-gd). Waiting for we #3 doy 7, we #1/#3 doy 5.
- 10:24 the background chain hit its 2 h limit at nest-after 11/15; resumed (`PAR=1 $S/n1/tools/sim/bench-sweep.sh nest
  round-3/bench-nest-after round-3/cache`, skips finished runs). Start-day: we #1 doy 7, we #3 doy 7, we #1 doy 5 done;
  we #3 doy 5 running.
- 10:30 **start-day table** (direction 3; nest bench, food guaranteed, base tree, fresh foundings; doy 9 = the cached
  default hand-overs of the nest bench before; `round-3/bench-startday/`):

  | start doy | run | hand-over gd / first workers | eggs laid | pupated | eclosed | workers hand-over -> winter |
  |---|---|---|---|---|---|---|
  | 9 (default) | we #1 | 3.53 / 16 | 10 | 2 | 0 | 16 -> 12 |
  | 9 (default) | we #3 | 4.57 / 7 | 9 | 0 | 0 | 7 -> 5 |
  | 7 | we #1 | 2.74 / 18 | 26 | 11 | 0 (9 pupae untended) | 18 -> 12 |
  | 7 | we #3 | 3.34 / 12 | 20 | 4 | 0 | 12 -> 10 |
  | 5 | we #1 | 3.45 / 18 | 47 | 18 | **13** | 18 -> **25** |
  | 5 | we #3 | 4.20 / 10 | 42 | 5 | 0 (egg:hygiene 22) | 10 -> 8 |
  | 9 (default) | sg #1 | 3.91 / 12 | 10 | 0 | 0 | 12 -> 11 |
  | 7 | sg #1 | 3.04 / 12 | 15 | 8 | 0 (7 pupae untended) | 12 -> 9 |
  | 5 | sg #1 | 3.71 / 9 | 12 | 3 | 1 (flooding 3, exposure 3) | 9 -> 8 |

  Seed 3 also improves its first workers (7 -> 12 -> 10). Earlier starts raise laying and pupation; eclosion then fails
  on pupa care (doy 7 we #1) and hygiene (doy 5 we #3). suburban-garden #1 at doy 7 and 5 running. For the
  integrator's ruling; the default is not changed here. (suburban-garden #1 rows added 10:42.)
- 10:37 **nest bench after** done (`round-3/bench-nest-after/table.md`, tree n1 = hunting fixes + E1): over the 15
  hand-overs eggs 231 -> 247, **eclosed 20 -> 7**, workers at winter 174 -> 164; losses larva:starvation 30 -> 10,
  untended 79 -> 61, flooding 7 -> 4, but **exposure 6 -> 34** and **hygiene 42 -> 76** (pp #2: eclosed 10 -> 0,
  hygiene 0 -> 14). Exposure rose in the one-chamber / flooding nests (cpv #3 0 -> 8, kd #1 2 -> 8, kd #3 0 -> 6): a dry
  place 2 BU clear of the water often lies outside every chamber (exposure 1.0 / gd) or in the waste-laden royal
  chamber. **E1 reverted** (costs more than it gains on the bench): `floodEvac.ts`, `balance/weather.ts` back to
  e614493, `dryDrop.test.ts` deleted. The loop it addressed is real and stays a lead (fix it on the board side instead:
  an item put down at a dry spot is evacuated again only when the water actually reaches it).

### Sweep findings (round 2 review) -> what this round did

- **Hunting catches little (major): real, fixed (H2a, H2b).** Reproduced: probe in a lawn test world 11 of 28 chased
  caught; forage bench before 61 kills of 485 chases over the 15 hand-overs (median conversion 4.7 % where >= 5 chases).
  Causes: (a) touch and bite each rolled the 0.6 escape (GDD 05 §2.3 says per bite attempt); (b) ants walking home empty
  after a failed trip could not break off. After: 123 kills of 525 chases, median conversion 23.7 %. The remaining
  misses are GDD rules (escape 0.6 on open ground, free-target hit 0.7 x sqrt(1.5/4) = 0.43, GDD 05 §4.2).
- **Prey on a source trip booked as that source (minor): real, fixed (H1m).** `huntSourceTrip.verify` green.
- Same-hand-over A/B divergence (minor): addressed by method - every before/after this round is a 15-hand-over bench
  median on frozen trees; no single-run attribution is made.

### Fixes (round 3; in the tree)

H2a. **One escape roll per contact** (`src/sim/ecology/creatures/preyFauna.ts`): a springtail that stays when touched
     (jump-on-touch roll failed) is not rolled again by a bite in the same 2 s contact window. Test
     `src/sim/ecology/creatures/prey.test.ts` "one escape roll per contact" (bite lands on 13 % of approaches without the
     fix; 30-50 % wanted; ~40 % with it).
H2b. **Ants going home empty hunt the prey they meet** (`src/sim/ants/behaviours/outdoor/hunt.ts` mayBreakOff /
     endChase, `keys.ts` K.returnWhy, `transitions.ts` startReturn records the reason): only after a failed trip
     (timeout, source gone or crowded, trail lost, stuck), never after curfew, weather, hunger, fatigue, threat, recall;
     after the chase the return resumes with its reason. Test `src/sim/ants/behaviours/outdoor/hunt.test.ts` case 4
     (red without).
H1m. Lifting the remains drops the trip's source (`hunt.ts`): delivered as `prey`, no source or route credited.
     `src/sim/ants/behaviours/outdoor/huntSourceTrip.verify.test.ts` (round-2 review, was red) green.
Bench before / after (forage, 15 hand-overs): kills 61 -> 123, chase conversion 4.7 -> 23.7 %, prey P booked 5.4 -> 6.4,
refused remains 23 -> 62 trips, median P/need 0.012 -> 0.013, C/need 0.78 -> 0.79, trips 45 -> 55, success 26 -> 26 %.
Tools: `tools/sim/bench-colony.ts`, `tools/sim/bench-sweep.sh`, `tools/sim/bench-table.py`, `tools/sim/bench-startday.sh`.

### Tried and reverted

- N1 (sorting destination only where a put-down lands in the chamber, `sorting.ts`) and N2 (larva with an empty gut fed
  where it lies, `board.ts`), with `sortReach.test.ts`: written for the we #1 carry loop before the probe showed the
  loop was flood evacuation; no effect on the we #1 probe. Reverted with the test.
- E1 (dry drop point 2 BU clear of the water, `floodEvac.ts` + `BROOD_DRY_DROP_SLACK_BU`), `dryDrop.test.ts`: removed the
  we #1 loop (89 carries -> 1-2; starvation 7 -> 2 in the probe) but on the 15-run nest bench exposure 6 -> 34 and
  hygiene 42 -> 76, eclosed 20 -> 7. Reverted.
- Solid loads put down only inside a chamber (`phaseNest.ts`): the lost prey on sg #1 was refused by the full P store,
  not put down in a tunnel; no effect. Reverted.

### GDD deviations

- H2a reads GDD 05 §2.3 ("escapes per bite attempt") together with the 2.2b table's "jump on touch": one roll per
  contact (the 2 s jump cooldown is the contact window). No constant changed.
- H2b: GDD 05 §2.3 has prey appear for any forager/scout moving in a patch; hunting on the way home after a failed trip
  is a behaviour choice, the reason set is listed in `hunt.ts` (HUNT_ON_RETURN). No balance change, no need, lifespan,
  provision, bar or ruling test changed; no seed or archetype case.

### Verification (10:40 UTC)

- `npx tsc --noEmit`: clean (09:10 and after the reverts).
- Folder tests (outputs `round-3/vitest/`): `ecology/creatures` 17/17 files; `ants/behaviours/outdoor` 26/27 (red
  `removal.verify`, known since round 1; `huntSourceTrip.verify` now green); `ants/behaviours/nest` 27/29 (red
  `sfaReview.verify`, `stall.soak`, known; run with E1 in, the folder is back to e614493 now); `balance` 2/2.
- New tests red without their fix (each checked by taking the fix out): prey.test "one escape roll per contact" (0.13),
  hunt.test case 4. Benches on frozen copies of the tree (`base` = e614493, `n1` = base + H2a/H2b/H1m + E1); the
  forage-after numbers above are n1's (E1 does not touch foraging).

### Next (for the integrator and round 4)

1. **Start day (integrator ruling, direction 3).** Nest bench: at doy 9 no egg laid after the hand-over can eclose before
   winter in seed-1/3 runs (calendar ceiling at the measured 11-18 C); at doy 5 woodland-edge #1 ecloses 13 and goes
   18 -> 25 workers with food guaranteed, but 4 of the 6 earlier-start runs still eclose 0-1: pupae die untended
   (we #1 doy 7: 9 of 11; sg #1 doy 7: 7 of 8). A start-day change alone does not reach the bar; with item 2 it may.
2. **Brood care with food guaranteed** (nest bench before: untended 79, hygiene 42, starvation 30 of 231 eggs; at doy 7
   9 of 11 pupae died untended): probe pupa tending (one or two nurses, rest blocks of ~100 s vs UNTENDED_GD 0.25 gd),
   waste hauling from brood chambers, and the evacuation loop (fix on the board side, see E1).
3. **Protein**: P storage of a nest without a food chamber (0.15 P per worker social stomach; 62 refused prey loads on
   the forage bench); patches out of reach (nearest edge 174-244 BU on 6 of 15, worldgen R18 placement); carrion within
   300 BU unknown in 13 of 15 (scouting coverage).
4. Bench limitations: the nest bench's 2-gd top-up can fill the stores (foragers wait in `deliver`, 41 % of worker time on
   sg #2); the forage bench's 30-worker demand meets the small nest's P ceiling.

Status: **round 3 complete** (10:45 UTC). In the tree: H2a, H2b, H1m + their tests; bench tools. Scratch copies
(`base`, `h2`, `n1`, scratchpad) and probe tools deleted; no processes of this round left running. Evidence:
`test-output/colony-life/round-3/` (bench-forage-before/after, bench-nest-before/after, bench-forage-h2-partial,
bench-startday, probe-*.txt, hunt-sg1*.txt, vitest/).

### Independent sweep after round 3

Independent engineer, 10:40-12:45 UTC Nov 17. **Table: `test-output/colony-life/round-3/sweep-table.md`** (made by
`python3 tools/sim/sweep-table.py test-output/colony-life/round-3/sweep test-output/colony-life/round-2/sweep`; runs by
`tools/sim/sweep-life.sh`, which now runs the tree it lives in, started from a frozen copy of the tree taken at 10:40,
hash `2e2c79d2`, all 15 runs on it; logs and `summary.txt` in `round-3/sweep/`). The tree = round 3 (H2a, H2b, H1m; E1,
N1/N2 and the phaseNest change reverted - checked: no diff against e614493 in `ants/behaviours/nest`,
`balance/weather.ts`) plus other engineers' commits since e614493 (difficulty accessors in temperature.ts, weather.ts,
physiology.ts, brood.ts, founding/*; neutral at Naturalist, all multipliers 1.0). Founding identical to round 2 in all
15 runs (same first workers, same hand-over times). **This table is the one the next round compares with.**

**Viability bar: NOT met** - viable 8 of 15 (round 2: 8). woodland-edge **1/3**, suburban-garden **1/3**,
playground-park 2/3, car-park-verge 3/3, kitchen-door **1/3**. 6 of 7 failures are the workers check (old age with
nothing or too little eclosed), kitchen-door #2 the starvation stage (protein, 2.5 gd worse than lean).

**Growth bar R19: NOT met** (3 of 7 checks, as in rounds 1 and 2), computed by `sweep-table.py`:

| check | round 3 | round 2 | round 1 | sweep9 |
|---|---|---|---|---|
| workers at winter >= first workers, >= 10 of 15 | **4 of 15** | 4 | 5 | 3 |
| median eclosions after hand-over >= 4 | **0** (10 of 15 none) | 0 | 0 | 0 |
| median intake/need P >= 0.7 | **0.044** | 0.031 | 0.094 | 0.141 |
| median intake/need C >= 0.9 | 1.238 ok | 1.016 | 1.258 | 0.873 |
| median trip success >= 50 % | **25.4 %** | 24.7 % | 18.2 % | 16.7 % |
| first workers >= 9, >= 13 of 15 | 13 of 15 ok | 13 | 13 | 13 |
| no `worker:lost`, >= 13 of 15 | 13 of 15 ok | 13 | 14 | 10 |

(Rounds 1 and sweep9 intake numbers include the `unknown` deliveries removed by round 2's C1.)

What the round's hunting fixes did in the sweep: **6 of 15 runs are outcome-identical to round 2** (we #1, sg #3, pp #1,
cpv #1, kd #2, kd #3: same workers, eclosions, intake, trips) - in all six no patch prey ever appeared ahead of an ant
(nearest patch edge 118-244 BU). Over the sweep: patch prey subdued 68 -> 96, prey loads home 41 -> 58, prey P booked
7.9 -> 12.7 loads (sg #2 4.1, pp #2 4.6, cpv #2 3.3 P), median P intake 0.031 -> 0.044. Trips that came home with a solid
load and were booked as failed (`item-collected ... fail`) 8 -> 21 (cpv #2 11).

Regressions against round 2 (script, 7 runs flagged; none is a bar check):
- **suburban-garden #1: viable -> NOT viable** (12 -> 9, need >= 9.6): old-age deaths 1 -> 3, nothing eclosed in
  either; C intake rose 0.51 -> 1.31 and P 0.025 -> 0.143 (honeydew 9 -> 21 loads, 2 kills). A chaotic flip at the
  line (R11 lifespans), not a mechanism of the round.
- woodland-edge #2 net workers -4 -> -5, woodland-edge #3 -2 -> -3, car-park-verge #2 +1 -> 0 (eclosions 4 -> 3):
  one worker each.
- playground-park #3 P 0.166 -> 0.062 (two carrion loads, 0.9 P, not found again), car-park-verge #3 C 0.83 -> 0.59
  (one honeydew load fewer), kitchen-door #1 larvae starved 1 -> 3 (but not viable -> viable, 11 -> 12).
- not viable -> viable: kitchen-door #1.
- Against sweep9 (econ-growth-review): viable 7 -> 8, `worker:lost`-free runs 10 -> 13, C 0.87 -> 1.24, trip success
  16.7 -> 25.4 %; P lower (0.141 -> 0.044, sweep9 inflated by `unknown` intake).

**Year two (direction 6): five long runs**, one per archetype, the lowest seed viable at winter (we #1, sg #2, pp #2,
cpv #1, kd #1), `tools/sim/longrun-life.sh` (new; `life.ts --until-day 34`, same frozen tree, same hand-overs; outputs
`round-3/sweep-long/`). Year one of each is identical to its sweep run. (--until-day counts simulated days, so runs with
the lapse go on to the first tick of Winter 2; year-2 doy 15 = first autumn row.)

| run | workers at Winter 1 | winter | first spring day: queen / workers / C / P | year 2: workers at spring d1 / summer d1 / doy 15 / last | year-2 eggs, eclosions |
|---|---|---|---|---|---|
| woodland-edge #1 | 14 | **no lapse: played in real time** (brood -1.6..6 C); 14 -> 8 by its end (old age 5, lost 1) | alive / 7 / 7.4 / 2.0 | 7 / 4 / **0** / 0 (queen alone from summer d7) | 14, 0 |
| suburban-garden #2 | 18 | lapse: 18 -> 17 | alive / 17 / 13.3 / 2.3 | 17 / 7 / 2 / 1 | 19, 0 |
| playground-park #2 | 20 | lapse: 20 -> 19, **C 7.1 -> 1.2** | alive / 19 / 1.2 / 2.1 | 19 / 15 / 4 / 1; C 0 from spring d4 (rationing -> adult-starvation) | 18, 0 |
| car-park-verge #1 | 11 | lapse: **11 -> 4** (drowning 5, disease 2) | alive / 4 / 10.5 / 3.5 | 4 / 2 / 1 / 0 | 7, 0 |
| kitchen-door #1 | 12 | lapse: **12 -> 5** (drowning 5, disease 2) | alive / 5 / 7.3 / 3.2 | 5 / 3 / 4 / 3 | 12, 3 |

Every colony that was viable at winter declines through year two to 0-4 workers by doy 15; no queen died. In all five
the queen hardly lays in the spring of year 2: laying potential is 0 until the last spring day or two (spring maximum
0-3 eggs/gd; summer 8-28), because Lasius `fTempQ` is 0 below a 14 C royal chamber and the spring brood chambers read
0.4-15.5 C; laying starts in earnest in summer, when most year-one workers have died of old age (old-age deaths 6-21
per run). Year-2 eggs 7-19 per run, eclosions 0, 0, 0, 0, 3.

Review of the round (code: `git diff e614493` on the files the round lists; outputs `round-3/sweep-review/`):
- Verified: `tsc --noEmit` clean (10:48). Folder tests: `ecology/creatures` 18/18 files; `ants/behaviours/outdoor` 26/28
  (red `removal.verify`, known, and this review's `huntReturn.verify`); `ants/behaviours/nest` 26/28 + 3 skipped (red
  `sfaReview.verify`, `stall.soak`, known); `balance` 3/3; `colony/overwinter` 3/5 + 1 skipped (red: this review's
  `heatedLog.verify`). Same known reds as the round reported.
- In a scratch copy (deleted) each round test is red with its fix taken out: prey.test "one escape roll per contact"
  (0.133 < 0.3), hunt.test case 4 (false). They test the fixes.
- Not allowed list: no lifespan, need, provision, bar or ruling-test change; no seed or archetype case; no constant
  changed. Determinism: `K.returnWhy` (ant bb) and `stayUntil` (creature bb) are persisted state; no wall clock,
  `Math.random` or `Math.hypot` added in sim code. Per-tick cost: none added (one Set lookup per think in return phase,
  one string split per `startReturn`).
- H1m: sound, no finding.
- **H2b (finding, minor): the chase from the way home does not work after a `timeout` return.**
  `src/sim/ants/behaviours/outdoor/huntReturn.verify.test.ts` (new, RED, kept): an ant sent home for `timeout` has, by
  definition, a trip clock past TRIP_TURN_S; PHASE.hunt counts as away from home in `engine.ts` `tripClock`, so on the
  next think the clock sends it home again (`startReturn` drops the bite under way) and huntCheck restarts the chase:
  3 hunt -> return flips in 30 s, longest hunt 5 ticks, 0 hits; the chase's 20 s limit (phase time) never runs out.
  Control (same ant, `trail-lost`, young clock): 0 flips, a kill after 11.5 s. The round's hunt.test case 4 uses a
  fresh outbound ant, so it cannot see this. Size: `timeout` ends 65 of the sweep's trips (round 2: 79 of 870).
- **H2a (note for the integrator, documented deviation):** `src/sim/ecology/creatures/preyContact.verify.test.ts`
  (new, green): after a touch it stayed for, a springtail is bitten with no escape roll for the whole 2 s window - by
  the same ant's second bite (bite cycle 1.0 s) and by a second ant (0 escapes; > 40 springtails that stayed); GDD 05 §2.3 "per bite
  attempt" would roll 0.6 each. The ledger lists the one-roll-per-contact reading as a deviation; the measured scope is
  wider than one roll per approach.
- **R21 (finding, major): ruling R21 (direction 5, binding since 09:20) is not implemented.** No larder pile, no
  `stores-full` planning trigger in the tree (grep); the round lists the P ceiling only as a lead. The round's own bench
  counted 62 refused prey loads; the sweep 21 trips home with a solid load booked as failed (cpv #2 11).
- **Heated-nest log (finding, blocker by direction 6; found by the year-two runs, code outside the round's diff):**
  woodland-edge #1, viable at winter, gets no overwintering lapse. Probe on the same hand-over
  (`round-3/sweep-review/probe-winter-we1.txt`, tool deleted): at Winter 1 day 1 the colony has had no brood for about 4 gd
  (chamber reading null), but `lifecycle.broodTempLog` still holds 48 samples from when brood lived
  (21.4 .. 14.2 C, mean 14.63 >= WINTER_ACTIVE_TMEAN_C 14): `sampleBroodTemp` (`colony/overwinter/begin.ts`) refreshes
  the log's timestamp every hour but adds no sample without brood, so `broodLogFresh` stays true and `heatedNest` says
  "heated". The winter runs tick by tick at -1.6..6 C, workers age at the active rate (14 -> 8), the colony is dead by
  year-2 summer. `src/sim/colony/overwinter/heatedLog.verify.test.ts` (new, RED, kept): a log of 20 C samples, then
  3 gd with no brood in a 4 C nest -> still heated. Any colony whose brood dies out (or is all in diapause) days before winter can hit this: 7 of 15 sweep runs
  end with no brood or only diapause brood.

Leads from the failing runs' own diagnostics (most costly first):
1. **Year two: every winter-viable colony dies out** (table above). (a) Heated-nest log bug (we #1; fix in
   `overwinter/begin.ts`, red test above). (b) The queen hardly lays in spring: brood chambers 0.4-15.5 C vs `fTempQ` 0 at
   14 C; the first year-2 eggs come in summer, after the year-one workers' old age (R11 stands) - for the integrator's
   restated R19/R20 and the warm-nursery evidence (direction 6). (c) Winter losses 58-64 % on cpv #1 and kd #1 (winter
   model flood 5 + disease 2 each) and pp #2's C stores 7.1 -> 1.2 over the winter, 0 in spring.
2. **Calendar, year one**: all 10 seed-1/3 runs eclose 0 (brood 9-17 C on days 0-3, falling to 4-8 C); seed-2 runs
   (21-24 C) eclose 2-8. Same split as rounds 1-2; integrator's R20.
3. **Pupae lost in the only runs that can eclose**: seed-2 runs pupated 46 and eclosed 25; pupa losses there 21
   (untended 16: we #2 6, sg #2 4, cpv #2 4, kd #2 2; exposure 3, hygiene 2). Sweep-wide brood losses: egg:untended 53,
   larva:starvation 21, pupa:untended 17, egg:exposure 10, egg:flooding 5 of 189 eggs.
4. **Larvae starve with protein in store**: we #1 8 (P 2.56 at winter), cpv #1 6 (P 3.79), pp #3 4 (P 3.35), kd #1 3
   (P 3.47) - unchanged since round 2; the round's we #1 probe tied we #1's to the flood-evacuation loop (E1 reverted;
   the board-side fix is open).
5. **Protein**: P median 0.044. No patch prey met in 6 runs (patch edge 118-244 BU); kd #2 fails viability on protein
   alone (P 0.025, P stores 0); R21 not implemented (21 refused solid-load trips).
6. **Seed-3 brood**: we #3, sg #3, cpv #3, kd #3 hatch 0 of 44 eggs (untended 24, exposure 6, flooding 5; brood
   9-12 C on days 0-3).
7. **Stuck/locomotion**: `walker-stuck-explosion` 6-16 violations in 10 runs (as round 2); stuck ant-gd sg #2 14.3,
   kd #2 12.5, pp #2 10.7; cpv #2 81 trips ending `stuck`.
8. H2b `timeout` flip (red test above), small.

Scratch copies (`/home/user/frozen-sweep3`, scratchpad) and the probe tool deleted; no processes left running.

## Round 4

> **INTEGRATOR NOTE (13:05 UTC, binding; also direction 8 in `colony-life.md`).** The year-two runs of sweep 3 make year two the first priority after W1, R21 and R20. Targets on the five long runs (R22): alive in spring with ≥ 0.7 × winter workers in ≥ 4 of 5; ≥ 2 × first workers by day 15 of year two in ≥ 3 of 5. Three things to establish with numbers, on long runs made **after** R20 (start day 5):
> 1. **Winter losses.** car-park-verge #1 and kitchen-door #1 lose 58–64 % in the lapse (drowning 5, disease 2 each). Show what in the lapse model produced them and what the GDD's formula expects for a colony that enters winter viable in a nest with no flood in the weeks before. Rule (R24): a colony that passes the viability bar at winter loses at most 15 % of its workers in the lapse on Naturalist, unless a hazard the player was alerted to before winter (flood-prone chamber, disease, short stores) is the cause, and then the losses follow the same rules as live play. Fix the lapse model to that; record the deviation if the GDD's numbers say otherwise.
> 2. **Winter stores.** playground-park #2 enters winter with C 7.1 and has 1.2 in spring, 0 by spring day 4. Show the lapse's consumption against the design's winter need and whether the viability bar's stores check (≥ 1 gd of adult need) is simply too low for a winter; propose the stores check the calendar requires (the integrator rules).
> 3. **Spring laying.** Report for each long run the day of the first year-two egg and the royal chamber and warmest dry chamber temperature by day through spring. Target: first eggs by spring day 4 in ≥ 4 of 5, first year-two workers before the overwintered workers age out. If the deep royal chamber is the limiter, the lever is the colony using its warmest dry chamber (the existing queen relocation and brood sorting; a shallow nursery in the architect's early plan), not the laying curve and not lifespans. Evidence first; build it only if the numbers say it is needed.

Engineer: round 4 (started 12:42 UTC Nov 17). Evidence: `test-output/colony-life/round-4/`. Order of work: the sweep's
blocker (heated-nest log) and major (R21 larder), then R20 (start day 5, regenerate hand-overs, re-base benches), then
the method (account, rank, fix).

Progress (kept current; a successor continues from here)
- 12:42 read spec, ledger, STATUS (to R23). Tree = HEAD 5c8c576 + other engineers' uncommitted files; no round-4 change
  yet. Next: reproduce heated-nest log (red `colony/overwinter/heatedLog.verify.test.ts`), fix in `overwinter/begin.ts`.
- 12:47 **W1 done** (blocker (a), heated-nest log): `colony/overwinter/begin.ts` keeps the tick of every sample (new
  additive `LifecycleState.broodTempTicks`, `types/lifecycle.ts`; a log without ticks is read as hourly ending at
  `broodTempTick`) and drops samples older than WINTER_ACTIVE_WINDOW_GD in the sampler and in `heatedNest`; an empty
  window falls back to the chambers now / the cluster. `heatedLog.verify` red on HEAD's begin.ts
  (`{"n":48,"first":20}` -> heated), green now; overwinter folder 4 passed + 1 skipped. Next: R21 larder.
- 12:53 **L1 (R21 larder) in the tree, unit-tested**: `colony/stores.ts` `measureLarder` (called by `economy.ts`
  `closeColonyCycle` after the needs): with no food (or granary) chamber, `core.larderC/P` = max(LARDER_MIN_LOADS 4,
  LARDER_NEED_GD 1 x needRates) per nutrient, in the chamber with most brood (`core.larderChamberId`); `poolSpace`
  fills stomach -> larder -> shared piles per nutrient; `spoil` counts the larder as pile; `storeTempC` and spoiled items
  use the larder's chamber. R21 (b): `colony/index.ts` `depositFood` sets `core.larderRefusedTick` when a delivery is
  refused while a larder exists; `nest/architect/needs.ts` `liveInputs.foodRefused` makes the first food chamber a
  `missing-type` at any worker count. Constants in `balance/colony.ts`; additive fields in `types/colony.ts`.
  Test `colony/larder.test.ts` (4 cases, all red with the larder switched off). Next: folder tests colony + nest, then R20.
- 12:57 **R20 in the tree**: `species/data/lasius-niger.ts` `startDoy {min 5, max 9, default 5}`. Tests that state the
  start day changed: `species/consistency.test.ts`, `species/lasiusData.test.ts`, `species/data/lasius.table.test.ts`,
  `createGame.test.ts` (spring day 5; with 10-day seasons the config keeps spring day 5), `environment/weatherStart.test.ts`
  (doy 5), `types/d7.test.ts` (window 5-9 through `naturalStart`; the season-length case moves to doy 9 itself).
  Decision: `testing/testWorld.ts` `makeTestSim` pins Lasius test sims to summer day 2 (`TEST_START`, the pre-R20 day)
  unless a test sets its own start: behaviour tests were written for a warm summer afternoon; the game's start day is
  tested through `defaultGameConfig`/`createNewGame`. Next: folder tests for the R20 change, then regenerate hand-overs.
- 12:58 running (background): (1) folder tests species/environment/config/types/testing/colony + `src/sim/*.test.ts`
  -> `round-4/vitest-*.txt` (done marker `round-4/vitest-r20.done`); (2) the 15 hand-overs at the new default start,
  from a frozen copy of the tree (scratchpad `r4a` = tree at 13:48 with W1 + L1 + R20) via the new
  `tools/sim/handover-sweep.sh round-4/cache round-4/handover` (restart-safe: re-run the same command, existing
  snapshots are skipped). If the scratch copy is lost: copy src tools *.json *.ts configs again (W1, L1, R20 are in the tree).
- 13:02 blocker (b) checked, **not a code defect**: cpv #1 and kd #1 lost exactly drowning 5 + disease 2 in the lapse
  because both are seed 1: `rng.winter` is forked from the world seed only (`sim.ts` rngStream) and first drawn at
  Begin, so every seed-1 game draws the same winter (one fungus outbreak, one flood), whatever the archetype. The losses
  follow GDD 06 §6.3 as written (`overwinter/model.ts`: flood P = 0.3 (1 - floodSafety) rain/16, loss 0.5 of the
  cluster; fungus P 0.05 (x3 humid), loss U(0.10, 0.25)). So the five long runs are not five independent winters:
  three are seed 1 (we #1 had no lapse because of the W1 bug). pp #2's C 7.1 -> 1.2 is the model's consumption
  ((20 x 0.08 + 0.3) x fMet 0.35 x 7 d = 4.7 + larvae); its spring C hits 0 on day 4: autumn stock and spring foraging,
  not the winter. Not changed (a forked stream per archetype would change every game's draws and void every cache).
  (c) spring laying (fTempQ 0 below 14 C, GDD 07 species data) is evidence for the integrator, as the review says.
- 13:05 **H3 (sweep minor H2b) in the tree**: `ants/behaviours/outdoor/engine.ts` `tripClock` does not turn home a
  chase begun on the way home (`chaseOnTheWayHome`: PHASE.hunt with `K.huntFrom` = return); HUNT_CHASE_S and
  TRIP_LOST_S still bound it. `huntReturn.verify` red with the check switched off, green with it; `hunt.test` green.
  H2a (contact window, minor): left as the documented deviation for the integrator's ruling.
- 13:10 read the integrator note (direction 8, R24). Plan from here: (1) R24 lapse loss cap in `overwinter/begin.ts`
  with a unit test; (2) when the 15 hand-overs are done: five long runs after R20 (one per archetype) to year-2 doy 15
  with the spring readings direction 8 asks for (first year-2 egg, royal and warmest dry chamber by day); (3) benches
  on the new hand-overs (nest, forage) for the ranking. Frozen trees in the scratchpad: `base` = git archive 5c8c576
  (round start) + R20 + bench tools, for "before"; `r4b` = tree at 13:10 (W1 L1 R20 H3).
- 13:14 **WL1 (R24 lapse loss cap) in the tree**: `colony/overwinter/model.ts` `capLapseLosses` (pure): the drawn worker
  losses of causes nobody was alerted to are trimmed to WINT_LAPSE_LOSS_CAP_FRAC 0.15 x `winterLossMult` x workers
  (floor; old age keeps its share first); alerted causes follow the model in full. `begin.ts`: alerted = a
  `nest-flooding`/`founding-flooding` alert (-> drowning) or `food-c-low`/`colony-starving` (-> starvation) active within
  WINT_HAZARD_WINDOW_SEASONS 1 (the autumn) before Begin (noted every check by the overwinter system, `noteHazardAlerts`, into the additive
  `LifecycleState.hazardAlertTicks`), and starvation also when the stores at Begin are below the winter's C need by the
  notice's own arithmetic (`storeDays` < winter days). Cold, disease and old age have no alert before winter: always
  capped. The presentation's day series is scaled to the applied losses. Decision: the cap applies to every colony (no
  in-sim "viable" verdict): a non-viable colony's usual failure, short stores, is the alerted case. Constants in
  `balance/lifecycle.ts`. Test `colony/overwinter/lossCap.test.ts` (pure cases; 12 seeds of a flood-prone nest: <= cap
  without an alert, floods above the cap with one); red with the cap off (seed 1 loses 13 of 20). Overwinter folder
  green (33 + 1 skipped), incl. App. E 20 "starving colony halves the workers" (short stores -> alerted).
- 13:17 tools: `lifeMetrics.ts` day rows now carry `year`, `doy`, `royalTempC`, `queenChamberTempC`, `warmestDry`
  (temperature, type, depth of the warmest chamber that is neither flooded nor wet); new `tools/sim/longrun-table.py DIR`
  (year-two table: R22 checks, first year-2 egg, spring temperatures by day); `longrun-life.sh` takes `CACHE_ANY=1`.
  Frozen tree for the long runs: scratchpad `r4c` (= tree at 13:17: W1 L1 R20 H3 WL1 + tools); `r4b` deleted (superseded).
  Next when the hand-overs end (~13:50): `CACHE_ANY=1 UNTIL_DAY=32 $S/r4c/tools/sim/longrun-life.sh
  $PWD/test-output/colony-life/round-4/long $PWD/test-output/colony-life/round-4/cache "woodland-edge:1
  suburban-garden:2 playground-park:2 car-park-verge:1 kitchen-door:1"` (round 3's five, for comparison).
- 13:28 folder tests (outputs `round-4/vitest-*.txt`): outdoor 27/28 (red `removal.verify`, known; `huntReturn.verify`
  green now); nest 54/55 + 1 skipped (red `escapeDig`, known); colony 55/56 (red `founding/reopen`, known; run before
  WL1, overwinter re-run green after it); species 12/12; config 5/5; environment: `weather.test` "uses only the weather
  stream" red on HEAD's start day too (not this round), human `effects.test` E14 was red with the R20 start (spring sward
  regrowth) -> `environment/human/testkit.ts` pins its sims to TEST_START, human folder 11/11; types: `ids.test` (known);
  testing: `layering` (others' test files importing `@/content`, `@/game`) and `stage1a.e2e` (c) save/restore hash red
  (also red on the round-start tree 5c8c576, start day 9 or 5, scratch copy);
  `src/sim/*.test.ts`: `commands*`, `services`, `time` red on others' modules (fungus/granary systems, human.ts, presetDisplay.ts).
  None of these touch a round-4 file except where fixed above. Hand-overs 9/15 done.
- 13:41 **15 hand-overs at the R20 default (doy 5)** in `round-4/cache/*-any.bin` (logs `round-4/handover/`, tree r4a;
  the founding is unchanged by W1/L1/H3/WL1: workers are 0 until the hand-over). Against sweep 3's day-9 foundings:

  | run | day 9 (sweep 3): gd / first workers | day 5: gd / first workers |
  |---|---|---|
  | we #1 / #2 / #3 | 3.53 / 16, 2.81 / 15, 4.57 / 7 | 3.45 / 18, 4.67 / **8**, 4.20 / 10 |
  | sg #1 / #2 / #3 | 3.91 / 12, 2.79 / 16, 4.59 / 9 | 3.71 / 9, 4.63 / 11, 4.21 / 10 |
  | pp #1 / #2 / #3 | 3.89 / 13, 2.75 / 16, 3.59 / 12 | 3.70 / 13, 4.57 / 11, 3.64 / 13 |
  | cpv #1 / #2 / #3 | 3.59 / 13, 2.75 / 15, 4.25 / 9 | 3.49 / 11, 4.57 / 9, 3.76 / 11 |
  | kd #1 / #2 / #3 | 3.48 / 15, 2.80 / 15, 4.56 / 7 | 3.42 / 15, 4.67 / 10, 4.19 / 9 |

  First workers 190 -> 168 in all; >= 9 in 14 of 15 (day 9: 13). **The cooler spring founding costs the seed-2 runs**
  (day 9: 2.75-2.81 gd, 15-16 workers; day 5: 4.57-4.67 gd, 8-11 workers); seed 3 gains (7-9 -> 9-11), seed 1 is mixed.
  For the integrator (direction 7 asked to say so with numbers). Running now: the five long runs (tree r4c) ->
  `round-4/long/` (restart-safe: re-run the 13:17 command). Then the benches on these hand-overs.
- 13:46 long run woodland-edge #1 ended with exit 143 (SIGTERM from outside, 3 min in; load average 8-10 on the
  machine); not this round's tooling. It is re-run after the batch (the script skips only runs with a JSON).
- 14:03 first long runs (tree r4c, `round-4/long/`): suburban-garden #2 11 -> 1 workers, playground-park #2 11 -> 0,
  both **in year one**: brood laid 32 / 28, eclosed 0, lost to **hygiene 27 / 22** (eggs, larvae, pupae in the one
  royal chamber); deaths old-age 7 / 4, predation 2 / 7 (predators act now: threats-live's work is in the tree), crushed
  1 / 0. Both nests have only the royal chamber. Suspect: the R21 larder puts its spoiling P (the hand-over provision
  now moves into the larder at once: P 5.35 at day 1) and its spoiled-food items in the brood chamber. Next: A/B on the
  same hand-over, r4c vs r4c with the larder switched off (scratchpad `noL1`), sg #2 and pp #2, 8 days, once the
  running long runs (cpv #1, kd #1) end; we #1 long run still to re-run.
- 14:26 long runs cpv #1, kd #1 done; table `round-4/long/longrun-table.md` (tool `longrun-table.py`). All four so far fail
  in **year one**: workers at Winter 1 11 -> 11 (cpv #1), 15 -> 8 (kd #1), 11 -> 3 (pp #2), 11 -> 5 (sg #2); eclosed
  5, 4, 0, 0; deaths old-age 10 / 9 / 4 / 7, predation 3 / 3 / 7 / 2, drowning 3 / 3 (in the lapse, flood alerted
  before winter: both seed 1, same autumn weather), crushed 0 / 3 / 0 / 1. Lapse: cpv #1 11 -> 6, kd #1 8 -> 4 (cap 1 +
  alerted drowning 3 each), sg #2 5 -> 5, pp #2 3 -> 2. **Spring readings (direction 8.3)**: every chamber of these
  nests is 9-12 BU deep (36-48 mm) and the royal chamber *is* the warmest dry one: royal 0.9-3.2 C on spring day 1,
  4.6-8.4 C on day 3-4, 10-15 C on day 5-7; fTempQ is 0 below 14 C, so laying potential is 0 until about day 7 (kd #1
  1.6 eggs/gd on day 7). No warmer dry chamber exists to move the queen or brood to: the lever "use the warmest dry
  chamber" has nothing to work with in these nests. First year-2 egg: doy 3 (sg #2, pp #2: leftover budget, potential
  0), 16 (cpv #1), none by doy 15 (kd #1). Overwintered workers are 1-6 at spring day 1 and 1-2 by day 7 (old age).
- 14:26 A/B larder on/off (same sg #2 hand-over, 8 days, `round-4/ab-larder/`): brood hygiene losses on 18, off 15
  (egg 5/4, larva 9/7, pupa 4/4), eclosed 0 both: **the hygiene loss is there without the larder**. pp #2 pair running.
  Next: probe the waste in the brood chamber (`tools/sim/probe-waste.ts`, probe, deleted after) and re-run we #1 long.
- 14:31 pp #2 A/B larder on/off: hygiene 17 / 17, eclosed 0 / 0; predation 7 / 8 workers in 8 days. **The larder is
  not the cause** (kept). Probe (`round-4/probe-waste-sg2.txt`, sg #2, 5 gd): 0 waste items dumped; from 2.0 gd the
  only entrance reads `sealing` to the end, waste piles in the royal chamber (spoiled food 4, brood corpses 16, meconium
  4: 24 items, tolerance 3) and the brood dies of hygiene. Probe (`round-4/probe-entrance-sg2.txt`, 1.8-2.2 gd): no ant
  within 4 BU; plugCount 6 -> 10 -> 18 as **open carve samples still flagged PLUG** deep in the throat (substrate
  -8..-13 mm) close again (open 64-116): plug soil the founding reopen dug away without clearing the flag, refilled by
  a tamped pellet. Round 1's trigger in a new form (G1 only forgot ghosts above the ground).
- 14:38 **E2 in the tree**: `nest/entrances.ts` `forgetGhostPlugs` also drops the PLUG flag of *open* samples in an open
  entrance's throat (an open sample is no plug; only `seal-entrance` adds plug, GDD 03 §4.2). Test
  `nest/plugFill.test.ts` (fill over open flagged samples keeps the entrance `open`: red without, plugCount 1; a real
  `seal-entrance` plug still seals); `plugBaseline.verify` green. Next: freeze `r4d`, probe sg #2 again, A/B.
- 14:58 probe after E2 (`round-4/probe-waste-sg2-e2*.txt`, tree r4d): the entrance stays `open` and a surface midden
  exists, but still 0 waste dumped: haul demand 1.6-1.8, **haul workers 0** most of the time. GDD 02 §6.3 auto mode:
  ΣD > A (9 workers), pass 1 gives ceil(0.5 D) in the order nurse, queen-care, forage, store, tend, scout, haul: the
  workers run out before haul. **H4 in the tree**: `colony/allocation/targets.ts` `withHygiene`: while a chamber holding
  brood has waste at the hygiene tolerance (BROOD_HAZARD.wasteTolerance 3, last colony cycle's count;
  `allocation/index.ts` `broodAmongWaste`), haul ranks right after queen-care. GDD deviation (the fixed order). Test
  `colony/allocation/hygiene.test.ts` (a 9-worker demand: haul 0 in the GDD order, 1 with waste among the brood).
- 15:05 probe after H4 (`round-4/probe-waste-sg2-h4.txt`, `probe-haul-sg2*.txt`, tree r4e): a hauler now exists, but
  it carries the **same two ant corpses** (priority 3) to the surface midden and back again, ~10 trips in 0.4 gd: the
  midden point has the terrain's height (y 26.5) while the corpse lies on a stone at y 58.4, 32 mm off, so `atMidden`
  (3D, MIDDEN_RADIUS_BU 6 = 24 mm) is false and the corpse is a job again; waste (priority 2) is never reached.
  **M1 in the tree**: `ants/behaviours/nest/haul.ts` `atMidden` measures across the ground (x, z) for a surface midden
  (3D for a midden chamber). Test `ants/behaviours/nest/haulMidden.test.ts` (8 BU above the point: at the midden; red
  with the 3D rule). Next: probe sg #2 with E2 + H4 + M1 (tree r4f), then the A/B life runs.
- 15:00 probe sg #2 with E2 + H4 + M1 (`round-4/probe-waste-sg2-m1.txt`, 5 gd): 15 waste items dumped at the midden
  (before: 0), a nursery dug at 1.9 gd, waste among the brood at most 3, **brood hygiene deaths 0** (before 16 in 5
  gd); remaining brood losses larva:starvation 4, cannibalised 5, egg:untended 2. Running: 8-day life A/B on the same
  hand-overs (sg #2, pp #2), tree r4f vs the round's "on" runs (r4c) -> `round-4/ab-hygiene/`.
- 15:06 **8-day A/B on the same hand-overs** (`round-4/ab-hygiene/` = tree r4f with E2 + H4 + M1, against
  `round-4/ab-larder/on/` = tree r4c): suburban-garden #2 brood hygiene losses 18 -> 0, eclosed 0 -> 4, workers
  11 -> 6 vs 11 -> 11; playground-park #2 hygiene 17 -> 8, eclosed 0 -> 1, workers 11 -> 3 both (predation 7 / 9 of
  them: threats-live's predators), larvae starved 0 -> 5 (P intake 0.015-0.05 of need).
  Running now (restart-safe; re-run the same commands, finished runs are skipped):
  `PAR=1 CACHE_ANY=1 UNTIL_DAY=32 $S/r4f/tools/sim/longrun-life.sh $P/long-r4f $P/cache "suburban-garden:2
  woodland-edge:1 playground-park:2 car-park-verge:1 kitchen-door:1"` and `PAR=1 $S/r4f/tools/sim/bench-sweep.sh nest
  $P/bench-nest-after $P/cache` ($S = scratchpad, $P = test-output/colony-life/round-4; tree r4f = the working tree at
  14:58 incl. M1). Next: nest bench "before" on r4c when the long runs end (`PAR=1 $S/r4c/tools/sim/bench-sweep.sh nest
  $P/bench-nest-before $P/cache`), then the tables. Folder tests behaviours/nest, colony, nest running (vitest-*2.txt).
- 15:08 folder tests on the tree with E2 + H4 + M1 (`round-4/vitest-behnest.txt`, `vitest-colony2.txt`,
  `vitest-nest2.txt`): ants/behaviours/nest 27/29 + 3 skipped (red `stall.soak`, `sfaReview.verify`: known since round
  1); colony 57/58 + 3 skipped (red `founding/reopen`, known); nest 55/56 + 1 skipped (red `escapeDig`, known). New tests
  green: `haulMidden`, `plugFill`, `allocation/hygiene`, `larder`, `lossCap`, `heatedLog.verify`, `huntReturn.verify`.
  Long run sg #2 and the nest bench run at ~13 ms/tick (machine load): ~35 min per long run, ~17 min per bench run.

### Funnel of the studied runs (round 4; R20 hand-overs, long runs on tree r4c = W1 L1 R20 H3 WL1)

| | suburban-garden #2 | playground-park #2 | car-park-verge #1 | kitchen-door #1 |
|---|---|---|---|---|
| hand-over (doy 5 start) | 4.63 gd, 11 workers | 4.57 gd, 11 | 3.49 gd, 11 | 3.42 gd, 15 |
| workers at Winter 1 / spring d1 / y2 doy 15 | 5 / 5 / 1 | 3 / 2 / 0 | 11 / 6 / 1 | 8 / 4 / 1 |
| brood year 1: laid / eclosed | 32 / 0 | 28 / 0 | 20 / 5 | 18 / 4 |
| brood losses year 1 | hygiene 27, starvation 2, base 2, exposure 1 | hygiene 22, base 4, untended 2 | flooding 5, untended 5, hygiene 2, starvation 1 | starvation 4, untended 3, hygiene 2, temperature 2 |
| adult deaths (whole run) | old-age 7, predation 2, crushed 1 | predation 7, old-age 4 | old-age 10, predation 3, drowning 3 | old-age 9, predation 3, crushed 3, drowning 3 |
| nest | royal chamber only | royal only | royal, nursery, food | royal, nursery, food |
| waste dumped (probe, sg #2, 5 gd) | 0 of 24 items: entrance `sealing` from 2.0 gd (E2); then haul 0 workers (H4); then haulers loop on 2 corpses at the midden (M1) | | | |
| spring y2: royal = warmest dry chamber, C | d1 0.9, d4 8.4, d7 12.4 | d1 1.1, d4 7.9, d7 10.7 | d1 1.4, d4 7.1, d7 11.0 | d1 3.2, d4 11.6, d7 15.4 |

### Ranking by measured loss (round 4)

1. **Brood lost to hygiene in one-chamber nests** (sg #2 27 of 32 eggs, pp #2 22 of 28; A/B with the larder off: the
   same, so not R21): three defects in a chain, each enough to stop all waste removal: (a) the entrance read `sealing`
   with no plug added (E2), (b) the allocator gave `haul` no worker in a short colony (H4), (c) haulers looped on
   corpses at a surface midden on a stone (M1). Fixed: sg #2 8-day A/B hygiene 18 -> 0, eclosed 0 -> 4, workers held
   11 -> 11 (was 11 -> 6).
2. **Year-one workers die of old age before year-one brood replaces them** (old-age 4-10 per long run; R11 stands):
   follows from 1 (no eclosions) and from the spring founding's longer, cooler lapse; not changed.
3. **Predation** (2-9 workers per run, new with threats-live's predators in the tree): pp #2 lost 7-9 of 11 in 8 days.
   Not this task's module at the moment (threats-live is calibrating it); reported.
4. **Year two**: lapse losses now capped (WL1); spring laying blocked by temperature in every chamber of these
   shallow nests until spring day ~7 (no warmer chamber exists); overwintered workers 1-6 at spring day 1.
5. Larvae starving with P intake 0.015-0.1 of need (pp #2 5 in 8 days after the hygiene fix): protein, as in round 3.

### Fixes (round 4; in the tree)

W1. **Heated-nest log** (sweep blocker a): `colony/overwinter/begin.ts` + additive `LifecycleState.broodTempTicks`:
    samples carry their tick; samples older than WINTER_ACTIVE_WINDOW_GD are dropped in the sampler and in
    `heatedNest`; an empty window falls back to the chambers now / the cluster. Test `overwinter/heatedLog.verify` (the
    review's; red before, green).
L1. **R21 larder** (sweep major): `colony/stores.ts` `measureLarder`, `poolSpace`, `spoil`, `storeChamber`;
    `colony/economy.ts`; `colony/index.ts` `depositFood` (refusal -> `core.larderRefusedTick`);
    `nest/architect/needs.ts` (`foodRefused` -> first food chamber is a missing type); constants LARDER_NEED_GD 1,
    LARDER_MIN_LOADS 4 (`balance/colony.ts`); additive `ColonyCoreState.larderC/larderP/larderChamberId/
    larderRefusedTick`. Test `colony/larder.test.ts` (4 cases; red with the larder off). A/B on sg #2 / pp #2: brood
    hygiene 18/15 and 17/17 with/without: the larder does not cause the hygiene loss.
R20. Start day 5 (`species/data/lasius-niger.ts`); tests that state it updated; `testing/testWorld.ts` `TEST_START`
    pins test sims (and `environment/human/testkit.ts`) to summer day 2.
H3. Chase on the way home not turned home by the trip clock (`ants/behaviours/outdoor/engine.ts`; review minor H2b).
    Test `outdoor/huntReturn.verify` (the review's; red before, green).
WL1. **R24 lapse loss cap** (`overwinter/model.ts` `capLapseLosses`, `begin.ts` `alertedCauses`/`noteHazardAlerts`,
    `system.ts`; `balance/lifecycle.ts` WINT_LAPSE_LOSS_CAP_FRAC 0.15 x winterLossMult, WINT_HAZARD_WINDOW_SEASONS 1,
    WINT_ALERTED_CAUSES; additive `LifecycleState.hazardAlertTicks`). Test `overwinter/lossCap.test.ts` (red with the cap
    off: seed 1 loses 13 of 20). Long runs: cpv #1 11 -> 6 and kd #1 8 -> 4 in the lapse = cap 1 + drowning 3 that was
    alerted (seed-1 autumn flood alerts).
E2. **No plug from soil over old plug flags** (`nest/entrances.ts` `forgetGhostPlugs`: open flagged samples lose the
    flag while the entrance is open). Test `nest/plugFill.test.ts` (red without: plugCount 1, `sealing`). Probe sg #2:
    the entrance stays `open` (was `sealing` from 2.0 gd to the end).
H4. **Haul after queen-care while brood lies among waste** (`colony/allocation/targets.ts` `withHygiene`,
    `allocation/index.ts` `broodAmongWaste`). Test `colony/allocation/hygiene.test.ts`.
M1. **Surface midden measured across the ground** (`ants/behaviours/nest/haul.ts` `atMidden`, exported for the test).
    Test `ants/behaviours/nest/haulMidden.test.ts` (red with the 3D rule).
    E2 + H4 + M1 together, sg #2 8-day A/B (same hand-over): waste dumped 0 -> 15 in 5 gd (probe), brood hygiene losses
    18 -> 0, eclosed 0 -> 4, workers 11 -> 6 vs 11 -> 11; pp #2 hygiene 17 -> 8, eclosed 0 -> 1 (predation 9 of 11).
Tools: `tools/sim/handover-sweep.sh`, `longrun-table.py`, `longrun-life.sh` (CACHE_ANY, PAR), `lifeMetrics.ts`
(year, doy, royal / queen-chamber / warmest-dry temperatures in the day rows). Probes `probe-waste.ts`,
`probe-entrance.ts` (deleted at the end of the round).

### GDD deviations (round 4)

- R20 (ruling): Lasius `startDoy` {5, 9, 5} against the real flight season (GDD 07 species data, GDD 06 §1.6 table).
  App strings for the app engineer: `src/ui/screens/newgame/species.ts` Lasius `foundingSeason: 'summer'` -> spring;
  GDD 06 §1.6 start table "Start: summer, afternoon" for Lasius. Codex texts on the real flight season (behaviours.ts,
  provenanceBio.ts) describe biology and need no change.
- R21 (ruling): pile capacity outside food chambers (GDD 03 §6.4). Larder per nutrient, the shared chamber piles after.
- R24 (ruling): lapse losses capped (GDD 06 §6.3 flood 0.5 of occupants and fungus U(0.10, 0.25) can take more than half
  a viable colony in one draw). The cap is x winterLossMult; alerted causes: nest flooding and short stores (alerts
  `nest-flooding`, `founding-flooding`, `food-c-low`, `colony-starving`, or stores below the notice's winter need);
  cold, disease and old age have no alert before winter, so they are always capped. Applies to every colony (no in-sim
  viability verdict).
- H4: GDD 02 §6.3's auto priority order changes while brood lies among waste at the hygiene tolerance (haul after
  queen-care).
- M1: GDD 02 §10.8 midden: "at the midden" is measured across the ground for a surface midden.
- Test sims start on summer day 2 (TEST_START), not the species day: a test fixture choice, not a game rule.

### Tried and reverted (round 4)

- Nothing reverted. The larder was suspected for the hygiene loss and kept after the A/B (above).

### Year two (direction 8), round-4 findings

1. **Winter losses**: cpv #1 / kd #1's 58-64 % in sweep 3 were one draw (both seed 1: `rng.winter` is forked from the
   world seed only, first drawn at Begin; one fungus outbreak + one flood, GDD 06 §6.3 as written: flood 0.5 of the
   cluster, fungus U(0.10, 0.25)). For a colony that enters winter viable with no flood before, the GDD's expected loss
   is base 6 % (old workers x2) + cold stress 0.008/C-day below 2 C + P(fungus) 5 % x 17 % + P(flood) per rain end
   0.3 (1 - floodSafety) rain/16: about 7-12 % in expectation, but a single draw can take 50-70 %. R24 caps it (WL1);
   with the cap, the R20 long runs lost 1 + 3 (cpv #1) and 1 + 3 (kd #1), the 3 being drowning after autumn flood
   alerts (live-play rules, as R24 says).
2. **Winter stores**: pp #2 (sweep 3) entered winter with C 7.1 for 20 workers (adult need 0.653 C/gd, so the viability
   check's 1 gd is 0.65 C). The lapse took 5.9 C (7 days x (20 x 0.08 + 0.3 + 0.02 x 1) x fMet 0.44 at a cluster near
   9 C = 0.84 C/day): the winter alone needs about 9 gd of summer adult need. In spring the nest is below 10 C until
   about day 4 (round-4 long runs) and foraging brings little: pp #2's C went 1.2 -> 0 by spring day 4. **Proposal for
   the integrator**: the stores check at winter = the lapse's own C need (winter days x `dayNeedC` at the cluster's
   current temperature, the arithmetic of the winter notice) + 4 gd of spring adult need; for pp #2: 5.9 + 4 x 0.55 =
   8.1 > 7.1, not viable by that check. In summer-need terms about 12-13 gd for a Lasius colony.
3. **Spring laying**: in the four R20 long runs every chamber is 9-12 BU deep and the royal chamber is the warmest dry
   chamber on every spring day (table in `round-4/long/longrun-table.md`): 0.9-3.2 C on day 1, 7-12 C on day 4,
   10.7-15.4 C on day 7. fTempQ is 0 below 14 C: laying potential 0 until day 7 (kd #1 1.6 eggs/gd that day). No warmer
   chamber exists, so queen relocation or brood sorting cannot help; a warmer spring nursery would need a chamber
   under a sun-warmed surface (stone, paving), i.e. architect siting, not built here (evidence first). Target "first eggs
   by spring day 4 in 4 of 5": 0 of 4 (eggs on day 3 in sg #2 / pp #2 were budget left at potential 0).
- 15:21 long run sg #2 on r4f (E2 + H4 + M1; `round-4/long-r4f/`): year one now **grows** 9 -> 12 workers (4 eclosed;
  hygiene 0, was 27), 10 workers at Winter 1 (r4c: 5); but **C stores 0 from day 9 to winter** (intake/need C 0.18:
  17 of 45 forage trips came home "hungry", the nectar within 300 BU, 2.2 C, never found; honeydew herds found late),
  so the lapse counts starvation as alerted (stores below the winter need) and takes 10 -> 3; the queen starves in
  spring (C 0). Next limit on this run: carbohydrate foraging in year one (rounds 2-3 leads: scouting coverage).
- 15:23 nest bench after (r4f) runs 1-2: P stores up to 89 loads (bench added P 181 on we #1): the bench tops up to 2 gd
  of `needRates`, whose P rate includes spoilage (economy.ts), which grows with the pile: a bench artefact round 3 also
  saw (P 51 on sg #2), since `cheat.addFood` is not capacity-bound. The larder must not grow with its own rot either:
  **L1b** `measureLarder` sizes the P larder on the P need minus the spoilage rate (`inst.spoilP`). Test case added to
  `colony/larder.test.ts` (red without). The running bench keeps tree r4f (the larder size hardly matters under a
  capacity-free top-up); recorded as a bench limitation.
- 15:37 long run we #1 on r4f: identical outcome to r4c (no waste problem there): **predation 15 of 18 workers** in year
  one (plus old age 3), 3 workers at winter, extinct by year-2 summer. With threats-live's predators acting in the tree,
  predation is now the largest worker loss in 3 of the 6 long runs (we #1 15, pp #2 7-9, cpv #1 / kd #1 3). For the
  integrator: threats-live's calibration against GDD 05 loss bands decides whether this is in the bands; this task does
  not touch it. Long runs on r4f stopped after pp #2 (cpv #1 and kd #1 had no waste problem on r4c); the slot goes to
  the nest bench "before" on r4c: `PAR=1 $S/r4c/tools/sim/bench-sweep.sh nest $P/bench-nest-before $P/cache`.
- 15:47 the r4f long run pp #2 was killed with the batch (xargs took its child down); not re-run. Both nest benches run
  now, one at a time each: after (r4f) -> `round-4/bench-nest-after/`, before (r4c) -> `round-4/bench-nest-before/`.
  Restart-safe (re-run the commands of 15:06 and 15:37). ~7-10 min per run.
- 15:59 **nest bench fixed and restarted**: the first 6 + 1 runs (`round-4/bench-nest-*-uncapped/`) were contaminated by
  the top-up: `cheat.addFood` ignores capacity and the P need rate counts spoilage, so P stores rose to 80-89 loads, the
  pile rotted into spoiled-food waste among the brood and the bench showed hygiene losses a real nest cannot have (we #1
  29, kd #1 51, before and after alike). `tools/sim/bench-colony.ts` `nestBenchSystem` now tops up only as far as
  `poolSpace` allows and sizes P without the spoilage rate. Both benches restarted, one run at a time each:
  `PAR=1 $S/r4g/tools/sim/bench-sweep.sh nest $P/bench-nest-after $P/cache` (r4g = tree at 15:58: all round-4 fixes
  incl. L1b) and `PAR=1 $S/r4c/tools/sim/bench-sweep.sh nest $P/bench-nest-before $P/cache` (r4c + the bench fix).
  Scratch trees r4a/r4d/r4e/r4f/noL1/base deleted. ETA ~17:45 (15 runs x ~7 min each, two in parallel).
- 16:39 nest benches 6/15 each done; still running (commands of 15:59). Next: tables, then close the round.
- 16:59 nest benches 9/15 each.
- 17:10 **bench confound found**: between the frozen trees r4c (13:17) and r4g (15:58) threats-live changed the
  predators (`ecology/creatures/director.ts`, `conditions.ts`, `colonyRange.ts`, new `colonySites.ts`,
  `balance/creatures.ts`): on the 10 runs both benches had, worker predation 30 (r4c) vs 64 (r4g), so the r4g "after"
  (`round-4/bench-nest-after-r4g/`, 10 runs) mixes their change with this round's. Its brood counters: hygiene losses
  195 -> 86 (median 18 -> 7.5), eclosed 19 -> 34 (median 0 -> 2) over the 10 runs. The clean "after" is tree **r4h** =
  r4g with r4c's `ecology/creatures/**` and `balance/creatures.ts` (diff r4c..r4h = this round's files only). Running:
  `PAR=1 $S/r4h/tools/sim/bench-sweep.sh nest $P/bench-nest-after $P/cache "<seeds 1-2>"` now; seed 3 when the
  "before" bench ends (`... "woodland-edge:3 suburban-garden:3 playground-park:3 car-park-verge:3 kitchen-door:3"`).
- 17:30 before bench 13/15; after (r4h) 2/10 of seeds 1-2.
- 17:41 before bench done (15/15). After (r4h) seed-3 instance started in the free slot.
- 17:50 after (r4h) 7/15.
- 18:10 after (r4h) 13-14/15.

### Nest bench, 15 R20 hand-overs (food as far as the nest holds it), before (r4c) vs after (r4h)

`round-4/bench-nest-before/table.md`, `round-4/bench-nest-after/table.md` (medians), `round-4/bench-nest-after/causes.txt`
(`tools/sim/bench-causes.py`). r4h = r4c + E2 + H4 + M1 + L1b only (same predator code).

| | before | after |
|---|---|---|
| eggs laid (sum) | 538 | 508 |
| eclosed: sum / median | 35 / **0** | 43 / **3** |
| brood lost to hygiene: sum / median | 256 / 16 | **156 / 9** |
| brood lost untended (sum) | 95 | 147 |
| larvae starved (sum) | 10 | 30 |
| workers hand-over -> winter (sum), runs held | 168 -> 111, 2 | 168 -> 106, 1 |
| adult deaths: predation / old age | 51 / 37 | 67 / 34 |
| haul worker-gd / worker-gd outside (sums) | 174 / 337 | 229 / 380 |

Accepted on the mechanism counter: hygiene losses fall in 11 of 15 runs (median 16 -> 9), eclosions median 0 -> 3. The
cost: hauling to the surface midden puts 43 more worker-gd outside, where the predators now act (+16 predation deaths
over the 15 runs), so workers at winter do not improve (111 -> 106). The next losses of the after bench: pupae and eggs
untended (147), starvation (30), hygiene still 156 (cpv #2 27, cpv #3 21, we #2 / we #3 18: two-chamber nests whose
waste is carried; not probed this round).

### Verification (18:12 UTC)

- `npx tsc --noEmit`: clean.
- Folder tests (outputs `round-4/vitest-*.txt`; see 13:28 and 15:08): every red one is known and red on the round-start
  tree or another engineer's: `removal.verify`, `escapeDig`, `founding/reopen`, `stall.soak`, `sfaReview.verify`,
  `ids.test`, `weather.test` streams, `layering`, `stage1a.e2e` (c), `commands*`, `services`, `time` (others' modules).
- New tests, each red with its fix switched off (checked): `overwinter/heatedLog.verify` (review's), `colony/larder`
  (5 cases), `overwinter/lossCap`, `outdoor/huntReturn.verify` (review's), `nest/plugFill`,
  `colony/allocation/hygiene`, `ants/behaviours/nest/haulMidden`.
- Determinism: new state is plain persisted data (`broodTempTicks`, `hazardAlertTicks`, `larderC/P/ChamberId`,
  `larderRefusedTick`); no wall clock, `Math.random` or `Math.hypot` added in sim code; per-tick cost: the hazard alert
  scan every 5 ticks over the active alerts, a brood scan per allocation pass (`broodAmongWaste`).
- Not run: the 15-run sweep (the independent engineer's), the forage bench (no forage-side change besides L1/H3).

### Next (for the independent sweep and round 5)

1. **Predation** is the largest worker loss on the R20 runs with threats-live's predators in the tree: we #1 lost 15 of
   18 workers in year one, pp #2 7-9 of 11 in 8 days, the nest bench 51-67 over 15 runs. Whether that is inside GDD 05's
   loss bands is threats-live's call; until it is settled every growth number here carries it.
2. **Carbohydrate in year one**: with hygiene fixed, sg #2 grew 9 -> 12 but its C was 0 from day 9 (intake/need 0.18;
   17 of 45 forage trips came home "hungry"; nectar within 300 BU never found) and the lapse took 10 -> 3 (short stores,
   alerted). Scouting coverage and the departure ration of a starving pool (rounds 2-3 leads).
3. **Brood untended** (147 on the after bench) and larvae starving (30): next nest-care losses; pupa:untended dominates
   on the growing runs (we #1 after: 14).
4. **Year two**: the stores check at winter (proposal above: winter need + 4 gd spring need) and spring laying (no warm
   chamber in 9-12 BU deep nests) are for the integrator's ruling.
5. R20 cost on seed 2 (first workers 15-16 -> 8-11): for the integrator.
6. Bench limitations: the nest bench is capacity-bound now (earlier tables were not); its predation follows whatever
   predator code is in the frozen tree, so every bench pair must share it.

Status: **round 4 complete** (18:12 UTC). In the tree: W1, L1 (+ L1b), R20, H3, WL1, E2, H4, M1 + their tests; tools
`handover-sweep.sh`, `longrun-table.py`, `bench-causes.py`, `longrun-life.sh` (CACHE_ANY, PAR), `lifeMetrics.ts` year-two
fields, `bench-colony.ts` capacity-bound nest top-up. Probe tools and scratch trees deleted; no processes of this round
running. Evidence: `test-output/colony-life/round-4/` (cache = the 15 R20 hand-overs, handover, long, long-r4f,
ab-larder, ab-hygiene, probe-*.txt, bench-nest-before/after (+ -uncapped, -after-r4g kept as superseded), vitest-*).
