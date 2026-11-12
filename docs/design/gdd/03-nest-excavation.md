# GDD 03 — Nest, excavation and chambers

Depends on: `01-design-seed.md` (sections 0, 3, 4, 5), `02-design-directions.md` (B, C, D, E, J, K), `03-architecture.md`, `docs/design/tdd/00-contracts-guidance.md`, GDD 01 (action primitives `dig-bite`, `seal-entrance`, `unseal-entrance`; release rules; cutaway), GDD 08 (dig planner, nest overview, plan status visuals).
Research: `bio-lasius-niger.md` (verified: nest architecture, mound CT data, founding), `ecology-habitats.md` (verified: substrates, micro-structures, rain), `bio-camponotus.md` (verified: wood galleries, frass, satellites), `bio-messor.md` and `bio-atta.md` (verified: species nest dimensions). No `spike-nest.md` existed when this was written.
Implemented by modules: `nestops` (entrances, chambers, plans, pellets, mound, nest system), `architect`, `beh-nest` (dig and haul state machines in 7.7), `weather-effects` (flooding, section 11), `founding` (founding dig, section 13), `render-nest` (reads the data defined here), `F2-kernel` (carve grid, breaches, nest navigation fields).

---

## 0. Conventions, tiers and deviations

### 0.1 Conventions

- Lengths in **BU** unless marked mm. Volumes in BU³. One voxel = 0.5 BU, so one voxel = 0.125 BU³.
- Time: **game s** = sim seconds (10 ticks; 1x real second). 1 game hour = 25 game s = 250 ticks; 1 game day = 600 game s = 6,000 ticks. Digging, walking and flooding run on game s. Nothing in this chapter uses the compressed calendar except microclimate seasonal means (section 9).
- "Depth" of a point p = vertical distance from p up to where `fSubstrate` first becomes > 0 along +Y (cavities ignored). "Roof thickness" = vertical distance from a cavity ceiling up to the first free space (cavity or air). "Covered" = the column above p crosses a non-diggable solid primitive (stone, slab, wood, brick, ...) before reaching air.
- Species abbreviations: LN `lasius-niger`, CP `camponotus-pennsylvanicus`, MB `messor-barbarus`, AT `atta-texana`.
- Every number is a named balance constant (`src/sim/balance/nest.ts`, species values in `SpeciesDef.nestTemplate` and `SpeciesDef.dig`). Values tagged `[EST]` are design estimates; `[R]` are taken from the research dossiers.

### 0.2 Tier summary

| Feature | Tier |
| --- | --- |
| Carve grid, bites, pellets, clutter, tamping, crater mound with angle-of-repose relaxation | T1 |
| Substrate table, moisture effect on digging, crusts, species dig masks for LN | T1 |
| Pre-existing cavities joining a nest | T1 |
| Entrances: breach detection, multiple entrances via plans, sealing / reopening (founding and by command) | T1 |
| Dig plans (tunnel, shaft, chamber, entrance, seal, reopen), validation, frontier, haul loop, priorities, cancel, stall reporting | T1 |
| Nest architect: auto / off, needs crowding, brood space, food space, missing type | T1 |
| Chamber detection, types, capacities, designation | T1 |
| Microclimate formula and brood placement ranking (works with whatever the environment provides; daily and seasonal dynamics arrive with T2 weather) | T1 |
| Crowding effects | T1 |
| Founding dig with readiness, automatic expulsion, seal | T1 |
| Nest navigation fields and navigability rules | T1 |
| Cutaway dig planner interaction | T1 |
| Flooding (section 11) and rain erosion of mounds | T2 |
| Collapse of unstable substrates (section 12) | T2 (T1 ships the validation rules that prevent unstable plans) |
| Architect needs winter depth, flood safety, entrance access; architect `suggest` mode; `widen` plans; winter auto-seal; summer depth shift | T2 |
| Rival nests generated with the same rules | T2 |
| Founding dig assist ghost | T2 |
| CP wood galleries, windows, frass falls, satellites; MB granaries; AT fungus chambers, turrets, many-entrance nests; `backfill` plans; chambers inside mounds | T3 |

### 0.3 Deviations from directions or research

| # | Deviation | Reason |
| --- | --- | --- |
| D1 | Individual bites are fast: a founding cell takes about 2-3 game minutes instead of hours. | Kinematic clock (directions K). At colony scale, nest growth per game day (13 real days) stays in the real order of magnitude. Codex must say so. |
| D2 | Tunnels are round, 2 BU across; real *L. niger* galleries are flatter (about 3 BU wide x 1.5 BU tall [R: CT data, width ~12 mm, height 5.5-5.9 mm]). | Camera and walker clearance. Chambers stay flat (height 2-3 BU). |
| D3 | LN can dig `wood-decayed` (speed 0.5); directions D said wood is carpenter-only. | Research: *L. niger* nests under stones, rotten wood and roots [R]. Sound wood stays CP-only. |
| D4 | Nest volume per adult is about 2 BU³ (real field mounds imply about 6). | Performance (voxel count) and digging workload; the colony cap is already a compression (K). |
| D5 | The T1/T2 mound is a pellet crater/cone, not the built soil dome of real mound nests (real mature mounds ~65-68 BU across, 52-68 BU tall [R, corrected]). The mound grid is sized to reach that diameter. Chambers inside mounds are T3. | Scope. |
| D6 | AT fungus chambers 12-24 BU wide instead of ~43 BU (30 cm); CP chambers 5-12 BU [R] instead of the seed's generic 8-16. | Map and footprint compression; species data. |

---

## 1. The carve grid from the player's point of view (T1)

### 1.1 Voxels, materials and flags

| Constant | Value | Meaning |
| --- | --- | --- |
| `VOXEL_SIZE` | 0.5 BU | carve-grid spacing (seed) |
| `CHUNK_VOXELS` | 16 | chunk = 16³ voxels = 8 BU cube |
| `OPEN_THRESHOLD` | 128 | voxel is **open** if openness ≥ 128 (iso 127.5) |
| `VOXEL_VOLUME` | 0.125 BU³ | |

Each chunk holds `open: Uint8Array(4096)` and, when any bit is set, `flags: Uint8Array(4096)` with bits `LOOSE` (1), `NATURAL` (2), `PLUG` (4). `LOOSE` voxels are refilled soil (plugs, tamped pellets, collapse debris): they dig twice as fast (`LOOSE_DIG_SPEED`, table 2.1). `NATURAL` marks pre-existing cavities written by world generation.

**Material at a point** (`field.materialAt(p)`): inside a solid primitive -> its material; else inside a mound pile -> the mound's material (always treated as loose); else the soil profile of the terrain cell at that depth. Soil profiles (one per 4 BU terrain cell, up to 4 layers plus a non-diggable `stone` base) and crust thickness come from world generation (chapter 04). Default profiles chapter 04 should use if it has none: lawn humus 0-3 BU over loam; garden bed humus 0-4 over loam; forest humus 0-10 over loam; play-sand pit sand 0-60 BU (LN; real loose fill 229-305 mm [R]) over loam; paving: slab primitive, bedding sand 6-12 BU, gravel sub-base 25-50 BU, then clay; asphalt: asphalt primitive, gravel, clay.

### 1.2 The bite (`dig-bite`, action owned by GDD 01, effect owned here)

| Step | Rule |
| --- | --- |
| Targeting | Cast 5 rays from the mandible point within reach (`REACH_L` 0.6 L, GDD 01): forward, and 4 at 25° (up, down, left, right in the ant's frame). Take the **nearest** hit with `f ≤ 0` (the most protruding solid, so bites level the face instead of drilling a pinhole). No hit -> target the walking surface 0.5 BU ahead of the head (the ant digs the floor it stands on; this is how a shaft starts on flat ground). |
| Brush centre | `c + n · DIG_BITE_DEPTH`, where c is the contact point, n = −∇f/|∇f| (into the solid), `DIG_BITE_DEPTH` 0.4 BU. |
| Brush radius | `R = DIG_BITE_RADIUS (0.6 BU) × caste.headScale`. |
| Voxel rule | For each voxel v with centre distance d ≤ R + 0.5 BU: target = 255 × clamp((R − d)/0.5 + 0.5, 0, 1); openness = max(old, target). Only voxels whose material is diggable for the digger's species and with `fSubstrate(v) < +0.25 BU` change. If the ant works on a plan, voxels also need `plan.g(v) > −0.25 BU` (clip to plan volume, 7.2). Player bites are not clipped. |
| Removed volume | Σ (new − old)/255 × 0.125 over changed voxels with `fSubstrate(v) < 0`. Nominal on a flat face: `V_BITE_NOMINAL` ≈ 0.85 BU³ (0.84 analytic: cap of height 1.0 of a 0.6 sphere). |
| Duration | `DIG_BITE_S` (1.0 game s) / (digSpeed(material, moisture, loose) × caste.digPower × workRate). Ticks = ceil(duration / 0.1). digSpeed uses the material at the brush centre. |
| Too hard | If digSpeed × digPower < `DIG_MIN_SPEED` 0.1 -> action fails `not-diggable`. |
| Result | Removed ≥ `BITE_MIN_REMOVED` 0.1 BU³ -> one item in the mandibles: `soil-pellet` (or `frass` when the dominant removed material is `wood-sound`, `wood-decayed` or `insulation`) with `volume` = removed volume and `material` = dominant material. Removed < 0.1 -> no item, action fails `no-target` ("Nothing more to dig here"). |
| Carrying a pellet | Per GDD 01 the pellet is auto-dropped behind the ant inside the same bite duration (no extra time). |
| Ordering | All bites completing in a tick are applied by the nest system in ascending ant id (determinism). At most `MAX_BITES_PER_TICK` 64 are applied; the rest complete next tick. |

Caste dig values (`SpeciesDef.dig`):

| Species | Caste | headScale | digPower | Tier |
| --- | --- | --- | --- | --- |
| LN | `worker` | 1.0 | 1.0 | T1 |
| LN | `worker` (nanitic, scale 0.85) | 0.85 | 0.8 | T1 |
| LN | `queen` (founding only; established queens and `gyne`/`male` cannot dig: failure `caste`) | 1.0 | 0.77 (bite 1.3 s) | T1 |
| CP | `minor` / `media` / `major` / founding `queen` | 0.85 / 1.0 / 1.3 / 1.1 | 0.8 / 1.0 / 1.5 / 0.77 | T3 |
| MB | `minor` / `media` / `major` / founding `queen` | 0.8 / 1.0 / 1.35 / 1.1 | 0.8 / 1.0 / 1.6 / 0.77 | T3 |
| AT | `minor` (minims do not dig) / small `media` / `media` / `major` / founding `queen` | — / 0.8 / 1.0 / 1.4 / 1.4 | 0 / 0.8 / 1.0 / 1.6 / 0.77 | T3 |

### 1.3 Pellets: carrying, dumping, clutter, tamping

| Rule | Value / behaviour |
| --- | --- |
| Carry | One pellet in the mandibles. Item bulk = 0.6 × volume (nominal 0.5, within every digging caste's `carryCap`). Carrying speed multiplier is owned by locomotion (assumed 0.9). |
| Dropped in a cavity | Becomes **clutter** unless dropped within 1 BU of an active plan's spoil point (then it joins that **spoil pile**). |
| Dropped outside (terrain, mound or primitive top) | **Surface pellet**: stays a visible item until its age ≥ `PELLET_SETTLE_S` 300 game s, then merges into a mound at the next mound batch (every 250 ticks, 1.4). |
| Dropped in water | Removed (event `pellet-dumped`, `into: 'water'`). |
| Clutter slow-down | Locomotion multiplies in-cavity speed by max(`CLUTTER_SLOW_MIN` 0.6, 1 − `CLUTTER_SLOW_PER` 0.08 × n), n = loose pellets within 1.5 BU of the ant. |
| Choked tunnel | ≥ `CHOKE_COUNT` 6 pellets within any 1 BU length of tunnel -> `choked` flag on that spot (diagnostic `nest-traffic`). Never impassable. |
| Tamping | A clutter or spoil-pile pellet untouched for `PELLET_TAMP_S` 1,200 game s (2 game days) is removed and its volume is pressed into the floor: open voxels within 1.0 BU (1.5 BU if not enough) that have a non-open voxel directly below lose openness evenly until the pellet volume is used; they get `LOOSE`. Floors rise; unhauled spoil slowly narrows tunnels. |
| Cap | `MAX_LOOSE_PELLETS_PER_NEST` 400; above it the oldest clutter pellet tamps immediately. |
| Conservation | Σ removed by bites = Σ pellet volumes + Σ mound deposits / `BULKING` + Σ tamped + Σ pellets lost in water (± float error). Plugs and collapses are exempt (they are packing, not transport). |

### 1.4 Mounds and spoil heaps

A **mound** is a pile heightfield attached to an entrance; a **spoil heap** is the same structure without an entrance (pellets dropped far from any entrance, frass under a window).

| Item | Rule |
| --- | --- |
| Grid | Centre on the entrance opening (or first pellet); `MOUND_CELL` 0.5 BU; `MOUND_GRID_N` 128 (radius 32 BU, enough for the real 65-68 BU diameter of mature LN mounds [R]). `base[]` = support surface y sampled by a downward ray at creation (NaN = no support within 4 BU, cell unusable); `h[]` = pile height. |
| Which mound | A settling pellet joins the mound or heap of its own nest whose grid contains it (nearest centre first). Otherwise it creates a spoil heap, unless one exists within `HEAP_MERGE_DIST` 30 BU (then it joins that heap's grid if inside it, else it is absorbed into the terrain). Cap `HEAP_CAP` 16 heaps per nest; beyond, absorb. |
| Deposit | volume × `BULKING` 1.25, spread over the 3 x 3 cells under the pellet with weights 4/16 centre, 2/16 edges, 1/16 corners. |
| Relaxation | After the batch, sweep the bounding box of the batch's deposits expanded by 16 cells (growing while transfers reach its edge), fixed row-major scan order: for each cell i and its 4 neighbours j, if top_i − top_j > 0.5 · tan θ, move half the excess from i to j (top = base + h). Repeat sweeps until no transfer exceeds 0.001 BU, at most `MOUND_MAX_SWEEPS` 64 per batch. θ = repose angle of the mound material (table 2.1). Material never flows into kept-clear or unusable cells; flow past the grid edge is absorbed into the terrain (counted). |
| Kept-clear hole | Cells within the entrance radius `r_ent` + 0.25 BU are held at h = 0 so the opening stays open; the pile forms a **crater ring** that grows into a cone with a central pit. |
| Rim height | `rim(entrance)` = max h over the ring r_ent .. r_ent + 3 BU. |
| Field | The pile is solid between base and base + h where h > 0.05 BU; `fSubstrate` includes it; ants walk on it and can dig into it (always loose). |
| Rain erosion (T2) | For each game hour with rain intensity I > 0.2, one relaxation pass over the whole grid with θ − 8° × I. Volume is conserved; mounds slump and spread. |
| Batching | Mound updates run every 250 ticks per mound, staggered by mound id. |

---

## 2. Substrates (T1 unless tagged)

### 2.1 Material table

digSpeed is relative to loam at medium moisture (bite 1.0 s for a standard worker). S_max = largest unsupported ceiling span in BU (mid / dry / saturated moisture). WALL_MIN = minimum soil between two cavities. K_DRAIN = water infiltration through flooded walls (BU/s, section 11). r_therm = thermal resistance factor per unit depth (section 9). θ = angle of repose for mounds.

| Material | digSpeed | dry / wet multiplier | S_max mid / dry / sat | WALL_MIN | K_DRAIN | r_therm | θ | Diggable by (species multiplier) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `loam` | 1.0 | 0.6 / 0.8 | 16 / 12 / 10 | 2.0 | 0.004 | 1.0 | 38° | LN 1, MB 1, AT 1, CP 0.6 |
| `humus` | 1.3 | 0.8 / 0.8 | 10 / 8 / 6 | 2.5 | 0.008 | 1.4 | 40° | LN 1, AT 1, MB 0.8, CP 0.8 |
| `sand` | 1.6 | 1.0 / 0.9 | 8 / 2.5 / 4 | 3.0 | 0.020 | 0.9 | 33° | LN 1, MB 1, AT 1, CP 0.6 |
| `clay` | 0.45 | 0.55 / 0.9 | 24 / 24 / 14 | 1.5 | 0.0008 | 0.8 | 40° | LN 1, MB 1, AT 1, CP 0.3 |
| `gravel` | 0.35 | 1.0 / 1.0 | 12 / 10 / 10 | 2.0 | 0.030 | 0.9 | 36° | LN 1, MB 1, AT 1 |
| `wood-decayed` | 1.0 | below wood moisture 0.15: × 0.5 | ∞ (never collapses) | 1.0 | 0.002 | 1.6 | 40° | CP 1 (T3), LN 0.5 (D3) |
| `wood-sound` | 0.4 at wood moisture ≥ 0.15; 0.25 below [R: 1.0 / 2.5 / 4.0 worker-s per voxel] | — | ∞ | 1.0 | 0.0005 | 1.6 | 40° | CP only (T3) |
| `insulation` (new id) | 1.5 | — | 12 | 1.5 | 0 | 4.0 | 45° | CP 1 (T3), LN 0.5 [EST] |
| Any material with `LOOSE` | base digSpeed (min 1.0) × `LOOSE_DIG_SPEED` 2.0 (= GDD 01 `PLUG_DIG_FACTOR` 0.5 on duration) | — | 0.75 × dry value | as base | as base × 1.5 | as base | as base | as base |
| `concrete`, `asphalt`, `stone`, `brick`, `tile`, `ceramic`, `glass`, `metal`, `plastic`, `rubber`, `bark`, `plant`, `leaf`, `fabric`, `paper`, `food`, `water` | 0 (not diggable) | — | ∞ (rock and slab roofs never fall) | — | 0 | stone/concrete/brick/tile/ceramic 0.35, asphalt 0.45, glass 0.4, metal 0.05, bark 1.4, plastic 1.2, rubber 1.5, leaf 1.5, fabric 2.0, paper 2.0, water 0.8 | — | — |
| Air gap (cavity) in a thermal column | — | — | — | — | — | 2.0 | — | — |

Moisture m (0-1, soil moisture from the environment, section 9 for depth): multiplier = dry value at m ≤ 0.05, 1.0 for 0.2 ≤ m ≤ 0.8, wet value at m ≥ 0.95, linear between. S_max: mid for 0.2 ≤ m ≤ 0.8, dry at m ≤ 0.05, saturated at m ≥ 0.95, linear between. Sand is fast but unstable when dry or saturated (directions D); clay is slow and holds water.

### 2.2 Hard surface crusts

| Item | Rule |
| --- | --- |
| Where | A crust of thickness 0.5-1.5 BU on the top soil layer where world generation flags it: compacted paths and play edges (1.0), clay surfaces (0.75); T2: bare soil after ≥ 1 game day of `heat` weather (0.5, removed by rain). |
| Digging | digSpeed of the crust voxels = base × `CRUST_DIG_DRY` 0.3, or × `CRUST_DIG_WET` 0.7 when m ≥ 0.5. |
| Stability | S_max of a crust roof × 1.5. Entrances through crust keep their rim (no erosion of the throat). |
| Water | Crusted ground sheds rain: entrances whose catchment ring is ≥ 50 % crusted get catchment × `CRUST_RUNOFF` 1.5 (section 11). |

### 2.3 Hidden obstacles

Buried stones and roots (world-generation primitives below the surface) are not diggable. A bite on them removes nothing (`no-target`). For plans, see 7.6 (`obstructed` and automatic detours). Roots and stones left in place become natural pillars and ceilings.

---

## 3. Pre-existing cavities (T1)

World generation writes natural cavities into the carve grid (flag `NATURAL`) and records each as `NaturalCavity { id, kind, bbox, openings[{pos, normal, radius}], ownerNestId }`.

| Kind (new ids) | Typical size (LN BU) [R: ecology dossier] | Note |
| --- | --- | --- |
| `paving-joint` | gap 0.75-2.5 wide between slab primitives, sand fill 0.5-1 below the slab top | A road and a nest site. |
| `under-slab` | void 0.5-2 tall, 2-10 wide in the bedding sand under slab edges | Covered, warm: architect favours it. |
| `stone-gap` | 0.5-1.5 gap under stone edges | Classic LN founding site. |
| `kerb-void` | 0-2.5 gap behind a kerb | |
| `asphalt-crack` | 0.25-6 wide down to the sub-base | Narrow ones are below navigation clearance. |
| `root-channel` | tube 1-3 diameter, 10-60 long through soil | |
| `log-hollow` | 2-10 cavity in decayed wood | CP founding (T3). |
| `wall-void` | 5-25 wide inside wall primitives, partly filled with `insulation` | Interior zone. |
| `pipe-gap` | annulus 0.5-4 around pipes through walls | |
| `abandoned-burrow` | created at runtime by an abandoned founding dig (13.4) | |

Gaps between primitives that are not inside substrate (door undercuts) are surface routes, not carve-grid cavities.

**Joining rule.** When a carve operation opens a voxel 26-adjacent to an open voxel of an unowned natural cavity, the whole connected natural component joins the nest (`ownerNestId` set; event `natural-cavity-joined`). Its openings become entrances of kind `natural`, state `open`. Natural voxels already open produce no pellets; widening their walls does. Under-slab voids that meet chamber criteria (6.2) register as `general` chambers.
If the cavity belongs to another colony, no ownership change: event `foreign-cavity-contact` (rivals chapter decides what follows); architect plans refuse with `foreign-nest`.
A founding queen may found inside an unowned natural cavity if its connected component has ≤ 2 openings and volume ≤ 200 BU³ (else prompt "Too open to seal").

---

## 4. Entrances

Entrance record: `{ id, nestId, kind, status, pos, dir, radius, moundId, rimTarget, plugVoxels, createdTick, trafficIn, trafficOut }` (derived: rim height, catchment, cover factor).

| Kind (new ids) | Created by | Tier |
| --- | --- | --- |
| `dug` | Any breach made by digging (plans, the player, founding) | T1 |
| `natural` | Opening of a joined natural cavity | T1 |
| `accidental` | Breach made by a collapse (12) | T2 |
| `window` | CP opening through wood, radius 0.5-1 BU, used to eject frass (dropped frass falls and forms a heap below) | T3 |

### 4.1 Breach detection (T1)

After every carve operation, each voxel that became open and has `fSubstrate(v) > BREACH_F` (−0.25 BU) and is 26-connected to the nest cavity is a breach voxel. Breach voxels within `ENTRANCE_MERGE_DIST` 1.5 BU of an existing entrance opening belong to it; otherwise they form a new entrance. Radius = clamp(√(n × 0.25 / π), 0.75, 3) BU; `pos` = centroid of breach voxels on the surface; `dir` = surface normal there. The renderer discards terrain and primitive fragments inside a sphere of radius + 0.25 BU at `pos`. The **throat** is the set of open voxels within 3 BU (path) of the opening.

### 4.2 Entrance state machine

| State | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `open` | Breach created, or passage restored | Counted by `D_exit` (5.2); pellets dumped here; flood inflow full | First plug added -> `sealing` |
| `sealing` | ≥ 1 plug voxel in the throat, passage still exists | Inflow × 0.5 | No 26-connected open path from the opening voxels through the throat -> `sealed`; plug removed -> `open` |
| `sealed` | Throat closed by plug, tamping or collapse | Excluded from `D_exit`; included in `D_seal`; flood inflow × `SEAL_LEAK` 0.1 | A `reopen` plan starts or any bite hits the plug -> `reopening` |
| `reopening` | Plug being dug | As sealed | Passage with clearance ≥ `NAV_CLEAR` exists -> `open` |

Seal action (GDD 01 `seal-entrance`, effect owned here): an ant carrying a pellet in the throat within 3 BU of the opening; 2.0 game s; fills open voxels inside a sphere of `PLUG_RADIUS` 1.2 BU centred 1.0 BU ahead of its head toward the opening (voxels within 0.3 BU of any ant are skipped), flags `LOOSE|PLUG`; the pellet is consumed. A 2-2.5 BU throat closes with about 3 pellets. Unseal: `unseal-entrance` = `dig-bite` on plug voxels at `LOOSE_DIG_SPEED`.

Sealing uses: founding (13, T1); player command `sealEntrance` (an AI worker performs it as a `seal` plan, T1); winter auto-seal when the Directives toggle "Seal entrances in cold weather" is Auto: seal all entrances when winter begins or `T_dayMean` < 5 °C for 1 game day, reopen when `T_dayMean` > 8 °C for 1 game day (T2, overwintering chapter triggers); defence sealing under raid (combat chapter, T2).

### 4.3 Multiple entrances, rims and rain

- A nest may have up to `template.maxEntrances` open entrances (LN 3, 4 from 800 workers). Player entrance plans beyond that are refused `too-large`; natural and accidental openings are not capped (architect may propose a `seal` plan for surplus ones, T2).
- Haulers use the nearest open entrance by path (`D_exit`), so each entrance grows its own mound.
- **Rims** protect against rain (section 11): rim factor = max(`RIM_MIN_FACTOR` 0.1, 1 − rim / `RIM_FULL` 3 BU). When an entrance has `rimTarget` > rim, haulers drop pellets in the inner ring r_ent + 0.5 .. 1.5 BU instead of the normal ring (7.7), building a crater rim.
- Traffic: ants crossing the opening plane, counted per game minute (UI). Congestion (T2): ≥ 6 ants within 4 BU of the opening moving at < 30 % cruise speed for 30 game s.

---

## 5. Nest navigation (T1)

### 5.1 Walkable space and tunnel diameters

Clearance c(v) = distance from a voxel centre to the nearest non-open voxel centre (3D, capped at 4 BU, stored as Uint8 in 1/16 BU, recomputed for dirty chunks). A voxel is **walkable space** if open and c(v) ≥ `NAV_CLEAR` 1.0 BU, which corresponds to a passage at least 3 voxels (1.5 BU) across.

| Diameter (in body units of the species) | Meaning |
| --- | --- |
| < 1.5 BU | Crack: not walkable for this species (water and air still pass). |
| 1.5-2.0 BU | Squeeze: speed × `SQUEEZE_SPEED` 0.7 (queens and majors × 0.5); two-way traffic waits. |
| `template.tunnelD` (LN 2.0) | Standard tunnel: two-way traffic on opposite walls; camera tunnel boom works (GDD 01). |
| `template.royalD` (LN 2.5) | Routes the queen uses (royal to entrance at founding, royal to nurseries). |

### 5.2 Distance fields

Per nest, derived caches (never saved): `D_exit` (seeds: opening voxels of `open` entrances), `D_seal` (seeds: plug voxels of `sealed`/`sealing` entrances), `D_ch[c]` for every registered chamber (seeds: its voxels), `D_plan[p]` for every active plan (seeds: its slot voxels). 26-connected Dijkstra over walkable voxels, edge weights 0.5 / 0.707 / 0.866 BU, values Uint16 in 1/16 BU, 0xFFFF = unreachable.

| Rule | Value |
| --- | --- |
| Steering | The ant samples the field at the walkable voxel nearest its position (≤ 1 BU); desired direction = toward the lowest of its 26 neighbours, tangent-projected by locomotion. No walkable voxel within 1 BU -> field invalid, locomotion fallback. |
| Opening voxels | Incremental: newly walkable voxels only lower values; propagate decreases. |
| Closing voxels (plug, tamp, collapse) | Full recompute of affected fields, at most once per `FIELD_RECOMPUTE_MIN_S` 2 game s per field, `FIELD_BUDGET` 2 recomputes per tick, staggered. |
| Surface hand-over | Leaving: `D_exit` reaches the opening, then surface navigation takes over at `entrance.pos`. Entering: surface navigation to `entrance.pos`, then `D_ch` / `D_plan`. |

### 5.3 What makes a nest navigable (invariants, checked by validation and soak tests)

| # | Rule |
| --- | --- |
| N1 | Every registered chamber has finite `D_exit`, or finite `D_seal` when all entrances are sealed. |
| N2 | The royal chamber has a finite path to every nursery. |
| N3 | Path length from any chamber to its nearest entrance ≤ `template.maxPathToEntrance` (LN 120 BU); otherwise the architect proposes an entrance (T2). |
| N4 | At most `MAX_JUNCTION_DEGREE` 4 tunnel branches meet within 2 BU. |
| N5 | Planned tunnels have diameter ≥ `template.tunnelD`; queen routes ≥ `template.royalD` (T2 `widen` plans when the queen must move through a squeeze). |
| N6 | Flooded voxels stay in the fields (no recompute); submerged ants escape by following `D_exit`, which leads upward in any nest whose entrances are above its chambers. |

---

## 6. Chambers (T1)

### 6.1 Registration routes

1. **Plan completion**: region = plan chamber volume ∩ open voxels; type = plan type.
2. **Founding readiness** (13): region = founding deep voxels; type `founding`.
3. **Detection** of unplanned cavities (player digging, natural cavities, collapse changes): type `general`.
4. **World generation** of rival nests (15): types from their plans.

### 6.2 Detection (every `CHAMBER_DETECT_S` 5 game s over dirty regions)

| Step | Rule |
| --- | --- |
| Support distance | d_sup(v) = in-layer (same Y) 2D distance from an open voxel centre to the nearest non-open voxel centre, by 8-connected 2D BFS limited to 12 BU. |
| Core | Open voxels with d_sup ≥ `CHAMBER_CORE_HALF` 2.0 BU (≥ 4 BU wide) and vertical open run through the voxel ≥ 1.5 BU (3 voxels). |
| Component | 26-connected components of core voxels; region = core dilated by `CHAMBER_DILATE` 1.0 BU inside open voxels. |
| Minimum | Region volume ≥ `CHAMBER_MIN_VOLUME` 12 BU³. |
| Identity | A new region overlapping ≥ 50 % of an existing chamber's voxels keeps that chamber's id and type. Merge: the larger keeps id and type; the other is removed (`chamber-removed`, reason `merged`). Split: the largest part keeps id; others register as `general`. |
| Deregistration | Volume < 50 % of the type minimum (6.4) -> removed (reason `shrunk`); contents are then treated as lying in general space. |

Derived per chamber (updated with microclimate): volume, floor area (voxels with non-open below × 0.25 BU²), centroid, bbox half-extents (`radii`), depth (BU and mm), minimum roof thickness, cover flag, lowest flood spill height (11), occupancy.

### 6.3 Types

| Type | Purpose | Species | Player plan | Architect plan | Designatable |
| --- | --- | --- | --- | --- | --- |
| `founding` | The founding queen's sealed cell | all | no | no (founding only) | no |
| `royal` | Queen residence; eggs laid here | all | no | only if a living queen has no royal chamber | yes (one per nest with the queen) |
| `nursery` | Brood | all | yes | yes | yes |
| `food` | Solid food items (liquid stores live in crops, economy chapter) | LN, CP, MB (non-seed food) | yes | yes | yes |
| `granary` | Seeds (T3) | MB | yes | yes | yes |
| `fungus` | Fungus garden (T3) | AT | yes | yes | yes |
| `midden` | Internal refuse | all (architect: AT only; LN middens are outside, colony chapter) | yes | AT | yes |
| `rest` | Resting adults; winter cluster | all | yes | yes | yes |
| `general` | Overflow of anything | all | yes | yes | yes |

### 6.4 Capacities (per BU³ of chamber volume)

Adults count in space units = (caste body length in BU)² (worker 1.0, nanitic 0.72, CP/MB major ≈ 2.56); the queen is not counted. Brood items: egg 0.25, larva 1.0, pupa 1.0.

| Type | Min volume | Resting adults | Brood items | Food loads | Other |
| --- | --- | --- | --- | --- | --- |
| `founding` | 8 | 0.5 | 3.0 | 0 | queen |
| `royal` | 10 | 0.3 | 2.0 | 0 | queen |
| `nursery` | 12 | 0.3 | 1.5 | 0 | |
| `food` | 8 | 0.2 | 0 | 2.0 | |
| `granary` | 30 | 0.2 | 0 | 3.0 (seed loads) | |
| `fungus` | 40 | 0.3 | 0.5 | 0 | garden ≤ 70 % of volume |
| `midden` | 12 | 0 | 0 | 0 | 3 waste items |
| `rest` | 12 | 1.0 | 0 | 0 | |
| `general` | 12 | 0.6 | 0.5 | 1.0 | |
| Tunnel space (open volume not in chambers) | — | 0.15 | 0 | 0 | |

### 6.5 Designation rules

| Rule | Detail |
| --- | --- |
| Command | `designateChamber {chamberId, type}`; refused if the type is not allowed for the species, volume < type minimum, or the chamber is `founding` while the founding is sealed. |
| Royal | Exactly one per nest that holds a living queen. Designating another chamber `royal` turns the old one `general` and issues an implicit `move-queen` request to that chamber (colony chapter executes). |
| Founding to royal | When the colony reaches `template.royalAt` (LN 8 adult workers), a `founding` chamber not designated by the player becomes `royal` automatically. |
| Contents | Re-designation never deletes contents: brood in a chamber that stops accepting brood is moved by nurses to the best allowed chamber (9.4); food items to the nearest `food`/`general`. |
| Ownership | `designatedBy: 'player' | 'auto'`; the architect never re-designates player-designated chambers. |

---

## 7. Dig plans (T1 unless tagged)

### 7.1 Kinds and templates

| Kind (new ids) | Geometry | Anchor | Size parameters (LN) | Active window | Slot cap | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `tunnel` | Capsule chain: straight or 1 bend, diameter `tunnelD` | Walkable wall voxel of the nest | Length 2-40 BU | 1 sphere | 2 | T1 |
| `shaft` | Capsule within 15° of vertical, up or down, diameter `tunnelD` | Wall or floor voxel of the nest | Length 4-60 BU; reaching the surface makes it an entrance | 1 | 2 | T1 |
| `chamber` | Neck capsule (length `NECK_LEN` 3 BU, diameter `tunnelD`, rising `CHAMBER_SILL` 0.5 BU toward the chamber) + ellipsoid W x H x L, optional pillars (7.3) | Walkable wall voxel; neck along the wall normal's horizontal part | Per type and size, table 8.2 | 4 | 8 | T1 |
| `entrance` | Capsule from the nearest nest cavity point to a surface point ≤ `ENTRANCE_PLAN_MAX` 12 BU away, last 2 BU flaring to `tunnelD` + 0.5 | The surface point (marker `entrance`); digging starts from the cavity end | — | 1 | 2 | T1 |
| `seal` | Plug at a throat | Entrance | The worker takes a pellet (spoil pile, clutter, or one bite of the throat wall) and repeats `seal-entrance` until the entrance is `sealed` | — | 1 | T1 |
| `reopen` | Plug voxels of a sealed entrance | Entrance | — | 1 | 2 | T1 |
| `widen` | Capsule chain over an existing tunnel with a larger diameter | Existing tunnel path | To `royalD` or 3 BU | 3 | 4 | T2 |
| `backfill` | Fill a dead-end tunnel with pellets | Tunnel tip | — | — | 4 | T3 |

Plan record: `{ id, nestId, kind, chamberType, size, source, need, priority, status, blockedReason, warnings[], anchor{pos, normal}, geom{...}, spheres[{c, r, done}], window[], slots[{pos, antId, sinceTick}], spoilPoint, targetVolume, removedVolume, createdTick, statusTick }`.
Sources (new ids): `player`, `architect`, `founding`, `worldgen`, `rival`. Priorities (new ids): `low` (1), `normal` (2), `high` (4), `urgent` (8) — weight in parentheses. The UI offers `normal` and `high`; the architect also uses `low` and `urgent`.

### 7.2 Plan volume

Each plan has an analytic SDF g(p), positive inside the planned cavity (union of capsules and ellipsoid, minus pillar cylinders). Target voxels = voxels with g > 0. targetVolume = Σ target voxels not already open × 0.125. Bites by ants assigned to the plan are clipped to g > −0.25 BU (1.2).

### 7.3 Anchoring and validation

Validation is a pure function `validatePlan(state, spec) -> { ok, codes[], warnings[], targetVolume, geom }` also exposed as a query for the live ghost (≤ 2 ms). Checks in order:

| Code (new ids) | Test | Player plan | Architect plan |
| --- | --- | --- | --- |
| `anchor-not-in-nest` | Anchor is not a walkable wall voxel of this nest (entrance: no nest cavity within 12 BU of the surface point) | refuse | refuse |
| `type-not-allowed` | Chamber type not allowed for the species (6.3) | refuse | refuse |
| `out-of-bounds` | Beyond world bounds − 2 BU, deeper than `template.maxDepth`, or outside `template.footprintR` from the nest origin | refuse | refuse |
| `water` | Target volume intersects water or currently flooded voxels | refuse | refuse |
| `non-diggable` | > 10 % of the target volume is non-diggable for the species. ≤ 10 %: the plan is clipped (a slab or stone becomes the chamber roof or wall) | refuse | refuse |
| `overlaps-plan` | Intersects another non-terminal plan's volume | refuse | refuse |
| `too-large` | Exceeds species size limits or entrance cap; nest volume would exceed `template.volumeCap` (LN 12,000 BU³) | refuse | refuse |
| `unstable` | Chamber minor width W > S_max (at the ceiling material and current moisture) and the pillar layout cannot fix it: one row of pillars (diameter 1.5 BU, floor to ceiling) along the long axis, centre spacing S_max + 1.5, count floor(L / spacing) ≤ 4, requiring (W − 1.5)/2 ≤ S_max. Non-diggable ceilings always pass. | refuse | refuse |
| `undermines` | Soil roof thickness < `ROOF_MIN` 3 BU (unless a non-diggable cover is reached within it); cavity within 4 BU horizontally of another entrance's axis at depth < 8 BU; vertical soil < `FLOOR_MIN` 2.5 BU to a cavity above or below | warn | refuse |
| `too-close` | Soil between the new volume and any other cavity (except the anchor connection) < WALL_MIN of the material (table 2.1) | warn | refuse |
| `foreign-nest` | Within WALL_MIN of another colony's cavity | warn | refuse |
| `flood-risk` (T2) | Chamber floor is below the predicted reference-storm level (11.4) | warn | refuse for `nursery`, `royal`; else score penalty |

Warnings are shown in amber; the player confirms with a second click.

### 7.4 Expansion into ordered carve spheres

| Kind | Sphere placement | Order |
| --- | --- | --- |
| tunnel, shaft, entrance, widen | Along the axis every `SPHERE_STEP_TUNNEL` 0.75 BU, radius D/2 + 0.1 | From the anchor outward (entrance: from the cavity end toward the surface) |
| chamber | Neck spheres as above; then a 1.0 BU lattice inside the ellipsoid shrunk by 0.5 BU, radius 0.8 BU | Neck first, then lattice by geodesic (lattice-adjacency BFS) distance from the neck mouth; ties: lower y first, then x, then z |
| reopen, seal | One sphere per plug component | — |

A sphere is **done** when ≥ `SPHERE_DONE` 90 % of its target voxels are open. The **active window** = the first n not-done spheres in order (n per 7.1) that are reachable (≥ 1 target voxel adjacent to a walkable voxel). The **frontier** = target voxels of the window adjacent to walkable space.
Completion: at ≥ `PLAN_SNAP` 97 % of targetVolume removed, remaining target voxels with openness ≥ 64 are set to 255 and pellets for the snapped volume are spawned at the spoil point (ceil(V/0.85), conserving volume); status `complete`; chamber plans register their chamber (6.1).

### 7.5 Frontier assignment

| Rule | Value |
| --- | --- |
| Slots | 2 per active-window sphere, up to the slot cap. Slot position = walkable voxel adjacent to the sphere's frontier, slots ≥ 0.75 BU apart. |
| Seeking a slot | A `dig` ant scores each plan with a free slot: weight(priority) / (1 + `D_plan`(ant)/40 BU); highest wins; tie -> lower plan id; then nearest free slot. |
| Timeouts | Assigned ant not in reach within `SLOT_TIMEOUT_S` 60 game s -> slot freed. A digger carrying out keeps its slot for `SLOT_HOLD_S` 90 game s. |
| Bite target | Nearest frontier voxel of its sphere within reach; aim the bite there (1.2 targeting restricted to that voxel's direction). |
| Window moves | When a sphere becomes done, the window advances; slots on it are re-placed. |
| Spoil point | Floor voxel 2 BU from the window frontier following `D_exit` downhill; recomputed when the window moves > 3 BU. |

### 7.6 Obstacles and detours

A sphere whose remaining target voxels are all non-diggable (hidden stone or root found during digging) is marked `obstructed` and skipped. If a tunnel's next 2 spheres are obstructed, the planner inserts up to 2 detour waypoints around the obstacle's bounding sphere + 1 BU (tries left, right, over, under in that order), re-validates, and continues. Failure -> `stalled` with `obstructed`. Chamber spheres that are obstructed are simply skipped (the obstacle remains as a pillar).

### 7.7 Digging and hauling loop (behaviours `dig` and `haul`)

Digger (`task = dig`):

| State | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `seek-slot` | Task assigned or slot lost | Request a slot (7.5) | Slot -> `go-to-slot`; none -> wait 10 game s, retry; task changed -> leave |
| `go-to-slot` | Slot held | Follow `D_plan` | In reach -> `bite`; timeout -> `seek-slot` |
| `bite` | In reach, mandibles empty | `dig-bite` on the frontier | Pellet -> `deposit`; `no-target` -> retarget within 1.5 BU, else `seek-slot`; `not-diggable` -> mark voxel obstructed, retarget |
| `deposit` | Holding a pellet | If the spoil pile has < `SPOIL_PILE_MAX` 6 pellets and ≥ 1 hauler serves the plan: walk to the spoil point, `put-down` | Dropped -> `go-to-slot`; else -> `carry-out` |
| `carry-out` | Pile full or no haulers | Follow `D_exit`; outside, drop at the dump point (below) | Dropped -> return via surface nav + `D_plan` -> `go-to-slot` |
| `interrupted` | Alarm, flood, hunger, collapse warning near the slot | Drop the pellet if fleeing; release the slot after 90 s | Handled by the task system |

Hauler (`task = haul`):

| State | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `seek-pellet` | Task assigned | Choose by distance among spoil-pile pellets (cost × 1.0) and clutter pellets (cost × 1.4); reserve it | Reserved -> `go-pickup`; none for 10 s -> leave task |
| `go-pickup` | Reserved | Walk to it, `pick-up` | Holding -> `carry-out`; gone -> `seek-pellet` |
| `carry-out` | Holding | `D_exit` to the nearest open entrance; then surface to the dump point; `put-down` | -> `seek-pellet` |
| `internal-dump` | Holding and no open entrance in the nest | Carry to the deepest dead-end tunnel tip ≥ 6 BU from any chamber (or a `midden` chamber); drop (tamps after 1,200 s) | -> `seek-pellet` |

Dump point: angle uniform from the sim RNG; radius r_ent + U(1.5, 5) BU, or r_ent + U(0.5, 1.5) BU when `rimTarget` > rim. On a vertical surface (windows) the pellet is dropped and falls.
Stimuli published for task allocation (colony chapter): dig stimulus = Σ over plans of free slots × priority weight; haul stimulus = spoil-pile pellets + 0.5 × clutter pellets.

### 7.8 Status machine

| Status | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `proposed` | Architect created it | Shown as "Architect" (GDD 08), no work | Mode `auto`: after `ARCH_PROPOSAL_S` 30 game s -> `queued`. Mode `suggest` (T2): `acceptPlan` -> `queued`. `cancelPlan` -> `cancelled` |
| `queued` | Placed by the player or accepted | Slots offered | First bite -> `active`; a block condition true for `STALL_DEBOUNCE_S` 10 game s -> `stalled` |
| `active` | Work started | Progress | Done (7.4) -> `complete`; block 10 s -> `stalled` |
| `stalled` | `blockedReason` set | Slots withheld except for `no-haulers` | Reason clears -> `active` (or `queued` if nothing dug yet) |
| `paused` | `pausePlan` | No slots | `resumePlan` -> `queued` |
| `complete` | — | Chamber registration; event | Terminal; record dropped after 1 game day |
| `cancelled` | `cancelPlan` or architect withdrawal | Slots released | Terminal |

Blocked reasons (new ids) with detection and remedy text:

| Reason | Detection | Remedy shown |
| --- | --- | --- |
| `no-diggers` | Free slots exist but no `dig` ant took one for 10 s | "Raise the Dig share in Directives" / "Lower other plans' priority" |
| `no-haulers` | Spoil pile full for 30 s (not a stall: status stays `active`, diagnostic "slowed") | "Raise the Dig share; haulers carry soil out" |
| `unreachable` | `D_plan` infinite from every entrance and chamber | "A tunnel to the plan is blocked (collapse or packed soil)" |
| `flooded` | ≥ 50 % of slot voxels flooded | "Digging resumes when the water drains" |
| `obstructed` | 7.6 failed | "A stone or root blocks the plan; place it elsewhere" |
| `unstable` | Re-validation at a moisture change of > 0.1 fails the span rule | "The soil is too dry or wet for a room this wide" |
| `temperature` | workRate < 0.1 at the slots | "Too cold (or hot) to dig; resumes when the soil warms (cools)" |
| `season` | Colony in winter dormancy | "The colony is overwintering" |
| `foreign-contact` | Next sphere within WALL_MIN of another colony's cavity (architect plans) | "Digging further would break into a neighbouring nest" |
| `invalidated` | Anchor lost (no walkable voxel within 2 BU) or volume intersected by a collapse | "Place the plan again" |
| `cap` | Nest volume cap reached | "The nest has reached its maximum size" |

**Cancellation**: already-open voxels stay; spoil piles stay and are hauled; diggers drop nothing and go to `seek-slot`. A partly dug chamber that meets 6.2 registers as `general`. An architect plan cancelled by the player blacklists its site (8 BU radius) for `ARCH_BLACKLIST_S` 1,200 game s. The architect itself withdraws its own plan only while progress < 25 % and its need has disappeared. Priority can be changed at any time; geometry cannot be edited (cancel and re-place).
**Caps**: `PLAN_CAP_PLAYER` 8 non-terminal player plans per nest (markers chapter's `MARKER_CAP.dig` should equal it).

---

## 8. Nest architect

### 8.1 Modes

`setAutoExpand {nestId, mode}`: `auto` (default, T1), `off` (T1), `suggest` (T2: proposals wait for the player). Per-need toggles (T2). In `off`, no new plans; existing architect plans continue.

### 8.2 Nest template (`SpeciesDef.nestTemplate`)

| Field | LN (T1) | MB (T3) | AT (T3) | CP (T3) |
| --- | --- | --- | --- | --- |
| `tunnelD` / `royalD` | 2.0 / 2.5 | 2.0 (main 2.5: majors need ≥ 2.2 [R]) / 2.5 | 2.5 / 3.0 | 2.0 / 2.5 |
| `footprintR` | 80 | 150 | 400 (real 15-24 m compressed [R]) | parent + up to 4 satellites within 600 BU [R] |
| `maxDepth` | 175 (typical ≤ 75 [R]) | 285 [R] | 450 [R] | wood only, any; soil brood chambers ≤ 10 |
| `maxPathToEntrance` | 120 | 200 | 300 | 120 |
| `maxEntrances` | 3 (4 from 800 workers) | 6 [R] | 40 [R] | 6 windows per nest |
| `volumeCap` | 12,000 | 14,000 | 30,000 | 8,000 |
| `royalAt` | 8 workers | 10 | 20 | 8 |
| Chamber W x H x L (S / M / L) | general, nursery, rest: 6x2.5x8 / 8x2.5x12 / 10x3x16; food: 6x2x8 / 8x2.5x10 / –; royal: 6x2.5x8 | brood 8x2.5x10 / 10x3x12 / 12x3x14; granary 10x3x12 / 13x3x14 / 16x3.5x16 | fungus 12x6x12 / 18x9x18 / 24x12x24; midden 10x4x12 | 5x2.5x9 / 8x2.5x14 / 12x3x20 (long axis along the grain) |
| Depth bands (BU below surface or cover) | founding 6-15; royal 12-40; nursery 4-30; food 8-30; rest 10-60; general 5-60; winter rest (T2) 30-80 | nursery 15-80; royal 40-150; granary 60-200 [R]; rest 20-150 | fungus 30-300; midden 100-400; royal 150-400 | ≥ 2 inside wood |
| Required types by adult workers (`missing-type`) | ≥ 8: nursery S; ≥ 25: food S; ≥ 40: rest M; ≥ 150: second nursery M | ≥ 10: nursery; ≥ 30: granary | ≥ 10: second fungus | ≥ 8: nursery |
| Cover weight (8.4) | 1.5 (nursery 2.5: sun-warmed stones and slabs [R]) | 0.5 | 0 | 0 |

Chamber volumes (ellipsoid π/6·W·H·L): 6x2.5x8 = 62.8; 8x2.5x12 = 125.7; 10x3x16 = 251.3; founding 4x2x4.5 = 18.9 BU³. Longest horizontal dimension 8-16 BU matches the seed; widths 6-10 match research (4-12 [R]).

### 8.3 Needs (evaluated every `ARCH_PERIOD_S` 60 game s per nest, staggered)

| Need (new ids) | Measure | Trigger | Priority | Plan produced | Tier |
| --- | --- | --- | --- | --- | --- |
| `crowding` | ρ = Σ adult space units / resting capacity (6.4, all chambers + tunnels) | ρ > 0.85 | `normal`; ≥ 1.1 `high`; ≥ 1.5 `urgent` | `rest` (or `general` below 40 workers); size = smallest whose capacity brings ρ ≤ 0.7, else L | T1 |
| `brood-space` | ρ_b = (0.25·eggs + larvae + pupae + 0.5 × eggs laid in the last 0.5 game day) / brood capacity of nursery, royal, founding, general | ρ_b > 0.8 | `normal`; ≥ 1.0 `high`; ≥ 1.3 `urgent` | `nursery` | T1 |
| `food-space` | Solid food loads in the nest (economy) / capacity of food + general; or ≥ 10 food items outside storage chambers for 150 game s | > 0.8 | `normal` | `food` (MB seeds: `granary`) | T1 |
| `missing-type` | Template requirement not met | — | `normal` | that type | T1 |
| `winter-depth` | In autumn (days 15-21): resting capacity of chambers with centroid depth ≥ `FROST_SAFE_MM` (LN 120 mm) vs 0.6 × adult space units | < 1.0 | `high` | `rest` in the winter band | T2 |
| `flood-safety` | Reference storm (11.4) predicts ≥ 25 % flooding of a `royal`, `nursery` or `founding` chamber | yes | `urgent` while raining, else `high` | Step 1: set `rimTarget` = `RIM_FULL` on the worst entrance (free; changes dumping). Step 2 if still predicted flooded with that rim: `nursery` placed above the predicted level | T2 |
| `entrance-access` | Mean path from chambers to entrances > `maxPathToEntrance`, entrance congestion (4.3), or the forage centroid (foraging chapter) > 120 BU from every entrance; and below `maxEntrances` | yes | `low` | `entrance` toward the cause, 20-40 BU from existing entrances, preferring cover | T2 |

Throttles: concurrent non-terminal architect plans ≤ 1 below 50 workers, 2 below 500, 3 above; no new plan while fewer than `ARCH_MIN_DIGGERS` 2 ants can dig (founding excepted); one plan per need at a time; nothing above `volumeCap`.
T2 summer shift: when the surface day-mean > 28 °C, nursery and rest bands shift 30 % deeper (workers excavate deeper at high temperature [R]).

### 8.4 Placement algorithm

1. Pick type, size and depth band (8.2, 8.3).
2. Candidates (sim RNG, deterministic): (a) `ARCH_CANDIDATES` 48 walkable wall voxels with a horizontal solid neighbour, depth within band ± 4 BU, stratified across tunnels and chambers; (b) if fewer than 8 qualify: composite candidates — extend the main shaft downward (or a lateral tunnel) to the band, chamber at its end; (c) for types with cover weight > 0, up to 8 spots under non-diggable cover within the footprint whose underside is within the band, reached by a tunnel from the nearest wall.
3. Geometry per candidate: neck along the wall normal (horizontal part), yaw = normal yaw + U(−30°, 30°); chamber long axis perpendicular to the neck; floor `CHAMBER_SILL` 0.5 BU above the anchor's floor.
4. Validate (7.3, architect column). Discard failures.
5. Score; take the maximum; ties -> lowest candidate index.
6. Create the plan (`proposed`, source `architect`, need id).

Score S = 3·depthFit + 2·climateFit + 1.5·proximity − 1·digCost − 3·floodRisk − 1·pathCost + w_cover·cover + 0.5·compactness, where:

| Term | Definition |
| --- | --- |
| depthFit | 1 inside the band, else max(0, 1 − distance to band / 8 BU) |
| climateFit | Preference curve of the type (9.3) at the predicted temperature (day-mean formula) and humidity |
| proximity | max(0, 1 − path / 60 BU) to the related target: nursery -> royal; food -> nearest entrance; royal -> nursery; others 0.5 |
| digCost | min(1, targetVolume / (mean digSpeed × 200 BU³)) |
| floodRisk (T2) | 1 if the floor is below the predicted reference level, 0.5 within 2 BU above it, else 0 |
| pathCost | min(1, path to nearest entrance / maxPathToEntrance) |
| cover | 1 if the column above reaches a non-diggable cover within 15 BU |
| compactness | 1 − horizontal distance from nest origin / footprintR |

### 8.5 Spacing rules (summary; architect: hard, player: warnings unless stated)

| Rule | Value |
| --- | --- |
| Soil between cavities | ≥ WALL_MIN of the material (loam 2.0, humus 2.5, sand 3.0, clay 1.5, gravel 2.0, wood 1.0, insulation 1.5) |
| Stacked cavities | ≥ `FLOOR_MIN` 2.5 BU vertically |
| Roof | ≥ `ROOF_MIN` 3 BU of soil, or any non-diggable cover |
| Entrance keep-out | No cavity within 4 BU horizontally of another entrance's axis above 8 BU depth |
| Chambers attach by necks | Neck ≥ 2 BU; no chamber directly on a main shaft (founding excepted) |
| Junctions | ≤ 4 branches within 2 BU |
| Spans | W ≤ S_max or pillar layout (7.3) — refused for both |
| Depth and footprint | Within `maxDepth` and `footprintR` — refused for both |

### 8.6 Expected LN nest growth (tester reference, Naturalist, auto)

| Adult workers | Typical nest |
| --- | --- |
| 0 (sealed) | Founding shaft ~10 BU, founding cell ~19 BU³ |
| 8-20 | Founding cell -> `royal`; nursery S (63) |
| 25-40 | + food S, + rest M (126); ~350 BU³ open in total |
| 150 | + second nursery M, rest chambers by crowding; ~1,000 BU³ |
| 1,500 | ~3,000-4,000 BU³, 2-4 entrances, depth 40-80 BU |

---

## 9. Microclimate and brood placement

### 9.1 Temperature (T1 formula; inputs vary from T2 on)

For a point p, build the thermal column from p up to the outside surface: d_eff (mm) = Σ segment thickness (mm) × r_therm(material) (table 2.1; cavities 2.0). T_top = surface temperature of the topmost surface of that column (terrain, mound or cover object top; from the environment, by material and shade).

T(p) = T_annual + (T_seasonMean − T_annual)·e^(−d_eff/`D_A`) + (T_dayMean − T_seasonMean)·e^(−d_eff/`D_S`) + (T_top − T_dayMean)·e^(−d_eff/`D_D`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `D_D` | 80 mm | damping depth of the daily wave [EST, typical soils 80-120 mm] |
| `D_S` | 250 mm | weather spells |
| `D_A` | 1,500 mm | seasonal wave |
| T_dayMean / T_seasonMean | EMA of T_top with τ = 1 game day / 7 game days (kept by the environment per terrain cell or primitive) | |
| T_annual | climate constant (environment chapter) | |

Depth is physical (mm), so a 30 BU LN chamber (120 mm) and a 30 BU MB chamber (210 mm) are damped differently, as in reality. A chamber 3 BU under a sun-warmed 50 mm stone has d_eff = 50 × 0.35 + 12 = 29.5 mm: most of the daily warmth reaches it, which is why LN favours stones and slabs [R]. Interior wall voids use the indoor air temperature. In T1 (no weather) the environment supplies constant values and chambers simply differ by depth and cover.

### 9.2 Humidity

| Case | RH |
| --- | --- |
| Soil | m(d) = m_deep + (m_surf − m_deep)·e^(−d_mm/80); RH_soil = 0.5 + 0.5·smoothstep(0.05, 0.30, m(d)) |
| Ventilation | Chambers within 8 BU (path) of an open entrance: RH = lerp(RH_soil, RH_air, 0.3 × (1 − path/8)) |
| Wood (T3) | RH = 0.5 + 0.5·smoothstep(0.08, 0.20, wood moisture) |
| Interior wall voids | indoor RH (environment) |
| After flooding (T2) | 1.0, decaying linearly to the formula over 1 game day |

Each chamber updates T and RH every `MICRO_UPDATE_S` 25 game s (staggered); `microclimateAt(p)` answers on demand (tunnels, ground inspect at 10 BU depth, GDD 01).

### 9.3 Preference curves (LN, [EST]; species chapter owns other species)

Each curve is 1 inside [lo, hi] and falls linearly to 0 at the outer points.

| Use | Temperature lo-hi (0 at) | RH lo-hi (0 at) |
| --- | --- | --- |
| Eggs, larvae | 24-29 °C (16, 34) | ≥ 0.85 (0.5) |
| Pupae | 26-31 °C (18, 36) | 0.6-0.9 (0.4; 0.8 at 1.0) |
| Royal | 20-28 °C (12, 34) | ≥ 0.8 (0.5) |
| Food | 8-20 °C (0, 30) | 0.5-0.9 (0.3, 1.0) |
| Granary (MB, T3) | 10-25 °C (0, 35) | ≤ 0.7 (0.9) |
| Fungus (AT, T3) | 24-28 °C (18, 32) | ≥ 0.9 (0.75) |
| Rest, general | 1 (depth only) | 1 |

### 9.4 Brood placement ranking (nest publishes, colony chapter executes)

Every game hour, for each brood stage and nest: chamber score = g_T × g_H × [type accepts brood: `nursery`, `royal`, `founding`, `general`] × [capacity left]. If the best score ≥ the current chamber's + `TRANSLOC_HYSTERESIS` 0.1, the nest issues up to `TRANSLOC_PER_HOUR` 10 translocation jobs per stage (`nurse` task). Emergencies (flood predicted within 1 BU of a chamber floor and rising, actual flooding, collapse warning) allow any chamber type, ignore the cap, and score dryness first. Shallow nurseries under stones therefore receive brood by day and lose it at night, an emergent rhythm matching keeper observations [R, secondary].

---

## 10. Crowding effects (T1)

ρ is computed per chamber (occupants / capacity of that use) and for the nest (8.3).

| Effect | Rule |
| --- | --- |
| In-nest walking speed | × (1 − 0.5·clamp((ρ_local − 0.85)/0.65, 0, 1)), ρ_local of the chamber or tunnel space the ant is in (0.5 at ρ ≥ 1.5) |
| Resting recovery (fatigue, colony chapter) | × (1 − 0.4·clamp(ρ − 1, 0, 1)) |
| Brood care | When ρ_b > 1, overflow brood is placed in lower-scoring chambers (9.4); nurse feeding efficiency × (1 − 0.3·clamp(ρ_b − 1, 0, 1)) |
| Food handling | Food loads above food capacity lie in general space and tunnels (clutter-like, spoil × 1.5 in the economy chapter) |
| Alerts | `nest-crowded` (GDD 08) when any chamber ρ ≥ 1.4 for 1 game hour |

---

## 11. Flooding (T2)

### 11.1 Water in a nest

Per nest: water volume W (BU³). Every `FLOOD_STEP_S` 1 game s:

W += (Q_in − Q_out)·1 s, clamped to [0, open volume].

Q_in = Σ over entrances of `Q_BASE` (1.2 BU³/s) × I × c × f_cover × f_rim × f_state, where I = rain intensity at the entrance (environment: drizzle 0.1, rain 0.4, storm 1.0, sprinkler 0.5; 0 indoors), c = catchment = clamp(1 + (h_ring − h_ent)/2 BU, 0.25, 4) with h_ring = mean base terrain height (without mound) on a ring of 8 BU (× 1.5 if crusted, 2.2), f_cover = `COVER_FACTOR` 0.15 if a solid lies above the opening within 20 BU, else 1, f_rim from 4.3, f_state = 1 open, 0.5 sealing, 0.1 sealed.

Q_out = K_DRAIN(material) × A_wet × (1 − 0.7·m), A_wet = 0.25 BU² × count of flooded voxels with a non-open neighbour; K_DRAIN is the area-weighted mean of the flooded walls' materials.

### 11.2 Where the water goes

Spill height H*(v) = minimax path height from any entrance opening to v over open voxels (multi-source Dijkstra on max(y)). It is cached per nest with a cumulative volume table V(L) (0.25 BU bins) and wet-area table A(L), rebuilt when carving changes the nest (throttled to 5 game s). The water level L solves V(L) = W; voxels with H* ≤ L are **flooded**. Water fills sumps and low chambers first and enters a side chamber only once it rises over its sill. Trapped air is not modelled.

### 11.3 Effects

| Subject | Rule |
| --- | --- |
| Ant in a flooded voxel | Walker medium `water`; speed × 0.3; behaviour `flee` water along `D_exit` until dry. Health untouched for `SUBMERGE_GRACE_S` 50 game s (2 game hours) continuous, then −1 % max hp per game s (death at 150 s). |
| Brood in a flooded voxel | Development paused; dies after `BROOD_DROWN_S` 75 game s continuous submersion (event `brood-drowned`). Carried brood is not submerged. |
| Nurses | Evacuate brood from chambers flooded or predicted to flood within 1 BU (9.4 emergency). |
| Queen | Moves to the highest dry chamber (escorted by `queen-care`). |
| Solid food items | Spoilage × 2 while submerged (economy chapter). |
| Pellets | Stay; tamping clock continues. |
| Digging | Plans with flooded slots stall `flooded`. |
| Everything flooded | Ants gather at the highest non-flooded voxels, including the throat and the mound surface. |
| Recovery | W drains by Q_out; chambers get RH 1.0 for 1 game day (9.2); saturated sand lowers S_max and may trigger collapse checks (12). Alert `nest-flooding` while any brood or royal chamber is ≥ 25 % flooded. |

### 11.4 Reference storm (prediction for the architect, validation and UI)

Integrate 11.1 with I = 1.0 for 75 game s (3 game hours) from W = 0 at current moisture; report the predicted peak level and the chambers that would flood. Published as flood risk on chambers (nest overview) and as `nest-flood` diagnostics.

---

## 12. Collapse (T2)

Simple and fair: only wide soil ceilings in unstable conditions fall, always after a visible warning, never killing brood.

| Step | Rule |
| --- | --- |
| When checked | On plan completion, every game hour for nests with sand or humus ceilings, when soil moisture changes by > 0.1, and on human disturbance events (`nest.disturb(region, strength)`: S_max × 0.5 inside the region). |
| Unstable set U | Open voxels with 2·d_sup > S_max(ceiling material, moisture) + `COLLAPSE_TOLERANCE` 0.5 BU. Ceiling material = first non-open voxel straight above; non-diggable ceilings and wood never collapse. Ignore U with fewer than 4 voxels. |
| Warning | Event `collapse-warning` (falling grains, rumble cue, chamber card "Ceiling unstable"); timer `COLLAPSE_WARN_S`: Naturalist 60, Harsh 30 game s; Gentle: collapse disabled (warning only). Brood evacuation emergency (9.4). |
| At expiry | Re-evaluate U; if still non-empty: set openness 0 and `LOOSE` for U plus every open voxel above U in the same column up to the ceiling (a slump heap in the middle of the room), at most `COLLAPSE_MAX_VOLUME` 64 BU³ per event (largest component first). |
| Thin roof | If the roof above the largest U component is ≤ `ROOF_BREACH` 1.5 BU, also open a 1 BU-radius hole to the surface there: entrance kind `accidental`. |
| Contents | Ants, brood and items inside refilled voxels move to the nearest open voxel (BFS). Ants: stunned 3 game s, −10 % max hp. Brood: unharmed. Pellets: absorbed into the debris. |
| Afterwards | Chambers re-detected (may shrink or split); fields recomputed; plans whose volume was hit become `invalidated`. Player remedies (diagnostic `nest-stability`): evacuate, dig smaller rooms in dry sand, nest under stones, wait for damp weather. |

---

## 13. The founding dig (T1)

### 13.1 Requirements

| Species | D_MIN open soil | D_MIN under cover | V_MIN (deep volume) | W_MIN (d_sup ≥ W/2) | Template shaft | Template cell W x H x L | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LN | 8 BU | 5 BU | 10 BU³ | 3.5 BU (1.75) | diameter 2.5, depth 10 | 4 x 2 x 4.5 | T1 |
| MB | 20 | 15 | 15 | 4.0 | 2.5, 25 | 6 x 2.5 x 7 [R: 6-8 wide at 20-30] | T3 |
| AT | 30 | 25 | 25 | 4.5 | 2.5, 35 [R: ~25 cm] | 9 x 3 x 9 [R: ~6 cm] | T3 |
| CP | 3 into wood | 3 | 10 | 3.5 | tunnel 6 into `wood-decayed` or a log hollow | 4 x 2.5 x 5 | T3 |

LN values follow research: founding cell 2-3 BU wide at 8-15 BU depth, or 2-5 cm under a stone [R, EST]. The cell is wider than the shaft by design so the readiness test can tell them apart.

**Readiness** (recomputed every game s while digging): d_max = deepest open voxel depth of the founding cavity; V_deep = open volume with depth ≥ D_MIN − 2; width ok = max d_sup among those voxels ≥ W_MIN/2; roof ok = soil roof ≥ 2 BU or covered; openings ≤ 2.
R = 0.4·min(1, d_max/D_MIN) + 0.6·min(1, V_deep/V_MIN) × (width ok ? 1 : 0.8). **Ready** iff d_max ≥ D_MIN and V_deep ≥ V_MIN and width ok and roof ok and openings ≤ 2. D_MIN uses the cover value if the cell's column is covered. R drives the readiness bar (GDD 08).

### 13.2 Founding dig state machine (queen, player or AI)

| State | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `site-search` | New game or released daughter queen on the surface (opening chapter) | Site assessment on antennation (13.5) | First successful bite on diggable ground -> `digging` (creates the nest record with origin = bite point, kind `main`) |
| `digging` | — | Bites remove soil; **automatic expulsion**: no pellet item is created, the removed volume × `BULKING` is deposited on the founding mound at a random dump-ring cell (event `pellet-expelled` for the visual of soil pushed out) | Ready -> `ready` |
| `ready` | Readiness met | Founding chamber registered (`founding`); expulsion stops; each further bite puts a `soil-pellet` in the queen's mandibles; prompt "Seal the entrance" when she carries one in the throat | All openings `sealed` -> `sealed` |
| `sealed` | — | Claustral phase (opening chapter): laying allowed; no digging except inside the cavity (pellets go into the plug or are tamped) | Reopen trigger from the opening chapter (first workers) -> `reopening` |
| `reopening` | — | Architect-free `reopen` plan for the plug; nanitics dig it | Entrance `open` -> `established` (architect starts) |

AI queens (rivals, daughters, released player queen) dig the template as a plan with source `founding`, priority `urgent`, expulsion on, then perform 3 `seal-entrance` actions.

Workload (LN template, loam): shaft 49 BU³ + cell 18.9 BU³ ≈ 68 BU³ ≈ 80 bites of 1.3 s ≈ 105 game s of biting, about 2-3 game minutes with movement (D1).

### 13.3 Costs and failures

| Case | Rule |
| --- | --- |
| Reserves | Each queen bite costs `QUEEN_DIG_RESERVE` 0.0004 of full reserves (≈ 3 % for the whole founding dig; opening chapter owns the reserve model) |
| Non-diggable | `not-diggable` prompt ("concrete cannot be dug") |
| Hidden stone | Bites remove nothing there; she must move |
| Rain while digging (T2) | Flooding applies; sites under cover are safer (site assessment shows it) |
| Dry sand (T2) | The validator of the AI template and the player readiness ignore stability; collapse warnings still apply; the site assessment marks dry sand "unstable" |
| Natural cavity | Natural voxels count toward V_deep (3) |

### 13.4 Abandoning a site

If the founding queen bites diggable ground ≥ 6 BU from, and not connected to, her current founding cavity while in `digging`, the old cavity becomes an `abandoned-burrow` natural cavity (its mound stays) and the nest record restarts at the new site. At most 3 abandoned burrows per queen; older ones are filled in (instant).

### 13.5 Site metrics provided to the opening chapter

`siteAt(p)`: material at 2 BU depth, digSpeed (× and words easy / normal / slow / too hard), soil moisture class (dry < 0.15, damp < 0.6, wet < 0.9, waterlogged), S_max (stable / unstable when dry), cover (open / partly covered / under an object, with object material), predicted founding cell temperature now and as day-mean (9.1 at D_MIN), catchment c and cover factor (flood risk words: low < 0.5, moderate < 1.5, high), estimated bites to readiness.

---

## 14. The player's side (T1)

### 14.1 Digging as a possessed ant

| Item | Rule |
| --- | --- |
| Input | Hold F (GDD 01): repeated `dig-bite`; each bite leaves the previous pellet on the floor behind the ant; auto-advance as in GDD 01. |
| Carrying out | E "Pick up soil pellet"; carry to the surface; Space or E drops it. Released ants with a pellet haul it out (GDD 01 rule 8). |
| Freedom | Player bites are not clipped to plans; digging inside a plan's frontier counts toward it. Free-dug rooms register as `general` chambers (6.2). |
| Feedback | Prompt ring fills per bite; failure texts: "concrete cannot be dug", "too hard for your jaws", "nothing more to dig here". T2 context line when the room being dug exceeds 0.8 × S_max: "The ceiling here is wide for dry sand". |
| Sound / visual | `cue` `dig-bite` with material and removed volume (crumb particles scale with it). |

### 14.2 Cutaway and dig planner (UI layout in GDD 08 section 4.3; marker toolbar owned by the markers chapter)

| Step | Rule |
| --- | --- |
| Template | Chamber (types allowed for the species, 6.3; size S/M/L by Shift+wheel), Tunnel, Shaft, Entrance. |
| Anchor | The pick ray (slice plane hit in Slice mode, nearest cavity surface in X-ray) snaps to the nearest walkable wall voxel within 2 BU; shows an anchor disc on the wall with the outward normal. |
| Ghost | Built from the same geometry as the plan (7.1); Q/E rotate yaw 15°; shaft length by dragging (readout in BU and mm); tunnel: click start, click end on the slice plane (≤ 40 BU), optional 1 bend (click a middle point with Shift). |
| Live validation | `validatePlan` every pointer move (≤ 2 ms); valid = dashed outline; warning = amber with the warning text, second click confirms; refused = cross-hatched with the reason text. |
| Entrance tool | Click a surface point within 12 BU of a nest cavity; the ghost runs from the nearest cavity point to the surface. |
| Place | Sends `planDig`; the result arrives as `plan-created` or `plan-rejected {codes}`. |
| Edit | Click a plan: priority normal/high, pause/resume, cancel (`cancelPlan`). Architect proposals: accept (T2 suggest mode) or cancel. |
| Chambers and entrances | Click a chamber: inspect card and type change (`designateChamber`); click an entrance: seal / reopen (`sealEntrance` / `reopenEntrance`). |

Reason text (code -> words): `anchor-not-in-nest` "Start from a tunnel or chamber of this nest"; `non-diggable` "Concrete (stone, ...) cannot be dug"; `unstable` "Too wide a ceiling for this soil"; `undermines` "Too close to the surface / another entrance / another room above or below"; `too-close` "Leaves too thin a wall"; `foreign-nest` "Would break into a neighbouring nest"; `water` "Under water"; `out-of-bounds` "Too deep or too far from the nest"; `overlaps-plan` "Overlaps another plan"; `too-large` "Larger than this species builds" / "Entrance limit reached"; `type-not-allowed` "This species does not build that"; `flood-risk` "Low point: likely to flood".

---

## 15. Rival and generated nests (T2)

| Phase | Rule |
| --- | --- |
| World generation | For each rival site (chapters 04/05), with the worldgen RNG stream: run the founding template at the site, then replay architect growth steps for the rival's starting population (needs 8.3 from abstract numbers), carving each accepted plan instantly (`instantCarve`) with the rival species template and the same validation. Mounds receive removed volume × BULKING at their entrances with relaxation. Chambers, queen and brood are real and can be invaded. |
| Runtime growth | Once per game day per rival colony (staggered): compute needs from abstract population; at most one plan. If no player-colony ant and no camera focus is within `RIVAL_VISIBLE_DIST` 40 BU of the plan volume: instant carve. Otherwise carve progressively at `RIVAL_CARVE_RATE` 0.5 BU³/s as system bites on the frontier, removed volume going straight to the mound. |
| Contact | Rival plans refuse `foreign-nest`; contact with player cavities emits `foreign-cavity-contact`. |
| Spacing | Assumes world generation keeps nest origins ≥ `NEST_SITE_SPACING` 150 BU apart. |

---

## 16. Performance, determinism and saving

| Item | Rule |
| --- | --- |
| Budgets | ≤ 64 bites per tick; field recomputes ≤ 2 per tick; chamber detection ≤ 1 dirty region per tick; flood update 1 Hz per nest; H* rebuild ≤ every 5 s per nest; mound batch every 250 ticks per mound; render remesh budget owned by `render-nest`. |
| Determinism | Bites in ascending ant id; architect candidates and dump angles from the state RNG; all scans in fixed orders; no Map/Set iteration order dependence in persisted state. |
| Saving | Modified carve chunks (`open`, `flags`) live in `worldDelta`; untouched chunks come from world-generation pre-carves. Nests, plans, mounds (typed arrays), pellets and flood W are persisted. Clearance, d_sup, distance fields, H* tables and spoil caches are rebuilt by `createSim`. |

---

## 17. New identifiers added by this chapter

- Material: `insulation`.
- Item kinds (confirming GDD 01's assumption): `soil-pellet`, `frass`.
- Carve voxel flags: `LOOSE`, `NATURAL`, `PLUG`.
- Natural cavity kinds: `paving-joint`, `under-slab`, `stone-gap`, `kerb-void`, `asphalt-crack`, `root-channel`, `log-hollow`, `wall-void`, `pipe-gap`, `abandoned-burrow`.
- Entrance kinds: `dug`, `natural`, `accidental`, `window`. Entrance status: `open`, `sealing`, `sealed`, `reopening`.
- Nest kinds: `main`, `satellite`.
- Plan kinds: `tunnel`, `shaft`, `chamber`, `entrance`, `seal`, `reopen`, `widen`, `backfill`. Plan status: `proposed`, `queued`, `active`, `stalled`, `paused`, `complete`, `cancelled`. Plan sources: `player`, `architect`, `founding`, `worldgen`, `rival`. Priorities: `low`, `normal`, `high`, `urgent`. Chamber sizes: `s`, `m`, `l`.
- Validation codes: `anchor-not-in-nest`, `type-not-allowed`, `out-of-bounds`, `water`, `non-diggable`, `overlaps-plan`, `too-large`, `unstable`, `undermines`, `too-close`, `foreign-nest`, `flood-risk`.
- Blocked reasons: `no-diggers`, `no-haulers`, `unreachable`, `flooded`, `obstructed`, `unstable`, `temperature`, `season`, `foreign-contact`, `invalidated`, `cap`.
- Architect modes: `auto`, `suggest`, `off`. Needs: `crowding`, `brood-space`, `food-space`, `missing-type`, `winter-depth`, `flood-safety`, `entrance-access`.
- Founding dig states: `site-search`, `digging`, `ready`, `sealed`, `reopening`, `established`.
- Behaviour states: digger `seek-slot`, `go-to-slot`, `bite`, `deposit`, `carry-out`, `interrupted`; hauler `seek-pellet`, `go-pickup`, `carry-out`, `internal-dump`.
- Diagnostics (in addition to `dig-progress`, `nest-space`, `nest-climate` listed by GDD 08): `nest-flood`, `nest-stability`, `nest-traffic`.
- Alerts (in addition to GDD 08's `nest-crowded`, `nest-flooding`, `dig-stalled`): `nest-collapse-risk`, `entrance-breached`.
- Commands, events and cues: see Appendices B and C.

---

## Appendix A — State required

| Name | Type sketch | Purpose | Persisted |
| --- | --- | --- | --- |
| `worldDelta.carve.chunks` | `Record<string, { open: Uint8Array(4096); flags?: Uint8Array(4096) }>` keyed `"cx,cy,cz"` | Excavated and refilled space | yes |
| `worldDelta.naturalOwners` | `Record<number, number>` cavity id -> nest id | Ownership of joined natural cavities | yes |
| `nests[]` | `{ id, colony, kind: 'main'|'satellite', parentNestId, origin: Vec3, entrances: Entrance[], chambers: Chamber[], digPlans: DigPlan[], moundIds: number[], architect: ArchitectState, flood: FloodState, founding?: FoundingDigState, collapse: CollapseWarning[], volumeOpen: number }` | Nest records | yes |
| `Entrance` | `{ id, kind, status, pos, dir, radius, moundId, rimTarget, plugVoxelCount, createdTick, trafficIn, trafficOut }` | 4 | yes |
| `Chamber` | `{ id, type, designatedBy, center, radii, volume, floorArea, depthBU, depthMm, roofMin, covered, seedVoxel, voxelCount, capacity: {adults, brood, food, other}, occupancy: {...}, temp, humidity, wetUntilTick, flooded: number (fraction), floodRisk: number, createdTick }` | 6, 9 | yes (derived fields refreshed) |
| `DigPlan` | per 7.1, `spheres: {c: Vec3, r: number, done: boolean, obstructed: boolean}[]` | 7 | yes |
| `ArchitectState` | `{ mode, needToggles: Record<need, boolean>, lastEvalTick, blacklist: {pos, untilTick}[], needCache: Record<need, number> }` | 8 | yes |
| `FloodState` | `{ water: number, level: number, lastTick, floodingSinceTick }` | 11 | yes |
| `FoundingDigState` | `{ state, readiness, cavitySeed: Vec3, abandoned: number[], readyTick, sealedTick }` | 13 | yes |
| `CollapseWarning` | `{ id, region: {center, radius}, voxelCount, startTick, dueTick }` | 12 | yes |
| `mounds` (in `worldDelta` dynamic primitives) | `{ id, nestId, entranceId, center: [x,z], cell, n, base: Float32Array, h: Float32Array, material, volume, absorbed, lastBatchTick }` | 1.4 | yes |
| `items[]` with kind `soil-pellet` / `frass` | Item + `{ volume, material, droppedTick, inNest: boolean, spoilPlanId, reservedBy }` | 1.3 | yes |
| `Ant.bb` dig keys | `planId, slotIdx, spoilTarget, pelletId` (numbers) | 7.7 | yes |
| `world.naturalCavities` (static) | `NaturalCavity[]` | 3 | regenerated |
| `world.soilProfiles` (static) | per terrain cell `{ layers: [{material, thickness}], crust }` | 1.1, 2.2 | regenerated |
| Caches | clearance Uint8 per chunk; d_sup per chunk; `D_exit`/`D_seal`/`D_ch`/`D_plan` Uint16 per chunk; H* and V(L)/A(L) tables; per-nest pellet spatial index | 5, 6, 11 | no (rebuilt) |

## Appendix B — Commands

| Command | Payload | Result |
| --- | --- | --- |
| `planDig` | `{ nestId, kind, chamberType?, size?, anchor: {pos, normal}, end?: Vec3, bend?: Vec3, length?: number, yawDeg?: number, surfacePoint?: Vec3, priority: 'normal'|'high', confirmWarnings: boolean }` | `plan-created` or `plan-rejected {codes, warnings}` |
| `cancelPlan` | `{ planId }` | status `cancelled` |
| `setPlanPriority` | `{ planId, priority }` | |
| `pausePlan` / `resumePlan` | `{ planId }` | |
| `acceptPlan` (T2) | `{ planId }` | `proposed` -> `queued` |
| `designateChamber` | `{ chamberId, type }` | `chamber-designated` or `command-rejected {reason}` |
| `setAutoExpand` | `{ nestId, mode: 'auto'|'suggest'|'off' }` | |
| `setArchitectNeed` (T2) | `{ nestId, need, enabled }` | |
| `sealEntrance` / `reopenEntrance` | `{ entranceId }` | creates a `seal` / `reopen` plan |
| Player actions | via GDD 01 `action`: `dig-bite`, `pick-up`, `put-down`, `seal-entrance`, `unseal-entrance` | |
| Read-only queries (debug API `query.*` and UI) | `validatePlan(spec)`, `nest(id)`, `voxel(p)` -> `{open, flags, material, clearance}`, `field(nestId, target, p)`, `microclimate(p)`, `flood(nestId)` -> `{W, L, flooded chambers, reference prediction}`, `mound(id)`, `siteAt(p)` | pure functions of state |
| Cheats (flag-guarded) | `carveSphere(p, r)`, `carveEllipsoid(c, radii, yaw)`, `fillSphere(p, r, loose)`, `instantPlan(planId)`, `setSoilMoisture(region, m)`, `setRain(I)`, `setDrainScale(k)`, `setChamberClimate(id, T, RH)`, `spawnPellets(p, n, volume)`, `completeFounding()`, `setFoundingState(state)` | |

## Appendix C — Events

| Event | Payload | Consumers |
| --- | --- | --- |
| `carve-chunks-dirty` | `{ keys[] }` | render-nest remesh, caches |
| `breach` | `{ nestId, entranceId, pos, radius }` | render (discard sphere), audio |
| `pellet-created` / `pellet-expelled` | `{ antId, itemId?, volume, material, pos, moundId? }` | render crumbs, audio, stats (volume dug) |
| `pellet-dumped` | `{ itemId, into: 'mound'|'heap'|'terrain'|'water'|'plug'|'tamp' }` | render, stats |
| `mound-changed` | `{ moundId, bbox }` | render mound mesh |
| `entrance-opened` / `entrance-state-changed` | `{ entranceId, kind, status, prev }` | UI, journal ("first new entrance"), alerts (`entrance-breached` for `accidental`/unplanned) |
| `plan-created` / `plan-rejected` / `plan-status-changed` / `plan-progress` (≤ 1 per game s per plan) / `plan-complete` | `{ planId, kind, status, blockedReason, progress, codes }` | UI overlay, alerts (`dig-stalled`), journal (milestones "second chamber", "first expansion") |
| `architect-proposal` | `{ planId, need, priority }` | UI, journal log |
| `chamber-registered` / `chamber-changed` / `chamber-removed` / `chamber-designated` | `{ chamberId, type, volume, reason }` | UI nest overview, journal ("10 chambers"), colony (brood/food redistribution) |
| `natural-cavity-joined` / `foreign-cavity-contact` | `{ cavityId, nestId, otherColony? }` | journal, rivals |
| `founding-readiness` (≤ 1 per game s) / `founding-ready` / `founding-sealed` / `founding-reopened` | `{ nestId, readiness, parts }` | readiness bar, onboarding hints, opening chapter |
| `flood-started` / `flood-level` (≤ 1 per 5 game s) / `flood-ended` | `{ nestId, W, level, chambers[] }` | alerts `nest-flooding`, render water surfaces, audio trickle |
| `ant-submerged` / `ant-drowned` / `brood-drowned` | `{ id, pos }` | UI, journal cause chain, epitaph causes |
| `collapse-warning` / `collapse` | `{ nestId, region, volume, breach? }` | alert `nest-collapse-risk`, particles, audio rumble |
| `nest-milestone` | `{ kind: 'depth-50'|'depth-100'|'chambers-10'|'volume-1000'|'survived-flood', value }` | journal |
| `cue` | `dig-bite.<material>`, `pellet-drop`, `seal-tamp`, `collapse-rumble`, `water-trickle`, `mound-slump` with pos and strength | audio, fx |

## Appendix D — Diagnostics ("why" view)

Each record `{ id, system: 'nest', status, label, value, factors[{cause, weight, detail}], remedies[], sinceTick }`; weights are normalised shares of the shortfall.

| Id | Status rule | Factors (weight = share of lost rate or excess) | Remedies |
| --- | --- | --- | --- |
| `dig-progress` (per plan, worst shown) | ok: rate ≥ 70 % of slot potential; warn: < 70 % or `no-haulers`; bad: `stalled` | diggers short (1 − assigned/slots); haul bottleneck (share of digger time spent carrying out); hard substrate (1 − min(1, digSpeed)); temperature (1 − workRate); clutter on the route (1 − clutter multiplier); flooding; obstruction | Raise Dig share; lower other plans; move the plan to softer soil; wait for warmth; clear clutter (haulers) |
| `nest-space` | ok: ρ ≤ 0.85 and ρ_b ≤ 0.8 and food ≤ 0.8; warn: any above; bad: ρ ≥ 1.3 or ρ_b ≥ 1.3 | adult crowding; brood space; food space; architect off; no diggers | Plan a rest chamber / nursery / food chamber; switch the architect on; raise Dig share |
| `nest-climate` | ok: best brood chamber score ≥ 0.8; warn ≥ 0.5; bad < 0.5 | too cold, too hot, too dry, too humid (each = 1 − its curve value, normalised); no chamber under cover; nursery too shallow/deep | Dig a nursery under a stone or slab; deeper rooms for summer heat; avoid entrance-adjacent nurseries (drying) |
| `nest-flood` (T2) | ok: no brood/royal chamber in the reference prediction; warn: predicted; bad: currently flooding | exposed entrance (c, f_cover); low rim; crusted ground run-off; slow-draining clay; low brood chamber | Raise the rim (automatic with architect); new entrance under cover; nursery higher up |
| `nest-stability` (T2) | warn: any collapse warning or ceilings within 90 % of S_max; bad: collapse in the last game day | dry sand; saturated sand; wide room; disturbance | Evacuate brood; smaller rooms; nest under stones; wait for damp weather |
| `nest-traffic` | warn: choked spots, > 100 clutter pellets, or congested entrance | clutter pellets; squeeze tunnels; entrance congestion | More haulers; widen (T2); new entrance (T2) |

## Appendix E — Acceptance checks

Setup unless stated: `?test=1&seed=1&quality=low&autostart=1`, LN, flat loam test world (`src/sim/testing/testWorld.ts`), soil moisture 0.4, 22 °C everywhere (workRate 1), Naturalist, architect `off`, rain 0. Volumes are measured from the carve grid via `query.voxel` sums.

1. **Given** a worker facing a flat loam wall, **when** it performs one `dig-bite`, **then** the action lasts 10 ticks, removed volume is 0.70-1.00 BU³, and the worker holds exactly one `soil-pellet` whose `volume` equals the removed volume (± 1e-6).
2. **Given** the same setup with the wall material changed, **when** one bite is timed, **then** it lasts 7 ticks in sand (m 0.4), 23 ticks in clay (m 0.4), 41 ticks in clay (m 0.05), and 5 ticks on loose loam (a plug).
3. **Given** a worker facing concrete, **when** it attempts `dig-bite`, **then** the action fails with `not-diggable`, the carve-chunk hash is unchanged and no item is created.
4. **Given** an LN worker facing `wood-sound`, **then** `dig-bite` fails `not-diggable`; **given** a CP media (T3) facing `wood-sound` with wood moisture 0.2, **then** the bite lasts 25 ticks and yields a `frass` item.
5. **Given** a worker that digs 50 bites at a fresh wall and haulers who carry every pellet to the surface, **when** 6,000 more ticks elapse, **then** the entrance mound volume equals 1.25 × Σ removed (± 0.5 %), no pair of adjacent mound cells differs by more than 0.5 × tan 38° + 0.01 BU in top height, and cells within the entrance radius have h = 0.
6. **Given** a `soil-pellet` dropped on the surface 3 BU from an entrance, **then** it still exists as an item at age 2,990 ticks and has merged into that entrance's mound by age 3,260 ticks.
7. **Given** a clutter pellet of volume 0.85 lying untouched in a tunnel, **when** 12,000 ticks elapse, **then** the item is gone and open volume within 1.5 BU of it fell by 0.85 ± 0.01 BU³, with those voxels flagged `LOOSE`.
8. **Given** a founding queen in `digging` and a carved cavity of a 2.5 BU shaft to 10 BU depth plus a 4 x 2 x 4.5 cell at its bottom (open soil), **then** founding readiness = 1 and state is `ready` within 10 ticks; **with** the shaft only, **then** it stays `digging` (width test); **with** the cell at 6 BU depth, **then** `digging` in open soil but `ready` when a stone covers the column.
9. **Given** a founding queen in `digging`, **when** she bites once, **then** no `soil-pellet` item exists afterwards and the founding mound volume grew by 1.25 × the removed volume.
10. **Given** a queen in `ready` carrying a pellet in a 2.5 BU throat, **when** she performs `seal-entrance` up to 3 times (20 ticks each, re-digging a pellet in between), **then** the entrance status becomes `sealed`, `D_exit` has no seeds, and `entrance-state-changed` (to `sealed`) and `founding-sealed` were emitted.
11. **Given** a tunnel wall anchor at depth 20 BU with no cavity within 6 BU, **when** `validatePlan` is called for a nursery size `m` (8 x 2.5 x 12), **then** ok = true and targetVolume = 135 ± 10 BU³ (125.7 ellipsoid + neck).
12. **Given** the same plan in sand, **then** it is refused `unstable` at moisture 0.05 (S_max 2.5) and accepted at moisture 0.5 (S_max 8, W 8).
13. **Given** a chamber plan whose wall would lie 1.5 BU from another chamber in loam, **then** an architect-sourced plan is refused `too-close` and a player plan is accepted only with `confirmWarnings: true` and carries the warning `too-close`.
14. **Given** a valid 10 BU `tunnel` plan from a wall at depth 15 BU and 2 diggers plus 2 haulers assigned by cheat, **then** status is `active` within 300 ticks and `complete` within 6,000 ticks, ≥ 97 % of target voxels are open, and no voxel with g < −0.25 BU changed openness because of plan bites.
15. **Given** a queued plan and Dig share 0, **then** within 150 ticks status is `stalled` with `blockedReason` `no-diggers`, and diagnostic `dig-progress` is `bad` with a remedy mentioning the Dig share.
16. **Given** an active chamber plan at ≥ 40 % progress, **when** `cancelPlan`, **then** status is `cancelled`, all its slots are free, and during the next 1,000 ticks no voxel inside its volume changes openness.
17. **Given** `cheat.carveEllipsoid` of 8 x 2.5 x 12 BU connected to the nest by a 2 BU tunnel, **then** within 60 ticks a chamber of type `general` with volume 126 ± 12 BU³ is registered.
18. **Given** a nursery of volume 100 BU³ holding 40 eggs and 20 larvae, **then** its brood capacity is 150 and its brood occupancy is 30 (ρ_b = 0.2).
19. **Given** 120 adult workers all inside the nest's only resting space, a `rest` chamber of capacity 100 (so ρ = ρ_local = 1.2), architect `auto`, 4 idle workers able to dig, **then** the speed multiplier of an ant in that chamber is 0.731 ± 0.001, within 600 ticks a `proposed` plan with need `crowding`, type `rest` and priority `high` exists, and 300 ticks later it is `queued`.
20. **Given** T_annual 10, T_seasonMean 18, T_dayMean 20, T_top 35 °C and a chamber with d_eff 80 mm, **then** its temperature is 24.6 ± 0.1 °C; **given** soil moisture 0.1 at its depth and no entrance within 8 BU, **then** its RH is 0.552 ± 0.005.
21. **Given** nurseries A (forced 21 °C) and B (forced 27 °C), 10 larvae in A, 3 nurses and spare capacity in B, **then** within 250 ticks at least one translocation job exists and within 3,000 ticks at least 8 larvae lie in B.
22. **(T2) Given** drain scale 0, one open entrance on flat ground (c = 1), no cover, rim 0, no crust, **when** rain intensity 1.0 runs for 250 ticks, **then** W = 30.0 ± 0.3 BU³ and the flooded voxels are exactly those with the lowest spill heights totalling 30 ± 0.5 BU³; **with** rim 3 BU instead, **then** W = 3.0 ± 0.1 BU³.
23. **(T2) Given** a worker held immobile by cheat in a flooded voxel, **then** its hp is unchanged after 500 ticks and it is dead by 1,510 ticks; **given** a larva submerged, **then** it is alive at 740 ticks and dead by 760 ticks.
24. **(T2) Given** a free-dug cavity 10 BU wide in sand at moisture 0.05 containing 5 larvae and 2 workers, **then** `collapse-warning` occurs within 250 ticks and `collapse` 600 ticks later; afterwards no open voxel in that region has 2·d_sup > 3.0 BU, all 5 larvae are alive in open voxels and both workers lost 10 % max hp; **on** Gentle no `collapse` occurs within 3,000 ticks.
25. **Given** a `shaft` plan dug upward to the surface, **then** `entrance-opened` with kind `dug` is emitted on the breaching bite and `D_exit` is finite at every chamber within 20 ticks; **given** a tunnel dug into an `under-slab` cavity with a paving-joint opening, **then** the nest gains an entrance of kind `natural`; **and** two runs with the same seed and command log produce identical carve-chunk hashes after 6,000 ticks, also after a save/load at tick 3,000.

## Appendix F — Cross-chapter assumptions

1. **GDD 01 (actions)**: `dig-bite`, `seal-entrance`, `unseal-entrance`, `pick-up`, `put-down` run through the shared lifecycle; this chapter owns their effects and timing factors. `workRate` already includes temperature and health; `caste.digPower` is the species/caste multiplier for digging. GDD 01 check 6 expects 8-10 BU³ from 9-10 bites; with face-levelling targeting the expected range is 7-10 BU³ (see risks). GDD 01 check 3 (pellet within 6 BU of the entrance after 120 s) holds because surface pellets stay items for 300 game s.
2. **Locomotion**: applies clutter, squeeze and crowding speed multipliers given here; handles walker medium `water`; carrying a pellet costs about 10 % speed; follows nest fields as in 5.2; never lets ants inside refilled voxels (collapse/plug code moves them first).
3. **Colony chapter (02)**: task allocation consumes the dig and haul stimuli (7.7) and the Dig share (dig + haul); nurses execute translocation jobs from 9.4 and evacuation; the colony chooses the brood chamber per stage using the ranking published here; brood development reads chamber temperature and humidity; economy reports solid food loads in the nest and applies flood and overflow spoilage; queen moves on `move-queen`.
4. **World generation (04)**: provides soil profiles with crusts, buried obstacles, natural cavities with openings, wood primitives with moisture and grain (T3), rival nest sites with origins ≥ 150 BU apart and nothing else carved there; validation that every founding-eligible zone has diggable ground at least D_MIN deep.
5. **Environment (06)**: provides per-location T_top by material and shade, the EMAs T_dayMean and T_seasonMean, T_annual, indoor T and RH, air RH, soil surface moisture and m_deep, rain intensity per location (including sprinklers), winter dormancy flag; triggers winter sealing; schedules human disturbances calling `nest.disturb`.
6. **Opening chapter (06)**: owns the queen reserve model, laying, the time-lapse, and the reopen trigger; uses `siteAt` and the readiness bar; founding day per species.
7. **Ecology, rivals, combat (05)**: rivals provide abstract populations for nest growth; react to `foreign-cavity-contact`; combat may seal entrances under raid; birds may target mounds (mound visibility is the mound volume).
8. **Species chapter (07)**: owns `SpeciesDef.nestTemplate` and `SpeciesDef.dig` values for CP, MB, AT and the economy modules (wood moisture, granary germination, fungus garden) that read chamber climate; may refine the T3 columns here without renaming.
9. **UI (08)**: plan status names and colours match 7.8 (`paused` and `cancelled` added); chamber S/M/L sizes must be read from the species template (LN 8 / 12 / 16 BU long axis, not fixed widths); reason strings come from 14.2; Directives "Seal entrances in cold weather" maps to 4.2.
10. **Progression**: aggregates the diagnostics of Appendix D, turns `nest-milestone` and plan/chamber events into journal milestones, and uses drowning and collapse causes in the epitaph.
11. **Difficulty (06/T3)**: Gentle disables collapse; Harsh halves the collapse warning; custom toggle `collapse` exists.
12. **Render-nest**: remeshes dirty chunks, discards fragments in breach spheres, draws mounds from the heightfield, water surfaces at level L, plan ghosts from the plan geometry, crumbs from `pellet-*` events.
13. **Markers chapter**: `MARKER_CAP.dig` = 8 and the `entrance` marker creates an `entrance` plan via `planDig`.

## Open risks

- GDD 01 acceptance check 6 assumes about 0.9 BU³ per consecutive bite; face-levelling targeting gives 0.75-0.9 at a fixed face, so that check may need a 7-10 BU³ range.
- Voxel discretisation (0.5 BU) makes width-based tests (d_sup, clearance) sensitive to alignment; the thresholds here were chosen with half-voxel slack, but scripted tests should carve with the cheat ellipsoid and allow ± 10 % volume.
- Bite and haul throughput depends on walk speed, which the dossier puts at 6 BU/s cruise and the seed at ~12 BU/s; dig-plan completion times scale accordingly, so tests bound times generously and balance runs should check that the second LN chamber completes within about 2 game days of the first workers.
- The flood spill-height model ignores trapped air and soil seepage from below; deep nests in waterlogged hollows will be safer than reality.
- Microclimate damping depths and brood preference curves are estimates; LN-specific thermal data were not found in the research.
- Mound relaxation and 64 KB-per-mound grids are fine for a few dozen mounds, but AT (up to 40 entrances) may need a coarser grid (1 BU cells) in T3.
- Running many full distance fields (one per chamber) in a 4,000-voxel-chunk nest at 1,500 ants must be profiled; fall back to a nest graph with per-segment fields if the budget is exceeded.
