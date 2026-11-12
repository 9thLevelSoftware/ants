// Demand per task in worker-equivalents (GDD 02 §6.2), recomputed every ALLOC_PERIOD.

import { ti } from '../taskIdx';
import type { Colony, Sim, Task } from '@/sim/types';
import {
  BROOD_MOVE_NURSE, DEFEND_MIN_WORKERS, DIAPAUSE_LARVAE_PER_NURSE, EGGS_PER_NURSE, ENTRANCE_ALARM_ALERT_PH,
  GUARDS_PER_ENTRANCE, HAUL_MAX_FRAC, HAUL_PER_CORPSE, HAUL_PER_PELLET, HAUL_PER_WASTE, NURSE_FEED_CAPACITY,
  PATROL_FRAC, PUPAE_PER_NURSE, QUEEN_CARE_BASE, QUEEN_CARE_MAX, QUEEN_CARE_PER_WORKERS, SCOUT_BASE_FRAC,
  SCOUT_MAX_FRAC, SCOUT_MIN_ACTIVITY, SCOUT_SHORTFALL_FRAC, SOURCE_SLOT_FORAGERS, SPOILED_ITEMS_PER_STORE,
  STORE_PER_FORAGER, THREAT_DEMAND_MULT,
} from '@/sim/balance';
import { accGet, coreOf } from '../core';
import { type Census, itemCounts } from '../census';
import { surfaceActivityOf } from '../envAdapter';
import { intakeTarget } from '../needs';
import { queenOf } from '../queen';

const T = (t: Task): number => ti(t);

/** Known foraging capacity: forager-equivalents and loads per gd the colony's known sources can absorb. */
export function knownCapacity(sim: Sim, col: Colony): { ants: number; loads: number } {
  let ants = 0;
  for (const id of col.knownSourceIds) {
    const s = sim.stores.sources.get(id);
    if (s && s.units > 0) ants += Math.max(1, s.slots) * SOURCE_SLOT_FORAGERS;
  }
  return { ants, loads: ants * col.yieldPerForager };
}

/** Worker-equivalents of open dig work: claimable slots of active plans (nest module API pending). */
export function digDemand(sim: Sim, col: Colony): number {
  let d = 0;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    for (const p of n.digPlans) if (p.status === 'active' || p.status === 'queued') d += Math.max(1, p.slots.length);
  }
  return d;
}

/** Threat multiplier for guards and patrols: alarm near an entrance. */
function threatMult(sim: Sim, col: Colony): number {
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (!n) continue;
    for (const e of n.entrances) if (sim.phero.sample(col.id, 'alarm', e.pos) > ENTRANCE_ALARM_ALERT_PH) return THREAT_DEMAND_MULT;
  }
  return 1;
}

export function entranceCount(sim: Sim, col: Colony): number {
  let k = 0;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) for (const e of n.entrances) if (e.status !== 'sealed') k++;
  }
  return k;
}

/** Fills col.alloc.demand (Float32Array by TASKS order). */
export function computeDemand(sim: Sim, col: Colony, cen: Census): Float32Array {
  const d = col.alloc.demand;
  d.fill(0);
  const n = cen.workers;
  if (n === 0) return d;
  const core = coreOf(col);
  const brood = cen.eggs + cen.larvae + cen.pupae;
  const larval = accGet(core, 'inst.larvaC') + accGet(core, 'inst.larvaP');
  let nurse = larval / NURSE_FEED_CAPACITY + cen.eggs / EGGS_PER_NURSE + cen.pupae / PUPAE_PER_NURSE
    + BROOD_MOVE_NURSE * accGet(core, 'pendingBroodMoves') + cen.diapause / DIAPAUSE_LARVAE_PER_NURSE;
  if (brood > 0) nurse = Math.max(1, nurse);
  d[T('nurse')] = nurse;

  const q = queenOf(sim, col);
  d[T('queen-care')] = q && !q.queen?.founding ? Math.min(QUEEN_CARE_MAX, QUEEN_CARE_BASE + Math.floor(n / QUEEN_CARE_PER_WORKERS)) : 0;

  const intake = intakeTarget(col);
  const known = knownCapacity(sim, col);
  d[T('forage')] = Math.min(intake / Math.max(col.yieldPerForager, 1e-6), known.ants + 1);
  const foragers = cen.byTask[T('forage')];
  const items = itemCounts(sim).byColony.get(col.id);
  d[T('store')] = (foragers >= 1 ? Math.max(1, STORE_PER_FORAGER * foragers) : 0) + (items ? items.spoiled / SPOILED_ITEMS_PER_STORE : 0);

  if (surfaceActivityOf(sim, col.species) >= SCOUT_MIN_ACTIVITY) {
    const shortfall = intake > 0 ? Math.min(1, Math.max(0, 1 - known.loads / intake)) : 0;
    d[T('scout')] = Math.min(SCOUT_MAX_FRAC * n, Math.max(1, SCOUT_BASE_FRAC * n) + SCOUT_SHORTFALL_FRAC * n * shortfall);
  }
  d[T('dig')] = digDemand(sim, col);
  if (items) {
    d[T('haul')] = Math.min(HAUL_MAX_FRAC * n, items.pellets / HAUL_PER_PELLET + items.waste / HAUL_PER_WASTE + items.corpses / HAUL_PER_CORPSE);
  }
  if (n >= DEFEND_MIN_WORKERS) {
    const m = threatMult(sim, col);
    d[T('guard')] = entranceCount(sim, col) * GUARDS_PER_ENTRANCE * m;
    d[T('patrol')] = Math.max(1, PATROL_FRAC * n) * m;
  }
  core.acc['threat'] = n >= DEFEND_MIN_WORKERS && threatMult(sim, col) > 1 ? 1 : 0;
  return d;
}
