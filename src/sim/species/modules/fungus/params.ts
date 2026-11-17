// The species' fungus-garden parameter block (SpeciesDef.modules['fungus-garden'], GDD 07 §6.4) as a typed record.

import type { Colony, Sim, SpeciesDef } from '@/sim/types';

/** Keys of the block in src/sim/species/data/atta-texana.ts (all numbers). */
const KEYS = [
  'guPerBu3', 'visualMlPerGu', 'gardenChambersMax', 'gardenGateGu',
  'subNeedPerGu', 'gardenR', 'gardenRBurst', 'burstFsub', 'burstGFrac', 'starveFsub', 'starveRate', 'gardenersPerGu',
  'tendFloor', 'yieldPerGu', 'staphylaeS', 'staphylaeFl', 'wasteFrac', 'contamWasteFrac', 'contamRate',
  'contamClearWasteFrac', 'contamClearRate',
  'fTOptLowC', 'fTOptHighC', 'fTHalfLowC', 'fTHalfHighC', 'fTZeroLowC', 'fTZeroHighC', 'heatDamageC', 'coldDamageC',
  'heatDamageRate', 'fRhFull', 'fRhMid', 'fRhMidValue', 'fRhLow', 'fRhLowValue', 'fRhDamageRate',
  'subProteinMax', 'subProteinRate', 'subToxinRate', 'healthRecover', 'healthRecoverFclim',
  'relocateFclim', 'relocateWaitGd', 'fungusPieceGu', 'fungusPieceS',
  'establishingG', 'healthyG', 'healthyH', 'collapseH', 'collapseRecoverH', 'collapseRate', 'deadG', 'deadH',
  'establishingYieldMult', 'foundingGrowth',
  'escLambda', 'escAgeFactor', 'escContamFactor', 'escTendFactor', 'escHumidFactor', 'escHumidRh', 'escOutbreakI',
  'escR', 'weedR', 'weedersPerGu', 'weedMassFrac', 'escHealthRate', 'escSpreadBu', 'escSpreadP', 'escQuarantineMult',
  'escDeadI', 'escClearI', 'escVisibleI', 'refuseLifespanMult', 'foundingOutbreakP',
  'leafSelectivityDefault', 'rejectGd', 'rejectCheckGd', 'rejectHealthDrop', 'rejectWindowGd', 'rejectShare',
  'rejectToxin', 'rejectProtein', 'rejectTrailDecayMult',
  'cutBaseS', 'cutMinS', 'cutMult15C', 'cutMult20C', 'cutMult30C', 'cutSapC', 'cacheSpoilGd', 'cacheSpoilQMult',
  'cacheWasteGd', 'processSPerLu', 'plantSPerPulp', 'pulpDryGd', 'tendCycleS', 'wasteLoadPerTrip',
  'hitchMinCarryBu', 'hitchBoardP', 'hitchBoardPEscort', 'phorid100sP', 'phoridHitchMult', 'phoridDeathGd',
  'stridulationRadiusBu',
  'gardenFertCost', 'pelletDecayPerGd', 'pelletMinRh', 'pelletMinC', 'pelletMaxC', 'plantHoldS', 'plantedGu',
  'foundChamberBu',
  'gardenLessLarvaHazard', 'gardenLessReserveGd', 'gardenLessDrawLoads', 'queenUpkeepFl', 'eggCostFl',
  'smallMediaDevMult', 'larvalCostFlPerM08',
] as const;

export type FungusParams = Readonly<Record<(typeof KEYS)[number], number>>;

const cache = new WeakMap<SpeciesDef, FungusParams | null>();

/** The fungus-garden block of a species, or null when the species has no such module. Throws on a missing key. */
export function fungusParams(def: SpeciesDef | undefined): FungusParams | null {
  if (!def) return null;
  const hit = cache.get(def);
  if (hit !== undefined) return hit;
  const block = def.modules['fungus-garden'];
  let out: FungusParams | null = null;
  if (block && def.economyModules.includes('fungus-garden')) {
    for (const k of KEYS) if (typeof block[k] !== 'number') throw new Error(`fungus-garden block of ${def.id}: missing ${k}`);
    out = block as FungusParams;
  }
  cache.set(def, out);
  return out;
}

/** The colony's fungus parameters (null: not a fungus colony). */
export function paramsOfColony(sim: Sim, col: Colony): FungusParams | null {
  return col.fungus ? fungusParams(sim.getSpecies(col.species)) : null;
}
