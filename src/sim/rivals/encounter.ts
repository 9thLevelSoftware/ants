// Encounters of rival agents with foreign ants (GDD 05 §3.6): recognition in antennal contact (+1 escalation per
// ant pair per 60 s, first contact = discovery), then, when neither side attacks (combat's attack roll), the
// ritual display of 1-3 s and a withdrawal with p 1 - agg (turn 120-180°, walk 5 L). Fights are combat's.

import { rngChance, rngRange } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { RECOGNITION_L } from '@/sim/balance/combat';
import {
  AGENT_THINK_FAST_TICKS, AWARE_L, DISPLAY_S, E_GAIN, RECOGNITION_PAIR_S, WITHDRAW_TURN_DEG, WITHDRAW_WALK_L,
} from '@/sim/balance/rivals';
import { faceToward } from '@/sim/combat';
import { navStop, navTo } from '@/sim/locomotion';
import { secondsToTicks } from '@/sim/time';
import { isAgent } from './agents';
import { addEscalation } from './relations';
import { BB, colExt, slotBit, type RivalColony } from './state';

const ids: number[] = [];
const WITHDRAW_UNTIL = 'rv.wd';

/** Body length of an ant, mm. */
export function lenMm(sim: Sim, ant: Ant): number {
  return ant.lengthBu * sim.world.bu;
}

/** Colony `by` discovers rival colony `colonyId` (once per pair): `rival-discovered`. The player colony is not tracked. */
export function noteDiscovery(sim: Sim, colonyId: number, by: number, pos: Vec3): void {
  const col = sim.stores.colonies.get(colonyId);
  if (!col || !col.rival || colonyId === by) return;
  const bit = slotBit(sim.state, by);
  if (bit === 0) return;
  const ext = colExt(sim.state, colonyId);
  if ((ext.discoveredBy & bit) !== 0) return;
  ext.discoveredBy |= bit;
  sim.emit({ type: 'rival-discovered', colonyId, by, species: col.species, pos: { x: pos.x, y: pos.y, z: pos.z } });
}

function withdraw(sim: Sim, ant: Ant, other: Ant | undefined): void {
  const rng = sim.stream('rng.rivals');
  const turn = (rngRange(rng, WITHDRAW_TURN_DEG[0], WITHDRAW_TURN_DEG[1]) * Math.PI) / 180 * (rngChance(rng, 0.5) ? 1 : -1);
  const a = Math.atan2(ant.fwd.z, ant.fwd.x) + turn;
  const r = WITHDRAW_WALK_L * lenMm(sim, ant);
  const x = ant.pos.x + Math.cos(a) * r, z = ant.pos.z + Math.sin(a) * r;
  navTo(sim, ant, { x, y: sim.field.height(x, z), z }, 0.5 * lenMm(sim, ant));
  ant.bb[WITHDRAW_UNTIL] = sim.state.tick + secondsToTicks(4);
  ant.bb[BB.go] = 0;
  sim.emit({ type: 'rival-encounter', a: ant.colony, b: other ? other.colony : -1, pos: { ...ant.pos }, outcome: 'withdraw' });
}

/**
 * One encounter check of an agent on its think (outside the nest, not fighting). True while the ritual holds the
 * agent (display or withdrawal): the job does not run this think.
 */
export function encounterStep(sim: Sim, ant: Ant, col: RivalColony): boolean {
  const now = sim.state.tick;
  const until = ant.bb[BB.displayUntil];
  if (until !== undefined) {
    if (now < until) { ant.thinkTick = Math.min(until, now + AGENT_THINK_FAST_TICKS); return true; }
    delete ant.bb[BB.displayUntil];
    const other = sim.stores.ants.get(ant.bb[BB.displayWith] ?? -1);
    delete ant.bb[BB.displayWith];
    if (rngChance(sim.stream('rng.rivals'), 1 - col.rival.agg)) { withdraw(sim, ant, other); return true; }
    return false;
  }
  const wd = ant.bb[WITHDRAW_UNTIL];
  if (wd !== undefined) {
    if (now < wd && ant.nav.status === 'moving') return true;
    delete ant.bb[WITHDRAW_UNTIL];
  }
  if (ant.nestId >= 0) return false;
  const L = lenMm(sim, ant);
  sim.index.queryAnts(ant.pos, AWARE_L * L, ids);
  const pairTicks = secondsToTicks(RECOGNITION_PAIR_S);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (!o || !o.alive || o.colony === ant.colony) continue;
    const reach = RECOGNITION_L * L + ant.radius + o.radius;
    const dx = o.pos.x - ant.pos.x, dy = o.pos.y - ant.pos.y, dz = o.pos.z - ant.pos.z;
    if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
    const key = BB.seen + o.id;
    const last = ant.bb[key];
    if (last !== undefined && now - last < pairTicks) continue;
    ant.bb[key] = now;
    // a pair of agents counts once (the lower id); a player ant is counted from the agent's side
    if (!isAgent(o) || ant.id < o.id) addEscalation(sim, ant.colony, o.colony, E_GAIN.recognition);
    noteDiscovery(sim, o.colony, ant.colony, ant.pos);
    noteDiscovery(sim, ant.colony, o.colony, o.pos);
    if (o.task === 'fight' || ant.task === 'fight') continue;
    // ritual display: antennation and jerking in place (combat's attack roll may still turn it into a fight)
    navStop(sim, ant);
    faceToward(ant, o.pos);
    ant.bb[BB.displayUntil] = now + secondsToTicks(rngRange(sim.stream('rng.rivals'), DISPLAY_S[0], DISPLAY_S[1]));
    ant.bb[BB.displayWith] = o.id;
    ant.bb[BB.go] = 0;
    ant.thinkTick = now + AGENT_THINK_FAST_TICKS;
    sim.emit({ type: 'rival-encounter', a: ant.colony, b: o.colony, pos: { ...ant.pos }, outcome: 'display' });
    return true;
  }
  return false;
}

/** Drops recognition marks older than the pair window (keeps bb small). */
export function pruneMarks(sim: Sim, ant: Ant): void {
  const old = sim.state.tick - secondsToTicks(RECOGNITION_PAIR_S);
  for (const k of Object.keys(ant.bb)) if (k.startsWith(BB.seen) && ant.bb[k] < old) delete ant.bb[k];
}
