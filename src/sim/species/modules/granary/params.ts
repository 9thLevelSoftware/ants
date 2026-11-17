// The species' granary parameter block (SpeciesDef.modules.granary, GDD 07 §6.3) as a typed record, and the small
// derived values every granary file uses.

import type { Colony, Sim, SpeciesDef } from '@/sim/types';

/** Keys of the block in src/sim/species/data/messor-barbarus.ts (all numbers). */
const KEYS = [
  'seedLoadsDust', 'seedLoadsS', 'seedLoadsM', 'seedLoadsL',
  'acceptDistBu', 'crackLimitMinor', 'crackLimitMedia', 'crackLimitMajor', 'hardnessPenalty',
  'cutSeedHeadS', 'cutSeedHeadSeedsMin', 'cutSeedHeadSeedsMax',
  'loadsPerBu3', 'loadsPerLargeGranary', 'targetStockGd', 'targetStockFill', 'granaryMinWorkers',
  'seedURate', 'seedUArriving', 'seedUWet', 'uDamp', 'uRot', 'rotWetGd', 'rotRatePerGd',
  'germDenominator', 'germTempMinC', 'germTempRefC', 'germTempHotC', 'germFactorHot',
  'germinatingG', 'sproutedG', 'sproutedExpireGd', 'gnawRadicleS', 'careWindowS',
  'relocateHumidity', 'sproutedMillTimeMult', 'sproutedPasteYield',
  'millBaseS', 'millHardnessMult', 'millMediaTimeMult', 'millMediaMinBu', 'millMediaMaxHardness',
  'pasteYield', 'chaffYield', 'pasteC', 'pasteP', 'pasteHalfLifeGd', 'pasteTargetGd', 'feedLarvaLoads',
  'animalProteinGrowthMult',
  'middenMinBu', 'middenMaxBu', 'viableSeedFrac', 'seedlingGerminateP', 'seedlingMaturesGd',
  'middenHaulHeightBu', 'middenHaulRadiusBu',
  'tripHeatLimitC', 'tripHeatSpanC', 'tripHeatFloor', 'lullReturnFrac', 'lullActivationMult',
  'patrolHoldMult', 'stridulationRadiusBu', 'winterConsumptionMult', 'winterPasteConversion',
] as const;

export type GranaryParams = Readonly<Record<(typeof KEYS)[number], number>>;

const cache = new WeakMap<SpeciesDef, GranaryParams | null>();

/** The granary block of a species, or null when the species has no granary module. Throws on a missing key. */
export function granaryParams(def: SpeciesDef | undefined): GranaryParams | null {
  if (!def) return null;
  const hit = cache.get(def);
  if (hit !== undefined) return hit;
  const block = def.modules.granary;
  let out: GranaryParams | null = null;
  if (block && def.economyModules.includes('granary')) {
    for (const k of KEYS) if (typeof block[k] !== 'number') throw new Error(`granary block of ${def.id}: missing ${k}`);
    out = block as GranaryParams;
  }
  cache.set(def, out);
  return out;
}

/** The colony's granary parameters (null: not a granary colony). */
export function paramsOfColony(sim: Sim, col: Colony): GranaryParams | null {
  return col.granary ? granaryParams(sim.getSpecies(col.species)) : null;
}

/** C and P one seed load gives once milled (pasteYield x paste nutrition). */
export function nutrientsPerSeedLoad(g: GranaryParams): { c: number; p: number } {
  return { c: g.pasteYield * g.pasteC, p: g.pasteYield * g.pasteP };
}
