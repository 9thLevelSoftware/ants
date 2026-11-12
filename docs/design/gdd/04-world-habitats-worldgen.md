# FOUNDRESS GDD — Chapter 04: World, Habitats, Procedural Generation and Human Activity

Status: complete draft for engineering and test. Binding sources: `docs/01-design-seed.md` (units, BU, grids, tiers, originality), `docs/02-design-directions.md` (sections E, J, K), `docs/03-architecture.md`. Research: `research/ecology-habitats.md` (final, verified: content list section 6, event list section 7), nesting sections of `research/bio-lasius-niger.md`, `bio-camponotus.md`, `bio-messor.md`, `bio-atta.md` (all verified). No look-dev spike document exists yet; visual rules here are stated as data the renderer consumes. Neighbouring chapters read: 01 (modes, controls, camera), 06 (environment), 08 (UI, art, audio).

Tier tags: **[T1]** core, **[T2]** full sandbox, **[T3]** breadth and polish. Untagged rows inherit the tag of their section heading.

---

## 0. Scope and conventions

### 0.1 What this chapter owns

| Subsystem | Code home | Owns |
|---|---|---|
| World generator | `src/worldgen/**` | params -> `WorldStatic` + initial entities; validation; regeneration; fingerprint |
| World queries | `src/sim/world/**` | zones, materials, strata, surface properties, top-surface height, shade samples, nav grid, climb routes, POIs, micro-connections, suitability and access maps, water bodies, map boundary |
| Human activity | `src/sim/environment/human.ts` | daily schedule, telegraph cues, event execution, effects, reactive rules, difficulty scaling |
| World dynamics | `src/sim/world/dynamic.ts` | dynamic primitives (cars, toys, bait stations), grass height, terrain deltas, door state, discovered connections |

Not owned here (read from other chapters): air, surface and soil temperature, soil moisture, puddle depth, flood inflow (chapter 06); carving rules and dig rates (nest chapter); food amounts and renewal (ecology chapter); creature behaviour (creature chapter); rival colony simulation (rival chapter); walker physics (locomotion chapter).

### 0.2 Notation

- Lengths in mm unless marked BU. `L` = map side in mm. `BU_mm` = species BU (Lasius 4, Camponotus 9, Messor 7, Atta 7).
- Primitive notation (all are the seed's solid primitives; meshes come from the same list):
  `RB(W×H×D; r)` rounded box, full extents along local X, Y (up), Z, edge radius r. `CY(Ø×H)` cylinder (local Y axis; "lying" = axis horizontal). `CA(Ø; Len)` capsule of total length Len. `EL(W×H×D)` ellipsoid, full extents. `chain` = CA segments joined end to end. `ring(n)` = n RB staves arranged on a circle (used for every hollow vessel, because primitives only combine by union).
- Flags: **C** climbable, **D** diggable (carve ops may open it; terrain diggability comes from strata), **S** offers shelter (a ceiling or enclosed gap within 3 BU), **Sl** slippery (grip < 0.5, section 3).
- Densities are per m² of the host zone unless stated. "p" = placement probability.
- Time: GD = game day (600 s at 1x); game hour = 25 s at 1x; "s" = game seconds. Human motion runs at real physical speed in game seconds; session durations are gameplay values (Deviation V3).

### 0.3 Tier map

| Feature | Tier |
|---|---|
| All five T1 archetypes, all zone types, pipeline, object catalogue, micro-connections, pre-existing cavities, decor, climb routes, nav grid, boundary, Lasius suitability map, persistence, determinism | T1 |
| Baseline food anchors for the Lasius loop (crumbs, sugar, dead insects, honeydew anchors) | T1 |
| Seasonal decor (leaf fall, petals), creature territories, rival sites, full resource placement, water bodies' drinking and drowning, human activity (all events), reactive humans, door-open state | T2 |
| Regions other than `temperate-eu`, archetype `field-margin`, suitability for the three other species, leaf-blower variant, oil slickness, window-sill gap, wall sockets as nest sites | T3 |

---

## 1. Locality, map sizes, regions, archetypes [T1]

### 1.1 Map sizes

World spans X, Z in `[0, L]`, Y up, ground datum y = 0 (seed section 3). `sizeClass` sets the side in BU; the side in mm depends on species, so every habitat object keeps its true size and larger species get a physically larger locality.

| `sizeClass` | Side (BU) | Lasius L (m) | Messor / Atta L (m) | Camponotus L (m) | Heightfield cells (4 BU) | Nav cells (16 BU) | Carve chunks per side (8 BU) |
|---|---|---|---|---|---|---|---|
| `compact` | 3000 | 12.0 | 21.0 | 27.0 | 750 | 188 (last column/row partial) | 375 |
| `standard` | 4000 | 16.0 | 28.0 | 36.0 | 1000 | 250 | 500 |
| `large` | 5000 | 20.0 | 35.0 | 45.0 | 1250 | 313 (partial) | 625 |

Partial nav cells beyond `L` are class `edge` (section 11). Heightfield samples = cells + 1 per side.

### 1.2 Regions

| `region` id (new) | Default for | Plant and tree palette | Topsoil (strata override, 2.3) | Base moisture offset | Rival roster source | Tier |
|---|---|---|---|---|---|---|
| `temperate-eu` | `lasius-niger` | oak, beech, lime, sycamore; rose, bean, nasturtium; clover, dandelion | loam over clay | 0 | ecology 3 (UK / central Europe) | T1 |
| `ne-america` | `camponotus-pennsylvanicus` | maple, oak, white pine; hosta, bean; clover | loam over clay | 0 | ecology 3 (NE USA) | T3 |
| `mediterranean` | `messor-barbarus` | holm oak, stone pine, olive; dry grasses, thistles | dry loam (300 mm) over gravel | -0.15 | ecology 3 (Mediterranean) | T3 |
| `southern-us` | `atta-texana` | loblolly pine, sweetgum, oak, yaupon; citrus in gardens | sand 300 mm over loam | 0 | ecology 3 (S. US) | T3 |

The climate profile (chapter 06) is chosen from the region; the region never changes object sizes.

### 1.3 Archetypes

Built zones have physical size rules (1.4); natural zones share the remaining area by the fractions below, renormalised. Each archetype yields 3 to 5 zones. Optional zones are rolled in listed order; once the zone count reaches 5, further optional zones are skipped.

| Archetype id (new) | Tier | Mandatory zones (fraction of natural remainder) | Optional zones (p; fraction) | Signature features | Species fit (0-3: Lasius / Camponotus / Messor / Atta) |
|---|---|---|---|---|---|
| `woodland-edge` | T1 | `forest` (0.55-0.70), `lawn` variant `rough` 50 % or `mown` (0.25-0.40), `pavement` variant `path` (built) | `garden-bed` (0.4; 0.05-0.10), `asphalt` variant `lane` (0.4; built) | 3-6 standing trees, logs, stumps, stones in clearings, footpath with bench, fence or dry-stone wall on one map edge | 3 / 3 / 1 / 3 (with `southern-us`) |
| `suburban-garden` | T1 | `lawn` `mown` (0.50-0.65), `garden-bed` (0.25-0.35), `pavement` `patio` + `path` (built) | `forest` "shrubbery corner" (0.3; 0.10-0.15), `interior` (0.35; built), `asphalt` `driveway` (0.3; built) | house façade along one edge, shed, fence, compost bin, water butt, pots, fruit tree, stepping stones | 3 / 2 / 1 / 2 |
| `playground-park` | T1 | `lawn` `mown` (0.65-0.80), `sand` (built), `rubber` (built), `pavement` `path` (built) | one of: `forest` tree belt (0.5; 0.20-0.35) or `garden-bed` shrub (0.3; 0.10-0.20) | sand pit with timber edging, slide, swing frame, spring rider, benches, bins, picnic table, park trees | 3 / 1 / 2 / 1 |
| `car-park-verge` | T1 | `asphalt` `car-park` (built), `pavement` `sidewalk` (built), `lawn` verge `rough` 60 % (0.60-0.75) | `garden-bed` shrub (0.5; 0.15-0.25), `forest` (0.3; 0.15-0.25) | bays with painted lines, wheel stops, 1-3 parked cars, kerbs, gully grates, lamp post, bollards, tree pits, litter, bin | 3 / 1 / 2 / 1 |
| `kitchen-door` | T1 | `interior` (built), `pavement` `patio` + back step (built), `lawn` `mown` (0.55-0.70), `garden-bed` (0.30-0.45) | `asphalt` `driveway` (0.3; built) | kitchen slice behind the back door: door crack, pipe penetration, kick-space, table and chairs, pet bowls, bin, counter with food; air bricks, weep vents, linear drain | 3 / 3 / 0 / 1 |
| `field-margin` | T3 | `lawn` `rough` (0.60-0.75), `garden-bed` variant `fallow` (0.20-0.30), `asphalt` `lane` (built) | `forest` hedge-scrub (0.5; 0.10-0.20) | dry-stone wall, gravel-edged lane, seeding grasses, bare sunny patches, few people | 2 / 1 / 3 / 1 |

Random archetype selection (New Game "random") uses the species-fit numbers as weights (0 excluded).

### 1.4 Built-zone size rules

| Built zone | Shape and size (mm) | Placement |
|---|---|---|
| `interior` (house strip) | strip along the chosen house edge, depth `INTERIOR_DEPTH = clamp(0.22 L, 3000, 4500)`; enterable kitchen slice width `clamp(0.5 L, 3000, 6000)`; the rest of the strip is sealed house (solid façade block, not enterable) | house edge chosen uniformly from 4 edges; kitchen slice offset uniform along the edge, at least 600 from the corners |
| `pavement` `patio` | rect `clamp(0.30 L, 2400, 6000)` wide × `clamp(0.15 L, 1800, 4000)` deep | against the house edge, centred on the back door (kitchen-door) or within the façade span (suburban) |
| `pavement` `path` | polyline width 900-1500, connecting 2-3 human nodes (door, gate on a map edge, bench) | routed on a 250 mm grid by A* with cost noise, then smoothed (Chaikin ×2) |
| `pavement` `sidewalk` | band 1500-2500 wide | between `asphalt` and the rest, full map width |
| `asphalt` `car-park` | band along one edge, depth `clamp(0.45 L, 5000, 16000)`; one row of 2400 × 4800 bays against the sidewalk, aisle beyond | edge opposite the house edge if any |
| `asphalt` `driveway` / `lane` | band 2500-3500 wide | along a free edge (driveway touches the house edge) |
| `sand` | rect side 2000-4000, cap 0.25 L | inside the park area, ≥ 1500 from the map edge |
| `rubber` | rect 3000-6000 per side, cap 0.30 L | adjacent to the sand pit; holds the play equipment |

If built zones exceed 70 % of the map (possible on `compact` Lasius maps), shrink each built rect by 10 % repeatedly to their minimums; if still over, drop the lowest optional built zone.

---

## 2. Zone model [T1]

### 2.1 Zone types and variants

| Zone (J id) | Variants (new ids) | Surface layer (sim) | Ground material at surface | Macro relief amplitude / wavelength | Micro relief amplitude / min wavelength | Shade and shelter sources | Footstep sound class |
|---|---|---|---|---|---|---|---|
| `forest` | `deciduous`, `pine-hardwood` | litter 20-60 deep: cover 0.5, travel ×1.25 (pine needles: grip 0.6 when dry) | `humus` | 120 mm / 3-6 m | 8 mm / 3 cells | canopy (transmittance 0.3), logs, stumps, roots, litter, stones | `litter` |
| `lawn` | `mown`, `rough` | sward of dynamic height (mown 25-80, rough 100-300): cover 0.4 (rough 0.6), travel ×1.15 (rough ×1.3), visibility to birds ×0.5 | `loam` | 40 mm / 4 m | 3 mm / 3 cells | sward, trees nearby, structures | `plant` |
| `garden-bed` | `flower`, `vegetable`, `shrub`, `fallow` | mulched (p 0.6): cover 0.5, travel ×1.2; otherwise bare loam clods | `loam` | 30 mm / 3 m (+ raised-bed offset 150-300 for 30 % of beds) | 6 mm / 3 cells | plants, shrubs, boards, pots | `soft-soil` |
| `pavement` | `patio`, `path`, `sidewalk` | slab primitives; joint grooves | slab `concrete`/`stone`; joint `sand` | planar, fall 1:60 away from the house or toward a drain | slab tilt ≤ 0.6°, step ±2 mm, 3 % of slabs ±6 mm lips | structures, furniture | `hard` |
| `asphalt` | `car-park`, `driveway`, `lane` | open, hot | `asphalt` | planar, fall 1:80 toward gullies | aggregate texture only (normal map) | parked cars, kerbs, lamp post | `hard` |
| `sand` | `sand-pit`, `gravel` (pea gravel, T2) | loose: travel ×1.3, slopes above 34° slide | `sand` | sunken fill, surface 70-100 below edging top | 2 mm ripples, dynamic child craters | edging boards, toys | `grit` |
| `rubber` | `poured`, `tile` (500 × 500) | hot slab | `rubber` | planar, flush with lawn ±10 | seams 2-5 mm (tile) | equipment | `muffled` |
| `interior` | `kitchen`, `sealed` | tiled slab floor | `tile` (or `plastic` vinyl p 0.3) | floor +150 above datum | grout groove 0.5 deep (visual) | everything (no sky); window sun patch | `hard` |

### 2.2 Levels (datum y = 0 = garden ground)

| Element | Top level (mm) |
|---|---|
| Lawn, beds, forest mean | 0 (beds +30 soil heave; raised beds +150-300) |
| Patio slab top | +10; joint fill surface 3-5 below slab top |
| Sidewalk top | 0; kerb top 0 |
| Car park / lane surface | -125 (kerb upstand 100-150, drawn per kerb line) |
| Sand-pit edging top / sand surface | +100 / +10 |
| Rubber surface | 0 ± 10 |
| Interior floor top | +150; back-door sill top +150; external step +75 |

### 2.3 Strata (subsurface materials) [T1]

Material at depth `z` below the local terrain surface is looked up from the zone's column, with layer boundaries jittered ±20 % by 2D noise (wavelength 1 m). Below the deepest layer the material is `clay`, and `stone` (bedrock, non-diggable) begins at `DIG_FLOOR_BU[species]`.

| Zone | Layers from the surface (thickness mm) |
|---|---|
| `forest` | `humus` 20-60, `loam` to 600, `clay` |
| `lawn` | `loam` 250 (thatch is surface only), `clay` |
| `garden-bed` | `loam` 400 (loose), `clay` |
| `pavement` | slab (primitive), bedding `sand` 30-50 below slab underside, sub-base `gravel` 150, `clay` |
| `asphalt` | `asphalt` 60 (terrain layer, non-diggable), `gravel` 200, `clay` |
| `sand` | `sand` 229-305 (playground loose fill, ecology 1.3), `loam` |
| `rubber` | `rubber` 40-100, `gravel` 150, `loam` |
| `interior` | building slab (primitive, 250 thick, -100..+150), `sand` blinding 50, `clay` fill |

Region override: `mediterranean` forest/lawn/bed top 300 mm = `loam` flagged `dry` (moisture offset applies), then `gravel`; `southern-us` top 300 mm = `sand` (well-drained), then `loam`.

| Constant | Lasius | Camponotus | Messor | Atta | Note |
|---|---|---|---|---|---|
| `DIG_FLOOR_BU` (bedrock depth) | 200 | 150 | 300 | 500 | Lasius max shaft 175 BU; Messor 285 BU; Atta depth cap 400-500 BU (dossiers 5, 12) |

### 2.4 Static per-cell data supplied to chapter 06 [T1 data, T2 consumers]

On the 16 BU nav grid: `texture` (`sand`/`loam`/`clay`/`humus`, top layer), `permeable` (asphalt 0, concrete and tile 0, sand-jointed paving 0.05, rubber 0.05, soils 1), `veg` (lawn, garden-bed, forest), `litter` (0..1), `shadeMean` (mean of the shade samples 08:00-18:00), `puddleCapMm` (13.3), `catchArea` (13.4), `exposed` (no overhead cover at ground level), initial `theta0/theta1` (`ZONE_THETA0` below; `theta1 = theta0 + 0.1`), `interior` flag.

| Zone | `ZONE_THETA0` start | Modifiers (added, then clamp 0.02-0.95) |
|---|---|---|
| `forest` 0.55, `lawn` 0.40, `garden-bed` 0.45, `pavement` joints 0.35, `asphalt` 0.20, `sand` 0.15, `rubber` 0.25, `interior` sub-floor 0.30 | | hollow `+0.20 × hollow(p)` (13.4), `+0.10 × shadeMean`, within 500 mm of a water butt/outside tap `+0.30`, within 300 mm of a gully `+0.20`, region offset (1.2) |

---

## 3. Surface properties per material [T1 grip, dig, sound; T2 heat, wetness]

Surface temperature coefficients (sun gain `G`, night loss, lag `tau`) are owned by chapter 06 section 2.3 and are not repeated here; this table maps world surfaces onto those materials and supplies the other properties. `grip` scales the walker's adhesion: maximum sustained surface tilt is 180° (ceilings) at grip ≥ 0.8, 120° at 0.5-0.8, 45° below 0.5 (`slippery`). Wet surfaces multiply grip by `WET_GRIP_MULT = 0.6`, greasy (hob, oil) by `GREASE_GRIP_MULT = 0.4`; rime and dew multipliers are chapter 06's. `DIG_REL` is a proposal for the nest chapter (1.0 = loam).

| Material (J) | grip dry | Wetness behaviour | `DIG_REL` | Footstep sound class (new ids) | Notes |
|---|---|---|---|---|---|
| `loam` | 0.90 | absorbs; mud at theta0 > 0.9 (grip 0.6) | 1.0 | `soft-soil` | |
| `humus` | 0.85 | absorbs, slow drying | 1.2 | `soft-soil` | |
| `sand` | 0.60 | absorbs fast; damp sand (theta0 ≥ 0.25) holds tunnels | 1.6 (collapse rules: nest chapter) | `grit` | loose slopes > 34° slide |
| `clay` | 0.85 (wet 0.45) | slow absorb, puddles on top | 0.4 | `soft-soil` | |
| `gravel` | 0.80 | drains | 0.25 | `grit` | |
| `concrete` | 0.95 | film, runs to basins | 0 | `hard` | |
| `asphalt` | 0.95 | film, runs to basins | 0 | `hard` | |
| `stone` | 0.90 | film | 0 | `hard` | |
| `brick` | 0.95 | film, absorbs slightly | 0 | `hard` | |
| `tile` | 0.75 | film; wet tile 0.45 = slippery | 0 | `hard` | |
| `wood-sound` | 0.90 | absorbs slowly | 0.4 (wood-nesting species only) | `wood` | |
| `wood-decayed` | 0.90 | stays damp | 1.0 (wood-nesting); 0.6 others | `wood` | |
| `bark` | 1.00 | absorbs | 0 | `wood` | |
| `plant` | 0.85 (waxy variant 0.45 = slippery) | beads; dew | 0 | `plant` | |
| `leaf` | 0.80 | beads | 0 | `litter` | |
| `metal` | 0.75 | film; greasy hob 0.3 | 0 | `metal` | Deviation V1 |
| `plastic` | 0.75 | film | 0 | `plastic` | |
| `rubber` | 0.95 | film | 0 | `muffled` | |
| `glass` | 0.70 | film | 0 | `hard` | |
| `fabric` | 1.00 | absorbs | 0 | `muffled` | |
| `ceramic` | 0.70 | film | 0 | `hard` | glazed bowls |
| `paper` | 0.90 | absorbs, softens | 0 | `litter` | |
| `food` | 0.70 (sticky: speed ×0.7) | — | 0 | `food` | |
| `water` | n/a | see section 13 | 0 | `wet` | |
| `plaster` (new) | 0.90 | absorbs | 0 | `hard` | interior walls, ceiling |

Surface decals (no new material): painted line = parent material, grip ×0.9, `G` −6 °C; oil stain [T3] = parent material, greasy multiplier, ants crossing get `oiled` (speed ×0.7 for 0.05 GD). Any surface with chapter-06 `surfaceWet > 0.5` uses sound class `wet`.

---

## 4. Generation pipeline [T1]

### 4.1 Inputs, outputs, budgets

`WorldParams = { generatorVersion, seedText, seed: u32 (FNV-1a of seedText), speciesId, archetype, region, sizeClass, startSeason, startDoy, difficulty, rules: { rivals: 0..4, humanActivity: off|low|normal|high, predators, ... } }`. Output: `WorldStatic` (regenerable, not saved) + `InitialEntities` (food nodes, territories, rival colony seeds, queen start pose; written into `SimState` once) + `WorldMeta { fingerprint, attempts, repairs[], timingsMs }`.

| Budget (standard; compact ×0.75, large ×1.25) | Value |
|---|---|
| `PRIM_BUDGET_TOTAL` (static primitives) | 16 000 |
| `PRIM_BUDGET_PROPS` (scattered props) | 7 000 |
| `PLANT_MAX` (plant instances, ≤ 24 primitives each) | 600 |
| `TREE_MAX` | 12 |
| `PRECARVE_CHUNK_MAX` (pre-existing cavity chunks incl. rival nests) | 800 |
| `CLIMB_ROUTE_MAX` | 1 500 |
| `WORLDGEN_TIME_MS` (browser, target laptop) / Node | 5 000 / 3 000 |

Thinning: for each budget category, expected count `E = Σ density × zone area`; if `E > budget`, all densities in that category are multiplied by `budget / E`. `PROP_MIN_SOLID_BU = 0.75`: a prop whose largest dimension is below this becomes decor (section 9); flat props thinner than 0.15 BU become decals.

### 4.2 Steps

| # | Step | RNG stream label | Progress weight |
|---|---|---|---|
| 1 | Zone layout | `wg/zones` | 0.05 |
| 2 | Heightfield | `wg/height` | 0.15 |
| 3 | Large structures (+ micro-connection sockets, human lanes) | `wg/structures` | 0.15 |
| 4 | Props | `wg/props` | 0.10 |
| 5 | Plants | `wg/plants` | 0.10 |
| 6 | Derived maps (top surface, shade, nav grid, catchment, puddle basins, suitability) | `wg/derived` | 0.20 |
| 7 | Resources and creature territories | `wg/resources` | 0.05 |
| 8 | Rival colony sites | `wg/rivals` | 0.03 |
| 9 | Pre-existing cavities (carve grid) | `wg/cavities` | 0.07 |
| 10 | Start pose | `wg/start` | 0.02 |
| 11 | Validation (and repair) | — | 0.08 |

Step 6 sits between plants and resources (the directions' order is kept for content; derived maps are needed by resource placement). After step 8 the nav grid is re-derived for cells touched by cavities.

**Step 1 — zone layout.** (a) Roll zones (1.3). (b) Place built zones as analytic rects/polylines (1.4) in order interior, asphalt, sidewalk, patio, sand, rubber, path; each placement samples 16 candidates and keeps the best score (adjacency satisfied +1 per rule: patio touches door, sand touches rubber, sidewalk between asphalt and other zones, path reaches its nodes; overlap = reject). (c) Rasterise built zones onto the 16 BU zone raster. (d) Natural zones: 1-2 seed cells each (≥ 0.25 L apart), multi-source Dijkstra over free cells with step cost `1 + 0.8 × fbm(cell, λ = 2 m)`; a zone stops claiming at its target cell count; ties broken by zone index then cell index; unclaimed cells take the nearest claimed neighbour. (e) Islands smaller than `ZONE_MIN_ISLAND_M2 = 0.5` are merged into the majority neighbour. (f) Boundaries: marching squares per zone pair, Douglas–Peucker (tolerance 1 cell); built boundaries stay axis-aligned. (g) Edge treatments per pair:

| Zone pair | Treatment (structures in step 3) |
|---|---|
| `asphalt` – `pavement`/`lawn` | kerb line |
| `pavement` – `lawn` | flush, or path edging kerb (p 0.5 for `path`) |
| `lawn` – `garden-bed` | none, metal/plastic lawn edge (p 0.4), or raised-bed boards (raised beds) |
| `forest` – `lawn` | litter fringe 1 m (litter cover fades linearly) |
| `sand` – any | timber edging |
| `rubber` – `lawn` | rubber lip, soil gap (`mat-seam`) |
| `interior` – any | house wall with back door (kitchen slice) or plain façade |
| map edge | per archetype: fence (suburban, kitchen-door), dry-stone wall (woodland-edge, field-margin), hedge impostor (playground), road continuation (car park) |

**Step 2 — heightfield.** `H(x,z) = tilt + macro(zone) + micro(zone) + features`, sampled at 4 BU. `tilt`: map-wide plane, 0-1 % toward a random direction. `macro`, `micro`: fBm with the zone's amplitude and wavelength (2.1), wavelength never below 3 heightfield cells. Built zones replace H by their analytic plane (2.2, falls in 2.1); natural cells within 300 mm of a built zone blend to the built level with smoothstep; kerb lines produce a one-cell step covered by the kerb primitive. Features: forest hollows (2-4 per forest zone, Ø 600-1500, depth 40-80, collect water), raised beds, sand-pit sink, worm casts (heightfield bumps Ø 20-40 × 10-20, 0.5/m² lawn), antlion pit cones (step 7). Dynamic deformation (footprints, child craters) is stored as deltas (section 16).

**Step 3 — large structures.** Per-zone templates in section 5, instantiated with transforms; each template declares micro-connection sockets (section 6), climb routes (section 10), POIs and human nodes. Then **human lanes**: a 250 mm human grid blocks cells under any structure taller than 150 mm (walls, beds, furniture, cars, trunks), flower beds cost ×5, lawn ×1.5, paving ×1; lanes are A* paths between human nodes (door, gate points on map edges, car bays, bench, bin, table seats, counter, sink, fridge, cooker, pet bowl, shed door, water butt, play spots), smoothed, stored as polylines with weights.

**Step 4 — props.** Per category: Bridson Poisson-disk with the category's minimum spacing inside eligible zone cells, accepted with probability `density / poissonDensity`. Resting: sample the top-surface height at 5 footprint points, set y so the lowest point touches (stones additionally embed `0.15-0.5 × thickness`), tilt to the fitted plane (≤ 20°), random yaw. Reject if it intersects a structure primitive deeper than 1 mm, except categories flagged `rest-on` (leaves, twigs on logs/slabs).

**Step 5 — plants.** Plant templates (5.x) are grown procedurally: stem chains of 20-80 mm CA segments with tropism noise, leaves as thin EL (thickness `max(0.8 mm, 0.15 BU)`), flowers EL. Each plant registers aphid sites, nectar POIs and a climb route along its main stem. Placement by Poisson per zone; host-plant flags rolled per instance (section 8).

**Step 6 — derived maps.** Top-surface map (max of terrain and primitive tops, 4 BU); shade samples (section 12.3); nav grid (section 11); flow accumulation and puddle basins (13.4); exposure; suitability and access maps (section 12).

**Steps 7-10**: sections 8, 7, 12.5.

### 4.3 Validation and regeneration

| Check id (new) | Rule (played species, standard size; compact/large scale counts ×0.75/×1.25, rounded) | Fail action |
|---|---|---|
| `v-found` | ≥ `FOUND_GOOD_MIN = 6` nav cells with static suitability `Q ≥ 0.6`, in ≥ 2 clusters ≥ 300 BU apart; ≥ 2 of them within `START_RADIUS_BU = 250` of the start pose (path distance) | regenerate |
| `v-connect` | ≥ 95 % of walkable nav cells reachable from the start for a standard worker (climb edges and micro-portals allowed); every zone has ≥ 1 reachable cell; the queen (clearance 0.9 BU) reaches ≥ 2 good sites | regenerate |
| `v-food` | ≥ 3 food anchors within 600 BU path distance of the start; ≥ 1 carbohydrate renewable and ≥ 1 protein anchor within 900 BU | regenerate |
| `v-micro` | ≥ `MICRO_USEFUL_MIN` useful micro-connections (6.3) | promote sockets, then regenerate |
| `v-rivals` | requested rival count placed with spacing (12.5) | reduce count by 1, re-place; never below 1 if requested ≥ 1 |
| `v-rest` | no prop floats > 1 mm, no unintended overlaps > 1 mm | drop offending prop |
| `v-budget` | all budgets of 4.1 respected | thin and re-run step |
| `v-start` | start pose has flood risk ≤ 0.3, not on asphalt, not interior, ≥ 800 BU from every rival nest | re-pick start, then regenerate |
| `v-lanes` | each enabled human event kind has ≥ 1 lane/region in an eligible zone | disable that event kind for this map (meta note) |
| `v-enclose` | every terrain hole (13.2) is fully enclosed by primitives below the surface | regenerate |

Regeneration: attempt `a = 0 .. WORLDGEN_MAX_ATTEMPTS - 1` (`= 8`) uses `seed_a = hash32(seed, a)` for all streams (the displayed seed stays the player's). After 8 failures the generator **repairs** the best-scoring attempt (score = number of passed checks, ties to lower `a`) and never fails: R1 open the most useful closed sockets; R2 place flat stones (Lasius, Messor, Atta) or a decayed log (Camponotus) and set top strata to loam at the 6 highest-scoring diggable cells near the start; R3 add baseline food anchors within 400 BU of the start; R4 carve a 1.5 BU channel under the blocking barrier on the shortest disconnected path; R5 move rivals to the farthest valid cells. Repairs are listed in `WorldMeta.repairs` and in the debug API.

### 4.4 Determinism requirements [T1]

| Id | Requirement |
|---|---|
| DET-1 | Generation is a pure function of `WorldParams`; same params on any machine, Node or browser, give the same `WorldMeta.fingerprint`. |
| DET-2 | All randomness from the core seeded RNG; one sub-stream per step label (`core.rng.derive(seed_a, label)`), and per-object sub-streams `derive(stepStream, objectIndex)` so changing one category never shifts another. |
| DET-3 | No `Math.random`, `Date`, `performance.now`; no dependence on object-key or `Map`/`Set` iteration order; all sorts stable with explicit tie-breaks (zone index, then x, then z). |
| DET-4 | `Math.sin/cos/exp/log/pow/atan2` are not used for values that are stored or that decide placements; worldgen uses core deterministic polynomial versions (`core/math/dmath`). `Math.sqrt`, `floor`, `round`, basic arithmetic are allowed (IEEE exact). Noise is integer-hash value/gradient noise with polynomial fade. |
| DET-5 | Stored positions and sizes are quantised to 1/256 mm, angles to 1e-6 rad, heights to 1/256 mm. |
| DET-6 | Fingerprint = FNV-1a 32 over: generator version, params, quantised primitive list (sorted by id), heightfield as Int32 of `round(H × 256)`, zone raster, micro-connection list, hashes of pre-carved chunks. |
| DET-7 | Output is independent of quality presets, render state, window size and whether generation runs in a worker or the main thread. |
| DET-8 | Decor (section 9) is seeded from `hash(seed, layer, tileX, tileZ)` and never enters `SimState`. |

---

## 5. Object catalogue [T1 unless tagged]

Each object id (new) is a template. "Climb" names its authored routes (section 10).

### 5.1 Forest floor (`forest`)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Gameplay role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `standing-tree` | trunk Ø 300-800, modelled to 2400; roots Ø 60-200 × 400-1200; low branches Ø 40-120 × 600-1500 at 900-2200 | 3 stacked CY (taper 10 %) + 4-6 root-flare CA (centre 30-60 % of radius below ground) + 2-3 branch chains; canopy disc r 2-4 m (visual + shade) | `bark` (skin), `wood-sound` | Y | heart-rot cavity p 0.15 (wood nesters) | Y (roots) | N | shade, aphid sites on branches, bark highway, root channels; climb `trunk-to-branch` | Poisson spacing 2500, ≥ 600 from zone edge, slope < 20° | 1 per 30 m², min 1, max 6 per zone (≤ `TREE_MAX`) |
| `log` | Ø 150-400 × 1000-2500 | CY lying, embedded 10-20 % of Ø; 0-3 bark slabs RB(200×5-20×100; 3) with 1-3 BU gap beneath | `wood-decayed` (p 0.6), else `wood-sound`; moisture 13.6 | Y | Y if decayed | Y | N | Camponotus nest, woodlouse and centipede shelter, fungus; climb `log-over` | axis within 30° of contour, ≥ 1500 apart | 1 per 25 m², min 1 |
| `stump` | Ø 300-800 × 150-500 | CY + 4-5 root-flare CA | `wood-decayed` (p 0.7) | Y | Y | Y | N | nest, vantage; climb `stump-top` | ≥ 2000 from trees | 1 per 40 m² |
| `fallen-branch` | Ø 20-60 × 500-1500 | chain of 2-4 CA (bends 10-25°) + 0-2 side twigs | `wood-sound` / `wood-decayed` (p 0.5) | Y | if decayed | partial | N | bridge over litter | rest-on | 0.15/m² |
| `twig` | Ø 2-20 × 50-300 | CA or 2-segment chain | `wood-sound` | Y | N | N | N | bridge, obstacle | rest-on | 4/m² |
| `flat-stone` | 40-200 long, thickness 0.25-0.4 × length | flattened EL (60 %) or RB(r = 0.3 × thickness) | `stone` | Y | N | Y | N | Lasius founding cover, warm site | embed 30-50 % of thickness; 50 % of instances in gaps with canopy shade < 0.6 | 1.2/m², 70 % < 80 mm |
| `pebble` | 10-30 | EL | `stone` | Y | N | N | N | obstacle | | 3/m² |
| `moss-cushion` | 60-200 × 10-40 high | flattened EL dome | `plant` | Y | N | Y | N | moisture, springtails | on logs, stones, tree bases | 0.6/m² |
| `curled-leaf` | 60-120 × 40-70, thickness `max(1, 0.15 BU)` | 2 overlapping thin EL (curl) | `leaf` | Y | N | Y | N | cover, bridge | rest-on | 2/m² (rest of litter is decor) |
| `fungus-cap` [T2] | cap Ø 30-150, stem Ø 8-20 × 30-100 | CY + EL | `plant` | Y | N | Y | N | autumn food (ecology) | within 1 m of logs/stumps, `doy` 15-21 | 0.1/m² |
| `nut` [T2] | 20 × 12 (acorn) / Ø 15 | EL | `plant` | Y | N | N | N | obstacle, shelter | under canopy, autumn | 0.5/m² of canopy |
| `herb-plant` | stem Ø 1-5 × 50-400; 2-6 leaves 20-60 | plant template (5.3) | `plant` | Y | N | Y | waxy p 0.2 | aphid host p 0.15, EFN p 0.05, elaiosome seeds (spring) | canopy shade < 0.7 | 1/m² |
| `needle-mat` [T3] | 20-60 deep | surface layer of `pine-hardwood` | `leaf` | — | — | cover 0.5 | grip 0.6 | slippery route | 40 % of pine-hardwood forest | area |
| `antlion-pit` [T2] | Ø 20-75, depth 10-50 | heightfield cone at 34° | `sand` | — | — | — | loose | hazard (creature) | sheltered dry sandy cells only | 1 per m² of sheltered dry sand, max 6 per map |

### 5.2 Lawn (`lawn`)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `sward` | height 25-80 (mown, dynamic) / 100-300 (rough); blades 2-8 wide | surface layer + visual blades (section 9) | `plant` over `loam` | — | ground D | cover 0.4/0.6 | — | habitat, cover | whole zone | area |
| `dandelion` | rosette Ø 150-250 (leaves 100-200 × 20-40); scape Ø 3-5 × 100-250; head Ø 30-40 | flat thin EL leaves + scape chain + EL head | `plant` | Y | N | Y (rosette) | N | nectar POI (spring-summer), seeds (Messor) | | 0.4/m² mown, 0.8 rough |
| `clover-patch` | patch Ø 150-400; 15-40 leaflets 10-25 on petioles Ø 1 × 30-80; 2-6 heads Ø 20 on Ø 1.5 × 60-120 | 6-12 solid leaflets + rest decor; head EL | `plant` | Y | N | Y | N | nectar | | 0.3/m² |
| `daisy` | flower Ø 15-25 on Ø 1.5 × 40-80 | chain + EL | `plant` | Y | N | N | N | nectar | mown only | 0.5/m² |
| `seed-grass` [T2] | culm Ø 1.5-3 × 150-300, panicle 30-80 | chain + EL | `plant` | Y | N | N | N | seed source (Messor) | `rough` only | 2/m² |
| `stepping-stone` | Ø 300-450 or 450 × 450, 40 thick | CY / RB(r 10) | `stone` / `concrete` | Y | N | Y | N | under-slab nest (Lasius favourite) | top +5 over ground, line of 3-8 along a human lane, 600-700 apart | 0-1 line per lawn (p 0.6 suburban, kitchen-door) |
| `lost-ball` | Ø 65-220 | EL | `plastic` / `rubber` | Y | N | Y (contact rim) | N | shelter | | p 0.3 per lawn |
| `garden-hose` | Ø 15-20, coil Ø 500-1000 | chain of 12-30 CA | `rubber` | Y | N | Y | N | bridge, shelter, watering source | within 2 m of a bed or the house | p 0.6 if watering enabled |
| `sprinkler-head` [T2] | 150 × 40 × 80 | RB + CY | `plastic` | Y | N | N | N | watering origin | lawn centroid ± 20 % | p 0.5 |
| `lawn-edge` | 3 thick × 100 deep, top flush | RB | `metal` / `plastic` | Y | N | N | N | flush boundary | lawn↔bed boundaries | p 0.4 |
| `stone` | as `flat-stone`, 40-120 | | `stone` | Y | N | Y | N | founding cover | | 0.1/m² |

### 5.3 Garden beds (`garden-bed`)

Plant template parameters are the source for every stem-and-leaf object.

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `mulch-chip` | 20-50 × 10-30 × 3-10 | RB(r 1-2) | `bark` | Y | N | Y | N | cover, springtails | mulched beds | 12/m² solid (rest decor) |
| `perennial-plant` | 1-4 stems Ø 3-8 × 200-600; leaves 30-120 × 15-60; flowers Ø 20-60 | plant template | `plant` | Y | N | Y | waxy p 0.2 | aphid host p 0.4, nectar | `flower` | 2/m² |
| `shrub` (rose etc.) | woody stems Ø 8-25 × 400-1200, 2 branching levels | plant template, woody | `wood-sound` + `plant` | Y | N | Y | N | aphid host p 0.6, shade 0.5 | `flower`, `shrub` | 0.3/m² |
| `bean-row` [T2] | stems Ø 4-8 × 400-1500 on canes Ø 10-15 | chains + CY canes | `plant`, `wood-sound` | Y | N | Y | N | aphid host p 0.7, EFN | `vegetable`, rows 300 apart | per row |
| `raised-bed-board` | 25 × 150-300 × 1200-2400 | RB(r 3) | `wood-sound`; lower 50 mm `wood-decayed` p 0.4 | Y | decayed part | Y (board-soil seam) | N | nest along board, Camponotus site | raised beds' perimeter | per bed |
| `plant-pot` | Ø 100-400 × 100-400, wall 8-12 | ring(10-16) + base CY + soil-fill CY 20 below rim; foot gap 3-8 under base | `ceramic` / `plastic`; fill `loam` | Y | fill | Y (under base) | N | nest in pot soil, water in saucer | patio edges, bed edges | 0-6 per map with pavement |
| `saucer` | Ø 120-450 × 20-30 | ring(12) + base | `plastic` / `ceramic` | Y | N | N | N | water (13.1) | under 50 % of pots | |
| `garden-wall` (dry stone) | 200-600 high × 300-450 thick; stones 100-300 | stacked RB/EL stones, gaps 5-30 | `stone` | Y | N | Y | N | crevice nests, `wall-crevice` | bed edges, map edge | per boundary |
| `fence` | post 75-100 sq × 1800; panel 1830 × 1800 × 20; gravel board 150 × 22 | RB | `wood-sound` (post foot `wood-decayed` p 0.3); gravel board `concrete` p 0.5 | Y | decayed part | Y | N | barrier, top-rail route, `fence-gap` | map edges / garden boundary | posts every 1830 |
| `shed` | 1800 × 2000 × 1200; floor 18 on bearers 50 high, base gap 30-150 | RB walls, floor, bearers | `wood-sound`; bearers `wood-decayed` p 0.5 | Y | decayed | Y (under floor) | N | warm dry nest, Camponotus satellite | suburban (1), kitchen-door (p 0.5) | |
| `compost-bin` [T2] | 1000 × 900 × 1000; slats 100 wide, gaps 10-20 | slat RB + heap as terrain mound (`humus`, +10..+20 °C core) | `wood-sound`, `humus` | Y | heap | Y | N | warm nest, prey, Myrmica rival site | | p 0.7 suburban, 0.4 kitchen-door |
| `water-butt` | Ø 600 × 900 on stand 300; tap | CY + CY + RB stand | `plastic` | Y | N | Y (under stand) | N | water, wet ground | by a downpipe | p 0.6 with façade |
| `bird-table` [T2] | post 50 sq × 1500, top 300 × 300 | RB | `wood-sound` | Y | N | N | N | seed spill below (seed anchor) | lawn or bed | p 0.4 |
| `fruit-tree` | trunk Ø 80-200 × 1500, 3-5 branches Ø 30-80 | CY + chains; canopy r 1.5-2.5 m | `bark` | Y | N | Y | N | aphids, windfalls, shade | | 0-2 (suburban, kitchen-door) |
| `windfall-fruit` [T2] | Ø 50-80 | EL | `food` (`fruit`) | Y | N | Y | N | food | under fruit trees, `doy` 15-21 | 2-4 per tree |

Plant template (`PlantTemplate`, new type): `{ stems: n, stemDiamMm, stemLenMm, segmentMm 20-80, branchLevels 0-2, branchAngleDeg 25-55, leavesPerStem, leafMm [w,l], leafThicknessMm, flowerMm, woody, waxyP, hostFlags }`.

### 5.4 Pavement and patio (`pavement`)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `paving-slab` | 450×50×450, 600×50×450, 600×40×600 | RB(r 2) | `concrete` / `stone` (p 0.3) | Y | N | Y (underside) | N | surface; ceiling of under-slab nests | grid; pattern stack, stretcher or random-coursed; joints sand 3-8 (p 0.7) or mortar 5-10 | tiles zone |
| `cracked-slab` | crack 2-5 | slab split into 2 RB | as slab | Y | N | Y | N | `paving-joint` branch | | 6 % of slabs |
| `block-paver` | 200×60×100 | RB(r 3), herringbone | `concrete` | Y | N | Y | N | path/driveway surface, grit joints 3-5 | `path` p 0.4 | tiles zone |
| `edging-kerb` | 50×150×915 | RB | `concrete` | Y | N | Y (under) | N | path edge | path edges | per edge |
| `back-step` | 1000×75×300 | RB | `concrete` / `stone` | Y | N | N | N | door step | kitchen-door | 1 |
| `patio-table` | top Ø 800-1000 or 1200×800 at 720; legs CY Ø 25-40 or pedestal | RB/CY + CY | `metal` / `plastic` / `wood-sound` | Y | N | Y | N | food-drop spot; climb `leg-to-top` | patio | p 0.6 |
| `patio-chair` | seat 450×450 at 450, legs Ø 20-25, back to 850 | RB + CY | `metal` / `plastic` | Y | N | Y | N | | around table | 2-4 |
| `planter` | 400-800 sq × 400 | ring of RB + fill | `concrete` / `wood-sound`; `loam` | Y | fill | Y | N | nest, plant host | patio corners | 0-3 |
| `doormat-outside` | 750×20×450 | RB (edge curl 1-2 BU gap) | `fabric` | Y | N | Y | N | shelter at door | outside back door | 1 |
| `linear-drain` | 1000 × 100, slots 8-12; channel 100 deep | slotted RB grate + terrain hole + channel walls | `metal` | Y | N | Y | N | `drain-grille`, water | patio edge at house wall | p 0.5 |
| `joint-weed` [T2] | stems Ø 1 × 30-120 | chain | `plant` | Y | N | N | N | seed source | sand joints | 0.5/m² |
| `cigarette-butt` | Ø 8 × 30-55 | CA | `paper` | Y | N | N | N | litter | `sidewalk`, `path` | 0.1/m² |

### 5.5 Parking and asphalt (`asphalt`)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `painted-line` | 100 wide | decal | parent | — | — | — | — | bay markers | bay outlines | per bay |
| `kerb` | 125 wide × 100-150 upstand (+ 150 embedded) × 915 per unit; joints 3-6 | RB(r 10) per unit | `concrete` | Y | N | Y (kerb voids) | N | cliff barrier, `kerb-gap` | along asphalt boundaries | per edge |
| `wheel-stop` | 100 high × 150 × 1650; 0-10 underside gap | RB | `rubber` / `concrete` | Y | N | Y | N | shelter, nest base | bay head | p 0.5 per bay |
| `bollard` | Ø 150 × 900 | CY + cap EL | `metal` / `concrete` | Y | N | N | N | vantage; climb `post-to-top` | sidewalk edge, 1500 apart | 0-6 |
| `lamp-post` | base Ø 200 × 300, shaft Ø 150 to 2400 | CY ×2 | `metal` | Y | N | N | N | vantage | | 1 per car park |
| `gully-grate` | frame 450×450, bars 25 wide, gaps 10-30; pot Ø 300, water 200 below grate | RB bars + frame + terrain hole + ring(12) pot wall + base | `metal`, `concrete` | Y | N | Y (rim) | N | `drain-grille`, water sink, drowning hazard | asphalt low points next to the kerb | 1 per 50 m², min 1 |
| `manhole-cover` | Ø 600 × 10; rim gap 5-10 | CY | `metal` | Y | N | N | N | very hot surface | | p 0.4 |
| `tree-pit` | 1000 × 1000 soil square, optional grate (bars gaps 20) | terrain `loam` + `fruit-tree`-like tree Ø 100-200 | `loam` | — | Y | Y | N | green refuge, aphids | in sidewalk, ≥ 3 m apart | 0-2 |
| `parked-car` [T1 static, T2 dynamic] | underbody slab 1800 × 300 × 4300 at clearance 150-200; 4 tyres CY Ø 630 × 195 (lying); body above clearance + 300 is visual | RB + 4 CY | `metal`, `rubber` | Y (tyres) | N | Y (under body) | N | deep shade, heat after arrival, oil drips | in bays | 30-70 % of bays at start (time-of-day table 15.4) |
| `drink-can` | Ø 66 × 115 | CY lying or standing | `metal` | Y | N | Y | N | sugar residue anchor | | 0.03/m² |
| `bottle-cap` | Ø 30 × 6 | CY | `metal` | Y | N | Y | N | | | 0.05/m² |
| `verge-weed` [T2] | as `joint-weed` | | `plant` | Y | N | N | N | seeds | kerb lines | 1 per m of kerb |

### 5.6 Playground (`sand`, `rubber`, with park lawn and paths)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `sand-edging` | 100 wide × 200 high × 2400 (top 100 above surround) | RB(r 5), mitred corners | `wood-sound`; lower half `wood-decayed` p 0.3 | Y | decayed | Y (board-sand seam) | N | nest along board, barrier | sand perimeter | |
| `play-sand` | 229-305 deep | strata | `sand` | — | Y | — | loose | digging, antlions, child play | sand zone | |
| `toy-bucket` [T2 dynamic] | Ø 150-200 × 150, open | ring(14) + base | `plastic` | Y | N | Y | N | shelter; moved by children | in sand | 0-2 |
| `toy-spade` [T2 dynamic] | blade 150 × 2 × 120 + handle CA Ø 20 × 250 | RB + CA | `plastic` | Y | N | Y | N | | in sand | 0-2 |
| `rubber-mat` | 40-100 thick; tile variant 500 × 500 | terrain layer | `rubber` | — | N | — | — | hot slab | rubber zone | |
| `play-post` | Ø 60-100 × up to 2400; footing below surface; sleeve gap 2-5 | CY | `metal` (painted) | Y | N | N | wet | route, vantage, `sleeve-gap` | equipment | |
| `slide` | 2 posts Ø 76 × 1500; 4 rungs CA Ø 30; platform RB 600 × 40 × 600 at 1200; chute 450 wide, sides 100 high, 2400 long at 32° | CY + CA + RB | `metal` (chute stainless), posts painted | Y | N | Y (under platform) | wet chute | vantage POI, hot; climb `ladder-to-platform`, `chute` | rubber zone | 1 |
| `swing-frame` | 2 A-frames of CY Ø 76 inclined 15°; seats RB 450 × 30 × 170 hanging at 400 (static) | CY + RB | `metal`, `rubber` | Y | N | N | N | jumping-spider ambush | rubber zone | p 0.7 |
| `spring-rider` | base plate RB 400 × 10 × 400 (gap 2-4 under); spring CY Ø 150 × 300; body EL 700 × 400 × 250 at 500 | | `metal`, `plastic` | Y | N | Y | N | | rubber zone | p 0.5 |
| `bench` | 1800 long; 3 seat slats RB 1800 × 30 × 90 at 450, gaps 10-15; 2 legs RB 60 × 450 × 450 | RB | `wood-sound`, `metal` | Y | N | Y | N | food-drop spot; climb `leg-to-seat` | path sides | 1-3 |
| `litter-bin` | Ø 400 × 800; lid slot 150 × 100; base ring gap 5 | CY + RB | `metal` / `plastic` | Y | N | Y (base) | N | mega food POI (rim, spills); climb `bin-to-rim` | next to benches | 1-2 |
| `picnic-table` [T2] | top 1800 × 750 at 720 (slats, gaps 10); 2 bench boards; A-frame legs | RB | `wood-sound` | Y | N | Y | N | food-drop | park lawn | p 0.5 |
| `park-tree` | as `standing-tree` | | | | | | | aphids, shade | park lawn | 1-3 |

### 5.7 Building exterior and interior slice (`interior`)

| Object id | Dimensions (mm) | Built from | Material | C | D | S | Sl | Role | Placement | Density |
|---|---|---|---|---|---|---|---|---|---|---|
| `house-wall` | outer leaf 102.5, cavity 50-75, inner leaf 100, to 2400, top closure | 2 RB leaves + cap RB | `brick` / `concrete` | Y | N | Y (cavity) | N | barrier; hidden cavity corridor | house edge | |
| `weep-vent` | 10 × 65 slot, plastic grille slots 3-5; bottom course +150 | gap in outer leaf + grille bars | `plastic` | Y | N | Y | N | `weep-vent` connection to the cavity | every 900 along the façade | |
| `air-brick` | 215 × 65 with 8-12 openings 5-10 | RB frame + bars | `brick` | Y | N | Y | N | connection to the cavity | façade | 1-2 |
| `back-door` | leaf 900 × 2000 × 45; jambs 70 × 2100; sill 1000 × 150 × 120 (top +150); gap under leaf 3-10 (6.2 clamp) | RB | leaf `wood-sound`; jamb foot 150 mm `wood-decayed` p 0.4; sill `stone` / `metal` | Y | decayed foot | Y | N | `door-crack`; Camponotus satellite site | kitchen slice wall | 1 |
| `window` | outside sill 1200 × 50 × 150 at 900; frame; pane 3 thick | RB | `wood-sound` (sill `wood-decayed` p 0.3) / `glass` | Y | decayed sill | N | N | sun patch inside; `window-sill-gap` [T3] | over the sink | p 0.7 |
| `downpipe` | Ø 68 × 2400, shoe 150 above a gully | CY | `plastic` | Y | N | N | N | storm water to gully | façade end | 1 |
| `floor-slab` | 250 thick (-100..+150), interior footprint | RB | `concrete`, top finish `tile` 300 × 300 (grout 3, visual) or vinyl `plastic` | Y | N | N | wet | floor | interior | 1 |
| `interior-wall` | 100 thick, to ceiling | RB | `plaster` | Y | N | N | N | room boundary (back wall = map edge) | | |
| `ceiling` | 30 thick at 2400 | RB | `plaster` | Y | N | N | N | top bound | | 1 |
| `skirting` | 15 × 120; floor gap 0-5 (30 % of runs passable); void behind 2-15 | RB | `wood-sound` | Y | N | Y | N | `skirting-gap` highway | all walls | |
| `base-cabinet-run` | units 600 wide; carcass 560 deep × 720 on a 150 plinth zone; doors 18 thick with 3 gaps; kickboard 16 × 145 set back 60, floor gap 2-6; legs CY Ø 35 × 150 (4 per unit) | RB + CY | `wood-sound` (painted), legs `plastic` | Y | N | Y (kick-space) | N | `kick-space` void (dark, warm near appliances); climb `cabinet-to-counter` | along the back wall; L-run on a side wall p 0.6; run 1800-3600 | 1 |
| `countertop` | 600-620 deep × 38 at 910; overhang 20; wall junction gap 1-5 | RB segments around the sink opening | `plastic` (laminate p 0.6) / `stone` | Y | N | N | wet | food POIs (crumbs, sugar, fruit bowl) | on the run | 1 |
| `sink` | basin 400 × 180 deep × 350; drain Ø 40 | 5 RB (bottom + 4 walls) + water film | `metal` | Y | N | N | wet | water POI | under the window | 1 |
| `fridge` | 600 × 1800 × 650; feet gap 10-20; 30-50 to the wall; rear +6 °C within 100 | RB + 4 CY feet | `metal` | Y | N | Y (under, behind) | N | warm refuge | run end | 1 |
| `cooker` | 600 × 900 × 600; feet gap 10-15; hob greasy | RB | `metal` | Y | N | Y | greasy top | grease anchor | in run | 1 |
| `washing-machine` | 600 × 850 × 600; feet gap 10-15 | RB | `metal` | Y | N | Y | N | pipe penetration behind | in run | p 0.6 |
| `kitchen-table` | top 1200 × 25 × 800 at 750; legs 50 sq × 725 | RB | `wood-sound` | Y | N | Y (under) | N | crumbs on top and below; climb `leg-to-top` | ≥ 700 from counters | 1 |
| `chair` | seat 420 × 20 × 420 at 450; legs Ø 25 × 450; back posts to 900 | RB + CY | `wood-sound` / `metal` | Y | N | Y | N | climb `leg-to-seat` | around table | 2-4 |
| `pedal-bin` | Ø 300 × 500; lid seam 1-2; pedal | CY + RB | `plastic` / `metal` | Y | N | Y (base rim) | N | mega food POI; climb `bin-to-rim` | run end or by the door | 1 |
| `pet-bowl-pair` | 2 bowls Ø 150-200 × 50-70, wall 8, flare 20°; mat 400 × 3 × 300 | ring(12) + base CY each; water plane in one | `ceramic` (glazed) / `metal`; mat `rubber` | Y | N | N | wet inside | `pet-food` and water POIs; climb `bowl-to-rim` | against a wall ≤ 1500 from the door | p 0.8 (kitchen-door) |
| `doormat-inside` | 600 × 15 × 400 | RB | `fabric` | Y | N | Y | N | shelter | inside the door | 1 |
| `houseplant` | pot Ø 150-250 + perennial template | `plant-pot` + plant | `ceramic`, `loam`, `plant` | Y | fill | Y | N | nest soil; scale insects p 0.3 | windowsill or floor | p 0.5 |
| `fruit-bowl` | Ø 250 + 3-6 fruit EL Ø 60-80 | ring(14) + EL | `ceramic`, `food` | Y | N | Y | N | fruit anchor | counter | p 0.7 |
| `bread-board` | 400 × 20 × 250 | RB | `wood-sound` | Y | N | Y | N | crumb anchor | counter | p 0.6 |
| `sugar-bowl` | Ø 100 × 80, lid | ring(10) + base + EL lid | `ceramic` | Y | N | Y | N | sugar anchor, granules around | counter | p 0.5 |
| `wall-socket` [T3] | plate 86 × 86 × 10; box void 70 × 70 × 35; plate gap 1-2 | RB + void | `plastic` | Y | N | Y | N | small-rival nest site | walls at 300 | 2-4 |
| `service-pipe` | Ø 15-40 through wall/floor, annulus 2-15 | CY | `metal` / `plastic` | Y | N | N | N | `pipe-penetration` | under sink, behind washer | 1-2 |

---

## 6. Micro-connections [T1]

### 6.1 Passability

`clearanceBU(caste) = PASS_CLEAR_K × sizeFactor(caste)`, `PASS_CLEAR_K = 0.45` (body height plus margin; Lasius head width 1.08 mm = 0.27 BU). A gap is passable by a caste if its smallest clear dimension ≥ clearance. Generated gaps are clamped so that at least the played species' standard worker passes: `MICRO_GAP_MIN_BU = 0.6` for gaps between primitives, `MICRO_CARVE_MIN_BU = 1.0` for carve channels (2 voxels, the smallest width marching cubes renders reliably). The clamp only picks values inside the real range where possible; if the real maximum is below the minimum, the instance is generated "closed for this species" and does not count as useful (biology wins: a 3 mm paving joint is a road for Lasius and a crack for Camponotus).

### 6.2 Catalogue

| Kind id (new) | Real dimensions (mm) | Representation | Connects | Generation rule | Counts for N? |
|---|---|---|---|---|---|
| `paving-joint` | sand 3-8 (mortar 5-10), groove 3-5 deep | gap between slab RBs + heightfield groove; joint sand diggable down to the bedding under slabs | patio surface ↔ under-slab space (nest) | all joints; 8 % of slabs get an `under-slab` cavity off a joint | once per patio/path |
| `expansion-gap` | 10-20, every 3-6 m in sidewalks and concrete pads | gap; 50 % "cracked sealant" → carve slot 1-2 BU wide to the sub-base | surface ↔ sub-base gravel | per joint line | once per 2 open gaps |
| `asphalt-crack` | 1-25 (structural ≥ 5) | polyline random walk 0.3-2 m; carve slot `max(real, 1 BU)` wide through the 60 mm asphalt layer into the gravel where ≥ 5 mm | hot open surface ↔ cool sub-base shelter | 1 per 8 m² asphalt | each with ≥ 300 BU of slot |
| `door-crack` | 3-10 under a 900 door | primitive gap between leaf and sill | patio/step ↔ interior doormat | always with a kitchen slice; weather strip variant (p 0.25) closes it and forces `pipe-penetration` | yes |
| `kerb-gap` | 5-20 high × 100-400 | carve tunnel through the kerb haunching (30-60 BU), from gutter to verge or sidewalk sub-base | road ↔ verge/sidewalk without the cliff | p 0.15 per kerb unit; ≥ 1 per kerb line | yes |
| `fence-gap` | 10-50 under panel or gravel board | terrain dip (primitive gap) 200-900 long | garden ↔ beyond-fence strip / neighbouring zone | p 0.4 per panel | yes |
| `pipe-penetration` | pipe Ø 15-40, annulus 2-15 | pipe CY inside a carve tube `pipeØ + 2 × max(gap, 0.5 BU)` through the wall and up through the slab | outside wall base / sub-floor void ↔ kick-space under the sink | p 0.8 with a kitchen slice (1.0 if door sealed) | yes |
| `drain-grille` | grate gaps 10-30; linear drain slots 8-12 | gaps between bar RBs over a terrain hole | surface ↔ gully pot rim (shelter ledge, water hazard) | every gully / linear drain | yes (shelter) |
| `root-channel` | surface arches 0.6-3 BU under roots; buried channels Ø 1-2.5 BU | primitive gap (arches) + carve tubes along decayed roots 100-600 BU at 5-30 BU depth | forest floor ↔ subsurface galleries (nest-ready) | 2 per tree p 0.6 | yes |
| `kick-space` | kickboard floor gap 2-6; void 50-80 deep × 100-150 high | primitive gaps | kitchen floor ↔ dark warm void along the cabinet run | always with cabinets; ≥ 1 passable 300 mm section | yes (shelter) |
| `skirting-gap` | 0-5 under skirting; void 2-15 behind | primitive gaps | floor ↔ hidden route along walls, to the kick-space ends | 30 % of runs passable | once per room |
| `weep-vent` | grille slots 3-5 | gaps in the vent grille | outside ↔ wall cavity (long hidden corridor) | every 900; ≥ 1 passable per façade | once per façade |
| `wall-crevice` | 5-30 between stones | primitive gaps | wall face ↔ inner voids (nest) | inherent in dry-stone walls | once per wall |
| `sleeve-gap` | 2-5 around play posts | carve annular slot ≥ 1 BU, 20-60 BU deep into the footing soil | rubber surface ↔ soil under the mat | p 0.5 per post | once per playground |
| `mat-seam` | 2-5 seams; lip at grass edge | carve slot ≥ 1 BU into the gravel base | rubber ↔ sub-base | p 0.3 per seam metre | once per rubber zone |
| `window-sill-gap` [T3] | 1-5 | primitive gap | outside sill ↔ inner sill | p 0.3 | yes |

### 6.3 Usefulness and the guarantee

A micro-connection instance is **useful** for the played species if it is passable by the standard worker and at least one holds: (a) shortcut: nav path length between its two portal cells without the portal ÷ with it ≥ `MICRO_SHORTCUT_RATIO = 1.4`, or no path without it; (b) access to a sheltered cavity of volume ≥ `MICRO_SHELTER_MIN_BU3 = 64`; (c) the only non-climbing access into the `interior`.

`MICRO_USEFUL_MIN` = 4 (compact), 6 (standard), 8 (large). Additionally: with a kitchen slice, ≥ 1 useful interior access; each kerb line, fence line or house wall that separates zones has ≥ 1 passable connection.

Guarantee algorithm (in step 6, deterministic): (1) every template socket is rolled with its p; (2) usefulness is evaluated on the nav grid; (3) while count < minimum, open the closed socket with the largest shortcut gain (ties: lower socket id); (4) if sockets run out, insert a targeted connection on the separating barrier where the gain is highest (`kerb-gap`, `fence-gap` or `weep-vent` by barrier type); (5) if still short, `v-micro` fails → regenerate.

Discovery [T1 event, T2 journal]: the first time a player-colony ant passes a portal, the instance is marked discovered and `world.micro-discovered` is emitted (journal: "a way under the kerb"). Counts appear in diagnostics.

---

## 7. Pre-existing cavities [T1]

Written into the carve grid in step 9 with a per-chunk `preexisting` flag (base chunks are regenerated from the seed; only chunks later modified are saved). Carving only opens voxels; the nest chapter's dig action still refuses non-diggable host material, so these openings cannot be widened inside concrete or brick.

| Cavity id (new) | Where | Shape and size (BU unless mm) | Rule | Typical chunk cost |
|---|---|---|---|---|
| `under-stone` | under flat stones and stepping stones | lens 0.5-1.0 tall, 60-90 % of the footprint | 40 % of stones ≥ 6 BU long | 1-2 |
| `under-slab` | bedding sand under paving | lens 0.5-1.5 tall, 20-60 % of the slab, opening into a joint | 8 % of slabs | 2-6 |
| `kerb-void` | kerb haunching | tube Ø 1-1.5, 30-60 long | per `kerb-gap` | 2-4 |
| `crack-slot` | asphalt cracks, expansion gaps | slot `max(real, 1)` wide, depth to the gravel | per instance ≥ 5 mm | 1 per 30 BU |
| `pipe-tube` | wall and slab | tube around the pipe (6.2) | per pipe | 3-8 |
| `subfloor-void` | slab underside / soil | flat channel 1-2 tall × 2-4 wide, 100-500 long, from a crack at the outside wall base to the pipe tube | always when a pipe penetration exists | 10-40 |
| `root-gallery` | under trees | tubes Ø 1-2.5 along root paths | per `root-channel` | 5-20 |
| `log-gallery` | inside decayed logs and stumps | tubes Ø 1.5-2 (30-120 total) + 1-2 chambers 4-6 wide | p 0.7 per decayed log/stump; ≥ 2 per map for Camponotus (founding site, directions B) | 5-15 |
| `compost-void` | compost heap | 3-6 voids 2-4 | per heap | 3 |
| `worm-burrow` [T2] | lawn, beds | vertical tube Ø 1, 20-60 deep | 0.2/m², max 40 | 1 each |
| `rival-nest` [T2] | rival sites | entrance shaft 20-40 deep + 2-4 chambers 6-10 wide (rival chapter template) | per rival | 10-30 |

Gully pots, linear drain channels and the sand-pit fill are not carve cavities: they use terrain holes or strata (13.2).

---

## 8. Plants, resources, creature territories [T1 baseline, T2 full]

Ecology owns amounts, renewal and nutrient profiles; worldgen places anchors (`FoodAnchor { kind, pos, hostObjectId?, seasonMask, initialState }`) and territories (`Territory { creatureKind, centre, radiusMm, zoneMask, cap }`).

### 8.1 Food anchors

| Zone | Anchor | Food kind (J) | Placement rule | Density / count | Tier |
|---|---|---|---|---|---|
| forest | aphid colony on tree branch or herb | `honeydew` | per tree branch site p 0.35; per `herb-plant` p 0.15 | | T1 (≥ 1 per map near start, else R3) |
| forest | EFN plant | `nectar` | herb with EFN flag | 0.05/m² | T2 |
| forest | dead-insect spawn area | `carrion` | whole zone; ecology rate 1-3 per GD per 100 m² | area | T1 |
| forest, lawn, beds | springtail patch (prey) | `prey` | humid litter, moss, mulch, thatch (theta0 ≥ 0.35) | forest 0.3/m², lawn and beds 0.1/m² | T2 |
| forest, beds | elaiosome seeds | `seed` | under herb plants, spring | 0.2/m² | T2 |
| lawn | flower nectar | `nectar` | dandelion, clover, daisy heads | per flower | T2 |
| lawn `rough`, verges, joints | seed heads, fallen seeds | `seed` | seed-grass, weeds | per plant | T2 (T3 Messor use) |
| garden-bed | aphid colony on host | `honeydew` | per host-flagged plant | | T1 |
| garden-bed | windfalls | `fruit` | under fruit trees, autumn | 2-4 per tree | T2 |
| pavement, playground | crumb spot | `crumb` | 300 mm around benches, patio table, bins | 1-3 per spot at start | T1 |
| asphalt | can residue, crumbs by bays | `sugar`, `crumb` | per `drink-can`; 1 per 4 bays | | T2 |
| interior | counter crumbs, sugar granules, fruit bowl, grease at hob, pet-food bowl, kitchen bin rim, under-table crumbs | `crumb`, `sugar`, `fruit`, `pet-food` | on POIs (5.7) | 1 each | T1 (crumb, sugar) / T2 rest |
| any zone, morning | dew | `dew` | chapter 06 dew model | | T2 |

### 8.2 Creature territories [T2]

| Creature (J) | Zones | Placement | Count rule |
|---|---|---|---|
| `springtail`, `mite` | forest litter, moss, mulch | with prey patches | per patch |
| `aphid` | host plants | with honeydew anchors | per anchor |
| `ladybird`, `ladybird-larva`, `lacewing-larva` | aphid hosts | 1 territory per 4 aphid anchors | summer weighted |
| `woodlouse`, `millipede` | under logs, stones ≥ 100 mm, pots, compost | 1 group per log/pot p 0.5 | |
| `earthworm` | lawn, beds | 0.2/m² (active after rain) | cap 30 |
| `snail` | damp beds, near water butts, forest | 0.05/m² | cap 10 |
| `jumping-spider` | vertical surfaces: walls, fences, posts, play equipment, façade | 1 per 6 m of wall or fence | cap 4 |
| `wolf-spider` | lawn, forest litter | home range Ø 1-2 m; 1 per 25 m² | cap 4 |
| `ant-spider` | warm sunny sandy ground (sand-pit margins, dry lawn), `temperate-eu`, `mediterranean` | best 2 cells by warmth × dryness | 0-2 |
| `antlion` | sheltered dry sand (sand cells with shade ≥ 0.5 from structures and theta0 < 0.15) | 1 per m², with `antlion-pit` | cap 6 |
| `centipede` | forest litter, under logs, compost | 1 per 30 m² forest | cap 3 |
| `rove-beetle` | litter, compost | 0.05/m² | cap 6 |
| `fly-larva`, `fruit-fly` | carrion, compost, windfalls, bins, fruit bowl | attached to those anchors | |
| `phorid-fly` [T3] | `southern-us` only | near Atta trails | |
| `bird` (event) | open cells with sky view ≥ 0.7 and area ≥ 4 m² (lawn, pavement, playground) | region polygon | 1 region per qualifying zone |

### 8.3 Plants as hosts

`HOST_FLAGS` rolled per plant: `aphid`, `efn`, `nectar`, `elaiosome`, `seed`, `scale` (houseplants, shrubs). Atta leaf substrate: every `plant`-material leaf of shrubs, trees' low branches and herbs is cuttable (cutting rules in the Atta module); mowing clippings add short-lived `leaf` anchors (15.5).

---

## 9. Decor layers (visual only) [T1; seasonal parts T2]

Decor is never collidable, never in `SimState`, never queried by the sim. Positions come from `hash(seed, layer, tile 64 BU)` so a place looks the same every visit. Densities are nominal at High quality; Medium ×0.5, Low ×0.25, `test` 0. Streaming radius is the renderer's.

| Layer id (new) | Zones | Size (mm) | Nominal density (/m²) | Placement and behaviour |
|---|---|---|---|---|
| `decor-grass` | lawn | blades 2-6 wide; length = dynamic sward height (mown) or 100-300 (rough) | 3000 (rough 1500) near the camera | grows with `grassHeightMm` (15.5); blades within 1.5 BU of the camera ray fade; within 1 BU of the possessed ant bend away |
| `decor-grass-tuft` | edges of sand, rubber, pavement, kerbs, forest clearings | 30-120 tufts | 200 along edges (1 m band), forest clearings 100 | static |
| `decor-leaf` | forest; lawn and pavement within 3 m of trees | 60-120 × 40-70 (birch-like 30-50 for 30 %) | forest 250 (summer), 600 (autumn `doy` 15-21), 400 (winter, spring); fringe linear to 0 at 3 m | draped on the top-surface map with curl; seasonal colours |
| `decor-needle` [T3] | pine-hardwood forest | 1 × 40-150 | 2000 | lines |
| `decor-petal` [T2] | within 1.5 m of flowering shrubs, fruit trees | 8-20 | 80 in spring `doy` 2-6 | draped |
| `decor-litter` | pavement, asphalt, playground | wrappers 50-150, receipts | 0.05; 0.5 within 1 m of bins | draped, flattened |
| `decor-grit` | asphalt edges, gravel, sand margins | grains below `PROP_MIN_SOLID_BU` | 500 | static |
| `decor-clippings` [T2] | mown stripes | 5-30 | 300 for 0.5 GD after mowing | fade out |
| `decor-mulch-fine`, `decor-pebble-fine` | beds, forest | sub-threshold chips and pebbles | as their solid categories × 3 | static |
| `decor-moss-lichen` | stones, walls, logs | decals | — | on primitives with shade ≥ 0.4 |

---

## 10. Climb routes and points of interest [T1]

`ClimbRoute { id, objectId, nodes: [{ pos, normal, tag? }], lengthBU, baseCell, poiIds, slipperySegments }`. Nodes lie on the surface (offset by the walker's foot offset) at ≤ 8 BU spacing, authored in object-local space in the template and transformed at placement. The base node attaches to the nav cell at the object foot; routes are bidirectional. AI uses them as edges of the surface-nav graph (directions J); the possessed ant sees nothing.

| Template | Routes (name: path) | POIs (kind new ids) |
|---|---|---|
| `standing-tree`, `park-tree`, `fruit-tree` | `trunk-to-branch`: root flare → trunk (bark furrow side) → each low branch → branch tips | `aphid-site` per branch, `vantage` at 2 m |
| `herb-plant`, `perennial-plant`, `shrub`, `bean-row`, `dandelion` | `stem`: base → nodes → each flower or leaf with a host flag | `aphid-site`, `nectar-site`, `seed-site` |
| `log`, `stump` | `log-over`: ground → crest → ground (both sides); `stump-top` | `vantage`, `shelter` |
| `garden-wall`, `fence` | `wall-face`: base → top; `fence-rail`: along the top (route segments every post) | `vantage` |
| `kitchen-table`, `patio-table` | `leg-to-top`: leg → under-top apron (inverted) → edge lip → top centre | `food-spot` |
| `chair`, `bench`, `patio-chair` | `leg-to-seat` | `food-spot` (bench) |
| `base-cabinet-run` + `countertop` | `cabinet-to-counter`: kick-space mouth → door edge (3 mm gap side) → under the 20 mm overhang (inverted) → counter top; one per 1.2 m of run | `food-spot` (crumbs, sugar), `water-spot` (sink rim) |
| `pedal-bin`, `litter-bin` | `bin-to-rim`: base → side → lid seam / rim | `bin-gap` (mega food) |
| `pet-bowl-pair` | `bowl-to-rim`: mat → outer wall → rim → inner wall to food/water level | `food-spot`, `water-spot` |
| `slide` | `ladder-to-platform`; `chute` (top → bottom, slippery when wet) | `vantage` |
| `bollard`, `lamp-post`, `play-post` | `post-to-top` (to 2400 cap) | `vantage` |
| `bird-table` | `post-to-top` | `food-spot` (seeds) |
| `plant-pot`, `planter`, `houseplant` | `pot-to-soil` | `nest-site` |
| `water-butt` | `side-to-tap` | `water-spot` (tap drip) |
| `parked-car` | `tyre-to-arch` (tyre wall to wheel-arch edge) | `shelter` |

POI kinds (new): `food-spot`, `aphid-site`, `nectar-site`, `seed-site`, `water-spot`, `bin-gap`, `vantage`, `shelter`, `nest-site`. Photo mode and the observer camera may list `vantage` POIs.

---

## 11. Coarse navigation grid [T1]

16 BU cells. Static fields per cell: `zone`, `class`, `costMult`, `groundY` (top-surface height of the walkable ground in the cell), `flags` (`shelter`, `exposed`, `interior`, `hot-material`, `water-body`). Edges: 8-neighbour moves, plus climb-route edges and micro-portal edges.

| Class (new ids) | Rule | Cost |
|---|---|---|
| `open` | default walkable | 1.0 × surface cost |
| `blocked-solid` | ≥ 50 % of the cell under objects whose top is > `NAV_OVER_MAX_BU = 40` above the cell ground (walls, trunks, cabinets, appliances, tyres, posts, tall logs) | — |
| `step` | ground height differs from a neighbour by > `NAV_STEP_BU = 2`: edge cost adds `NAV_CLIMB_COST × Δh` (`= 1.5` per BU) if the face is climbable (grip ≥ 0.5), else the edge is blocked | |
| `water-body` | static water (bowls, gully pot) | blocked |
| `hole` | terrain hole cells (gully pots, linear drains) | blocked (portals give access to rims) |
| `edge` | outside `[EDGE_MARGIN_BU, side − EDGE_MARGIN_BU]` (14.1) | blocked |
| surface cost | sward 1.15 (rough 1.3), litter 1.25, loose sand 1.3, gravel/mulch 1.4, fabric 1.2, otherwise 1.0 | multiplier |

Dynamic overlays (owned elsewhere, applied on top): puddle depth (chapter 06: ≥ 0.5 BU ×5, ≥ 1.0 BU blocked), heat (chapter 06), active human-event danger regions (cost ×4 while a cue is live; blocked for the predicted impact area during the last 0.5 s), parked cars (dynamic primitives re-mark covered cells as `blocked-solid` under tyres and `shelter` under the body). Re-derivation after carving or dynamic primitives is incremental per touched cell.

Micro-portal edges: from the cell at one mouth to the cell at the other, cost = channel length × 1.0, with `minClearanceBU`; the path query takes the caste's clearance and skips narrower portals.

---

## 12. Nesting suitability, access and shade [T1 Lasius; T3 other species]

### 12.1 Suitability factors (each 0..1)

| Factor | Definition |
|---|---|
| `fDig` | dig ease of strata at depth 2-15 BU (founding band): `clamp(DIG_REL / 1.2, 0, 1)` averaged over 4 samples; damp sand (theta0 ≥ 0.25) 0.9, dry sand 0.4; wood nesters use the wood primitive at the point instead (`wood-decayed` 1.0, `wood-sound` 0.4). 0 = veto |
| `fCover` | 1.0 under a primitive ceiling (stone, slab, board, log, root, bark) within 3 BU above and extending ≥ 3 BU around; 0.6 under litter or mulch; 0.4 under sward; 0 bare |
| `fWarm` | mean sun fraction 08:00-18:00 from shade samples × (1.2 if the cover is stone/slab/concrete), clamp 1 |
| `fMoist` | species window over static `theta0` (wood moisture for wood nesters, 13.6): Lasius ideal 0.30-0.55 (0 at 0.10 and 0.85); Messor 0.10-0.30 (0 at 0.02 and 0.55); Atta 0.20-0.45 (0 at 0.05 and 0.70); Camponotus wood 0.15-0.30 (0 at 0.08; above 0.30 falls to 0.5 at 0.40, mould) — linear ramps |
| `fFlood` | `1 − floodRisk` (13.4) |
| `fQuiet` | `1 − disturbance`; `disturbance = clamp(Σ expected human-event passes per GD over the cell / 3, 0, 1)` from lanes and event regions |
| `fRival` | `clamp(distance to nearest rival nest / 600 BU, 0, 1)` (dynamic: rival scent at query time) |
| `fSpecial` | Camponotus: decayed-wood volume ≥ 2000 BU³ within 50 BU; Messor: open sky (canopy shade < 0.3) × seed anchors within 300 BU (0.5 each, cap 1); Atta: leaf biomass of shrubs/trees within 600 BU (cap 1) × (1 if no paving within 100 BU) |
| Veto | `fDig = 0`, standing water, `hole`, `interior` floor slab, `edge` |

### 12.2 Weights and score

`Q = veto × Σ w × f`.

| Weight | Lasius | Camponotus | Messor | Atta |
|---|---|---|---|---|
| dig | 0.20 | 0.15 | 0.15 | 0.20 |
| cover | 0.20 | 0.15 | 0.05 | 0.05 |
| warm | 0.15 | 0.05 | 0.20 | 0.10 |
| moist | 0.15 | 0.30 | 0.15 | 0.15 |
| flood | 0.10 | 0.05 | 0.15 | 0.15 |
| quiet | 0.10 | 0.10 | 0.10 | 0.10 |
| rival | 0.10 | 0.10 | 0.10 | 0.10 |
| special | 0 | 0.10 | 0.10 | 0.15 |

Classes: `good` Q ≥ 0.60, `fair` 0.40-0.60, `poor` < 0.40. Biology anchors: Lasius under sun-warmed stones and slabs (Lasius dossier 5); Camponotus parent nest in wood ≥ 15 % moisture (Camponotus dossier 5, 12); Messor dry, open, sunny well-drained ground with surface seeds (Messor dossier 5); Atta well-drained sandy or loamy soil, not pavement (Atta dossier 5).

The static map (`suitability[species]`, Uint8 0..255 per nav cell = max over 4 samples) is computed for the played species and every rival species present. Its uses: validation, start pose, rival sites, the overlay, the nest architect's hints. The live site assessment shown when the queen antennates the ground (chapter 06, opening) re-evaluates the same factors at the exact point with current moisture and rival scent.

### 12.3 Shade samples

For sun positions at 06, 08, 10, 12, 14, 16, 18 h (azimuth from chapter 06's solar model at the season midpoint, elevation 15°-60°), cast a ray from each nav cell's ground point toward the sun through the primitive set (coarse step 8 BU) plus tree canopy discs (transmittance 0.3); store `shade[h]` as Uint8 (0 = full sun, 255 = full shade). Interior cells are 255 except the window sun patch (polygon projected through the window opening for each sample). `world.shadeAt(p, sunDir)` interpolates between samples; parked cars add dynamic shade under their body.

### 12.4 Access map (travel and forage, separate from nesting)

`access[species]` per nav cell = static travel cost multiplier (surface cost × class) and `exposure` = sky view × (1 − cover) (bird and heat exposure). No zone is forbidden to travel or forage for any species: Messor and Atta may cross the kitchen but find nothing to harvest; Camponotus may forage on asphalt at night. Forage value is not a static map: it follows the food anchors.

### 12.5 Rival sites [T2] and start pose [T1]

Rival count: `gentle` 2, `naturalist` 3, `harsh` 4, or the custom value (0-4). Species are drawn from the region roster (ecology section 3; the rival chapter owns the roster and maps each rival species to the nearest of the four suitability profiles with its own moisture window: e.g. a damp-lawn Myrmica-type uses the Lasius profile with ideal 0.45-0.75; a pavement Tetramorium-type uses the Lasius profile with `fCover` doubled under slabs; a large mound-building Formica-type is allowed only in `forest` and placed ≤ 400 BU from a map edge). Placement in order of roster weight: choose uniformly among the top 20 % suitability cells for that species that are ≥ `RIVAL_SPACING_BU = 600` from other rivals, ≥ `RIVAL_START_MIN_BU = 800` from the start, ≥ 200 BU from the edge (Formica-type excepted). Up to 2 incipient same-species colonies (brood-raid targets, directions K) may be placed 300-800 BU from the start (`naturalist` 1, `harsh` 2, `gentle` 0).

Start pose (dealate queen on the surface): maximise `0.5 × (good sites within 250 BU, capped 4)/4 + 0.3 × shelter + 0.2 × (1 − exposure)` over outdoor, non-asphalt cells with flood risk ≤ 0.3, not itself a `good` cell (the player chooses), ≥ 300 BU from the map edge. The opening chapter may override pose and time; the generator guarantees the validation conditions for this pose.

---

## 13. Water [T1 static bodies; T2 hazards and dynamics]

### 13.1 Water bodies

| Body (new ids) | Where | Geometry | Behaviour |
|---|---|---|---|
| `puddle` | `puddleCapMm > 0` cells (13.4) | flat surface at `groundY + puddleMm` clipped by terrain | depth and hazard: chapter 06 section 3.10 |
| `bowl-water` | pet water bowl, sink film, saucers, toy bucket after rain | water plane inside a vessel built from primitives; level 0..`VESSEL_FILL_MAX` | refilled by `food-drop` `pet-feed` (15.5); saucers and buckets fill from rain and watering, evaporate per chapter 06 |
| `gully-water` | gully pots | plane 200 mm below the grate | permanent; rises to 50 mm below the grate during `storm` |
| `wet-patch` | water-butt overflow, outside tap, sink rim, fridge drip tray (p 0.2) | moisture source | `theta0` +0.3 within 500 mm (static modifier) |

### 13.2 Terrain holes

A `terrainHole` bitmask on heightfield cells removes the terrain term from the field inside the masked cells, so only primitives define solid there. Used for gully pots and linear-drain channels, each fully enclosed below the surface by its wall and base primitives (`v-enclose`). This avoids pre-carving large voxel volumes.

### 13.3 Ants and water

Depth in BU = water depth mm / `BU_mm`. Below 0.25 BU: wet film (grip ×0.6, speed ×0.8). At 0.25 BU or more the ant is afloat: it drifts at `WATER_DRIFT_BU_S = 0.5` toward the nearest edge; it climbs out at an edge whose wall slope ≤ 70° and grip ≥ 0.5 (wet multiplier applied); drowning damage follows chapter 06 (0.03 health/s at ≥ 0.5 BU). Glazed bowls when wet (grip 0.7 × 0.6 = 0.42) cannot be climbed out of above 45° slope (bowl walls are about 70°): an ant that falls into a water bowl escapes only by reaching a floating item (a possessed ant may swim to one, chapter 06) or when the bowl is emptied or refilled (`pet-feed` replaces the water, and anything afloat is tipped out onto the mat with p 0.5). Items dropped in water float (`food`, `leaf`, `paper`) or sink (others). Water edges are drinking spots (`water-spot`) where the species defines a water need.

### 13.4 Catchment, flood risk, puddle basins

On the nav grid: priority-flood fill of `groundY` gives basins; `puddleCapMm` = fill depth where ≥ 2 mm on cells with `permeable < 0.3` (paving, asphalt, rubber, clay hollows, tyre ruts), capped 30 mm; 2-6 designed shallow depressions (Ø 200-1500, 3-10 mm deep) are added per car park. D8 flow accumulation gives `catchArea` (BU² per cell; impermeable cells contribute fully, soils ×0.3). `hollow(p) = clamp((Hsmooth(p, 1 m) − H(p)) / 50 mm, 0, 1)`. `floodRisk = clamp(0.5 × hollow + 0.5 × log10(1 + catch_m2) / log10(1 + 20), 0, 1)`. Chapter 06 computes entrance inflow from `catchArea`.

### 13.5 Interior water

Floors are impermeable; spills spread as `spill` films (15.5); the sink film is permanent while the tap drips (p 0.4); no rain indoors.

### 13.6 Wood moisture (wood primitives)

`woodMoist = WOOD_BASE[decay] + 0.08 × groundContact + 0.05 × shadeMean − 0.05 × (1 − shadeMean)` with `WOOD_BASE` sound 0.12, decayed 0.22; building timber 0.10 (door-frame foot, window sill: 0.18 if decayed). Initial value from worldgen; wetting and drying over time are the nest chapter's (chapter 06 cross-reference).

---

## 14. Map boundary [T1]

| Item | Rule |
|---|---|
| Soft margin | `EDGE_MARGIN_BU = 32`: AI steering adds a repulsion that grows linearly to full strength at the margin; scouts reflect their heading |
| Hard limit | positions are clamped to `[8 BU, side − 8 BU]`; a possessed ant pushing outward slides along the limit; HUD shows the glyph "edge of the locality" while pressed (no text beyond that label) |
| What the player sees | a visual skirt of width 0.5 L around the map: terrain extrapolated by mirrored noise, no simulation, low-detail impostors continuing the edge treatment (fence line, dry-stone wall, hedge, road with kerb, house façade, forest), exponential haze from the edge outward |
| Natural barriers | step 1(g) places a physical edge treatment wherever the archetype allows, so most edges read as a fence, wall, road or the house |
| Vertical | outdoor surfaces above `SURFACE_CEILING_MM = 2400` are visual only; tall primitives are capped at 2400 with a `no-walk` cap; the interior ceiling is at 2400 (walkable, no POIs) |
| Underground | bedrock `stone` at `DIG_FLOOR_BU` (2.3); the carve grid allocates nothing below it |
| Falling | ants that drop off a surface fall onto whatever is below; anything below y = −`DIG_FLOOR_BU × BU_mm` (impossible by construction) is teleported to the nearest walkable cell and logged |

---

## 15. Human activity [T2]

Humans appear only as giant indirect agents at ant scale: shoes, wheels, tyres, broom, cloth, nozzle, water, falling food. No human bodies above knee height are modelled, no voices, no characters.

### 15.1 Schedule model

- At 00:00 each GD the scheduler (`rng.events` sub-stream `human`) draws the day's events: for each enabled kind and eligible zone, count = `floor(f) + (u < frac(f) ? 1 : 0)` with `f = baseFreq × seasonFactor × dayFactor × freqMult`. Start times are drawn from the kind's windows (uniform within a window, weights per window). The list is stored in state and drives the threat-overlay forecast (chapter 08).
- `isWeekend` comes from chapter 06 (`weekday = dayIndex mod 7`, 5 and 6 weekend). School holidays: the whole summer season uses weekend patterns for `children`.
- Gates are checked again at the start time (weather, season, presence of the target); a failed gate cancels the instance (`human.cancelled`).
- Same-kind spacing ≥ 0.5 game hour; ≤ `HUMAN_MAX_CONCURRENT = 3` events at once (later ones delayed 10-30 s).
- Quiet hours 22:00-06:00: only `car` (rate ×0.1) and one interior `footsteps` pass (p 0.3).
- `HUMAN_GRACE_GD = 0.25`: no lethal effect within 200 BU of the founding queen during the first 0.25 GD of a new game.
- Winter: during the overwintering time-lapse human events are not simulated; interior food anchors reset in spring.

### 15.2 Event table (Naturalist base values)

| Kind (J) | Variants (new ids) | Zones | Season / weather gates | Windows (game clock) | Base frequency per GD | Duration | Spatial path |
|---|---|---|---|---|---|---|---|
| `footsteps` | `adult` (sole 280 × 100, step 700, 1.4 m/s), `child` (200 × 80, step 450, 1.8 m/s), `paw` (4 paws 50 × 50) | interior, patio, path, sidewalk, lawn, forest path, playground | none (paw: not in rain) | interior: meals 07:00-08:30, 12:00-13:30, 18:00-20:00 (3 passes each) + 3 in 08:00-22:00; outdoor 07:00-21:00, sidewalk peaks 08-09 and 17-18 | interior 12; patio 4; path/sidewalk 6 weekday, 4 weekend; lawn 1.5 (weekend ×2); playground adult 3; forest path 0.7 + paw 0.5 (07-09, 17-19) | one pass = lane length / speed (5-30 s) | lane polyline; feet alternate ±90 mm from the centreline with ±40 jitter; 2 % lingering steps (2-4 steps in place) |
| `mowing` | `motor`, `reel` (p 0.2) | lawn `mown` | `doy` 3-19; not `rain`/`storm`/`frost`; no rain in the previous 0.25 GD | 10:00-18:00 (weekend p 0.7) | 1/3 | ≤ `MOW_MAX_S = 240`; unmown stripes continue next time | boustrophedon stripes along each lawn's long axis, deck 460, overlap 40, 1.0 m/s; 4 wheels Ø 200 × 45 at deck corners |
| `sweeping` | `broom`, `wipe`, `blower` [T3] | broom: patio, path, sidewalk, interior floor (non-vacuum days); wipe: counters, table, floor spills; street broom: car-park kerb strip; blower: pavement and lawn edges in autumn | not in rain (outdoor) | broom 08:00-11:00 outdoor, 20:00-21:00 interior; wipe 08:45, 13:45, 20:15 ±0.5 h; street 06:00-07:00; blower 10:00-15:00 | patio broom 1/3; interior broom 1 on non-vacuum days; wipe 3; street 1/4; blower 1/2 (autumn) | broom ≤ 90 s; wipe ≤ 40 s | broom strokes 600 × 300 advancing along the zone; wipe rows 250 wide; street strip 600 along kerbs |
| `vacuum` | — | interior floor, mats | none | weekday 09:00-11:00, weekend 10:00-12:00 | 1/3 | ≤ `VACUUM_MAX_S = 180` | boustrophedon strips 280 wide, each strip covered twice, 0.4 m/s; crevice pass along skirting p 0.5 |
| `food-drop` | `crumb-fall`, `pet-feed`, `litter-drop`, `sweets` | interior table, counter, floor; patio table; benches, picnic table, bins; car doors | patio meals: spring/summer, weekend, not rain | meals as above; pet-feed 07:30 and 18:00; car doors on `car` arrival | interior 3 meals (5-20 crumbs 0.5-5 mm under the table within 400 of seats, 1-4 on counter); patio 0.5; playground 1-2 (weekend ×2); car park 1 per 4 bays; bins 0.5 | instant | scatter disc around the spot |
| `spill` | `sugary`, `water`, `oil` [T3] | interior (counter, floor), patio, playground, asphalt (oil under cars) | outdoor summer/spring | meals; playground sessions | interior sugary 1.5 + water 0.5; playground 1.0 (summer); patio 0.5; oil 0.3 per parked car | instant; evaporates 0.2-0.5 GD in sun, ×2 in shade, 0.5 GD indoors | disc Ø 20-200 (log-uniform), 1-2 mm film |
| `watering` | `sprinkler`, `hose`, `can` | lawn (sprinkler), beds (hose), pots and beds (can) | `doy` 1-16, no rain in the previous 1 GD; heat weather ×1.5 | 05:30-07:30 or 19:00-21:00 | 1/1.5 | sprinkler 30 s (`WATER_SPRINKLER_S`), hose 12 s, can 6 s | sprinkler circle r 2-4 m from the head; hose sweep along the bed 1-3 m; can spot 300-600; hose and can are preceded by a `footsteps` pass |
| `car` | `arrive`, `depart` | asphalt car-park, driveway | none; night: headlights | car park: 35 % in 08:00-09:30, 35 % in 17:00-18:30, 30 % in 09:30-17:00; driveway 08:00 and 18:00 ±0.5 h | car park 8 (weekend ×0.6); driveway 2 | 7-20 s | from the map edge along the aisle centreline, spline into the bay, 1.5 m/s straight, 0.5 m/s turning; reverse for departures |
| `children` | `play-session` | playground zones; suburban lawn p 0.3 | not `rain`/`storm`/`frost`; in `heat` avoid 12:00-15:00 | weekday outside summer: 08:30-09:00 and 15:30-17:30; weekend and summer: 10:00-17:00 | weekday 2 sessions; weekend/summer 3 | 40-90 s | 1-4 `child` walkers random-walking between play spots (sand pit, slide foot, swings, bench); sand digging at the pit |
| `bait-station` | `station`, `gel` [T3] | interior (Harsh also patio, beds) | reactive (15.6) | placement 18:00-20:00 | reactive only | stays 4 GD, refreshed ≤ 2 times while ants keep feeding | placed 100-300 from the most-used interior trail segment, on floor or counter, or at the threshold |

### 15.3 Telegraph cues

Cue kinds (new ids): `tremor` (substrate vibration), `shadow` (sudden darkening), `sound` (airborne low-frequency), `airflow` (draught, suction), `spray` (first fine drops). Each cue: `{ kind, origin, radiusMm, intensity 0..1, startTick, impactTick }`. Tremor attenuates with distance and substrate transmission: hard and wood 1.0, sward 0.5, soil 0.5, litter 0.4, sand 0.3; ants underground within 30 BU of the surface feel 0.5 ×. All lead times are multiplied by `HUMAN_TELEGRAPH_MULT` (15.7).

| Kind | Cues and lead before the first impact near the receiver (game s) |
|---|---|
| `footsteps` | tremor from 3.0 s when the pass is within 2 m; shadow 0.4 s before each footfall over footprint + 30 % margin; sound thud per step (audible 5 m) |
| `mowing` | sound (engine) 12 s before the first stripe, map-wide falling with distance; tremor within 3 m; airflow 1 s ahead of the deck; deck shadow 0.5 s |
| `sweeping` | broom: bristle sound + tremor 2 s within 1.5 m; shadow 0.3 s per stroke; wipe: shadow 0.5 s, tremor 0.3 intensity |
| `vacuum` | sound (motor) 6 s before the first strip; tremor 2 s within 1 m; airflow pull 0.3 s ahead within 1.5 BU of the nozzle front; shadow 0.5 s |
| `food-drop`, `spill` | shadow 0.5 s; sound at impact |
| `watering` | sound (hiss) 2 s; spray (fine drops) 1 s at the moving front |
| `car` | sound (engine, tyre roll) 8 s; tremor 3 s within 3 m; body shadow 1.5 s before the tyres; headlights at night |
| `children` | tremor (running rhythm) 4 s; shadow 0.3 s per footfall; sand spray 0.5 s at digging |
| `bait-station` | shadow 0.6 s; tremor 1 s (hand placement); then a new attractive odour |

Ant reactions to cues (freeze, flee to cover, grip) are the behaviour chapter's; the possessed ant's grip action makes it immune to dislodgement by tremor (chapter 01). Alerts use chapter 08's `human-event-warning`; audio uses chapter 08 section 13.6.

### 15.4 Effects

Crush probability at impact for an ant inside the contact area (`CRUSH_P`, Naturalist):

| Contact | hard surface (concrete, asphalt, stone, brick, tile, metal, plastic, wood, ceramic, glass, rubber) | bare soft (loam, humus, sand, clay) | sward | litter, mulch, fabric | in a crevice, joint, crack or cavity ≥ 0.5 BU below the contact plane |
|---|---|---|---|---|---|
| adult shoe | 0.85 | 0.45 | 0.25 | 0.15 | 0 |
| child shoe | 0.75 | 0.40 | 0.20 | 0.12 | 0 |
| paw | 0.50 | 0.30 | 0.15 | 0.10 | 0 |
| tyre | 0.95 | 0.60 | 0.40 | 0.30 | 0 |
| mower wheel | 0.80 | 0.50 | 0.60 | 0.30 | 0 |

Survivors are stunned 3 s and drop what they carry.

| Kind | Effects on ants | On items and resources | On pheromone (multiplier on cell values in the area: trail / home) | On terrain and objects |
|---|---|---|---|---|
| `footsteps` | `CRUSH_P` per footfall | items ≤ 2 BU: 50 % removed, 50 % scattered 1-3 BU | 0.3 / 0.7 | bare sand, loam, humus: footprint depression 3 mm (sand 5 mm); nest entrances inside on sand or loam blocked with p 0.5 (top 1.5 BU of the shaft refilled) |
| `mowing` | anything above the cut height (35 mm) in the stripe: p 0.9; wheel tracks `CRUSH_P`; others tumbled 2-6 BU with p 0.3 | lawn herbs trimmed to 35 mm (their aphid, nectar and seed anchors above the cut removed; regrowth 2 GD); clippings: `leaf` anchors in the stripe for 0.5 GD (Atta) | 0.5 / 0.8 | `grassHeightMm` = 35 in the stripe; sward cover 0.2 for 1 GD; birds attracted (creature chapter: bird chance ×2 for 0.2 GD) |
| `sweeping` broom | swept: displaced 50-300 mm along the stroke, tumble 2 s, death p 0.1 | items ≤ 3 BU and loose sand pushed 300-600 mm; 70 % collected (removed) at the end | 0.3 / 0.6 | — |
| `sweeping` wipe | on the wiped surface: removed with the cloth p 0.6, survivors displaced | crumbs and spills removed 95 % | 0.05 / 0.3; deposition ×0.5 for 0.05 GD (detergent) | — |
| `vacuum` | open floor in the nozzle path: removed p 0.9; within 1 BU of a skirting-gap mouth during the crevice pass: p 0.5; kick-space voids, under appliances and inside gaps: safe | items ≤ 4 BU removed (crumbs, pellets, corpses, brood dropped on the floor) | 0 / 0 on covered floor cells | — |
| `food-drop` | falling item on an ant: stun 2 s; items > 6 BU kill p 0.3 | creates `crumb`, `pet-food`, `sugar`, `fruit` items (ecology sizes and nutrients) | — | `pet-feed` also refills `bowl-water` |
| `spill` | ants under the impact: afloat p 0.7 (13.3) | creates a liquid `sugar` node proportional to area, a `water-spot`, or oil (T3) | 0 / 0.5 inside the spill | wet film on the surface |
| `watering` | drops 1-3 mm at `WATER_DROPS_M2_S = 1000` (sprinkler; hose ×3, can ×5): dislodge from stems p 0.3 per hit; impact model shared with rain (chapter 06) | washes small items off leaves; fills saucers and buckets | 0.4 / 0.8 in the wetted area | adds `rainRateMmH` locally (sprinkler 15 mm/h equivalent, hose 40, can 80) to chapter 06's moisture and entrance inflow |
| `car` | tyre tracks `CRUSH_P` | items in tracks 60 % removed (stick to tyres) | 0.2 / 0.6 in tracks | arrival creates a `parked-car` dynamic object (shade, shelter, cells blocked under tyres); surface under the engine +8 °C for 0.1 GD; 30 % chance of a `litter-drop`; departure removes it |
| `children` | child footsteps per footfall; digging: ants in the scoop displaced 0.3-1 m (alive p 0.7) | 30 % per session `sweets` drop; 15 % `sugary` spill; toys moved to new random positions in the pit | 0.4 / 0.7 in the session region | sand heightfield deltas ±100 mm (craters Ø 100-300, mounds); carve voxels within 25 BU of the dug sand surface collapse (cave-in region event, p 0.8); antlion pits inside are destroyed |
| `bait-station` | none at placement | a `bait` food node (ecology defines the attractant and delayed toxicity); the station is a dynamic primitive (RB 60 × 12 × 60, plastic; 4 entrance slots 4 mm) | — | removed after 4 GD unless refreshed |

### 15.5 Grass and ambient states [T2]

`grassHeightMm` per nav cell on lawns: starts 40-60 (mown) / 150-250 (rough); grows `GRASS_GROWTH_MM_GD = 12` in spring and summer, 5 in autumn, 0 in winter, capped `GRASS_MAX_MOWN_MM = 120`. Ambient states: `door-open` (back door open 14:00-18:00 on `doy` 8-14 when Tair ≥ 22 °C, p 0.5 per day: the leaf swings open, the whole doorway becomes passable, interior `footsteps` ×1.5 during the state) and `lights-on` (interior lit 06:30-23:00 when outdoor light is low; visual only).

### 15.6 Reactive rules (the world answers) [T2]

| Rule | Trigger | Response |
|---|---|---|
| Bait | ≥ `BAIT_TRIGGER_VISITS = 60` player-colony ant visits to interior food anchors per GD on 2 consecutive GD, or a trail on the countertop sustained 0.5 GD | after 0.5-1 GD a `bait-station` is placed (15.2); Harsh: also on the patio after 2 GD of patio crumb exploitation |
| Extra wiping | trail on the countertop or table ≥ 0.25 GD | one extra `wipe` that day |
| Sweeping where ants gather | ≥ 30 ants on one patio slab cluster at a broom start | the broom pass covers that cluster |

### 15.7 Difficulty scaling

| Parameter | `gentle` | `naturalist` | `harsh` |
|---|---|---|---|
| `HUMAN_FREQ_MULT` | 0.5 | 1.0 | 1.5 |
| `HUMAN_LETHAL_MULT` (on `CRUSH_P` and removal p; cap 0.98) | 0.4 | 1.0 | 1.2 |
| `HUMAN_TELEGRAPH_MULT` (lead times) | 1.5 | 1.0 | 0.75 |
| `BAIT_ENABLED` | false | interior | interior + garden |
| Possessed ant under a lethal impact | stunned and displaced instead | normal | normal |

Custom rule `humanActivity`: `off` 0, `low` 0.5, `normal` 1.0, `high` 1.5 replaces `HUMAN_FREQ_MULT` (lethality and telegraph still follow the difficulty).

---

## 16. Persistence [T1]

| Data | Regenerated from params + seed | Saved |
|---|---|---|
| Zone raster, heightfield base, strata, static primitives, climb routes, POIs, micro-connection geometry, human lanes, nav grid base, shade samples, catchment, puddle caps, suitability maps, terrain holes | yes (verified by `fingerprint`) | `WorldParams` + `fingerprint` + `generatorVersion` |
| Pre-existing carve chunks | yes | only chunks modified since generation (nest chapter, copy-on-write per chunk) |
| Heightfield deltas (footprints, child craters) | — | sparse `{cell index → Int16 delta in 1/16 mm}` tiles of 32 × 32 cells |
| Dynamic primitives (parked cars, toys, bait stations, door leaf angle) | — | list with transforms and ids |
| `grassHeightMm`, micro-connection discovered/open state, human schedule (today's list, active events with progress), reactive counters | — | yes |
| Food anchors, territories, rivals | initial set from the generator | live state saved by owning chapters |
| Decor | yes (render only) | never |

Load: regenerate `WorldStatic`, compare fingerprints. Mismatch (different generator version or code drift) → load stops with "This save was made with a different world generator (version X). It cannot be opened by this build." and offers export of the raw save; the save is never modified. Each release keeps `SUPPORTED_WORLDGEN_VERSIONS` and the generator branches on version for at least the previous major release.

---

## 17. Deviation notes

| Id | Direction or dossier statement | Decision here | Reason |
|---|---|---|---|
| V1 | Ecology 6.3 calls climbable steel "slippery"; painted line "slightly slick" | Smooth dry metal, glass and ceramic keep grip 0.7-0.75 (climbable); slipperiness comes from wetness, grease, wax and loose sand | ant adhesive pads hold on smooth clean surfaces; keepers need fluon to stop them. Gameplay intent (some surfaces are hard) is kept via wet, greasy and waxy states |
| V2 | Ecology 7.1 dossier weekly cadences under a "game week = 3 GD" rule | Frequencies kept (mowing 1 per 3 GD, vacuum 1 per 3 GD), but weekends follow chapter 06's 7-day week | one calendar for all chapters |
| V3 | Ecology 7.1: real sprinkler run 15-30 min = 0.01-0.02 GD | sprinkler 30 s (0.05 GD), mowing ≤ 240 s, vacuum ≤ 180 s, play sessions 40-90 s, at physical motion speeds | the dossier allows stretching for readability; human motion must be real-speed at ant scale (two-clock model) |
| V4 | Directions E: grass blades visual only | kept, plus a sim-side `sward` layer (cover, travel cost, bird visibility, mowable height) | ants in turf live in a sheltered layer; the effect must exist without colliding blades |
| V5 | Real ants survive submersion for long periods | afloat ants drift and take chapter 06's drowning damage | gameplay hazard, scaled gently (0.03 health/s) |
| V6 | Directions D lists "wall voids" as cavities in the carve grid | cavity walls are free space between two primitive leaves, not carve voxels; terrain holes for gullies | memory: a 2.4 m wall cavity would cost thousands of chunks |
| V7 | Directions J lists `children` as a human event; ch08 offers distant voices as an audio option | no voices in the sim; children are footfalls, digging and dropped food | no human characters |

---

## Appendix A — State required

| Name | Type sketch | Purpose |
|---|---|---|
| `WorldParams` | `{ generatorVersion: string, seedText: string, seed: u32, speciesId, archetype, region, sizeClass, startSeason, startDoy, difficulty, rules }` | regeneration key (saved) |
| `WorldMeta` | `{ fingerprint: u32, attempts: int, repairs: string[], disabledEvents: string[], timingsMs: Record<step, number> }` | diagnostics, load check (saved) |
| `WorldStatic.zones` | `{ raster: Uint8Array (nav cells), list: ZoneDef[] }`, `ZoneDef { id, type, variant, rects?, polyline?, areaMm2 }` | zone queries |
| `WorldStatic.height` | `Float32Array` (samples), `terrainHole: Uint8Array` bitmask | terrain field |
| `WorldStatic.strata` | per zone column table + noise seed | material at depth |
| `WorldStatic.prims` | arrays (SoA): `kind Uint8, transform Float32×12, size Float32×4, material Uint8, flags Uint16, objectId Int32` | solid primitives (static) |
| `WorldStatic.objects` | `ObjectInst { id, templateId, transform, primRange, poiIds, routeIds, socketIds }[]` | object registry |
| `WorldStatic.routes` | `ClimbRoute[]` (section 10) | climbing |
| `WorldStatic.pois` | `{ id, kind, pos, objectId }[]` | POIs |
| `WorldStatic.micro` | `MicroConn { id, kind, mouths: [cell, cell], posA, posB, gapMm, minClearanceBU, lengthBU, useful: bool, reason }[]` | micro-connections |
| `WorldStatic.nav` | `class Uint8, cost Uint8, groundY Float32, flags Uint8` per nav cell + edge lists for routes and portals | coarse nav |
| `WorldStatic.maps` | `shade Uint8[7 × cells]`, `catchArea Float32`, `puddleCapMm Uint8`, `floodRisk Uint8`, `exposure Uint8`, `suitability Record<speciesId, Uint8Array>`, `access Record<speciesId, Uint8Array>`, per-cell static data of 2.4 | derived maps |
| `WorldStatic.lanes` | `{ id, nodeA, nodeB, polyline: Float32Array, weight }[]`, `humanNodes` | human paths |
| `WorldStatic.waterBodies` | `{ id, kind, vesselObjectId?, levelMm, capMm }[]` | static water |
| `SimState.world.heightDeltas` | sparse tiles `Map-free: { tileIndex: int, data: Int16Array }[]` | footprints, craters (saved) |
| `SimState.world.grassHeightMm` | `Uint8Array` (nav cells) | mowing (saved) |
| `SimState.world.dynPrims` | `{ id, templateId, transform, state }[]` | cars, toys, bait, door (saved) |
| `SimState.world.microState` | `{ id, discovered: bool, discoveredTick, open: bool }[]` | discovery (saved) |
| `SimState.world.waterLevels` | `Float32Array` per water body | bowls, saucers (saved) |
| `SimState.human` | `{ dayIndex, scheduled: HumanEventInst[], active: HumanEventRun[], reactive: { interiorVisits: int[2], counterTrailTicks, baitRefreshes } , ambient: { doorOpen: bool, lightsOn: bool } }` | schedule and execution (saved) |
| `HumanEventInst` | `{ id, kind, variant, startTick, laneId? / regionId, seed: u32, cancelled: bool }` | |
| `HumanEventRun` | `{ instId, progressS, nextImpactTick, cues: Cue[] }` | |

## Appendix B — Commands

| Command | Payload | Tier | Notes |
|---|---|---|---|
| `world.generate` | `WorldParams` | T1 | New Game; runs the pipeline with progress |
| `world.preview` | `WorldParams` | T1 | zone raster + thumbnail only (New Game setup screen) |
| `world.inspectPoint` | `{ pos }` | T1 | returns zone, material, strata at 2-15 BU, suitability factors, micro-connection within 8 BU (UI inspect; the queen's site assessment uses chapter 06's command) |
| `rules.setHumanActivity` | `off|low|normal|high` | T2 | from the pause menu (custom rules) |
| debug `cheat.humanEvent` | `{ kind, variant?, at?: pos, startInS?: number }` | T2 | schedule immediately |
| debug `cheat.setGrass` | `{ heightMm, region? }` | T2 | |
| debug `cheat.setWater` | `{ bodyId, levelMm }` | T2 | |
| debug `cheat.revealMicro` | — | T1 | marks all as discovered (tests) |
| debug `world.forceValidationFail` | `{ check, attempts }` | T1 | tests regeneration and repair |
| debug `query.world.*` | `fingerprint()`, `micro()`, `suitabilityAt(species, pos)`, `navClass(pos)`, `nearestPoi(kind, pos)`, `humanSchedule()`, `crushP(kind, pos)` | T1 | read-only |

## Appendix C — Events

| Event | Payload | Consumers |
|---|---|---|
| `worldgen.progress` | `{ step, fraction, attempt }` | loading screen |
| `worldgen.retry` | `{ attempt, failedChecks[] }` | loading screen, log |
| `worldgen.complete` | `{ fingerprint, attempts, repairs[] }` | game, debug |
| `world.micro-discovered` | `{ microId, kind, antId, pos }` | journal milestone, codex, alerts (notice) |
| `world.zone-first-entry` | `{ zoneType, antId }` | codex `habitat-<zone>` (chapter 08) |
| `world.terrain-deformed` | `{ cells: bbox, cause }` | terrain renderer, nav re-derive |
| `world.cave-in` | `{ centre, radiusBU, cause }` | nest system (collapse), audio `collapse` |
| `world.dynprim-changed` | `{ id, templateId, change: add|move|remove }` | renderer, nav |
| `world.grass-mown` | `{ cells, heightMm }` | vegetation renderer, ecology |
| `human.scheduled` | `{ day, list }` | threat overlay forecast |
| `human.telegraph` | `{ instId, kind, cue, origin, radiusMm, intensity, impactTick }` | ant perception, HUD edge cues, audio warning, camera shake (tremor only) |
| `human.start` / `human.end` / `human.cancelled` | `{ instId, kind, variant, region }` | audio, alerts, journal |
| `human.impact` | `{ instId, kind, contact, footprint (oriented rect or disc), tick }` | renderer (shoe, tyre, broom visual), ants (crush), items, pheromones |
| `human.casualties` | `{ instId, killed, displaced, itemsRemoved }` | diagnostics, journal (when ≥ 5 killed) |
| `human.bait-placed` / `human.bait-removed` | `{ id, pos }` | codex (bait), alerts (warning), diagnostics |
| `sound.cue` | `{ kind, pos, gain }` | audio (giants bus) |

## Appendix D — Diagnostics ("why" view)

| Id (new) | Status | Limiting factors (weights) | Remedies shown |
|---|---|---|---|
| `diag-site` (for a point or the founding chamber) | good / fair / poor | the eight factors of 12.2 with their weighted contributions | "dig under a stone or slab", "move to higher ground", "farther from the rival nest", "drier/wetter ground" |
| `diag-human-pressure` (per zone with colony trails) | quiet / disturbed / dangerous | per kind: trail wipes today, ants killed today, share of trail length inside lanes | "route the trail along joints or edges", "avoid marker on the lane", "forage at dawn/dusk", "the next mowing is forecast for 11:00" |
| `diag-access` (between nest and a food source) | open / costly / blocked | heat, water, steps, missing micro-connection, clearance too small for majors | "use the kerb gap at ...", "wait until the asphalt cools", "minors only can pass the door crack" |
| `diag-connections` | k discovered of n known | — | "scouts explore unmarked ground" |
| `diag-bait` | none / present | days present, colony visits to bait | "avoid marker at the station", "forage elsewhere" |
| `diag-exposure` (possessed ant) | sheltered / exposed | sky view, cover, human lanes nearby | "keep under cover", "grip during tremor" |

## Appendix E — Acceptance checks

1. **Given** params `{seed "oak-17", lasius-niger, suburban-garden, standard}`, **when** the world is generated twice in Node and once in headless Chromium, **then** all three `fingerprint` values are equal.
2. **Given** `camponotus-pennsylvanicus`, `standard`, **when** generated, **then** `L = 36000 mm`, the heightfield has 1001 × 1001 samples and the nav grid 250 × 250 cells.
3. **Given** 200 seeds for each T1 archetype at `standard` (Lasius), **when** generated, **then** every map has 3-5 zones including all mandatory zones of its archetype, and `attempts ≤ 8` with no repairs on ≥ 95 % of seeds.
4. **Given** the same 1000 maps, **then** each has ≥ 6 useful micro-connections passable for a Lasius worker (clearance 0.45 BU), and every `kitchen-door` map has ≥ 1 useful interior access.
5. **Given** a `kitchen-door` map for Camponotus, **when** generated, **then** the door-crack gap is ≥ 5.4 mm (0.6 BU) or the door is sealed and a pipe penetration with clearance ≥ 0.6 BU exists.
6. **Given** any validated map, **then** ≥ 6 nav cells have static `Q ≥ 0.6` for the played species and ≥ 2 lie within 250 BU path distance of the start pose.
7. **Given** any validated map, **then** ≥ 95 % of walkable nav cells are reachable from the start for a standard worker and ≥ 3 food anchors lie within 600 BU path distance.
8. **Given** any validated `standard` map, **then** static primitives ≤ 16 000, pre-carved chunks ≤ 800, and Node generation time ≤ 3000 ms on the CI machine.
9. **Given** any validated map, **then** no prop's lowest point is more than 1 mm above the top surface beneath it and no unintended overlap exceeds 1 mm.
10. **Given** `world.forceValidationFail({check:'v-found', attempts: 8})`, **when** generated, **then** `attempts = 8`, `repairs` contains `R2`, and the final map passes `v-found`.
11. **Given** 100 Lasius workers placed on open concrete inside an adult-shoe footprint and 20 inside sand joints of the same footprint (Naturalist), **when** the footfall resolves, **then** 75-95 of the open ants die and 0 of the joint ants die.
12. **Given** a scheduled `footsteps` pass and a Lasius worker 1 m from the lane on a patio, **when** the pass runs, **then** `human.telegraph` with cue `tremor` is emitted ≥ 3.0 game s before the first footfall within 2 m of that worker (Naturalist), ≥ 4.5 s on `gentle`.
13. **Given** `doy` 10, clear weather and rain that ended 0.1 GD ago, **when** a mowing instance reaches its start time, **then** it is cancelled (`human.cancelled`) and no grass height changes.
14. **Given** a mowing stripe over a dandelion with a nectar anchor at 120 mm, **when** the deck passes, **then** `grassHeightMm` in the stripe is 35, the anchor is removed, and after 2.0 GD the plant and anchor are restored.
15. **Given** 10 workers in a kick-space void and 10 on open floor in the vacuum path, **when** a `vacuum` event covers that floor, **then** all 10 kick-space workers survive and 7-10 floor workers are removed; trail values on covered floor cells are 0.
16. **Given** 61 player-colony visits to interior food anchors on each of 2 consecutive GD (Naturalist), **when** the next 1 GD passes, **then** exactly one `bait-station` exists inside the interior within 300 mm of the busiest trail segment; on `gentle` none is placed.
17. **Given** a `car` arrival into an empty bay with 20 workers on its tyre track (asphalt) and 5 inside a 1 BU crack on the track, **when** the car passes, **then** 17-20 track workers die, all crack workers survive, and a `parked-car` dynamic object with 4 tyres exists in the bay afterwards.
18. **Given** a parked car at 12:00 on `doy` 10 in clear weather, **when** queried, **then** `shadeAt` under the car body centre is ≥ 0.9 and the asphalt there is reported as shaded to chapter 06.
19. **Given** a game in which the player carved 3 chunks, a footprint deformed sand and a mowing ran, **when** saved and loaded, **then** the fingerprint matches, the 3 chunks, the height delta and `grassHeightMm` are identical, and the full `SimState` hash equals the pre-save hash.
20. **Given** a possessed worker teleported to x = −50 BU, **when** one tick runs, **then** its x ≥ 8 BU; and **given** a 10 GD headless soak with 500 AI ants, **then** no ant position ever lies outside `[8 BU, side − 8 BU]`.
21. **Given** a worker placed afloat in a puddle 1 BU from an asphalt edge, **when** 10 game s pass, **then** it has climbed out; **given** a worker afloat in a wet glazed pet water bowl, **then** after 30 s it is still afloat unless a floating item is within 1 BU.
22. **Given** `dayIndex` with `isWeekend` true in summer, **when** the day's schedule is drawn on a `playground-park` map, **then** it contains 3 `children` sessions all within 10:00-17:00.
23. **Given** 30 GD headless runs on the same map with `gentle` and `naturalist`, **then** the total number of `footsteps` passes on `gentle` is 0.5 × the Naturalist total ± 15 %.
24. **Given** `rules.humanActivity = off`, **when** 5 GD pass, **then** no `human.start` event is emitted and the schedule lists are empty.
25. **Given** a Messor `standard` map generated with region `mediterranean`, **then** the static `Q` of every `interior` and paving cell is 0 and the best `Q` cell has canopy shade < 0.3.

## Appendix F — Cross-chapter assumptions

1. **Chapter 06 (environment)** owns surface temperature (`G`, lag), soil moisture, puddle depth and drowning damage, rain and dew, entrance inflow and weekdays (`isWeekend`, 7-day week); it reads this chapter's static per-cell data (2.4), `shadeAt`, `catchArea`, `puddleCapMm`; sprinklers and hoses add local `rainRateMmH` as this chapter specifies.
2. **Chapter 06 (opening)** shows the live site assessment by re-evaluating the factors of 12.1 at a point; its founding outcome model may weight them differently, but uses the same factor definitions so the overlay and the assessment agree.
3. **Nest chapter** owns dig rates (proposal `DIG_REL`, section 3), sand collapse, carve-op masking by material (non-diggable primitives and terrain layers never open), cave-ins from `world.cave-in`, flood inside tunnels, wood moisture over time, and per-chunk copy-on-write saving of carve chunks with a `preexisting` flag.
4. **Locomotion chapter** owns the walker: foot offset small enough (≤ 0.15 BU) that gaps ≥ 0.6 BU are enterable; uses `grip` and the slope limits of section 3; implements clearance checks with `PASS_CLEAR_K`; follows climb routes; implements afloat drift and climbing out of water (13.3).
5. **Seed `f(p)`** is extended additively with a `terrainHole` mask (13.2) that removes the terrain term inside masked cells; the terrain renderer drops triangles there.
6. **Ecology chapter** defines amounts, nutrients, renewal and decay for every anchor kind, the `bait` toxicant, item sizes for `food-drop`, and creature spawning inside the territories of 8.2.
7. **Rival chapter** owns the rival species roster per region, their mapping to suitability profiles, nest templates (≤ 30 chunks each) and simulation; this chapter only picks sites.
8. **Pheromone chapter** applies the multipliers of 15.4 to cell values in impact areas and the wipe deposition penalty; grid cells 4 BU.
9. **Behaviour chapter** turns `human.telegraph` cues into freeze/flee/grip reactions; AI may only use cue data, not the event's future path.
10. **Chapter 01** grip action protects the possessed ant from dislodgement; camera shake only for tremor, none in reduced motion.
11. **Chapter 08** renders `human-event-warning` alerts, the threat overlay forecast from `human.scheduled`, giant sounds (13.6), the edge glyph, and codex unlocks on `world.zone-first-entry` and `world.micro-discovered`.
12. **Species data** provide `BU_mm`, caste `sizeFactor`, and whether the species digs wood (Camponotus) or uses leaf substrate (Atta).
13. **Core** provides deterministic `dmath`, integer-hash noise and `rng.derive(seed, label)` identical in Node and browsers.
14. **Save chapter/TDD** stores `WorldParams`, `WorldMeta` and the dynamic world state of Appendix A, and keeps `SUPPORTED_WORLDGEN_VERSIONS`.

### New identifiers added by this chapter

Archetypes `woodland-edge`, `suburban-garden`, `playground-park`, `car-park-verge`, `kitchen-door`, `field-margin`; regions `temperate-eu`, `ne-america`, `mediterranean`, `southern-us`; size classes `compact`, `standard`, `large`; zone variants `deciduous`, `pine-hardwood`, `mown`, `rough`, `flower`, `vegetable`, `shrub`, `fallow`, `patio`, `path`, `sidewalk`, `car-park`, `driveway`, `lane`, `sand-pit`, `gravel`, `poured`, `tile`, `kitchen`, `sealed`; material `plaster`; sound classes `soft-soil`, `grit`, `litter`, `hard`, `wood`, `plant`, `metal`, `plastic`, `muffled`, `food`, `wet`; all object template ids of section 5; micro-connection kinds of 6.2; cavity ids of section 7; POI kinds of section 10; nav classes `open`, `blocked-solid`, `step`, `water-body`, `hole`, `edge`; water bodies `puddle`, `bowl-water`, `gully-water`, `wet-patch`; decor layer ids of section 9; validation checks `v-found`, `v-connect`, `v-food`, `v-micro`, `v-rivals`, `v-rest`, `v-budget`, `v-start`, `v-lanes`, `v-enclose`; human event variants `adult`, `child`, `paw`, `motor`, `reel`, `broom`, `wipe`, `blower`, `crumb-fall`, `pet-feed`, `litter-drop`, `sweets`, `sugary`, `water`, `oil`, `sprinkler`, `hose`, `can`, `arrive`, `depart`, `play-session`, `station`, `gel`; cue kinds `tremor`, `shadow`, `sound`, `airflow`, `spray`; ambient states `door-open`, `lights-on`; diagnostics `diag-site`, `diag-human-pressure`, `diag-access`, `diag-connections`, `diag-bait`, `diag-exposure`; events of Appendix C.
