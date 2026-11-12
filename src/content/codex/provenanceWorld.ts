// Provenance of the habitat, material, weather, human and interface entries (see provenance.ts). Where the
// ecology dossier tags a value as an estimate, the entry says "estimated" and the value is not listed as a claim.
import { A, C, E, L, M, absent } from './provenanceTypes';
import type { Provenance } from './provenanceTypes';

export const PROVENANCE_WORLD: Readonly<Record<string, Provenance>> = {
  'cx-stone-nests': {
    citation: 'BWARS species account; Wikipedia, Black garden ant',
    claims: [
      L('under stones, paving slabs, wood, plastic, metal that the sun warms; where none exist, large soft mound nests in soil/turf'),
      E('warm, dry undersides'), E('under stones, rotten wood, roots'),
    ],
    note: 'Heating of the stone and the slope flood risk are game rules (GDD 06 §2.3, ecology 1.1).',
  },
  'cx-mound-structure': {
    citation: 'Khuong et al. 2016, PNAS',
    claims: [
      L('mound A 27 cm high x 26 cm diameter, mound B 21 cm high x 27 cm diameter'), L('nest volume 5,390 and 7,099 cm3'),
      L('chambers+galleries ~30% of volume'), L('gallery height peak 5.9 mm (A) / 5.5 mm (B)'),
      L('width distribution centred on ~12 mm'), L('The colony populations of these field nests were not stated'),
      L('~65-68 BU across'), L('field meadow near Marquefave, France; X-ray CT of two nests')],
  },
  'cx-wood-moisture': {
    citation: 'NC State Extension; Ohio State factsheet HYG-2063; ICUP 2003',
    claims: [
      C('prefer wood with a moisture content of 15% or higher'), C('Ants are not termites'),
      C('They do not cause the decay; they favour already-damp, soft wood'),
      C('avoid trees under 15.2 cm diameter and wood in advanced rot'), C('Dried parent nest = brood failure'),
      C('necessary for the development of the eggs and young larvae'), C('they do not eat wood; they chew it and carry it out'), C('decayed heartwood'), C('They infest both sound and rotted wood')],
  },
  'cx-frass': {
    citation: 'Ohio State factsheet HYG-2063',
    claims: [
      C('forming piles under the'),
      C('shavings look like pencil-sharpener shavings and contain insect parts, empty seed husks and food remnants, so frass doubles as the midden'),
      C('Frass crumbles; it is a visible sign'), absent('C', 'Dead-ant (necrophoresis) behaviour: not found for this species'),
    ],
  },
  'cx-paving-joints': {
    citation: 'Thomas Armstrong permeable paving guidance; Wikipedia, Tetramorium immigrans',
    claims: [E('3 mm grit, 4.5 mm nib spacing'), E('5–10 [S10]'), E('stable microclimate; the classic'), E('exactly body-sized: a')],
    note: 'Weathering widening the joints is an estimate in the dossier and is hedged in the text.',
  },
  'cx-habitat-forest': {
    citation: 'Wikipedia, Springtail and Formica rufa; ecology dossier 1.1',
    claims: [
      E('up to 100 000/m'), E('Mound in clearing'), E('dark, moist, many springtails/mites'),
      E('ground beetles and rove beetles, wolf spiders, jumping spiders'), E('under stones, rotten wood, roots'),
    ],
  },
  'cx-habitat-lawn': {
    citation: 'Wikipedia, Lasius flavus; ecology dossier 1.4',
    claims: [E('open-canopy air layer cool and humid'), E('in old turf [S3]'), E('wolf spiders on lawn [S23]'), E('clippings food/shade for 0.5 GD')],
  },
  'cx-habitat-garden-bed': {
    citation: 'Wikipedia, Black bean aphid; ecology dossier 1.4',
    claims: [E('crashes with predators [S14]'), E('Nectar: flowers and EFN'), E('slug pellets and ant-bait')],
  },
  'cx-habitat-pavement': {
    citation: 'Thomas Armstrong permeable paving guidance; ecology dossier 1.2',
    claims: [E('3 mm grit, 4.5 mm nib spacing'), E('5–10 [S10]'), E('removes joint sand, floods nests'), E('stable microclimate; the classic')],
  },
  'cx-habitat-asphalt': {
    citation: 'Cambridge Core surface-temperature study (S32 of the ecology dossier)',
    claims: [
      E('asphalt > 50 °C, projected > 52.2 °C sunlit'), E('36.3 °C shaded'),
      E('Hard asphalt/concrete itself is not diggable; only sand, grit, soil and mortar crumb are'), E('rough walking texture, shade under chips'), E('micro-connection to sub-base'), E('tyre rolls, oil drip, shade; crumbs')],
  },
  'cx-habitat-sand': {
    citation: 'NDSU playground surfacing guide; Wikipedia, Antlion',
    claims: [
      E('12 in (305 mm) initial loose fill, maintained at >= 9 in (229 mm) after compression'),
      E('antlion pits favour fine dry sand [S20]'), E('sand play/digging'),
    ],
  },
  'cx-habitat-rubber': {
    citation: 'NDSU playground surfacing guide',
    claims: [E('chips and shredded rubber 10 ft'), E('protects to 5 ft [S4]'), E('Rubber crumb / poured-in-place mat')],
    note: 'How ants use rubber surfacing was not found; the paragraph says so and gives the game\'s estimate.',
  },
  'cx-habitat-interior': {
    citation: 'Wikipedia, Pharaoh ant and Tapinoma sessile; Ohio State factsheet HYG-2063',
    claims: [
      E('Pharaoh ants thrive in heated buildings year-round'), E('nests in houseplants [S24]'),
      E('enters buildings after rain [S24]'), E('at roofline/gutter leaks [S12][S13]'),
      C('wall voids, hollow doors, attics, under insulation, crawl spaces, even Styrofoam'), E('bait stations, sticky traps'),
    ],
  },
  'cx-material-loam': {
    citation: 'USDA soil texture classes; Khuong et al. 2016; Hensen 2002',
    claims: [
      E('tunnel 2 BU wide (8 mm Lasius) needs cohesive loam/sand-loam'), E('(standard USDA classes)'),
      A('well-drained sandy or loamy soil'), L('built in sand:clay 1:1 (10 g dry weight thin layer)'),
      M('dry, open, sunny, well-drained soil'),
    ],
  },
  'cx-material-humus': {
    citation: 'Ecology dossier 1.1',
    claims: [E('dark, moist, many springtails/mites'), E('Humus patch')],
    note: 'Dig speed of the species in humus has no measurement; the text says so.',
  },
  'cx-material-sand': {
    citation: 'Wikipedia, Antlion; Texas A&M; Hensen 2002',
    claims: [E('antlion pits favour fine dry sand [S20]'), A('well-drained sandy or loamy soil'), M('gravel and sandy ground'), E('stable microclimate; the classic')],
  },
  'cx-material-clay': {
    citation: 'Khuong et al. 2016, PNAS',
    claims: [L('built in sand:clay 1:1 (10 g dry weight thin layer)')],
    note: 'Dig behaviour in clay is unmeasured; the text says so. Digging values are GDD 03 §2.1.',
  },
  'cx-material-gravel': {
    citation: 'Thomas Armstrong permeable paving guidance; NDSU playground surfacing guide',
    claims: [E('grit-filled: porous, diggable at 2–6 mm particle size'), E('protects to 5 ft [S4]'), E('large voids shelter prey, ants must climb pebble-by-pebble')],
  },
  'cx-material-concrete': {
    citation: 'Edinburgh flag specification; Cambridge Core surface-temperature study',
    claims: [E('600×450 flag spec exists [S10]'), E('concrete up to 45 °C sunlit, 35.7 °C shaded'), E('stable microclimate; the classic')],
    note: 'The kerb height is marked as an estimate in the text.',
  },
  'cx-material-asphalt': {
    citation: 'Cambridge Core surface-temperature study',
    claims: [E('asphalt > 50 °C, projected > 52.2 °C sunlit'), E('36.3 °C shaded')],
  },
  'cx-material-stone': {
    citation: 'BWARS species account; ecology dossier 1.1',
    claims: [E('warm, dry undersides'), E('garden wall crevices'), E('flint/limestone')],
  },
  'cx-material-brick': {
    citation: 'Ecology dossier 1.4 and 1.5',
    claims: [E('garden wall crevices'), E('Pipe penetrations')],
    note: 'The research has no measurement of the material itself, and the text says so.',
  },
  'cx-material-tile': {
    citation: 'Ecology dossier 1.5',
    claims: [E('cracked grout = path')],
    note: 'Grip on glazed tile is a game rule (GDD 04 §3).',
  },
  'cx-material-wood-sound': {
    citation: 'Ohio State factsheet HYG-2063; NC State Extension',
    claims: [
      C('mostly along the grain through the softer layers; harder layers remain as walls between galleries'),
      C('No soil in the galleries'), C('They infest both sound and rotted wood'),
    ],
  },
  'cx-material-wood-decayed': {
    citation: 'NC State Extension; BWARS species account',
    claims: [
      C('They infest both sound and rotted wood, but avoid trees under 15.2 cm diameter and wood in advanced rot'),
      E('decay class sets carpenter-ant suitability'), E('under stones, rotten wood, roots'),
    ],
  },
  'cx-material-bark': {
    citation: 'Ecology dossier 1.1; Ohio State factsheet HYG-2063',
    claims: [E('vertical highways, aphid/scale colonies on trunks'), C('Along tree trunks, branches, vines, wires, fences'), E('Bark slab')],
  },
  'cx-material-plant': {
    citation: 'Wikipedia, Extrafloral nectaries and Elaiosome',
    claims: [E('nectar droplets on petioles/leaf bases'), E('Elaiosome seeds (violet, celandine, primrose)'), C('Along tree trunks, branches, vines, wires, fences')],
  },
  'cx-material-leaf': {
    citation: 'Wikipedia, Fungus-growing ants; Texas A&M',
    claims: [A('leaves 96.2% of foraging effort'), A('harvests over 200 species'), E('stacked, leaves curl'), E('up to 100 000/m')],
  },
  'cx-material-metal': {
    citation: 'BWARS species account; ecology dossier 6.2 and 6.3',
    claims: [L('paving slabs, wood, plastic, metal that the sun warms'), E('pitfall / flood channel')],
    note: 'The 50 to 70 degree figure for painted metal is labelled as an unverified estimate in the text.',
  },
  'cx-material-plastic': {
    citation: 'BWARS species account; ecology dossier 6.2',
    claims: [L('paving slabs, wood, plastic, metal that the sun warms'), E('ants nest in pots'), E('mega food source')],
  },
  'cx-material-rubber': {
    citation: 'Ecology dossier 7.1',
    claims: [E('tyre rolls, oil drip, shade; crumbs')],
  },
  'cx-material-glass': {
    citation: 'Ecology dossier 1.2 and 1.5',
    claims: [E('Cigarette butts, gum, bottle residues'), E('Window frame sill gap')],
    note: 'Pad adhesion and the keeper barrier coating are stated as "widely said"; GDD 04 deviation V1.',
  },
  'cx-material-fabric': {
    citation: 'Ecology dossier 1.5',
    claims: [E('Carpet pile / rug'), E('footing, hiding')],
  },
  'cx-material-ceramic': {
    citation: 'Ecology dossier 1.5 and 6.5',
    claims: [E('Sink drain')],
  },
  'cx-material-paper': {
    citation: 'Ecology dossier 6.2',
    claims: [E('Cigarette butt')],
  },
  'cx-material-food': {
    citation: 'Renyard et al. 2024; Ohio State factsheet HYG-2063',
    claims: [
      L('sugar, honey, jam, fruit, fatty/protein crumbs are taken readily'),
      C('Honey, tuna, hot dogs, cookies, sugary and greasy kitchen items'), E('Sugary spills (soda, ice-cream, juice)'),
    ],
  },
  'cx-material-water': {
    citation: 'UW-Madison, raindrop speed; Wikipedia, Argentine ant',
    claims: [
      E('~4 mg for 2 mm sphere'), L('~1.04 mg'), E('capillary water in joints holds air bubbles (diving bell)'),
      E('Argentine ants move brood to dry ground [S26]'),
    ],
  },
  'cx-material-plaster': {
    citation: 'Ecology dossier 6.5; Ohio State factsheet HYG-2063',
    claims: [E('Wall void'), C('wall voids, hollow doors, attics, under insulation, crawl spaces, even Styrofoam')],
  },
  'cx-material-insulation': {
    citation: 'Ohio State factsheet HYG-2063',
    claims: [C('wall voids, hollow doors, attics, under insulation, crawl spaces, even Styrofoam'), C('Drier, warmer; speeds larval and pupal development')],
  },
  'cx-material-mortar': {
    citation: 'Thomas Armstrong permeable paving guidance',
    claims: [E('5–10 [S10] | hard, cracks with age'), E('stable microclimate; the classic')],
  },
  'cx-raindrops': {
    citation: 'UW-Madison, raindrop speed; University of Hawaii, precipitation processes',
    claims: [
      E('Drizzle drop | < 0.5 mm'), E('(sphere volume: 4 mm = 33.5 mg, 5 mm = 65.4 mg)'),
      E('measured speeds can be 25–30 % below terminal in turbulent rain'), L('~1.04 mg'),
    ],
  },
  'cx-hot-surfaces': {
    citation: 'Leong, Tsang and Guénard 2022, PLOS ONE; Hensen 2002',
    claims: [
      E('is 38.3 °C regardless of ramp'), E('averaged 8.5 min (2.3–17.8)'), E('2.2 ± 0.7 min'),
      E('asphalt > 50 °C, projected > 52.2 °C sunlit'), M('collecting begins in the evening when soil surface <40 C'),
      absent('E', 'Not found: CTmax / chill-coma values for'),
    ],
    note: 'The game thresholds (35 and 40 to 42 degrees) are labelled design estimates.',
  },
  'cx-dew': {
    citation: 'Ecology dossier 4.3',
    claims: [E('summer mornings after clear nights')],
    note: 'Droplet size and drying time are estimates in the dossier; the text says so.',
  },
  'cx-frost': {
    citation: 'Ecology dossier 4.3; Wikipedia, Black carpenter ant',
    claims: [E('rime on blades; ants sheltered underground; flight impossible; activity needs warm patches'), C('Inactive below about 5 C except on unusually warm days'), E('snow cover insulates the nest')],
  },
  'cx-wind': {
    citation: 'Hart et al. 2018, Ecography; Boomsma and Leusink 1981',
    claims: [L('no flights above ~1.7 m/s wind at 2 m'), L('only observed at >13 C and wind < 6.3 m/s'), E('blows light prey; toppling lightweight ants on grass tips')],
    note: 'The ground-level wind ratio is an estimate in the dossier; the text says so.',
  },
  'cx-brood-warmth': {
    citation: 'Ohio State factsheet HYG-2063; Romer and Roces 2014',
    claims: [
      L('queens stop laying and all brood is converted to larvae before/during hibernation'),
      C('brood develops faster in the warmer, drier satellite nests'), A('ants choose 21-25 C when relocating fungus/brood'),
    ],
    note: 'The development threshold is an estimate; the text says it has not been measured.',
  },
  'cx-hibernation': {
    citation: 'Haatanen et al. 2015; Willot et al.; Hansen and Akre 1985',
    note: 'The 5 to 10 degree keeper range is a hobbyist source and is worded as hobbyist practice.',
    claims: [
      L("at +2 C vs +7-8 C, worker survival fell while founding queens' survival was unaffected"),
      L('colony-level diapause is partly endogenous (a dormancy timer)'),
      C('colonies kept at constant temperature do not overwinter'), C('colony enters diapause in September-October'),
    ],
  },
  'cx-overwinter-larvae': {
    citation: 'Kipyatkov; Hansen and Akre 1985; ICUP 2003',
    claims: [
      L('queens stop laying and all brood is converted to larvae before/during hibernation'),
      C('Overwintering stage is the larva'), C('The spring brood averages 55 to 70 days to develop from egg to worker'),
    ],
  },
  'cx-footfall': {
    citation: 'Ecology dossier 7.1',
    claims: [E('crush and trail wipe')],
    note: 'The shoe print size and the footfall rate are estimates in the dossier; the text says so.',
  },
  'cx-interface-orders': {
    citation: 'Gordon 2007, "Control without hierarchy"',
    claims: [
      M('Queen | egg-laying only; no foraging after founding'), M('Entrance-chamber encounters set outgoing foraging'),
    ],
    note: 'Describes the game\'s own abstraction (GDD 02 §0.3 D10).',
  },
};
