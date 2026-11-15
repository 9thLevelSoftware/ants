// Shared parts of the ant predators' state machines: choosing a victim, the hold / feed / flee / recover states.

import type { Ant, Creature, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  FEED_RETREAT_MM, FEED_S, FLEE_DIST_MM, FLEE_RULE, FLEE_S, LONE_ANT_L, NEST_EXCLUSION_WORKERS, PREY_MAX_MG, RECOVER_S,
  REF_BU_MM,
} from '@/sim/balance/creatures';
import {
  antLen, awayPoint, dist, holdersOf, nestmateWithin, onSurface, setState, stop, timerDone, walkTo,
} from './common';
import { conditions } from './conditions';
import { holdTick, isImmune, isSeized, nestmatesBiting, releaseAnt, type HoldResult } from './attack';
import { ports } from './ports';

export interface VictimRule {
  rangeMm: number;
  /** Only ants with no nestmate within 3 L (jumping spider, rove beetle). */
  lone?: boolean;
  /** Ants inside a nest count (centipede raids); default surface only. */
  inNest?: boolean;
}

interface WorkerCache { tick: number; workers: number; colonyId: number; entrance: { x: number; z: number } | null }
const workerCache = new WeakMap<Sim, WorkerCache>();

/** Player colony worker count and first entrance (for the nest exclusion of §5), cached per tick. */
function playerNestInfo(sim: Sim): WorkerCache {
  const hit = workerCache.get(sim);
  if (hit && hit.tick === sim.state.tick) return hit;
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  let workers = 0;
  if (col) for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'worker') workers++;
  const nest = col ? sim.state.nests.find((n) => n.alive && n.colony === col.id) : undefined;
  const e = nest && nest.entrances.length > 0 ? nest.entrances[0].pos : null;
  const v: WorkerCache = { tick: sim.state.tick, workers, colonyId: col ? col.id : -1, entrance: e ? { x: e.x, z: e.z } : null };
  workerCache.set(sim, v);
  return v;
}

/** May this predator take this ant at all (size, founding queen rule, nest exclusion, already held / immune)? */
export function canPrey(sim: Sim, c: Creature, ant: Ant, inNest = false): boolean {
  if (!ant.alive || ant.hp <= 0 || isSeized(ant) || isImmune(sim, ant)) return false;
  if (!inNest && !onSurface(ant)) return false;
  if (ant.massMg > (PREY_MAX_MG[c.kind] ?? 0)) return false;
  const lv = conditions(sim).levers;
  if ((ant.flags & AntFlag.FOUNDING) !== 0 && !lv.targetFoundingQueen) return false;
  if (lv.nestExclusionBu > 0) {
    const info = playerNestInfo(sim);
    if (ant.colony === info.colonyId && info.workers < NEST_EXCLUSION_WORKERS && info.entrance) {
      const r = lv.nestExclusionBu * REF_BU_MM;
      if (Math.hypot(ant.pos.x - info.entrance.x, ant.pos.z - info.entrance.z) < r) return false;
    }
  }
  return true;
}

const _ids: number[] = [];

/** Nearest eligible victim within the rule's range (ties by id), or null. */
export function findVictim(sim: Sim, c: Creature, rule: VictimRule): Ant | null {
  sim.index.queryAnts(c.pos, rule.rangeMm, _ids);
  let best: Ant | null = null, bestD = Infinity;
  for (let i = 0; i < _ids.length; i++) {
    const a = sim.stores.ants.get(_ids[i]);
    if (!a || !canPrey(sim, c, a, rule.inNest)) continue;
    const d = dist(a.pos, c.pos);
    if (d > rule.rangeMm) continue;
    if (rule.lone && nestmateWithin(sim, a, LONE_ANT_L * antLen(sim, a))) continue;
    if (d < bestD || (d === bestD && best && a.id < best.id)) { best = a; bestD = d; }
  }
  return best;
}

/** The current target ant, if it is still a valid victim. */
export function currentVictim(sim: Sim, c: Creature, inNest = false): Ant | null {
  const a = sim.stores.ants.get(c.bb.tgt ?? -1);
  return a && canPrey(sim, c, a, inNest) ? a : null;
}

/** §2.4 flee condition met (holders, deterrence, health)? */
export function shouldFlee(sim: Sim, c: Creature): boolean {
  const rule = FLEE_RULE[c.kind];
  if (!rule) return false;
  if (c.deterrence >= rule.deterrence) return true;
  if (c.hp < rule.health * c.maxHp) return true;
  return holdersOf(sim, c, c.radius + 4 * sim.world.bu) >= rule.holders;
}

/** Drops any victim and runs away from the nearest ant (or from where it is). */
export function startFlee(sim: Sim, c: Creature, speedMmS: number, distMm = FLEE_DIST_MM): void {
  if (c.seizedAntId >= 0) releaseAnt(sim, c, false);
  c.bb.strikeAt = -1;
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, 8 * sim.world.bu, ids);
  let from = c.homeCenter;
  let best = Infinity;
  for (const id of ids) { const a = sim.stores.ants.get(id); if (a && dist(a.pos, c.pos) < best) { best = dist(a.pos, c.pos); from = a.pos; } }
  const to = awayPoint(c.pos, from === c.homeCenter ? { x: c.pos.x - 1, y: c.pos.y, z: c.pos.z } : from, distMm, { x: 0, y: 0, z: 0 });
  setState(sim, c, 'flee', FLEE_S);
  walkTo(sim, c, to, speedMmS, 2);
}

/** Feeding after a kill: a short retreat toward home, then FEED_S standing still. */
export function startFeed(sim: Sim, c: Creature): void {
  c.eaten++;
  c.bb.tgt = -1;
  const r = FEED_RETREAT_MM[c.kind] ?? 10;
  const to = awayPoint(c.pos, c.homeCenter, -Math.min(r, dist(c.pos, c.homeCenter)), { x: 0, y: 0, z: 0 });
  setState(sim, c, 'feed', FEED_S[c.kind] ?? 60);
  walkTo(sim, c, to, Math.max(2, c.radius * 2), 2);
}

export function startRecover(sim: Sim, c: Creature): void {
  c.bb.tgt = -1;
  c.bb.strikeAt = -1;
  stop(sim, c);
  setState(sim, c, 'recover', RECOVER_S);
}

/** One tick of holding a seized ant; moves on to feed (victim dead) or recover (freed). */
export function holdState(sim: Sim, c: Creature, cause: 'predation' | 'antlion' = 'predation'): HoldResult {
  const victim = sim.stores.ants.get(c.seizedAntId);
  const helpers = victim ? nestmatesBiting(sim, c, victim.colony) : 0;
  const r = holdTick(sim, c, undefined, cause, helpers);
  if (r === 'dead') startFeed(sim, c);
  else if (r === 'freed') startRecover(sim, c);
  return r;
}

/** Timed states shared by the predators: true when the state's timer ran out. */
export function timedState(c: Creature): boolean {
  return timerDone(c);
}

/** A strike is due this tick. */
export function strikeDue(sim: Sim, c: Creature): boolean {
  return (c.bb.strikeAt ?? -1) >= 0 && sim.state.tick >= c.bb.strikeAt;
}

/** Ants near the creature are notified (alarm) when it seizes or kills; used by ant-side alerts. */
export function alarmAt(sim: Sim, ant: Ant): void {
  ports.raiseAlarm(sim, ant.colony, ant.pos, 1);
}
