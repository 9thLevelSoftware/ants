// Food sources (GDD 05 §1): catalogue access, creation, lifecycle, harvesting, discovery, diagnostics inputs.
// Other modules import from '@/sim/ecology' (which re-exports the public part) or from here.

export { sourceDef, defOf, defaultVariant, availableAtTier, amountOf, isEmpty, odourRadiusMm, footprintMm, reachMm } from './def';
export { createSource, halfLifeToDecay, type CreateSourceOptions } from './spawn';
export { initSources, anchorVariant, anchorVariants, sourceFromAnchor } from './anchors';
export { windowActive, d28Of, isInSeason, seasonBit } from './season';
export { updateSource, ageGd, isDriedWetFood } from './lifecycle';
export { advanceCarrion, stageClockRate, stageAt } from './carrion';
export { retireSource, markExhausted } from './remove';
export {
  takeFromSource, harvestForm, withinReach, makeFoodItem, detachWhole, type HarvestResult, type HarvestStatus,
  type HarvestOptions,
} from './harvest';
export { slotUsers, hasSlot, freeSlotsOf, queuePosition, holdsSlotAction, SLOT_ACTIONS } from './slots';
export { cropToxin, cropWater, cropFill, cropRoom, BB_CROP_TOXIN, BB_CROP_WATER } from './crop';
export {
  discoverSource, isDiscoveredBy, isAvoidedBy, isExhaustedFor, isAvailable, sourceQuality, sourcesSmelledFrom,
  findSources, nearestSource, nutrientsLeft, isCarrion, type SourceFilter,
} from './discovery';
export { recordHarvest, recordDelivery, sourceIntake, type SourceIntake } from './ledger';
export { runCarrionDrops, carrionDropsPerGd, zonePlots, replaceCrumbs, randomPointInZone } from './drops';
export {
  spawnHumanFood, carrionFromItem, carrionVariantForBulk, spawnWindfall, spawnBaitStation, spawnHerdFilm, addToPool,
  removeSourcesInArea, reprojectSources, type HumanFoodEvent,
} from './runtime';
export { dayOffer, sustainedOffer, zonePlotsWithin, type FoodOffer, type OfferOptions } from './budget';
export { sourcesSystem, runSources, syncAvoidBits } from './system';
