// In-nest phases of the outdoor tasks: waiting for activation (GDD 02 §6.6 forage.wait), resting (§1.7), the
// departure ration (§1.4) and unloading (§5.3 forage.deliver / scout.report), which ends the trip: delivery
// statistics, recruitment contacts (colony.recordForagerReturn), route learning and the task re-evaluation.

import type { Ant, Marker, ReasonCode, Sim } from '@/sim/types';
import { AntFlag, FOOD_KINDS } from '@/sim/types';
import { REST_ENTER, REST_EXIT } from '@/sim/balance';
import { CROP_RETURN_MIN, TROPH_DONOR_MIN } from '@/sim/balance/actions';
import {
  DELIVER_MAX_S, DEPART_RATION_C, FOOD_ROOM_ARRIVE_BU, GIVE_REACH_L, RATION_MAX_S, RATION_POOL_MIN_C, RATION_SEARCH_BU,
  RECEIVER_ARRIVE_L, RECEIVER_SEARCH_BU, RECEIVER_SEARCH_WIDE_BU, RECEIVER_STORE_BONUS_BU, RECEIVER_TRY_S, REST_MAX_S,
  SUCCESS_CROP, THINK_WAIT_TICKS, UNLOAD_CROP_MARGIN, UNLOAD_MAX_WAIT_S, UNLOAD_RETRY_S, UNLOAD_SEARCH_S,
  WAIT_REEVAL_S, WAIT_SPREAD_BU,
} from '@/sim/balance/foraging';
import { begin, canDo, stopAction } from '@/sim/ants/actions';
import { recordForagerReturn, shouldDepart, taskCycleDone } from '@/sim/colony';
import { navToTarget } from '@/sim/locomotion';
import { TICKS_PER_SECOND } from '@/sim/time';
import { bookDelivery } from './adapters';
import { chooseSource, departFilter } from './choice';
import { entranceChamber, foodChamber, homeNest, logDecision, phaseS, setPhase, thinkIn } from './common';
import type { Flavour } from './flavours';
import { K, PHASE, UNLOAD } from './keys';
import { arrived, goToChamber, moving, stop } from './nav';
import { commitRoute, forgetStaleRoutes } from './routes';
import { startDepart } from './phaseScout';
import { homePlanner, resumeOutboundNav, startDeliver, startOutbound, startRest, startReturn, startWait } from './transitions';

const EPS = 1e-6;
const ids: number[] = [];

function sinceS(sim: Sim, tick: number): number {
  return (sim.state.tick - tick) / TICKS_PER_SECOND;
}

/** An open forage marker of the colony for a forager with nothing to go to (GDD 02 §12.2), or undefined. */
function forageMarker(sim: Sim, ant: Ant): Marker | undefined {
  let best: Marker | undefined, bd = Infinity;
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'forage' || m.colony !== ant.colony) continue;
    const d = Math.hypot(m.pos.x - ant.pos.x, m.pos.z - ant.pos.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

export function updateWait(sim: Sim, ant: Ant, fl: Flavour): void {
  thinkIn(sim, ant, THINK_WAIT_TICKS);
  if (ant.nestId < 0) { startReturn(sim, ant, fl, ant.cropC + ant.cropP >= SUCCESS_CROP, 'job:home'); return; }
  if (ant.fatigue >= REST_ENTER) { startRest(sim, ant, fl, 'fatigue'); return; }
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(nest) : undefined;
  if (room && ant.chamberId !== room.id && !moving(ant)) goToChamber(sim, ant, room, WAIT_SPREAD_BU);
  forgetStaleRoutes(sim, ant);
  const why = shouldDepart(sim, ant, THINK_WAIT_TICKS);
  if (why) {
    const src = chooseSource(sim, ant, departFilter(sim, ant, fl));
    const s = src >= 0 ? sim.stores.sources.get(src) : undefined;
    if (s) { startOutbound(sim, ant, fl, s.id, s.pos, -1, why, s.id); return; }
    const m = forageMarker(sim, ant);
    if (m) { startOutbound(sim, ant, fl, -1, m.pos, m.id, 'marker:forage', m.id); return; }
    // nothing known to go to: let the allocator decide (usually scout demand, GDD 02 §10.2)
    logDecision(sim, ant, why, -1);
    if (taskCycleDone(sim, ant) !== fl.task) return;
  }
  if (phaseS(sim, ant) > WAIT_REEVAL_S) {
    if (taskCycleDone(sim, ant) !== fl.task) return;
    setPhase(sim, ant, fl.names, PHASE.wait, 'timeout');
    ant.stateTick = sim.state.tick; // a new wait (the state name is unchanged)
  }
}

export function updateRest(sim: Sim, ant: Ant, fl: Flavour): void {
  thinkIn(sim, ant, THINK_WAIT_TICKS);
  if (ant.nestId < 0) { startReturn(sim, ant, fl, ant.cropC + ant.cropP >= SUCCESS_CROP, 'fatigue'); return; }
  if (moving(ant)) stop(sim, ant);
  if (ant.fatigue > REST_EXIT && phaseS(sim, ant) < REST_MAX_S) return;
  if (ant.carry.kind === 'item' || ant.cropC + ant.cropP > TROPH_DONOR_MIN + UNLOAD_CROP_MARGIN) { startDeliver(sim, ant, fl); return; }
  if (fl.scout) startDepart(sim, ant, fl, 'fatigue');
  else startWait(sim, ant, fl, 'fatigue');
}

// ---- departure ration (outbound, still inside) ----

/** Receivers already taken this tick: ants some other ant is unloading to or begging from (runtime cache). */
const claimCache = new WeakMap<Sim, { tick: number; ids: Set<number> }>();

function claimedSet(sim: Sim): Set<number> {
  let c = claimCache.get(sim);
  if (!c || c.tick !== sim.state.tick) {
    const set = new Set<number>();
    for (const x of sim.stores.ants.list) {
      const r = x.bb[K.receiver];
      if (r === undefined || r < 0) continue;
      if (x.bb[K.phase] === PHASE.deliver || (x.bb[K.ration] ?? 2) === 1) set.add(r);
    }
    c = { tick: sim.state.tick, ids: set };
    claimCache.set(sim, c);
  }
  return c.ids;
}

/** Whether another ant is already unloading to (or begging from) this one. */
function claimed(sim: Sim, ant: Ant, o: Ant): boolean {
  return o.id !== ant.bb[K.receiver] && claimedSet(sim).has(o.id);
}

/**
 * Nearest nestmate standing in the nest (not walking off, not possessed, not already someone else's partner,
 * not the one that just failed), store workers preferred if asked.
 */
function nearestNestmate(sim: Sim, ant: Ant, radiusMm: number, preferStore: boolean): Ant | undefined {
  ids.length = 0;
  sim.index.queryAnts(ant.pos, radiusMm, ids);
  let best: Ant | undefined, bd = Infinity;
  const bonus = preferStore ? RECEIVER_STORE_BONUS_BU * sim.world.bu : 0;
  const bad = ant.bb[K.badRcv] ?? -1;
  for (const id of ids) {
    if (id === ant.id || id === bad) continue;
    const o = sim.stores.ants.get(id);
    if (!o || o.colony !== ant.colony || o.nestId < 0 || (o.flags & AntFlag.POSSESSED) !== 0 || o.nav.status === 'moving') continue;
    const d = Math.hypot(o.pos.x - ant.pos.x, o.pos.y - ant.pos.y, o.pos.z - ant.pos.z) - (o.task === 'store' ? bonus : 0);
    if (d >= bd && !(d === bd && best && o.id < best.id)) continue;
    if (claimed(sim, ant, o)) continue;
    bd = d;
    best = o;
  }
  return best;
}

/**
 * Begs the departure ration (DEPART_RATION C) from a nestmate: `trophallaxis-receive` in the nest draws it from
 * the colony pool. Returns true while the ration is still being taken.
 */
export function rationStep(sim: Sim, ant: Ant): boolean {
  const step = ant.bb[K.ration] ?? 2;
  if (step >= 2) return false;
  const done = (): false => {
    if (ant.action?.id === 'trophallaxis-receive') stopAction(sim, ant, 'trophallaxis-receive');
    ant.bb[K.ration] = 2;
    ant.bb[K.rationed] = ant.cropC >= DEPART_RATION_C * 0.5 ? 1 : 0;
    resumeOutboundNav(sim, ant);
    return false;
  };
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || ant.nestId < 0 || col.stores.c < RATION_POOL_MIN_C || ant.cropC >= DEPART_RATION_C) return done();
  if (step === 0) {
    const d = nearestNestmate(sim, ant, RATION_SEARCH_BU * sim.world.bu, false);
    if (!d) return done();
    ant.bb[K.receiver] = d.id;
    ant.bb[K.ration] = 1;
    ant.bb[K.pick0] = sim.state.tick;
    navToTarget(sim, ant, { kind: 'ant', id: d.id, pos: d.pos }, RECEIVER_ARRIVE_L * ant.lengthBu * sim.world.bu);
    return true;
  }
  if (sinceS(sim, ant.bb[K.pick0] ?? sim.state.tick) > RATION_MAX_S) return done();
  if (ant.action?.id === 'trophallaxis-receive') return true;
  const donor = sim.stores.ants.get(ant.bb[K.receiver] ?? -1);
  if (!donor) return done();
  const t = { kind: 'ant' as const, id: donor.id, pos: donor.pos };
  const check = canDo(sim, ant, 'trophallaxis-receive', t);
  if (check.ok) { stop(sim, ant); begin(sim, ant, 'trophallaxis-receive', t); return true; }
  if (check.reason === 'out-of-reach') {
    if (!moving(ant)) navToTarget(sim, ant, t, RECEIVER_ARRIVE_L * ant.lengthBu * sim.world.bu);
    return true;
  }
  return done();
}

// ---- unloading ----

function cropOf(ant: Ant): number {
  return ant.cropC + ant.cropP;
}

/** Ends the trip at home: statistics, recruitment, route memory, then the next cycle. */
function finishTrip(sim: Sim, ant: Ant, fl: Flavour, c: number, p: number, storesFull: boolean): void {
  const src = ant.bb[K.src] ?? -1;
  const solid = (ant.bb[K.solid] ?? 0) === 1;
  const loads = c + p;
  let success = solid ? loads > EPS : loads >= SUCCESS_CROP - EPS;
  if (fl.scout && (ant.bb[K.success] ?? 0) === 1) success = true;
  const kind = FOOD_KINDS[ant.bb[K.kind] ?? -1] ?? 'unknown';
  if (loads > EPS) bookDelivery(sim, ant, src, kind, c, p, sim.state.tick - (ant.bb[K.unload0] ?? sim.state.tick));
  const trip0 = ant.bb[K.trip0] ?? -1;
  recordForagerReturn(sim, ant, success, success ? src : -1, trip0 >= 0 ? sim.state.tick - trip0 : 0);
  if (success && loads > EPS) commitRoute(sim, ant);
  ant.mem.trips++;
  ant.bb[K.trip0] = -1;
  ant.bb[K.wentOut] = 0;
  ant.bb[K.success] = 0;
  ant.bb[K.solid] = 0;
  logDecision(sim, ant, storesFull ? 'stores-full' : success ? 'item-collected' : 'timeout', src);
  if (storesFull && cropOf(ant) > TROPH_DONOR_MIN + UNLOAD_CROP_MARGIN) { startRest(sim, ant, fl, 'stores-full'); return; }
  if (taskCycleDone(sim, ant) !== fl.task) return;
  if (ant.fatigue >= REST_ENTER) startRest(sim, ant, fl, 'fatigue');
  else if (fl.scout) startDepart(sim, ant, fl);
  else startWait(sim, ant, fl);
}

/**
 * A trip that ended before the ant ever left the nest (a timeout while taking the ration or at a blocked exit): it
 * is not a return, so no statistics, recruitment contact or experience; the ant simply starts its cycle again.
 */
export function abandonTrip(sim: Sim, ant: Ant, fl: Flavour, reason: ReasonCode): void {
  ant.bb[K.trip0] = -1;
  ant.bb[K.success] = 0;
  logDecision(sim, ant, reason, ant.bb[K.src] ?? -1);
  if (fl.scout) startDepart(sim, ant, fl, reason);
  else startWait(sim, ant, fl, reason);
}

function finishFromCrop(sim: Sim, ant: Ant, fl: Flavour, storesFull: boolean): void {
  const c = Math.max(0, (ant.bb[K.c0] ?? 0) - ant.cropC), p = Math.max(0, (ant.bb[K.p0] ?? 0) - ant.cropP);
  finishTrip(sim, ant, fl, c, p, storesFull);
}

function findReceiver(sim: Sim, ant: Ant, fl: Flavour): void {
  const waited = sinceS(sim, ant.bb[K.unload0] ?? sim.state.tick);
  const r = nearestNestmate(sim, ant, (waited > UNLOAD_SEARCH_S ? RECEIVER_SEARCH_WIDE_BU : RECEIVER_SEARCH_BU) * sim.world.bu, true);
  if (r) {
    ant.bb[K.receiver] = r.id;
    ant.bb[K.unload] = UNLOAD.approach;
    ant.bb[K.rcv0] = sim.state.tick;
    navToTarget(sim, ant, { kind: 'ant', id: r.id, pos: r.pos }, RECEIVER_ARRIVE_L * ant.lengthBu * sim.world.bu);
    return;
  }
  if (waited > UNLOAD_MAX_WAIT_S) { finishFromCrop(sim, ant, fl, true); return; }
  // nobody near: walk to the food chamber, where stored food and its handlers are
  const nest = homeNest(sim, ant);
  const room = nest ? foodChamber(nest) : undefined;
  if (room && waited > UNLOAD_SEARCH_S && ant.chamberId !== room.id && !moving(ant)) goToChamber(sim, ant, room, FOOD_ROOM_ARRIVE_BU);
}

/** Starts handing the crop to any nestmate already in reach (the receiver need not be the one walked to). */
function giveToAnyInReach(sim: Sim, ant: Ant): boolean {
  ids.length = 0;
  sim.index.queryAnts(ant.pos, GIVE_REACH_L * ant.lengthBu * sim.world.bu, ids);
  for (const id of ids) {
    if (id === ant.id) continue;
    const o = sim.stores.ants.get(id);
    if (!o || o.colony !== ant.colony || o.nestId < 0 || (o.flags & AntFlag.POSSESSED) !== 0) continue;
    const t = { kind: 'ant' as const, id: o.id, pos: o.pos };
    if (!canDo(sim, ant, 'trophallaxis-give', t).ok) continue;
    stop(sim, ant);
    ant.bb[K.giveCrop] = cropOf(ant);
    if (!begin(sim, ant, 'trophallaxis-give', t)) continue;
    ant.bb[K.receiver] = o.id;
    ant.bb[K.unload] = UNLOAD.give;
    return true;
  }
  return false;
}

function giveStep(sim: Sim, ant: Ant, fl: Flavour): void {
  const step = ant.bb[K.unload] ?? UNLOAD.find;
  // GDD 02 §5.4.1: a forager hands over a crop of at least 0.1 load; less stays with her
  if (!ant.action && (cropOf(ant) <= TROPH_DONOR_MIN + EPS || (step === UNLOAD.find && cropOf(ant) < CROP_RETURN_MIN))) {
    finishFromCrop(sim, ant, fl, false);
    return;
  }
  if ((step === UNLOAD.find || step === UNLOAD.approach) && giveToAnyInReach(sim, ant)) return;
  if (step === UNLOAD.find) { findReceiver(sim, ant, fl); return; }
  if (step === UNLOAD.approach) {
    const r = sim.stores.ants.get(ant.bb[K.receiver] ?? -1);
    if (!r || r.nestId < 0 || sinceS(sim, ant.bb[K.rcv0] ?? sim.state.tick) > RECEIVER_TRY_S) {
      ant.bb[K.badRcv] = r ? r.id : -1;
      ant.bb[K.unload] = UNLOAD.find;
      return;
    }
    const t = { kind: 'ant' as const, id: r.id, pos: r.pos };
    const check = canDo(sim, ant, 'trophallaxis-give', t);
    if (check.ok) {
      stop(sim, ant);
      ant.bb[K.giveCrop] = cropOf(ant);
      if (begin(sim, ant, 'trophallaxis-give', t)) ant.bb[K.unload] = UNLOAD.give;
      return;
    }
    if (check.reason === 'out-of-reach') { if (!moving(ant)) navToTarget(sim, ant, t, RECEIVER_ARRIVE_L * ant.lengthBu * sim.world.bu); return; }
    ant.bb[K.unload] = UNLOAD.find;
    return;
  }
  // UNLOAD.give
  if (ant.action?.id === 'trophallaxis-give') return;
  if (cropOf(ant) <= TROPH_DONOR_MIN + EPS) { finishFromCrop(sim, ant, fl, false); return; }
  const moved = (ant.bb[K.giveCrop] ?? cropOf(ant)) - cropOf(ant);
  if (moved <= EPS) {
    // the pool took nothing: stores are full (GDD 02 §5.3); wait for room, then rest holding the crop
    if ((ant.bb[K.full0] ?? -1) < 0) ant.bb[K.full0] = sim.state.tick;
    if (sinceS(sim, ant.bb[K.full0]!) > UNLOAD_MAX_WAIT_S) { finishFromCrop(sim, ant, fl, true); return; }
    thinkIn(sim, ant, UNLOAD_RETRY_S * TICKS_PER_SECOND);
  }
  ant.bb[K.unload] = UNLOAD.find;
}

function putStep(sim: Sim, ant: Ant, fl: Flavour): void {
  if (ant.action?.id === 'put-down') return;
  if (ant.carry.kind !== 'item') {
    const it = sim.stores.items.get(ant.bb[K.receiver] ?? -1);
    const c = Math.max(0, (ant.bb[K.c0] ?? 0) - (it ? it.c : 0)), p = Math.max(0, (ant.bb[K.p0] ?? 0) - (it ? it.p : 0));
    ant.bb[K.solid] = 1;
    finishTrip(sim, ant, fl, c, p, it !== undefined);
    return;
  }
  const it = sim.stores.items.get(ant.carry.id);
  if (it) { ant.bb[K.receiver] = it.id; ant.bb[K.c0] = it.c; ant.bb[K.p0] = it.p; }
  stop(sim, ant);
  begin(sim, ant, 'put-down', null);
}

export function updateDeliver(sim: Sim, ant: Ant, fl: Flavour): void {
  if (ant.nestId < 0) { if (!moving(ant)) homePlanner(sim, ant); return; }
  if (phaseS(sim, ant) > DELIVER_MAX_S && !ant.action) {
    if (ant.carry.kind === 'item') { ant.bb[K.unload] = UNLOAD.put; putStep(sim, ant, fl); return; }
    finishFromCrop(sim, ant, fl, cropOf(ant) > TROPH_DONOR_MIN + UNLOAD_CROP_MARGIN);
    return;
  }
  const step = ant.bb[K.unload] ?? UNLOAD.toChamber;
  if (step === UNLOAD.toChamber) {
    const nest = homeNest(sim, ant);
    const solid = ant.carry.kind === 'item';
    const room = nest ? (solid ? foodChamber(nest) : entranceChamber(nest)) : undefined;
    if (!room || ant.chamberId === room.id || (arrived(ant) && ant.nestId >= 0)) {
      stop(sim, ant);
      ant.bb[K.unload] = solid ? UNLOAD.put : UNLOAD.find;
      return;
    }
    if (!moving(ant)) goToChamber(sim, ant, room, FOOD_ROOM_ARRIVE_BU);
    return;
  }
  if (step === UNLOAD.put) { putStep(sim, ant, fl); return; }
  giveStep(sim, ant, fl);
}
