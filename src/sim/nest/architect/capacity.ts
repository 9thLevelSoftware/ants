// Nest capacities the architect's needs divide by (GDD 03 §6.4, §8.3): resting adults over all chambers plus
// tunnel space, brood over the brood-accepting chambers, food over food + general. Chamber plans that are not
// finished count with the capacity of their planned room ("pending"), so two needs never order the same room.

import type { ChamberLoad, ChamberSize, ChamberType, DigPlan, Nest } from '@/sim/types';
import { BROOD_CHAMBER_TYPES, TUNNEL_ADULT_CAPACITY, nestTemplate } from '@/sim/balance/nest';
import { FOOD_STORE_TYPES } from '@/sim/balance/architect';
import { capacityOf } from '../chambers/registry';

export interface NestCapacity {
  /** Resting adults, space units (chambers + tunnel space). */
  adults: number;
  /** Brood items' space units in nursery, royal, founding, general. */
  brood: number;
  /** Food loads in food + general. */
  food: number;
}

/** Ellipsoid volume of a template chamber, BU^3 (pi / 6 x W x H x L), 0 when the species does not build it. */
export function plannedVolume(species: string, type: ChamberType, size: ChamberSize): number {
  const d = nestTemplate(species).chambers[type]?.[size];
  return d ? (Math.PI / 6) * d.w * d.h * d.l : 0;
}

/** Capacity a planned chamber of this type and size will add. */
export function plannedLoad(species: string, type: ChamberType, size: ChamberSize): ChamberLoad {
  return capacityOf(type, plannedVolume(species, type, size));
}

export const isLivePlan = (p: DigPlan): boolean => p.status !== 'complete' && p.status !== 'cancelled';

function addLoad(out: NestCapacity, type: ChamberType, load: ChamberLoad): void {
  out.adults += load.adults;
  if (BROOD_CHAMBER_TYPES.includes(type)) out.brood += load.brood;
  if (FOOD_STORE_TYPES.includes(type)) out.food += load.food;
}

/**
 * Capacities of a nest. `pending` adds the chamber plans not finished yet (skip one plan with `exceptPlanId`).
 * Tunnel space = open volume outside the chambers x TUNNEL_ADULT_CAPACITY.
 */
export function nestCapacity(nest: Nest, species: string, pending: boolean, exceptPlanId = -1): NestCapacity {
  const out: NestCapacity = { adults: 0, brood: 0, food: 0 };
  let inChambers = 0;
  for (const c of nest.chambers) {
    addLoad(out, c.type, c.capacity);
    inChambers += c.volume;
  }
  out.adults += Math.max(0, nest.volumeOpen - inChambers) * TUNNEL_ADULT_CAPACITY;
  if (!pending) return out;
  for (const p of nest.digPlans) {
    if (!isLivePlan(p) || p.id === exceptPlanId || p.kind !== 'chamber' || !p.chamberType || !p.size) continue;
    addLoad(out, p.chamberType, plannedLoad(species, p.chamberType, p.size));
  }
  return out;
}

/** Chambers of a type, registered plus (with `pending`) planned and not finished. */
export function chambersOfType(nest: Nest, type: ChamberType, pending: boolean): number {
  let n = nest.chambers.filter((c) => c.type === type).length;
  if (pending) n += nest.digPlans.filter((p) => isLivePlan(p) && p.kind === 'chamber' && p.chamberType === type).length;
  return n;
}
