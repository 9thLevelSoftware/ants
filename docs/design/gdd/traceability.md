# FOUNDRESS GDD — Brief-to-design traceability audit

Scope: every distinct statement of intent in `docs/00-original-brief.md` (sections 1-9) traced to `docs/01-design-seed.md`, `docs/02-design-directions.md`, `docs/design/gdd/00-index.md` and GDD chapters 01-08. Method: the brief was read line by line; each statement was located through the chapter digests and the index, and every citation was confirmed by searching the chapter text (headings and identifiers), not by reading whole chapters. The chapters were not edited during the audit; the gap-closure pass that followed edited them (section 1, section 5).

Conventions: "GDD nn §x" = chapter section; "Seed" = `01-design-seed.md`; "Dir" = `02-design-directions.md`; "Index" = `00-index.md`. Status values: **covered** (addressed and consistent), **partial** (addressed in part; the note says what is missing), **contradicted**, **missing**. Statements that the brief lists as open or "to be decided" are marked "(open)"; "covered" for these means the design takes an explicit decision.

## 1. Result

| Measure | Count |
|---|---|
| Statements audited | 110 |
| Covered | 110 (100 at audit + 10 closed by the gap pass) |
| Partially covered | 0 (10 at audit) |
| Contradicted | 0 |
| Missing | 0 |

**Gap closure pass (after the audit):** all eleven gaps G1-G11 were judged real and closed by surgical edits to the owning chapters and the Index (decision log E-100 … E-110, residual risks 16-18); every formerly partial row now reads "covered" with its new citation, and section 5 records what was done per gap. Text below this paragraph in this section describes the state at audit time.

No statement is contradicted by the GDD and none is wholly absent. The ten partial rows reduce to seven gaps (G1-G7 below). G8 and G9 come from the reverse check (section 3), which found no conflict with the brief's creative direction but two wording and audio items worth tightening. G10 and G11 are tier and breadth notes rather than partials.

## 2. Traceability table

| Brief § | Statement | Status | Where addressed | Note |
|---|---|---|---|---|
| 1 | Modern spiritual successor to SimAnt built around a believable colony and its surrounding ecosystem | covered | Seed §0; Index §A; GDD 02 (colony), GDD 05 (ecosystem) | Originality rule honoured: no SimAnt names, art or layouts appear in any chapter (text search clean). |
| 1 | Player can take control of individual ants in third person | covered | GDD 01 §3 (possession), §6.2-6.5 (camera) | |
| 1 | Select the queen to direct the colony at a broader level | covered | GDD 01 §2 (queen as the doorway), §5.2, §9.2, §10 (queen card button); GDD 08 §4.2, §5.2 ("Colony orders (I)"), §9.2 (`hint-directives`), App E 26; GDD 02 §12 intro | Closed by G1 (Index E-100). Possessing or selecting the queen after hand-over offers "Colony orders"; Directives stays reachable from any view. |
| 1 | Open-ended sandbox | covered | Seed §1; GDD 06 §7 (stages never gate), §8 (no score), §13.4 (end only by extinction) | |
| 1 | Appeal: establish a colony, support growth, explore the habitat, respond to changing conditions, watch autonomous ants | covered | GDD 06 §5, §7-8; GDD 04 §6.3 (discovery); GDD 01 §6.6 (observer); GDD 06 §10 (habitat codex) | Systems exist for each clause; goal guidance after hand-over is thin (row 5.1). |
| 1 | Ants keep naturalistic behaviour and presentation | covered | Index §A; GDD 08 §0, §11.8; GDD 02 §0.3 | |
| 1 | Human personalities, dialogue, social institutions are outside the creative direction | covered | GDD 08 §0, §9, §11.8; GDD 06 §12.4 (no personal names); GDD 04 §15 (indirect humans) | Reverse check (section 3) lists two terminology and audio items. |
| Title | Project title to be chosen (open) | covered | Seed §1 (FOUNDRESS); GDD 08 §3.3 | |
| 2 | Inspiration: modern, nature-grounded approach to the old SNES SimAnt | covered | Seed §0; `docs/research/` dossiers; GDD 02 §0.3 | Biology comes from the fact-checked dossiers. |
| 2 | Jump into individual ants and take part in different colony activities | covered | GDD 01 §3.1-3.2, §7.3 (38 primitives) | |
| 2 | Third-person perspective when controlling an ant | covered | GDD 01 §6.2-6.5 | |
| 2 | Selecting the queen gives access to orders for the greater colony | covered | GDD 01 §2, §5.2, §10; GDD 08 §4.2, §5.2, App E 26 | Closed by G1: "I  Colony orders" prompt and panel button while the queen is possessed, inspect-card button when she is selected; opening Directives keeps her possessed and changes nothing until a slider moves. |
| 2 | Opening: lone queen, excavate the starting chamber, lay the initial eggs | covered | GDD 06 §5.1-5.10; GDD 03 §13 | |
| 2 | Fast-track first-brood development so the first workers arrive promptly | covered | GDD 06 §5.11-5.12 (about 75 s skippable time-lapse running the real simulation); Index E-19 | |
| 2 | Include various species eventually; no preferred starting species | covered | GDD 07 §1, §5; GDD 08 §3.7 (species cards) | Lasius default; three further species at T3. |
| 2 | Main mode is an open-ended sandbox | covered | As row 1 (sandbox) | |
| 2 | Environments from forests to parking lots, playgrounds and people's homes | covered | GDD 04 §1.3 (archetypes), §5.1-5.7 (object catalogue) | "Homes" is one kitchen-and-utility slice behind a door; the rest of the house is a sealed façade (GDD 04 §1.4). Declared the launch representation by design, with a T3 second-room stretch (`pantry` or `conservatory`), GDD 04 §1.3 (G11, E-110). |
| 2 | Each new game can generate a fresh environment | covered | GDD 04 §4 (pipeline), §4.4 (determinism); GDD 08 §3.7 (seed field) | |
| 3 | Lasius niger as the initial reference species | covered | GDD 07 §1, §5.1; Seed §1 | |
| 3 | Ground nesting, varied foraging, scavenging, small-invertebrate predation, aphid honeydew | covered | GDD 07 §5.1; GDD 05 §1 (food), §1.4 (honeydew herds) | Aphid herds are T2 (Index E-39). T1 Lasius relies on flowers, sugar, crumbs and carcasses plus static `honeydew-film` sites (GDD 05 §0 `T1_HONEYDEW_SITES`; GDD 07 §5.1.5); stated explicitly by G10 (E-109). |
| 3 | Queen founds using stored reserves while rearing the first brood | covered | GDD 06 §5.5, §5.12; GDD 02 §3; GDD 03 §13 | |
| 3 | Further species get their own biological rules, environments and activities | covered | GDD 07 §5.2-5.4, §6; GDD 04 §1.2 (regions per species) | T3. |
| 3 | Candidate playstyles: carpenter ants, seed harvesters, leafcutters | covered | GDD 07 §1 (all three confirmed with binomials) | |
| 3 | Inclusion, exact species and release order of further species (open) | covered | GDD 07 §1 ("Build and release order"); GDD 08 §3.7 ("Not yet available" cards); Index §A (Tiers) | Closed by G7 (E-106): Lasius, then Camponotus, Messor, Atta; data-only variants after; adjustable. |
| 3 | One ongoing colony state serves both individual control and queen management | covered | GDD 01 §3.3; GDD 02 §0; Index §A | |
| 3 | Taking control selects an existing ant at its current location and condition | covered | GDD 01 §3.1, §3.3 | |
| 3 | Available actions follow the ant's anatomy and species | covered | GDD 01 §7.3 (primitive "Who" column); GDD 07 §3.2, §3.14 | |
| 3 | Leaving an ant returns it to autonomy, continuing a relevant task where appropriate | covered | GDD 01 §3.5 (16-rule inference table) | |
| 3 | Colony orders stay active while the player controls another individual | covered | GDD 01 §3.3 step 4; GDD 02 §12.1; GDD 08 §4.2 | Directives apply while paused and in any view. |
| 3 | Routine work continues without manually operating each worker | covered | GDD 02 §6, §10; Seed pillar 3 | |
| 3 | These control rules are recommendations, adjustable | covered | GDD 01 §3.8, §5.7 (rebinding), settings keys | Rules are named constants and settings. |
| 3 | The queen is the interface for colony priorities and projects | covered | GDD 02 §12 (intro: orders "through the queen"); GDD 01 §2; GDD 08 §4.2-4.3, §5.2 | Closed by G1: the queen is the entry point to Directives and markers, not a requirement. |
| 3 | Possible commands: more food collection, brood care, expand a nest area, respond to a threat | covered | Forage and Nurse sliders (GDD 08 §4.2); dig markers (GDD 03 §7); rally marker and `stance` (GDD 05 §3.7, §4.9) | |
| 3 | Queen tactical orders are an intentional gameplay abstraction over decentralised coordination | covered | GDD 02 §0.3 D10; GDD 06 §10 `cx-interface-orders`; GDD 08 §4.2 (title tooltip), §9.4 | Closed by G2 (E-101): the abstraction is a recorded deviation and is said in play by a codex entry citing Gordon 2007. |
| 3 | Biological reference: decentralised coordination via local cues, differing by species [S3] | covered | GDD 02 §6.6-6.7, §7; GDD 07 §1.1, §3.10 | |
| 3 | Balance between broad priorities and precise spatial commands (open) | covered | Seed §1 (two layers); GDD 02 §12; GDD 08 §4.2-4.3 | Decision: sliders plus capped markers. |
| 4 | Begin as the lone queen in third person | covered | GDD 06 §5.2; GDD 01 §1.3 | |
| 4 | Explore and choose a founding location | covered | GDD 06 §5.7 (seven-factor site read-out); GDD 04 §12.5 (start pose) | |
| 4 | Excavate an entrance and the starting chamber | covered | GDD 03 §13.1-13.2; GDD 06 §5.8 | |
| 4 | Lay the first clutch | covered | GDD 06 §5.10; GDD 01 §7.3 (`lay-egg`) | |
| 4 | Advance through the first brood's development | covered | GDD 06 §5.11 | |
| 4 | Resume play with a small workforce; choose a worker or stay with the queen | covered | GDD 06 §5.13; GDD 08 §9.2 | |
| 4 | The accelerated stretch covers egg, larva, pupa and adult (not only hatching) | covered | GDD 06 §5.11-5.12; GDD 02 §2.3 | Outcome is computed from the real stage model. |
| 4 | Brief, skippable time-lapse; automatic brood care; digging and founding stay meaningful | covered | GDD 06 §5.11; GDD 08 §7.10; GDD 03 §13-14 | |
| 4 | Normal simulation calendar (open) | covered | GDD 06 §1; Dir K | 28-day year, 10 real minutes per game day. |
| 4 | Later brood development rates (open) | covered | GDD 02 §2.2-2.3 | |
| 4 | Pause controls (open) | covered | GDD 06 §4.7; GDD 01 §5.1; GDD 08 §5.1 | |
| 4 | Additional time acceleration (open) | covered | GDD 06 §4.1-4.2; GDD 01 §8 | 8x only when not possessing. |
| 4 | Other species may change founding activities, nesting material or resources | covered | GDD 06 §5.15; GDD 07 §3.4; GDD 03 §13 | |
| 5 | The colony's changing needs provide continuing goals | covered | GDD 02 §5.5, §14; GDD 06 §5.13 (continuing aims and open-aim rules), §7-8; GDD 08 §9.2 | Closed by G4 (E-103): `aim-second-entrance`, `aim-cross-zone`, `aim-herd`, `aim-alates`, `aim-flight` carry growing and mature colonies; at most 3 shown. |
| 5 | Founding and first workers: establish the nest, find dependable food, support the next generation | covered | GDD 06 §5.13 (aims), §7 | |
| 5 | Growing colony: expand space, add routes, sustain inside and outside work | covered | GDD 03 §8 (architect needs); GDD 02 §6, §8; GDD 06 §7 | |
| 5 | Mature colony: broader resource network, adapt to conditions, support reproduction | covered | GDD 06 §11-12; GDD 07 §6 | |
| 5 | Optional milestones record the colony's history | covered | GDD 06 §8-9 (no score) | |
| 5 | Milestone examples: first trail, big expansion, surviving a season change, first reproductive offspring | covered | `ms-first-trail`, `ms-depth-50`/`ms-second-chamber`, `ms-first-winter-survived`, `ms-first-daughter` (GDD 06 §8) | |
| 5 | Food availability, weather, neighbouring colonies and other organisms change conditions | covered | GDD 05 §1-3; GDD 06 §3 | Weather, rivals and creatures are T2; T1 has a static food set. |
| 5 | Quiet periods are enjoyable for observation and voluntary participation | covered | GDD 05 §5 (`QUIET_SHARE_MIN`), §6 I11, App E 25; GDD 01 §6.6 (ambient watch, T3); GDD 08 §3.4, §6.3, §7.4 (`milestoneNotices`), App E 27; GDD 06 §4.6 | Closed by G3 (E-102): at least 60 % of daytime hours quiet in Naturalist (75 % Gentle, 40 % Harsh), unattended watching mode, quieter notices. |
| 5 | Colony failure rules (open) | covered | GDD 06 §5.14, §13.4 | Founding failure and extinction. |
| 5 | Continuation after the founding queen's death (open) | covered | GDD 06 §13.3 (orphaned colony), §12 (Lineage) | |
| 5 | Mortality, succession and difficulty model (open) | covered | GDD 06 §13-14; GDD 02 §1.3, §5.7; GDD 05 §5 | |
| 6 | One connected locality mixing natural and built spaces | covered | GDD 04 §1.3, §4.2 | |
| 6 | Connected-locality structure recommended | covered | GDD 04 §1, §6 (micro-connections), §11 (nav grid) | |
| 6 | Map dimensions and boundaries (open) | covered | GDD 04 §1.1 (3000/4000/5000 BU), §14 | |
| 6 | Forest floor: litter, roots, logs, sheltered routes, complex traversal | covered | GDD 04 §5.1, §6.2 (`root-channel`), §9, §11 | |
| 6 | Pavement and parking: cracks, joints, kerbs, drains, exposed crossings, temporary food | covered | GDD 04 §5.4-5.5, §6.2; GDD 06 §2.3 (hot asphalt); GDD 05 §1.7 | |
| 6 | Playgrounds and parks: sand, soil, vegetation, equipment foundations, human activity | covered | GDD 04 §5.6, §6.2 (`sleeve-gap`), §15 (children) | |
| 6 | Gardens and yards: plants, irrigation, paving, fences, sheds, neighbouring colonies | covered | GDD 04 §5.2-5.3 (`shed`, `fence`, `garden-hose`, `sprinkler-head`); GDD 05 §3 | |
| 6 | Buildings: thresholds, cavities, routes around appliances, plumbing access, human routines | covered | GDD 04 §5.7 (`fridge`, `cooker`, `sink`, `service-pipe`), §6.2, §15 | One kitchen or utility slice. |
| 6 | Small physical connections matter (crack under a door, route under a kerb) | covered | GDD 04 §6, §6.3 (usefulness guarantee); `world.micro-discovered` | |
| 6 | Human activity changes resources and access: cleaning, dropped food, watering, moved objects | covered | GDD 04 §15 (all ten human events; toys and cars are dynamic primitives) | T2. |
| 6 | Frequency, severity and direct representation of people (open) | covered | Seed §1; GDD 04 §15.2, §15.7; GDD 08 §11.8 | Decision: indirect only (soles, tyres, tremor, shadow); difficulty-scaled. |
| 6 | Nesting suitability defined separately from travel and foraging ability | covered | GDD 04 §12.1 (suitability) vs §12.4 (access map) | Other species' tables are T3. |
| 6 | Generated terrain, habitat arrangement, resources and starting conditions | covered | GDD 04 §4.2 steps 1-11 | |
| 6 | Designed structures and layout rules for recognisable buildings and infrastructure | covered | GDD 04 §1.4, §5 | |
| 6 | Checks for founding locations and usable connections | covered | GDD 04 §4.3 (`v-found`, `v-connect`, `v-micro`) | |
| 6 | A saved colony keeps its persistent world; regeneration is for new games | covered | GDD 04 §16; GDD 06 §12.3 | |
| 6 | Detailed persistence rules need specification | covered | GDD 04 §16; GDD 06 §15; GDD 08 §7.6; architecture §7 | |
| 6 | Unlimited world, fixed launch habitat roster, simulation population (open) | covered | GDD 04 §1.1, §1.3; Dir K (caps) | Decisions: three bounded sizes, six archetypes (one T3), 1500-worker caps. |
| 7 | Local information and autonomous, species-appropriate work | covered | GDD 02 §6-7, §10; Dir J (navigation model) | |
| 7 | Foraging with route memory and pheromone communication [S5] | covered | GDD 02 §8-9, §6.7 | |
| 7 | Brood presence shapes collective nutritional regulation [S6] | covered | GDD 02 §5.5; §0.3 D5 | The source study is on another genus; D5 records this and keeps the gameplay intent. |
| 7 | Meaningful differences between food resources | covered | GDD 02 §4; GDD 05 §1.2 | |
| 7 | Exact rules chosen for the modelled species | covered | GDD 02 §5; GDD 07 §5.x diets | |
| 7 | Readable causality: investigate why food, development or a project slowed | covered | GDD 02 §14; GDD 03 App D; GDD 08 §4.4; Seed pillar 4 | 62 `diag-*` ids with weighted causes and remedies. |
| 7 | Third-person camera works in narrow tunnels, crowded chambers and on climbable surfaces | covered | GDD 01 §4.1, §6.3-6.5 | |
| 7 | Species differences in diet, founding, nesting, anatomy and behaviour | covered | GDD 07 §3, §5 | |
| 7 | Exact models (open) | covered | GDD 02-03, 05-07 (numbers, state, checks) | |
| 7 | Performance targets (open) | covered | GDD 08 §0 ("Performance contract"), App D `diag-perf`; Index §A, §C2; GDD 06 §4.3-4.4 | Closed by G5 (E-104). |
| 7 | Graphics fidelity (open) | covered | GDD 08 §11 | |
| 7 | Technical architecture (open) | covered | Seed §3-4; `docs/03-architecture.md` | Outside the GDD's remit. |
| 8 | Delivery platform: desktop or browser (open) | covered | Index §A; Seed §1; GDD 01 §1.1 (`boot`, `unsupported`) | Browser-first, WebGL2. |
| 8 | Engine and development constraints (open) | covered | Seed §1, §3; GDD 08 §0 | |
| 8 | Single-player or multiplayer (open) | covered | Index §A ("single-player"); Seed §1 | Not restated in the chapters; the Index suffices. |
| 8 | Nest excavation and construction controls (open) | covered | GDD 03 §7, §13-14; GDD 01 §7.3 (`dig-bite`, `seal-entrance`) | |
| 8 | Precision and presentation of queen commands (open) | covered | GDD 02 §12; GDD 08 §4.2-4.3 | |
| 8 | World size and simulation detail (open) | covered | GDD 04 §1.1; Dir K; GDD 02 §0.3 | |
| 8 | Pause, speed controls, and the relation between activity and developmental time (open) | covered | GDD 06 §0.2 (two clocks), §4; Dir K | |
| 8 | Difficulty, recovery, queen death, colony succession (open) | covered | GDD 06 §12-14; GDD 05 §5 | |
| 8 | Visual style (open) | covered | GDD 08 §11 | |
| 8 | Animation approach (open) | covered | GDD 08 §11.9 ("Animation"); GDD 01 §7.3 (`pose.*` blend targets); GDD 07 §3.15; Seed §4 | Closed by G6 (E-105): procedural, vertex-shader animation from per-instance attributes; no authored clips. |
| 8 | Target hardware (open) | covered | GDD 08 §0 ("Performance contract"), §7.4; Index §A | Closed by G5: integrated-GPU laptop, 1080p, 60 fps at Medium. |
| 8 | Established direction is sufficient to proceed to a full specification | covered | The GDD itself | Process statement. |
| 9 | Gameplay recommendations are design proposals; the references support biological facts | covered | Index §E (decision log); GDD 02 §0.3, GDD 06 §16, GDD 07 App F (deviation notes) | Where research contradicts a direction the chapters record the change. |
| 9 | SimAnt manual is genre context only; its biology is not a scientific standard | covered | Seed §0 | No chapter cites it. |
| 9 | [S1] Lasius niger habitat, nesting, foraging context | covered | GDD 07 §5.1 | |
| 9 | [S2] Claustral founding on stored reserves | covered | GDD 06 §5.5; GDD 07 §3.4 | |
| 9 | [S3] Local coordination; species are not interchangeable | covered | GDD 02 §6; GDD 07 §1.1, §3.10 | The "queens do not command" half of the reference is surfaced by `cx-interface-orders` (GDD 06 §10) and the Directives tooltip (GDD 08 §4.2) (G2). |
| 9 | [S4] Egg, larva, pupa and worker recorded separately in founding colonies | covered | GDD 02 §2.3; GDD 06 §5.11 | |
| 9 | [S5] Route learning plus trail pheromones in Lasius niger | covered | GDD 02 §8-9 | |
| 9 | [S6] Communal nutrition | covered | GDD 02 §5.5 | The study used a different genus; recorded in GDD 02 §0.3 D5. |

## 3. Reverse check: GDD content beyond the brief

Checked against the brief's creative direction (naturalistic ants, no human personalities, dialogue or institutions). Search of all eight chapters for personality or temperament of ants, named individuals, dialogue, narration, voice-over, score, achievements, XP, jokes and cartoon styling found nothing outside the "never" lists. Findings:

| Item | Where | Verdict |
|---|---|---|
| Lineage, daughter queens, generated colony names ("Hollow Verge 14") | GDD 06 §12 | Extension of the brief's "first reproductive offspring"; names are place tokens, "No personal names". Consistent. |
| Possessed nuptial flight, photo mode, gamepad, accessibility set, difficulty presets | GDD 01 §4.4, §6.9; GDD 08 §7.9, §12; GDD 06 §14 | Extensions the seed ratified; none conflicts with the brief. Spider comfort modes (`abstract`, `marker`) are opt-in. |
| Explicit non-naturalistic abstractions: sense light underground, queen directives, time-lapses, scent and why views | GDD 08 §11.5; GDD 02 §12; GDD 06 §4-6 | Each is labelled as an abstraction in the chapter; queen directives now too (GDD 02 D10, G2). |
| Rival states `war` and `truce`, "enemy" in combat tables, codex title "Wars on the slabs", milestone `ms-first-rival-defeated`, epitaph "rivals defeated" | GDD 05 §3.7, §4; GDD 06 §8, §10, §13.5 | Myrmecologists do say "ant wars", but "truce" and "war" read as human institutions. Ids kept; player-facing wording rule added (GDD 08 §6.4, §10.2; GDD 05 §3.7 note): display words Neutral / Wary / Clashing / Territorial dispute / Lull; `cx-pavement-wars` titled "Boundary disputes on the slabs" and the `cx-formica` note reworded (GDD 06 §10); epitaph figure "rival colonies overcome" (GDD 06 §13.5); `ms-first-rival-defeated` already displays "A rival repelled" (no change needed). Covered (G8, E-107). |
| Reactive bait stations ("the world answers") | GDD 04 §15.6 | A human event triggered by ant traffic. Implemented as a scheduled event, no human intent shown; acceptable. Keep it presented as an event (shadow, clack), never as a person. |
| Giant "children" ambience uses the file `playground_distant` and a "Distant voices" setting | GDD 08 §13.4, §13.6, §7.4 | Resolved (G9, E-108): synth murmur is the default; Distant voices is opt-in and hidden until `playground_distant` passes a two-reviewer intelligibility check after a 900 Hz low-pass (GDD 08 §7.4, §13.4, §13.6, §13.7 checklist, §11.8, App E 28). The delivered excerpt fails as is (Index §F risk 17). |
| Humans shown only as shoe soles, tyres, implements, shadows | GDD 08 §11.8; GDD 04 §15.3 | Matches brief and seed. |
| `cheat.*` commands and debug API | GDD 01 App B; Index §B9 | Flag-guarded, not player-facing. |

## 4. Tier notes (not gaps)

Brief items that the GDD fully realises only after Tier 1, so a T1 build will not show them: aphid honeydew ranching (T2), weather, seasons and human activity (T2), neighbouring colonies and creatures (T2), milestones and journal (T2), queen-death succession and Lineage (T2), species other than Lasius (T3). This follows Seed §5 and is consistent with the brief's "eventually". The milestone for T1 is a Lasius colony that founds, forages sugar and carcasses, digs and survives.

## 5. Prioritised gaps and editor instructions

Priority reflects distance from the brief's confirmed direction (high) versus working choices and open items (medium, low).

### High

**G1. Queen as the doorway to colony orders** (brief §1, §2, §3; Dir A). The GDD makes orders reachable everywhere, which is good for pillar 3, but drops the brief's confirmed link between the queen and orders.
- GDD 01 §2 (view table) and §5.2: when the queen is possessed after hand-over, add a context prompt "I  Colony orders" that opens the Directives drawer, and state that `colony-view` (M) from queen possession keeps the queen on autonomy (already GDD 08 §14).
- GDD 01 §10: add a "Colony orders" button on the queen's inspect card (Observer or Colony view).
- GDD 08 §4.1-4.2 and §5.2: the possessed-ant panel for the queen shows "Colony orders (I)"; Directives remains reachable from any view; say "the queen is the entry point, not a requirement".
- GDD 08 §9.2: tie `hint-directives` to the first possession of the queen after hand-over.
- GDD 02 §12 intro: one sentence that orders are issued "through the queen" as a gameplay abstraction (see G2).
- Add an acceptance check to GDD 08 App E: given the queen possessed after hand-over, pressing `I` opens Directives and the colony allocation is unchanged until a slider moves.
- **Status: closed (E-100).** GDD 01 §2 (paragraph "The queen as the doorway to colony orders"), §5.2 (queen note), §9.2 (standing "I  Colony orders" line), §10 (queen inspect-card button); GDD 08 §1 layer D, §4.2 (entry point, not a requirement), §5.2 ("Colony orders" row), §9.2 (`hint-directives` on first queen possession; stale `[B]` key corrected to I), App E 26; GDD 02 §12 intro.

**G2. Say, in play, that queen orders are an abstraction** (brief §3, S3; Seed §1). 
- GDD 02 §0.3: add deviation D10 "Directives and markers are a deliberate abstraction of decentralised regulation; allocation still resolves through local thresholds (§6.4)".
- GDD 06 §10: add codex entry `cx-interface-orders`, "Orders without a commander", unlocked on the first `setDirectives` or marker. Two-sentence note citing Gordon 2007: real colonies coordinate through local encounters and chemical cues, a queen does not issue orders, species differ; in FOUNDRESS the panel and markers are a simplification. Register the id in Index §B6 and mirror in GDD 08 §9.4.
- GDD 08 §4.2: one-line tooltip on the panel title linking to that entry.
- **Status: closed (E-101).** GDD 02 §0.3 D10; GDD 06 §10 row `cx-interface-orders` "Orders without a commander" (57 rows; unlocks on first `setDirectives` or `placeMarker`); GDD 08 §4.2 title tooltip, §9.4; Index §B6.

### Medium

**G3. Make quiet periods a designed outcome** (brief §5; Seed pillar 6).
- GDD 05 §6: add invariant I11 "quiet share": in Naturalist, at least 60 % of daytime game hours in any 3-GD window (outside founding and winter) contain no active major threat and no alert at or above `warning`. Add a soak check to GDD 05 App E. Gentle raises it, Harsh lowers it, through the existing difficulty levers.
- GDD 01 §6.6: add an optional observer "ambient watch" (T3): HUD hidden, the camera follows a forager, digger or nurse and switches target every 20-40 real seconds; any input exits.
- GDD 08 §3.4 and §7.4: add a setting `milestoneNotices` (full, quiet, off; journal always records) and state that with the HUD hidden (H) only `critical` alerts show.
- **Status: closed (E-102).** GDD 05 §5 (`QUIET_SHARE_MIN` row), §6 I11, App E 25; GDD 01 §6.6 ambient watch (`obs-ambient`, T3); GDD 08 §3.4 (HUD hidden: only `critical`; `milestoneNotices`), §6.3, §7.4, App A, App E 27; Index §C10.

**G4. Continuing goals after hand-over** (brief §5). GDD 06 §5.13 aims stop after the first weeks. Add aims in the same naturalist-question voice, each tied to an existing milestone in §8:
- `aim-second-entrance` (`ms-second-entrance`; 25 workers); `aim-cross-zone` (`ms-zone-crossed`; stage `growing`); `aim-herd` (`ms-first-aphid-herd`; Lasius, T2); `aim-alates` (`ms-first-alate`; stage `mature` in a rearing season); `aim-flight` (`ms-first-flight`).
- Update Index §B6 aims list and GDD 08 §9.2; keep at most 3 shown.
- **Status: closed (E-103).** GDD 06 §5.13 (five aims plus open-aim rules); GDD 08 §9.2; Index §B6.

**G5. State the performance contract in the GDD** (brief §7, §8). Add a short "Performance contract" paragraph to GDD 08 §0 and Index §A: integrated-GPU laptop, 1080p, 60 fps at Medium (Seed §1); presets Low to Ultra, Auto and dynamic resolution (§7.4); `diag-perf` thresholds (p95 frame at most 18 ms); simulation budget `SIM_FRAME_BUDGET_MS` 10 (GDD 06 §4.3); ants under 2500 (Dir K). Point to the chapter budgets (GDD 02 App F item 10; GDD 03 §16; GDD 04 §4.1).
- **Status: closed (E-104).** GDD 08 §0 "Performance contract"; Index §A and §C2.

**G6. State the animation approach** (brief §8). Add GDD 08 §11.9 "Animation": ants and creatures are animated procedurally, with no authored skeletal clips; gait phase, speed, pose, carried item and colour are per-instance render attributes driven from sim state; `pose.*` ids (GDD 01 §7.3) are blend targets; reduced-motion rules apply; render never writes sim state. Cross-reference Seed §4.
- **Status: closed (E-105).** GDD 08 §11.9 "Animation".

### Low

**G7. Species release order** (brief §3). GDD 07 §1: add a "Build and release order" line: T1 Lasius, then Camponotus, Messor, Atta (complexity 2, 2, 3; each adds one economy module), with data-only variants (*C. herculeanus*, *M. structor*, *Acromyrmex*) after. State that the order is adjustable. Mirror in Index §A tiers and GDD 08 §3.7 (cards for unreleased species show "not yet available").
- **Status: closed (E-106).** GDD 07 §1 "Build and release order"; GDD 08 §3.7; Index §A (Tiers).

**G8. Naturalist wording for conflict** (reverse check). GDD 08 §6.4 and §10.2: add a wording rule for player-facing text: relation states display as Neutral, Wary, Clashing, Territorial dispute, Lull (ids `peace`, `tension`, `skirmish`, `war`, `truce` unchanged); "overcome" instead of "defeated"; "opponent" instead of "enemy". Retitle `cx-pavement-wars` as "Boundary disputes on the slabs" in GDD 06 §10; adjust `ms-first-rival-defeated` display title and the epitaph "figures" row in §13.5.
- **Status: closed (E-107).** GDD 08 §6.4 conflict wording rule, §10.2, §14; GDD 06 §10 (`cx-pavement-wars`, `cx-formica`), §13.5; GDD 05 §3.7 note; Index §B5. `ms-first-rival-defeated` already displays "A rival repelled", so no title change was needed.

**G9. Distant voices** (reverse check). GDD 08 §13.4, §13.6 and §7.4: require `playground_distant` to be an unintelligible, low-passed texture with no discernible speech (check at asset acquisition); make the synth murmur the default and "Distant voices" opt-in; add a line to §11.8 and the asset-manifest checklist.
- **Status: closed (E-108).** GDD 08 §7.4, §11.8, §13.4, §13.6, §13.7 (asset acquisition checklist), App E 28; Index §F risk 17.

**G10. T1 Lasius is honeydew-light** (brief §3; tier note). GDD 07 §5.1 and GDD 05 §0: state explicitly that aphid herds arrive at T2, that T1 places static `honeydew-film` sites, and that the first-honeydew codex entry unlocks on a T1 find. No change to tiers is required.
- **Status: closed (E-109).** GDD 05 §0 (`T1_HONEYDEW_SITES`) and §1.2 row; GDD 07 §5.1.5 (diet row and "Honeydew by tier"); GDD 02 §4 row; Index §C4. The static sites were a new T1 rule because no T1 honeydew existed before.

**G11. Home breadth** (brief §2, §6). GDD 04 §1.3: note that the kitchen-and-utility slice is the launch representation of "people's homes" by design, and list a second interior room variant (pantry or conservatory) as a T3 stretch so the Index and brief agree on scope.
- **Status: closed (E-110).** GDD 04 §1.3 "People's homes at launch".
