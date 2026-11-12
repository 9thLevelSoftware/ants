// Species registry: SpeciesDef lookup by id (GDD 07 A.1 `getSpecies`). Static data, not part of SimState.

import type { ColonySpeciesId, SpeciesDef, SpeciesId } from '@/sim/types';

const defs = new Map<string, SpeciesDef>();

/** Registers (or replaces) a species definition. */
export function registerSpecies(def: SpeciesDef): void {
  defs.set(def.id, def);
}

/** The definition, or undefined for unknown ids (rival-only species have no full def yet). */
export function getSpecies(id: ColonySpeciesId): SpeciesDef | undefined {
  return defs.get(id);
}

/** The definition of a playable species; throws if it was never registered. */
export function requireSpecies(id: SpeciesId): SpeciesDef {
  const d = defs.get(id);
  if (!d) throw new Error(`species not registered: ${id}`);
  return d;
}

export function listSpecies(): SpeciesDef[] {
  return [...defs.values()];
}
