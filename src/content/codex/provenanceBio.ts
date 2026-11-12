// Provenance of the species, caste, behaviour, plant-and-food and creature entries (see provenance.ts).
import { A, C, E, L, M, absent } from './provenanceTypes';
import type { Provenance } from './provenanceTypes';

export const PROVENANCE_BIO: Readonly<Record<string, Provenance>> = {
  'cx-species-lasius-niger': {
    citation: 'BWARS species account; Kramer et al. 2016, Exp Gerontol',
    claims: [
      L('3.4-5.0 mm (Collingwood: 3.5-5.0)'), L('8.0-9.0 mm (Collingwood)'), L('no morphological sub-castes'),
      L('maximum 28 years (lab; Kutter and Stumper 1969'),
      L('under stones, paving slabs, wood, plastic, metal that the sun warms; where none exist, large soft mound nests in soil/turf'),
      L('aphid honeydew, nectar (incl. extrafloral nectaries), fruit, small insects, scavenged carrion'),
      L('typical 4,000-7,000'), L('monogynous (one queen)'),
    ],
    note: 'In the game: the 1,500-worker cap (directions K).',
  },
  'cx-species-camponotus-pennsylvanicus': {
    citation: 'Hansen and Akre 1985; Ohio State and NC State extension factsheets',
    claims: [
      C('Intermediate and major workers do not appear until the third season'), C('first-brood workers are small and uniform'),
      C('Queen: about 19 mm'), C('they do not eat wood; they chew it and carry it out'), C('Mostly nocturnal.'),
      C('2,000-4,000 [S4]'), C('Parent and satellite nests'), C('native to the central and eastern USA and eastern Canada'), C('Formicinae, genus Camponotus'), C('6-16 mm (1/4 to 5/8 in) [S8]'), C('Strong, continuous size variation'), C('moist, softened or decayed wood in living trees'), C('Along tree trunks, branches, vines, wires, fences'), C('Honeydew from aphids and scale insects is the preferred common food'), C('Drier, warmer; speeds larval and pupal development')],
    note: 'Worker length 6-16 mm is the range of two sources; others give 5-13 mm.',
  },
  'cx-species-messor-barbarus': {
    citation: 'Hensen 2002; Merienne et al. 2021; Norman et al. 2016, Mol Ecol',
    claims: [
      M('Myrmicinae; S. Europe (Iberia, S. France, Italy) and N. Africa'), M('a laboratory colony from S. France spanned'),
      M('macrocephalic'), M('Dead arthropods are only 1.82%'), M('Colonies are monogynous'),
      M('Workers are inter-lineage hybrids; new queens come only from within-lineage matings'),
      M('non-food plant parts and empty husks go to a refuse pile (midden) beside each entrance'), M('nearly exclusively'), M('Granary storage'), M('permanent trunk trails')],
    note: 'Protein need of queen and larvae rests on keeper sources and is hedged in the text.',
  },
  'cx-species-atta-texana': {
    citation: 'Texas A&M AgriLife CityBugs; Animal Diversity Web',
    claims: [
      A('up to 2 million (TAMU, ADW)'), A('well-drained sandy or loamy soil'), A('found in east Texas, Louisiana and north-eastern Mexico'),
      A('It is the only Atta in the USA'), A('workers do not eat leaves'), A('summer: almost exclusively at night'),
      A('strongly polymorphic'), A('larvae and queen eat only fungus'), A('workers 3 to 12 mm (ADW)'), A('size-based (physical) polyethism is strong')],
    note: 'In the game: the 1,500-worker cap.',
  },
  'cx-dealation': {
    citation: 'Aron and Deneubourg 2020, Sci Rep',
    claims: [L('flight-muscle histolysis and fat'), A('about 2.5% of young queens found a long-lived colony'), L('as high as 99% in some species')],
  },
  'cx-queen-reserves': {
    citation: 'Schlappi et al. 2020, Commun Biol',
    claims: [
      L('33.1 +/- 6.0 mg (N = 8, control group)'), absent('L', 'Newly mated queen mass | not found'),
      L('rears first brood from body reserves'),
    ],
    note: 'The abdomen as gauge and the failure rule are game rules.',
  },
  'cx-brood-stages': {
    citation: 'Schlappi et al. 2020, Commun Biol',
    claims: [
      L('total "ontogenesis" 52 [51;52] d'), L('19-23 C'), L('The article does not define the start/end points of each stage'),
      L('in silk cocoons (formicine character)'), C('larvae are legless grubs that spin tough tan silk cocoons'),
      C('eggs clump with fine hairs so the queen can carry the whole clutch'), M('Complete metamorphosis: egg, larva, pupa, adult')],
  },
  'cx-callow': {
    citation: 'Hansen and Akre 1985; Kramer et al. 2016',
    claims: [C('Queen helps each worker out of its cocoon')],
    note: 'Pale at emergence and the darkening time are hedged: the Lasius dossier tags "harden over 3-4 days" as unsourced.',
  },
  'cx-nanitics': {
    citation: 'Kramer et al. 2016, Exp Gerontol',
    claims: [
      L('1.08 +/- 0.07 mm; 20-month colonies 1.15 +/- 0.06 mm'), L('nanitics are more efficient at brood care'),
      C('First-summer worker count: 4-25 workers'), C('first-brood workers are small and uniform'), L('head width 1.08 mm vs 1.15 mm at 20 months (~6% narrower)')],
  },
  'cx-males': {
    citation: 'NatureSpot; Hansen and Akre 1985; Mintzer et al.',
    claims: [
      A('| Male life span | 1-2 weeks'), C('males die within weeks of mating'), C('Male mandibular-gland pheromone triggers female flight'),
      L('3.5-4.7 mm (NatureSpot)'), C('tiny head, much smaller than females'), A('much smaller head than females [S3]'),
      L('wings of alates hyaline'),
    ],
  },
  'cx-formic-acid': {
    citation: 'Ohio State extension; Wikipedia, Camponotus ligniperda',
    claims: [
      C('bite then acid into the wound'), C('in formicines it can be about 70 percent of the spray'),
      C('No sting. The sting is converted to an acidopore'), C('Majors give a sharp bite'), M('functional sting'),
      A('bite force about 800 mN'),
    ],
    note: 'In the game: the acid reserve meter.',
  },
  'cx-hybridogenesis': {
    citation: 'Norman et al. 2016, Mol Ecol',
    claims: [
      M('Workers are inter-lineage hybrids; new queens come only from within-lineage matings'),
      M('Mother queens mate with ~2.4 males on average'), M("~13.4% of queens (authors' estimate"), M('20 Mbar1 : 22 Mbar2'), M('two cryptic mitochondrial/nuclear lineages (Mbar1, Mbar2) coexist')],
    note: 'The consequence for a one-lineage queen is an inference (dossier Inference [E]) and is labelled as such in the game line.',
  },
  'cx-claustral-founding': {
    citation: 'Aron and Deneubourg 2020, Sci Rep; Hansen and Akre 1985',
    claims: [
      L('independent, claustral: queen digs in, seals the chamber, does not forage'), L('small burrows in open soil or under stones'),
      L('would most likely not survive'), L('as high as 99% in some species'), C('fully claustral'),
      M('Mode: independent, claustral, single foundress'), A('fully claustral for'),
    ],
  },
  'cx-egg-eating': {
    citation: 'Texas A&M AgriLife CityBugs',
    claims: [A('approximately 90 percent of this first brood will be eaten by the queen')],
    note: 'Black garden ant: no measurement found; the larva-eating rule is the game\'s (GDD 06 §5.12).',
  },
  'cx-trophallaxis': {
    citation: 'Schlappi et al. 2020; Mailleux et al. 2009, C R Biologies',
    claims: [
      L('liquid exchange between crop and mouth; queen is fed by workers; toxins/nutrients spread through colony'),
      C('Honeydew moves by trophallaxis'), C('The social bond: food flows worker to worker, to larvae and to the queen'),
    ],
  },
  'cx-trail-pheromone': {
    citation: 'Koch and Czaczkes 2021; Bestmann et al. 1992; Plowes et al. 2013',
    claims: [
      L('~20% of foragers ignore pheromone'), L('ignoring is not repeatable within individuals'),
      L('trace amounts (<150 pg per ant)'), L('compounds exit via acidopore'), M('persist over winter unused'),
      A('persist for years'), L('84% of the 63 foragers laid a trail over two 0.6 M droplets')],
    note: 'Trail lifetime for the black garden ant is tagged unverified in the dossier and is stated as uncertain.',
  },
  'cx-route-memory': {
    citation: 'Czaczkes et al.; Wenig et al. 2021; Poissonnier et al. 2026',
    claims: [
      L('accurate memories after a few visits; trail pheromone + private memory are combined; ants can learn to ignore but not to avoid trails'),
      L('mean 23.5 mm/s (ants coming from the short path) and 26 mm/s (long path)'), L('5.9-6.5 BU/s')],
  },
  'cx-home-range': {
    citation: 'Czaczkes et al., home-range markings; Lenoir et al. 2009, J Chem Ecol',
    claims: [
      L('non-volatile cuticular hydrocarbons deposited passively by tarsi; gradient outward from nest entrance; outbound foragers lay less pheromone than inbound on hydrocarbon-marked trails'),
      L('persistence time not given ("long lasting")'),
    ],
  },
  'cx-polyethism': {
    citation: 'Quque et al. 2023; Kramer et al. 2016',
    claims: [
      L('youngest workers nurse and tend the queen; oldest forage, handle waste; no morphological castes'),
      L('Workers from larger colonies live shorter lives'), L('outdoor tasks raise mortality'),
      A('Temporal polyethism is weak; size-based (physical) polyethism is strong'),
      M('Task split by age is plausible (young inside, old outside) but not documented for'),
    ],
    note: 'In the game: Colony orders move shares between task groups.',
  },
  'cx-necrophoresis': {
    citation: 'Diez et al. 2013, J Chem Ecol; Hensen 2002',
    note: 'Removal of dead co-founders by queens rests on a secondary source and is worded as "are reported to".',
    claims: [
      L('corpses removed to a refuse pile near the nest or scattered away'),
      L('oleic and linoleic acids as post-mortem cues established for'),
      M('non-food plant parts and empty husks go to a refuse pile (midden) beside each entrance'),
      A('detritus cavities inside the nest (45 of 169 in the excavated nest)'),
    ],
  },
  'cx-nestmate-recognition': {
    citation: 'Czaczkes et al. 2023; Lenoir et al. 2009, J Chem Ecol',
    note: 'For the harvester ant the mechanism is inferred (dossier [E]); the text says so.',
    claims: [
      L('recognition by colony-specific cuticular hydrocarbon profile; aggression scale does not depend on relatedness or distance; neighbours are not special'),
      L('hydrocarbon home-range marking'),
    ],
  },
  'cx-cofounding': {
    citation: 'Aron and Deneubourg 2020, Sci Rep; Mintzer 1987',
    claims: [
      L('In about 18-25% of cases, groups of 2-5 unrelated queens co-found colonies'), L('queens do actively group'),
      L('co-founded colonies produce first pupae and workers earlier'),
      L('winner is determined by fecundity (egg output), not size'),
      A('A. texana worker offspring do not eliminate any females present in the initial colony-founding group'), L('after first workers emerge the queens fight (or workers cull) until one survives'), A('Group founding (pleometrosis) is "confirmed only in')],
    note: 'Brood raiding between incipient colonies: dossier says not documented for Lasius niger (labelled in the game line, directions K).',
  },
  'cx-nuptial-flight': {
    citation: 'Hart et al. 2018, Ecography; Mintzer et al.; Animal Diversity Web',
    claims: [
      E('97 % of UK sightings in July/August'), L('only observed at >13 C and wind < 6.3 m/s'),
      L('all days with mean >25 C had observations'), E('Hart et al. found flights far less synchronised than the popular'),
      C('no synchronised mass flight detected'), C('53 of 111 captures in May'),
      A('on clear, moonless nights, usually after more than 1/4 inch'), C('Flight window March-July, mode in May (111 founding queens collected)'), A('flights April-June')],
  },
  'cx-antennation': {
    citation: 'Oliver et al. 2007; Wikipedia, Black carpenter ant',
    claims: [C('Elbowed, 12 segments in workers'), L('antennal stroking to solicit droplets'), L('footprints contain chemicals that slow tended aphids ~30%')],
    note: 'How a queen reads the ground is stated as unmeasured; the sweep is a game mechanic.',
  },
  'cx-nursing': {
    citation: 'Ohio State extension; Quinlan and Cherrett 1979',
    claims: [
      M('Larvae are legless grubs fed by workers'), L('before workers she performs brood care'),
      L('youngest workers nurse and tend the queen'), C('Larvae need protein; quantity and quality of nitrogen limit growth'),
      A('larvae prefer staphylae to hyphae'),
    ],
  },
  'cx-night-foraging': {
    citation: 'Ohio State extension; Arnan et al. 2023; Texas A&M Forest Service',
    claims: [
      C('Mostly nocturnal.'), C('Up to 100 ft (30 m) [S4]; up to 100 yd (91 m) [S9]'), M('mostly nocturnal in summer'),
      A('summer: almost exclusively at night'), E('emerges at dusk when temperature'),
      C('nocturnal habit lowers predation versus other carpenter ants'),
    ],
    note: 'Real foraging ranges exceed the map; the game shortens them (directions K).',
  },
  'cx-trunk-trail': {
    citation: 'Plowes et al. 2013, Myrmecol News; Hensen 2002',
    claims: [
      M('1-30 m (Reyes 1986, Cerdan 1989, Detrain et al. 2000)'), M('persist over winter unused'),
      M('vegetation and obstacles cleared'), M('on ~20% of trails, caused by awkward terrain on longer trails'),
      M('After a productive season: more branches, shorter links. In scarcity: longer links, fewer branches'),
      A('trails are kept physically clear (workers, especially larger ones, remove debris); persist for years'), M('branched; vegetation and obstacles cleared; persist over winter unused')],
  },
  'cx-satellite-nests': {
    citation: 'Hansen and Akre 1985; Ohio State extension',
    claims: [
      C('Queen, eggs, small larvae, workers'), C('Workers, mature larvae, pupae, alates; no queen'),
      C('Drier, warmer; speeds larval and pupal development'), C('2-25 inside a structure [S2]'),
      C('Workers carry brood between satellites and travel between satellites and parent'), C('High, constant humidity; wood moisture above 15 percent'), C('wall voids, hollow doors, attics, under insulation, crawl spaces, even Styrofoam')],
  },
  'cx-leaf-cutting': {
    citation: 'Roces and Lighton; Kleineidam and Roces; Wikipedia, Leafcutter ant',
    claims: [
      A('25 s per mm of cut width at 25 C, 77 s per mm at 15 C'), A('cutters anchor their hind legs and swing the mandibles on a pivot'),
      A('foragers stridulate while cutting'), A('is for lifting, not carrying'), A('grass loads had burden only about 1.2-1.5'), A('load about 0.2-0.5 x ant mass')],
    note: 'Cutting-time figures are for a grass-cutting relative; stridulation is from search summaries and hedged in the text.',
  },
  'cx-hitchhikers': {
    citation: 'Feener and Moss 1990; USDA Forest Service (Waller)',
    claims: [
      A("confirms only that minims sometimes stand on a worker's leaf to ward off phorids"),
      A('the latter runs up to workers cutting leaves rather than hovering'), A("the maggot develops in the host's head"),
    ],
    note: 'The share of minims that ride and the energy savings are unverified in the dossier and not stated.',
  },
  'cx-garden-waste': {
    citation: 'Moser 2006; Hart and Ratnieks',
    claims: [
      A('45 of 169 cavities'), A('heap workers rarely leave the heap; contaminated workers are attacked'),
      A('refuse-heap workers live about half as long as peers'), A('spent substrate removed to detritus chambers'), A('uses an external heap')],
  },
  'cx-fungus-pellet': {
    citation: 'Mehdiabadi and Schultz 2009; Wikipedia, Leafcutter ant',
    claims: [
      A('queen carries a mycelial pellet in her infrabuccal pocket from the natal nest'), A('fertilises with faecal droplets'),
      A('about 2.5% of young queens found a long-lived colony'), A('Escovopsis is found in 6.6% of colonies at founding'),
    ],
  },
  'cx-honeydew': {
    citation: 'Offenberg 2001; Volkl et al. 1999; Mailleux et al. 2009',
    claims: [
      L('honeydew is a carbohydrate-rich but incomplete diet and workers still need prey'),
      L('prefers aphid-type sugars (melezitose, trisaccharides) over sucrose'), L('0.75 +/- 0.30 uL total (n = 63)'),
      L('84% of the 63 foragers across both sources'), C('Honeydew from aphids and scale insects is the preferred common food'),
    ],
  },
  'cx-aphid-tending': {
    citation: 'Oliver et al. 2007; Collins and Leather 2002',
    claims: [
      L('footprints contain chemicals that slow tended aphids ~30%'), L('workers occasionally move aphids'),
      L('bean yield 56 / 17 / 8 seeds per plant with no aphids / aphids without ants / aphids with ants'),
      L('ants remove ladybirds'),
    ],
  },
  'cx-protein-larvae': {
    citation: 'Dussutour and Simpson 2009, Curr Biol; Cannon and Fell 2002',
    claims: [
      L('carbohydrates fuel adult activity and longevity; protein is needed for queen egg laying and larval growth'),
      C('nitrogenous food was collected four-fold more intensively than carbohydrate'),
      C('peaks in nitrogen foraging in June and September'),
      L('excess protein shortened lifespan, an effect greatly reduced when larvae were present'),
      L('This study was done on the green-headed ant'),
    ],
  },
  'cx-elaiosome': {
    citation: 'Wikipedia, Elaiosome',
    claims: [
      E('Elaiosome seeds (violet, celandine, primrose)'), E('ants carry to nest, eat elaiosome, discard seed on midden'),
      E('violets, celandine, bloodroot, trillium, castor'), E('lipid + protein on the elaiosome'),
    ],
  },
  'cx-extrafloral-nectar': {
    citation: 'Wikipedia, Extrafloral nectaries; Cannon and Fell 2002',
    claims: [
      E('ants act as bodyguards [S19]'), E('nectar droplets on petioles/leaf bases'),
      C('Sucrose preferred over other sugars in lab and field tests; peak consumption at 20 percent sugar; lipids largely ignored'),
    ],
  },
  'cx-seed-classes': {
    citation: 'Hensen 2002; Plowes et al. 2013, Myrmecol News',
    claims: [
      M('Seed mass taken: 0.08 mg'), M('the heaviest seen entering a nest'), M('preferred 4-50 mg regardless of density'),
      M('seeds <0.4 mg'), M('Seeds are not collected if buried deeper than ~1.5 cm'),
      M('size-matching of ant to item weakens with distance from nest'), M('minors carry small seeds, majors take large/preferred ones'), M('seeds <0.4 mg "rarely selected"'), M('so 0.4 mg is a soft preference edge, not a hard floor')],
    note: 'In the game: the three size classes and their limits are design values.',
  },
  'cx-fungus-garden': {
    citation: 'Romer and Roces 2014; Wikipedia, Fungus-growing ants',
    claims: [
      A('cut to 1-2 mm pieces, chewed to pulp, treated with faecal droplets (enzymes), inoculated with hyphae'),
      A('the fungus takes about 6 weeks to break down harvested material'), A('larvae and queen eat only fungus'),
      A('ants choose 21-25 C when relocating fungus/brood'),
      A('growth and survival fall when protein exceeds c. 20% of substrate dry mass'), A('workers do not eat leaves')],
  },
  'cx-granary-chaff': {
    citation: 'Azcarate and Peco 2007; Hensen 2002; Tschinkel and Kwapich 2016',
    claims: [
      M('non-food plant parts and empty husks go to a refuse pile (midden) beside each entrance'),
      M('Midden soil is siltier, richer in K, organic matter and pH'),
      M('Metapleural gland secretion is reported to prevent seed germination and rot by fungi and bacteria in stores'),
      M('of germinating seeds (as reported by Plutarch and others) before storing them'),
      M('granaries are often described as damp'),
    ],
  },
  'cx-jumping-spider': {
    citation: 'Wikipedia, Jumping spider',
    claims: [
      E('stalk to a few body lengths then leap; best vision among arthropods [S28]'),
      E('some species specialise on ants (grab behind head) [S28]'), E('Jumping spiders (Salticidae)'),
    ],
  },
  'cx-wolf-spider': {
    citation: 'Wikipedia, Wolf spider',
    claims: [E('wander on ground in litter/lawn, sprint-pounce; eat ants, crickets [S23]'), E('< 10 to 35 [S23]'), E('night/dusk heavy')],
  },
  'cx-antlion': {
    citation: 'Wikipedia, Antlion',
    claims: [
      E('dry loose sand under shelter; pit walls at angle of repose; flicks sand at escapees [S20]'),
      E('larger larvae dig larger pits'), E('about 2 in deep and 3 in wide')],
  },
  'cx-ant-spiders': {
    citation: 'Pekar et al.; Ortiz et al. 2022; Wikipedia, Zodarion rubidum',
    claims: [
      E('ants only; bite, retreat, wait until the ant is paralysed'), E('sandy sunny warm ground, Europe'),
      M('largely based on the granivorous Messor ants'), M('is not named in the abstract'),
    ],
  },
  'cx-phorid-flies': {
    citation: 'Wikipedia, Phoridae; Waller (USDA)',
    claims: [
      E('hover over trail, strike thorax, larva consumes head over weeks; mostly fire-ant hosts [S30]'),
      E('ants freeze/hide, reduced foraging'), C('Attacks workers; larva can decapitate the host'),
      A('the latter runs up to workers cutting leaves rather than hovering'),
    ],
  },
  'cx-formica': {
    citation: 'Wikipedia, Formica rufa',
    claims: [
      E('~100 queens [S11]'), E('very territorial, spray formic acid, raid neighbours, can parasitise F. fusca group [S11]'),
      E('mounds of needles/twigs'), E('forages ~100 m'),
    ],
    note: 'Wording follows GDD 08 §6.4: boundary contests, not battles.',
  },
  'cx-pavement-wars': {
    citation: 'Wikipedia, Tetramorium immigrans; Ohio State BYGL',
    claims: [
      E('a few thousand workers to over 10,000'), E('stable microclimate; the classic'),
    ],
    note: 'Nest depth and worker length are from the same source (ecology 1.2(b), 3).',
  },
  'cx-fungal-threads': {
    citation: 'Stroeymeyt et al. 2018, Science; Wikipedia, Entomopathogenic fungus',
    claims: [
      E('damp nests, dead-body zones'), E('infected ants leave nest, die, spores drop [S18]'),
      L('fungal infection controlled by social behaviour (grooming, relocation)'), C('Ophiocordyceps unilateralis'),
    ],
  },
  'cx-springtail': {
    citation: 'Wikipedia, Springtail',
    claims: [E('normally < 6 [S15]'), E('jump on touch (millisecond furcula) [S15]'), E('up to 100 000/m')],
  },
};
