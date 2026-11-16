// Demand per task in worker-equivalents (GDD 02 §6.2), recomputed every ALLOC_PERIOD.

import { ti } from '../taskIdx';
import type { Colony, Sim, Task } from '@/sim/types';
import {
  BROOD_MOVE_NURSE, DEFEND_MIN_WORKERS, DIAPAUSE_LARVAE_PER_NURSE, EGGS_PER_NURSE, ENTRANCE_ALARM_ALERT_PH,
  GUARDS_PER_ENTRANCE, HAUL_MAX_FRAC, HAUL_PER_CORPSE, HAUL_PER_PELLET, HAUL_PER_WASTE, NURSE_FEED_CAPACITY,
  PATROL_FRAC, PUPAE_PER_NURSE, QUEEN_CARE_BASE, QUEEN_CARE_MAX, QUEEN_CARE_PER_WORKERS, SCOUT_BASE_FRAC,
  SCOUT_MAX_FRAC, SCOUT_MIN_ACTIVITY, SCOUT_SHORTFALL_FRAC, SMALL_COLONY_N, SMALL_KNOWN_SOURCES, SMALL_OUTSIDE_FRAC,
  SMALL_OUTSIDE_MIN, SMALL_SCOUTS_MIN, SOURCE_SLOT_FORAGERS, SPOILED_ITEMS_PER_STORE,
  STORE_PER_FORAGER, THREAT_DEMAND_MULT,
} from '@/sim/balance';
import { accGet, coreOf } from '../core';
import { type Census, itemCounts } from '../census';
import { surfaceActivityOf } from '../envAdapter';
import { intakeTarget } from '../needs';
import { queenOf } from '../queen';
import { digDemand as nestDigDemand, entranceToUnplug, haulPelletLoad } from '@/sim/nest';
import { herdTendDemand } from '@/sim/ecology/plants/demand';

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

/** Worker-equivalents of open dig work: the nest module's digDemand over the colony's plans (GDD 03 §7.7). */
export function digDemand(sim: Sim, col: Colony): number {
  // a `reopening` entrance's plug is dig work too (GDD 03 §4.2, §13: the first workers dig it out), one digger each
  let unplug = 0;
  for (const nid of col.nestIds) if (entranceToUnplug(sim, nid)) unplug++;
  return nestDigDemand(sim, col.id) + unplug;
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

/** Live food sources the colony knows (units left). */
function liveKnownSources(sim: Sim, col: Colony): number {
  let k = 0;
  for (const id of col.knownSourceIds) {
    const s = sim.stores.sources.get(id);
    if (s && s.units > 0) k++;
  }
  return k;
}

/**
 * Small colonies forage (R3, balance SMALL_*): under the stock target on a workable surface, forage + scout demand
 * is at least max(SMALL_OUTSIDE_MIN, SMALL_OUTSIDE_FRAC x N). Scouts are at least SMALL_SCOUTS_MIN until
 * SMALL_KNOWN_SOURCES live sources are known. With no source known the whole outside share scouts (a forager with
 * nowhere to go only waits); once one is known, the foragers get at least the outside share less those scouts, so
 * the known food is worked while the search goes on (the GDD 02 §6.2 forage demand alone sent one forager to a
 * 300-unit spill 100 BU from a 12-worker nest).
 */
function smallColonyFloor(sim: Sim, col: Colony, n: number, d: Float64Array | Float32Array): void {
  if (n >= SMALL_COLONY_N || surfaceActivityOf(sim, col.species) < SCOUT_MIN_ACTIVITY) return;
  if (col.needs.needC <= 0 && col.needs.needP <= 0) return;
  const outside = Math.min(n, Math.max(SMALL_OUTSIDE_MIN, SMALL_OUTSIDE_FRAC * n));
  const known = liveKnownSources(sim, col);
  const scoutsMin = known < SMALL_KNOWN_SOURCES ? Math.min(outside, SMALL_SCOUTS_MIN) : 0;
  d[T('scout')] = Math.max(d[T('scout')], scoutsMin);
  if (known === 0) d[T('scout')] = Math.max(d[T('scout')], outside - d[T('forage')]);
  else d[T('forage')] = Math.max(d[T('forage')], outside - scoutsMin);
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
  smallColonyFloor(sim, col, n, d);
  // GDD 02 §6.2: Σ tenderSlots over the colony's workable herds (the plants module owns the herd rules)
  d[T('tend')] = herdTendDemand(sim, col.id);
  d[T('dig')] = digDemand(sim, col);
  // pellets: the nest's lying in-nest pellets weighted by haul urgency (spoil nearing tamping age counts more)
  const pellets = haulPelletLoad(sim, col.id);
  if (items || pellets > 0) {
    const w = items ? items.waste / HAUL_PER_WASTE + items.corpses / HAUL_PER_CORPSE : 0;
    d[T('haul')] = Math.min(HAUL_MAX_FRAC * n, pellets / HAUL_PER_PELLET + w);
  }
  if (n >= DEFEND_MIN_WORKERS) {
    const m = threatMult(sim, col);
    d[T('guard')] = entranceCount(sim, col) * GUARDS_PER_ENTRANCE * m;
    d[T('patrol')] = Math.max(1, PATROL_FRAC * n) * m;
  }
  core.acc['threat'] = n >= DEFEND_MIN_WORKERS && threatMult(sim, col) > 1 ? 1 : 0;
  return d;
}
