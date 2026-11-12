# FOUNDRESS — Ant-scale habitat ecology (research note)

Scope: the five habitat zones of the design seed, temperate suburban default, with Mediterranean (*Messor barbarus*) and southern-US (*Atta texana*; *Camponotus pennsylvanicus* is eastern North America) variants.
Units: mm unless stated. **BU** = standard worker length (Lasius 4 mm, Camponotus 9, Messor 7, Atta 7), per the design seed.

**Honesty convention.** `[S#]` = value taken from a source in the key at the end. `[E]` = clearly labelled estimate from general knowledge or reasoning, *not verified in this research pass*; treat as tunable defaults, put them in `src/sim/balance/*`. "Not found" means a search did not return it. This pass could not read AntWiki (HTTP 403 from the proxy), so many ant-biology numbers come from Wikipedia, extension services and papers; verify against AntWiki/BWARS before shipping a species codex.

**Verification pass (adversarial fact-check).** A second pass opened the cited sources for the 15+ gameplay-relevant claims; results, corrections and unresolved items are in the **Verification log** at the end. Where a value was corrected it is fixed in place and tagged `[V-corrected]`; where a claim could not be confirmed it is tagged `[E: unverified]` and must be treated as a tunable guess. Sources that could not be opened in the pass (AntWiki, LSU AgCenter, WHAS11, Springer) are listed in the log.

**Time-scale decision (recorded).** The seed makes 1 game day = 10 min and the year = 28 game days, so one game day stands for about 13 real days of season (365 / 28 = 13.0). Resolution: each game day *plays* as a 24 h cycle (dawn, noon, dusk, night) for temperature and human activity, while *seasonal* quantities (aphid boom, fruit fall, brood) drift across the 7 days of a season. Event frequencies in section 7 are given per game day, with the real-world cadence beside them.

**Conversion rule used in section 7 (added by verification; the original text mixed three conventions).** (1) Within-day phenomena (dew, spills, meals, daily wiping, shoe events) run 1:1 with the 24 h cycle: "daily" = 1 per GD, 15 min of real time = 0.01 GD. (2) Multi-day cadences use a *game week = 3 GD* (so 1 real day = 0.43 GD): weekly = 1 per 3 GD, fortnightly = 1 per 6 GD, a 3-7 day heat wave = 1.3-3 GD. (3) Annual cadences are *not* scaled literally: a literal "weekly mow, April-October" would be about 1.9 mows per GD (13 days / 7), roughly 5.6x more than the table's 1 per 3 GD. The table therefore deliberately under-samples multi-day human cadences relative to a literal 13-days-per-GD scaling; this is a gameplay compression, recorded here so it is tunable in `src/sim/balance/*` and not mistaken for biology.
Real-time check at 1x (10 min per GD): 1 per 3 GD = one event every 30 real minutes; 0.01 GD = 6 real seconds; 0.5 GD = 5 real minutes; 0.4 GD (dew) = 4 real minutes.

---

## 0. Scale cheat-sheet (what things are, in BU for Lasius, BU = 4 mm)

| Thing | mm | BU (Lasius) | Note |
|---|---|---|---|
| Lasius niger worker | 3–5 [S1] | ~1 | mass ~1.06 mg [S9] `[E: unverified, source paywalled; ~1 mg is plausible for a 3–5 mm ant]` |
| Raindrop, drizzle | 0.2–0.5 [S5] | 0.05–0.12 | falls < 1 m/s [S5] |
| Raindrop, shower | 2–3 [E] | 0.5–0.75 | ~4 mg for 2 mm sphere (volume calc) = ~4x a worker's mass; ~6–7 m/s [E] |
| Raindrop, downpour | 4–5 (rarely > 5–6, they break up) [S6] | 1–1.3 | ~34–65 mg (sphere volume: 4 mm = 33.5 mg, 5 mm = 65.4 mg); ~9 m/s (S5: a quarter-inch (6.35 mm) drop falls "about 10 m/s or about 20 mph"; 20 mph = 8.9 m/s) |
| Permeable paving joint | 3–6 (grit-filled 3; nibs 4.5) [S10] | 0.75–1.5 | exactly body-sized: a "road" |
| Mortar-jointed flag joint | 5–10 [S10] | 1.25–2.5 | |
| Kerb upstand | 100–150 [E] | 25–38 | a cliff of ~25 body lengths |
| Grass blade (lawn) | 2–8 wide [E] | 0.5–2 | mown sward 25–50 high [E] = 6–12 BU |
| Playground sand grain | 0.06–2 (sand class) [E] | 0.015–0.5 | |
| Leaf litter layer | 20–60 [E] | 5–15 | |

---

## 1. Habitats

### 1.1 Forest floor (deciduous / mixed temperate woodland edge)

**(a) Substrates and micro-structures**

| Structure | Real dimensions (mm) | Notes |
|---|---|---|
| Litter (L) layer, fresh leaves | depth 20–50 [E]; oak/beech leaf 60–120 long, 40–70 wide [E] | stacked, leaves curl; air gaps 2–15 mm between leaves = 3-D maze |
| Conifer needles | 1–2 wide × 40–150 long [E]; mat depth 20–60 | slippery, resinous, acidic |
| Humus (F/H) layer | 20–60 deep [E] | dark, moist, many springtails/mites |
| Mineral soil | particles: sand 0.06–2, silt 0.002–0.06, clay < 0.002 (standard USDA classes) | diggable; tunnel 2 BU wide (8 mm Lasius) needs cohesive loam/sand-loam |
| Roots | 3–50 diameter [E] | roots are natural ceilings and shelter; fine roots 0.5–2 |
| Fallen twigs / branches | 2–20 / 30–100 diameter [E] | walkways over litter, wet-dead-wood nests |
| Logs / stumps | 150–400 diameter [E] | decay class sets carpenter-ant suitability (needs moist wood) [S12][S13] |
| Bark furrows | 5–30 deep [E] | vertical highways, aphid/scale colonies on trunks |
| Moss cushion | 10–40 tall [E] | water reservoir, springtails |
| Stones / flints | 20–200 [E] | warm, dry undersides = classic *Lasius* founding site [S1] |
| Fungal fruitbodies | 30–150 cap [E] | brief carbohydrate/protein resource, fly-larvae hosts |
| Acorn / beech nut | 15–25 × 10–15 / ~15 [E] | too big to carry: seed-processing site for Messor-like diets, shelter for larvae |
| Understory herbs / seedlings | stems 1–5 diameter, 50–400 tall [E] | EFN and aphid plants, zombie-fungus perch height ~25 cm (tropical) [S18] |

**(b) Nesting opportunities**

| Substrate | Species fit | Rules for the game |
|---|---|---|
| Soil under flat stone | *Lasius niger* (under stones, rotten wood, roots) [S1], *Myrmica rubra* [S2] | thermal bonus: stone heats in sun; flooding risk if on slope |
| Rotten log / stump | *Camponotus pennsylvanicus* (needs moist wood, ≥ ~15 % moisture) [S12][S13], *Lasius* | diggable-wood material; carpenter ant excavates galleries, never eats the wood |
| Leaf-litter cavities | *Myrmica*, *Temnothorax* (E), *Solenopsis molesta* (rotting logs, exposed soil) [S8] | shallow, cheap, easy to lose to rain/predators |
| Mound in clearing | *Formica rufa* group: mounds of needles/twigs, "several metres" across, 100 000–400 000 workers [S11] | rival superpower; spans several nests; forages ~100 m |
| Dead roots | *Lasius flavus* subterranean (root aphids) [S3] | |

**(c) Food at ant scale**

| Resource | Class | Item size (mm) | One-ant carry? | Renewal |
|---|---|---|---|---|
| Aphid honeydew (trees: lime, oak, sycamore; shrubs) | carbohydrate (sugars, trace amino acids) [S14] | droplet ~0.5–2 [E] | internal in crop | continuous in warm dry spells; collapses in autumn |
| Dead insects / carrion | protein | 3–20 [E] | only small pieces; larger needs dismember or group | random, 1–3 per game day per 100 m² [E] |
| Springtails, mites (live prey) | protein | 0.3–2 [E]; springtails jump | yes | continuous in humid litter; ~up to 100 000/m² [S15] |
| Caterpillars, sawfly larvae | protein/lipid | 5–40 [E] | no: > 10× worker mass; group kill | peaks May–June [E] |
| Elaiosome seeds (violets, celandine, bloodroot, trillium) | lipid + protein on the elaiosome [S16] | seed 1.5–3 [E] | yes | spring–early summer; seed dumped on midden = dispersal |
| Fungus bodies, slime flux, sap | carbohydrate/protein | irregular | partly | autumn pulse |
| Extrafloral nectar (cherry, elder, bracken) | carbohydrate | drops ~0.5–1 [E] | internal | spring flush; *Prunus* has EFN on petioles [S19] |

**(d) Hazards**: ground beetles and rove beetles, wolf spiders, jumping spiders, centipedes (*Lithobius* 10–30 [E]), toads, shrews, ground-feeding birds (thrushes, woodpeckers), *Formica* neighbours, entomopathogenic fungi in persistent damp, flooding in hollows, winter frost; falling branches/humans (rare), leaf-fall smothering entrances.

**(e) Human activity**: minimal; dog-walkers (a paw event every 1–2 game days near paths [E]), forestry work/log removal (rare), litter blowing, campfires. Humans enter mainly via edge zones.

### 1.2 Pavement and parking areas

**(a) Substrates and micro-structures**

| Structure | Dimensions (mm) | Notes |
|---|---|---|
| Concrete flag, patio slab | 450×450×50, 600×450×50–63, 600×600×35–50 [E]; 600×450 flag spec exists [S10] | slab edges chamfered 2–3 [E] |
| Joint, permeable block | 3–6 (3 mm grit, 4.5 mm nib spacing) [S10] | grit-filled: porous, diggable at 2–6 mm particle size |
| Joint, sand-filled flag | 3–8 [E] | weathering widens joints to 10–15 with age [E]; sand loosely packed = prime nesting |
| Joint, mortar | 5–10 [S10] | hard, cracks with age |
| Under-slab bedding | sand/mortar 25–50 thick, sub-base 100–200 [E] | stable microclimate; the classic *Tetramorium*/*Lasius* nest site [S7][S2] |
| Asphalt crack | hairline 1–5; structural 5–25 [E] | micro-connection to sub-base |
| Asphalt aggregate | 6–14 chips [E] | rough walking texture, shade under chips |
| Kerb upstand | 100–150; dropped kerb 0–25 [E]; kerb back/foundation gap 0–10 [E] | under-kerb voids are passages |
| Expansion joint, concrete | 10–20 [E] | sealant, often cracked |
| Drain/gully grate | bar gap 10–30; gully pot Ø ~300, depth ~600 [E] | pitfall / flood channel |
| Painted line | 100 wide × < 1 thick [E] | slightly slick, markers |
| Car tyre | 195/65 R15 ≈ 195 wide, Ø ~630 [E] | event hazard; also **under-car** shade/oil drips |
| Wheel-stop / bollard / lamp-post base | 100×600×1800 / Ø 100–200 | climbable; shelter at base |
| Tree pit, grass verge | pit 1000×1000; verge 500–2000 wide [E] | refuges; roots lift slabs creating cavities |
| Manhole cover | Ø 600 with 5–10 rim gap [E] | cast iron, hot |

**(b) Nesting**: under slabs and along edges (*Tetramorium immigrans*, *Lasius niger*, *L. flavus* also under concrete slabs [S3]); in joint sand; in broken asphalt edges and cracks; in the soil strip of kerb back and verges. Nest depth for *Tetramorium*: majority of volume reportedly 30–50 cm below the surface [S7; verified in Wikipedia *T. immigrans*: "majority of nest volume 30–50 cm below the surface", shafts/chambers to 60–90 cm in some soils]. Hard asphalt/concrete itself is not diggable; only sand, grit, soil and mortar crumb are.

**(c) Food**

| Resource | Class | Size | Carry? | Renewal |
|---|---|---|---|---|
| Dropped food: crisps, bread crumb, chips | carbohydrate/lipid | 1–20 crumbs [E] | crumbs ≤ 3 mg yes; chunk no | every game day near bins/cafés; heavily random |
| Sugary spills (soda, ice-cream, juice) | carbohydrate liquid | puddle 20–200 diameter [E] | internal | 1–3 per game day, evaporates in 0.2–0.5 day in sun [E] |
| Squashed insects (roadkill) | protein | 5–30 [E] | cut up | after traffic |
| Aphids on verge trees/shrubs | carbohydrate (honeydew) | — | — | seasonal; honeydew on parked cars is a "sticky rain" event |
| Weed seeds in cracks (grasses, chickweed) | carbohydrate/starch | 0.5–3 [E] | yes (Messor tier) | summer–autumn |
| Cigarette butts, gum, bottle residues | waste, sugar films | — | — | attractant traps |

**(d) Hazards**: surface temperature (section 4), tyres, shoes, rolling carts, birds (sparrows, pigeons, starlings), spiders (jumpers on walls), *Tetramorium* wars on slabs, oil/petrol, de-icing salt, power-washing, bait stations near buildings, drain flushes. Exposed crossings > 1 m with no cover are a high-risk run: 250 BU for Lasius.

**(e) Human timing**: parking turnover peaks 08:00–09:30 and 17:00–18:30 [E]; shoppers' crumb deposition peaks around lunch; street sweeping weekly–fortnightly early morning [E]; weed-killer/hot-weeding of joints 1–2 times per growing season [E]; jet-washing 1–2 times per year [E]; salt in winter.

### 1.3 Playgrounds and parks

**(a) Substrates**

| Structure | Dimensions (mm) | Notes |
|---|---|---|
| Play sand (loose-fill) | grain 0.06–2 (sand class); playground sand typically 0.25–1 [E]; depth: US CPSC/NDSU recommend 12 in (305 mm) initial loose fill, maintained at >= 9 in (229 mm) after compression; sand "protects to" only 4 ft falls [S4] `[V-corrected: the earlier "200 loose / ~100 compacted for 9 ft falls" was not in S4]` | dry sand is excellent for digging only when damp below; antlion pits favour fine dry sand [S20] |
| Pea gravel | 5–10 particles [E]; depth 229-305 mm (9-12 in); protects to 5 ft [S4] `[V-corrected from ">= 125 compacted"]` | scatters; large voids shelter prey, ants must climb pebble-by-pebble |
| Engineered wood fibre / bark chips | 10–50 pieces [E]; depth 229-305 mm (9-12 in); wood chips protect to 10 ft, wood mulch 7 ft [S4] `[V-corrected from "150–250"]` | humid, fungal, many springtails, termite-like beetles |
| Rubber crumb / poured-in-place mat | granule 1–4, mat 20–100 thick [E] | hot, non-diggable, edges and joint seams are paths |
| Timber edging sleeper | 100×200×2400 [E] | ideal nest under; moisture rot |
| Concrete footings, steel posts | post Ø 60–100 [E]; sleeve gap 2–5 [E] | climbable steel is slippery and hot |
| Grass (park) | blade 2–8 wide [E] | |
| Bench, bin, picnic table | legs 40–100 | food spill zone |
| Drinking fountain base | drain gap 5–20 [E] | permanent water |

**(b) Nesting**: sand/soil under edge boards (*Lasius niger*, *T. immigrans*), at the grass–sand boundary, under bench footings, tree-root flares. Pure loose sand collapses: tunnels need damp compaction [E, game rule: sand collapse chance rises as moisture drops].

**(c) Food**: spilt juice and lollies (carbohydrate liquid, 5–50 mm puddles); crisps, sandwich crusts, biscuit crumbs; bin overflow (a bin is a mega-source and a danger: lid opening); aphids on park trees (lime, sycamore, rose beds); clover/dandelion nectar; seeds in lawn; sunbathing insects. Peaks at weekends and school holidays.

**(d) Hazards**: running children (shoe event: footprint ~200×80 mm [E]), sand play/digging, sprinkler/hose, antlion pits in dry sheltered sand [S20], jumping spiders on equipment, litter pickers and groundskeepers, bird flocks (house sparrow, pigeon, gull on crumbs), heat on equipment.

**(e) Human timing**: school-run play 08:30–09:00, 15:30–17:30; weekends 10:00–17:00; groundsmen empty bins early morning; sand raked/replenished 1–2× per year (rake = burial event) [E]; mowing weekly in summer [E]; surface inspection 1 week cycle.

### 1.4 Gardens and yards

**(a) Substrates**

| Structure | Dimensions (mm) | Notes |
|---|---|---|
| Lawn sward | mown 25–50, long grass 100–300 tall; blade 2–8 wide [E]; thatch 5–20 [E] | open-canopy air layer cool and humid; mowing event removes the canopy |
| Clover, dandelion, daisy | leaflet 10–25; flower 20–40 [E] | nectar, honeydew hosts |
| Flower bed soil | loose loam; mulch bark 20–50 pieces [E] | warm, ideal nest |
| Raised bed timber | sleeper 150–300 high [E] | rot = Camponotus risk |
| Patio, path slabs | see 1.2 | |
| Garden wall (dry stone / mortared) | crevices 5–30 [E] | vertical nest sites |
| Fence panel, post | post 75–100 square; panel overlap gaps 2–10 [E] | climbable; wet at ground = wood-nest site |
| Shed base / paving slabs | 10–150 void under [E] | warm, dry nest; carpenter and pharaoh outposts |
| Compost heap | 1000×1000×1000 [E]; core 50–65 °C [E] | brood-incubating rival *Myrmica*, fly larvae, millipedes |
| Pots and saucers | Ø 100–400; saucer drain gap 0 | water source, ants nest in pots |
| Water butt / pond edge | overflow, damp margins | drowning hazard |
| Fruit tree / bush | apple Ø 60–80; plum 30–50 [E] | windfalls, aphids, scale on bark |
| Bird feeder / table | seed: millet 2–3, sunflower heart 10–15 [E] | spills below |
| Garden hose, sprinkler | droplet 1–3 [E] | |

**(b) Nesting**: lawn and beds (*Lasius niger* with mound-edge crumbs; *L. flavus* in old turf [S3]); under slabs/patios; garden wall crevices; deadwood in stumps (carpenter ants); compost (*Myrmica*, *Tetramorium*); pots. Southern US adds *Atta texana* mounds (5–14 in = 130–355 mm high, 1–1.5 ft = 300–460 mm across, [S21 TAMU CityBugs, verified]; nest depth 6 m [Wikipedia] to 15–20 ft (4.6–6 m) [CityBugs] to 25 ft (7.6 m) [TFS], sources differ) on sandy/loamy soil. Mediterranean adds *Messor barbarus* at field/orchard edges [S22].

**(c) Food**

| Resource | Class | Size | Carry? | Renewal |
|---|---|---|---|---|
| Aphids on roses, beans, nasturtium, fruit | carbohydrate honeydew | aphid ~2 [S14] | n/a | explodes May–July, crashes with predators [S14] |
| Scale insects / mealybugs (shrubs, glasshouse, citrus) | carbohydrate honeydew [S14] | 1–5 [E] | n/a | stable all season |
| Nectar: flowers and EFN (cherry, peony, broad bean) [S19] | carbohydrate | drop 0.5–3 [E] | internal | spring–autumn flower flush |
| Windfall fruit | carbohydrate/ferment | 30–80 [E] | no; pulp bites yes | Aug–Oct |
| Seeds (grass, weeds, bird-feed spill) | starch/lipid | 1–15 [E] | seed ≤ 3 mm yes | summer–autumn |
| Caterpillars, flies, fruit flies | protein | 2–30 [E] | partial | summer |
| Pet food, compost scraps, meat bones | protein/lipid | irregular | no | daily around outbuildings |
| Elaiosome seeds (violet, celandine, primrose) [S16] | lipid | seed 2–4 [E] | yes | spring |

**(d) Hazards**: mowers (a blade wake: sudden removal of 100–150 mm canopy; wheel print), strimmers, rake/hoe, trowel digging, hose/sprinkler/rain-barrel flooding, slug pellets and ant-bait (borax/boric acid products) [E] and insecticidal sprays, birds (blackbird, robin, sparrow, starling, wrens), jumping spiders on fences, wolf spiders on lawn [S23], toads, hedgehogs, shrews, aphid predators (not threat to ants), rival colonies, cats/dogs.

**(e) Human timing**: mowing weekly, 10:00–18:00 on dry days, April–October, deck at 25–50 mm [E]; watering at dusk/dawn (sprinkler 15–30 min, 1–3× per week in dry spells) [E]; weeding/digging weekends; bonfire/composting autumn; leaf-blowing in October–November; insecticide/bait use spring–summer (E, rare).

### 1.5 Building interiors (kitchen-focused, house in the same locality)

**(a) Substrates and micro-structures**

| Structure | Dimensions (mm) | Notes |
|---|---|---|
| Door threshold, external door | gap under door 3–10 [E]; weather strip 5–8 | main access; draught-strip removes entry; humid after rain |
| Internal door undercut | 8–20 [E] (fire-door gap ~3 [E]) | passage between rooms |
| Skirting-to-floor gap | 0–5 [E]; behind skirting 2–15 void [E] | ant highway around rooms |
| Wall–worktop junction | 1–5 [E]; sealant fails to 5–10 | crumbs fall in, ants follow |
| Tile grout | 2–5 [E] | cracked grout = path |
| Kitchen kickboard (plinth) | height 100–150, depth 50–80 [E] | warm, dark, undisturbed: nest site |
| Behind appliances | 20–50 [E] | fridge motor is a heat source for Tapinoma/Pharaoh [S24][S25] |
| Pipe penetrations | pipe Ø 15–40 in hole Ø 20–50, annular gap 2–15 [E] | direct outside-in/under-floor connection |
| Floor void / cavity wall | 200–300 / 50–100 [E] | long hidden transport corridors |
| Air brick | 215×65 with 8–12 openings [E] | dry-air, no flooding gate |
| Window frame sill gap | 1–5 [E] | tiny paths |
| Electrical sockets, boxes | 70×70×35 [E] | pharaoh ant nest cavities |
| Carpet pile / rug | 8–15 deep [E] | footing, hiding |
| Houseplants (pots) | soil Ø 100–250 [E] | *Tapinoma sessile* nests in houseplants [S24] |
| Sink, bathroom | trap, plughole Ø 40; waste pipe Ø 32–40 [E] | water supply, humid zone |

**(b) Nesting**: wall voids, insulation, behind kickboards, under floors, in furniture (*Monomorium pharaonis* [S25]); near heat sources, houseplants, toilets (*Tapinoma* [S24]); damp-damaged timber (*Camponotus pennsylvanicus* at roofline/gutter leaks [S12][S13]); in sub-floor sand/concrete cracks (Argentine ant [S26]); cracks and under floorboards (thief ant [S8]). Pharaoh ants thrive in heated buildings year-round: egg to sexual maturity 38–45 days at 27 °C and 80 % RH [S25].

**(c) Food**

| Resource | Class | Item size | Carry? | Renewal |
|---|---|---|---|---|
| Sugar spill, honey, jam, juice | carbohydrate | granule 0.5–1 [E]; drop 3–20 | yes | 2–4 per game day around meals |
| Crumbs, cereal, rice, bread | carbohydrate | 0.5–5 [E] | most yes | after every meal |
| Cooking fat, grease on hob/floor | lipid | film/drop | internal (crop) | daily |
| Meat, cheese, pet food | protein/lipid | 5–20 | no, cut up | irregular; thief ants like grease/meat [S8] |
| Dead insects (flies, spiders) | protein | 3–15 | partial | sporadic |
| Bin / compost caddy | mixed | — | — | emptied 1–2× per week |
| Sealed packages | — | access gaps ≥ 0.5 mm for tiny species [S8] | — | |

**(d) Hazards**: vacuuming, wiping, spray (pyrethroid cleaners), bait stations, sticky traps, feet, drying out (needs moisture; low humidity kills workers/brood quickly [E]), cats, house spiders, centipedes (*Scutigera*), cleaning chemicals (bleach, vinegar disrupt trails), freezing in unheated zones.

**(e) Human timing**: breakfast 07:00–08:30, lunch 12:00–13:30, dinner 18:00–20:00 [E]; washing-up after meals; vacuuming 1–3× per week; mopping weekly; floor wiping daily; windows/doors open in summer afternoons; heating on October–April makes interiors a winter refuge. Pest control: bait stations/gel after infestation; professional spray rare. Pharaoh-ant colonies often scatter after spray and bud into more nests; baits with growth regulators work better [S25].

---

## 2. Organisms that interact with ants

Sizes mm. "AI" notes are one-line behaviour hooks.

### 2.1 Prey and food organisms

| Organism | Size | Habitat | AI note |
|---|---|---|---|
| Springtails (Collembola) | normally < 6 [S15] (the earlier "1–2 hemiedaphic; up to 8–10 surface forms" is not in S15: `[E: unverified]`) | litter, soil, moss, nests | jump on touch (millisecond furcula) [S15]; hard to catch in open, easy in dense litter; cheap protein |
| Mites (oribatid, free-living) | 0.2–1 [E] | litter, humus | slow, armoured, low value; ant-nest commensals |
| Fruit flies | 2–3 [E] | fruit, bin | fly off; larvae in fruit 3–8 [E] |
| Fly larvae / maggots | 5–12 [E] | carrion, compost | immobile feeder; kills over days; protein pulse |
| Caterpillars (geometrid, sawfly) | 5–40 [E] | foliage | thrash and regurgitate; need 3+ workers for large; hairy ones repel ants |
| Termites (southern US, workers) | 4–6 [E] | rotting wood, soil | easy prey, nest sacked; relevant to Camponotus/Atta zone only |
| Aphids | ~2 [S14] | stems, buds | sessile milk-cows; wingless adults, winged forms when crowded [S14]; tended not eaten (except in winter by *L. flavus*) [S3] |
| Scale insects, mealybugs | 1–5 [E] | bark, glasshouse | immobile honeydew source; protected by waxy cover |
| Dead insects | 3–20 | everywhere | carrion item |

### 2.2 Neutral or semi-neutral fauna

| Organism | Size | Note |
|---|---|---|
| Woodlice | 1.2–30 [S27], typical garden 8–15 [E] | slow detritivores, roll into ball (some), chemical defences (some); obstacle, shelter-sharing |
| Millipedes | 20–40 [E] | slow, toxic secretions, repel ants; nuisance obstruction |
| Earthworms | 50–300 [E] | physical blockers; casts at soil surface; if dead = large protein, group carry |
| Snails / slugs | 10–30 / 20–100 [E] | slime trails; shell = shelter; dead slug = large carrion |
| Ground beetles | 5–30 [E] | some eat ants (predator hazard) |
| Bees/wasps/hoverflies at flowers | 8–15 [E] | competitors for nectar; hoverfly larvae are aphid predators |

### 2.3 Predators and parasites of ants

| Organism | Size | Behaviour hook for AI |
|---|---|---|
| Jumping spiders (Salticidae) | 1–25 [S28]; garden species 4–8 [E] | stalk to a few body lengths then leap; best vision among arthropods [S28]; some species specialise on ants (grab behind head) [S28]; wall/fence/slide ambusher; flee-on-alarm trigger |
| Wolf spiders | < 10 to 35 [S23] | wander on ground in litter/lawn, sprint-pounce; eat ants, crickets [S23]; night/dusk heavy |
| *Zodarion* (ant-eating spiders) | up to 5 [S9, Wikipedia *Z. rubidum*]; "typically 2.1–2.9" `[E: unverified, not in S9]` | ants only; bite, retreat, wait until the ant is paralysed (the earlier "~8 min" `[E: unverified]`: Wikipedia gives no wait time and the Springer paper could not be opened; the paper in fact concerns *Z. germanicum*); *Z. rubidum* feeds often on *Tetramorium caespitum* and *Lasius platythorax* [S9]; sandy sunny warm ground, Europe |
| Antlion larvae (Myrmeleontidae) | pit ~75 wide × 50 deep for an *average-sized* larva (S20: "about 2 in deep and 3 in wide"; larger larvae dig larger pits, so 75 is a typical value, not a cap) `[V-corrected from "up to"]`; larva 5–15 [E: unverified] | dry loose sand under shelter; pit walls at angle of repose; flicks sand at escapees [S20]; placed by game as 20–75 mm diameter pits (matches section 6.1), ~1 per m² *inside sheltered dry-sand patches only* [E]; the earlier "20–60" and "1 per sand patch" (7.2) were mutually inconsistent |
| Assassin bugs (Reduviidae) | 10–20 [E] | slow stalkers with proboscis; seldom on ant trails; ant mimic types exist |
| Rove beetles (Staphylinidae) | < 1–35, mostly 2–8 [S29] | fast litter predators of springtails, small ants; some live in ant nests (myrmecophiles) [S29] |
| Centipedes (Lithobiomorpha) | 10–30 [E] | fast night hunters in litter; venom; ant nests invaded |
| Birds: green woodpecker (Europe), flickers (N. America), blackbirds, starlings, sparrows | 20–35 cm [E]; ant tongue-lick; ants central diet of green woodpecker/flickers [E; not verified here] | hits mounds and trails; "anting" by passerines [E]; daytime only |
| Lizards, toads, shrews, hedgehogs, horned lizards (harvester ants) | 50–300 [E] | sit-and-wait/rummage; dusk/night |
| Phorid flies, e.g. *Pseudacteon* | 2–4 [S30] | hover over trail, strike thorax, larva consumes head over weeks; mostly fire-ant hosts [S30]; ants freeze/hide, reduced foraging; likely absent in temperate suburban default [E] |
| Entomopathogenic fungi (*Beauveria*, *Metarhizium*, *Ophiocordyceps*) | spores microscopic | damp nests, dead-body zones; *Ophiocordyceps* tropical forest ~25 cm leaf height, ~94–95 % RH, 20–30 °C [S18]; infected ants leave nest, die, spores drop [S18]; used as outbreak events in persistently humid rotten-log nests |

### 2.4 Honeydew producers, their predators and ant-plant interfaces

| Item | Size | Behaviour hook |
|---|---|---|
| Black bean aphid *Aphis fabae* | ~2 [S14] | winters as eggs on spindle/viburnum, summer on beans, docks, poppies, thistles [S14]; ant protection raised aphid colony; *L. niger* removes ladybirds [S14][S1] |
| Rose aphid, green fly | 1.5–3 [E] | May–July flush |
| Root aphids | ≤ 1.5 [E] | farmed in *L. flavus* nest, main food [S3] |
| Scale insects, mealybugs | 1–5 [E] | stationary honeydew |
| Ladybirds (7-spot) | 5–8 [E] | eats aphids, ants chase; adult and larvae both; ants may lose the fight |
| Lacewing larva | 6–8 [E] | "aphid lion" carrying debris, resist ants partially |
| Hoverfly larva | 8–15 [E] | slug-like, eats aphids, hard for ants to bite |
| Parasitic wasps (*Lysiphlebus*, *Diaeretiella*) | 2–3 [S14][E] | create aphid mummies; ants guard |
| Plants with EFN | *Prunus* (cherry), cotton, *Passiflora*, acacia [S19]; also broad bean, elder, peony [E] | nectar droplets on petioles/leaf bases, 0.5–1 mm, spring flush; ants act as bodyguards [S19] |
| Plants with elaiosome seeds | violets, celandine, bloodroot, trillium, castor [S16] | seed 2–4 [E]; ants carry to nest, eat elaiosome, discard seed on midden: dispersal gameplay |

---

## 3. Competing ant species by habitat

| Species | Worker size mm | Colony | Habitat | Interaction with playable species |
|---|---|---|---|---|
| *Lasius niger* | 3–5; queen 6–9 [S1] | 4000–7000, rarely 40 000 [S1] | pavements, lawns, beds | the reference player species; equal rival colonies fight at territory edges (E) |
| *Lasius flavus* | 2–4; queens 7–9 [S3] | up to 250 000 over linked nests [S3]; co-founding by several queens, after which fighting normally leaves a single queen, i.e. monogyne (S3) `[V-corrected from "polygynous founding"]` | old meadow/lawn turf, under slabs | subterranean root-aphid farmer; low conflict; mound crumbs in grass |
| *Myrmica rubra* | 3.5–5.5; queen 5.5–7 [S2] | polygynous: up to 100 queens/nest, polydomous [S2] | damp lawns, beds, compost | stings, aggressive, attacks rather than flees [S2]; real threat to small Lasius colonies |
| *Tetramorium immigrans* | 2.5–4 [S7] | "a few thousand workers to over 10,000" (Wikipedia, verified); hobbyist 3000–20 000 `[E: unverified]` | pavements, slabs, patios | spring/summer mass-ant wars on slabs (E); numerous, dense, shared joints; main pavement rival |
| *Formica* spp. (F. rufa group; F. fusca/subsericea) | 4.5–9 [S11] | 100 000–400 000, ~100 queens [S11] | woodland edges, sunny clearings | very territorial, spray formic acid, raid neighbours, can parasitise F. fusca group [S11]; woodland "boss" |
| *Tapinoma sessile* | 1.5–3.2 [S24] | hundreds to tens of thousands, polygynous [S24] | indoors, sunny soil, houseplants | subordinate to many ants, avoids fights, chemical defence [S24]; enters buildings after rain [S24] |
| *Solenopsis molesta* | 0.5–3; queen > 5 [S8] | hundreds–thousands [S8] | under rocks, soil, logs, homes | cleptobiotic: nests next to other colonies, steals food/brood [S8]; protein/grease lover; accessible via tiny tunnels |
| *Monomorium pharaonis* | 2.9–4.5 [S25] (usually ~2 [E]) | 1000–2500 workers, up to 200 queens [S25] | heated buildings | indoor invader, buds; not hostile outdoors |
| *Linepithema humile* (Argentine) | 2.2–2.6 [S26] | supercolony [S26] | Mediterranean, S. US coast, buildings | displaces natives [S26]; moves brood from floods [S26]; hot dry or heavy rain entry to buildings [S26] |
| *Camponotus pennsylvanicus* | largest workers ("super majors") 14–17, queen 19–21 [S12]; Penn State gives all workers as 1/4–1/2 in = 6–13 mm `[V-corrected: 14–17 is the super-major maximum, not the typical major]` | mature colony 2000–3000 workers, 200–400 alates per year [S13, NC State]; "up to 10–15 000" `[E: unverified, not in the cited pages]` | wood, stumps, roofline | night forager, 91 m range [S12]; satellite nests [S13]; interacts with *Lasius* mainly for aphids |
| *Messor barbarus* | 3–14 polymorphic [E] | 5000–30 000; mean 8000 `[E: unverified, AntWiki page returned 403; Wikipedia gives no colony size]` | Iberian fields, orchard edges | harvester; permanent trunk trails up to 30 m [S31, verified]; dominant on seed resource, ignores *Linepithema* at low density (E) |
| *Atta texana* | 3–18 [S21] | up to ~2 million workers, multi-queen [S21] | E. Texas sandy soils | mass recruitment [S21]; no direct conflict with player species other than competition for vegetation |

Regional lists: temperate suburban (UK/central Europe): *L. niger*, *L. flavus*, *M. rubra*, *T. immigrans*, *F. fusca*, *F. rufa* in woods. NE USA: *Tapinoma sessile*, *Camponotus pennsylvanicus*, *T. immigrans*, *Formica subsericea*, *L. neoniger*. Mediterranean: *Messor barbarus*, *Linepithema humile*, *Tetramorium* spp., *Tapinoma* complexes. S. US: *Atta texana*, *Solenopsis* (fire and thief) plus *Linepithema*.

---

## 4. Weather and microclimate at ant scale

### 4.1 Rain

| Quantity | Value | Source |
|---|---|---|
| Drizzle drop | < 0.5 mm (or 1 mm boundary, sources disagree) | [S5][S6] |
| Typical rain | 1–3 mm [E]; large ¼-inch (6 mm) ~20 mph | [S5] |
| Max stable | rarely > 5–6 mm; larger drops break up | [S6] |
| Fall speed | < 1 m/s (drizzle); plateau ~9 m/s at ≥ 5 mm; measured speeds can be 25–30 % below terminal in turbulent rain | [S5][S6] |
| Mass of 2 mm drop | ~4.2 mg (calc, sphere) = ~4 worker masses if a worker is 1.06 mg `[E: unverified worker mass]`; 3 mm drop = 14 mg = ~13 workers | calc |

Game rules: rain = a series of drop impacts (area 3×3 BU, random): small drops (< 1 mm) splash and wet but don't harm; shower drops (2–3 mm) knock an ant off a vertical surface or tumble it (high at 1 hit per few seconds per 100 BU²); downpour (4–5 mm) is dangerous in open ground, harmless under leaf, stone or in a tunnel. Impacts also open up soil, crust, flatten litter, and wash fine sand into joints. Flooding: nest shafts ~8 mm (2 BU, Lasius) wide `[V-corrected: the earlier "8–16 mm" mixed the 2 BU tunnel width with the 8–16 BU chamber width of the seed]` on a slope take water within minutes `[E]`; entrance flooding risk relative to catchment; ants move brood to higher chambers (Argentine ants move brood to dry ground [S26]); capillary water in joints holds air bubbles (diving bell).

### 4.2 Temperature (surface values; air ~ 25–30 °C summer)

| Surface | Sun | Shade | Source |
|---|---|---|---|
| Asphalt | > 50 °C in summer (verified: S32 paper says asphalt "exceeds 50 °C", projected > 52.2 °C Jun–Aug); the "up to ~63" figure is `[E: unverified]` (S32 does not contain a Santamouris 2001 citation; treat 63 °C as an extreme upper bound) `[V-corrected]` | air + 2–5 (E) | [S32][S33] |
| Concrete / paving | up to ~57 °C (135 °F, sunlit all day) `[E: unverified, WHAS11 page returned 403; informal TV test]`. S32 paper gives concrete 10.8–45 °C sunlit, up to 35.7 °C shaded | just under 27 °C (just under 80 °F) `[E: unverified]` | [S34][S32] |
| Lawn (grass) | air + 5–10 (E, ~30–38 °C) | ~26 °C (78 °F) | [S34]; E |
| Bare dark soil | 40–55 °C at the surface; below 20 mm drops to air ± 3 (E) | air − 2 | E |
| Leaf litter in woodland | ≈ air − 1 to + 3 | air − 3 | E |
| Painted metal (slide) | 50–70 °C (E) | air + 3 | E |
| Interior floors | 18–24 °C heated (E) | | E |

Winter: ground frost at air < 0 °C for 1–6 nights per cold spell [E]; frozen puddle; snow cover insulates the nest.

Ant limits (honest summary): species-specific CTmax for *L. niger* not found in this pass. Leong, Tsang & Guénard 2022 (PLOS ONE, S35a) measured CTmax for 27 ant species at 0.2, 0.5 and 1.0 °C/min: the ramp-rate effect (slow 0.2 vs fast 1.0 °C/min) averaged 4.13 °C and ranged 1.40–6.47 °C by species; the lowest Hong Kong CTmax (a litter ant, *Strumigenys minutula*) is 38.3 °C regardless of ramp; time to loss of muscle control at the species' CTmax(0.2) averaged 8.5 min (2.3–17.8), versus 2.2 ± 0.7 min at CTmax(1.0) (static assays, 24 species) `[V-corrected: the earlier text left the slow ramp (0.2 °C/min) unnamed and merged two different papers under one [S35]]`. The earlier "CTmax near 38–46 °C at 1.0 °C/min" range is `[E: unverified]`: only the 38.3 °C minimum is in the paper's text. Thermal acclimation within 7–10 days comes from a *different* study of 13 European species (Myrmecological News blog summary, S35b), not from Leong et al. Foraging ceilings are well below CTmax; *Messor barbarus* foraging peaks at surface temperature 15–35 °C `[E: unverified, AntWiki 403]`; for *Atta sexdens rubropilosa* the cited paper only remarks in its methods that ants "do not leave the nest on very hot days, e.g. > 30 °C" (an illustration, not a measured threshold) [S36] `[V-corrected]`; *A. texana* emerges at dusk when temperature "drops below 86 °F" (30 °C) [S21, Texas A&M Forest Service, verified]; the "45–80 °F (7–27 °C)" foraging window attributed to LSU AgCenter `[E: unverified, LSU page returned 503]`. **Game defaults (E):** body-temperature stress begins at 35 °C, paralysis 40–42 °C for temperate species (*Lasius*); survival time at a given surface ~ 5–10 min at 50 °C ground contact (consistent in order of magnitude with the 2–9 min collapse times above); cold: foraging stops below ~5–8 °C, quiescence 5–10 °C (hibernation care ranges 5–10 °C [S37]); heat-tolerant species (*Messor*, *Atta* majors) +4–6 °C. Acclimation is 7–10 days [S35b].

### 4.3 Dew, humidity, wind, frost

| Factor | Ant-scale effect | Value |
|---|---|---|
| Dew | droplet 0.2–2 mm [E], hundreds per cm² on blades; drinking source and sticky hazard; evaporates by 09:00–10:00 [E] | summer mornings after clear nights |
| Humidity | brood needs high RH; Pharaoh 80 % RH [S25]; fungi need ~94 % [S18] | |
| Wind | 1 m/s at 2 m = ~0.1–0.3 m/s near the ground [E]; blows light prey; toppling lightweight ants on grass tips; helps winged alates (flight depends on wind [S38]) | gusts > 5 m/s ground-level disrupt flights |
| Frost | rime on blades; ants sheltered underground; flight impossible; activity needs warm patches | |

Activity windows (E, tunable): Lasius niger in spring/autumn mid-day; in summer bimodal when surface > 35 °C; night foraging by carpenter ants [S12], Atta [S21], Texas.

---

## 5. Seasonal phenology (game: 7 days per season)

| Season | Resources present | Threats present | Notes |
|---|---|---|---|
| Spring | tree/shrub aphid hatch (stem mothers) [S14]; EFN flush [S19]; elaiosome seeds [S16]; early dandelion nectar; caterpillars May; ant queens' brood | spring territorial wars (Formica) [S11]; rain flooding; late frost; birds feeding young; mowing starts; *Tapinoma* enters buildings after rain, late winter–spring [S24] | founding window for many species; rival nests wake up |
| Summer | peak honeydew; aphid colonies grow then predator crash [S14]; flowers, fruit; carrion; picnic food; seeds | heat > 50 °C pavements; droughts; aphid predators; spiders at peak; mowing weekly; nuptial flights Jun–Sep, 97 % of UK sightings in July/August; winged ants seen only above 13 °C and wind < 6.3 m/s, and on every day with mean temperature > 25 °C; humidity is *not* shown to be a trigger in the abstract [S38, Hart et al. 2018] `[V-corrected from "hot humid days >25 °C"]`; *Myrmica*/*Tetramorium* pressure | alates, fight over honeydew |
| Autumn | seeds and fruit fall (windfalls); fungi; aphids' return flight and egg laying [S14]; leaf fall | leaf blowers; cold nights; fewer insects; flights in N. America mostly autumn for some species `[E: unverified; S1 says June–September]` | stockpiling (Messor), brood decline |
| Winter | no honeydew; buildings warm; stored food; *L. flavus* eats root aphids [S3] | frost, flooding, snow, salt; starvation; hibernation 5–10 °C (Oct–Mar) [S37] | time-lapse; colony with queen overwinters; indoor species active |

Variants: Mediterranean — summer drought and heat (foraging window shifts to dawn/dusk), winter rest 2–3 months at ~12 °C [S39], seed rain late spring/early summer; heavy autumn rain flooding. Southern US — mild winters, active foraging at night in summer [S21], nuptial flight regionally synchronised at night [S21].

---

## 6. CONTENT LIST FOR WORLD GENERATION

Flags: **C** climbable, **D** diggable, **S** shelter. Roles: nest, route, food, hazard, barrier, water, shade.

### 6.1 Forest floor
| Object | Dimensions (mm) | Material | C / D / S | Role |
|---|---|---|---|---|
| Oak/beech leaf | 60–120 × 40–70 × 0.2 | leaf | C / no / S | cover, bridge |
| Needle mat | 20–60 deep | conifer | C / no / S | slippery route |
| Humus patch | 20–60 deep | organic soil | no / D / S | nest, springtail source |
| Twig | Ø 2–20 × 50–300 | wood | C / no / no | bridge |
| Log | Ø 150–400 × 1000–3000 | rotten wood | C / D (wood) / S | carpenter nest |
| Stone | 20–200 | flint/limestone | C / no / S | warm nest cover |
| Moss cushion | 10–40 high | moss | C / no / S | moisture |
| Root | Ø 5–50 | wood | C / no / S | roof, tunnel |
| Stump | Ø 300–800 | wood | C / D / S | nest, mushroom |
| Bark slab | 200×100×5–20 | bark | C / no / S | nest cover |
| Fungus | 30–150 cap | fungal | C / no / no | food |
| Acorn | 20×12 | nut | C / no / no | obstacle, shelter |
| Spider zone | ground patch 100–300 | — | — | wolf-spider home range |
| Antlion pit | Ø 20–75, depth 10–50 | sand | no / no / hazard | hazard (sandy clearings only) |

### 6.2 Pavement and parking
| Object | Dimensions (mm) | Material | C / D / S | Role |
|---|---|---|---|---|
| Paving slab | 450×450×50 / 600×450×50 | concrete | C / no / no | surface |
| Sand joint | 3–8 wide | sand/grit | no / D / S | nest, route |
| Mortar joint | 5–10 | mortar | no / limited / S | route |
| Asphalt plane | — | tarmac | C / no / no | hot barrier |
| Asphalt crack | 1–25 wide | tarmac | no / no / S | route to sub-base |
| Kerb | 100–150 high × 100 wide × 500–1000 long | concrete | C / no / S under | climb barrier |
| Gully grate | 300×300; bar gap 10–30 | cast iron | C / no / S | pitfall, flood sink |
| Painted line | 100 wide | paint | C / no / no | marker |
| Tyre/wheel (parked car) | Ø 630, 195 wide | rubber | C / no / S (under car) | shade, event hazard |
| Wheel-stop | 100×200×800 | concrete | C / no / S | nest base |
| Lamp-post/bollard base | Ø 100–200 | steel/concrete | C / no / no | route up |
| Tree pit/verge | 1000×1000 | soil | no / D / S | nest, green refuge |
| Dropped food | crumb 1–20; chip 20–80 | organic | C / no / no | food |
| Spill | 20–200 diameter | liquid | — / — / hazard (drowning) | food |
| Litter (can, wrapper) | 50–150 | metal/plastic | C / no / S | shelter |
| Cigarette butt | 8×55 | cellulose | no / no / no | decoy |

### 6.3 Playground and park
| Object | Dimensions (mm) | Material | C / D / S | Role |
|---|---|---|---|---|
| Play sand pit | 3000×3000×200–300 | sand | no / D (damp) / no | nest, antlion zone |
| Pea gravel bed | pebbles 5–10 | stone | C / no / S | traversal puzzle |
| Wood-fibre bed | pieces 10–50; depth 230–300 `[V-corrected]` | wood | C / no / S | humid shelter |
| Rubber mat | 20–100 thick | rubber | C / no / no | hot slab |
| Timber edging | 100×200×2400 | wood | C / D (rot) / S | nest, gate |
| Post/footing | Ø 60–100 steel | steel/concrete | C (slippery) / no / no | route |
| Slide / platform | 300–2000 | steel/plastic | C / no / no | hot |
| Bench | leg 40–100 | wood/metal | C / no / S | food spill zone |
| Bin | Ø 400 × 800 | plastic/metal | C / no / S | mega food source |
| Lawn grass | blade 2–8, 25–50 tall | grass | C / D / S | canopy |
| Clover patch | leaflet 10–25 | herb | C / no / S | nectar |
| Park tree | trunk Ø 300–800 | wood | C / roots D / S | aphid farm, bark |
| Footprint (child) | 200×80 | — | — / pressing | hazard |

### 6.4 Garden and yard
| Object | Dimensions (mm) | Material | C / D / S | Role |
|---|---|---|---|---|
| Lawn patch | 25–50 tall | grass | C / D / S | habitat |
| Flower bed | 600–1500 | loam + mulch 20–50 | C / D / S | nest, aphids |
| Patio/path slabs | see 6.2 | concrete | C / joints / S | route |
| Garden wall | 200–600 high; gaps 5–30 | stone | C / no / S | nest, vertical |
| Fence panel | 1800×1800; post 75–100 | timber | C / D (wood) / S | route, rot nest |
| Shed | base gap 10–150 | timber | C / D (wood) / S | nest, warm |
| Compost heap | 1000³ | organic | C / D / S | warm nest, prey |
| Plant pot | Ø 100–400 | clay/plastic | C / D / S | nest, water |
| Tree/shrub | stem Ø 10–100 | wood | C / no / S | aphid host |
| Fallen fruit | Ø 30–80 | fruit | C / no / no | food |
| Water butt / pond edge | — | — | C / no / hazard | water, drowning |
| Bird table | 300×300 | wood | C / no / no | seed spill |
| Hose / sprinkler | Ø 15–20 | rubber | C / no / no | water event |
| Slug-pellet / bait station | pellet 3–5; station 80×40 | chemical | C / no / no | trap (rare) |

### 6.5 Interior
| Object | Dimensions (mm) | Material | C / D / S | Role |
|---|---|---|---|---|
| External door threshold | gap 3–10 | timber/metal | C / no / S | entry |
| Internal door undercut | 8–20 | timber | C / no / S | route |
| Skirting board | 100–150 high; gap 0–5 | MDF | C / no / S | highway |
| Tile floor + grout | 300×300; 2–5 | ceramic | C / no / no | surface |
| Carpet | pile 8–15 | textile | C / no / S | slow route |
| Kitchen kickboard | 100–150 high | MDF | C / no / S | nest |
| Wall void | 20–100 | plasterboard | C / D (insulation) / S | nest |
| Pipe penetration | gap 2–15 | plastic/copper | C / no / S | main entry |
| Worktop and sink | 600 deep | laminate | C / no / no | food, water |
| Sink drain | Ø 40 | metal | C / no / hazard | drowning |
| Bin | Ø 300 × 500 | plastic | C / no / S | mega food |
| Pot plant | Ø 100–250 | soil | C / D / S | nest (Tapinoma) |
| Heat source (fridge back, boiler) | — | — | no / no / S | warm nest |
| Air brick | 215×65 | clay | no / no / S | pass |
| Cooker hob | 600×600 | steel | C / no / hazard | grease source |
| Electrical socket | 70×70 | plastic | C / no / S | nest |

---

## 7. EVENT LIST

Frequency format: per game day (GD) unless noted. Real-world cadence in parentheses. Multiply by a difficulty "human activity" slider.

### 7.1 Human events
| Event | Frequency | Effects |
|---|---|---|
| Mower pass | Apr–Oct: 1 per 3 GD (real: weekly; literal 13 days/GD scaling would be 1.9 per GD, so this is a deliberate ~5.6x compression, see conversion rule), 10:00–18:00, fair weather | sweeps canopy 25–50 mm; kills/injures ants in 200 mm swath at the surface; clippings food/shade for 0.5 GD; aphid habitat reduced |
| Strimmer / edging | 1 per 6 GD | strip hazard, flings debris |
| Watering/sprinkler | 1 per 1–2 GD in dry spells, dawn/dusk, real sprinkler run 15–30 min = 0.01–0.02 GD (6–12 real seconds at 1x) `[V-corrected from 0.1 GD = 144 min, a 5–10x arithmetic error]`; design may stretch to >= 0.05 GD (30 s) for readability | drops 1–3 mm, wets soil, floods shallow nests; drink source; evap |
| Rain-barrel/hose spill | 1 per 4 GD | puddle |
| Footfall (shoe) | 5–20 per GD near paths and play areas | 200×80 mm stomp zone; crush and trail wipe |
| Child play/sand digging | school days 2 windows per GD; weekends 1 long | sand disturbance, crumbs; cave-ins |
| Picnic / spill | 1–3 per GD in summer at parks | carbohydrate/protein pulse 0.5–1 GD |
| Car arrival/departure | 6–12 per GD at car park | tyre rolls, oil drip, shade; crumbs |
| Street sweeping / blowing | 1 per 3–5 GD, morning | removes crumbs and loose sand; wipes surface trails |
| Jet-wash/power-wash | 1 per season (summer) | removes joint sand, floods nests |
| Weeding (hand/hot) | 1 per season | kills joint plants, dig disturbance |
| Digging/hoeing | 1 per 4 GD in spring/autumn | nest exposure |
| Leaf blowing | autumn 1 per 2 GD | removes litter |
| Bin collection | 1 per 3 GD | food source vanishes |
| Cooking/meal crumbs | 3 per GD indoors | food windows |
| Wiping/mopping | 1 per GD | trail erasure, spill removal |
| Vacuuming | 1 per 3 GD | high-risk suction event |
| Window/door open | summer 0.5 GD | entry gate widens |
| Bait station placed (ant bait) | 1 per season if infestation | slow poison; recruits workers; sprays 1 per season: trail break, 5 % kill |
| Pesticide spray (garden) | 0.5 per season | residue kills 0.5 GD; repels |
| Salt/de-icer | winter 1 per 3 GD | desiccation hazard |
| Bonfire/compost turning | autumn 1 per season | heat, disturbance |

### 7.2 Natural events
| Event | Frequency | Effects |
|---|---|---|
| Light rain/drizzle | 1 per 3 GD | drizzle drops < 1 mm; water source; foraging dips |
| Shower | 1 per 4 GD | 2–3 mm drops; shallow nest flooding; wash-away food |
| Downpour/thunderstorm | 1 per season (summer) | 4–5 mm drops; flood, leaf fall, open-ground lethality |
| Dew night | clear nights, ~3 of the 7 GD of a season `[E]` | drinking, slippery; until 09:00–10:00 = 0.375–0.42 GD (checks with "~0.4 GD") |
| Heat wave | 1 per summer, 2–3 GD (real 3–7 days x 0.43 GD/day = 1.3–3 GD under the game-week rule; duration is `[E]`) | sunlit asphalt > 50 °C [S32] (63 °C extreme `[E: unverified]`); Tapinoma/Argentine ants invade buildings [S26] |
| Cold snap/frost | 1–2 per winter; late spring risk | foraging stop; plant EFN halts |
| Wind gust | 2 per season | topples ants, scatters litter, disrupts flights [S38] |
| Flying-ant days | weather-gated: eligible on any summer GD (esp. July/Aug equivalent) with temperature > ~25 °C (all such UK days had sightings) and wind < ~6 m/s; expect 2–3 eligible GD per summer `[E: count]`. Hart et al. found flights far less synchronised than the popular "one flying-ant day" idea [S38] `[V-corrected from "1 per summer (hot, humid ...)"]` | alate release, bird/spider feast, nuptial flight; Carpenter swarmers are produced in autumn but fly in spring [S13, NC State] |
| Aphid boom/crash | boom late spring, crash midsummer [S14] | honeydew pulse then loss |
| Fruit fall | autumn 2–4 per GD in orchards | carb pulse, wasp competition |
| Carrion drop (bird, mouse, insect) | 0.5 per GD per 100 m² | big protein job |
| Predator spawn | spider hunts: 3–6 per GD per area at dusk; antlion pits ~1 per m² of sheltered dry sand (consistent with 2.3; the earlier "1 per sand patch" contradicted it); bird raid 1 per GD in daylight | ant deaths, escape rules |
| Fungal outbreak | 1 per season in damp rotten nests | brood/worker loss |
| Rival raid | 1 per 3 GD at borders (Formica spring wars [S11]) | combat |
| Tree-fall/branch drop | 1 per year | obstructing |
| Drought | 1 per summer | water scarcity |

---

## Source key

- [S1] Wikipedia, *Lasius niger* — https://en.wikipedia.org/wiki/Lasius_niger ; BWARS account — https://bwars.com/index.php/ant/formicidae/formicinae/lasius-niger
- [S2] Wikipedia, *Myrmica rubra* — https://en.wikipedia.org/wiki/Myrmica_rubra
- [S3] Wikipedia, *Lasius flavus* — https://en.wikipedia.org/wiki/Lasius_flavus
- [S4] NDSU, playground surfacing depths — https://www.ndsu.edu/agriculture/sites/default/files/2023-01/fn1374.pdf
- [S5] UW-Madison, "How fast do raindrops fall?" — https://wxguys.ssec.wisc.edu/2018/07/16/raindrop-speed
- [S6] Univ. Hawaii, Precipitation processes — https://pressbooks-dev.oer.hawaii.edu/atmo/chapter/chapter-7-precipitation-processes/
- [S7] Ohio State BYGL, *Tetramorium immigrans* — https://bygl.osu.edu/node/2389 ; Landcare Research — https://oldwww.landcareresearch.co.nz/__data/assets/pdf_file/0010/51040/34.pdf ; Wikipedia — https://en.wikipedia.org/wiki/Tetramorium_immigrans
- [S8] Wikipedia, *Solenopsis molesta* — https://en.wikipedia.org/wiki/Solenopsis_molesta
- [S9] Wikipedia, *Zodarion rubidum* — https://en.wikipedia.org/wiki/Zodarion_rubidum ; Zodarion prey masses (Lasius 1.06 mg, Tetramorium 0.57 mg) — https://springerlink.bibliotecabuap.elogim.com/doi/10.1007/s00114-007-0322-3 (`[E: unverified]`: Crossref shows this DOI is Pekár, Toft, Hrušková & Mayntz 2008, Naturwissenschaften 95:233–239, on *Zodarion germanicum* specialising on Formicinae; the paper was paywalled and the masses could not be confirmed)
- [S10] Paving: Thomas Armstrong permeable — https://thomasarmstrongconcreteblocks.co.uk/technical-guidance/block-paving-technical-guidance/permeable-paving ; Stonemarket guide — https://cdn.shopify.com/s/files/1/0569/5845/1870/files/stonemarket-permeapave-installation-guide.pdf ; Edinburgh flag spec — https://www.edinburgh.gov.uk/downloads/file/24459/11505-precast-concrete-paving-flags-600-x-450mm ; BS 7533-13 withdrawn/replaced by 7533-103:2026 (BSI listing)
- [S11] Wikipedia, *Formica rufa* — https://en.wikipedia.org/wiki/Formica_rufa
- [S12] Wikipedia, *Camponotus pennsylvanicus* — https://en.wikipedia.org/wiki/Camponotus_pennsylvanicus
- [S13] Penn State Extension — https://extension.psu.edu/carpenter-ants ; NC State — https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants
- [S14] Wikipedia, black bean aphid — https://en.wikipedia.org/wiki/Black_bean_aphid ; Honeydew — https://en.wikipedia.org/wiki/Honeydew_(secretion)
- [S15] Wikipedia, Springtail — https://en.wikipedia.org/wiki/Springtail
- [S16] Wikipedia, Elaiosome — https://en.wikipedia.org/wiki/Elaiosome
- [S17] Rubberco, BS EN 1177 guide — https://rubberco.co.uk/blogs/news/playground-safety-surfacing-requirements-uk-bs-en-1177-complete-guide-2026 (commercial; indicative)
- [S18] Zombie-ant graveyards — https://ento.psu.edu/files/host-specificity-of-parasite-manipulation-2013zombie-ant-death-location-in-thailand-vs-brazil ; https://reinventionjournal.org/article/view/704 ; Wikipedia, entomopathogenic fungus — https://en.wikipedia.org/wiki/Entomopathogenic_fungus
- [S19] Wikipedia, Extrafloral nectaries — https://en.wikipedia.org/wiki/Extrafloral_nectaries
- [S20] Wikipedia, Antlion — https://en.wikipedia.org/wiki/Antlion
- [S21] Wikipedia, *Atta texana* — https://en.wikipedia.org/wiki/Atta_texana ; Texas A&M Forest Service — https://tfsweb.tamu.edu/LeafCuttingAnt ; TAMU CityBugs — https://citybugs.tamu.edu/?p=331 ; LSU AgCenter — https://www.lsuagcenter.com/articles/page1649168993168
- [S22] AntWiki, *Messor barbarus* (via search result) — https://antwiki.org/wiki/Messor_barbarus
- [S23] Wikipedia, Wolf spider — https://en.wikipedia.org/wiki/Wolf_spider
- [S24] Wikipedia, *Tapinoma sessile* — https://en.wikipedia.org/wiki/Tapinoma_sessile
- [S25] Wikipedia, Pharaoh ant — https://en.wikipedia.org/wiki/Pharaoh_ant
- [S26] Wikipedia, Argentine ant — https://en.wikipedia.org/wiki/Argentine_ant
- [S27] Wikipedia, Woodlouse — https://en.wikipedia.org/wiki/Woodlouse
- [S28] Wikipedia, Jumping spider — https://en.wikipedia.org/wiki/Jumping_spider
- [S29] Wikipedia, Rove beetle — https://en.wikipedia.org/wiki/Rove_beetle
- [S30] Wikipedia, Phoridae — https://en.wikipedia.org/wiki/Phoridae
- [S31] Wikipedia, *Messor barbarus* — https://en.wikipedia.org/wiki/Messor_barbarus
- [S32] https://www.cambridge.org/core/product/FF6A00A766D179AA4EAEA9A3CEAB80F7/core-reader (verified: asphalt > 50 °C, projected > 52.2 °C sunlit Jun–Aug, 36.3 °C shaded; concrete up to 45 °C sunlit, 35.7 °C shaded; the "Santamouris 2001 ≈ 63 °C" attribution in the first draft was NOT found in this page or its reference list)
- [S33] Asphalt colour comparisons — https://koreascience.kr/article/JAKO201520441373040.pdf
- [S34] WHAS11 surface-temperature test — https://whas11.com/article/weather/storm-team-blog/the-heat-is-on-how-hot-common-outdoor-surfaces-can-get-in-the-summer-sun/417-fc5c9290-7ce9-4498-a7ab-5cfc433f999f (informal, °F)
- [S35a] Leong, Tsang & Guénard 2022, "Testing the reliability and ecological implications of ramping rates in the measurement of Critical Thermal maximum", PLOS ONE 17(3):e0265361 (27 species; ramps 0.2/0.5/1.0 °C/min) — https://doi.org/10.1371/journal.pone.0265361 ; [S35b] a different study (13 European species, thermal-death-time model; 7–10 day acclimation) — blog summary — https://blog.myrmecologicalnews.org/2022/09/14/one-model-to-rule-them-all-thermal-death-time-model-reconciles-heat-tolerance-measurements-in-ants/
- [S36] *Atta sexdens* CTmax — https://pmc.ncbi.nlm.nih.gov/articles/PMC3286443
- [S37] Care sheet (hibernation 5–10 °C) — https://antkeepers.com/pages/care-sheet-lasius-niger (hobbyist, not field)
- [S38] Hart, Hesselberg, Nesbit & Goodenough 2018, "The spatial distribution and environmental triggers of ant mating flights: using citizen-science data to reveal national patterns", Ecography 41:877–888 — https://eprints.glos.ac.uk/4780/1/Hart%20et%20al%20flying%20ants.pdf (PDF read in the verification pass)
- [S39] *Messor barbarus* care guide, winter rest ~12 °C — https://formicamarket.com/en/species/messor-barbarus (hobbyist)

## Gaps and recommended follow-ups

- Not found: CTmax / chill-coma values for *Lasius niger*; field foraging thresholds; sand grain-size spec for playground sand; AntWiki species pages (blocked); EN 1177 tables; ant-eating woodpecker data (green woodpecker/flicker) beyond general knowledge; *Messor barbarus* granary depth. All `[E]` rows above should be replaced when a codex pass can read AntWiki, BWARS and primary papers. After the verification pass additionally unresolved: *L. niger* worker mass, *Zodarion* wait time/size, *Messor* colony size and foraging temperature, *A. texana* 7–27 °C foraging window (LSU), concrete 57 °C (WHAS11), asphalt 63 °C, and Camponotus colony "up to 10–15 000".
- Dimension values for UK street furniture and interiors (kerbs, thresholds, skirting, penetrations) are estimates, not measurements; check against BS 7533 / Approved Document documents before locking world-gen presets.

---

## Verification log

Adversarial pass, 2026-11-12. Verdicts: **confirmed** (source says it), **corrected** (value fixed in the document), **unsupported** (could not confirm; now tagged `[E: unverified]`). "Not opened" means the source returned an error (403/503/paywall) and nothing was inferred.

| # | Claim (gameplay use) | Verdict | What the source says | Source |
|---|---|---|---|---|
| 1 | *L. niger* worker 3–5 mm, queen 6–9 mm, colony 4000–7000 (40 000 rare), nests under stones/rotten wood/roots (body-unit scale, colony size) | confirmed | exact match | https://en.wikipedia.org/wiki/Lasius_niger |
| 2 | *L. niger* worker mass ~1.06 mg (raindrop-to-ant mass ratios) | unsupported | cited Springer paper is paywalled; Crossref shows it is about *Zodarion germanicum*; value left as plausible estimate | https://api.crossref.org/works/10.1007/s00114-007-0322-3 |
| 3 | *L. flavus* 2–4 mm, queen 7–9, up to 250 000 workers over linked nests; "polygynous founding" (rival design) | colony size confirmed; founding corrected | co-founding queens fight and one remains (monogyne) | https://en.wikipedia.org/wiki/Lasius_flavus |
| 4 | *Formica rufa* workers 4.5–9 mm, 100 000–400 000 workers, ~100 queens, trails ~100 m, aggressively territorial, spring battles (superpower rival) | confirmed | exact match | https://en.wikipedia.org/wiki/Formica_rufa |
| 5 | *Camponotus pennsylvanicus* "majors 14–17", queen 19–21, forage 91 m, night foraging, colony "up to 10–15 000" (player-species sizing) | corrected: 14–17 mm is the super-major maximum, workers overall 6–13 mm (PSU); 10–15 000 unsupported; queen, 91 m, nocturnal confirmed | colony 2000–3000 workers mature | https://en.wikipedia.org/wiki/Camponotus_pennsylvanicus ; https://extension.psu.edu/carpenter-ants ; https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants |
| 6 | Carpenter ants prefer wood >= ~15 % moisture (wood-nest suitability rule) | confirmed | "prefer wood with a moisture content of 15 % or higher"; PSU: avoid intact dry wood < 15 % | https://content.ces.ncsu.edu/biology-and-control-of-carpenter-ants ; https://extension.psu.edu/carpenter-ants |
| 7 | *Atta texana* workers 3–18 mm, up to 2 million workers, multi-queen, night nuptial flight | confirmed | exact match | https://en.wikipedia.org/wiki/Atta_texana |
| 8 | *A. texana* mound 5–14 in high, 1–1.5 ft across; nest depth | confirmed; depth range widened | mounds as stated; depth 15–20 ft (CityBugs), 25 ft (TFS), 6 m (Wikipedia) | https://citybugs.tamu.edu/?p=331 ; https://tfsweb.tamu.edu/LeafCuttingAnt |
| 9 | *A. texana* emerges at dusk when < 86 °F; forages 45–80 °F | 86 °F confirmed; 45–80 °F unsupported (LSU not opened, 503) | TFS: ants emerge at dusk "when temperatures drop below 86 degrees" | https://tfsweb.tamu.edu/LeafCuttingAnt ; https://www.lsuagcenter.com/articles/page1649168993168 (not opened) |
| 10 | *Atta sexdens* does not leave nest when > 30 °C (foraging heat ceiling) | corrected | an aside in the methods ("very hot days, e.g. > 30 °C"), not a measured threshold; species is *A. sexdens rubropilosa* | https://pmc.ncbi.nlm.nih.gov/articles/PMC3286443 |
| 11 | CTmax study numbers: 27 species, slow-vs-fast ramp effect 1.4–6.5 °C, 8.5 min vs 2.2 min to collapse, HK minimum 38.3 °C | confirmed, but ramp names corrected (slow = 0.2 °C/min; mean effect 4.13 °C; range 1.40–6.47); "38–46 °C" range and 7–10 day acclimation were mis-attributed (acclimation is from a different 13-species European study) | PLOS text | https://doi.org/10.1371/journal.pone.0265361 ; https://blog.myrmecologicalnews.org/2022/09/14/one-model-to-rule-them-all-thermal-death-time-model-reconciles-heat-tolerance-measurements-in-ants/ |
| 12 | Raindrop sizes/speeds: drizzle < 0.5 mm, large drop ~6 mm at ~20 mph (~9 m/s); 2 mm drop ~4 mg; 4–5 mm = 34–65 mg | confirmed (S5: drizzle < 0.02 in; quarter-inch drop ~10 m/s ~20 mph; mass arithmetic checked against sphere volume); S6 not opened | | https://wxguys.ssec.wisc.edu/2018/07/16/raindrop-speed |
| 13 | Playground loose-fill depths (sand 200 loose / ~100 compacted for 9 ft falls; pea gravel >= 125; wood fibre 150–250) (substrate depth for digging) | corrected | CPSC/NDSU: 12 in (305 mm) initial, >= 9 in (229 mm) maintained; sand protects to 4 ft, pea gravel 5 ft, mulch 7 ft, chips and shredded rubber 10 ft | https://www.ndsu.edu/agriculture/sites/default/files/2023-01/fn1374.pdf |
| 14 | Antlion pit "up to ~75 × 50 mm" | corrected: 75 × 50 mm is the *average* larva's pit; spawn size/density rules made consistent (20–75 mm; ~1 per m² of sheltered dry sand) | "average-sized larva digs a pit about 2 in deep and 3 in wide" | https://en.wikipedia.org/wiki/Antlion |
| 15 | *Zodarion*: 2–5 mm, typical 2.1–2.9, waits ~8 min for paralysis | corrected/unsupported: "up to 5 mm" confirmed; 2.1–2.9 and 8 min not found; wrong species in the cited paper | | https://en.wikipedia.org/wiki/Zodarion_rubidum |
| 16 | Asphalt up to 63 °C (hot-surface hazard) | corrected: 63 °C unsupported by cited page; source says > 50 °C (projected > 52.2 °C) | | https://www.cambridge.org/core/product/FF6A00A766D179AA4EAEA9A3CEAB80F7/core-reader |
| 17 | Concrete ~57 °C sunlit / < 27 °C shade | unsupported (page returned 403; informal TV test); cited paper gives 10.8–45 °C sunlit, 35.7 °C shaded | | https://whas11.com/... (not opened) |
| 18 | UK flying ants: "hot humid day, > 25 °C, wind low", one flying-ant day per summer | corrected | flights only > 13 °C and wind < 6.3 m/s; every day with mean > 25 °C had sightings; 97 % in July/Aug; synchrony "far less" than assumed; humidity not a reported trigger | https://eprints.glos.ac.uk/4780/1/Hart%20et%20al%20flying%20ants.pdf |
| 19 | Pharaoh ant egg to sexual maturity 38–45 days at 27 °C, 80 % RH; 2.9–4.5 mm; 1000–2500 workers; up to 200 queens | confirmed (27 °C/80 % RH is stated for the 5–7 day egg stage; the 38–45 day total is not tied to one set of conditions) | | https://en.wikipedia.org/wiki/Pharaoh_ant |
| 20 | *Tetramorium immigrans* 2.5–4 mm, "few thousand to > 10 000", 30–50 cm nest depth, nests under pavement, territorial wars | confirmed (flag "unverified" removed; hobbyist 3000–20 000 still unsupported) | | https://en.wikipedia.org/wiki/Tetramorium_immigrans |
| 21 | *Myrmica rubra* 3.5–5.5 mm, queen 5.5–7, up to 100 queens, polydomous, stings | confirmed | | https://en.wikipedia.org/wiki/Myrmica_rubra |
| 22 | *Argentine ant* 2.2–2.6 mm, supercolonies, moves brood during floods, enters buildings in heat/heavy rain | confirmed | | https://en.wikipedia.org/wiki/Argentine_ant |
| 23 | Springtail size (1–2, up to 8–10) and density up to 100 000/m² | density confirmed; size corrected to "normally < 6 mm" | | https://en.wikipedia.org/wiki/Springtail |
| 24 | Wolf spider < 10–35 mm; jumping spider 1–25 mm, ant specialists, best vision; woodlouse 1.2–30; rove beetle < 1–35 (mostly 2–8), ant-nest inquilines; phorids 2–4 mm typical, 0.4–7 range; Pseudacteon head decapitation after 2–4 weeks | confirmed | | https://en.wikipedia.org/wiki/Wolf_spider ; https://en.wikipedia.org/wiki/Jumping_spider ; https://en.wikipedia.org/wiki/Woodlouse ; https://en.wikipedia.org/wiki/Rove_beetle ; https://en.wikipedia.org/wiki/Phoridae |
| 25 | *Messor barbarus* trunk trails up to 30 m | confirmed | | https://en.wikipedia.org/wiki/Messor_barbarus |
| 26 | *Messor barbarus* colony 5000–30 000 (mean 8000), foraging 15–35 °C | unsupported (AntWiki 403, Wikipedia silent) | | https://antwiki.org/wiki/Messor_barbarus (not opened) |
| 27 | Extrafloral nectaries on *Prunus*, cotton, *Passiflora*, acacia | confirmed (droplet sizes 0.5–1 mm remain `[E]`) | | https://en.wikipedia.org/wiki/Extrafloral_nectaries |

Totals: 27 claims checked (15 priority gameplay claims plus supporting ones): 12 confirmed outright (rows 1, 4, 6, 7, 12, 19, 20, 21, 22, 24, 25, 27); 10 corrected (rows 3, 5, 10, 11, 13, 14, 15, 16, 18, 23); 3 unsupported and downgraded to estimates (rows 2, 17, 26); 2 mixed, confirmed in part with the unsupported part downgraded (rows 8, 9).

### Arithmetic and calendar audit (against `docs/01-design-seed.md`: 1 GD = 10 real min, 28-day year, BU = 4 mm for Lasius)

- 365 / 28 = 13.0 real days per GD: the intro statement "about 13 real days" is correct.
- Scale cheat-sheet BU conversions all re-computed and correct (drizzle 0.05–0.125 BU; shower 0.5–0.75; downpour 1–1.25; paving joints 0.75–1.5 BU; mortar 1.25–2.5; kerb 25–37.5; mown grass 6–12.5; sand 0.015–0.5; litter 5–15; 1 m exposed crossing = 250 BU).
- Drop masses: 2 mm = 4.19 mg, 3 mm = 14.1 mg, 4 mm = 33.5 mg, 5 mm = 65.4 mg; the table's "~34–65 mg" is correct.
- Fixed: sprinkler duration "0.1 GD" vs real 15–30 min (should be 0.01–0.02 GD); nest-shaft width "8–16 mm" (is 2 BU = 8 mm; 8–16 BU is the chamber width); antlion pit size/density inconsistent between 2.3, 6.1 and 7.2.
- Recorded, not an error but a compression: weekly human events at 1 per 3 GD versus a literal 1.9 per GD (see the conversion rule near the top). Daily events at 1 per GD, dew until 09:00–10:00 = 0.375–0.42 GD, spill evaporation 0.2–0.5 GD, and heat wave 2–3 GD (3–7 days at 0.43 GD/day = 1.3–3 GD) are consistent with that rule.
- Not checked: the 600x450x50-63 flag dimensions (S10 Edinburgh spec), BS 7533 values, EN 1177 values, all street-furniture and interior dimensions (remain `[E]`).
