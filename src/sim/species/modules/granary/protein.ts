// The animal-protein minimum (GDD 07 §6.3.7): each larva must get at least animalProteinMinFrac of its protein from
// animal sources (carrion, prey); while its running share is below that, it grows at animalProteinGrowthMult.
//
// The colony's brood step (src/sim/colony/brood.ts) develops larvae at the full rate and digests food in proportion
// to progress. This step, run right after it, gives back the part of the progress and of the digested food that a
// larva short of animal protein did not earn: halving both is exactly a halved development rate (same food per
// unit of progress, twice the time). No brood code is changed.

import type { Brood, Colony, GranaryModule, LarvaProteinRecord, Sim } from '@/sim/types';
import type { GranaryParams } from './params';
import { animalFraction } from './paste';

/** Growth multiplier of a larva with this animal share (1 when the share meets the minimum). */
export function proteinGrowthMult(g: GranaryParams, minFrac: number, share: number): number {
  return share < minFrac ? g.animalProteinGrowthMult : 1;
}

/** Applies one step's slow-down to a larva: keeps `mult` of the progress and digested food since the record. */
function slowDown(b: Brood, r: LarvaProteinRecord, mult: number, dProg: number, dC: number, dP: number): void {
  const back = 1 - mult;
  if (back <= 0) return;
  if (dProg > 0) b.progress = Math.max(0, b.progress - back * dProg);
  if (dC > 0) { b.fedC -= back * dC; b.gutC += back * dC; }
  if (dP > 0) { b.fedP -= back * dP; b.gutP += back * dP; }
}

/**
 * Updates every larva of the colony: its running animal share (Brood.animalPShare) from the protein digested
 * since the last step at the pool's animal fraction, then the growth rule. Records of larvae that left the stage
 * are dropped.
 */
export function stepLarvae(sim: Sim, col: Colony, mod: GranaryModule, g: GranaryParams, minFrac: number): void {
  const f = animalFraction(col, mod);
  const recs = mod.larvae ?? [];
  const byId = new Map<number, LarvaProteinRecord>();
  for (const r of recs) byId.set(r.broodId, r);
  const keep: LarvaProteinRecord[] = [];
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.stage !== 'larva') continue;
    let r = byId.get(b.id);
    if (!r || (r.progress ?? 0) > b.progress + 1e-9) {
      // first sight (or a new stage): start the record here, no step to judge yet
      r = { broodId: b.id, fedP: b.fedP, animalP: b.animalPShare * b.fedP, progress: b.progress, fedC: b.fedC };
      keep.push(r);
      continue;
    }
    const dProg = b.progress - (r.progress ?? b.progress);
    const dC = b.fedC - (r.fedC ?? b.fedC);
    const dP = b.fedP - r.fedP;
    const shareBefore = b.fedP - dP > 0 ? r.animalP / (b.fedP - dP) : 0;
    if (dP > 0) r.animalP += dP * f;
    const mult = proteinGrowthMult(g, minFrac, shareBefore);
    if (mult < 1) {
      slowDown(b, r, mult, dProg, dC, dP);
      if (dP > 0) r.animalP -= (1 - mult) * dP * f;
    }
    r.fedP = b.fedP;
    r.fedC = b.fedC;
    r.progress = b.progress;
    b.animalPShare = b.fedP > 0 ? Math.min(1, Math.max(0, r.animalP) / b.fedP) : 0;
    keep.push(r);
  }
  mod.larvae = keep;
}
