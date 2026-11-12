// Feeding slots (GDD 05 §1.1): at most `slots` ants harvest a source at once; the rest queue.
//
// Occupancy is derived from persisted state, never stored: an ant holds a slot while its action primitive is a
// harvesting action aimed at the source (target kind 'source') and has started. Slot order is first come, first
// served (action start tick, then ant id), so the same state always gives the same winners (determinism and
// save/load safe). An ant without such an action (a direct call) ranks after every action holder.

import type { Ant, ActionId, ActionPhase, FoodSource, Sim } from '@/sim/types';
import { SOURCE_QUEUE_RADIUS_BU } from '@/sim/balance/ecology';
import { reachMm } from './def';

/** Actions that occupy a feeding slot when aimed at a source. */
export const SLOT_ACTIONS: readonly ActionId[] = ['harvest-liquid', 'harvest-solid', 'pick-up', 'tend-aphid', 'drag', 'cull-aphid'];
const LIVE_PHASES: readonly ActionPhase[] = ['windup', 'active', 'recovery'];

/** Whether this ant's current action holds a slot at the source. */
export function holdsSlotAction(ant: Ant, sourceId: number): boolean {
  const a = ant.action;
  return !!a && a.target.kind === 'source' && a.target.id === sourceId && SLOT_ACTIONS.includes(a.id)
    && LIVE_PHASES.includes(a.phase);
}

const scratch: number[] = [];

/** Ants currently holding a slot action at the source, in slot order (first come first). */
export function slotUsers(sim: Sim, s: FoodSource): Ant[] {
  const r = reachMm(s, sim.world.bu) + SOURCE_QUEUE_RADIUS_BU * sim.world.bu;
  scratch.length = 0;
  sim.index.queryAnts(s.pos, r, scratch);
  const users: Ant[] = [];
  for (const id of scratch) {
    const ant = sim.stores.ants.get(id);
    if (ant && holdsSlotAction(ant, s.id)) users.push(ant);
  }
  users.sort((a, b) => (a.action?.startTick ?? 0) - (b.action?.startTick ?? 0) || a.id - b.id);
  return users;
}

/**
 * Whether the ant may harvest now: it is among the first `slots` users (or a slot is free for it). Called every
 * tick by each drinking ant, so it counts the users ahead of the ant instead of building and sorting a list.
 */
export function hasSlot(sim: Sim, ant: Ant, s: FoodSource): boolean {
  const r = reachMm(s, sim.world.bu) + SOURCE_QUEUE_RADIUS_BU * sim.world.bu;
  scratch.length = 0;
  sim.index.queryAnts(s.pos, r, scratch);
  const holds = holdsSlotAction(ant, s.id) && scratch.includes(ant.id); // as in slotUsers
  const start = ant.action?.startTick ?? 0;
  let ahead = 0;
  for (const id of scratch) {
    if (id === ant.id) continue;
    const u = sim.stores.ants.get(id);
    if (!u || !holdsSlotAction(u, s.id)) continue;
    // A direct caller (no slot action) ranks after every holder; holders rank by start tick, then id.
    const us = u.action?.startTick ?? 0;
    if (!holds || us < start || (us === start && u.id < ant.id)) ahead++;
    if (ahead >= s.slots) return false;
  }
  return ahead < s.slots;
}

/** Free feeding slots (0 when every slot is held). */
export function freeSlotsOf(sim: Sim, s: FoodSource): number {
  return Math.max(0, s.slots - slotUsers(sim, s).length);
}

/** Position of the ant in the queue: 0 = harvesting, n = n-th waiting; -1 if it holds no slot action here. */
export function queuePosition(sim: Sim, ant: Ant, s: FoodSource): number {
  const i = slotUsers(sim, s).findIndex((u) => u.id === ant.id);
  return i < 0 ? -1 : Math.max(0, i - s.slots + 1);
}
