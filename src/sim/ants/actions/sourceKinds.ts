// What kind of harvesting a food source allows (GDD 01 §7.3, GDD 05 §1): drinking, tearing pieces, or picking up
// whole units. The form comes from the ecology catalogue (sources-core `harvestForm`).

import type { FoodSource, Item, Sim } from '@/sim/types';
import { ports } from './ports';

/** Drinkable (`harvest-liquid`). */
export function isLiquidSource(sim: Sim, s: FoodSource): boolean {
  return ports.harvestForm(sim, s) === 'liquid';
}

/** Solid flesh or a large crumb that `harvest-solid` tears pieces from. */
export function isTearSource(sim: Sim, s: FoodSource): boolean {
  return ports.harvestForm(sim, s) === 'tear';
}

/** Whole units small enough to be picked up by an ant of this carry capacity (crumbs, seeds, granules). */
export function isPickableSource(sim: Sim, s: FoodSource, carryCap: number): boolean {
  return ports.harvestForm(sim, s) === 'pick' && s.unitBulk > 0 && s.unitBulk <= carryCap;
}

/** A carried food item (food piece, seed, carcass, prey). */
export function isFoodItem(it: Item): boolean {
  return it.kind === 'food-piece' || it.kind === 'seed' || it.kind === 'carcass' || it.foodKind !== null;
}
