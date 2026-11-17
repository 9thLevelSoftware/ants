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
