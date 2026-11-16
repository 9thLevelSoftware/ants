// Food already spoken for (econ-growth R10): how many of a colony's ants are on their way to (or working at) each
// source, and whether a source still has food for one more trip once they have taken theirs. Without it a one-unit
// carcass or a flower with half a crop of nectar drew every departing forager of a 300-worker colony, and most of
// them came home empty ("source-depleted").
//
// A trip claims what it will carry (a crop, one unit, one torn piece) from a finite source; a refilling source takes
// at most its feeding slots in ants on their way. Ants do not count claims in reality; the colony-level effect (recruits
// stop following a dried-up source, GDD 02 §6.7 news expiry) is what this stands in for.

import type { Ant, FoodSource, Sim } from '@/sim/types';
import { unitsPerTripOf } from '@/sim/colony';
import { CLAIM_MIN_TRIP_SHARE } from '@/sim/balance/foraging';
import { harvestForm } from '@/sim/ecology';
import { enteredTask } from '@/sim/ants/behaviourRunner';
import { K, PHASE } from './keys';

/**
 * Phases of a trip that will still take food from its source. An ant already collecting is not counted: what it
 * drinks or tears leaves the source's units as it takes it.
 */
function claiming(phase: number): boolean {
  return phase === PHASE.outbound || phase === PHASE.search || phase === PHASE.queue;
}

/** Tasks whose behaviour is the outdoor engine (the only ones whose `fo.*` keys describe a trip under way). */
const TRIP_TASKS = new Set(['scout', 'forage', 'tend']);

/** The source this ant's trip claims, or -1: only while it runs an outdoor behaviour in a claiming phase. */
function claimOf(a: Ant): number {
  if (!a.alive) return -1;
  const t = enteredTask(a);
  if (t === null || !TRIP_TASKS.has(t) || !claiming(a.bb[K.phase] ?? -1)) return -1;
  return a.bb[K.src] ?? -1;
}

/**
 * Per tick: colony id -> source id -> ants claiming it, and ant id -> the source it was counted on (runtime cache,
 * rebuilt on the first query of a tick; noteClaim keeps it current for trips chosen later in the same tick).
 */
interface ClaimCache { tick: number; byColony: Map<number, Map<number, number>>; byAnt: Map<number, number> }
const cache = new WeakMap<Sim, ClaimCache>();

function current(sim: Sim): ClaimCache {
  let c = cache.get(sim);
  if (!c || c.tick !== sim.state.tick) {
    c = { tick: sim.state.tick, byColony: new Map(), byAnt: new Map() };
    for (const a of sim.stores.ants.list) {
      const src = claimOf(a);
      if (src >= 0) add(c, a, src, 1);
    }
    cache.set(sim, c);
  }
  return c;
}

function add(c: ClaimCache, a: Ant, src: number, n: 1 | -1): void {
  let m = c.byColony.get(a.colony);
  if (!m) { m = new Map(); c.byColony.set(a.colony, m); }
  m.set(src, Math.max(0, (m.get(src) ?? 0) + n));
  if (n > 0) c.byAnt.set(a.id, src);
  else c.byAnt.delete(a.id);
}

function claimsOf(sim: Sim, colonyId: number): Map<number, number> {
  return current(sim).byColony.get(colonyId) ?? EMPTY;
}
const EMPTY = new Map<number, number>();

/**
 * The ant has just set out for `sourceId` (or turned to it): later choosers in this tick see her claim. Without it
 * several foragers deciding on one tick could all take the last unit of a carcass. Only touches a cache already
 * built this tick; the next tick's rebuild reads the ants' own keys.
 */
export function noteClaim(sim: Sim, ant: Ant, sourceId: number): void {
  const c = cache.get(sim);
  if (!c || c.tick !== sim.state.tick) return;
  const prev = c.byAnt.get(ant.id);
  if (prev === sourceId) return;
  if (prev !== undefined) add(c, ant, prev, -1);
  if (sourceId >= 0) add(c, ant, sourceId, 1);
}

/** Ants of the colony claiming the source now, not counting `self` (an ant re-choosing during its own trip). */
export function claimsOn(sim: Sim, colonyId: number, sourceId: number, self?: Ant): number {
  const n = claimsOf(sim, colonyId).get(sourceId) ?? 0;
  const mine = self && current(sim).byAnt.get(self.id) === sourceId ? 1 : 0;
  return Math.max(0, n - mine);
}

/** Source units one trip of this ant takes (a crop of liquid, one unit picked, one torn piece). */
export function unitsPerTrip(sim: Sim, ant: Ant, s: FoodSource): number {
  return unitsPerTripOf(harvestForm(sim, s), ant.cropCap, ant.carryCap, s.unitBulk);
}

/**
 * Whether the source still holds food for this ant's trip after the trips already on their way: a finite source's
 * units less what the claims take must cover CLAIM_MIN_TRIP_SHARE of a trip; a refilling source takes as many trips
 * on their way as it has slots. `arriveS` (game seconds to get there) is kept for callers; unused since the refill
 * rule became slot-based.
 */
export function foodLeftFor(sim: Sim, ant: Ant, s: FoodSource, arriveS: number): boolean {
  // a herd's honeydew is produced by its aphids as they are tended (plants module): no stock to claim against
  if (s.herdId >= 0) return true;
  const claims = claimsOn(sim, ant.colony, s.id, ant);
  // a refilling source (flower, nectary) is worked in partial crops as it refills: no more ants on their way than it
  // has feeding slots (a flower drew 30 recruits of a 300-worker colony), but not one at a time (econ-growth: a
  // 16-worker colony then left a flower's refill unharvested)
  if (s.refillPerGd > 0) return claims < Math.max(1, s.slots);
  const per = unitsPerTrip(sim, ant, s);
  const left = s.units - claims * per;
  return left >= CLAIM_MIN_TRIP_SHARE * per;
}
