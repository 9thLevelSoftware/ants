// How many tenders a colony wants at its herds (GDD 02 §6.2 `tend` demand, GDD 07 §6.1.7 markers), which herds a
// colony works, and the allocation adapter used until the colony allocation computes the `tend` demand itself.
//
// GDD 02 §6.2: the `tend` demand is the sum of tenderSlots over the known tended herds. tenderSlots is GDD 05's
// TEND_SLOTS = 2 + floor(A / 25), at most 16 (tendSlots); GDD 02's parenthesis "aphids / 5" is a stale value.

import type { Colony, FoodSource, Herd, Sim } from '@/sim/types';
import { AntFlag, taskIndex } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { HERD_FORAGE_MARKER_MULT, RIVAL_TEND_GUARD, TEND_SLOTS_MAX } from '@/sim/balance/ecology';
import { TEND_SITE_RANGE_BU } from '@/sim/balance/foraging';
import { INJURED_HEALTH } from '@/sim/balance/colony';
import { isAvoidedBy } from '../sources/discovery';
import { tendSlots } from './herdMath';
import { herdSourceOf } from './links';

function inForageMarker(sim: Sim, colonyId: number, s: FoodSource): boolean {
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.kind === 'forage' && m.colony === colonyId && Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z) <= m.radius) return true;
  }
  return false;
}

function homeOf(sim: Sim, col: Colony): { x: number; z: number } | null {
  for (const id of col.nestIds) {
    const n = sim.stores.nests.get(id);
    if (n && n.alive && n.entrances.length > 0) return n.entrances[0].pos;
  }
  return null;
}

/** Whether the colony works this herd: known to it, active, not avoided, in range, not held by a tending rival. */
export function herdWorkable(sim: Sim, col: Colony, h: Herd): boolean {
  if (!h.alive || h.a < 1) return false;
  const src = herdSourceOf(sim, h);
  if (!src) return false;
  const bit = colonySlotBit(sim, col.id);
  if (bit === 0 || (src.discoveredBy & bit) === 0) return false;
  if (isAvoidedBy(sim, src, col.id)) return false;
  if (h.tenderColony >= 0 && h.tenderColony !== col.id && h.tend > RIVAL_TEND_GUARD) return false;
  const home = homeOf(sim, col);
  return !home || Math.hypot(src.pos.x - home.x, src.pos.z - home.z) <= TEND_SITE_RANGE_BU * sim.world.bu;
}

/** Tenders the colony wants at this herd (0 when it does not work it). */
export function tendersWanted(sim: Sim, col: Colony, h: Herd): number {
  if (!herdWorkable(sim, col, h)) return 0;
  const want = tendSlots(h.a);
  const src = herdSourceOf(sim, h);
  return src && inForageMarker(sim, col.id, src) ? Math.min(TEND_SLOTS_MAX, Math.ceil(want * HERD_FORAGE_MARKER_MULT)) : want;
}

/** GDD 02 §6.2 `tend` demand of a colony: tenders wanted over its workable herds (worker-equivalents). */
export function herdTendDemand(sim: Sim, colonyId: number): number {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return 0;
  let d = 0;
  for (const h of sim.stores.herds.list) d += tendersWanted(sim, col, h);
  return d;
}

/**
 * Local adapter (TEND_DEMAND_ADAPTER): right after an allocation pass, raises the colony's `tend` demand to the herd
 * demand and its target by at most the idle outside-capable workers (no other task loses a target). The response
 * thresholds then move idle ants into `tend`.
 */
export function applyTendDemand(sim: Sim, col: Colony): void {
  if (col.alloc.lastTick !== sim.state.tick) return;
  const t = taskIndex('tend');
  const d = herdTendDemand(sim, col.id);
  if (d <= col.alloc.demand[t]) return;
  col.alloc.demand[t] = d;
  let idle = 0;
  for (const a of sim.stores.ants.list) {
    if (a.alive && a.colony === col.id && a.caste === 'worker' && a.task === 'idle' && (a.flags & AntFlag.POSSESSED) === 0
      && a.hp >= INJURED_HEALTH * a.maxHp) idle++;
  }
  const want = Math.round(d);
  col.alloc.target[t] = Math.max(col.alloc.target[t], Math.min(want, col.alloc.actual[t] + idle));
}
