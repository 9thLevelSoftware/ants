// Codex: materials (registry B6 `cx-material-<id>`, one per MATERIAL_IDS member). Bodies state what the research
// supports and say so where it is silent; digging, grip and heat rules of the game are in the "in the game" line
// (GDD 03 §2.1 material table, GDD 04 §3 grip table, GDD 06 §2.3 surface heating).
import type { CodexEntry } from '../types';

export const MATERIAL_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-material-loam',
    title: 'Loam',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Loam is soil with a balance of sand, silt and clay. Sand grains are 0.06 to 2 mm across, silt grains 0.002 to ' +
      '0.06 mm and clay particles smaller than 0.002 mm. A tunnel two body lengths wide, about 8 mm for the black garden ant, ' +
      'needs soil that holds together, which is why cohesive loam and sandy loam suit it. Texas leafcutters nest in ' +
      'well-drained sandy or loamy soil, and harvester ants in dry, open, well-drained ground. The one laboratory ' +
      'study that reports a mix built its colonies in sand and clay, one to one.',
    inGame:
      'Loam is the reference soil: it digs at speed 1, and every other soil is measured against it. A ceiling of ' +
      'about 16 body lengths in span holds at middling damp, less when dry. Carpenter ants dig it slowly.',
    related: ['cx-material-sand', 'cx-material-clay', 'cx-mound-structure'],
  },
  {
    id: 'cx-material-humus',
    title: 'Humus',
    category: 'habitats',
    species: ['ALL'],
    body:
      'On a woodland floor, humus is the dark, moist layer of rotted plant matter that lies under the leaf litter and ' +
      'over the mineral soil. It is full of springtails and mites, so it is both a hunting ground and a source of ' +
      'small prey. It is soft, and a patch of humus is listed among the places where a queen can dig a nest. The ' +
      'research for this game gives no measurements of how well ants of the four species dig it, so its dig speed ' +
      'in the game is a design value.',
    inGame:
      'Humus digs about 30 percent faster than loam but holds only short roofs, about 10 body lengths at middling ' +
      'damp. The harvester ant digs it at four fifths of the speed.',
    related: ['cx-habitat-forest', 'cx-springtail'],
  },
  {
    id: 'cx-material-sand',
    title: 'Sand',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Sand is the coarsest of the soils, with grains of 0.06 to 2 mm. Loose sand under cover is where antlion larvae ' +
      'dig their traps. Texas leafcutters nest in sandy soils, and harvester ants in gravel and sandy ground. The sand ' +
      'bedding below paving slabs is a nest site of the black garden ant. The research for this game does not say how ' +
      'well loose sand holds a tunnel; the game treats it as fast to dig, and stable only when it is damp.',
    inGame:
      'Sand digs at 1.6 times the speed of loam, but a roof of more than about 2.5 body lengths slumps when it is ' +
      'dry, and sand slides on slopes steeper than about 34 degrees. Grip on sand is low.',
    related: ['cx-habitat-sand', 'cx-antlion', 'cx-paving-joints'],
  },
  {
    id: 'cx-material-clay',
    title: 'Clay',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Clay is the finest soil, with particles smaller than 0.002 mm. It packs tightly and holds water, so it is ' +
      'slow to dig and slow to drain. In the laboratory, the black garden ant has built nests in a one-to-one mix of ' +
      'sand and clay. Nothing in the research for this game says how the four species compare when digging pure ' +
      'clay, so the game sets its values by design: slow to dig, but a roof in clay can span far more than a roof in ' +
      'sand.',
    inGame:
      'Clay digs at under half the speed of loam. Ceilings of 24 body lengths hold when the clay is neither dry nor ' +
      'saturated. A wet clay surface is slippery. Carpenter ants dig it at a third of the usual rate.',
    related: ['cx-material-loam', 'cx-material-sand'],
  },
  {
    id: 'cx-material-gravel',
    title: 'Gravel',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Gravel ranges from the grit that fills the joints of permeable paving, whose particles of about 2 to 6 mm can ' +
      'be dug, to the pea gravel of a playground bed, whose pebbles are about the size of a pea. The pebbles ' +
      'leave large voids between them that shelter prey, and an ant has to climb over them one by one. In ' +
      'fall-protection tables, a bed of pea gravel protects to about 1.5 m. Gravel drains freely.',
    inGame: 'Gravel digs at about a third of the speed of loam, and water runs through it quickly.',
    related: ['cx-paving-joints', 'cx-habitat-sand'],
  },
  {
    id: 'cx-material-concrete',
    title: 'Concrete',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Concrete is cast into paving flags, kerbs and slabs, and one published specification for a flag is 600 by 450 ' +
      'mm. In one study of surface temperatures, a sunlit concrete surface reached up to 45 degrees Celsius, and ' +
      '35.7 degrees in shade. Ants do not nest in the concrete itself: they use the sand and mortar bed beneath the ' +
      'slab, the joints, and cracks that open with age. A kerb upstand, estimated at 100 to 150 mm, is a cliff of some ' +
      '25 to 38 body lengths for a black garden ant.',
    inGame: 'Concrete cannot be dug and its roofs never fall. It gains less heat than asphalt, and it lags: it is still warm after dusk.',
    related: ['cx-habitat-pavement', 'cx-paving-joints', 'cx-material-mortar'],
  },
  {
    id: 'cx-material-asphalt',
    title: 'Asphalt',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Asphalt is among the hottest ground that ants meet. In a study of surface temperatures, sunlit asphalt exceeded 50 ' +
      'degrees Celsius in summer and was projected to pass 52.2 degrees between June and August, against 36.3 degrees in ' +
      'shade. It is a rough surface of stone chips bound in bitumen. Hairline cracks and wider cracks in it open ' +
      'onto the sub-base below, which can be sand and soil. None of the four species can dig the asphalt itself.',
    inGame: 'Asphalt cannot be dug. It gains heat faster than slabs, and a crack through it can be a route.',
    related: ['cx-habitat-asphalt', 'cx-hot-surfaces'],
  },
  {
    id: 'cx-material-stone',
    title: 'Stone',
    category: 'habitats',
    species: ['ALL'],
    body:
      'A flat stone is among the best things a young black garden ant queen can find. Its underside is warm and dry ' +
      'when the sun has been on it, and the classic founding site of the species is under such a stone. Flint and ' +
      'limestone lie on woodland floors and in gardens. In a garden wall, the crevices between stones are nest sites ' +
      'that run up the wall. A stone counts as shelter and as warm cover over a nest, though the research for this ' +
      'game gives no measurement of how much warmth it adds.',
    inGame:
      'Stone cannot be dug and its roofs never fall. It transmits heat well, so the soil under a stone follows the ' +
      'sun by day.',
    related: ['cx-stone-nests', 'cx-material-brick'],
  },
  {
    id: 'cx-material-brick',
    title: 'Brick',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Brick appears in garden walls and in the walls of a house. Ants use the crevices of a garden wall as nest ' +
      'sites. A house wall can have gaps around pipes and air bricks, which let ants in, and the gap between a ' +
      'wall and a worktop is a route into a kitchen. The research for this game offers no measurements of the ' +
      'material itself: what matters to an ant is the joints, cracks and gaps in it, not the brick.',
    inGame: 'Brick cannot be dug. Grip on it is high, and its joints and gaps are the passages.',
    related: ['cx-material-mortar', 'cx-habitat-interior'],
  },
  {
    id: 'cx-material-tile',
    title: 'Tile',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Tiles floor a kitchen, and the lines of grout between them are narrow channels. Cracked grout is a path for ' +
      'ants, and crumbs fall into it. A tiled kitchen is cleaned often: wiping, mopping and vacuuming remove food and ' +
      'trails. The research for this game does not measure how ants grip glazed tile; the game takes the view that a ' +
      'clean dry tile can be climbed, and that a wet tile is harder to hold.',
    inGame: 'Tile cannot be dug. A wet tile is slippery, and mopping wipes away trails across it.',
    related: ['cx-habitat-interior', 'cx-material-ceramic'],
  },
  {
    id: 'cx-material-wood-sound',
    title: 'Sound wood',
    category: 'habitats',
    species: ['CP'],
    body:
      'Carpenter ants infest both sound and rotted wood, though they favour wood that is already damp and soft. They ' +
      'chew galleries mostly along the grain, through the softer layers; the harder layers remain as walls between the ' +
      'galleries, and the walls are smooth, as if sandpapered. No soil is carried into the galleries. The wood is ' +
      'chewed out and carried away, not eaten. Trees under about 15 cm across are avoided, and so is wood in advanced ' +
      'rot.',
    inGame: 'Only carpenter ants dig sound wood, at 40 percent of the speed of loam, and at 25 percent when it is dry.',
    related: ['cx-wood-moisture', 'cx-frass', 'cx-material-wood-decayed'],
  },
  {
    id: 'cx-material-wood-decayed',
    title: 'Decayed wood',
    category: 'habitats',
    species: ['CP', 'LN'],
    body:
      'Rotten logs and stumps are nest sites for several ants. The black carpenter ant favours wood that is damp and ' +
      'soft, with a moisture content of 15 percent or more, and the black garden ant is recorded nesting in rotten ' +
      'wood too. How far a log has decayed sets how suitable it is for carpenter ants, and wood in advanced rot is ' +
      'avoided. Damp wood is also the place where fungi that kill insects can take hold.',
    inGame:
      'Decayed wood digs at the speed of loam for the carpenter ant, half that for the black garden ant, and at half ' +
      'speed again below 15 percent moisture. It never collapses.',
    related: ['cx-wood-moisture', 'cx-fungal-threads'],
  },
  {
    id: 'cx-material-bark',
    title: 'Bark',
    category: 'habitats',
    species: ['ALL'],
    body:
      'The furrows of bark are vertical highways for ants, and aphid and scale insect colonies live on trunks. ' +
      'Black carpenter ants forage along trunks and branches, and between trees by vines, wires and fences. Pieces of ' +
      'bark on the ground serve as cover over nests. The research for this game gives no measurement of how ants ' +
      'grip bark; the game rates it the surest footing of all its surfaces.',
    inGame: 'Bark cannot be dug. Grip on it is full, and a trunk is a climb route with aphids on it in season.',
    related: ['cx-honeydew', 'cx-night-foraging'],
  },
  {
    id: 'cx-material-plant',
    title: 'Stems and herbs',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Stems, shoots and herbs are the roads to aphids, scale insects and nectar. Cherry carries nectar on its leaf ' +
      'stalks, and roses and beans carry aphids. Ants walk up stems to reach them, and carpenter ants ' +
      'cross between trees along vines. Violets, celandine and primroses set seeds with an elaiosome in spring. Some ' +
      'plants have a waxy surface, and the game gives such a stem a lower grip, though how ants cope with plant wax ' +
      'was not researched here.',
    inGame: 'Plants cannot be dug. A waxy stem is slippery and dew beads on it.',
    related: ['cx-extrafloral-nectar', 'cx-aphid-tending', 'cx-elaiosome'],
  },
  {
    id: 'cx-material-leaf',
    title: 'Leaves and litter',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Leaf litter is stacked leaves that curl, leaving air gaps between them that form a three-dimensional maze. ' +
      'Springtails live in it at up to 100,000 to the square metre, and it is cover from view. For leafcutters, leaves ' +
      'are the raw material of the garden: leaves made up 96.2 percent of the foraging effort of one tropical colony, ' +
      'and the Texas leafcutter harvests more than 200 plant species. Oak and beech leaves stack on a woodland floor, ' +
      'where they are shelter, bridges and cover.',
    inGame: 'Leaves cannot be dug. In the game a leaf is cover and a bridge, and a leafcutter can cut it.',
    related: ['cx-leaf-cutting', 'cx-habitat-forest'],
  },
  {
    id: 'cx-material-metal',
    title: 'Metal',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Metal in a human locality means posts, railings, bins, slides, drain grates and manhole covers. The black garden ' +
      'ant is recorded nesting under metal that the sun warms. A drain or gully grate has bars wide enough apart for an ' +
      'ant to fall through, and a drain can flood. Painted metal in sun is estimated to reach 50 to 70 degrees ' +
      'Celsius, a figure that the research marks as unverified. The game gives smooth dry metal good grip and a ' +
      'greasy hob a poor one.',
    inGame: 'Metal cannot be dug. It heats fastest of all materials in the sun, and a greasy hob is slippery.',
    related: ['cx-hot-surfaces', 'cx-material-plastic'],
  },
  {
    id: 'cx-material-plastic',
    title: 'Plastic',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Plastic in a human locality means bins, plant pots, toys, sheeting and litter. The black garden ant is recorded ' +
      'nesting under plastic that the sun warms, in the same way as under stones and slabs. A bin is a large source of ' +
      'food and a danger when its lid is opened. Plant pots, whether clay or plastic, hold soil and water and are ' +
      'taken as nest sites. No measurements of ants on plastic were found for this game.',
    inGame: 'Plastic cannot be dug. It heats quickly in the sun, and a bin is a rich food source.',
    related: ['cx-material-metal', 'cx-stone-nests'],
  },
  {
    id: 'cx-material-rubber',
    title: 'Rubber',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Rubber appears as tyres, hoses, matting and playground surfacing. The ground under a parked car is shaded, ' +
      'with oil drips and crumbs; cars arriving and leaving roll tyres over the ground nearby, which is a hazard ' +
      'of a car park. Rubber surfacing is hot and cannot be dug. The research for this game does not report ' +
      'measurements of how ants walk on it, and the game gives it good grip.',
    inGame: 'Rubber cannot be dug. Footsteps on it are muffled, and it heats quickly in the sun.',
    related: ['cx-habitat-rubber', 'cx-material-plastic'],
  },
  {
    id: 'cx-material-glass',
    title: 'Glass',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Glass is found in windows, bottles and jars. Bottle residues leave films of sugar that draw ants, and the gap ' +
      'between a window frame and its sill, estimated at a few millimetres, is a path. Ants are widely said to hold on ' +
      'smooth, clean surfaces with adhesive pads, which is why keepers use a barrier coating to stop them climbing ' +
      'the sides of an enclosure. The research for this game did not measure how well each species grips glass, ' +
      'and the game rates its grip a little below metal and tile.',
    inGame: 'Glass cannot be dug. A dry pane can be climbed, and a film of moisture makes it harder to hold.',
    related: ['cx-habitat-interior', 'cx-material-ceramic'],
  },
  {
    id: 'cx-material-fabric',
    title: 'Fabric',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Fabric in a house is carpet, rugs, cushions and clothing. Carpet pile, estimated at 8 to 15 mm deep, is ' +
      'enough to hide an ant and to slow it, so a carpet is a slow route and a place of cover. The research for this ' +
      'game offers no measurements of ants on fabric, so the game treats it as a surface with full grip that ' +
      'hides a walker from view.',
    inGame: 'Fabric cannot be dug. It gives full grip, and it warms and cools like a small object.',
    related: ['cx-habitat-interior', 'cx-material-paper'],
  },
  {
    id: 'cx-material-ceramic',
    title: 'Ceramic',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Ceramic means glazed bowls, mugs, sinks and plant pots, and the clay of an unglazed pot. A pet bowl or a plate ' +
      'is a source of food and sometimes of water, and a sink has a plughole and standing water that are drowning ' +
      'hazards. A pot of soil is a nest site in a house or a garden. The research for this game did not measure how ants ' +
      'hold on glazed ceramic, and the game gives it the same grip as glass.',
    inGame: 'Ceramic cannot be dug. A glazed bowl is a smooth wall, and a wet one is hard to hold.',
    related: ['cx-material-glass', 'cx-material-tile'],
  },
  {
    id: 'cx-material-paper',
    title: 'Paper',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Paper in a locality is wrappers, cardboard and sheets. A wrapper is cover and a roof, and a piece of cardboard ' +
      'can hide a nest or a spill. Paper absorbs water and softens when wet, so a damp wrapper stops being a stiff ' +
      'roof. No measurements of ants and paper were found for this game; its role here is as shelter and litter, ' +
      'and a cigarette end, which is paper and cellulose, is a decoy that is of no use as food.',
    inGame: 'Paper cannot be dug. It absorbs moisture and softens when it is wet.',
    related: ['cx-material-food', 'cx-material-fabric'],
  },
  {
    id: 'cx-material-food',
    title: 'Food',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Human food is taken readily by the black garden ant: sugar, honey, jam, fruit and fatty or protein crumbs. Field ' +
      'baits of sucrose and of amino acids were taken in studies. Carpenter ants take honey, tuna, hot dogs, cookies ' +
      'and sugary or greasy kitchen scraps. Food on a surface is a stack of crumbs of different sizes, and a spill of ' +
      'sugar is a puddle that an ant can drown in. Peaks follow meals and picnics, and cleaning removes it.',
    inGame: 'Food is sticky: a walker crossing a crumb or spill moves at about 70 percent of its speed.',
    related: ['cx-honeydew', 'cx-protein-larvae'],
  },
  {
    id: 'cx-material-water',
    title: 'Water',
    category: 'habitats',
    species: ['ALL'],
    body:
      'At an ant\'s scale, water is a solid thing. A raindrop of 2 mm weighs about 4 mg, several times as much as a worker ' +
      'of the black garden ant, which weighs about 1 mg. Dew is a drink, a puddle is a trap, and a water butt or the ' +
      'edge of a pond is a drowning hazard. Capillary water in a joint can hold an air bubble, a kind of diving bell. ' +
      'Argentine ants move their brood to dry ground when a nest floods, and water is thought to enter a narrow nest ' +
      'shaft on a slope within minutes.',
    inGame: 'Water is not walkable. It can flood a chamber from below, and workers carry brood uphill.',
    related: ['cx-raindrops', 'cx-dew'],
  },
  {
    id: 'cx-material-plaster',
    title: 'Plaster',
    category: 'habitats',
    species: ['ALL'],
    body:
      'Plaster and plasterboard form the walls and ceilings of a house, with voids behind them of an estimated 20 to ' +
      '100 mm. The ' +
      'voids are a place where ants nest, and where they run unseen from room to room. Pharaoh ants nest in wall ' +
      'voids and behind kickboards, and black carpenter ants keep satellite nests in wall voids. The plaster itself ' +
      'is of no interest to ants; the research for this game reports no case of an ant species digging plaster.',
    inGame: 'Plaster cannot be dug. A wall is a climbable surface, and a void behind it is a passage.',
    related: ['cx-material-insulation', 'cx-habitat-interior'],
  },
  {
    id: 'cx-material-insulation',
    title: 'Insulation',
    category: 'habitats',
    species: ['CP', 'LN'],
    body:
      'Insulation fills wall cavities and lofts. Satellite nests of the black carpenter ant are found in wall voids, ' +
      'hollow doors, attics and under insulation, and in some cases in foam plastic. Satellite nests are drier and ' +
      'warmer than the parent nest, which speeds the development of older brood. The research for ' +
      'this game gives no figure for how well the black garden ant digs insulation, and the game rates it at half the ' +
      'carpenter ant\'s rate as a guess.',
    inGame: 'Insulation can be dug by carpenter ants at full speed and by the black garden ant at half that, as an estimate.',
    related: ['cx-satellite-nests', 'cx-material-plaster'],
  },
  {
    id: 'cx-material-mortar',
    title: 'Mortar',
    category: 'habitats',
    species: ['LN'],
    body:
      'Mortar fills the joints between flags, bricks and stones, in joints 5 to 10 mm wide in the mortared paving ' +
      'studied. It is hard, and old mortar cracks and crumbles with age. For an ant the joint is a road and the ' +
      'cracked mortar a way in; the bedding of sand and mortar below a slab is, with the sand, a nest site of the ' +
      'black garden ant and the pavement ant. Hard mortar itself is not something the species of this game can dig.',
    inGame: 'Mortar cannot be dug, but a crumbling joint can be a micro-connection between two surfaces.',
    related: ['cx-paving-joints', 'cx-material-brick', 'cx-material-concrete'],
  },
];
