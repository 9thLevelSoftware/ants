// Which herd a tender works (GDD 02 §6.2 / GDD 07 §6.1.7): among the colony's workable herds (known, in range,
// not avoided, not held by a tending rival) the one furthest below its tenders wanted, its own herd first while
// that herd still wants it; with every herd staffed, its own herd or the nearest (surplus tenders wait at the herd).

import type { Ant, Herd, Sim } from '@/sim/types';
import { herdPoint, tendersWanted } from '@/sim/ecology';
import { num } from './common';
import { TH } from './tendHerdKeys';

interface Assigned { tick: number; byHerd: Map<number, number> }
const cache = new WeakMap<Sim, Map<number, Assigned>>();

/** Tenders of the colony that work each herd (task tend, herd set), this tick (derived cache). */
export function assignedTenders(sim: Sim, colonyId: number): Map<number, number> {
  let byCol = cache.get(sim);
  if (!byCol) { byCol = new Map(); cache.set(sim, byCol); }
  const hit = byCol.get(colonyId);
  if (hit && hit.tick === sim.state.tick) return hit.byHerd;
  const m = new Map<number, number>();
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== colonyId || a.task !== 'tend') continue;
    const h = num(a, TH.herd, -1);
    if (h >= 0) m.set(h, (m.get(h) ?? 0) + 1);
  }
  byCol.set(colonyId, { tick: sim.state.tick, byHerd: m });
  return m;
}

function blocked(sim: Sim, ant: Ant, h: Herd): boolean {
  return num(ant, TH.bad, -1) === h.id && sim.state.tick < num(ant, TH.badUntil, -1);
}

/** The herd this tender should go to now, or undefined (no workable herd: the Tier 1 sites, if any, are next). */
export function chooseHerd(sim: Sim, ant: Ant): Herd | undefined {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return undefined;
  const assigned = assignedTenders(sim, col.id);
  const own = num(ant, TH.herd, -1);
  let best: Herd | undefined, bestDeficit = -Infinity, bestD = Infinity;
  let ownHerd: Herd | undefined, nearest: Herd | undefined, nearestD = Infinity;
  for (const h of sim.stores.herds.list) {
    if (!h.alive || blocked(sim, ant, h)) continue;
    const want = tendersWanted(sim, col, h);
    if (want <= 0) continue;
    const p = herdPoint(sim, h);
    if (!p) continue;
    const d = Math.hypot(p.x - ant.pos.x, p.z - ant.pos.z);
    const others = (assigned.get(h.id) ?? 0) - (own === h.id ? 1 : 0);
    const deficit = want - others;
    if (h.id === own) ownHerd = h;
    if (d < nearestD) { nearestD = d; nearest = h; }
    if (deficit <= 0) continue;
    if (deficit > bestDeficit || (deficit === bestDeficit && d < bestD)) { best = h; bestDeficit = deficit; bestD = d; }
  }
  if (ownHerd && want0(sim, col.id, ownHerd, assigned, own) > 0) return ownHerd;
  return best ?? ownHerd ?? nearest;
}

function want0(sim: Sim, colonyId: number, h: Herd, assigned: Map<number, number>, own: number): number {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return 0;
  return tendersWanted(sim, col, h) - ((assigned.get(h.id) ?? 0) - (own === h.id ? 1 : 0));
}
