// Care primitives of the nest economy (GDD 02 §2.9, §5.3, §5.4.1-5.4.2, §5.7), usable by the AI and the possessed ant:
//   load-crop        pool -> crop at a food chamber or touching a store ant: nurse mix, queen ration or departure
//                    ration (by task), at LOAD_RATE up to the load's cap and the ant's own crop capacity
//   unload-crop      crop -> pool, straight into a food chamber at half the trophallaxis rate (no receiver)
//   feed-queen       carer crop (or, secondary, the carer's own reserve from starvation S2 on) -> queen gut, one feed
//   assist-eclosion  open the cocoon of a ready pupa: the adult ecloses
//   cannibalise      eat an egg or a larva (starvation S3 only); the colony recycles it
// The effects are the colony module's (through ports). GDD 01 §7.3 gives no pose rows for these: each uses the
// closest existing pose (recorded in the sim-fix-ants report).

import type { Ant, Chamber, Colony, Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { LOAD_POOL_MIN, TROPH_DONOR_MIN, TROPH_RATE, UNLOAD_DIRECT_RATE_MULT } from '@/sim/balance/actions';
import { QUEEN_GUT_CAP, QUEEN_RATION_BASE } from '@/sim/balance/colony';
import { DEPART_RATION_C } from '@/sim/balance/foraging';
import {
  ASSIST_S, CANNIBALISE_S, CARER_KEEP_RESERVE, LOAD_RATE, LOAD_S, NURSE_LOAD, QUEEN_FEED_LOADS, QUEEN_FEED_S,
} from '@/sim/balance/nestwork';
import { inReach, placeOf, type TargetPlace } from '../geometry';
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

/** The crop a load fills up to: the load's own cap, never more than the ant's crop holds (small workers). */
function loadCap(ant: Ant, k: LoadKind): number {
  return Math.min(LOAD_CAP[k], ant.cropCap);
}

/** What the pool can give this load: the departure ration is C only. */
function poolFor(col: Colony, k: LoadKind): number {
  return k === 'depart' ? col.stores.c : col.stores.c + col.stores.p;
}

/** Loads this ant would take now (crop room up to the cap, limited by the pool). */
function loadWanted(sim: Sim, ant: Ant): number {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return 0;
  const k = loadKind(ant);
  return Math.max(0, Math.min(loadCap(ant, k) - cropOf(ant), poolFor(col, k)));
}

const near: number[] = [];
const storePlace: TargetPlace = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };

/** A nestmate on the `store` task within mandible reach, in the nest (GDD 02 §5.4.1 "or touching a store ant"). */
function touchingStoreAnt(sim: Sim, ant: Ant): boolean {
  if (ant.nestId < 0) return false;
  near.length = 0;
  sim.index.queryAnts(ant.pos, 2 * ant.lengthBu * sim.world.bu, near);
  for (const id of near) {
    const o = sim.stores.ants.get(id);
    if (!o || o.id === ant.id || !o.alive || o.colony !== ant.colony || o.task !== 'store' || o.nestId !== ant.nestId) continue;
    if (placeOf(sim, ant, { kind: 'ant', id: o.id, pos: o.pos }, storePlace) && inReach(sim, ant, storePlace)) return true;
  }
  return false;
}

export const loadCropDef: ActionDef = {
  id: 'load-crop', kind: 'timed', targets: ['none'], cancellable: true, pose: 'drink', cue: 'trophallaxis',
  who: (_sim, ant) => isWorker(ant),
  check(sim, ant) {
    if (!foodPlace(sim, ant) && !touchingStoreAnt(sim, ant)) return 'not-allowed-here';
    const col = sim.stores.colonies.get(ant.colony);
    if (!col) return 'no-target';
    const k = loadKind(ant);
    if (cropOf(ant) >= loadCap(ant, k) - EPS) return 'crop-full';
    return poolFor(col, k) >= LOAD_POOL_MIN ? null : 'no-reserve';
  },
  // 0.1 load/s (GDD 02 §5.4.1): a full nurse load takes LOAD_S, a top-up or a departure ration less
  durationS: (sim, ant) => Math.min(LOAD_S, loadWanted(sim, ant) / LOAD_RATE),
  // The crop is filled up to the load's cap with its mix; the pool books it as `transit` (nurse, carer) or as the
  // departure ration (`ration`, C only).
  effect(sim, ant) {
    const k = loadKind(ant);
    const want = Math.max(0, loadCap(ant, k) - cropOf(ant));
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

/**
 * The worker -> queen reserve transfer is a starvation measure (GDD 02 §5.7 S2 `rationing`, §10.5 `queen-care.load`):
 * allowed from S2 on (S3 and S4 keep the S2 rules), never in a fed or lean colony.
 */
export function reserveFeedAllowed(col: Colony | undefined): boolean {
  const s = col?.starvationStage;
  return s === 'rationing' || s === 'brood-sacrifice' || s === 'adult-starvation';
}

/** The colony's queen when the target is her. */
function queenTarget(sim: Sim, ant: Ant, id: number): Ant | null {
  const q = sim.stores.ants.get(id);
  return q && q.colony === ant.colony && q.caste === 'queen' && q.queen ? q : null;
}

export const feedQueenDef: ActionDef = {
  id: 'feed-queen', kind: 'timed', targets: ['ant'], cancellable: true, pose: 'troph-give', cue: 'trophallaxis',
  who: (_sim, ant) => isWorker(ant),
  // secondary (`opts.secondary`): from the carer's own fat reserve, which the colony allows from starvation S2 on
  check(sim, ant, t, secondary) {
    const q = queenTarget(sim, ant, t.id);
    if (!q || q.id === ant.id) return 'no-target';
    if (QUEEN_GUT_CAP - q.queen!.gut.c - q.queen!.gut.p <= EPS) return 'crop-full';
    if (secondary) {
      if (!reserveFeedAllowed(sim.stores.colonies.get(ant.colony))) return 'conditions';
      return ant.energy > CARER_KEEP_RESERVE + EPS ? null : 'no-reserve';
    }
    return cropOf(ant) > EPS ? null : 'crop-empty';
  },
  durationS: () => QUEEN_FEED_S,
  effect(sim, ant, t) {
    const q = queenTarget(sim, ant, t.id);
    if (!q) return 'no-target';
    if (ant.action?.secondary) {
      // the stage may have eased during the feed: then nothing is taken from the carer's body
      if (!reserveFeedAllowed(sim.stores.colonies.get(ant.colony))) return 'conditions';
      return ports.feedQueenFromReserve(sim, ant, Math.min(QUEEN_FEED_LOADS, ant.energy - CARER_KEEP_RESERVE));
    }
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
