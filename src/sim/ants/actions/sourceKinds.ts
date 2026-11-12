// What kind of harvesting a food source allows (GDD 01 §7.3, GDD 05 §1): drinking, tearing pieces, or picking up
// whole units.

import type { FoodKind, FoodSource, FoodVariant, Item } from '@/sim/types';

const LIQUID_KINDS: readonly FoodKind[] = ['honeydew', 'nectar', 'sugar', 'dew'];
const LIQUID_VARIANTS: readonly FoodVariant[] = [
  'honeydew-film', 'sugary-spill', 'sticky-residue', 'dew', 'water', 'extrafloral-nectary', 'flower',
];
/** Kinds whose flesh or body is torn into pieces (fruit has both juice and flesh). */
const TEAR_KINDS: readonly FoodKind[] = ['carrion', 'prey', 'fruit', 'crumb', 'pet-food', 'leaf'];

/** Drinkable: a pool source or a liquid kind / variant. */
export function isLiquidSource(s: FoodSource): boolean {
  return s.pool >= 0 || LIQUID_KINDS.includes(s.kind) || (s.variant !== null && LIQUID_VARIANTS.includes(s.variant))
    || s.kind === 'fruit';
}

/** Solid flesh that `harvest-solid` tears pieces from. */
export function isTearSource(s: FoodSource): boolean {
  return TEAR_KINDS.includes(s.kind) && !(s.variant !== null && LIQUID_VARIANTS.includes(s.variant));
}

/** Whole units small enough to be picked up by an ant of this carry capacity (crumbs, seeds, granules). */
export function isPickableSource(s: FoodSource, carryCap: number): boolean {
  return !isLiquidOnly(s) && s.unitBulk > 0 && s.unitBulk <= carryCap;
}

function isLiquidOnly(s: FoodSource): boolean {
  return isLiquidSource(s) && !isTearSource(s) && s.kind !== 'sugar';
}

/** A carried food item (food piece, seed, carcass, prey). */
export function isFoodItem(it: Item): boolean {
  return it.kind === 'food-piece' || it.kind === 'seed' || it.kind === 'carcass' || it.foodKind !== null;
}
