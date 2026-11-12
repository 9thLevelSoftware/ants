# FOUNDRESS GDD — Chapter 07: Species

The `SpeciesDef` data model, the four playable species, and the four economy modules (honeydew ranching, wood nesting, granary, fungus garden).

Binding sources: `docs/01-design-seed.md`, `docs/02-design-directions.md` (section J identifiers and reference economy), `docs/03-architecture.md`. Research: `research/bio-lasius-niger.md`, `bio-camponotus.md`, `bio-messor.md`, `bio-atta.md` (all four final, with verification logs), `research/ecology-habitats.md`, `research/genre-ux.md`. Sibling chapters followed here (they own the values marked with their number): Ch 01 (modes, controls, action primitives), Ch 02 (colony simulation: brood, lifespans, egg laying, nutrition, task allocation, foraging), Ch 05 (ecology, herds, creatures, rivals, combat), Ch 06 (calendar, climate, thermal profile, opening, winter, reproduction), Ch 08 (UI). Also referenced: Ch 03 nest and excavation, Ch 04 world, worldgen and human events.

---

## 0. Scope, conventions, tiers

### 0.1 What this chapter owns

| Item | Code home | Tier |
|---|---|---|
| `SpeciesDef` schema, validation, loader, derived-stat formulas | `src/sim/species/schema/**`, `src/sim/species/derive.ts` | T1 |
| `lasius-niger` data | `src/sim/species/data/lasius-niger.ts` | T1 (honeydew-related fields T2) |
| `camponotus-pennsylvanicus`, `messor-barbarus`, `atta-texana` data | `src/sim/species/data/*.ts` | T3 |
| Economy module `honeydew-ranching` | `src/sim/species/modules/honeydew/**` | T2 (Lasius), T3 (Camponotus variant) |
| Economy modules `wood-nesting`, `granary`, `fungus-garden` | `src/sim/species/modules/{wood,granary,fungus}/**` | T3 |

Features marked **T3 (stretch)** are the lowest priority inside Tier 3 and may be cut without breaking anything else.

### 0.2 Units and notation

| Symbol | Meaning |
|---|---|
| s | game second (fast clock; one tick = 0.1 s; equals a real second at 1x) |
| h | clock hour = 25 s |
| GD | game day = 600 s = 24 h = 13.04 real days of biology |
| `d` | fractional day of year, 0-based, `d = 0` is 20 March (Ch 06 §0.2); `doy = floor(d) + 1` |
| BU | body unit of the species (Lasius 4 mm, Camponotus 9 mm, Messor 7 mm, Atta 7 mm) |
| load | species-relative: one full crop of that species' standard worker = the nutrient content of one standard solid item it carries (directions J). C = carbohydrate, P = protein |
| LU | leaf load (Atta): leaf substrate a standard media carries; same bulk unit as a load |
| GU | garden unit (Atta): the amount of fungus garden one gardener maintains |
| FL | fungus load (Atta): staphylae food equal in brood value to 1 load of mixed C+P |
| `mc` | wood moisture content, % of dry mass |
| `m` | an ant's mass relative to the species' standard worker (`massMg / stdMassMg`) |
| [EST] | design estimate (no source); [D] research value from a dossier; **Deviation** = intentional departure from a dossier or the directions |

All named constants in this chapter live in species data files or `src/sim/balance/species.ts`; module constants in `src/sim/balance/{honeydew,wood,granary,fungus}.ts`.

---

## 1. Roster and final species choice

| Id | Binomial / common name | BU | Dossier verdict | Choice | Climate (Ch 06 §2.1) | Tier | Complexity (Ch 08) |
|---|---|---|---|---|---|---|---|
| `lasius-niger` | *Lasius niger*, black garden ant | 4 mm | reference species | **Confirmed** | `temperate-maritime` | T1 | 1 |
| `camponotus-pennsylvanicus` | *Camponotus pennsylvanicus*, black carpenter ant | 9 mm | keep (best data on moist parent nest vs dry satellites, wall voids, night trails) | **Confirmed**; *C. herculeanus* noted as a future data-only variant | `temperate-continental` | T3 | 2 |
| `messor-barbarus` | *Messor barbarus*, harvester ant | 7 mm | keep (only candidate with major/media/minor and seed milling); *Pogonomyrmex barbatus* is a data donor for task allocation, not playable | **Confirmed**; *Messor structor* is the in-genus fallback if a temperate fit is ever needed | `mediterranean` | T3 | 2 |
| `atta-texana` | *Atta texana*, Texas leafcutter ant | 7 mm | keep (fits sandy/loamy temperate-edge localities; strongest polymorphism) | **Confirmed**; *Acromyrmex* noted as a later small-colony variant | `subtropical` | T3 | 3 |

### 1.1 How the four differ to play

| Axis | Lasius niger | Camponotus pennsylvanicus | Messor barbarus | Atta texana |
|---|---|---|---|---|
| Nest | soil, under stones and paving; pellet mound | inside damp wood; parent nest + satellites; frass piles instead of a mound | deep dry soil; several entrances, each with a chaff midden | very deep soil funnel; many crater mounds; garden chambers |
| When the colony works | by day (dawn to dusk) | by night along trunk trails | dusk-night-dawn in summer, daytime in spring and autumn | night in summer, day in cool seasons; never above 28 °C air |
| Adult fuel (C) | honeydew, sugar, nectar | honeydew (night tending), sugar | seed paste | plant sap at the cut, nectar |
| Brood food | prey and protein by trophallaxis | prey protein, seasonal peaks | seed paste milled by majors, plus a little animal protein | staphylae from the fungus only |
| Storage | social stomach and food chamber | social stomach; majors as liquid stores | granaries (seed stock that can sprout or rot) | none: the living garden is the store |
| Main bottleneck | protein for larvae | wood moisture in the parent nest; slow growth | milling labour and granary humidity | the processing chain and garden hygiene |
| Castes | one worker caste (nanitics first) | minor/media/major (media and major from colony year 3) | minor/media/major (majors after 40 workers) | minim/small media/media/major (majors after 400 workers) |
| Growth pace | fast | very slow (long-form) | medium | slow start, then very fast |
| Founding | dig, seal, lay, wait | find damp wood at night, chew a cell, seal | dig deep in open dry ground after autumn rain; wait out winter | dig, plant the fungus pellet, tend it, eat most first eggs |
| Typical failure | protein starvation, rivals | parent nest dries out; trail to satellites cut | heatwave starvation; mouldy or sprouting granary | Escovopsis outbreak; poisoned leaves; garden dies |
| Best possession moment | stroking aphids, chasing a ladybird | carrying a pupa along a moonlit trunk | a major cracking a big seed | a media cutting a leaf disc while a minim rides on it |

---

## 2. Shared conventions for species data

### 2.1 Calendar mapping

This chapter uses Ch 06's calendar: `d = (date − 20 March) / 13.04 real days`. Reference points: 1 Apr d 0.9; 1 May 3.2; 1 Jun 5.6; 1 Jul 7.9; 17 Jul 9.1; 1 Aug 10.3; 1 Sep 12.7; 1 Oct 15.0; 1 Nov 17.3; 1 Dec 19.6; 1 Jan 22.0; 1 Feb 24.4; 1 Mar 26.5. Seasons are `spring` d 0-7, `summer` 7-14, `autumn` 14-21, `winter` 21-28.

**Calendar note.** The Lasius and Camponotus dossiers counted game days from 20 March (same as Ch 06); the Messor and Atta dossiers counted from 1 March, so the same date carries a day number about 1.45 higher than on the equinox calendar (Messor flights Sep-Nov are d 12.7-19.6; Atta flights Apr-Jun are d 0.9-7.9). Ch 06's windows for these two species use the dossiers' numbers; the species data repeat Ch 06 and the difference is open risk R3 (Appendix F.1).

### 2.2 The economy is sim-native; `w` is presentational

- Every rate in this chapter (upkeep, eggs, carried loads, yields) is per **simulated** entity. A simulated worker eats, carries and dies as one ant whatever the colony size.
- Each species defines a **display mapping** `realEstimate(N_sim)` (section 3.5). The representation weight `w = realEstimate(N) / N` is used only for: the "estimated colony size" readout, journal and epitaph numbers, Ch 06's worker-equivalent `W_eq` thresholds, mound/heap visual volume, and ambient crowd density on trails (render).
- **Deviation.** The dossiers propose multiplying flows by `w`. That makes a possessed ant's crop and load change as the colony grows and requires world resources to be scaled with it. Because `w` cancels out of every ratio that matters (intake : consumption, larvae : nurses), using sim-native units gives the same dynamics with stable per-ant numbers. World resource sizes (Ch 05) are therefore stated in sim loads.

### 2.3 Body size and derived stats

Each ant gets a continuous `lengthBu` at eclosion, drawn from a triangular distribution (`min`, `mean`, `max` of its caste or size class; seeded `rng.colony`). For polymorphic species the larva's destined size is decided at larva start (section 2.6). All derived stats come from the individual's mass:

| Quantity | Formula | Notes |
|---|---|---|
| `massMg` | `casteMassMg × (lengthBu / casteMeanBu)^3` | caste tables give `casteMassMg` at the mean |
| `m` | `massMg / stdMassMg` | standard worker `m = 1` |
| `maxHp` | `HP_PER_SQRT_MG (12) × massMg^0.5`; males × 0.5 | absolute, so species can fight each other (Ch 05 combat applies) |
| `biteDps` | `BITE_PER_SQRT_MG (2) × massMg^0.5 × mandibleFactor` | mandibleFactor: worker castes 1.0, macrocephalic majors 1.6, Atta major 2.0, queen 0.6, gyne 0.6, male 0.15 |
| `cropCap` (loads) | `min(caste cropMax, m)` | |
| `carryCap` (loads, item bulk) | `m^0.6` unless the caste table overrides | small ants carry relatively more; Ch 01 §7 uses `carryCap` |
| `upkeepRest`, `upkeepActive` (C/GD) | `0.08 × m^0.75`, `0.20 × m^0.75` | directions J for the standard worker; queens, gynes and males have explicit values |
| `minPassageBu` | `0.45 × lengthBu` (× 1.15 for macrocephalic majors) | narrowest opening the ant passes; micro-connections narrower than this block it |
| Larval cost to pupate | `P = 1.2 × m^0.8`, `C = 0.4 × m^0.8` of the destined adult (Atta: `FL = 1.6 × m^0.8`) | J reference 1.2 P + 0.4 C for a standard worker |
| Egg cost | `EGG_COST_P` 0.04 P (Atta 0.03 FL) | J |

### 2.4 Development

Brood progress per stage advances at `dProgress/dt = devRate(Tchamber) / (stageGd × casteDevMult)` per GD while the brood is fed as required by Ch 02 (unfed larvae do not progress). `devRate` is a per-species piecewise-linear table (1.0 at the reference temperature). Eggs and pupae are not fed. Above the table's upper zero, Ch 02 applies heat mortality (Ch 06 §2.7).

### 2.5 Lifespan, ageing and hazard (mechanism owned by Ch 02 §1.3)

- `lifespan` is drawn at eclosion (Ch 02: normal draw, clamped). Death when `physioAge ≥ lifespan`.
- `physioAge` accrues at `AGE_RATE_IN_NEST` 1.0 per GD inside the nest, `ageRateOutside` per GD while outside (this is how foraging risk not covered by simulated predators is represented; species value below) and `ageRateDormant` per GD while dormant (overwinter, chill coma). There is no separate abstract death roll.
- Species values: `ageRateOutside` Lasius 3.0 (Ch 02), Camponotus 2.0 (nocturnal habit lowers predation [D]), Messor 3.5 (foraging is the lethal task [D]), Atta 3.0; `ageRateDormant` Lasius and Camponotus 0.15 (Ch 02), Messor 0.3 (mild rest), Atta not dormant (Ch 06 winter mode `active`).

### 2.6 Egg laying and caste destiny

- Laying uses Ch 02 §3.2: `potential = Q_MAX × fSize(N) × fSeason(D) × fTempQ(T_royal) × fHealth × fecundity × fCap`, eggs paid from the queen's gut P (Atta: from fungus she is fed). This chapter supplies the species values `Q_MAX`, `fSize(N) = sizeBase + (1 − sizeBase) (1 − e^(−N/sizeK))`, `fSeason` (by 1-based `D = d + 1`, as Ch 02 writes it), optional `layWindows`, and `fTempQ`. Equivalent closed form used in the tables below: `q(N) = Q_MAX × fSize(N)`.
- **Caste destiny** is set at larva start for worker-caste larvae by comparing the colony's current caste mix with `casteMixTarget(N, colonyAgeYears)` plus the directive `casteEmphasis` (−1 more small, +1 more large; shifts the target major share by ±50 % of itself). A larva is destined `major` only if the colony P store (Atta: total garden yield) covers ≥ `MAJOR_GATE_GD` 2 GD of larval demand; otherwise it becomes the next smaller class. Sexual brood is destined only when Ch 06's reproduction gate is open (Ch 06 §11).

### 2.7 Speed

Cruise speeds below are AI walking speeds at speed multiplier 1.0 (Ch 06 §2.6 curve, shifted by `thermalShiftC`). Sprint is used for alarm, flee and the player's `hurry`. **Deviation:** the seed's "~12 BU/s" is treated as sprint, not cruise: the measured Lasius walking speed is 23.5-26 mm/s = 6 BU/s [D], and directions J's "600 BU round trip in about 2 minutes" matches 6 BU/s. Loaded speed is cruise × `loadSpeedMult` (Ch 01 `LOAD_SPEED_MULT`, overridden per species).

---

## 3. The `SpeciesDef` schema [T1]

A `SpeciesDef` is static data (not part of `SimState`; saves store only `speciesId`). Types are sketches; every number carries its unit. Field groups follow; fields named by Ch 06 (`climate`, `thermal`, `opening`, `reproduction`, `winter`) and Ch 08 (`available`, `foundingSeason`) keep those names.

### 3.1 Identity and meta

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `id` | `SpeciesId` | | canonical id |
| `binomial`, `commonName` | string | | codex and UI text (Ch 08) |
| `subfamily` | `'formicinae' \| 'myrmicinae'` | | drives anatomy defaults: acidopore vs sting, waist nodes |
| `buMm` | number | mm | length of the standard worker |
| `stdMassMg` | number | mg | mass of the standard worker (`m = 1`) |
| `available` | boolean | | shown in New Game (Ch 08); Lasius true at T1, others true at T3 |
| `tier` | `'T1' \| 'T3'` | | |
| `complexity` | 1..3 | | Ch 08 card |
| `playstyleLine` | string | | one line for the species card |
| `foundingSeason` | `Season` | | Ch 08 default start season |
| `economyModules` | `EconomyModuleId[]` | | subset of `honeydew-ranching`, `wood-nesting`, `granary`, `fungus-garden` |
| `codexIds` | string[] | | codex entries unlocked when the species is first played |

### 3.2 Castes (`castes: CasteDef[]`)

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `caste` | `Caste` | | `queen`, `gyne`, `male`, `worker` or `minor`/`media`/`major` |
| `sizeClasses` | `{id, minBu, maxBu}[]` | BU | optional sub-bins for task propensity (Atta `small-media`; nanitic) |
| `lengthBu` | `{min, mean, max}` | BU | triangular draw (2.3) |
| `casteMassMg` | number | mg | mass at mean length |
| `cropMax`, `carryOverride` | number \| null | loads | caps on 2.3 formulas |
| `mandibleFactor` | number | | 2.3 |
| `macrocephalic` | boolean | | head > 0.3 body length; render and passage |
| `cruiseMult`, `sprintBuS` | number | ×, BU/s | relative to species cruise; sprint absolute |
| `lifespanGd` | `{mean, sd}` or function of colony size | GD | 2.5 |
| `ageRateOutside`, `ageRateDormant` | number | /GD | 2.5 |
| `upkeepOverride` | `{restC, activeC, P}` \| null | loads/GD | queens, gynes, males |
| `devMult` | number | × | stage duration multiplier |
| `actions` | `ActionId[]` | | action primitives the anatomy allows (Ch 01 §7 ids) |
| `taskWeights` | `Partial<Record<Task, number>>` | 0..1 | propensity by task, multiplies Ch 02 response thresholds; 0 = never |
| `unlock` | `{minWorkers, minColonyAgeYears}` | | earliest point a larva can be destined to this caste |

### 3.3 Life history (`life`)

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `stageGd` | `{egg, larva, pupa}` | GD | standard worker at `devRefC` |
| `devRefC` | number | °C | reference temperature |
| `devRate` | `[T °C, rate][]` | | piecewise-linear (2.4) |
| `larvaFood` | `'trophallaxis+solid' \| 'seed-paste+solid' \| 'staphylae'` | | what nurses feed (Ch 02) |
| `animalProteinMinFrac` | number | 0..1 | Messor only (6.3) |
| `Q_MAX`, `sizeBase`, `sizeK` | number | eggs/GD, —, workers | Ch 02 §3.2 `fSize` |
| `fSeason` | `[D, factor][]` | | season factor by 1-based day, piecewise over the year |
| `layWindows` | `[d0, d1][]` \| null | d | if set, laying only inside windows (Camponotus) |
| `fTempQ` | `[T °C, factor][]` | | royal-chamber temperature factor (Lasius = Ch 02 §3.2) |
| `queenUpkeep` | `{c, p}` or `{fl}` | loads/GD | established queen |
| `queenLifespanYears` | `{min, max}` | game years | uniform draw; used only if difficulty toggle "queen senescence" is on (default on) |
| `casteMixTarget` | table `N → {minor, media, major}` | fractions | 2.6 |
| `broodHazard` | record | /GD | species-specific brood hazards (e.g. Camponotus moisture), on top of Ch 02 |

### 3.4 Founding (`opening`) — the founding model, reserve drains and clutch mechanics are Ch 06 §5; this block holds the species inputs

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `mode` | `'claustral' \| 'claustral-wood' \| 'claustral-fungus'` | | |
| `siteMaterials` | `Partial<Record<Material, number>>` | 0..1 | suitability; 0 = refused |
| `siteHard` | rules | | hard refusal conditions (section 5.x) |
| `siteBonuses` | rules | | cover, moisture, softness, distance to rivals |
| `shaftDepthBu` | `{min, target, max}` | BU | Ch 06 founding progress |
| `chamberWidthBu` | number | BU | |
| `seal` | boolean | | Ch 01 `seal-entrance` |
| `R0` | number | loads | Ch 06 `FOUND_R0` |
| `clutchCap` | number | eggs | Ch 06 `FOUND_CLUTCH_MAX_EGGS` |
| `trophicFraction` | number | 0..1 | Atta only (Ch 06 `ATTA_TROPHIC_FRACTION_FIRST`) |
| `firstBroodClass` | caste + flag | | e.g. `worker` + `nanitic` |
| `expectedFirstWorkers` | `{min, max}` | ants | Ch 06 §5.15 target |
| `special` | ids | | `pellet` (Atta), `woodMoisture` (Camponotus), `lineage` (Messor) |

### 3.5 Colony scale (`scale`)

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `simCapWorkers` | number | ants | adult worker cap (Ch 02 stops laying worker eggs at the cap; × the performance chapter's `popCapScale`) |
| `realEstimate` | `[N_sim, N_real][]` | ants | piecewise-linear display mapping (2.2) |
| `growthTargets` | `[yearEnd, minN, maxN][]` | ants | headless balance targets (Appendix E) |

### 3.6 Reproduction (`reproduction`) — the gate, investment control, alate states and flight rolls are Ch 06 §11; this block holds the species values of Ch 06 §11.2

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `matureAgeYears` | number | game years | Ch 06 `gate-age` |
| `alateLayWindow` | `[doy0, doy1]` | doy | Ch 06 §11.2 |
| `REPRO_MAX_FRAC` | number | of `N_sim` | alates at investment 1.0 |
| `REPRO_GYNE_SHARE` | number | 0..1 | |
| `sexualCostMult` | `{gyne, male}` | × 1.6 loads | larval cost multipliers |
| `alateFlightWindow` | `[doy0, doy1]`, peak | doy | |
| `launchHours` | `[h0, h1]` | h | |
| `flightGate` | rules | | temperature, wind, rain history, light (consumed by Ch 06 reproduction) |
| `synchrony` | `'regional' \| 'individual'` | | all colonies fly the same day vs alates leave singly |
| `alatesOverwinter` | boolean | | Camponotus: alates stay through winter instead of expiring (Ch 06 §11.3) |

### 3.7 Diet (`diet`)

| Field | Type | Meaning |
|---|---|---|
| `foods` | `Partial<Record<FoodKind, {pref: 0..1, route: Route, tier}>>` | accepted food kinds; `route` ∈ `crop-c` (liquid to C), `crop-cp` (liquid with source profile), `solid-p` (solid to P store), `solid-cp`, `granary` (Messor seed stock), `substrate` (Atta garden substrate), `water`, `refuse` (handled, not eaten) |
| `pTargetFrac` | number | protein share Ch 02's collective regulation aims at when larvae are present |
| `sapPerCut` | number | Atta: C loads drunk per completed `cut-leaf` |

Nutrient profiles of sources belong to Ch 05; the species only says which kinds it accepts, how much it prefers them and where they go.

### 3.8 Nesting (`nesting`, `nestTemplate`)

| Field | Type | Unit | Meaning |
|---|---|---|---|
| `nestMaterials` | `Partial<Record<Material, number>>` | × | dig-speed multiplier for nesting; absent = not diggable by this species (travel is separate: every species walks every surface) |
| `coverBonus` | `Material[]` | | objects whose underside is preferred (stones, slabs) |
| `tunnelWidthBu` | number | BU | template tunnels |
| `shaftWidthBu` | number | BU | main shafts |
| `chambers` | `{type, widthBu, heightBu, depthBu: [min, max], perUnit, unitOf}[]` | | architect counts: `perUnit` chambers per `unitOf` (workers or brood) |
| `entrances` | `{start, perWorkers, max}` | | |
| `maxDepthBu` | number | BU | |
| `mound` | `'crater' \| 'soft-mound' \| 'none'` | | pellet deposition style (Ch 03) |
| `midden` | `'surface-pile' \| 'entrance-midden' \| 'frass-pile' \| 'detritus-chamber+heap'` | | |
| `broodClimate` | `{stage, tMin, tOpt: [a,b], tMax, rh: [a,b] or mc: [a,b]}[]` | °C, 0..1, % | where nurses place brood |

### 3.9 Activity and thermal (`thermal`, `lightPref`) — values owned by Ch 06 §1.5 and §2.6

| Field | Type | Meaning |
|---|---|---|
| `thermalShiftC` | °C | shift of the Lasius speed curve |
| `forageGate` | `{a, b, c, d}` °C air | trapezoid gate |
| `stressC`, `shadeSeekC`, `chillC`, `freezeC` | °C | heat and cold thresholds |
| `lightPref` | `Record<DayPhase, number>` | willingness to leave the nest by phase (with seasonal override) |
| `maxTripBuHot` | rule | Messor: forage distance shrinks with heat (6.3) |
| `satiationActivity` | `{storesGd, mult}` | Camponotus: a well-fed colony forages less |

### 3.10 Signals (`signals`)

| Field | Unit | Meaning |
|---|---|---|
| `trailHalfLifeS` at `trailRefC` | s, °C | recruitment trail decay (Ch 02 pheromones) |
| `trunkTrail` | `{enabled, unusedHalfLifeGd, ghostAfterGd, ghostFadeGd, clearing}` | persistent trunk trails |
| `homeHalfLifeGd` | GD | home-range marking |
| `ignorerFrac` | 0..1 | foragers that ignore trails |
| `recruitUnlockWorkers` | ants | trail recruitment starts at this size |
| `recruitGroup` | `{min, max}` | group recruitment size |
| `patrolGate` | `{patrollers, returnsNeeded, windowS}` \| null | morning activation gate (Messor) |
| `alarmMode` | `'pheromone' \| 'drumming' \| 'stridulation'` | extra alarm channel |
| `alarmRadiusBu` | BU | |

### 3.11 Combat (`combat`) — rules owned by Ch 05

| Field | Meaning |
|---|---|
| `weapons` | subset of `bite`, `bite-hold`, `spray-acid`, `sting` |
| `acid` | `{max, regenS, coneDeg, rangeL}` (Ch 01 defaults 5, 120 s) |
| `sting` | `{damage, intervalS}` |
| `aggression` | 0..1 baseline response to non-nestmates |
| `guardCastes` | castes that `block-opening` |

### 3.12 Climate (`climate`)

`climateId`: one of Ch 06's `temperate-maritime`, `temperate-continental`, `mediterranean`, `subtropical`. The climate profile sets the locality's seasonal and diurnal temperatures, weather weights and humidity (Ch 06 §2.1). New Game always uses the species' climate.

### 3.13 Overwintering (`winter`) — model owned by Ch 06 §6

| Field | Meaning |
|---|---|
| `mode` | Ch 06 ids: `diapause-lapse` (Lasius, Camponotus), `rest-lapse` (Messor), `active` (Atta: winter is played, no lapse) |
| `T_COLD_STRESS`, `WINT_BASE_LOSS`, `WINT_MET_BASE`, `WINT_Q10` | Ch 06 §6.3 species rows |
| `broodCarried` | `larva` (all lapse species) |
| `heatedNestRule` | Ch 06 §6.1: if chambers holding ≥ 80 % of brood average ≥ 14 °C over 2 GD the colony is `winterActive` (relevant to Camponotus in heated buildings, 6.2.8) |

### 3.14 Economy modules and directives

| Field | Meaning |
|---|---|
| `economyModules` | module ids (3.1); each module reads its own species parameter block (`honeydew`, `wood`, `granary`, `fungus`) |
| `directiveTasks` | tasks shown as allocation sliders (Ch 02/08) |
| `directiveExtras` | species sliders/toggles (`casteEmphasis`, `granaryHygiene`, `leafSelectivity`, `satelliteAuto`, `hideFrass`, `hitchhikerEscort`) |
| `taskSubtypes` | subtypes this species uses (Appendix A.0) |

### 3.15 Appearance (`appearance`, consumed by render)

`bodyColour`, `gasterColour`, `hairiness` 0..1, `waistNodes` 1 or 2, `acidopore` or `sting`, `spines` (Atta 3 pairs), `headWidthRatio` per caste, `queenThoraxScale`, `alateWingTint`. No colour claims beyond the dossiers (Lasius dark brown-black; Camponotus dull black with pale gaster hairs; Messor black/dark brown; Atta rusty brown).

### 3.16 Validation (loader rejects a def that fails)

1. Every caste: `min ≤ mean ≤ max`; the standard worker's `mean = 1.0` BU (Lasius worker, Camponotus/Messor/Atta media).
2. `devRate` keys strictly increasing, value 1.0 at `devRefC` (± 0.01), zeros at both ends.
3. `s` covers the whole year `[0, 28)` (a step at `d` 0 is allowed, e.g. spring resumption after winter).
4. Every `ActionId` exists in Ch 01's primitive list or in Appendix A.0 additions.
5. Every `FoodKind`, `Material`, `Task`, `Caste` is canonical (directions J) or listed in A.0.
6. Module parameter block present for each listed module, absent otherwise.
7. `simCapWorkers ≤ 1500`; `realEstimate` monotonic.

---

## 4. Climate summary (owned by Ch 06 §2.1, repeated for reference)

| | `temperate-maritime` | `temperate-continental` | `mediterranean` | `subtropical` |
|---|---|---|---|---|
| Species | Lasius | Camponotus | Messor | Atta |
| Seasonal mean peak / trough (°C) | 20.5 / 3.5 | 24.0 / −1.0 | 25.0 / 10.0 | 29.0 / 10.0 |
| Summer diurnal half-range (°C) | 6 | 7 | 8 | 7 |
| Rain / heat / frost weight | 1 / 1 / 1 | 1.1 / 0.9 / 1.2 | 0.5 / 1.5 / 0.15 | 0.9 / 1.3 / 0.15 |
| Humidity base | 0.75 | 0.70 | 0.50 | 0.70 |
| Consequence for play | mild; winter dormancy | hard winters (full diapause), warm humid summer nights | hot dry summers (activity shifts to night), mild wet autumns trigger flights | hot summers (night only), mild winters with day foraging |

---

## 5. The four species

### 5.1 *Lasius niger* — black garden ant [T1; honeydew items T2]

#### 5.1.1 Castes

| Caste | Length BU (min / mean / max) | Mass mg | m | HP | Bite dps | Crop | Carry | Upkeep rest / active C/GD | Cruise / sprint BU/s | Lifespan GD | Passage BU |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `worker` | 0.9 / 1.0 / 1.15 | 1.0 | 1.0 | 12 | 2.0 | 1.0 | 1.0 | 0.08 / 0.20 | 6 / 12 | 33 if colony N < 100 at eclosion, 24 if N ≥ 250, linear between; sd 10 [D] | 0.45 |
| `worker` (nanitic flag, first brood) | 0.8 / 0.85 / 0.9 | 0.6 | 0.6 | 9.3 | 1.5 | 0.6 | 0.74 | 0.054 / 0.136 | 6 / 12 | 24, sd 10 (Ch 02 `NANITIC_LIFESPAN_MEAN`) | 0.38 |
| `queen` | 2.0 / 2.1 / 2.25 | 30 (founding 22) | 30 | 66 | 6.6 | 1.0 (gut, Ch 02) | 0 food; brood and pellets during founding | 0.30 C + 0.10 P + egg costs (J) | 3 / 5 | 15-25 game years | 0.95 |
| `gyne` | 2.0 / 2.1 / 2.25 | 25 | 25 | 60 | 6.0 | 3.0 | 0 | 0.15 C | 6 / 10 | until flight | 0.95 |
| `male` | 0.9 / 0.95 / 1.05 | 0.8 | 0.8 | 5.4 | 0.3 | 0.3 | 0 | 0.06 C | 6 / 10 | flight + 0.1 GD | 0.43 |

`ageRateOutside` 3.0, `ageRateDormant` 0.15 (2.5); nanitics are more efficient nurses [D] (Ch 02 work rate). `loadSpeedMult` 0.85. The worker and nanitic rows repeat Ch 02 §1 values for completeness; Ch 02 is authoritative for them.

Actions — `worker`: `move`, `let-go`, `grip`, `pick-up`, `put-down`, `drop`, `dig-bite`, `seal-entrance`, `unseal-entrance`, `feed-larva`, `trophallaxis-give`, `trophallaxis-receive`, `groom`, `antennate`, `sniff`, `lay-trail`, `harvest-liquid`, `harvest-solid`, `tend-aphid` (T2), `carry-aphid` (T2), `bite`, `bite-hold`, `spray-acid`, `release-alarm`, `drag`. `queen` (founding): `dig-bite`, `seal-entrance`, `lay-egg`, `feed-larva`, `groom`, `pick-up` (brood), `spray-acid`, `bite`; established: `lay-egg`, `trophallaxis-receive`, `groom`, `spray-acid`. `gyne`: `fly`, `mate`, `dealate`, `groom`, `trophallaxis-receive`, `spray-acid`. `male`: `fly`, `mate`, `groom` (self), `trophallaxis-receive`.

#### 5.1.2 Life history

| Parameter | Value | Basis |
|---|---|---|
| `stageGd` egg / larva / pupa at `devRefC` 21 °C | 1.4 / 0.6 / 1.9 (sum 3.9; preoviposition 0.08 at founding only) | [D] S6 medians 18/8/25 d |
| `devRate` | ≤10: 0; 15: 0.45; 20: 0.91; 21: 1.0; 25: 1.36; 30: 1.82; 32: 1.85; 35: 1.4; 38: 0 | [D] 575 degree-days above 10 °C; upper end [EST] |
| Stage multipliers | first brood (nanitic): larva × 0.85; gyne: larva × 2.0, pupa × 1.1; male: larva × 1.2 (Ch 02 §2) | |
| Larval cost | worker 1.2 P + 0.4 C (J); nanitic 0.72 P + 0.24 C (Ch 02 × 0.6); gyne and male per Ch 06 §11.2: 12 × and 2 × 1.6 loads (gyne 14.4 P + 4.8 C, male 2.4 P + 0.8 C; the mass rule of 2.3 gives 15.7 P for a 25 mg gyne, so Ch 06's value is consistent) | J, Ch 02, Ch 06 |
| `Q_MAX`, `sizeBase`, `sizeK` | 100, 0.30, 300: `q(N)` 34 at 18, 50 at 100, 74 at 300, 97 at 900 | [D] |
| `fSeason(D)` | Ch 02 §3.2: D 1-2: 0.3; 0.3 → 1.0 over D 2-5; 1.0 D 5-15; 0.6 D 15-18; 0.2 D 18-21; 0 D 21-29 | [D] (temperature, not photoperiod, drives laying) |
| `fTempQ` | Ch 02 §3.2: 0 at ≤ 14 °C, 1 at 20-30 °C, 0.5 at 34 °C, 0 at ≥ 36 °C | |
| `larvaFood` | trophallaxis + solid protein | |
| `queenLifespanYears` | 15-25 (max known 28 y) | [D] |
| Caste mix | 100 % worker | monomorphic |

#### 5.1.3 Founding variation (`opening`, mode `claustral`; model in Ch 06 §5)

| Parameter | Value |
|---|---|
| Natural window | after the July-August flights: Ch 06 start window `doy` 8-12, default Summer 3, afternoon |
| Site materials (suitability) | `loam` 1.0, `humus` 0.9, `sand` 0.8 (collapses, floods), `clay` 0.5 (slow), `gravel` 0.4; refused: wood, concrete, asphalt, stone, tile, brick |
| Site bonuses (feed Ch 06 §5.7 site factors) | under a sun-warmed stone, slab, brick, tile or plastic sheet (cover and warmth); recent rain (soft soil); rival home-range scent (penalty) |
| Shaft / chamber | founding shaft 1.5 BU wide (Ch 06 §5.8), target depth 10 BU (8-15) [D 2-6 cm]; founding cell about 3 BU wide |
| Reserves / clutch cap / first workers | Ch 06: `FOUND_R0` 56 loads; clutch cap 48 eggs; 8-16 nanitic workers at scale 0.85 (about 46 % of eggs) |
| First-brood duration | about 3.8 GD at 21 °C (egg 1.4, larva 0.51, pupa 1.9); cooler autumn cells push it later, possibly past winter (biologically normal) |
| Co-founding (pleometrosis) | **T3 (stretch).** If another founding queen is within 20 BU when digging starts, the player may join; the colony's clutch cap rises by 50 %; after the first worker ecloses the queen with the lower egg count dies (fight) [D: 18-25 % of incipient colonies co-found; the more fecund queen wins] |

#### 5.1.4 Scale, growth and alates

| Parameter | Value |
|---|---|
| `simCapWorkers` | 1,500 |
| `realEstimate` | 1:1 to 300; 611 → 1,500; 961 → 3,500; 1,172 → 5,500; 1,275 → 7,000; 1,393 → 10,000; 1,480 → 16,700 [D formula] |
| Growth targets (sim workers at end of colony year) | y1 12-25; y2 200-320; y3 500-750; y4 850-1,050; y5 1,100-1,300 |
| Trail recruitment unlock | 75 workers [D] (below that: solitary foraging with route memory only) |
| Reproduction (Ch 06 §11.2) | `matureAgeYears` 2; stage `mature` (about N_sim 700 = `W_eq` 1,900); `alateLayWindow` doy 2-6; `REPRO_MAX_FRAC` 0.10 (research 5-8 %); `REPRO_GYNE_SHARE` 0.40; flight window doy 9-13, peak 10-11, launch 14:00-18:00; gates air ≥ 13 °C, wind < 6.3 m/s [D] |
| Unflown alates | evicted and eaten 3 GD after the window (Ch 06 `ALATE_EXPIRE_GD`) |

#### 5.1.5 Diet

| Food kind | Pref | Route | Tier |
|---|---|---|---|
| `honeydew` | 1.0 | crop-c | T2 |
| `sugar` | 0.9 | crop-c | T1 |
| `nectar` | 0.8 | crop-c | T2 |
| `fruit` | 0.6 | crop-cp | T1 |
| `crumb` | 0.6 | solid-cp | T1 |
| `carrion` | 0.7 | solid-p | T1 |
| `prey` | 0.8 | solid-p | T2 |
| `pet-food` | 0.5 | solid-p | T2 |
| `seed` (elaiosome only) | 0.3 | solid-p; seed itself dumped on the midden (dispersal) | T2 |
| `bait` | 0.7 | crop-c (toxic, Ch 04) | T2 |
| `dew` | 0.2 | water | T2 |

`pTargetFrac` 0.30 when larvae are present, 0.05 without.

#### 5.1.6 Nest template

| Element | Value |
|---|---|
| `nestMaterials` (dig speed ×) | loam 1.0, humus 1.1, sand 1.4 (collapse risk, Ch 03), clay 0.5, gravel 0.6 |
| Cover bonus | stone, concrete slab, brick, tile, plastic, metal plates: nest directly beneath preferred |
| Tunnels / shafts | 2.0 BU / 2.5 BU |
| Chambers (flat) | `royal` 8 BU wide × 2 BU high at 15-40 BU depth (1, from the founding cell once N ≥ 30); `nursery` 8-12 × 2.0-2.5 BU at 6-25 BU (1 per 60 brood; shallow under cover for warmth); `food` 8 × 2 BU at 15-40 BU (1 per 300 workers); `rest` 10 × 2.5 BU at 20-60 BU (1 per 150 workers); winter cluster `rest` ≥ 50 BU deep (1 when N ≥ 100) |
| Max depth | 175 BU |
| Entrances | 1 + 1 per 400 workers, max 4 |
| Mound / midden | `soft-mound` of pellets (~65 BU across at maturity [D]); midden `surface-pile` ≥ 15 BU from entrances |
| Brood climate | eggs and larvae 22-27 °C, RH 0.7-0.9; pupae 25-30 °C, RH 0.5-0.7 (nurses move pupae to warmer, drier upper chambers by day) [EST] |

#### 5.1.7 Activity, signals, combat

| Group | Values |
|---|---|
| Thermal (Ch 06) | shift 0; forageGate 8/18/30/38; stress 35; shadeSeek 33; chill 4; freeze −2 |
| Light preference (Ch 06) | night 0.35, dawn 0.8, morning/midday/afternoon 1.0, dusk 0.8 |
| Signals | trail half-life 900 s at 22 °C (× 2^((22−T)/10)); home range 2 GD; ignorers 20 %; route memory fixes after 3 visits, fades over 2 GD [D] |
| Combat | weapons `bite`, `bite-hold`, `spray-acid` (5 charges, 120 s regen); aggression 0.5; alarm pheromone radius 8 BU |
| Winter (Ch 06 §6) | `diapause-lapse`; brood held as larvae; `T_COLD_STRESS` 2.0 °C, `WINT_BASE_LOSS` 0.06, `WINT_MET_BASE` 0.35, `WINT_Q10` 2.2; no foraging, no laying |

#### 5.1.8 Possession by caste

| Caste | What the player can do |
|---|---|
| Worker | Forage and lay trail; drink at sugar or honeydew; stroke aphids for droplets (T2); carry an aphid to a fresh stem (T2); chase or spray a ladybird larva; dig and carry pellets to the mound; feed larvae and share food; carry pupae to warm chambers; carry a corpse to the midden; join a cooperative drag of a caterpillar |
| Nanitic | Same as worker; visibly smaller and paler; better nurse |
| Queen | Founding: assess sites (`sniff`), dig shaft and cell, seal, lay; established: lay eggs, open the colony view (directives, markers) |
| Gyne / male | Wait in the nest; on a flight day climb a grass blade and fly (T2) |

#### 5.1.9 Signature moments

1. The thinning queen: her gaster shrinks visibly as reserves drain during the first-brood time-lapse.
2. Callow dawn: nanitics eclose pale and darken over ~1 h (40 s).
3. First trail: at 75 workers, the first returning forager's dabs bring a column of recruits out of the entrance.
4. Stroking the herd (T2): a worker drums an aphid, a droplet swells, the gaster fills.
5. The ladybird larva (T2): tenders swarm and spray it off the stem; the herd recovers.
6. Memory versus scent: a possessed worker can take the remembered shortcut while recruits follow the older, longer trail.
7. Stones as radiators: on a cool spring morning nurses move brood to the chamber directly under the sunlit slab.
8. The afternoon flight (T2): on a warm still day hundreds of winged ants leave every *Lasius* mound in the locality at once.
9. Winter cluster: the colony packs into the deepest chamber before the overwintering time-lapse.

#### 5.1.10 Diagnostics (species-specific; generic ones are Ch 02's)

| Id | Status rule | Limiting factors (weights) | Remedies |
|---|---|---|---|
| `diag-ln-protein` | warn if larval P demand met < 80 % over 0.5 GD; bad < 50 % | no protein sources known; foragers biased to sugar; trail to carrion lost | place `forage` marker on prey/carrion; raise diet emphasis to protein |
| `diag-ln-recruitment` | info until N ≥ 75 | colony below recruitment threshold | grow the colony; lay trail manually as a possessed forager (player trails still recruit) |
| `diag-ln-nursery-warmth` | warn if mean nursery dev rate < 0.7 | no chamber under cover; nursery too deep | dig a nursery chamber under a stone or slab |
| herd diagnostics | see 6.1 | | |

#### 5.1.11 Balance risks

- Honeydew can swamp the C economy; growth should then be P-limited, which is correct, but players may see "full stores, slow growth" as a bug: `diag-ln-protein` must say why.
- `q(N)` at small N (34/GD with 18 workers) outruns protein supply; brood starvation and cannibalism must be visible and explained, not silent.
- 1,500-agent cap is reached around year 5; later years have no growth goal except alates and territory: milestones carry the late game.

#### 5.1.12 Deliberately abstracted

| Abstraction | Why |
|---|---|
| Trophic eggs and egg cannibalism by the founding queen are folded into reserve accounting (shown as an animation only) | identical economic effect, simpler state |
| Root aphids are T3 (stretch) only (6.1) | rarely visible to the player |
| Social parasites (*L. umbratus*) are a rare event, not a mechanic (Ch 05) | needs a second queen type |
| Excess-protein lifespan cost is not modelled | evidence is an analogy from another genus [D] |

---

### 5.2 *Camponotus pennsylvanicus* — black carpenter ant [T3]

#### 5.2.1 Castes

| Caste | Length BU | Mass mg | m | HP | Bite dps | Crop | Carry | Upkeep rest / active | Cruise / sprint BU/s | Lifespan GD | Passage BU |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minor` | 0.7 / 0.78 / 0.9 | 2.0 | 0.29 | 17 | 2.8 | 0.29 | 0.5 | 0.032 / 0.079 | 5 / 10 | 84, sd 30 | 0.35 |
| `minor` (nanitic) | 0.55 / 0.65 / 0.8 | 1.2 | 0.17 | 13 | 2.2 | 0.17 | 0.35 | 0.021 / 0.053 | 5 / 10 | 40, sd 15 [EST] | 0.29 |
| `media` | 1.0 / 1.1 / 1.25 | 7 | 1.0 | 32 | 5.3 | 1.0 | 1.0 | 0.08 / 0.20 | 5 / 10 | 84, sd 30 | 0.50 |
| `major` (incl. rare super majors to 1.9) | 1.3 / 1.5 / 1.9 | 16 | 2.29 | 48 | 12.8 | 2.3 | 2.0 | 0.149 / 0.372 | 4.5 / 9 | 100, sd 35 | 0.78 |
| `queen` | 2.0 / 2.1 / 2.3 | 100 | 14.3 | 120 | 12 | 3.0 | 0 food; brood, egg clump | 0.30 C + 0.10 P + egg costs | 2.5 / 4 | 10-15 game years [D] | 0.95 |
| `gyne` | 1.9 / 2.0 / 2.1 | 100 | 14.3 | 120 | 12 | 3.0 | 0 | 0.15 C | 5 / 9 | until flight (overwinters) | 0.90 |
| `male` | 1.0 / 1.1 / 1.2 | 15 | 2.1 | 23 | 1.2 | 0.5 | 0 | 0.10 C | 5 / 9 | flight + 0.1 GD | 0.50 |

Caste masses are [EST] (dossier anchors on alate dry masses). Mean worker lifespan 3 years is [EST] within the 0.5-7+ year range [D]. `ageRateOutside` 2.0 (nocturnal habit lowers predation [D]); `ageRateDormant` 0.15. `loadSpeedMult` 0.85.

Actions — all workers: Lasius worker list with `dig-bite` in wood, plus `eject-frass`, `drum` (new, A.0); minors: `tend-aphid`; media: `tend-aphid`; majors: `block-opening`, no `tend-aphid` (too large to work small herds; may receive relays). Queen: as Lasius, plus `pick-up` of the egg clump. Gyne/male as Lasius.

#### 5.2.2 Life history

| Parameter | Value | Basis |
|---|---|---|
| `stageGd` at 24 °C | 1.4 / 1.6 / 1.9 (sum 4.9) | [D] 18/21/25 d |
| `devRate` | ≤10: 0; 17: 0.5; 24: 1.0; 30: 1.0; 33: 0.5; 36: 0 | [EST] (dossier) |
| `devMult` | nanitic 0.95, minor 1.0, media 1.05, major 1.15, gyne 1.3, male 1.1 | [D] majors +15 % [EST] |
| Larval cost | nanitic 0.29 P + 0.10 C; minor 0.45 P + 0.15 C; media 1.2 P + 0.4 C; major 2.33 P + 0.78 C; gyne 10.1 P + 3.4 C; male 2.2 P + 0.72 C | 2.3 (gyne ≈ 8 × media, as dossier mass ratio) |
| Laying | only inside `layWindows` d 0.5-3.0 (spring) and d 9.5-12.5 (late summer); `Q_MAX` 148, `sizeBase` 0.054, `sizeK` 500, i.e. `q(N)` = 8 + 140 (1 − e^(−N/500)) per GD in window; `fSeason` 1.0 inside windows; `fTempQ` 0 at ≤ 15 °C, 1 at 21-30 °C, 0 at ≥ 35 °C | [D] two windows; rate [EST] |
| Brood fate by window | spring eggs → workers this summer and all sexual brood; late-summer eggs → larvae that overwinter (diapause) and eclose next June-July (d 6-10) | [D] |
| `casteMixTarget` | colony age < 2 years: 100 % minor (nanitic in year 1); from age 2 years and N ≥ 60: media and majors unlock, target ramps linearly over 1 year to 50 / 38 / 12 (minor / media / major) | [D] media and majors only from the third season; mix [EST] |
| Species brood hazard | moisture rule for eggs and young larvae (6.2.4) | [D]/[EST] |
| `queenLifespanYears` | 10-15 | [D] |

**Deviation:** the dossier's laying windows of 0.7 GD each would require ~470 eggs per GD in-window at maturity; widened to 2.5 + 3.0 GD so a mature colony lays ~700 eggs a year at ≤ 135 per GD (brood entity budget).

#### 5.2.3 Founding variation (`opening`, mode `claustral-wood`; model in Ch 06 §5)

| Parameter | Value |
|---|---|
| Natural window | spring after the May peak of flights: Ch 06 start window `doy` 2-9, default Spring 5, late afternoon (17:00-19:00) |
| Site | a wood primitive (`wood-decayed` decay class 1-3, or `wood-sound` with `mc` ≥ 18 %), at least 10 BU thick; `bark` gaps over such wood count. Ch 06: `diggability` and `moisture` site factors fall to 0 at `mc` 8 %. Existing cavity (crack, beetle gallery, knot hole ≥ 1.5 BU) halves the chewing needed |
| Site assessment | `antennate` on wood shows the moisture class ("dry / damp / wet") and, with precise values on, `mc` % (from 6.2.1) |
| Chamber | about 3 BU cell chewed into the wood (bites yield `frass`, 6.2.3); sealed with a plug of chewed fibre (Ch 06 §5.9) |
| Reserves / clutch cap / first workers | Ch 06: `FOUND_R0` 36 loads; clutch cap 16 (9-16 eggs, carried as one clump [D]); 6-11 nanitic `minor`s |
| Moisture clock | Ch 06 §5.15: brood survival × clamp((`mc` − 8)/7, 0, 1); mould above 30 %; this is the same rule as 6.2.4 |
| First-brood duration | 5.1 GD at 24 °C (66 d [D]); a May founding gives first workers in late July |
| Night | the founding intro starts at dusk; Ch 06's threat director should weight bird attacks by day for this species |

#### 5.2.4 Scale, growth and alates

| Parameter | Value |
|---|---|
| `simCapWorkers` | 1,200 |
| `realEstimate` | 1:1 to 300; then 1 sim : 3 real (1,200 → 3,000) [D] |
| Growth targets | y1 6-12; y2 40-80; y3 200-320 (first media and majors); y4 450-600; y5 800-1,000; y6 1,050-1,200 |
| Foragers | only 2-3 % of workers outside at a time [D]: Ch 02 forage allocation default 3 %, slider range 1-12 % |
| Reproduction (Ch 06 §11.2) | `matureAgeYears` 4 (difficulty: Gentle 3, Harsh 6) [D 3.5-4 y and later]; `alateLayWindow` doy 2-3 (spring eggs give the sexuals [D]); `REPRO_MAX_FRAC` 0.12; `REPRO_GYNE_SHARE` 0.44 (queenless colonies: worker-laid males, gyne share 0.18 [D]); alates eclose about doy 11, **overwinter in the nest** (satellites preferred, 6.2.6) and fly the next spring, doy 1-9 (peak 4-6), launch 16:00-20:00 [EST], singly, not as a mass flight [D] |
| Sexual larval cost | by the 2.3 mass rule gyne 10.1 P + 3.4 C (≈ 8 × a media), male 2.2 P + 0.7 C. Ch 06 §11.2 lists multipliers 28 / 4.6 × 1.6 loads; the dossier's 28 and 4.6 are relative to a *minor* (= 1 NU) and a media costs 3.5 NU, so the consistent multipliers are 8.0 / 1.3 × the media larval cost (risk R4) |
| Heated buildings | heated nests break diapause (Ch 06 §6.1 heated-nest rule); alates there make sporadic winter flights to windows and die [D] |

#### 5.2.5 Diet

| Food kind | Pref | Route | Note |
|---|---|---|---|
| `honeydew` | 1.0 | crop-c | aphids and scale on trees, tended at night (6.1 variant) |
| `sugar` | 1.0 | crop-c | sucrose preferred [D] |
| `nectar` | 0.8 | crop-c | |
| `fruit` | 0.7 | crop-cp | |
| `crumb` | 0.7 | solid-cp | |
| `prey` | 1.0 | solid-p | nitrogen collected ~4 × more intensively than carbohydrate [D] |
| `carrion` | 0.8 | solid-p | |
| `pet-food` | 0.8 | solid-p | |
| `bait` | 0.6 | crop-c (toxic) | |
| `dew` | 0.2 | water | |
| `seed`, `leaf` | 0 | — | wood is never eaten [D] |

`pTargetFrac` 0.45 with larvae present. Protein demand peaks emerge from the larval calendar in June (d 5.6-7.9) and September (d 12.7-15.0) [D].

#### 5.2.6 Nest template (in wood; see 6.2)

| Element | Value |
|---|---|
| `nestMaterials` | `wood-decayed` and `wood-sound` per the 6.2 dig factors; `bark` 1.2 (thin layer only); no soil nests (soil under stones is used only as a summer brood incubator if adjacent to the nest wood: T3 stretch) |
| Galleries | 2.0 BU, along the grain axis of the primitive |
| Chambers | **Deviation:** 5-12 BU long × 3-6 BU wide × 2-3 BU high, elongated along the grain (dossier [EST] 4-10 cm), narrower than the seed's generic 8-16 BU. Parent: `royal` 6 BU (1), `nursery` (young brood) 8 BU (1 per 50 brood), `food` 6 BU (1 per 400 workers), `rest` 10 BU (1 per 200); satellite: `nursery` (late brood) 10 BU, `rest` 10 BU |
| Openings | windows (6.2.3); 1 main entrance per nest site |
| Mound / midden | `none` / `frass-pile` |
| Brood climate | eggs and larvae with progress < 0.5: `mc` 15-30 %, 20-28 °C; late larvae and pupae: `mc` 8-18 %, 24-30 °C |

#### 5.2.7 Activity, signals, combat

| Group | Values |
|---|---|
| Thermal (Ch 06) | shift −2; forageGate 5/13/26/33; stress 36; shadeSeek 34; chill 2; freeze −4 |
| Light preference (Ch 06) | night 1.0, dawn 0.8, morning 0.35, midday 0.2, afternoon 0.3, dusk 1.0 |
| Satiation | stores ≥ 10 GD of upkeep: surface activity × 0.7 [D: heavily fed colonies forage less] |
| Signals | hindgut trail half-life 1,800 s at 20 °C; trunk trails on (unused half-life 3 GD, ghost after 8 GD, ghost fades 7 GD; no physical clearing); home range 3 GD; ignorers 10 %; recruitment from 20 workers; trails run along authored climb routes (trunks, wires, pipes, fences); light compass by moon or artificial light (6.2.7) |
| Combat | `bite`, `bite-hold`, `spray-acid` (minor 3 charges, media 5, major 6; 120 s regen); majors decapitate arthropods under 2 mg (insta-kill chance 0.2 per bite, Ch 05); alarm mode `drumming` (6.2.6); guards: majors `block-opening` at windows and entrances |
| Winter (Ch 06 §6) | `diapause-lapse`; brood held as larvae; `T_COLD_STRESS` 0 °C, `WINT_BASE_LOSS` 0.05; alates add upkeep; heated-nest rule (6.2.8) |

#### 5.2.8 Possession by caste

| Caste | What the player can do |
|---|---|
| Minor (incl. nanitic) | Nurse; press antennae to a gallery wall to read moisture; chew small galleries; carry frass to a window and flick it out; tend aphids at night; scout a trunk by moonlight |
| Media | Forage and lay trail; chew main galleries; carry late larvae and pupae between parent and satellites; drag prey; drum alarm |
| Major | Block a window with the head; spray and bite intruders; drum; haul large prey; chew hard sound wood fastest; store liquid (largest crop) |
| Queen | Founding in wood at dusk; lay; colony view with `satellite`, `move-brood`, `move-queen` markers |
| Gyne / male | Overwinter; on a warm spring day walk out of a window and fly |

#### 5.2.9 Signature moments

1. Night shift: at dusk the trunk comes alive; by midday the surface is nearly empty.
2. Sandpaper galleries: chewing along the grain is fast, across it slow; the gallery walls show the growth rings.
3. Frass falls: pellets flicked from a window collect as a pale pile at the foot of the log (and on a skirting board, as a sign).
4. The moisture reading: a minor's antennae on a damp wall versus a dry one; the parent nest must stay damp.
5. Pupa convoy: media carry cocoons along a moonlit trunk trail to the warm satellite in a wall void.
6. Drumming: a major hammers the gallery wall; nestmates throughout the log rush to the spot.
7. Window guard: a major plugs a window with her head as a rival forager probes it.
8. Third-season giants: the first media and majors eclose in colony year 3, changing what the colony can do.
9. The leak repaired (T3 with Ch 04 human events): a building nest dries out and the colony must move the queen.
10. Winter alates: in a heated building a male wanders to a window in midwinter.

#### 5.2.10 Diagnostics

| Id | Status rule | Factors | Remedies |
|---|---|---|---|
| `diag-cp-parent-moisture` | warn if parent young-brood chamber `mc` < 15 % or > 30 %; bad if < 11 % | wood drying (sun, windows, season); leak repaired; mould | close windows (fewer frass openings), move queen to damper wood |
| `diag-cp-satellites` | info: count, late-brood share in satellites; warn if late brood waiting > 0.5 GD for transport | no satellite; satellite isolated; too few nurses on `shuttle`; daytime heat | place `satellite` marker; raise nurse share; restore the trail |
| `diag-cp-growth` | info: castes unlocked, colony age | media/majors locked until colony year 3 | none (biological); codex explains |
| `diag-cp-frass` | warn if interior frass visibility ≥ 5 pile units | windows over visible floors | toggle `hideFrass` (store frass in an inside midden chamber) |
| wood diagnostics | 6.2 | | |

#### 5.2.11 Balance risks

- Very slow growth (year 3 before larger castes): the long-form pace may bore players. Mitigation (Ch 08/06): offer an "established colony in a stump" start scenario (colony year 3, 250 workers) as a T3 option.
- Only 3 % foragers means few visible surface ants; observation must use trunks and windows to stay interesting.
- Moisture failure is a single point of failure; it needs a slow onset (hazard ramps from `mc` 15 % to 8 %) and clear warnings.

#### 5.2.12 Deliberately abstracted

| Abstraction | Why |
|---|---|
| Blochmannia endosymbiont not modelled | invisible; effect folded into protein demand |
| Moisture is per wood primitive and segment, not per voxel | cheap, readable, matches "this log is damp" |
| Light-compass confusion only from sudden light changes near trails (T3 stretch) | full celestial navigation is not needed for play |
| Leg amputation of injured nestmates not modelled | reported for the genus only |

---

### 5.3 *Messor barbarus* — harvester ant [T3]

#### 5.3.1 Castes

| Caste | Length BU | Mass mg | m | HP | Bite dps | Crop | Carry | Upkeep rest / active | Cruise / sprint | Lifespan GD | Passage BU |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minor` | 0.55 / 0.7 / 0.85 | 2.0 | 0.29 | 17 | 2.8 | 0.29 | 0.5 | 0.032 / 0.079 | 5 / 10 | 12, sd 3 | 0.32 |
| `minor` (nanitic) | 0.5 / 0.6 / 0.7 | 1.3 | 0.19 | 14 | 2.3 | 0.19 | 0.37 | 0.023 / 0.058 | 5 / 10 | 6, sd 2 ("a few months" [D]) | 0.27 |
| `media` | 0.85 / 1.05 / 1.3 | 7 | 1.0 | 32 | 5.3 | 1.0 | 1.0 | 0.08 / 0.20 | 5 / 10 | 16, sd 4 | 0.47 |
| `major` (macrocephalic) | 1.3 / 1.55 / 1.85 | 22 | 3.14 | 56 | 15.0 | 2.0 | 2.5 | 0.189 / 0.472 | 5 / 10 | 20, sd 5 | 0.80 |
| `queen` | 2.0 / 2.3 / 2.6 | 80 | 11.4 | 107 | 10.7 | 3.0 | brood during founding | 0.30 C + 0.10 P + egg costs | 2.5 / 4 | 6-12 game years | 1.0 |
| `gyne` | 2.0 / 2.3 / 2.6 | 80 | 11.4 | 107 | 10.7 | 3.0 | 0 | 0.15 C | 5 / 9 | until flight or expiry (Ch 06) | 1.0 |
| `male` | 1.2 / 1.3 / 1.45 | 10 | 1.45 | 19 | 0.95 | 0.5 | 0 | 0.08 C | 5 / 9 | flight + 0.1 GD | 0.59 |

Unloaded speed is independent of body size [D]; loaded speed falls with load ratio: `loadSpeedMult` 0.75 at full `carryCap`, linear from 1.0 at empty. `ageRateOutside` 3.5 (foraging is the lethal task [D]); `ageRateDormant` 0.3; *Zodarion*-type `ant-spider`s add simulated losses near trails (Ch 05).

**Deviation (lifespans):** the dossier's media lifespan of 6-9 GD (80-120 d) has no source and would need ~150 eggs per GD all year at 1,200 workers; set to 16 GD (≈ 7 months, within the dossier's "months to ~1 year"). **Deviation (queen):** 6-12 game years is the dossier's shortened design value (real estimate 10-20 years) so succession can happen within long play.

Actions — minor: Lasius worker list minus `spray-acid`, plus `sting`, `gnaw-radicle`, `stridulate` (recruiting only); media: plus `mill-seed` (lengthBu ≥ 1.2 only, at half speed), `stridulate`, `cut-seed-head` (new, A.0); major: plus `mill-seed`, `cut-seed-head`, `block-opening`, `stridulate`. No `spray-acid` (myrmicine). `trophallaxis-give/receive`: limited (crop 0.29-2.0); larvae are fed solid paste with `feed-larva`.

#### 5.3.2 Life history

| Parameter | Value | Basis |
|---|---|---|
| `stageGd` at 26 °C | 1.1 / 2.3 / 1.2 (sum 4.6) | [EST] (no measured durations [D]) |
| `devRate` | ≤14: 0; 18: 0.4; 22: 0.7; 26: 1.0; 29: 1.05; 32: 0.5; 36: 0 | [EST] |
| `devMult` | nanitic 0.9, minor 0.95, media 1.0, major 1.2, gyne 1.4, male 1.1 | [EST] |
| Larval cost | nanitic 0.32 P + 0.11 C; minor 0.45 P + 0.15 C; media 1.2 P + 0.4 C; major 3.0 P + 1.0 C; gyne 8.5 P + 2.8 C; male 1.6 P + 0.54 C | 2.3 |
| `larvaFood` | `seed-paste+solid`; `animalProteinMinFrac` 0.10 (6.3.7) | [D] protein is 2-3 % of loads but critical |
| `Q_MAX`, `sizeBase`, `sizeK` | 170, 0.118, 400, i.e. `q(N)` = 20 + 150 (1 − e^(−N/400)) | [EST] |
| `fSeason(D)` | piecewise-linear points (D, factor): (1, 0.5), (2, 1.0), (8, 1.0), (9, 0.5) summer lull, (14, 0.5), (15, 0.8), (20, 0.8), (22, 0), (27.5, 0), (29, 0.5) | [D] spring boom, summer lull, autumn activity |
| `fTempQ` | 0 at ≤ 14 °C, 1 at 22-32 °C, 0 at ≥ 37 °C | [EST] |
| `casteMixTarget` | N < 40: 100 % minor/media (60/40); majors unlock at N ≥ 40 [D 30-50]; target ramps linearly to 35 / 45 / 20 at N = 300 | [EST] |

#### 5.3.3 Founding variation (`opening`, mode `claustral`; model in Ch 06 §5)

| Parameter | Value |
|---|---|
| Natural window | autumn after the flight: Ch 06 start window `doy` 15-19 with a rain event ended 3.6-12 h before |
| Site materials | `sand` 1.0, `loam` 1.0, `gravel` 0.7; `clay` 0.3; `humus` 0.4 (damp); refused: everything non-diggable and soil with moisture ≥ 0.7 |
| Site bonuses (Ch 06 site factors) | open and sunny (no canopy); rain within 1 GD (soft soil: dig × 1.5); penalty for another harvester nest within 300 BU (territorial neighbours [D]) |
| Shaft / chamber | 15-30 BU (Ch 06 §5.15), target 25; chamber about 7 BU wide [EST] |
| Reserves / clutch cap / first workers | Ch 06: `FOUND_R0` 40 loads; clutch cap 20; 5-8 nanitic `minor`s |
| Development timeline | autumn eggs develop until the cell falls below 14 °C, are held through winter (Ch 06 §5.15 winter inside the lapse) and complete in spring; first workers about 11-17 GD after founding [D] |
| Mating lineage (T3) | social hybridogenesis: each queen carries lineage A or B; workers come only from A×B fertilisations, gynes only from same-lineage matings; queens mate about 2.4 times; lineages 1:1 [D]. Ch 06 §11.6 implements it through `p_mate` 0.866 (13.4 % random-mating failure [D]) and the possessed-flight lek rule; this chapter supplies `lineageFreq` {A: 0.5, B: 0.5} and `matesMean` 2.4 |

#### 5.3.4 Scale, growth and alates

| Parameter | Value |
|---|---|
| `simCapWorkers` | 1,500 |
| `realEstimate` | 1:1 to 300; linear to 1,500 → 12,000 [D mature 8,000-12,000] |
| Growth targets | y1 (first spring onward) 15-40; y2 150-300; y3 500-900; y4+ 900-1,500 |
| Reproduction (Ch 06 §11.2) | `matureAgeYears` 3 [EST]; `alateLayWindow` doy 8-13; `REPRO_MAX_FRAC` 0.02; `REPRO_GYNE_SHARE` 0.50; flight window doy 15-20 (peak 17-19), launch 13:00-17:00 [D afternoon, weak]; flight 0.15-0.6 GD after a rain of ≥ 7 h, regionally synchronised [D]. On the equinox calendar the research window Sep-Nov is d 12.7-19.6 (doy 13-20); see risk R3 |
| Extra gate (this module) | granary stock ≥ 30 GD of consumption at the start of the lay window (stores gate of Ch 06 reads granary + paste for this species) |

#### 5.3.5 Diet

| Food kind | Pref | Route | Note |
|---|---|---|---|
| `seed` | 1.0 | granary | 6.3 |
| `crumb` | 0.6 | granary (as soft seed: hardness 0.1, rots × 2 faster) | bread crumbs are starchy |
| `pet-food` | 0.3 | granary (hardness 0.3) | dry kibble |
| `carrion` | 0.7 | solid-p (animal) | the protein bottleneck |
| `prey` | 0.4 | solid-p (animal) | dead or helpless arthropods only; live prey ≤ 0.5 mg |
| `sugar`, `fruit`, `nectar` | 0.2, 0.1, 0.15 | crop-c | minor |
| `bait` | 0.5 | granary or crop by bait type (Ch 04) | |
| `dew` | 0.4 | water | |
| `honeydew` | 0 | — | does not tend aphids |

`pTargetFrac` is replaced by `animalProteinMinFrac` (6.3.7).

#### 5.3.6 Nest template

| Element | Value |
|---|---|
| `nestMaterials` | sand 1.4, loam 1.0, gravel 0.6, clay 0.5, humus 1.0 (but damp: granary humidity penalty) |
| Tunnels / shafts | 2.5 BU (majors need ≥ 2.2) / 3.0 BU, vertical from each entrance |
| Chambers | `nursery` 8-12 × 3 BU at 20-80 BU depth (1 per 60 brood); `granary` 10-16 × 4-6 BU at 60-200 BU depth (count from 6.3.5); `royal` 8 × 3 BU at 80-150 BU (deep, humid); `rest` 10 × 3 BU (1 per 200); milling happens in `granary` or `general` chambers next to a granary |
| Max depth | 285 BU (2 m) |
| Entrances | 1 at founding; +1 per 300 workers; max 5; each owns a trunk-trail tree and a chaff midden 8-20 BU from the hole |
| Mound / midden | `crater` (low ring of excavated soil) / `entrance-midden` |
| Brood climate | 24-28 °C, RH 0.5-0.8 |

#### 5.3.7 Activity, signals, combat

| Group | Values |
|---|---|
| Thermal (Ch 06) | shift +6; forageGate 8/20/35/42; stress 40; shadeSeek 38; chill 6; freeze −1 |
| Light preference (Ch 06) | night 0.6 (summer 1.0), dawn 1.0, morning 0.9, midday 0.7, afternoon 0.9, dusk 1.0 |
| Heat trip limit | max foraging distance from the entrance × clamp((42 − Tmicro_trail) / 10, 0.2, 1): columns shorten as the morning warms [D] |
| Summer lull | when the rolling 1 GD rate of seed-laden returns falls below 20 % of the spring mean, outgoing activation × 0.3 (colony goes quiet for days [D]); emergent from Ch 02 interaction-rate activation with this floor |
| Signals | recruitment trail half-life 120 s (short) [EST]; trunk trails on (persistent while used within 3 GD; ghost after 10 GD unused; ghost fades over 7 GD; physical clearing: grass and litter decor suppressed in a 6 BU ribbon) [D]; group recruitment 5-30 to rich patches [D]; ignorers 15 %; recruitment from 30 workers |
| Patrol gate | morning: 5-10 `patrol` ants leave first; foragers activate after ≥ 3 patrollers have returned safely within 60 s; if patrollers die or meet alarm, foraging stays × 0.2 for 1 h [D: *Pogonomyrmex* model donor] |
| Combat | `bite`, `bite-hold`, `sting` (6 damage every 2 s while gripping) ; alarm mode `stridulation` (radius 6 BU through substrate) plus poison-gland alarm pheromone 10 BU; majors guard entrances (`block-opening`); aggression 0.7 to conspecific neighbours |
| Winter (Ch 06 §6) | `rest-lapse`; brood held as larvae; `T_COLD_STRESS` 4.0 °C, `WINT_BASE_LOSS` 0.05; consumption drawn from granary stock at 0.3 × summer (the aggregate model converts seed loads to paste at 0.8 without simulating milling labour) |

#### 5.3.8 Possession by caste

| Caste | What the player can do |
|---|---|
| Minor | Carry small seeds; haul chaff to the midden; gnaw the radicle off a germinating seed; feed paste to larvae; squeeze through narrow tunnels |
| Media | Lay and follow trunk trails; stridulate to recruit; carry medium seeds; drag a large one with others; clear a pebble from the trail; dig; move damp seeds to a drier granary |
| Major | Cut a seed head off a stem; carry a large seed alone; mill seeds into paste; guard an entrance; bite and sting intruders |
| Queen | Founding in open ground after rain; lay; colony view with granary and milling directives |
| Gyne / male | Fly on an autumn afternoon after rain |

#### 5.3.9 Signature moments

1. The worn road: a cleared trunk trail persists into winter; the ground shows the colony's history.
2. Size-matching: minors trot with grass seeds while a major shoulders a large legume seed.
3. The cracking: a major rotates a hard seed in her mandibles; husk splinters fly; paste goes to the larvae.
4. Sprouting granary: after a wet week the inspect card on a granary reads "germinating"; minors swarm to gnaw radicles.
5. The chaff ring: husks pile in a crescent by each entrance; months later seedlings come up on the midden.
6. The heat retreat: on a summer morning the column shortens hour by hour until only the entrance is busy.
7. Patrollers at first light: a handful of ants leave and return; only then does the trail fill.
8. The autumn flight: the day after rain, every harvester nest in the locality releases its winged ants in the afternoon.
9. Lineage (T3 stretch): as a daughter queen the player learns that her colony's workers are hybrids of two lineages.

#### 5.3.10 Diagnostics

| Id | Status rule | Factors | Remedies |
|---|---|---|---|
| `diag-mb-milling` | warn if paste stock < 1 GD of demand while granary stock > 5 GD | too few majors; millers allocated elsewhere; seeds too hard for media | raise `mill` slider; raise `casteEmphasis`; collect softer seeds |
| `diag-mb-animal-protein` | warn if larval animal-P share < 10 % | no carrion/prey found; foragers all on seeds | `forage` marker on carrion; diet emphasis to protein |
| `diag-mb-heat` | info: current max trip distance and lull factor | surface too hot; summer lull | none needed; forage at night; mark close seed patches |
| `diag-mb-patrol` | warn if foraging held by patrol gate > 1 h | patrollers killed (spider, rival); alarm at entrance | guard the entrance; move the trail |
| granary diagnostics | 6.3 | | |

#### 5.3.11 Balance risks

- Large granary surpluses could make the colony immune to scarcity; mitigated by sprouting/rot, paste spoilage (half-life 3 GD) and milling labour.
- Milling labour is the hidden throttle; if majors are few, players see "full granary, starving larvae" — `diag-mb-milling` must lead the Why view.
- Patrol gating can stall foraging after a single spider attack; keep the 1 h hold short.

#### 5.3.12 Deliberately abstracted

| Abstraction | Why |
|---|---|
| Individual seeds are items only while carried or on the ground; in granaries they are aggregated cohorts | thousands of seeds per nest |
| Malting (germination freeing sugars) is represented only by sprouted seeds milling 3 × faster | contested biology [D] |
| Sun-drying of wet seeds is not modelled | no source for *M. barbarus*; other harvesters do it [D] |
| Mating-lineage rule is T3 (stretch) and mostly invisible | correct but harsh; visible only in founding outcome and the codex |

---

### 5.4 *Atta texana* — Texas leafcutter ant [T3]

#### 5.4.1 Castes

| Caste / size class | Length BU | Mass mg | m | HP | Bite dps | Crop | Carry | Upkeep rest / active | Cruise / sprint | Lifespan GD | Passage BU |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `minor` (minim) | 0.3 / 0.35 / 0.45 | 0.3 | 0.06 | 6.6 | 1.1 | 0.06 | 0.2 | 0.010 / 0.024 | 4.8 / 8 | 40, sd 12 | 0.16 |
| `media`, size class `small-media` (< 0.8 BU) | 0.6 / 0.7 / 0.8 | 1.7 | 0.34 | 15.6 | 2.6 | 0.34 | 0.5 | 0.036 / 0.089 | 6 / 10 | 40, sd 12 | 0.32 |
| `media` (≥ 0.8 BU) | 0.8 / 1.0 / 1.3 | 5 | 1.0 | 27 | 4.5 | 1.0 | 1.0 | 0.08 / 0.20 | 6 / 10 | 40, sd 12 | 0.45 |
| `major` | 1.6 / 1.8 / 1.9 | 30 | 6.0 | 66 | 21.9 | 2.5 | 3.0 | 0.31 / 0.77 | 5.4 / 9 | 50, sd 15 | 0.93 |
| `queen` | 2.4 / 2.6 / 2.7 | 300 | 60 | 208 | 20.8 | 3.0 | founding: pellet, eggs | 0.5 FL + 0.03 FL per egg | 2.4 / 4 | 10-15 game years [D] | 1.2 |
| `gyne` | 2.4 / 2.6 / 2.7 | 300 | 60 | 208 | 20.8 | 3.0 | 0 | 0.2 C (sap/nectar) or 0.2 FL | 6 / 9 | until flight or expiry (Ch 06) | 1.2 |
| `male` | 1.7 / 1.9 / 2.1 | 60 | 12 | 46 | 2.3 | 0.5 | 0 | 0.15 C | 6 / 9 | flight + 0.1 GD | 0.86 |

Masses [EST]/analog [D]. Worker lifespan 1-2 years [D]; refuse workers' remaining lifespan × 0.5 when they take the role [D]; `ageRateOutside` 3.0 (foragers live 7-14 GD [EST]); not dormant in winter; phorid flies are simulated on top (6.4.7). `loadSpeedMult` 0.65 (laden 20-32 mm/s [D analog]). Minims walk × 0.8.

Actions — minim: `move`, `grip`, `pick-up`, `put-down`, `drop`, `feed-larva` (staphylae only), `tend-fungus` (incl. plant pulp and collect staphylae), `groom`, `antennate`, `hitchhike`, `bite`, `release-alarm`, `stridulate`; small media: `dig-bite`, `pick-up`, `process-leaf` (new), `tend-fungus`, `cut-leaf` (small fragments), `lay-trail`, `harvest-liquid`, `drag`, plus the common set; media: `cut-leaf`, `harvest-liquid` (sap), `lay-trail`, `dig-bite`, `process-leaf`, `drag`, `stridulate`, common set; major: `dig-bite`, `bite`, `bite-hold`, `block-opening`, `drag` (debris clearing), `cut-leaf` (rare), `stridulate`. No `sting` (not used in defence [D]), no `spray-acid`. Larvae are never fed by trophallaxis [D].

#### 5.4.2 Life history

| Parameter | Value | Basis |
|---|---|---|
| `stageGd` (media) at 25 °C | 0.85 / 1.65 / 1.70 (sum 4.2; 20/40/40 split) | [EST] egg-to-adult 40-60 d |
| `devRate` | ≤15: 0; 20: 0.5; 25: 1.0; 28: 1.4; 30: 1.2; 32: 0 | [EST] |
| `devMult` | minim 0.83 (3.5 GD), small media 0.95, media 1.0, major 1.19 (5.0 GD), gyne 1.4, male 1.25 | [EST] |
| Larval cost (FL) | minim 0.17; small media 0.67; media 1.6; major 6.7 (2.3 mass rule); gyne and male per Ch 06 §11.2: 15 × and 3 × 1.6 = 24 and 4.8 FL (the mass rule would give 42 and 11.7; Ch 06's lower values are kept for flight sizes) | 2.3, Ch 06 |
| `larvaFood` | `staphylae` only (fed by minims and small media) | [D] |
| `Q_MAX`, `sizeBase`, `sizeK` | 120, 0.083, 500, i.e. `q(N)` = 10 + 110 (1 − e^(−N/500)); laying is paid in FL from the queen's fungus ration (Ch 02 `gut.P` is replaced by fungus for this species) | [EST] |
| `fSeason(D)` | spring 1.0; summer 0.8; autumn 0.9; winter 0.5 (linear ramps of 1 GD at the boundaries) | [EST] fungus not dormant in winter [D] |
| `fTempQ` | 0 at ≤ 18 °C, 1 at 22-30 °C, 0 at ≥ 33 °C | [EST] |
| `casteMixTarget` | N < 100: 50 % minim, 50 % small media; N 100-400: minim 35, small media 30, media 35; majors unlock at N ≥ 400 [D first majors at ~11 months in an analog]; maturity (N ≥ 1,000): minim 30, small media 25, media 37, major 8 | [EST] |
| Queens | 1 by default; co-founding T3 (stretch): a second foundress within 15 BU may join; both lay; *A. texana* workers do not kill co-foundresses [D] | |

#### 5.4.3 Founding variation (`opening`, mode `claustral-fungus`; model in Ch 06 §5.15)

| Parameter | Value |
|---|---|
| Natural window | after > 6.35 mm of rain on a clear moonless night, April-June [D]; Ch 06 start window `doy` 3-10, night (see risk R3) |
| Site | `sand` 1.0, `loam` 1.0; `humus` 0.5; `clay` 0.2; refused: non-diggable, soil moisture ≥ 0.8 (standing water) |
| Shaft / chamber | 25-35 BU shaft (Ch 06), target 35 [D 20-30 cm]; chamber 10 BU wide (slightly above the ~6 cm = 8.6 BU of the research so the founding garden has room for 2 GU: 6.4.1) |
| Fungus pellet (Ch 06 §5.15) | carried in the infrabuccal pocket, `pelletHealth` 1.0 decaying 0.05 per GD while chamber humidity < 0.6 or temperature outside 18-30 °C; planted with the founding action `plant` (hold 4 s); the planted pellet becomes a garden of `G` 0.3 GU (6.4.1); the queen fertilises it at `GARDEN_FERT_COST` 0.25 loads per GD from reserves; eggs are blocked until the garden is established; pellet death = founding failure, cause `garden-lost` |
| Reserves / clutch / first workers | Ch 06: `FOUND_R0` 48 loads; 40 viable-equivalent eggs, of which `ATTA_TROPHIC_FRACTION_FIRST` 0.7 are eaten by the queen or fed to the garden (design reduction of the sourced ~90 %, Ch 06 deviation D4); 8-14 minims |
| Timeline | first eclosion about 5 GD after founding; workers reopen the nest at 7-9 GD [D]; leaf foraging starts then |
| Possession during founding | the queen plants the pellet, tends the garden (`tend-fungus`), lays; the time-lapse automates tending |

#### 5.4.4 Scale, growth and alates

| Parameter | Value |
|---|---|
| `simCapWorkers` | 1,500 |
| `realEstimate` | (100, 100), (300, 3,000), (800, 100,000), (1,500, 2,000,000), interpolated in log space [D: up to 2 million] |
| Growth targets | y1 100-300; y2 400-800; y3 1,000-1,500 |
| Reproduction (Ch 06 §11.2) | `matureAgeYears` 3 [EST]; `alateLayWindow` doy 15-28, alate brood reared in the `central` fungus chamber through winter [D]; `REPRO_MAX_FRAC` 0.04; `REPRO_GYNE_SHARE` 0.25; flight window doy 3-10, launch 21:00-03:00, after ≥ 6.35 mm rain, `moonless`, regionally synchronised [D]. Research Apr-Jun is d 0.9-7.9 on the equinox calendar (risk R3) |
| Extra gate (this module) | total garden ≥ 300 GU at the start of the lay window (the Ch 06 stores gate reads garden yield cover for this species) |

#### 5.4.5 Diet

| Food kind | Pref | Route | Note |
|---|---|---|---|
| `leaf` | 1.0 | substrate | cut from plants rated acceptable (6.4.5) |
| `fruit` | 0.4 | substrate (quality 0.8) + crop-c (juice) | flowers and fruit ~4 % of effort [D] |
| `crumb` | 0.2 | substrate (cereal; quality 0.7, protein 0.10) | |
| `seed` | 0.1 | substrate (quality 0.5) | |
| `bait` | 0.8 | substrate (toxic, delayed; Ch 04 bait-station) | citrus-pulp baits are attractive |
| `nectar`, `sugar` | 0.3, 0.2 | crop-c | |
| `dew` | 0.3 | water | |
| `prey`, `carrion`, `pet-food`, `honeydew` | 0 | — | protein-rich substrate harms the fungus |
| Sap | — | crop-c | each completed `cut-leaf` drinks `sapPerCut` 0.3 C into the cutter's crop [D: sap supplies most adult energy] |

Adults' C comes from sap and liquids (colony C store); brood and queen eat only fungus.

#### 5.4.6 Nest template

| Element | Value |
|---|---|
| `nestMaterials` | sand 1.3, loam 1.0, humus 0.9, clay 0.4 |
| Tunnels / shafts | 2.5 BU / 3.0 BU (queen 2.6 BU long needs ≥ 1.2 BU passage) |
| Chambers | `fungus`: founding 10 BU; early 12-18 BU; mature 25-35 BU wide × 10-14 BU high; at 40-400 BU depth, deeper as the colony grows (cooler in summer); max 24; the deepest is flagged `central` (winter domicile, alate rearing) [D]. `midden` (detritus): 1 per 3 fungus chambers, ≥ 25 BU tunnel distance from any fungus chamber and below them; or an external refuse heap ≥ 40 BU from all entrances (toggle `externalHeap`, default off for *A. texana* [D: detritus cavities inside]) |
| Max depth | 450 BU (**Deviation:** real 4.6-7.6 m compressed ~2:1, dossier) |
| Footprint | 600-900 BU across at maturity (compressed ~3.5-4:1) |
| Entrances | 1 at founding; `min(40, 1 + floor(N / 40))`; each gets a `crater` mound |
| Vents | **T3 (stretch):** architect digs a vent shaft per 4 fungus chambers (6.4.7 air index) |
| Brood climate | brood lives inside the garden; fungus chamber optimum 21-25 °C, RH ≥ 0.8 |

#### 5.4.7 Activity, signals, combat

| Group | Values |
|---|---|
| Thermal (Ch 06) | shift +2; forageGate 7/20/25/28; stress 38; shadeSeek 36; chill 5; freeze −1 |
| Light preference (Ch 06) | night 1.0, dawn 0.7, morning 0.6, midday 0.5, afternoon 0.6, dusk 1.0; with the 28 °C gate this yields night-only foraging in summer and day foraging in cool seasons [D] |
| Weather | no foraging during rain or below the gate; overcast × 0.6 (Ch 06 `fW`) |
| Signals | trail half-life 3,600 s at 25 °C (very potent pheromone [D]); trunk trails on (unused half-life 5 GD; ghost after 10 GD; fade 10 GD; physical clearing 4 BU ribbon by majors); mass recruitment (from 20 workers; group 10-60); stridulation while cutting recruits within 6 BU (Ch 01) |
| Combat | `bite`, `bite-hold`; majors 21.9 dps (≈ 800 mN bites [D]); alarm mode `pheromone` (mandibular) radius 12 BU; guards: majors on trails and entrances; minims `hitchhike` against phorids |
| Winter (Ch 06 §6.1) | `active`: no time-lapse, winter is played; foraging on warm days through the normal gate; gardens follow 6.4 rules (cooler chambers grow slower); laying × 0.5 (`fSeason`) |

#### 5.4.8 Possession by caste

| Caste | What the player can do |
|---|---|
| Minim | Tend and weed the garden; collect staphylae and feed larvae; plant pulp; ride a leaf fragment and fend off a phorid fly (`hitchhike`, then `bite`); squeeze through gaps no other caste can pass |
| Small media | Clean and chew fragments into pulp (`process-leaf`); carry fungus pieces to re-seed a chamber; haul garden waste; cut small fragments near the nest |
| Media | Cut a leaf disc (timed `cut-leaf`, larger with longer cuts); drink sap at the cut; stridulate; carry the fragment home along the trail; lay trail |
| Major | Clear a twig from the trunk trail; block a tunnel or entrance; bite rivals; dig large shafts |
| Queen | Founding: dig, plant the pellet, tend, lay and eat eggs; established: lay; colony view with `leafSelectivity`, quarantine (`avoid` marker on a garden), waste-site choice |
| Gyne / male | Fly on the rainy-season night flight |

#### 5.4.9 Signature moments

1. The pellet: the queen spits a white crumb of fungus onto the floor of her cell; everything depends on it.
2. The queen's bargain: in the time-lapse she eats most of her first eggs to feed herself and the garden.
3. Green parasols: a line of leaf discs sways along a cleared road at night.
4. Hitchhiker: a minim rides a fragment; a phorid fly hovers and leaves.
5. The assembly line: a fragment is licked, cut, chewed and planted; the Why view highlights the narrowest stage.
6. The poisoned leaf: two days after harvesting a new shrub the garden yellows; the colony abandons that plant.
7. Weeding: gardeners carry grey patches of infected fungus to the detritus chamber.
8. The refuse workers: ants on waste duty never return to the gardens.
9. Defoliation: a shrub is stripped in one night and the foraging front moves outward.
10. The rain-night flight: after a heavy spring rain, giant winged queens leave every mound under a moonless sky.

#### 5.4.10 Diagnostics

| Id | Status rule | Factors | Remedies |
|---|---|---|---|
| `diag-at-chain` | warn if any stage of the processing chain runs > 30 % below the upstream stage for 0.5 GD; shows the narrowest stage | too few cutters (heat, phorids, distance); leaf cache spoiling (too few processors); too few planters; waste not removed | raise `cut` or `garden` sliders; move foraging closer; add waste haulers |
| `diag-at-garden` | per garden 6.4.11 | | |
| `diag-at-substrate` | warn if any plant was rejected in the last 3 GD | toxic or protein-rich leaves | raise `leafSelectivity`; `avoid` marker on the plant |
| `diag-at-phorid` | warn if phorid losses > 2 % of foragers per GD | daytime foraging; few hitchhikers | toggle `hitchhikerEscort`; forage at night |

#### 5.4.11 Balance risks

- The processing chain has many failure points; early on, players may starve the garden without understanding why. `diag-at-chain` must name one stage.
- Very fast mid-game growth (garden exponential) can hit the 1,500 cap within year 3 and flatten the late game; alates and territory must carry it.
- Escovopsis can feel random; outbreaks must be gradual, visible on inspection, and controllable by weeding coverage.
- 24 large fungus chambers are expensive to carve and render; chamber size cap 35 BU.

#### 5.4.12 Deliberately abstracted

| Abstraction | Why |
|---|---|
| CO2 is an "air" index from chamber volume and vents, not a gas simulation; T3 (stretch) | cheap and readable |
| Pseudonocardia and metapleural chemistry folded into tending coverage | invisible to the player |
| Garden is a per-chamber state with a visual volume, not voxels | performance |
| One cultivar; no cultivar genetics | not needed for play |
| Hyphae vs staphylae split collapsed into one food (FL) | one brood currency |

---

## 6. Economy modules

### 6.1 Honeydew ranching (`honeydew-ranching`) [T2 Lasius; T3 Camponotus variant]

Purpose: aphid herds on host plants are renewable carbohydrate sources that the colony must tend, protect and, for *Lasius*, move. **The herd entity is Ch 05 §1.4** (state `A`, `E`, `pool`, `tend`, host class and quality, `tenderColony`; production `pool += A × 0.10 × (0.5 + 0.5 tend) × fT`, pool cap `1 + 0.02 A` with overflow to a `honeydew-film`; `APHIDS_PER_TENDER` 50; growth by day-of-year phases with the midsummer crash, autumn decline and winter eggs; dispersal and migrants; `APHID_CARRY_LIFE_S` 300; culling; Camponotus `scale-herd`: 40-120 fixed insects at 0.06 C per insect per GD, no crash, cannot be moved). Predation is simulated by Ch 05 creatures; protection is ants actually fighting predators (Ch 05 combat). This module adds the ant side: the tender behaviour, honeydew relay, the relocation decision, the per-species variant, and two T3 (stretch) additions.

#### 6.1.1 Module state (per colony and per herd, additive)

`Colony.honeydew = { herdClaims: herdId[], yield7: TimeSeries }`; per herd: `relocations` (count), `shelterPellets` (T3 stretch), `kind` (`aphid` | `scale` | `root`).

#### 6.1.2 Module constants

| Name | Value | Unit | Basis |
|---|---|---|---|
| `RELAY_RADIUS_BU` | 3 | BU | tender passes a full crop to a nearby carrier |
| `RELAY_RECEIVER_MAX_CROP` | 0.5 | of crop cap | |
| `WAIT_PATROL_RADIUS_BU`, `WAIT_TIMEOUT_S` | 3, 300 | BU, s | tender patrols the stem while the pool refills (counts as present for Ch 05 `tend`) |
| `RELOCATE_TRIGGER` | `A ≥ 0.9 K_eff` or `hostQuality < 0.3` | | autonomous aphid relocation |
| `RELOCATE_RADIUS_BU` | 100 | BU | nearest unoccupied compatible host |
| `RELOCATORS_MAX` | 2 | ants per herd | |
| `NEW_HERD_MIN` | 3 | aphids | a relocated group survives if A ≥ 3 after 0.5 GD (else Ch 05 removes it) |
| `HERD_FORAGE_MARKER_MULT` | 2.0 | × | `forage` marker on a herd doubles its allocation weight; `avoid` sets it to 0 |
| `SHELTER_PELLETS` | 20 | soil pellets | T3 (stretch): soil pavilion over a stem herd; predator access × 0.5 (Ch 05 predators path around), pool not emptied by rain [MEM: widely reported, unsourced] |
| `ROOT_HERD_YIELD` | 0.5 | × Ch 05 production | T3 (stretch), Lasius only: small herds on roots that pass through nest chambers; no predators; active d 2-19 |

#### 6.1.3 Species variants

| | Lasius niger | Camponotus pennsylvanicus |
|---|---|---|
| Herds tended | `aphid-herd` (Ch 05), root herds (T3 stretch) | `aphid-herd` and `scale-herd` on trees |
| When | by day (`lightPref`) | at night (`lightPref`); a tree's herds are reached by trunk trails |
| Relocation | yes (`carry-aphid`) | no |
| Relay | any nestmate | prefers media and majors as receivers (largest crops) [D, low reliability] |
| Shelters | T3 (stretch) | no |

**Seasonal cycle as the colony experiences it** (aphid-herd phases from Ch 05 §1.4, by `doy`):

| `doy` | Herd (Ch 05) | What ranching means then |
|---|---|---|
| 1 | stem mothers hatch from overwintering eggs (≤ 8 aphids) | find and claim herds early; small yield |
| 1-7 | spring growth (r 0.9 /GD; tending raises growth × 1.3 and K × 1.25) | tending now multiplies the summer harvest |
| 8-10 | summer peak | main honeydew income; most tenders needed (1 per 50 aphids) |
| 11-14 | host decline, predators: midsummer crash | defend herds; relocate aphids from declining hosts (Lasius) |
| 15-17 | autumn return flight (r −0.2) | yield falls; foragers shift to other food |
| 18-21 | sexual forms, eggs (r −0.5) | herds wane; stores must be built before winter |
| 22-28 | dormant (eggs only) | no honeydew; root herds (T3 stretch) are the only source |
| scale herds | stable all season, no crash (doy 1-21) | Camponotus' dependable night income |

#### 6.1.4 Tender behaviour (task `tend`)

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `travel` | assigned to a herd by Ch 02 allocation | navigate along trail to the herd | arrived → `solicit` |
| `solicit` | at the herd | `tend-aphid` cycles (6 s per 0.15 load) while `pool` ≥ 0.15; counts toward Ch 05 `tend` and `tenderColony` | crop full → `full`; predator within 4 BU → `guard`; pool empty for 60 s → `wait` |
| `wait` | pool empty | patrol the stem within 3 BU (counts as present for Ch 05 `tend`) | pool ≥ 0.15 → `solicit`; 300 s → `return` |
| `guard` | predator near | `bite`/`spray-acid` (Lasius, Camponotus); `release-alarm` | predator gone → `solicit`; HP < 30 % → `flee` |
| `full` | crop full | if a nestmate with crop ≤ 0.5 is within 3 BU: `trophallaxis-give` (relay) and return to `solicit`; Camponotus prefers media/major receivers | no receiver → `return` |
| `return` | | breadcrumb home, lay trail scaled by herd yield, deliver to the social stomach | delivered → `travel` (same herd) or reallocation |
| `relocate` (Lasius) | `RELOCATE_TRIGGER`, or player action | `carry-aphid` to the nearest unoccupied compatible host within 100 BU; `put-down` on its stem | placed, or 300 s elapsed (aphid dies, Ch 05) |

At most 2 autonomous relocators per herd at once. Release while carrying an aphid follows Ch 01 resume rule 10.

#### 6.1.5 Failure modes

| Failure | Cause | Effect | Player-visible |
|---|---|---|---|
| Herd crash | predators not driven off; midsummer phase (Ch 05) | yield falls; herd may be lost | herd card trend arrow; `herd-lost` event |
| Host loss | mowing, sweeping, a plant dying | herd `lost` | alert with cause |
| Rival takeover | rival tender-seconds exceed ours (Ch 05 `tenderColony`) | claim switches; fights (Ch 05) | territory overlay |
| Rain | rain episode (Ch 05/06) | pool and film emptied | weather icon in factors |
| Overtending | `tend` already 1 | extra tenders idle at the herd (`wait`) | `diag-herds` factor "surplus tenders" |

#### 6.1.6 Diagnostics (`diag-herds`)

Status per colony: herds claimed, total aphids, honeydew yield per GD (7-day sparkline), mean Ch 05 `tend`. Limiting factors (weights from the shortfall each causes): "too few tenders" (1 − tend), "predators at N herds", "season decline", "rain losses", "host plants damaged", "rival claims". Remedies: raise `tend` slider; `forage` marker on a herd; possess a worker and chase the ladybird; move aphids to a fresh plant (Lasius); build a shelter (T3 stretch).

#### 6.1.7 The player's role

- As a worker: stroke aphids (`tend-aphid`), defend the stem, carry aphids to a new stem, relay honeydew to a carrier.
- As the queen: `tend` slider; `forage` marker on a herd raises its allocation weight × 2; `avoid` marker stops tending there.

---

### 6.2 Wood nesting (`wood-nesting`) [T3, Camponotus]

Purpose: wood is the nest substrate; its moisture decides whether eggs survive; the colony splits into a damp parent nest and dry, warm satellites; frass is the visible trace.

#### 6.2.1 Wood state (`WoodState`, one per wood primitive, up to 4 segments along its main axis)

| Field | Unit | Meaning |
|---|---|---|
| `primitiveId` | | world primitive (material `wood-sound`, `wood-decayed`, or `bark`-covered) |
| `placement` | id | `buried-log`, `log-on-soil`, `stump`, `standing-dead`, `living-tree-wound`, `firewood`, `fence-post`, `structural-dry`, `structural-leak`, `window-sill`, `door-frame-ext` (set by worldgen, Ch 04) |
| `segments[i].mc` | % | moisture content, 6-60 |
| `segments[i].decay` | 0..4 | 0 sound, 1 early, 2 moderate, 3 advanced (intact), 4 crumbling |
| `grainAxis` | unit vector | long axis of the primitive |
| `thicknessBu` | BU | smallest cross-section |
| `carvedFrac` | 0..1 | carved voxel volume / primitive volume |
| `sunExposure` | 0..1 | from world shade |
| `windowCount` | | windows opened into this primitive |

#### 6.2.2 Moisture and decay

| Name | Value | Unit | Basis |
|---|---|---|---|
| `MC_PLACE` | buried-log 32, log-on-soil 28 (bottom segment; upper −6), stump 28, standing-dead 20, living-tree-wound 25, firewood 16, fence-post 24 base / 14 top, structural-dry 10, structural-leak 30, window-sill 20, door-frame-ext 14 | % | [EST]; parent nests need > 15 % [D] |
| `MC_RATE` | 0.25 | /GD | relaxation toward `mcEq` |
| `mcEq` | `MC_PLACE + rain (outdoor exposed +8, sheltered +3 while raining or within 0.5 GD) − sunExposure × 4 (summer days) − 2 × max(0, windowCount − 2) (max −10) + 3 (winter, outdoor)` | % | windows ventilate |
| Leak events | Ch 04 may add/remove a leak: `structural-dry` ↔ `structural-leak` | | "repair" dries a building nest |
| `DECAY_GD_PER_CLASS` | 56 | GD | decay class +1 every 2 game years while `mc` ≥ 22 %; never below 18 % (ants do not cause decay [D]) |
| Class 4 | | | not nestable; chambers inside become `unstable` (6.2.5) |

#### 6.2.3 Carving, frass and windows

| Name | Value | Meaning |
|---|---|---|
| Wood bite factor (× Ch 01 `DIG_BITE_S`) | decay 0 & `mc` < 15: 4.0; decay 0 & `mc` ≥ 15: 2.5; decay 1: 2.0; decay 2: 1.2; decay 3: 1.0; decay 4: 0.8 | [D] worker-seconds per voxel 4.0 / 2.5 / 1.0 |
| `CROSS_GRAIN_MULT` | 1.8 | bites whose direction is > 45° from `grainAxis` |
| Caste factor | minor 1.6, nanitic 1.8, media 1.0, major 0.7 | majors excavate hard wood |
| Frass yield | 1 `frass` item per bite (bulk 0.3) | Ch 01 `dig-bite` |
| `MIN_WALL_BU` | 0.5 | carving never comes closer to the primitive surface except where a window is planned |
| `MAX_CARVED_FRAC` | 0.40 | architect stops; player bites beyond are refused with prompt "The wall is too thin" |
| Window | entrance kind `window`, 1.2 BU opening, cut where a gallery is within 1 BU of a side or underside surface | |
| `WINDOW_SPACING_BU` | 30 | every gallery voxel must be within 30 BU path distance of a window; else the architect plans a new one (max 6 per nest site) |
| `eject-frass` | Ch 01, 1.5 s | frass falls under gravity and joins the `frass-pile` below |
| Frass pile | dynamic pile primitive (Ch 03 mound API); `FRASS_PER_PILE_UNIT` 10 items; 1.5 BU³ per unit | also receives corpses and food remains (frass doubles as midden [D]) |
| `hideFrass` toggle | frass stored in an inside `midden` chamber (4 items per BU³ of chamber volume) instead of ejected | trades space for invisibility |
| `frassVisibility` | interior pile units × 1.0 + outdoor × 0.2 | read by Ch 04 human events (pest-control and bait likelihood indoors) and Ch 05 `bird` events (+0.02 chance per outdoor pile unit per GD, cap 0.3; woodpecker-like predation on nests [EST]) |

#### 6.2.4 Brood moisture rule (parent nest and founding cell)

For eggs and larvae with progress < 0.5 in a chamber whose segment has moisture `mc`:

`hazardPerGd = 0.4 × clamp((15 − mc) / 7, 0, 1) + (mc > 30 ? 0.01 × (mc − 30) : 0)`

so there is no loss at 15-30 %, 0.4 /GD at ≤ 8 %, and a mould penalty above 30 %. For late larvae (progress ≥ 0.5) and pupae: dev rate × `DRY_BONUS` 1.15 in chambers with `mc` 8-18 %; the mould term applies to them too. Basis: parent nests "need" > 15 % wood moisture and constant humidity for eggs and young larvae; satellites are drier and warmer, which speeds late development [D]; the numbers are [EST].

#### 6.2.5 Nest sites: parent and satellites

`NestSite { id, colony, role: 'parent' | 'satellite', woodIds[], chamberIds[], entranceIds[] (incl. windows), trailId, state, stateTick }`

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `candidate` | architect (or `satellite` marker) selects a wood primitive or a pre-existing wall void ≥ 8 BU (Ch 04 interior cavities) | none; shown as a proposal | approved (auto if `satelliteAuto`, or marker) → `founding` |
| `founding` | | 5 % of workers (min 4) migrate; dig plan (nursery + rest chambers, 1 window); trunk trail laid | first chamber registered → `active` |
| `active` | | receives late brood and callows; workers rest and forage from it | trail broken → `isolated`; wood decay 4 or destroyed → `abandoned` |
| `isolated` | no walkable trail path to the parent for 1 GD | no new brood delivered; scouts search for a reconnection | path restored → `active`; 7 GD isolated → keeps living, flagged "orphan satellite" |
| `abandoned` | unstable wood, destroyed, or player order | workers carry brood to the nearest site; then removed | — |

Architect satellite rule: propose when colony N ≥ 150 and (late-brood nursery capacity in the parent < 50 % of need, or parent `carvedFrac` ≥ 0.35), choosing the best candidate within `SATELLITE_MAX_ROUTE_BU` 600 BU by score `= 1.0 × [mc in 8-18] + 0.3 × warmthC/4 + 0.3 × shelter − route/600`. Max 4 outdoor + 2 interior satellites.

#### 6.2.6 Brood shuttling and drumming

- Every 0.25 GD, Ch 02's nurse allocation evaluates each late brood item in the parent: if a satellite nursery has free capacity and its late-brood score `devRate(T) × (mc in 8-18 ? 1.15 : 1) × (mc > 30 ? 0.8 : 1)` exceeds the parent's by ≥ 0.1, a `nurse`/`shuttle` job is created. Each shuttle trip carries one item along the trunk trail. Shuttling ignores `lightPref` but obeys `forageGate` and heat gates.
- Eggs and larvae with progress < 0.5 found outside the parent are carried back to the parent with priority.
- Callows that eclose in a satellite stay there; adult alates gather before their flight at the site whose window or entrance is nearest open sky.
- `drum` (new action, 1.0 s, cooldown 5 s): alarm recruitment through wood. All colony ants inside the same wood primitive within 30 BU (10 BU elsewhere) receive an alarm stimulus; Ch 05 combat handles response [D: drumming draws workers and raises aggression].

#### 6.2.7 Queen relocation and night trails

- If the parent's young-brood hazard averages > 0.1 /GD for 2 GD, or the parent wood reaches decay 4, or the parent is destroyed, the architect proposes `move-queen` to the satellite (or new wood) with `mc` 15-30 %. With auto-expansion on it executes after a 0.5 GD alert unless cancelled. The queen walks at night along the trunk trail escorted by 10 workers (`guard`), then eggs and young larvae follow.
- Trunk trails between nest sites and to tended trees use climb routes (trunks, wires, pipes, fences). **T3 (stretch):** a sudden light change within 40 BU (Ch 04 porch light) makes trail followers there U-turn with p 0.3 [D: light changes can confuse trail following].

#### 6.2.8 Structural timber and warm winters

- Interior wood (door frames, skirting, sills, wall-void studs) and wall voids are valid satellite sites; most are dry (`structural-dry` 10 %): good for satellites, lethal for a parent unless there is a leak.
- Interior chambers take `Tint` (Ch 06 §2.5, 20-23 °C). If the colony keeps ≥ 80 % of its brood in heated chambers (≥ 14 °C) over the 2 GD before winter, Ch 06's heated-nest rule makes it `winterActive` (no lapse): brood keeps developing, workers keep foraging indoors, and alates there make sporadic early flights to windows and die [D: heated buildings break diapause].

#### 6.2.9 Failure modes

| Failure | Cause | Effect | Recovery |
|---|---|---|---|
| Parent dries out | sun, many windows, leak repaired, structural-dry parent | egg and young-larva losses up to 0.4 /GD | move queen; fewer windows (`hideFrass` lowers window count) |
| Mould | `mc` > 30 % (buried log after weeks of rain) | brood hazard + 0.01 per % | move brood up the log or to a satellite |
| Satellite orphaned | trail cut by a moved object, rain, rival | late brood stalls in the parent | reconnect; possess a media and walk the route laying trail |
| Wood crumbles | decay 4 | chambers `unstable`: Ch 03 collapse rules apply after 2 GD | relocate |
| Discovery | interior frass | more human pest events | `hideFrass`, move the satellite |
| Single queen site | parent attacked | queen loss ends laying | satellites keep workers alive (orphaned colony, Ch 06) |

#### 6.2.10 Diagnostics (`diag-wood`)

Per nest site: role, state, `mc` of its brood chambers, decay, carved fraction, windows, frass visibility, brood by stage. Colony status: worst parent moisture (ok 15-30 %, warn 11-15 % or 30-35 %, bad < 11 % or > 35 %). Factors: "parent wood drying (sun / windows / season / leak repaired)", "mould", "late brood waiting for transport", "satellite isolated", "parent wood carved out". Remedies: as table 6.2.9.

#### 6.2.11 The player's role

Minor: read wall moisture (inspect card shows "damp 22 %"), chew, eject frass, nurse. Media: carry pupae to satellites by night, re-lay a broken trunk trail. Major: block windows, drum, chew sound wood. Queen: `satellite` marker on wood (new marker kind), `move-brood` and `move-queen` markers, toggles `satelliteAuto` and `hideFrass`.

---

### 6.3 Granary (`granary`) [T3, Messor]

Purpose: seeds are gathered selectively, stored in granaries where humidity can make them sprout or rot, and must be milled by large workers into paste before larvae can eat them; husks build middens that seed new plants.

#### 6.3.1 Seeds

| Class | Mass | Loads (C + P after milling, 6.3.6) | Who carries | Basis |
|---|---|---|---|---|
| dust (< 0.4 mg) | | 0.05 | ignored (p 0.05 if nothing else) | [D] rarely taken |
| `S` | 0.4-4 mg | 0.2 | minor, media | [D] |
| `M` | 4-20 mg | 1.0 | media; minor cannot | [D] preferred 4-50 mg |
| `L` | 20-100 mg | 2.5 | major alone, or ≥ 3 media by `drag` | [D] up to 96 mg seen |

Each seed item has `hardness` 0..1 (plant species, Ch 05), `elaiosome` flag, `buried` flag (seeds > 1.5 cm deep are not found [D]). Ch 05 provides seed patches on the ground and seed heads on plants.

#### 6.3.2 Collection and selection (task `forage`)

- Acceptance probability for a found seed: `p = clamp(sizeFit × hardFit / (1 + dist / 600 BU), 0, 1)`, with `sizeFit = loads / carryCap` (capped at 1), `hardFit = 1 − 0.5 × max(0, hardness − crackLimit)` (crackLimit minor 0.3, media 0.6, major 1.0), and `dist` = route distance from the entrance. Selectivity therefore rises with distance [D] and ants prefer seeds matching their size [D].
- `cut-seed-head` (new, majors and media ≥ 1.2 BU, 20 s): detaches 1-3 `M` seeds from a seed head on a plant stem (pre-dispersal harvest [D]); depletes the plant's seed heads.
- Returning foragers deposit seeds in the granary with the most free space whose humidity is lowest; non-food items picked up by mistake go to the entrance midden.
- **T3 (stretch):** seed depots. On trails longer than 400 BU, a laden forager whose speed multiplier falls below 0.5 (heat) drops its seed at the trail edge; others pick depots up later [D: depots on ~20 % of trails].

#### 6.3.3 Granary state (per `granary` chamber)

`GranaryState { chamberId, capacityLoads, humidity (0..1, from Ch 06/03 chamber climate), cohorts: SeedCohort[] }`; `SeedCohort { class, hardnessBand (0.0-0.3 / 0.3-0.6 / 0.6-1.0), degermed: boolean, loads, u (seed moisture 0..1), g (germination clock 0..1), wetGd (time with u > 0.75) }`. New seeds merge into the matching cohort with load-weighted averages of `u` and `g`. `capacityLoads = GRANARY_LOADS_PER_BU3 (2.0) × chamber open volume` (a 16 × 6 × 16 BU chamber holds about 1,600 loads).

#### 6.3.4 Seed cohort states

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `stored` | deposited | `u → humidity` at `SEED_U_RATE` 0.5 /GD; arriving seeds have `u` 0.3 (0.8 if carried in rain or from wet ground) | `u` > 0.55 → `damp` |
| `damp` | `u` > 0.55 | `dg/dt = (u − 0.55) / 0.25 × fT(T)` per GD (fT: 0 at ≤ 8 °C, 1 at 20 °C, 1.2 at 30 °C); degermed cohorts skip | `g` ≥ 0.5 → `germinating`; `u` ≤ 0.55 → `stored` (g kept) |
| `germinating` | `g` ≥ 0.5 | granary-care workers `gnaw-radicle` (5 s per load): load moves to a degermed cohort with `g` = 0 [D: radicle biting] | `g` ≥ 1 → `sprouted` |
| `sprouted` | `g` ≥ 1 | soft: any caste can mill at 0.3 × time, yield 0.9 paste per load; or gnawed back to degermed (5 s per load) | not processed within 1.5 GD → `rotten` |
| `rotting` (parallel) | `u` > 0.75 for ≥ 1 GD | 10 % of the cohort's loads per GD become `rotten` | `u` ≤ 0.75 |
| `rotten` | | `chaff`-like refuse items hauled to the midden | — |
| `milled` | 6.3.6 | removed from the cohort | — |

Granary care (task `store`, subtype `granary-care`): workers needed = `ceil(loadsGerminating × 5 s / 150 s)`; Ch 02 allocation fills it; directive `granaryHygiene` (0..1) multiplies its priority. Relocation: when a granary's humidity > 0.6 and a drier granary has space, care workers move seeds (1 load per trip). **Deviation:** no sun-drying of seeds (not documented for this species [D]).

#### 6.3.5 Granary count (architect)

`targetStock = GRANARY_TARGET_GD (25) × daily seed consumption`; the architect keeps `ceil(targetStock / 1,600)` granaries (min 1 from N ≥ 30), placed at 60-200 BU depth at the drainage optimum: it prefers chambers whose predicted humidity is ≤ 0.45 (sandy/loamy, above the soil-moisture layer of Ch 06 §3.9; deeper is cooler but damper).

#### 6.3.6 Milling into seed paste ("ant bread")

| Name | Value | Basis |
|---|---|---|
| `mill-seed` (Ch 01) | time per load `MILL_S` 12 × (1 + 4 × hardness) s for a major; media (≥ 1.2 BU, hardness ≤ 0.6 only) × 2; minors only sprouted seeds | [D] majors process seeds; rates not quantified |
| Output | 1 seed load → 0.8 `seed-paste` load + 0.2 load of `chaff` | |
| Paste nutrition | 0.65 C + 0.35 P per load | [EST] seeds are protein-poorer than prey |
| `PASTE_HALF_LIFE_GD` | 3 | paste spoils; milling must be continuous |
| `PASTE_TARGET_GD` | 2 | millers activate (task `mill`) when paste stock < 2 GD of demand |
| Where | `granary` chambers or `general` chambers adjacent to one | |
| Who eats | larvae (via `feed-larva`, 0.1 load per feeding), queen, adults (C upkeep may be paid from paste or the liquid C store) | |

#### 6.3.7 Animal protein bottleneck

Each larva must receive at least `animalProteinMinFrac` 0.10 of its P from animal sources (colony P store from `carrion`/`prey`). While a larva's running animal share is below 0.10, its growth rate is × 0.5. Protein items are 2-3 % of the foraged loads in nature [D].

#### 6.3.8 Middens and seedlings

- Each entrance has a chaff midden (dynamic pile 8-20 BU from the hole) receiving `chaff`, rotten seeds, corpses and refuse.
- 2 % of discarded seed loads are viable intact seeds. Each viable seed on a midden germinates with p 0.05 per GD after rain in spring or autumn, becoming a seedling; after 7 GD a seedling that was not trampled (not on a trunk trail ribbon) becomes a seed-bearing plant node (Ch 05) [D: midden seed banks and seedling richness increase].
- If a midden pile exceeds 2 BU height within 6 BU of its entrance, `haul` workers move material further out.

#### 6.3.9 Failure modes

| Failure | Cause | Effect | Recovery |
|---|---|---|---|
| Sprouting | damp granary, rain-wet seeds, no care workers | stock lost to sprouts or rot | care workers; drier granary higher up |
| Rot / mould | `u` > 0.75 for ≥ 1 GD (flooded or deep wet granary) | 10 %/GD loss | relocate seeds; dig a better granary |
| Paste bottleneck | few majors, millers diverted, hard seeds | full granary, starving larvae | `mill` slider, `casteEmphasis`, softer seeds |
| Protein bottleneck | no carrion | larvae grow at half rate | carrion marker |
| Heat starvation | heat wave + summer lull | intake near 0 for days | granary buffer; night foraging |
| Flood | rain into shallow granary (Ch 03) | `u` → 0.9 | flood-safe depth, raised crater |

#### 6.3.10 Diagnostics (`diag-granary`)

Status per granary: stock (loads, days of consumption), humidity, share damp / germinating / sprouted / rotting; colony: paste stock (days), milling throughput vs demand. Factors: "granary too damp", "seeds arriving wet", "too few care workers", "too few millers", "seeds too hard for media", "animal protein short". Remedies: as 6.3.9.

#### 6.3.11 The player's role

Minor: gnaw radicles; carry chaff. Media: carry and relocate seeds; clear trails; drag large seeds with others. Major: cut seed heads; mill. Queen: sliders `forage`, `mill`, `store` (granary care), `granaryHygiene`, `casteEmphasis`; `dig` marker with chamber type `granary`; `forage` markers on large-seeded patches; `entrance` marker to shorten a trunk trail.

---

### 6.4 Fungus garden (`fungus-garden`) [T3, Atta]

Purpose: leaves are not food but substrate; a processing chain turns them into garden; the garden's staphylae are the only food of brood and queen; hygiene keeps the parasite *Escovopsis* out.

#### 6.4.1 Garden state (`GardenState`, one per `fungus` chamber with a garden)

| Field | Unit | Meaning |
|---|---|---|
| `chamberId` | | |
| `G` | GU | garden mass; visual volume 15 mL per GU [EST] |
| `Gcap` | GU | `GARDEN_GU_PER_BU3` 0.004 × chamber open volume (30 × 12 × 30 BU ellipsoid ≈ 22.6 GU; founding 10 BU sphere ≈ 2.1 GU) |
| `h` | 0..1 | health |
| `i` | 0..1 | Escovopsis infection (0 = clean) |
| `c` | 0..1 | contamination from retained waste |
| `W` | loads | spent substrate waiting for removal |
| `subIn1Gd` | LU | substrate planted over the last 1 GD (rolling) |
| `subQ`, `subP`, `subT` | 0..1 | load-weighted quality, protein fraction, toxin of substrate in the last 1.5 GD |
| `subSources` | `{plantId, loads}[]` | ledger for learned rejection (last 2 GD) |
| `cache` | items | `leaf-fragment` items waiting in the chamber |
| `state` | 6.4.3 | |

#### 6.4.2 Garden dynamics (per GD, integrated every 25 ticks)

| Name | Value | Basis |
|---|---|---|
| `SUB_NEED_PER_GU` | 1.8 LU per GU per GD | [D] 30-40 LU per full chamber per GD |
| `fsub` | `subIn1Gd / (1.8 × G)` | |
| `GARDEN_R` | 0.17 /GD | [D] sustained doubling ~4 GD |
| `GARDEN_R_BURST` | 0.47 /GD while `fsub` ≥ 1.5 and `G` < 0.5 `Gcap` | [D] lab burst |
| Growth | `dG = G × r × min(fsub, 1) × fclim × h × (0.5 + 0.5 subQ) × ftend' × (1 − G/Gcap)`; `ftend' = 0.3 + 0.7 ftend` | |
| Starvation | if `fsub` < 0.45: `dG −= 0.15 × G × (0.45 − fsub) / 0.45` | maintenance unmet |
| Tending | `ftend = min(1, gardeners in chamber / (GARDENERS_PER_GU 1.0 × G))` (minims and small media on `garden`/`tend-fungus`) | [EST] |
| Yield | `YIELD_PER_GU` 0.5 FL per GU per GD × `h` × (fclim ≥ 0.5 ? 1 : fclim) | [EST] |
| Staphylae | collected by `tend-fungus` secondary (3 s → 1 `staphylae` item, 0.1 FL); unharvested yield is not stored (lost) | |
| Waste | `W += 0.5 × substrate planted` (spent after the ~3.2 GD turnover [D]; modelled as immediate); haulers remove 1 load per trip | |
| Contamination | if `W > 0.2 G`: `c += 0.05 × (W/G − 0.2)/0.2` per GD; if `W ≤ 0.1 G`: `c −= 0.1` per GD | |
| Climate `fT` | 1.0 at 21-25 °C; 0.5 at 18 and 28 °C; 0 at ≤ 15 or ≥ 30 °C; `h −= 0.15`/GD at ≥ 30 or ≤ 12 °C | [D] 21-25 °C chosen by ants |
| Climate `fRH` | 1.0 at RH ≥ 0.8; 0.6 at 0.6; 0.3 at ≤ 0.5 with `h −= 0.05`/GD | [EST] |
| Air (T3 stretch) | `air = Σ G (nest) / ventCapacity`; > 3 % equivalent → fclim × 0.7; > 5 % → `h −= 0.05`/GD; rain closing entrances raises it | [D] CO2 < 2.8 % healthy, ~5 % bad |
| `fclim` | `fT × fRH × fAir` | |
| Substrate quality | `h −= 0.3 × max(0, subP − 0.20) + 0.15 × subT` per GD | [D] protein > 20 % harms fungus |
| Health recovery | `h += 0.1`/GD when `i` = 0, `c` < 0.2, `fclim` ≥ 0.8, no toxin | |
| Relocation | if `fclim` < 0.5 for 0.5 GD and a better `fungus` chamber with space exists, gardeners carry `fungus-piece` items (0.5 GU each, 1 per 120 s per gardener); brood moves with the garden | [D] ants move fungus to 21-25 °C |
| Re-seeding | a `fungus-piece` put down in an empty `fungus` chamber starts a garden with `G` = 0.5, `h` = the source's `h`, `i` = the source's `i` | |

#### 6.4.3 Garden states

| State | Entry | Behaviour | Exit |
|---|---|---|---|
| `seeded` | pellet planted or piece placed | founding growth 0.28 /GD (queen) or normal rules | `G` ≥ 1 → `establishing` |
| `establishing` | | normal rules; yield 50 % | `G` ≥ 3 → `healthy` |
| `healthy` | `h` ≥ 0.6, `i` = 0 | full yield | `h` < 0.6 → `stressed`; `i` > 0 → `infected` |
| `stressed` | `h` < 0.6 | growth and yield scale with `h` | `h` ≥ 0.6 → `healthy`; `h` < 0.2 → `collapsing` |
| `infected` | outbreak or spread | 6.4.4 | `i` < 0.01 → `i` = 0 → previous state; `i` ≥ 0.8 → `dead` |
| `collapsing` | `h` < 0.2 | `G −= 0.3 G` per GD | `h` ≥ 0.3 → `stressed`; `G` < 0.1 or `h` ≤ 0.05 → `dead` |
| `dead` | | all mass becomes waste `W` to remove; chamber reusable after `W` = 0 | re-seeded → `seeded` |

#### 6.4.4 Escovopsis (garden parasite)

| Rule | Value | Basis |
|---|---|---|
| Outbreak hazard per garden per GD | `λ = 0.0015 × (1 + colonyAgeYears) × (1 + 4c) × (1 + 2 (1 − ftend)) × (RH > 0.95 ? 1.5 : 1) × difficulty.diseaseMult`; outbreak sets `i` = 0.05 | [D] 6.6 % of colonies at founding, ~60 % of 1-2 year colonies |
| Growth | `di/dt = ESC_R (1.0) × i (1 − i) − WEED_R (2.0) × weedCoverage × i` per GD | gardens collapse within weeks without weeding [D] |
| Weeding | gardeners in an infected chamber switch to weeding (`tend-fungus` on infected patches); `weedCoverage = min(1, weeders / (0.25 × G))`; each GD weeding removes `0.1 × i × G` of garden mass to `W` | |
| Thresholds | full coverage clears a fresh outbreak in ~1.5 GD; coverage 0.5 holds it; less lets it grow; unweeded 0.05 → 0.8 in ≈ 4.3 GD | arithmetic |
| Health | `h −= 0.4 × i` per GD | |
| Spread | each GD, each garden within 60 BU tunnel distance: p `0.15 × i` of seeding `i` = 0.05; waste carried through a garden chamber + 0.05 per trip; `fungus-piece` carries its source's `i` | |
| Quarantine | `avoid` marker on an infected chamber: no fungus pieces leave, waste is routed directly to a midden avoiding other gardens, spread p × 0.1 | |
| Detection | Why view shows `i` only when ≥ 0.15; a possessed gardener's inspect card shows it from 0.01 ("grey threads in the garden") | |
| Refuse workers | any ant that hauls garden waste becomes `refuse` (flag): never again assigned `garden` or `nurse`; remaining lifespan × 0.5; nestmates avoid contact with it in the nest (Ch 02 network) [D] | |

#### 6.4.5 Leaf selection and learned rejection

- Ch 05 gives each plant `leafQ` (0..1), `leafP` (protein fraction), `leafT` (toxin/defence 0..1), leaf mass and regrowth. Cutters accept a plant if `leafQ ≥ leafSelectivity` (directive, default 0.3) and it is not rejected.
- Every 0.25 GD each garden checks: if `h` fell ≥ 0.05 over the last 1.5 GD and a plant supplied ≥ 20 % of its substrate with `leafT` ≥ 0.3 or `leafP` ≥ 0.25, that plant is **rejected** colony-wide for 7 GD: trails to it decay × 4, cutters refuse it, event `plant-rejected` [D: workers stop collecting leaves that harm the fungus, lag via the fungus].
- Defoliated plants regrow per Ch 05; heavy use pushes the foraging front outward.

#### 6.4.6 The processing chain

| Stage | Task / subtype | Who | Action and time | Output | Failure if starved |
|---|---|---|---|---|---|
| 1 Cut | `cut` | media (small media: small fragments; majors 10 % of the time) | `cut-leaf` 8-15 s at 25 °C, × 3 at 15 °C, × 1.7 at 20 °C, × 0.9 at 30 °C; fragment loads = time/15 × `carryCap` (media 1 LU at 15 s) | `leaf-fragment`; cutter drinks 0.3 C sap | no input |
| 2 Carry | `cut` | cutter | walk at cruise × 0.65 laden; hitchhiker may board | fragment to a fungus chamber cache | loads lost to phorids/rain (rain: carriers drop fragments) |
| 3 Cache | — | — | fragments wait in the chamber | `cache` | quality × 0.5 after 1 GD; waste after 2 GD |
| 4 Process | `garden` / `process` | small media, media | `process-leaf` (new) 40 s per LU (clean, cut to 1-2 mm, chew) | `leaf-pulp` | cache spoils |
| 5 Plant | `garden` / `plant` | minim, small media | `tend-fungus` secondary "Plant pulp" 5 s per pulp load | substrate into `G` | pulp dries: lost after 0.5 GD |
| 6 Tend / weed | `garden` / `tend-fungus`, `weed` | minim, small media | `tend-fungus` 6 s cycles | `ftend`, weeding | growth × 0.3, infection risk |
| 7 Harvest / feed | `garden` / `tend-fungus`; `nurse` | minim | collect staphylae 3 s; `feed-larva` | larvae and queen fed | brood starves |
| 8 Waste | `haul` / `garden-waste` | small media, media (become refuse workers) | carry `garden-waste` (1 load per trip) to the `midden` chamber or heap | `W` down | contamination |

Bottleneck detection (`diag-at-chain`): per stage, throughput over 0.5 GD in LU-equivalents; the narrowest stage relative to demand (`1.8 × ΣG`) is named.

#### 6.4.7 Hitchhikers and phorids

Each laden fragment carried ≥ 100 BU: a minim at the cut site boards with p 0.5 (if `hitchhikerEscort` on: p 0.8 and minims are allocated to cut sites). Phorid attack (Ch 05 `phorid-fly`) chance per 100 s of laden surface exposure in daylight or dusk: `0.04 × phoridPressure × (hitchhiker ? 0.4 : 1)`; a parasitized forager dies 0.2 GD later [EST; hitchhikers reduce fly success, magnitude unverified [D]].

#### 6.4.8 Founding garden

During the opening (Ch 06 §5.15) the garden grows at `GARDEN_R` 0.17 /GD with the queen's fertilisation (`GARDEN_FERT_COST` 0.25 loads/GD from reserves) standing in for substrate (`fsub` treated as 1), `ftend` = 1 while the queen is in the chamber, and Ch 06's single founding outbreak roll (6.6 %) instead of the 6.4.4 hazard. After hand-over all 6.4 rules apply.

#### 6.4.9 When gardens die

| Situation | Rule |
|---|---|
| One garden dies | brood in it is carried to the nearest live garden (capacity permitting); larvae without staphylae for 0.5 GD start starving (Ch 02 hazard) |
| All gardens dead (`ΣG` = 0) | colony enters `garden-less`: alert "The garden is lost"; larvae hazard 1.0 /GD; queen lays 0 eggs and draws 0.1 loads/GD from a 3 GD reserve, then dies (cause `starvation`); adults survive on sap |
| Recovery | only from a living `fungus-piece`: carried from a surviving garden, or (T3 stretch) taken from a rival *Atta* colony's garden in a raid |
| No recovery | the colony declines as an orphan with no brood (Ch 06); the epitaph names the garden's death and its cause (infection, heat, starvation, poison) |

#### 6.4.10 Winter

*Atta* winters are played (Ch 06 winter mode `active`); there is no aggregate step for gardens. Cool deep chambers reduce `fT`, so gardens grow slowly; the colony must keep some leaf input on warm days or gardens shrink by the starvation rule.

#### 6.4.11 Diagnostics (`diag-garden`, per garden and colony total)

Status: ok if `healthy`; warn `stressed`/`infected` (i < 0.4)/establishing with `fsub` < 0.8; bad `collapsing`, `i` ≥ 0.4, or any garden died in the last 2 GD. Factors with weights: "substrate short" (1 − fsub), "chamber too hot/cold" (1 − fT), "too dry" (1 − fRH), "too few gardeners" (1 − ftend), "waste not removed" (c), "Escovopsis" (i, once visible), "toxic or protein-rich leaves" (substrate terms), "stale air" (T3 stretch). Remedies: raise `cut`/`garden`/`haul` sliders; dig a deeper (cooler) fungus chamber; quarantine with `avoid`; raise `leafSelectivity`; move gardens; dig vents (T3 stretch).

#### 6.4.12 The player's role

Media: cut and carry; choose fragment size (longer cut, bigger load, slower and more exposed). Small media: process leaves; carry fungus pieces to re-seed. Minim: tend, weed, feed larvae, hitchhike. Major: clear roads, guard. Queen: sliders `cut`, `garden`, `haul`, `nurse`; `leafSelectivity`; `hitchhikerEscort`; `externalHeap`; `avoid` on a garden (quarantine) or a plant; `dig` marker with chamber type `fungus` or `midden`.

---

## Appendix A — State required

### A.0 Identifier additions (all new; existing canonical ids unchanged)

| Kind | New ids |
|---|---|
| Economy modules | `honeydew-ranching`, `wood-nesting`, `granary`, `fungus-garden` |
| Founding modes | `claustral`, `claustral-wood`, `claustral-fungus` |
| Size classes | `nanitic` (flag on `worker`/`minor`), `small-media` (Atta `media` < 0.8 BU) |
| Seed classes | `S`, `M`, `L` |
| Action primitives (beyond Ch 01 §7 list) | `drum`, `cut-seed-head`, `process-leaf` (Atta pellet planting uses Ch 06's founding action `plant`) |
| Item kinds | `frass` (Ch 01 uses it), `chaff`, `seed`, `seed-paste`, `leaf-fragment`, `leaf-pulp`, `staphylae` (all named in Ch 01), `fungus-piece`, `garden-waste`, `aphid` (carried aphid) |
| Task subtypes | `tend`: `relay`, `relocate-aphid`; `nurse`: `shuttle`; `haul`: `frass`, `garden-waste`; `store`: `granary-care`; `garden`: `process`, `plant`, `tend-fungus`, `weed`; `guard`: `hitchhike` |
| Marker kind | `satellite` |
| Entrance kind | `window` (others are `main`) |
| Nest-site roles / states | `parent`, `satellite`; `candidate`, `founding`, `active`, `isolated`, `abandoned` |
| Wood placements | `buried-log`, `log-on-soil`, `stump`, `standing-dead`, `living-tree-wound`, `firewood`, `fence-post`, `structural-dry`, `structural-leak`, `window-sill`, `door-frame-ext` |
| Herd kinds (module tag) | `aphid`, `scale`, `root` (T3 stretch) |
| Seed cohort states | `stored`, `damp`, `germinating`, `sprouted`, `rotting`, `rotten`, `milled` |
| Garden states | `seeded`, `establishing`, `healthy`, `stressed`, `infected`, `collapsing`, `dead`; colony flag `garden-less` |
| Chamber flag | `central` (Atta), `unstable` (wood) |
| Ant flags | `NANITIC`, `REFUSE`, `HITCHHIKING` |
| Directive extras | `casteEmphasis`, `granaryHygiene`, `leafSelectivity`, `satelliteAuto`, `hideFrass`, `hitchhikerEscort`, `externalHeap` |
| Diagnostics | `diag-ln-protein`, `diag-ln-recruitment`, `diag-ln-nursery-warmth`, `diag-herds`, `diag-cp-parent-moisture`, `diag-cp-satellites`, `diag-cp-growth`, `diag-cp-frass`, `diag-wood`, `diag-mb-milling`, `diag-mb-animal-protein`, `diag-mb-heat`, `diag-mb-patrol`, `diag-granary`, `diag-at-chain`, `diag-at-garden`, `diag-at-substrate`, `diag-at-phorid`, `diag-garden` |
| Events | Appendix C |

### A.1 Static data (not in `SimState`)

| Name | Type sketch | Purpose |
|---|---|---|
| `SpeciesDef` | section 3 | everything species-specific |
| `getSpecies(id)` | `SpeciesId → SpeciesDef` | rivals of other species |
| `deriveAntStats(def, caste, lengthBu)` | pure function | 2.3 formulas, cached per ant at eclosion |

### A.2 Per ant (additive fields on Ch 02's `Ant`)

| Field | Type | Purpose |
|---|---|---|
| `lengthBu` | number (BU) | continuous size |
| `massMg` | number (mg) | derived |
| `sizeClass` | `'nanitic' \| 'small-media' \| null` | task propensity |
| `flags` bits | `NANITIC`, `REFUSE`, `HITCHHIKING` | |
| `acid` | number (charges) | formicines |
| `animalPShare` | number 0..1 (larvae only, on `Brood`) | Messor rule |
| `destinedLengthBu` | number (on `Brood`) | caste destiny |

### A.3 Per colony (module blocks on `Colony`, present only if the module is enabled)

| Block | Type sketch | Purpose |
|---|---|---|
| `honeydew` | `{ herdClaims: number[]; yield7: TimeSeries }` | herd ids claimed; history |
| `wood` | `{ sites: NestSite[]; frassVisibility: number; queenMove: {targetSiteId, dueTick} \| null }` | 6.2.5-6.2.7 |
| `granary` | `{ granaries: GranaryState[]; pasteLoads: number; pasteHalfLifeTicks: number; middens: {entranceId, pileId, viableSeeds}[]; seedlings: {pos, plantedTick}[] }` | 6.3 |
| `fungus` | `{ gardens: GardenState[]; rejected: {plantId, untilTick}[]; gardenLess: boolean; gardenLessTick: number }` | 6.4 |
| `lineage` (Messor, T3) | `{ own: 'A' \| 'B'; mates: ('A' \| 'B')[] }` on the queen | 5.3.3; founding state itself is Ch 06's `opening` |
| `casteEmphasis` etc. | numbers/booleans | directives |

### A.4 World state (in `worldDelta`)

| Name | Type sketch | Purpose |
|---|---|---|
| `wood` | `WoodState[]` keyed by primitive id | 6.2.1 |
| herd extensions | fields of 6.1.1 on Ch 05 herds | |
| piles | frass piles, chaff middens, waste heaps via Ch 03 pile primitives | |
| plant seed heads and leaf damage | Ch 05 plant state | |

All persisted values are plain numbers, arrays and records (seed rule); durations in ticks.

---

## Appendix B — Commands

| Command | Payload | Effect |
|---|---|---|
| `setDirectives` (Ch 02) | adds `casteEmphasis` (−1..1), `granaryHygiene` (0..1), `leafSelectivity` (0..1), `satelliteAuto`, `hideFrass`, `hitchhikerEscort`, `externalHeap` (booleans) | species-specific directives (only valid keys for the species are accepted; others rejected with a reason) |
| `placeMarker` (Ch 02) | kind `satellite` `{pos}` (Camponotus only) | proposes and approves a satellite at the wood under `pos`; refused if no wood within 4 BU or wood unsuitable (reason shown) |
| `placeMarker` `avoid` on a fungus chamber | | quarantine (6.4.4) |
| `placeMarker` `avoid` / `forage` on a herd or plant | | herd allocation × 0 / × 2; Atta plant rejection by the player |
| `designateChamber` (Ch 03) | types `granary`, `fungus`, `midden` | as normal; `fungus` requires the species module |
| `act` (Ch 01) | new ids `drum`, `cut-seed-head`, `process-leaf` | possession actions |
| Debug (`__game.cheat.*`, test builds) | `setWood(primId, {mc, decay})`, `setChamberClimate(chamberId, {T, rh})`, `spawnHerd(plantId, aphids, K)`, `setHerd(id, {aphids, K, phase})`, `addSeeds(granaryId, {class, hardness, loads, u, g})`, `setGarden(chamberId, {G, h, i, c, W})`, `supplySubstrate(chamberId, {lu per GD, q, p, t, plantId})`, `infectGarden(chamberId, i)`, `setColonyAge(years)`, `spawnBrood({stage, caste, chamberId, count})`, `freezeGrowth(herdId)` | scripted tests (Appendix E) |
| Debug queries (`__game.query.*`) | `species()`, `herds()`, `woodSites()`, `granaries()`, `gardens()`, `chain()`, `diagnostics(system)` | read-only JSON |

---

## Appendix C — Events

| Event | Payload | Consumers |
|---|---|---|
| `herd-claimed` / `herd-lost` | `herdId, colony, cause` | journal, alerts, audio |
| `honeydew-relay` | `fromAnt, toAnt, loads` | render cue, codex unlock |
| `aphid-moved` | `herdFrom, herdTo, ant` | journal (first), codex |
| `frass-ejected` | `siteId, pos` | particles, audio `sfx.frass-eject` |
| `frass-pile-grew` | `pileId, units` | render, human-event scheduler |
| `wood-moisture-alert` | `siteId, mc, status` | alerts |
| `satellite-state` | `siteId, state` | journal, map |
| `brood-shuttled` | `broodId, fromSite, toSite` | codex (first) |
| `queen-relocation` | `fromSite, toSite, phase: proposed\|started\|done\|cancelled` | alerts, journal |
| `drum` | `ant, pos, wood` | audio `sfx.drum`, combat |
| `granary-state` | `granaryId, damp, germinating, sprouted, rotting` | alerts on transitions |
| `seed-milled` | `ant, loads, pasteOut` | audio `sfx.mill-crunch` |
| `radicle-gnawed` | `ant, loads` | codex (first) |
| `midden-seedling` / `midden-plant` | `pos` | journal ("a plant has grown from the midden"), Ch 05 |
| `garden-state` | `chamberId, state, cause` | alerts, journal |
| `garden-infected` | `chamberId, visible: boolean` | alerts when visible |
| `all-gardens-lost` | `colony, cause` | major alert, epitaph |
| `plant-rejected` | `plantId, reason: toxin\|protein, untilTick` | journal, scent view |
| `leaf-cache-spoiled` | `chamberId, loads` | diagnostics |
| `hitchhiker-mounted` / `phorid-strike` | `ant, carrier` | codex, audio |
| `caste-unlocked` | `colony, caste` | journal milestone (Camponotus year-3 giants, Messor majors, Atta majors) |
| `cue` (generic) | `cueId` ∈ `cue.frass-fall`, `cue.drum`, `cue.stridulate`, `cue.leaf-sway`, `cue.mill`, `cue.garden-tend` | render/audio |

---

## Appendix D — Diagnostics (published to the Why view)

| Id | System | Status | Limiting factors (weighted) | Remedies |
|---|---|---|---|---|
| `diag-herds` | honeydew | ok / warn (yield falling 3 GD) / bad (all herds lost in season) | tenders short; predators; season; rain; host damage; rival claims | `tend` slider; marker; chase predator; move aphids |
| `diag-ln-protein` | Lasius | 5.1.10 | | |
| `diag-ln-recruitment` | Lasius | info | | |
| `diag-ln-nursery-warmth` | Lasius | warn | | |
| `diag-cp-parent-moisture` | wood | ok 15-30 %, warn, bad < 11 % | drying causes; mould | fewer windows; move queen |
| `diag-cp-satellites` | wood | info / warn | none; isolated; shuttle short | marker; nurses; trail |
| `diag-cp-growth` | Camponotus | info | age-locked castes | — |
| `diag-cp-frass` | wood | warn | interior windows | `hideFrass` |
| `diag-wood` | wood | per site | 6.2.10 | |
| `diag-granary` | granary | ok / warn (damp > 20 % of stock) / bad (rotting) | humidity; wet arrivals; care short | care, relocate, dig higher |
| `diag-mb-milling` | granary | warn | majors; allocation; hardness | `mill`, `casteEmphasis` |
| `diag-mb-animal-protein` | granary | warn | no carrion | marker |
| `diag-mb-heat` | Messor | info | heat; lull | night foraging |
| `diag-mb-patrol` | Messor | warn | patrol losses | guard |
| `diag-at-chain` | fungus | warn / bad | narrowest stage | sliders |
| `diag-garden` | fungus | 6.4.11 | 6.4.11 | 6.4.11 |
| `diag-at-substrate` | fungus | warn | toxic leaves | `leafSelectivity`, avoid |
| `diag-at-phorid` | fungus | warn | daytime work; hitchhikers | escort; night |

Each diagnostic follows the contract `Diagnostic { id, system, status, label, value, factors[{cause, weight, detail}], remedies[], sinceTick }`; weights sum to 1 over listed factors; alerts fire on status change (Ch 02).

---

## Appendix E — Acceptance checks (debug API, `?test=1`)

1. **Given** the species loader, **when** all four `SpeciesDef`s are validated, **then** all pass rules 3.16.1-7, the Lasius worker mean length is 1.0 BU = 4.0 mm, the Atta minim mean is 0.35 BU, and `available` is true only for `lasius-niger` in a T1 build.
2. **Given** a fed Lasius worker egg held at 21 °C (`setChamberClimate`), **when** time advances, **then** it ecloses as an adult after 3.9 ± 0.05 GD (23,400 ± 300 ticks); at 25 °C after 2.87 ± 0.05 GD.
3. **Given** Lasius brood at 10 °C, **when** 2 GD pass, **then** no brood item's progress changes.
4. **Given** a Lasius colony of 300 workers at d 8.0 with ample P and a royal chamber at 22 °C, **when** 1 GD passes, **then** the queen lays 74 ± 1 eggs; **given** d 22.0, **then** 0 eggs.
5. **Given** a Messor colony with N = 39 and a P store covering 5 GD of larval demand, **when** 100 larvae start, **then** none is destined `major`; with N = 40, **then** majors appear among new larvae; with N = 300 and P cover only 1 GD, **then** none is destined `major` (`MAJOR_GATE_GD` 2).
6. **Given** a Lasius tender with a full crop at a herd and a nestmate forager with crop 0.2 load within 3 BU, **when** 10 s pass, **then** a `trophallaxis-give` from tender to forager occurred, event `honeydew-relay` fired, and the tender is still at the herd (state `solicit` or `wait`).
7. **Given** a Lasius herd held at `A ≥ 0.9 K_eff` with tenders present and two unoccupied compatible hosts at 60 BU and 150 BU, **when** 0.5 GD passes, **then** at no tick are more than 2 ants in state `relocate` for that herd, and every `aphid-moved` event targets the 60 BU host.
8. **Given** a Camponotus colony with a claimed `scale-herd` on a tree at air 20 °C, **when** tenders present are counted at 12:00 and at 22:00 on the same day, **then** the 22:00 count is at least 3 × the 12:00 count (`lightPref` 1.0 vs 0.2).
9. **Given** an `avoid` marker on a herd, **when** 0.5 GD passes, **then** no ant of the colony has been in task `tend` for that herd.
10. **Given** a Camponotus parent nursery with `mc` 10 % holding 100 eggs at 24 °C, **when** 1 GD passes, **then** 75 ± 10 survive (hazard 0.286 /GD); with `mc` 20 %, 100 ± 0 survive the moisture rule.
11. **Given** a Camponotus media biting decay-2 wood along the grain, **when** it completes one bite, **then** the bite took 1.2 × `DIG_BITE_S` and yielded exactly 1 `frass`; across the grain 2.16 × `DIG_BITE_S`; a minor along the grain 1.92 ×.
12. **Given** 10 `frass` items ejected from one window, **when** they land, **then** the frass pile under that window has 1 pile unit and `frassVisibility` rises by 1.0 if the pile is in the interior zone (0.2 outdoors).
13. **Given** a Camponotus parent with 20 pupae (nursery 22 °C, `mc` 22 %), a connected satellite 200 BU away with nursery 26 °C, `mc` 12 % and free capacity, and 4 nurses on `shuttle`, **when** 1 GD passes at air 20 °C, **then** ≥ 15 pupae are in the satellite and 0 eggs have left the parent.
14. **Given** a Camponotus colony aged 1.5 years with N = 100, **when** 100 larvae start, **then** none is destined `media` or `major`; at age 2.0 years and N ≥ 60, media and majors appear among new larvae.
15. **Given** a Messor granary with humidity 0.9 at 20 °C holding 100 `M` loads with `u` 0.9, `g` 0, and no care workers, **when** 0.8 GD passes, **then** ≥ 95 loads have reached `sprouted` or `rotten`; **given** 4 care workers assigned, **then** 0 loads are sprouted after 0.8 GD.
16. **Given** a Messor granary with humidity 0.3 holding 100 loads with milling disabled, **when** 10 GD pass, **then** 0 loads are damp, sprouted or rotten.
17. **Given** a Messor major milling 10 loads of hardness 0.5, **when** it finishes, **then** it took 360 ± 4 s and produced 8.0 paste loads and 2.0 loads of `chaff`; a possessed minor facing an unsprouted seed has no `mill-seed` prompt.
18. **Given** 100 paste loads unconsumed, **when** 3 GD pass, **then** 50 ± 1 remain.
19. **Given** a Messor larva fed only paste (animal share 0), **when** compared with a larva receiving ≥ 10 % animal P at the same temperature, **then** its larval stage lasts 2.0 ± 0.1 × as long.
20. **Given** a Messor colony whose every trail cell is at `Tmicro` 44 °C, **then** no forager leaves the nest (Ch 06 heat stress 1.0); at 30 °C the maximum trip distance is 100 % of base; at 39 °C 30 %.
21. **Given** an Atta garden with G = 2.0 GU in a 30 × 12 × 30 BU chamber (Gcap 22.6), substrate supplied at 1.8 LU per GU per GD with quality `q` 1, protein 0.1, toxin 0, 23 °C, RH 0.9, `h` 1, full tending, no infection, **when** 1 GD passes, **then** G = 2.33 ± 0.05.
22. **Given** the same garden at 31 °C, **when** 1 GD passes, **then** G has not grown and `h` = 0.85 ± 0.01.
23. **Given** an Atta garden with `i` = 0.05 and no gardeners (weedCoverage 0), **when** time passes, **then** it dies at 4.3 ± 0.3 GD; **given** weedCoverage 1, **then** `i` < 0.01 (cleared to 0) within 2.0 GD.
24. **Given** an Atta colony whose gardens are all set dead, **when** 1 GD passes, **then** event `all-gardens-lost` fired, ≥ 50 % of larvae are dead (hazard 1.0 /GD gives 63 %) and the queen laid 0 eggs; after 3 further GD the queen is dead (cause `starvation`).
25. **Given** a plant supplying 50 % of an Atta garden's substrate with `leafT` 0.6 (the rest clean), **then** `plant-rejected` fires for that plant between 1.0 and 1.5 GD after supply starts (health falls 0.045 /GD; the 0.05 drop is reached at 1.11 GD and detected at the next 0.25 GD check).

---

## Appendix F — Cross-chapter assumptions

1. **Ch 06 (calendar):** `d = 0` is 20 March (adopted). Ch 06's start windows for Messor (doy 15-19) and Atta (doy 3-10) appear to use the dossiers' 1-March day numbers; on the equinox calendar the research windows are Messor d 12.7-19.6 and Atta d 0.9-7.9 (see risk R3). This chapter repeats Ch 06's windows in the species data and flags the shift as risk R3.
2. **Ch 06 (thermal, light, climate):** owns `SpeciesDef.thermal`, `lightPref` and `ClimateDef`; the values repeated here are copied from Ch 06 §1.5, §2.1, §2.6 and must stay identical.
3. **Ch 06 (opening, overwinter, reproduction):** owns the founding model, reserve drains, clutch caps, the Atta pellet rules, winter modes and the aggregate winter model, the reproduction gate, alate costs, windows and flight rolls; the species values in this chapter repeat Ch 06 §5.5, §5.15, §6.1-6.3 and §11.2 and must stay identical (except where risks R3-R5 propose corrections). Ch 06's `W_eq` thresholds use `realEstimate` as gates only; no flow is multiplied by `w`.
4. **Ch 02 (colony):** implements brood development with the `devRate` tables, feeding, starvation and cannibalism; task allocation with `taskWeights`, subtypes and sliders from `directiveTasks`; caste destiny (2.6); collective nutrition using `pTargetFrac`; the egg-laying accumulator; the Gordon-style interaction-rate activation with the Messor patrol gate and summer-lull floor; refuse-worker network exclusion; per-species `ageRateOutside` / `ageRateDormant`; worker and nanitic brood and lifespan values for Lasius (Ch 02 §1-3 are authoritative; this chapter repeats them).
5. **Ch 01 (actions):** its action primitive list is the source of truth; this chapter adds `drum`, `cut-seed-head`, `process-leaf`, overrides `carryCap` defaults (CP minor 0.5 instead of 0.8), sets `MILL_S` semantics (12 × (1 + 4 × hardness) s per load) and lets media mill and gnaw radicles in addition to the castes Ch 01 lists.
6. **Ch 03 (nest):** provides material dig factors for soil (this chapter supplies wood factors), a pile/mound primitive API for frass piles, chaff middens and waste heaps, chamber climate (temperature from Ch 06, humidity from soil moisture), an entrance `kind` field (`window`), chamber flags (`central`, `unstable`), collapse rules for unstable wood, and architect hooks to accept per-species templates and module proposals (satellites, granaries, fungus/midden chambers, windows).
7. **Ch 04 (world):** worldgen tags wood primitives with `placement`, `grainAxis`, `thicknessBu`; places pre-existing interior wall voids; places seed-bearing plants and acceptable leaf plants for Messor and Atta near valid nest sites; validation guarantees at least one valid founding site per species; human events may add/repair leaks, switch porch lights, place bait stations, and read `frassVisibility`.
8. **Ch 05 (ecology, creatures, combat):** owns herd entities (§1.4 production, growth, phases, tending ratio, pool and film, carry life, scale herds) and aphid predators, plant leaf quality/protein/toxin, seed patches and seed heads, `phorid-fly` and `ant-spider` behaviour, `bird` events, bite/sting/spray damage, alarm responses (including drumming and stridulation stimuli), and the rival *Atta* colony (if any) whose garden can be raided.
9. **Performance / Ch 08:** `popCapScale` may lower `simCapWorkers`; render supports continuous ant sizes, macrocephalic heads, Atta spines, leaf-fragment and hitchhiker attachments, frass/chaff particles; Ch 08 shows species cards from `available`, `complexity`, `playstyleLine`, `foundingSeason`.
10. **Difficulty (Ch 06):** supplies `diseaseMult` (Escovopsis), reserve scaling, `flightLossMult` and the queen-senescence toggle used here.
11. **Ch 05 species scaling:** Ch 05's `loadScale` turns reference-species food nodes into the same number of species loads per node; this matches 2.2 (sim-native, species-relative loads).

### F.1 Open risks for the consistency pass

| Id | Risk | Proposal |
|---|---|---|
| R1 | The dossiers scale flows by `w`; this chapter (2.2) keeps flows sim-native and uses `w` for display and gates only. If Ch 02 or Ch 06 multiply any flow by `w`, numbers diverge. | Confirm sim-native everywhere; `W_eq` only for thresholds and display. |
| R2 | Several species values are copies of Ch 02 (Lasius brood, lifespans, laying), Ch 05 (herds) and Ch 06 (thermal, opening, winter, reproduction). Copies drift. | Species data files import those constants by name instead of re-typing them. |
| R3 | Ch 06 start and flight windows for Messor (`doy` 15-20) and Atta (`doy` 3-10) look like the dossiers' 1-March numbering. On Ch 06's own equinox calendar the research months are Messor Sep-Nov = `doy` 13-20 and Atta Apr-Jun = `doy` 1-8. | Shift both windows by about −1.5 GD, or accept as a stylisation and note it in the codex. |
| R4 | Ch 06 §11.2 Camponotus sexual cost 28 / 4.6 × 1.6 loads treats the dossier's minor-relative nitrogen units as media-relative; the gyne would cost about 3.5 × too much. | Use 8.0 / 1.3 × the media larval cost (5.2.4). |
| R5 | Lasius sexual larval cost differs between Ch 02 (gyne × 6 = 7.2 P + 2.4 C) and Ch 06 (gyne 12 × 1.6 = 14.4 P + 4.8 C). | This chapter follows Ch 06 (consistent with the mass rule of 2.3). |
| R6 | Three T3 economy modules are each large (wood, granary, fungus); together with polymorphism they are the riskiest T3 work. | Build order: granary (fewest new systems), then wood, then fungus; T3 (stretch) items may be cut. |
| R7 | Many species numbers are estimates (Messor development times, Atta load sizes and garden yields, Camponotus lifespans and caste masses). | Treat all [EST] values as balance placeholders for the headless growth-target runs (3.5 `growthTargets`). |

