// Persistent food sources on surfaces (contracts guidance §6, GDD 05 §1, App. A `ecology.sources`; D2.21).
// GDD 05's optional fields (pool?, stage? ...) use -1 / null here: persisted objects never miss keys.

import type { Vec3 } from '@/core/math/vec3';
import type { FoodKind } from './ids';
import type { CarrionStage, FoodVariant } from './ids/ecology';

export interface FoodSource {
  id: number;
  alive: boolean;
  kind: FoodKind;
  variant: FoodVariant | null;
  /** Surface point, mm, and its unit normal. */
  pos: Vec3;
  up: Vec3;
  /** Static world object it sits on (WorldObject id), -1 none. */
  objectId: number;
  /** Host plant (PlantState id), -1 none. */
  plantId: number;
  /** Herd producing it (Herd id in EcologyState), -1 none. */
  herdId: number;
  /** World food anchor it came from (WorldData.placements.foodAnchors index), -1 if spawned at runtime. */
  anchorId: number;
  /** Units remaining (solid pieces or liquid loads). */
  units: number;
  /** Maximum units. */
  capacity: number;
  /** Bulk of one unit, loads of carry capacity. */
  unitBulk: number;
  /** Nutrient profile per unit, loads. */
  c: number;
  p: number;
  toxin: number;
  water: number;
  /** Liquid pool (nectar, honeydew, spills), loads; -1 if not a pool source. */
  pool: number;
  poolCap: number;
  /** Refill per game day, loads. */
  refillPerGd: number;
  /** Decay rate per game day (fraction). */
  decayPerGd: number;
  /** Quality 0..1.3 (bait 1.2). */
  quality: number;
  hardness: number;
  /** Simultaneous feeding slots. */
  slots: number;
  drinkRateMult: number;
  /** Odour strength multiplier (smell range = SMELL_RANGE_FOOD * odour). */
  odour: number;
  stage: CarrionStage | null;
  stageClock: number;
  /** Bitmask by colony slot: discovered / avoided / exhausted for. */
  discoveredBy: number;
  avoidBy: number;
  exhaustedBy: number;
  /** Colony currently tending or guarding it, -1 none. */
  tendedBy: number;
  /** Season mask (bit = SEASONS index) in which it is active. */
  seasonMask: number;
  spawnedTick: number;
}
