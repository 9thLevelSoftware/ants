// What a drinking ant holds in its crop beyond C and P.
//
// The Ant contract has cropC / cropP only. Water (dew, puddles) and toxin (bait) ride in the behaviour scratch
// record `ant.bb` under these keys (plain numbers, persisted) until the contract gets real fields; delivery code
// reads them with cropToxin / cropWater. Crop fill counts C + P + water; toxin travels with the C load.

import type { Ant } from '@/sim/types';

export const BB_CROP_TOXIN = 'cropToxin';
export const BB_CROP_WATER = 'cropWater';

export function cropToxin(ant: Ant): number {
  return ant.bb[BB_CROP_TOXIN] ?? 0;
}

export function cropWater(ant: Ant): number {
  return ant.bb[BB_CROP_WATER] ?? 0;
}

/** Loads in the crop (C + P + water). */
export function cropFill(ant: Ant): number {
  return ant.cropC + ant.cropP + cropWater(ant);
}

/** Room left in the crop, loads (never negative). */
export function cropRoom(ant: Ant): number {
  return Math.max(0, ant.cropCap - cropFill(ant));
}

/** Adds drunk nutrients to the crop. */
export function addToCrop(ant: Ant, c: number, p: number, toxin: number, water: number): void {
  ant.cropC += c;
  ant.cropP += p;
  if (toxin > 0) ant.bb[BB_CROP_TOXIN] = cropToxin(ant) + toxin;
  if (water > 0) ant.bb[BB_CROP_WATER] = cropWater(ant) + water;
}
