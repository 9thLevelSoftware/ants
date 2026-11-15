// Fielded rival agents (GDD 05 §3.3): real ants of the rival colony (task `raid`, flag FIELDED, the job in bb)
// spawned at an entrance or in the deepest chamber, and absorbed back into the abstract colony with whatever
// they carry when they re-enter. Absorption is a removal without a death (no `ant-died`, no corpse).

import type { Vec3 } from '@/core/math/vec3';
import { rngRange } from '@/core/rng';
import type { Ant, Brood, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { removeItem, spawnAnt } from '@/sim/entities';
import { cancel, exitBehaviour } from '@/sim/ants';
import { navStop } from '@/sim/locomotion';
import { AGENT_THINK_TICKS, RAIDED_BROOD_FOOD_P } from '@/sim/balance/rivals';
import { chamberFloor, chambersOf, homeNest, placeOnFloor, removeBroodQuietly } from './setup';
import { BB, colExt, JOB, type JobCode, type RivalColony } from './state';

/** ant.bb key the ant lifecycle reads: removed without a body (no corpse). */
const NO_BODY_KEY = 'life.noBody';

export function setJob(sim: Sim, ant: Ant, job: JobCode): void {
  ant.bb[BB.job] = job;
  ant.bb[BB.t0] = sim.state.tick;
  ant.bb[BB.step] = 0;
  ant.bb[BB.go] = 0;
  ant.thinkTick = sim.state.tick;
}

/** A rival agent: an ant of a rival colony fielded from its abstract population. */
export function isAgent(ant: Ant): boolean {
  return (ant.flags & AntFlag.FIELDED) !== 0;
}

/**
 * Spawns an agent of a job: on the surface next to an entrance (`deep` false) or on the floor of the deepest
 * chamber (defenders). Returns null when the nest has no entrance / chamber or no floor was found.
 */
export function spawnAgent(sim: Sim, col: RivalColony, job: JobCode, deep: boolean, raidId = -1): Ant | null {
  const nest = homeNest(sim, col);
  if (!nest) return null;
  const rng = sim.stream('rng.rivals');
  const bu = sim.world.bu;
  let pos: Vec3, nestId = -1, chamberId = -1;
  if (deep) {
    const ch = chambersOf(nest).deepest;
    if (!ch) return null;
    pos = chamberFloor(ch, rngRange(rng, -0.4, 0.4), rngRange(rng, -0.4, 0.4));
    pos.y = ch.center.y;
    nestId = nest.id; chamberId = ch.id;
  } else {
    const n = nest.entrances.length;
    if (n === 0) return null;
    const e = nest.entrances[Math.floor(rngRange(rng, 0, n)) % n];
    const a = rngRange(rng, 0, Math.PI * 2), r = e.radius + 1.5 * bu;
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    pos = { x, y: sim.field.height(x, z) + bu, z };
  }
  const ant = spawnAnt(sim, {
    colony: col.id, caste: 'worker', pos, task: 'raid', flags: AntFlag.FIELDED, ageGd: 10, nestId, chamberId,
  });
  if (!placeOnFloor(sim, ant, pos)) {
    absorbAgent(sim, ant);
    return null;
  }
  ant.bb[BB.raid] = raidId;
  ant.bb[BB.homeTick] = sim.state.tick;
  ant.bb['run.task'] = -1;
  setJob(sim, ant, job);
  ant.thinkTick = sim.state.tick + (ant.id % AGENT_THINK_TICKS);
  col.rival.fieldedIds.push(ant.id);
  return ant;
}

/** Brood brought home by an agent: same species is adopted into B, other brood is food (P). */
function adoptBrood(sim: Sim, col: RivalColony, b: Brood): void {
  const from = sim.state.colonies.find((c) => c.id === b.colony); // the victim (may be destroyed by now)
  if (!from || from.species === col.species) col.rival.b += 1;
  else col.rival.pS += RAIDED_BROOD_FOOD_P;
  removeBroodQuietly(sim, b, 'raided');
}

/** Delivers what the agent carries into its colony (virtual load, brood, food items). */
function deliverCarried(sim: Sim, ant: Ant, col: RivalColony | undefined): void {
  const lc = ant.bb[BB.loadC] ?? 0, lp = ant.bb[BB.loadP] ?? 0;
  if (col && (lc > 0 || lp > 0)) {
    col.rival.cS += lc;
    col.rival.pS += lp;
    const ext = colExt(sim.state, col.id);
    ext.hourC += lc;
    ext.hourP += lp;
  }
  ant.bb[BB.loadC] = 0; ant.bb[BB.loadP] = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.carriedBy !== ant.id) continue;
    b.carriedBy = -1;
    if (col) adoptBrood(sim, col, b);
  }
  if (ant.carry.kind === 'item') {
    const it = sim.stores.items.get(ant.carry.id);
    if (it) {
      it.carrierIds = it.carrierIds.filter((c) => c !== ant.id);
      if (col && (it.c > 0 || it.p > 0)) {
        col.rival.cS += it.c;
        col.rival.pS += it.p;
        removeItem(sim, it.id, 'stored');
      } else it.pos = { ...ant.pos };
    }
  }
  ant.carry = { kind: 'none', id: -1 };
}

/**
 * Removes an agent back into its colony (GDD 05 §3.3 absorption): its load is delivered, its brood adopted, and
 * it disappears without a death. Safe on any non-possessed ant of a rival colony.
 */
export function absorbAgent(sim: Sim, ant: Ant): boolean {
  if (!ant.alive || (ant.flags & AntFlag.POSSESSED) !== 0) return false;
  const col = sim.stores.colonies.get(ant.colony);
  const rc = col && col.rival ? (col as RivalColony) : undefined;
  if (ant.action) cancel(sim, ant, 'conditions');
  if ((ant.bb['run.task'] ?? -1) >= 0) exitBehaviour(sim, ant);
  navStop(sim, ant);
  deliverCarried(sim, ant, rc);
  ant.bb[NO_BODY_KEY] = 1;
  if (!sim.stores.ants.markDead(ant.id)) return false;
  if (col) col.livingAnts = Math.max(0, col.livingAnts - 1);
  if (rc) {
    const i = rc.rival.fieldedIds.indexOf(ant.id);
    if (i >= 0) rc.rival.fieldedIds.splice(i, 1);
  }
  sim.emit({ type: 'entity-removed', entity: 'ant', id: ant.id, cause: 'absorbed' });
  return true;
}

/** Living agents of a colony (dead ids dropped from fieldedIds). */
export function agentsOf(sim: Sim, col: RivalColony): Ant[] {
  const out: Ant[] = [];
  const ids = col.rival.fieldedIds;
  let w = 0;
  for (let i = 0; i < ids.length; i++) {
    const a = sim.stores.ants.get(ids[i]);
    if (!a || !a.alive) continue;
    ids[w++] = ids[i];
    out.push(a);
  }
  ids.length = w;
  return out;
}

/** Job of an agent counted for fielding (agents on the way home count as nothing). */
export function countedJob(ant: Ant): JobCode | -1 {
  const j = (ant.bb[BB.job] ?? JOB.emerge) as JobCode;
  return j === JOB.ret || j === JOB.wander || j === JOB.queen ? -1 : j;
}
