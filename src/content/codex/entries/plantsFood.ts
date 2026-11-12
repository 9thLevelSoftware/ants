// Codex: plants, food and the economy around them (GDD 06 §10; `cx-springtail` is in creatures.ts).
import type { CodexEntry } from '../types';

export const PLANT_FOOD_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-honeydew',
    title: 'Honeydew',
    category: 'plants-food',
    species: ['LN', 'CP'],
    body:
      'Aphids excrete honeydew, a sugary liquid that is rich in carbohydrate but an incomplete diet. Black garden ants ' +
      'prefer the sugars typical of aphid honeydew, such as melezitose, to plain sucrose. In a laboratory trial of 63 ' +
      'foragers, a worker drank about 0.75 microlitres in total from two droplets, and 84 percent of them laid a ' +
      'trail. Workers still need prey for protein. Carpenter ants also take honeydew from aphids and scale insects as ' +
      'their preferred common food, and move it through the colony by mouth.',
    inGame: 'Honeydew counts mainly as carbohydrate (C). Protein (P) has to come from prey, carrion or other food.',
    related: ['cx-aphid-tending', 'cx-protein-larvae', 'cx-trophallaxis'],
  },
  {
    id: 'cx-aphid-tending',
    title: 'The herd',
    category: 'plants-food',
    species: ['LN', 'CP'],
    body:
      'Workers stroke aphids with their antennae to solicit droplets of honeydew, and drive off ladybirds and other ' +
      'predators. The footprints of tending ants carry chemicals that slow the aphids by about 30 percent. ' +
      'Workers occasionally move aphids themselves. In one study on beans, plants with ' +
      'aphids and ants gave 8 seeds, plants with aphids but no ants 17, and plants without aphids 56. The plant ' +
      'pays for the partnership. Ants gain a steady supply of sugar, and the aphids gain protection from their predators.',
    inGame: 'Workers tend herds on host plants, and a predator that arrives at a herd is driven off by workers nearby.',
    related: ['cx-honeydew', 'cx-antennation'],
  },
  {
    id: 'cx-protein-larvae',
    title: 'What larvae need',
    category: 'plants-food',
    species: ['ALL'],
    body:
      'Carbohydrate fuels adult activity and lifespan; protein is needed for larval growth and for the queen\'s eggs. ' +
      'Carpenter ants were found to collect nitrogen-rich food four times more intensively than carbohydrate, with ' +
      'peaks in June and September, when older larvae are in the nest. In an experiment on another ant, the green-headed ' +
      'ant Rhytidoponera metallica, excess protein shortened adult lifespan, and the effect was greatly reduced when ' +
      'larvae were present. That result is an analogy for the species of this game, not a finding about them.',
    inGame: 'Larvae raise the colony\'s demand for protein, and the diet slider in Colony orders shifts the balance.',
    related: ['cx-honeydew', 'cx-nursing'],
  },
  {
    id: 'cx-elaiosome',
    title: 'Seeds with a handle',
    category: 'plants-food',
    species: ['LN'],
    body:
      'Violet and celandine seeds carry an elaiosome, a fatty body attached to the seed. Ants take the seed home, ' +
      'eat the elaiosome and discard the seed on the refuse heap, which disperses the plant. Bloodroot, trillium and ' +
      'castor seeds work in the same way, and so do primroses in a garden. The elaiosome provides lipid and protein. ' +
      'These seeds ripen in spring and early summer, so for a colony they are a short seasonal source of fat, and the ' +
      'seed itself is not food.',
    inGame: 'Elaiosome seeds appear in spring and early summer, and a discarded seed can sprout near the midden.',
    related: ['cx-seed-classes', 'cx-necrophoresis'],
  },
  {
    id: 'cx-extrafloral-nectar',
    title: 'Nectar on the leaf',
    category: 'plants-food',
    species: ['LN', 'CP'],
    body:
      'Cherry and some other plants secrete nectar outside the flower, from glands on leaf stalks and leaf bases. ' +
      'Cotton, passion flowers and acacias do the same, in a spring flush. Ants that come for the nectar act as ' +
      'bodyguards for the plant. ' +
      'Carpenter ants were tested with sugar solutions in the field and laboratory: they preferred sucrose to other sugars, ' +
      'with consumption peaking at a 20 percent solution, and largely ignored lipids.',
    inGame: 'Extrafloral nectar is a carbohydrate source on plants and fills during the spring flush.',
    related: ['cx-honeydew', 'cx-aphid-tending'],
  },
  {
    id: 'cx-seed-classes',
    title: 'Seeds by size',
    category: 'plants-food',
    species: ['MB'],
    body:
      'Harvester ants of the genus Messor in south-east Spain took seeds from 0.08 mg, thyme, to 95.9 mg, retama, the ' +
      'heaviest seen entering a nest. ' +
      'Seeds of 4 to 50 mg were preferred whatever the density, and seeds below about 0.4 mg were rarely chosen; that ' +
      'is a soft edge, since thyme seeds were carried. Minors are reported to carry small seeds and majors to take the ' +
      'big preferred ones. ' +
      'Seeds buried deeper than about 1.5 cm are not collected. Size matching between ant and seed weakens with ' +
      'distance from the nest.',
    inGame:
      'The game sorts seeds into three size classes for small, medium and large workers. The limits between the ' +
      'classes are design values.',
    related: ['cx-granary-chaff', 'cx-trunk-trail'],
  },
  {
    id: 'cx-fungus-garden',
    title: 'The garden',
    category: 'plants-food',
    species: ['AT'],
    body:
      'Leafcutter workers do not eat leaves. They cut them into pieces of one or two millimetres, chew them to a pulp, ' +
      'treat the pulp with droplets of enzyme-rich faeces and add hyphae of the fungus. The fungus takes about six weeks ' +
      'to break harvested material down. Larvae and the queen eat only the fungus. When the ants relocate fungus and ' +
      'brood they choose 21 to 25 degrees Celsius. In laboratory culture, growth and survival fell when protein exceeded ' +
      'about a fifth of the substrate dry mass.',
    inGame:
      'The garden is a living chamber with its own health. Too much protein, heat or contamination makes it fail, and ' +
      'a colony without a garden can starve.',
    related: ['cx-leaf-cutting', 'cx-fungus-pellet', 'cx-garden-waste'],
  },
  {
    id: 'cx-granary-chaff',
    title: 'Granary and chaff',
    category: 'plants-food',
    species: ['MB'],
    body:
      'Husks and non-food plant parts go to a refuse pile beside each entrance. The soil there is siltier and richer in ' +
      'potassium and organic matter, and seeds sprout there far more than elsewhere. Secretions of the metapleural ' +
      'gland are reported to prevent germination and rot in the store. An old account says that workers bite off the ' +
      'radicle of a germinating seed before storing it, but whether the granaries are damp or dry is disputed for ' +
      'harvester ants in general.',
    inGame: 'Granary humidity is a managed value in the game: too damp and seeds sprout or rot, too dry and they are wasted.',
    related: ['cx-seed-classes', 'cx-frass'],
  },
];
