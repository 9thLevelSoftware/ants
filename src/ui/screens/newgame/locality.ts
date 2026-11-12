// Locality archetype facts for the New Game cards (GDD 08 3.7): zone chips and the nesting-suitability word.
import type { ArchetypeId, SpeciesId } from '@/sim/types';
import { ARCHETYPE_DEFS } from '@/worldgen/tuning/archetypes';

const ZONE_WORDS: Record<string, string> = {
  forest: 'forest', lawn: 'lawn', 'garden-bed': 'garden', interior: 'interior', patio: 'patio', path: 'path', sidewalk: 'pavement',
  'car-park': 'car park', driveway: 'driveway', lane: 'lane', sand: 'sand', rubber: 'rubber', wild: 'meadow', meadow: 'meadow', paving: 'paving',
};

/** Zone chips of an archetype: the natural zones, then the built ones, at most four. */
export function zoneChips(id: ArchetypeId): string[] {
  const d = ARCHETYPE_DEFS[id];
  const words = [...d.natural.map((n) => n.type as string), ...d.built as string[]].map((z) => ZONE_WORDS[z] ?? z.replace(/-/g, ' '));
  return Array.from(new Set(words)).slice(0, 4);
}

/** Nesting suitability word for the chosen species (GDD 08 3.7 Good / Fair / Poor). */
export function suitability(id: ArchetypeId, species: SpeciesId): 'Good' | 'Fair' | 'Poor' {
  const fit = ARCHETYPE_DEFS[id].fit[species];
  return fit >= 3 ? 'Good' : fit === 2 ? 'Fair' : 'Poor';
}
