// The colony side of the founding hand-over (viab-economy R2, GDD 06 §5.13): the first workers do not start with an
// empty pool, and no starvation stage starts before they had time to forage. The founding module owns the hand-over
// itself (founding/handover.ts); this reads its outcome (the queen established, the lapse end tick).

import type { Colony, Sim } from '@/sim/types';
import {
  HANDOVER_PROVISION_WINDOW_GD, HANDOVER_QUEEN_KEEP_C, HANDOVER_QUEEN_KEEP_P, LOAD_EPS, STARVE_ALERT_GRACE_GD,
} from '@/sim/balance/colony';
import { daysToTicks } from '@/sim/time';
import { deposit, stomachSpace } from './stores';

/** Tick the player's founding lapse ended (the hand-over), -1 none (no opening, or not handed over yet). */
export function handoverTick(sim: Sim, col: Colony): number {
  if (!col.isPlayer || col.id !== sim.state.player.colonyId) return -1;
  return sim.state.player.opening?.lapse?.endTick ?? -1;
}

/**
 * After the hand-over: the queen's reserve above HANDOVER_QUEEN_KEEP_C / _P is credited to the pool as C and P
 * (booked as recycled: food from a colony member's body), as far as the workers' social stomachs hold it (never into
 * the larder or the chamber piles). What the stomachs cannot hold stays in the queen and is moved
 * on a later cycle, once there is room (the final sweep's seed 2 handed over with a full pool: the queen kept 9 P while
 * the larvae starved for protein), within HANDOVER_PROVISION_WINDOW_GD of the hand-over; after that the queen's
 * reserves are her own again (overwintering may fatten her). No loop inside the window either: an established queen
 * never draws her reserveP and refills her reserve only up to QUEEN_FAT_CAP (= HANDOVER_QUEEN_KEEP_C). Returns the
 * loads moved.
 */
export function provisionAtHandover(sim: Sim, col: Colony): { c: number; p: number } {
  const end = handoverTick(sim, col);
  if (end < 0 || sim.state.tick - end > daysToTicks(HANDOVER_PROVISION_WINDOW_GD)) return { c: 0, p: 0 };
  const q = sim.stores.ants.get(col.queenId);
  if (!q || !q.alive || !q.queen || q.queen.founding) return { c: 0, p: 0 };
  const qs = q.queen;
  const c = Math.max(0, qs.reserve - HANDOVER_QUEEN_KEEP_C);
  const p = Math.max(0, qs.reserveP - HANDOVER_QUEEN_KEEP_P);
  if (c <= LOAD_EPS && p <= LOAD_EPS) return { c: 0, p: 0 };
  // into the social stomachs only: the queen's body is not a pile. A larder (R21) or a chamber pile would take the
  // whole provision at once and let it rot on the brood chamber's floor before the first larva hatches (sweep-4
  // review: 1.98 P spoiled, larva:hygiene 28 vs 4 over 15 pairs); left in the queen it is paid in as the brood eats.
  const room = stomachSpace(col);
  const got = deposit(col, Math.min(c, room.c), Math.min(p, room.p), 0, 'recycled');
  qs.reserve -= got.c;
  qs.reserveP -= got.p;
  return { c: got.c, p: got.p };
}

/**
 * No starvation stage may start while the queen founds alone (her reserves are the colony's food) or within
 * STARVE_ALERT_GRACE_GD of the hand-over (the first workers have not foraged yet; R2).
 */
export function starvationHeld(sim: Sim, col: Colony): boolean {
  const q = sim.stores.ants.get(col.queenId);
  if (col.isPlayer && q && q.alive && q.queen?.founding) return true;
  const end = handoverTick(sim, col);
  return end >= 0 && sim.state.tick - end < daysToTicks(STARVE_ALERT_GRACE_GD);
}
