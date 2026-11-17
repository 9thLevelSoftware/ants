// Drumming (GDD 07 §6.2.6, action `drum`, App. A.0): alarm recruitment through wood. A 1 s head-hammering; every
// colony ant inside the same wood primitive within drumRadiusWoodBu (30 BU), and any other nestmate within
// drumRadiusOtherBu (10 BU), receives an alarm stimulus (the combat module's alarm level decides the response).
// Cooldown drumCooldownS. The action is registered into the action catalogue by hooks.ts.

import type { Ant, Primitive, Sim } from '@/sim/types';
import type { ActionDef } from '@/sim/ants/actions/types';
import { addAlarm } from '@/sim/combat/alarm';
import { ALARM_RELEASE_BURST } from '@/sim/balance/combat';
import { TICKS_PER_SECOND } from '@/sim/time';
import { colonyWoodParams, type WoodParams } from './params';
import { primDistance } from './primGeom';
import { woodAt } from './woodState';

const COOLDOWN_KEY = 'cd.drum';
const ids: number[] = [];

/** Is p inside (or on the walls of a gallery in) this wood primitive? */
function inWood(prim: Primitive, p: { x: number; y: number; z: number }): boolean {
  return primDistance(prim, p) < 0;
}

/** The drum's effect: alarm stimulus to nestmates through the wood and nearby. Returns how many were reached. */
export function drumAlarm(sim: Sim, ant: Ant, p: WoodParams): { reached: number; wood: boolean } {
  const bu = sim.world.bu;
  const hit = woodAt(sim, ant.pos, bu);
  const prim = hit && inWood(hit.prim, ant.pos) ? hit.prim : null;
  const rWood = p.drumRadiusWoodBu * bu, rOther = p.drumRadiusOtherBu * bu;
  sim.index.queryAnts(ant.pos, prim ? rWood : rOther, ids);
  let reached = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = sim.stores.ants.get(ids[i]);
    if (!a || !a.alive || a.colony !== ant.colony || a.id === ant.id) continue;
    const dx = a.pos.x - ant.pos.x, dy = a.pos.y - ant.pos.y, dz = a.pos.z - ant.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const r = prim && inWood(prim, a.pos) ? rWood : rOther;
    if (d > r) continue;
    addAlarm(a, ALARM_RELEASE_BURST.add, ant.pos, -1);
    reached++;
  }
  return { reached, wood: !!prim };
}

export const drumDef: ActionDef = {
  id: 'drum', kind: 'timed', targets: ['none'], preempts: true, cancellable: true, pose: 'alarm', cue: 'drum',
  check(sim, ant) {
    if (!colonyWoodParams(sim, sim.stores.colonies.get(ant.colony))) return 'caste';
    return sim.state.tick < (ant.bb[COOLDOWN_KEY] ?? 0) ? 'cooldown' : null;
  },
  durationS: (sim, ant) => colonyWoodParams(sim, sim.stores.colonies.get(ant.colony))?.drumS ?? 1,
  effect(sim, ant) {
    const p = colonyWoodParams(sim, sim.stores.colonies.get(ant.colony));
    if (!p) return 'caste';
    ant.bb[COOLDOWN_KEY] = sim.state.tick + Math.round(p.drumCooldownS * TICKS_PER_SECOND);
    const r = drumAlarm(sim, ant, p);
    sim.emit({ type: 'drum', antId: ant.id, pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z }, wood: r.wood });
    return r.reached;
  },
};
