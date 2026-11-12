// LOCAL ADAPTER for five care operations of GDD 02 that have no action primitive yet (src/sim/ants/actions has
// no `load` from the pool with the nurse / ration mix, no carer -> queen feed, no eclosion help, no brood eating
// and no pile grooming): load (§5.4.1 pool -> nurse / carer, mix §5.4.2), feed-queen (§5.4.1 carer -> queen gut;
// from the carer's own reserve in S2), assist (§2.9 ECLOSE_ASSIST_S), cannibalise (§5.7 S3) and tend-pile
// (§10.4 `nurse.tend`: 5 s, every egg / pupa within 2 BU). Each runs like a timed primitive: the ant stands for the
// duration (state in ant.bb, so save / load is exact) and the colony module's function is applied once at the
// end. This file is the ONLY place where the in-nest behaviours call a colony mutator; it should become
// primitives in the action library (reported as a need of beh-nest).

import type { Ant, Sim } from '@/sim/types';
import { POSES } from '@/sim/types';
import {
  cannibaliseBrood, ecloseBrood, feedBrood, feedQueenFromReserve, nurseLoadMix, queenRationMix, tendBroodAt, withdrawFood,
} from '@/sim/colony';
import { ASSIST_S, CANNIBALISE_S, LOAD_S, QUEEN_FEED_S, TEND_PILE_RADIUS_BU, TEND_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { navStop } from '@/sim/locomotion';
import { B } from './fsm';

/** Care operations (index stored in ant.bb). */
export const CareOp = { none: 0, loadNurse: 1, loadRation: 2, feedQueen: 3, feedQueenReserve: 4, assist: 5, cannibalise: 6, tendPile: 7 } as const;
export type CareOpId = (typeof CareOp)[keyof typeof CareOp];

const DURATION_S: Record<CareOpId, number> = { 0: 0, 1: LOAD_S, 2: LOAD_S, 3: QUEEN_FEED_S, 4: QUEEN_FEED_S, 5: ASSIST_S, 6: CANNIBALISE_S, 7: TEND_S };
const POSE: Record<CareOpId, string> = { 0: 'walk', 1: 'troph-beg', 2: 'troph-beg', 3: 'troph-give', 4: 'troph-give', 5: 'groom-other', 6: 'feed', 7: 'groom-other' };

/** The colony functions the adapter calls (and only the adapter). */
const careMutators = {
  withdrawFood, feedBrood, feedQueenFromReserve, ecloseBrood, cannibaliseBrood, nurseLoadMix, queenRationMix, tendBroodAt,
};

/** Starts a care operation on a target (brood id, the queen's id, or -1); `amount` is the load or feed size. */
export function startCare(sim: Sim, ant: Ant, op: CareOpId, targetId: number, amount = 0): void {
  if (ant.nav.status === 'moving') navStop(sim, ant);
  ant.bb[B.actOp] = op;
  ant.bb[B.actUntil] = sim.state.tick + secondsToTicks(DURATION_S[op]);
  ant.bb[B.actTarget] = targetId;
  ant.bb['bn.aa'] = amount;
  ant.pose = Math.max(0, (POSES as readonly string[]).indexOf(POSE[op]));
  ant.thinkTick = ant.bb[B.actUntil];
}

export function careRunning(ant: Ant): boolean {
  return (ant.bb[B.actOp] ?? 0) !== CareOp.none;
}

/** Abandons a running care operation (no effect). */
export function cancelCare(ant: Ant): void {
  if (!careRunning(ant)) return;
  ant.bb[B.actOp] = CareOp.none;
  ant.pose = 0;
}

/**
 * Advances a running care operation; at its end applies the effect and returns the loads moved (or 1 / 0 for
 * assist and cannibalise). Returns null while it is still running or when none runs.
 */
export function stepCare(sim: Sim, ant: Ant): number | null {
  const op = (ant.bb[B.actOp] ?? 0) as CareOpId;
  if (op === CareOp.none || sim.state.tick < (ant.bb[B.actUntil] ?? 0)) return null;
  ant.bb[B.actOp] = CareOp.none;
  ant.pose = 0;
  return careEffects.apply(sim, ant, op, ant.bb[B.actTarget] ?? -1, ant.bb['bn.aa'] ?? 0);
}

/** The effect of a finished care operation (in one object so a test double can wrap it; returns loads moved). */
export const careEffects = {
  apply(sim: Sim, ant: Ant, op: CareOpId, target: number, amount: number): number {
    const m = careMutators;
    switch (op) {
      case CareOp.loadNurse:
      case CareOp.loadRation: {
        const mix = op === CareOp.loadNurse ? m.nurseLoadMix(sim, ant.colony, amount) : m.queenRationMix(sim, ant.colony, amount);
        const got = m.withdrawFood(sim, ant.colony, Math.max(0, mix.c), Math.max(0, mix.p), 'transit', ant);
        ant.cropC += got.c;
        ant.cropP += got.p;
        return got.c + got.p;
      }
      case CareOp.feedQueen: {
        const crop = ant.cropC + ant.cropP;
        if (crop <= 1e-9) return 0;
        const n = Math.min(amount, crop);
        const c = (n * ant.cropC) / crop;
        const got = m.feedBrood(sim, ant, -1, c, n - c);
        return got.c + got.p;
      }
      case CareOp.feedQueenReserve:
        return m.feedQueenFromReserve(sim, ant, amount);
      case CareOp.assist:
        return m.ecloseBrood(sim, target, ant.id) ? 1 : 0;
      case CareOp.cannibalise:
        return m.cannibaliseBrood(sim, ant.id, target) ? 1 : 0;
      case CareOp.tendPile:
        return m.tendBroodAt(sim, ant.colony, ant.pos, TEND_PILE_RADIUS_BU * sim.world.bu);
      default:
        return 0;
    }
  },
};
