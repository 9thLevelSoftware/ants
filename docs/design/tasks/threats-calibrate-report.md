# threats-calibrate report — predation at the design's rate, growing with the colony

Engineer: threats-calibrate (Opus), 2026-11-17 17:00-18:55 and 18:58-20:55 UTC (cut off once by a container restart). Spec `docs/design/tasks/threats-calibrate.md`; rulings
R25 (ramp) and R26 (loss rate first) in `docs/STATUS.md`.

**Data set.** The five round-4 hand-overs `test-output/colony-life/round-4/cache/founded-lasius-niger-<archetype>-1-naturalist-d-any.bin`
(start day 5, hand-over at day ~8.4-8.9 with 9-18 nanitic workers), each run **twice with different run seeds**
(`--run-seed 1` and `2`: every RNG stream of the restored snapshot re-seeded tool-side), Naturalist unless stated.
Totals over the ten runs are the result; single runs are noisy. Measurements ran on scratch copies of the tree
(`tree-base` = the integrator's stop-gap state at 17:05 UTC, `tree-ramp` = this task's code); the main tree was
changed only after a step was measured. Evidence: `test-output/threats-calibrate/<run>/` (one `funnel-*.json` / `.md`
per run, `tables.md` per batch).

Tools (observers only, no rule change; all in `tools/sim/`):
- `threatFunnel.ts` (threats-live) gained `--run-seed K`, `--workers N` (raise the colony to N workers at the start,
  `cheat.spawnAnts` age 4 gd, as `life.ts --workers`), `--food C,P`, `--until-winter 1`.
- `threatBatch.ts` (new): worlds x run seeds in one process, one at a time, then `tables.md`: per-colony predation
  deaths with the median, rates (threatTable's), strikes and kills per family per run, worlds reaching each stage, the
  summed funnel.
- `threatTable.ts`: `rates` / `worlds` exported, run seed and worker count in the row label.


## 1. The ramp (R25)

| Where | What |
|---|---|
| `src/sim/balance/difficulty.ts` | `PREDATION_RAMP_WORKERS` (gentle [20, 60], naturalist [10, 40], harsh [0, 20]), `predationRampWorkers(src)`, `predationRamp(src, workers)`: 0 at or below the lower count, 1 at or above the upper, linear between; keyed by the preset (a custom Predators setting changes the siting chance, not the ramp) |
| `src/sim/config/presetDisplay.ts` | row "Hunters settling by a growing colony" in the Threats group: "from 10 workers, all by 40" / "from 20 workers, all by 60" / "from the first workers, all by 20" |
| `src/sim/ecology/creatures/colonyRange.ts` | `colonyRangeDrawn(sim, kind, workers)`: the fixed draw of the world and kind below `min(1, COLONY_RANGE_P x Predators setting) x predationRamp(workers)`. Workers = live worker-caste ants of the player colony (`playerWorkers`). Because the draw is fixed per world and kind, the kinds sited at a smaller colony are always a subset of those at a larger one, and the expected number of kinds near the colony grows linearly with the ramp. `drawnKinds(sim)` once per director run; `isColonyRangeTerritory(sim, i)` |
| `src/sim/ecology/creatures/director.ts` | `suspended(i)`: a colony-range territory whose kind is not drawn now is not occupied and does not count as a free place for the rebalance; `rampCull`: its resident gets `bb.rampOut` (tick) and leaves (`creature-despawned` cause `ramp`) once the kind has been out of the draw for `SETTING_DESPAWN_GD` (1 gd), unless engaged; drawn again before that, the marker is cleared and it stays. A grown colony gets the kind at the next hourly run (`ensureColonyRangeTerritories`) and a suspended territory is re-occupied at once |
| `src/sim/types/ecology.ts` (cross-edit, 2 lines) | `CreatureTerritory.colonyRange?: number` - 1 on territories the director adds, so worldgen's own residents (index < world territory seeds) are never ramped. Saves and hand-over snapshots from before the flag (woodland-edge #1 of round 4 holds five such territories) are recognised by: beyond the world's seeds, colony-range radius of the kind, inside the kind's ring |

Residents of worldgen territories, the 40 BU nest exclusion until 5 workers (`predator.ts canPrey`) and the bird's 30
workers (`bird.ts`) are unchanged. Everything is a function of saved state (no runtime memo).

Tests (`src/sim/ecology/creatures/predationRamp.test.ts`, 15, generated woodland-edge #1): ramp per preset (0 below the
lower bound, 1 at the upper, linear between); the ruling's numbers and the card text; per preset nothing drawn at the
lower bound, exactly the un-ramped draw at the upper, a subset between; a 10-worker Naturalist colony gets no
colony-range territory, a 40-worker one every kind with habitat; growing past the draw sites at the next hourly run;
per preset, a colony at the upper bound shrunk below the lower one (Gentle 15, Naturalist 5, Harsh 0 workers) keeps
every resident for just under 1 gd and none after it, the suspended territories stay empty, regrowth brings them back
(Gentle with a custom Predators Normal, because Few draws no kind on this world; the ramp stays Gentle's); a dip shorter than 1 gd keeps the same residents; save -> load while residents are
due to leave equals the uninterrupted run (`stateHash`); worldgen territories never count, unflagged old ones are
recognised. Tests whose subject is the un-ramped siting got 40 workers in their set-up (`colonyRange.test.ts`,
`colonySites.test.ts`, `threatsLive.verify.test.ts`; assertions unchanged).

## 2. Calibration (R26): no constant changed

The stop-gap state the integrator left (`COLONY_PAUSE_KINDS = []`, `COLONY_RANGE_MIN_BU = {}`; every hunting kind on the
route rule, 40-140 BU ring) was measured first, with the ramp at 1 (60 workers). It lands inside the design's band, and
the ramp alone keeps founding-year colonies below the founding target, so **the fewest constants is none**: the two
stop-gap values are kept as the calibrated values (comments in `balance/creatures.ts` say so; the pause-point test in
`colonySites.test.ts` stays conditional on the list being non-empty, i.e. the lever stays available).

### 2.1 (a) Founding-year colonies, hand-over to winter (Naturalist, ramp on; `ramp-found/`)

Ten runs (5 worlds x run seeds 1, 2), from the hand-over (day 8.4-8.9) to the first tick of winter (12.7-13.0 gd):

| world | workers at hand-over | run 1: workers at winter / predation deaths | run 2 |
|---|---|---|---|
| woodland-edge | 18 | 10 / 2 (centipede) | 10 / 0 |
| suburban-garden | 9 | 7 / 0 | 4 / 0 |
| playground-park | 13 | 10 / 0 | 8 / 0 |
| car-park-verge | 11 | 9 / 0 | 9 / 0 |
| kitchen-door | 15 | 9 / 0 | 11 / 0 |

**Median predation deaths per colony 0** (target <= 1); 2 deaths in 10 colony-runs, 10,506 outside worker-hours,
4 strikes in all. The colonies still shrink (old age of the nanitics, crushing; colony-life's subject), not from
predators.

**The ramp's measured effect** (same hand-overs, run seed 1, the stop-gap state without the ramp, `base-found/`):

| world | workers at hand-over -> winter, no ramp / predation deaths | with the ramp (run 1) |
|---|---|---|
| woodland-edge | 18 -> 4 / 10 (ant-spider 5, jumping spider 3, wolf spider 2) | 18 -> 10 / 2 |
| suburban-garden | 9 -> 3 / 5 (ant-spider 4, jumping spider 1) | 9 -> 7 / 0 |
| playground-park | 13 -> 9 / 3 (jumping spider 2, ant-spider 1) | 13 -> 10 / 0 |
| car-park-verge | 11 -> 5 / 4 (ant-spider 3, jumping spider 1) | 11 -> 9 / 0 |
| kitchen-door | 15 -> 2 / 9 (ant-spider 9) | 15 -> 9 / 0 |

Without the ramp: median **5** predation deaths per colony, 31 in five colonies, **0.19 per outside-worker gd** (3,890
outside worker-h; the colonies shrink, so fewer ants go out); with it: median 0, 0.005. The stop-gap alone is not
enough for founding-year colonies: the colony-range residents sit in the 40-140 BU ring (woodland-edge: jumping spider 53 BU, ant-spider
65 BU from the entrance) on the paths that the 9-18 workers share, so the few foragers meet them again and again.

### 2.2 (b) 60-worker colonies, 6 gd (`base-w60/` Naturalist; `ramp-w60-gentle/`, `ramp-w60-harsh/`, `ramp-w60-off/`)

Colony raised to 60 workers at the hand-over by the tool (as `life.ts --workers`), 6 gd, ten runs per preset (off: 5
worlds x 2 gd). Naturalist was measured on `tree-base`: at 40 workers and more the ramp is 1 and the code paths give the
same draws (the ramp's draw uses forked streams, not `rng`), so it is the ramp-on result; the workers never fell below
48 in any run.

| preset (60 workers, 6 gd) | runs | outside worker-h | telegraphs | strikes | hits | worker deaths to predators (jumping spider / wolf / ant-spider / centipede / rove) | **deaths / owgd** | band | workers at the end (10 colonies, from 600) |
|---|---|---|---|---|---|---|---|---|---|
| Gentle (`ramp-w60-gentle/`) | 10 | 24,039 | 70 | 70 | 19 | 7 (0 / 4 / 3 / 0 / 0) | **0.007** | below Naturalist | 624 |
| Naturalist (`base-w60/`; `ramp-w60-nat-check/` on the ramp tree) | 10 | 26,118 | 132 | 131 | 80 | 41 (14 / 7 / 15 / 1 / 4) | **0.038** | 0.03-0.12: **in** | 545 |
| Harsh (`ramp-w60-harsh/`) | 10 | 26,791 | 162 | 162 | 82 | 53 (16 / 7 / 23 / 1 / 6) | **0.047** | above Naturalist | 501 |
| `predators: off` (`ramp-w60-off/`, 2 gd) | 5 | 3,063 | 0 | 0 | 0 | 0 | **0** | 0: **in** | 298 of 300 |

**Uncertainty (fix round).** Naturalist is 41 deaths in 1,088 outside-worker gd: the exact Poisson 95 % interval of
the count (29.4-55.6) gives **0.027-0.051** per outside-worker gd, so the point estimate is inside the band but its
lower edge is not cleared with confidence, and single runs range 0.01-0.09. The design's centre is 0.061. Closing gap
(a) (rescue of paralysed nestmates, §4) is expected to take the rate to about 0.03, i.e. out of the band at its lower
edge; §6 names the lever for that case and its measured effect.

Order **Gentle < Naturalist < Harsh** holds on the totals, and off is zero (the residents of the snapshot leave
through `settingCull`; no telegraph in 10 game days of colony time). Per world and run seed (same snapshot, same run
seed, only the preset differs) Harsh >= Naturalist in 8 of 10 pairs and Gentle <= Naturalist in 10 of 10. The
Naturalist-Harsh gap is small (0.038 vs 0.047, each about +-0.006 from the Poisson count alone): at 60 workers both
presets site the same kinds (the siting chance is capped at 1, Many x1.6 changes nothing there), so Harsh adds only
its damage x1.25, AI dodge 0.2 and telegraph x0.75. Gentle's Few x0.4 sites fewer kinds near the colony (on Gentle no
jumping spider, centipede or rove beetle struck in the ten runs), and its 0.6 damage leaves most bitten ants alive (19
hits, 7 kills).

Equivalence check for the Naturalist row: the ramp tree run on woodland-edge and car-park-verge (run seed 1) gives
the identical funnel (every stage of every family, deaths by cause, outside worker-h) as `tree-base`; woodland-edge
even the identical final state hash (its snapshot's territories carry no `colonyRange` flag, so the states are
equal); car-park-verge's hash differs only by that flag.

### 2.3 Per world (Naturalist, 60 workers, sum of the two runs: strikes / hits / worker kills)

| world | jumping spider | wolf spider | ant-spider | centipede | rove beetle | deaths / owgd (r1, r2) |
|---|---|---|---|---|---|---|
| woodland-edge | 4 / 2 / 2 | 7 / 0 / 0 | 20 / 15 / 5 | 1 / 0 / 0 | 0 / 0 / 0 | 0.03, 0.07 |
| suburban-garden | 0 / 0 / 0 | 19 / 4 / 4 | 20 / 19 / 5 | 2 / 1 / 1 | 1 / 1 / 1 | 0.02, 0.05 |
| playground-park | 8 / 5 / 5 | 5 / 1 / 1 | 5 / 2 / 0 | 0 / 0 / 0 | 2 / 1 / 1 | 0.01, 0.07 |
| car-park-verge | 7 / 5 / 5 | 2 / 2 / 2 | 10 / 9 / 3 | 0 / 0 / 0 | 4 / 3 / 2 | 0.02, 0.09 |
| kitchen-door | 2 / 2 / 2 | 2 / 0 / 0 | 10 / 8 / 2 | 0 / 0 / 0 | 0 / 0 / 0 | 0.02, 0.01 |
| **all (10 runs)** | 21 / 14 / 14 | 35 / 7 / 7 | 65 / 53 / 15 | 3 / 1 / 1 | 7 / 5 / 4 | **0.04** |

Single runs range 0.01-0.09: a world's rate halves or doubles between two run seeds, so only totals are read.

## 3. Which families hunt (60 workers, Naturalist)

Worlds (of 10 runs) on which the family struck: jumping spider 7, wolf spider 7, ant-spider 9, rove beetle 4, centipede
3; antlion 0 (no pit habitat on any of the five worlds); bird 0.

- **Ant-spider** does most of the killing (15 of 41) and is met at dusk and night on every world; nearly every bite
  hits (53 of 65), and a bitten ant dies whenever the spider collects her (gap 4a).
- **Jumping spider**: 14 kills from 21 strikes by day, on the four worlds with an upright object in the ring
  (suburban-garden has none, so none there). A player sees it on walls, posts and stems near the nest.
- **Wolf spider**: the most visible hunter (alive on every world, telegraphs often: 35 strikes) but it rarely kills
  (7): ants keep walking through its freeze and wind-up. A player sees many near misses.
- **Rarely seen**: the **rove beetle** (4 kills in 10 runs; it hunts only lone ants that pause, by night and in litter by
  day), the **centipede** (habitat in the ring on 2 of 5 worlds, forest / garden-bed; night only; 1 kill), the
  **antlion** (no habitat on these worlds) and the **bird** (see below). Over a game year a grown colony on woodland-edge
  or suburban-garden will meet a centipede; on playground-park, car-park-verge and kitchen-door it will not (no habitat
  in the ring; worldgen's own centipede territories lie 2,400 BU away).
- **Bird: never**, though its own gate opens (>= 30 workers, >= 15 exposed ants within 25 BU: "eligible" in 3-10 hourly
  checks per run on 4 of 10 runs). The threat director (`threat.ts canStartMajorThreat`, GDD 05 §6) refuses every major
  threat while the trailing quiet share is below `QUIET_SHARE_MIN + 0.05`, and the quiet share is 0-0.04 in every run
  because of `human-event-warning` alerts (threats-live §4 found the same). So the I11 problem of the human events also
  removes the bird event from the game. Not changed here (the rule is the GDD's; the cause is the human-event cadence):
  for the integrator / human-events owner.

Other presets (same ten runs each, strikes / kills): Gentle sees only the wolf spider (38 / 4, on 5 runs) and the
ant-spider (32 / 3, on 4 runs); Harsh every family that Naturalist has, a little more often (jumping spider 24 / 16 on
8 runs, wolf 60 / 7 on 9, ant-spider 69 / 23 on 10, centipede 2 / 1 on 1, rove beetle 7 / 6 on 5).

The band leaves no room to bring the rare families up by levers: `COLONY_PAUSE_KINDS` for the rove beetle or the
jumping spider, or a smaller jumping-spider inner edge, add kills where the rate is already set by the ant-spider and
the jumping spider (threats-live fix2-fix4: 0.21-0.40 with them).

## 4. The three core gaps (reproduced, not fixed: for the colony engineer)

All three in `src/sim/ecology/creatures/coreGaps.repro.test.ts`. (a) and (c) are `it.fails`: each asserts what the GDD
asks for and currently fails on that assertion (checked by running them as plain `it`: "expected 0 to be greater than
0" and "expected 0 to be greater than or equal to 27.6"). When a gap is closed its test starts failing as an
`it.fails`: turn it into a plain `it` then.

**(a) Paralysed nestmates are never carried home** (GDD 05 §2.4: "AI carry paralysed nestmates (`haul`) with p 0.5";
§2.2b "rescue paralysed"). Reproduction: a worker at health 0.25 and paralysed (`combat.paralysedUntilTick`, 60 s), three
idle nestmates 3 BU away, every system of the sim running (`makeTestSim` default systems); in 6 colonies (seeds 1-6),
over 55 s, no nestmate moves her or takes her home: 0 rescues where the GDD expects about 3. Cause: `Ant.carry.kind` is
`'none' | 'item' | 'brood'` (no ant can be carried) and nothing in `src/sim/ants/**` reads `paralysedUntilTick` to start a
haul (grep: only fight / patrol skip such ants). Effect in the runs: at 60 workers the ant-spider hit 53 times and killed
15. Bite 1 + venom 6 brings a worker to the paralysis line (health <= 0.3) only if her maxHp <= 10, i.e. the smaller
half of the regular workers and every nanitic (7.2 hp: left at 0.2 hp); the others walk home, and a spider that is
seen within 1 L flees. Every paralysed ant the spider reaches is killed; with rescue at p 0.5 roughly half of the 15
would live. This is the largest single lever on the 60-worker rate
(ant-spider = 37 % of the kills), so when it is built the rate at 60 workers drops towards ~0.03: re-measure then (the
band's lower edge).

**(b) Worker maxHp 7.2 in the hand-overs.** It is not a defect: the hand-over workers are **nanitics** (the founding
brood, species `firstBroodClass: { caste: 'worker', nanitic: true }`); `colony/brood.ts ecloseBrood` gives them length
`NANITIC_SCALE` 0.85 x the worker mean, so mass 1.0 x 0.85^3 = 0.614 mg and `entities/antStats.ts` maxHp
`HP_PER_MG23` 10 x 0.614^(2/3) = 7.2. GDD 05 §4.1's table has the row "LN nanitic (`worker`, scale 0.85): mass 0.6,
maxHp 7" and GDD 07's caste table the same (7), so code and both chapters agree; the "10" is GDD 05 §4.1's regular
`worker` row, which E12 ("a lone possessed LN worker ... takes 9 damage, is seized") is written for. By the precedence
rule nothing contradicts: GDD 05 owns both rows. Consequence, by design as written: a jumping-spider leap (9 x
`predatorDamageMult`, Naturalist 9) kills a nanitic outright with no seized phase and no struggle; regular workers
(0.73-1.52 mg, 8.1-13.2 hp, mean 10) are seized. The 60-worker runs used regular workers (`cheat.spawnAnts`). The test
pins it: nanitic 0.614 mg / 7.2 hp, mean worker 10 hp, leap between the two. If the design wants a seized phase for
nanitics too, that is a GDD decision (E12 does not ask for it).

**(c) Known antlion pits are not avoided** (GDD 05 §2.4 "known pits ... are avoided in local steering (radius pit + 1 L)
permanently"; E14 "no nestmate path enters `radius + 1 L` afterwards"). Reproduction: a pit of radius 23.5 mm known to the
colony (`hazard.knownBy`), a worker sent with `navTo` to the far side: she walks straight in and is dragged under
(closest approach 0, needed >= 27.6 mm). `knownHazardsNear` (`creatures/queries.ts`, exported from the module index) has
no caller in `src/sim/locomotion/**` or `src/sim/ants/**` (grep). On the five worlds there is no pit (no habitat), so
this costs nothing in the measured runs; it matters on worlds with sheltered dry sand.

## 5. Per-tick cost of the creature systems

`tools/sim/life.ts --perf 300` on woodland-edge #1 (round-4 hand-over, 18 workers raised by 42 / 282 to 60 / 299 workers),
fastest of three 300-tick segments after 600 warm-up ticks, three repeats per case, **minimum of the repeats** (load
average 8 on 4 cores while measuring: single numbers vary by +-30 %). `before` = `tree-base` (stop-gap, no ramp),
`after` = this task's code. Raw: `test-output/threats-calibrate/perf.txt`.

| workers (outside) | `creatures` ms / tick before -> after | `creature-director` ms / tick before -> after | whole tick ms (min) before -> after |
|---|---|---|---|
| 60 (11) | 0.198 -> 0.205 | 0.044 -> 0.030 | 4.65 -> 5.07 |
| 299 (20) | 0.202 -> 0.192 | 0.031 -> 0.038 | 6.62 -> 7.22 |

No change beyond the noise: the ramp adds one pass over the ant list (`playerWorkers`) and five forked draws per
director run (every 50 ticks). The whole-tick numbers belong to the other systems and the machine load (the same
code outside the creature module in both trees).

## 6. What the colony engineer must know

- **Founding year (9-18 workers, Naturalist): about nothing.** Median 0 predation deaths per colony from hand-over to
  winter, 2 in 10 colony-runs (§2.1). The colony-range hunters appear only as the colony grows: at 10 workers none, then
  on average one more hunting kind for every ~6 workers, all five kinds with habitat by 40 workers (Gentle 20 -> 60,
  Harsh 0 -> 20, so Harsh colonies meet them from the first worker). Worldgen's own residents (500-3,000 BU out) are not
  ramped but founding-year ants rarely reach them. Sweep and bench numbers made with the stop-gap state (no ramp)
  carried **~0.19 per outside-worker gd** of predation on these founding-year colonies (median 5 deaths per colony from
  hand-over to winter, §2.1); with the ramp that is gone (0.005, median 0).
- **Established colony (60 workers, Naturalist): 0.04 worker deaths per outside-worker game day** (design 0.061, band
  0.03-0.12): about 0.7 workers per colony per game day with 12-28 workers outside (41 deaths in 10 colony-runs of 6
  gd). Gentle 0.007 (about 0.1 a day), Harsh 0.047 (about 0.9 a day) (§2.2). Victims are foragers that stop outside: at food, tending, or pausing on
  a trail at dusk (ant-spider) and by day near walls and stems (jumping spider).
- A colony that shrinks below the ramp's draw loses its colony-range hunters one game day later (not at once), and
  gets them back when it grows again.
- Deaths carry cause `predation`, a landed strike raises `predator-near`, nothing else changed in the ants' side.
- The three gaps of §4: (a) rescue of paralysed nestmates is the biggest lever left on the established-colony rate;
  build it in `src/sim/ants/**` (a carry kind for an ant, a haul trigger on `ant-paralysed`), then re-measure with
  `tools/sim/threatBatch.ts --workers 60 --run-seeds 1,2` (expect ~0.03); (b) needs nothing; (c) `knownHazardsNear` in
  local steering (locomotion).
- **If the rate falls below 0.03 once rescue lands** (fix round, review finding): the lever is
  `COLONY_PAUSE_KINDS = ['jumping-spider']` in `src/sim/balance/creatures.ts` (one kind back at the colony's three
  nearest food sources, its stems; the rove beetle and every other kind stay on the route rule). Reasons: the jumping
  spider is the family that kills where ants pause (14 of 21 strikes kill at 60 workers on the route rule) and is the
  one a player should see near the nest by day; it is the larger half of what made threats-live fix4 reach 0.40 on
  founding-year colonies without the ramp (14 of 35 kills; the rove beetle at the pause points added 4), and with the
  ramp that siting reaches founding-year colonies only as the colony grows (Naturalist from 10 workers). Its effect at
  60 workers was **not measured** in this round (the machine ran at load 10-13; one 10-run batch is ~70 min); the
  re-measure command below with that one-line change gives it. If it overshoots 0.12, the smaller step is
  `['rove-beetle']` (4 kills of 35 in fix4).
- Re-measuring: `node tools/sim/run-ts.mjs tools/sim/threatBatch.ts --out DIR --cache test-output/colony-life/round-4/cache
  --run-seeds 1,2 [--workers 60] [--preset P] [--until-winter 1 --days 20]` (one process, ~4 min per 60-worker run,
  ~6 min per founding-year run to winter).

## 7. GDD deviations and contradictions

| # | Rule | Deviation / reading | Reason |
|---|---|---|---|
| D1 | GDD 05 §5 lists one size protection ("predator exclusion around the player nest until 5 workers") | **R25 (integrator ruling):** the director's colony-range siting x a colony-size ramp per preset; the §5 exclusion and the bird's 30 workers stay | founding-year colonies of 12-16 cannot carry the design's rate (threats-live §5, §12.4); ruling R25 |
| D2 | threats-live AC2 "every hunting family strikes on >= 3 of 5 worlds within 6 gd" | **R26:** the loss rate binds; families the rate leaves rare stay rare (§3) | ruling R26 |
| D3 | GDD 02 §1.3 gives the rate only as arithmetic (0.061 per outside-worker gd = 2/33) | the band 0.03-0.12 (Naturalist) and its use as the target are the integrator's (R26); Gentle / Harsh are checked only for order | the GDD has no band per preset (threats-live review) |
| D4 | GDD 05 E12 "worker takes 9 damage, is seized" vs the hand-over workers dying at once | not a contradiction: E12 is for a regular worker (10 hp), the hand-over workers are nanitics (GDD 05 §4.1 / GDD 07: 7 hp) | §4b |
| D5 | GDD 05 §2.6 bird rate x §6 threat director | the bird never comes because the director's quiet-share gate is shut by human-event warnings (quiet share 0-0.04) | for the integrator / human events (E25, I11) |

## 8. GDD 05 Appendix E checks touching this module

| Check | Covered by | Needs other modules |
|---|---|---|
| E12 jumping spider telegraph and dodge | `predators.possessed.test.ts` | the player `dodge` primitive (actions) - scripted there |
| E13 struggle (rove beetle) | `hazards.possessed.test.ts`, `predators.possessed.test.ts` | player-control struggle inputs |
| E14 antlion pit | `antlion.test.ts` (slope, flicks, 6.7 s, witness learns it) | "no nestmate path enters radius + 1 L": **fails** (`coreGaps.repro.test.ts` (c), `it.fails`) - locomotion |
| E15 bird event | `bird.test.ts`; `soak.test.ts` LONG (10-15 bird events per 28 gd run, most kills per event <= `BIRD_MAX_KILLS` x Predators setting: 12, Gentle 5, Harsh 19) | in real runs the threat director cancels it while human-event warnings keep the quiet share low (§3) |
| E21 creature agents <= 260 | `soak.test.ts` (2 gd always; 28 gd x 3 seeds + Gentle + Harsh under `FOUNDRESS_LONG=1`, run in the fix round: max 69-85 agents, no cap violation) | 28 gd soak with rivals (gate) |
| E22 ecosystem soak | `soak.test.ts` (same runs: prey patches >= 0.05 K, nobody in a solid, predation per kind and gd within its feeding-time bound) | herds / rivals (ecology-plants, rivals) |
| E23 gentle founding protection (no predator targets the founding queen) | `difficulty.test.ts` | rivals' half (combat) |
| E24 determinism | `determinism.test.ts`, `huntSaveLoad.test.ts`, `predationRamp.test.ts` (save -> load with the ramp's departures pending) | - |
| E25 quiet share | `soak.test.ts` LONG, creature scene (300 workers, dense predators, no human events): lowest window Naturalist 0.65-0.73 (>= 0.60), Gentle 0.80 (>= 0.75), Harsh 0.60 (>= 0.40), 8-15 major threats per run. **Failed 5 of 5 before the fix round** (§11.1) | whole-game soak (suburban-garden, AI colony, human events): fails on human-event warnings (§3) - human events / integrator |
| (R25) ramp | `predationRamp.test.ts` | - |

## 9. Shared contracts, cross-edits, files

- Cross-edit (logged in `test-output/threats-calibrate/cross-edits.md`): `src/sim/types/ecology.ts`
  `CreatureTerritory.colonyRange?: number` (additive optional field).
- Owned files changed: `src/sim/balance/difficulty.ts` (ramp table + two accessors, additive), `src/sim/balance/creatures.ts`
  (comments on the two calibrated-empty constants), `src/sim/config/presetDisplay.ts` (one row), `src/sim/ecology/creatures/`
  `colonyRange.ts`, `director.ts`, `README.md`, tests `predationRamp.test.ts` (new), `coreGaps.repro.test.ts` (new),
  `colonyRange.test.ts`, `colonySites.test.ts`, `threatsLive.verify.test.ts` (40 workers in the set-up);
  `tools/sim/threatFunnel.ts`, `threatTable.ts`, `threatBatch.ts` (new; resumes a cut-off batch from the result files).
- Nothing in `src/sim/ants/**`, `src/sim/colony/**`, `src/sim/nest/**` was touched.

## 10. Acceptance (spec "Work" items)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Ramp (R25) in the director's colony-range siting; unit test per preset: 0 below / 1 at the upper / linear; shrinking colony loses its colony-range residents over `SETTING_DESPAWN_GD`, not at once; save -> load equal | **met** | §1; `predationRamp.test.ts` 15 tests green (ramp, siting subset and shrink per preset; save -> load `stateHash` equal) |
| 2a | Founding-year hand-overs to winter, Naturalist: median predation deaths per colony <= 1 | **met** | median **0** (2 deaths in 10 colony-runs), `ramp-found/` (§2.1) |
| 2b | 60 workers: 0.03-0.12 deaths per outside-worker gd on Naturalist; Gentle < Naturalist < Harsh; zero with `predators: off`; each world twice | **met** (off: once per world) | Naturalist **0.038** (41 deaths, 26,118 outside worker-h, 10 runs), Gentle 0.007, Harsh 0.047, off 0 (§2.2). Every world twice on the three presets; `predators: off` ran once per world for 2 gd (zero events is not seed-dependent once the residents have left) |
| 2 | Fewest constants, each change with its measured effect | **met** | no constant changed: the stop-gap values are the calibrated values (§2), measured before and after the ramp (§2.1, §2.2) |
| 3 | Strikes per family per world (60 workers, 6 gd); which families the band leaves rarely seen | **met** | §2.3, §3 |
| 4 | Three core gaps reproduced (not fixed); (b) source of 7.2 and which document is right | **met** | §4, `coreGaps.repro.test.ts` ((a), (c) `it.fails`; (b) pins the nanitic row) |
| 5 | Typecheck clean; creature tests green; per-tick cost at 60 / 300 workers before / after | **met** | `npm run typecheck` 0 errors (whole tree, 19:03 and 20:48 UTC); `npx vitest run src/sim/ecology/creatures src/sim/config/presetDisplay.test.ts` 28 files, 206 passed, 2 expected fail (`coreGaps.repro.test.ts` (a), (c)), 6 skipped (LONG) at 20:53 UTC; §5 |
| 6 | This report | **met** | - |

