// Raiders (GDD 05 §3.7, §3.8, §3.10): rival raid parties and player raid parties (task `raid` on player
// workers), brood raiders among incipient colonies and the diggers of a founding chamber. A raider walks to the
// target nest's nearest entrance, goes in toward the queen (raids) or the brood (brood raids), fights what it
// meets through combat, picks up brood with the shared `pick-up` primitive and goes home; player raiders put
// their loot down in their own nursery.

import type { Ant, Brood, RaidRecord, Sim } from '@/sim/types';
import { begin, canDo } from '@/sim/ants';
import { faceToward, mayAttack, startFight } from '@/sim/combat';
import { requestTask } from '@/sim/colony';
import { switchTask } from '@/sim/colony/allocation';
import {
  DIG_IDLE_S, RAID_GATHER_BU, RAID_ENGAGE_L, RAID_LOOT_REACH_BU, RAID_LOOT_SEARCH_BU, RAID_LOOT_SEARCH_OUT_L,
} from '@/sim/balance/rivals';
import { secondsToTicks } from '@/sim/time';
import { absorbAgent, setJob } from '../agents';
import { lenMm } from '../encounter';
import { hostileNear } from './jobs';
import { d2, d3, goTarget, halt, loiter } from './move';
import { chambersOf, homeNest } from '../setup';
import { BB, JOB, rmod } from '../state';

const ids: number[] = [];

export function raidOf(sim: Sim, ant: Ant): RaidRecord | undefined {
  const id = ant.bb[BB.raid] ?? -1;
  return id >= 0 ? rmod(sim.state).raids.find((r) => r.id === id) : undefined;
}

/** Nearest brood of the target colony to the ant (pupae first, then larvae, for brood raids), within r mm. */
function lootNear(sim: Sim, ant: Ant, targetColony: number, r: number, broodRaid: boolean): Brood | null {
  sim.index.queryBrood(ant.pos, r, ids);
  let best: Brood | null = null, bestScore = Infinity;
  for (const id of ids) {
    const b = sim.stores.brood.get(id);
    if (!b || !b.alive || b.colony !== targetColony || b.carriedBy >= 0) continue;
    if (broodRaid && b.stage === 'egg') continue;
    const rank = broodRaid ? (b.stage === 'pupa' ? 0 : 1) : 0;
    const s = rank * 1e6 + d3(b.pos, ant.pos);
    if (s < bestScore) { best = b; bestScore = s; }
  }
  return best;
}

function carrying(ant: Ant): boolean {
  return ant.carry.kind !== 'none';
}

/** Finishes a raider's trip: rivals go home (absorbed with the loot), player raiders through returnPlayer. */
function endTrip(sim: Sim, ant: Ant): void {
  setJob(sim, ant, JOB.ret);
}

/** One think of a raider (rival or player) on a raid record. */
export function raidJob(sim: Sim, ant: Ant): void {
  const r = raidOf(sim, ant);
  if (carrying(ant) || !r || r.ending) { endTrip(sim, ant); return; }
  const nest = sim.stores.nests.get(r.targetNestId);
  if (!nest || nest.entrances.length === 0) { endTrip(sim, ant); return; }
  const broodRaid = r.kind === 'brood';
  const L = lenMm(sim, ant);
  // fight what blocks the way (brood raiders only fight back: combat's hit reaction)
  if (!broodRaid) {
    const foe = hostileNear(sim, ant, ant.pos, RAID_ENGAGE_L * L);
    if (foe && foe.colony === r.target) { startFight(sim, ant, { kind: 'ant', id: foe.id }, foe.pos, 'threat'); return; }
  }
  // loot within reach: pick it up
  const loot = lootNear(sim, ant, r.target, ant.nestId === nest.id ? RAID_LOOT_SEARCH_BU * sim.world.bu : RAID_LOOT_SEARCH_OUT_L * L, broodRaid);
  if (loot) {
    const t = { kind: 'brood' as const, id: loot.id, pos: loot.pos };
    if (d3(loot.pos, ant.pos) <= 2 * RAID_LOOT_REACH_BU * sim.world.bu + ant.radius) {
      faceToward(ant, loot.pos);
      if (canDo(sim, ant, 'pick-up', t).ok) {
        if (!ant.action) { halt(sim, ant); begin(sim, ant, 'pick-up', t); }
        return;
      }
    }
    if (ant.nestId === nest.id) {
      if (ant.bb[BB.tid] !== loot.id) { ant.bb[BB.tid] = loot.id; ant.bb[BB.go] = 0; }
      // arrived (or failed) without being in reach: ask again for the exact spot next think
      if (goTarget(sim, ant, t, RAID_LOOT_REACH_BU * 0.5) !== 'moving') ant.bb[BB.go] = 0;
      return;
    }
  }
  if (ant.nestId !== nest.id) {
    // to the nearest entrance of the target nest
    let e = nest.entrances[0], best = Infinity;
    for (const x of nest.entrances) { const d = d2(x.pos, ant.pos); if (d < best) { best = d; e = x; } }
    if ((ant.bb[BB.step] ?? 0) === 0) {
      const st = goTarget(sim, ant, { kind: 'entrance', id: e.id, pos: e.pos }, RAID_GATHER_BU / 2);
      if (st === 'moving') return;
      ant.bb[BB.step] = 1;
      ant.bb[BB.go] = 0;
    }
    if (!r.gathered) { loiter(sim, ant, e.pos, RAID_GATHER_BU / 2); return; } // wait for the party
    if ((ant.bb[BB.go] ?? 0) === 2) { halt(sim, ant); }
  }
  // inside (or at the door): to the queen (raids) or the nursery (brood raids)
  const { royal, nursery } = chambersOf(nest);
  const queen = sim.stores.ants.get(sim.stores.colonies.get(r.target)?.queenId ?? -1);
  if (!broodRaid && queen && queen.nestId === nest.id && mayAttack(sim, ant, queen)) {
    if (d3(queen.pos, ant.pos) <= RAID_ENGAGE_L * L) { startFight(sim, ant, { kind: 'ant', id: queen.id }, queen.pos, 'threat'); return; }
    if (ant.bb[BB.tid] !== queen.id) { ant.bb[BB.tid] = queen.id; ant.bb[BB.go] = 0; }
    const st = goTarget(sim, ant, { kind: 'ant', id: queen.id, pos: queen.pos }, 1);
    if (st === 'failed') ant.bb[BB.go] = 0;
    return;
  }
  const ch = broodRaid ? nursery : royal ?? nursery;
  if (!ch) { endTrip(sim, ant); return; }
  if (ant.bb[BB.tid] !== ch.id) { ant.bb[BB.tid] = ch.id; ant.bb[BB.go] = 0; }
  const st = goTarget(sim, ant, { kind: 'chamber', id: ch.id, pos: ch.center }, 2);
  if (st === 'arrived' && !lootNear(sim, ant, r.target, RAID_LOOT_SEARCH_BU * sim.world.bu, broodRaid)) endTrip(sim, ant);
  else if (st === 'failed') ant.bb[BB.go] = 0;
}

/** Diggers in a founding chamber (GDD 05 §3.10): fight the queen; with nothing left to fight they dig back out. */
export function digJob(sim: Sim, ant: Ant): void {
  const r = raidOf(sim, ant);
  const q = r ? sim.stores.ants.get(sim.stores.colonies.get(r.target)?.queenId ?? -1) : undefined;
  if (q && q.alive && mayAttack(sim, ant, q)) {
    ant.bb['rv.idle'] = sim.state.tick;
    if (d3(q.pos, ant.pos) <= RAID_ENGAGE_L * lenMm(sim, ant) * 2) { startFight(sim, ant, { kind: 'ant', id: q.id }, q.pos, 'threat'); return; }
    goTarget(sim, ant, { kind: 'ant', id: q.id, pos: q.pos }, 0.5);
    return;
  }
  if (sim.state.tick - (ant.bb['rv.idle'] ?? ant.bb[BB.t0] ?? 0) > secondsToTicks(DIG_IDLE_S)) absorbAgent(sim, ant);
}

/** A player raider's way home: into its own nest, loot put down in the nursery, then back to the allocator. */
export function playerReturn(sim: Sim, ant: Ant): void {
  const col = sim.stores.colonies.get(ant.colony);
  const nest = col ? homeNest(sim, col) : undefined;
  if (!nest) { requestTask(sim, ant, 'idle', 'job:resume'); return; }
  const { nursery } = chambersOf(nest);
  if (ant.nestId === nest.id && (!carrying(ant) || !nursery)) { finishPlayerRaider(sim, ant); return; }
  const dest = ant.nestId === nest.id && nursery ? { kind: 'chamber' as const, id: nursery.id, pos: nursery.center } : null;
  if (dest && nursery && d3(ant.pos, nursery.center) <= Math.max(nursery.radii.x, nursery.radii.z)) {
    if (!ant.action && canDo(sim, ant, 'put-down', { kind: 'none', id: -1, pos: ant.pos }).ok) {
      halt(sim, ant);
      begin(sim, ant, 'put-down', { kind: 'none', id: -1, pos: ant.pos });
    }
    return;
  }
  if (dest) {
    if (ant.bb[BB.tid] !== dest.id) { ant.bb[BB.tid] = dest.id; ant.bb[BB.go] = 0; }
    if (goTarget(sim, ant, dest, 2) === 'failed') ant.bb[BB.go] = 0;
    return;
  }
  const e = nest.entrances[0];
  if (!e) { finishPlayerRaider(sim, ant); return; }
  if (ant.bb[BB.tid] !== -2) { ant.bb[BB.tid] = -2; ant.bb[BB.go] = 0; }
  const target = nursery ? { kind: 'chamber' as const, id: nursery.id, pos: nursery.center } : { kind: 'entrance' as const, id: e.id, pos: e.pos };
  if (goTarget(sim, ant, target, 2) === 'failed') ant.bb[BB.go] = 0;
}

/** Clears the raid keys and hands the worker back to the allocator. */
export function finishPlayerRaider(sim: Sim, ant: Ant): void {
  for (const k of [BB.job, BB.t0, BB.step, BB.go, BB.raid, BB.tid, BB.tx, BB.ty, BB.tz]) delete ant.bb[k];
  if (requestTask(sim, ant, 'idle', 'job:resume')) return;
  const col = sim.stores.colonies.get(ant.colony);
  if (col) switchTask(sim, col, ant, 'idle', 'job:resume');
  ant.thinkTick = sim.state.tick;
}
