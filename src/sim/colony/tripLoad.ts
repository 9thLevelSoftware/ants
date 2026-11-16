// Source units one foraging trip takes, shared by the allocation's known-capacity estimate (allocation/demand.ts)
// and the outdoor source claims (ants/behaviours/outdoor/claims.ts), so the two cannot drift apart for species or
// castes whose crop or carry capacity is not 1 (econ-growth review).

import type { Colony, Sim } from '@/sim/types';
import { CROP_RETURN_FRACTION } from '@/sim/balance/actions';
import type { SourceForm } from '@/sim/balance/ecology';
import { casteDef, deriveAntStats } from '@/sim/entities';

/**
 * Units of a source of this harvest form one trip takes: a crop of liquid (CROP_RETURN_FRACTION of the crop, when
 * the forager turns home), one torn piece (carry capacity over the source's bulk per unit, at most a unit), or one
 * unit picked up.
 */
export function unitsPerTripOf(form: SourceForm, cropCap: number, carryCap: number, unitBulk: number): number {
  if (form === 'liquid') return Math.max(1e-6, cropCap * CROP_RETURN_FRACTION);
  if (form === 'tear') return Math.min(1, carryCap / Math.max(unitBulk, 1e-6));
  return 1;
}

const typical = new WeakMap<Sim, Map<string, { cropCap: number; carryCap: number }>>();

/** Crop and carry capacity of the colony's species' worker of mean size (the colony's typical forager). */
export function typicalForager(sim: Sim, col: Colony): { cropCap: number; carryCap: number } {
  let m = typical.get(sim);
  if (!m) { m = new Map(); typical.set(sim, m); }
  let v = m.get(col.species);
  if (!v) {
    const def = sim.getSpecies(col.species);
    const s = deriveAntStats(def, 'worker', casteDef(def, 'worker')?.lengthBu.mean ?? 1);
    v = { cropCap: s.cropCap, carryCap: s.carryCap };
    m.set(col.species, v);
  }
  return v;
}
