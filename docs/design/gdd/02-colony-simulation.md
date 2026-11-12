# FOUNDRESS GDD — Chapter 02: Colony simulation (reference species *Lasius niger*)

Status: complete draft for engineering and test. Binding sources: `docs/01-design-seed.md`, `docs/02-design-directions.md` (section J identifiers and reference economy, section K scale decisions), `docs/03-architecture.md`. Research used: `research/bio-lasius-niger.md` (final, with verification log; all values below use the corrected figures), `research/ecology-habitats.md` (final; food sections), `research/bio-messor.md` (final; Gordon interaction-rate summary, section 15), `research/genre-ux.md` (legibility rules). Neighbouring chapters read for contracts: 01 (modes, controls, action primitives), 06 (environment, time, progression), 08 (UI).

Tier tags: **[T1]** core, **[T2]** full sandbox, **[T3]** breadth. A row without a tag inherits its section's tag.

---

## 0. Scope, ownership, conventions

### 0.1 What this chapter owns

| Subsystem | Code home | Tier |
|---|---|---|
| Individual ant physiology (age, lifespan, crop, reserve, hunger, health, fatigue) | `src/sim/ants/lifecycle.ts`, `physiology.ts` | T1 |
| Perception (contact, antennal, smell, vision, vibration) | `src/sim/ants/perception.ts` | T1 (vision/vibration T2) |
| Task behaviours (state machines per task) | `src/sim/ants/behaviours/*.ts` | per task, section 10 |
| Brood (egg, larva, pupa), first-brood rules, diapause | `src/sim/colony/brood.ts` | T1 (diapause T2) |
| Queen egg laying, queen nutrition | `src/sim/colony/queen.ts` | T1 |
| Stores, nutrition ledger, trophallaxis rules, starvation | `src/sim/colony/stores.ts`, `nutrition.ts` | T1 |
| Task allocation, forager activation | `src/sim/colony/allocation.ts`, `activation.ts` | T1 |
| Directives and marker semantics (worker responses) | `src/sim/colony/directives.ts`, `markers.ts` | T1 (rally T2) |
| Pheromone field (`trail`, `home`, `alarm`) | `src/sim/pheromones/*.ts` | T1 (`alarm` T2) |
| Route memory, path integration | `src/sim/ants/memory.ts` | T1 |
| Cooperative transport (AI rules) | `src/sim/ants/behaviours/transport.ts` | T2 (solo carry T1) |
| Colony statistics and colony diagnostics | `src/sim/progression/colonyStats.ts`, `colonyDiagnostics.ts` | stats T1, diagnostics T2 |

Not owned here (consumed through their interfaces): surface walker, cruise/sprint speed and load factor (locomotion); `Tb`, `speedMult(Tb)`, heat/cold load, chill coma, `forageGate`, `surfaceActivity`, rain washing of pheromones (chapter 06); carve grid, chambers and their climate, dig plans, pellet caches, mound, midden site, flooding (nest chapter); food sources, aphid herds, prey (ecology chapter); fights (combat chapter); alates, nuptial flight, queen death and orphaning, overwinter aggregate, opening script and time-lapse (chapter 06); possession and action primitives (chapter 01).

### 0.2 Conventions

- Two clocks (directions K). Behaviour timings are in **game seconds (s)**. Physiology, development and economy rates are in **per game day (gd)**; a rate per gd is applied per tick as `rate × 0.1 / 600`. No other conversion factor exists.
- Nutrients in **loads** of C and P (directions J). Item bulk in **load-mass units (lm)**: 1 lm = a standard solid item one standard worker carries.
- `N` = number of living adult workers of the colony (including nanitics and callows; excluding queen, gynes, males). `A` = workers available for allocation (section 6.3).
- Physiology runs on a **slow tick** every 10 ticks (1 game s), staggered by `antId mod 10`. Behaviour runs every tick. Allocation every `ALLOC_PERIOD` (10 s). Pheromone decay every 10 ticks. Statistics sample every `STATS_SAMPLE_TICKS`.
- All constants below are named and live in `src/sim/balance/colony.ts`, `brood.ts`, `nutrition.ts`, `allocation.ts`, `pheromone.ts`, `memory.ts`, and `SpeciesDef['lasius-niger']`. Species-variable values are marked (S) and live in the species file.
- Randomness: RNG sub-streams `rng.colony`, `rng.brood`, `rng.alloc`, `rng.behaviour` (seeded from world seed + stream name).

### 0.3 Deviations from seed, directions or research (summary)

| # | Topic | Decision | Reason |
|---|---|---|---|
| D1 | AI walking speed | Cruise 6 BU/s (measured 23.5-26 mm/s); seed's ~12 BU/s is the run/alarm maximum. Same as chapter 01. | Biology; gameplay intent (responsive play) kept by hurry and run. |
| D2 | Upkeep economy | Directions J numbers are used as-is (0.08 / 0.20 C per gd). They are far below real metabolic cost × calendar compression; this is an explicit gameplay economy, documented in the codex as such. | Binding direction; keeps forager throughput (1 load per trip) meaningful. |
| D3 | Brood stage split | Egg 1.4, larva 0.6, pupa 1.9 gd at 21 C (dossier corrected values; stage split uncertain, total 3.9 gd is firm). | Research correction. |
| D4 | Interaction-rate activation | Gordon's model is from *Pogonomyrmex barbatus*. Used for Lasius without the patroller gate; only successful returning foragers and scouts activate waiting foragers; humidity sensitivity kept as an analogy. | Research says species are not interchangeable. |
| D5 | Brood-protein regulation | Dussutour and Simpson (2009) was on *Rhytidoponera metallica*. Brood-driven protein demand is kept (gameplay intent from the brief); the protein-excess lifespan penalty is T3 optional and labelled an analogy. | Research correction. |
| D6 | Liquid stores | *Lasius* has no repletes; the colony pool stands for the crops of nest workers (social stomach) plus solid piles in food chambers. Individual crops are simulated only for food in transit. | Clarity (directions C) and performance. |
| D7 | Colony-wide stimuli | Allocation reads colony aggregates of cues that ants sense locally (brood hunger, frontier, deficit). This is an explicit abstraction. | Performance; legibility. |
| D8 | 75-worker recruitment threshold | Implemented as a smooth colony-size factor on trail deposition, not a hard switch. | Avoids a gamey step; matches "emerges at about 75". |
| D9 | Brood cannibalism under starvation | Common in ants; not measured for *L. niger*. Used as the starvation buffer. | Labelled in the codex as general ant biology. |
| D10 | Directives and markers ("orders through the queen") | Real colonies have no commander: a queen issues no orders and work is regulated by local encounters and chemical cues, differently in each species (Gordon 2007, [S3]). The Directives panel and markers are a deliberate gameplay abstraction of that regulation. They never move an ant directly: sliders set allocation targets (6.3) and markers add local stimuli and plans, and every ant still takes or leaves a task through its own response threshold (6.4), age band and local cues. The abstraction is said in play by codex entry `cx-interface-orders` (GDD 06 §10) and the Directives panel tooltip (GDD 08 §4.2). | Brief §3 (queen orders are an intentional abstraction over decentralised coordination); seed §1. |

### 0.4 New canonical identifiers added by this chapter

All canonical ids of directions J are used unchanged. Additions (kebab-case):

| Namespace | Ids |
|---|---|
| Allocation groups | `forage`, `nurse`, `dig`, `defend` (group namespace, distinct from task ids; same as chapter 08) |
| Age bands | `callow`, `young`, `mid`, `old` |
| Ant flags | `nanitic`, `minim`, `callow`, `controlled` (chapter 01), `trail-ignorer`, `dormant` |
| Brood flags | `first-brood`, `diapause`, `ready`, `nanitic`, `minim` |
| Queen modes | `founding`, `established`, `orphan-dead` |
| Metabolic classes | `met-rest`, `met-light`, `met-active` |
| Behaviour states | `<task>.<state>` as listed in section 10, e.g. `scout.explore`, `forage.wait`, `forage.outbound`, `forage.search`, `forage.queue`, `forage.collect`, `forage.return`, `forage.deliver`, `tend.solicit`, `tend.guard-herd`, `nurse.select`, `nurse.load`, `nurse.feed`, `nurse.tend`, `nurse.carry`, `nurse.assist`, `nurse.cannibalise`, `nurse.groom`, `queen-care.attend`, `queen-care.load`, `queen-care.feed`, `queen-care.collect-eggs`, `queen-care.escort`, `store.post`, `store.receive`, `store.disperse`, `store.shift`, `store.clean`, `dig.claim`, `dig.travel`, `dig.bite`, `dig.stow`, `haul.claim`, `haul.travel`, `haul.pick`, `haul.carry`, `haul.return`, `guard.post`, `guard.alarm-raise`, `patrol.loop`, `queen.found-care`, `queen.reside`, `queen.relocate` |
| Nursery jobs | `rescue`, `evacuate`, `assist-eclosion`, `feed`, `move`, `tend-pile`, `groom` |
| Starvation stages | `fed`, `lean`, `rationing`, `brood-sacrifice`, `adult-starvation` |
| Brood death causes | `starvation`, `cannibalised`, `untended`, `temperature`, `humidity`, `hygiene`, `exposure`, `flooding`, `eclosion-failed`, `predation`, `base` |
| Adult death causes used | the canonical list of `00-index.md` §B (GDD 06 §9.3 extended by GDD 05): this chapter uses `old-age`, `starvation`, `heat`, `cold`, `drowning`, `predation`, `combat`, `crushed`, `poison`, `disease`, `lost`. (The earlier adult cause `exposure` is folded into `cold`/`heat`/`lost`; `exposure` remains a brood cause.) |
| Item kinds | `food-piece`, `soil-pellet`, `waste`, `corpse` (canonical item kinds of `00-index.md` §B; brood is never an item, it is carried as its own entity) |
| Waste kinds | `meconium`, `cocoon`, `spoiled-food`, `brood-corpse` |
| Reason codes | listed in section 7 |
| Directive values | `alateInvestment` 0..1 (GDD 06 §11.3; the UI presets Workers only / Balanced / Raise alates send 0 / 0.5 / 1.0); `stockTarget`: `low`, `normal`, `high`; `stayIn` (boolean); `allocation`: `auto` |
| Diagnostics | `diag-mortality`, `diag-hygiene` (in addition to chapter 08's expected ids; every diagnostic id carries the `diag-` prefix, GDD 06 scheme) |
| Alert kinds | `colony-starving`, `stores-full` |
| Remedy ids | `remedy.slider.<group>`, `remedy.diet.<carbohydrate|protein>`, `remedy.marker.<kind>`, `remedy.dig.<chamberType>`, `remedy.possess.<task>`, `remedy.stock.<level>` |
| Time series | listed in 13.2 |
| Events | listed in Appendix C |

---

## 1. Individual ant model [T1]

### 1.1 Attributes (per adult ant)

| Field | Type | Meaning |
|---|---|---|
| `id`, `colonyId` | int | stable ids |
| `caste` | `worker` / `queen` / `gyne` / `male` | canonical caste |
| `flags` | bitset: `nanitic`, `minim`, `callow`, `controlled`, `trailIgnorer`, `dormant` | see below |
| `scale` | float | body length in BU (worker 1.0 nominal) |
| `bornTick` | int | eclosion tick |
| `physioAge` | float gd | behavioural/physiological age (1.3) |
| `lifespan` | float gd | intrinsic lifespan drawn at eclosion |
| `health` | 0..1 | 0 = dead |
| `crop` | `{C, P}` loads | liquid carried (cap `cropCap`) |
| `reserve` | loads C-equivalent | fat body (cap by age band) |
| `fatigue` | 0..1 | rest drive (1.7) |
| `task`, `state`, `stateT` | ids, s | current task, behaviour state, time in state |
| `target` | `TargetRef` | entity / position the state works on |
| `carry` | `ItemRef` or null | carried solid item, brood, pellet, corpse |
| `thresholds` | Float32[17] | response thresholds per canonical task (6.4) |
| `activation` | float | forager stimulus (6.6) |
| `lead` | `{sourceId, pos, tick}` or null | recruitment information (6.7) |
| `homeVec` | vec3 + error | path integrator (9.1) |
| `crumbs` | ring of vec3 | breadcrumbs (9.2) |
| `routes[2]` | route slots | learned routes (9.3) |
| `depleted[4]` | `{sourceId, untilTick}` | sources found empty |
| `decisions[5]` | ring of `{tick, code, detail}` | "last decisions" for inspection |
| `Tb`, `heatLoad`, `coldLoad` | owned by chapter 06 | thermal state |

### 1.2 Body scale and capacity

| Constant | Value | Rule |
|---|---|---|
| `WORKER_SCALE_MEAN` / `SD` (S) | 1.00 / 0.05 | normal draw, clamp `[0.88, 1.15]` (head-width CV ~6 %) |
| `NANITIC_SCALE` (S) | 0.85 | first brood of a founding queen |
| `MINIM_SCALE` (S) | 0.90 | larva pupated early under protein stress (3.6) |
| `cropCap` | `CROP_CAP_STD × scale²`, `CROP_CAP_STD = 1.0` load | 1 load = full crop of standard worker (J) |
| `carryCap` | `CARRY_CAP_STD × scale²`, `CARRY_CAP_STD = 1.0` lm | solid item limit for single carry |
| Queen | scale 2.1, `cropCap` 1.0 (her gut, 4.4), no carry when established | |

### 1.3 Age, lifespan, ageing

| Constant | Value | Rule |
|---|---|---|
| `LIFESPAN_MEAN_SMALL` (S) | 33 gd | mean intrinsic lifespan of workers eclosing while `N < 100` (434 real days) |
| `LIFESPAN_MEAN_LARGE` (S) | 24 gd | while `N ≥ 250` (309 real days); linear between |
| `LIFESPAN_SD` | 10 gd | normal draw, clamp `[10, 85]` gd |
| `NANITIC_LIFESPAN_MEAN` | 24 gd | nanitics are short-lived (estimate) |
| `AGE_RATE_IN_NEST` | 1.0 per gd | `physioAge` accrual inside the nest |
| `AGE_RATE_OUTSIDE` | 3.0 per gd | accrual while outside (forager hazard, dossier "×5 hazard" approximated by wear plus real predation) |
| `AGE_RATE_DORMANT` | 0.15 per gd | flag `dormant` (overwinter, chill coma > 1 h) |
| Death by age | `physioAge ≥ lifespan` → death cause `old-age` | checked on the slow tick |
| `CALLOW_GD` | 0.3 gd | `callow` flag after eclosion (pale, cuticle hardening 3-4 real days) |

Age bands (by `physioAge`): `callow` (flag set), `young` < 6 gd, `mid` 6-12 gd, `old` ≥ 12 gd.

### 1.4 Energy: upkeep, crop, reserve, hunger

Metabolic classes (directions J, at reference 25 C):

| Class | States in it | C per gd |
|---|---|---|
| `MET_REST` | `rest`, `idle`, any waiting/queueing state, `forage.wait` | 0.08 |
| `MET_LIGHT` | nest work while standing or slow: nurse feeding/grooming, queen-care, store receive, guard post | 0.12 |
| `MET_ACTIVE` | walking outside, carrying, digging, hauling, fighting, fleeing, tending walk | 0.20 |

Upkeep per slow tick = `class × fMet(Tb) × (1/600)` C, with `fMet(T) = clamp(2^((T − 25)/10), 0.15, 1.8)`; × `MET_DORMANT_MULT 0.3` when `dormant`; × 2 while the possessed ant hurries (chapter 01). Workers have **no P upkeep** (protein goes to brood and queen).

Payment order: **inside the nest**: colony pool C → own crop C → reserve. **Outside**: own crop C → reserve.

| Constant | Value | Rule |
|---|---|---|
| `RESERVE_CAP` by band | callow 0.40, young 0.60, mid 0.45, old 0.25 C | fat body; nurses fat, foragers lean (so old ants starve first) |
| `RESERVE_REFILL_RATE` | 0.30 C per gd | from pool while in nest and pool `daysC ≥ 0.5` |
| `DEPART_RATION` | 0.10 C | forager/scout/tender tops up crop from pool on leaving (if pool ≥ 1 C) |
| `HUNGER_RETURN_CROP` | 0.05 C | outside ant with crop C below this and reserve < 50 % returns home (state `*.return`, reason `hungry`) |
| `STARVE_HEALTH_RATE` | 0.5 health per gd | while crop C = 0 and reserve = 0 and no pool access |
| `HEALTH_REGEN` | 0.2 per gd | when not starving, not heat/cold loaded, `fatigue < 0.8` |
| Starvation death | `health ≤ 0` with last damage source starvation → cause `starvation` |

Starvation timeline of an isolated worker (no food): crop C empties first, then reserve (old worker: 0.25 C / 0.20 C per gd = 1.25 gd active), then 2.0 gd of health loss → death 3.25 gd after the crop emptied; a young nurse at rest: 0.60/0.08 = 7.5 gd + 2.0 = 9.5 gd. Dossier range for adults is 3-6 gd; colonies starve in the order of 5.7.

### 1.5 Health and injury

`health` is reduced by combat (combat chapter), heat/cold load deaths (chapter 06), drowning (nest/environment), crushing (human events), poison (5.4.4) and starvation. Effects: speed × `(0.5 + 0.5 × health)` when `health < 1`; at `health < INJURED_HEALTH 0.4` the ant may not take outside tasks (allocation excludes it from forage/defend groups) and goes to `rest` until `health ≥ 0.6`.

### 1.6 Speed

AI speed = `CRUISE (S, 6 BU/s, locomotion)` × `speedMult(Tb)` (chapter 06) × load factor (locomotion) × health factor (1.5) × `CALLOW_SPEED 0.6` if callow × `ROUTE_SYNERGY 1.10` when walking a learned route that also carries trail ≥ `TRAIL_DETECT`. Run (flee, alarm approach) = `RUN_SPEED 12 BU/s` × the same factors. Queen established: × `QUEEN_SPEED 0.5`.

### 1.7 Fatigue and rest

| Constant | Value | Rule |
|---|---|---|
| `FATIGUE_GAIN` | 1/900 per s in `MET_ACTIVE`, 1/1800 per s in `MET_LIGHT` | |
| `FATIGUE_RECOVER` | 1/150 per s in `rest` | |
| `REST_ENTER` / `REST_EXIT` | 0.9 / 0.2 | enter `rest` at the end of the current action cycle (never mid-carry outside) |

Result: an active ant rests about 2.5 min per 15 min of work (~15 % of time), plus idle reserve; inactive fractions of 30-50 % emerge, as in real colonies.

---

## 2. Brood model [T1]

### 2.1 Brood entity

| Field | Type | Meaning |
|---|---|---|
| `id`, `colonyId` | int | |
| `stage` | `egg` / `larva` / `pupa` | canonical |
| `destined` | `worker` / `gyne` / `male` | set at laying (2.6) |
| `flags` | `nanitic`, `minim`, `diapause`, `firstBrood`, `ready` (pupa awaiting eclosion help) | |
| `progress` | float DU | development in current stage |
| `gut` | `{C, P}` loads | larva only; cap `LARVA_GUT_CAP` |
| `fed` | `{C, P}` loads | larva only; total absorbed (for recycling and diagnostics) |
| `hungerT`, `pStarveT` | gd | larva: time with empty gut / with gut P = 0 |
| `lastTendedTick` | int | egg and pupa piles: last nurse visit |
| `chamberId`, `pos` | id, vec3 | location; or carried by `carrierId` |
| `laidTick` | int | |

### 2.2 Development rate

`r(T)` (development units per gd; 1 DU = 1 gd at 21 C), `T` = chamber temperature (chapter 06 `chamberTemp`), or `Tmicro` if outside a chamber:

| T (C) | ≤ 10 | 15 | 21 | 25 | 30-32 | 34 | ≥ 36 |
|---|---|---|---|---|---|---|---|
| r | 0 | 0.455 | 1.0 | 1.364 | 1.818 | 0.909 | 0 |

Formula: `r = (T − 10)/11` for 10 < T ≤ 30; 1.818 for 30-32; linear to 0 at 36. Degree-day basis: 575 DD above 10 C from egg to adult (dossier, corrected).

### 2.3 Stage table (worker-destined)

| Stage | `*_DU` at r = 1 | At 21 C | At 25 C | Feeding | Base survival `S_stage` |
|---|---|---|---|---|---|
| `egg` | `EGG_DU` 1.4 | 1.40 gd | 1.03 gd | none (tending) | `S_EGG` 0.90 |
| `larva` | `LARVA_DU` 0.6 | 0.60 gd | 0.44 gd | `LARVA_P_REQ` 1.2 P + `LARVA_C_REQ` 0.4 C in total (J) | `S_LARVA` 0.85 |
| `pupa` | `PUPA_DU` 1.9 | 1.90 gd | 1.39 gd | none (cocoon) | `S_PUPA` 0.95 |
| Egg to adult | 3.9 | 3.9 gd | 2.86 gd | | 0.727 (dossier: ~0.7 well cared) |

Base mortality is applied as a hazard per DU of progress: `h_stage = −ln(S_stage) / stage_DU` (egg 0.0753, larva 0.271, pupa 0.0270 per DU), so base survival is temperature independent. Extra hazards (2.5) are per gd.

Multipliers by destined caste and flag:

| Case | DU multiplier | Food multiplier | Adult result |
|---|---|---|---|
| worker | 1.0 | 1.0 | worker, scale drawn (1.2) |
| `firstBrood` (founding queen alone) | 1.0 (the time-lapse is the fast track) | 1.0, drawn from the founding pool `R` as `LARVA_COST_LOADS` 1.6 (GDD 06 §5.12) | `nanitic`, scale 0.85 |
| `minim` (early pupation, 2.6) | — | — | scale 0.90 |
| `gyne` [T2] | larva × 2.0, pupa × 1.1 | × 12 (14.4 P + 4.8 C; GDD 06 §11.2 owns) | gyne (reproduction chapter) |
| `male` [T2] | larva × 1.2 | × 2 (2.4 P + 0.8 C; GDD 06 §11.2) | male |

### 2.4 Larval feeding and hunger

- **Gut**: `LARVA_GUT_CAP` 0.3 load (three feeds of `FEED_LARVA_LOADS` 0.1, chapter 01). Each slow tick the larva needs `dP = (P_req/LARVA_DU) × r × dt_gd` and `dC = (C_req/LARVA_DU) × r × dt_gd`.
  - gut has both → consume both, `progress += r × dt_gd`, `fed += (dC, dP)`.
  - gut has P but not C → consume P only at `dP`, `progress += 0.5 × r × dt_gd` (C deficit halves growth).
  - gut has C but not P → consume `0.5 × dC`, no progress, `pStarveT += dt_gd`.
  - gut empty → no progress, `hungerT += dt_gd`.
  - `hungerT` resets to 0 when fed; `pStarveT` resets when gut P > 0.
- **Hunger signal**: `hunger = 1 − (gut.C + gut.P)/LARVA_GUT_CAP`. A larva emits a **feed job** (10.6) when `gut.C + gut.P < LARVA_FEED_REQUEST 0.15`. Job urgency = `hunger + 0.5 × min(1, hungerT / 0.1)`.
- **Feeding mix**: a nurse feed transfers 0.1 load from her crop in crop proportion. Nurses load crops at `NURSE_LOAD_MIX`: P share = `P_req/(P_req + C_req)` = 0.75 (5.4.2).
- Throughput check: at 25 C a larva digests 1.6 load / 0.44 gd = 3.6 loads per gd (one 0.1 feed every ~17 s); one nurse delivers about `NURSE_FEED_CAPACITY` 4.5 loads per gd (load 6 s, walk, 6 feeds of 4 s, walk back: ~60 s per 0.6 load at 80 % duty), so a feeding larva at 25 C occupies ~0.8 nurse; allocation uses this (6.2). Because the larval stage is short, the standing number of larvae is small relative to eggs and pupae.

### 2.5 Mortality hazards (per gd unless noted; additive to base)

| Cause id | Condition | Hazard | Applies to |
|---|---|---|---|
| `starvation` | larva `hungerT > LARVA_STARVE_GD` 0.5 or `pStarveT > LARVA_PSTARVE_GD` 2.0 | death | larva |
| `cannibalised` | starvation stage S3 (5.7) culls | removal | egg, larva |
| `untended` | egg or pupa pile with `now − lastTendedTick > UNTENDED_GD 0.25` | 2.0 | egg, pupa |
| `temperature` | `T ≥ 36` | 3.0 × (T − 35) | all |
| `temperature` | `T ≤ 2` (frost reaching brood) | 1.0 | all except `diapause` larvae (0.1) |
| `humidity` | chamber RH < 50 % (eggs, larvae) | 0.5 | egg, larva |
| `hygiene` | waste items in the chamber > `WASTE_TOLERANCE` 3 | 0.1 per extra item, cap 1.0 | all |
| `exposure` | brood item outside any chamber (dropped) | 1.0, plus `Tmicro` rules | all |
| `flooding` | in water volume (nest chapter) | 6.0 | all |
| `eclosion-failed` | pupa `ready` for > `ECLOSE_WAIT_GD 0.3` without help | 3.0 | pupa |

Each brood death emits `brood-died {cause}` and spawns a waste item (`brood-corpse`) except when cannibalised.

### 2.6 Destined caste, early pupation [T1 worker; T2 alates]

- Every egg laid by a mated queen is `worker` unless the reproduction gate (owned by chapter 06) is open and the `alateInvestment` directive is above 0; then the queen lays `gyne` and `male` eggs at the fractions given by chapter 06 (default spring days 2-6). Eggs laid while the colony has never had an adult worker are `firstBrood`. (`alateInvestment`, GDD 06 §11.3, replaces the earlier `production` directive.)
- **Minims** [T1]: a larva with `progress ≥ 0.8 × LARVA_DU` whose colony has protein need `needP ≥ 0.8` continuously for `MINIM_TRIGGER_GD` 0.25 pupates immediately with flag `minim`. Underfed larvae become small workers; the colony saves protein.

### 2.7 First brood and the founding fast-track [T1]

The opening (chapter 06) runs the normal simulation; the time-lapse fast-forwards the same sim (`step` at high rate). There is no separate biology. **The founding model is owned by GDD 06 §5.5-5.12** (consistency pass); this section only states how the colony systems behave inside it:

1. **Founding pool.** Until the first worker eats, the queen's single founding pool `R` (GDD 06 `FOUND_R0`, Lasius 56 loads, C and P at 1:1) replaces colony stores, `gut`, `reserve` and `reserveP`. Queen upkeep `FOUND_UPKEEP_PER_GD` 0.40 (0.30 C + 0.10 P, no claustral discount), eggs 0.04 each and larval draw `LARVA_COST_LOADS` 1.6 per larva (drawn progressively over the larval stage) all come from `R`.
2. **Founding queen as nurse.** While the colony has no adult worker, the queen runs `queen.found-care` (10.14): she feeds larvae from `R`, tends piles and helps eclosion. In the time-lapse she does this automatically.
3. **First brood.** `firstBrood` larvae develop at normal rates and become nanitics (scale 0.85, crop cap 0.72, nurse feed capacity +10 %).
4. **Cannibalism.** GDD 06 §5.12 step 3 (below `0.10 R0` the queen eats the youngest larva with p 0.25 per 0.05 GD, returning 0.6 of its invested loads) replaces the earlier triage rule.
5. **Founding clutch.** Laid by the player (or automatically) in batches of `OPEN_LAY_BATCH_EGGS` 6 during the opening phase `lay`, capped by `FOUND_CLUTCH_MAX_EGGS` (Lasius 48) and `maxEggsByVolume` (GDD 06 §5.10). AI founding queens (rival, Lineage) lay `FOUND_AI_CLUTCH` 24 eggs.

Expected outcome (GDD 06 §5.12 calibration, chamber 19.5 C, `Q` 0.7, clutch 24): first worker 4.52 GD after the first egg (3.9 GD at 21 C), 8-15 nanitics (mean 11.5), reserves at first worker about 0.4. At hand-over the remaining `R` is split equally into the queen's `reserve` (C) and `reserveP` (P); `QUEEN_FAT_CAP` limits only later refilling.

### 2.8 Diapause and winter [T2]

- Larvae enter `diapause` when `doy ≥ DIAPAUSE_DOY 19` or chamber T ≤ 12 C for > 0.5 gd. Diapause larvae: no progress, no feeding, base hazard × 0.1, no starvation.
- Eggs in autumn still hatch (into diapause larvae); pupae complete and eclose. Thus "all brood overwinters as larvae" emerges.
- Exit: `season = spring` and chamber T ≥ 12 C for 0.2 gd. The overwinter aggregate (chapter 06) reads brood counts and applies its own losses.

### 2.9 Eclosion

When a pupa reaches `PUPA_DU` it becomes `ready` and emits an `assist-eclosion` job. A nurse (or the founding queen) performs `ECLOSE_ASSIST_S` 10 s; the adult spawns at the cocoon position with `callow`, `physioAge = 0`, `health = 1`, `reserve = RESERVE_CAP.callow`, crop empty; a `cocoon` waste item spawns. At pupation the larva leaves a `meconium` waste item.

---

## 3. Queen [T1]

### 3.1 Queen state (in addition to 1.1)

| Field | Meaning |
|---|---|
| `mode` | `founding` (no adult worker yet, or none alive) / `established` / `orphan-dead` |
| `gut {C, P}` | food received from workers; cap `QUEEN_GUT_CAP` 1.0 load |
| `reserve` (C), `reserveP` | fat, flight-muscle protein (founding store; `reserveP` is never refilled) |
| `fecundity` | trait, normal(1.0, 0.15) clamp [0.6, 1.4] |
| `eggBudget` | float eggs; accrues at the laying rate, cap `EGG_BUDGET_CAP` 3 |
| `layingLog` | eggs laid per gd (ring of 28) |

### 3.2 Egg-laying rate

```
potential (eggs/gd) = Q_MAX × fSize(N) × fSeason(d) × fTempQ(T_royal) × fHealth × fecundity × fCap
fSize(N)  = 0.30 + 0.70 × (1 − exp(−N / 300))
```

| Factor | Definition |
|---|---|
| `Q_MAX` (S) | 100 eggs/gd. `fSize` gives 34 at N = 18, 49.8 at N = 100, 74.2 at N = 300, 97 at N = 900 |
| `fSeason(D)` (S), `D = doy + hour/24` (1-based; chapter 06's 0-based `d` = `D − 1`) | `D` in [1, 2): 0.3; linear 0.3 → 1.0 over [2, 5); 1.0 over [5, 15); 0.6 over [15, 18); 0.2 over [18, 21); 0 over [21, 29) (day 21 and winter days 22-28). Matches the dossier: spring day 1 0.3, days 2-4 ramp, summer 1.0, autumn days 15-17 0.6, 18-20 0.2, day 21 0 |
| `fTempQ(T)` | 0 at ≤ 14 C; linear to 1 at 20 C; 1 to 30 C; linear to 0.5 at 34 C; 0 at ≥ 36 C |
| `fHealth` | `health` if ≥ 0.3, else 0 |
| `fCap` | `clamp((WORKER_CAP − projected) / (CAP_TAPER × WORKER_CAP), 0, 1)`, `projected = N + pupae + larvae + 0.9 × eggs` (worker-destined), `WORKER_CAP` (S) 1500 (directions K), `CAP_TAPER` 0.15 |

Mechanics: `eggBudget += potential × dt_gd` each slow tick (cap 3). The AI queen lays (primitive `lay-egg`, 6 s, chapter 01) whenever `eggBudget ≥ 1` **and** `gut.P ≥ EGG_COST_P` 0.04; each egg costs 0.04 P from the gut and 1 budget. Player-issued `lay-egg` draws on the same budget. Protein therefore physically limits laying. The AI queen is **not** subject to chapter 01's player cooldown `LAY_COOLDOWN_S`: at 6 s per egg she can lay at most 100 eggs per gd, which is `Q_MAX`; with the cooldown applied to her the ceiling would be 37.5 eggs/gd and the growth curve would fail.

Founding mode: laying follows GDD 06 §5.10 (batches during the opening phase `lay`, eggs paid from the founding pool `R`); see 2.7.

### 3.3 Queen nutrition

| Item | Value |
|---|---|
| Upkeep (J) | `QUEEN_UPKEEP_C` 0.30 C + `QUEEN_UPKEEP_P` 0.10 P per gd × `fMet(Tb)` (during founding: GDD 06 `FOUND_UPKEEP_PER_GD` 0.40 from `R`, no claustral discount) |
| Payment | from `gut`; if gut C empty → `reserve` (cap `QUEEN_FAT_CAP` 3.0 C); if gut P empty → P upkeep unpaid → `health −0.05` per gd |
| Reserve refill | `0.3 C` per gd from gut when gut C > 0.5 |
| Retinue target | `gut.C ≥ 0.3` and `gut.P ≥ 0.4` (10 eggs' worth) |

**Worker control of laying (laying-protein permission)**: queen-carers add laying protein (P beyond 0.1 per gd upkeep) to the queen ration only when all hold: pool `daysP ≥ LAYING_P_MIN_DAYS 0.25`; mean larval hunger ≤ `LAYING_LARVAL_HUNGER_MAX 0.6`; `larvae ≤ LAYING_LARVAE_PER_NURSE_MAX 3 × nurses + 2`. Otherwise the ration is C plus upkeep P only. Result: laying tracks protein supply and nursing capacity.

### 3.4 Queen with no workers; orphaning

- If all workers die while the queen lives, `mode` reverts to `founding` behaviour (`queen.found-care`) using what remains in `reserve`/`gut`; she does not forage (claustral species). She may lay a new clutch only if `reserveP ≥ 3`.
- Queen death and orphaning are chapter 06's. This chapter's effects: no eggs; queen-care demand 0; queen-carers go `idle`; existing brood continues normally.

---

## 4. Food sources as the colony sees them [T1 minimal set; T2 full set]

Nutrient content per load of collected food (defaults this chapter balances against; GDD 05 §1.2 per-variant values override them and are authoritative for sources):

| Food kind | Form | C per load | P per load | Notes |
|---|---|---|---|---|
| `honeydew` | liquid | 1.00 | 0.02 | trace amino acids [T1: static `honeydew-film` sites, GDD 05 §0; herds T2] |
| `nectar` | liquid | 1.00 | 0.00 | [T1 placeholder sugar source] |
| `sugar` | liquid if wet, else solid granule | 1.00 | 0.00 | [T1: granules and one static spill, GDD 05 §0] |
| `fruit` | liquid (pulp drunk) | 0.80 | 0.02 | [T2] |
| `carrion` | solid pieces | 0.10 | 0.90 | [T1 placeholder protein source; small dead insects] |
| `prey` | solid (after kill) | 0.10 | 0.90 | [T2] |
| `crumb` | solid | 0.70 | 0.15 | [T1: `crumb-starch` and `crumb-protein` (0.2 C / 0.6 P), GDD 05 §0; other variants T2] |
| `pet-food` | solid | 0.30 | 0.60 | [T2] |
| `seed` | solid (elaiosome eaten, seed to midden) | 0.30 | 0.50 | [T2] |
| `bait` | liquid/gel | 1.00 | 0.00 | + toxin (5.4.4) [T2] |
| `dew` | liquid | 0 | 0 | drunk opportunistically; no nutrient; *Lasius* has no water need in T1-T2 |
| `leaf` | — | — | — | not food for *Lasius* |

Source attributes read by this chapter: `id`, `kind`, `pos`, `form`, `amount` (loads), `quality q` (0.5-1.5; sugar concentration or prey freshness), `feedSlots` (simultaneous feeders; default 8 per feeding point), `harvestRate` (liquid load per s per ant, default `DRINK_RATE` 0.05 = GDD 01 `harvest-liquid`, × the source's `drinkRateMult`, GDD 05), `itemBulk` (lm), `odourStrength` (0.5-2), `renewal`.

---

## 5. Food and nutrition model [T1]

### 5.1 The colony pool

The colony holds `stores = {C, P, toxin}` in loads: the abstract social stomach of nest workers plus solid piles in chambers (D6). Every delivery enters it; every in-nest consumption draws on it.

| Constant | Value | Meaning |
|---|---|---|
| `STOMACH_C_PER_ADULT` | 0.8 C | liquid C held in nest workers' crops |
| `STOMACH_C_BASE` | 2 C | |
| `STOMACH_P_PER_ADULT` | 0.15 P | processed protein in crops |
| Pile capacity | `Chamber.capacity.food` from GDD 03 §6.4 (food 2.0 loads per BU³, general 1.0, founding as listed there) | solid piles; this chapter defines no separate per-floor constant (consistency pass) |
| Capacity | `pileC + pileP ≤ pileCap`, where `pileC = max(0, C − (2 + 0.8 N))`, `pileP = max(0, P − 0.15 N)` | |
| `P_SPOIL_HALF_LIFE` | 3 gd at 20 C, × `2^((20 − T)/10)` | applies to `pileP` only (prey does not keep) |
| `C_SPOIL_HALF_LIFE` | 10 gd at 20 C, same T rule | applies to `pileC` only |
| Spoiled food | every 0.5 load spoiled spawns one `spoiled-food` waste item in that chamber | |

`daysC = C / needRateC`, `daysP = P / needRateP` (5.5). Display: "Carbohydrate 31 / 50 (2.8 days)".

### 5.2 Ledgers (all T1; conserved exactly)

| Inflow / outflow | Ledger key |
|---|---|
| Liquid and solid deliveries (by food kind and source) | `in.delivery` |
| Recycled from cannibalised brood (50 % of `fed`) and eaten eggs (0.03 P each) | `in.recycled` |
| Worker upkeep (by task group), queen ration, larval feeds, nurse/carer crop loads not yet fed (in transit) | `out.workers`, `out.queen`, `out.larvae`, `transit` |
| Spoilage | `out.spoiled` |
| Departure rations | `out.ration` |

Invariant (tested): `ΔC_pool = in − out` per tick to 1e-9, and `pool + Σ crops + Σ larval guts + queen gut + Σ fed (alive) + consumed` equals cumulative intake plus starting stock.

### 5.3 Intake paths

| Path | Rule |
|---|---|
| Liquid delivery | Returning forager transfers crop to a receiver (in-nest worker within `RECEIVER_SEARCH` 8 BU, preferring `store`) at `TROPH_RATE` 0.1 load/s; amount = min(crop, pool space). Without a receiver after `UNLOAD_SEARCH_S` 15 s she walks to the nearest `food` chamber (or the colony centre chamber) and unloads directly at half rate. |
| Solid delivery | Carried to the nearest `food` chamber with pile room (else `general`, else entrance chamber, flagging store overflow for the architect). Counted on drop. If a store ant waits at the entrance, the forager drops the item in the entrance drop zone (counted on drop) and the store ant moves it inside. |
| Stores full | Receivers refuse when pool space < 0.05. Forager waits up to `UNLOAD_MAX_WAIT` 60 s, then rests holding her crop (she is now a living store; her crop counts in `stores.inCrops`). The trip counts as **unsuccessful** for activation (6.6). |

### 5.4 Transfers and trophallaxis rules

#### 5.4.1 Pairs

| Pair | Initiated by | Condition | Rate / amount | Effect |
|---|---|---|---|---|
| Forager → receiver | forager | in nest, crop ≥ 0.1 | `TROPH_RATE` 0.1 load/s, until crop empty or pool full | pool += amount |
| Pool → nurse | nurse at a food chamber or touching a `store` ant | pool C ≥ 0.1 or P ≥ 0.1 | 0.1 load/s up to `NURSE_LOAD` 0.6 | crop filled with mix 5.4.2 |
| Nurse → larva | nurse | larva gut space ≥ 0.1 | `feed-larva`: 0.1 load, 4 s | larva gut += 0.1 in crop proportion |
| Pool → queen-carer | carer | as nurse | up to `QUEEN_RATION` 0.4 | mix 5.4.2 |
| Carer → queen | carer | queen gut space ≥ 0.1 | 0.1 load per 4 s feed | queen gut |
| Founding queen → larva | queen | founding pool `R` (GDD 06 §5.5; after hand-over `reserve`, `reserveP`) | 0.1 load per 4 s feed, mix 0.75 P / 0.25 C | larva gut |
| Outside: laden ↔ hungry nestmate [T2] | hungry ant (crop C < 0.05, reserve < 30 %) begs a returning laden forager on contact | donor crop ≥ 0.3 | 0.1 load | keeps far tenders and guards alive |
| Possessed ant gives | player (G) | target nestmate in reach | 0.1 load/s (chapter 01) | in nest: amount enters pool; outside: target crop |
| Possessed ant begs | player (G) | outside AI donor: crop > 0.3 cap; in-nest AI donor: pool `daysC ≥ 0.5` (or beggar is hungry: own crop C < 0.05) — refines chapter 01 | 0.1 load/s, max 0.5 load from pool | |
| Ambient trophallaxis | idle ants in nest | visual only | — | event `trophallaxis {ambient:true}` at `AMBIENT_TROPH_RATE` 1 per 20 idle-ant-minutes; no nutrient change (the pool already represents the network) |

#### 5.4.2 Loading mixes

| Loader | P share of the load |
|---|---|
| Nurse (feeding larvae) | 0.75 (`LARVA_P_REQ/(P+C)`); if pool P short, takes what exists and fills with C |
| Queen-carer, laying permitted | `(0.10 + 0.04 × potential)/(0.40 + 0.04 × potential)` (P share of queen need) |
| Queen-carer, laying withheld | 0.25 (upkeep P only) |
| Departing forager ration | 0 (C only) |

#### 5.4.3 Protein priority under scarcity

When `daysP < 0.5`: nurses choose feed jobs by `urgency × (1 + PRIORITY_PROGRESS_BONUS 1.0 × progress/LARVA_DU)` (larvae nearest pupation first); queen gets upkeep P before laying P (3.3); eggs are not fed but their laying stops. Order of protein: queen upkeep → oldest larvae → young larvae → new eggs.

#### 5.4.4 Toxins [T2]

`bait` delivers `toxin` with its loads into `stores.toxin`; every load drawn from the pool carries `toxin × (load / poolTotal)`; an ant (or larva, queen) receiving `x` toxin loses `TOXIN_HEALTH_PER_LOAD 2.0 × x` health over 0.5 gd (slow poison). Toxin in the pool decays with half-life 3 gd. Details of bait stations belong to the human-events chapter.

### 5.5 Collective demand and how foragers respond

Rolling daily need rates (EMA with time constant `NEED_EMA_GD` 0.5 gd), floors to avoid division by zero:

| Quantity | Definition |
|---|---|
| `needRateC` | worker upkeep + queen C + larval C demand (Σ over feeding larvae of `dC/dt`), min 0.5 C/gd |
| `needRateP` | queen P upkeep + `0.04 × potential laying` + larval P demand + P spoilage, min 0.05 P/gd |
| `targetDays` | C: `STOCK_TARGET_C` 3 gd; P: `STOCK_TARGET_P` 1.5 gd (× directive 12.1: low 0.5, normal 1, high 2) |
| `needC`, `needP` | `clamp(1 − days / targetDays, 0, 1)` (0 = stocked, 1 = empty) |
| `intakeTarget` | `needRateC + needRateP + max(0, targetC − C)/STOCK_REFILL_GD + max(0, targetP − P)/STOCK_REFILL_GD`, `STOCK_REFILL_GD` 2 |
| Desired P share | `sP = needRateP / (needRateC + needRateP)`, then shifted by diet emphasis: `sP' = clamp(sP + 0.4 × diet/100, 0.05, 0.95)` when diet is not `auto` |
| Nutrient weights | `wC = 0.2 + needC × (1 − sP')×2`, `wP = 0.2 + needP × sP'×2` |

Brood presence drives protein demand automatically: every feeding larva adds 2.7 P/gd at 25 C to `needRateP`. Responses (the collective regulation):

1. **More foragers.** `intakeTarget` sets forage demand (6.2).
2. **Source choice.** A forager choosing among sources it knows (its route slots, its lead, sources in the entrance "news", 6.7) scores each: `U = (C_s × wC + P_s × wP) × q × fCrowd / tripTime`, `fCrowd = 1 − occupancy/feedSlots`; picks the max (ties by RNG). Sources in `avoid` markers score 0; in `forage` markers × 1.5.
3. **Trail strength.** Deposits scale with `(0.5 + need of the source's dominant nutrient)` (8.3). Following the corrected research, the need factor acts on **trail laying**, not on an individual's decision to drink.
4. **Recruit acceptance.** A contacted waiting forager accepts a lead with `P = clamp(0.3 + 0.7 × w_lead / max(wC, wP), 0.3, 1)`.
5. **Stores full.** `need = 0` and failed unloads suppress activation.

### 5.6 Consumption order inside a tick

Per slow tick: (1) worker upkeep, (2) queen gut upkeep, (3) larval digestion (guts), (4) spoilage, (5) reserve refills. Feeds and loads happen as behaviour actions. If the pool cannot pay an in-nest upkeep fully, the remainder falls to that ant's crop, then reserve.

### 5.7 Starvation sequence (who dies first)

| Stage | Entry | Effects | Exit |
|---|---|---|---|
| S0 `fed` | default | none | — |
| S1 `lean` | `daysC < 1.0` or `daysP < 0.3` | alert `food-c-low` / `food-p-low`; reserve refill stops; laying protein withheld (3.3); forage demand at target | both above (1.3, 0.5) for 0.1 gd |
| S2 `rationing` | pool C = 0 (or pool P = 0) | in-nest upkeep from crops then reserves; queen-carers feed the queen from their own reserve (worker → queen transfer); larvae without P stop growing | pool > 0.5 C and > 0.1 P |
| S3 `brood-sacrifice` | pool P = 0 for > 0.2 gd or pool C = 0 for > 0.5 gd | nurses run `nurse.cannibalise`: eggs first (each +0.03 P), then larvae with the lowest `progress` whose `hungerT > 0.1`; cull rate `CANNIBAL_RATE` 1 item per 30 s per colony; recycled into pool; alert `colony-starving` | as S2 exit |
| S4 `adult-starvation` | any worker at reserve 0 with no food source | health loss 0.5/gd per such ant; deaths cause `starvation` | — |

Resulting order of death: eggs → least-developed larvae → older larvae → old workers (foragers, reserve 0.25) → mid → young nurses (0.60) → callows → queen last (gut + 3.0 C fat + carers' donations). Pupae need no food and survive while any nurse remains to help eclosion.

---

## 6. Task allocation [T1]

### 6.1 Tasks, groups, eligibility

| Group (slider) | Tasks | Eligible |
|---|---|---|
| `forage` | `scout`, `forage`, `tend` [T2] | non-callow, `health ≥ 0.4`, not queen |
| `nurse` | `nurse`, `queen-care`, `store` | all workers incl. callows |
| `dig` | `dig`, `haul` | non-callow |
| `defend` [T2] | `guard`, `patrol` | non-callow, `health ≥ 0.4` |
| (unassigned) | `idle`; `rest` is a state any ant enters by fatigue | |
| (reactive overrides) | `fight`, `flee` — entered from any task; the ant keeps `task` and resumes it | |

Group ids `forage`, `nurse`, `dig`, `defend` match the Directives panel (chapter 08).

### 6.2 Demand per task (worker-equivalents), recomputed every `ALLOC_PERIOD` 10 s

| Task | Demand `D_t` |
|---|---|
| `nurse` | `larvalDemandRate / NURSE_FEED_CAPACITY (4.5 loads/gd)` + `eggs / EGGS_PER_NURSE 25` + `pupae / PUPAE_PER_NURSE 15` + `0.25 × pendingBroodMoves` + `diapauseLarvae / 40`; min 1 if any brood |
| `queen-care` | established queen alive: `2 + floor(N / 100)`, cap 10; else 0 |
| `store` | `max(1, 0.15 × foragersActual)` if foragers ≥ 1; + `spoiledItems / 10` |
| `forage` | `min(intakeTarget / yieldPerForager, knownCapacity + 1)`; `yieldPerForager` = EMA (1 gd) of loads delivered per forage-task ant per gd, default 1.5, floor 0.5; `knownCapacity` = Σ over known sources of `feedSlots × trips/gd` estimate |
| `scout` | `max(1, 0.02 N) + 0.05 N × shortfall`, `shortfall = clamp(1 − knownCapacityLoads / intakeTarget, 0, 1)`; cap `0.15 N`; 0 when `surfaceActivity < 0.1` |
| `tend` [T2] | Σ over known tended herds of `tenderSlots` (ecology: aphids / 5) |
| `dig` | `digDemand` from the nest chapter (worker-equivalents) |
| `haul` | `loosePellets / 6 + wasteItems / 6 + corpses / 2`, cap `0.2 N` |
| `guard` [T2] | `N ≥ 40`: `entrances × GUARDS_PER_ENTRANCE 1 × threatMult`; `threatMult` 1, or 3 while any alarm cell near an entrance > `ALARM_ALERT` or rivals within 60 BU |
| `patrol` [T2] | `N ≥ 40`: `max(1, 0.02 N) × threatMult` |

### 6.3 Targets: auto and manual

`A` = workers that are alive, not `controlled`, not in `fight`, not `dormant`, `health ≥ 0.4` for outside groups.

**Auto (default).** If `ΣD ≤ A`: `target_t = round(D_t)`; the rest are `idle`. Otherwise two passes in priority order (`guard` when threat, `nurse`, `queen-care`, `forage`, `store`, `tend`, `scout`, `haul`, `dig`, `guard` without threat, `patrol`): pass 1 gives each task `ceil(0.5 D_t)`, pass 2 tops up to `D_t` while workers remain.

**Manual.** Player shares `S_g` (sum 100 %). `A_eff = A × (1 − MANUAL_RESERVE 0.10)`. Group target `G_g = round(A_eff × S_g)`, then:
- floor: `G_g ≥ min(A, ceil(MANUAL_FLOOR 0.25 × D_g))` — the colony cannot be ordered to abandon a need entirely;
- useful cap: `nurse` ≤ `2 D + 1`, `dig` ≤ `3 D + 1`, `defend` ≤ `3 D + 2`; `forage` uncapped (extra ants scout);
- within a group, split in proportion to `D_t`; if all `D_t = 0`, `forage` → `scout`, `nurse` → `nurse` (grooming), others → `idle`.
Excess after floors/caps → `idle`. The panel shows per group: need (`ΣD`), target, actual.

### 6.4 Response thresholds and age polyethism

Stimulus for task `t`: `s_t = clamp((target_t − actual_t) / max(target_t, 1), 0, 1)` + local cues (`+0.3` for `nurse` if a feed job is within 6 BU; `+RESUME_LOCALITY_BONUS` 0.25 (chapter 01 owns the value) for released ants). Probability of taking `t` at a re-evaluation: `P_t = s_t² / (s_t² + θ_t²)`, `θ_t = THETA_BASE 0.4 × ageMult[band][t] × exp_t`.

`ageMult` (lower = more willing):

| Band | nurse | queen-care | store | dig | haul | guard | patrol | forage | scout | tend |
|---|---|---|---|---|---|---|---|---|---|---|
| `callow` | 0.7 | 0.7 | 1.5 | — | — | — | — | — | — | — |
| `young` (< 6 gd) | 0.6 | 0.6 | 0.9 | 1.4 | 1.6 | 2.0 | 3.0 | 2.5 | 3.0 | 2.5 |
| `mid` (6-12) | 1.2 | 1.3 | 0.8 | 0.8 | 0.9 | 0.9 | 1.2 | 1.2 | 1.5 | 1.0 |
| `old` (≥ 12) | 2.5 | 2.5 | 1.3 | 1.2 | 0.8 | 0.8 | 0.7 | 0.6 | 0.7 | 0.7 |

Nanitics use `mid` multipliers from eclosion + 0.3 gd (they must do everything). Experience: finishing a task cycle multiplies `exp_t` by 0.95 (min 0.5); each gd every `exp` relaxes 10 % toward 1 (max 1.5).

With full deficit (`s = 1`), a young ant takes `forage` with `P = 1/(1 + 1.0²) = 0.5`, an old one (`θ` = 0.24) with 0.95: small colonies send young ants out (precocious foraging) while large ones keep the age order.

### 6.5 Re-evaluation cadence and hysteresis

| Rule | Value |
|---|---|
| An ant re-evaluates at the end of a task cycle (delivery, feed round, pellet drop, patrol loop, guard shift) | — |
| Idle ants re-evaluate every `IDLE_REEVAL_S` | 5 s |
| Forced check if its task is in surplus (`actual > 1.2 × target + 1`) | every 120 s |
| Leaving a surplus task | `P = (actual − target)/actual` |
| Minimum tenure before a non-emergency switch | `TASK_MIN_TENURE_S` 60 s |
| Selection | roulette over `P_t` of deficit tasks + "stay" weight 0.3 (0 if current task in surplus); accepted switches update `actual` immediately |
| Never reassigned | `controlled` ant (chapter 01), ant carrying an item until it delivers or drops it |

### 6.6 Forager activation by interaction rate (D4)

Ants with task `forage` (and `tend`) wait in the entrance chamber (`forage.wait`, within 10 BU of an entrance) between trips.

| Constant | Value | Rule |
|---|---|---|
| `ENC_GAIN` | 0.5 | added to `activation` per antennal contact with a **successful** returning nestmate (crop ≥ 0.5 load unloaded or solid delivered, or scout with a find); ×1.5 for scouts' news |
| `ENC_HALF_LIFE_S` | 40 s | exponential decay of `activation` |
| `RECRUIT_CONTACTS_MAX` | 3 | a successful returner contacts up to 3 nearest waiting foragers within 6 BU (1 s antennation each) |
| `ACTIVATION_DEPART` | 1.0 | depart when `activation ≥ 1`; reset to 0 |
| `SPONT_DEPART_RATE` | 1/240 per s × `(0.25 + max(needC, needP))` | baseline hazard; × 2 for an ant holding a learned route to a live source |
| `fEnv` | `surfaceActivity` (chapter 06) × `(0.7 + 0.3 × clamp((RH − 40)/40, 0, 1))` | multiplies gain and spontaneous rate; humidity term from *Pogonomyrmex* (analogy) |
| Curfew | `fEnv < 0.05`, `storm`, directive `stayIn`, or alarm at the entrance > `ALARM_STRONG` | no departures |

Unsuccessful returners contact too but add 0. The loop is excitable: with one successful return per 17 s and 3 waiting ants, steady `activation` ≈ `0.058 × 0.5 × 57.7 = 1.7` (departures follow returns within ~25 s); at half that return rate it stays at ~0.84 and departures fall to the spontaneous rate (mean wait ~330 s at moderate need).

### 6.7 Recruitment is information transfer

A contacted waiting forager receives the returner's source as `lead {sourceId, pos, tick}` if it accepts (5.5 rule 4); valid for `LEAD_VALID_S` 120 s. A departing ant with a lead follows that source's trail (visible); its hidden fallback is the coarse planner to `lead.pos`. The entrance keeps a "news" list of the last 5 sources reported by successful returners (expiry 0.5 gd), used by foragers without a lead or route. `knownSources` (colony) = union of sources in living ants' route slots, leads and news; it drives demand and diagnostics.

---

## 7. Perception [T1; vision and vibration T2]

| Sense | Range | Update | What it yields |
|---|---|---|---|
| Contact (antennation) | centre distance ≤ `CONTACT_DIST` 1.2 BU and target within ±60° of heading | every tick, via spatial hash | nestmate vs non-nestmate (colony id); task cue (forager / nurse / guard / queen); donor crop fill; brood stage, hunger, destined caste; item kind, nutrients, bulk; corpse age; aphid |
| Antennal chemoreception | two sample points `ANTENNA_REACH` 0.9 BU ahead at ±35° | every tick | `trail`, `home`, `alarm` values (trilinear in the pheromone grid) for steering; surface `Tmicro` ahead (heat refusal, chapter 06) |
| Smell (volatile) | food: `SMELL_RANGE_FOOD` 12 BU × `odourStrength`; corpse 3 BU; creature 6 BU | 0.5 s | bearing to the strongest odour source in range |
| Vision [T2] | moving objects ≥ 2 BU within `VISION_RANGE` 15 BU on the surface when `light ≥ 0.1`; looming shadow 40 BU | 0.5 s | predators, large moving objects, light level |
| Vibration [T2] | event-driven, from chapter 06 / human events | event | tremor warning |
| Self | always | — | `Tb`, health, crop, reserve, fatigue, `homeVec`, gravity up, depth |

What an ant can know: only the above plus its own memory (routes, crumbs, lead, depleted list, decisions). Colony aggregates (6.2, 5.5) are used by allocation only (D7). Inspecting an ant shows task, state, target, the reason code of its last state change and its five last decisions.

Reason codes (new ids): `recruited`, `spontaneous`, `crop-full`, `item-collected`, `source-depleted`, `source-crowded`, `trail-lost`, `stuck`, `stores-full`, `hungry`, `fatigue`, `threat`, `alarm`, `curfew`, `too-hot`, `too-cold`, `rain`, `deficit:<task>`, `surplus`, `released`, `marker:<kind>`, `job:<kind>`, `timeout`.

---

## 8. Pheromones [T1 `trail`, `home`; T2 `alarm`]

### 8.1 Field

Sparse 3D grid of 4 BU cells (seed). Chunks of 16³ cells; `trail` and `home` are stored **per colony** (colony-specific blends and cuticular hydrocarbons); `alarm` is shared. Values are `Float32` in pheromone units (ph). Cells below `PHERO_EPS` 0.005 are cleared; empty chunks are freed. `trail` and `home` are deposited only on surfaces outside cavities (inside the nest ants use BFS fields); `alarm` exists everywhere.

### 8.2 Constants

| Constant | Value | Notes |
|---|---|---|
| `TRAIL_HALF_LIFE` | 900 s at 22 C | dossier game value (biological ~33 min, unverified); matches chapter 06's assumption |
| `HOME_HALF_LIFE` | 1200 s (2 gd) | non-volatile hydrocarbons |
| `ALARM_HALF_LIFE` | 15 s | volatile |
| Temperature factor | half-life × `2^((22 − T)/10)`, clamp [0.25, 3] | `T` = surface temperature of the cell |
| Exposure factor (trail) | × 0.5 sunlit porous soil (`loam`, `humus`, `sand`, `clay`, `gravel`); × 1.5 sheltered (under cover, in cracks); × 1 otherwise | dossier |
| Heat weather | trail decay × 1.5 on cells with `Tmicro ≥ 35` | chapter 06 3.5 |
| Rain, storm, wind | chapter 06 3.7 (`WASH_K`, wind factor) applied by this system on `exposed` cells | not duplicated here |
| `TRAIL_MAX` / `HOME_MAX` / `ALARM_MAX` | 30 / 20 / 10 ph per cell | saturation (deposits clamp) |
| `TRAIL_DETECT` | 0.3 ph | below: not followable |
| `HOME_DETECT` / `HOME_EXPLORED` | 0.1 / 2.0 ph | scouts avoid > 2.0 |
| `ALARM_ALERT` / `ALARM_STRONG` | 0.5 / 3.0 ph | |
| `TRAIL_DAB` | 0.25 ph × factors (8.3) every `TRAIL_DAB_SPACING` 1.5 BU | while laying |
| `HOME_DEPOSIT` | 0.04 ph per BU walked, every colony ant outside | passive footprints |
| `ALARM_RELEASE` / `ALARM_FIGHT_RATE` | 4 ph per release / 1.5 ph per s while fighting | |
| `ALARM_DIFFUSE` | 0.12 of a cell's value per s shared equally to free neighbours | alarm only; trail and home do not diffuse |
| Decay step | every 10 ticks, active chunks only, staggered | |

Equilibrium check: one returning forager per 150 s on a trail lays 2.67 dabs × 0.25 = 0.67 ph per cell per pass; with τ = 900/ln 2 = 1298 s the cell holds ~5.8 ph (≫ `TRAIL_DETECT`); ten such foragers saturate at 30. An abandoned saturated trail falls below detection after `log2(30/0.3)` = 6.6 half-lives ≈ 100 min in shade; rain removes it in minutes.

### 8.3 Trail laying rules

| Who / when | Laying probability on the return leg | Dab factor |
|---|---|---|
| Forager with crop ≥ `CROP_RETURN_FRACTION` 0.8 of capacity or carrying a solid food item | `TRAIL_LAY_P_FORAGER` 0.84 × `clamp(0.4 + need_n, 0.4, 1)` | `q × (0.5 + need_n) × sizeFactor(N)` |
| Scout with a find | 0.84 × same clamp | same × 1.2 |
| Forager that waited > 15 s in a full source queue | 0 (crowding feedback) | — |
| Outbound on a trail it already follows | lays at 0.3 × dab (dossier: outbound ants lay less on marked routes) | |
| Ant at an item too heavy to move (11) | always, dab × 1.5 | short-range group recruitment |
| Possessed ant, R toggled | always | with food: as forager; without: 1.0 |

`need_n` = `needC` or `needP` of the source's dominant nutrient; `sizeFactor(N) = clamp(0.3 + 0.7 × (N − 10)/65, 0.3, 1)` (D8: full strength at 75 workers). Decision is made once per return trip; the ant lays from the source until it enters the nest.

### 8.4 Trail following

- Steering: turn rate `ω = TRAIL_TURN_GAIN 2.5 rad/s × (L − R)/(L + R + 1.0)` plus wander noise × (0.3 when on trail ≥ 1 ph). Direction along the trail: outbound = increasing `homeVec` length; inbound = decreasing. U-turn probability per s: 0.02 on the correct heading, 0.15 if the trail weakens below 0.5 × its value 5 BU earlier.
- Trail ignorers: at the start of each foraging bout an ant sets `trailIgnorer` with `P = TRAIL_IGNORE_P` 0.20 (not a fixed trait). Ignorers use route memory, lead position (planner) or search.
- Lost trail: no sensor above `TRAIL_DETECT` for `TRAIL_LOST_S` 8 s → route memory if any; else local search 20 s (10.2 F3); else planner to `lead.pos` (hidden fallback). Event `trail-lost` when ≥ 3 ants lose the same trail within 60 s (alert `trail-lost`).
- Experienced ants: with a learned route (9.3), the route wins over a conflicting trail (memory overrides pheromone in *L. niger*).

### 8.5 Sweeping and other disturbances

| Event (GDD 04 §15 supplies the footprint) | Effect on cells in the footprint |
|---|---|
| all human events | the `trail` / `home` multipliers of GDD 04 §15.4 (owner; e.g. footsteps × 0.3 / × 0.7, mowing × 0.5 / × 0.8, broom × 0.3 / × 0.6, wipe × 0.05 / × 0.3, vacuum × 0 / × 0); `alarm` takes the `trail` multiplier |
| `watering` | GDD 04 §15.4 multipliers during the event, then treated as `rain` of the matching class (chapter 06) |

---

## 9. Navigation memory [T1]

### 9.1 Path integration

On leaving an entrance, `homeVec` is reset to that entrance. Each tick it integrates displacement with error `PI_NOISE` 2 % of distance walked (random direction, accumulates). Used as last-resort homing direction and to orient trails. Error resets at the entrance.

### 9.2 Breadcrumbs and retrace with shortcuts

| Constant | Value | Rule |
|---|---|---|
| `CRUMB_SPACING` | 6 BU | record position when 6 BU from the last crumb, or after a heading change > 45° and ≥ 3 BU |
| `CRUMB_CAP` | 96 | when full, keep crumb 0 (entrance) and drop every second crumb (coverage stays) |
| `LOOP_CLOSE_DIST` | 3 BU | if a new crumb is within 3 BU of an older crumb `k`, crumbs after `k` are deleted (loop erasure) |
| `SHORTCUT_LOOKAHEAD` | 8 | homing: from crumb `i`, test crumbs `i−8 .. i−1` (oldest first) for a direct walkable line (coarse nav cells passable, height step < climbable, no `avoid` marker); target the oldest that passes |
| Stuck while retracing | progress < 2 BU in 10 s | skip to planner path to the entrance for 30 BU, then resume |

Crumbs are cleared on entering the nest.

### 9.3 Route memory (learning)

| Constant | Value | Rule |
|---|---|---|
| `ROUTE_SLOTS` | 2 | per ant: `{sourceId, waypoints[≤32], visits, lastUsedTick}` |
| `ROUTE_SIMPLIFY_TOL` | 2 BU | after a successful round trip, the loop-erased crumbs (reversed) are simplified (Douglas-Peucker) into waypoints |
| `ROUTE_MATCH_DIST` | 6 BU | new path within 6 BU of ≥ 70 % of stored waypoints → `visits += 1` and the shorter of the two is kept; otherwise replaced (`visits = 1`) |
| `ROUTE_FIX_VISITS` | 3 | `visits ≥ 3` = learned: outbound and inbound walk waypoints directly, wander × 0.3, no U-turns, `ROUTE_SYNERGY` speed bonus where trail present |
| `ROUTE_FORGET_GD` | 2 gd | unused for 2 gd → slot cleared |
| Depleted | source found empty twice in a row → slot cleared; once → `depleted` entry (1 gd) |
| Slot replacement | least recently used | |

Possessed ants record crumbs and routes the same way (chapter 01).

---

## 10. Behaviour state machines

### 10.0 Common rules

Interrupt priority (highest first; checked every tick): death → `controlled` (player intent replaces the behaviour; chapter 01) → `flee` triggers → `fight` engagement (combat chapter) → environmental recall (rain/storm/curfew/too hot or cold: outside ants switch to `*.return`) → hungry return (1.4) → fatigue rest (at cycle end) → task behaviour. When an override ends, the ant resumes its task in the state given as "resume" below.

Universal failure handling:

| Failure | Detection | Response |
|---|---|---|
| Target gone (item taken, source exhausted, larva died, chamber removed) | target validity check each slow tick | state's "target gone" exit; reason `source-depleted` / `job:*` |
| Stuck | progress < 2 BU in 10 s while moving | planner path (surface) or BFS re-plan (nest) for 30 BU; 3 stucks in 60 s → drop task to `idle` (items put down) |
| Path impossible (entrance sealed/blocked, no route) | planner returns none | outside ant waits at the nearest entrance-adjacent sheltered spot and re-tries every 30 s; inside ant goes `idle` |
| Carried item and task change | — | deliver first; `drop` only on flee contact or death |
| Death while carrying | — | item dropped at position (brood → `exposure` hazard; food item stays as a source) |

### 10.1 `scout` [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `scout.depart` | assigned, departs (6.6) | take ration, walk out of entrance 10 BU | → `explore` |
| `scout.explore` | | correlated random walk (turn σ 25°/s), heading bias: away from `home > HOME_EXPLORED`, toward open `forage` markers (50 % of scouts pick one as a waypoint), away from `avoid`; prefers unexplored coarse cells (colony explored bitmap) | food odour in smell range → `investigate`; contact with food → `assess`; time > `SCOUT_MAX_S` 300 s or distance > `SCOUT_MAX_RANGE` 700 BU or crop C < 0.05 → `return` (unsuccessful) |
| `scout.investigate` | odour | climb gradient toward source | contact → `assess`; 30 s no progress → `explore` |
| `scout.assess` | at source | read nutrients, quality; source added to own route slot (provisional) | always accept → `collect` |
| `scout.collect` | | as `forage.collect` | → `return` |
| `scout.return` | | homing (9.2), laying trail per 8.3 if successful | enter nest → `report` |
| `scout.report` | in entrance chamber | recruit contacts (6.6, gain × 1.5), add source to news; unload as forager | → task re-evaluation (usually becomes `forage` for this source) |

### 10.2 `forage` (recruit, outbound, collect, return, deliver) [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `forage.wait` | in nest, between trips | stand in entrance chamber, antennate passers; `MET_REST` | `activation ≥ 1` or spontaneous → choose source (5.5) → `outbound`; no known source → re-evaluate (scout demand); curfew holds |
| `forage.outbound` | departs with lead/route/news | learned route: walk waypoints; else trail following (8.4); ignorer or no trail: planner to source pos; ration taken | contact/smell of source → `collect`; arrived (≤ 4 BU from source pos) but nothing → `search`; trail lost → 8.4 rules |
| `forage.search` | expected source not found | expanding spiral, radius to 10 BU, 30 s | found → `collect`; else mark `depleted`, → `return` (unsuccessful) |
| `forage.queue` | all `feedSlots` occupied | wait ≤ 4 BU from source up to 20 s | slot free → `collect`; timeout → next-best known source within 100 BU (`outbound`) else `return` |
| `forage.collect` | at source | liquid: `harvest-liquid` at `harvestRate` (0.05 load/s; a full crop in 20 s); solid ≤ `carryCap`: `pick-up` 3 s; solid > `carryCap`: section 11; prey: combat first | crop ≥ `CROP_RETURN_FRACTION` 0.8 or source empty with crop ≥ 0.1 → `return` (successful if ≥ 0.5 load); item lifted → `return` |
| `forage.return` | | homing: learned route → breadcrumbs with shortcuts → planner; trail laying per 8.3; walks loaded (locomotion factor) | enter nest → `deliver` |
| `forage.deliver` | inside | liquid → receiver (5.3); solid → food chamber pile; during unloading, recruit contacts with waiting foragers (only if successful) | done → route learning update (9.3), `exp` update → `wait` or re-evaluate; stores full after 60 s → `rest` with crop (unsuccessful) |

Timings for a source 150 BU away (path 180 BU each way at 6 BU/s): walk 60 s round, collect 33 s, deliver 10-20 s, wait 30-90 s: cycle ≈ 150-200 s, i.e. ~2.5 trips per gd at 75 % surface activity. Directions J's 600 BU round trip: 100 s walking + 33 s collect + ~15 s = ~2.5 min.

### 10.3 `tend` (honeydew herds) [T2]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `tend.outbound` | assigned to herd (`target`) | as forage outbound | at herd plant → `solicit` |
| `tend.solicit` | | `tend-aphid`: antennate aphids; crop fills at `min(TEND_SOLICIT_RATE 0.025 load/s, herdYield / tendersPresent)` (one `APHID_DROPLET` 0.15 load per 6 s `tend-aphid` cycle, GDD 01/05) | crop ≥ 0.8 → `return`; if herd guard roster < `TEND_GUARD_FRACTION 0.3` of tenders → `guard-herd` |
| `tend.guard-herd` | | stay on plant ≤ `TEND_GUARD_SHIFT` 0.25 gd; patrol aphids; drink own upkeep from honeydew; attack aphid predators (`ladybird`, `ladybird-larva`, `lacewing-larva`) on contact via combat; alarm release | shift over → `solicit` then `return` |
| `tend.return` / `tend.deliver` | | as forage (trail laying applies) | → `tend.wait` (as `forage.wait`) |
| Failure | herd gone / plant mowed | | `source-depleted` → re-evaluate |

### 10.4 `nurse` [T1]

Nursery job board (per colony, rebuilt every 2 s): jobs with priority:

| Job | Priority | Source |
|---|---|---|
| `rescue` (brood item outside chambers) | 10 | brood outside any chamber |
| `evacuate` (flood or alarm in chamber) | 9 | nest chapter flood state, alarm > `ALARM_STRONG` |
| `assist-eclosion` | 6 | pupa `ready` |
| `feed` | 5 + 3 × urgency (+ progress bonus 5.4.3) | larva request |
| `move` (sorting, 10.4.1) | 3 | sort pass |
| `tend-pile` | 2 + 4 if untended > 0.15 gd | egg/pupa piles |
| `groom` | 1 | always available |

A job is claimed by one nurse (timeout 60 s).

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `nurse.select` | idle in nursery | claim highest-priority job within reach, distance penalty 0.05/BU | job → state; none → `groom` |
| `nurse.load` | `feed` job and crop < 0.1 | go to nearest food chamber / store ant, load `NURSE_LOAD` 0.6 with mix 5.4.2 (6 s) | → `feed` |
| `nurse.feed` | crop ≥ 0.1 | go to larva, `feed-larva` 4 s; chain up to 6 feeds to other requesting larvae within 6 BU | crop < 0.1 → `select`; larva gone → `select` |
| `nurse.tend` | `tend-pile` | groom pile 5 s (sets `lastTendedTick` for items within 2 BU) | → `select` |
| `nurse.carry` | `move` / `rescue` / `evacuate` | `pick-up` (eggs: up to `EGGS_PER_CARRY` 5; larva or pupa: 1), BFS walk to target slot, `put-down` | delivered → `select`; target chamber invalid → re-sort target |
| `nurse.assist` | `assist-eclosion` | 10 s at pupa | → `select` |
| `nurse.cannibalise` | starvation S3 only | eat chosen egg/larva 6 s | → `select` |
| `nurse.groom` | nothing else | groom brood or nestmates 8 s | → `select` |

#### 10.4.1 Brood sorting by microclimate

Every `BROOD_SORT_PERIOD` 60 s (staggered per colony) each brood group (eggs+young larvae, older larvae, pupae) in each brood-capable chamber (`nursery`, `royal`, `founding`, `general`, `rest`) is scored:

`score(ch, stage) = r(T_ch)/1.818 × hum(stage, RH_ch) × (1 − crowd) × (1 − 0.8 × floodRisk) × (1 − min(1, waste/10)) + 0.1 [nursery] + 0.1 [royal, eggs only] − 0.002 × BFS distance to the royal chamber`

`hum`: eggs and larvae 1.0 at RH 70-95 %, 0.6 at ≤ 50 %, linear between, 0.5 above 98 %; pupae 1.0 at 50-85 %, 0.7 above 95 %. `crowd = clamp(((items + incoming)/cap − 0.8)/0.2, 0, 1)`, `cap = Chamber.capacity.brood` (GDD 03 §6.4, e.g. nursery 1.5 brood per BU³ of volume). Chambers marked `avoid` score 0.

If `best > current × 1.15 + 0.05`, up to `4 × nursesAvailable` items of that group get `move` jobs to `best`. Temperature changes through the day (shallow chambers under a sun-warmed stone heat by day) therefore produce morning up-moves and evening down-moves. `move-brood` markers override (12.3). Chapter 01's "brood chamber the colony chapter selects for that stage" = current `best` for that stage.

### 10.5 `queen-care` [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `queen-care.attend` | assigned | stay within 3 BU of queen, groom her (cosmetic) | queen gut below target → `load`; eggs at queen → `collect-eggs` |
| `queen-care.load` | | load `QUEEN_RATION` 0.4 at food chamber with mix 5.4.2; in S2 transfer from own reserve instead | → `feed` |
| `queen-care.feed` | | 0.1 load per 4 s until queen gut target or crop empty | → `attend` |
| `queen-care.collect-eggs` | eggs within 2 BU of queen | pick up ≤ 5, carry to the best egg slot (10.4.1) | → `attend` |
| `queen-care.escort` | queen relocating | follow queen | queen arrived → `attend` |
| Failure | queen dead | | → `idle` |

### 10.6 `store` [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `store.post` | assigned | wait in entrance chamber inner zone, facing in | forager with crop ≥ 0.1 contacts → `receive`; solid in drop zone → `shift`; spoiled item → `clean` |
| `store.receive` | | trophallaxis 0.1 load/s; amount enters pool (5.3); refuses when pool full | done → `disperse` |
| `store.disperse` | | walk into nest 15 s (busy; models distribution) | → `post` |
| `store.shift` | | carry solid from drop zone to pile | → `post` |
| `store.clean` | spoiled item in food chamber | carry to the midden (as haul) | → `post` |

Unloading delay (mean `forage.deliver` wait) is published as a diagnostic factor.

### 10.7 `dig` [T1] (plans, carve spheres and pellet caches are the nest chapter's)

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `dig.claim` | assigned | claim a frontier sphere of an active plan (nest chapter API) | claimed → `travel`; none → re-evaluate |
| `dig.travel` | | BFS walk to the frontier | arrived → `bite` |
| `dig.bite` | | `dig-bite` (duration GDD 03 §1.2: `DIG_BITE_S` 1.0 s × material and caste factors) → holds pellet | → `stow` |
| `dig.stow` | holding pellet | if a pellet cache within 6 BU behind the frontier has room and haulers > 0: drop there; else carry out (as `haul.carry`) | → `travel` (next sphere) |
| Failure | plan cancelled, collapse, frontier unreachable | | put pellet in nearest cache or carry out; → re-evaluate |

### 10.8 `haul` (soil, waste, corpses) [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `haul.claim` | assigned | claim nearest job: corpse (priority 3, after `CORPSE_DETECT_S` 60 s post-mortem), waste (2), pellet in cache or loose (1) | → `travel`; none → re-evaluate |
| `haul.travel` / `haul.pick` | | walk; `pick-up` 3 s | → `carry` |
| `haul.carry` | | pellet → surface, drop `MOUND_DROP` 3-8 BU outside the entrance (nest chapter merges into mound); waste and corpses → colony midden (nest chapter site; default: surface point 15-40 BU from the main entrance, downhill, ≥ 10 BU from any trail; or a `midden` chamber) | drop → `return` |
| `haul.return` | | to nest | → `claim` |
| Rules | | Corpses of nestmates within 60 BU of an entrance are hauled; farther ones are left. Corpses of prey or rivals are food (`carrion`), handled by `forage`. Midden unreachable → drop in a dead-end tunnel and flag `midden-blocked` | |

### 10.9 `guard` [T2]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `guard.post` | assigned | hold at an entrance rim within 3 BU, head outward; antennate every ant passing within contact | non-nestmate or predator contact → `alarm-raise` then combat; shift > `GUARD_SHIFT_S` 300 s → re-evaluate |
| `guard.alarm-raise` | intruder | `release-alarm` (4 ph), block opening (`block-opening`) | → combat (`fight`) |

### 10.10 `patrol` [T2]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `patrol.loop` | assigned | pick waypoints on the home-range edge (`home` 1-3 ph) and on active trails; walk at cruise; deposits home marks | food found → like scout (`assess`); creature/rival seen → `alarm-raise` if within 15 BU of trail/entrance, else note; `PATROL_TRIP_S` 180 s → return; re-evaluate in nest |

### 10.11 `idle` and `rest` [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `idle` | no assignment | wander slowly in `rest`/`general` chambers near the colony centre; ambient trophallaxis (visual); acts as liquid receiver (5.3) | re-evaluation every 5 s |
| `rest` | `fatigue ≥ 0.9`, injury, or failed unload | stand still in a `rest` / `general` chamber (outside: under cover, rarely); antennae lowered | `fatigue ≤ 0.2` (and `health ≥ 0.6` if injured) → resume task |

### 10.12 `flee` [T2]

| Trigger (any) | Response |
|---|---|
| Predator seen within `FLEE_TRIGGER_DIST` 6 BU (vision/vibration) by an ant whose aggression test fails (young, carrying brood, `health < 0.4`, or outmatched per combat chapter) | run away from the threat at `RUN_SPEED` for `FLEE_RUN_S` 4 s, then freeze 2 s, then re-check; max 3 cycles, then return home |
| Alarm ≥ `ALARM_ALERT` for young ants / nurses inside the nest | move away from the gradient; nurses switch to `evacuate` jobs |
| Looming shadow / tremor warning (human events) | run perpendicular to the approach for 4 s |
| Being bitten while not fighting | drop solid item, flee |
| Heat: `Tmicro ≥ shadeSeekC` ahead | turn away (chapter 06 refusal); not a flee state |

Exit: threat out of range for 6 s → resume previous task state (outside tasks resume at `*.return` if crop ≥ 0.5 or carrying).

### 10.13 `fight` [T2]

Entry: contact with non-nestmate/predator and the combat chapter's engage test passes (old ants, guards, patrols, alarm ≥ `ALARM_STRONG` lower thresholds). Behaviour and exit owned by the combat chapter. On exit: `health < 0.25` → `flee` then `rest`; else resume.

### 10.14 Queen behaviours [T1]

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `queen.found-care` | `mode = founding`, sealed cell (opening script owns digging and sealing) | auto-performs: lay (budget), feed larvae from reserves (0.1 load / 4 s; P share 0.75), tend piles, help eclosion, triage (2.7); `MET_LIGHT` × 0.5 | first nanitic ecloses → `mode = established` |
| `queen.reside` | established | stay in royal chamber (or founding chamber until a `royal` exists); lay when budget and gut allow; solicit retinue (contacts) | relocation → `relocate`; alarm/flood in chamber → `relocate` to best safe chamber |
| `queen.relocate` | `move-queen` marker, flood, alarm | walk at `QUEEN_SPEED` with escort to the target chamber | arrived → `reside` |
| Failure | target unreachable | stay; flag diagnostic | |

Release from possession: chapter 01 table 3.5 applies to all ants.

---

## 11. Cooperative transport [T2; solo carry and solo drag T1]

Item bulk `b` in lm; each ant's `carryCap` (1.2). Primitive physics (chapter 01): solo carry `b ≤ carryCap`; solo drag `b ≤ 2 × carryCap`; group `drag` with up to `COOP_MAX_ANTS` 12; motion requires `Σ carryCap ≥ 0.5 b`; item speed `CRUISE × DRAG_SPEED_MULT 0.4 × min(1, Σ carryCap / b)`. AI rules added here:

| Rule | Value |
|---|---|
| Recruit | An ant finding an item it cannot move (or only drags below 0.3 BU/s) grips it for 10 s, then returns home laying trail (dab × 1.5) and recruits as a successful forager with the item as `lead` (gain × 1.0) |
| Helpers | arriving foragers with that lead grip the item (max `min(12, 2 + ceil(2b))` grip points) |
| Alignment | each carrier pulls toward its home direction (route/crumbs/PI, σ 20°); resultant direction drives motion; a carrier whose pull is > 90° from the resultant for 3 s releases and regrips (5 s) |
| Cutting | `b > COOP_CUT_BULK` 6 lm, or the GDD 05 §1.5 stall rule (< 1 BU progress in 30 s with ≥ 0.5 b pulling), or the GDD 05 butcher decision: ants tear 1 lm pieces (`TEAR_S` 4.0 s × hardness each, GDD 01; *Lasius* commonly dismembers large prey on site) and carry them singly. GDD 05 owns item physics, helper slots and the butcher rule; this chapter owns the AI behaviour |
| Abandonment | no helpers within 300 s and no progress → item left; source stays known |
| Delivery | item reaching the entrance: if `b` > entrance passable size (nest chapter), cut at the entrance |

---

## 12. Colony directives and markers

The player issues colony orders "through the queen": possessing or selecting her is the diegetic entry point to the Directives drawer (GDD 01 §2, §10; GDD 08 §4.2, §5.2), although the drawer is reachable from any view. This is a gameplay abstraction (D10): directives and markers change targets and local stimuli, and the ants still allocate themselves by response thresholds (6.4); the queen's own behaviour is unaffected by being the entry point.

### 12.1 Directives (`setDirectives`, applied next tick, also while paused) [T1 unless tagged]

| Directive | Values | What it changes in the simulation |
|---|---|---|
| `allocation` | `'auto'` or `{forage, nurse, dig, defend}` shares (sum 100) | 6.3 targets (auto vs manual with floors and caps). Nothing else. |
| `diet` | `'auto'` or −100..+100 (−100 carbohydrate, +100 protein) | shifts desired P share `sP'` by `0.4 × diet/100`, which changes forager source choice weights and recruit acceptance (5.5). Does not change larval or queen requirements. |
| `alateInvestment` [T2] | 0..1 (default 0.5) | replaces the earlier `production` directive: GDD 06 §11.3 target `A*`; 0 keeps all eggs `worker` (UI presets Workers only / Balanced / Raise alates = 0 / 0.5 / 1.0). `gyneShare` (T3) and `alatePolicy` are set the same way |
| (architect) | — | not a directive: the nest architect mode is set with GDD 03 `setAutoExpand {nestId, mode}` (consistency pass) |
| `stockTarget` (new) [T2] | `low` / `normal` / `high` | `targetDays` × 0.5 / 1 / 2 (5.5) — raises forage demand while stocks are below target (prepare for winter) |
| `stayIn` (new) [T2] | boolean | foraging curfew (6.6): no departures; ants outside return; scouts included. Auto-clears after 1 gd. |

### 12.2 Marker semantics (placement validity is the UI/nest chapters')

| Marker | Worker response | Limits |
|---|---|---|
| `forage` (centre, radius 10-80 BU, default 30) | 50 % of departing scouts take it as first waypoint; known sources inside score × 1.5; foragers with no lead, route or news go to the marker and run `forage.search` (30 s) | max 4 active; persistent until removed |
| `avoid` (centre, radius 10-80 BU) | autonomous ants (not `controlled`) never plan through it (planner cost × 20; impassable if an alternative ≤ 3 × length exists); steering repulsion within radius + 4 BU; trail inside followed at weight × 0.1; sources inside score 0; ants inside at placement leave by the shortest exit; inside the nest: chamber gets sort score 0 (brood moved out) and no rest/storage | max 8; an ant whose only way home crosses it may cross |
| `rally` [T2] (point, radius 8-32 BU, default 15; `mode` `defend` or `attack`, GDD 05 §3.7) | defend group plus up to `RALLY_MAX_FRACTION` 25 % of idle/forage-waiting non-callow workers go there, hold within 8 BU, engage non-nestmates within the radius; they lay trail on the way (recruitment). Mode `attack` follows GDD 05 §3.7 (raid on a known entrance within 30 BU) | 1 active; expires after 1 gd |
| `move-brood` (source chamber → target chamber) | all brood in the source gets `move` jobs (priority 4) to the target; sorting for those items locked to the target for `MOVE_BROOD_LOCK_GD` 1 gd | target must be brood-capable; if target becomes invalid, lock ends |
| `move-queen` (target chamber) | queen → `queen.relocate` with escort; eggs follow via queen-care | target must be reachable with ≥ 2 BU clearance |
| `dig`, `entrance` | nest chapter (dig plans) | |

Marker responses are logged as reason `marker:<kind>`.

`MARKER_CAP` (this chapter owns marker caps; GDD 08 reads them): `dig` 8 (= GDD 03 `PLAN_CAP_PLAYER`, non-terminal player plans per nest), `forage` 4, `avoid` 8, `rally` 1, `entrance` 2, `move-brood` 1, `move-queen` 1, `satellite` 1 (GDD 07, Camponotus). Radius ranges: `forage`/`avoid` 10-80 BU (default 30), `rally` 8-32 BU (default 15).

---

## 13. Population accounting and statistics [T1 counters; T2 journal graphs]

### 13.1 Counters (maintained incrementally, verified each gd by full recount)

Adults by caste; workers by task, by group, by age band, inside/outside, `controlled`; nanitics, minims, callows; brood by stage × destined caste; diapause larvae; cumulative eggs laid, hatched, pupated, eclosed; deaths by cause (canonical list, `00-index.md` §B); brood deaths by cause (2.5 ids plus `cannibalised`); stores and ledgers (5.2); forager trips started, successful, unsuccessful, mean trip time, mean unload wait; deliveries by food kind; known sources; active trails (connected cells ≥ 1 ph per colony, counted every 60 s).

### 13.2 Time series (for journal graphs and the epitaph)

`STATS_SAMPLE_TICKS` 250 (one game hour): fine ring of 7 gd × 24 = 168 samples per series; daily aggregates (mean / min / max / sum) kept for the colony's whole life. Series ids: `workers`, `workers-by-group` (4), `queen-alive`, `eggs`, `larvae`, `pupae`, `stores-c`, `stores-p`, `intake-c`, `intake-p` (per gd rate), `use-c`, `use-p`, `eggs-laid`, `eclosions`, `deaths` (by cause), `brood-deaths`, `trips`, `trip-success`, `trip-time`, `nursery-temp`, `known-sources`, `trails`, `starvation-stage`. Chapter 08 expects hourly for 7 days and daily for all time; this matches.

### 13.3 Debug summary fields (`__game.summary().colony`)

`{ N, byCaste, byTask, byGroup, brood:{egg,larva,pupa,diapause}, stores:{C,P,capC,capP,daysC,daysP}, intakeToday:{C,P}, useToday:{C,P}, needs:{C,P}, layingPotential, layingActual, starvationStage, queen:{mode, gut, reserve, reserveP, health}, allocation:{mode, need, target, actual}, trips:{today, successRate} }`.

---

## 14. Diagnostics [T2; values computed from T1]

Diagnostic ids carry the `diag-` prefix (GDD 06 owns the id scheme; consistency pass). Records follow chapter 08's shape `{ id, system, status: 'ok'|'warn'|'bad', label, value, factors: {cause, weight, detail}[], remedies, sinceTick }`. Evaluated every 250 ticks.

**Factor weights.** For a rate `R = R_ref × Π f_i` (each `f_i` in (0, 1]), `weight_i = ln f_i / Σ_j ln f_j` over factors with `f < 0.98` (shares sum to 1). Status from `R/R_ref`: ok ≥ 0.75, warn 0.40-0.75, bad < 0.40; changes need to persist 0.1 gd (hysteresis).

| Diagnostic id | Value | Factors (`cause`: `f_i`) | Remedies |
|---|---|---|---|
| `diag-food-intake-c` | C intake / `needRateC` (1 gd) | `foragers`: actual/`D_forage`; `activation`: departures / (departures at target); `weather`: mean `surfaceActivity`; `distance`: 150 s / mean trip time; `sources`: min(1, known C capacity / C need); `unloading`: 1 − mean unload wait / trip time; `success`: trip success rate; `predation`: 1 − forager deaths / trips | raise Forage slider; place `forage` marker; possess a forager and lay a trail; dig a new entrance closer (`entrance` marker); add store workers (Nurse slider) |
| `diag-food-intake-p` | P intake / `needRateP` | same with P sources; `diet`: if diet directive < 0 | diet toward protein; `forage` marker near prey/carrion |
| `diag-stores` | days of C and P vs target | `capacity` (pool at cap: "stores full"), `spoilage` share, `upkeep` growth | dig a `food` chamber; reduce stock target |
| `diag-brood-growth` | mean larval development rate / r(28 C) | `protein`: fraction of larva-time with gut P > 0; `carbohydrate`: fraction with C > 0; `temperature`: mean r(T)/r(28); `nurses`: min(1, nurses / `D_nurse`); `crowding`: 1 − mean crowd; `hygiene`, `humidity` (from hazard rates, survival) | raise Nurse slider; dig a shallower or covered nursery (`dig`); `move-brood` to the warmer chamber; haul waste |
| `diag-egg-laying` | actual / potential at `fSeason = fTempQ = fCap = 1` | `season`, `temperature`, `queen-health`, `cap`, `protein-supply` (residual: actual / potential after other factors), `queen-care` (retinue actual / target) | more protein (as above); raise Nurse (queen-care) |
| `diag-queen-condition` | queen health and gut | `gut-C`, `gut-P`, `reserve`, `retinue`, `heat`, `injury` | Nurse slider; `move-queen` to a safer chamber |
| `diag-workforce` | per group: actual / target | `too-few-adults` (A < ΣD), `callows` share, `manual-conflict` (manual target < floor need), `fatigue` share resting, `injured` | auto allocation; adjust sliders |
| `diag-foraging-trails` | active trails, recruitment success | `trail-lost` events/gd, `washed` (rain), `colony-size` (sizeFactor), `ignorers` | lay trail as possessed forager; shelter routes (forage marker under cover) |
| `diag-defence` [T2] | threats vs defenders | owned jointly with combat/rivals | rally marker; Defend slider |
| `diag-mortality` (new) | deaths per gd / N | by cause shares | per cause (shade, avoid markers, food) |
| `diag-hygiene` (new) | waste items in chambers, midden reachable | `haulers`, `midden-blocked` | Dig slider (haul) |

Alerts raised by this chapter (kinds from chapter 08 plus additions): `food-c-low` (S1 by C, warning), `food-p-low` (S1 by P with larvae > 0, warning), `brood-stalled` (`diag-brood-growth` bad for 0.2 gd), `trail-lost` (8.4), `source-found` (first successful return from a new source), `colony-starving` (new, S3, critical), `stores-full` (new, pool at cap for 0.25 gd, notice), `queen-died` (raised on chapter 06's queen-death event).

---

## 15. Worked example: one summer day of a 60-worker colony

Setting: Summer day 9 (`fSeason` 1), nest and surface at 25 C (`fMet` 1.0, `r` = 1.364), auto allocation, one entrance. Known sources: an aphid herd (honeydew) 150 BU away and a dead beetle (carrion, cut into 1 lm pieces) 200 BU away. Stock at the start of the day: C 30.0 (cap 2 + 0.8 × 60 = 50), P 10.0 (stomach 0.15 × 60 = 9, so 1.0 P sits in the pile).

Workforce (60):

| Task | Ants | Daily mean C each (time-weighted classes) | C per gd |
|---|---|---|---|
| `forage` | 11 | 0.152 (60 % active, 40 % waiting) | 1.672 |
| `scout` | 1 | 0.152 | 0.152 |
| `nurse` | 5 | 0.112 (80 % light, 20 % rest) | 0.560 |
| `queen-care` | 2 | 0.100 | 0.200 |
| `store` | 2 | 0.100 | 0.200 |
| `dig` | 3 | 0.164 (70 % active) | 0.492 |
| `haul` | 2 | 0.164 | 0.328 |
| `guard` | 1 | 0.100 | 0.100 |
| `patrol` | 1 | 0.152 | 0.152 |
| `idle` / `rest` | 32 | 0.080 | 2.560 |
| **Workers** | **60** | | **6.416** |

Brood flow: the queen lays **12 eggs/gd** (potential `100 × 0.427` = 42.7; protein-limited by the laying permission rule). Eggs → larvae 12 × 0.90 = 10.8/gd; larvae pupating 10.8 × 0.85 = 9.18/gd; larvae dying 1.62/gd (on average half fed). Standing brood ≈ 12 eggs, 5 larvae, 13 pupae.

Daily budget (loads per gd):

| Item | C | P |
|---|---|---|
| Workers' upkeep | 6.42 | 0 |
| Queen upkeep | 0.30 | 0.10 |
| Eggs (12 × 0.04 P) | — | 0.48 |
| Larvae completing (9.18 × 0.4 C, × 1.2 P) | 3.67 | 11.02 |
| Larvae dying (1.62 × 0.2 C, × 0.6 P) | 0.32 | 0.97 |
| Spoilage (pile P 1.0 × ln 2/3 × 2^0.5) | 0 | 0.33 |
| **Need** | **10.71** | **12.90** |
| Honeydew: 4 foragers × 2.5 trips × (1.00 C, 0.02 P) | 10.00 | 0.20 |
| Carrion: 7 foragers × 2.0 trips × (0.10 C, 0.90 P) | 1.40 | 12.60 |
| Scout: 1 crumb find (0.70 C, 0.15 P) | 0.70 | 0.15 |
| **Intake** | **12.10** | **12.95** |
| **Net change** | **+1.39** | **+0.05** |

Checks:

- **Demand indices.** `daysC` = 30/10.71 = 2.8 (target 3; `needC` 0.07); `daysP` = 10/12.90 = 0.78 (target 1.5; `needP` 0.48). Protein is the tighter nutrient, so 7 of 11 foragers chose carrion (`wP` > `wC`), and carrion trails are laid at `0.5 + 0.48` ≈ 1.0 strength against 0.57 on the honeydew trail.
- **Forage demand.** `intakeTarget` = 10.71 + 12.90 + (32.1 − 30)/2 + (19.4 − 10)/2 = 29.4 loads/gd; `yieldPerForager` = (4 × 2.5 × 1.02 + 7 × 2.0 × 1.0)/11 = 2.2 → `D_forage` = 13.4: the colony is 2 foragers short and is recruiting them from the idle reserve. `diag-food-intake-p` reads ok (intake/need 1.0) while `diag-stores` reads warn (P at 0.78 of 1.5 target days); its chained cause is `diag-food-intake-p`, whose largest factor below 1 is `foragers` (11/13).
- **Nurse demand.** Larval demand 15.98 loads/gd / 4.5 = 3.55 + 12/25 + 13/15 = 4.9 → 5 nurses. Feeds: 15.98 / 0.1 = 160 feeds per gd (about one feed every 3.75 s colony-wide).
- **Queen.** Ration 0.30 C + 0.58 P = 0.88 loads → 9 feeds. Laying 28 % of potential; `diag-egg-laying` diagnostic: bad, `protein-supply` weight 1.0, remedy "more protein".
- **Activation.** About 26 successful returns per 450 s of active surface time (one per 17 s), 3 ants waiting: `activation` ≈ 1.7 → departures follow returns (6.6).
- **Growth.** Eclosions 9.18 × 0.95 = 8.7/gd; deaths ≈ 60 / 26 gd realised lifespan = 2.3/gd; net +6.4 workers/gd (+11 %/gd), in line with the dossier's ~18 → ~290 workers over the second year when food allows, slowing as sources get farther and `fSize` saturates. At N ≈ 1300 the queen's maximum (~100 eggs/gd × 0.73 survival) roughly equals deaths, so mature colonies plateau at 1200-1500 under good conditions; `WORKER_CAP` 1500 is a hard ceiling.

---

## Appendix A — State required

| Name | Type sketch | Purpose |
|---|---|---|
| `colonies[]` | `{ id, speciesId, queenId, entranceIds[], stores:{C,P,toxin,inCrops}, ledger:{in:{delivery,recycled}, out:{workers,queen,larvae,spoiled,ration}, transit}, needs:{rateC,rateP,needC,needP,sP}, starvationStage, starvationSince, directives:{allocation, taskShares, diet, alateInvestment, gyneShare, alatePolicy, stockTarget, stayIn, stayInUntil, sealInCold, stance, casteEmphasis, …species extras}, alloc:{demand:Float32Array(TASK_COUNT), target:Int16Array(TASK_COUNT), actual:Int16Array(TASK_COUNT), lastTick} (TASK_COUNT = 18: the 17 J tasks plus GDD 05 `raid`), yieldPerForager, news:[{sourceId,pos,tick}×5], knownSourceIds:int[], exploredBits:Uint8Array, jobBoard (derived), counters }` (the time series of 13.2 live in `progression.history`, GDD 06 §9.2; consistency pass) | colony economy, allocation, knowledge |
| `ants[]` | fields of 1.1 (plain data; `thresholds` Float32Array(TASK_COUNT = 18), one per canonical task (J order, then `raid`), unused entries for Lasius = 1e9; `crumbs` Float32Array(96×3) + head/len; `routes` 2 × `{sourceId, wp:Float32Array(96), n, visits, lastUsed}`; `decisions` 5 × `{tick, code:int, detail:int}`) | individual agents |
| `queen extras` | `{ mode, gut:{C,P}, reserve, reserveP, fecundity, eggBudget, layingLog:Int16Array(28), clutchLaid }` on the queen ant | laying and nutrition |
| `brood[]` | fields of 2.1 | brood entities |
| `items[]` (shared with ecology/nest) | `{ id, kind:'food-piece'|'soil-pellet'|'waste'|'corpse'|… (canonical item kinds), wasteKind?, foodKind?, c, p, bulk, pos, chamberId, carrierIds[], diedTick? }` | carried and stored things (brood is not an item) |
| `markers[]` (shared) | `{ id, kind, pos, radius, targetChamberId?, sourceChamberId?, expiresTick? }` | colony-wide marker state |
| `phero` | `{ chunks: { key -> { trail: Record<colonyId, Float32Array(4096)>, home: Record<colonyId, Float32Array(4096)>, alarm: Float32Array(4096), lastDecayTick } } }` | pheromone field |
| `colonyRng` | stream states | determinism |
| Derived caches (not saved) | spatial hash of ants, job board, chamber brood scores, per-colony known-capacity | rebuilt by `createSim(state)` |

## Appendix B — Commands

| Command | Payload | Effect |
|---|---|---|
| `setDirectives` | `{ allocation?: 'auto' | {forage, nurse, dig, defend}, taskShares?: Partial<Record<Task, number>>, diet?: 'auto' | number, alateInvestment?: number, gyneShare?: number, alatePolicy?: 'auto-release'|'ask'|'hold', stockTarget?, stayIn?, sealInCold?: boolean, stance?: 'cautious'|'defensive'|'aggressive', casteEmphasis?: number, …species extras (GDD 07) }` | 12.1; also GDD 05 §4.9, GDD 06 §11.3, GDD 07 App B |
| `placeMarker` / `removeMarker` | `{ kind, pos, radius?, chamberIds?, params? }` (`params.mode` for `rally`) / `{ markerId }` | 12.2 |
| `possess`, `release`, `setIntent`, `action` | chapter 01 | possessed ant uses the same rules (trophallaxis 5.4, trail 8.3, recruitment 6.6, lay-egg budget 3.2) |
| Debug `cheat.addFood` | `{ C?, P?, toxin? }` to pool | tests |
| Debug `cheat.spawnAnts` | `{ n, age?, task?, pos? }` | tests |
| Debug `cheat.spawnBrood` | `{ stage, n, chamberId, progress?, destined? }` | tests |
| Debug `cheat.setChamberClimate` | `{ chamberId, T, RH }` override | tests |
| Debug `cheat.setQueen` | `{ gut?, reserve?, reserveP?, health?, eggBudget? }` | tests |
| Debug `cheat.injectReturn` | `{ entranceId, success, sourceId }` (synthetic successful returner contact) | activation tests |
| Debug `query.ant(id)`, `query.brood(id)`, `query.colony()`, `query.phero(pos, channel, colonyId)`, `query.ledger()` | read | tests and inspect |

## Appendix C — Events

| Event | Payload | Consumers |
|---|---|---|
| `ant-eclosed` (also for alates; replaces GDD 06 `alate.eclosed`) | `{antId, colonyId, caste, nanitic, minim}` | render, journal (`aim-first-workers`), codex `cx-callow` |
| `ant-died` | `{antId, colonyId, caste, cause, pos, task}` | render (corpse), journal, stats, alerts |
| `egg-laid` | `{broodId, queenId, destined}` | render, audio `sfx.egg-lay` |
| `brood-stage` | `{broodId, from, to}` | render, codex |
| `brood-died` | `{broodId, stage, cause}` | stats, diagnostics |
| `brood-moved` | `{broodId, fromChamber, toChamber, reason}` | render |
| `feed` | `{giverId, receiverId|broodId, C, P}` | render pose, audio `trophallaxis` |
| `trophallaxis` | `{donorId, receiverId, amount, ambient}` | render, codex, audio |
| `delivery` | `{antId, sourceId, kind, C, P}` | stats, journal (first trail milestone input) |
| `recruit` | `{fromId, toId, sourceId}` | render (antennation), scent view |
| `forager-departed` | `{antId, reason:'recruited'|'spontaneous'}` | stats |
| `food-source-discovered` (GDD 05 owns; was `source-discovered`) | `{sourceId, kind, variant, pos, colonyId, byAntId}` | alert `source-found`, journal |
| `trail-established` | `{colonyId, sourceId, lengthBU}` (first time a connected trail ≥ 1 ph links entrance and source) | GDD 06 milestone `ms-first-trail` (fires on its own follower rule) |
| `trail-lost` | `{colonyId, sourceId, pos}` | alert |
| `route-learned` | `{antId, sourceId}` | codex `cx-route-memory` |
| `task-changed` | `{antId, from, to, reason}` (sampled: only for inspected/possessed ants and 1 in 20 others) | inspector |
| `stores-full`, `starvation-stage` | `{colonyId, stage}` | alerts |
| `cannibalism` | `{colonyId, broodId}` | journal (sober wording), diagnostics |
| `corpse-removed`, `waste-dumped` | `{antId, itemId, to:'midden'|'mound'}` | codex `cx-necrophoresis` |
| `alarm-raised` (GDD 05 payload) | `{colonyId, pos, strength, source}` | audio, scent view |
| `coop-transport` (single event; replaces GDD 05 `coop-transport-*` and `carcass-butchered`) | `{itemId, carriers, bulk, phase:'start'|'stalled'|'cut'|'delivered'|'abandoned'}` | render, codex, diagnostics |
| `marker-response` | `{markerId, antsResponding}` | UI feedback |
| `diagnostic-changed` (replaces GDD 06 `diag.changed`) | `{id, status, topCause}` | UI, alerts |

## Appendix D — Diagnostics (summary)

Published ids: `diag-food-intake-c`, `diag-food-intake-p`, `diag-stores`, `diag-brood-growth`, `diag-egg-laying`, `diag-queen-condition` (also carries GDD 06's orphaned rule; GDD 06 `diag-queen-status` is merged into it), `diag-workforce`, `diag-foraging-trails`, `diag-defence` (joint), `diag-mortality`, `diag-hygiene`. Each: status `ok|warn|bad` from the value/reference ratio (14), factor list with `ln`-share weights, remedy ids mapped to UI controls (`remedy.slider.<group>`, `remedy.diet.<carbohydrate|protein>`, `remedy.marker.<kind>`, `remedy.dig.<chamberType>`, `remedy.possess.<task>`, `remedy.stock.<level>`), `sinceTick`.

## Appendix E — Acceptance checks (debug API: `step`, `query`, `cheat`)

1. **Given** a worker-destined egg in a chamber held at 21 C and tended, **when** stepping, **then** it hatches at 1.40 ± 0.01 gd; at 25 C at 1.03 ± 0.01 gd.
2. **Given** a larva at 21 C whose gut is refilled by cheat whenever below 0.15, **when** stepping, **then** it pupates at 0.60 ± 0.01 gd and `fed` = 1.20 ± 0.02 P and 0.40 ± 0.02 C.
3. **Given** brood in a chamber at 8 C, **when** 1 gd passes, **then** no brood `progress` changes.
4. **Given** a `ready` pupa and one nurse in the chamber, **when** stepping, **then** an adult with `callow` ecloses within 30 game s and a `cocoon` waste item exists; **given** no nurse and no queen, **then** after 0.3 gd its hazard is 3.0/gd (`eclosion-failed`).
5. **Given** a colony of 10 workers with full reserves forced to `rest` in a 25 C nest, no brood, queen removed, pool C 10, P 0, **when** 1 gd passes, **then** pool C = 10 − 0.80 ± 0.01.
6. **Given** N = 300 (spawned), summer day 10, royal chamber 25 C, queen gut P held ≥ 0.5 by cheat, **when** 1 gd passes, **then** eggs laid = 74 ± 3.
7. **Given** the same queen with gut P = 0 and no queen-carers, **when** 0.5 gd passes, **then** 0 eggs are laid and `egg-laying` lists `protein-supply` as top factor.
8. **Given** a founding queen alone, sealed, `R0` 56, `Q` 0.7, clutch 24, nest at a constant 19.5 C, **when** the founding runs unattended, **then** the first nanitic ecloses 4.52 ± 0.1 gd after the first egg (3.9 ± 0.1 gd at 21 C) and over 200 seeds the mean is 11.5 ± 1.5 nanitics (p10 8, p90 15), as GDD 06 E18-E19.
9. **Given** a colony with pool C = P = 0, `stayIn` renewed every gd, 20 eggs, 10 larvae, 10 pupae, an established queen and 20 workers (5 per age band, crops empty, reserves full), **when** stepping until extinction, **then** no larva is cannibalised while any egg remains, the first adult `starvation` death is an `old`-band worker, no pupa dies of `starvation`, and the queen is the last adult to die.
10. **Given** an old worker on the surface in an enclosure with no nest access, empty crop, full reserve (0.25 C), 25 C, kept walking, **when** stepping, **then** reserve hits 0 at 1.25 ± 0.02 gd and it dies of `starvation` at 3.25 ± 0.05 gd.
11. **Given** a trail cell of 10 ph on `concrete`, shaded, dry, 22 C, **when** 900 s pass, **then** the value is 5.0 ± 0.1; at 32 C after 450 s it is 5.0 ± 0.1; a `vacuum` footprint over it sets it to 0 on the next decay step (GDD 04 §15.4).
12. **Given** 6 ants in `forage.wait`, `needP` 0.5, `surfaceActivity` 1, RH 80 %, same seed in two runs, **when** run A passes 60 s with no returns and run B runs `cheat.injectReturn` (successful) every 10 s for 60 s, **then** run B has ≥ 4 departures and at least 3 × as many departures as run A (run A expected ≈ 1.0).
13. **Given** auto allocation, N = 100, 20 larvae at 25 C and no other demand changes, **when** 180 s pass, **then** the `nurse` target equals the 6.2 formula (± 1) and actual nurses are within ± 1 of it.
14. **Given** manual allocation `{forage 50, nurse 20, dig 20, defend 10}` and A = 100 with forage demand 5, **when** 300 s pass, **then** forage-group actual ≥ 40 and nurse-group actual ≥ `ceil(0.25 × D_nurse)`.
15. **Given** a 200-worker colony run 3 gd at steady auto allocation, **when** sampled, **then** mean `physioAge` of forage-group ants exceeds that of nurse-group ants by ≥ 4 gd.
16. **Given** a scout that discovered a carrion source 250 BU from the entrance by a path ≥ 1.5 × the straight-line distance, with trail laying disabled colony-wide, **when** it makes 3 further successful round trips as a forager, **then** `route-learned` fires at the end of the third successful round trip and the next outbound path is ≤ 1.25 × the straight-line distance.
17. **Given** a forager released 300 BU from the entrance at the end of a looping outbound path (crumbs recorded), **when** it homes, **then** it enters the nest with inbound path length ≤ 1.4 × straight-line distance and without planner use unless `stuck` fired.
18. **Given** pool C at capacity, P stock above its target days, no larvae, and 10 foragers on a honeydew source, **when** 0.1 gd passes, **then** departures in that 0.1 gd are ≤ 20 % of the previous 0.1 gd and `stores-full` is raised after 0.25 gd.
19. **Given** two brood chambers at 17 C and 27 C (RH 85 %), 10 larvae in the cold one and 2 nurses, **when** 180 s pass, **then** all 10 larvae are in the 27 C chamber.
20. **Given** an `avoid` marker of radius 30 BU across the straight route to a source with a detour ≤ 2 × length available, **when** 0.5 gd passes, **then** no autonomous ant position lies inside the radius after 30 s from placement.
21. **Given** any 2 gd soak with foraging, brood and spoilage, **when** the ledger is read, **then** pool change equals inflows minus outflows within 1e-6 loads for C and P, and no store, crop, gut or reserve is negative.
22. **Given** a dead worker in a chamber and ≥ 1 haul-eligible worker, **when** 0.15 gd passes, **then** the corpse is at the midden and `corpse-removed` fired.
23. **Given** a 100-worker colony and a quality-1.0 carrion source 200 BU away discovered by a scout, **when** 0.5 gd passes, **then** `trail-established` fired, ≥ 80 % of cells along the forager path hold ≥ 1 ph, and ≥ 5 distinct ants delivered from that source.
24. **Given** adequate food and nurses but the only nursery at 15 C, **when** 0.3 gd passes, **then** `brood-growth` is `bad` (rate ratio 0.455/1.636 ≈ 0.28) with `temperature` weight ≥ 0.8.
25. **Given** the worked example's setup (section 15) rebuilt by cheats with sources fixed in place, **when** 1 gd passes at 1x, **then** C intake 10-14, P intake 11-15, eggs laid 8-16, and the colony's C and P stocks change by less than ±3 loads each.

## Appendix F — Cross-chapter assumptions

1. **Locomotion**: provides cruise 6 BU/s (Lasius), run 12 BU/s, load factor, surface walker, coarse planner, BFS nest walking, and multiplies by `speedMult(Tb)` from chapter 06; accepts this chapter's health/callow/route multipliers.
2. **Chapter 01 (possession, primitives)**: action durations and rates used here (`feed-larva` 0.1 load / 4 s, `TROPH_RATE` 0.1 load/s, `lay-egg` 6 s with `EGG_COST_P` 0.04 and the shared egg budget, `drag` rules, `release` inference table 3.5, `RESUME_LOCALITY_BONUS`); `controlled` ants are never reassigned; this chapter refines AI acceptance of begging (5.4.1) and selects brood chambers per stage (10.4.1). `CROP_RETURN_FRACTION` = 0.8 is defined here.
3. **Chapter 06 (environment, progression, reproduction)**: provides `Tb`, `Tmicro`, `chamberTemp`, chamber RH or moisture, `surfaceActivity`, `forageGate`, `shadeSeekC`, heat/cold load deaths, chill coma, rain washing of pheromone cells (3.7), weather states, calendar `doy`; owns the opening script, seal, time-lapse driving, reserve scaling by site quality and difficulty, the overwinter aggregate (reads brood and stores from here), the reproduction gate and alate fractions, queen death and orphaning, milestones (fed by this chapter's events), and the diagnostic id scheme.
4. **Nest chapter**: chambers (type, floor area, temperature/RH via chapter 06, flood state, waste count), dig plans and `digDemand`, frontier claim API, pellet caches, mound drop, midden site, entrance passable size, BFS fields, store-overflow signal consumer, flooding of brood.
5. **Ecology chapter**: food sources with the attributes of section 4 (amount in loads, nutrient profile, quality, feed slots, harvest rate, bulk, odour), aphid herds with yield and tender slots, carrion/prey items, creature threats; T1 world contains at least one liquid sugar source and small protein items near likely nest sites.
6. **Combat chapter**: engage test, fight resolution, injury, alarm release in fights; uses `ALARM_*` constants here.
7. **Human-events chapter**: footprints and timing of `sweeping`, `vacuum`, `footsteps`, `mowing`, `watering`, `bait-station` (toxin per load).
8. **UI chapter 08**: Directives panel groups match `forage/nurse/dig/defend`; it must add controls for the new `stockTarget` and `stayIn` directives (T2); diagnostics and alert kinds as in section 14.
9. **Rivals chapter**: rival colonies use the same ant model with their own pheromone channels; their fielded agents count toward the ~2500 global agent budget, not toward this colony's `WORKER_CAP`.
10. **Architecture**: physiology on a staggered 1 s slow tick, allocation every 10 s, pheromone decay every 10 ticks fit the 4 ms per frame budget at 1000 ants.
