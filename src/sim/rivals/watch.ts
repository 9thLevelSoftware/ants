// Per-tick and per-pass observers of the rivals module: deaths (combat deaths escalate the pair; fielded deaths
// leave N), fight entries of agents (escalation, `rival-encounter` fight, reinforcement calls), brood carried off
// by foreign ants (stolen: the victim loses B / display, a player thief adopts it at once), and nest knowledge
// (an ant near a foreign entrance tells its colony where that nest is, and discovers it).

import type { Ant, Sim } from '@/sim/types';
import {
  ABSORB_RADIUS_BU, E_GAIN, FIGHT_COUNT_S, GUARD_MIN_N, KNOWS_NEST_BU, KNOWS_NEST_INCIPIENT_L, REINFORCE_JOIN_L, REINFORCE_LAPSE_S,
  REINFORCE_MAX, REINFORCE_RADIUS_BU,
} from '@/sim/balance/rivals';
import { fightTarget, startFight } from '@/sim/combat';
import { secondsToTicks } from '@/sim/time';
import { absorbAgent, isAgent, setJob } from './agents';
import { switchTask } from '@/sim/colony/allocation';
import { noteDiscovery } from './encounter';
import { addEscalation } from './relations';
import { displayTarget, homeNest } from './setup';
import { BB, colExt, isRival, JOB, rivalColonies, rmod, slotBit } from './state';
import { d2, d3 } from './move';

const DEATH_SEEN = 'rv.dd';
const HIT_WINDOW_TICKS = 30;
const ids: number[] = [];

/** Every tick: ants that died this tick (still in the list until the sweep). */
export function watchDeaths(sim: Sim): void {
  const list = sim.stores.ants.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.alive || a.bb[DEATH_SEEN] === 1 || a.bb['life.noBody'] === 1) continue;
    a.bb[DEATH_SEEN] = 1;
    const killer = killerColony(sim, a);
    if (killer >= 0 && killer !== a.colony) addEscalation(sim, a.colony, killer, E_GAIN.death);
    const col = sim.stores.colonies.get(a.colony);
    if (isRival(col) && isAgent(a)) {
      col.rival.n = Math.max(0, col.rival.n - 1);
      const k = col.rival.fieldedIds.indexOf(a.id);
      if (k >= 0) col.rival.fieldedIds.splice(k, 1);
    }
  }
}

/** Colony of the last hitter within the hit window (combat records recent hitters), -1 none. */
function killerColony(sim: Sim, a: Ant): number {
  const hs = a.combat?.recentHitters;
  if (!hs || hs.length === 0) return -1;
  let best: { id: number; tick: number } | null = null;
  for (const h of hs) if (!best || h.tick > best.tick) best = h;
  if (!best || sim.state.tick - best.tick > HIT_WINDOW_TICKS) return -1;
  const k = sim.stores.ants.get(best.id);
  return k ? k.colony : -1;
}

/**
 * Every pass: agents that another module moved off task `raid` come back. Combat's `flee` ends at home (absorbed
 * there); a flee that ended in `idle` / `rest` (the shared flee behaviour hands the ant to the allocator) returns
 * to `raid` with the job `return`.
 */
export function reclaimAgents(sim: Sim): void {
  for (const col of rivalColonies(sim)) {
    const nest = homeNest(sim, col);
    for (const id of [...col.rival.fieldedIds]) {
      const a = sim.stores.ants.get(id);
      if (!a || !a.alive || a.task === 'raid' || a.task === 'fight') continue;
      if (a.task === 'flee') {
        const e = nest?.entrances[0];
        if (nest && (a.nestId === nest.id || (e && d2(a.pos, e.pos) <= e.radius + ABSORB_RADIUS_BU * sim.world.bu))) absorbAgent(sim, a);
        continue;
      }
      switchTask(sim, col, a, 'raid', 'job:return');
      setJob(sim, a, JOB.ret);
    }
  }
}

/** Every pass: agents that entered a fight (+2 escalation, `rival-encounter` fight, reinforcement call). */
export function watchFights(sim: Sim): void {
  const now = sim.state.tick;
  for (const col of rivalColonies(sim)) {
    const nest = homeNest(sim, col);
    const e = nest?.entrances[0];
    for (const id of col.rival.fieldedIds) {
      const a = sim.stores.ants.get(id);
      if (!a || !a.alive || a.task !== 'fight') continue;
      const t = fightTarget(a);
      const foe = t && t.kind === 'ant' ? sim.stores.ants.get(t.id) : undefined;
      if (!foe || foe.colony === a.colony) continue;
      const last = a.bb[BB.fightTick];
      if (last !== undefined && now - last < secondsToTicks(FIGHT_COUNT_S)) continue;
      a.bb[BB.fightTick] = now;
      if (!isAgent(foe) || a.id < foe.id) {
        addEscalation(sim, a.colony, foe.colony, E_GAIN.fight);
        sim.emit({ type: 'rival-encounter', a: a.colony, b: foe.colony, pos: { ...a.pos }, outcome: 'fight' });
      }
      if (e && col.rival.n >= GUARD_MIN_N && d2(a.pos, e.pos) <= REINFORCE_RADIUS_BU * sim.world.bu) callReinforcements(sim, a, foe);
    }
    const ext = colExt(sim.state, col.id);
    if (ext.reinforceTick >= 0 && now - ext.reinforceTick > secondsToTicks(REINFORCE_LAPSE_S)) { ext.reinforceLeft = 0; ext.reinforceTick = -1; }
  }
}

/** Nestmates within 6 L join; the nest sends up to 10 more (fielding spawns them as defenders). */
function callReinforcements(sim: Sim, a: Ant, foe: Ant): void {
  const col = sim.stores.colonies.get(a.colony);
  if (!isRival(col)) return;
  sim.index.queryAnts(a.pos, REINFORCE_JOIN_L * a.lengthBu * sim.world.bu, ids);
  for (const id of ids) {
    const m = sim.stores.ants.get(id);
    if (!m || m === a || m.colony !== a.colony || !isAgent(m) || m.task === 'fight' || m.task === 'flee') continue;
    startFight(sim, m, { kind: 'ant', id: foe.id }, foe.pos, 'alarm');
  }
  const ext = colExt(sim.state, col.id);
  if (ext.reinforceTick < 0) ext.reinforceLeft = REINFORCE_MAX;
  ext.reinforceTick = sim.state.tick;
  ext.reinforceX = foe.pos.x; ext.reinforceY = foe.pos.y; ext.reinforceZ = foe.pos.z;
}

/** Every pass: brood held by an ant of another colony counts as stolen once (GDD 05 §3.4, §3.8). */
export function watchTheft(sim: Sim): void {
  const m = rmod(sim.state);
  const counted = new Set(m.stolenBrood);
  const tally = new Map<string, { from: number; to: number; count: number; stage: string }>();
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.carriedBy < 0) continue;
    const carrier = sim.stores.ants.get(b.carriedBy);
    if (!carrier || carrier.colony === b.colony || counted.has(b.id)) continue;
    const from = b.colony, victim = sim.stores.colonies.get(from);
    if (isRival(victim)) {
      // each display item carried off stands for B / display brood (the rest die in the raid)
      const display = Math.max(1, displayTarget(victim.rival.b));
      victim.rival.b = Math.max(0, victim.rival.b - victim.rival.b / display);
    }
    colExt(sim.state, from).broodRaidedTick = sim.state.tick;
    const raidId = carrier.bb[BB.raid] ?? -1;
    const rd = raidId >= 0 ? m.raids.find((r) => r.id === raidId) : undefined;
    if (rd) rd.loot++;
    // a player thief adopts it at once (the player's brood system rears it); a rival thief adopts it at home
    if (sim.stores.colonies.get(carrier.colony)?.isPlayer) b.colony = carrier.colony;
    else counted.add(b.id);
    const key = `${from}:${carrier.colony}:${b.stage}`;
    const t = tally.get(key) ?? { from, to: carrier.colony, count: 0, stage: b.stage };
    t.count++;
    tally.set(key, t);
  }
  for (const t of tally.values()) sim.emit({ type: 'brood-raided', from: t.from, to: t.to, count: t.count, stage: t.stage });
  m.stolenBrood = [...counted].filter((id) => { const b = sim.stores.brood.get(id); return !!b && b.carriedBy >= 0; });
}

/** Every pass: ants near a foreign entrance learn that nest (20 BU; incipient nests 3 L) and discover it. */
export function watchNests(sim: Sim): void {
  const m = rmod(sim.state);
  const bu = sim.world.bu;
  for (const owner of sim.stores.colonies.list) {
    if (!owner.alive) continue;
    const nest = homeNest(sim, owner);
    if (!nest) continue;
    const incipient = owner.rival ? owner.rival.incipient : false;
    const bit = slotBit(sim.state, owner.id);
    if (bit === 0) continue;
    for (const e of nest.entrances) {
      const r = incipient ? KNOWS_NEST_INCIPIENT_L * bu + e.radius : KNOWS_NEST_BU * bu;
      sim.index.queryAnts(e.pos, r, ids);
      for (const id of ids) {
        const a = sim.stores.ants.get(id);
        if (!a || !a.alive || a.colony === owner.id || a.nestId >= 0 || d3(a.pos, e.pos) > r) continue;
        const col = sim.stores.colonies.get(a.colony);
        if (!col) continue;
        if (col.rival) col.rival.knowsNest |= bit;
        else if (col.isPlayer) m.playerKnowsNest |= bit;
        noteDiscovery(sim, owner.id, a.colony, e.pos);
      }
    }
  }
}
