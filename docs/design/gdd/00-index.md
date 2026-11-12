# FOUNDRESS GDD — 00 Index, registry and consistency record

Status: consistency pass over the eight GDD chapters (01-08), followed by a second pass on the residual conflicts reported by the regenerated digests (E11, D7), done against `docs/00-original-brief.md`, `docs/01-design-seed.md`, `docs/02-design-directions.md` (sections J and K binding), `docs/03-architecture.md` and `docs/design/tdd/00-contracts-guidance.md`. The chapters were edited in place so that they agree; this file records the whole design at a glance, the canonical identifiers, the shared balance constants, every decision that changes a contract, the decision log and the residual risks.

Contents: A. Overview · A2. Ownership map · B. Canonical identifier registry · C. Master balance constants and economy budget · D. Contract-affecting decisions · E. Decision log · F. Residual risks.

Conventions used below: "GDD nn §x" is a chapter section; "J"/"K" are directions sections; "gd"/"GD" is a game day (600 game s); 1 game hour = 25 game s; a "game minute" is never used (consistency pass: write game seconds or game hours).

---

## A. Overview (two pages)

**What the game is.** FOUNDRESS is a single-player, browser-first (WebGL2, Three.js, Preact) naturalistic ant-colony sandbox. The player founds and grows a colony of real ants in a generated, true-scale locality of 3-5 habitat zones (forest floor, lawn, garden beds, pavement, car-park asphalt, playground sand and rubber, a kitchen-and-utility interior slice). There is no score and no dialogue; the tone is a naturalist's field notebook. Six pillars: be the ant and see the colony; naturalistic; autonomous colony; readable causality; small things matter; quiet is good.

**One simulation, several views (GDD 01).** Every ant is an individual agent (one simulated ant is one ant, K). The player can *possess* any living ant of the colony and play it in third person with exactly the action primitives the AI uses (move, grip, pick up, dig-bite, trophallaxis, lay trail, tend aphids, bite, spray acid, ...; 38 primitives plus species additions). Releasing an ant returns it to autonomy with a sensible inferred task. Other views: Observer (free/follow camera, inspect), Colony view (strategic camera, cutaway of the nest, marker and dig tools, overlays), Photo mode, and the founding and winter time-lapses. Time runs at pause/1x/2x/4x/8x (8x only when not possessing; at most 2x during the opening), with skip-to-next-event (GDD 06 §4).

**The opening (GDD 06 §5, GDD 03 §13).** A new game starts on the species' natural founding day (Lasius: Summer 3, afternoon, after the July-August flights) with a lone dealate queen on the surface. A shelter clock (desiccation) and a few telegraphed threats push her to choose a site; antennating the ground shows a seven-factor site assessment. She digs a shaft and a founding cell (readiness owned by GDD 03), seals the entrance, lays the first clutch in batches with a forecast panel, and a skippable ~75 s time-lapse runs the real simulation from her single founding reserve pool (56 loads for Lasius) to the first nanitic workers (typically 8-16). The workers reopen the nest and journal "aims" (naturalist questions) open.

**The colony (GDD 02).** Workers have physiology (crop, reserve, fatigue, physiological age, lifespan 24-33 gd), perceive locally (contact, antennae, smell, pheromones), and are allocated to the 17 canonical tasks (plus `raid`) by demand, response thresholds and age polyethism, with the player's four group sliders (Forage, Nurse, Dig, Defend) as targets. Foragers are activated by the rate of successful returns; recruitment is information transfer along `trail` pheromone, backed by breadcrumb homing and learned routes. Food is two nutrients in **loads** (C carbohydrate, P protein); larvae need protein, so protein usually limits growth. Brood (egg, larva, pupa) are individual entities with temperature-dependent development. The queen's laying is limited by season, size, temperature and the protein that workers allow her. A colony-wide ledger is exact, and every system publishes diagnostics with weighted causes and remedies.

**The nest (GDD 03).** Digging carves a sparse 0.5 BU voxel grid; each bite yields a soil pellet that ends on an entrance mound. Dig plans (tunnel, shaft, chamber, entrance, seal, reopen; widen and backfill later) come from the player's dig planner or from a need-driven nest architect using a per-species template. Chambers are detected, typed and given capacities; temperature and humidity follow depth, cover and weather; brood is moved to the best-ranked chamber. T2 adds flooding, collapse and rival nests. Pre-existing cavities (under slabs and stones, kerb voids, cracks, root galleries, logs) are in the carve grid; wall voids and door gaps are free space between primitives (K).

**The world (GDD 04).** Seeded, deterministic generation of 3000/4000/5000 BU square maps from six archetypes, with an object catalogue at true scale, micro-connections (paving joints, door cracks, kerb gaps, pipe penetrations) that open routes, climb routes, a 16 BU nav grid, suitability maps per species, validation with repair and regeneration, and indirect human activity (footsteps, mowing, sweeping, vacuum, food drops, spills, watering, cars, children, reactive bait stations) with sensory telegraphs and pheromone wipes.

**Ecology, rivals, combat (GDD 05).** Persistent food nodes (aphid herds with honeydew and predators, flowers and extrafloral nectaries, fruit, carrion with decay stages, live prey patches, seeds, human food, toxic bait) whose yields and renewal set the economy; 21 creature kinds with telegraph-and-counterplay predators, a bird event and a creature director; 2-4 abstract rival colonies (plus 1-3 incipient conspecifics for brood raids) that field a budgeted number of real agents, hold territory and escalate through tension, skirmish, war and truce; combat with bites, grapples, pins, acid, stings, alarm recruitment and injuries.

**Environment and progression (GDD 06).** A 28-day year (seasons of 5, 7 or 10 days by custom rule; default 7) anchored at the spring equinox, day/night, climates per region, air/surface/soil/chamber temperatures, weather with a state machine, wind, dew, soil moisture and puddles. Winter is an aggregate, explained, skippable time-lapse. Colonies pass descriptive stages (founding, first workers, growing, mature) at thresholds in simulated workers. A mature, well-fed colony rears alates in the species window and launches nuptial flights (possessable at T3) that add daughter foundations to a persistent Lineage. Queen death orphans the colony; extinction ends the game with an Epitaph. Milestones, journal, history graphs and a codex of 70-odd naturalist notes record the colony's life.

**Species (GDD 07).** Data-driven `SpeciesDef` for four playable species: *Lasius niger* (T1 reference; generalist, honeydew ranching at T2), *Camponotus pennsylvanicus* (wood nesting, satellites, slow growth, polymorphic), *Messor barbarus* (granary, milling majors, heat-avoiding), *Atta texana* (fungus garden, leaf-cutting chain, extreme polymorphism), each with its economy module (T3).

**Interface, art, audio (GDD 08).** A minimal hideable HUD (time and speed, colony pulse, possessed-ant panel, context prompts, alert feed), drawers (Directives, Markers and dig planner, Colony health "why", Roster, Nest overview), book screens (Journal, Codex, Settings, Save/Load, Lineage, Epitaph), overlays (scent, temperature, moisture, threats, dig plans), diegetic onboarding with hints and aims, macro-photographic art direction, layered ambience and ant-scale foley, accessibility options.

**Tiers.** T1: world generation (all zones), rendering, carve grid and digging, walker and third-person camera, possession, the Lasius colony loop (founding, brood, foraging with `trail`/`home` pheromones and route memory, nutrition, nursing, digging, storage, midden) with a static T1 food set, directives and markers, HUD/menus/settings, time controls, save/load. T2: food ecology, creatures, rivals, combat, brood raids, weather/seasons/day-night, human activity, overwintering, reproduction and Lineage, queen death and Epitaph, opening polish and onboarding, journal, diagnostics view, scent view, photo mode, audio. T3: the three other species and their modules, difficulty presets and custom rules UI, gamepad, accessibility set, performance presets, codex breadth. **Species build and release order (GDD 07 §1; adjustable):** T1 *Lasius niger*; then *Camponotus pennsylvanicus* (complexity 2, adds `wood-nesting`), *Messor barbarus* (2, `granary`), *Atta texana* (3, `fungus-garden`); data-only variants (*C. herculeanus*, *M. structor*, *Acromyrmex*) after these. Unreleased species show as "Not yet available" cards (GDD 08 §3.7). T3 stretch for habitats: a second interior room variant (pantry or conservatory) beside the launch kitchen-and-utility slice (GDD 04 §1.3).

**Performance contract (binding; seed §1, brief §7-8; full text GDD 08 §0).** Target hardware: an integrated-GPU laptop at 1920 x 1080 holding 60 fps at the Medium preset. Levers: presets Low / Medium / High / Ultra plus Auto, and dynamic resolution (GDD 08 §7.4). Gate: `diag-perf` frame time p95 ≤ 18 ms (GDD 08 App D). Simulation share `SIM_FRAME_BUDGET_MS` 10 real ms per frame (GDD 06 §4.3, with the speed step-down of §4.4). Agents: fewer than 2500 live ants of all colonies (K; C2). Chapter budgets inside it: GDD 02 App F item 10, GDD 03 §16, GDD 04 §4.1.

**Queen and orders; quiet time (traceability gaps G1-G3).** Possessing or selecting the queen after hand-over offers "Colony orders" (I), which opens Directives without releasing her; Directives stays reachable from any view (GDD 01 §2, §10; GDD 08 §4.2, §5.2). The orders are a declared abstraction over decentralised regulation (GDD 02 §0.3 D10; codex `cx-interface-orders`). Quiet observation is a designed outcome: invariant I11 (GDD 05 §6) keeps at least 60 % of daytime hours quiet in Naturalist, with an optional ambient-watch camera (GDD 01 §6.6, T3) and `milestoneNotices` (GDD 08 §3.4, §7.4).

## A2. Ownership map (topics that chapters attributed to chapters that do not exist)

| Topic (as referenced in chapters) | Owner after the consistency pass |
|---|---|
| Locomotion / surface walker / player movement | GDD 01 §4 (player), GDD 02 §1.6 (AI speed composition), GDD 07 caste tables (species cruise, sprint, `loadSpeedMult`), GDD 06 §2.6 (`speedMult(Tb)` = GDD 01 `tempFactor`), GDD 04 §3 (grip, slopes), GDD 03 §5 (nest walking, clearance, squeeze) |
| Economy, nutrition, stores, upkeep, crop | GDD 02 §1, §4-5 |
| Foraging, recruitment, behaviour state machines, "behaviour chapter" | GDD 02 §6-10 |
| Pheromone chapter | GDD 02 §8 (field, decay, deposits); GDD 06 §3.7 (rain wash); GDD 04 §15.4 (human-event multipliers) |
| Brood chapter | GDD 02 §2 |
| Markers / directives chapter | GDD 02 §12 (semantics, caps), GDD 03 §7 (dig and entrance), GDD 05 §4.9 (stance, rally modes) |
| Opening / founding chapter | GDD 06 §5 (script, reserve pool, clutch, time-lapse, outcome); GDD 03 §13 (dig geometry, readiness, sealing) |
| Reproduction chapter | GDD 06 §11-12 |
| Alerts / progression / diagnostics scheme | GDD 06 (ids, milestones, journal, codex), GDD 08 §6 (alert catalogue and presentation) |
| Human-events chapter | GDD 04 §15 |
| Rival chapter, combat chapter, creature chapter | GDD 05 |
| Save chapter | architecture §7, GDD 06 §15 (when), GDD 08 §7.6 (UI) |
| Performance chapter | architecture §6, GDD 08 (`diag-perf`, presets) |

---

## B. Canonical identifier registry

All ids are kebab-case strings unless stated. **J** = directions section J (never renamed). The owner chapter is given for every set; "(+n)" marks additions by the consistency pass.

### B1. Directions J sets (unchanged; additions noted)

| Set | Ids | Additions |
|---|---|---|
| Species | `lasius-niger`, `camponotus-pennsylvanicus`, `messor-barbarus`, `atta-texana` | rival-only species, B5 |
| Castes | `queen`, `gyne`, `male`, `worker`, `minor`, `media`, `major` | size classes `nanitic`, `small-media` (GDD 07; not castes) |
| Brood stages | `egg`, `larva`, `pupa` | — |
| Tasks | `idle`, `rest`, `nurse`, `queen-care`, `scout`, `forage`, `tend`, `store`, `dig`, `haul`, `guard`, `patrol`, `fight`, `flee`, `garden`, `cut`, `mill` | `raid` (GDD 05). Index order = this order, then `raid` (`TASK_COUNT` = 18) |
| Chamber types | `founding`, `royal`, `nursery`, `food`, `granary`, `fungus`, `midden`, `rest`, `general` | — |
| Zone types | `forest`, `lawn`, `garden-bed`, `pavement`, `asphalt`, `sand`, `rubber`, `interior` | — |
| Materials | `loam`, `humus`, `sand`, `clay`, `gravel`, `concrete`, `asphalt`, `stone`, `brick`, `tile`, `wood-sound`, `wood-decayed`, `bark`, `plant`, `leaf`, `metal`, `plastic`, `rubber`, `glass`, `fabric`, `ceramic`, `paper`, `food`, `water` | `insulation` (GDD 03), `plaster` (GDD 04), `mortar` (GDD 06, joint crumb) |
| Food kinds | `honeydew`, `nectar`, `fruit`, `carrion`, `prey`, `seed`, `crumb`, `sugar`, `pet-food`, `bait`, `leaf`, `dew` | variants B4 |
| Creature kinds | `aphid`, `ladybird`, `ladybird-larva`, `lacewing-larva`, `springtail`, `mite`, `fly-larva`, `caterpillar`, `fruit-fly`, `woodlouse`, `earthworm`, `snail`, `millipede`, `jumping-spider`, `wolf-spider`, `ant-spider`, `antlion`, `centipede`, `rove-beetle`, `phorid-fly`, `bird` (event) | variants: caterpillar `small`/`medium`/`hairy`; bird `thrush`/`sparrow`/`woodpecker` (GDD 05) |
| Weather / seasons | `clear`, `overcast`, `rain`, `storm`, `heat`, `frost` / `spring`, `summer`, `autumn`, `winter` | rain intensity classes `drizzle`, `shower`, `downpour` (GDD 06) |
| Marker kinds | `dig`, `forage`, `avoid`, `rally`, `entrance`, `move-brood`, `move-queen` | `satellite` (GDD 07, Camponotus); rally `params.mode` `defend` / `attack` (GDD 05) |
| Pheromone channels | `trail`, `home`, `alarm` | — |
| Human events | `footsteps`, `mowing`, `sweeping`, `vacuum`, `food-drop`, `spill`, `watering`, `car`, `children`, `bait-station` | variants B6 |
| Difficulty | `gentle`, `naturalist`, `harsh` | — |

### B2. Modes, input, camera, actions (owner GDD 01; GDD 08 for screens)

- Screens: `boot`, `unsupported`, `title`, `new-game`, `load`, `lineage`, `settings`, `codex`, `loading`, `playing`, `epitaph` (GDD 01) ∪ `credits`, `hud`, `pause`, `directives`, `markers`, `colony-health`, `roster`, `nest`, `journal`, `save-load`, `photo`, `timelapse-founding`, `timelapse-winter` (GDD 08 UI screen ids). Game modes (contracts): `title`, `loading`, `playing`, `paused`, `epitaph`.
- Views: `possession`, `observer`, `colony`, `photo`, `timelapse` (GDD 01; GDD 08's `possess` is the same view, spelled `possession` in code).
- Camera states `open`, `chamber`, `tunnel`, `crevice`, `falling`, `flight`; cutaway modes `off`, `slice`, `xray`; input contexts `G`, `P`, `O`, `C`, `Ph`, `TL`, `UI`.
- Input action ids: GDD 01 §5 lists (global, possession, observer `obs-*`, colony `cv-*`, photo `ph-*`, time-lapse `tl-*`) (+4: `overlay-cycle` O, `directives` I, `nest-overview` U, `codex` K; + `obs-ambient`, unbound by default, T3 ambient watch, GDD 01 §6.6). `photo-mode` is F2, `pointer-lock-toggle` F8, role quick keys 5-8 (consistency pass).
- Action primitives (GDD 01 §7): `move`, `let-go`, `grip`, `pick-up`, `put-down`, `drop`, `dig-bite`, `seal-entrance`, `unseal-entrance`, `lay-egg`, `feed-larva`, `trophallaxis-give`, `trophallaxis-receive`, `groom`, `antennate`, `sniff`, `lay-trail`, `harvest-liquid`, `harvest-solid`, `tend-aphid`, `carry-aphid`, `bite`, `bite-hold`, `spray-acid`, `sting`, `release-alarm`, `drag`, `fly`, `dealate`, `mate`, `cut-leaf`, `stridulate`, `mill-seed`, `gnaw-radicle`, `tend-fungus`, `eject-frass`, `block-opening`, `hitchhike`; additions `dodge`, `cull-aphid` (GDD 05), `drum`, `cut-seed-head`, `process-leaf` (GDD 07), `plant` (GDD 06/07 founding fungus pellet). "Tear" in GDD 05 is `harvest-solid` on a solid node or carcass (duration `TEAR_S` × hardness); it is not a separate primitive id.
- Action phases `requested`, `validating`, `windup`, `active`, `recovery`, `done`, `failed`, `cancelled`; failure reasons `caste`, `species`, `no-target`, `out-of-reach`, `blocked`, `too-heavy`, `crop-full`, `crop-empty`, `hands-full`, `not-diggable`, `no-reserve`, `cooldown`, `conditions`, `not-allowed-here`, `budget`.
- Possess-rejected reasons `dead`, `not-colony`, `view`, `unknown`; release reasons `player`, `afk`, `colony-view`, `timelapse`; possession-ended adds `switch`, `death`; speed-refused reason `possession`.
- Pose ids `pose.*`, sound cue ids `sfx.*` (GDD 01 §7.3); cue ids of the shared `cue` event (GDD 08 §13.5): `step`, `dig-bite`, `wood-chew`, `pellet-drop`, `frass-drop`, `pick-up`, `drop`, `bite`, `grapple`, `acid-spray`, `trophallaxis`, `antennate`, `lay-egg`, `eclosion`, `alarm-burst`, `drum`, `stridulate`, `leaf-cut`, `seed-crack`, `death`, `prey-struggle`, `creature-step`, `wing-buzz`, `bird-strike`, `antlion-flick`, `raindrop-hit`, `drip`, `flood`, `collapse`, `cricket-call` (+ namespaced `giant.<human-event>`, `ambient.<kind>`, and GDD 03's `dig-bite.<material>`, `seal-tamp`, `collapse-rumble`, `water-trickle`, `mound-slump`, `garden-tend`).

### B3. Colony (owner GDD 02 unless noted)

- Allocation groups `forage`, `nurse`, `dig`, `defend` (Forage: `scout`, `forage`, `tend`, `cut`; Nurse: `nurse`, `queen-care`, `store`, `garden`, `mill`; Dig: `dig`, `haul`; Defend: `guard`, `patrol`; `raid` is never slider-allocated).
- Age bands `callow`, `young`, `mid`, `old`; queen modes `founding`, `established`, `orphan-dead`; metabolic classes `met-rest`, `met-light`, `met-active`; starvation stages `fed`, `lean`, `rationing`, `brood-sacrifice`, `adult-starvation`; nursery jobs `rescue`, `evacuate`, `assist-eclosion`, `feed`, `move`, `tend-pile`, `groom`.
- Behaviour states `<task>.<state>` (GDD 02 §0.4) plus GDD 03 digger/hauler states `seek-slot`, `go-to-slot`, `bite`, `deposit`, `carry-out`, `interrupted`, `seek-pellet`, `go-pickup`, `internal-dump`; GDD 07 tender states `travel`, `solicit`, `wait`, `guard`, `full`, `return`, `relocate`; GDD 07 task subtypes (`tend`: `relay`, `relocate-aphid`; `nurse`: `shuttle`; `haul`: `frass`, `garden-waste`; `store`: `granary-care`; `garden`: `process`, `plant`, `tend-fungus`, `weed`; `guard`: `hitchhike`).
- Ant flag bits: `POSSESSED`, `TRAIL_ON`, `ALARMED`, `WINGED`, `FOUNDING` (contracts), `NANITIC`, `MINIM`, `CALLOW`, `TRAIL_IGNORER`, `DORMANT` (GDD 02), `REFUSE`, `HITCHHIKING` (GDD 07). Brood flags `FIRST_BROOD`, `DIAPAUSE`, `READY`, `NANITIC`, `MINIM`.
- Reason codes (GDD 02 §7): `recruited`, `spontaneous`, `crop-full`, `item-collected`, `source-depleted`, `source-crowded`, `trail-lost`, `stuck`, `stores-full`, `hungry`, `fatigue`, `threat`, `alarm`, `curfew`, `too-hot`, `too-cold`, `rain`, `deficit:<task>`, `surplus`, `released`, `marker:<kind>`, `job:<kind>`, `timeout`.
- Directive keys (one `setDirectives` command): `allocation`, `taskShares`, `diet`, `alateInvestment`, `gyneShare`, `alatePolicy` (`auto-release`, `ask`, `hold`), `stockTarget` (`low`, `normal`, `high`), `stayIn`, `sealInCold`, `stance` (`cautious`, `defensive`, `aggressive`), `casteEmphasis`, species extras `granaryHygiene`, `leafSelectivity`, `satelliteAuto`, `hideFrass`, `hitchhikerEscort`, `externalHeap`. The architect mode is not a directive (GDD 03 `setAutoExpand`).
- Remedy ids `remedy.slider.<group>`, `remedy.diet.<carbohydrate|protein>`, `remedy.marker.<kind>`, `remedy.dig.<chamberType>`, `remedy.possess.<task>`, `remedy.stock.<level>` (other chapters' free-text remedies are the UI text of new remedy ids in the same pattern).
- **Item kinds (canonical, all chapters):** `soil-pellet`, `food-piece`, `carcass` (dead prey animal), `corpse` (dead ant), `waste` (with `wasteKind` `meconium`, `cocoon`, `spoiled-food`, `brood-corpse`), `seed`, `seed-paste`, `chaff`, `frass`, `leaf-fragment`, `leaf-pulp`, `staphylae`, `fungus-piece`, `garden-waste`, `live-aphid`, `pebble`. Brood is never an item.
- **Death causes (canonical):** adults `old-age`, `starvation`, `desiccation`, `heat`, `cold`, `drowning`, `crushed`, `predation`, `bird`, `antlion`, `parasitoid`, `combat`, `disease`, `poison`, `fell`, `exhaustion`, `lost`, `dispersed`, `unknown`; brood `starvation`, `cannibalised`, `untended`, `temperature`, `humidity`, `hygiene`, `exposure`, `flooding`, `eclosion-failed`, `predation`, `base`; colony/founding failure `desiccation`, `predation`, `crushed`, `heat`, `cold`, `drowning`, `exhaustion`, `brood-lost`, `no-workers`, `garden-lost`, `starvation`, `retired`.

### B4. Nest (owner GDD 03)

Voxel flags `LOOSE`, `NATURAL`, `PLUG`; natural cavity kinds (GDD 04 §7 ids + runtime) `under-stone`, `under-slab`, `kerb-void`, `crack-slot`, `pipe-tube`, `subfloor-void`, `root-gallery`, `log-gallery`, `compost-void`, `worm-burrow`, `rival-nest`, `abandoned-burrow`; entrance kinds `dug`, `natural`, `accidental`, `window`; entrance status `open`, `sealing`, `sealed`, `reopening`; nest kinds `main`, `satellite`; plan kinds `tunnel`, `shaft`, `chamber`, `entrance`, `seal`, `reopen`, `widen`, `backfill`; plan status `proposed`, `queued`, `active`, `stalled`, `paused`, `complete`, `cancelled`; plan sources `player`, `architect`, `founding`, `worldgen`, `rival`; priorities `low`, `normal`, `high`, `urgent`; sizes `s`, `m`, `l`; validation codes `anchor-not-in-nest`, `type-not-allowed`, `out-of-bounds`, `water`, `non-diggable`, `overlaps-plan`, `too-large`, `unstable`, `undermines`, `too-close`, `foreign-nest`, `flood-risk`; blocked reasons `no-diggers`, `no-haulers`, `unreachable`, `flooded`, `obstructed`, `unstable`, `temperature`, `season`, `foreign-contact`, `invalidated`, `cap`; architect modes `auto`, `suggest`, `off`; needs `crowding`, `brood-space`, `food-space`, `missing-type`, `winter-depth`, `flood-safety`, `entrance-access`; founding dig states `site-search`, `digging`, `ready`, `sealed`, `reopening`, `established`; pellet dump targets `mound`, `heap`, `terrain`, `water`, `plug`, `tamp`; nest milestone kinds `depth-50`, `depth-100`, `chambers-10`, `volume-1000`, `survived-flood` (journaled as `ms-depth-50`, `ms-depth-100`, `ms-chambers-10`, `ms-volume-1000`, `ms-first-flood-rescue`). Chamber flags (GDD 07) `central`, `unstable`. Pile materials: any item kind dumped (`soil-pellet`, `frass`, `chaff`, `waste`, `garden-waste`).

### B5. World, human activity, ecology, rivals (owners GDD 04, GDD 05)

- Archetypes `woodland-edge`, `suburban-garden`, `playground-park`, `car-park-verge`, `kitchen-door`, `field-margin` (T3); size classes `compact`, `standard`, `large`; **regions** `temperate-eu`, `ne-america`, `mediterranean`, `southern-us` (GDD 04; GDD 05's `temperate-europe`/`south-us` renamed); region → climate (GDD 06): `temperate-eu` → `temperate-maritime`, `ne-america` → `temperate-continental`, `mediterranean` → `mediterranean`, `southern-us` → `subtropical`.
- Zone variants, object template ids, micro-connection kinds (`paving-joint`, `expansion-gap`, `asphalt-crack`, `door-crack`, `kerb-gap`, `fence-gap`, `pipe-penetration`, `drain-grille`, `root-channel`, `kick-space`, `skirting-gap`, `weep-vent`, `wall-crevice`, `sleeve-gap`, `mat-seam`, `window-sill-gap`), POI kinds, climb route kinds, nav classes, water bodies, decor layers, validation checks `v-*` and repairs `R1..R5`, footstep sound classes: GDD 04 §§1-13 and its closing list.
- Human event variants `adult`, `child`, `paw`, `motor`, `reel`, `broom`, `wipe`, `blower`, `crumb-fall`, `pet-feed`, `litter-drop`, `sweets`, `sugary`, `water`, `oil`, `sprinkler`, `hose`, `can`, `arrive`, `depart`, `play-session`, `station`, `gel`; cue kinds `tremor`, `shadow`, `sound`, `airflow`, `spray`; ambient states `door-open`, `lights-on`; suitability classes `good`, `fair`, `poor`; factors `fDig`, `fCover`, `fWarm`, `fMoist`, `fFlood`, `fQuiet`, `fRival`, `fSpecial`; host flags `aphid`, `efn`, `nectar`, `elaiosome`, `seed`, `scale`.
- Food variants (GDD 05): `aphid-herd`, `honeydew-film`, `scale-herd`, `flower`, `extrafloral-nectary`, `berry`, `windfall`, `insect-small`, `insect-medium`, `insect-large`, `large-carcass`, `elaiosome-seed`, `grass-seed`, `crumb-starch`, `crumb-fatty`, `crumb-protein`, `crust`, `sugar-granules`, `sugary-spill`, `sticky-residue`, `kibble`, `wet-pet-food`, `bait-gel`, `water` (variant of `dew`). Carrion stages `fresh`, `ripe`, `putrid`, `husk`; host classes `herb`, `shrub`, `tree`; hazards `antlion-pit`, `spill-pool`, `slime-trail`; ant/creature states `seized`, `pinned`, `paralysed`, `stuck`, `disoriented`; injuries `leg`, `antenna`, `gaster`.
- Rival species `tetramorium-immigrans`, `myrmica-rubra`, `formica-rufa`, `solenopsis-fugax`, `lasius-flavus`, `formica-subsericea`, `tapinoma-sessile`, `linepithema-humile`, `tapinoma-nigerrimum`, `pheidole-pallidula`, `solenopsis-invicta`, `solenopsis-molesta`; relation states `peace`, `tension`, `skirmish`, `war`, `truce` (display: Neutral, Wary, Clashing, Territorial dispute, Lull; GDD 08 §6.4 conflict wording rule).
- RNG streams: `rng.colony`, `rng.brood`, `rng.alloc`, `rng.behaviour`, `rng.ecology`, `rng.creatures`, `rng.rivals`, `rng.combat`, `rng.weather`, `rng.opening`, `rng.winter`, `rng.repro`, `rng.events` (sub-stream `human`), worldgen `wg/*`.

### B6. Environment, progression, reproduction (owner GDD 06)

Climates `temperate-maritime`, `temperate-continental`, `mediterranean`, `subtropical`; day phases `night`, `dawn`, `morning`, `midday`, `afternoon`, `dusk`; opening phases `intro-card`, `dealation`, `search`, `dig`, `seal`, `lay`, `timelapse`, `handover`, `done`, `failed`; founding hazards `flood`, `intruder`, `fungus`, `collapse`, `outbreak`; stages `founding`, `first-workers`, `growing`, `mature` + flags `orphaned`, `declining`, `dormant`; winter modes `diapause-lapse`, `rest-lapse`, `active` + `winterActive`, winter phases `none`, `notice`, `banner`, `lapse`, `report`; thermal states `heat-stupor`, `cold-coma`; alate states `brood-sexual`, `callow-alate`, `waiting`, `assembling`, `flying`; flight phases `ascend`, `lek`, `mate`, `descend`, `land`; auto-slow modes `off`, `slow`, `pause`; journal kinds `milestone`, `stage`, `season`, `weather`, `loss`, `event`, `winter-report`, `flight`, `aim`; site factors `diggability`, `moisture`, `warmth`, `cover`, `floodSafety`, `rivalScent`, `exposure` and words Poor/Fair/Good/Excellent; reproduction gates `gate-stage`, `gate-age`, `gate-queen`, `gate-stores`, `gate-season`, `gate-player`.

- **Milestones:** the 55 `ms-*` ids of GDD 06 §8 (+4 nest milestones `ms-depth-50`, `ms-depth-100`, `ms-chambers-10`, `ms-volume-1000`).
- **Codex:** the 57 `cx-*` ids of GDD 06 §10 (56 + `cx-interface-orders` "Orders without a commander", unlocked on the first `setDirectives` or `placeMarker`; gap G2) (+ `cx-species-<speciesId>`, `cx-antennation`, `cx-nursing`, `cx-springtail`, `cx-material-<material>`, `cx-habitat-<zone>`, `cx-interface-why`, `cx-interface-markers`, `cx-interface-time`). `cx-pavement-wars` keeps its id; display title "Boundary disputes on the slabs". All codex ids carry `cx-`. Codex categories (GDD 08): Species, Castes and anatomy, Behaviours, Creatures, Plants and food, Habitats and materials, Weather and seasons, Human activity, Interface.
- **Aims (union):** `aim-find-site`, `aim-dig-chamber`, `aim-seal`, `aim-first-clutch`, `aim-first-workers` (GDD 08 opening), `aim-first-food`, `aim-second-chamber`, `aim-first-protein`, `aim-first-trail`, `aim-stores-winter`, `aim-midden`, `aim-nest-open`, `aim-garden`, `aim-satellite`, `aim-trunk-trail` (GDD 06 hand-over), `aim-second-entrance`, `aim-cross-zone`, `aim-herd` (Lasius, T2), `aim-alates`, `aim-flight` (GDD 06 §5.13 continuing aims, gap G4), T3 `aim-find-wood`, `aim-plant-garden` (GDD 08). At most 3 shown, oldest first.
- **Hints (GDD 08 §9.2):** `hint-move`, `hint-look`, `hint-antennate`, `hint-dig`, `hint-readiness`, `hint-seal`, `hint-lay`, `hint-timelapse`, `hint-cycle`, `hint-observer`, `hint-pickup`, `hint-trail`, `hint-share`, `hint-colony-view`, `hint-marker`, `hint-speed`, `hint-scent`, `hint-why`, `hint-directives` (+ `hint-reserves`); GDD 06's former `p-*` prompts map onto these.
- **Custom rule keys:** `predators` (`off`, `few`, `normal`, `many`), `rivals` (0-4), `humanActivity` (`off`, `low`, `normal`, `high`), `weatherSeverity` (`none`, `mild`, `normal`, `severe`), `seasonLengthDays` (5, 7, 10), `startSeason` (`natural`, `spring`, `summer`, `autumn`), `foundingLeniency` (`lenient`, `normal`, `strict`), `winterMode` (`timelapse`, `realtime`), `foundingAssist`, `queenSenescence`, `collapse`, `extinctionEndsGame`.
- **Save slots:** `auto` (ring of 3 generations, generation labels `interval`, `season`, `pre-timelapse`, `opening-sealed`, `opening-complete`, `pre-winter`, `post-winter`, `pre-flight`, `final`), `quick`, `slot-1`..`slot-5`, hidden checkpoint `opening-start`. Export prefix `FOUNDRESS1:`, file `.foundress`.
- **History series ids (GDD 02 §13.2 ∪ GDD 06 §9.2):** `workers`, `workers-by-caste`, `workers-by-group`, `queen-alive`, `eggs`, `larvae`, `pupae`, `alates`, `stores-c`, `stores-p`, `intake-c`, `intake-p`, `intake-by-kind`, `use-c`, `use-p`, `eggs-laid`, `eclosions`, `deaths`, `deaths-by-cause`, `brood-deaths`, `trips`, `trip-success`, `trip-time`, `nursery-temp`, `air-temp`, `known-sources`, `trails`, `starvation-stage`, `nest-volume`, `nest-chambers`, `range-max`, `queen-reserves`.

### B7. Species (owner GDD 07)

Economy modules `honeydew-ranching`, `wood-nesting`, `granary`, `fungus-garden`; founding modes `claustral`, `claustral-wood`, `claustral-fungus`; seed classes `S`, `M`, `L`; nest-site roles `parent` (= nest kind `main`), `satellite`; nest-site states `candidate`, `founding`, `active`, `isolated`, `abandoned`; wood placements (11 ids); herd kinds `aphid`, `scale`, `root`; seed cohort states `stored`, `damp`, `germinating`, `sprouted`, `rotting`, `rotten`, `milled`; garden states `seeded`, `establishing`, `healthy`, `stressed`, `infected`, `collapsing`, `dead`; colony flag `garden-less`; midden styles, mound styles, food routes, `larvaFood` values, alarm modes, weapons, synchrony as GDD 07 Appendix A.0.

### B8. Alerts, diagnostics, interface (owners GDD 08 for alerts/UI ids; each diagnostic's owner as listed)

- Alert levels `info`, `notice`, `warning`, `critical`. **Alert kinds (35):** GDD 08 §6.5's 27 (`queen-reserves-low`, `queen-in-danger`, `queen-died`, `food-c-low`, `food-p-low`, `brood-stalled`, `nest-crowded`, `nest-flooding`, `dig-stalled`, `trail-lost`, `source-found`, `source-exhausted`, `nest-attacked`, `raid-seen`, `predator-near`, `human-event-warning`, `weather-change`, `heat-danger`, `possessed-danger`, `possessed-died`, `winter-coming`, `alates-ready`, `flight-weather`, `milestone`, `save-failed`, `storage-unavailable`, `audio-blocked`) + `colony-starving`, `stores-full` (GDD 02), `nest-collapse-risk`, `entrance-breached` (GDD 03), `last-ants` (GDD 06), `garden-failing`, `granary-spoiling`, `wood-drying` (GDD 07).
- **Diagnostic ids (all carry `diag-`; 62):** GDD 01 `diag-possessed-movement`, `diag-possessed-action`, `diag-possession-availability`, `diag-released-ant`; GDD 02 `diag-food-intake-c`, `diag-food-intake-p`, `diag-stores`, `diag-brood-growth`, `diag-egg-laying`, `diag-queen-condition`, `diag-workforce`, `diag-foraging-trails`, `diag-defence`, `diag-mortality`, `diag-hygiene`; GDD 03 `diag-dig-progress`, `diag-nest-space`, `diag-nest-climate`, `diag-nest-flood`, `diag-nest-stability`, `diag-nest-traffic`; GDD 04 `diag-site`, `diag-human-pressure`, `diag-access`, `diag-connections`, `diag-bait`, `diag-exposure`; GDD 05 `diag-carb-sources`, `diag-honeydew`, `diag-protein-sources`, `diag-threats`, `diag-rivals`, `diag-combat-losses`, `diag-toxin`; GDD 06 `diag-surface-activity`, `diag-heat-exposure`, `diag-overwinter-readiness`, `diag-founding-outcome`, `diag-reproduction-readiness`, `diag-flight-day`; GDD 07 `diag-herds`, `diag-ln-protein`, `diag-ln-recruitment`, `diag-ln-nursery-warmth`, `diag-cp-parent-moisture`, `diag-cp-satellites`, `diag-cp-growth`, `diag-cp-frass`, `diag-wood`, `diag-granary`, `diag-mb-milling`, `diag-mb-animal-protein`, `diag-mb-heat`, `diag-mb-patrol`, `diag-at-chain`, `diag-garden`, `diag-at-substrate`, `diag-at-phorid`; GDD 08 `diag-perf`, `diag-audio`, `diag-storage`, `diag-input`. Merged away: `diag-queen-status`, `diag-flood-risk`, `diag-autosave`, `diag-at-garden`, GDD 06's own `diag-nest-climate` rule (now a rule of GDD 03's).
- Diagnostic statuses `ok`, `info`, `warn`, `bad` (UI words Good / Note / Strained / Failing).
- Overlays `scent`, `temperature`, `moisture`, `threats`, `dig-plans`; palettes `okabe-ito`, `high-contrast`, `pattern-only`; spider comfort `off`, `softened`, `abstract`, `marker`; quality presets `auto`, `low`, `medium`, `high`, `ultra`; setting `milestoneNotices` `full`, `quiet`, `off` (GDD 08 §7.4); audio buses `master`, `ambience`, `effects`, `giants`, `ui`, `music`; audio status `off`, `running`, `blocked`, `unsupported`; hint states `pending`, `shown`, `learned`, `dismissed`; storage keys `foundress.settings.v1` (localStorage), `foundress.bindings.v1` (localStorage), `foundress.profile.v1` (IndexedDB `profile`, localStorage fallback; holds `hints`, `codex`, `lineage`), IndexedDB `saves`.

### B9. Commands and events (final names; payloads in the owner chapter's Appendix B/C)

**Sim commands (camelCase `type`):** `possess`, `release`, `setIntent` (replay log only), `action`, `setTrail`, `setSpeed`, `togglePause`, `setAutoSlow`, `skipToNextEvent` (executed by the game loop), `setDirectives`, `placeMarker`, `removeMarker`, `planDig`, `cancelPlan`, `setPlanPriority`, `pausePlan`, `resumePlan`, `acceptPlan`, `designateChamber`, `setAutoExpand`, `setArchitectNeed`, `sealEntrance`, `reopenEntrance`, `openingSkipIntro`, `openingBeginTimelapse`, `skipTimelapse`, `timelapseRespond`, `openingUndo`, `overwinterChoice`, `flightRelease`, `flightPossess`, `flightLand`, `retireColony`, `setDifficulty`, `acknowledgeAlert`, `storeThumbnail`, and flag-guarded `cheat.*` (union of chapter Appendix B lists). Game-level calls (not sim commands): `newGame`, `foundDaughter`, `foundAgain`, `save`, `load`, `quickSave`, `quickLoad`, `exportSave`, `importSave`, `exportLineage`, `deleteSave`, `openScreen`, `closeScreen`, `setView`, `setOverlay`, `setCutaway`, `cameraJumpTo`, `capturePhoto`, `setSetting`, `rebind`, `resetHints`, `audioEnable`, `world.generate`, `world.preview`, `world.inspectPoint`.

**Sim events (`type` strings as written by the owner; dotted and kebab forms both stay):** GDD 01 `possession-started`, `possession-ended`, `possess-rejected`, `possessed-ant-died`, `action-started`, `action-completed`, `action-failed`, `action-cancelled`, `trail-toggled`, `speed-changed`, `speed-refused`, `ant-unstuck`; GDD 02 `ant-eclosed` (all castes), `ant-died` (shared), `egg-laid`, `brood-stage`, `brood-died`, `brood-moved`, `feed`, `trophallaxis`, `delivery`, `recruit`, `forager-departed`, `trail-established`, `trail-lost`, `route-learned`, `task-changed`, `stores-full`, `starvation-stage`, `cannibalism`, `corpse-removed`, `waste-dumped`, `coop-transport` (single event with `phase`), `marker-response`, `diagnostic-changed` (shared); GDD 03 `carve-chunks-dirty`, `breach`, `pellet-created`, `pellet-expelled`, `pellet-dumped`, `mound-changed`, `entrance-opened`, `entrance-state-changed`, `plan-created`, `plan-rejected`, `plan-status-changed`, `plan-progress`, `plan-complete`, `architect-proposal`, `chamber-registered`, `chamber-changed`, `chamber-removed`, `chamber-designated`, `natural-cavity-joined`, `foreign-cavity-contact`, `founding-readiness`, `founding-ready`, `founding-sealed`, `founding-reopened`, `flood-started`, `flood-level`, `flood-ended`, `ant-submerged`, `brood-drowned`, `collapse-warning`, `collapse`, `nest-milestone`; GDD 04 `worldgen.progress`, `worldgen.retry`, `worldgen.complete`, `world.micro-discovered`, `world.zone-first-entry`, `world.terrain-deformed`, `world.cave-in`, `world.dynprim-changed`, `world.grass-mown`, `human.scheduled`, `human.telegraph`, `human.start`, `human.end`, `human.cancelled`, `human.impact`, `human.casualties`, `human.bait-placed`, `human.bait-removed`; GDD 05 `food-source-spawned`, `food-source-discovered` (shared), `food-source-exhausted`, `food-source-removed`, `carrion-stage-changed`, `herd-founded`, `herd-collapsed`, `herd-dormant`, `herd-hatched`, `herd-predator-arrived`, `herd-predator-repelled`, `herd-predator-left`, `aphid-moved`, `aphid-culled`, `prey-subdued`, `prey-escaped`, `creature-spawned`, `creature-despawned`, `creature-died`, `predator-telegraph`, `predator-strike`, `ant-seized`, `ant-freed`, `ant-paralysed`, `ant-stuck`, `antlion-flick`, `antlion-grab`, `bird-approach`, `bird-landed`, `bird-peck`, `bird-left`, `rival-encounter`, `rival-relation-changed`, `rival-raid-started`, `rival-raid-ended`, `brood-raided`, `rival-queen-killed`, `rival-orphaned`, `rival-destroyed`, `rival-founded`, `combat-hit`, `combat-lock`, `combat-unlock`, `combat-pin`, `combat-spray`, `ant-injured`, `alarm-raised` (shared), `toxin-delivered`, `toxin-deaths`, `thief-tunnel-breach`, `thief-tunnel-closed`; GDD 06 `time.hour`, `time.phase`, `time.day`, `time.season`, `time.year`, `time.speed-changed`, `time.speed-limited`, `time.auto-slow`, `weather.changed`, `weather.gust`, `weather.thunder`, `weather.lightning`, `weather.dew`, `weather.puddle`, `env.heat-stupor`, `env.cold-coma`, `opening.phase`, `opening.site-assessed`, `opening.egg-batch`, `opening.timelapse`, `opening.handover`, `opening.failed`, `queen.egg-eaten`, `queen.hazard`, `overwinter.notice`, `overwinter.banner`, `overwinter.begin`, `overwinter.beat`, `overwinter.end`, `overwinter.report`, `milestone.reached`, `journal.entry`, `aim.opened`, `aim.completed`, `stage.changed`, `codex.unlocked`, `flight.eligible`, `flight.launched`, `flight.possessed-start`, `flight.possessed-end`, `flight.ended`, `lineage.daughter-added`, `queen.died`, `colony.orphaned`, `colony.extinct`, `epitaph.ready`, `autosave.done`, `autosave.failed`; GDD 07 `herd-claimed`, `herd-lost`, `honeydew-relay`, `frass-ejected`, `frass-pile-grew`, `wood-moisture-alert`, `satellite-state`, `brood-shuttled`, `queen-relocation`, `drum`, `granary-state`, `seed-milled`, `radicle-gnawed`, `midden-seedling`, `midden-plant`, `garden-state`, `garden-infected`, `all-gardens-lost`, `plant-rejected`, `leaf-cache-spoiled`, `hitchhiker-mounted`, `phorid-strike`, `caste-unlocked`; GDD 08 (sim side) `alert`, `hint-trigger`; shared `cue`, `command-rejected {commandType, reason}`. UI-local (not sim): `ui-screen`, `hint-shown`, `hint-learned`, `hint-dismissed`, `save-result`, `export-result`, `audio-status`, `photo-captured`, `settings-changed`, and GDD 01's game-level `view-changed`, `camera-state-changed`, `input-device-changed`, `pointer-lock-changed`, `gamepad-connected`, `gamepad-disconnected`, `inspect-opened`.

---

## C. Master balance constants (shared constants in full; single-chapter constants by reference)

Every constant lives in `src/sim/balance/*.ts` or species data (seed §3). "Users" lists the chapters that read a constant owned elsewhere. Values are the defaults (Naturalist, Lasius) unless stated.

### C1. Time and calendar (owner GDD 06 §1, §4, §15)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `TICK_S` | 0.1 | game s | 06 (seed) | all |
| `TICKS_PER_HOUR` / `TICKS_PER_DAY` | 250 / 6000 | ticks | 06 | all |
| `DAYS_PER_SEASON` | 7 default; custom 5 / 7 / 10; read from `config.rules.seasonLengthDays` | GD | 06 (K) | 02, 03, 04, 05, 07, 08 |
| `DAYS_PER_YEAR` | 4 × `DAYS_PER_SEASON` (28 default) | GD | 06 | 02, 05, 07 |
| Day numbering (one convention, second pass) | `doy` = integer day of year, **1-based**, 1..`DAYS_PER_YEAR` (doy 1 = first day of spring, K); `d = (doy − 1) + hour/24`, fractional, **0-based**, in [0, `DAYS_PER_YEAR`); `dayOfSeason` 1-based; `dayIndex` 0-based since game start (`weekday = dayIndex mod 7`). No chapter uses a 1-based fractional day (GDD 02's former `D = doy + hour/24` is gone) | — | 06 §0.2, §1.2 | all |
| Default-year conversion | `d28 = d × 28 / DAYS_PER_YEAR` (= `yearFrac × 28`), `doy28 = floor(d28) + 1`. Every day number written in a chapter or in species data is a default 28-day-year number: an integer window "doy a-b" (inclusive) holds while `a − 1 ≤ d28 < b`; continuous breakpoints are written in `d28`; counts meaning "one season" / "one year" are `DAYS_PER_SEASON` / `DAYS_PER_YEAR`; season-relative rules use `dayOfSeason` | — | 06 §1.7 (K) | 02, 03, 04, 05, 07, 08 |
| `WEEK_DAYS` | 7 (day 1 of year 1 = weekday 0; weekdays 5-6 weekend) | GD | 06 (K) | 04 |
| `REAL_DAYS_PER_GD` | 13.04 | real days | 06 | 02, 07 (biology conversion only) |
| `MOON_PERIOD_DAYS` | 2.265 | GD | 06 | 07 (Atta flights) |
| Speeds | 1x/2x/4x/8x = 10/20/40/80 ticks per real s; 8x not while possessing; ≤ 2x in opening phases `search`..`lay` | — | 06 §4 | 01, 08 |
| `SIM_FRAME_BUDGET_MS` / `MAX_TICKS_PER_FRAME` / `MAX_CATCHUP_TICKS` | 10 / 16 / 20 | ms / ticks | 06 §4.3 | 01 |
| `SKIP_MAX_GD` (= GDD 01 `SKIP_MAX_GAME_H` 24, GDD 08 `NEXT_EVENT_MAX_GAME_H` 24) | 1.0 | GD | 06 §4.6 | 01, 08 |
| `AUTOSAVE_INTERVAL_REAL_S` | 300 (setting 2/5/10 min/off) | real s | 06 §15 | 08 |
| Natural start (Lasius / Camponotus / Messor / Atta) | doy 9-12 (default 10) / 2-9 (5) / 15-19 (17) / 2-8 (5) | doy | 06 §1.6 | 07, 08 |
| `TIMELAPSE_TARGET_S` (= 08 `TIMELAPSE_FOUNDING_REAL_S`) / `OVERWINTER_TARGET_S` (= 08 `TIMELAPSE_WINTER_REAL_S`) | 75 / 45 | real s | 06 | 08 |

### C2. Scale, world, budgets

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `BU_mm` (`SpeciesDef.buMm`) | Lasius 4, Camponotus 9, Messor 7, Atta 7 | mm | seed / 07 | all |
| World side | compact 3000 / standard 4000 / large 5000 | BU | seed / 04 | 01, 08 |
| Voxel / chunk / heightfield cell / pheromone cell / nav cell | 0.5 / 16 voxels / 4 / 4 / 16 | BU | seed | 02, 03, 04 |
| `WORLDGEN_MAX_ATTEMPTS` (= 01 `GEN_MAX_ATTEMPTS`) | 8 | attempts | 04 | 01, 08 |
| Colony caps `WORKER_CAP` / `simCapWorkers` | Lasius 1500, Camponotus 1200, Messor 1500, Atta 1500 | simulated workers | K / 02 / 07 | 06 |
| Agent budget | player + rival fielded ants ≤ 2500; `RIVAL_AGENT_BUDGET` = min(900, 2500 − playerAnts − 50) | ants | K / 05 | 02 |
| `CREATURE_AGENT_CAP` | 260 | agents | 05 | — |
| `SIM_FRAME_BUDGET_MS` | 10 | real ms per rendered frame | 06 §4.3 | 08 (performance contract) |
| `diag-perf` ok threshold | frame time p95 ≤ 18 (warn ≤ 33) | real ms | 08 App D | — |
| Nest footprint | ≤ 150 BU from the first entrance (LN `footprintR` 80, MB 150, AT 150); satellites ≤ 600 BU route | BU | K / 03 | 07 |

### C3. Movement (owners GDD 01 player, GDD 02 AI, GDD 06 temperature)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `CRUISE` (Lasius) | 6 at optimal Tb | BU/s | K / 02 | 01, 03, 05, 07 |
| `PLAYER_HURRY_MULT` | 1.6 (Lasius 9.6 BU/s; C burn × 2); hurry is never above the caste's `sprintBuS` and is not sprint | × | 01 | 02, 07 |
| `RUN_SPEED` (alarm, flee) = Lasius worker `sprintBuS` | 12 | BU/s | K / 02 / 07 | 01, 05 |
| Founding (dealate) queen | cruise 6, hurry 9.6; established queen `QUEEN_SPEED` 0.5 × cruise (3), sprint 5 | BU/s | 02 / 07 | 06 |
| `LOAD_SPEED_MULT` / `loadSpeedMult` | Lasius 0.85 for any carried item incl. pellets (CP 0.85, MB 0.75, AT 0.65) | × | 01 / 07 | 03 |
| `speedMult(Tb)` (= GDD 01 `tempFactor`) | 5:0, 10:0.25, 15:0.55, 20:0.9, 22-28:1.0, 30:1.1, 35:0.9, 40:0 (shifted by `thermalShiftC`) | × | 06 §2.6 | 01, 02, 07 |
| `PLAYER_TEMP_FLOOR` | gentle 0.6 / naturalist 0.5 / harsh 0.3 | × | 01 | — |
| Flight (possessed gyne) | ascend 40, forward 80; `flightEnergy` −1/90 per s | BU/s | 06 §11.6 | 01 |
| Water | afloat ≥ 0.25 BU, drift 0.5 BU/s; drowning in ≥ 0.5 BU water: `SUBMERGE_GRACE_S` 50 s then 1 % max hp per s | — | 04 §13 / 03 §11 | 06 |

### C4. Economy (owner GDD 02 unless stated)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| 1 load | full crop of the standard worker = nutrient of one standard carried item (bulk 1.0 = 2 mg for Lasius, `REF_CARRY_MG`) | load | J / 05 | all |
| `MET_REST` / `MET_LIGHT` / `MET_ACTIVE` | 0.08 / 0.12 / 0.20 at 25 °C × `fMet(T)` | C/gd per worker | J / 02 | 05, 06, 07 |
| Queen upkeep | 0.30 C + 0.10 P (founding: `FOUND_UPKEEP_PER_GD` 0.40 from `R`) | loads/gd | J / 02 / 06 | 07 |
| `EGG_COST_P` | 0.04 | P | J / 01 / 02 | 06, 07 |
| `EGG_CLUMP_MAX` (= `OPEN_LAY_BATCH_EGGS`) | 6 | eggs per carried clump | 01 | 06 |
| `LARVA_P_REQ` + `LARVA_C_REQ` (= `LARVA_COST_LOADS` 1.6) | 1.2 P + 0.4 C | loads per larva | J / 02 | 06, 07 |
| `CROP_CAP_STD` / `CARRY_CAP_STD` | 1.0 / 1.0 | load / bulk | 02 | 01, 05, 07 |
| `harvest-liquid` rate (= 02 `DRINK_RATE`) | 0.05 (× source `drinkRateMult`) | load/s | 01 | 02, 05 |
| `TROPH_RATE` | 0.1 | load/s | 01 | 02 |
| `FEED_LARVA_LOADS` | 0.1 per 4 s | load | 01 | 02 |
| `NURSE_FEED_CAPACITY` | 4.5 | loads/gd | 02 | — |
| `APHID_DROPLET` / `TEND_SOLICIT_RATE` | 0.15 load per 6 s `tend-aphid` cycle = 0.025 load/s | load | 01 / 05 | 02, 07 |
| `HONEYDEW_PER_APHID` | 0.10 (untended × 0.5) | C/aphid/gd | 05 | 07 |
| `CROP_RETURN_FRACTION` (forager turns home; also GDD 01 release rule 7) | 0.8 (or crop ≥ 0.1 load with the source empty) | of crop | 02 | 01 |
| `RESUME_LOCALITY_BONUS` | 0.25 | stimulus | 01 | 02 |
| Stock targets `STOCK_TARGET_C` / `_P` | 3 / 1.5 (× 0.5 / 1 / 2 by `stockTarget`) | GD of need | 02 | 06 (gate-stores) |
| Social stomach | `2 + 0.8 N` C, `0.15 N` P | loads | 02 | — |
| Chamber capacity | food 2.0, granary 2.0 (seed; = GDD 07 `GRANARY_LOADS_PER_BU3`), general 1.0 loads per BU³; nursery 1.5 brood per BU³ | per BU³ | 03 §6.4 | 02, 07 |
| `SPOIL_OVERFLOW_MULT` / `SPOIL_SUBMERGED_MULT` | 1.5 / 2.0 (spoilage rate ×; overflow piles outside food capacity / under water) | × | 02 §5.1 | 03 |
| `TEAR_S` | 4.0 × hardness per piece | game s | 01 | 02, 05 |
| `COOP_MAX_ANTS` / `DRAG_SPEED_MULT` / `SOLO_DRAG_MAX` | 12 / 0.4 / 2 × carryCap; motion needs Σ carryCap ≥ 0.5 bulk | — | 01 | 02, 05 |
| Nutrient composition | per variant (GDD 05 §1.2) | C, P per unit | 05 | 02 (defaults per kind) |
| T1 protein | `T1_CARRION_MULT` 4; `crumb-protein` placed with the T1 crumb rule | × | 05 §0 | 04 |
| T1 honeydew | `T1_HONEYDEW_SITES` 1 per 250 plots (6 Standard, ≥ 2 within 600 BU of start); pool cap 0.5, refill 1.0 C/gd; not placed at T2 | sites | 05 §0 | 02, 04, 07 |

### C5. Brood, queen, life history (owner GDD 02; species values GDD 07)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| Stage durations at 21 °C | egg 1.4, larva 0.6, pupa 1.9 (3.9) | GD | 02 | 06, 07 |
| `r(T)` (= 07 Lasius `devRate`) | 0 ≤ 10; (T−10)/11 to 30; 1.818 to 32; 0 at 36 | /GD | 02 | 06, 07 |
| Base survival egg/larva/pupa | 0.90 / 0.85 / 0.95 | — | 02 | 06 |
| `Q_MAX`, `fSize` | 100 eggs/gd, 0.30 + 0.70(1 − e^(−N/300)) | — | 02 / 07 | — |
| Lifespan | 33 gd (N < 100) to 24 gd (N ≥ 250), sd 10; nanitic 24 | GD | 02 | 06, 07 |
| `AGE_RATE_OUTSIDE` / `_DORMANT` | 3.0 / 0.15 (Lasius) | /GD | 02 / 07 | — |
| Sexual larval cost | Lasius gyne × 12, male × 2 of 1.6 loads; Camponotus 8.0 / 1.3 × media cost; Messor 10 / 2; Atta 15 / 3 | × | 06 §11.2 | 02, 07 |
| `NANITIC_SCALE` | 0.85 | × | 02 | 06, 07 |
| Worker `maxHp` / bite | 10 × mg^(2/3) / 1.0 × mg^(2/3) × head factor per 1.0 s; Lasius worker 10 HP, 1.0 | HP | 05 §4.1 | 07 |

### C6. Founding (owner GDD 06 §5; geometry GDD 03 §13)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `FOUND_R0` | LN 56, CP 36, MB 40, AT 48 | loads (single C+P pool) | 06 | 02, 03, 07 |
| `FOUND_SURFACE_EXTRA_PER_GD` / `FOUND_DIG_COST_PER_BITE` | 0.35 / 0.02 | loads | 06 | 03 |
| `FOUND_CLUTCH_MAX_EGGS` / `OPEN_LAY_BATCH_EGGS` / `OPEN_LAY_ACTION_S` | LN 48, CP 16, MB 20, AT 40 / 6 / 4 | eggs / s | 06 | 01, 02, 07 |
| `FOUND_AI_CLUTCH` | 24 | eggs | 02 (new) | 06 |
| `D_MIN` (open / cover), `V_MIN`, `W_MIN` | LN 8 / 5 BU, 10 BU³, 3.5 BU; MB 20 / 15, 15; AT 30 / 25, 25; CP 3, 10 | BU | 03 §13.1 | 06 (`FOUND_SHAFT_MIN_BU`, `FOUND_CHAMBER_MIN_VOXELS`), 07, 08 |
| `DIG_BITE_S` | 1.0 / (`digSpeed`(material, moisture) × digPower × workRate); founding queen digPower 0.77 (≈ 1.3 s in loam); `digSpeed` loam 1.0, humus 1.3, sand 1.6, clay 0.45, gravel 0.35 (GDD 03 §2.1, copied verbatim in GDD 04 §3) | game s | 03 | 01, 02, 04, 06 |
| `seal-entrance` | 2.0 s, `PLUG_RADIUS` 1.2 BU, ~3 per throat (≈ `OPEN_SEAL_HOLD_S` 6 s) | — | 01 / 03 | 06 |
| Outcome (Q 0.7, clutch 24, 19.5 °C) | 11.5 nanitics (8-15), first worker at 4.52 GD, reserves ≈ 0.4 | — | 06 §5.12 | 02, 07 |

### C7. Pheromones (owner GDD 02 §8)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| Half-life `trail` / `home` / `alarm` | 900 s at 22 °C / 1200 s (= 2 GD) / 15 s | game s | 02 | 05, 06, 07 |
| `MAX` trail/home/alarm; `TRAIL_DETECT` | 30 / 20 / 10 ph; 0.3 | ph | 02 | — |
| Human-event multipliers (trail / home; alarm = trail) | footsteps 0.3/0.7, mowing 0.5/0.8, broom 0.3/0.6, wipe 0.05/0.3, vacuum 0/0, spill 0/0.5, watering 0.4/0.8, car 0.2/0.6, children 0.4/0.7 | × | 04 §15.4 | 02 |
| `WASH_K` | drizzle 0.002, shower 0.010, downpour 0.040, storm 0.120 | /s | 06 §3.7 | 02 |

### C8. Combat (owner GDD 05 §4)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| Lasius worker / nanitic / founding queen / established queen / gyne / male | HP 10 / 7 / 40 / 50 / 35 / 6; bite 1.0 / 0.7 / 2.0 / 2.0 / 1.5 / 0.2 | HP | 05 | 07 |
| T3 worker castes (CP, MB, AT) | `maxHp` = 10 m^(2/3), bite = m^(2/3) × headFactor on GDD 07 masses, e.g. CP media 37 / 3.7, MB major 79 / 11.8, AT major 97 / 19.3; GDD 05 §4.1 table = GDD 07 caste tables; T3 queens, gynes, males: GDD 07 values | HP | 05 (formula) / 07 (masses) | — |
| `ACID_MAX` / regen / `SPRAY_COOLDOWN_S` | 5 / 1 per 120 s / 3 | charges / s | 01 / 05 | 07 |
| Outnumbering `M(n)` | min(2.0, 1 + 0.25(n − 1)) over 2 s | × | 05 | — |
| `RETREAT_HEALTH` | 0.35 outside, 0.15 in nest | of maxHp | 05 | 02 |
| `alarmLevel` half-life | 10 s | game s | 05 | — |

### C9. Nest (owner GDD 03)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `tunnelD` / `royalD` (LN) | 2.0 / 2.5 | BU | 03 | 07 |
| Chamber S / M / L (LN) | 6 × 2.5 × 8 / 8 × 2.5 × 12 / 10 × 3 × 16 | BU | 03 | 08 (sizes), 07 |
| `royalAt` | LN 8, MB 10, AT 20, CP 8 adult workers | workers | 03 | 07 |
| `maxEntrances` (LN) | 3 (4 from 800 workers) | — | 03 | 07 |
| `PLAN_CAP_PLAYER` (= `MARKER_CAP.dig`) | 8 | plans per nest | 03 | 02, 08 |
| `MARKER_CAP` | dig 8, forage 4, avoid 8, rally 1, entrance 2, move-brood 1, move-queen 1, satellite 1 | markers | 02 §12.2 | 07, 08 |
| Marker radius | forage / avoid 10-80 (30); rally 8-32 (15) | BU | 02 | 05, 08 |
| `NEST_SITE_SPACING` | 150 (any two nest origins incl. incipients) | BU | 03 | 04, 05 |
| Entrance inflow intensity `I` (GDD 06 `rainIntensityAt`) | drizzle 0.1, shower 0.4, downpour 0.7, storm 1.0, sprinkler or hose 0.5, indoors 0 | — | 06 / 03 §11 | 04 |
| Cavity temperature | GDD 03 §9.1 thermal column, the only model (`chamberTemp`); inputs `T_top`, EMAs τ 1 GD / `DAYS_PER_SEASON`, `T_annual = Tann + 1.0 °C` from GDD 06 §2.5 | °C | 03 / 06 | 02, 07 |
| Messor granary | template S/M/L 10×4×12 / 13×5×14 / 16×6×16 BU; one L granary ≈ 1,600 loads; `GRANARY_TARGET_GD` 36 (≥ the 30-GD alate gate) | — | 07 | 03 |

### C10. World, human activity, rivals (owners GDD 04, GDD 05)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| `HUMAN_FREQ_MULT` / `HUMAN_LETHAL_MULT` / `HUMAN_TELEGRAPH_MULT` | 0.5/1/1.5; 0.4/1/1.2; 1.5/1/0.75 (gentle/naturalist/harsh) | × | 04 §15.7 | 06 |
| `BAIT_ENABLED` | false / interior / interior + garden | — | 04 | 05, 06 |
| Rival count (established) | 2 / 3 / 4 (custom 0-4) | colonies | 05 / 04 | 06, 08 |
| Incipient conspecifics | 1 / 2 / 3, 300-800 BU from the start | colonies | 05 (count) / 04 (sites) | — |
| `RIVAL_SPACING_BU` / `RIVAL_START_MIN_BU` | 600 / 800 | BU | 04 | 03, 05 |
| `rivalAggMult` / `raidCooldownGd` / `rivalKMult` | 0.7/1/1.2; 4/2/1; 0.6/1/1.3 | — | 05 §5 | 06 |
| `predatorDensityMult` (custom predators off/few/normal/many = 0/0.4/1.0/1.6) | 0.4 / 1.0 / 1.6 | × | 05 | 06, 08 |
| `foodAbundanceMult` / `damageTakenMult` (possessed) | 1.3/1.0/0.75; 0.75/1.0/1.0 | × | 05 | 06 |
| `THREAT_MIN_QUIET_GD` | 1.0 / 0.5 / 0.25 | GD | 05 §5-6 | — |
| `QUIET_SHARE_MIN` / `QUIET_WINDOW_GD` (I11) | 0.75 / 0.60 / 0.40; 3 | share of daytime hours; GD | 05 §6 | 08 |

### C11. Progression and reproduction (owner GDD 06)

| Name | Value | Unit | Owner | Users |
|---|---|---|---|---|
| Stage thresholds `growThreshold` / `matureThreshold` / `matureAgeYears` | LN 75 / 700 / 2; CP 50 / 500 / 4; MB 50 / 700 / 3; AT 150 / 1000 / 3 (× `matureGateMult` 0.8/1/1.2) | simulated workers / years | 06 §7 | 07 |
| Worker milestones | `ms-workers-25/100/500/1000` on N | workers | 06 | — |
| `REPRO_MAX_FRAC` / `REPRO_GYNE_SHARE` | LN 0.10 / 0.40; CP 0.12 / 0.44; MB 0.02 / 0.50; AT 0.04 / 0.25 | of N | 06 | 07 |
| `A*` | round(alateInvestment × REPRO_MAX_FRAC × N × alateCapMult); LN N 700, investment 0.5 → 35 alates, 336 loads | alates | 06 | 02 |
| `REPRO_STORE_DAYS_C` / `_P` | 3 / 1.5 (stop at half) | GD of need | 06 | 02 |
| Flight windows | LN doy 9-13; CP 1-9 (next year); MB 15-20; AT 2-8 | doy | 06 | 05 (rival foundations), 07 |
| Alate upkeep gyne / male (C/GD) | LN 0.15 / 0.06, CP 0.15 / 0.10, MB 0.15 / 0.08, AT 0.2 / 0.15 | loads | 07 (caste tables) | 06 §11.2 |
| Egg-to-alate duration | LN gyne larva × 2.0, pupa × 1.1 (≈ 4.7 GD at 21 °C), male larva × 1.2 (≈ 4.0 GD); T3 `devMult` gyne 1.3 / 1.4 / 1.4, male 1.1 / 1.1 / 1.25 (CP / MB / AT) | — | 02 §2.2 / 07 | 06 |
| `ALATE_EXPIRE_GD` / `EXTINCTION_GRACE_GD` / `QUEEN_STARVE_GD` | 3 / 0.05 / 3 | GD | 06 | 07 |
| History rings | hourly 168 samples, daily unbounded | samples | 06 / 02 | 08 |

### C12. Interface (owner GDD 08; read-only for the sim)

Alert lifetimes and throttles (`ALERT_*`), hint timing (`HINT_*`), UI scale ranges, audio buses and mixes, art constants: GDD 08 §§2-13 (none is read by the sim). Shared with other chapters: `TIMELAPSE_*_REAL_S` (= GDD 06), `NEXT_EVENT_MAX_GAME_H` 24 (= GDD 06 `SKIP_MAX_GD`), `UNSAVED_WARN_REAL_S` 60 (= GDD 01 `QUIT_CONFIRM_UNSAVED_S`), `HINT_LEARN_USES` 3 (= GDD 01 `PROMPT_LEARN_COUNT`).

### C13. Economy sanity budget (Lasius, summer, 25 °C, Naturalist)

Per egg laid the colony spends `0.04 + 0.9 × (0.85 × 1.2 + 0.15 × 0.6) = 1.04 P` and `0.9 × (0.85 × 0.4 + 0.15 × 0.2) = 0.33 C` (egg and larval survival of GDD 02 §2.3; dying larvae half fed). Workers cost 0.107 C/gd on average (GDD 02 §15 time-weighted mix). A forager trip of 600 BU at 6 BU/s takes 100 s walking + 20 s drinking + 10 s unloading + about 25 s waiting for activation = 155 s; with surface activity about 0.6 and 14 % rest, a forager returns about 2.0 loads/gd at 300 BU (1.5 at 450 BU; GDD 02 `yieldPerForager` default 1.5 matches). Supply densities are GDD 05 §1.2-1.3 (per 100 × 100 BU plot).

| Colony N | Laying potential | Full need C / P (loads/gd) | Foragers needed / available after nurse, store, queen-care, dig demand | Sources needed within range | Verdict |
|---|---|---|---|---|---|
| 50 | 40.7 eggs/gd | 19.2 / 42.4 | 31 needed / about 23 available | 300 BU (28 plots): T2 1-2 herds + 2 flowers (≈ 25 C), 1-2 prey patches (≈ 16-32 P); T1: 2 flowers, sugar and crumbs (≈ 15 C), boosted carcasses and `crumb-protein` (≈ 5-15 P) | **Feeds itself.** Laying is throttled by the protein permission rule to about 15-25 eggs/gd (T2) or 5-12 (T1): growth +10-30 %/gd, matching GDD 07 growth targets (y1 12-25, y2 200-320) |
| 300 | 74.2 eggs/gd | 57.1 / 77.3 | 77 needed (at 1.75) / about 150 available | 450 BU (64 plots): 3 herds + 5 flowers ≈ 50-65 C; 2-4 prey patches + carrion ≈ 35-70 P | **Feeds itself; protein-limited** (the designed Lasius bottleneck, GDD 07 §1). T1 supplies about 45-60 C and 25-40 P at 900 BU: sustainable, slower growth |
| 1200 | 98.7 eggs/gd (fCap tapering) | 161 / 103 | 176 needed (at 1.5) / about 900 available | 900 BU (254 plots): 13 herds ≈ 190 C + 20 flowers ≈ 80 C; about 13 prey patches (map cap 80 per 1600 plots) ≈ 160 P + carrion 14 P | **Sustains at the cap in T2.** Steady state needs only 69 eggs/gd (deaths N/24 = 50/gd ÷ 0.727) = 72 P/gd. In T1 (no herds, no live prey) the static food set caps a Lasius colony at about 500-700 workers |

Winter check (GDD 06 §6.3): a 7-day winter for N = 1200 costs `(1200 × 0.08 + 0.3 + 0.02 × larvae) × 0.35 × 7 ≈ 240 C`; readiness asks 1.5 × that (360 C), below the normal stock target (3 GD × 161 = 483 C) and the social-stomach capacity (962 C): reachable. Alates (N 700, investment 0.5): 336 loads, 268 of them P, spread over the 5-day lay window and development (≈ 54 P/gd on top of 72 P/gd): demanding but reachable; the former 14-GD stores gate was not (fixed, E-30). Founding: 56 loads cover upkeep 1.8, eggs 1.0 and about 15 larvae × 1.6 = 24, leaving 0.4-0.5 of `R0` (GDD 06 §5.12).

---

## D. Contract-affecting decisions (for mechanical synchronisation of `src/sim/types`)

Each row changes a name, type, owner, payload or unit relative to at least one chapter digest. "Old" quotes the digest/chapter forms; "Final" is binding. Rows are grouped: D1 state placement, D2 entity fields, D3 identifiers and unions, D4 commands, D5 events, D6 diagnostics/alerts/stores.

### D1. SimState placement

| # | What | Old form (chapter) | Final form |
|---|---|---|---|
| D1.1 | Calendar | `calendar.{tick, startTick, foundingTick, moonPhase0, seasonLengthDays, derived}` (06) | `state.tick` (root, guidance); `env.calendar {startTick, foundingTick, moonPhase0}`; `derived` is a non-persisted cache; `seasonLengthDays` → `config.rules.seasonLengthDays` (5 \| 7 \| 10) |
| D1.2 | Calendar constant | `DAYS_PER_SEASON = 7` constant in `calendar.ts` (guidance §7) | helpers take the config: `dayOf(tick)`, `seasonOf(tick, cfg)`, `yearOf(tick, cfg)`; default 7; never hard-coded (K) |
| D1.3 | Weather, thermal, moisture | root `weather`, `thermal`, `moisture` (06) | `env.weather`, `env.thermal`, `env.moisture`; `env.climateId` |
| D1.4 | Overwinter | root `winter` (06) | `env.winter` |
| D1.5 | Human activity | `SimState.human` (04) | `env.human` |
| D1.6 | Dynamic world | `SimState.world.{heightDeltas, grassHeightMm, dynPrims, microState, waterLevels}` (04) | `worldDelta.{heightDeltas, grassHeightMm, dynPrims, microState, waterLevels}` (`grassHeightMm` stored as `Uint16Array`, mm) |
| D1.7 | Time control | `state.time.speed/.paused` (01); `time {speed 0/1/2/4/8, requested, autoSlow, cooldowns, skipUntil, commandSeq}` (06) | `state.time {speed: 1\|2\|4\|8, paused: boolean, requested, autoSlow: 'off'\|'slow'\|'pause', cooldowns: Record<string, number>, skipUntil, commandSeq}`; `setSpeed {speed: 0}` sets `paused` |
| D1.8 | Opening script | root `opening` (06) | `player.opening` (same record) |
| D1.9 | Time-lapse presentation | `player.timelapse` (08, assumed) | `player.timelapse` kept, written by GDD 06 opening and overwinter systems |
| D1.10 | Progression | root `stage`, `milestones`, `journal.{entries, aims}`, `history`, `deaths` (06); `progression.{alerts, aims, hintsMirror, codexSeen, eventLog, milestoneThumbs, diagnostics, stats}` (08) | `progression.{stage, milestones, journal: {entries}, aims, history, deaths, alerts, hintsMirror, codexSeen, eventLog, milestoneThumbs, diagnostics, difficultyHistory}`; aims use the GDD 08 record `{id, state, openedTick, doneTick}[]` (replaces 06 `journal.aims {open, done}`); `stats` → `history` |
| D1.11 | History series | colony `series` (02); `history.daily/hourly` with hourly ring 48 (06); `progression.stats` (08) | `progression.history {hourly: ring 168 × series, daily: unbounded}`; series ids B6 |
| D1.12 | Difficulty | root `difficulty {preset, params, custom, history}` (06) | `config.difficulty {preset, params, custom}`; `progression.difficultyHistory {tick, preset}[]` |
| D1.13 | Reproduction | root `repro {investment, gyneShare, policy, alateRearing, targetAlates, shortfall, lastLaunchTick, flights, active}` (06) | `Colony.repro {alateRearing, targetAlates, shortfall, lastLaunchTick, flights, active}`; `investment`, `gyneShare`, `policy` move to `Colony.directives.{alateInvestment, gyneShare, alatePolicy}` |
| D1.14 | Queen list | `colony.queens {antId, ageDays, lifespanDays}` (06) | `Colony.queens {antId, lifespanDays \| null}[]` (age derived from `bornTick`); `Colony.queenId` = primary queen |
| D1.15 | Ecology | `ecology.{sources, herds, hostPlants, preyPatches, hazards, items, director, birdEvent, carrionAcc}` (05) | `state.sources` (FoodSource), `state.items` (shared Item), `state.plants` (= 05 `hostPlants` records as `PlantState`), `state.ecology.{herds, preyPatches, hazards, director, birdEvent, carrionAcc}` |
| D1.16 | Rivals | `rivals: RivalColony[]` keyed by colonyId; `relations`; `territory`; `threatDirector`; `danger` (05) | `Colony.rival: RivalAbstract \| null` (05 record minus `colonyId`) on rival colonies in `state.colonies`; `state.rivals {relations, territory, threatDirector}`; `danger` → player `Colony.danger: Float32Array` |
| D1.17 | Toxin pool | `stores.toxin` (02); `Colony.toxinPool` (05) | `Colony.stores.toxin` (one field; GDD 05 text "toxinPool" means it) |
| D1.18 | Founding reserves | queen `reserve`/`reserveP` + `QUEEN_RESERVE_*_START` (02); `queen.founding {reserveLoads, R0, desiccation, health, wings, eggsLaid}` (06) | queen-only block `ant.queen: QueenState \| null = {mode, gut: {c, p}, reserve, reserveP, fecundity, eggBudget, layingLog, clutchLaid, founding: {reserveLoads, R0, desiccation, wings, eggsLaid} \| null}`; no separate founding `health` (use `hp/maxHp`) |
| D1.19 | Device stores | IndexedDB stores `lineage`, `codex {unlocked, promptsLearned}` (06); profile `foundress.profile.v1 {hints, codex, lineage: LineageRecord[]}` (08) | one profile `foundress.profile.v1 {hints, codex: Record<CodexId, {tick, doy, year, species, firstSeenIso}>, lineage: {colonies, flights, daughters, settings}}`; `promptsLearned` removed (GDD 01 `player.promptLearned` in the save) |
| D1.20 | Save slots | `auto-1..auto-3`, `opening-start`, `opening-sealed`, `opening-complete`, `pre-winter`, `post-winter`, `pre-flight`, `final`, `quick`, manual 1-5 (06); `auto` (2 generations) + `slot-1..5` (08) | slots `auto` (3 generations, each with a `label`), `quick`, `slot-1`..`slot-5`, hidden `opening-start`; named triggers are `auto` labels; save meta field `population` (was `W_eq`) |

### D2. Entity fields

| # | What | Old form (chapter) | Final form |
|---|---|---|---|
| D2.1 | Ant colony ref | `colonyId` (02, 05) | `colony` (guidance) |
| D2.2 | Ant health | `health 0..1` (02, 05, 06) | `hp`, `maxHp` (points, guidance); "health" in text = `hp / maxHp` |
| D2.3 | Ant crop | `crop {C, P}` (02) | `cropC`, `cropP` (loads) |
| D2.4 | Ant reserve | `reserve` loads C (02) vs `energy 0..1` (guidance) | field name `energy`, **unit loads of C** (0..`RESERVE_CAP` of the age band); comment updated |
| D2.5 | Ant body size | `scale` (02) vs `lengthBu` (07) | `lengthBu` (BU) and `massMg` (07); `scale` removed |
| D2.6 | Ant age and lifespan | `physioAge`, `lifespan` gd (02) vs `lifespanTicks` (guidance) | `physioAgeGd`, `lifespanGd` (float GD on the physiological scale); `bornTick` kept |
| D2.7 | Ant state time | `stateT` s (02) | `stateTick` (guidance) |
| D2.8 | Possession and trail flags | `ant.controlled`, `ant.trailOn` booleans (01) | `flags` bits `POSSESSED`, `TRAIL_ON` |
| D2.9 | Flag names | kebab `nanitic`, `trail-ignorer`… (02); `NANITIC`, `REFUSE`, `HITCHHIKING` (07) | bit names in B3 (`NANITIC`, `MINIM`, `CALLOW`, `TRAIL_IGNORER`, `DORMANT`, `REFUSE`, `HITCHHIKING`, plus guidance bits) |
| D2.10 | Action in progress | `{id, phase, t, duration (s), target, repeat, reason}` (01) vs `{id, startTick, durationTicks, target}` (guidance) | `{id: ActionId, phase, startTick, durationTicks, target, repeat, reason}` |
| D2.11 | Cooldowns | `acidRegenT`, `layCooldownT` game s (01); `acidRegenTick`, `specialCdTick`… (05) | absolute ticks: `acidRegenTick`, `layCooldownUntilTick`, `biteCdTick`, `specialCdTick`, `dodgeCdTick` |
| D2.12 | Combat fields | flat list on the ant (05) | on the ant: `hp`, `maxHp`, `acid`, `acidRegenTick`, `injuries`, `alarmLevel`; the rest (`lock`, `heldBy`, `pinned`, `seizedBy`, `escape`, `paralysedUntilTick`, `stuckSinceTick`, `disorientedUntilTick`, `dodgeUntilTick`, `fightDamage`, `recentHitters`, cooldown ticks) in `ant.combat: CombatState \| null` |
| D2.13 | Task-indexed arrays | `Float32Array(17)` / `Int16Array(17)` (02) | length `TASK_COUNT` = 18 (J order + `raid`) |
| D2.14 | Colony species ref | `speciesId` (02) | `species` (guidance) |
| D2.15 | Stores | `{C, P, toxin, inCrops}` (02); `{c, p}` (06, guidance) | `stores {c, p, toxin, inCrops}` (lowercase); all nutrient fields lowercase `c`, `p` (items, sources, crops, guts) |
| D2.16 | Directives record | `{allocation, diet, production, architect, stockTarget, stayIn, stayInUntil}` (02); `stance` (05); species extras (07) | `{allocation, taskShares, diet, alateInvestment, gyneShare, alatePolicy, stockTarget, stayIn, stayInUntil, sealInCold, stance, casteEmphasis, granaryHygiene, leafSelectivity, satelliteAuto, hideFrass, hitchhikerEscort, externalHeap}`; `production` and `architect` removed |
| D2.17 | Brood progress | `progress` in DU (02) | `progress` 0..1 of the current stage (guidance); DU per stage from species data |
| D2.18 | Brood carrier | `pos or carrierId` (02) vs `carriedBy` (guidance) | `carriedBy` (ant id, −1 none) |
| D2.19 | Item carriers | `carrierIds[]` (02), `carriers[]` (05) vs `carriedBy` (guidance) | `carrierIds: number[]` (cooperative transport) |
| D2.20 | Item kind | `'food'\|'pellet'\|'waste'\|'corpse'\|'brood'` (02); `food-item` (02 §0.4); `aphid` (07) | canonical item kinds B3 (`food-piece`, `soil-pellet`, `live-aphid`, …); `brood` removed |
| D2.21 | Food source amount | `amount, capacity, regen/decay` (guidance); `amount (loads)` (02) | GDD 05 record `{units, unitBulk, c, p, toxin, water (per unit), pool?, poolCap?, refillPerGd?, quality, hardness, slots, drinkRateMult, stage?, stageClock?, discoveredBy, avoidBy, spawnedTick}` |
| D2.22 | Entrance sealing | `sealed: boolean` (guidance), `entrance.sealed = true` (06) | `status: 'open'\|'sealing'\|'sealed'\|'reopening'` (03); `plugVoxels` / `plugVoxelCount` → `plugVoxelCount` |
| D2.23 | Marker record | `{id, kind, pos, radius, colony, params}` (guidance); `targetChamberId?, sourceChamberId?, expiresTick?` (02); rally `mode` top-level (05) | `{id, kind, pos, radius, colony, targetChamberId, sourceChamberId, expiresTick, params: {mode?: 'defend'\|'attack', priority?}}` (−1 / null for unused) |
| D2.24 | Natural cavity kind | 03 ids `paving-joint`, `stone-gap`, `asphalt-crack`, `root-channel`, `log-hollow`, `wall-void`, `pipe-gap` | 04 ids (B4); `wall-void` removed (free space between primitives) |
| D2.25 | SpeciesDef scale | `realEstimate: [N_sim, N_real][]` (07) | `wildColonySize {typical: [min, max], max}` (codex only) |
| D2.26 | SpeciesDef derived stats | `HP_PER_SQRT_MG` 12, `BITE_PER_SQRT_MG` 2, `biteDps` (07) | `HP_PER_MG23` 10, `BITE_PER_MG23` 1.0, field `bite` (damage per 1.0 s strike); queens, gynes, males from the GDD 05 table |
| D2.27 | SpeciesDef tier | `'T1' \| 'T3'` (07) | `'T1' \| 'T2' \| 'T3'` |
| D2.28 | Species founding inputs | `shaftDepthBu`, `chamberWidthBu` (07) vs `FOUND_SHAFT_MIN_BU`, `FOUND_CHAMBER_MIN_VOXELS` (06) | `SpeciesDef.opening.dMinOpenBu`, `dMinCoverBu`, `vMinBu3`, `wMinBu` (= GDD 03 `D_MIN`, `V_MIN`, `W_MIN`), `shaftTargetBu`, plus `R0`, `clutchCap` |
| D2.29 | Thresholds in species/progression data | `growThreshold`/`matureThreshold` in `W_eq`; `REPRO_MAX_FRAC` of `N_sim` (06, 07) | in simulated workers `N` (values C11) |

### D3. Identifier unions

| # | What | Old form (chapter) | Final form |
|---|---|---|---|
| D3.1 | Region ids | `temperate-europe`, `south-us` (05) | `temperate-eu`, `southern-us` (04) |
| D3.2 | Task union | 17 J tasks | + `raid` (18) |
| D3.3 | Death causes | 02: `exposure` (adult), `poison`; 05: `predator`, `toxin`; 06: `flood`, `lifespan` | canonical list B3 (`predator`→`predation`, `toxin`→`poison`, `flood`→`drowning`, `lifespan`→`old-age`, adult `exposure` removed; + `bird`, `antlion`, `parasitoid`, `dispersed`) |
| D3.4 | Action ids | `lay` (06 opening), `plant` (06), `tear` (05) | `lay-egg` (batch mode in the opening), `plant` (added to the primitive list), no `tear` id (it is `harvest-solid`) |
| D3.5 | Codex ids | unprefixed `species-lasius-niger`, `behaviour-*`, `creature-aphid`, `habitat-<zone>`, `callow-worker` … (08, 02, 04, 05) | `cx-*` (06) with the B6 mapping and additions |
| D3.6 | Aim ids | `aim-protein`, `aim-reopen` (08) | `aim-first-protein`, `aim-nest-open` (06); union list B6 |
| D3.7 | Hint/prompt ids | `p-move`, `p-sniff`, `p-dig`, `p-reserves`, `p-seal`, `p-lay`, `p-rest`, `p-possess-worker` (06) | `hint-move`, `hint-antennate`, `hint-dig`, `hint-reserves` (new), `hint-seal`, `hint-lay`, `hint-timelapse`, `hint-cycle` (08) |
| D3.8 | Milestone ids | 03 nest-milestone kinds without `ms-` ids | `ms-depth-50`, `ms-depth-100`, `ms-chambers-10`, `ms-volume-1000`; `survived-flood` → `ms-first-flood-rescue` |
| D3.9 | History series ids | `pop.workers`, `stores.c`, `flow.in.c`, … (06) | GDD 02 kebab ids + additions (B6) |
| D3.10 | Diagnostic status | `ok\|warn\|bad` (02, 03, 08, guidance); `ok\|watch\|warn\|critical` (06); `good/fair/poor` etc. (04); `info` (07) | `ok \| info \| warn \| bad` (`watch`→`info`, `critical`→`bad`, chapter words → `label`) |
| D3.11 | Season-length options | `4 \| 7 \| 10 \| 14` (06) | `5 \| 7 \| 10` |
| D3.12 | Custom rule keys | 06 list; 08 table; 03 `collapse`; K `startSeason` | B6 list (`predators` four-level, `rivals` 0-4, `weatherSeverity` incl. `none`, + `startSeason`, `foundingLeniency`, `collapse`) |
| D3.13 | Alert kinds | 08's 27 | + `colony-starving`, `stores-full`, `nest-collapse-risk`, `entrance-breached`, `last-ants`, `garden-failing`, `granary-spoiling`, `wood-drying`; 06 auto-slow trigger ids are not ids any more |
| D3.14 | View id spelling | `possess` (08) vs `possession` (01) | `possession` |
| D3.15 | Input action ids / bindings | 08 keys (Directives B, Codex K, photo F2, roles Shift+1-4, dismiss hint Backspace) vs 01 (cycle-target B, pointer lock K, photo O, roles 5-8, possess-last Backspace) | new ids `overlay-cycle` (O), `directives` (I), `nest-overview` (U), `codex` (K); `photo-mode` F2; `pointer-lock-toggle` F8; roles 5-8; hint dismiss Shift+H |

### D4. Commands (type and payload)

| # | Old form (chapter) | Final form |
|---|---|---|
| D4.1 | `act {action, target?, secondary?, phase}` (01, 02, 05, 07); `action {actionId, target}` (08); `act {primitive}` (05) | `action {actionId, target?, secondary?, phase: 'start'\|'stop'}` (debug API keeps `__game.act()`) |
| D4.2 | `set-intent` (01) / `setIntent` (02) | `setIntent` (replay log only; live path `sim.setPlayerIntent`) |
| D4.3 | `set-trail` (01) | `setTrail {on}` |
| D4.4 | `set-speed {level}` (01); `SetSpeed {speed}` (06); game intent `setSpeed()` (08) | sim command `setSpeed {speed: 0\|1\|2\|4\|8}` |
| D4.5 | `skip-ahead` (01); `SkipToNextEvent` (06); `nextEvent()` (08) | `skipToNextEvent {}` (executed by the game loop) |
| D4.6 | `TogglePause`, `SetAutoSlow` (06) | `togglePause {}`, `setAutoSlow {mode}` |
| D4.7 | `possess {antId}` (01) vs `{antId} \| {role}` (08) | `possess {antId?: number, role?: 'forager'\|'digger'\|'nurse'\|'queen', nearPos?: Vec3}` (exactly one of `antId`/`role`; the sim resolves a role to the nearest suitable ant to `nearPos`, which the game fills with the camera target, keeping replays deterministic) |
| D4.8 | `release` without payload (08) | `release {reason}` (01) |
| D4.9 | `setDirectives {allocation?, diet?, production?, architect?, stockTarget?, stayIn?}` (02); `{…, casteRatio?, architect?}` (08); `set-directive {stance}` (05); `SetAlateInvestment`, `SetGyneShare`, `SetAlatePolicy` (06) | `setDirectives` with the D2.16 keys (all optional) |
| D4.10 | `place-marker {kind:'rally', mode, pos, radius}` (05); `placeMarker {kind, pos, radius?, chamberIds?}` (02); `{kind, pos, radius, params}` (08) | `placeMarker {kind, pos, radius?, chamberIds?, params?}` (`params.mode` for rally); `removeMarker {markerId}` (was `{id}` in 02) |
| D4.11 | `planDig {nestId, template, chamberType?, anchor, rotation, size, priority}` (08) | GDD 03 payload `{nestId, kind, chamberType?, size?, anchor: {pos, normal}, end?, bend?, length?, yawDeg?, surfacePoint?, priority, confirmWarnings}` |
| D4.12 | `setAutoExpand {on}` (08); `setDirectives.architect` (02) | `setAutoExpand {nestId, mode: 'auto'\|'suggest'\|'off'}` (03) |
| D4.13 | `OpeningSniff {point}`, `OpeningSeal {entranceId}`, `OpeningPlantFungus`, `QueenLayBatch` (06) | `action` with `actionId` `sniff`, `seal-entrance`, `plant`, `lay-egg` |
| D4.14 | `OpeningTimelapseSkip`, `OverwinterSkip` (06); `skipTimelapse` (08) | `skipTimelapse {}` |
| D4.15 | `OpeningInterruptRespond {hazardId, action \| letItPlay}` (06); `timelapseStepIn {interruptId}` (08) | `timelapseRespond {interruptId, response: 'step-in'\|'let-it-play'}` |
| D4.16 | `OpeningSkipIntro`, `OpeningBeginTimelapse`, `OpeningUndo`, `OverwinterChoice`, `FlightRelease`, `FlightPossess`, `FlightLand`, `RetireColony` (06) | `openingSkipIntro`, `openingBeginTimelapse`, `openingUndo`, `overwinterChoice {choice}`, `flightRelease`, `flightPossess {gyneId}`, `flightLand {point}`, `retireColony` |
| D4.17 | `FlightControl {move, ascend, descend}` (06) | not a command: `PlayerIntent.flight` via `setPlayerIntent` |
| D4.18 | `SetDifficulty {preset?, custom?}` (06); `setDifficulty {preset \| rules}` (08); `rules.setHumanActivity` (04) | `setDifficulty {preset?, custom?}`; human activity is `custom.humanActivity` |
| D4.19 | `LineageFoundDaughter`, `FoundAgain`, `SaveGame`, `LoadGame`, `QuickSave`, `QuickLoad`, `ExportSave`, `ImportSave`, `ExportLineage` (06) | game-level calls (`foundDaughter`, `foundAgain`, `save`, `load`, `quickSave`, `quickLoad`, `exportSave`, `importSave`, `exportLineage`), not sim commands |
| D4.20 | `designateChamber` result `command-rejected {reason}` (03); typed refusals (06) | shared event `command-rejected {commandType, reason}` |

### D5. Events (names and payloads)

| # | Old form (chapter) | Final form |
|---|---|---|
| D5.1 | `source-discovered {sourceId, byAntId}` (02); `food-source-discovered {sourceId, kind, variant, pos, colonyId?}` (05) | `food-source-discovered {sourceId, kind, variant, pos, colonyId, byAntId}` |
| D5.2 | `diag.changed {diagId, status}` (06); `diagnostic-changed {id, status, top cause}` (02) | `diagnostic-changed {id, status, topCause}` |
| D5.3 | `alate.eclosed {antId, caste}` (06) | `ant-eclosed {antId, colonyId, caste, nanitic, minim}` (02) for all castes |
| D5.4 | `ant-died {antId, cause, pos, task}` (02); `{antId, colonyId, cause, pos}` (05); `{id, cause}` (08) | `ant-died {antId, colonyId, caste, cause, pos, task}` |
| D5.5 | `ant-drowned {id, pos}` (03) | removed: `ant-died {cause: 'drowning'}`; `ant-submerged`, `brood-drowned` kept |
| D5.6 | `sound.cue {kind, pos, gain}` (04); `ambient.cue {kind}` (06); `cue {cueId}` (07) | `cue {cue: CueId, pos \| null, strength}` (guidance) |
| D5.7 | `coop-transport {phase: start\|cut\|delivered\|abandoned}` (02); `coop-transport-started/-stalled/-delivered`, `carcass-butchered` (05) | `coop-transport {itemId, carriers, bulk, phase: 'start'\|'stalled'\|'cut'\|'delivered'\|'abandoned'}` |
| D5.8 | `alarm-raised {pos, by}` (02) | `alarm-raised {colonyId, pos, strength, source}` (05) |
| D5.9 | `aphid-moved {herdFrom, herdTo, ant}` (07) | `aphid-moved {fromHerd, toHerd, antId}` (05) |
| D5.10 | `opening.readiness {depth, volume}`, `opening.sealed {entranceId}` (06) | `founding-readiness {nestId, readiness, parts: {depth, volume}}`, `founding-sealed {nestId, entranceId}` (03) |
| D5.11 | consumed `alert`, `milestone`, `observe`, `aim`, `possession`, `human-event`, `weather`, `timelapse`, `game-over`, `chunk-dirty` (08) | `alert` (kept, emitted by progression); `milestone.reached {id, tick, title}`; `codex.unlocked {id}`; `aim.opened` / `aim.completed {id}`; `possession-started` / `possession-ended`; `human.telegraph` / `human.start` / `human.end`; `weather.changed`; `opening.timelapse` / `overwinter.*`; `colony.extinct {cause, causeChain}` + `epitaph.ready`; `carve-chunks-dirty` |
| D5.12 | `trail-established` consumer "milestone first food trail" (02) | `ms-first-trail` fires on GDD 06's follower rule; `trail-established` unchanged |
| D5.13 | `ant-eclosed`, `route-learned`, `corpse-removed` codex consumers `callow-worker`, `behaviour-*` (02) | `cx-callow`, `cx-route-memory`, `cx-necrophoresis` |

### D6. Diagnostics, alerts, hints, timing units

| # | Old form (chapter) | Final form |
|---|---|---|
| D6.1 | unprefixed diagnostic ids (01 unnamed; 02, 03, 08) | `diag-` prefix on every id (B8) |
| D6.2 | record `{id, status, headline, factors[{id, label, weight, detail}], remedies[text+action]}` (06) | guidance record `{id, system, status, label, value, factors: {cause, weight, detail}[], remedies: string[] (remedy ids), sinceTick}` |
| D6.3 | `diag-queen-status` (06) + `queen-condition` (02) | `diag-queen-condition` (owner 02, with 06's orphaned rule) |
| D6.4 | `diag-nest-climate` (06) + `nest-climate` (03); `diag-flood-risk` (06) + `nest-flood` (03) | `diag-nest-climate`, `diag-nest-flood` (owner 03; 06 rules merged) |
| D6.5 | `diag-autosave` (06) + `storage` (08) | `diag-storage` (08) |
| D6.6 | `diag-at-garden` + `diag-garden` (07) | `diag-garden` |
| D6.7 | 01 "Input" and "Time speed" subjects | merged into `diag-input`, `diag-perf` (08) |
| D6.8 | auto-slow triggers `queen-attacked`, … (06) | alert kinds with levels (GDD 06 §4.5 table); auto-slow keyed on alert level and kind |
| D6.9 | `danger` alert (06 §13.4) | `last-ants` (critical) |
| D6.10 | hint learning stored "in the save" (06) | profile `hints` + `progression.hintsMirror` (08); context-prompt learning `player.promptLearned` (01) |
| D6.11 | (none; gaps G3, G4) | settings `gameplay.milestoneNotices: 'full' \| 'quiet' \| 'off'` (08 App A, UI only); `AimId` union gains `aim-second-entrance`, `aim-cross-zone`, `aim-herd`, `aim-alates`, `aim-flight`; `CodexId` gains `cx-interface-orders` |


### D7. Second pass

Kept to the unavoidable minimum: every other second-pass resolution changes design text and numbers only (E11). Old form -> final form.

| # | What | Old form (chapter) | Final form |
|---|---|---|---|
| D7.1 | Calendar helper for default-year day numbers | chapters compared raw `doy` (06 §1.7 formula `doy_scaled`; 02 used a 1-based fractional `D`) | `calendar.ts` adds `defaultYearDay(tick, cfg) → d28` (0-based float, `d × 28 / DAYS_PER_YEAR`) and `defaultYearDoy(tick, cfg) → doy28` (`floor(d28) + 1`); every day-number rule and species window is compared through them (C1) |
| D7.2 | Environment query for cavity temperature and inflow | `chamberTemp(id) = Tsoil(...)` (06 §2.5) while GDD 03 §9.1 asked for `T_top`, `T_dayMean`, `T_seasonMean`, `T_annual` and a rain intensity that 06 did not expose | `environment.query.thermalInputs(pos) → {T_top, T_dayMean, T_seasonMean, T_annual}` and `rainIntensityAt(pos) → I` added; `env.thermal` gains the two EMA arrays (per 4 BU heightfield cell and per cover primitive); `chamberTemp(id)` returns the GDD 03 §9.1 value |
| D7.3 | Brood destined caste | `destined: 'worker' \| 'gyne' \| 'male'` (02 §2.1) | `destined: Exclude<Caste, 'queen'>` (polymorphic `worker` larvae are re-destined to `minor` / `media` / `major` at larva start, GDD 07 §2.6; plus GDD 07 `destinedLengthBu`) |
| D7.4 | Lineage colony record field | `colonies[].peakWorkerEq` (06 §12.1) | `colonies[].peakWorkers` (simulated workers; K forbids `W_eq`) |

---

## E. Decision log (conflicts resolved by editing the chapters)

Rule applied throughout: the chapter that owns the topic wins; gameplay intent comes from the directions; biology from the fact-checked dossiers; directions K overrides any chapter.

### E1. Scale, units, calendar

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-1 | Per-agent weight `w`, `W_eq`, `N_sim` used for thresholds and display | 01 §3.1/F4, 06 §0.2-13, 07 §2.2-5.4 | Removed everywhere; all quantities per simulated ant | K bullets 1 and 8 |
| E-2 | Stage, milestone and alate thresholds in `W_eq` (Atta mature 300 000) | 06 §7, §8, §11; 07 | Restated in simulated workers: LN 75/700, CP 50/500, MB 50/700, AT 150/1000; milestones on N; `A*` on N; check E22 rewritten | K (thresholds reachable under the caps); values chosen so GDD 07 growth targets reach them at `matureAgeYears` |
| E-3 | `realEstimate` display mapping | 07 | Replaced by codex-only `wildColonySize` | K: population shown = simulated; codex states real sizes honestly |
| E-4 | Season-length options 4/7/10/14 | 06 vs K, 08 | 5/7/10 | K |
| E-5 | Day numbers and 7-day EMAs hard-coded | 02, 03, 04, 05, 07 | Kept as readable default-year numbers with an explicit scaling note (06 §1.7); 03 EMA "one season" | K calendar-windows bullet |
| E-6 | Moon "28-day period" text vs 2.265 GD | 06 internal | 2.265 GD | internal consistency |
| E-7 | Weekday anchor not stated | 04, 06 | Day 1 of year 1 is weekday 0, week always 7 days | K week bullet |
| E-8 | Messor/Atta windows on a 1-March dossier calendar (risk R3) | 06 vs 07 | Messor kept (doy 15-20 = late Sep-mid Nov on the equinox calendar, peak Oct); Atta start and flight windows doy 2-8 (default 5) | dossier dates (Atta Apr-Jun) on 06's equinox calendar |
| E-9 | Start season free choice starting "Day 1" vs species window | 08 vs 06 vs K | Default natural founding day (06); custom `startSeason` spring/summer/autumn starts on day 3 of that season; never winter | K start and custom-rule bullets |
| E-10 | Date format and meaning of "Day n" | 06 vs 08 | GDD 08 format, `Day n` = day of season | UI owner; 06 defines `dayOfSeason` |
| E-11 | "Game minute" used as 60 game s | 03, 06, 01 vs 08 definition | Rewritten in game seconds or game hours | ambiguity |

### E2. Movement and time control

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-12 | Founding queen sprint 10-12 BU/s vs queen 3/5 | 06 vs 07 vs K | Founding dealate 6 / 9.6 (worker cruise, player hurry); established queen 3 / 5 | K speeds; possession uses hurry |
| E-13 | Alate flight speed ~40 BU/s assumed | 01 vs 06 | 06: ascend 40, forward 80 | reproduction owner |
| E-14 | Pellet carry × 0.9 vs × 0.85 | 03 vs 01, 07 | Species `loadSpeedMult` for every carried item (Lasius 0.85) | one rule |
| E-15 | `MAX_TICKS_PER_FRAME` 8 vs 16 | 01 vs 06 | 16 with `SIM_FRAME_BUDGET_MS` 10 | 06 owns the loop |
| E-16 | Skip-ahead cap 2 game h vs 1 GD; key N vs `.` | 01 vs 06, 08 | 1 GD (24 game h), key N | owner 06 for cap, 01 for keys |
| E-17 | Opening phases allow 4x (01) vs ≤ 2x (06) | 01, 06 | ≤ 2x in `search`..`lay`, added to 01 §8 | opening owner |
| E-18 | Book screens pause (08) vs panels never pause (01) | 01 vs 08 | Book screens pause, drawers do not | UI owner |

### E3. Founding

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-19 | Two founding models: 17 P + 7 C reserves, clutch 40 × fecundity, first-brood food × 0.6 and larva × 0.85, triage (02) vs single 56-load pool, batches, 1.6 loads per larva, cannibalism below 0.1 R0 (06) | 02 §2.7, §3 vs 06 §5, 07 | 06 model everywhere; 02 §2.7 rewritten to defer; first-brood multipliers removed; `FOUND_AI_CLUTCH` 24 for AI queens | 02, 03 and 07 all name 06 the opening owner; 06 is calibrated by Monte Carlo |
| E-20 | Nanitic outcome 16-20 vs 8-16 | 02 E8 vs 06, 07 | 8-16 (mean 11.5 at Q 0.7, clutch 24) | follows E-19 |
| E-21 | Remaining reserves at hand-over undefined for 02's queen state | 02 vs 06 | R split equally into `reserve` (C) and `reserveP` (P) | needed by the queen model after founding |
| E-22 | Readiness: shaft 6 BU, 60 voxels, 1.5 BU shaft (06) vs D_MIN 8 / 5 BU, V_MIN 10 BU³, width 3.5 BU, shaft 2.5 BU (03) | 06 §5.8, E17; 07 | 03 values; 06 table and check E17 rewritten; 07 founding block | 03 owns dig geometry (06 F1, 03 F6); a 2.1 BU queen needs the 2.5 BU shaft |
| E-23 | Queen bite `3.0 + 0.15 × depth` s vs 1.3 s | 06 vs 03 | 03: `DIG_BITE_S` 1.0 / digPower 0.77 ≈ 1.3 s | dig owner |
| E-24 | Dig cost 0.0004 of reserves vs 0.02 loads per bite | 03 vs 06 | 0.02 loads (≈ 0.04 % of R0, same order) | reserve owner |
| E-25 | Seal: hold 6 s / 4 pellets vs `seal-entrance` 2 s × ~3 | 06 vs 01, 03 | Hold repeats `seal-entrance` until `sealed` (≈ 6 s, ~3 pellets) | primitives are the only world-changing code (guidance §5) |
| E-26 | Opening `lay` (6 eggs / 4 s) vs `lay-egg` (1 egg / 6 s, cooldown 10 s) | 06 vs 01 | `lay-egg` lays a 6-egg batch while the opening phase is `lay`; normal play unchanged | keeps the opening pace and one primitive |
| E-27 | Founding bird threat 1.2 s strike vs 3.0 s bird telegraph | 06 vs 05 | founding variant of the 05 bird event: 3.0 s approach shadow, 1.2 s strike | telegraph framework of 05 |

### E4. Colony economy and brood

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-28 | Lasius gyne food × 6 / male × 1.4 vs × 12 / × 2 of 1.6 loads | 02 vs 06, 07 (R5) | 06 values in 02 | reproduction owner; matches the mass rule |
| E-29 | Camponotus sexual cost 28 / 4.6 × 1.6 vs 8.0 / 1.3 × media cost | 06 vs 07 (R4) | 8.0 / 1.3 × media cost | dossier units were minor-relative (biology fix) |
| E-30 | Alate store gate 14 GD vs stock target 3 GD | 06 vs 02 | `REPRO_STORE_DAYS_C/P` 3 / 1.5 (stop at half) | 14 GD was unreachable (economy budget C13) |
| E-31 | `harvest-liquid` 0.05 vs `DRINK_RATE` 0.03 load/s | 01, 05 vs 02 | 0.05 | primitive owner; GDD 01 E7 |
| E-32 | Tend solicit 0.02 vs 0.025 load/s | 02 vs 05, 07 | 0.025 (0.15 per 6 s) | ecology owner of droplets |
| E-33 | `CROP_RETURN_FRACTION` 0.5 vs 0.8 | 01 vs 02 | Two constants: 01 `RESUME_CROP_FRACTION` 0.5 (release rule), 02 `CROP_RETURN_FRACTION` 0.8 (AI) — **superseded by E-115** (one threshold) | different decisions shared one name |
| E-34 | `RESUME_LOCALITY_BONUS` 0.3 vs 0.25 | 02 vs 01 | 0.25 | owner 01 |
| E-35 | `dig-bite` default 3 s vs 1 s | 02 vs 01, 03 | 1.0 s × factors (03) | dig owner |
| E-36 | Brood capacity 1.5 per BU² floor; piles 0.4 / 0.2 loads per BU² vs 03 capacities per BU³ | 02 vs 03 | 03 chamber capacities | chamber owner |
| E-37 | Cooperative transport: `CUT_TIME_S` 20 s, give-up 120 s, grips `2 + ceil(2b)` vs `TEAR_S` × hardness, 30 s stall, helper slots | 02 vs 05, 01 | 05 owns item physics, butcher rule and slots, 01 `TEAR_S`; 02 owns AI behaviour; one `coop-transport` event | item owner |
| E-38 | Cooperative drag T1 vs T2 | 05 vs 01, 02 | T2 | majority and seed (cooperative transport is a T2 feature) |
| E-39 | T1 food set (honeydew T1 in 04; crumb/sugar T2 in 02; nectar T2 / fruit T1 in 07) | 02, 04, 05, 07 | T1: static flowers (nectar), sugar granules + one spill, `crumb-starch`, `crumb-protein`, insect carcasses; honeydew sites placed in T1 but herds T2; fruit T2 | food owner 05 |
| E-40 | T1 colony cannot grow past about 50 workers (no prey patches; carrion only ≈ 3 P/gd) | economy gap (05 vs 02 needs) | `T1_CARRION_MULT` 4 and T1 `crumb-protein` placement | budget C13 |
| E-41 | Human-event pheromone multipliers differ (sweeping zero all, mowing 0.8) | 02 vs 04 | 04 §15.4 table, alarm takes the trail value; 02 check E11 uses `vacuum` | human-event owner (04 F8, 02 F7) |
| E-42 | Nutrient composition table vs per-variant values | 02 vs 05 | 05 per variant authoritative; 02 table = defaults | source owner |
| E-43 | Lasius development curve (0 at 36 °C vs 38 °C) | 07 vs 02, 06 | 02 `r(T)`; 06 law capped the same way | 07 says 02 is authoritative |
| E-44 | Drowning 0.03 health/s (04, 06) vs 50 s grace then 1 %/s (03) | 03, 04, 06 | one rule: 03's | consistent surface and nest; closer to biology (04 V5) |
| E-45 | Death-cause strings differ (`predator`/`predation`, `toxin`/`poison`, `flood`, `lifespan`, adult `exposure`) | 02, 05, 06 | canonical list B3 | 06 owns the list (02, 05 defer to it) |

### E5. Combat and creatures

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-46 | maxHp `12 √mg` and bite dps `2 √mg` (Lasius worker 12 HP, 2.0) vs `10 mg^(2/3)`, bite `mg^(2/3)` per 1 s (10 HP, 1.0) | 07 vs 05 | 05 formulas and table; 07 tables patched for Lasius, superseded for others | combat owner |
| E-47 | `health` 0..1 field vs `hp`/`maxHp` | 02, 05, 06 vs guidance | `hp`/`maxHp`; health = fraction | binding contracts guidance |
| E-48 | Alarm pheromone half-life ~60 s vs 15 s | 05 vs 02 | 15 s | pheromone owner |

### E6. Nest and world

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-49 | Lasius template (entrances 1 + 1/400 up to 4, royal at N ≥ 30, ratio rules, dig speeds) | 07 vs 03 | 03 template (3 entrances, 4 from 800; royal at 8 workers; need-driven chambers; 03 dig speeds) | 03 owns the LN template (03 F8) |
| E-50 | Atta footprint 400 / 600-900 BU | 03, 07 vs K | ≤ 150 BU from the first entrance | K space bullet |
| E-51 | Atta fungus chamber max 24 BU vs 25-35 BU | 03 vs 07 | 07 sizes (L 30 × 12 × 30) | 07 owns T3 templates (03 F8) |
| E-52 | Natural cavity kind ids differ; `wall-void` as carve cavity | 03 vs 04, K | 04 ids + `abandoned-burrow`; wall voids are free space between primitives | worldgen writes them; K two-passage bullet |
| E-53 | Entrance kind "others `main`"; nest roles parent/satellite | 07 vs 03 | 03 entrance kinds; parent = nest kind `main` | nest owner |
| E-54 | Pile primitive API assumed but undefined | 07, 02 vs 03 | 03 spoil-heap structure is the generic pile (material = dumped item kind) | gap filled by the owner |
| E-55 | `DIG_REL` proposal vs `digSpeed` | 04 vs 03 | 03 `digSpeed` only | dig owner |
| E-56 | Rival spacing 150 / 350 / 600 BU, start distance, incipient counts 0/1/2 vs 1/2/3 and 60-200 BU from Good sites | 03, 04, 05 | established ≥ 600 apart, ≥ 800 from start (04); incipients 1/2/3 (05) at 300-800 BU from start (04); any nests ≥ 150 apart (03) | sites owned by 04, counts by 05 |
| E-57 | Region ids `temperate-europe`, `south-us` | 05 vs 04 | 04 ids, with region → climate mapping | worldgen owner |
| E-58 | Worldgen attempts 5 vs 8 | 08 vs 01, 04 | 8 | worldgen owner |
| E-59 | `grassHeightMm` as `Uint8Array` but values to 300; shade and flood stored as bytes but used as 0..1 | 04 internal | `Uint16Array` mm; bytes 0..255 = 0..1 | internal consistency |
| E-60 | Rival new-foundation window "temperate days 9-12" vs flight window 9-13 | 05 vs 06 | species flight window of 06 | reproduction owner |

### E7. Difficulty and rules

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-61 | Preset knobs differ (rivalCount 1 / 2-4 / 3-5; rivalAggressionMult 0.6/1/1.5; raid interval; `humanWarningLeadS` 5/3/2; bait and pesticide per season; foodAbundance harsh 0.8; `possessedHealthMult`) | 06 vs 04, 05, 08 | 04/05 values copied into 06 §14 (2/3/4; `rivalAggMult` 0.7/1/1.2; `raidCooldownGd` 4/2/1; `HUMAN_TELEGRAPH_MULT` 1.5/1/0.75; `BAIT_ENABLED`; 0.75; `damageTakenMult` 0.75/1/1); pesticide event dropped (not a J human event) | 06 §14 itself says tuning is owned by those chapters |
| E-62 | Custom rules differ (predators on/off + density vs Off/Few/Normal/Many; rivals 0-5; weather none missing in UI; `collapse`, `startSeason`, `foundingLeniency` missing in 06) | 06 vs 05, 08, 03, K | union in 06 §14.1 and 08 §3.7 (B6 list) | seed custom toggles + K |
| E-63 | `rules.setHumanActivity` command | 04 vs 06 | through `setDifficulty {custom}` | one rules command |

### E8. Commands, events, ids

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-64 | Command naming kebab (01, 05), PascalCase (06), camelCase (02, 03, 08); `act` vs `action` | all | camelCase; `action` | contracts guidance list |
| E-65 | Directive surface: `production` modes vs `SetAlateInvestment`; `architect` directive vs `setAutoExpand`; `casteRatio` vs `casteEmphasis`; `set-directive {stance}`; seal-in-cold toggle without a field | 02, 03, 05, 06, 07, 08 | one `setDirectives` (D2.16); architect via `setAutoExpand {nestId, mode}`; `sealInCold` directive | one priorities channel (seed queen commands layer a) |
| E-66 | Per-task sliders (07: `tend`, `cut`, `garden`, `mill` sliders) vs four group sliders | 07 vs 02, 08 | four groups; species `directiveTasks` are in-group sub-shares (`taskShares`) | keep the T1 panel and species depth |
| E-67 | Marker radii 8-64 (24) vs 10-80 (30); rally "Gather" vs `attack`; caps undefined | 08 vs 02, 05 | 02 radii and `MARKER_CAP`; rally modes defend/attack | markers owner 02, combat owner 05 |
| E-68 | `possess` with role (08) vs antId only (01); `release` payload | 01 vs 08 | `possess {antId \| role}`, sim resolves role; `release {reason}` | both needs, deterministic |
| E-69 | `planDig` payload (template/rotation) and `setAutoExpand {on}` | 08 vs 03 | 03 payloads | nest owner |
| E-70 | Time-lapse step-in/skip commands differ | 06 vs 08 | `skipTimelapse`, `timelapseRespond` | one pair for both lapses |
| E-71 | `setSpeed` game intent vs sim command | 08 vs 01, 06 | sim command (persisted `state.time`, validated) | 01/06 own speed rules |
| E-72 | Events consumed by 08 that no chapter emits (`milestone`, `observe`, `aim`, `possession`, `human-event`, `weather`, `timelapse`, `game-over`, `chunk-dirty`) | 08 vs 01, 03, 04, 06 | mapped to the producers' events (D5.11) | producers own their events |
| E-73 | Duplicate events (`source-discovered`, `diag.changed`, `alate.eclosed`, `ant-drowned`, `sound.cue`/`ambient.cue`, `coop-transport-*`, `opening.readiness`/`opening.sealed`) and differing payloads (`ant-died`, `alarm-raised`, `aphid-moved`) | 02, 03, 04, 05, 06, 07 | one event each (D5) | avoid double emission |
| E-74 | Diagnostic id prefix: unprefixed (02, 03, 08) vs `diag-` (04-07) | all | `diag-` everywhere | 06 owns the scheme; 02 pre-agreed |
| E-75 | Diagnostic status words and record shape | 04, 06, 07 vs guidance | `ok/info/warn/bad`; guidance record | binding guidance |
| E-76 | Overlapping diagnostics (queen status/condition, nest climate, flood risk, autosave/storage, at-garden/garden, 01 input/time speed) | 01-08 | merged (D6.3-D6.7) | one subject, one record |
| E-77 | GDD 01 diagnostics had no ids | 01 | `diag-possessed-movement`, `-possessed-action`, `-possession-availability`, `-released-ant` | contracts need ids |
| E-78 | Alert kinds raised by 02, 03, 06, 07 missing from 08's catalogue | 02, 03, 06, 07 vs 08 | 8 kinds added to 08 §6.5 | 08 owns the catalogue |
| E-79 | Auto-slow triggers (06 ids) vs alert-level auto-slow (08) | 06 vs 08 | triggers are alert kinds with levels | one mechanism |
| E-80 | Codex ids `cx-*` vs `species-*`/`behaviour-*`/`creature-*` | 06 vs 02, 04, 05, 08 | `cx-*` with mapping and additions | 06 owns codex content |
| E-81 | Aim ids differ (`aim-protein`/`aim-first-protein`, `aim-reopen`/`aim-nest-open`); two aim lists | 06 vs 08 | union, 06 names | owner 06 for post-hand-over, 08 for onboarding |
| E-82 | Opening prompts `p-*` vs hints `hint-*` | 06 vs 08 | `hint-*` (+ `hint-reserves`) | onboarding owner 08 |
| E-83 | Two device stores (lineage, codex with `promptsLearned`) vs one profile | 06 vs 08 | one profile store, 06 record shapes | architecture §7 + UI owner |
| E-84 | Save slots and autosave generations | 06 vs 08 | `auto` ring of 3 labelled generations, `quick`, `slot-1..5`, hidden `opening-start`; F5 writes `quick` | seed (autosave + 5 slots) |
| E-85 | History hourly ring 48 vs 168; two series id sets; `stats` vs `history` | 02, 06, 08 | `progression.history`, ring 168, 02 ids + additions | 08 needs 7 days |
| E-86 | Item kind ids (`food-item`/`food`, `pellet`, `brood` as item; `aphid`) | 02, 07 vs 01, 03, 05 | canonical item kinds B3 | majority and guidance (brood is an entity) |
| E-87 | 17-length task arrays vs new task `raid` | 02 vs 05 | `TASK_COUNT` 18 | additive union |
| E-88 | Site assessment "six factors" vs seven | 08 vs 06 | seven (06 §5.7) | owner 06 |
| E-89 | Dig plan statuses missing `paused`/`cancelled`; S/M/L as widths | 08 vs 03 | 03 statuses; S/M/L long axis from the template | nest owner (03 F9) |
| E-90 | Nest milestones without `ms-` ids | 03 vs 06 | four `ms-*` rows added to 06 §8 | milestone owner 06 |
| E-91 | Duplicate founding events (06 `opening.readiness`/`opening.sealed` vs 03 `founding-*`) | 03, 06 | 03 events | dig owner |

### E9. Controls, camera, UI

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-92 | Key collisions: role keys 5-8 vs Shift+1-4; Directives B vs `cycle-target` B; Codex K vs pointer lock K; photo O vs overlay O; Backspace possess-last vs hint dismiss | 01 vs 08 | roles 5-8; Directives I; Codex K, pointer lock F8; photo F2, overlay cycle O; hint dismiss Shift+H | 01 owns input ids; 08's visible features keep mnemonic keys |
| E-93 | Colony view: rotate 45° steps / zoom 30-600 vs 90°/s / 30-1500; cutaway keys [ ] vs R/F | 08 vs 01 | 01 rig; R/F primary, [ ] and PgUp/PgDn secondary | camera owner |
| E-94 | Photo mode radius 120 vs 400 BU, speed, focus, EV, filename | 01 vs 08 | 08 §7.9 | photo UI owner |
| E-95 | Possession FOV setting 50-90° vs per-state FOV + `fovOffset` | 08 vs 01 | `fovOffset` −10..+20° | camera owner |
| E-96 | Codex screen tier T3 vs T2 shell | 01 vs 08, 06 | T2 shell, T3 breadth | UI owner, seed |
| E-97 | Camponotus minor `carryCap` 0.8 vs 0.5 | 01 vs 07 | 0.5 | species owner (01 defers) |
| E-98 | Directives "Seal entrances in cold weather (if the nest chapter provides it)" | 08 vs 03 | provided (03 §4.2 winter auto-seal) as `sealInCold` | gap closed |
| E-99 | "Locomotion chapter" and other non-existent chapters named as owners | 01-08 | ownership map A2 | gap |

### E10. Traceability gap closure (brief-to-design audit, `traceability.md` §5)

| # | Gap | Chapters | Decision | Why |
|---|---|---|---|---|
| E-100 | G1: no link from the queen to colony orders | 01, 02, 08 | Queen possessed after hand-over: context line "I  Colony orders" and panel button "Colony orders (I)"; queen inspect card button "Colony orders"; Directives stays reachable from any view; `hint-directives` triggers on first queen possession (fallback 3 GD) and shows I (the stale `[B]` fixed); GDD 08 App E check 26 | brief §1-3, directions A; pillar 3 kept |
| E-101 | G2: orders-as-abstraction not said in play | 02, 06, 08 | GDD 02 D10; codex `cx-interface-orders` "Orders without a commander" (57th row of GDD 06 §10, unlocks on first `setDirectives` or `placeMarker`); Directives title tooltip links to it | brief §3, [S3] Gordon 2007 |
| E-102 | G3: no quiet-time target or unattended mode | 05, 01, 08 | Invariant I11 `QUIET_SHARE_MIN` 0.75 / 0.60 / 0.40 over 3-GD windows of daytime hours outside founding and winter, enforced by the threat director; soak check GDD 05 E25; T3 ambient watch (GDD 01 §6.6); setting `milestoneNotices`; HUD hidden shows only `critical` alerts (GDD 08 §3.4, §6.3) | seed pillar 6, brief §5 |
| E-103 | G4: aims stop after the founding weeks | 06, 08 | Five continuing aims `aim-second-entrance`, `aim-cross-zone`, `aim-herd` (Lasius, T2), `aim-alates`, `aim-flight`, each tied to an existing milestone; never-open-if-done rule; max 3 shown | brief §5 |
| E-104 | G5: performance contract only in the seed | 08, index | "Performance contract" paragraph in GDD 08 §0 and §A; `SIM_FRAME_BUDGET_MS` and `diag-perf` threshold added to C2 | seed §1 binding |
| E-105 | G6: animation approach unstated | 08 | GDD 08 §11.9: procedural, vertex-shader, no authored clips; `pose.*` are blend targets; render never writes sim state | seed §4 |
| E-106 | G7: release order of T3 species unstated | 07, 08, index | Lasius, then Camponotus, Messor, Atta (one economy module each), data-only variants after; adjustable; unreleased cards "Not yet available" | brief §3 open item |
| E-107 | G8: conflict wording reads as human institutions | 08, 06, 05 | Display words Neutral / Wary / Clashing / Territorial dispute / Lull (ids unchanged); "overcome", "opponent"; `cx-pavement-wars` titled "Boundary disputes on the slabs"; `cx-formica` note and the epitaph figure reworded; `ms-first-rival-defeated` display title was already "A rival repelled" (kept) | brief §1 |
| E-108 | G9: `playground_distant` carries audible voices | 08 | Synth murmur is the default; Distant voices is opt-in and hidden until the file passes a two-reviewer intelligibility check after a 900 Hz low-pass (asset checklist §13.7); §11.8 forbids discernible speech in beds | brief §1, GDD 08 §11.8 |
| E-109 | G10: T1 Lasius has no honeydew at all | 05, 07, 02 | `T1_HONEYDEW_SITES` static `honeydew-film` sites (1 per 250 plots, refill 1.0 C/gd, not placed at T2); herds stay T2; `ms-first-honeydew` / `cx-honeydew` satisfiable by a T1 find | brief §3; small addition inside the C13 T1 band |
| E-110 | G11: "people's homes" breadth | 04 | Kitchen-and-utility slice declared the launch representation by design; T3 stretch second room variant `pantry` or `conservatory` | brief §2, §6 |

### E11. Second consistency pass (residual conflicts from the regenerated digests)

| # | Conflict | Chapters | Decision | Why |
|---|---|---|---|---|
| E-111 | Photo mode bound to O in GDD 01 §1.3, §2, §5.5 but F2 in §5.1/§6.9; O is also `overlay-cycle` | 01 | F2 everywhere (enter and exit), Ph exit F2/Esc; O stays `overlay-cycle` (P, O, C) | E-92 binding; 01 owns input |
| E-112 | Global (`G`) keys H, − =, Enter collide with `ph-guides`, `ph-exposure`, `ph-capture` in photo mode | 01 | In `Ph` only `menu`, `photo-mode`, `pointer-lock-toggle` of the G actions are live (01 §5.7) | sim frozen, HUD hidden in photo mode |
| E-113 | GDD 08 colony view binds F to focus selection (01: F = `cv-slice-down`); dig-planner Q/E and Shift+Wheel override `cv-rotate` / slice although 01 App F 16 reserves them | 01, 08 | 08 F-focus removed; the dig-planner override is a declared exception in 01 App F 16 | 01 owns colony-view keys; 08 owns the tool |
| E-114 | GDD 08 §5 gamepad column contradicts GDD 01 §5 for 13 actions; alert-feed hold View collides with `colony-view`; hint dismiss hold Y collides with `inspect` hold (sniff); 08 §9.1 still dismisses hints with Backspace (`possess-last`) | 01, 08 | 08 gamepad column = 01; alert feed LB+View; hint dismiss Shift+H / RB+View everywhere in 08 | 01 owns every input id and default binding |
| E-115 | Crop thresholds: `RESUME_CROP_FRACTION` 0.5 (01 release) and `CROP_RETURN_FRACTION` 0.8 (02 AI) for the same "go home with the crop" decision | 01, 02 | One threshold `CROP_RETURN_FRACTION` 0.8 (02); 01 release rule 7 mirrors 02 `forage.collect` (≥ 0.8, or ≥ 0.1 with the source empty); `RESUME_CROP_FRACTION` removed (supersedes E-33) | "same primitives and rules as the AI" (seed pillar 1) |
| E-116 | GDD 01 App A table still in seconds and booleans with a patch note below it | 01 | Table rewritten in the frozen forms (flag bits, ticks, absolute-tick cooldowns, speed 1/2/4/8); lay cooldown stated as possessed-queen only | D2.8, D2.10, D2.11; two readers, one form |
| E-117 | `EGG_CLUMP_MAX` 5 vs opening batch `OPEN_LAY_BATCH_EGGS` 6 | 01, 06 | `EGG_CLUMP_MAX` 6: one laid batch is one carried clump | removes a split clump with no design reason |
| E-118 | `dig-bite` duration "1.0 × material factor" (01) vs `1.0 / (digSpeed × digPower × workRate)` (03); C6 formula without `digSpeed` | 01, 03, index | 03 formula in 01 and C6 | dig owner 03 |
| E-119 | Atta "minim" and "small media" used like caste ids | 01, 07 | minim = J caste `minor`; small media = `media` + size class `small-media` (01 §0) | J caste list |
| E-120 | GDD 07 §2.7: sprint is the player's hurry (Lasius 12); K: hurry ≈ 9.6, 12 = alarm running | 07, 01 | sprint = alarm/flee run (`RUN_SPEED`); hurry = cruise × 1.6, never above sprint | K speeds |
| E-121 | Dig-rate table `DIG_REL` (04 §3: humus 1.2, clay 0.4, gravel 0.25, wood-decayed 0.6) vs `digSpeed` (03 §2.1: 1.3, 0.45, 0.35, × LN 0.5) | 03, 04 | `DIG_REL` withdrawn; 04 column = verbatim copy of 03 `digSpeed` (and wood rows); `fDig` uses `digSpeed × speciesMult` | 03 owns dig rates (E-55 completed) |
| E-122 | `DIG_FLOOR_BU` notes ("Atta depth cap 400-500") vs nest `maxDepth` | 03, 04, 07 | Bedrock always below template `maxDepth` LN 175, MB 285, AT 450 | nest owner 03 / species 07 |
| E-123 | 1-based fractional `D` (02) vs 0-based `d` (06); `fSeason` and `DIAPAUSE_DOY` not scaled with season length; "Summer day 9/10" in a 7-day season | 02, 06, index | One convention in C1 (1-based integer `doy`, 0-based `d`, default-year `d28`/`doy28`); 02 `fSeason` rewritten on `d28` (0.3 to 1, ramp 1-4, 1.0 to 14, 0.6 to 17, 0.2 to 20, 0 to 28); diapause on `doy28`; examples "doy 9 = Summer · Day 2", "doy 10 = Summer · Day 3" | K calendar-window bullet; owner 06 (D7.1) |
| E-124 | GDD 06 hard-codes notice doy 20, banner doy 22, 168 winter steps, readiness doy ≥ 15, `ms-year-1/5` at 28/140, `L(d)` over 28 | 06 | Season-relative rules (autumn day `DAYS_PER_SEASON − 1`, winter day 1), `24 × DAYS_PER_SEASON` steps, `season == autumn`, `DAYS_PER_YEAR` and `5 × DAYS_PER_YEAR`, `L` over `DAYS_PER_YEAR`; §1.7 states the conversion for all chapters | K: nothing hard-codes 7 or 28 |
| E-125 | GDD 05 day numbers (herd cycle, host decline, flowers, migrants) without a scaling rule; winter rival stores "× 7" | 05 | §0 day-number rule (default-year, scaled via C1); "× `DAYS_PER_SEASON`"; soak = one year | K |
| E-126 | GDD 08 "7 day segments", "last 28 days", "6 of 7 days", App F 13 conditional | 08 | Segments = `DAYS_PER_SEASON`, graph range = last year, alert text parameterised; App F 13 binding | K |
| E-127 | GDD 07 validation `[0, 28)` and standard-worker mean exactly 1.0 BU while CP media 1.1 / MB media 1.05 | 07 | Validation on `d28`; standard worker 1.0 ± 0.1 BU | otherwise the loader rejects its own data |
| E-128 | "Game week = 3 GD" for human cadence (06 D2) vs K's 7-GD week | 04, 06 | Only the 7-GD weekday cycle is a week; chores are per-GD frequencies (mowing, vacuum 1 per 3 GD) | K week bullet |
| E-129 | `thresholds` Float32[17] in GDD 02 §1.1 | 02 | `Float32Array(TASK_COUNT = 18)` | E-87 |
| E-130 | GDD 02 §1.1 and App A field names (`colonyId`, `health`, `crop {C,P}`, `reserve`, `scale`, `stateT`, `speciesId`, `stores {C,P}`, `gut {C,P}`) vs D2 | 02 | Tables written in the frozen D2 forms; prose keeps the readable words with a mapping note | D2.1-D2.15 |
| E-131 | GDD 02 cross-references to "10.6" (job board) and "10.2 F3" (does not exist) | 02 | 10.4 job board; 10.2 `forage.search` spiral | internal |
| E-132 | Founding hand-over: 06 "keeps her reserves" vs 02 split into `reserve`/`reserveP` above `QUEEN_FAT_CAP` 3.0; banner hint `p-possess-worker` | 02, 06 | 06 §5.13 states the split and that the cap limits only refilling; hint `hint-cycle` | E-21; D3.7 |
| E-133 | `aim-alates` opens only inside the lay window yet shows "Out of season" outside it | 06 | Opens at stage `mature` in any season; "Out of season" hint outside the window | internal |
| E-134 | Directive keys `taskShares`, `sealInCold`, `stance`, `casteEmphasis`, species extras, `gyneShare`, `alatePolicy` only in App A/B of 02; 08 Directives has no controls for `stockTarget`, `stayIn`, `stance`, species extras; 08 App F 3 "production modes" | 02, 08 | 02 §12.1 lists every key with its owner; 08 §4.2 adds "Stores and safety" (T2) and "Species" (T3) rows; App F 3 rewritten | D2.16 single `setDirectives` |
| E-135 | Stance and rally modes cited as GDD 05 §3.7 (escalation) instead of §4.9 | 02, 08, index | §4.9 | section numbering |
| E-136 | Weather §3.2: storm entry "from rain, overcast, heat" vs `clear → storm` weights; frost entry "from clear/overcast" vs winter `rain → frost` .05; shoulder heat "× 0.3" vs 0 weights; heat dwell cap "3 × mean (heat 96)" vs 3 × 54 | 06 | Storm may start from `clear` (convective); frost from `rain`; spring/autumn `clear → heat` = 0.3 × summer weight (0.08) behind the `heatSeasonalMinC` guard; heat dwell cap 96 h in every season; MC-tuned tables unchanged | keeps the 300-year calibration (closes risk F7) |
| E-137 | Two cavity temperature models (06 `chamberTemp = Tsoil`, 03 §9.1 thermal column) and 03 inputs (EMAs, `T_annual`) that 06 did not expose | 03, 06 | 03 §9.1 is the only cavity model; 06 supplies `thermalInputs` (EMA τ 1 GD and `DAYS_PER_SEASON`; `T_annual = Tann + 1.0`); `Tsoil` for open ground only | 03 owns nest microclimate; D7.2 |
| E-138 | Entrance inflow intensity: 03 "drizzle 0.1, rain 0.4, storm 1.0, sprinkler 0.5" vs 06's three rain classes | 03, 06 | `rainIntensityAt`: drizzle 0.1, shower 0.4, downpour 0.7, storm 1.0, sprinkler/hose 0.5 | one mapping (D7.2) |
| E-139 | Watering washes "as rain of the matching class" with no class rule | 02, 04, 06 | < 3 mm/h drizzle, 3-12 shower, ≥ 12 downpour (sprinkler, hose, can wash as downpour inside the wetted area) | definition gap |
| E-140 | GDD 03 App F: Environment, Opening and Difficulty all "06"; locomotion and markers owners unnamed; garbled catchment text; `MARKER_CAP.dig` "should equal" | 03 | Owners named (GDD 06 owns all three; locomotion per A2; markers GDD 02 §12.2); catchment × `CRUST_RUNOFF` text; `MARKER_CAP.dig` = `PLAN_CAP_PLAYER` = 8 (also in 08's limit text) | A2 |
| E-141 | Generic pile: chaff midden 8-20 BU from an entrance would merge into the soil mound (`HEAP_MERGE_DIST` 30) | 03, 07, 02 | Merging only between piles of the same material; item piles count to `HEAP_CAP`, mounds do not | keeps GDD 07 middens and GDD 02's midden |
| E-142 | GDD 03 cites overflow spoilage × 1.5 and submerged × 2 to the economy chapter, which did not define them | 02, 03 | `SPOIL_OVERFLOW_MULT` 1.5, `SPOIL_SUBMERGED_MULT` 2.0 in 02 §5.1 | economy owner |
| E-143 | Atta fungus chambers: 03 D6 "12-24 BU", depth 30-300, climate 24-28 °C / RH ≥ 0.9 vs 07 25-35 BU, 40-400 BU, 21-25 °C / RH ≥ 0.8 (and 06 Topt 21-25) | 03, 07 | 07 values in 03 (deviation text, depth band, ranking curve) | 07 owns T3 templates and the fungus module (E-51) |
| E-144 | Granary: 03 capacity 3.0 seed loads/BU³ vs 07 2.0 and "1,600 per 16 × 6 × 16"; 03 template 16 × 3.5 × 16 vs 07 4-6 BU high; architect target 25 GD below the 30-GD alate gate | 03, 07, index | 2.0 everywhere; template 10×4×12 / 13×5×14 / 16×6×16; `GRANARY_TARGET_GD` 36 | 07 module owner; gate must be reachable |
| E-145 | GDD 07 HP and bite columns do not match its own formula (superseded note) and GDD 05 §4.1 masses differ from 07's (LN queen 20/33, MB major 20, AT 0.9/5.3/40) | 05, 07 | 07 worker-caste columns = formula on 07 masses = 05 table; 05 masses = 07; nanitic and small-media rows added; T3 reproductives keep 07 values; column "Bite (dmg per strike)" | 05 owns combat formula, 07 owns masses (closes risk F9) |
| E-146 | Alate upkeep LN male 0.08 / CP 0.5×queen, 0.2 / AT 0.2, 0.1 (06) vs 0.06 / 0.15, 0.10 / 0.2, 0.15 (07) | 06, 07 | 07 values copied into 06 §11.2 | 07 caste tables own adult upkeep |
| E-147 | Egg-to-alate durations 1.3 × worker (06) vs 02 stage multipliers and 07 `devMult` | 02, 06, 07 | 02 multipliers (Lasius) and 07 `devMult` (T3) copied into 06 §11.2 | brood owner 02, species 07 |
| E-148 | Time-lapse interrupt: 06 drops to 1x and hands control back for 20 game s; 08 shows Step in for 10 real s and keeps the lapse running; winter shows Step in although it is pre-computed; three skip bindings (06 Space/Esc, 08 hold Enter 600 ms, 01 hold Space 1 s) | 01, 06, 08 | One flow: drop to 1x, Step in / Let it play for `OPEN_INTERRUPT_WINDOW_S` 20 (= `TIMELAPSE_INTERRUPT_REAL_S`); no interrupts in winter; skip = 01 `tl-skip` | 06 owns mechanics, 08 presentation, 01 keys |
| E-149 | GDD 08 App F: statuses ok/warn/bad, radii 8-64, plan statuses without paused/cancelled, `auto` 2 generations; loading text "attempt 2 of 5"; epitaph "Founded Summer · Day 1"; first-workers example 4 | 08 | ok/info/warn/bad; 10-80 / 8-32; seven statuses; 3 generations + `quick`; "attempt n of 8"; Summer · Day 3; 11 | D3.10, E-67, E-84, E-58, 06 §1.6 |
| E-150 | Camponotus `satellite` marker has a cap but no tool in the palette | 08 | Eighth tool `satellite` (Shift+8) | marker kinds B1 |
| E-151 | Stale ids: `diag-at-garden` (07), `toxinPool` (05), `peakWorkerEq` (06), cull as `bite` (05 §1.4) vs `cull-aphid` (App B); 01 catalogue silent on `dodge`, `cull-aphid`, `drum`, `cut-seed-head`, `process-leaf`, `plant` | 01, 05, 06, 07 | `diag-garden`, `stores.toxin`, `peakWorkers` (D7.4), `cull-aphid`; 01 §7.3 lists the other chapters' primitives and the `dodge` input | D6.6, D1.17, K, B2 |
| E-152 | Corpse bulk "mass/2 mg"; ladybird cap "1 per 300, max 8" vs I4 "1 per 300 + 1" | 05 | bulk = massMg / `REF_CARRY_MG`; I4 = min(8, floor(A / 300)) | units; internal |
| E-153 | GDD 04: `crumb-protein` called a food kind; rival agents not budgeted; puddle cap cited to 13.3; `VESSEL_FILL_MAX` undefined | 04 | variant of `crumb`; rivals and incipients inside `RIVAL_AGENT_BUDGET` (K 2500); §13.4; 0.8 × inner depth | J; K; internal |
| E-154 | Locomotion: 02 names a "locomotion" owner for cruise and load factor; A2/01/03 cite 02 §1.4 (energy) for AI speed | 01, 02, 03, index | AI speed composition 02 §1.6; species speeds and `loadSpeedMult` GDD 07; walker 01 §4 / 04 §3 / 03 §5 | A2 (closes the digest note) |
| E-155 | GDD 06 App A in pre-D1 placement (`calendar`, `weather`, `opening`, `journal.aims {open, done}`, root `difficulty`, hourly ring 48) | 06 | Placement note (D1.1-D1.14); `progression.aims` record; `config.difficulty` + `progression.difficultyHistory`; ring 168 | D1.10-D1.12, E-85 |
| E-156 | Opening threat cap named `OPEN_THREATS_MAX` (5.6) and `openingThreatsMax` (§14) | 06 | `diff.openingThreatsMax` | one name |
| E-157 | 8x refusal toast differs (01 vs 06); `speed-refused` reason unspecified in 01 §5.8 | 01, 06 | 01 text in both; `speed-refused {level: 8, reason: 'possession'}` | 01 owns the rule's UI line |
| E-158 | Lasius start window doy 8-12 begins before the flight window 9-13; "Eclosion spring doy 7-11" (8-11 are summer) | 06, 07, index | Start window doy 9-12 (default 10 unchanged); eclosion "doy 7-11 (last day of spring to early summer)" | K: start after the flight |
| E-159 | Camponotus large castes "from age 2 years" vs "colony year 3"; `SpeciesDef.tier` still `'T1' | 'T3'` | 07 | Same moment stated as both; tier `'T1' | 'T2' | 'T3'` | D2.27 |
| E-160 | Brood cause `base` listed without a rule; brood `destined` cannot hold polymorphic castes that GDD 07 sets at larva start | 02, 07 | `base` = death from the base per-DU hazard; `destined` widened (D7.3) | GDD 07 §2.6 needs it |
| E-161 | GDD 03 App F says GDD 01 check 6 expects 8-10 BU³ (01 says 5-10) | 03 | 5-10 BU³ (03's 7-10 lies inside); open risk closed | one acceptance range |

Total conflicts resolved: **99** (E-1 … E-99), touching all eight chapters; plus 11 traceability gap closures (E-100 … E-110); plus **51** second-pass resolutions (E-111 … E-161), four of them contract-affecting (D7).

---

## F. Residual risks (not resolvable by editing)

1. **Contracts written in parallel from the digests.** Every row of §D (including D7) must be applied to `src/sim/types`. The digests were regenerated after the first pass and predate the second pass (E11); where a digest and a chapter differ, the chapter wins.
2. **Re-calibration after value changes.** GDD 02's worked example (§15) and check E25 used `DRINK_RATE` 0.03 and the old founding reserves; with 0.05 load/s trips are about 13 s shorter (intake +5-8 %), still inside E25's tolerances but unverified. GDD 06's founding calibration table (§5.12) was made with its own rules and stands; GDD 02's former check E8 numbers are replaced, not re-run.
3. **New stage thresholds** (LN 700, CP 500, MB 700, AT 150/1000) and the stores gate (3 / 1.5 GD) are design choices that the headless growth runs (GDD 07 `growthTargets`) must confirm.
4. **T1 protein boost** (`T1_CARRION_MULT` 4, T1 `crumb-protein`) is sized from the budget in C13, not from a simulation; T1 balance runs must check that a T1 colony grows past 300 and does not explode.
5. **Rival abstract K_max above the player caps** (Tetramorium 1800, flavus 2000, Linepithema 3000). Allowed because rivals are abstract and fielded agents stay inside the 2500 budget, but the "N band" in inspect cards must never show a figure the sim does not have.
6. **Two site-quality scores.** GDD 04's static suitability `Q` (worldgen validation, eight factors, own weights) and GDD 06's live `siteQ` (seven factors, geometric mean) share factor definitions but not weights or thresholds; the overlay and the read-out may disagree at the margin.
7. **Weather machine re-check.** The GDD 06 §3.2 inconsistencies were resolved without touching the tuned tables (E-136); the shoulder-season heat rule adds a small amount of Mediterranean and subtropical spring/autumn heat that the 300-year Monte Carlo (maritime) did not include. Re-run the statistics check E7 for the four climates.
8. **Atta compression.** Footprint 150 BU (K) with up to 40 entrances and fungus chambers to 30 BU makes a crowded mature Atta nest; T3 profiling needed (GDD 03 risk on mound grids and per-chamber fields stands).
9. **Combat values for T3 species** are now one set (E-145); the T3 queen, gyne and male rows of GDD 07 are hand-set values, not the formula, and need a balance check in T3 combat soaks.
10. **Messor and Atta calendar choice (R3)** keeps Messor on the dossier's day numbers by coincidence of fit; if research is redone on exact dates the windows may shift by about 1 GD.
11. **Role possession ranking.** `possess {role, nearPos}` (D4.7) is deterministic, but "suitable" (task match, not in combat, not carrying brood) is defined only loosely in GDD 01 §3.2 and GDD 08 §4.5; the possession implementer must pin the ranking down in a test.
12. **Codex additions** (`cx-species-*`, `cx-antennation`, `cx-nursing`, `cx-springtail`, `cx-material-*`, `cx-habitat-*`, `cx-interface-*`) have ids and triggers but no written notes yet.
13. **Directions D vs GDD 03 D3:** Lasius may dig `wood-decayed` at 0.5 (directions said wood is carpenter-only). Kept as a documented deviation.
14. **Browser key delivery** (F2, F5, F8, F9, Tab, Backspace) may be swallowed by some hosts; every action stays reachable from a menu (GDD 01, 08).
15. **Contract guidance `DAYS_PER_SEASON` constant** (guidance §7) contradicts K; the contracts must expose it from config (D1.2).
16. **Quiet share I11** (`QUIET_SHARE_MIN`, GDD 05 §6) is a target set by design, not measured; the 28-GD soaks (GDD 05 E25) must confirm it with human-event frequency at Normal, and colony-caused warnings may make it hard to meet in poorly run colonies (the test uses the AI-only colony).
17. **`playground_distant` asset** as delivered (4.2 kHz low-pass, audible children's voices) does not pass the GDD 08 §13.7 intelligibility check; it needs reprocessing or replacement, and until then the Distant voices option stays hidden.
18. **T1 static honeydew sites** (E-109) slightly raise T1 carbohydrate supply; the T1 balance runs of risk 4 must include them.
19. **Messor mating loss may be counted twice** (GDD 06 §11.2 `p_mate` 0.866 and §5.15 `hybridFail` 13.4 % appear to encode the same loss); needs the dossier source before T3, not an editing decision.
20. **Atta module sizing** (up to about 38 crater mounds, 24 fungus chambers, a 300 GU alate gate inside the 150 BU footprint) is unverified for render, pile and garden budgets (GDD 07 risks); T3 profiling.
21. **New numbers chosen by the second pass without simulation:** downpour inflow intensity 0.7, watering wash class thresholds, `GRANARY_TARGET_GD` 36, `EGG_CLUMP_MAX` 6, the Lasius start window 9-12; to be confirmed by the T1/T2 balance runs.
22. **Season-length scaling of day-number rules** (C1 `d28`) compresses windows at 5-day seasons to whole-day granularity of about 0.7 GD; GDD 05 herd and GDD 04 schedule tests should include a 5-day and a 10-day run.

