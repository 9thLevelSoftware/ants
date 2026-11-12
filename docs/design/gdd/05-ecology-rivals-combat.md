# GDD 05 — Ecology, creatures, rival colonies and combat

Status: design chapter, binding for `src/sim/ecology/**`, `src/sim/rivals/**`, `src/sim/combat/**`, the ecology part of `src/worldgen/**` (resources, creature territories, rival sites) and the creature part of `src/render/creatures/**`.
Depends on: `01-design-seed.md` (0, 3, 5), `02-design-directions.md` (F, J, K), `03-architecture.md`, GDD 01 (action primitives 7.3, possession 3), GDD 06 (calendar, temperature, weather, dew, puddles, difficulty), GDD 08 (alerts 6.5, comfort 13, custom rules).
Research: `research/ecology-habitats.md` (final, verified), `research/bio-lasius-niger.md` (final, verified), enemy and defence sections of `bio-camponotus.md`, `bio-messor.md`, `bio-atta.md` (verified), `genre-ux.md` (2.3, 2.7).

---

## 0. Conventions and scope

| Term | Meaning |
|---|---|
| **L** | Body length of the acting ant in BU (GDD 01). Ant-centric distances (reach, spray, alarm) are in L or BU. |
| **mm** | Creature sizes, strike ranges and creature senses are absolute (a 6 mm spider is 6 mm for every species). "(1.5 BU)" after a mm value gives the *Lasius* equivalent (BU = 4 mm). |
| **s / h / gd** | game seconds (fast clock) / clock hours (1 h = 25 s) / game days (1 gd = 600 s = 24 h). Slow-clock rates are "per gd". |
| **load, C, P** | Directions J. Food amounts in this chapter are **reference loads** = *Lasius niger* loads. Bulk 1.0 = what one standard *Lasius* worker carries solo (`carryCap` 1.0, GDD 01) = 2 mg of item (`REF_CARRY_MG = 2.0`). |
| **health** | Every ant and creature stores `hp` and `maxHp` in damage points (contracts guidance); `health` in this chapter means the fraction `hp / maxHp` (0..1; GDD 06 applies environment damage as fractions of `maxHp`). Combat: `hp -= dmg`. |
| **plot** | 100 × 100 BU of map (10^4 BU²); a standard 4000 BU map has 1600 plots. Placement densities are per plot so entity counts do not depend on species. |
| **RNG** | Streams `rng.ecology`, `rng.creatures`, `rng.rivals`, `rng.combat` (sub-streams of the state RNG, as GDD 06). |

Tier map: T1 = the static food needed by the T1 colony loop (flowers, crumbs, sugar, insect carcasses, solo carry and solo drag; cooperative drag is T2 as in GDD 01 and GDD 02 §11, consistency pass). **T1 protein (consistency pass, economy budget in `00-index.md` §C):** because live prey patches are T2, T1 drops `insect-small` and `insect-medium` carcasses at `T1_CARRION_MULT` = 4 × the base rates of 1.3 and places `crumb-protein` clusters (0.2 C / 0.6 P per crumb) with the T1 crumb rule (cap 60 clusters, 30 % of consumed clusters re-placed daily at 12:00), so that a T1 Lasius colony can grow past about 300 workers. **T1 honeydew (traceability G10):** aphid herds, tending and herd predators are T2 (§1.4); T1 instead places `T1_HONEYDEW_SITES` = 1 per 250 plots (6 on a Standard map, at least 2 within 600 BU of the start) static `honeydew-film` sites under host stems carrying the `aphid` host flag (GDD 04 §8), each drawn with a still, non-simulated aphid cluster decal. A static site has pool cap 0.5 load and refills at 1.0 C load per gd, has no herd entity, no decay and (T1 having no weather) no rain emptying; it adds at most about 6 C/gd map-wide, within the T1 carbohydrate band of `00-index.md` §C13. Its first delivery counts for `ms-first-honeydew` / `cx-honeydew` (GDD 06 §8, §10). At T2 the static sites are not placed; herd-fed films replace them. Everything else here is T2 (food ecology, creatures, rivals, combat, brood raids) unless tagged T3 (other species' rosters and specials, scale insects, phorid flies, myrmecophile rove beetles).

Update cadence: ecology hourly systems run every `ECO_HOURLY_EVERY = 250` ticks, staggered per entity; creature AI every tick for active creatures; rivals' abstract model every 250 ticks; combat every tick.

**Species scaling (T3).** For a player species s with `loadScale[s] = carryCapMg(standard worker of s) / REF_CARRY_MG` (Camponotus 7, Messor 7, Atta 5), species loads = reference loads / loadScale and bulk = item mg / carryCapMg. The species' ecology profile multiplies **units per node** by loadScale (a node becomes a patch of several carcasses, a larger herd) so that a node holds the same number of species loads; densities per plot are unchanged.

---

## 1. Food sources

### 1.1 Model

A **food source node** is a persistent entity on a surface: `{id, kind, variant, pos, up, units, unitBulk, c, p, toxin, water per unit, quality, hardness, slots, stage, discoveredBy}`. A node either yields **liquid** (drunk with `harvest-liquid`, `tend-aphid`), **pieces** (`harvest-solid` / tear) or **whole units** (picked up or dragged). Whole units removed from a node become **items** (`food-piece`, `carcass`, `seed`, `live-aphid`, `corpse`). An item keeps its nutrients; nutrients are never created except by sources defined here (invariant I1).

- `quality` 0..1.3 is the attractiveness used by recruitment (foraging chapter scales trail strength by it).
- `hardness` multiplies `TEAR_S` (4.0 s, GDD 01). A torn piece has bulk = the tearer's `carryCap` and nutrients = piece bulk × node nutrient per bulk.
- `slots` limits simultaneous feeders/tearers; extra ants queue within 2 L (crowding is the foraging chapter's negative feedback).
- Discovery: an ant perceives a node when within its **odour radius** (table) or, for the possessed ant, when visible on screen; first perception by a colony sets `discoveredBy[colony]` and emits `food-source-discovered`.
- `drinkRateMult` (default 1) multiplies the `harvest-liquid` rate (0.05 load/s).

### 1.2 Catalogue (reference loads; "unit" = one droplet, piece, granule or whole item)

| Kind / variant | Tier | Where (zones) | Unit: size, mass, bulk; one-ant carry? | C / P per unit | Total per node | Harvest action and time | Renewal / decay | Season (gd) | Odour radius | Quality | Competition / guarding |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `honeydew` / `aphid-herd` | T2 | `garden-bed`, `lawn`, `forest`, verge plants in `pavement`/`sand` | droplet 0.15 load, liquid | 1.0 C + 0.02 P per load | pool cap `1 + 0.02 A` loads (A = aphids) | `tend-aphid`: 3 s stroke + 3 s drink per droplet (≈ 40 s per crop) | produced continuously (1.4) | 1-21 (cycle 1.4) | herd 6 BU; honeydew film 12 BU | 1.0 | tenders guard; rival tenders; ladybirds, lacewing larvae |
| `honeydew` / `honeydew-film` | T2 (T1: static sites, §0) | ground/leaf under each herd, radius 6 BU | liquid | 1.0 C per load | ≤ 0.5 load | drink, `drinkRateMult` 0.25 | receives herd overflow; half-life 0.3 gd; any rain empties it | with herd | 12 BU | 0.6 | first-come |
| `honeydew` / `scale-herd` | T3 | bark of trees, houseplants | droplet 0.15 load | 1.0 C + 0.02 P | pool cap 2 | as aphid herd | 40-120 insects, fixed; 0.06 C/insect/gd; cannot be moved | 1-21, no crash | 6 BU | 0.9 | as aphid herd |
| `nectar` / `flower` | T1 static, T2 dynamic | `lawn` (clover, dandelion), `garden-bed`, `forest` edge | liquid | 1.0 C | pool cap 1.5 | drink, 2 slots | refill 4 C/gd in daylight (SR..SS); T2: flying-insect drain 15 %/h when air ≥ 15 °C and not raining | open 3-18, peak 5-14 (T1: always) | 10 BU | 0.8 | bees/hoverflies (abstract drain); dawn visits pay best |
| `nectar` / `extrafloral-nectary` | T2 | `garden-bed` (bean, peony, cherry), `forest` (cherry saplings, bracken) | liquid | 1.0 C | pool cap 0.8 per plant | drink, 2 slots per petiole (2-4 petioles) | refill 6 C/gd; ×0.3 from day 10 | full 1-9, reduced 10-20 | 6 BU | 0.9 | ants act as plant bodyguards (codex) |
| `fruit` / `berry` | T2 | `forest`, `garden-bed` | 8 mm; juice only | 1.0 C per load | 3 C | drink, 3 slots | rots in 2 gd, then removed | 9-14 | 20 BU | 0.7 | fruit flies |
| `fruit` / `windfall` | T2 | under fruit trees in `garden-bed`/`lawn` | 30-80 mm; juice + pulp (tear, hardness 0.5) | juice 1.0 C/load; pulp 0.6 C + 0.01 P per bulk | plum 20 C, apple 60 C (+0.5 P) | drink at bruises (slots: stage 1: 2, stage 2: 6, stage 3: 12); tear pulp | stage 1 bruised 0-1.5 gd (juice flow 4 C/gd), stage 2 rotting 1.5-4 gd (12 C/gd, quality 0.6), stage 3 mush 4-6 gd (6 C/gd, quality 0.4), removed at 6 gd | 15-20 (2-4 falls per gd per orchard area) | 40 BU | 0.7 → 0.4 | wasps: abstract drain 10 %/h by day; fruit flies |
| `carrion` / `insect-small` | T1 | all zones | dead aphid, midge: 2-3 mm, 1 mg, bulk 0.5; carry | 0.02 C / 0.5 P | 1 unit | `pick-up` 0.5 s | decay 1.6 (T1: no decay, removed after 3 gd) | 1-21 | 8 BU | 0.9 | rivals, rove beetles |
| `carrion` / `insect-medium` | T1 | all zones | dead fly, moth, spider: 6-12 mm, 10 mg, bulk 5; group | 0.1 C / 4 P | 1 unit | `drag` (≥ 3 ants to move) or tear (hardness 1.5) | decay 1.6 | 1-21 | 20 BU | 0.9 | as above |
| `carrion` / `insect-large` | T2 | all zones | dead beetle, cricket: 12-25 mm, 80 mg, bulk 40 | 0.5 C / 15 P | 1 unit | tear (hardness 3.0, 4 slots) | decay 1.6 | 1-21 | 30 BU | 0.8 | — |
| `carrion` / `large-carcass` | T2 | worm: `lawn`, `pavement`, `asphalt` after rain; slug: `garden-bed`, `lawn`; fledgling/mouse: `forest`, `garden-bed`, `lawn` | worm 100 mm / 1000 mg; slug 60 mm; vertebrate 80 mm | worm 5 C / 120 P; slug 2 C / 60 P; vertebrate 20 C / 400 P | 1 unit | tear: worm/slug hardness 1.0 (12 slots); vertebrate 2.0 (16 slots) | decay 1.6; hosts fly larvae | 1-21 | worm/slug 60 BU, vertebrate 100 BU | 0.9 | rivals; strong recruitment target |
| `prey` (live) | T2 | see creatures (2) | killed prey becomes the matching `carrion` item or a `food-piece` with the creature's values (2.2) | — | — | subdue (1.5) | — | — | — | 1.0 | rivals; predators |
| `seed` / `elaiosome-seed` | T2 | `forest`, `garden-bed` (violet, celandine) | 2-3 mm, bulk 0.8; carry | 0.2 C / 0.3 P (elaiosome only) | 10-30 per plant patch | `pick-up` | patch dropped once per spring; seeds left > 2 gd germinate (removed) | 3-9 | 6 BU | 1.0 | rivals |
| `seed` / `grass-seed` | T3 | open zones | 0.5-3 mm | per granary module | — | granary species only; *Lasius* ignores | — | 10-20 | — | — | — |
| `crumb` / `crumb-starch` | T1 | `pavement`, `asphalt` (bins), `sand`, `interior`, `lawn` (picnic) | 1-4 mm, bulk 0.6; carry | 0.7 C / 0.05 P | cluster of 5-40 | `pick-up` | T1: 30 % of consumed clusters re-placed daily at 12:00; T2: from human events, removed by sweeping, vacuum, wiping | all year where people are | single 6 BU, cluster 15 BU | 0.6 | rivals, sparrows (bird event) |
| `crumb` / `crumb-fatty` | T2 | as above | crisp, pastry, bulk 0.6 | 0.8 C / 0.05 P | 5-30 | `pick-up` | as above | — | 15 BU | 0.9 | — |
| `crumb` / `crumb-protein` | T1 static (consistency pass, T1 protein), T2 from human events | `interior`, picnic areas; in T1 also `pavement`, `sand` and `lawn` where `crumb-starch` clusters are placed (1 protein cluster per 3 starch clusters) | cheese, meat, egg, bulk 0.6 | 0.2 C / 0.6 P | 3-15 | `pick-up` | T1: as `crumb-starch` (30 % of consumed clusters re-placed daily at 12:00); T2: as above; spoils like carrion after 1.5 gd | — | 15 BU | 0.9 | — |
| `crumb` / `crust` | T2 | as crumbs | 15-40 mm chunk, bulk 30 | 20 C / 1.5 P | 1 | tear (hardness 1.0, 8 slots) | dries: after 2 gd hardness 2.0 | — | 25 BU | 0.6 | — |
| `sugar` / `sugar-granules` | T1 | `interior`, café/bin areas of `pavement`, `sand` | 0.5-1 mm, bulk 0.3; carry | 0.5 C | 50-300 granules | `pick-up` | any rain on an exposed patch removes it; wiped indoors | — | 10 BU | 0.8 | — |
| `sugar` / `sugary-spill` | T2 (T1 one static indoor spill allowed) | `pavement`, `sand`, `lawn` (picnic), `interior` | liquid puddle 20-200 mm | 1.0 C per load | 20 mm: 10 C; 50 mm: 40 C; 100 mm: 120 C; 200 mm: 300 C | drink from the edge band (1 L wide); slots = perimeter / 1.5 L, max 24 | liquid half-life: 0.15 gd sun (surface ≥ 30 °C), 0.4 gd shade, 1 gd indoors; below 30 % of start it becomes `sticky-residue` (`drinkRateMult` 0.33, until wiped or 2 gd) | event-driven (human chapter) | 30 BU | 0.9 | drowning hazard (1.8) |
| `pet-food` / `kibble` | T2 | `interior` bowl; `garden-bed` by buildings | 10 mm, 300 mg; tear only (hardness 2.0, 6 slots per kibble) | 2.5 C / 4 P per kibble | bowl of 20-40 kibble | tear | bowl refilled 07:00 and 18:00 when the archetype has a pet (50 % of interiors) | all year | bowl 40 BU | 0.8 | — |
| `pet-food` / `wet-pet-food` | T2 | bowl | liquid-paste | 0.2 C / 0.6 P per load | 25 loads | drink, `drinkRateMult` 0.5, 8 slots | after 0.5 gd dries into a tear source (hardness 1.5) | all year | 50 BU | 0.9 | — |
| `bait` / `bait-gel` | T2 | station placed by the `bait-station` human event: `interior`, building edge of `pavement`, `garden-bed` | gel, liquid | 1.0 C + 1.0 toxin per load | 40 loads | drink, 3 slots per port, 2-4 ports | until empty or 6 gd | event-driven | 60 BU | 1.2 | the trap (1.8) |
| `leaf` | T3 | plants | owned by the leafcutter module | — | — | `cut-leaf` | — | — | — | — | — |
| `dew` / `dew` | T2 | `plant`, `leaf`, grass, metal, glass surfaces on dew nights (GDD 06 3.8) | droplet 0.2 load of water | water only | field: per plot `20 × dewLevel` drinkable droplets | drink, 10 s for a full crop | vanishes with `dewLevel` (GDD 06) | dew nights, not winter (rime) | 4 BU | 0.5 | — |
| `dew` / `water` | T2 | puddles (GDD 06 3.10), saucers, sink drips, fountain drains | liquid | water only | unlimited while present | drink at the edge | per GDD 06 puddle model | — | 10 BU | 0.5 | drowning per GDD 06 |

Water: a crop of water carries no C or P; delivered water is credited to the receiving chamber's humidity input (nest chapter) and resets the drinker's desiccation load if the environment chapter models one (GDD 06 5.5 for queens). Ants drink only when the colony or the ant has a water need flag (nest or environment chapter); otherwise water sources are ignored by AI.

### 1.3 Placement and spawning (worldgen and runtime)

Expected count per plot (rounded with `rng.ecology`; zone multipliers already applied). Totals are clamped to the map caps.

| Node | `forest` | `lawn` | `garden-bed` | `pavement` | `asphalt` | `sand` | `rubber` | `interior` | Map cap |
|---|---|---|---|---|---|---|---|---|---|
| Aphid host plant (herb / shrub / tree-branch) | 0.05 | 0.03 | 0.12 | 0.01 | 0 | 0.005 | 0 | 0 | 20-90 |
| Flower | 0.03 | 0.08 | 0.15 | 0.01 | 0 | 0.01 | 0 | 0 | 150 |
| EFN plant | 0.03 | 0 | 0.03 | 0 | 0 | 0 | 0 | 0 | 30 |
| Elaiosome plant patch | 0.02 | 0 | 0.02 | 0 | 0 | 0 | 0 | 0 | 20 |
| Fruit tree drop area | 0-2 per map | — | 0-3 per map | — | — | — | — | — | 4 |
| Prey patch (springtails, mites) | 0.08 | 0.04 | 0.06 (+1 compost heap per garden zone) | 0 | 0 | 0 | 0 | 0 | 80 |
| T1 crumb cluster | 0 | 0.005 | 0 | 0.02 | 0.01 | 0.03 | 0.01 | 0.08 | 60 |
| T1 sugar granule patch | 0 | 0 | 0 | 0.005 | 0 | 0.01 | 0 | 0.03 | 15 |

Runtime carrion drops per plot per gd (× season: spring 0.8, summer 1.0, autumn 0.7, winter 0; × zone: `forest` 1.5, `garden-bed` 1.2, `lawn` 1.0, `pavement` 0.6, `asphalt` 0.5, `sand` 0.4, `rubber` 0.4, `interior` 0.3; × difficulty `carrionMult`):

| Variant | Rate per plot per gd | Map total (summer, naturalist, ≈1600 plots) |
|---|---|---|
| `insect-small` | 0.02 | ~30 |
| `insect-medium` | 0.004 | ~6 |
| `insect-large` | 0.0006 | ~1 |
| `large-carcass` (slug / vertebrate) | 0.0002 | ~0.3 |
| stranded earthworms | 0-3 per rain event on `pavement`/`asphalt` next to `lawn`/`garden-bed` | see `earthworm` (2.2) |

Drops are placed at a random surface point of the zone at least 20 BU from any ant (no pop-in), under trees with weight ×2. Validation (worldgen, extends the generator's food-in-range check): every candidate founding site rated Good or better has ≥ 2 C-sources and ≥ 1 prey patch or carcass-capable zone within 400 BU.

### 1.4 Honeydew herds (T2)

A herd is an abstract population on a host-plant segment (stem capsule chain or leaf underside); aphids are rendered as instances (up to 200; above that, density texture). Individual aphids are not agents.

**State:** `A` aphids, `E` overwintering eggs, `pool` (loads), `tend` 0..1, `hostClass` (`herb` / `shrub` / `tree`), `hostQuality` 0..1, `tenderColony`, `predators` (creature ids), `cullBudget`, `mownUntil`.

**Constants**

| Constant | Value | Unit |
|---|---|---|
| `HONEYDEW_PER_APHID` | 0.10 | C per aphid per gd at `tend` 1 and temperature factor 1 |
| `UNTENDED_PROD` | 0.5 | production factor at `tend` 0 (factor = 0.5 + 0.5 tend) |
| `HERD_POOL_BASE`, `HERD_POOL_PER_APHID` | 1.0, 0.02 | loads |
| `APHID_DROPLET` | 0.15 | load per `tend-aphid` cycle (GDD 01); none released if pool < 0.15 |
| `TEND_TAU` | 0.1 | gd (EWMA time constant) |
| `APHIDS_PER_TENDER` | 50 | tenders needed = ceil(A / 50) |
| `TEND_SLOTS` | 2 + floor(A/25), max 16 | ants |
| `HERD_K` | herb 80, shrub 250, tree-branch 400 (a tree carries up to 3 herds) | aphids |
| `TEND_GROWTH_BONUS`, `TEND_K_BONUS` | 0.3, 0.25 | × |
| `HOST_DECLINE` | −0.08 per gd from day 10, floor 0.5; reset to 1.0 on day 1 | — |
| `PARASITOID_RATE` | 0.05 × (1 − 0.6 tend), days 6-18 | per gd |
| `DISPERSAL_RATE` | 0.15 × A per gd when A ≥ 0.8 K_eff; batches of 5 settle on an unoccupied host within 400 BU, else lost | — |
| `MIGRANT_P` | 0.12 per gd per unoccupied host, days 3-12; founds a herd of 5 | — |
| `STEM_MOTHERS_MAX` | 8 | aphids hatched from E on day 1 06:00 |
| `EGG_FRACTION`, `EGG_MAX` | 0.1, 20 | E = min(20, round(0.1 × season max A)) set at end of day 21 |
| `HERD_CULL_MAX` | 5 % of A per gd | AI culling cap |
| `APHID_CARRY_LIFE_S` | 300 | s a carried aphid survives off a plant |

**Growth** (hourly, dt = 1/24 gd): `K_eff = HERD_K × hostQuality × (1 + 0.25 tend)`; `dA = r(day) × (1 + 0.3 tend) × fT × A × (1 − A/K_eff) × dt − parasitoids − dispersal`, with predation by creatures subtracted in real time.

| Days | `r` per gd | Phase |
|---|---|---|
| 1 | hatch: A = min(E, 8) at 06:00 | stem mothers |
| 1-7 | 0.9 | spring growth |
| 8-10 | 0.6 | summer peak |
| 11-14 | 0.2 | host decline, predators: midsummer crash emerges |
| 15-17 | −0.2 | autumn: winged return flight (A that leaves is not re-seeded) |
| 18-21 | −0.5 | sexual forms, egg laying |
| 22-28 | A = 0, herd dormant with E eggs | winter |

`fT` (air at the plant): 0 at ≤ 8 °C, linear to 1 at 18 °C, 1 up to 28 °C, linear to 0.6 at 34 °C and above.

**Production:** `pool += A × 0.10 × (0.5 + 0.5 tend) × fT × dt`, capped at `1 + 0.02 A`; overflow goes to the herd's `honeydew-film`.

**Tending:** every 1 s, `target = min(1, tendersPresent / ceil(A/50))` where a tender is an ant of `tenderColony` within 2 L of the herd segment in `tend` task or performing `tend-aphid`; `tend += (target − tend) × (1 s / (0.1 gd = 60 s))`. `tenderColony` = the colony with the most tender-seconds in the last 0.25 gd. Ants of another colony that start `tend-aphid` on a herd with `tend > 0.2` are attacked by present tenders (encounter rules 3.6 with `terrF` = own-claimed). Biology note: ant attendance raised *Aphis fabae* colony performance and *L. niger* removes ladybirds (Lasius dossier 6); the 0.3/0.25 bonuses are tunable estimates.

**Moving aphids (T2):** `carry-aphid` (GDD 01) removes 1 aphid; `put-down` on a host-plant surface within 2 BU adds it to that plant's herd or founds a herd (A = 1) if the plant is unoccupied, day ≤ 17 and not mown. An aphid not placed within 300 s dies and becomes a `food-piece` (bulk 0.15, 0.02 C, 0.08 P). AI relocation: when A ≥ 0.9 K_eff and an unoccupied host lies within 150 BU inside the colony's claimed cells, tenders relocate 1 aphid per tender per 300 s, max 10 % of A per gd (biology: *L. niger* carries willow-aphid nymphs between plants, Lasius dossier 6).

**Culling (T2):** `bite` on a herd takes 1 aphid as prey (2 s) → `food-piece` as above. AI tenders cull only when the colony's protein-deficit flag is set (colony chapter) and A ≥ 0.6 K_eff, up to 5 % A per gd. Naturalist note: honeydew is an incomplete diet and *Lasius* also preys on aphids (dossier 6, Offenberg 2001 as cited); the rule keeps culling rare.

**Disturbances:** mowing (human chapter) on a `lawn` host: A × 0.2, K_eff × 0.3 recovering linearly over 3 gd. Downpour or storm hour: A × 0.95. Host plant destroyed: herd removed, `herd-collapsed`.

**Aphid predators** (agents, table 2.2): arrival check per herd per hour, only on herds with A ≥ 40, day 3-19, air ≥ 12 °C, by day:

| Predator | Arrival p per hour | Eats | Leaves when | Ant response |
|---|---|---|---|---|
| `ladybird` | 0.02 × A/100 × (autumn 0.5) | 1 aphid / 6 s | `harass ≥ 6` (each ant bite +1, each spray +3), or 60 aphids eaten, or dusk | tenders within 4 BU of the herd attack; reflex bleeding: each bite has 25 % to stun the biter 2 s and break its lock |
| `ladybird-larva` | spawned 0.5 gd after a ladybird ate ≥ 20 aphids at the herd (p 0.5, 1-3 larvae), days 4-16 | 1 aphid / 10 s | `harass ≥ 10` (drops off the plant and walks 50 BU away) or killed; pupates after 3 gd | attack; killable (carcass 3 P) |
| `lacewing-larva` | 0.01 × A/100, days 8-19 | 1 aphid / 8 s | `harass ≥ 8`; pupates after 3 gd | detected by tenders only within 1 L at 30 % per s (debris camouflage); bites back |

Abstract parasitoids (no agents) are the `PARASITOID_RATE` term; mummies are rendered as a fraction of aphid instances.

### 1.5 Live prey: subduing, cooperative kills, transport, butchering

1. **Subduing.** Prey are attacked with `bite` / `bite-hold` under the combat rules (section 4). A prey creature is **subdued** when its health reaches 0 (it dies and becomes an item) or when it is pinned (4.3) for `SUBDUE_PIN_S = 8` s while its health ≤ 0.5 (it stops struggling and dies 4 s later).
2. **Prey defences.** Escape (springtail jump, fruit-fly take-off), thrash (caterpillar: each second, each non-pinning holder is shaken off with p 0.3), regurgitate (caterpillar: every 10 s, biters within 1 L stunned 2 s), drop on silk (caterpillar on foliage: on first bite p 0.5, hangs 30 s out of reach, then climbs back), rolling (woodlouse, 2.2). Ants recruit with `release-alarm` and by the alarm rules (4.5).
3. **Transport decision** (AI and the possessed ant use the same rule; the player may override by acting). For an item of bulk B and length ℓ (in BU): helper slots `H = clamp(round(3 ℓ / L), 1, 12)` (`COOP_MAX_ANTS` 12, GDD 01). Solo carry if B ≤ carryCap; solo drag if B ≤ 2 carryCap (`SOLO_DRAG_MAX`); cooperative `drag` if `0.75 B ≤ min(H, available recruits) × carryCap`; otherwise **butcher** (tear into pieces, `TEAR_S × hardness`, up to `H/2` tearers in parallel).
4. **Cooperative drag** follows GDD 01: speed = cruise × 0.4 × min(1, Σ carryCap / B); no motion while Σ < 0.5 B; the informed lead (an ant with route memory to the nest, or the possessed ant) sets the heading; heading noise ±10°. Recruitment to an item: an ant that cannot move an item alone lays trail home (foraging chapter) and the item emits a recruitment odour of radius 20 BU for 120 s.
5. **Stall handling.** If an item makes < 1 BU of progress in 30 s with ≥ 0.5 B pulling (snagged), carriers switch to butchering. If an item is unreachable (no path for 3 attempts), it is flagged `unreachable` for this colony for 0.5 gd.
6. **Pieces.** Each torn piece is a `food-piece` (bulk = carryCap) with nutrients pro rata; the remaining carcass scales its render size by remaining bulk; at bulk < 0.5 the rest becomes a final piece.

### 1.6 Carrion and decay (T2; T1 has no stages)

Stage clock runs at `rate = 2^((T − 20)/10)` (T = surface/air temperature at the item; frozen at ≤ 2 °C; interior uses room temperature).

| Stage | Entry (stage-clock gd) | Behaviour | Exit |
|---|---|---|---|
| `fresh` | death / spawn | full nutrients; quality 0.9 | clock ≥ 0.5 |
| `ripe` | 0.5 | quality 0.6; carcasses with bulk ≥ 5 spawn 4-20 `fly-larva` if air ≥ 12 °C and season not winter; maggots eat 10 % of remaining P per gd per 5 maggots | clock ≥ 1.5 |
| `putrid` | 1.5 | P −40 % per gd; quality 0.3; AI accepts only under protein deficit | clock ≥ 4 or P < 10 % of start |
| `husk` | 4 | dry remains, 0 nutrients, inspect only | removed at clock 6 |

Small items (bulk ≤ 1) on exposed ground are washed away by any shower or heavier rain with p 0.3 per event. Ant corpses decay with the same table.

### 1.7 Human food (T2)

Human food arrives through human-activity events (human chapter): `food-drop` → a crumb cluster (variant by zone: pavement crisp/bread, interior cereal/cheese, playground sweets = sugar granules + crumbs) or a `crust`; `spill` → `sugary-spill` (indoors: 50 % granules instead); `children` → crumbs and sweets in `sand`/`rubber`. Removal events delete all human food nodes in their area: `sweeping` (pavement, interior), `vacuum` (interior: also items lying on the floor), wiping (interior surfaces), `mowing` (crumbs in its swath). Removal also deletes `honeydew-film` and items under it.

### 1.8 Bait stations and spills as traps (T2)

- **Bait** delivers its `toxin` with the C load. Drinking bait is indistinguishable from other sugar to AI ants (quality 1.2 makes it preferred). Inspecting it with `antennate` shows "sweet gel, bitter undertone" and a codex entry.
- **Colony toxin pool** `T_tox` (loads, stored with colony stores, colony chapter). Each hour: `consumed = T_tox × (1 − e^(−0.6/24))`; `T_tox −= consumed`; deaths accrue `TOXIN_DEATHS_PER_LOAD = 4` adult workers per load consumed (accumulator, round down), chosen 50 % nurses, 30 % foragers, 20 % others; brood deaths 1 larva per load; if `T_tox > 1`, the queen takes `0.04 × maxHp` per load consumed. Cause `poison` (canonical death cause; the colony field `toxinPool` keeps its name).
- **Forager ingestion:** a forager that drinks ≥ 0.5 load of bait dies within 1 gd with p 0.1 (personal dose).
- **Counterplay:** an `avoid` marker on the station (any marker overlapping it) sets its quality to 0 for that colony; the diagnostics remedy names the station. Difficulty `baitToxicityMult` (5).
- **Spill drowning:** the interior of a liquid puddle deeper than 0.5 L (> 1 L from the edge on spills ≥ 50 mm) is non-walkable; an ant pushed or falling into it is `stuck`: struggle (4.8) escapes with the same meter (`STUCK_REASSERT 0.02/s`); death after `STUCK_DROWN_S = 120` s (cause `drowning`). Nestmates biting-and-holding a stuck ant add +0.1/s to its escape meter. Water puddles use GDD 06's drowning rule.

### 1.9 Source edge cases

| Case | Handling |
|---|---|
| Source exhausted while ants are en route | Arrivals find `units = 0` or `pool < 0.15`: they record "exhausted" in route memory (foraging chapter), stop reinforcing the trail and return or search 30 s locally. Node removed when depleted and non-renewable; `source-exhausted` alert if the colony exploited it in the last 0.5 gd. |
| Renewable node empty | Stays; arrivals wait up to 20 s at herds (1 droplet may appear), else leave. |
| Item dropped on a plant or wall | Falls along −Y to the next surface (locomotion fall rule) and stays there. |
| Item falls into water | Floats 0.3 gd at the puddle edge then is removed. |
| Node inside a removed area (moved object, carve op) | Re-projected to the nearest surface within 4 BU, else removed with event. |
| Two colonies at one node | First-come slots; a hostile recognition at the node uses encounter rules (3.6). |
| Save/load | Nodes, herds and items are plain data; derived spatial hashes rebuilt on load. |

---

## 2. Creatures

### 2.1 Common model

Creatures are surface walkers (same kinematics as ants; flying creatures use straight-line flight above terrain and land on surfaces). Each has `{id, kind, variant, pos, up, fwd, health, state, stateTimer, target, homeCenter, homeRadius, deterrence, harass, seized (ant id), spawnedTick, lifeEndTick}`. Behaviours are small state machines; tables give states in brief. `deterrence` (0..1, half-life 20 s) is raised by ant bites (+0.08 per bite × attacker mass^(2/3)) and sprays (+0.35 × acid sensitivity); predators flee at their threshold.

**Comfort mode (render only, GDD 08 13):** levels `off`, `softened`, `abstract`, `marker` apply to `jumping-spider`, `wolf-spider`, `ant-spider` and optionally to `mite` and `centipede`. Hit volumes, sounds, telegraph cues (shadow, pose timing, ring) and behaviour are unchanged; `abstract` keeps the wind-up as a body squash and a ground ring, `marker` keeps the ring and shows a growing arc for the wind-up.

### 2.2 Catalogue

**(a) Identity and stats** (HP in damage points; speeds absolute; "Lasius cruise" is 24 mm/s)

| Kind | Tier | Size mm (BU) | Mass mg | Zones / place | Active | Speed mm/s (walk / burst) | Senses | maxHp | Armour | Pull | Acid sens. |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `aphid` (herd) | T2 | 2 (0.5) | 0.3 | host plants | days 1-21 | — | — | 1 each | 0 | — | — |
| `ladybird` | T2 | 6.5 (1.6) | 35 | herds; flies in | day, ≥ 12 °C | 10 / flight 300 | herds within 200 BU | 40 | 0.6 | 6 | 0.5 |
| `ladybird-larva` | T2 | 8 (2) | 15 | herds | day | 5 | herd plant | 25 | 0.2 | 3 | 1.0 |
| `lacewing-larva` | T2 | 7 (1.75) | 5 | herds | day + dusk | 6 | herd plant | 20 | 0.3 | 2 | 1.0 |
| `springtail` | T2 | 1-2 (≤ 0.5) | 0.1 | prey patches: litter, humus, moss, thatch, compost | all day, damp | 5 / jump 60 mm | touch | 1 | 0 | 0.2 | 1.0 |
| `mite` | T2 | 0.5 (0.12) | 0.05 | prey patches | all day | 1 | touch | 1 | 0.5 | 0.1 | 1.0 |
| `fly-larva` | T2 | 8 (2) | 15 | ripe carrion, windfalls stage 3, compost | all day | 1 | — | 20 | 0 | 3 | 1.0 |
| `caterpillar` | T2 | small 10 (2.5) / medium 22 (5.5) | 8 / 60 | foliage of `garden-bed`, `forest`, shrubs | day | 3 | touch | 15 / 60 | 0 | 4 / 15 | 1.0 |
| `fruit-fly` | T2 | 2.5 (0.6) | 1 | fruit, spills, bins | day, ≥ 15 °C | 10 / flight 400 | vision 10 BU | 2 | 0 | 0.5 | 1.0 |
| `woodlouse` | T2 | 10 (2.5) | 30 | `forest`, `garden-bed`, under stones, compost | night, damp | 10 | touch | 50 | 0.5 (0.9 rolled) | 10 | 0.3 |
| `earthworm` | T2 | 100 (25) | 1000 | soil; surfaces at night and after rain | night, rain | 2 | vibration | 300 | 0 | 100 | 1.0 |
| `snail` | T2 | 20 shell (5) | 1000 | `garden-bed`, `lawn`, `forest` | night, rain | 1.5 | touch | 200 | 0.8 | 60 | 0.2 |
| `millipede` | T2 | 30 (7.5) | 100 | litter, compost | night | 8 | touch | 80 | 0.5 | 20 | 0.3 |
| `jumping-spider` | T2 | 6 (1.5) | 15 | sunny vertical surfaces: walls, fences, play equipment, trunks, stems | day, ≥ 15 °C | 8 stalk / leap 160 | vision 30 BU (best), vibration 4 BU | 35 | 0 | 12 | 1.0 |
| `wolf-spider` | T2 | 10 (2.5) | 60 | `lawn`, `forest` litter, `garden-bed` | dusk/night peak (18:00-06:00), day ×0.4 | 20 / pounce 250 | vibration 8 BU, vision 6 BU | 70 | 0 | 25 | 1.0 |
| `ant-spider` | T2 | 3 (0.75) | 3 | sunny dry ground: `sand`, `pavement` joints, `garden-bed` edges, `lawn` margins (temperate and Mediterranean localities) | dusk/night | 15 / lunge 80 | chemical (ant trails) 20 BU, touch | 15 | 0 | 4 | 1.0 |
| `antlion` | T2 | larva 10 (2.5); pit Ø 20-75 (5-19), depth 10-50 | 30 | sheltered dry fine sand (`sand` under equipment/overhangs, dry sandy `forest` clearings, sand under eaves) | always (dormant ≤ 10 °C, wet sand) | 0 | vibration on its pit slope | 60 | 0.4 (buried) | 20 | 0.5 |
| `centipede` | T2 | 20 (5) | 40 | `forest`, `garden-bed`, compost, under stones; T3: `interior` house centipede | night | 30 prowl / lunge 120 | antennae 3 BU, vibration 6 BU | 90 | 0.2 | 20 | 0.8 |
| `rove-beetle` | T2 (nest raider T3) | 5 (1.25) | 3 | litter, humus, compost, `lawn` edges | dusk/night; day in litter | 60 erratic | antennae 3 BU | 18 | 0.3 | 5 | 0.5 |
| `phorid-fly` | T3 | 2.5 (0.6) | 0.5 | over trails of host species | day, ≥ 18 °C | hover / dive | vision 15 BU | 2 | 0 | 0.5 | 1.0 |
| `bird` (event) | T2 | 150-300 body | — | daylight surfaces | SR+1 h .. SS−1 h, not rain | — | vision | not attackable | — | — | 0 |

**(b) Behaviour, interaction, limits** (cap = naturalist map maximum before the Predators setting multiplier; residents occupy worldgen territories)

| Kind | Behaviour states (brief) | Attacks | Eats | How ants interact | Cap | Spawn / despawn | Comfort |
|---|---|---|---|---|---|---|---|
| `aphid` | herd model (1.4) | — | phloem | tend, move, cull, defend | herd K | herd cycle | — |
| `ladybird` | FlyIn → Feed → (Harassed) → FlyOff | none; reflex bleed (1.4) | aphids | harass; killable only with difficulty (carcass 6 P) | 1 per 300 aphids on map, max 8 | arrival rule 1.4; despawns on fly-off or at dusk | — |
| `ladybird-larva` | Crawl → Feed → DropOff | none | aphids | attack, kill (carcass 3 P) | 1 per 200 aphids, max 10 | 1.4; despawn on pupation (3 gd) | — |
| `lacewing-larva` | Crawl → Feed → Leave | 2.0 dmg per 2 s to an ant locked on it | aphids | must be found (1 L), then harassed | 1 per 250 aphids, max 8 | 1.4; despawn on pupation (3 gd) | — |
| `springtail` | patch-based (2.3): Appear → Graze → Jump (on touch) → Vanish | none | fungi, detritus | prey: one bite kills; escape p 0.6 on open ground, 0.25 in litter/humus/thatch | 40 live agents | on demand; vanishes after 30 s unseen | — |
| `mite` | as springtail, no jump | none | detritus | prey of last resort: hit chance ×0.5; 0.08 P each; AI takes only under protein deficit | 10 live agents | on demand | optional |
| `fly-larva` | Feed (stationary) → Burrow (pupate) | none; wriggle (holder shaken off p 0.1/s) | carrion | prey: 3 P each, bulk 3 | 60 | at ripe carrion (1.6); burrow when carcass exhausted or after 1.5 gd | — |
| `caterpillar` | Feed on leaf → Crawl to next leaf → (Drop on silk / Thrash) | thrash, regurgitate (1.5) | leaves | group kill: small needs ≥ 3 *Lasius*, medium ≥ 6; small 4 P (bulk 4), medium 20 P (bulk 25, butchered); hairy variant (20 %) is ignored by AI and repels biters 3 s | 12 | 0.002 per plot per gd on foliage, days 3-14 (peak 4-10); despawn on pupation after 3 gd | — |
| `fruit-fly` | Fly → Land → Feed 20-60 s → Fly | none | fruit, sugar | ambush when feeding: catch p 0.15 per strike; 0.4 P, 0.05 C | 20 | near fruit/spills/bins (≤ 5 per source); despawn when source gone | — |
| `woodlouse` | Wander → Graze → Shelter (by day under cover) → Roll (when bitten ≥ 2 times, 50 % of individuals) | none | detritus | ignored; dead woodlouse = 10 P carcass; obstacle; shares shelter | 30 | worldgen territories under stones/logs; never despawn | — |
| `earthworm` | Underground → Surface (night/rain) → Return; stranded on hard surface after rain → Dying (0.3 gd in sun) → dead | none | soil | living: obstacle, ignored; dead → `large-carcass` 120 P | 8 on surface | 0-3 per rain event on hard ground next to soil; surface worms return underground at dawn | — |
| `snail` | Graze → Crawl (slime trail) → Retract (touched) | none | plants | ignored; slime trail: ant speed ×0.7 for 0.5 gd; dead snail 40 P | 10 | night/rain from beds; despawn into cover at dawn | — |
| `millipede` | Wander → Coil (bitten) + secretion | secretion: biter flees 4 s, no alarm | detritus | ignored by AI; dead: 15 P, quality 0.2 | 12 | night in litter; despawn at dawn | optional |
| `jumping-spider` | Rest (sunny spot) → Scan → Stalk (pauses, approaches to ≤ 16 mm) → WindUp → Leap → Feed (retreat 12 mm, 120 s) / Flee | leap strike 9 + venom 0.5/s while seized | ants ≤ 3 mg, flies | avoid, dodge, mob (2.4) | 4 residents | territories on vertical sunny surfaces; re-occupied 1 gd after death; never despawn while territory exists | yes |
| `wolf-spider` | Wander ↔ Ambush (30-120 s) → Detect → Orient → Freeze → WindUp → Pounce → Feed (retreat 16 mm to cover, 120 s) / Flee | pounce 12 + venom 0.8/s while seized | ants ≤ 25 mg (founding queens included), insects | avoid, dodge, mob (2.4) | 3 residents, home radius 120 BU | territories in lawn/litter; re-occupied 1.5 gd after death | yes |
| `ant-spider` | Patrol near trails → Approach (ant mimicry) → WindUp → Bite → Retreat 16 mm → Wait (venom) → Collect (carry paralysed ant to cover, kills it) | bite 1 + venom 6 over 15 s; victim paralysed 60 s at health ≤ 0.3 | ants only (≤ 3 mg; Messor media in Mediterranean) | detect, mob, rescue paralysed (2.4) | 3 residents | territories on sunny dry ground; re-occupied 1 gd after death | yes |
| `antlion` | Wait (buried) → Flick (prey on slope) → Grab (prey within 0.8 L of pit centre) → Drag (pull under) → Feed (120 s) → Rebuild (300 s) | flick: impulse 1.5 L downslope, p 0.6, every 0.8 s; drag damage 1.5/s | anything ≤ 30 mg that falls in | avoid known pits, pull victims (2.4) | 12 pits (~1 per m² of sheltered dry sand) | worldgen only, persistent; rain collapses the pit (rebuilt 0.3 gd after rain); dormant in winter | — |
| `centipede` | Prowl (follows humidity) → Detect → WindUp → Lunge → Feed (60 s) / NestRaid (2.5) / Flee | lunge 10 + venom 1.0/s while seized; in a brood chamber eats 1 brood per 40 s | ants ≤ 30 mg, brood, springtails | mob, spray, evacuate brood (2.4, 2.5) | 2 active | night only from litter/stone territories; burrows (despawns) at dawn unless engaged | optional |
| `rove-beetle` | Forage (erratic) → Target isolated ant (no nestmate within 3 L) → WindUp → Grab-and-hold → Feed / Secretion → Flee | grab 3 + hold damage 1.5/s; defensive secretion: when ≥ 2 ants bite it, all ants within 1.5 L flee 3 s (cooldown 10 s) | springtails, ants ≤ 1.5 mg; T3 nest-raider steals 1 larva per raid | stay grouped, struggle (2.4) | 6 | litter territories; night; despawn at dawn if not engaged | — |
| `phorid-fly` | Search over trails → Hover over a target (2-5 s) → Dive | oviposit: success 0.4 on a moving ant, 0.1 if frozen; parasitised ant dies 2.5 gd later (cause `parasitoid`) | — | freeze response within 3 L (AI stops 1-3 s; foraging −30 % within 20 BU); Atta hitchhikers −60 % success | 6 | only where host-species trails exist (Camponotus, Atta; disabled for *Lasius* by default, ecology dossier 2.3) | — |
| `bird` | event (2.6) | pecks | surface ants, alates | flee to entrances or cover | 1 event at a time | 2.6 | — |

### 2.3 Prey patches (springtails, mites)

A patch is a disc (radius 20-60 BU) with `count` and `K = 0.08 × areaBU² × zoneFactor` (forest 1.0, garden-bed 0.8, lawn 0.5, compost 2.0). Logistic regrowth `r = 0.8` per gd (× season: spring 1.0, summer 0.8 dry / 1.0 damp, autumn 1.0, winter 0) plus immigration `0.05 K` per gd (floor, invariant I2). For each ant in `scout`/`forage` (or possessed) moving on the ground inside a patch, per second `λ = 0.05 × count/K` (springtail) and `0.01 × count/K` (mite): a live agent appears 2-4 L ahead, out of the ant's front cone if the camera is the ant's (pop-in rule: never inside 1.5 L). Catching: reach and `bite`; a springtail escapes per bite attempt with the substrate probability (table 2.2b); a catch removes 1 from `count` and yields an item (springtail: bulk 0.1, 0.25 P; mite 0.08 P). Live agents vanish after 30 s without contact. Nutrient values of small prey are deliberately generous relative to mass so that a single-ant prey trip is worth making (a load-convention compression, like the calendar's).

### 2.4 Predator attack framework: telegraphing, counterplay, AI avoidance

**Seizing.** A predator strike that hits deals its strike damage; if the victim survives it is `seized`: it moves with the predator, takes the predator's venom per second, and may struggle. **Struggle meter** `e` (0..1): each valid struggle input of the possessed ant (any `bite`, `special`, or a movement direction change > 90°; at most 4 counted per second) adds 0.08; the predator reasserts −0.05/s; each nestmate biting the predator adds +0.10/s; AI victims struggle at 2 inputs per second. At `e ≥ 1` the victim is freed, gains 1 s of strike immunity and drops 1 L away. A predator releases its victim when its flee condition triggers.

**Telegraph rule.** Every strike is preceded by a visible and audible wind-up of at least the listed lead time (× difficulty `telegraphMult`), emitted as `predator-telegraph {creatureId, targetId, strikeAtTick, aimPoint, kind}`. Strikes aim at the target's position **at the start of the strike** (no prediction). A strike misses if the target centre is more than `STRIKE_HIT_RADIUS` (jumping spider 4 mm, wolf spider 5 mm, centipede 4 mm, rove beetle 3 mm, bird 3 mm) from the aim point when it lands.

**Possessed-ant counterplay verbs** (section 4.8): `dodge` (3 L in 0.25 s), `let-go` (drop off a stem or wall), `hurry`, `bite`/`bite-hold`, `spray-acid`, `release-alarm`, struggle, and `antennate` (inspect shows the creature's state word and "about to strike" during wind-up).

| Predator | Warning cues (lead time, naturalist) | Fair counterplay (possessed) | AI avoidance and response | Flee condition |
|---|---|---|---|---|
| `jumping-spider` | stalking pauses with the body facing the ant; wind-up 0.6 s: crouch, front legs raised, abdomen twitch, soft tick sound | dodge sideways during wind-up; stay within 3 L of nestmates (it only targets ants with no nestmate within 3 L); spray when it is within 1.5 L | detects it at 4 L × stealth 0.5 (stalking); keeps ≥ 6 L when seen; dodge p `AI_DODGE_P` on a perceived telegraph; mob if ≥ 3 nestmates within 4 L | ≥ 2 ants holding, deterrence ≥ 0.6, or health < 0.5 |
| `wolf-spider` | vibration cue (ground shiver decal + low tap) 1.0 s before wind-up when it freezes in ambush; wind-up 0.5 s: body lowers, legs gather | dodge or hurry away during freeze/wind-up; never cross its home area at dusk alone; spray + alarm | detects at 4 L × 0.75 (wandering) or × 0.4 (ambush); avoids its home radius after a witnessed kill (danger grid); mob if ≥ 5 nestmates | ≥ 3 holding, deterrence ≥ 0.6, health < 0.4 |
| `ant-spider` | approach looks ant-like; wind-up 0.3 s: front legs raised; bite is non-lethal | dodge; after a bite, run home within 15 s (paralysis needs health ≤ 0.3); nestmates can carry a paralysed ant home (it recovers after 60 s if health > 0) | detects at 1 L only; any detection makes the spider retreat 4 L; AI carry paralysed nestmates (`haul`) with p 0.5 | detected within 1 L, or bitten once |
| `antlion` | pit visible as a smooth cone; stepping on the rim shows a "loose sand" prompt and slows to ×0.4 upslope; sand flicks are visible | do not enter; on the slope hurry upslope (slip 0.6 L/s downslope vs ×0.4 speed upslope); when grabbed, struggle; nestmates can pull | known pits (any nestmate saw one) are avoided in local steering (radius pit + 1 L) permanently; unknown pits catch scouts | — (stationary) |
| `centipede` | vibration 6 BU before contact; wind-up 0.5 s: antennae sweep forward, front segments raise | dodge, spray (2 sprays → flee), alarm; in tunnels block and call help | detects at 4 L × 0.8; guards mob if ≥ 6 nestmates; nurses evacuate brood from its chamber | ≥ 5 biting, deterrence ≥ 0.5, health < 0.5 |
| `rove-beetle` | wind-up 0.4 s: abdomen raised, short charge | stay with nestmates; struggle out (escapable alone: hold 1.5/s vs 3.7 s struggle) | detects at 4 L × 0.8; ignored when in groups | secretion triggered, then flees |
| `phorid-fly` (T3) | hovering speck + high whine 2.0 s | freeze (stop moving: success 0.1) or reach a hitchhiker (Atta) | freeze response | none |
| `bird` (2.6) | shadow + wingbeat 3.0 s before landing; each peck has a 0.5 s head-cock | get under cover or into a tunnel; dodge pecks | flee to cover/entrances | event ends |

`AI_DODGE_P`: gentle 0.5, naturalist 0.3, harsh 0.2.

**Danger grid (player colony).** Coarse 16 BU cells. A witnessed predator kill or survived strike within 6 L of a nestmate adds 1.0 to its cell; half-life 0.5 gd. AI route costs (foraging/nav chapters) are multiplied by `min(3, 1 + 2 × danger)`. An `avoid` marker sets danger to 3 inside its radius while it exists.

### 2.5 Nest invasion by creatures

Centipedes (and T3 myrmecophile rove beetles) can enter tunnels of width ≥ 1.0 BU. Check per night per prowling centipede: if its path passes within 20 BU of an entrance of a colony with brood, it enters with p 0.2 (× Predators setting). Inside it navigates by the nest's BFS field to the nearest nursery. Colony response: alarm in the nest (4.5), guards and nearby workers engage, nurses carry brood away from the intruder's chamber. Counts as a major threat (6). Ants killed inside become corpses for the midden.

### 2.6 Bird event (T2)

| Item | Rule |
|---|---|
| Rate | `BIRD_RATE` per gd per player colony with ≥ 30 workers: Few 0.4, Normal 1.0, Many 1.6; only the player colony is targeted; not within 0.5 gd of the previous bird event; subject to the threat director (6) |
| Target | a mound or trail segment of the player colony with ≥ 15 exposed ants within 25 BU (exposed per GDD 06: no overhead cover within 3 BU) |
| Variants | thrush/blackbird (`lawn`, `garden-bed`, `forest`), sparrow/pigeon (`pavement`, `asphalt`, `sand`, `rubber`; also eats crumbs: removes up to 10 crumb units), woodpecker (`forest`, `lawn`; only at a mound) |
| Telegraph | `bird-approach` 3.0 s (× `telegraphMult`): moving shadow, wingbeat, then landing thump |
| Duration | 20-40 s |
| Pecks | every 1.5 s at a random exposed ant within 25 BU; aim = its position 0.5 s earlier; kills if within 3 mm with p 0.7; `BIRD_MAX_KILLS` 12 per event (× Predators setting) |
| Woodpecker | additionally every 5 s carves a sphere of radius 3 BU into the mound/entrance throat (up to 6); ants and brood in the carved volume become exposed |
| Ant response | alarm burst at the landing point; AI ants within 40 BU stop foraging and run to the nearest entrance or cover; trails are not abandoned (foraging resumes 20 s after the event) |
| Alates | during nuptial flights (reproduction chapter) each launching alate within 30 BU of a landed bird is taken with p 0.05 per s |

### 2.7 Creature director: spawning, despawning, limits

Runs every 50 ticks. Per kind: `target = density × suitable area × season × time-of-day × Predators setting`, clamped to the kind cap and to `CREATURE_AGENT_CAP = 260` overall (live springtails and mites included). Over-cap priority for despawn: neutral fauna first, then prey, then aphid predators; ant predators are never culled by the cap (their caps are low).

| Rule | Value |
|---|---|
| Spawn distance | ≥ `SPAWN_MIN_DIST_FOCUS` 40 BU from the possessed ant and the observer focus point (from player intent), ≥ 20 BU from any colony ant |
| Despawn | creature over target and ≥ `DESPAWN_MIN_DIST` 60 BU from the focus and the possessed ant and not engaged (not seized/fighting); lifetime ended; or `STUCK_DESPAWN_S` 30 s without progress while not visible |
| Residents | ant predators and woodlice occupy worldgen territories (count = 1.5 × cap); a vacated territory is re-occupied after the kind's respawn delay |
| Winter (time-lapse) | all creatures except dormant antlions despawn; herds dormant; carrion frozen; prey patches frozen |
| Determinism | spawn draws use `rng.creatures`; focus point enters only through recorded player intent |

---

## 3. Rival colonies

### 3.1 Roster

Region by player species: *Lasius* → `temperate-eu`; *Camponotus* → `ne-america`; *Messor* → `mediterranean`; *Atta* → `southern-us`. Established rival count = custom rule "Rival colonies" (0-4; gentle 2, naturalist 3, harsh 4; GDD 08). Species are drawn with weights proportional to suitable zone area; at most one `formica-rufa`; on naturalist/harsh at least one conspecific when its zones exist. Additionally `INCIPIENT_RIVALS` conspecific foundations (gentle 1, naturalist 2, harsh 3) are placed by worldgen 300-800 BU from the start and ≥ 150 BU from any other nest (GDD 04 §12.4, consistency pass) at game start (3.8); they do not count toward the 0-4 setting.

**`temperate-eu` (T2)** — CP = combat power per worker relative to a *Lasius* worker; activity = surface temperature window.

| Id | Zones | Worker mm / mass mg | maxHp | Bite | Special | Armour | CP | Aggression | N0 | K_max | g /gd | Field share / cap (normal, war) | Activity | Diet (virtual) | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `lasius-niger` | `lawn`, `garden-bed`, `pavement`, `sand` | 4 / 1.0 | 10 | 1.0 | spray | 0 | 1.0 | 0.6 | 300 | 1200 | 0.25 | 0.05 / 40, 150 | 8-35 °C, day; warm summer nights | honeydew 60 %, prey 30 %, crumbs 10 % | conspecific; brood raids among incipients |
| `tetramorium-immigrans` | `pavement`, `asphalt`, `garden-bed`, `sand` | 3.2 / 0.6 | 7 | 0.7 | sting 1.4 | 0.15 | 0.8 | 0.75 | 600 | 1800 | 0.30 | 0.05 / 60, 250 | 12-38 °C, day | seeds and prey 60 %, honeydew 30 %, crumbs 10 % | pavement wars: in war fronts damage ×0.6 and lock-break ×0.5 (mass grappling) |
| `myrmica-rubra` | damp `garden-bed`, `lawn`, `forest` | 4.5 / 1.2 | 11 | 1.1 | sting 3.2 | 0.1 | 1.4 | 0.85 | 300 | 1000 | 0.25 | 0.05 / 40, 150 | 8-30 °C, day and dusk | prey 60 %, honeydew 40 % | polygynous: 3 real queens; retreat health 0.2 ("attacks rather than flees", ecology 3) |
| `formica-rufa` | `forest` only (≥ 20 % of map) | 7 / 6 | 33 | 3.3 | strong spray (×1.5) | 0 | 6.0 | 0.95 | 250 | 400 | 0.12 | 0.08 / 60, 200 | 10-32 °C, day | honeydew 50 %, prey incl. ants 50 % | woodland predator: predatory raids (3.7); thatch mound |
| `solenopsis-fugax` | `lawn`, `garden-bed` under stones | 1.8 / 0.1 | 2 | 0.2 | repellent sting 1.0 + target flees 3 s | 0 | 0.15 (0.6 inside host nests) | 0.4 (0.9 in host nests) | 400 | 1500 | 0.30 | 0.01 / 10, raid 30 | subterranean; warm nights | protein, stolen brood | thief ant: lestobiosis (3.7) `[E: not in the dossiers; general knowledge of the European thief ant, verify before the codex]` |
| `lasius-flavus` | old `lawn` turf | 3 / 0.6 | 7 | 0.6 | weak spray (×0.5) | 0 | 0.6 | 0.3 | 800 | 2000 | 0.15 | 0.005 / 5, 40 | subterranean | root aphids (no surface draw) | low conflict: fights only where tunnels meet or at its mound |

Queens (real entities): `lasius-niger` 50 HP; `tetramorium` 30; `myrmica` 25 each (×3); `formica-rufa` 61; `fugax` 25; `flavus` 61.

**T3 rosters** (stats follow the same columns; abbreviated): `ne-america`: `camponotus-pennsylvanicus` (conspecific; night), `formica-subsericea` (5.5 mm, 4 mg, spray, CP 3, agg 0.8, honeydew competitor), `tapinoma-sessile` (2.5 mm, chemical repellent, CP 0.4, agg 0.3), `tetramorium-immigrans`. `mediterranean`: `messor-barbarus` (conspecific; seed competitor; higher aggression to conspecifics, Messor 11), `linepithema-humile` (2.4 mm, chemical, CP 0.5, agg 0.9, K_max 3000, territory spreads ×1.5), `tapinoma-nigerrimum`, `pheidole-pallidula` (minors and majors). `southern-us`: `atta-texana` (conspecific), `solenopsis-invicta` (2-6 mm, potent sting ×2, CP 1.5, agg 0.95) `[E]`, `linepithema-humile`, `solenopsis-molesta` (thief ant, ecology 3).

### 3.2 Abstract colony model

**State:** `N` workers, `B` brood (abstract), `C_s`, `P_s` stores (loads), `queens` (real entity ids), `nestId`, `agg`, `knowsNest[colony]`, `orphaned`, `incipient`, `fielded[]`, `foundedTick`.

Every 250 ticks (dt = 1/24 gd), active season only:

| Quantity | Formula |
|---|---|
| Season factor `sR` | spring 1.0 (from day 2), summer 1.0, autumn 0.4, winter 0 |
| Activity `a` | 1 inside the species window (surface temperature at the nest, hour), 0 outside, 2 °C linear ramps |
| Upkeep | `U = 0.12 N + 0.3 × queens` C per gd |
| Carrying capacity | `K_eff = K_max × diff.rivalKMult × clamp(claimedCells / A_ref, 0.3, 1)`; `A_ref` 400 cells (`formica-rufa` 900) |
| Potential births | `b = g × max(N, 20) × (1 − N/K_eff) × sR × diff.rivalGrowthMult` per gd (0 if orphaned) |
| Births | `min(b dt, P_s / 1.2, C_s / 0.4)` into `B`; cost 1.2 P + 0.4 C each (directions J) |
| Maturation | `B / 4` per gd → N (4 gd brood pipeline) |
| Deaths | `0.03 N dt` + real combat deaths + starvation `0.15 N dt` while `C_s = 0` + orphan decline `0.15 N dt` |
| Virtual harvest capacity | `0.6 N a` loads per gd (15 % foragers × 4 trips) |
| Demand | `D_C = 1.2 U + 0.4 b`, `D_P = 1.2 b` |
| Virtual harvest | `max(0, min(cap, demand) − real deliveries of the last hour)`, drawn from real nodes inside its claimed cells, nearest first, split by diet; herds in claimed cells receive virtual tendedness `min(0.7, N/300)` and lose pool accordingly |
| Store caps | `C_s ≤ 10 U`, `P_s ≤ 0.2 N + 20` |
| Aggression | `agg = base × season (spring 1.2, summer 1.0, autumn 0.8) × (1.3 if C_s < U) × diff.rivalAggMult`, clamped 0..1 |
| Winter (time-lapse) | `N × (1 − 0.08 − 0.10 × [C_s < 0.35 U])`; stores −5 % of summer upkeep × 7; B frozen |

Strength for decisions: `S = N × CP × (0.5 + 0.5 agg)`; player colony `S = workers × CP_species × 0.75`.

### 3.3 Fielded agents

Rival agents are real ants (same entity array, `colonyId ≠ 0`), not possessable, using the shared action primitives and a reduced behaviour set.

| Rule | Value |
|---|---|
| Target fielded | `min(cap_normal, ceil(N × fieldShare × a))` + 2 guards per entrance (N ≥ 50, a > 0) + war commitment + raid party + defenders |
| Budget | `RIVAL_AGENT_BUDGET = min(900, 2500 − playerAnts − 50)` across all rivals; priority defenders > raid > war > guards > foragers/patrols; within a priority, proportional to targets |
| Emergence | ≤ 1 agent per 2 s per entrance (defenders 1 per 1.5 s, spawned in the deepest chamber) |
| Absorption | an agent re-entering its nest is removed and added back to N with its delivery |
| Deaths | subtract from N; corpses stay as items |
| Reinforcement | when a rival agent is attacked within 250 BU of its nest and N ≥ 50: same-colony agents within 6 L join; nest spawns up to 10 reinforcements at 1 per 3 s (budget permitting) |
| Herd materialisation | when a player ant comes within 30 BU of a herd with rival virtual tendedness > 0.3, up to 2 rival tenders spawn on the far side of the host plant (not within 8 BU of any player ant); this keeps virtual guarding visible |

| State (task) | Entry | Behaviour | Exit |
|---|---|---|---|
| Emerge | spawned at entrance | walk 5 L out | assigned task |
| `forage` | assigned node in claimed cells or within 100 BU of them | nav-grid path, harvest with primitives, deposit territory marks | loaded → Return; 300 s timeout → Return |
| `tend` | herd in claimed cells | stay 120-240 s, tend, guard herd | timeout → Return |
| `patrol` | top-5 contested/border cells | loiter 60-120 s | timeout → Return |
| `guard` | entrance | stand within 3 L of the entrance; engage intruders | relieved after 0.25 gd |
| `fight` | encounter or alarm (3.6, 4.5) | combat rules | win → previous task; retreat → `flee` |
| `flee` | retreat rule (4.6) | run home | home → absorb |
| `raid` (new task id) | raid launched (3.7) | travel to target entrance, enter, attack queen, carry brood/corpses | end rule → Return |
| Return | loaded, timeout, recall | path home | absorbed |

Rival agents deposit territory marks (3.5) and, if the pheromone module supports per-colony layers, `trail` and `home` in their own layer (for the scent view); their navigation does not depend on pheromones.

### 3.4 Real nests

Worldgen carves each rival nest: entrances `1 + [N0 ≥ 300] + [N0 ≥ 800]` (a new entrance is carved when N first crosses 300 and 800); a shaft of 15-40 BU; chambers: royal 8 BU, nursery 10 BU, 1-3 general 8-12 BU; tunnels 2 × the rival's own L; `formica-rufa` adds a thatch mound primitive 60-100 BU across with chambers inside; `lasius-flavus` a turf mound. Queens sit in the royal chamber; when a hostile ant comes within 10 BU, the queen moves to the deepest chamber with 2 escorts. Brood display: `min(24, ceil(B/10))` real brood items in the nursery; each one carried off removes `B / display` abstract brood (the rest are killed in the raid). Rival nests never auto-expand beyond the entrance rule.

### 3.5 Territory

| Constant | Value |
|---|---|
| `TERR_CELL` | 16 BU (coarse nav cell) |
| `TERR_COLONY_SLOTS` | 8 (slot 0 = player) |
| `TERR_DEPOSIT` | 1.0 per ant per second on the surface (player and rival ants) |
| Core deposit | every cell within `R_core = min(150, 40 + 0.1 N)` BU of each entrance receives 0.05 per s while N ≥ 20 and a > 0 (stands for unsimulated traffic) |
| `TERR_HALF_LIFE` | 2 gd (home-range marks, Lasius dossier 12.2); each shower/rain/storm event halves marks on exposed cells once |
| `CLAIM_MIN` | 20 |
| Claimed | `m_c ≥ 20` and `m_c ≥ 1.5 ×` the second-highest |
| Contested | two colonies ≥ 20 and ratio < 1.5 |

Scouts bias exploration away from own claimed cells (foraging chapter) and toward unclaimed ones; a rival's foraging is limited to its claimed cells plus a 100 BU fringe, so expansion of territory is what lets a colony grow (K_eff).

### 3.6 Encounters

| Step | Rule |
|---|---|
| Awareness | foreign ant within 3 L (odour/visual): orient toward or away by task |
| Recognition | antennal contact within 1.0 L, 0.5 s (GDD 01 `antennate` AI recognition) |
| Attack roll (AI) | `p = agg × terrF × stanceF × clamp(myMass/theirMass, 0.5, 1.5)^0.5`, capped 1; `terrF`: own claimed 1.3, contested 1.0, foreign 0.6, within 20 BU of own entrance 2.0; `stanceF` (player AI only, 4.9): cautious 0.5, defensive 1.0, aggressive 1.3; against a founding queen ×1.5 |
| No attack | ritual display 1-3 s (antennation and jerking; *L. niger* neighbours mostly display without aggression, Lasius dossier 9); then each side withdraws with p `1 − agg` (turns 120-180°, walks 5 L) |
| Re-roll | the same pair only after 20 s |
| Possessed ant | the foreign AI rolls; the player decides for the possessed ant |

### 3.7 Escalation, war and raids

Player-facing names of the relation states follow GDD 08 §6.4 (Neutral, Wary, Clashing, Territorial dispute, Lull for `peace`, `tension`, `skirmish`, `war`, `truce`); the ids and the design terms below are unchanged.

Per unordered colony pair, escalation `E` (transitions are evaluated in table order until stable within one hourly update): +1 per hostile recognition (max 1 per ant pair per 60 s), +2 per fight started, +3 per death in inter-colony combat, +0.05 per contested cell per hour, +10 per raid; decays with half-life 1 gd. Multipliers: `diff.warThresholdMult` divides the gains.

| State | Entry condition | Behaviour | Exit conditions |
|---|---|---|---|
| `peace` | start; E < 1.5 | normal encounters | E ≥ 3 → `tension` |
| `tension` | E ≥ 3 | rivals send patrols to contested cells (patrol share 20 % of fielded) | E ≥ 10 → `skirmish`; E < 1.5 → `peace` |
| `skirmish` | E ≥ 10 | patrols 40 %; attack rolls +0.1 in contested cells | E ≥ 30 and both N ≥ 50 and not winter → `war`; E < 6 → `tension` |
| `war` | as above | both sides commit war fielding (rival: up to its war cap) to the contested front; the front is the contested cells nearest both nests; cells change claim by local majority; raids possible | E < 15, or war lasted 1.5 gd with no claim change → `truce`; a side destroyed → removed |
| `truce` | from war | 1 gd: E capped at 25; attack rolls ×0.6 at the boundary | after 1 gd → `skirmish` if E ≥ 10 else `tension` |

**Raid (mature colonies).** In `war`, at each hourly update in active hours: if `R = S_att / S_def ≥ RAID_RATIO 2.0`, the attacker `knowsNest` (one of its agents came within 20 BU of a defender entrance), the raid cooldown (`diff.raidCooldownGd`) has elapsed and, for raids on the player, the threat director allows (6), then a raid starts with p 0.25. Party = `min(raidCap, 0.25 N_att, budget)` (`raidCap` = war cap). The party travels by nav grid, attacks entrances, enters, targets the queen and carries brood (same species: adopted; others: food) and corpses home. Ends when the party ≤ 30 % of its start, after 0.3 gd, or when ≥ 50 % of the party carry loot. *Formica rufa* may launch **predatory raids** at any relation state against colonies with `S_def ≤ 0.5 S_formica` (they take workers and brood as prey).

**Player raids.** A `rally` marker in mode `attack` placed within 30 BU of a known foreign entrance sends a party (default 30 % of foragers and guards, max 200) with the same behaviour; mode `defend` holds the area (4.9).

**Thief ants (lestobiosis).** A `solenopsis-fugax` colony within 120 BU (3D) of a chamber of another colony digs a thief tunnel toward that colony's nursery at 20 BU per gd (carve radius 0.25 BU, flagged too narrow for other species' walkers). On breach it steals 1 larva or egg per 30 s while fewer than 3 host ants are within 3 BU of the breach; the breach closes (back-filled) if ≥ 2 host ants stay within 2 BU of it for 60 s. Fugax raiders (up to 30) defend the breach with repellent stings.

### 3.8 Brood raiding among incipient colonies (T2, labelled gameplay)

Both colonies conspecific and incipient (N ≤ `INCIPIENT_MAX` 60). When a scout of A comes within 3 L of B's entrance, A `knowsNest(B)`. At the next hourly rival update, if `S_A ≥ 1.3 S_B` and A was not raided in the last 1 gd, A launches a brood raid with 60 % of its workers: carry pupae first, then larvae, to A's nursery. Stolen conspecific pupae eclose as A's workers; larvae are reared by A. If B loses all workers and brood, B's queen dies within 1 gd (abandoned). B's last ≤ 5 workers join A with p 0.5 each. Player-side: the player's AI raids only with stance `aggressive` or a `rally attack` marker. Rival incipients may raid the player only on naturalist/harsh and only after the player's first nanitics. Codex wording must state that brood raiding is documented in fire ants and *Messor* but not for *L. niger* (Lasius dossier 3; directions K).

Incipient rival model: queen + 12 abstract brood at founding; first workers 4.5 gd later (N = 12); field cap 6; then the normal model.

### 3.9 Destruction, aftermath, new foundations

| Event | Rule |
|---|---|
| Orphaned | all queens dead: no births, orphan decline 0.15 N per gd, aggression ×0.5, fielding ×0.5 |
| Destroyed | N < 5 while orphaned, or N = 0: event `rival-destroyed`; remaining agents wander and die within 0.5 gd; display brood become items (food or adoptable); queen corpse item; relations removed; marks decay naturally; journal milestone (GDD 06 owns the id) |
| Nest after destruction | the carve-grid nest stays, flagged `abandoned`: explorable, usable as a satellite (T3) or by a new foundation |
| New foundations | each gd of the species' flight window (GDD 06 §11.2; Lasius doy 9-13) at 16:00: if established rivals < setting, a vacant site (abandoned nest or valid founding site ≥ 250 BU from every nest) gets an incipient rival with p 0.3 (p 1.0 if all established rivals are gone and the setting > 0) |

### 3.10 Rivals and the founding queen

| Phase | Threat | Rule |
|---|---|---|
| Surface search | rival foragers and patrols | encounter rules with ×1.5 attack; queen 40 HP, bite 2.0, spray; site assessment shows rival scent = `m_c` of the cell (GDD 06/08); gentle: rivals never attack the player's founding queen |
| Sealed chamber, before nanitics | rival digging-in | only if the chamber lies in a cell claimed by a rival: p per gd `0.1 × min(1, m_c/100) × diff.foundingRivalMult` (gentle 0, naturalist 1, harsh 1.5) that 3-6 rival workers dig through (one real fight in the chamber); thief tunnels apply at harsh only |
| First workers | brood raids by incipient conspecifics (3.8) | naturalist/harsh |

---

## 4. Combat

### 4.1 Stats by caste (T2 for *Lasius* and the temperate roster; T3 others)

Guidance formula for new species: `maxHp ≈ 10 m^(2/3)`, `bite ≈ m^(2/3) × headFactor` (m in mg; headFactor workers 1.0, macrocephalic majors 1.5, Atta major 2.0, minims 0.8, queens 0.27, males 0.2), `pull = 3 m^(2/3)` for ants. Species data hold the final values.

| Species / caste | Mass mg | maxHp | Bite dmg | Bite cycle s | Pull | Armour | Special |
|---|---|---|---|---|---|---|---|
| LN `worker` | 1.0 | 10 | 1.0 | 1.0 | 3.0 | 0 | spray |
| LN nanitic (`worker`, scale 0.85) | 0.6 | 7 | 0.7 | 1.0 | 2.1 | 0 | spray |
| LN `queen` founding | 20 | 40 | 2.0 | 1.2 | 8 | 0.2 | spray |
| LN `queen` established | 33 | 50 | 2.0 | 1.4 | 9 | 0.3 | spray |
| LN `gyne` | 25 | 35 | 1.5 | 1.2 | 6 | 0.2 | spray |
| LN `male` | 0.8 | 6 | 0.2 | 1.0 | 1.0 | 0 | none |
| CP `minor` / `media` / `major` (T3) | 2 / 7 / 16 | 16 / 37 / 63 | 1.6 / 3.7 / 9.5 | 1.0 / 1.0 / 1.2 | 4.8 / 11 / 19 | 0 / 0 / 0.1 | spray |
| MB `minor` / `media` / `major` (T3) | 2 / 7 / 20 | 16 / 37 / 74 | 1.6 / 3.7 / 11 | 1.0 / 1.0 / 1.4 | 4.8 / 11 / 22 | 0.1 | sting (venom 0.8) |
| AT `minor` / `media` / `major` (T3) | 0.9 / 5.3 / 40 | 9 / 30 / 117 | 0.7 / 3.0 / 23 | 1.0 / 1.0 / 1.4 | 2.8 / 9 / 35 | 0 / 0 / 0.25 | none (major bite) |

Bite cycle = `bite` strike 0.5 s (GDD 01) + cooldown; AI and player share it.

### 4.2 Bite, hit and damage

- **Hit chance:** 0.7 against a free target × `clamp(sqrt(targetLen/attackerLen), 0.5, 1)`; 0.9 when the attacker holds the target; 1.0 when the target is pinned, seized or paralysed; × 0.5 while the attacker is disoriented; × 0.5 against a target that dodged within the last 0.25 s.
- **Damage:** `dmg = bite × M(n) × (1 − armour) × diff.damageTakenMult(target)`; `M(n) = min(2.0, 1 + 0.25 (n − 1))`, n = distinct hostile attackers that hit the target within the last 2 s including this hit.
- **Application:** `health −= dmg / maxHp`; death at health ≤ 0 (cause `combat`, or `predation` for creature damage; `bird` and `antlion` for those two).

### 4.3 Grapple: locks, pins, slots

| Rule | Value |
|---|---|
| Lock | a hitting `bite-hold` creates a pair lock (holder → target, slot = appendage); holder speed ×0.3 (GDD 01) |
| Contact slots | `clamp(round(4 × targetLen / attackerLen), 2, 12)`; where the local free radius < 1.5 L (tunnels) at most 2 |
| Movement under locks | target speed × `max(0, 1 − Σ pull_holders / pull_target)`; if a single holder's pull > target pull it may drag the target at 0.3 × cruise |
| Lock break | each second the target shakes one random holder off with p `pull_t / (pull_t + 2 Σ pull_h)`; the shaken holder is stunned 0.5 s; voluntary release on input up |
| Pin | holders ≥ 2 and `Σ pull_h ≥ 1.5 pull_t`: target cannot move or start a bite except against the holder in its front 60°; may still spray or sting |
| Partner death | locks on a dead entity end; the corpse remains an item |

### 4.4 Specials

| Special | Who | Rule |
|---|---|---|
| `spray-acid` | formicines (LN, CP; rival `lasius-*`, `formica-*`) | GDD 01: reserve `ACID_MAX` 5, regen 1 per 120 s, wind-up 0.8 + 0.3 s, cone 60°, range 1.5 L. Each hostile in the cone with a straight free segment from the gaster tip takes acid `2.5 × m^(2/3) × speciesSprayMult` over 2 s (× target acid sensitivity: ants 1.0, creatures per 2.2); hostile ants hit: 50 % chance to release their locks and disoriented 1 s (speed and hit ×0.5); creatures: deterrence +0.35 × sensitivity; nestmates: no damage. Deposits `alarm` (strength 1.0, radius 2 L). `SPRAY_COOLDOWN_S` 3 after recovery |
| `sting` | myrmicines (MB T3; rival `tetramorium`, `myrmica`, `fugax`) | in contact (locked either way or within 0.3 L); wind-up 0.3 s; damage `2.0 × m^(2/3) × venom` over 2 s; cooldown 5 s; fugax: 1.0 + target flees 3 s |
| `release-alarm` | all adults except males | hold `special` ≥ 500 ms (GDD 01): burst radius 10 L, +0.8 alarm to nestmates, `alarm` deposit 2.0; cooldown 5 s |
| `drum` (T3) | CP | alarm burst radius 15 BU inside wood |
| `block-opening` (T3) | CP, MB, AT majors | blocks an opening < 1.5 L: attackers must pin the blocker before passing |

### 4.5 Alarm and recruitment

| Trigger | Burst radius | Alarm added to nestmates | Pheromone deposit |
|---|---|---|---|
| Bitten or stung | 6 L | +0.5 | 1.0 |
| Sprayed by enemy / own spray | 6 L | +0.5 | 1.0 |
| Nestmate killed within 3 L | 6 L | +0.7 | 1.5 |
| Predator strike witnessed | 6 L | +0.5 | 1.0 |
| `release-alarm` | 10 L | +0.8 | 2.0 |

Each ant's `alarmLevel` decays with half-life 10 s. An ant whose `alarmLevel ≥ θ_fight` switches to `fight` toward the alarm source (the attacker if known, else up the `alarm` gradient). `θ_fight`: foragers, guards, patrols 0.3; other surface workers 0.5; nurses 0.9 (0.6 inside the nest when an intruder is in a brood chamber, where nurses first carry brood away). Recruit caps: `FIGHT_RECRUIT_CAP = max(10, 25 % of workers)`, 60 % while the nest is invaded. The `alarm` channel's decay is GDD 02 §8's (`ALARM` half-life 15 s at 22 °C; the individual `alarmLevel` above is separate). Biology note: formicine alarm is a blend (Dufour's gland compounds attract, formic acid excites); the game's "spray raises alarm" keeps the directions' intent (Lasius dossier 9).

### 4.6 Retreat and disengagement

| Rule | Value |
|---|---|
| `RETREAT_HEALTH` | 0.35 outside; 0.15 inside the own nest or defending queen/brood; species override (Myrmica 0.2) |
| `RETREAT_RATIO` | flee when hostile strength within 5 L ≥ 2.5 × friendly and the cell is not own-claimed |
| Pinned or seized | cannot flee; struggles (seized) or keeps fighting |
| Stalemate | no damage to either side for 30 s: each releases with p 0.5 per s |
| Fleeing | drop carried items except brood; path home; `flee` task ends at home or after 60 s without pursuit |

### 4.7 Injuries, recovery, death, corpses

| Rule | Value |
|---|---|
| Injury roll | at fight end, survivors that lost ≥ 0.3 health in the fight roll: leg loss p 0.3 (speed ×0.85, climb ×0.75; cumulative cap ×0.7), antenna loss p 0.15 (perception ×0.6, trail-following noise ×2), gaster wound p 0.1 (special disabled) |
| Recovery | health +0.25 per gd in the nest with crop C > 0; +0.1 per gd elsewhere; injuries are permanent |
| Consequences | injured workers' remaining mean lifespan ×0.7; allocation bias toward `forage`/`guard` +0.2 (colony chapter) |
| Death | corpse item: bulk = mass/2 mg (LN worker 0.5), P = 0.4 × mass mg (LN worker 0.4 P), species, colony; `necroCueTick` = death + 60 s (necrophoresis cue for nestmates, colony chapter); enemy corpses are protein for foragers; decay as 1.6 |
| Possessed ant | death → GDD 01 3.7 |

### 4.8 What the possessed ant can do

| Verb | Binding (GDD 01) | Rule here |
|---|---|---|
| Bite | tap `bite` (LMB/Q) | 4.2; 1.0 s cycle |
| Hold / grapple | hold `bite` | 4.3; release on button up |
| Spray (formicines) / sting (myrmicines, T3) | tap `special` (RMB/C) | 4.4 |
| Call for help | hold `special` ≥ 500 ms | `release-alarm` |
| Dodge (new primitive `dodge`, T2) | proposed: tap `hurry` (< 200 ms) while a direction is held; gamepad LS-click tap | displacement 3 L in 0.25 s in the input direction (backward if none); cooldown 1.5 s; not while seized, pinned or carrying a load > 0.5 carryCap; bites against it ×0.5 hit for 0.25 s |
| Drop off | tap `foot` on a wall/stem (`let-go`) | escapes stem-hunting predators and caterpillar fights |
| Struggle | any `bite`/`special`/sharp direction change while seized or stuck | 2.4 meter |
| Inspect threat | `antennate` (T) | creature card: kind, state ("stalking", "about to strike"), flee condition hints |

HUD (GDD 08): health, acid charges, lock state ("holding", "held by 2", "pinned"), `possessed-danger` alert "pinned"/"seized".

### 4.9 Colony stance and rally modes (proposed directive, T2)

`stance` directive: `cautious` (attack roll ×0.5; contested cells cost ×3 for routes; no raids), `defensive` (default), `aggressive` (attack ×1.3; patrols contested cells; AI may brood-raid incipient conspecifics). `rally` marker modes: `defend` (gather in radius, engage hostiles inside it) and `attack` (assault; at a foreign entrance it is a raid, 3.7).

### 4.10 Combat edge cases

| Case | Handling |
|---|---|
| Fight inside tunnels | slot cap 2; spray cone clipped by free-segment test; corpses block until hauled (count as items in the tunnel) |
| Fight on a stem or wall | a shaken-off holder falls (`let-go` physics); pinned target cannot fall |
| Ants of three colonies in one melee | each hit counts its own attacker's colony for M(n); escalation updated per pair |
| Possession changes mid-fight | locks and seizure persist; AI resumes per GDD 01 3.5 priority 1 |
| Budget exhausted during an invasion | defenders preempt rival foragers (absorbed early); player ants are never despawned |
| Save during fight | locks, seized, alarm levels are plain fields; autosave defers (GDD 08) |
| Target despawns (creature) mid-lock | lock ends; holder resumes |
| Queen involved | `queen-in-danger` alert when the player queen takes damage or a hostile is within 3 L of her |

---

## 5. Difficulty and balance levers

Preset values; custom rules (GDD 08) override the matching rows.

| Lever | Gentle | Naturalist | Harsh |
|---|---|---|---|
| Predators setting (caps and spawn ×; Off = none) | Few ×0.4 | Normal ×1.0 | Many ×1.6 |
| `predatorDamageMult` (strike and venom) | 0.6 | 1.0 | 1.25 |
| `telegraphMult` | 1.5 | 1.0 | 0.75 |
| Predators may target the player's founding queen | no | yes | yes |
| Predator exclusion around the player nest until 5 workers | 120 BU | 40 BU | 0 |
| `AI_DODGE_P` | 0.5 | 0.3 | 0.2 |
| Rival colonies (setting) / incipient conspecifics | 2 / 1 | 3 / 2 | 4 / 3 |
| `rivalKMult` / `rivalGrowthMult` / `rivalAggMult` | 0.6 / 0.7 / 0.7 | 1 / 1 / 1 | 1.3 / 1.2 / 1.2 |
| `raidCooldownGd` (raids on the player) | 4 | 2 | 1 |
| Raids on the player before 50 workers | never | incipient brood raids only | allowed |
| `warThresholdMult` | 1.5 | 1.0 | 0.75 |
| `foundingRivalMult` | 0 | 1 | 1.5 |
| `foodAbundanceMult` (units per node, pools, refill) | 1.3 | 1.0 | 0.75 |
| `carrionMult` | 1.3 | 1.0 | 0.8 |
| `aphidPredatorMult` | 0.5 | 1.0 | 1.3 |
| `baitToxicityMult` | 0.3 | 1.0 | 1.5 |
| `damageTakenMult` for the possessed ant | 0.75 | 1.0 | 1.0 |
| Lean-season safety net (6, I8) | on | off | off |
| `THREAT_MIN_QUIET_GD` | 1.0 | 0.5 | 0.25 |
| `QUIET_SHARE_MIN` (I11 target) | 0.75 | 0.60 | 0.40 |

---

## 6. Ecosystem invariants (28-day year) and the threat director

**Threat director.** Major threats against the player colony: bird events, raids on the player nest, centipede nest invasions, *Formica* predatory raids, rival digging into the founding chamber. At most one active; a new one may start only `THREAT_MIN_QUIET_GD` after the last ended; a blocked raid is deferred to the next hourly check, a blocked bird or centipede event is cancelled.

| # | Invariant | Mechanism | Test bound |
|---|---|---|---|
| I1 | Conservation and non-negativity | nutrients enter only from sources and cheats; all amounts, counts, densities ≥ 0 | any negative or NaN fails |
| I2 | Prey never vanish | patch immigration `0.05 K` per gd | patch count ≥ 0.05 K by the end of any active day |
| I3 | Herds recover each year | eggs + migrants (`MIGRANT_P`) | occupied host fraction ≥ 0.35 during days 7-14 |
| I4 | Aphid predators track aphids | arrival ∝ A; caps per aphids | ladybirds ≤ 1 per 300 aphids + 1 |
| I5 | Ant predators bounded | resident caps | per-kind count ≤ cap × setting; total creatures ≤ 260 |
| I6 | Rivals bounded | K_eff, store caps, founding rule | 0 < established ≤ setting (when setting > 0, after the first flight window); N ≤ K_max × rivalKMult |
| I7 | Agent budget | `RIVAL_AGENT_BUDGET` | player + rival ants ≤ 2500 at every tick |
| I8 | No starvation by ecology alone (gentle) | safety net: if C stores < 1 gd of upkeep and no discovered C source with ≥ 5 loads within 400 BU for 0.5 gd in an active season, spawn a windfall or flower cluster 150-300 BU from the nest | gentle only |
| I9 | Escalation bounded | one war per colony at a time; one raid on the player at a time | — |
| I10 | Determinism | named RNG streams; no wall-clock | identical state hash for identical seed + commands |
| I11 | Quiet share (seed pillar 6, brief §5) | Measured over daytime game hours (day phase not `night`) in any trailing window of `QUIET_WINDOW_GD` = 3 GD, excluding hours in colony stage `founding` or season `winter`. An hour is *quiet* when no major threat (above) is active at any time in it and no player-colony alert of level `warning` or `critical` is active for 25 % of the hour or more. Quiet hours / counted hours ≥ `QUIET_SHARE_MIN` (Naturalist 0.60; Gentle 0.75; Harsh 0.40). Mechanism: the threat director keeps the trailing share; while it is below `QUIET_SHARE_MIN + 0.05`, a new major threat is handled as if `THREAT_MIN_QUIET_GD` had not elapsed (raid deferred, bird or centipede event cancelled). Colony-caused warnings (food, crowding, heat) are never suppressed; if the soak fails, tune `THREAT_MIN_QUIET_GD`, raid cooldowns and human-event frequency (GDD 04 §15), not alert thresholds | soak check E25: share ≥ target in every window of every seed |

Expected naturalist bands for a 28-day soak (balance targets, not hard asserts): map aphids at peak (days 8-11) 1500-9000; carrion drops 20-60 per active gd; rival N stays within 0.5-1.6 × N0 when the player does not interfere.

---

## 7. Deviations from the directions (with reasons)

| Direction | Change | Reason |
|---|---|---|
| F: rivals 2-4 per map | 0-4 by custom rule (GDD 08), plus 1-3 incipient conspecific foundations | brood raiding needs incipient neighbours; incipients are small and short-lived |
| F: "spray raises alarm" | kept; biology note that formic acid itself excites and Dufour's compounds attract | Lasius dossier 9 |
| F: "Formica-like predators" | `formica-rufa` with a capped abstract colony (K 400 of CP 6) | real wood-ant colonies (100 000-400 000) cannot be simulated; strength is carried by CP |
| F: thief ants | European `solenopsis-fugax` for temperate maps (estimate, unverified); `solenopsis-molesta` for `southern-us` | the dossier's thief ant is North American |
| F: phorids | T3 and disabled for *Lasius* by default | dossier: likely absent in the temperate suburban default |
| K: brood raiding | labelled gameplay; codex must not overstate | not documented for *L. niger* |

---

## 8. New identifiers added by this chapter

- Food variants: `aphid-herd`, `honeydew-film`, `scale-herd`, `flower`, `extrafloral-nectary`, `berry`, `windfall`, `insect-small`, `insect-medium`, `insect-large`, `large-carcass`, `elaiosome-seed`, `grass-seed`, `crumb-starch`, `crumb-fatty`, `crumb-protein`, `crust`, `sugar-granules`, `sugary-spill`, `sticky-residue`, `kibble`, `wet-pet-food`, `bait-gel`, `water` (variant of `dew`).
- Item kinds: `food-piece`, `carcass`, `corpse`, `live-aphid`, `seed` (shared with GDD 01's list).
- Carrion stages: `fresh`, `ripe`, `putrid`, `husk`. Host classes: `herb`, `shrub`, `tree`.
- Creature variants: caterpillar `small`, `medium`, `hairy`; bird `thrush`, `sparrow`, `woodpecker`. Hazards: `antlion-pit`, `spill-pool`, `slime-trail`.
- Ant/creature states: `seized`, `pinned`, `paralysed`, `stuck`, `disoriented`. Injuries: `leg`, `antenna`, `gaster`. Death causes (canonical list in `00-index.md` §B): `combat`, `predation`, `bird`, `antlion`, `poison`, `drowning`, `parasitoid` (the earlier `predator` and `toxin` are renamed to GDD 06's `predation` and `poison`).
- Task: `raid`. Primitive: `dodge`. Directive: `stance` (`cautious`, `defensive`, `aggressive`). Rally modes: `defend`, `attack`.
- Regions (GDD 04 ids, not new): `temperate-eu`, `ne-america`, `mediterranean`, `southern-us`. Rival species: `tetramorium-immigrans`, `myrmica-rubra`, `formica-rufa`, `solenopsis-fugax`, `lasius-flavus`, `formica-subsericea`, `tapinoma-sessile`, `linepithema-humile`, `tapinoma-nigerrimum`, `pheidole-pallidula`, `solenopsis-invicta`, `solenopsis-molesta`.
- Relation states: `peace`, `tension`, `skirmish`, `war`, `truce`. RNG streams: `rng.ecology`, `rng.creatures`, `rng.rivals`, `rng.combat`.
- Diagnostics: `diag-carb-sources`, `diag-honeydew`, `diag-protein-sources`, `diag-threats`, `diag-rivals`, `diag-combat-losses`, `diag-toxin`.

---

## Appendix A — State required

| Name | Type sketch | Purpose |
|---|---|---|
| `ecology.sources` | `FoodSource[] {id, kind, variant, pos, up, units, unitBulk, c, p, toxin, water, pool?, poolCap?, refillPerGd?, quality, hardness, slots, drinkRateMult, stage?, stageClock?, discoveredBy: number (bitmask), avoidBy: number, spawnedTick}` | food nodes |
| `ecology.herds` | `Herd[] {id, hostId, hostClass, segment, A, E, pool, tend, hostQuality, tenderColony, tenderSeconds: Float32Array(8), predators: number[], mownUntilTick, filmSourceId}` | aphid herds |
| `ecology.hostPlants` | `{id, plantId, hostClass, herdId \| -1}[]` | host availability |
| `ecology.preyPatches` | `{id, center, radius, kind, count, K}[]` | springtail/mite patches |
| `ecology.hazards` | `{id, kind, pos, radius, depth, state, knownBy}[]` | antlion pits, spill pools, slime trails |
| `ecology.items` (extension of the shared item array) | `{kind, foodKind, variant, c, p, toxin, water, bulk, lengthMm, massMg, hardness, carriers: number[], stage, stageClock, necroCueTick, species, colonyId, unreachableBy, aliveUntilTick (live-aphid)}` | carried and lying food, carcasses, corpses |
| `ecology.director` | `{lastRunTick, perKindCounts, territories: {kind, center, radius, occupantId, vacantUntilTick}[]}` | spawning |
| `ecology.birdEvent` | `{active, variant, pos, phase, startTick, kills, carves} \| null` + `lastBirdTick` per colony | bird event |
| `ecology.carrionAcc` | `Float32Array` per variant per zone | fractional spawn accumulators |
| `creatures` | `Creature[] {id, kind, variant, pos, up, fwd, health, state, stateTimer, target, homeCenter, homeRadius, deterrence, harass, seizedAntId, eaten, lifeEndTick, nestId?}` | creature agents |
| `rivals` | `RivalColony[] {colonyId, species, N, B, C_s, P_s, queens: number[], nestId, agg, knowsNest: number, orphaned, incipient, raid: {targetColony, partyIds, startTick, startSize} \| null, lastRaidTick, fieldedIds: number[], virtualTend: number}` | abstract colonies |
| `relations` | `{a, b, state, E, stateSinceTick, warFront: number[] (cells)}[]` | escalation |
| `territory` | `{cell: 16, w, h, slots: 8, marks: Float32Array(w*h*8)}` | home-range ownership |
| `danger` | `Float32Array(w*h)` | player colony danger grid |
| `threatDirector` | `{activeKind \| null, activeSinceTick, lastEndTick}` | pacing |
| Ant combat fields (on ants) | `{health, maxHp (species data), injuries: bitflags, acid, acidRegenTick, specialCdTick, biteCdTick, dodgeCdTick, dodgeUntilTick, lock: {targetId, targetType, slot} \| null, heldBy: number[], pinned, seizedBy, escape, paralysedUntilTick, stuckSinceTick, alarmLevel, disorientedUntilTick, fightDamage, recentHitters: {id, tick}[]}` | combat state |
| Colony fields | `toxinPool`, `stance` | bait, stance |

## Appendix B — Commands

| Command / intent | Payload | Effect |
|---|---|---|
| Player intent `bite` / `bite-hold` / `special` / `special-hold` / `dodge {dir}` / struggle inputs | per GDD 01 intent | combat verbs (4.8) |
| `action {actionId: 'carry-aphid' \| 'put-down' \| 'tend-aphid' \| 'cull-aphid', target}` | target id | herd interactions |
| `placeMarker {kind: 'rally', pos, radius, params: {mode: 'defend' \| 'attack'}}` | — | defence or raid (3.7) |
| `placeMarker {kind: 'avoid', pos, radius}` over a bait/predator/pit | — | quality 0 / danger 3 |
| `setDirectives {stance}` | `cautious \| defensive \| aggressive` | 4.9 |
| Debug `cheat.spawnCreature` | `{kind, variant?, pos, state?}` | test |
| Debug `cheat.spawnFood` | `{kind, variant, pos, units?, stage?}` | test |
| Debug `cheat.setHerd` | `{herdId, A?, E?, pool?, tend?, frozen?}` | test (frozen: no growth/production) |
| Debug `cheat.setRival` | `{colonyId, N?, B?, C_s?, P_s?, agg?}` | test |
| Debug `cheat.setRelation` | `{a, b, E?, state?}` | test |
| Debug `cheat.triggerRaid` / `cheat.triggerBird` / `cheat.triggerNestInvasion` | `{attacker, target}` / `{variant, pos}` / `{colonyId}` | test (bypass director if `force`) |
| Debug `cheat.killQueen` | `{colonyId}` | test |
| Debug `cheat.combatFlags` | `{noRetreat?, noInjury?, noRng?}` | deterministic duels |
| Debug `query.ecology` / `query.rivals` / `query.territory(pos)` / `query.creature(id)` | — | read-outs |

## Appendix C — Events

| Event | Payload | Consumers |
|---|---|---|
| `food-source-spawned` / `-discovered` / `-exhausted` / `-removed` | `{sourceId, kind, variant, pos, colonyId?, cause?}` | render, UI alert `source-exhausted`, journal |
| `carrion-stage-changed` | `{sourceId \| itemId, stage}` | render (decay look) |
| `herd-founded` / `herd-collapsed` / `herd-dormant` / `herd-hatched` | `{herdId, A, cause?}` | render, journal, codex `cx-aphid-tending` |
| `herd-predator-arrived` / `-repelled` / `-left` | `{herdId, creatureId, kind}` | UI notice, audio |
| `aphid-moved` / `aphid-culled` | `{fromHerd, toHerd?, antId}` | journal, codex |
| `prey-subdued` / `prey-escaped` | `{creatureId, kind, antIds}` | audio, journal |
| `coop-transport` (single event owned by GDD 02 App C; phases `start`, `stalled`, `cut` (= butchered), `delivered`, `abandoned`) | `{itemId, carriers, bulk, phase}` | render, diagnostics |
| `creature-spawned` / `creature-despawned` / `creature-died` | `{id, kind, cause?}` | render, audio |
| `predator-telegraph` | `{creatureId, targetId, strikeAtTick, aimPoint, kind}` | render (pose), audio, HUD, comfort ring |
| `predator-strike` | `{creatureId, targetId, hit, damage}` | render, audio, alert `predator-near` |
| `ant-seized` / `ant-freed` / `ant-paralysed` / `ant-stuck` | `{antId, by}` | HUD `possessed-danger`, render |
| `antlion-flick` / `antlion-grab` | `{hazardId, antId}` | render, audio |
| `bird-approach` / `bird-landed` / `bird-peck` / `bird-left` | `{variant, pos, targetId?, kills}` | render (shadow), audio `bird-strike`, alerts |
| `rival-encounter` | `{a, b, pos, outcome: 'fight' \| 'display' \| 'withdraw'}` | journal (first), diagnostics |
| `rival-relation-changed` | `{a, b, from, to, E}` | alert, journal |
| `rival-raid-started` / `-ended` | `{attacker, target, partySize, loot}` | alerts `raid-seen`, `nest-attacked` |
| `brood-raided` | `{from, to, count, stage}` | journal, alert |
| `rival-queen-killed` / `rival-orphaned` / `rival-destroyed` / `rival-founded` | `{colonyId, species, pos}` | journal milestone, codex |
| `combat-hit` | `{attackerId, targetId, dmg, kind: 'bite' \| 'sting' \| 'acid' \| 'predator'}` | audio `mandible-snap`, render |
| `combat-lock` / `combat-unlock` / `combat-pin` | `{holderId, targetId}` | render poses, HUD |
| `combat-spray` | `{antId, pos, dir, hitIds}` | render plume, audio, alarm |
| `ant-died` (cause from 8) | `{antId, colonyId, cause, pos}` | lifecycle, journal, epitaph causes |
| `ant-injured` | `{antId, injury}` | render (missing leg/antenna), inspect |
| `alarm-raised` | `{colonyId, pos, strength, source}` | audio `alarm-burst`, scent view |
| `toxin-delivered` / `toxin-deaths` | `{colonyId, loads \| deaths}` | diagnostics, alert |
| `thief-tunnel-breach` / `-closed` | `{thiefColony, hostColony, chamberId}` | alert `nest-attacked`, render |

Alert triggers owned here (kinds from GDD 08): `predator-near` (an ant predator in Stalk/Ambush/WindUp within 15 BU of the possessed ant or of ≥ 3 foragers; cooldown 0.1 gd per creature), `nest-attacked` (≥ 3 hostile ants, a centipede, or a thief breach inside the player nest; clears after 30 s without), `raid-seen` (≥ 3 rival agents within 40 BU of a player entrance, or a raid party within 80 BU), `queen-in-danger` (4.10), `source-exhausted` (1.9), `possessed-danger` sub-causes "pinned", "seized", "stuck".

## Appendix D — Diagnostics ("why" view)

| Id | Status | Limiting factors (weighted) | Remedies |
|---|---|---|---|
| `diag-carb-sources` | C income vs upkeep (loads/gd) and trend | herds untended (% of herd output lost to `UNTENDED_PROD`), herd predators (aphids eaten/gd), season (aphid crash, flowers closed), rival competition (% of known-source output taken by rivals), distance (sources > 600 BU), bait avoidance | allocate more `tend`; defend herds; forage marker on a flower cluster; move aphids to unoccupied hosts |
| `diag-honeydew` (per herd card too) | A, trend, production, tend %, pool | tenders short (need ceil(A/50)), predators present, host quality, temperature factor, mown | send tenders, drive off ladybirds, relocate aphids |
| `diag-protein-sources` | P income vs larval demand | few prey patches in range, carcasses unretrieved (stalled transports, unreachable), carrion putrid, rival competition, danger-grid avoidance | forage marker at a patch, recruit to a carcass, cull aphids (if herds are large) |
| `diag-threats` | deaths per cause last gd | per predator kind, birds, antlion pits, drowning, toxin; danger hotspots | avoid markers, keep foragers in groups, reroute trails, block entrances |
| `diag-rivals` | per rival: relation, R, contested cells, last raid, raid risk (R ≥ 2 and knows nest) | territory overlap, rival strength growth, our losses | stance, defend rally at entrances, raid an orphaned/weak rival, expand territory elsewhere |
| `diag-combat-losses` | workers lost in fights last gd; injured share | outnumbered fights, fights outside territory, few guards | stance `cautious`, rally `defend` |
| `diag-toxin` | `toxinPool`, deaths per gd | bait station id and distance | avoid marker on the station |

Inspect cards: creature (kind, state word and reason, e.g. "stalking: lone ant nearby"), herd, source (amount, stage, quality, slots in use), rival nest (species, estimated N band: tens / hundreds / thousands, relation).

## Appendix E — Acceptance checks (`?test=1&seed=1&quality=low&autostart=1`, debug API)

1. **Herd production.** Given a herd set with `cheat.setHerd {A: 100, tend: 1, pool: 0, frozen: true}` at 20 °C, when 150 s (0.25 gd) elapse with no tenders draining, then `pool` = 2.5 ± 0.05 loads; after a further 600 s `pool` = 3.0 (cap `1 + 0.02 × 100`) and the herd's `honeydew-film` holds 0.5 loads (its cap, fed by the overflow).
2. **Tend decay.** Given `tend: 1.0` and no tenders, when 60 s elapse, then `tend` = 0.37 ± 0.02.
3. **Droplet.** Given pool 0.10, when the possessed worker performs `tend-aphid`, then no droplet is released and crop is unchanged; with pool 1.0, one cycle adds 0.15 C to the crop and pool = 0.85.
4. **Ladybird feeding and harassment.** Given a frozen herd of A = 100 and a spawned `ladybird` feeding, with no ants, when 120 s elapse, then A = 80 ± 1; when 6 ant bites hit it, then within 2 s it is in FlyOff and `herd-predator-repelled` is emitted.
5. **Seasonal herd cycle.** Given a herb herd with E = 10 on day 28 23:00, when time passes to day 1 07:00, then A = 8; on day 22 every herd has A = 0 and E = min(20, round(0.1 × season max)).
6. **Solo vs cooperative transport.** Given an `insect-medium` carcass (bulk 5) and one LN worker, when it drags, then the item does not move (1.0 < 2.5); given 4 workers attached, then item speed = 0.4 × cruise × min(1, 4/5) = 0.32 × cruise ± 5 %.
7. **Butcher decision.** Given a dead medium caterpillar (bulk 25, 22 mm) and 12 available workers, when AI handles it, then it is torn (12 < 0.75 × 25), each torn piece has bulk 1.0 and 0.8 P, and after all pieces are removed the carcass is gone and Σ P delivered + remaining = 20 P.
8. **Carrion stages.** Given an `insect-small` carcass (no fly larvae) at a constant 20 °C under clear weather, then it becomes `ripe` at 300 s ± 1 tick, `putrid` at 900 s, `husk` at 2400 s and is removed at 3600 s; at 30 °C each time halves.
9. **Lasius duel.** Given two LN workers of different colonies mutually locked with `cheat.combatFlags {noRetreat: true}`, when they fight, then one dies between 9.5 s and 16 s after locking in ≥ 95 % of 100 seeds (10 hits of 1.0 at p 0.9, first hit 0.5 s after the lock).
10. **Pin and outnumbering.** Given one rival LN worker attacked by 4 player workers (its 4 contact slots), 2 of which hold it (Σ pull 6 ≥ 4.5), then it is `pinned`, every bite hits, the first volley deals 1.0 + 1.25 + 1.5 + 1.75 = 5.5, every later hit deals 1.75, and it dies in the second volley, 1.0 s ± 0.1 s after the first.
11. **Acid spray.** Given a possessed LN worker with 5 charges facing two rival workers at 1.2 L (inside the 60° cone) and 1.8 L, when it sprays, then charges = 4, the first rival loses 0.25 health over 2 s (2.5 dmg), the second is untouched, an `alarm` deposit of 1.0 exists at the ant, a second spray is refused for 3 s after recovery, and the charge is back to 5 after 120 s.
12. **Jumping spider telegraph and dodge.** Given a resident `jumping-spider` stalking a lone possessed LN worker on a wall (naturalist), when the spider enters WindUp, then `predator-telegraph` is emitted with `strikeAtTick − nowTick ≥ 6` ticks; if the player dodges 3 L sideways during the wind-up the strike misses; if not, the worker takes 9 damage, is `seized`, and dies within 2.2 s unless freed.
13. **Struggle.** Given a possessed LN worker seized by a `rove-beetle` (hold 1.5/s) at full health, when the player provides 4 struggle inputs per second, then it is freed after 3.7 s ± 0.2 s with health 0.15 ± 0.03 (grab 3 + 5.6 hold damage); with 2 nestmates biting the beetle, the beetle releases the worker as soon as both have hit (secretion, then flee).
14. **Antlion pit.** Given an AI worker placed on an antlion pit slope, then its upslope speed is ×0.4 and the antlion flicks every 0.8 s; once grabbed with no help it dies (drag 1.5/s, AI struggle 2 inputs/s) within 6.7 s ± 0.3 s; nestmates who witnessed it mark the pit as known and no nestmate path enters `radius + 1 L` afterwards.
15. **Bird event.** Given 20 exposed player workers within 25 BU of the mound by day and Predators Normal, when `cheat.triggerBird {variant: 'thrush'}` fires, then `bird-approach` precedes `bird-landed` by 3.0 s, pecks occur every 1.5 s, kills ≤ 12, and workers under overhead cover are never targeted.
16. **Bait toxicity.** Given a player colony with `toxinPool` 0 and 2.0 loads of bait delivered at once, when 1 gd elapses, then 3 or 4 adult worker deaths have cause `poison`, `toxinPool` = 1.10 ± 0.02, and `diag-toxin` names the station.
17. **Territory decay and claim.** Given a cell with player marks 100 and no deposits or rain, when 2 gd elapse, then marks = 50 ± 0.5; a cell with rival 30 and player 25 is contested (ratio < 1.5), with rival 40 and player 25 it is claimed by the rival.
18. **Escalation to war and truce.** Given two established colonies with N ≥ 50 in summer and `cheat.setRelation {E: 31}`, then within one hourly update the state is `war`; given no further contact, then the state becomes `truce` when E < 15 (about 1.05 gd later) and `tension` or `skirmish` 1 gd after that.
19. **Orphan decline and destruction.** Given a rival with N = 100, B = 0, ample stores and `cheat.killQueen`, then births stop, N = 83.5 ± 1 after 1 gd (hourly steps of 0.18/24), and `rival-destroyed` fires when N < 5; its territory cells drop below `CLAIM_MIN` within 2 gd once no deposits remain.
20. **Brood raid among incipients.** Given two incipient conspecific colonies (player 12 workers stance `aggressive`, rival 6 workers) and a player scout reaching the rival entrance, then a player brood raid starts at the next hourly update with 7 ± 1 workers (S 9 vs 4.8, ratio ≥ 1.3), rival pupae carried into the player nursery later eclose as player-colony workers.
21. **Agent budget.** Given a 28 gd naturalist soak (`tools/sim`, seeds 1-5) with 4 rivals and forced wars, then player + rival ants ≤ 2500 at every tick and creature agents ≤ 260.
22. **Ecosystem soak.** Given the same soak without player input, then on days 7-14 ≥ 35 % of host plants hold herds, every prey patch has count ≥ 0.05 K at the end of each active day, no nutrient amount is negative or NaN, and established rivals never exceed the setting.
23. **Gentle founding protection.** Given gentle and a founding queen walking on the surface inside a rival-claimed cell, when rival workers contact her, then no attack occurs and no predator targets her; on naturalist a contact by 3 rival workers starts a fight.
24. **Determinism.** Given seed 7 and an identical command log, when two runs advance 1 gd, then the serialized ecology, creature, rival and territory state hashes are equal.
25. **Quiet share (I11).** Given a 28 gd soak (`tools/sim`, seeds 1-5, Lasius, Standard `suburban-garden`, default rules) for each preset Gentle, Naturalist and Harsh, with the player colony run by AI only (default directives, no possession), when the I11 share is computed hourly over every trailing 3-GD window of daytime hours outside `founding` and `winter`, then every window meets `QUIET_SHARE_MIN` (0.75 / 0.60 / 0.40), and at least one major threat occurred in each Naturalist and Harsh run (quiet is not achieved by switching threats off).

## Appendix F — Cross-chapter assumptions

1. **GDD 01 (controls, primitives):** adds primitive `dodge` (tap `hurry` < 200 ms + direction; gamepad LS-click tap) and a cull variant of `bite` on herds; `harvest-liquid` multiplies its rate by the source's `drinkRateMult`; `bite` cycle is 1.0 s for AI and player; struggle inputs are the inputs listed in 2.4; `spray-acid`, `release-alarm`, `drag`, `tear`, `tend-aphid`, `carry-aphid` values are taken as GDD 01 states them.
2. **Colony / economy chapter:** stores hold `toxinPool`; deliveries carry `toxin` and `water`; the protein-deficit flag exists; corpses with `necroCueTick` are hauled to the midden; injured-worker allocation bias; `θ_fight` thresholds per task are part of the response-threshold model; queen death and orphaning follow GDD 06.
3. **Foraging chapter:** uses `quality`, `odour radius`, `slots`, the exhausted/unreachable flags, the danger-grid cost multiplier and scouting bias away from own claimed territory cells; recruitment to carcasses uses the item recruitment odour.
4. **Pheromone (GDD 02 §8):** `alarm` channel with a half-life of 15 s at 22 °C (GDD 02 owns) and deposit strengths as listed; optional per-colony layers for rival `trail`/`home` used only for display; the territory grid here is separate from the player's `home` channel.
5. **Locomotion / nav:** walkers expose a collision radius so that a 0.25 BU-radius thief tunnel blocks non-fugax ants; antlion pit slopes report "loose sand" with a downslope slip; liquid interiors of spills are non-walkable; nav grid supports cost multipliers per 16 BU cell.
6. **Nest chapter:** carve ops for rival nests, woodpecker carves, thief tunnels and back-fill; chamber humidity accepts water deliveries; BFS fields usable by centipedes and rival raiders; entrances expose catchment and throat positions.
7. **GDD 06 (environment, progression):** provides surface/air temperature queries, `dewLevel`, rain events and classes, puddles and drowning, "exposed" definition, flight windows, winter time-lapse hook (this chapter supplies rival/herd/creature winter rules), milestone and codex ids (`ms-first-rival-defeated`, `cx-*` creature entries), difficulty storage of the levers in section 5, death-cause list extended by section 8.
8. **Human-activity chapter:** emits `food-drop`, `spill`, `children`, `sweeping`, `vacuum`, wiping, `mowing`, `bait-station` with an area; this chapter creates/removes the food nodes and herd effects.
9. **Reproduction chapter:** alates launching near a landed bird are exposed (2.6); player nuptial flights do not create on-map rival colonies.
10. **GDD 08 (UI, audio, art):** renders comfort levels as in 2.1, shows rally modes `defend`/`attack` (replacing the provisional "Gather" label), shows the `stance` directive, uses the alert triggers of Appendix C, maps creature cues to `creature-step`, `bird-strike`, `alarm-burst`, and shows rival territory from the territory grid in the threats and scent overlays.
11. **Worldgen chapter:** places host plants, flowers, EFN, elaiosome patches, fruit trees, prey patches, creature territories, antlion pits (sheltered dry sand only), rival nest sites (GDD 04 §12.4 values: established rivals ≥ 600 BU apart and ≥ 800 BU from the start; incipients 300-800 BU from the start) and validates food in range (1.3).
12. **Species data (T3):** each species file provides caste combat stats (4.1), `loadScale`, special type, and its ecology profile (unit multipliers, region roster, phorid enablement).
13. **Architecture:** rival agents share the ant entity array with `colonyId`; ecology hourly systems run in the "ecology" and "rivals" tick phases; combat runs in the "combat" phase after locomotion.
