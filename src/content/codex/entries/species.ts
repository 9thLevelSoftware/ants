// Codex: the four playable species (GDD 06 §10 id scheme `cx-species-<id>`; GDD 08 §9.4).
import type { CodexEntry } from '../types';

export const SPECIES_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-species-lasius-niger',
    title: 'Black garden ant',
    binomial: 'Lasius niger',
    category: 'species',
    species: ['LN'],
    body:
      'The black garden ant is the reference species of this game. Workers are 3.4 to 5 mm long, dark brown to blackish, ' +
      'and do not come in distinct sizes. A queen is roughly twice as long, and the longest laboratory record for a queen ' +
      'is 28 years. Colonies nest under stones, paving slabs and wood that the sun warms, or build a soft mound in turf. ' +
      'The ants feed mainly on aphid honeydew, nectar, small insects and scavenged carrion. A mature colony typically ' +
      'holds four to seven thousand workers, and it has a single queen.',
    inGame:
      'A colony in the game is capped at 1,500 workers, so a mature colony here is smaller than a real one. ' +
      'One simulated ant is one ant; nothing stands in for a group.',
    related: ['cx-claustral-founding', 'cx-honeydew', 'cx-stone-nests'],
  },
  {
    id: 'cx-species-camponotus-pennsylvanicus',
    title: 'Black carpenter ant',
    binomial: 'Camponotus pennsylvanicus',
    category: 'species',
    species: ['CP'],
    body:
      'The black carpenter ant is a large formicine of eastern North America. Workers range from about 6 to 16 mm and ' +
      'vary continuously in size; the first-year workers are small and uniform, and larger workers do not appear until ' +
      'the third season. The queen is about 19 mm long. The ants chew moist, softened wood and carry the shavings out; ' +
      'they do not eat it. Most foraging is done at night, along trunks and branches, for honeydew and insect prey. ' +
      'A mature colony holds roughly two to four thousand workers, spread over a parent nest and drier satellite nests.',
    inGame:
      'The game caps this colony at 1,200 workers, below the real figure. Younger colonies in the game are slow to grow, ' +
      'as they are in the research.',
    related: ['cx-wood-moisture', 'cx-satellite-nests', 'cx-night-foraging'],
  },
  {
    id: 'cx-species-messor-barbarus',
    title: 'European harvester ant',
    binomial: 'Messor barbarus',
    category: 'species',
    species: ['MB'],
    body:
      'The harvester ant of Iberia, southern France, Italy and north Africa lives on seeds. Workers vary continuously in ' +
      'size: one laboratory colony from southern France spanned 2 to 15 mm, and the largest workers have broad heads. ' +
      'Foragers use permanent trunk trails and store seed in granary chambers; empty husks go to a refuse pile beside the ' +
      'entrance. In two related species, dead insects were only two to three percent of the items carried home, though ' +
      'the queen and larvae are thought to need animal protein. Colonies have one queen, and the workers are hybrids ' +
      'between two lineages.',
    inGame: 'A real colony may hold ten thousand workers or more; the game caps this one at 1,500.',
    related: ['cx-seed-classes', 'cx-trunk-trail', 'cx-hybridogenesis'],
  },
  {
    id: 'cx-species-atta-texana',
    title: 'Texas leafcutter ant',
    binomial: 'Atta texana',
    category: 'species',
    species: ['AT'],
    body:
      'The Texas leafcutter is the only leafcutter ant in the United States. It nests in well-drained sandy or loamy soil ' +
      'in east Texas, Louisiana and north-eastern Mexico. The ants do not eat the leaves they cut: the leaves feed a ' +
      'fungus, and the fungus feeds the larvae and the queen. Workers are strongly polymorphic, from a few millimetres ' +
      'to more than ten, and each size does different work. In summer they forage almost only at night. A mature ' +
      'colony may hold up to two million workers.',
    inGame: 'The game caps this colony at 1,500 workers; a real mature colony is more than a thousand times larger.',
    related: ['cx-fungus-garden', 'cx-leaf-cutting', 'cx-fungus-pellet'],
  },
];
