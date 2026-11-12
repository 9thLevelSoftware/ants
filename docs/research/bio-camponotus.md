# Biology dossier: carpenter ants (Camponotus pennsylvanicus, black carpenter ant)

Status: research input for the FOUNDRESS design and simulation parameters. BU = 9 mm. Date of research: 2026-11-12.

Conventions: numbers cite sources as [S#] (list at the end). "not found" means a search of reachable literature did not give the value; "ESTIMATE" marks a value I chose, with the reasoning. Where sources disagree the range is shown and the disagreement is noted. Several primary papers could not be opened (paywalls, blocked hosts); those facts come from open reviews that cite them and are flagged "via". Many detailed field studies were done on congeners (C. modoc, C. vicinus, C. herculeanus, C. floridanus, C. rufipes); they are flagged "genus-level" and are used only where C. pennsylvanicus data are missing.

Verification status (2026-11-12): an adversarial pass re-opened S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12 and the abstract of S15 and checked the 15 most gameplay-relevant claims plus extras; see "Verification log" at the end. Corrections from that pass are marked "(corrected)" or "ESTIMATE" in place. S13 was only reachable as a Crossref abstract summary; S14, S16-S20, S23, S25 were not re-opened.

---

## 1. Identity and morphology

| Trait | Value | Source / note |
|---|---|---|
| Taxonomy | Formicinae, genus Camponotus, subgenus Camponotus; native to the central and eastern USA and eastern Canada | [S9] |
| Colour | Dull black head and body, fine whitish or yellowish hairs on the gaster; all castes black or blackish; alate wings transparent with prominent veins [S4] (yellowish tint: [S9] only, flagged "citation needed" there, low reliability) | [S4][S9] |
| Waist | One node (petiole) between thorax and gaster; evenly arched thorax in profile (no dip, unlike Formica) | [S4] |
| Weapon | No sting. The sting is converted to an acidopore (formic acid spray) with a fringe of hairs around the opening; strong mandibles; "bite then acid into the wound" | [S4][S7] |
| Antennae | Elbowed, 12 segments in workers | [S9] |
| Polymorphism | Strong, continuous size variation: minor, media (intermediate), major, rare "super majors"; first-brood workers are small and uniform ("nanitics") | [S1][S4][S7] |

Sizes by caste (mm). Sources disagree: worker total range is 5-16 mm [S5], 6-13 mm (retail/hobbyist summaries), 6-16 mm (1/4 to 5/8 in) [S8]; extension service quotes minor about 1/4 in (6.4 mm) and major about 1/2 in (12.7 mm) [S4]; super majors 14-17 mm [S9]. Queen: about 19 mm [S5], 19-21 mm [S9], but 9/16 in (14 mm) in [S8], so the larger value is more likely and is used here.

| Caste | Length (mm) | Length (BU) | Note |
|---|---|---|---|
| Nanitic (first brood) | 5-7 (ESTIMATE; "minor, little size variation" [S1]) | 0.55-0.8 | Only worker type in year 1 |
| Minor | 6-8 | 0.7-0.9 | Small head, long appendages [S20 genus-level] |
| Media (BU standard worker) | 9-11 | 1.0-1.2 | Reference = 9 mm |
| Major | 12-15 | 1.3-1.7 | Enlarged head, mandibles; guards |
| Super major (rare) | 15-17 | 1.7-1.9 | 14-17 mm [S9]; [S5] and [S8] cap workers at about 16 mm (1.6 cm; 5/8 in = 15.9 mm) (corrected: the earlier "[S8] 16-17" was not in S8) |
| Queen (dealate) | 19 (14-21) | 2.1 | Physogastric when laying |
| Alate female | 17-19 (ESTIMATE) | 1.9-2.1 | Dry mass 56.8 +/- 12.3 mg [S6] |
| Alate male | 9-11 (ESTIMATE: "tiny head, much smaller than females" [S4]) | 1.0-1.2 | Dry mass 9.3 +/- 4.3 mg [S6]; a female costs 6.1x a male |

Dry masses of workers: not found. ESTIMATE for game energetics: minor 2 mg, media 7 mg, major 16 mg (assumes mass roughly proportional to length cubed and anchored on the alate masses above).

## 2. Life cycle, development times and lifespan

Holometabolous; larvae are legless grubs that spin tough tan silk cocoons (the "ant eggs" seen by homeowners); eggs clump with fine hairs so the queen can carry the whole clutch [S4][S7]. Adults do not grow [S8]. Overwintering stage is the larva (no overwintering as egg or pupa) [S7].

| Stage | Duration (days) | Source |
|---|---|---|
| Egg | 14-21 (2-3 weeks); 18-25 | [S1][S5] |
| Larva | 14-21; 14-25 | [S1][S5] |
| Pupa (cocoon) | 14-21; about 25 | [S1][S5] |
| Egg to worker, spring brood | 55-70 (S1 states this for colonies in their second year and older; for a founding queen use the 66-day figure below) | [S1] |
| Egg to worker, single estimate | about 66 | Pricer 1908 via [S7] |
| Hobbyist report, 24 C | 36 (low reliability; contradicts the above) | https://www.formiculture.com/topic/2554-care-sheet-camponotus-pennsylvanicus |
| Late-summer brood | Overwinters as larva (diapause), resumes in spring; workers eclose in June-July | [S1][S4] |

Temperature dependence: no C. pennsylvanicus rate-vs-temperature table found. What is documented: brood develops faster in the warmer, drier satellite nests [S1][S4]; the colony enters diapause in September-October and breaks it March-June depending on latitude [S3]; foraging stops below about 5 C [S5]; colonies kept at constant temperature do not overwinter [S5]. ESTIMATE used in the game: development rate = 0 at <=10 C, rising linearly to 1.0 at 24 C, plateau 24-30 C, falling to 0 at 36 C (heat injury).

Lifespans: queen over 10 years [S5], up to 15 years [S8]; workers about 0.5 to 7+ years [S5]; males die within weeks of mating [S5]. Worker age structure: not found.

## 3. Colony founding

Mode: independent, single-queen (haplometrotic), fully claustral (Pricer 1908, Benois 1972, Hansen and Akre 1985, all via [S1]). Carpenter ants are one of the few boreal/temperate genera where solitary queens found independently [S18]. Pleometrosis (several queens) is documented in Camponotus [S25, title only] but is rare for this species; not modelled.

| Step | What happens | Duration | Source |
|---|---|---|---|
| 1. Mating flight | Male mandibular-gland pheromone triggers female flight; mating in the air; males die | Flight window March-July, mode in May (111 founding queens collected) | [S6][S3] |
| 2. Site choice | Queen drops wings and finds a small cavity in moist, decayed wood or under bark. "Her nest has to be in a moist location" | Hours to days | [S4] |
| 3. Sealing and first clutch | Lays 9-16 eggs (another source: 5-15) in a clump; first egg-laying lasts "several days" [S1] | "several days" [S1]; "about 1 week" is an ESTIMATE | [S7][S5][S1] |
| 4. Claustral care | Queen eats nothing; metabolises fat body and flight muscles; feeds larvae from this | Eggs hatch in 2-3 weeks; larva 2-3 weeks; pupa 2-3 weeks | [S1][S4] |
| 5. First workers | Queen helps each worker out of its cocoon. Workers are small, uniform minors; they enlarge the nest, forage and tend brood | about 66 days after laying (late July-August) | [S1][S7] |
| 6. Second brood | Queen lays again when the first brood reaches the prepupal stage (late July-August) | | [S1] |

First-summer worker count: 4-25 workers (Pricer 1908, Mintzer 1979, Hansen and Akre 1985 via [S1]). Hobbyist reports of 30+ to 100 workers in the first year are for captive, fed colonies and are not used. Founding mortality: not found. ESTIMATE: well under 10 percent of founding queens produce a colony that survives the first winter (typical for claustral ants; sets the tone of the opening, see section 12).

## 4. Colony growth, mature size, reproduction

| Quantity | Value | Source |
|---|---|---|
| Growth | Slow. Year 1: 4-25 workers. Intermediate and major workers do not appear until the third season | [S1][S7] |
| Age at first alates | 3.5-4 years [S4]; 3-6 years, depending on mono- vs polygynous founding [S7]; 6-10 years [S1, stated for Camponotus in general, from Hansen and Akre 1990, whose data are Pacific Northwest congeners]; usually over 8-10 years [S3]; up to 6 years to "fully mature" [S8]. Sources disagree; latitude and queen number matter | |
| Mature size, workers (this species) | 2,000-4,000 [S4]; about 3,000 [S7]; 2,000-3,000 [S8]; 3,000-6,000 average for most carpenter-ant species (Fowler 1986, via [S1]); total 10-15,000 incl. satellites in pest-trade sources (low reliability) | |
| Congeners (genus-level) | C. herculeanus 12,000 [S1][S7]; C. modoc up to 50,000; polygynous C. vicinus over 100,000 [S1] | |
| Alates per colony per year | 200-400 [S8]. NJ whole-colony collections in early spring [S6]: queenright colonies 260-1,120 alates (n=5), queenless colonies 75-437 (n=3), all eight 75-1,120 (corrected: earlier text gave only the queenright range). Pricer 1908 colonies: 206-370 | |
| Sex ratio | Males 36-50 percent in older data, about 56 percent (queenright) in NJ; 82 percent in queenless colonies (workers lay male eggs) [S6] | |
| Queens | Monogynous (one inseminated queen); extra uninseminated queens possible in other species [S2] | [S3] |
| Egg-laying | Two windows a year: late winter/early spring and late summer. Spring eggs make workers and the sexuals that emerge in August-September; late-summer eggs overwinter as larvae and make workers the next June-July | [S1][S4][S8] ([S5] says the opposite for sexuals, that August-September eggs make them; S4, S8 and S1 agree with each other, so the S5 statement is treated as an error) |
| Queen fecundity (eggs per day) | not found. ESTIMATE in section 12 | |

## 5. Nest: substrate and architecture

Substrate: moist, softened or decayed wood in living trees (through wounds, scars, knotholes, decayed heartwood), dead trees, stumps, logs, buried wood, firewood, railroad ties, landscaping timber, and structural timber [S1][S2][S4]. Ants are not termites: they do not eat wood; they chew it and carry it out [S2][S4]. They infest both sound and rotted wood, but avoid trees under 15.2 cm diameter and wood in advanced rot (Sanders 1964 via [S7]). They do not cause the decay; they favour already-damp, soft wood [S4] (https://mortonarb.org/plant-and-protect/tree-plant-care/plant-care-resources/carpenter-ants/).

Architecture:
- Galleries irregular, mostly along the grain through the softer layers; harder layers remain as walls between galleries; walls smooth, "sandpapered" [S1][S4]. No soil in the galleries (contrast with termites) [S4].
- Runways cut through wood or between adjacent timbers to the outside; entrances ("windows") are small openings through which frass is dumped [S1][S4].
- In trees, galleries can extend 10 m above ground (C. herculeanus, genus-level) [S12].
- Ground-level tunnels through litter: 1.5-3 cm diameter, 1 cm to over 1 m deep, lined with packed wood chips and soil; trails of 185 m and 200 m measured (genus-level, C. herculeanus, C. modoc) [S1].
- Soil and stones are only brood incubators; the true nest is the decaying roots or buried wood under them. Brood may be moved into soil or rocks in winter for thermoregulation [S1][S7].
- Chamber and gallery dimensions for C. pennsylvanicus: not found. ESTIMATE: galleries 1.5-3 cm (matches the tunnel figure above), chambers 4-10 cm.

Parent and satellite nests (this is the key structural fact):

| | Parent (main) nest | Satellite nest |
|---|---|---|
| Contents | Queen, eggs, small larvae, workers | Workers, mature larvae, pupae, alates; no queen |
| Environment | High, constant humidity; wood moisture above 15 percent; damp decayed wood, often a hardwood cavity | Drier, warmer; speeds larval and pupal development; often solid dry wood or a building void |
| Typical place | Outside: tree, stump, buried or landscape wood | In or near structures: wall voids, hollow doors, attics, under insulation, crawl spaces, even Styrofoam |
| Number | 1 | 2-25 inside a structure [S2]; outdoors up to 8 satellites (C. herculeanus and C. noveboracensis, Sanders 1964), usually up to 5 sites for C. modoc and C. vicinus, 20-25 reported for C. modoc from pest-control data [S1] (corrected: "4-8" was not a figure in S1); 1-6 trees per colony [S5]; "about two trees" on average in a suburban study [S13, abstract summary; the exact mean 1.95 was not re-confirmed] |

Sources: [S1][S2][S4]. Satellites are perennial (60,000+ empty pupal cases recovered at one C. modoc site) and contain 200 to over 12,000 workers in C. modoc (genus-level) [S1]. Workers carry brood between satellites and travel between satellites and parent [S4]. Territory 6-28 m2 (mean 16.3 m2) over 1-6 trees [S5]; C. herculeanus networks up to 830 m2 [S1].

## 6. Diet, nutrition and the colony economy

Omnivore. The resource chain is **honeydew (carbohydrate, workers) -> prey and protein (nitrogen, brood) -> frass out**.

| Item | Facts | Source |
|---|---|---|
| Energy | Carbohydrate is the primary worker energy source. Honeydew from aphids and scale insects is the preferred common food; also plant juices, nectar, fruit, honey, jelly, sugar, syrup | [S4][S5] |
| Protein | Live and dead insects, caterpillars, meat, grease. Larvae need protein; quantity and quality of nitrogen limit growth | [S4][S5] |
| Seasonality | Virginia field study: protein collection peaked in June and September, when older larvae are in the nest. Protein early in the season, carbohydrate from midsummer | [S4][S5] |
| Intensity | "Overall, nitrogenous food was collected four-fold more intensively than carbohydrate", though crop nitrogen was about half the carbohydrate level; peaks in nitrogen foraging in June and September (verified in the abstract, Cannon and Fell 2002 thesis record) | [S15] |
| Preferences | Sucrose preferred over other sugars in lab and field tests; peak consumption at 20 percent sugar; lipids largely ignored (all verified in the S15 abstract). "Casein hydrolysate and fish products best protein stimulants": not re-verified, treat as low reliability | [S15] |
| Human food | Honey, tuna, hot dogs, cookies, sugary and greasy kitchen items | [S5][S4] |
| Wood | Not eaten | [S4] |
| Symbiont | Camponotus carry the endosymbiont Blochmannia, which supplies essential amino acids and may recycle urea nitrogen. Function shown in C. floridanus (genus-level); [S5] lists Blochmannia pennsylvanicus as an obligate nitrogen-metabolising endosymbiont of this species; without it brood suffers on poor diets | [S16][S5] |
| Liquid storage | Honeydew moves by trophallaxis; in other Camponotus majors store more liquid per head than minors (genus-level, C. fraxinicola) | [S20 via] |
| Foragers per colony | Only 2-3 percent of workers are outside (two C. herculeanus colonies, Ayre 1962); under 1 percent in C. nylanderi (genus-level, both via [S1]). No C. pennsylvanicus figure found | [S1] |

Quantitative colony budget: not found. Game values (ESTIMATE) are in section 12.

## 7. Foraging

| Parameter | Value | Source |
|---|---|---|
| Rhythm | Mostly nocturnal. Large numbers leave "very soon after sunset"; peak 8 p.m. to 4 a.m. (C. modoc); majority of C. pennsylvanicus forage at night in June-July | [S4][S1][S7] |
| Environmental control | New Jersey: humidity and temperature governed activity in June and August, time of day in July (Fowler and Roberts 1980 via [S2]). More ants emerge on warmer nights; a heavily fed colony shows less activity than temperature predicts | [S2][S19] |
| Cold limit | Inactive below about 5 C except on unusually warm days; inactive in winter and in the hottest mid-afternoon | [S5] |
| Speed vs temperature | Moves faster at cool temperatures than Formica subsericea, which is why it can dominate honeydew sources at night. Absolute speed: not found (running speed on rough surfaces drops once roughness reaches about a third of body length, abstract only: https://esa.confex.com/esa/2014/webprogram/Paper87920.html) | [S14] |
| Range | Up to 100 ft (30 m) [S4]; up to 100 yd (91 m) [S9]; up to 300 ft (91 m) [S8]. Trails of 185-200 m measured in congeners | [S1] |
| Where | Along tree trunks, branches, vines, wires, fences, firewood piles, logs, through lawn; in buildings along wiring and plumbing | [S4][S2] |
| Trails | Chemical hindgut trail pheromone [S7]; in a Hartwick 1977 bioassay 85 percent of workers followed the rectal (hindgut) trail versus Dufour's and poison-gland trails; David and Wood 1980: chemicals alone are enough to keep a trail followed, and visual cues can help re-create a disturbed trail; light changes in direction or intensity "can cause confusion" while odour "may in fact be the more important cue" (S7 calls the light results "less conclusive"; corrected from "trail pheromone alone drives recruitment"). Also light compass (sun, moon, even streetlights), landmarks, structural guidelines [S2]; [S5]: follows light sources at night | |
| Trunk trails | Congener evidence (C. rufipes): trails that use fallen branches as bridges persist for months and favour speed over distance [S17] | |
| Trail pheromone chemistry | Dufour's gland: n-undecane, n-tridecane; the active hindgut trail substance is unresolved in C. pennsylvanicus [S7] | |
| Food handling | Prey carried in mandibles; liquids carried in the crop and shared by trophallaxis [S4] | |

## 8. Castes and division of labour

| Caste | Documented roles | Source |
|---|---|---|
| Queen | Lays eggs; helps first workers eclose; nothing else; stays in the parent nest | [S4][S1] |
| Nanitic / minor | Brood care, nest enlargement and maintenance, trophallaxis; the whole workforce in year 1 | [S4][S1] |
| Media | Intermediate; foraging and nursing; BU standard (role mixed, not quantified) | [S4] |
| Major | Guard the nest, battle intruders, forage; large heads and mandibles | [S4][S9] |
| Smaller foragers + larger carriers | Small workers collect honeydew from aphids and hand it to larger workers who carry it home (low-reliability source) | [S9] |
| Alates | Produced from late summer in mature colonies; overwinter in parent or satellite | [S3] |

Size is set by larval nutrition: richer food gives wider size variation, and intermediate and major workers only appear in the third season [S7]. Workers also pull new adults out of cocoons once the colony is bigger [S1]. Worker laying of male eggs happens in queenless colonies [S6]. Proportions of minor:media:major in a mature colony: not found; ESTIMATE 50:38:12.

## 9. Communication and defence

| Mechanism | Detail | Source |
|---|---|---|
| Alarm by drumming | Workers strike mandibles and abdomen against gallery walls; loud enough to hear; a dry rustling similar to crinkling cellophane marks an active colony; chewing is audible. In C. ligniperda the drumming draws nearby workers toward the source and makes them more aggressive | [S4][S10] |
| Formic acid | Sprayed or smeared via acidopore, or applied to a bite wound; in formicines it can be about 70 percent of the spray (secondary coverage) | [S4][S23 via] |
| Bite | Majors give a sharp bite; congener majors can decapitate small arthropods and workers of other ant species | [S4][S10][S11] |
| Trail and recognition | Hindgut trail pheromone; male mandibular-gland flight pheromone | [S7][S3] |
| Trophallaxis | The social bond: food flows worker to worker, to larvae and to the queen | [S1][S4] |

## 10. Seasonal cycle and nuptial flights

| Period | State | Source |
|---|---|---|
| Aug (first week) | Alates eclose (lab C. modoc; spring-laid eggs give sexuals in Aug-Sept) | [S3][S4] |
| Sept-Oct | Diapause begins; queen, workers, larvae dormant | [S3][S1] |
| Winter | Alates stay in the nest. Males emerge before females, as early as December in heated structures. Males and some females make sporadic weak flights to windows and lights | [S3] |
| Late winter-spring | Larvae break diapause; queen resumes eggs when larvae reach the prepupal stage | [S1] |
| March-July | Nuptial flights. New Jersey: founding queens collected early March to mid-July, mostly May (53 of 111 captures in May; 5 March, 23 April, 28 June, 2 July); no synchronised mass flight detected; alates leave individually and ascend until out of sight [S6]. [S1] nevertheless lists "major swarms" mid-April to mid-June for C. pennsylvanicus (Pricer 1908) as well as C. modoc, C. vicinus and C. herculeanus (corrected: the earlier text credited swarms only to C. herculeanus); [S7] gives April-June; [S4] March-July; [S5] "usually in the summer, often in July" (outlier). Males and queens summoned by male mandibular-gland pheromone [S1] | [S6][S1][S3][S4][S5][S7] |
| Triggers | Temperate-latitude flights are short and tied to weather events (first rain, very hot day); photoperiod, temperature, humidity and day length cited. Time of day: not found for this species. Hobbyist flight logs report 70-77 F, calm wind, a few days after rain (low reliability: https://formiculture.com/topic/12908-best-conditions-for-camponotus-flights) | [S7] |
| Late spring-summer | Spring brood develops (55-70 days); nitrogen foraging peaks in June | [S1][S4] |
| Late summer | Second laying; late-summer larvae overwinter | [S1] |

Heated buildings: nests in heated areas can stay active all winter [S4]; this breaks the diapause and also draws alates out early [S3].

## 11. Enemies, parasites, competitors, pathogens, hygiene

| Threat | Effect | Source |
|---|---|---|
| Birds | Predators; nocturnal habit lowers predation versus other carpenter ants | [S5] |
| Phorid fly Apocephalus concisus | Attacks workers; larva can decapitate the host | [S5] |
| Phorid Trucidophora camponoti | Parasitises winged females | [S5] |
| Fluke Brachylecithum mosquensis | Infected ants sluggish, swollen, more visible to birds | [S5] |
| Fungus Ophiocordyceps unilateralis | Kills ants | [S5] |
| Red mites (Uropoda) | Found on colonies; effect unknown | Pricer 1908 via [S7] |
| Competitors | Formica subsericea at honeydew; carpenter ant dominant, partitioning mainly by time of day; competition with Formica shapes activity | [S14][S7] |
| Moisture loss | Dried parent nest = brood failure; moisture is "required for survival of the parent nest" | [S4] |
| Humans | Vacuuming nests, insecticide, bait, repairing leaks, replacing rotten timber, cutting stumps; the queen must be killed to end a colony | [S4][S2] |

Hygiene and waste: workers carry wood shavings out and deposit them outside, forming piles under the "windows"; shavings look like pencil-sharpener shavings and contain insect parts, empty seed husks and food remnants, so frass doubles as the midden [S4]. Frass crumbles; it is a visible sign [S4]. Faeces: rectal material is 14 percent solids; ammonia, kynurenic and xanthurenic acid, and biopterin are identified in it [S7]. Dead-ant (necrophoresis) behaviour: not found for this species; ESTIMATE: dead nestmates go to the frass pile.

## 12. GAME TRANSLATION

Calendar (design seed): 1 game day = 10 real minutes at 1x = 600 s of sim time = 6,000 ticks; year = 28 days; spring days 1-7, summer 8-14, autumn 15-21, winter 22-28. One game day is about 13 real days. Walk speed 12 BU/s (108 mm/s).

Calendar mapping (spring day 1 = Mar 20):

| Real event | Real date | Game year-day |
|---|---|---|
| Diapause break, larvae resume | Mar-Apr | 1-2 |
| Spring egg-laying window | Mar-Apr | 2-3 (about 0.7 day) |
| Nuptial flight window | Mar-Jul, mode May | 1-9 (mid-March to mid-July = start of year to day 9.3), peak 4-6 (May) (corrected from 3-9 / 5-6: day 3 only starts on Apr 15 and 53 of 111 captures were in May, days 4.2-6.5) |
| Foraging at full night rhythm | Jun-Aug | 7-13 |
| First workers of a founding queen (66 d after a day-5 flight) | late Jul | about day 10 |
| Alate eclosion | early Aug | 11 |
| Second egg-laying window | late Jul-Aug | 11-13 |
| Diapause entry | Sep-Oct | 15-17 |
| Dormancy | Nov-Feb | 18-28 (winter time-lapse 22-28) |

Stage durations in game days (at 24-30 C brood temperature; 1 game day = 13.04 real days):

| Stage | Real days | Game days |
|---|---|---|
| Egg | 18 (14-25) | 1.4 (1.1-1.9) |
| Larva | 21 (14-25) | 1.6 (1.1-1.9) |
| Pupa | 25 (14-25) | 1.9 (1.1-1.9) |
| Egg to adult | 64 (55-70) | 4.9 (4.2-5.4) |
| Major larva | +15 percent (ESTIMATE, hobbyist "majors slower") | 5.6 |
| Founding to first workers | 66 | 5.1 (skippable time-lapse of about 60 s) |
| Diapausing larva | resumes day 1-2, adult in June-July = days 7-10 [S4] (corrected from "6-8": June 6 to July 28 is days 7-10) | |

Species data (all ESTIMATE unless cited):

| Parameter | Value | Basis |
|---|---|---|
| BU | 9 mm | seed |
| Queen lifespan | 12 years = 336 game days (56 real hours at 1x) | [S5][S8] |
| Worker lifespan | mean 3 years = 84 game days, wide spread | [S5]; mean ESTIMATE |
| Dev rate vs nest temperature | 0 at <=10 C, linear to 1.0 at 24 C, 1.0 to 30 C, to 0 at 36 C | section 2 |
| Foraging gate | 0 below 5 C; rises with temperature; sunset onset, peak 20:00-04:00 | [S5][S1] |
| Parent nest wood moisture | Cited fact: the parent nest is "associated with wood moisture greater than 15 percent" [S4], carpenter ants "prefer wood with a moisture content of 15% or higher" [S8], and constant high humidity is needed for egg and young-larva development [S1]. These are associations, not measured hatch thresholds. ESTIMATE (game rule): full egg and young-larva survival at or above 15 percent, dropping linearly to 0 at 8 percent; above 30 percent a mould penalty (no source, ESTIMATE) | [S4][S8][S1] |
| Satellite preferred | "Drier, warmer" than the parent, which speeds larval and pupal development [S1][S2][S4]. The numbers moisture 8-18 percent and 2-4 C warmer are ESTIMATES (not in any source) | [S1][S4] |
| Tunnel width / chamber width | 2 BU / 5-12 BU. Tunnel 2 BU matches the seed (about 2 BU) and real 1.5-3 cm tunnels [S1] (1.7-3.3 BU). Chamber 5-12 BU is an ESTIMATE from 4-10 cm (4.4-11 BU) and is narrower than the seed's generic 8-16 BU (seed section 3); this is a deliberate species override, to be confirmed in the GDD (corrected: it was labelled "seed") | seed section 3, [S1] |
| Max foraging radius | soft cap 1,200 BU (10.8 m); typical trunk-trail targets 200-800 BU. Real reach (up to 30 m [S4], up to 91 m [S9]) is 83 percent of, and 2.5 times, the 4,000 BU (36 m) map width respectively (corrected: only the 91 m figure exceeds the map); a real 30 m one-way trip is 3,333 BU = 278 s at 12 BU/s, which does not fit a night window of about 200 s (20:00-04:00 = 8/24 of 600 s), so distances are compressed | [S4][S9] |
| Colony footprint | parent plus up to 4 satellites within 600 BU of each other (real 6-28 m2 territory is about 0.5 percent to 2 percent of the map area) | [S5] |
| Forager share of workers | 3 percent default is supported (2-3 percent in C. herculeanus, under 1 percent in C. nylanderi [S1]); the 1-12 percent slider range is an ESTIMATE for gameplay (real data top out near 3 percent) | [S1] |
| Size classes (maturity) | 50 percent minor, 38 media, 12 major; year 1 all nanitic | ESTIMATE; [S7] |
| Caste unlock | minor from year 1 (nanitic), media and major from third season | [S7] |
| Alates | first at colony age 4 years (Gentle 3, Harsh 6-8) [S4][S7][S1]; 30 to 140 per year = real 260-1,120 queenright NJ colonies [S6] scaled 1:8 (corrected from "20 to 150": 260/8 = 33, 1,120/8 = 140). Note that 1:8 is a separate design choice from the 1:3 worker scale below, made to limit flight crowding | [S4][S6][S7][S1] |
| First brood | 9-16 eggs [S7]; 4-25 first-year workers [S1]; hatch/survive rate 70 percent is an ESTIMATE (no source; 9-16 x 0.7 = 6-11 workers sits inside the cited 4-25) | [S7][S1] |

Colony-size scaling. Real mature colonies hold about 3,000 workers (2,000-4,000 [S4]); with satellites perhaps more. To stay within the 1,500 sim-worker cap while keeping the early game honest: 1 sim worker = 1 real worker up to 300 workers, then 1 sim worker = 3 real workers above that. So 3,000 real = 300 + 2,700/3 = 1,200 sim. Hard cap 1,500 sim (about 3,900 real) in the large setting. Appetite and carrying are defined per sim worker (the scale-down is folded into the economy numbers below). Foragers are 3 percent of that (about 36 at maturity), so the colony stays mostly hidden inside the wood, which is the species' look.

Growth targets (ESTIMATE anchored on [S1][S4][S7]): end of year 1: 12 (range 4-25); year 2: 60; year 3: 300 (first media and majors); year 4: 1,000 real = 530 sim (first alates); year 5: 2,500 real = 1,030 sim; mature from year 5-6. Tension to note (not changed, ESTIMATE): [S4] describes colonies of 2,000-4,000 individuals producing swarmers once 3.5-4 years old, while this table has only 1,000 real workers at the year-4 first alates; the game is deliberately slower, consistent with [S1] (6-10 years) and [S8] (up to 6 years to maturity). At 8x with winters skipped this is a long-form game by design; an "established colony" start in a stump (year 3) should be offered as a scenario.

Economy rates (CU = carbohydrate unit, NU = nitrogen unit; all ESTIMATE):

| Item | Value |
|---|---|
| Worker upkeep per game day | minor 0.4 CU, media 1.0 CU, major 1.9 CU (allometric, mass^0.75) |
| Queen upkeep | 6 CU per game day |
| Larva upkeep | 0.8 CU per game day, plus NU growth cost |
| NU to build one adult | minor 1, media 3.5, major 8, female alate 28, male alate 4.6 (mass ratios, section 1) |
| Nitrogen demand | follows larvae present; peaks near days 7 (June) and 14 (September) |
| Honeydew source (aphid or scale colony on a tree) | 0.3-1.5 CU per night while the plant is alive; depletion as the host declines |
| Prey item | 0.5-4 NU by size; carried by a major or two workers |
| Wood excavation | cost in worker-seconds per voxel: rotten wet 1.0, sound wet 2.5, sound dry 4.0 |
| Frass | 1 pellet per voxel excavated, ejected through a "window"; 10 pellets = 1 visible pile unit |
| Queen laying | two windows of 0.7 game day (spring and late summer). Corrected arithmetic: with a mean worker lifespan of 3 years (84 game days) a mature 1,200-sim-worker colony must replace 1,200/3 = 400 workers per year, plus about 60 alates = 460 adults per year; at 70 percent egg-to-adult survival that is about 660 eggs per year = 330 per window = about 470 sim eggs per game day inside a 0.7-day window (placeholder). The earlier values (80/day, 56/window, 112/year) were sized to replace only 5 percent of workers per year, which implies a 20-year worker lifespan and contradicts the 3-year lifespan and the year 4-5 growth target (+500 sim workers). If 470 eggs/day is too heavy for the sim, lengthen the worker lifespan (5 years mean gives 240 + 60 = 300 adults = 430 eggs per year = about 310 per day in-window) rather than cutting laying |

All economy and laying values are placeholders for headless balance runs.

## 13. SIGNATURE MECHANICS

1. **Wood moisture and decay field (the parent nest rule).** Every diggable wood primitive carries moisture (0-1) and decay class (0-4). Inputs: rain, leaks, soil contact, sun, ventilation, season. A nest cell's moisture, plus a humidity gradient along tunnels, drives egg hatch and young-larva survival in the parent, and development speed in satellites. Outputs: brood survival, ant comfort, the "why" overlay. Failure modes: dry-out (repair, a new gutter, stump removed) stalls eggs; flooding adds mould; player can re-wet wood only by moving the colony to a wetter timber. Player (third person): a minor presses a damp tunnel wall to read humidity, drags moist frass into a drying chamber, or picks a better beam.
2. **Gallery carving and frass ejection.** Digging is not soil digging: workers chew with and mostly along the grain, favouring soft layers and leaving hard layers as walls, and carry shavings to window openings. Inputs: dig plan, wood hardness, worker size. Outputs: new voxels, frass pellets, noise (audible rustle, drumming). Frass piles pile beneath windows and are a visible sign to humans, predators and rival colonies. Failure modes: cutting into a load-bearing beam or a thin tree wall (collapse/weakening, cavity opens); too many windows leak moisture. Player: a media chews a gallery, then kicks pellets out of a window; choosing to hide pellets in an unused void trades cleanliness for stealth.
3. **Parent-satellite partition and brood shuttling.** The queen and young brood stay in the moist parent; the colony builds drier, warmer satellites and carries larger larvae and pupae there. Inputs: moisture and temperature gradients, brood age, space. Outputs: faster development in satellites, a connected trail network. Failure modes: severed trails (a satellite becomes an orphan), parent disturbed (queen must be moved), a single point of failure at the queen. Player: a worker carries a pupa down a trail; the queen marker orders "move brood" or "new satellite here".
4. **Night shift with temperature and light gating.** Foraging follows sunset, temperature and humidity; workers use hindgut trails, trunk and wire "highways", and sun/moon/artificial light compass. Inputs: time, temperature, light, trail persistence. Outputs: night forager counts and trips. Failure modes: cold nights (under 5 C) shut down foraging; artificial light can mislead the light compass and sudden light changes can confuse trail-following [S2][S7]; day foraging risks birds. Player: scouting a trunk at night, switching on trail scent view, rerouting along a pipe.
5. **Honeydew relay and the protein calendar.** A carbohydrate economy (aphids, scale, nectar, kitchen sugar) feeds workers; a nitrogen economy (insects, carrion, kitchen protein) feeds larvae, with demand peaking in June and September. Inputs: brood present, sugar and protein inventories, trophallaxis network, symbiont buffer. Outputs: growth rate, caste mix. Failure modes: protein starvation yields stunted minors and few majors; sugar-only gluts waste crop space. Player: tending aphids on a tree, carrying prey to a major, queen diet sliders.
6. **Age-gated polymorphism.** Nanitic workers only in year 1; minors, then media and majors from season 3, set by larval nutrition and the diet-emphasis slider. Inputs: nutrition quality, colony age. Outputs: size mix; major share costs about 8 minors in nitrogen. Failure modes: too many majors drains protein; too few weakens defence and prey hauling. Player: choosing which larvae to feed more, or being a major.
7. **Claustral founding on a fat budget.** The founding queen picks a cavity (moisture, volume, entrance), seals it, lays 9-16 eggs and runs a reserve clock (fat plus flight muscle). Inputs: site moisture and temperature, queen reserves, disturbance. Outputs: first nanitics around day 10. Failure modes: dry site, predators, reserve exhaustion, disturbance (the brood is lost). Player: explores at night for a damp stump or door frame, then plays the skippable claustral time-lapse.
8. **Overwintering alates and early or late flights.** Alates eclose in August, live in the nest through diapause, males before females; heated buildings break diapause and tempt alates out in winter; spring flights are weather-triggered. Inputs: colony age, temperature, rain. Outputs: lineage daughters. Failure modes: winter flights die, parasitoids (phorids) hit females, a queenless colony produces mostly males. Player: guards the exit, picks a flight day, can ride one alate.
9. **Formic acid and drumming defence.** Majors and others spray from the gaster, a reserve that depletes; drumming raises alarm and recruits. Inputs: threat type, acid reserve, major count. Outputs: damaged enemies, alarm. Failure modes: empty acid sacs, Formica subsericea mass pressure, humans (vacuum, spray, bait) are beyond acid defence. Player: a major takes a stand at a window, sprays, drums the wall.
10. **Living in a building.** Wall voids, hollow doors, wiring and plumbing as artificial guidelines; moisture hotspots (leaks, condensation, window sills); heated areas keep winter activity. Inputs: moisture leaks, human routines. Outputs: new satellites, winter activity, discovery risk. Failure modes: repair of a leak dries the parent; pest-control events; frass found. Player: threads a satellite into a wall, moves the colony before a plumber arrives.

## 14. Third-person actions per caste

| Caste | Actions |
|---|---|
| Queen | Lay eggs; carry the egg clump; seal and dig the founding chamber; consume reserves; groom and feed eggs; free a first worker from its cocoon; issue directives (markers, sliders); stay put in the parent nest |
| Nanitic / minor | Nurse brood; trophallaxis; enlarge galleries; carry frass out; clean; tend aphids; scout trails; forage lightly at night |
| Media | Forage, hauling honeydew and small prey; dig; carry brood between nests; guard satellite entrances |
| Major | Block a window and guard; spray formic acid; drum alarm; bite and dismember intruders; haul large prey; store liquid; excavate hard wood |
| Alate female | Overwinter; groom; leave in spring flight; mate in the air; shed wings; found |
| Alate male | Overwinter; leave in flight; release the flight pheromone; die after mating |

## 15. Species choice check

| Candidate | Size (mm), colony | Nest and ecology | Documentation | Verdict |
|---|---|---|---|---|
| C. pennsylvanicus | Workers 6-16, queen 19; 2,000-4,000 workers | Damp decayed wood, parent plus satellites, buildings; strongly nocturnal; eastern North America | Best for structures, foraging, trail pheromone, diet, parasites ([S1]-[S8], [S13]) | Keep |
| C. herculeanus | Workers 5-12 (not in S12; unverified), queen about 15 mm [S12]; up to 12,000 [S1][S7] (Sanders 1970; corrected: the 12,000 is not in S12) | Boreal conifers, damp rotten wood, living trees; synchronised swarms; Holarctic | Classic European studies (Eidmann, Hölldobler); less for building | Variant |
| C. ligniperda | Workers 7-15 (majors 14-15, intermediates and minors average 7-10) (corrected from 6-14), queen 16-18; over 7,000 [S10] | Dry stumps, ground nests, partially buried logs; day and night; 4-5 month diapause | Moderate; AntWiki-level | Not for moisture mechanic |
| C. vagus | Workers 6-12, 1,000-4,000, up to 10,000 [S11]; queen 14-16 not found in S11 (unverified) | Dry open sunny habitats, dead wood, under stones; nocturnal claim unverified | Thin | Not recommended |

Recommendation: **keep Camponotus pennsylvanicus.** Reasons: it is the best-documented species for the exact mechanics the playstyle needs (moist-wood parent nest versus dry-warm satellite, wall-void nests, trunk trails at night, diet seasonality, frass as a sign, formic acid); it is a native of the eastern North American forest-lawn-house locality the generator targets; its 9 mm body gives the planned BU; and it contrasts strongly with Lasius (wood versus soil, night versus day, slow versus fast growth). C. ligniperda and C. vagus nest in drier ground-level sites, so the moisture mechanic would be weaker; C. herculeanus is nearly equivalent but its best data are European and boreal.

Caveats for design: (1) C. pennsylvanicus is North American while Lasius niger is Eurasian (also naturalised in North America); this is acceptable for a stylised locality. (2) Many numbers here come from congeners; the design team should treat the game table as tunable. (3) Cheap post-launch variant: C. herculeanus as a data-only species file (smaller workers, colder tolerance, longer diapause, bigger colonies). (4) For the genetic/endosymbiont and polymorphism lab science, C. floridanus is the model species, but it has no winter diapause and is wrong for this playstyle.

## Sources

- [S1] Hansen and Akre 1993, Urban pest management of carpenter ants, ICUP: https://icup.org.uk/media/q1mntwta/icup638.pdf
- [S2] Hansen 1996, Managing carpenter ant populations in urban environments, ICUP: https://www.icup.org.uk/media/p51ha43j/icup781.pdf
- [S3] Hansen and Witherell 2014, Gonadal development in winged forms of ants, ICUP: https://icup.org.uk/media/g4fpdyeo/icup1086.pdf
- [S4] Ohio State Extension HYG-2063, Carpenter Ants: https://ohioline.osu.edu/factsheet/hyg-2063
- [S5] Animal Diversity Web, Camponotus pennsylvanicus: https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/
- [S6] Fowler and Roberts 1982, Seasonal occurrence of founding queens and sex ratio of C. pennsylvanicus: https://archive.org/download/biostor-171779/biostor-171779.pdf
- [S7] Hillery 1999, Hindgut secretions in C. pennsylvanicus (Virginia Tech thesis; literature review includes Hartwick 1977 and Pricer 1908 data): https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c2155861-1ed6-4696-847c-9917b846c818/content
- [S8] NC State Extension, Biology and control of carpenter ants: https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants
- [S9] Wikipedia, Black carpenter ant: https://en.wikipedia.org/wiki/Black_carpenter_ant
- [S10] Wikipedia, Camponotus ligniperda: https://en.wikipedia.org/wiki/Camponotus_ligniperda
- [S11] Wikipedia, Camponotus vagus: https://en.wikipedia.org/wiki/Camponotus_vagus
- [S12] Wikipedia, Camponotus herculeanus: https://en.wikipedia.org/wiki/Camponotus_herculeanus
- [S13] Buczkowski 2010/2011 (Ecological Entomology 36:62-71), read only through search summary of the Purdue copy: https://www.entm.purdue.edu/ants/pubs/25.pdf
- [S14] Diel differences in foraging in two ant species (abstract record): https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_jstor_primary_25084489
- [S15] Virginia Tech thesis on macronutrient feeding of C. pennsylvanicus (summary only): https://vtechworks.lib.vt.edu/items/40b1b68c-289b-46d7-9708-e8b1ff11e6e8
- [S16] Blochmannia nutritional role in C. floridanus: https://link.springer.com/article/10.1186/1741-7007-5-48
- [S17] Loreto et al. 2013, C. rufipes trunk trails: https://pure.psu.edu/en/publications/foraging-ants-trade-off-further-for-faster-use-of-natural-bridges/
- [S18] Heinze, Arctic ants (C. herculeanus solitary founding): https://journalhosting.ucalgary.ca/index.php/arctic/article/download/64418/48353/183611
- [S19] Pest Control Technology, sensor study on trails: https://www.pctonline.com/article/-focus-on-ant-control-
- [S20] Camponotus worker polymorphism and morphometrics (genus-level): https://link.springer.com/article/10.1186/s40850-019-0048-7; Wilson 1974 liquid storage by majors in C. fraxinicola via search summary: https://groups.csail.mit.edu/mac/projects/psyche/81/81-182.html
- [S23] Formic acid share of formicine spray (secondary coverage): https://www.sci.news/biology/formicine-ant-venom-peptides-14776.html
- [S25] Mintzer 1979, Colony foundation and pleometrosis in Camponotus (bibliographic record only): https://biodiversitylibrary.org/part/267949
- Hobbyist care guide (low reliability, development and first-year counts): https://antgear.com/wp-content/uploads/_careGuides/genus-camponotus-care-guide.pdf

## Verification log

Adversarial fact-check, 2026-11-12. Verdicts: CONFIRMED (value seen in the source), CORRECTED (value or attribution changed in the text above), UNSUPPORTED (not in any source seen; now labelled ESTIMATE). Items 1-15 are the claims judged most important for parameters and signature mechanics; items 16-30 are extra claims checked along the way. Sources opened directly: S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12; S15 abstract page; S13 only as a Crossref abstract summary.

| # | Claim | Verdict | What the source says | Source URL |
|---|---|---|---|---|
| 1 | Egg to worker 55-70 days (spring brood) | CONFIRMED with caveat | "The spring brood averages 55 to 70 days to develop from egg to worker", stated for colonies in their second year and older; founding-queen figure is the 66 days of Pricer 1908 (S7). Caveat added in section 2 | https://icup.org.uk/media/q1mntwta/icup638.pdf ; https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c2155861-1ed6-4696-847c-9917b846c818/content |
| 2 | Stage durations egg 14-25, larva 14-25, pupa 14-25 d | CONFIRMED | S1: eggs hatch after 2-3 weeks, larva 2-3 weeks, prepupal-pupal 2-3 weeks. S5: egg 18-25 d, larva 14-25 d, pupa about 25 d | https://icup.org.uk/media/q1mntwta/icup638.pdf ; https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/ |
| 3 | Queen about 19 mm; workers 5-16 mm | CONFIRMED | S5: queen 1.9 cm average, workers 0.5-1.6 cm. S9: queen 19-21 mm. S8: queen 9/16 in (14 mm), workers 1/4-5/8 in (6.4-15.9 mm). Super-major max "16-17 [S8]" CORRECTED to S9 (14-17 mm) only | https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/ ; https://en.wikipedia.org/wiki/Black_carpenter_ant ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 4 | Founding clutch 9-16 eggs; 4-25 workers in first summer | CONFIRMED | S7: "first set of brood consists of 9 to 16 eggs" (Hansen and Akre 1990). S1: "average population of 4 to 25 workers in the first summer". S5 gives 5-15. The 70 percent hatch/survival used in the game table is UNSUPPORTED, now labelled ESTIMATE | https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c2155861-1ed6-4696-847c-9917b846c818/content ; https://icup.org.uk/media/q1mntwta/icup638.pdf |
| 5 | Mature colony 2,000-4,000 workers | CONFIRMED | S4: "~2,000 to 4,000 individuals"; S8: 2-3,000; S7: 3000 recorded for C. pennsylvanicus. Added: S1 gives 3,000-6,000 average for most carpenter ants (Fowler 1986) | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 6 | Age at first alates 3.5-4 y (also 3-6, 6-10, 8-10) | CORRECTED (attribution) | S4: "usually 3.5 to 4 years old before it can produce swarmers"; S7: 3-6 years; S1: 6-10 years (general Camponotus statement, not specifically "Pacific Northwest congeners"); S3: usually over 8-10 years; S8: up to 6 years to mature | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://icup.org.uk/media/g4fpdyeo/icup1086.pdf |
| 7 | Queen over 10 y (up to 15); workers 0.5-7+ y | CONFIRMED | S5: queens "over 10 years", workers "0.5 to 7+ years"; S8: queen "as long as 15 years". Mean worker lifespan 3 y remains an ESTIMATE. Conversion 12 y x 28 = 336 game days = 56 real hours: arithmetic correct | https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/ ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 8 | Inactive below 5 C; mostly nocturnal; foraging peaks right after sunset | CONFIRMED | S5: "inactive when the ambient temperature is below 5 degrees Celsius"; "most foraging activity occurs right after sunset". S4: "very soon after sunset". S1: peak 8 p.m.-4 a.m. is for C. modoc (genus-level) | https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/ ; https://ohioline.osu.edu/factsheet/hyg-2063 |
| 9 | Foraging range 100 ft (30 m) / 100 yd (91 m) / 300 ft | CONFIRMED | S4: "as far as 100 feet"; S9: "up to 100 yd (91 m)"; S8: trails up to 300 feet. Game-table wording CORRECTED: only the 91 m figure exceeds the 36 m map | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://en.wikipedia.org/wiki/Black_carpenter_ant |
| 10 | Foragers are 2-3 percent of workers (game default 3, range 1-12) | CORRECTED | S1: 2-3 percent in two C. herculeanus colonies; under 1 percent in C. nylanderi; no C. pennsylvanicus figure. The 12 percent upper slider value is UNSUPPORTED (ESTIMATE) | https://icup.org.uk/media/q1mntwta/icup638.pdf |
| 11 | Alates per colony 200-400 (S8), 260-1,120 (NJ) | CORRECTED | S8: 200-400 per year. S6 Table 2: queenright colonies 260-1,120 (n=5), queenless 75-437 (n=3). Game-table scaling "20 to 150" CORRECTED to 30-140 (260/8, 1,120/8) | https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants ; https://archive.org/download/biostor-171779/biostor-171779.pdf |
| 12 | Nuptial flight March-July, mode May, 111 queens; no synchronised flight | CONFIRMED, with a correction | S6 Table 1: 5 March, 23 April, 53 May, 28 June, 2 July = 111; "No synchronization of population nuptial flights was detected". CORRECTED: S1 does list mid-April to mid-June major swarms for C. pennsylvanicus (Pricer 1908), not only for C. herculeanus; S5 says "often in July" (outlier); S7 April-June | https://archive.org/download/biostor-171779/biostor-171779.pdf ; https://icup.org.uk/media/q1mntwta/icup638.pdf |
| 13 | Sex ratio: 36-50 percent males (Pricer), about 56 percent queenright NJ, 82 percent queenless | CONFIRMED | S6 Table 2: Pricer 0.359-0.495 (mean 0.434); NJ queenright mean 0.556 (text gives 0.552); queenless 0.819. Overall NJ 60.3 percent males | https://archive.org/download/biostor-171779/biostor-171779.pdf |
| 14 | Alate dry mass female 56.8 +/- 12.3 mg, male 9.3 +/- 4.3 mg, ratio 6.1 | CONFIRMED | Exactly as stated in S6. Derived NU costs (28.4 and 4.65 at 0.5 NU/mg) check out | https://archive.org/download/biostor-171779/biostor-171779.pdf |
| 15 | Parent nest needs wood moisture above 15 percent; satellites drier and warmer | CORRECTED (strength of claim) | S4: parent nest "associated with wood that has a moisture content greater than 15 percent"; S8: "prefer wood with a moisture content of 15% or higher"; S1: constant high humidity "necessary for the development of the eggs and young larvae"; S1/S2/S4: satellites drier, warmer, speed larval/pupal development. These are associations, not hatch thresholds; the 8-percent zero point, 30-percent mould limit, "8-18 percent" and "2-4 C warmer" values are UNSUPPORTED (ESTIMATE) | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants ; https://icup.org.uk/media/q1mntwta/icup638.pdf |
| 16 | Satellite counts: 2-25 inside structures; 4-8 outside | CORRECTED | S2: "range from 2 to 25" within structures (confirmed). S1 has no "4-8": up to 8 satellites for C. herculeanus/C. noveboracensis (Sanders), up to 5 sites for C. modoc/C. vicinus, 13 sites in 130 m2 for one C. herculeanus colony, 20-25 reported for C. modoc | https://www.icup.org.uk/media/p51ha43j/icup781.pdf ; https://icup.org.uk/media/q1mntwta/icup638.pdf |
| 17 | Territory 6-28 m2 (mean 16.3), 1-6 trees | CONFIRMED | S5 "Home Range": 6 to 28 m^2, average 16.3, 1 to 6 trees. Percent of map: 6/1,296 = 0.5 percent, 28/1,296 = 2.2 percent, matches the game table | https://animaldiversity.org/accounts/Camponotus_pennsylvanicus/ |
| 18 | Colony average about two trees (1.95) | CONFIRMED (approximately) | S13 abstract summary: "about two trees"; the decimal 1.95 was not seen | https://www.entm.purdue.edu/ants/pubs/25.pdf (blocked; checked via https://api.crossref.org/works/10.1111/j.1365-2311.2010.01245.x) |
| 19 | Intermediate and major workers do not appear until the third season | CONFIRMED | S7: "Intermediate and major workers don't appear until the third season in C. ferrugineus, C. pennsylvanicus, and C. modoc"; first brood minor and homogeneous | https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c2155861-1ed6-4696-847c-9917b846c818/content |
| 20 | Nitrogen collected 4x more intensively than carbohydrate; peaks June and September; 20 percent sugar optimum; lipids ignored | CONFIRMED | S15 abstract (opened directly, "via search summary" tag removed). S4 independently: protein collection peaks in June and September (Virginia). Game days 7 and 14 correctly map to June 6-19 and Sept 5-18 | https://vtechworks.lib.vt.edu/items/40b1b68c-289b-46d7-9708-e8b1ff11e6e8 ; https://ohioline.osu.edu/factsheet/hyg-2063 |
| 21 | Alates eclose first week of August; diapause September-October; broken March-June; males emerge before females, as early as December | CONFIRMED | S3 (C. modoc for the August date; general for the rest) | https://icup.org.uk/media/g4fpdyeo/icup1086.pdf |
| 22 | Two egg-laying windows; spring eggs give workers and sexuals, late-summer eggs overwinter and give workers | CONFIRMED, S5 disagrees | S4, S8 and S1 agree. S5 says August-September eggs produce sexuals, treated as an S5 error (note added) | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 23 | Tunnels 1.5-3 cm diameter; trails 185-200 m; galleries along the grain through soft layers, hard layers remain as walls | CONFIRMED (genus-level for lengths) | S1 (C. herculeanus 185 m, C. modoc 200 m); S8 gives the springwood-first gallery pattern and sandpapered walls | https://icup.org.uk/media/q1mntwta/icup638.pdf ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 24 | Rectal material 14 percent solids; n-undecane and n-tridecane in Dufour's gland; 85 percent followed the hindgut trail | CONFIRMED, wording softened | S7 as stated. "Trail pheromone alone drives recruitment" and "light confuses more than it guides" were overstated: S7 calls the light results "less conclusive" (text corrected) | https://vtechworks.lib.vt.edu/server/api/core/bitstreams/c2155861-1ed6-4696-847c-9917b846c818/content |
| 25 | Queen is claustral and eats nothing; uses fat body and flight muscles | CONFIRMED | S1, S4, S8 | https://ohioline.osu.edu/factsheet/hyg-2063 |
| 26 | Drumming alarm; formic acid in bite wound | CONFIRMED | S4 (striking mandibles and abdomen against galleries, formic acid into the wound); S10 for the C. ligniperda drumming effect | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://en.wikipedia.org/wiki/Camponotus_ligniperda |
| 27 | Species check figures for C. herculeanus, C. ligniperda, C. vagus | CORRECTED | S12 gives queen about 15 mm and no worker size or 12,000 count (12,000 is from S1/S7); S10: queens 16-18, majors 14-15, others 7-10, over 7,000, diapause 4-5 months, day and night; S11: workers 6-12, 1,000-4,000, up to 10,000, queen size not given | https://en.wikipedia.org/wiki/Camponotus_herculeanus ; https://en.wikipedia.org/wiki/Camponotus_ligniperda ; https://en.wikipedia.org/wiki/Camponotus_vagus |
| 28 | Alate wings "translucent, yellowish" | CORRECTED | S4: transparent with prominent veins; yellowish only in S9, marked "citation needed" | https://ohioline.osu.edu/factsheet/hyg-2063 ; https://en.wikipedia.org/wiki/Black_carpenter_ant |
| 29 | Casein hydrolysate and fish products as best protein stimulants | UNSUPPORTED (not re-verified) | Not in the S15 abstract; flagged low reliability | https://vtechworks.lib.vt.edu/items/40b1b68c-289b-46d7-9708-e8b1ff11e6e8 |
| 30 | Chamber width 5-12 BU "from seed" | CORRECTED | Seed section 3 says tunnels about 2 BU, chambers 8-16 BU. 5-12 BU is a species ESTIMATE (4-10 cm), now labelled as an override | /home/user/foundress/docs/01-design-seed.md |

### Arithmetic and calendar check of the game translation

Checked against docs/01-design-seed.md (1 game day = 600 s = 6,000 ticks of 0.1 s; 28-day year; BU 9 mm; walk 12 BU/s).

| Item | Result |
|---|---|
| 1 game day = 365/28 = 13.04 real days; 6,000 ticks; 12 BU/s = 108 mm/s; 4,000 BU = 36 m; 1,200 BU = 10.8 m | Correct |
| Stage conversion: 18/13.04 = 1.38, 21/13.04 = 1.61, 25/13.04 = 1.92; sum 64 d = 4.9; range 55-70 = 4.2-5.4; major +15 percent = 5.6; 66 d = 5.1 | Correct |
| Queen 12 y = 336 game days = 56 real hours; worker 3 y = 84 game days | Correct |
| Colony scaling: 300 + 2,700/3 = 1,200; cap 1,500 sim = 300 + 3 x 1,200 = 3,900 real; foragers 3 percent of 1,200 = 36; year 4 = 300 + 700/3 = 533; year 5 = 300 + 2,200/3 = 1,033 | Correct. The 1,500 cap is a cross-document convention (also in bio-messor.md), not in the seed |
| NU per adult from mass: 0.5 NU/mg gives 1, 3.5, 8, 28.4, 4.65 | Correct. Upkeep ratio (mass^0.75): 2.56 and 1.86 vs 2.5 and 1.9 in the table, correct |
| Calendar mapping (spring day 1 = Mar 20, each day 13.04 real days): flight window, diapausing larva adult date | Two ranges CORRECTED (flight window 1-9, peak 4-6; adult June-July = days 7-10). Day 10 first workers (flight about May 17 + 66 d = Jul 22, day 10), alate eclosion day 11, second laying 11-13, diapause entry 15-17, dormancy 18-28 all verified correct |
| Queen laying (80/day, 56/window, 112/year) | ERROR CORRECTED: implied about 5 percent worker turnover (20-year lifespan), inconsistent with the 3-year lifespan; now about 470/day in-window, 330/window, 660/year (see section 12) |
| Alates scaled 1:8 gave "20-150" | CORRECTED to 30-140; note that 1:8 differs from the 1:3 worker scale |
| Foraging range vs night window | Wording corrected: a 30 m trip is 3,333 BU = 278 s, longer than the 200 s night window; only 91 m exceeds the map |
| Chamber width cited to the seed | CORRECTED (seed says 8-16 BU) |

### Remaining concerns

- Year-4 first alates at 1,000 real workers is slower than S4 (2,000-4,000 individuals at 3.5-4 years); kept as a deliberate pacing estimate.
- Worker mean lifespan 3 years, queen fecundity, worker dry masses, proportions of castes, chamber dimensions and all temperature/moisture response curves are ESTIMATES with no source; they should be tunable.
- S14, S16-S20, S23, S25 and the hobbyist care guides were not re-opened in this pass.
- S5 (ADW) has internal inconsistencies (nuptial flight "often in July", sexuals from Aug-Sept eggs); where it conflicts with S1, S4, S6 and S8, those were preferred.
