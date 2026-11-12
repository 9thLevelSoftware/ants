// Species registry: SpeciesDef lookup by id (GDD 07 A.1 `getSpecies`) and the light rival-only definitions
// (ruling 5). Static data, not part of SimState.

import type { ColonySpeciesId, RivalSpeciesDef, RivalSpeciesId, SpeciesDef, SpeciesId } from '@/sim/types';

const defs = new Map<string, SpeciesDef>();
const rivalDefs = new Map<string, RivalSpeciesDef>();

/** Registers (or replaces) a species definition. */
export function registerSpecies(def: SpeciesDef): void {
  defs.set(def.id, def);
}

/** Registers (or replaces) a rival-only species definition. */
export function registerRivalSpecies(def: RivalSpeciesDef): void {
  rivalDefs.set(def.id, def);
}

/** The full definition of a playable species, or undefined (rival-only ids have none: see getRivalSpecies). */
export function getSpecies(id: ColonySpeciesId): SpeciesDef | undefined {
  return defs.get(id);
}

/** The light definition of a rival-only species, or undefined. */
export function getRivalSpecies(id: ColonySpeciesId): RivalSpeciesDef | undefined {
  return rivalDefs.get(id);
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

export function listRivalSpecies(): RivalSpeciesDef[] {
  return [...rivalDefs.values()];
}

/** True if the id names a rival-only species (no full SpeciesDef). */
export function isRivalOnly(id: ColonySpeciesId): id is RivalSpeciesId {
  return rivalDefs.has(id) && !defs.has(id);
}
