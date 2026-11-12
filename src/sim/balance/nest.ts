// Nest defaults (GDD 03). Owners add the rest (src/sim/balance/nest*.ts) as the nest modules land.

import type { MaterialId, PlanPriority, SpeciesId } from '@/sim/types';

/** Slot-seeking weight per plan priority (GDD 03 §7). */
export const PLAN_PRIORITY_WEIGHT: Record<PlanPriority, number> = { low: 1, normal: 2, high: 4, urgent: 8 };

// ---- substrates (GDD 03 §2.1 material table; digest 03). Refined by nestops (moisture, loose, crust). ----

/** Base dig speed per diggable material, relative to loam at medium moisture (bite 1.0 s). Missing = 0. */
export const DIG_SPEED: Partial<Record<MaterialId, number>> = {
  loam: 1.0, humus: 1.3, sand: 1.6, clay: 0.45, gravel: 0.35, 'wood-decayed': 1.0, 'wood-sound': 0.4, insulation: 1.5,
};

/**
 * Species multiplier per material ("diggable by" column of GDD 03 §2.1). A material missing for a species is
 * not diggable by it. Camponotus and wood are T3 (species-carpenter refines wood moisture rules).
 */
export const DIG_SPECIES_MULT: Record<SpeciesId, Partial<Record<MaterialId, number>>> = {
  'lasius-niger': { loam: 1, humus: 1, sand: 1, clay: 1, gravel: 1, 'wood-decayed': 0.5, insulation: 0.5 },
  'messor-barbarus': { loam: 1, humus: 0.8, sand: 1, clay: 1, gravel: 1 },
  'atta-texana': { loam: 1, humus: 1, sand: 1, clay: 1, gravel: 1 },
  'camponotus-pennsylvanicus': {
    loam: 0.6, humus: 0.8, sand: 0.6, clay: 0.3, 'wood-decayed': 1, 'wood-sound': 1, insulation: 1,
  },
};

/** Dig-speed factor of a material for a species (DIG_SPEED x species multiplier); 0 = not diggable. */
export function digFactor(species: SpeciesId, m: MaterialId): number {
  const mult = DIG_SPECIES_MULT[species]?.[m];
  return mult === undefined ? 0 : (DIG_SPEED[m] ?? 0) * mult;
}
