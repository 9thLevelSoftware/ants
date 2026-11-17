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

