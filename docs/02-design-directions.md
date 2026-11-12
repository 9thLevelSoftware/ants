# FOUNDRESS — Design Directions (orchestrator decisions, per subsystem)

Companion to `01-design-seed.md`. These are decisions already made; GDD chapters elaborate them
(numbers, edge cases, rules) and reconcile them with the research dossiers under `docs/research/`.
If research contradicts a direction, keep the gameplay intent, fix the biology, and note the change.

## A. Modes, possession and controls

- App flow: Boot -> Title -> New Game setup (species, locality archetype, size, seed, starting season, difficulty + custom rules) | Load | Lineage (found as a daughter queen) | Settings | Codex -> Loading (world generation with progress) -> Playing (pause menu) -> Epitaph.
- Play views (one continuous simulation underneath):
  1. **Possession** — third-person control of one ant. Any living ant of the player's colony can be possessed at any time.
  2. **Observer** — free orbit/fly camera, can follow any ant or creature, click to inspect, click-hold or key to possess.
  3. **Colony view** — available while possessing the queen or via a key: strategic camera above the surface plus an underground cutaway; directives panel; marker placement; overlays.
  4. **Photo mode** — frozen time, free camera, depth-of-field control, HUD hidden.
- Possess via: clicking an ant in Observer; Tab / Shift+Tab to cycle nearby ants; quick keys for "a forager", "a digger", "a nurse", "the queen"; colony roster list.
- Releasing control (or dying) leaves the ant autonomous: it infers a sensible task from what it carries and where it is (carrying food -> return and deliver; carrying soil -> dump outside; carrying brood -> nursery; otherwise rejoin task allocation).
- The possessed ant uses exactly the same action primitives as AI ants (move, pick up/drop, dig, feed, trophallaxis, lay trail, tend, bite, spray...) — available actions follow species + caste anatomy.
- Default bindings (all rebindable): WASD move (camera-relative), mouse-drag orbit (pointer lock optional), wheel zoom, E context interact, F dig, R toggle trail laying, Left-click/Q bite, Right-click/C special (acid spray etc.), T antennate/inspect, G share food (trophallaxis), Space let go/drop from surface, X release to Observer, Tab cycle ant, M colony view, V scent view, P pause, 1-4 speed, H hide HUD, F5/F9 quick save/load, Esc menu. Gamepad equivalents.
- Context prompts appear for the thing in front of the antennae ("E  Pick up crumb"). An inspect action shows what an ant would sense about a target.
- Speed auto-drops to 1x on possession; 2x and 4x allowed while possessing; 8x only otherwise.

## B. Opening sequence (brief §4)

1. Start as a lone dealate queen on the surface (short wordless intro card: species, place, season). She has a finite **reserves** meter (wing-muscle and fat reserves) and is vulnerable.
2. Explore; **antennating the ground** shows a site assessment: substrate diggability, moisture, warmth/cover (under stones/paving is good), flood risk, rival scent, exposure. Any diggable site is allowed; quality changes founding outcome.
3. Dig an entrance shaft and a founding chamber by holding dig; during founding the queen expels pellets automatically (mound appears). Readiness shown as progress (shaft depth + chamber volume).
4. Seal the entrance (claustral species), then lay the first clutch (repeatable action, small clutch).
5. A brief skippable time-lapse covers egg -> larva -> pupa -> first workers (nanitics), with automatic brood care and visibly draining reserves. Outcome (number of nanitics) is computed by the simulation from site quality and reserves.
6. Normal play resumes: nanitics reopen the nest; the player can possess a worker or stay with the queen. Journal lists first aims (first food trail, second chamber, ...).
- Species variations: carpenter ants found in a wood cavity; leafcutter queen brings a fungus pellet and must start the garden before eggs; harvester founds deep in dry open ground.

## C. Colony simulation (Lasius niger as reference)

- **Individuals**: every colony ant is an individual agent (plain object) with position/up/forward, caste, age, health, crop (carbohydrate/protein), carried item, task, behaviour state, route memory.
- **Brood** are individual entities (egg, larva, pupa) with progress, hunger and destined caste; they are physically carried and fed. Development rate depends on chamber temperature/humidity and feeding. First brood is fast-tracked.
- **Food model**: two nutrients — carbohydrate (worker fuel) and protein (larval growth, egg production). Liquids travel in the crop, solids as carried items. In-nest stock is tracked colony-wide (social stomach + store chambers) for clarity; trophallaxis is shown and is a real transfer for the possessed ant.
- **Collective nutrition**: demand for protein rises with larval count; foragers bias toward the nutrient in deficit; sources differ meaningfully (honeydew = carbohydrate, prey/carrion = protein, seeds mixed, human food varied).
- **Task allocation**: age polyethism (young in-nest, old outside) + response thresholds to stimuli (hungry brood, pending dig plans, food deficit, alarm) + the player's allocation sliders as targets. Outgoing forager activation depends on the rate of successful foragers returning (interaction-rate feedback).
- **Foraging**: scouts explore (biased away from marked territory), find a source, return using route memory (breadcrumb retrace with shortcuts) while laying trail pheromone scaled by source quality and colony need; recruits follow trail gradients; trails decay; home-range marking is long-lived. Heavy items need cooperative transport.
- **In-nest work**: nursing (feed, groom, sort and move brood to the best microclimate), queen care, storing food, digging (plans + automatic architect), hauling soil to the mound, waste and corpses to a midden (necrophoresis), resting.
- **Readable causality**: each system publishes diagnostics — a status plus weighted limiting factors (e.g. brood growth slow: protein deficit 60 %, nursery too cold 30 %, too few nurses 10 %) with remedies. Alerts fire on status changes. Inspecting any ant shows its task, state, target and reason.

## D. Nest and excavation

- Free-form carve grid (see seed). Player digs by facing a wall and holding dig: each bite carves a sphere and yields a soil pellet in the mandibles; pellets dropped at the surface near an entrance merge into that entrance's mound; pellets left inside clutter tunnels until hauled.
- **Dig plans**: chosen chamber/tunnel/entrance templates anchored on an existing wall, expanded into ordered carve spheres; diggers excavate the frontier, haulers carry pellets out. Sources: player markers and the **nest architect**, which proposes plans from need (crowding, brood volume, food store overflow, depth for winter, flood safety) using a per-species nest template. Auto-expansion can be switched off.
- **Chambers** are detected/registered volumes with a type (founding, royal, nursery, food store, granary, fungus garden, midden, resting, general) and capacity; each has temperature and humidity from depth, cover and weather. Crowding and missing chamber types cause diagnosable slowdowns.
- Substrates differ: loam (normal), sand (fast but collapses/floods), clay/compacted (slow), wood (carpenter ants only; sound wood slow, damp/decayed wood fast), non-diggable (concrete, stone, tile). Pre-existing cavities (paving joints, voids under slabs, cracks under doors, wall voids) are part of the carve grid.
- Rain can flood low or badly sited tunnels; workers move brood upward; mounds/raised entrances reduce risk.

## E. World and habitats

- A locality = one square map made of 3-5 adjacent zones from: forest floor, lawn, garden beds, pavement/patio, parking/asphalt, playground (sand pit, rubber surfacing), and a building interior slice (kitchen/utility room behind a door). Archetypes (e.g. Woodland Edge, Suburban Garden, Playground Park, Car Park Verge, Kitchen Door) bias the mix; every game regenerates from a seed.
- Everything is at true physical scale in mm; human objects are colossal (a curb is a cliff, a table leg a tower, a tire a wall).
- **Micro-connections** are generated deliberately: paving joints, expansion gaps, a crack under the door, a gap beneath a curb or fence, pipe penetrations, cabinet kick-space, tree roots, drain grilles. Discovering one opens a route; they are narrow passages in the carve grid or gaps between primitives.
- Decor: grass blades (visual only, fade/part near the camera), draped decor (fallen leaves, petals, litter laid on the terrain surface), solid props (twigs, stones, logs, cones, cans, toys) as primitives, climbable plants (stems as capsule chains, leaves) hosting aphids or nectar.
- Generation pipeline: zone layout -> heightfield -> large structures (walls, slabs, curbs, furniture, play equipment, trees) -> props -> plants -> resources and creature territories -> rival colony sites -> pre-existing cavities -> validation (reachable founding sites for the chosen species, connectivity between zones, food within range of likely nest sites); regenerate on failure.
- For each species, nesting suitability is separate from the ability to travel/forage through an area.
- Human activity (indirect): footsteps (giant shoe + shadow + tremor warning), mowing, sweeping/vacuuming indoors (removes food and trails), spilled or dropped food, watering/sprinklers, parking cars (tires, oil), children at play (sand disturbance, dropped sweets), pest control (bait station: tempting but harmful). Scheduled by time of day/week with warnings that an ant could plausibly sense.

## F. Ecology, rivals and combat

- **Food sources** are persistent nodes on surfaces: aphid colonies on host plants (renewable honeydew, must be tended and defended from ladybirds/lacewings), nectaries and flowers, fallen fruit, carrion and dead insects, live prey (springtails, larvae, caterpillars; big prey needs a group), seeds (elaiosomes), human food (crumbs, sugar, spills, pet food), dew/water. Each has nutrient profile, amount, renewal/decay, unit size, discovery state.
- **Creatures** are surface walkers with simple naturalistic AI: prey, neutral fauna (woodlice, worms, snails), aphid predators, ant predators (jumping/wolf spiders, antlion pits in dry sand, centipedes in the soil), birds as brief events at mounds. Comfort mode can replace spider visuals.
- **Rival colonies**: 2-4 per map, species appropriate to habitat (same species, pavement ants, larger Formica-like predators, tiny thief ants). Simulated as abstract colonies (population, stores, seasonal growth) that field a limited number of real agents; each has a small real nest (carve grid) with queen and brood that can be invaded. Territories emerge from home-range marking; contact causes skirmishes; wars and raids scale with strength ratio. Same-species brood raiding of small colonies is possible.
- **Combat**: bite/grapple (pairs lock), acid spray (formicines, short cone, raises alarm), size and caste matter, outnumbering pins and multiplies damage, alarm pheromone recruits nestmates. Corpses become items (food or midden). The possessed ant fights with the same rules.

## G. Environment, progression, failure

- Day/night (10-minute day), temperature curve, seasons (7 days each), weather (clear, overcast, rain, storm, heat, frost) affecting activity, trails (rain erases), flooding, surface temperatures by material and shade (hot asphalt at midday is dangerous; dawn/dusk foraging emerges).
- **Winter**: the colony retreats; a skippable overwintering time-lapse consumes reserves; starvation and cold losses are computed and explained; spring resumes.
- **Stages** (soft, descriptive): Founding -> First workers -> Growing colony -> Mature colony (reproduction). **Milestones** recorded in a field journal with dates (first trail, first expansion, first winter survived, first alates, 100/500/1000 workers, first rival defeated...). No score.
- **Reproduction**: a mature, well-fed colony in the right season rears alates (winged queens and males) at a cost; on a suitable day a nuptial flight launches (possessable!). Each flight adds daughter foundations to the **Lineage**; the player may continue or start as a daughter queen in a new generated locality.
- **Queen death**: colony becomes orphaned (no new eggs, existing brood matures, alates may still fly). Game ends when no ants remain; an epitaph shows the colony's history graph and causes. Difficulty presets tune threat frequency, weather severity, human activity and founding leniency.
- **Codex / field journal**: entries unlock on first encounter (behaviours, creatures, habitats), written as short naturalist notes grounded in the research. This is the main onboarding channel besides contextual prompts.

## H. Species (four playstyles; details from research)

- *Lasius niger* — generalist, soil nester (loves stones/paving), claustral founding, aphid ranching, monomorphic workers, formic acid.
- Carpenter ant — nests in wood (logs, stumps, structural timber, wall voids), satellite nests, nocturnal trunk trails, polymorphic (minor/media/major), slow growth, frass ejection.
- Harvester ant — seeds and granaries, seed processing by majors, trunk trails, chaff midden, heat-avoiding activity rhythm, polymorphic.
- Leafcutter — fungus garden as the only brood food, leaf-cutting assembly line by size class, waste management and garden hygiene, founding with a fungus pellet, extreme polymorphism.
- Species are data-driven: a `SpeciesDef` (sizes, castes, life history, diet, nest template, behaviours enabled, combat, climate) plus optional economy modules (honeydew ranching, granary, fungus garden, wood nesting).

## I. Interface, art and audio

- HUD (minimal, hideable): time/season/weather + speed controls; colony summary (population by role, carbohydrate and protein stores with trend arrows, brood counts); possessed-ant panel (health, crop, carrying, current action prompts); alerts feed; minimap optional.
- Panels: Directives (allocation sliders, production, toggles), Markers/dig planner (with cutaway), Colony health ("why" diagnostics), Roster (ants by role, possess buttons), Nest overview (chambers, capacity, climate), Journal (milestones, history graphs), Codex, Settings (graphics, audio, controls, accessibility), Save/Load, Lineage.
- Overlays: scent view (trail ribbons, home range, alarm, food odour), temperature/moisture, threats, dig plans.
- Tone: a naturalist's field notebook — calm, precise, no jokes, no characters. Serif headings + clean sans body, earthy palette, restrained motion.
- Rendering: see look-dev spike. Underground is dim and warm with scent motes; surface uses macro depth of field and haze.
- Audio: layered ambience by habitat/time/weather (real recordings where CC0 exists, else synthesised), ant-scale foley (footsteps, digging, mandibles, stridulation), giant low-frequency human sounds, sparse optional generative ambient music, UI sounds. Must start only after a user gesture and tolerate refusal.
- Accessibility: remappable input, UI scale, colour-blind-safe overlay palettes, reduced motion (less camera sway/DOF), spider comfort mode, subtitles are unnecessary (no speech), pause anywhere.

## J. Shared quantitative conventions and canonical names (BINDING across all chapters and code)

**Units**
- Length: mm, and BU (body unit) for anything that should scale with the species. Temperature: °C.
- Time: game time. 1 game day = 600 real seconds at 1x; 1 game hour = 25 real seconds; a simulation tick = 0.1 game seconds. Quote rates per game day or per game second and say which.
- Nutrients: carbohydrate (**C**) and protein (**P**), measured in **loads**. 1 load = one full crop of the species' standard worker (liquids) = the nutrient content of one standard solid item a single standard worker carries. Other castes carry multiples of this.
- Reference economy for *Lasius niger* (chapters may refine, but must stay within the same order of magnitude so chapters written in parallel agree): worker upkeep 0.08 C/day resting and 0.20 C/day active; queen upkeep 0.30 C + 0.10 P per day; one egg costs 0.04 P; a larva needs 1.2 P + 0.4 C in total to pupate; a forager round trip of ~600 BU takes roughly 2 real minutes and returns 1 load.

**Canonical identifiers** (kebab-case strings; add new ones if needed, never rename these)
- Species: `lasius-niger`, `camponotus-pennsylvanicus`, `messor-barbarus`, `atta-texana` (binomials may change if research recommends; ids follow the binomial).
- Castes: `queen` (dealate: founding or established), `gyne` (winged virgin queen), `male`, `worker` (monomorphic species), `minor`, `media`, `major` (polymorphic species; leafcutter minims are `minor`).
- Brood stages: `egg`, `larva`, `pupa`.
- Tasks: `idle`, `rest`, `nurse`, `queen-care`, `scout`, `forage`, `tend` (honeydew herds), `store` (food handling), `dig`, `haul` (soil, waste, corpses), `guard`, `patrol`, `fight`, `flee`, `garden` (fungus), `cut` (leaf cutting), `mill` (seed processing).
- Chamber types: `founding`, `royal`, `nursery`, `food`, `granary`, `fungus`, `midden`, `rest`, `general`.
- Zone types: `forest`, `lawn`, `garden-bed`, `pavement`, `asphalt`, `sand`, `rubber`, `interior`.
- Materials: `loam`, `humus`, `sand`, `clay`, `gravel`, `concrete`, `asphalt`, `stone`, `brick`, `tile`, `wood-sound`, `wood-decayed`, `bark`, `plant`, `leaf`, `metal`, `plastic`, `rubber`, `glass`, `fabric`, `ceramic`, `paper`, `food`, `water`.
- Food kinds: `honeydew`, `nectar`, `fruit`, `carrion`, `prey`, `seed`, `crumb`, `sugar`, `pet-food`, `bait`, `leaf`, `dew`.
- Creature kinds: `aphid` (herd on a plant), `ladybird`, `ladybird-larva`, `lacewing-larva`, `springtail`, `mite`, `fly-larva`, `caterpillar`, `fruit-fly`, `woodlouse`, `earthworm`, `snail`, `millipede`, `jumping-spider`, `wolf-spider`, `ant-spider`, `antlion`, `centipede`, `rove-beetle`, `phorid-fly`, `bird` (event).
- Weather: `clear`, `overcast`, `rain`, `storm`, `heat`, `frost`. Seasons: `spring`, `summer`, `autumn`, `winter`.
- Marker kinds: `dig`, `forage`, `avoid`, `rally`, `entrance`, `move-brood`, `move-queen`.
- Pheromone channels: `trail`, `home`, `alarm`.
- Human events: `footsteps`, `mowing`, `sweeping`, `vacuum`, `food-drop`, `spill`, `watering`, `car`, `children`, `bait-station`.
- Difficulty: `gentle`, `naturalist`, `harsh`.

**AI navigation model (so chapters describe behaviour consistently)**
- Inside cavities: follow BFS distance fields (to entrance / to a chamber), walking on the walls.
- On the surface: local steering (seek, wander, trail following, breadcrumb retrace) on the surface-walker; when the straight route is blocked by tall structures a coarse nav-grid path (16 BU cells) supplies waypoints; elevated places (table tops, counters, plant stems) are reached along authored **climb routes** attached to world objects.
- Recruitment is information transfer: a successful forager meeting nestmates passes on the food source it knows. Recruits follow the pheromone trail visibly, with the planner as a hidden fallback when they lose it or get stuck. Homing uses breadcrumb retrace first, planner second.

## K. Ratified scale and calendar decisions (BINDING; resolves questions raised by the research dossiers)

- **No per-agent weights.** One simulated ant is one ant; the population shown to the player is the simulated population. The dossiers' "one agent represents N real ants" schemes are NOT used. Real colonies are larger than the game's; the codex says so honestly.
- **Colony caps (simulated = displayed workers)**: *Lasius niger* 1500, *Camponotus pennsylvanicus* 1200, *Messor barbarus* 1500, *Atta texana* 1500. Total individually simulated ants across all colonies (player + rivals' fielded agents) stays under ~2500.
- **Two clocks, one unit system.** Movement and actions run in game seconds (ant-scale real time). Development, metabolism, seasons and resource renewal run on the compressed calendar (1 game day stands for roughly 13 real days). Every economic number in the GDD and in code is already expressed in loads per game day or per game second — code applies no further conversion factor.
- **Space is compressed to the map.** Real foraging ranges, trail lengths and nest footprints that exceed the world are scaled to fit (typical forage trip 300-900 BU, trunk trails up to ~1500 BU, nest footprint within ~150 BU of the first entrance unless satellite nests apply).
- **Calendar anchor.** Game day 1 is the first day of spring. Spring = days 1-7, summer = 8-14, autumn = 15-21, winter = 22-28. A new game starts on the species' natural founding day (chapter 06 sets it: e.g. *Lasius niger* after a mid-summer nuptial flight).
- **Brood raiding** of same-species incipient colonies stays in the design as a clearly labelled gameplay mechanic even where the literature for a given species is thin; the codex must not overstate the evidence.
