// Codex: nest sites and habitat zones (GDD 06 §10; `cx-habitat-<zone>` per registry B6, one per ZONE_TYPES member).
import type { CodexEntry } from '../types';

export const HABITAT_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-stone-nests',
    title: 'Warm stone',
    category: 'habitats',
    species: ['LN'],
    body:
      'The black garden ant nests under stones, paving slabs, wood, plastic and metal that the sun warms. Where there ' +
      'is nothing of the kind, it builds a large, soft mound nest in soil or turf. The warm, dry underside of a flat ' +
      'stone is the classic founding site for the species. On a woodland floor, rotten wood and roots are given as ' +
      'nest sites alongside stones, and the red ant Myrmica rubra also nests in soil under flat stones.',
    inGame:
      'A stone heats in the sun and warms the soil under it, and a stone on a slope risks a flooded nest. Cover with ' +
      'warmth and moderate damp can make a founding site good or excellent.',
    related: ['cx-mound-structure', 'cx-habitat-pavement', 'cx-material-stone'],
  },
  {
    id: 'cx-mound-structure',
    title: 'Inside a mound',
    category: 'habitats',
    species: ['LN'],
    body:
      'X-ray scans of two meadow mounds of the black garden ant in France, 27 and 21 cm tall, showed that chambers and ' +
      'galleries made up about 30 percent of the volume. The galleries peaked at about 6 mm high and were centred on ' +
      'a width of about 12 mm. The mounds held 5,390 and 7,099 cubic centimetres of nest, which for a 4 mm worker is ' +
      'a mound only some 65 body lengths across. The number of ants living in these two mounds was not stated.',
    inGame: 'The nest grows with its colony. This entry unlocks when the nest passes 5,000 cubic body lengths.',
    related: ['cx-stone-nests', 'cx-material-loam'],
  },
  {
    id: 'cx-wood-moisture',
    title: 'Damp wood',
    category: 'habitats',
    species: ['CP'],
    body:
      'Carpenter ants prefer wood with a moisture content of 15 percent or more. They chew it and carry it out; they ' +
      'do not eat it, and they are not termites. The ants do not cause the decay: they favour wood that is already ' +
      'damp and soft, such as decayed heartwood and stumps. They infest both sound and rotted wood, but avoid trees ' +
      'less than 15.2 cm across and wood in advanced rot. A dry parent nest means brood failure, because the eggs and ' +
      'young larvae need constant high humidity.',
    inGame: 'A wood nest has a moisture value. When it falls, the colony gets an alert, and chewing slows in dry wood.',
    related: ['cx-frass', 'cx-satellite-nests', 'cx-material-wood-decayed'],
  },
  {
    id: 'cx-frass',
    title: 'Shavings',
    category: 'habitats',
    species: ['CP'],
    body:
      'Carpenter ants carry wood shavings out of the gallery and drop them outside, so that a pile builds up below ' +
      'each small opening, the "window". The shavings look like pencil-sharpener shavings and crumble easily. They ' +
      'contain insect parts, empty seed husks and food remnants, so the frass pile is also the colony\'s midden. A pile ' +
      'is often the first visible sign of a nest. The research found nothing on how carpenter ants dispose of their ' +
      'dead; the game assumes that the same pile receives them.',
    inGame: 'Frass collects below nest openings, and a directive can hide it.',
    related: ['cx-wood-moisture', 'cx-necrophoresis'],
  },
  {
    id: 'cx-paving-joints',
    title: 'Joints',
    category: 'habitats',
    species: ['LN'],
    body:
      'Joints in permeable block paving are 3 to 6 mm wide, about one body length for a black garden ant. Joints in a ' +
      'mortared flag are wider, 5 to 10 mm. Beneath the slabs, the bedding of sand and mortar keeps a stable ' +
      'microclimate, and it is the classic nest site of both Lasius niger and Tetramorium. A joint of exactly this ' +
      'width is, for an ant, a road. Joints are thought to widen as paving ages, but the research gives no figure.',
    inGame: 'A passage through a joint counts as a micro-connection. The first time a worker uses one, the journal notes it.',
    related: ['cx-habitat-pavement', 'cx-pavement-wars'],
  },
  {
    id: 'cx-habitat-forest',
    title: 'Forest floor',
    category: 'habitats',
    species: ['ALL'],
    body:
      'On a woodland floor, fallen leaves lie over a layer of humus, over mineral soil. Stones, logs, roots and moss ' +
      'cushions give shelter and warm or damp patches. Springtails can reach 100,000 to the square metre in the litter. ' +
      'Black garden ants nest under flat stones, rotten wood and roots, and black carpenter ants need damp wood in ' +
      'logs and stumps. The Formica rufa group builds large mounds in clearings. Ground beetles, wolf spiders, toads, ' +
      'shrews and thrushes are the hazards, and people rarely come.',
    inGame: 'Woodland Edge is one of the five localities. Leaf litter is cover, and logs are nest sites for carpenter ants.',
    related: ['cx-springtail', 'cx-formica', 'cx-material-leaf'],
  },
  {
    id: 'cx-habitat-lawn',
    title: 'Lawn',
    category: 'habitats',
    species: ['ALL'],
    body:
      'A lawn is a dense sward of narrow grass blades with thatch beneath, and its open canopy is cool and humid at ' +
      'ground level. The black garden ant nests in lawns and flower beds, and the yellow meadow ant Lasius flavus lives ' +
      'in old turf, where it farms root aphids and leaves crumbs of soil. Clover and dandelion give nectar. Wolf ' +
      'spiders hunt on lawns, and birds feed there. The main hazard is the mower, which removes the grass canopy ' +
      'above the ant in one pass and leaves clippings that give food and shade for a while.',
    inGame: 'A mowing event sweeps the grass at ground level and can injure ants at the surface. A telegraph warns first.',
    related: ['cx-footfall', 'cx-wolf-spider'],
  },
  {
    id: 'cx-habitat-garden-bed',
    title: 'Garden bed',
    category: 'habitats',
    species: ['ALL'],
    body:
      'A flower bed is loose loam, often with a mulch of bark, and warm. It is a good nest site for the black garden ant ' +
      'and a rich one for food: aphids on roses, beans and fruit boom from May to July and then crash as their ' +
      'predators arrive, and flowers give nectar from spring to autumn. Hazards include trowels, hoes, hoses and ' +
      'sprinklers, slug pellets and ant bait, and the blackbirds, robins and starlings that feed there.',
    inGame: 'Garden beds hold aphids in season, with a boom in late spring and a crash in midsummer.',
    related: ['cx-honeydew', 'cx-material-loam'],
  },
  {
    id: 'cx-habitat-pavement',
    title: 'Paving',
    category: 'habitats',
    species: ['LN'],
    body:
      'Concrete slabs and block paving are laid on a bed of sand and mortar over a sub-base. At the surface they are ' +
      'hard and hot; below, the bedding keeps a stable climate and is the classic nest site of the black garden ant ' +
      'and the pavement ant. The joints between slabs are 3 to 10 mm wide, depending on the paving. Hazards are feet, ' +
      'wheels, street sweeping and weeding of the joints, and jet washing, which removes the joint sand and floods ' +
      'nests.',
    inGame: 'Sand joints can be dug and mortar joints cannot. The slab itself is solid, and a joint can open a route to the other side.',
    related: ['cx-paving-joints', 'cx-pavement-wars', 'cx-material-concrete'],
  },
  {
    id: 'cx-habitat-asphalt',
    title: 'Asphalt',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Asphalt is among the hottest ground in a locality. In one study of surface temperatures, asphalt in sun exceeded 50 ' +
      'degrees Celsius, and was projected to exceed 52.2 degrees from June to August, against 36.3 degrees in shade. ' +
      'Its surface is rough with stone chips, and cracks give a way down to the sand and soil of the sub-base. The hard ' +
      'material itself cannot be dug by any of the four species; the sand, grit and soil beneath it can. Cars add tyres, ' +
      'shade, oil drips and crumbs.',
    inGame: 'Crossing asphalt at midday is dangerous in summer. A crack can be a route, and the colony works at dawn and dusk in a heat wave.',
    related: ['cx-hot-surfaces', 'cx-material-asphalt'],
  },
  {
    id: 'cx-habitat-sand',
    title: 'Playground sand',
    category: 'habitats',
    species: ['ALL'],
    body:
      'A sandpit is filled with loose sand to a depth of 12 inches (305 mm) when new, and kept at 9 inches (229 mm) or ' +
      'more once it has compacted. The depth is set by fall protection, not by ants. Dry sand under cover is where ' +
      'antlion larvae dig their pits. Sand grains are 0.06 to 2 mm across, so the largest are about half the length ' +
      'of a worker. Children playing, digging and raking are the main hazard, along with sprinklers and bird ' +
      'flocks at crumbs.',
    inGame: 'Sand digs fast but its tunnels slump when it is dry or saturated. Damp sand holds a tunnel best.',
    related: ['cx-antlion', 'cx-material-sand', 'cx-footfall'],
  },
  {
    id: 'cx-habitat-rubber',
    title: 'Rubber surfacing',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Many playgrounds are surfaced with rubber: loose shredded rubber, or a mat poured or laid in place. In the fall ' +
      'protection tables, shredded rubber and wood chips protect to about 3 m, against 1.2 m for sand and 1.5 m for pea ' +
      'gravel. How ants use rubber surfacing was not found in the research for ' +
      'this game, so what follows is a design estimate: a mat is too hard to dig and warms in the sun, and ants ' +
      'cross it along its seams and edges.',
    inGame: 'Rubber cannot be dug. The seams of a mat and the edge where it meets sand or grass are paths.',
    related: ['cx-habitat-sand', 'cx-material-rubber'],
  },
  {
    id: 'cx-habitat-interior',
    title: 'Inside a house',
    category: 'habitats',
    species: ['ALL'],
    body:
      'A house offers warmth, food and water, and its gaps are passages. Pharaoh ants thrive in heated buildings ' +
      'all year; Tapinoma sessile nests in houseplants and enters buildings after rain. Black carpenter ants nest in ' +
      'timber damaged by damp at the roofline or at leaks, and keep drier satellite nests in wall voids, hollow ' +
      'doors and attics. Gaps under doors, around pipes and behind skirting boards are the routes. Vacuuming, ' +
      'wiping, sprays, bait stations and sticky traps are the hazards.',
    inGame: 'Kitchen Door is one of the five localities. The widths of gaps in the house are the game\'s estimates, not surveys.',
    related: ['cx-satellite-nests', 'cx-footfall', 'cx-material-tile'],
  },
];
