// The species' `wood-nesting` parameter block (GDD 07 §6.2; values in src/sim/species/data/camponotus-pennsylvanicus.ts)
// as a typed record, and the "is this a wood-nesting colony" test every wood system starts with.

import type { Colony, Sim, SpeciesDef } from '@/sim/types';

/** Names of the `wood-nesting` block (species data); every value a number in the unit its comment there gives. */
export interface WoodParams {
  mcRate: number; decayGdPerClass: number; decayMinMcPct: number; decayFloorMcPct: number;
  biteFactorDecay0Dry: number; biteFactorDecay0Wet: number; biteFactorDecay1: number; biteFactorDecay2: number;
  biteFactorDecay3: number; biteFactorDecay4: number; dryWoodMcPct: number; crossGrainMult: number; crossGrainAngleDeg: number;
  casteFactorMinor: number; casteFactorNanitic: number; casteFactorMedia: number; casteFactorMajor: number;
  frassPerBite: number; frassBulk: number; minWallBu: number; maxCarvedFrac: number;
  windowOpeningBu: number; windowSpacingBu: number; windowsMaxPerSite: number; ejectFrassS: number;
  frassPerPileUnit: number; frassBu3PerUnit: number; hideFrassItemsPerBu3: number;
  frassVisibilityInterior: number; frassVisibilityOutdoor: number; birdChancePerPileUnitGd: number; birdChanceCap: number;
  mcFullSurvivalPct: number; mcZeroSurvivalPct: number; hazardDryMaxPerGd: number; mcMouldPct: number; hazardMouldPerPct: number;
  youngProgressMax: number; dryBonus: number; dryBonusMcMinPct: number; dryBonusMcMaxPct: number;
  satelliteMinWorkers: number; satelliteMaxRouteBu: number; satellitesMaxOutdoor: number; satellitesMaxInterior: number;
  satelliteMigrantFrac: number; satelliteMigrantMin: number; satelliteVoidMinBu: number; satelliteNurseryFreeMax: number;
  satelliteCarvedFracTrigger: number; satelliteIsolatedGd: number; satelliteOrphanGd: number;
  shuttleEveryGd: number; shuttleScoreMargin: number; drumS: number; drumCooldownS: number; drumRadiusWoodBu: number;
  drumRadiusOtherBu: number;
  relocateHazardTrigger: number; relocateHazardWindowGd: number; relocateAlertGd: number; relocateEscort: number;
  lightChangeRadiusBu: number; lightChangeUturnP: number;
  heatedBroodFrac: number; heatedChamberMinC: number; heatedWindowGd: number;
  casteRampYears: number;
  satiationStoresGd: number; satiationActivityMult: number; foragerShare: number; forageDemandMult: number;
}

/** The wood-nesting block of a species, or null when the species does not use the module. */
export function woodParamsOf(def: SpeciesDef | undefined): WoodParams | null {
  const block = def?.modules['wood-nesting'];
  return block ? (block as unknown as WoodParams) : null;
}

/** Wood params of a colony's species (null: not a wood nester). */
export function colonyWoodParams(sim: Sim, col: Colony | undefined): WoodParams | null {
  return col ? woodParamsOf(sim.getSpecies(col.species)) : null;
}

/** Wood params of the played species (the world's wood state follows the player's species), or null. */
export function playedWoodParams(sim: Sim): WoodParams | null {
  return woodParamsOf(sim.species);
}

/** Living colonies that nest in wood, in id order. */
export function woodColonies(sim: Sim): Colony[] {
  const out: Colony[] = [];
  for (const c of sim.stores.colonies.list) if (c.alive && c.fidelity === 'full' && colonyWoodParams(sim, c)) out.push(c);
  return out;
}
