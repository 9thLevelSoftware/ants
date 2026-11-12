// harvest-liquid, harvest-solid, trophallaxis-give / -receive, lay-trail (GDD 01 §7.3, GDD 02 §5.3-5.4).

import type { Ant, Sim, TargetRef } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  DRINK_RATE, TEAR_S, TROPH_ACCEPT_FRAC, TROPH_DONOR_MIN, TROPH_HUNGRY_C, TROPH_MAX_S, TROPH_POOL_DAYS_MIN,
  TROPH_POOL_MAX, TROPH_RATE,
} from '@/sim/balance/actions';
import { spawnItem } from '@/sim/entities';
import { handsFree, takeItem } from '../carry';
import { inReach, placeOf } from '../geometry';
import { ports } from '../ports';
import { isLiquidSource, isTearSource } from '../sourceKinds';
import type { ActionDef } from '../types';
import { isPossessed } from '../workRate';

const EPS = 1e-12;

function cropOf(a: Ant): number {
  return a.cropC + a.cropP;
}

function cropSpace(a: Ant): number {
  return Math.max(0, a.cropCap - cropOf(a));
}

/** Loads moved so far by the running continuous action (reported as its result). */
function addMoved(ant: Ant, amount: number): void {
  ant.bb['act.moved'] = (ant.bb['act.moved'] ?? 0) + amount;
}

function knowSource(sim: Sim, ant: Ant, sourceId: number): void {
  ant.mem.knownSourceId = sourceId;
  ports.discoverSource(sim, ant.colony, sourceId, ant.id);
}

export const harvestLiquidDef: ActionDef = {
  id: 'harvest-liquid', kind: 'continuous', targets: ['source'], cancellable: true, pose: 'drink', cue: null,
  check(sim, ant, t) {
    const s = sim.stores.sources.get(t.id);
    if (!s || s.units <= 0) return 'no-target';
    if (!isLiquidSource(s)) return 'not-allowed-here';
    return cropSpace(ant) <= EPS ? 'crop-full' : null;
  },
  durationS: () => 0,
  onBegin: (sim, ant, t) => knowSource(sim, ant, t.id),
  // Crop += DRINK_RATE x drinkRateMult per game s (x workRate), the source loses the same (owner: ecology harvest).
  tick(sim, ant, t, dt) {
    const s = sim.stores.sources.get(t.id);
    if (!s) return 'no-target';
    const want = Math.min(DRINK_RATE * s.drinkRateMult * dt, cropSpace(ant));
    if (want <= EPS) return 'done';
    const got = ports.harvest(sim, ant, s.id, want);
    const n = got.c + got.p;
    ant.cropC += got.c;
    ant.cropP += got.p;
    addMoved(ant, n);
    return n <= EPS || cropSpace(ant) <= EPS ? 'done' : 'continue';
  },
};

export const harvestSolidDef: ActionDef = {
  id: 'harvest-solid', kind: 'timed', targets: ['source'], cancellable: true, pose: 'tear', cue: null,
  check(sim, ant, t) {
    const s = sim.stores.sources.get(t.id);
    if (!s || s.units <= 0) return 'no-target';
    if (!isTearSource(s)) return 'not-allowed-here';
    return handsFree(ant) ? null : 'hands-full';
  },
  durationS: (sim, _ant, t) => TEAR_S * (sim.stores.sources.get(t.id)?.hardness ?? 1),
  // One piece of carryCap loads in the mandibles, of the source's profile; the source loses the same.
  effect(sim, ant, t) {
    const s = sim.stores.sources.get(t.id);
    if (!s || !handsFree(ant)) return 'no-target';
    const units = Math.min(s.units, ant.carryCap / Math.max(s.unitBulk, 1e-6));
    const got = ports.harvest(sim, ant, s.id, units);
    if (got.c + got.p <= EPS) return 'no-target';
    const piece = spawnItem(sim, {
      kind: 'food-piece', pos: ant.pos,
      init: {
        c: got.c, p: got.p, bulk: Math.min(ant.carryCap, units * s.unitBulk), foodKind: s.kind, variant: s.variant,
        hardness: s.hardness,
      },
    });
    takeItem(ant, piece);
    knowSource(sim, ant, s.id);
    return got.c + got.p;
  },
};

/** Both in the nest: crop food enters the colony pool (GDD 02 §5.4.1 "in nest: amount enters pool"). */
function poolRoute(donor: Ant, receiver: Ant): boolean {
  return donor.nestId >= 0 && receiver.nestId >= 0;
}

const place = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };

function stillFacing(sim: Sim, ant: Ant, t: TargetRef): boolean {
  const p = placeOf(sim, ant, t, place);
  return p !== null && inReach(sim, ant, p);
}

/** Moves up to `amount` from the donor's crop to the receiver's (or the pool), in donor proportion; returns it. */
function transfer(sim: Sim, donor: Ant, receiver: Ant, amount: number): number {
  const crop = cropOf(donor);
  if (amount <= EPS || crop <= EPS) return 0;
  let c = (amount * donor.cropC) / crop;
  let p = amount - c;
  if (poolRoute(donor, receiver)) {
    const got = ports.depositFood(sim, donor.colony, c, p);
    c = got.c; p = got.p;
  } else {
    receiver.cropC += c;
    receiver.cropP += p;
  }
  donor.cropC = Math.max(0, donor.cropC - c);
  donor.cropP = Math.max(0, donor.cropP - p);
  return c + p;
}

function nestmateCheck(sim: Sim, ant: Ant, t: TargetRef): Ant | 'no-target' | 'not-allowed-here' {
  const other = sim.stores.ants.get(t.id);
  if (!other || other.id === ant.id) return 'no-target';
  return other.colony === ant.colony ? other : 'not-allowed-here';
}

function endTroph(sim: Sim, donorId: number, receiverId: number, ant: Ant): void {
  const amount = ant.bb['act.moved'] ?? 0;
  if (amount > 0) sim.emit({ type: 'trophallaxis', donorId, receiverId, amount, ambient: false });
}

export const trophGiveDef: ActionDef = {
  id: 'trophallaxis-give', kind: 'continuous', targets: ['ant'], cancellable: true, pose: 'troph-give',
  cue: 'trophallaxis',
  check(sim, ant, t) {
    const r = nestmateCheck(sim, ant, t);
    if (typeof r === 'string') return r;
    if (cropOf(ant) <= TROPH_DONOR_MIN) return 'crop-empty';
    return !poolRoute(ant, r) && cropSpace(r) <= EPS ? 'crop-full' : null;
  },
  durationS: () => TROPH_MAX_S,
  // Rate TROPH_RATE until the donor is down to TROPH_DONOR_MIN, the receiver is full, or either moves away.
  tick(sim, ant, t, dt) {
    const r = sim.stores.ants.get(t.id);
    if (!r) return 'no-target';
    if (!stillFacing(sim, ant, t)) return 'done';
    const room = poolRoute(ant, r) ? Infinity : cropSpace(r);
    const n = transfer(sim, ant, r, Math.min(TROPH_RATE * dt, cropOf(ant) - TROPH_DONOR_MIN, room));
    addMoved(ant, n);
    return n <= EPS ? 'done' : 'continue';
  },
  onEnd: (sim, ant, t) => endTroph(sim, ant.id, t.id, ant),
};

/** Days of carbohydrate the colony pool covers at its current need. */
function poolDaysC(sim: Sim, colonyId: number): number {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return 0;
  return col.needs.rateC > EPS ? col.stores.c / col.needs.rateC : col.stores.c > EPS ? Infinity : 0;
}

/** Whether an AI donor accepts a beg (GDD 01 §7.3 refined by GDD 02 §5.4.1). The possessed ant is asked by prompt. */
function begAccepted(sim: Sim, beggar: Ant, donor: Ant): boolean {
  if (isPossessed(donor)) return false;
  if (poolRoute(donor, beggar)) return poolDaysC(sim, beggar.colony) >= TROPH_POOL_DAYS_MIN || beggar.cropC < TROPH_HUNGRY_C;
  return cropOf(donor) > TROPH_ACCEPT_FRAC * donor.cropCap || beggar.caste === 'queen';
}

/** Takes up to `amount` from the colony pool into the beggar's crop, in pool proportion; returns it. */
function fromPool(sim: Sim, beggar: Ant, amount: number): number {
  const col = sim.stores.colonies.get(beggar.colony);
  if (!col || amount <= EPS) return 0;
  const total = col.stores.c + col.stores.p;
  if (total <= EPS) return 0;
  const got = ports.withdrawFood(sim, col.id, (amount * col.stores.c) / total, (amount * col.stores.p) / total);
  beggar.cropC += got.c;
  beggar.cropP += got.p;
  return got.c + got.p;
}

export const trophReceiveDef: ActionDef = {
  id: 'trophallaxis-receive', kind: 'continuous', targets: ['ant'], cancellable: true, pose: 'troph-beg',
  cue: 'trophallaxis',
  check(sim, ant, t) {
    const d = nestmateCheck(sim, ant, t);
    if (typeof d === 'string') return d;
    if (cropSpace(ant) <= EPS) return 'crop-full';
    if (!poolRoute(d, ant) && cropOf(d) <= TROPH_DONOR_MIN) return 'crop-empty';
    return begAccepted(sim, ant, d) ? null : 'blocked';
  },
  durationS: () => TROPH_MAX_S,
  tick(sim, ant, t, dt) {
    const d = sim.stores.ants.get(t.id);
    if (!d) return 'no-target';
    if (!stillFacing(sim, ant, t)) return 'done';
    const want = Math.min(TROPH_RATE * dt, cropSpace(ant));
    let n: number;
    if (poolRoute(d, ant)) n = fromPool(sim, ant, Math.min(want, TROPH_POOL_MAX - (ant.bb['act.moved'] ?? 0)));
    else n = transfer(sim, d, ant, Math.min(want, cropOf(d) - TROPH_DONOR_MIN));
    addMoved(ant, n);
    return n <= EPS ? 'done' : 'continue';
  },
  onEnd: (sim, ant, t) => endTroph(sim, t.id, ant.id, ant),
};

export const layTrailDef: ActionDef = {
  id: 'lay-trail', kind: 'instant', targets: ['none'], concurrent: true, cancellable: false, pose: 'trail-dab',
  cue: null,
  check: () => null,
  durationS: () => 0,
  // Toggles TRAIL_ON; the deposits per BU walked are made by the action system (trail.ts).
  effect(sim, ant) {
    const on = (ant.flags & AntFlag.TRAIL_ON) === 0;
    setTrailFlag(sim, ant, on);
    return on ? 1 : 0;
  },
};

/** Sets the trail flag and reports it (`trail-toggled`) when it changed. */
export function setTrailFlag(sim: Sim, ant: Ant, on: boolean): void {
  const was = (ant.flags & AntFlag.TRAIL_ON) !== 0;
  if (was === on) return;
  ant.flags = on ? ant.flags | AntFlag.TRAIL_ON : ant.flags & ~AntFlag.TRAIL_ON;
  ant.bb['act.trailDist'] = 0;
  sim.emit({ type: 'trail-toggled', antId: ant.id, on });
}
