// Trail laying decisions (GDD 02 §8.3). The deposits themselves are the `lay-trail` primitive's: it toggles the
// ant's TRAIL_ON flag and the action system lays a dab every 1.5 BU walked outside, scaled by
// bb['act.trailFactor'], which these rules set. The decision is made once per return trip at the source.

import { rngChance } from '@/core/rng';
import { clamp } from '@/core/math/scalar';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { SIZE_FACTOR_MIN, SIZE_FACTOR_N0, SIZE_FACTOR_SPAN } from '@/sim/balance';
import {
  OUTBOUND_DAB_FACTOR, SCOUT_DAB_MULT, TRAIL_DAB_NEED_BASE, TRAIL_LAY_NEED_BASE, TRAIL_LAY_P_FORAGER,
} from '@/sim/balance/foraging';
import { begin } from '@/sim/ants/actions';
import { censusOf } from '@/sim/colony';
import { sourceQuality } from '@/sim/ecology';

const FACTOR_KEY = 'act.trailFactor';

/** sizeFactor(N) of GDD 02 §8.3 (D8: smooth, full strength at 75 workers). */
export function sizeFactor(n: number): number {
  return clamp(SIZE_FACTOR_MIN + ((1 - SIZE_FACTOR_MIN) * (n - SIZE_FACTOR_N0)) / SIZE_FACTOR_SPAN, SIZE_FACTOR_MIN, 1);
}

/** Need index of the source's dominant nutrient (needC or needP). */
export function sourceNeed(sim: Sim, ant: Ant, sourceId: number): number {
  const col = sim.stores.colonies.get(ant.colony);
  const s = sim.stores.sources.get(sourceId);
  if (!col) return 0;
  if (!s) return Math.max(col.needs.needC, col.needs.needP);
  return s.p > s.c ? col.needs.needP : col.needs.needC;
}

function trailOn(ant: Ant): boolean {
  return (ant.flags & AntFlag.TRAIL_ON) !== 0;
}

/** Switches laying on with a dab factor (through the lay-trail primitive). */
export function startLaying(sim: Sim, ant: Ant, factor: number): void {
  ant.bb[FACTOR_KEY] = Math.max(1e-3, factor);
  if (!trailOn(ant)) begin(sim, ant, 'lay-trail', null);
}

/** Switches laying off (entering the nest, giving up, fleeing). */
export function stopLaying(sim: Sim, ant: Ant): void {
  if (trailOn(ant)) begin(sim, ant, 'lay-trail', null);
  ant.bb[FACTOR_KEY] = 0;
}

/**
 * Return-trip decision for a successful forager or a scout with a find: lay with probability
 * 0.84 x clamp(0.4 + need, 0.4, 1) at a dab of q x (0.5 + need) x sizeFactor(N) (x 1.2 for scouts); never after a
 * long wait in a full queue (crowding feedback). Returns whether it lays.
 */
export function decideReturnTrail(sim: Sim, ant: Ant, sourceId: number, scout: boolean, queuedLong: boolean): boolean {
  if (queuedLong || sourceId < 0) return false;
  const need = sourceNeed(sim, ant, sourceId);
  const p = TRAIL_LAY_P_FORAGER * clamp(TRAIL_LAY_NEED_BASE + need, TRAIL_LAY_NEED_BASE, 1);
  if (!rngChance(sim.stream('rng.behaviour'), p)) return false;
  const q = Math.max(sourceQuality(sim, ant.colony, sourceId), sim.stores.sources.get(sourceId)?.quality ?? 0);
  const n = censusOf(sim, ant.colony).workers;
  const factor = q * (TRAIL_DAB_NEED_BASE + need) * sizeFactor(n) * (scout ? SCOUT_DAB_MULT : 1);
  if (factor <= 0) return false;
  startLaying(sim, ant, factor);
  return true;
}

/** Outbound on a trail it follows: reinforces at a fraction of a dab (GDD 02 §8.3). */
export function startOutboundDabs(sim: Sim, ant: Ant): void {
  startLaying(sim, ant, OUTBOUND_DAB_FACTOR);
}
