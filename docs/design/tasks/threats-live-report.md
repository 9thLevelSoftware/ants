# threats-live report — predators that actually hunt

Engineer: threats-live (Opus), 2026-11-17 11:16-14:40 UTC. Spec `docs/design/tasks/threats-live.md`.

**Data set.** All measurements: the round-3 hand-over snapshots
`test-output/colony-life/round-3/cache/founded-lasius-niger-<archetype>-1-naturalist-d-any.bin` (start day 9, i.e.
before ruling R20). Round-4 snapshots (start day 5) appeared in `test-output/colony-life/round-4/cache` near the end
(~13:40 UTC); **every table here uses the round-3 set**,
seed 1, one per archetype (woodland-edge, suburban-garden, playground-park, car-park-verge, kitchen-door), 6 game
days from the hand-over (default-year days ~13-19), no player. The colonies hold 12-16 workers, ~2-5 of them on the
surface on average. Counts are mechanism counts: with R20 the colonies will meet the same predators earlier in the
year.

Tools (all observers, no rule change): `tools/sim/threatFunnel.ts` (funnel per predator kind, bird gate, antlion pits,
alerts, quiet share; `--preset`, `--rules`), `tools/sim/threatTable.ts` (summed tables), `tools/sim/threatSites.ts`
(where the director sites the colony-range territories). Evidence under `test-output/threats-live/`:
`before/`, `placement-only/`, `after1/` .. `after3/` (naturalist), `final-gentle/`, `final-harsh/`, `final-off/`,
`tables-naturalist.md`, `tables-presets.md`, `cross-edits.md`, `perf-before.txt` / `perf-after.txt`,
`bench-forage-before/` / `bench-forage-after/`, `harness/`.

## 1. Causes of the zero (step 1-2)

### 1.1 Funnel before (5 snapshots x 6 gd, Naturalist)

Every stage of every family read 0 on all five worlds (`before/`):

| kind | worldgen territories (5 worlds) | nearest territory to the nest, BU | alive avg (sum of 5) | sense | select | telegraph | strike | hit | kill |
|---|---|---|---|---|---|---|---|---|---|
| jumping-spider | 12 | 783 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| wolf-spider | 20 | 511 | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| ant-spider | 2 | 1625 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| centipede | 5 | 2424 | 1.0 | 0 | 0 | 0 | 0 | 0 | 0 |
| rove-beetle | 15 | 534 | 3.9 | 0 | 0 | 0 | 0 | 0 | 0 |
| antlion | 0 | - | 0 | (no pits: 0 crossings, 0 flicks) | | | | | |

The colonies' ants walk within 24-58 BU of the entrance (median) and 99-221 BU (90th percentile); the nearest
ant-predator territory per world was 511-3,000 BU away (per world: woodland-edge 1,604, suburban-garden 534 (rove
beetle; wolf 1,506), playground-park 1,212, car-park-verge 511, kitchen-door 654). Bird gate, all 5 worlds, every
hourly check: `colony < 30 workers` in daylight, else night / rain. Antlion: no worldgen pit on any of the 5 worlds.

### 1.2 Causes, first zero stage per family

| # | Cause | Families | Stage | Evidence | Test |
|---|---|---|---|---|---|
| C1 | **Never placed where ants are.** Worldgen (`src/worldgen/populate/territories.ts`) spreads the resident territories over the whole zone with map caps of 3-6 (GDD 04 §8.2: wolf spider 1 per 25 m² cap 4 on a 16 x 16 m map); the director then filled capped places in worldgen order. | all hunters | sense | table 1.1 | `colonyRange.test.ts` "cause: worldgen leaves the colony ring without any hunting-predator territory" (real generated woodland-edge #1) |
| C2 | **Ants fled from every predator at 24 mm.** `ants/perception/sense.ts` made any ant-predator creature within `SMELL_CREATURE_BU` (6 BU) a threat, including resting, burrowed and dormant ones and antlions under the sand; the flee runs 4 s, freezes, repeats up to 3 times and sends the ant home. Strike ranges are 6-16 mm (jumping spider 16, ant-spider 6, rove beetle 8, centipede 15), so ants left before any predator came into range. GDD 05 §2.4 gives detection 4 L x stealth (jumping spider stalking 2 L = 8 mm). | JS, ant-spider, rove, centipede | approach -> telegraph | `placement-only/` (C1 fixed alone, 2 worlds x 3 gd): ants took a predator as their threat **beyond** the GDD detection range for 179 worker-s vs 18 s within it (woodland-edge); 25 of 26 jumping-spider stalks ended with the ant out of range | `ants/perception/predatorDetect.test.ts` (resting jumping spider at 20 mm was a threat) |
| C3 | Rove beetles hunted only at night; GDD 05 §2.2a: active "dusk/night; day in litter". | rove beetle | sense | `after1/`: rove sense 2 s over 5 worlds | covered by the funnel (see 3) |
| C4 | Ant-spider approached at 6 mm/s (a code constant), slower than any cruising ant; GDD 05 §2.2a walk speed is 15 mm/s. | ant-spider | approach | `after1/` approach block "out of strike range" 386 s | - |
| C5 | No alert for predation: `predator-near` needs a lurking predator within 15 BU of the possessed ant or of **3** foragers; colonies of 12-16 have 2-5 ants outside, so in `after1/` 10 workers were killed and 0 alerts raised. GDD 05 App. C lists `predator-strike` as a source of `predator-near`. | all | alert | `after1/` predatorNearRaised 0 on 5 worlds | `strikeAlert.test.ts` |
| C6 | The possessed ant got no `possessed-danger` card when seized or paralysed (GDD 05 App. C sub-causes "seized", "stuck"; R15 critical). Only combat's "pinned" existed. | player side | alert | code read | `possessedDanger.test.ts` |
| - | Bird: GDD 05 §2.6 targets only colonies with >= 30 workers and >= 15 exposed ants within 25 BU. The 12-16 worker colonies never qualify: **zero bird visits is the design's rule**, not a defect. | bird | schedule | gate counts (1.1) | `bird.test.ts` (E15) |
| - | Antlion: worldgen-only (§2.2b), sheltered dry sand (shade >= 0.5, theta0 < 0.15); none of the 5 worlds has a qualifying cell (0 pits). No habitat. | antlion | - | `antlion.pits` 0 on all | `antlion.test.ts`, `hazards.possessed.test.ts` (E14) |
| - | Not a cause: the difficulty accessors (`predatorDensityMult` 1.0 Naturalist), the director's caps (I5), the strike / venom numbers, the target filter (worker 1.0 mg <= every predator's prey limit). | | | | |

## 2. Fixes (step 3)

| Fix | Where | What |
|---|---|---|
| F1 (C1) | `src/sim/ecology/creatures/colonyRange.ts` (new), `director.ts` | After the hand-over the director sites, once per kind and idempotently, one territory for each hunting kind (wolf spider, jumping spider, ant-spider, centipede, rove beetle) that has habitat (GDD 04 §8.2 zones; ant-spider only in temperate-eu / mediterranean; jumping spider on a world object rising >= 40 mm: wall, fence, post, stem) inside the colony ring `COLONY_RANGE_BU` [40, 140] BU of the first entrance, picked near the colony's routes (entrance -> food sources within 300 BU; random among candidates within 20 BU of a route, else the nearest). Occupancy fills free territories nearest the colony first, and a resident kind at its cap with a free nearer territory lets its farthest unseen, unengaged resident go (`rebalanced`). Caps x Predators setting (I5), spawn distances, all strike numbers unchanged. The draws come from streams forked from the world seed, archetype and kind (not `rng.creatures`), so a reload re-runs it without changing anything. `COLONY_RANGE_P` (per kind, x Predators setting) decides which kinds a world gets; calibrated value 1 at Normal (all), so Few 0.4 / Many 1.6 reduce or keep it. Antlions stay worldgen-only. |
| F2 (C2) | `ants/perception/sense.ts` (cross edit, 3 lines) + `queries.ts predatorPerceivedBy` | ants take a creature as their threat only within GDD 05 §2.4's detection range (4 L x stealth in its state), never a hidden / dormant one or a buried antlion |
| F3 (C3) | `conditions.ts roveBeetleActive`, `director.ts visitorActive`, `hunters.ts` | rove beetles also active by day in `ROVE_DAY_ZONES` (forest, garden-bed) |
| F4 (C4) | `balance/creatures.ts ANT_SPIDER_APPROACH_MMS` 6 -> 15 | approach at the GDD walk speed |
| F5 (C5) | `alerts.ts predatorStruck`, `attack.ts landStrike` | a strike that lands on a player-colony ant raises `predator-near` at once, under the existing per-creature cooldown 0.1 gd, cleared 30 s later |
| F6 (C6) | `alerts.ts possessedDangerAlerts` (per tick, `system.ts`) | `possessed-danger` critical, cause `seized` (predator hold, rove grab, antlion drag) or `stuck` (ant-spider paralysis); cleared the tick the cause ends, the ant dies or the player leaves it; read from the alert list (nothing persisted) |
| F7 | `director.ts settingCull`, `SETTING_DESPAWN_GD` | a Predators setting lowered mid-game (or `off`) removes ant predators above the new cap, farthest first, unseen at once, in view within 1 gd (GDD 06 §14); found by the `predators: off` runs (section 4) |

Cross edits: one (`test-output/threats-live/cross-edits.md`): `src/sim/ants/perception/sense.ts`, test
`src/sim/ants/perception/predatorDetect.test.ts`. No shared contract changed. No worldgen change (a worldgen fix would
not reach saved games or the hand-over snapshots, whose territories live in `state.ecology.director`, owned here).

### 2.1 Funnel after (final code, `after3/`, 5 snapshots x 6 gd, Naturalist)

| kind | sited near the colony (worlds) | sense | select | telegraph | strike | hit | kill | feed | top block |
|---|---|---|---|---|---|---|---|---|---|
| jumping-spider | 4 / 5 (suburban-garden: no object in the ring) | 549 s | 7 | 0 | 0 | 0 | 0 | 0 | stalk at 8 mm/s never closes to 16 mm on a cruising ant (approach "out of strike range" 120 s) |
| wolf-spider | 5 / 5 | 34 s | 10 | 8 | 8 | 3 | 3 | 3 | the ant walks on during freeze + wind-up (1.5 s) |
| ant-spider | 5 / 5 | 372 s | 14 | 16 | 16 | 7 | 3 | 0 (carry) | approach |
| centipede | 2 / 5 (forest / garden-bed in the ring) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | night-only, one visitor at a time (struck twice, killed 2 in `after2/`) |
| rove-beetle | 5 / 5 | 6 s | - | 1 | 1 | 1 | 1 | 1 | sense 3 BU; lone ants only |
| antlion | 0 / 5 (no habitat) | - | - | - | - | - | - | - | - |

Worlds on which the family reached **strike** within 6 gd (Naturalist): wolf spider 4/5 (after3), 3/5 (after2);
ant-spider 2/5 (after3), 3/5 (after1); centipede 1/5 (after2; habitat on 2/5); rove beetle 1/5; jumping spider 0/5
(after3), 2/5 (after1, where its site was a stem by a food source). Full tables: `tables-naturalist.md`.

## 3. What the design expects (calibration target)

GDD 05 states no predation loss per game day directly. The design's numbers that fix it:

- **Loss rate.** GDD 02 §1.3: `AGE_RATE_OUTSIDE` 3.0 per gd "forager hazard, dossier x5 hazard approximated by
  wear plus real predation" (research `bio-lasius-niger.md` row "forager hazard x5 once foraging"). The hazard of a
  worker outside is 5x the in-nest hazard `1 / LIFESPAN_MEAN_SMALL` = 1/33 per gd; wear supplies 3x of it, so
  predation must supply the other **2/33 = 0.061 deaths per outside-worker-gd** (= 0.25 per 100 outside-worker
  hours; 1 h = 25 s). Acceptance band used here: 0.5x-2x, i.e. **0.03-0.12 per outside-worker-gd** at Naturalist.
- **Presets.** GDD 05 §5: Predators setting caps/spawns x0.4 / 1.0 / 1.6, `predatorDamageMult` 0.6 / 1.0 / 1.25,
  `AI_DODGE_P` 0.5 / 0.3 / 0.2, `telegraphMult` 1.5 / 1.0 / 0.75, nest exclusion 120 / 40 / 0 BU (until 5 workers).
  Expected order gentle < naturalist < harsh; no number is given, so the bands are the Naturalist band scaled by the
  setting: Gentle <= 0.06, Harsh 0.06-0.2 per outside-worker-gd.
- **Meetings.** Research `ecology-habitats.md` table 7 ("Predator spawn: spider hunts 3-6 per GD per area at dusk")
  is the only frequency the design sources; read as telegraphs at the colony per gd: 3-6 at Naturalist.
- **Quiet share (I11, E25):** Naturalist >= 0.60 of daytime hours without a major threat or a warning/critical alert
  >= 25 % of the hour. `predator-near` is a warning.

## 4. Calibration per preset (step 4, AC3)

Same 5 snapshots x 6 gd per preset (`final-gentle/`, `after3/` = Naturalist, `final-harsh/`; `final-off/` 3 gd), preset
switched at the hand-over with the `setDifficulty` command. Rates are per outside-worker game day (owgd = worker on
the surface for 24 game hours); totals over the 5 worlds. Full tables: `tables-presets.md`.

| preset | outside worker-h | telegraphs | strikes | hits | worker deaths to predators | deaths / owgd | deaths / 100 outside-worker-h | telegraphs / gd per colony | band (section 3) |
|---|---|---|---|---|---|---|---|---|---|
| Gentle | 2,540 | 12 | 12 | 4 | 1 (ant-spider 1) | **0.01** | 0.04 | 0.4 | <= 0.06: in |
| Naturalist | 2,487 | 25 | 25 | 11 | 7 (ant-spider 3, wolf spider 3, rove beetle 1) | **0.07** | 0.28 | 0.8 | 0.03-0.12: in |
| Harsh | 2,764 | 44 | 44 | 20 | 19 (ant-spider 7, jumping spider 6, wolf spider 3, centipede 2, rove beetle 1) | **0.16** | 0.69 | 1.5 | 0.06-0.2: in |
| `predators: off` | 1,483 | 0 | 0 | 0 | 0 | **0** | 0 | 0 | 0: in |

Order gentle < naturalist < harsh holds for every rate. Naturalist per world: 0, 0.11, 0.08, 0.18, 0 (two worlds lost
nobody in 6 gd); Harsh per world: 0.19, 0.21, 0, 0.19, 0.24. Earlier Naturalist rounds on the same snapshots: 0.09
(`after1/`), 0.08 (`after2/`) - the rate is stable across the siting changes, the families that do the killing are not.

Notes:
- `predators: off` showed zero events, but the residents of the snapshot stayed alive (spawned before the switch).
  GDD 06 §14: a removed threat's creatures despawn over 1 GD; added afterwards: `director.settingCull` (ant
  predators above the cap x setting leave, farthest first: unseen at once, in view within `SETTING_DESPAWN_GD` 1 gd),
  test `predatorsOff.test.ts`. The Gentle / Harsh / off runs above predate `settingCull`; on Gentle it removes far
  residents only (the colony-range ones are the nearest and stay within the cap), so the table should not move.
- Meetings: telegraphs per colony per gd 0.4 / 0.8 / 1.5 are below the research's "3-6 spider hunts per gd" (section
  3). The wind-up gate (strikes only on a pausing ant) keeps the count down; raising it would mean more misses, not
  more kills (lead in section 7).
- Birds: 0 on every preset (colonies < 30 workers: GDD rule). Antlion: no pit on any world (no habitat).
- Quiet share (I11): min over the run 0-0.31 on every preset, **also with 0 predator alerts** (e.g. Naturalist
  woodland-edge 0.0 with `predator-near` raised 0 times; Gentle 0.0 on 4 worlds). The loud hours come from
  `human-event-warning` (14-55 raises per 6 gd run, `events` in each JSON), not from predators; `predator-near`
  raised 0-6 times per run. E25 will fail on the human-event cadence: for the human-events owner / integrator.


## 5. What it does to the colonies (step 5)

`tools/sim/bench-colony.ts --mode forage` (demand held at 30 workers' needs, brood care on) from the same 5 round-3
hand-overs to the first tick of winter (8.5-8.9 gd), Naturalist. "Before" = the tree with this task's files restored
from commit 45ab25a; "after" = final. Raw: `bench-forage-before/`, `bench-forage-after/` (JSON + Markdown per world).

| world | workers hand-over -> winter (before / after) | adult deaths before | adult deaths after | trips home, ok (before / after) | delivered C (before / after) | delivered P (before / after) |
|---|---|---|---|---|---|---|
| car-park-verge | 13 -> 11 / 13 -> 10 | old-age 2 | predation 1, old-age 1, lost 1 | 64 (19) / 45 (11) | 15.6 / 9.4 | 0.8 / 0.7 |
| kitchen-door | 15 -> 10 / 15 -> 6 | old-age 3, crushed 2 | **predation 4**, old-age 3, crushed 2 | 51 (5) / 54 (17) | 5.4 / 14.7 | 1.0 / 0.4 |
| playground-park | 13 -> 10 / 13 -> 7 | old-age 3 | predation 1, old-age 3, crushed 2 | 44 (21) / 36 (16) | 10.8 / 10.3 | 0.1 / 0.2 |
| suburban-garden | 12 -> 12 / 12 -> 7 | - | **predation 3**, old-age 2 | 39 (9) / 20 (2) | 3.8 / 2.0 | 0.1 / 0.2 |
| woodland-edge | 16 -> 13 / 16 -> 9 | old-age 3 | **predation 5**, old-age 1, crushed 1 | 85 (34) / 53 (14) | 20.6 / 11.7 | 0.4 / 0.4 |
| **all 5** | **56 / 39 at winter** | 18 deaths | 33 deaths, **14 predation** | 283 (88) / 208 (60) | 56.2 / 48.1 | 2.4 / 1.9 |

Reading: on the forage bench predation took 14 workers in 5 colonies over ~8.7 gd (0.32 per colony per gd; with ~3
workers outside on average that is ~0.1 per outside-worker-gd, the upper edge of the band - the bench keeps more
foragers out than a free colony). The colonies end autumn with 39 workers instead of 56 (-30 %); trips -27 %,
C intake -14 %. Predation is ~45 % of adult deaths after (14 of 33) against the design's 2 of the 5 "outside
hazard" units (40 %): **the share matches the design's own arithmetic**, and that arithmetic is heavy for a colony
of 12-16: about 3 workers per colony between hand-over and winter. One run of each; the old-age / crushed / lost
counts move between runs because the colonies differ after the first kill (chaotic), so read the totals.

**This is the GDD's number, not an inconsistency I may rebalance** (the expected 0.061 per outside-worker-gd follows
from GDD 02 §1.3). If small colonies cannot carry it, smallest levers for the integrator, one constant each:
1. `COLONY_RANGE_P` for Naturalist 0.5 (each hunting kind sited on half the worlds; expected ~0.035 per owgd);
2. a small-colony grace: colony-range siting only from N workers (GDD 05 §5 already protects "until 5 workers" with a
   40 BU exclusion, and the bird waits for 30 workers) - e.g. N = 20 would leave the founding-year colonies of today
   almost free of predation, i.e. back to "predators never act" for them;
3. GDD 05 §5's nest exclusion radius to the colony ring (140 BU) until 20 workers.


## 5a. Per-tick cost (AC5)

Method of `gate-1B-sim-report.md` §9: `life.ts --perf 300 --workers N --food N/2,N/4` on woodland-edge #1 (round-3
hand-over, `--cache-any`), 600 warm-up ticks, 3 segments of 300 ticks; per system the fastest segment, ms per tick; 3
repeats each, minimum reported. "Before" = today's tree with this task's files restored from commit 45ab25a (the
tree when the task started); "after" = final. Load average 10-11 during the runs (the colony-life sweep ran two
life processes at the same time), so these are upper bounds and +/-20 % noise. Raw: `perf-before.txt`, `perf-after.txt`.

| workers (outside) | creatures before -> after | creature-director before -> after | perception before -> after | whole tick before -> after |
|---|---|---|---|---|
| 60 (9 -> 12) | 0.239 -> 0.202 | 0.098 -> 0.093 | 0.388 -> 0.348 | 5.64 -> 5.43 |
| 300 (15 -> 19) | 0.228 -> 0.294 | 0.115 -> 0.103 | 0.419 -> 0.521 | 8.70 -> 9.26 |

Creature systems together: 60 workers 0.34 -> 0.30 ms, 300 workers 0.34 -> 0.40 ms (+0.05): **no regression above
0.2 ms**. Perception +0.10 ms at 300 workers with 4 more ants outside (fewer flee-and-return cycles); the added call
(`predatorPerceivedBy`, a distance test only for creatures within 6 BU) is not measurable separately at this noise.

## 5b. The player's side (step 6)

- Telegraph to a possessed ant: `predators.possessed.test.ts` (E12 jumping spider >= 0.6 s, dodge misses; wolf
  spider freeze cue + wind-up; centipede; ant-spider), `hazards.possessed.test.ts` (E13 struggle, E14 antlion) - green.
- `possessed-danger` (R15 critical): causes `seized` / `stuck` now raised by this module, `possessedDanger.test.ts`.
- Alerts for colony losses: `predator-near` on a landed strike (`strikeAlert.test.ts`); cadence in the runs: Naturalist
  0-3 raises per colony per 6 gd (7 in 5 colonies), Harsh 0-6 (17), Gentle 0-2 (3) - one per attack, at most one per
  predator per 0.1 gd.
- Browser (`test-output/threats-live/harness/`, script `threat-shots.mjs`, `?test=1&seed=1&quality=test&autostart=1&archetype=woodland-edge`,
  founding by `cheat.completeFounding`, sim stepped by hand): the director had sited a jumping spider (53 BU from the
  entrance, scanning), a wolf spider (117 BU) and an ant-spider (146 BU) by the colony. A possessed worker standing
  3.5 BU in front of the jumping spider got `predator-telegraph` at tick 31217 (strike at 31222, 0.5 s) and was hit
  (9 damage). Screenshots looked at: `01-telegraph-possessed.png` (possession view: the spider in its wind-up pose,
  legs raised, facing the worker; HUD "Store · freeze · threat"), `02-attack-possessed.png` (the leap: the spider on
  the worker; "Predator near foragers — jumping-spider" card; workers 18 -> 17), `03-attack-observer.png` (observer
  close-up of the spider over the dead worker). Harness `ok: true`, no page errors. Note: this worker's `maxHp` was
  7.2 (size-drawn), so the 9-damage leap killed it outright and no `seized` card could show; with the 10 hp of GDD 05
  §4.1's standard worker it is seized first (E12 test).

## 6. Determinism and save / load (AC4)

- `src/sim/ecology/creatures/huntSaveLoad.test.ts`: same seed -> same `stateHash` after 1,500 ticks of a hunt with
  the director on (colony range live); a reload through the real save path (`snapshot` / `restore` bytes) **during
  the wind-up** and another **during the hold** both continue to the same hash as the uninterrupted run (600 ticks).
- `colonyRange.test.ts`: siting is idempotent (a second call and a reloaded sim add nothing) and two sims of the same
  seed get identical territories. The siting streams are forked from (world seed, archetype, kind), never from
  `rng.creatures`, and the runtime memo is a WeakMap (not persisted).
- Existing `determinism.test.ts` (E24) still green.

## 7. GDD deviations and contradictions

| # | Rule | Deviation / reading | Arithmetic / reason |
|---|---|---|---|
| D1 | GDD 04 §8.2 densities with map caps (wolf spider 1 per 25 m², cap 4; centipede 1 per 30 m² forest, cap 3; jumping spider 1 per 6 m of wall, cap 4), placed anywhere in the zone | The director adds **one territory per hunting kind with habitat in the colony ring** (40-140 BU of the entrance, near the routes) after the hand-over | At GDD density the ring (π(0.56² - 0.16²) m² ≈ 0.9 m² for Lasius) holds 0.04 wolf spiders and 0.03 centipedes; the expected predation then is ~1-3 % of the design's own 0.061 deaths per outside-worker-gd (GDD 02 §1.3) - the GDD numbers cannot give the GDD's expected loss. With one per kind: 0.07 (measured). The §5 lever "predator exclusion around the player nest until 5 workers: 40 BU" also presumes predators within 40 BU of the nest. |
| D2 | GDD 02 §10.12 flee trigger `FLEE_TRIGGER_DIST` 6 BU vs GDD 05 §2.4 detection 4 L x stealth | GDD 05 §2.4 wins (the chapter that owns predators; precedence rule) | see C2 |
| D3 | GDD 05 App. C: `predator-strike` -> alert `predator-near`; the trigger text in the same appendix lists only lurking predators near the possessed ant or 3 foragers | both: a landed strike on a colony ant raises it too (same cooldown) | small colonies never had 3 foragers within 15 BU of a predator |
| D4 | GDD 05 §2.2a rove beetle "dusk/night; day in litter" vs §2.2b "night; despawn at dawn" | active by day in forest / garden-bed; elsewhere it burrows at dawn as before | both rows kept |
| D5 | Code decision `ANT_SPIDER_APPROACH_MMS` 6 (not a GDD number) | 15 = the GDD walk speed | an approach slower than any cruising ant never closes |
| - | Not changed, recorded: the wind-up only starts on a slow target (`windupMaxTargetSpeed`, creatures' own decision: the aim is fixed at the telegraph, GDD "no prediction", E12). AI ants die when they pause (harvesting, tending, antennating) in reach of a predator; walking ants escape. This is why the jumping spider (stalk 8 mm/s) rarely strikes. Lead for the next round: site jumping spiders on the stems of food hosts (plants with a herd or flower), where ants pause. | | |

## 8. What the colony-life engineer must know

(see section 5 numbers) Predation now exists in every run with the default rules. On the round-3 hand-overs
(12-16 workers, 2-5 outside), Naturalist costs about **0.07 workers per outside-worker game day**, i.e. ~0.3 workers
per game day per colony, ~3 workers between hand-over and winter. Victims are foragers that pause outside (at food,
tending). Gentle costs ~0.01 (almost nothing), Harsh more (section 4). Deaths carry cause `predation` and appear as
`predator-near` alerts. Bench / sweep tables made before this change have no predation at all.
Smallest levers if a small colony cannot carry it (the integrator rules): (a) extend GDD 05 §5's nest-exclusion
lever from "until 5 workers" to "until 20 workers" (one constant, `NEST_EXCLUSION_WORKERS`); (b) `COLONY_RANGE_P`
below 1 for Naturalist (fewer kinds near each colony). No other balance was changed.

## 9. GDD 05 Appendix E checks touching creatures

| Check | Covered by (this module's tests) | Needs other modules |
|---|---|---|
| E4 ladybird feeding / harassment | `aphidPredators.test.ts` | - |
| E12 jumping spider telegraph and dodge | `predators.possessed.test.ts`; browser shots (section 5b) | player `dodge` primitive (actions task) - scripted here |
| E13 struggle (rove beetle) | `hazards.possessed.test.ts` / `predators.possessed.test.ts` | player-control struggle inputs (wired through `addStruggleInput`) |
| E14 antlion pit | `antlion.test.ts`, `hazards.possessed.test.ts` | "no nestmate path enters radius + 1 L afterwards": `knownHazardsNear` is **not called by locomotion / behaviours** (grep) - for the locomotion owner |
| E15 bird event | `bird.test.ts` | a colony >= 30 workers in a real run (none of today's colonies) |
| E21 creature agents <= 260 | `soak.test.ts` | 28 gd soak with rivals: gate |
| E22 ecosystem soak (prey patches) | `soak.test.ts` | herds / rivals: ecology-plants, rivals |
| E24 determinism | `determinism.test.ts`, `huntSaveLoad.test.ts` (new) | - |
| E25 quiet share | `soak.test.ts` (creature scene) | whole-game soak: **fails today on human-event warnings**, not predators (section 4) - human events / integrator |

## 10. Notes for others

- **colony-life**: section 8. Benches and sweeps made before this change ran without predation.
- **locomotion / behaviours**: known antlion pits (`knownHazardsNear`) are not avoided by steering (GDD 05 §2.4);
  the danger grid is fed (`addDanger` via strikes) - check that route costs read it.
- **human events / integrator**: I11 quiet share 0-0.4 in every 6 gd run from `human-event-warning` alone.
- **species data**: Lasius workers of the snapshots carry `maxHp` 7.2 (drawn size), GDD 05 §4.1 / E12 assume 10; a
  jumping-spider leap (9) then kills outright instead of seizing.
- **worldgen** (optional): the colony ring rule could move into `populate/territories.ts` (one territory per hunting
  kind near the start), but saved games and snapshots hold their territories in `state.ecology.director`, so the
  director-side rule is needed either way.

## 11. Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | typecheck clean; creature tests green | met | `npm run typecheck` 0 errors (whole tree); `npx vitest run src/sim/ecology/creatures src/sim/ants/perception`: 25 files, 171 passed, 5 skipped (LONG) |
| 2 | each hunting family reaches strike on >= 3 of 5 snapshots in 6 gd Naturalist, or no habitat | partial | final (`after3/`): wolf spider 4/5 met; ant-spider 2/5 (3/5 in `after1/`); jumping spider 0/5 (sensed 4/5, selects 3/5; 2/5 in `after1/`, 2/5 on Harsh) - stalk speed vs cruising ants; centipede habitat (forest / garden-bed in the ring) on 2/5, struck on 1 (`after2/`); rove beetle 1/5; antlion: no habitat on any of the 5; bird: < 30 workers on all (GDD rule) |
| 3 | loss rates per preset within the GDD bands, ordered; zero with `predators: off` | met (bands derived, section 3) | 0.01 / 0.07 / 0.16 deaths per outside-worker-gd; off 0 events; mid-game off now also removes residents (`predatorsOff.test.ts`) |
| 4 | determinism; save -> load mid-hunt | met | `huntSaveLoad.test.ts`, `colonyRange.test.ts`, `determinism.test.ts` |
| 5 | per-tick cost before/after at 60 and 300 workers, no regression > 0.2 ms | met | creature systems 0.34 -> 0.30 (60), 0.34 -> 0.40 (300) ms, load 10-11 |
| 6 | report | met | this file |

## 12. Fix round after the independent review (2026-11-17, 15:00-17:30 UTC)

Reviewer findings (8) and what happened to each. Reviewer's tests (`threatsLive.verify.test.ts`) all pass now; one
assertion was adapted (12.3). Evidence: `test-output/threats-live/fix1` (aborted after 2 worlds), `fix2`, `fix3`,
`fix4` (final code, Naturalist), `fix-gentle`, `fix-harsh`, `fix-off`, each with `tables.md`.

### 12.1 Code fixes

| # | Finding | Reproduced | Root cause and fix | Test |
|---|---|---|---|---|
| R2 | colony-range memo: a raised Predators setting sited nothing until a reload (reload != running game) | yes (reviewer test failed) | Two causes. (a) `colonyRange.ts` marked kinds settled in a runtime `WeakMap` before checking the setting: memo removed; `ensureColonyRangeTerritories` is now a function of the saved state only and the director calls it on its **hourly** runs (persisted cadence: `lastHourlyTick`), so the running and the reloaded game decide at the same tick and a raised setting sites within 1 game hour (GDD 06 §14). (b) `conditions.ts` cached `predatorMult` / levers per tick only, so a setting changed inside a tick was not seen until the next tick: the cache is now also keyed by the identity of `config.difficulty`, its `preset`, `params`, `custom` and `config.rules` (no allocation per call). | reviewer: "raising Few -> Normal ..." passes |
| R3 | rebalance churn (far resident despawned/respawned every run) | yes (19 in 20 runs) | `rebalanceResidents` now counts a nearer free territory only when it can be filled in the same run (`spawnPointFor` below, not waiting after a failed placement). | reviewer: "a far resident is not despawned ..." passes (0) |
| R4 | possessed-danger "seized" overwrote combat's "pinned" and then cleared it | yes (card undefined) | `possessedDangerAlerts` leaves any possessed-danger card of the same ant raised by another module alone (as flood's `possessedFloodAlert`); its clear loop only touches its own causes. | reviewer: "a pinned ant keeps ..." passes; "not re-raised" passes |
| R5 | worldgen territories with a centre inside a solid retried every director run (240 spawn+despawn / gd) | yes: `creature-despawned` 3,405-8,404 per 6 gd per world (`after3`) | A failed placement (`spawnKind` -> `no-surface`) leaves the territory vacant for `TERRITORY_NO_SURFACE_RETRY_GD` = 1 gd. Now 345-537 per 6 gd per world (`fix4`, -90 to -94 %). | `colonySites.test.ts` "a territory whose resident cannot be placed is tried once ..." |
| R6 | jumping-spider height ignored rotation; site inside the object | yes (code) | New `colonySites.ts uprightPrim`: world-space height from the primitive's rotation (box: sum of |R_yi| s_i; cylinder/capsule: axis within `UPRIGHT_MAX_TILT_DEG` 30 deg of vertical, else not a surface; ellipsoid only if taller than wide; `VISUAL_ONLY` skipped). The site is the foot of the primitive on the side facing the colony, `JUMPING_SPIDER_SITE_MARGIN_MM` outside it, on open ground. | `colonySites.test.ts` uprightPrim (lying post, flat board, visual-only, boulder) and "food on a stem, else open ground at the foot ..." |
| R7 | "stuck" used for paralysis | yes | Cause is now `paralysed` (an `ANT_CONDITIONS` member; GDD 05 App. C routes `ant-paralysed` to `possessed-danger`; "stuck" is the spill trap of §1.8). GDD reading recorded: App. C's sub-cause list ("pinned", "seized", "stuck") omits "paralysed" although its event table feeds `ant-paralysed` to the card. | `possessedDanger.test.ts` "is critical with cause paralysed ..." |
| new | found while fixing R3: a site by a busy food source was never filled (an ant within 20 BU nearly always), `fix1` | yes (`fix1`: the near wolf / jumping spider / rove never spawned) | `director.spawnPointFor`: the centre if it passes GDD 05 §2.7's spawn distances, else the first of 8 points `SPAWN_ALT_OFFSET_BU` (25 BU) around it that does; the resident keeps the centre as its home and walks there. Used by occupancy and rebalance alike. | `director.test.ts` "never spawns within 20 BU of an ant or 40 BU of the focus" (rewritten to the property: the spawn point, wherever it is, keeps the distances; none when all 8 are blocked) |

### 12.2 AC2 (the major finding): sites where the ants pause

Cause, measured: predators strike only an ant that pauses in reach (wind-up gate, aim fixed at the telegraph), and the
colonies' ants pause at their food sources; on 4 of 5 worlds the nearest sources lie 10-29 BU from the entrance, i.e.
inside the ring's 40 BU inner edge (`threatSites.ts` now lists the sources). Changes (`colonySites.ts`, constants in
`balance/creatures.ts`):
- **Pause points.** `COLONY_PAUSE_KINDS` (jumping spider, rove beetle) are sited within `COLONY_SOURCE_NEAR_BU` 20 BU
  of one of the `COLONY_PAUSE_SOURCES` 3 sources nearest the entrance (16 candidates drawn around each); the others
  keep the route rule. With the ant-spider at the sources too (`fix1`), one colony lost 7 workers to it in 6 gd, so it
  stays "near trails" (GDD 05 §2.2b).
- **Jumping spider on food stems.** Its first candidates are the food sources on a plant, herd or object at least 40 mm
  above the ground (the stems ants climb and stop on, GDD 05 §2.2a "stems"), then the feet of upright primitives.
- **Inner edge per kind.** `COLONY_RANGE_MIN_BU` = { jumping-spider: 20 } (others 40). GDD 05 §5's 40 BU exclusion holds
  only until 5 workers and is enforced where a predator picks a victim (`predator.ts canPrey`); the resident still
  appears >= 40 BU from the focus (§2.7).

Worlds on which each family reached **strike** (5 round-3 snapshots, 6 gd, Naturalist; one run each):

| family | after3 (review) | fix2 | fix3 | **fix4 (final)** | habitat |
|---|---|---|---|---|---|
| jumping-spider | 0 | 1 | 1 | **5** | 5 / 5 |
| wolf-spider | 4 | 2 | 3 | **2** | 5 / 5 |
| ant-spider | 2 | 3 | 3 | **5** | 5 / 5 |
| centipede | 0 (1 in after2) | 1 | 2 | **1** | 2 / 5 (forest / garden-bed in the ring) |
| rove-beetle | 1 | 4 | 4 | **2** | 5 / 5 |
| antlion | 0 | 0 | 0 | 0 | 0 / 5 |

Reading: jumping spider and ant-spider meet AC2 in the final run. Wolf spider (2-4 of 5 across the four runs with the
same wolf siting) and rove beetle (2-4) vary from run to run with the colony (one run per world; the colonies of `fix4`
shrink faster, fewer ants outside: 2,098 outside worker-h vs 2,565 in `fix3`); centipede struck on 2 of its 2 habitat
worlds in `fix3`, 1 of 2 in `fix4`. **AC2: partial** (met for jumping spider and ant-spider; wolf spider, rove beetle
and centipede reach it in some runs, not in the final one).

### 12.3 Reviewer test adapted

`threatsLive.verify.test.ts` "sites stay inside the ring and on the world": the inner edge is now per kind, so the
assertion reads `colonyRing(t.kind)[0]` instead of `COLONY_RANGE_BU[0]` (the jumping spider may sit 20 BU out). Intent
(inside the ring, on the world) unchanged. `colonyRange.test.ts`'s own ring helper got the same change.

### 12.4 Loss rates: the AC2 sites cost the colonies far more than the design's arithmetic

| run (Naturalist) | deaths to predators (5 worlds, 6 gd) | deaths / outside-worker-gd | workers at end (5 colonies, from 69) |
|---|---|---|---|
| after3 (review) | 7 | 0.07 | 56 |
| fix2 | 21 | 0.21 | 40 |
| fix3 | 25 | 0.23 | 39 |
| **fix4 (final)** | **35** (ant-spider 14, jumping spider 14, rove beetle 4, centipede 2, wolf 1) | **0.40** | **32** |

The design arithmetic (section 3) is 0.061. AC2 and that arithmetic do not fit together at these colony sizes with the
GDD's per-family rules: each family striking on 3 of 5 worlds in 6 gd needs at least ~15 strikes, and with hit rates of
0.6-1.0 and kill rates near 1 after a hit, that alone is ~10 kills = ~0.1 per outside-worker-gd before the families that
strike more often. Two causes outside this module make every hit a death:
1. **No rescue of paralysed nestmates.** GDD 05 §2.4: "AI carry paralysed nestmates (`haul`) with p 0.5"; nothing in
   `src/sim/ants/**` does it (grep `paralysedUntilTick`: only fight / patrol skip such ants), so every ant-spider bite
   (bite 1 + venom 6) ends in the spider carrying the ant off. Half of the 14 ant-spider kills would be saved.
2. **Worker maxHp 7.2** in the snapshots (drawn size) vs GDD 05 §4.1's 10: the jumping-spider leap (9) kills outright,
   no `seized` phase and no struggle (also noted in section 10).
Smallest levers for the integrator (one constant each; not changed here, spec step 5): `COLONY_RANGE_MIN_BU`
jumping-spider 40 (= `fix3`: 0.23, jumping spider back to 1 of 5); `COLONY_PAUSE_KINDS` = [] (route siting for all,
= `after3`-like 0.07-0.09, AC2 as at review); `COLONY_RANGE_P` per kind < 1; and the two cross-module items above.
**For colony-life:** with the final code a 12-16 worker colony loses ~1 worker per game day to predators on Naturalist.

### 12.5 Presets with the final code (AC3), 5 worlds x 6 gd (off: 2 worlds x 3 gd)

| preset | outside worker-h | strikes | hits | worker deaths to predators | deaths / owgd | worlds with a strike (JS / wolf / ant-sp. / centipede / rove) |
|---|---|---|---|---|---|---|
| Gentle (`fix-gentle`) | 3,086 | 11 | 5 | 2 | **0.02** | 0 / 1 / 2 / 0 / 1 |
| Naturalist (`fix4`) | 2,098 | 67 | 45 | 35 | **0.40** | 5 / 2 / 5 / 1 / 2 |
| Harsh (`fix-harsh`) | 2,141 | 59 | 40 | 40 | **0.45** | 5 / 3 / 2 / 1 / 5 |
| `predators: off` (`fix-off`, with `settingCull`) | 779 | 0 | 0 | 0 | **0** | residents gone (alive avg <= 0.01 per kind) |

Order Gentle < Naturalist < Harsh holds; off is zero. Harsh is barely above Naturalist because its colonies collapse
early (kitchen-door 15 -> 1 workers), leaving fewer ants to kill; one run per world. Against the section 3 band
(derived, not a GDD band, as the reviewer notes): Gentle in, Naturalist and Harsh far above (see 12.4).

### 12.6 Player side, determinism, cost

- Browser (`test-output/threats-live/fix-harness/`, same script as section 5b, seed 1 woodland-edge): the director had
  sited the jumping spider **24 BU** from the entrance (on a food stem, the new inner edge), wolf spider 117 BU,
  ant-spider 64 BU. `predator-telegraph` at tick 31458, strike at 31464 (0.24 s at the test's settings), hit 9, the
  7.2 hp worker died (workers 15 -> 14, `predator-near` card). Screenshots looked at: `01-telegraph-possessed.png`
  (spider in its wind-up facing the possessed worker), `02-attack-possessed.png` (spider on the worker),
  `03-attack-observer.png` (observer close-up). Harness `ok: true`, no page errors.
- Determinism: `huntSaveLoad.test.ts`, `determinism.test.ts` green; reviewer's reload test green (12.1 R2).
- Per-tick cost (`test-output/threats-live/perf-fix.txt`, one run each, load ~8): creatures 0.234 / 0.237 ms,
  creature-director 0.042 / 0.042 ms at 60 / 300 workers (section 5a after: 0.202 + 0.093 / 0.294 + 0.103): no
  regression; the director is cheaper (no retried no-surface spawns).

### 12.7 Acceptance after the fix round

| # | Status | Note |
|---|---|---|
| 1 | met | `npm run typecheck` 0 errors (whole tree); `npx vitest run src/sim/ecology/creatures src/sim/ants/perception`: 27 files, 184 passed, 5 skipped (LONG) |
| 2 | partial | final run: jumping spider 5/5, ant-spider 5/5; wolf spider 2/5 (3-4 in other runs), rove beetle 2/5 (4 in fix2 / fix3), centipede 1 of its 2 habitat worlds (2/2 in fix3); antlion no habitat; bird GDD gate |
| 3 | not met against the derived band | ordered, off = 0; Naturalist 0.40 / Harsh 0.45 vs 0.061 design arithmetic (12.4: AC2 and the arithmetic conflict at 12-16 workers; two cross-module causes; levers) |
| 4 | met | 12.6 |
| 5 | met | 12.6 |
| 6 | met | this section |
