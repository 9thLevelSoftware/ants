// Care primitives of the nest economy (GDD 02 §2.9, §5.3, §5.4.1-5.4.2, §5.7), usable by the AI and the possessed ant:
//   load-crop        pool -> crop at a food chamber: nurse mix, queen ration or departure ration (by task)
//   unload-crop      crop -> pool, straight into a food chamber at half the trophallaxis rate (no receiver)
//   feed-queen       carer crop (or, secondary, the carer's own reserve in S2) -> queen gut, one feed
//   assist-eclosion  open the cocoon of a ready pupa: the adult ecloses
//   cannibalise      eat an egg or a larva (starvation S3 only); the colony recycles it
// The effects are the colony module's (through ports). GDD 01 §7.3 gives no pose rows for these: each uses the
// closest existing pose (recorded in the sim-fix-ants report).

import type { Ant, Chamber, Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { LOAD_POOL_MIN, TROPH_DONOR_MIN, TROPH_RATE, UNLOAD_DIRECT_RATE_MULT } from '@/sim/balance/actions';
import { QUEEN_GUT_CAP, QUEEN_RATION_BASE } from '@/sim/balance/colony';
import { DEPART_RATION_C } from '@/sim/balance/foraging';
import { ASSIST_S, CANNIBALISE_S, CARER_KEEP_RESERVE, LOAD_S, NURSE_LOAD, QUEEN_FEED_LOADS, QUEEN_FEED_S } from '@/sim/balance/nestwork';
import { ports } from '../ports';
import type { ActionDef } from '../types';

const EPS = 1e-9;

function cropOf(a: Ant): number {
  return a.cropC + a.cropP;
}

/** Adult workers of any size class (not queens, gynes or males). */
function isWorker(ant: Ant): boolean {
  return ant.caste !== 'queen' && ant.caste !== 'gyne' && ant.caste !== 'male';
}

/** p lies in the chamber: inside its floor ellipse (radii x 1.2) and its height band (+ 1 BU). */
function inChamber(c: Chamber, p: { x: number; y: number; z: number }, bu: number): boolean {
  const dx = (p.x - c.center.x) / (1.2 * c.radii.x), dz = (p.z - c.center.z) / (1.2 * c.radii.z);
  return dx * dx + dz * dz <= 1 && Math.abs(p.y - c.center.y) <= c.radii.y + bu;
}

/**
 * The chamber the ant stands in, if it is where food is stored: a `food` chamber, or any when the nest has none.
 * The test is geometric (the ant's chamberId uses the ellipsoid, which a walker on a flat floor near the rim leaves).
 */
function foodPlace(sim: Sim, ant: Ant): Chamber | null {
  const nest = ant.nestId >= 0 ? sim.stores.nests.get(ant.nestId) : undefined;
  if (!nest) return null;
  const anyFood = nest.chambers.some((c) => c.type === 'food');
  for (const c of nest.chambers) {
    if ((c.type === 'food' || !anyFood) && (c.id === ant.chamberId || inChamber(c, ant.pos, sim.world.bu))) return c;
  }
  return null;
}

/** Which load an ant takes (GDD 02 §5.4.2): queen carers the queen's ration, foragers their departure ration. */
type LoadKind = 'nurse' | 'ration' | 'depart';

function loadKind(ant: Ant): LoadKind {
  if (ant.task === 'queen-care') return 'ration';
  return ant.task === 'forage' || ant.task === 'scout' || ant.task === 'tend' ? 'depart' : 'nurse';
}

const LOAD_CAP: Record<LoadKind, number> = { nurse: NURSE_LOAD, ration: QUEEN_RATION_BASE, depart: DEPART_RATION_C };

export const loadCropDef: ActionDef = {
  id: 'load-crop', kind: 'timed', targets: ['none'], cancellable: true, pose: 'drink', cue: 'trophallaxis',
  who: (_sim, ant) => isWorker(ant),
  check(sim, ant) {
    if (!foodPlace(sim, ant)) return 'not-allowed-here';
    const col = sim.stores.colonies.get(ant.colony);
    if (!col) return 'no-target';
    if (cropOf(ant) >= LOAD_CAP[loadKind(ant)] - EPS) return 'crop-full';
    const k = loadKind(ant);
    const enough = k === 'depart' ? col.stores.c >= LOAD_POOL_MIN : col.stores.c + col.stores.p >= LOAD_POOL_MIN;
    return enough ? null : 'no-reserve';
  },
  durationS: () => LOAD_S,
  // The crop is filled up to the load's cap with its mix; the pool books it as `transit` (nurse, carer) or as the
  // departure ration (`ration`, C only).
  effect(sim, ant) {
    const k = loadKind(ant);
    const want = Math.max(0, LOAD_CAP[k] - cropOf(ant));
    const mix = k === 'nurse' ? ports.nurseLoadMix(sim, ant.colony, want)
      : k === 'ration' ? ports.queenRationMix(sim, ant.colony, want) : { c: want, p: 0 };
    const got = ports.withdrawFood(sim, ant.colony, Math.max(0, mix.c), Math.max(0, mix.p), k === 'depart' ? 'ration' : 'transit', ant);
    ant.cropC += got.c;
    ant.cropP += got.p;
    return got.c + got.p;
  },
};

export const unloadCropDef: ActionDef = {
  id: 'unload-crop', kind: 'continuous', targets: ['none'], cancellable: true, pose: 'troph-give', cue: 'trophallaxis',
  who: (_sim, ant) => isWorker(ant),
  check(sim, ant) {
    if (!foodPlace(sim, ant)) return 'not-allowed-here';
    return cropOf(ant) <= TROPH_DONOR_MIN + EPS ? 'crop-empty' : null;
  },
  durationS: () => 0,
  // Half the trophallaxis rate into the pool (booked `in.delivery` by the colony), in crop proportion; ends when the
  // crop is down to TROPH_DONOR_MIN or the pool takes nothing more (stores full).
  tick(sim, ant, _t, dt) {
    const crop = cropOf(ant);
    const n = Math.min(TROPH_RATE * UNLOAD_DIRECT_RATE_MULT * dt, crop - TROPH_DONOR_MIN);
    if (n <= EPS) return 'done';
    const got = ports.depositFood(sim, ant.colony, (n * ant.cropC) / crop, (n * ant.cropP) / crop);
    ant.cropC = Math.max(0, ant.cropC - got.c);
    ant.cropP = Math.max(0, ant.cropP - got.p);
    const moved = got.c + got.p;
    ant.bb['act.moved'] = (ant.bb['act.moved'] ?? 0) + moved;
    return moved <= EPS || cropOf(ant) <= TROPH_DONOR_MIN + EPS ? 'done' : 'continue';
  },
};

/** The colony's queen when the target is her. */
function queenTarget(sim: Sim, ant: Ant, id: number): Ant | null {
  const q = sim.stores.ants.get(id);
  return q && q.colony === ant.colony && q.caste === 'queen' && q.queen ? q : null;
}

export const feedQueenDef: ActionDef = {
  id: 'feed-queen', kind: 'timed', targets: ['ant'], cancellable: true, pose: 'troph-give', cue: 'trophallaxis',
  who: (_sim, ant) => isWorker(ant),
  // secondary (`opts.secondary`): from the carer's own fat reserve, which the colony allows in starvation S2
  check(sim, ant, t, secondary) {
    const q = queenTarget(sim, ant, t.id);
    if (!q || q.id === ant.id) return 'no-target';
    if (QUEEN_GUT_CAP - q.queen!.gut.c - q.queen!.gut.p <= EPS) return 'crop-full';
    if (secondary) return ant.energy > CARER_KEEP_RESERVE + EPS ? null : 'no-reserve';
    return cropOf(ant) > EPS ? null : 'crop-empty';
  },
  durationS: () => QUEEN_FEED_S,
  effect(sim, ant, t) {
    const q = queenTarget(sim, ant, t.id);
    if (!q) return 'no-target';
    if (ant.action?.secondary) return ports.feedQueenFromReserve(sim, ant, Math.min(QUEEN_FEED_LOADS, ant.energy - CARER_KEEP_RESERVE));
    const crop = cropOf(ant);
    if (crop <= EPS) return 'crop-empty';
    const n = Math.min(QUEEN_FEED_LOADS, crop);
    const c = (n * ant.cropC) / crop;
    const got = ports.feedBrood(sim, ant, -1, c, n - c);
    return got.c + got.p;
  },
};

export const assistEclosionDef: ActionDef = {
  id: 'assist-eclosion', kind: 'timed', targets: ['brood'], cancellable: true, pose: 'tear', cue: 'eclosion',
  who: (_sim, ant) => isWorker(ant) || ant.caste === 'queen',
  check(sim, ant, t) {
    const b = sim.stores.brood.get(t.id);
    if (!b || b.colony !== ant.colony || b.stage !== 'pupa' || (b.flags & BroodFlag.READY) === 0 || b.carriedBy >= 0) return 'no-target';
    return null;
  },
  durationS: () => ASSIST_S,
  effect: (sim, ant, t) => (ports.ecloseBrood(sim, t.id, ant.id) ? 1 : 'no-target'),
};

export const cannibaliseDef: ActionDef = {
  id: 'cannibalise', kind: 'timed', targets: ['brood'], cancellable: true, pose: 'tear', cue: null,
  who: (_sim, ant) => isWorker(ant),
  check(sim, ant, t) {
    const b = sim.stores.brood.get(t.id);
    if (!b || b.colony !== ant.colony || b.carriedBy >= 0 || (b.stage !== 'egg' && b.stage !== 'larva')) return 'no-target';
    const col = sim.stores.colonies.get(ant.colony);
    // GDD 02 §5.7: brood is eaten only from starvation stage S3 on
    return col && (col.starvationStage === 'brood-sacrifice' || col.starvationStage === 'adult-starvation') ? null : 'conditions';
  },
  durationS: () => CANNIBALISE_S,
  effect: (sim, ant, t) => (ports.cannibaliseBrood(sim, ant.id, t.id) ? 1 : 'no-target'),
};
