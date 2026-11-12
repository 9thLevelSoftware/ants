// `nurse` (GDD 02 §10.4): select a job from the nursery board, load food from the pool, feed larvae (chained),
// carry brood to the best chamber for its stage (sorting, rescue, evacuation, move-brood markers), tend egg and
// pupa piles, help pupae eclose, cannibalise under starvation S3, groom when nothing else is to do.

import type { Ant, Behaviour, Brood, Sim, SpeciesDef } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { larvaRemainingNeed, nextCannibalVictim, wantsFeed } from '@/sim/colony';
import { FEED_LARVA_LOADS } from '@/sim/balance/actions';
import { LARVA_GUT_CAP } from '@/sim/balance/colony';
import {
  BROOD_DROP_ARRIVE_BU, CROP_MIN_FEED, FEED_CHAIN_MAX, FEED_CHAIN_RADIUS_BU, GROOM_IDLE_S,
  GROOM_JOB_CHECK_TICKS, LOAD_EMPTY_BACKOFF_S, LOAD_EMPTY_MIN, PRELOAD_BELOW, ROOM_ARRIVE_FRAC,
  ROOM_WAIT_FRAC, TEND_NEAR_BU,
} from '@/sim/balance/nestwork';
import { NURSERY_JOBS } from '@/sim/types';
import { secondsToTicks } from '@/sim/time';
import { claim, freeFor, isCarryJob, Job, nextFeedNear, nextTendNear, selectJob, sortOf } from './board';
import { approach, endCycle, primitiveDone, reachAndAct, recover, releaseAll, think, carryingLoad } from './common';
import { alignedThink, B, bbv, setState } from './fsm';
import { chamberIn, foodChamber, homeNest, pileSlot } from './places';
import { bestChamberId, groupOf } from './sorting';
import { act, actResult, busy, entity, resetTravel, travel, tryAct } from './travel';
import { cancel, interruptible } from '@/sim/ants/actions';
import { perTick } from './perTick';

const ENTRY = 'nurse.select';
/** bb key: 1 = pick-up started, 2 = carrying the job's brood (a put-down then delivers). */
const PICKED = 'bn.pk';
/** bb key: 1 = the carry job's larva is to be fed at the destination (BoardJob.feedAfter). */
const FEED_AFTER = 'bn.fa';
const pile = { x: 0, y: 0, z: 0 };

function crop(ant: Ant): number {
  return ant.cropC + ant.cropP;
}

function def(sim: Sim, ant: Ant): SpeciesDef {
  const col = sim.stores.colonies.get(ant.colony);
  return (col ? sim.getSpecies(col.species) : undefined) ?? sim.species;
}

function jobBrood(sim: Sim, ant: Ant): Brood | undefined {
  return sim.stores.brood.get(bbv(ant, B.jobId));
}

/**
 * End of a feed round, carry or eclosion help: a pile right here that is due for tending is groomed first (the
 * nurse is at it anyway), then the cycle ends (re-evaluation, rest, select).
 */
function roundDone(sim: Sim, ant: Ant): void {
  const pile = nextTendNear(sim, ant, ant.pos, TEND_NEAR_BU * sim.world.bu);
  if (pile && ant.state !== 'nurse.tend') {
    claim(sim, ant, Job.tend, pile.id);
    setState(sim, ant, 'nurse.tend', 'job:tend-pile');
    return;
  }
  endCycle(sim, ant, ENTRY);
}

function select(sim: Sim, ant: Ant): void {
  if (ant.carry.kind !== 'none') { act(sim, ant, 'put-down', null); return; }
  const nest = homeNest(sim, ant);
  if (!nest) return;
  // eggs first (GDD 02 §5.7 S3): no larva while any egg is still there, even one being carried
  const victim = nextCannibalVictim(sim, ant.colony);
  const eggLeft = victim?.stage === 'larva' && sim.stores.brood.list.some((b) => b.alive && b.colony === ant.colony && b.stage === 'egg');
  if (victim && !eggLeft && freeFor(sim, ant, victim.id)) {
    claim(sim, ant, Job.rescue, victim.id); // claim kind only blocks others; the state says what is done
    setState(sim, ant, 'nurse.cannibalise', 'job:cannibalise');
    return;
  }
  const job = selectJob(sim, ant, nest.id, bbv(ant, B.feedBlock) > sim.state.tick);
  if (!job) {
    // nothing to do now: with larvae in the nest, load the crop ahead of the next feed request (a request is
    // then served at once instead of after a trip to the food chamber), else groom
    const larvae = sim.stores.brood.list.some((b) => b.alive && b.colony === ant.colony && b.stage === 'larva');
    if (larvae && crop(ant) < PRELOAD_BELOW && bbv(ant, B.feedBlock) <= sim.state.tick) { setState(sim, ant, 'nurse.load', 'job:feed'); return; }
    setState(sim, ant, 'nurse.groom', 'job:groom');
    return;
  }
  claim(sim, ant, job.kind, job.id, job.dest);
  ant.bb[FEED_AFTER] = job.feedAfter ? 1 : 0;
  const reason = job.marker ? 'marker:move-brood' : `job:${(NURSERY_JOBS as readonly string[])[job.kind] ?? 'nurse'}` as const;
  if (job.kind === Job.feed) setState(sim, ant, crop(ant) < CROP_MIN_FEED ? 'nurse.load' : 'nurse.feed', reason);
  else if (isCarryJob(job.kind)) setState(sim, ant, 'nurse.carry', reason);
  else if (job.kind === Job.assist) setState(sim, ant, 'nurse.assist', reason);
  else setState(sim, ant, 'nurse.tend', reason);
}

function load(sim: Sim, ant: Ant): void {
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; onLoaded(sim, ant, actResult(ant)); return; }
  const nest = homeNest(sim, ant);
  const room = nest ? foodChamber(sim, nest, ant.pos) : undefined;
  if (!room) { recover(sim, ant, ENTRY, 'job:feed'); return; }
  const inside = ant.chamberId === room.id;
  const st = inside ? 'arrived' : travel(sim, ant, entity('chamber', room.id, room.center), ROOM_ARRIVE_FRAC * Math.min(room.radii.x, room.radii.z));
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st !== 'arrived') return;
  // the `load-crop` primitive fills the crop to NURSE_LOAD with the nurse mix (GDD 02 §5.4.2)
  const why = tryAct(sim, ant, 'load-crop', null);
  if (why === 'crop-full') setState(sim, ant, 'nurse.feed');
  else if (why === 'no-reserve') onLoaded(sim, ant, 0);
  else if (why) recover(sim, ant, ENTRY, 'job:feed');
}

function onLoaded(sim: Sim, ant: Ant, got: number): void {
  if (got < LOAD_EMPTY_MIN || crop(ant) < CROP_MIN_FEED) {
    ant.bb[B.feedBlock] = sim.state.tick + secondsToTicks(LOAD_EMPTY_BACKOFF_S);
    endCycle(sim, ant, ENTRY);
    return;
  }
  setState(sim, ant, 'nurse.feed');
}

function feed(sim: Sim, ant: Ant): void {
  let b = jobBrood(sim, ant);
  if (primitiveDone(ant)) {
    ant.bb[B.chain] = bbv(ant, B.chain, 0) + 1;
    ant.bb[B.began] = 0;
    ant.bb[B.n] = 0;
    resetTravel(ant);
    if (crop(ant) < CROP_MIN_FEED || ant.bb[B.chain] >= FEED_CHAIN_MAX) { roundDone(sim, ant); return; }
    // the same larva again while its gut has room for another feed (GDD 02 §5.4.1 "gut space >= 0.1"), else the
    // next requesting larva within FEED_CHAIN_RADIUS_BU
    const again = b && b.stage === 'larva' && b.carriedBy < 0 && LARVA_GUT_CAP - b.gutC - b.gutP >= FEED_LARVA_LOADS
      && larvaRemainingNeed(def(sim, ant), b) > FEED_LARVA_LOADS * 0.5;
    if (!again) {
      const next = nextFeedNear(sim, ant, ant.pos, FEED_CHAIN_RADIUS_BU * sim.world.bu);
      if (!next) { roundDone(sim, ant); return; }
      claim(sim, ant, Job.feed, next.id);
      b = next;
    }
    // on with the next feed in this same think (no idle tick between chained feeds)
  }
  if (!b || b.stage !== 'larva' || b.carriedBy >= 0) { endCycle(sim, ant, ENTRY, 'job:feed'); return; }
  if (crop(ant) < CROP_MIN_FEED) { setState(sim, ant, 'nurse.load'); return; }
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'feed-larva');
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:feed', ant.nav.status === 'failed');
}

/** Destination of a carry job: the claimed chamber if it still exists, else the current best for the group. */
function carryDest(sim: Sim, ant: Ant, b: Brood): number {
  const nest = homeNest(sim, ant);
  if (!nest) return -1;
  const d = bbv(ant, B.jobDest);
  if (d >= 0 && chamberIn(nest, d)) return d;
  const ctx = sortOf(sim, ant.colony, nest.id);
  const best = ctx ? bestChamberId(ctx, groupOf(b)) : -1;
  ant.bb[B.jobDest] = best;
  return best;
}

function carry(sim: Sim, ant: Ant): void {
  const b = jobBrood(sim, ant);
  const nest = homeNest(sim, ant);
  if (!b || !nest) { recover(sim, ant, ENTRY, 'job:move'); return; }
  if (b.carriedBy === ant.id) {
    const dest = carryDest(sim, ant, b);
    const room = dest >= 0 ? chamberIn(nest, dest) : undefined;
    if (!room) { recover(sim, ant, ENTRY, 'job:move'); return; } // puts it down here
    pileSlot(room, groupOf(b), b.id, sim.world.bu, pile);
    const st = ant.chamberId === room.id && Math.hypot(ant.pos.x - pile.x, ant.pos.z - pile.z) < BROOD_DROP_ARRIVE_BU * sim.world.bu
      ? 'arrived' : approach(sim, ant, entity('point', -1, pile), BROOD_DROP_ARRIVE_BU * sim.world.bu, true);
    if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
    ant.bb[PICKED] = 2;
    if (st === 'arrived') act(sim, ant, 'put-down', null);
    return;
  }
  if (primitiveDone(ant) && ant.carry.kind === 'none' && b.carriedBy < 0 && bbv(ant, PICKED, 0) === 2) {
    // put down: delivered
    sim.emit({ type: 'brood-moved', broodId: b.id, fromChamber: bbv(ant, 'bn.from'), toChamber: b.chamberId, reason: 'sort' });
    ant.bb[PICKED] = 0;
    // a hungry larva carried to a better chamber is fed there at once if the crop allows
    if (bbv(ant, FEED_AFTER, 0) === 1 && b.stage === 'larva' && wantsFeed(b, def(sim, ant)) && crop(ant) >= CROP_MIN_FEED) {
      ant.bb[FEED_AFTER] = 0;
      claim(sim, ant, Job.feed, b.id);
      setState(sim, ant, 'nurse.feed', 'job:feed');
      return;
    }
    roundDone(sim, ant);
    return;
  }
  if (b.carriedBy >= 0) { endCycle(sim, ant, ENTRY, 'job:move'); return; } // someone else has it
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; ant.bb[B.n] = bbv(ant, B.n, 0) + 1; } // the pick-up failed
  ant.bb[PICKED] = 0;
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'pick-up');
  if (st === 'started') { ant.bb['bn.from'] = b.chamberId; ant.bb[PICKED] = 1; }
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:move', ant.nav.status === 'failed');
}

/**
 * nurse.tend: groom one item of the pile with the `groom` primitive, which tends the whole pile around that item
 * (every egg and pupa within GROOM_PILE_RADIUS_BU, GDD 02 §10.4).
 */
function tend(sim: Sim, ant: Ant): void {
  const b = jobBrood(sim, ant);
  if (primitiveDone(ant)) {
    ant.bb[B.began] = 0;
    endCycle(sim, ant, ENTRY);
    return;
  }
  if (!b || b.carriedBy >= 0) { endCycle(sim, ant, ENTRY, 'job:tend-pile'); return; }
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'groom');
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:tend-pile', ant.nav.status === 'failed');
}

/** nurse.assist: the `assist-eclosion` primitive at the ready pupa (GDD 02 §2.9). */
function assist(sim: Sim, ant: Ant): void {
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; roundDone(sim, ant); return; }
  const b = jobBrood(sim, ant);
  if (!b || b.stage !== 'pupa' || (b.flags & BroodFlag.READY) === 0 || b.carriedBy >= 0) { endCycle(sim, ant, ENTRY, 'job:assist-eclosion'); return; }
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'assist-eclosion');
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:assist-eclosion', ant.nav.status === 'failed');
}

/** nurse.cannibalise: the `cannibalise` primitive on the chosen egg or larva (GDD 02 §5.7 S3). */
function cannibalise(sim: Sim, ant: Ant): void {
  if (primitiveDone(ant)) { ant.bb[B.began] = 0; roundDone(sim, ant); return; }
  const b = jobBrood(sim, ant);
  if (!b || b.carriedBy >= 0 || b.stage === 'pupa') { endCycle(sim, ant, ENTRY); return; }
  const st = reachAndAct(sim, ant, entity('brood', b.id, b.pos), 'cannibalise');
  if (st === 'failed') recover(sim, ant, ENTRY, 'job:cannibalise', ant.nav.status === 'failed');
}

/** The chamber holding most of the colony's lying larvae this tick (where an idle nurse waits), -1 none. */
function larvaChamber(sim: Sim, colonyId: number): number {
  return perTick(sim, `larvaRoom:${colonyId}`, () => {
    const n = new Map<number, number>();
    for (const b of sim.stores.brood.list) {
      if (b.alive && b.colony === colonyId && b.stage === 'larva' && b.carriedBy < 0 && b.chamberId >= 0) n.set(b.chamberId, (n.get(b.chamberId) ?? 0) + 1);
    }
    let best = -1, bestN = 0;
    for (const [id, k] of n) if (k > bestN || (k === bestN && id < best)) { best = id; bestN = k; }
    return best;
  });
}

/** nurse.groom: nothing to do; wait by the larvae (so the next request is near) and groom. */
function groom(sim: Sim, ant: Ant): void {
  if (ant.state !== 'nurse.groom') return;
  const nest = homeNest(sim, ant);
  const room = nest ? chamberIn(nest, larvaChamber(sim, ant.colony)) : undefined;
  if (room && ant.chamberId !== room.id && bbv(ant, B.began, 0) === 0) {
    if (travel(sim, ant, entity('chamber', room.id, room.center), ROOM_WAIT_FRAC * Math.min(room.radii.x, room.radii.z)) !== 'failed') return;
  }
  const age = sim.state.tick - ant.stateTick;
  if (primitiveDone(ant) || bbv(ant, B.began, 0) === 0) {
    if (age >= secondsToTicks(GROOM_IDLE_S)) { endCycle(sim, ant, ENTRY); return; }
    if (bbv(ant, B.began, 0) === 0 && act(sim, ant, 'groom', null)) alignedThink(sim, ant, GROOM_JOB_CHECK_TICKS);
  }
}

/**
 * Grooming is what a nurse does while nothing else is to do: a job appearing on the board (or a cannibalism
 * victim in S3) ends it at once. Checked every GROOM_JOB_CHECK_TICKS while the groom primitive runs.
 */
function groomInterrupted(sim: Sim, ant: Ant): boolean {
  if (ant.state !== 'nurse.groom') return false;
  const nest = homeNest(sim, ant);
  if (!nest || (!nextCannibalVictim(sim, ant.colony) && !selectJob(sim, ant, nest.id, bbv(ant, B.feedBlock) > sim.state.tick))) {
    if (busy(ant)) alignedThink(sim, ant, GROOM_JOB_CHECK_TICKS);
    return false;
  }
  if (busy(ant)) { if (!interruptible(ant)) return false; cancel(sim, ant, null); }
  setState(sim, ant, ENTRY, 'job:groom');
  return true;
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'nurse.load': return load(sim, ant);
    case 'nurse.feed': return feed(sim, ant);
    case 'nurse.carry': return carry(sim, ant);
    case 'nurse.tend': return tend(sim, ant);
    case 'nurse.assist': return assist(sim, ant);
    case 'nurse.cannibalise': return cannibalise(sim, ant);
    case 'nurse.groom': return groom(sim, ant);
    default: return select(sim, ant);
  }
}

export const nurseBehaviour: Behaviour = {
  task: 'nurse',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => {
    if (groomInterrupted(sim, ant)) return;
    think(sim, ant, ENTRY, step);
  },
  exit: (sim, ant) => releaseAll(sim, ant),
  delivering: carryingLoad,
};
