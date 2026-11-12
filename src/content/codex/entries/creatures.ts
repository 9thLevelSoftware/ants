// Codex: creatures that live among ants, hunt them or contest their ground (GDD 06 §10; GDD 08 §6.4 wording rule:
// contests between colonies are described as ecological contests, never as human institutions).
import type { CodexEntry } from '../types';

export const CREATURE_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-jumping-spider',
    title: 'Jumping spiders',
    binomial: 'Salticidae',
    category: 'creatures',
    species: ['ALL'],
    body:
      'Jumping spiders have the best eyesight among arthropods. They stalk to within a few body lengths of their prey ' +
      'and then leap. The family covers sizes from 1 to 25 mm. Some species specialise in ants, and take them by ' +
      'seizing them behind the head. In gardens and parks they are met on walls, fences and play equipment as well ' +
      'as on the ground. Garden species are estimated at 4 to 8 mm long.',
    inGame:
      'Jumping spiders stalk and then leap. Workers that notice one flee, and a comfort setting in Settings changes how ' +
      'spiders are drawn without changing how they behave.',
    related: ['cx-wolf-spider', 'cx-ant-spiders'],
  },
  {
    id: 'cx-wolf-spider',
    title: 'Wolf spiders',
    binomial: 'Lycosidae',
    category: 'creatures',
    species: ['ALL'],
    body:
      'Wolf spiders hunt on the ground and in leaf litter, sprinting to pounce. They range from under 10 mm to 35 mm ' +
      'in length, and ants are among their prey, along with crickets. They wander over lawn and litter rather than ' +
      'staying at one spot, and are reported to be most active at dusk and at night, so an ant that is out at those ' +
      'hours meets them more often than one that stays in by day.',
    inGame: 'A wolf spider has a home range on the ground. Foragers that cross it are at risk.',
    related: ['cx-jumping-spider', 'cx-night-foraging'],
  },
  {
    id: 'cx-antlion',
    title: 'The pit',
    binomial: 'Myrmeleontidae',
    category: 'creatures',
    species: ['ALL'],
    body:
      'An average antlion larva digs a pit about 75 mm wide and 50 mm deep in dry, loose sand under shelter; larger ' +
      'larvae dig larger pits, so these sizes are typical and not a limit. The walls stand at the angle of repose, the ' +
      'steepest slope that loose sand can hold. The larva flicks sand at an ant that tries to escape. The pits ' +
      'are made only in dry sand that has shelter above it.',
    inGame: 'Antlion pits appear only in sheltered dry sand, and the larva flicks sand at an ant that tries to climb out.',
    related: ['cx-material-sand', 'cx-habitat-sand'],
  },
  {
    id: 'cx-ant-spiders',
    title: 'Ant-eating spiders',
    binomial: 'Zodarion',
    category: 'creatures',
    species: ['ALL'],
    body:
      'Zodarion spiders feed on ants only. They are small, up to 5 mm long. A spider bites a ' +
      'single ant and then retreats, waiting while the ant is paralysed. One species takes mainly Tetramorium and ' +
      'small Lasius, and lives on sandy, sunny ground in Europe. A gut-content study of three widespread Iberian ' +
      'ant-eating spiders found diets largely based on harvester ants of the genus Messor, which are abundant there. ' +
      'The study did not name Messor barbarus in its abstract.',
    inGame: 'Ant-eating spiders pick off single workers on and beside trails.',
    related: ['cx-wolf-spider', 'cx-jumping-spider'],
  },
  {
    id: 'cx-phorid-flies',
    title: 'Flies over the trail',
    binomial: 'Phoridae',
    category: 'creatures',
    species: ['CP', 'AT'],
    body:
      'Phorid flies hover over trails and strike the thorax of a worker. The larva develops inside the ant, and in the ' +
      'species studied it consumes the head over a few weeks. Ants freeze or hide when the flies appear, and foraging ' +
      'falls. The flies are 2 to 4 mm long. Apocephalus concisus attacks black carpenter ant workers, and the maggot can ' +
      'decapitate its host. Two other species parasitise the Texas leafcutter. Most of what is known concerns ' +
      'fire ants.',
    inGame: 'Phorid flies threaten carpenter ants and leafcutters. Leafcutter minims riding a carried leaf drive them away.',
    related: ['cx-hitchhikers', 'cx-species-camponotus-pennsylvanicus'],
  },
  {
    id: 'cx-formica',
    title: 'The big neighbour',
    binomial: 'Formica rufa group',
    category: 'creatures',
    species: ['LN', 'CP'],
    body:
      'Colonies of the Formica rufa group hold 100,000 to 400,000 workers and about a hundred queens. The nests are ' +
      'mounds of needles and twigs several metres across, and the ants forage about a hundred metres out. Their workers ' +
      'spray formic acid. They are very territorial, raid neighbouring colonies, and can parasitise ants of the ' +
      'Formica fusca group. In spring they hold their territories in boundary contests with neighbours. For a ' +
      'small colony in a wood or at its edge, a mound of this kind is the dominant neighbour.',
    inGame: 'A Formica nest is a rival territory. The stance set in Colony orders (Cautious, Defensive or Aggressive) decides how your colony meets it.',
    related: ['cx-formic-acid', 'cx-pavement-wars'],
  },
  {
    id: 'cx-pavement-wars',
    title: 'Boundary disputes on the slabs',
    binomial: 'Tetramorium immigrans',
    category: 'creatures',
    species: ['LN'],
    body:
      'The pavement ant nests under paving slabs and in joints. Workers are 2.5 to 4 mm long, and colonies range from ' +
      'a few thousand to over ten thousand workers. Most of a nest\'s volume lies 30 to 50 cm below the surface, and ' +
      'shafts and chambers may reach 60 to 90 cm in some soils. The ants are territorial, and colonies that share ' +
      'joints meet in mass encounters at their boundaries. The sand bedding under slabs is a classic nest site for both ' +
      'the pavement ant and the black garden ant.',
    inGame:
      'A slab rival is another colony in the same joints. Boundaries shift with food and the size of each nest, ' +
      'and the state between the colonies is shown as Neutral, Wary, Clashing, Territorial dispute or Lull.',
    related: ['cx-habitat-pavement', 'cx-paving-joints'],
  },
  {
    id: 'cx-fungal-threads',
    title: 'Fungus in the nest',
    category: 'creatures',
    species: ['ALL'],
    body:
      'Fungi that kill insects, such as Beauveria, Metarhizium and Ophiocordyceps, thrive in damp nests and near ' +
      'dead bodies. Ants control them by grooming and by moving away from infected areas; for the black garden ant ' +
      'this social defence is reported to be strong. In tropical forest, ants infected by Ophiocordyceps leave the nest ' +
      'and die on a leaf about 25 cm above the ground, in air of about 94 to 95 percent humidity. A damp parent ' +
      'nest, which carpenter ants need, is also where these fungi do best.',
    inGame: 'A damp nest can suffer an outbreak. Workers groom, move brood, and shun infected parts of the nest.',
    related: ['cx-wood-moisture', 'cx-garden-waste'],
  },
  {
    id: 'cx-springtail',
    title: 'Springtails',
    binomial: 'Collembola',
    category: 'creatures',
    species: ['ALL'],
    body:
      'Springtails are small wingless animals, normally under 6 mm long. They jump when touched, by releasing a ' +
      'spring-like organ folded under the abdomen, in a matter of milliseconds. They live in leaf litter, soil, moss ' +
      'and the nests of ants, and can reach densities of up to 100,000 to the square metre. For ants, a springtail is ' +
      'a small piece of protein: hard to catch in the open, where it can spring away, and easier in dense litter.',
    inGame: 'Springtails are small prey that jump away when approached. They are common in humid litter.',
    related: ['cx-protein-larvae', 'cx-habitat-forest'],
  },
];
