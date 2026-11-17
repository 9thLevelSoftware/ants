// Brood carried back to the parent (GDD 07 §6.2.6 "eggs and larvae with progress < 0.5 found outside the parent are
// carried back to the parent with priority"; §6.2.5 `abandoned`: "workers carry brood to the nearest site"). The
// carriers are the nurses living in the satellite; the trip is the shuttle trip (shuttle.ts) run the other way.

import type { Brood, Colony, Sim, SpeciesDef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { airTemp } from '@/sim/environment/temperature';
import { forageGateFor } from '@/sim/environment/thermalResponse';
import type { WoodParams } from './params';
import { isLateBrood } from './broodMoisture';
import { broodChamberOf, parentSite } from './sites';
import { SH, isShuttling } from './shuttleKeys';
import { CRUMBLING_DECAY } from '@/sim/balance/species-carpenter';

/** Must this brood item in a satellite go back to the parent: young brood always, everything from crumbling wood. */
function mustReturn(p: WoodParams, b: Brood, abandoned: boolean): boolean {
  return abandoned || !isLateBrood(p, b);
}

/**
 * Return jobs: for each satellite (and abandoned satellite) nest of the colony, free resident nurses each take one
 * item that must go back to the parent. Same gates as the shuttle (forage temperature gate and heat; not light).
 * Returns the jobs given.
 */
export function assignReturns(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): number {
  const parentRec = parentSite(col);
  const parent = parentRec ? sim.stores.nests.get(parentRec.nestId) : undefined;
  if (!parent || !col.wood) return 0;
  const room = broodChamberOf(parent);
  if (!room) return 0;
  const air = airTemp(sim);
  if (forageGateFor(def.thermal, air) <= 0 || air >= def.thermal.stressC) return 0;
  const taken = new Set<number>();
  for (const a of sim.stores.ants.list) if (a.alive && isShuttling(a)) taken.add(a.bb[SH.brood]);
  let given = 0;
  for (const s of col.wood.sites) {
    if (s.role !== 'satellite') continue;
    const nest = sim.stores.nests.get(s.nestId);
    if (!nest) continue;
    const abandoned = s.state === 'abandoned' || s.decay >= CRUMBLING_DECAY;
    const queue: Brood[] = [];
    for (const b of sim.stores.brood.list) {
      if (b.alive && b.colony === col.id && b.nestId === nest.id && b.carriedBy < 0 && !taken.has(b.id) && mustReturn(p, b, abandoned)) queue.push(b);
    }
    if (queue.length === 0) continue;
    let q = 0;
    for (const a of sim.stores.ants.list) {
      if (q >= queue.length) break;
      if (!a.alive || a.colony !== col.id || a.task !== 'nurse' || a.nestId !== nest.id || a.carry.kind !== 'none') continue;
      if ((a.flags & AntFlag.POSSESSED) !== 0 || isShuttling(a)) continue;
      const b = queue[q++];
      a.bb[SH.brood] = b.id; a.bb[SH.nest] = parent.id; a.bb[SH.chamber] = room.id; a.bb[SH.phase] = 0;
      a.bb[SH.from] = nest.id;
      given++;
    }
  }
  return given;
}
