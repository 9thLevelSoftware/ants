// Codex: behaviours of ants and colonies (GDD 06 §10; GDD 08 §9.4 additions `cx-antennation`, `cx-nursing`).
import type { CodexEntry } from '../types';

export const BEHAVIOUR_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-claustral-founding',
    title: 'Claustral founding',
    category: 'behaviours',
    species: ['LN', 'CP', 'MB', 'AT'],
    body:
      'A claustral queen digs in, seals herself into a small chamber and raises her first workers without feeding, ' +
      'from the fat and flight muscle she carries. All four species of this game found colonies this way. Black garden ' +
      'ant queens dig small burrows in open soil or under stones. The authors of one study assumed that a queen that ' +
      'found no shelter within about a day would most likely not survive; that is an assumption, not a measurement. ' +
      'Failure at founding is common, as high as 99 percent in some ants.',
    inGame:
      'The opening is played by hand: choose the site, dig, seal the entrance. How likely the queen is to succeed ' +
      'depends on the site, the weather and the difficulty you chose.',
    related: ['cx-dealation', 'cx-queen-reserves', 'cx-cofounding'],
  },
  {
    id: 'cx-egg-eating',
    title: 'A hard choice',
    category: 'behaviours',
    species: ['LN', 'AT'],
    body:
      'A founding queen has only her own body to feed her brood, and in some ants she also feeds on it. Extension ' +
      'literature on the Texas leafcutter states that the queen eats about 90 percent of her first brood; the source ' +
      'says first brood, not trophic eggs in particular. For the black garden ant no measurement of this was found in ' +
      'the research for this game, so what follows for that species is a rule of play, not an observation. In a ' +
      'sealed chamber nothing can be brought in, and every egg or larva is a store of nutrients.',
    inGame:
      'When her reserves are low, a founding black garden ant queen may eat the youngest larva, and part of its ' +
      'nutrients returns to the clutch that remains. Pupae and eggs are not eaten.',
    related: ['cx-queen-reserves', 'cx-claustral-founding'],
  },
  {
    id: 'cx-trophallaxis',
    title: 'Mouth to mouth',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'Liquid food passes from the crop of one ant to the mouth of another. The crop is the part of the gut in which a ' +
      'forager carries liquid food home, and honeydew moves through the colony this way. Workers feed the queen and ' +
      'the larvae by the same exchange, and food flows from worker to worker through the whole colony. It is the ' +
      'social bond of the colony. Nutrients are spread by it, and so are toxins.',
    inGame:
      'While you control an ant, {key:share-food} shares the contents of your crop with a nestmate. The same act feeds brood and ' +
      'the queen when the colony does it by itself.',
    related: ['cx-honeydew', 'cx-protein-larvae'],
  },
  {
    id: 'cx-trail-pheromone',
    title: 'The trail',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'A forager that has found food lays a chemical trail, in trace amounts, from the tip of the ' +
      'abdomen. Most nestmates follow it. In the black garden ant, about one forager in five ignores ' +
      'the pheromone, and ignoring it is not a fixed trait of particular ants. How long an unreinforced trail lasts is ' +
      'uncertain; published values differ and several could not be confirmed. Trails of other species last far ' +
      'longer: harvester ant trunk trails persist over winter, and leafcutter trails for years.',
    inGame:
      'The game\'s trail lifetime is a design value, and the scent view shows where trails are strong. ' +
      'Rain washes unsheltered trails away.',
    related: ['cx-route-memory', 'cx-trunk-trail', 'cx-home-range'],
  },
  {
    id: 'cx-route-memory',
    title: 'Memory against scent',
    category: 'behaviours',
    species: ['LN'],
    body:
      'After a few visits a black garden ant forager has learned its route, and it combines that private memory with ' +
      'the pheromone trail. An ant can learn to ignore a trail that does not lead where it wants to go, but it ' +
      'cannot learn to avoid one. In laboratory runs on a trail, workers walked at 23.5 to 26 mm a second, about six ' +
      'body lengths each second. Memory and scent together may help a forager to keep to a good route after a trail has faded.',
    inGame:
      'Breadcrumbs of a possessed ant are recorded exactly like those of any other ant, so a route you walk can be ' +
      'followed by others after you let go.',
    related: ['cx-trail-pheromone', 'cx-home-range'],
  },
  {
    id: 'cx-home-range',
    title: 'Colony smell on the ground',
    category: 'behaviours',
    species: ['LN'],
    body:
      'Workers leave non-volatile hydrocarbons from their feet as they walk, passively and without any special ' +
      'behaviour. Over time this builds a gradient of colony scent that decreases outward from the nest entrance. ' +
      'In experiments, outbound ants laid less trail pheromone than returning ants on ground marked this way. The ' +
      'hydrocarbons are described as long lasting, though how long has not been measured. The scent is thought to ' +
      'tell a forager whether it is on its own colony\'s ground.',
    inGame:
      'The home-range scent is a field of its own in the simulation; rain washes part of it away.',
    related: ['cx-trail-pheromone', 'cx-nestmate-recognition'],
  },
  {
    id: 'cx-polyethism',
    title: 'Young inside, old outside',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'In the black garden ant the youngest workers nurse the brood and tend the queen, and the oldest forage and ' +
      'handle waste. There are no size classes, only age. Outdoor tasks raise the risk of death, and in the laboratory ' +
      'workers from larger colonies lived shorter lives. Not all species divide work this way. In the leafcutter ' +
      'the division follows body size more than age: the smallest workers tend the fungus and the largest dig and ' +
      'guard. For the harvester, an age split is plausible but has not been shown.',
    inGame:
      'Workers change task as they age, and Colony orders move whole shares of the workforce between task groups.',
    related: ['cx-interface-orders', 'cx-nanitics'],
  },
  {
    id: 'cx-necrophoresis',
    title: 'The undertakers',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'Ants remove their dead. In the black garden ant, corpses are carried to a refuse pile near the nest or ' +
      'scattered away from it. Founding queens of this species are reported to remove dead co-founders. ' +
      'Oleic and linoleic acid have been identified as the post-mortem cues in a different ant, the red ant ' +
      'Myrmica rubra; the cue in the species of this game has not been established. Harvester ants pile husks and ' +
      'refuse beside each entrance, and leafcutters keep waste in separate chambers or on a heap outside.',
    inGame: 'Corpses become items that workers carry to the midden; the possessed ant can carry them too.',
    related: ['cx-garden-waste', 'cx-frass', 'cx-granary-chaff'],
  },
  {
    id: 'cx-nestmate-recognition',
    title: 'Colony odour',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'Ants recognise nestmates by a colony-specific blend of hydrocarbons on the body. In the black garden ant, ' +
      'how aggressive a worker is to a stranger does not depend on how near the stranger\'s nest is or how closely ' +
      'related the stranger is; neighbours are not treated differently. The scent also marks where a colony forages. ' +
      'For the harvester ant the same mechanism is inferred from related species, and has not been shown directly ' +
      'for it.',
    inGame:
      'Every colony has its own odour in the game, and workers treat ants of other colonies as strangers.',
    related: ['cx-home-range', 'cx-formic-acid'],
  },
  {
    id: 'cx-cofounding',
    title: 'Sisters who are not',
    category: 'behaviours',
    species: ['LN'],
    body:
      'In about 18 to 25 percent of cases, two to five unrelated black garden ant queens found a colony together. ' +
      'Queens actively group, and colonies founded by two queens produced their first pupae and workers earlier. ' +
      'Once workers emerge the queens fight, or the workers cull them, until one remains. Egg output decides which ' +
      'survives, not body size. The Texas leafcutter also founds in groups, and unlike another leafcutter it is not ' +
      'known to have workers that kill the co-foundresses.',
    inGame:
      'The opening follows a single queen, and co-founding is described here as the species\' biology. Brood raiding ' +
      'between young colonies of one species is a mechanic of the game; it was not documented for the black garden ' +
      'ant in the research used here, though it is reported for fire ants and for Messor.',
    related: ['cx-claustral-founding'],
  },
  {
    id: 'cx-nuptial-flight',
    title: 'Flying day',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'Winged queens and males leave the nest on days set by season and weather. In Britain, 97 percent of ' +
      'black garden ant sightings fell in July and August; winged ants were seen only above 13 degrees Celsius and ' +
      'in wind below 6.3 m/s, and on every day with a mean above 25 degrees. Flights were far less synchronised than ' +
      'the popular idea of one flying-ant day. In New Jersey, black carpenter ant queens were collected from March ' +
      'to July, most in May, with no synchronised flight detected. Texas leafcutters fly on clear, moonless ' +
      'spring nights, usually after rain.',
    inGame:
      'A flight happens when the weather allows it and the colony has reared winged ants; an alert says when. ' +
      'Real colonies send out hundreds or thousands of winged ants; the game sends fewer.',
    related: ['cx-males', 'cx-wind', 'cx-dealation'],
  },
  {
    id: 'cx-antennation',
    title: 'Antennation',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'To antennate is to touch something with the antennae, the elbowed feelers on an ant\'s head. Worker carpenter ' +
      'ants have twelve segments in each. A tending worker strokes an aphid with them to ask for a droplet of honeydew, ' +
      'and the footprints of tending ants carry chemicals that slow the aphids by about 30 percent. How a queen reads ' +
      'the ground before she digs has not been measured in the research used for this game; the game lets her sweep ' +
      'the ground with her antennae and reports what she finds.',
    inGame:
      '{key:inspect}, or holding it for an antennal sweep, reads the ground, an object or another ant and shows an inspect card. ' +
      'In the opening, a sweep reads the site for diggability, moisture, warmth and cover.',
    related: ['cx-aphid-tending', 'cx-nestmate-recognition'],
  },
  {
    id: 'cx-nursing',
    title: 'Feeding the brood',
    category: 'behaviours',
    species: ['ALL'],
    body:
      'Larvae are legless and cannot feed themselves; adults feed them. In a founding colony the queen does it from ' +
      'her own reserves, and once workers have emerged the youngest workers take over. Black garden ant and carpenter ' +
      'ant larvae need protein to grow: the amount of nitrogen they receive limits their size. Leafcutter larvae are ' +
      'fed only fungus, and prefer its swollen tips, the staphylae, to the thread itself.',
    inGame:
      'Feeding a larva with {key:interact} passes it a share of your crop. Workers on nursing duty do the same for every larva ' +
      'that is hungry.',
    related: ['cx-protein-larvae', 'cx-brood-stages', 'cx-polyethism'],
  },
  {
    id: 'cx-night-foraging',
    title: 'The night shift',
    category: 'behaviours',
    species: ['CP', 'MB', 'AT'],
    body:
      'Black carpenter ants forage mostly at night; large numbers leave soon after sunset. Sources give their range ' +
      'as up to 30 m or up to 91 m from the nest. Harvester ants in Spain are mostly nocturnal in summer. The ' +
      'Texas leafcutter emerges at dusk once the air drops below 30 degrees Celsius, and forages almost only at ' +
      'night in summer. Night foraging avoids the heat and may avoid daytime predators; the research for this ' +
      'game does not show which of these matters most.',
    inGame:
      'The game lets these species work at dusk and by night in warm weather. Real foraging ranges are larger than ' +
      'the map allows, so the game shortens them.',
    related: ['cx-trunk-trail', 'cx-hot-surfaces'],
  },
  {
    id: 'cx-trunk-trail',
    title: 'The worn road',
    category: 'behaviours',
    species: ['MB', 'AT'],
    body:
      'The harvester ant keeps permanent trunk trails, from one to about thirty metres long, cleared of vegetation ' +
      'and branched. A trail stays in place over winter when no ant uses it. About a fifth of ' +
      'harvester trails have seed depots, mostly where terrain is awkward on the longer trails. After a productive season ' +
      'the network gains branches; in scarcity it grows longer links. Leafcutter trails are also kept clear of ' +
      'debris by the workers, and persist for years.',
    inGame: 'A trail walked for three game days and at least 150 body lengths long becomes a trunk trail; it stays when the ants have gone.',
    related: ['cx-trail-pheromone', 'cx-seed-classes'],
  },
  {
    id: 'cx-satellite-nests',
    title: 'Parent and satellite',
    category: 'behaviours',
    species: ['CP'],
    body:
      'A black carpenter ant colony lives in more than one nest. The parent nest is damp and holds the queen, the ' +
      'eggs, the small larvae and many workers. Satellite nests are drier and warmer, hold older larvae, pupae and ' +
      'winged ants, and have no queen; the warmth speeds the development of the older brood. Workers carry brood ' +
      'between them. Inside buildings a colony can have from 2 to 25 satellites, in wall voids, hollow doors and ' +
      'under insulation.',
    inGame:
      'A satellite marker tells the colony where to start one. The queen stays in the parent nest, and the game ' +
      'moves older brood to the satellite when it is drier and warmer.',
    related: ['cx-wood-moisture', 'cx-brood-warmth'],
  },
  {
    id: 'cx-leaf-cutting',
    title: 'Cutting',
    category: 'behaviours',
    species: ['AT'],
    body:
      'A cutter anchors its hind legs and swings its jaws on a pivot to slice a piece from a leaf. For a related ' +
      'leafcutter cutting grass, the work took about 25 seconds per millimetre of cut at 25 degrees Celsius, and 77 ' +
      'seconds at 15 degrees. Cutters are reported to stridulate as they work; the vibration passes through the leaf and ' +
      'is thought to call nearby nestmates. Loads in that study were light, only a fraction of the ant\'s own mass, ' +
      'and lifting 50 times its weight is a different measurement from carrying that much.',
    inGame: 'Cutting takes a held button press. Cold slows it, as it does in life.',
    related: ['cx-hitchhikers', 'cx-fungus-garden'],
  },
  {
    id: 'cx-hitchhikers',
    title: 'Passengers',
    category: 'behaviours',
    species: ['AT'],
    body:
      'Small leafcutter workers sometimes stand on a leaf fragment that a larger worker is carrying home. They ward off ' +
      'phorid flies, which lay their eggs in the ants. Two phorid species attack the Texas leafcutter: ' +
      'Myrmosicarius texanus and Apocephalus wallerae, the second of which runs up to workers that are cutting leaves ' +
      'rather than hovering over them. The maggot develops inside the host\'s head. How many minims ride, and what the ' +
      'ride saves, are not firmly established.',
    inGame: 'Minims can ride a carried leaf when flies are about, and the carrier is attacked less.',
    related: ['cx-phorid-flies', 'cx-leaf-cutting'],
  },
  {
    id: 'cx-garden-waste',
    title: 'Waste',
    category: 'behaviours',
    species: ['AT'],
    body:
      'Spent leaf material is removed from the fungus garden. In one excavated Texas leafcutter nest, 45 of 169 ' +
      'cavities were detritus chambers; other leafcutters use an outside heap. The workers that tend the heap rarely ' +
      'leave it, and a worker from the heap that touches a garden worker is attacked, which is thought to keep ' +
      'contaminated material away from the fungus. Refuse workers in a related species live about half as long as their ' +
      'nestmates.',
    inGame: 'Heap workers stay on the heap and live shorter lives, and the game keeps them out of the garden.',
    related: ['cx-necrophoresis', 'cx-fungal-threads'],
  },
  {
    id: 'cx-fungus-pellet',
    title: 'Carrying the garden',
    category: 'behaviours',
    species: ['AT'],
    body:
      'A leafcutter queen leaves her mother\'s nest with a pellet of the fungus in a pocket of her mouth. After she has ' +
      'dug a chamber, she places the pellet on the floor and fertilises it with droplets of her own faeces, usually within ' +
      'the first one to three days. Only about 2.5 percent of young queens found a colony that lasts. The garden is ' +
      'also the first thing a parasite fungus can destroy: a garden parasite was found in 6.6 percent of colonies at ' +
      'founding.',
    inGame: 'In the opening, the Atta queen plants the pellet and then tends it; the garden is the clock.',
    related: ['cx-fungus-garden', 'cx-claustral-founding'],
  },
];
