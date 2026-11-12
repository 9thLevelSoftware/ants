// Species cards (GDD 08 3.7): presentation text per playable species. Availability comes from the species registry
// (`SpeciesDef.available`), so a species becomes selectable as soon as its data is registered. Wording from GDD 07 1.1.
import type { Season, SpeciesId } from '@/sim/types';
import { getSpecies } from '@/sim/species';

export interface SpeciesCard {
  id: SpeciesId;
  binomial: string;
  commonName: string;
  playstyle: string;
  /** How a colony begins (GDD 07 1.1 "Founding"). */
  founding: string;
  /** Natural founding season for the "Natural" start option. */
  foundingSeason: Season;
  /** Caste icon ids (src/ui/icons). */
  castes: string[];
  complexity: 1 | 2 | 3;
}

export const SPECIES_CARDS: readonly SpeciesCard[] = [
  {
    id: 'lasius-niger', binomial: 'Lasius niger', commonName: 'Black garden ant',
    playstyle: 'A generalist of soil and paving that ranches aphids for honeydew.',
    founding: 'Dig, seal, lay, wait', foundingSeason: 'summer', castes: ['ant-queen', 'ant-worker'], complexity: 1,
  },
  {
    id: 'camponotus-pennsylvanicus', binomial: 'Camponotus pennsylvanicus', commonName: 'Black carpenter ant',
    playstyle: 'Nests in damp wood and works by night along trunk trails. Slow to grow.',
    founding: 'Find damp wood, chew a cell, seal', foundingSeason: 'spring', castes: ['ant-queen', 'ant-minor', 'ant-major'], complexity: 2,
  },
  {
    id: 'messor-barbarus', binomial: 'Messor barbarus', commonName: 'Harvester ant',
    playstyle: 'Gathers seed, mills it into paste and keeps granaries through the dry months.',
    founding: 'Dig deep in dry ground after autumn rain', foundingSeason: 'autumn', castes: ['ant-queen', 'ant-minor', 'ant-media', 'ant-major'], complexity: 2,
  },
  {
    id: 'atta-texana', binomial: 'Atta texana', commonName: 'Texas leafcutter ant',
    playstyle: 'Cuts leaves to grow a fungus garden; the fungus is all the brood eats.',
    founding: 'Dig, plant the fungus pellet, tend it', foundingSeason: 'spring', castes: ['ant-queen', 'ant-minor', 'ant-media', 'ant-major'], complexity: 3,
  },
];

export function speciesCard(id: SpeciesId): SpeciesCard {
  return SPECIES_CARDS.find((c) => c.id === id) ?? SPECIES_CARDS[0];
}

/** Selectable now? (registry data present and flagged available). */
export function isSpeciesAvailable(id: SpeciesId): boolean {
  return getSpecies(id)?.available === true;
}

/** `showUnreleasedSpecies` build flag (GDD 08 3.7): unreleased cards are shown greyed by default. */
export const SHOW_UNRELEASED_SPECIES = true;
