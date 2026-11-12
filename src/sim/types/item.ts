// Items: loose or stored things (soil pellets, food pieces, seeds, leaf fragments, corpses, waste ...).
// Shape from contracts guidance §6 extended by GDD 02 App. A, GDD 03 App. A and GDD 05 App. A.

import type { Vec3 } from '@/core/math/vec3';
import type { CarrionStage, FoodVariant, ItemKind, WasteKind } from './ids/ecology';
import type { ColonySpeciesId, FoodKind, Material } from './ids';

export interface Item {
  id: number;
  alive: boolean;
  kind: ItemKind;
  /** mm; meaningful when not carried. */
  pos: Vec3;
  /** Nutrients in loads. */
  c: number;
  p: number;
  /** Toxin, loads equivalent (bait). */
  toxin: number;
  /** Water, loads. */
  water: number;
  /** Units in a stackable pile (crumbs, seeds); 1 for single items. */
  count: number;
  /** Carry bulk in loads of carry capacity (GDD 05: bulk 1.0 = carryCap 1.0 = 2 mg). */
  bulk: number;
  massMg: number;
  lengthMm: number;
  /** Tear/mill hardness multiplier (1 = normal). */
  hardness: number;
  /** Ants carrying it; empty when lying, [id] for one carrier, more for cooperative transport (D2.19). */
  carrierIds: number[];
  nestId: number;
  chamberId: number;
  /** Decay 0..1 (spoilage, rot). */
  decay: number;
  foodKind: FoodKind | null;
  variant: FoodVariant | null;
  wasteKind: WasteKind | null;
  /** Carrion stage and its stage clock (stage-clock game days). */
  stage: CarrionStage | null;
  stageClock: number;
  /** Soil pellets / frass: volume BU^3 and material. */
  volume: number;
  material: Material | null;
  droppedTick: number;
  /** Inside a nest cavity (clutter) rather than on the surface. */
  inNest: boolean;
  /** Plan whose spoil pile holds it, -1 none. */
  spoilPlanId: number;
  /** Ant that reserved it for pickup, -1 none. */
  reservedBy: number;
  /** Corpses: tick from which necrophoresis cues fire. */
  necroCueTick: number;
  /** Corpses: species and colony of the dead. */
  species: ColonySpeciesId | null;
  colony: number;
  /** Bitmask of colonies (slot index) that flagged it unreachable. */
  unreachableBy: number;
  /** Live aphids: tick at which a carried aphid turns into food. -1 otherwise. */
  aliveUntilTick: number;
  createdTick: number;
}
