# threats-calibrate report — predation at the design's rate, growing with the colony

Engineer: threats-calibrate (Opus), 2026-11-17 17:00-(END) UTC. Spec `docs/design/tasks/threats-calibrate.md`; rulings
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

Tests (`src/sim/ecology/creatures/predationRamp.test.ts`, 13, generated woodland-edge #1): ramp per preset (0 below the
lower bound, 1 at the upper, linear between); the ruling's numbers and the card text; per preset nothing drawn at the
lower bound, exactly the un-ramped draw at the upper, a subset between; a 10-worker Naturalist colony gets no
colony-range territory, a 40-worker one every kind with habitat; growing past the draw sites at the next hourly run;
shrinking to 5 workers keeps every resident for just under 1 gd and none after it, the suspended territories stay
empty, regrowth brings them back; a dip shorter than 1 gd keeps the same residents; save -> load while residents are
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
predators. BEFORE_RAMP

### 2.2 (b) 60-worker colonies, 6 gd (`base-w60/` Naturalist; `ramp-w60-gentle/`, `ramp-w60-harsh/`, `ramp-w60-off/`)

Colony raised to 60 workers at the hand-over by the tool (as `life.ts --workers`), 6 gd, ten runs per preset (off: 5
worlds x 2 gd). Naturalist was measured on `tree-base`: at 40 workers and more the ramp is 1 and the code paths give the
same draws (the ramp's draw uses forked streams, not `rng`), so it is the ramp-on result; the workers never fell below
48 in any run.

PRESETS_TABLE

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

PERF_TABLE

## 6. What the colony engineer must know

- **Founding year (9-18 workers, Naturalist): about nothing.** Median 0 predation deaths per colony from hand-over to
  winter, 2 in 10 colony-runs (§2.1). The colony-range hunters appear only as the colony grows: at 10 workers none, then
  on average one more hunting kind for every ~6 workers, all five kinds with habitat by 40 workers (Gentle 20 -> 60,
  Harsh 0 -> 20, so Harsh colonies meet them from the first worker). Worldgen's own residents (500-3,000 BU out) are not
  ramped but founding-year ants rarely reach them. Sweep and bench numbers made with the stop-gap state (no ramp)
  carried ~0.07 per outside-worker gd of predation on founding-year colonies; with the ramp that is gone.
- **Established colony (60 workers, Naturalist): 0.04 worker deaths per outside-worker game day** (design 0.061, band
  0.03-0.12): about 0.7 workers per colony per game day with 12-28 workers outside (41 deaths in 10 colony-runs of 6
  gd). Gentle GENTLE_RATE, Harsh HARSH_RATE (§2.2). Victims are foragers that stop outside: at food, tending, or pausing on
  a trail at dusk (ant-spider) and by day near walls and stems (jumping spider).
- A colony that shrinks below the ramp's draw loses its colony-range hunters one game day later (not at once), and
  gets them back when it grows again.
- Deaths carry cause `predation`, a landed strike raises `predator-near`, nothing else changed in the ants' side.
- The three gaps of §4: (a) rescue of paralysed nestmates is the biggest lever left on the established-colony rate;
  build it in `src/sim/ants/**` (a carry kind for an ant, a haul trigger on `ant-paralysed`), then re-measure with
  `tools/sim/threatBatch.ts --workers 60 --run-seeds 1,2` (expect ~0.03); (b) needs nothing; (c) `knownHazardsNear` in
  local steering (locomotion).
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
| E15 bird event | `bird.test.ts` | in real runs the threat director cancels it while human-event warnings keep the quiet share low (§3) |
| E21 creature agents <= 260 | `soak.test.ts` | 28 gd soak with rivals (gate) |
| E22 ecosystem soak | `soak.test.ts` | herds / rivals (ecology-plants, rivals) |
| E23 gentle founding protection (no predator targets the founding queen) | `difficulty.test.ts` | rivals' half (combat) |
| E24 determinism | `determinism.test.ts`, `huntSaveLoad.test.ts`, `predationRamp.test.ts` (save -> load with the ramp's departures pending) | - |
| E25 quiet share | `soak.test.ts` (creature scene) | whole-game soak fails on human-event warnings (§3) - human events / integrator |
| (R25) ramp | `predationRamp.test.ts` | - |

ACCEPTANCE
