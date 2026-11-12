// Codex: castes, life stages and anatomy (GDD 06 §10).
import type { CodexEntry } from '../types';

export const CASTE_ENTRIES: readonly CodexEntry[] = [
  {
    id: 'cx-dealation',
    title: 'Dealation',
    category: 'castes',
    species: ['ALL'],
    body:
      'After the nuptial flight and mating, a young queen lands and sheds her wings, then looks for a place to dig in. ' +
      'The flight muscles inside her thorax are no longer needed. In claustral species they are broken down, and with ' +
      'stored fat they feed her and her first brood while she stays sealed in a chamber. Founding is dangerous: in ' +
      'leafcutters only about 2.5 percent of young queens found a colony that lasts, and failure as high as 99 percent ' +
      'has been reported in some ants.',
    inGame: 'The game begins here: the player controls the queen after dealation, with her reserves already counting down.',
    related: ['cx-claustral-founding', 'cx-queen-reserves'],
  },
  {
    id: 'cx-queen-reserves',
    title: 'The thinning queen',
    category: 'castes',
    species: ['LN'],
    body:
      'A founding queen does not eat while she is sealed in. Her body is the only store, and the first brood is raised ' +
      'from her fat and her unused wing muscle. In a laboratory study, fed Lasius niger queens weighed about 33 mg a ' +
      'year and a quarter after founding. What a newly mated queen weighs, and how much of that she spends before the ' +
      'first workers hatch, has not been measured for this species. The figures used for the reserve gauge in the game ' +
      'are therefore estimates.',
    inGame:
      'The queen\'s abdomen shrinks as her reserves fall, and the reserve gauge shows the same figure. ' +
      'If the reserves run out before workers hatch, the founding fails.',
    related: ['cx-dealation', 'cx-egg-eating'],
  },
  {
    id: 'cx-brood-stages',
    title: 'Egg, larva, pupa',
    category: 'castes',
    species: ['LN', 'CP'],
    body:
      'An ant passes through egg, larva and pupa before the adult emerges. Larvae are legless grubs, and formicine ants ' +
      'such as the black garden ant spin a silk cocoon around the pupa. In one laboratory study of founding colonies ' +
      'kept at 19 to 23 degrees Celsius, the first worker appeared a median of 52 days after the first egg. The split ' +
      'between the stages is less certain than that total, because the study did not define where each stage ends. ' +
      'Carpenter ant eggs stick together in a clump that the queen can carry.',
    inGame: 'Eggs, larvae and pupae are drawn and counted separately, in the nest and in the colony pulse.',
    related: ['cx-brood-warmth', 'cx-callow', 'cx-nursing'],
  },
  {
    id: 'cx-callow',
    title: 'Colouring in',
    category: 'castes',
    species: ['ALL'],
    body:
      'A worker that has just left its cocoon is pale and soft. It is called a callow. Over the following hours to days ' +
      'its body hardens and darkens; how long this takes has not been measured for the species of this game, and keepers ' +
      'report several days. In a carpenter ant colony the queen helps each of the first workers out of its cocoon. ' +
      'The first generation of a colony can therefore be watched as it colours in.',
    inGame: 'New workers are drawn pale and darken in play; the time is shortened to stay readable.',
    related: ['cx-nanitics', 'cx-brood-stages'],
  },
  {
    id: 'cx-nanitics',
    title: 'The smallest sisters',
    category: 'castes',
    species: ['LN', 'CP', 'MB'],
    body:
      'Workers of the first brood are called nanitics, and they are smaller than the workers that follow. In ' +
      'laboratory colonies of the black garden ant, head width was about six percent narrower in workers from colonies ' +
      'eight months old (1.08 mm) than in workers from colonies twenty months old (1.15 mm), and the small workers were ' +
      'more efficient at brood care. A carpenter ant queen raises only four to twenty-five workers in her first summer, ' +
      'all of them small and uniform; larger workers come later.',
    inGame: 'The first workers are drawn slightly smaller than later ones.',
    related: ['cx-callow', 'cx-polyethism'],
  },
  {
    id: 'cx-males',
    title: 'Short lives',
    category: 'castes',
    species: ['ALL'],
    body:
      'A male ant lives for the nuptial flight. In leafcutters a male lives one to two weeks, and in black carpenter ' +
      'ants males die within weeks of mating. In carpenter ants a pheromone from the male mandibular gland is reported ' +
      'to draw the females into flight, so that male and female take off together. Male black garden ants are about the ' +
      'length of workers, 3.5 to 4.7 mm, and winged. Male carpenter ants and leafcutters have a head much smaller than ' +
      'that of the females.',
    inGame: 'Males hold no task in the colony. They appear only in the season when winged ants are reared.',
    related: ['cx-nuptial-flight'],
  },
  {
    id: 'cx-formic-acid',
    title: 'Acid',
    category: 'castes',
    species: ['LN', 'CP'],
    body:
      'Formicine ants have no sting. The sting has become a nozzle, the acidopore, at the tip of the abdomen, and the ' +
      'ants defend themselves by biting and then spraying or smearing formic acid, often into the bite wound. In ' +
      'formicines, acid is reported to make up about 70 percent of the spray. Carpenter ant majors give a sharp bite. ' +
      'Myrmicine ants have a different weapon: the harvester ant keeps a working sting, and leafcutter majors rely on ' +
      'a strong bite.',
    inGame: 'The possessed ant\'s panel shows its acid reserve; spraying empties it, and it refills slowly.',
    related: ['cx-formica', 'cx-nestmate-recognition'],
  },
  {
    id: 'cx-hybridogenesis',
    title: 'Two lineages',
    category: 'castes',
    species: ['MB'],
    body:
      'In Iberian Messor barbarus, two lineages live side by side. Workers are hybrids between them, while new queens ' +
      'come only from matings within a lineage. A queen mates with about 2.4 males on average. If mating were ' +
      'random, the researchers estimate that 13.4 percent of queens would fail to mate with males of both their own ' +
      'lineage and the other. The two lineages occur at about equal frequency among winged ants. It follows, though this has not ' +
      'been observed, that a queen who mated only within her own lineage could not make workers.',
    inGame:
      'Each winged queen and male carries a lineage tag. The game follows the inference, which has not been observed, ' +
      'that a queen who mated within one lineage only cannot make workers.',
    related: ['cx-nuptial-flight', 'cx-species-messor-barbarus'],
  },
];
