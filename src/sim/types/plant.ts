// Dynamic state of climbable / host plants and the honeydew herds on them (GDD 05 §1.4, GDD 07 §6.1).

import type { HerdKind, HostClass } from './ids/ecology';

/** Dynamic state of one plant instance (its geometry is static, in WorldData). */
export interface PlantState {
  id: number;
  alive: boolean;
  /** Static world object id of the plant. */
  objectId: number;
  hostClass: HostClass;
  /** HOST_FLAGS bits. */
  hostFlags: number;
  /** Herds on this plant (Herd ids). */
  herdIds: number[];
  /** Nectar pool, loads; -1 if none. */
  nectarPool: number;
  /** Host quality 0..1 (declines through the season). */
  hostQuality: number;
  /** Seed heads available (Messor, GDD 07). */
  seedHeads: number;
  /** Leaf damage 0..1 (Atta cutting). */
  leafDamage: number;
  /** Mown / damaged until this tick, -1 none. */
  mownUntilTick: number;
}

/** A herd of honeydew producers on a plant segment (GDD 05 App. A `ecology.herds`). */
export interface Herd {
  id: number;
  alive: boolean;
  kind: HerdKind;
  /** PlantState id. */
  hostId: number;
  hostClass: HostClass;
  /** Stem/branch segment index on the plant. */
  segment: number;
  /** Aphid count. */
  a: number;
  /** Overwintering eggs. */
  e: number;
  /** Honeydew pool, loads. */
  pool: number;
  /** Tending level 0..1 (EMA, TEND_TAU). */
  tend: number;
  hostQuality: number;
  /** Colony with the most tender-seconds over the last window, -1 none. */
  tenderColony: number;
  /** Tender-seconds per colony slot (TERR_COLONY_SLOTS). */
  tenderSeconds: Float32Array;
  /** Creature ids of herd predators present. */
  predators: number[];
  mownUntilTick: number;
  /** FoodSource id of the honeydew film below, -1 none. */
  filmSourceId: number;
  /** Debug freeze (cheat.freezeGrowth). */
  frozen: boolean;
  /** Times ants moved this herd to another host (GDD 07 §6.1.1 honeydew module extension). */
  relocations: number;
}
