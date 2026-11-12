# Naturalistic Ant Colony Simulator — Working Design Brief

**Updated:** November 11, 2026  
**Status:** Working record of the design conversation. Confirmed direction, assistant recommendations, and open decisions are distinguished below.  
**Project title:** To be chosen.

## 1. Core concept

A modern spiritual successor to SimAnt built around a believable ant colony and its surrounding ecosystem. The player can participate directly in colony activities by taking control of individual ants in third person, or select the queen to direct the colony at a broader level.

The game is an open-ended sandbox. Its continuing appeal comes from establishing a colony, supporting its growth, exploring its habitat, responding to changing conditions, and watching autonomous ants carry out their work.

Ants retain naturalistic behavior and presentation. Human personalities, dialogue, and social institutions are outside the intended creative direction.

## 2. Confirmed direction

| Topic | User decision |
| --- | --- |
| Inspiration | A modern approach to the old SNES SimAnt, grounded in nature. |
| Individual control | The player can jump into individual ants and participate in different colony activities. |
| Perspective | Third person when controlling an individual ant. |
| Colony direction | Selecting the queen provides access to orders for the greater colony. |
| Opening | Begin with a lone queen, excavate the starting chamber, and lay the initial eggs. |
| Opening pacing | Fast-track development of the first brood so the player can reach the first workers promptly. |
| Species variety | Include various ant species eventually; the user has no preferred starting species. |
| Main mode | Open-ended sandbox. |
| Environments | Support settings ranging from forests to parking lots, playgrounds, and people's homes. |
| World generation | Each new game can generate a fresh environment to explore. |

## 3. Working choices proposed by the assistant

These choices support the confirmed direction and remain adjustable.

### Starting species

Use the black garden ant, Lasius niger, as the initial reference species. It offers ground nesting, varied foraging, and a well-studied foundation for modeling behavior. Its documented ecology includes scavenging, predation on small invertebrates, and collecting aphid honeydew. [S1]

A queen can establish a colony using stored bodily reserves while rearing the initial brood. This fits the chosen founding sequence. [S2]

Additional species would receive their own biological rules, environments, and activities. Candidate future playstyles discussed include carpenter ants, seed harvesters, and leafcutters. Their inclusion, exact species, and release order remain open.

### A continuous colony simulation

The proposed design uses one ongoing colony state for both individual control and queen management.

- Taking control selects an existing ant at its current location and condition.
- Its available actions follow its anatomy and species.
- Leaving an ant returns it to autonomous behavior, including continuation of a relevant task where appropriate.
- Colony orders remain active while the player controls another individual.
- Routine work remains possible without the player manually operating each worker.

These are recommended control rules, rather than a finalized control specification.

### Queen commands

The queen is the proposed interface for colony priorities and projects. Possible commands include increasing food collection, prioritizing brood care, expanding a designated nest area, or responding to a threat.

Queen-issued tactical orders are an intentional gameplay abstraction. The biological reference is decentralized coordination through local information and interactions, with important differences between species. [S3]

The exact balance between broad priorities and precise spatial commands remains open.

## 4. Proposed opening sequence

1. Begin as the lone queen in third person.
2. Explore the immediate area and choose an appropriate founding location.
3. Excavate an entrance and the starting chamber.
4. Lay the first clutch of eggs.
5. Advance through the first brood's development.
6. Resume ordinary play with a small initial workforce and the option to select a worker or remain with the queen.

The accelerated transition represents development through eggs, larvae, pupae, and adult workers. It covers the period needed to reach usable workers, rather than only the moment eggs hatch. These stages are observed separately in research on Lasius niger founding colonies. [S4]

Suggested presentation: a brief, skippable time-lapse, with the queen's ordinary brood care handled automatically. The opening should make digging and founding meaningful while keeping the player moving toward the colony's range of activities.

The normal simulation calendar, later brood development rates, pause controls, and additional time acceleration are still to be decided.

Future species may require changes to the founding activities, nesting material, or resources. The opening should follow the biology chosen for that species.

## 5. Proposed sandbox structure

The colony's changing needs provide continuing goals.

| Stage | Proposed emphasis |
| --- | --- |
| Founding and first workers | Establish the nest, locate dependable food, and support the next generation. |
| Growing colony | Expand usable space, establish additional routes, and sustain the work needed inside and outside the nest. |
| Mature colony | Maintain a broader resource network, adapt to changing conditions, and support reproduction. |

Optional milestones could record the colony's history: its first successful food trail, a substantial nest expansion, survival through a seasonal transition, or its first reproductive offspring.

Food availability, weather, neighboring colonies, and other organisms are proposed sources of changing conditions. Quiet periods should also be enjoyable for observation and voluntary participation.

Colony failure rules and continuation after the founding queen's death remain open. Open-ended play does not yet establish a particular mortality, succession, or difficulty model.

## 6. Proposed world model

Each sandbox would be a connected locality containing a selection of natural and human-built spaces. Examples include a woodland edge adjoining a playground and parking area, or a house connected to a garden and pavement.

The user has confirmed the broad environment range. A connected-locality structure is the current recommendation; map dimensions and boundaries have not been selected.

### Environmental opportunities

| Setting | Proposed opportunities and pressures |
| --- | --- |
| Forest floor | Leaf litter, roots, logs, sheltered routes, and complex ground-level traversal. |
| Pavement and parking areas | Cracks, joints, curbs, drains, exposed crossings, and temporary food sources. |
| Playgrounds and parks | Sand, soil, vegetation, equipment foundations, and changing human activity. |
| Gardens and yards | Plants, irrigation, paving, fences, sheds, and neighboring colonies. |
| Buildings | Thresholds, cavities, routes around appliances, plumbing access, and resources affected by human routines. |

Small physical connections should matter. Discovering a crack beneath a door or a sheltered route under a curb can connect the colony to a useful location.

Human activity could change resources and access through cleaning, dropped food, watering, and moved objects. The frequency, severity, and direct representation of people remain open.

For each species, nesting suitability should be defined separately from the ability to travel or forage through an area.

### Generation approach

Fresh procedural environments are confirmed. The assistant's recommended method combines:

- Generated terrain, habitat arrangement, resource placement, and starting conditions.
- Carefully designed structures and layout rules for recognizable buildings and infrastructure.
- Checks for suitable founding locations and usable connections through the environment.

The same saved colony should retain a persistent world. Regeneration is intended for a new game; detailed persistence rules still need specification.

An unlimited world, a fixed launch habitat roster, and a particular simulation population have not been selected.

## 7. Simulation priorities to investigate

These are proposed priorities for later design and prototyping.

1. **Local information and autonomous work:** ants respond to accessible cues and colony needs through species-appropriate behavior. [S3]
2. **Foraging with memory and communication:** research on Lasius niger supports considering both route memory and pheromone information. [S5]
3. **Nutrition and brood:** research shows that brood presence affects collective nutritional regulation, supporting a design with meaningful differences between food resources. Exact rules must be selected for the modeled species. [S6]
4. **Readable causality:** the player can investigate why food collection, development, or a project has slowed.
5. **Third-person usability:** camera behavior must work in narrow tunnels, crowded chambers, and on climbable surfaces.
6. **Species differences:** diet, founding, nesting, anatomy, and behavior are defined for each playable species.

Exact models, performance targets, graphics fidelity, and technical architecture remain open.

## 8. Next foundational decisions

The next decision is the initial delivery platform: a downloadable desktop game or a browser game. The selected game-studio plugin does not itself establish that preference.

Subsequent decisions include:

- Engine and development constraints.
- Single-player or multiplayer scope.
- Nest excavation and construction controls.
- Precision and presentation of queen commands.
- World size and simulation detail.
- Pause, speed controls, and the relationship between activity and developmental time.
- Difficulty, recovery, queen death, and colony succession.
- Visual style, animation approach, and target hardware.

The established direction is sufficient to continue toward a full design specification once these foundational choices are resolved.

## 9. Research references

These sources support biological facts and the original game's documented features. Gameplay recommendations in this brief are design proposals.

- **[S1]** Bees, Wasps & Ants Recording Society, [Lasius niger species account](https://bwars.com/index.php/ant/formicidae/formicinae/lasius-niger). Supports habitat, nesting, and foraging context.
- **[S2]** [Colony co-founding in ants is an active process by queens](https://pmc.ncbi.nlm.nih.gov/articles/PMC7419493/). Describes claustral founding in Lasius niger using stored reserves.
- **[S3]** Deborah M. Gordon, [Control without hierarchy](https://web.stanford.edu/~dmgordon/old2/Gordon2007_Nature_Essay.pdf), Nature (2007). Explains local coordination and cautions against treating different species as interchangeable.
- **[S4]** [Fecundity determines the outcome of founding queen associations in ants](https://pmc.ncbi.nlm.nih.gov/articles/PMC7862224/). Separately records eggs, larvae, pupae, and workers in founding colonies.
- **[S5]** Czaczkes and colleagues, [Ant foraging on complex trails: route learning and the role of trail pheromones in Lasius niger](https://pubmed.ncbi.nlm.nih.gov/22972897/) (2013).
- **[S6]** Dussutour and Simpson, [Communal nutrition in ants](https://pubmed.ncbi.nlm.nih.gov/19345104/) (2009).
- **Original game reference:** [SNES SimAnt manual, archived OCR](https://archive.org/stream/sim-ant-usa/SimAnt%20%28%20USA%20%29_djvu.txt). Documents individual-ant control and broader colony management; its biological explanations are not used as the scientific standard.
