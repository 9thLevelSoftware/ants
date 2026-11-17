# threats-live report — predators that actually hunt

Engineer: threats-live (Opus), 2026-11-17 11:16-? UTC. Spec `docs/design/tasks/threats-live.md`.

**Data set.** All measurements: the round-3 hand-over snapshots
`test-output/colony-life/round-3/cache/founded-lasius-niger-<archetype>-1-naturalist-d-any.bin` (start day 9, i.e.
before ruling R20; no round-4 snapshots appeared under `test-output/colony-life/round-4/cache` while this task ran),
seed 1, one per archetype (woodland-edge, suburban-garden, playground-park, car-park-verge, kitchen-door), 6 game
days from the hand-over (default-year days ~13-19), no player. The colonies hold 12-16 workers, ~2-5 of them on the
surface on average. Counts are mechanism counts: with R20 the colonies will meet the same predators earlier in the
year.

Tools (all observers, no rule change): `tools/sim/threatFunnel.ts` (funnel per predator kind, bird gate, antlion pits,
alerts, quiet share; `--preset`, `--rules`), `tools/sim/threatTable.ts` (summed tables), `tools/sim/threatSites.ts`
(where the director sites the colony-range territories). Evidence under `test-output/threats-live/`:
`before/`, `placement-only/`, `after1/` .. `after3/` (naturalist), `final-gentle/`, `final-harsh/`, `final-off/`,
`tables-naturalist.md`, `tables-presets.md`, `cross-edits.md`, `perf.txt`, `bench-*`, `harness/`.

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

(sections 4-8 follow)
