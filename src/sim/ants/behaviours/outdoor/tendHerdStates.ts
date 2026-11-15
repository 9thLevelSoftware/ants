// The herd branch of `tend` (GDD 07 §6.1.4 tender states, GDD 02 §10.3): travel to the herd (the planner takes the
// plant's climb route), solicit (`tend-aphid` strokes; the droplet is the plants module's), wait at the herd for the
// pool, guard it (against aphid predators; the GDD 02 guard roster), and, with a full crop, relay to a nestmate or
// go home. Going home, unloading and waiting in the nest are the outdoor engine's (startReturn).
//
// While the branch runs, the engine's own fields say "outbound to the herd source" (K.phase, K.src, K.d*), so an
// engine flee resumes toward the herd and hands the ant back here (tendHerd.ts).

import type { Ant, Creature, FoodSource, Herd, ReasonCode, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { CROP_RETURN_FRACTION, TEND_APHID_STROKE_S, TROPH_DONOR_MIN, TROPH_MAX_S, TROPH_RATE } from '@/sim/balance/actions';
import {
  APHID_DROPLET, HERD_ARRIVE_BU, RELAY_APPROACH_BU, RELAY_ENABLED, RELAY_KEEP_MULT, RELAY_RADIUS_BU,
  RELAY_RECEIVER_MAX_CROP, RELAY_TRY_S, TEND_AT_HERD_SLACK_BU, TEND_AT_HERD_TENDER_BU, TEND_BITE_APPROACH_BU,
  TEND_DRINK_S, TEND_FLEE_HP_FRAC, TEND_GUARD_FRACTION, TEND_GUARD_SHIFT_GD, TEND_GUARD_SIP_CROP,
  TEND_HERD_BLOCK_GD, TEND_PREDATOR_RADIUS_BU, TEND_ROSTER_RADIUS_BU, TEND_SOLICIT_EMPTY_S,
  TEND_STROKE_APPROACH_BU, TEND_TRAVEL_TRIES, TEND_WAIT_TIMEOUT_S,
} from '@/sim/balance/ecology';
import { SUCCESS_CROP, THINK_TRAVEL_TICKS, TRIP_TURN_S } from '@/sim/balance/foraging';
import { begin, canDo, inReach, placeOf } from '@/sim/ants/actions';
import { colonySlotBit } from '@/sim/entities';
import { hasSlot, herdOfSource, herdSourceOf, isAvoidedBy, isTenderOf } from '@/sim/ecology';
import { navTo, navToTarget } from '@/sim/locomotion';
import { daysToTicks, secondsToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { curfewNow, logDecision, num, thinkIn } from './common';
import { fleeCheck, requestFlee } from './flee';
import { TEND } from './flavours';
import { K, PHASE } from './keys';
import { setDest, stop } from './nav';
import { dropAction, startOutbound, startReturn } from './transitions';
import { GIVE, HS, HS_NAMES, TH, type HerdState } from './tendHerdKeys';

const ids: number[] = [];
const place = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };

export function herdState(ant: Ant): HerdState {
  return num(ant, TH.st, HS.off) as HerdState;
}

export function herdActive(ant: Ant): boolean {
  return herdState(ant) !== HS.off;
}

function setState(sim: Sim, ant: Ant, st: HerdState, reason?: ReasonCode, detail = -1): void {
  ant.bb[TH.st] = st;
  ant.bb[TH.st0] = sim.state.tick;
  const name = HS_NAMES[st];
  if (name && ant.state !== name) { ant.state = name; ant.stateTick = sim.state.tick; }
  if (reason) logDecision(sim, ant, reason, detail);
}

function stateS(sim: Sim, ant: Ant): number {
  return (sim.state.tick - num(ant, TH.st0, sim.state.tick)) / TICKS_PER_SECOND;
}

function cropOf(ant: Ant): number {
  return ant.cropC + ant.cropP;
}

function bu(sim: Sim): number {
  return sim.world.bu;
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Close enough to the herd point to stroke and to count as present. */
function atHerd(sim: Sim, ant: Ant, src: FoodSource): boolean {
  const d = dist(ant.pos, src.pos);
  return d <= (HERD_ARRIVE_BU + TEND_AT_HERD_SLACK_BU) * bu(sim) || (isTenderOf(sim, ant, src) && d <= TEND_AT_HERD_TENDER_BU * bu(sim));
}

// ---------------------------------------------------------------- entry and exit

/** Starts a trip to the herd (from the nest or outside): the engine's outbound bookkeeping, then our travel. */
export function startTravel(sim: Sim, ant: Ant, h: Herd, reason: ReasonCode = 'job:herd'): boolean {
  const src = herdSourceOf(sim, h);
  if (!src) return false;
  startOutbound(sim, ant, TEND, src.id, src.pos, -1, reason, src.id);
  ant.bb[K.ration] = 2; // tenders drink at the herd: no departure ration
  if (num(ant, TH.herd, -1) !== h.id) ant.bb[TH.tries] = 0;
  ant.bb[TH.herd] = h.id;
  ant.bb[TH.trip0] = sim.state.tick;
  ant.bb[TH.shift] = 0;
  ant.bb[TH.cycle] = 0;
  setState(sim, ant, HS.travel);
  requestTravel(sim, ant, src);
  return true;
}

/** Back into the branch from an engine phase heading to a herd source (after a flee). */
export function resumeTravel(sim: Sim, ant: Ant, src: FoodSource): void {
  const h = herdOfSource(sim, src.id);
  if (!h) return;
  ant.bb[TH.herd] = h.id;
  if (num(ant, TH.trip0, -1) < 0) ant.bb[TH.trip0] = sim.state.tick;
  if (atHerd(sim, ant, src)) { startSolicit(sim, ant, 'job:resume'); stop(sim, ant); return; }
  setState(sim, ant, HS.travel, 'job:resume');
  requestTravel(sim, ant, src);
}

function requestTravel(sim: Sim, ant: Ant, src: FoodSource): void {
  ant.bb[K.phase] = PHASE.outbound;
  ant.bb[K.src] = src.id;
  setDest(ant, src.pos);
  navTo(sim, ant, src.pos, HERD_ARRIVE_BU * bu(sim));
}

/** Leaves the herd for home: the engine's return (trail laying, homing, unloading) takes over. */
export function leaveHerd(sim: Sim, ant: Ant, reason: ReasonCode): void {
  const h = sim.stores.herds.get(num(ant, TH.herd, -1));
  const src = h ? herdSourceOf(sim, h) : undefined;
  dropAction(sim, ant);
  ant.bb[TH.st] = HS.off;
  ant.bb[TH.trip0] = -1;
  ant.bb[TH.cycle] = 1;
  ant.bb[K.src] = src ? src.id : -1;
  ant.bb[K.out0] = sim.state.tick; // the engine's trip clock counts the way home only
  startReturn(sim, ant, TEND, cropOf(ant) >= SUCCESS_CROP, reason, src ? src.id : -1);
}

/** Forgets the herd branch (task exit). */
export function clearHerdBranch(ant: Ant): void {
  ant.bb[TH.st] = HS.off;
  ant.bb[TH.trip0] = -1;
  ant.bb[TH.shift] = 0;
  ant.bb[TH.rcv] = -1;
  ant.bb[TH.give] = GIVE.none;
}

function giveUpHerd(sim: Sim, ant: Ant, h: Herd): void {
  ant.bb[TH.bad] = h.id;
  ant.bb[TH.badUntil] = sim.state.tick + daysToTicks(TEND_HERD_BLOCK_GD);
  ant.bb[TH.herd] = -1;
  ant.bb[TH.tries] = 0;
}

// ---------------------------------------------------------------- per think

/** Aphid predators at the herd that this colony can see (lacewing larvae only once noticed), nearest first. */
function predatorsAt(sim: Sim, ant: Ant, h: Herd, src: FoodSource): Creature[] {
  const out: Creature[] = [];
  const bit = colonySlotBit(sim, ant.colony);
  const r = TEND_PREDATOR_RADIUS_BU * bu(sim);
  for (const id of h.predators) {
    const c = sim.stores.creatures.get(id);
    if (!c || !c.alive || dist(c.pos, src.pos) > r + c.radius) continue;
    if (c.kind === 'lacewing-larva' && ((c.bb.seen ?? 0) & bit) === 0) continue;
    out.push(c);
  }
  out.sort((a, b) => dist(a.pos, ant.pos) - dist(b.pos, ant.pos) || a.id - b.id);
  return out;
}

/** One think of an ant in the herd branch. */
export function updateHerd(sim: Sim, ant: Ant): void {
  thinkIn(sim, ant, THINK_TRAVEL_TICKS);
  const h = sim.stores.herds.get(num(ant, TH.herd, -1));
  const src = h ? herdSourceOf(sim, h) : undefined;
  if (!h || !src || h.a < 1) { leaveHerd(sim, ant, 'source-depleted'); return; }
  if (ant.task !== 'tend') { leaveHerd(sim, ant, 'surplus'); return; }
  const col = sim.stores.colonies.get(ant.colony);
  if ((sim.state.tick - num(ant, TH.trip0, sim.state.tick)) / TICKS_PER_SECOND > TRIP_TURN_S) { leaveHerd(sim, ant, 'timeout'); return; }
  if (col && curfewNow(sim, col)) { leaveHerd(sim, ant, 'curfew'); return; }
  if (isAvoidedBy(sim, src, ant.colony)) { leaveHerd(sim, ant, 'marker:avoid'); return; }
  const st = herdState(ant);
  const preds = st === HS.travel ? [] : predatorsAt(sim, ant, h, src);
  if (preds.length === 0 && fleeCheck(sim, ant, TEND)) { ant.bb[TH.st] = HS.off; return; }
  if (preds.length > 0 && st !== HS.guard) { setState(sim, ant, HS.guard, 'threat', preds[0].id); ant.bb[TH.alarm] = 0; }
  switch (herdState(ant)) {
    case HS.travel: travel(sim, ant, h, src); return;
    case HS.solicit: solicit(sim, ant, h, src); return;
    case HS.wait: waitAtHerd(sim, ant, h, src); return;
    case HS.guard: guard(sim, ant, h, src, preds); return;
    case HS.full: full(sim, ant, h, src); return;
    default: leaveHerd(sim, ant, 'job:home');
  }
}

function travel(sim: Sim, ant: Ant, h: Herd, src: FoodSource): void {
  if (atHerd(sim, ant, src)) {
    stop(sim, ant);
    ant.bb[TH.tries] = 0;
    startSolicit(sim, ant, 'job:herd', h.id);
    return;
  }
  const s = ant.nav.status;
  if (s === 'moving') return;
  if (s === 'failed' || s === 'arrived') {
    // arrived but not at the herd point (an arrival radius jitter) counts as a near miss, not a failure
    const tries = num(ant, TH.tries, 0) + (s === 'failed' ? 1 : 0);
    ant.bb[TH.tries] = tries;
    if (tries >= TEND_TRAVEL_TRIES) { giveUpHerd(sim, ant, h); leaveHerd(sim, ant, 'stuck'); return; }
  }
  requestTravel(sim, ant, src);
}

/** Tenders of the colony at this herd, and how many of them are guarding. */
function roster(sim: Sim, ant: Ant, h: Herd, src: FoodSource): { tenders: number; guards: number } {
  let tenders = 0, guards = 0;
  sim.index.queryAnts(src.pos, TEND_ROSTER_RADIUS_BU * bu(sim), ids);
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (!a || a.colony !== ant.colony || num(a, TH.herd, -1) !== h.id || !herdActive(a) || herdState(a) === HS.travel) continue;
    tenders++;
    if (herdState(a) === HS.guard) guards++;
  }
  return { tenders, guards };
}

/** Starts one stroke if the pool holds a droplet and a slot is free; true when started (or running). */
function stroke(sim: Sim, ant: Ant, h: Herd, src: FoodSource): boolean {
  if (ant.action?.id === 'tend-aphid') return true;
  if (sim.state.tick < num(ant, TH.next, 0)) return true; // drinking the last droplet
  if (h.pool < APHID_DROPLET || !hasSlot(sim, ant, src)) return false;
  const t = { kind: 'source' as const, id: src.id, pos: src.pos };
  if (!canDo(sim, ant, 'tend-aphid', t).ok) {
    const p = placeOf(sim, ant, t, place);
    if (p && !inReach(sim, ant, p)) navToTarget(sim, ant, t, TEND_STROKE_APPROACH_BU * bu(sim));
    return false;
  }
  if (!begin(sim, ant, 'tend-aphid', t)) return false;
  ant.bb[TH.next] = sim.state.tick + secondsToTicks(TEND_APHID_STROKE_S + TEND_DRINK_S);
  return true;
}

function solicit(sim: Sim, ant: Ant, h: Herd, src: FoodSource): void {
  if (cropOf(ant) >= CROP_RETURN_FRACTION * ant.cropCap) { enterFull(sim, ant); return; }
  const r = roster(sim, ant, h, src);
  // GDD 02 §10.3: a guard when the roster is below 0.3 of the herd's tenders; counted in whole guards (floor), so
  // up to 3 tenders all stroke and 4-6 keep one guard (decision: the literal "< 0.3 n" makes half of 4 guards)
  if (r.guards < Math.floor(TEND_GUARD_FRACTION * r.tenders)) {
    ant.bb[TH.shift] = 1;
    ant.bb[TH.shift0] = sim.state.tick;
    setState(sim, ant, HS.guard, 'job:guard', h.id);
    return;
  }
  noteHoney(sim, ant);
  stroke(sim, ant, h, src);
  // "pool empty for 60 s" as this tender sees it: no droplet came its way (an empty pool, or one shared out by a
  // crowd of tenders before its strokes end)
  if (ant.action?.id !== 'tend-aphid' && dryS(sim, ant) >= TEND_SOLICIT_EMPTY_S) setState(sim, ant, HS.wait, 'source-depleted', h.id);
}

/** Into `solicit` afresh (arrived, back from guard duty, after a relay): the dry clock starts now. */
function startSolicit(sim: Sim, ant: Ant, reason?: ReasonCode, detail = -1): void {
  ant.bb[TH.empty0] = sim.state.tick;
  ant.bb[TH.cropSeen] = cropOf(ant);
  setState(sim, ant, HS.solicit, reason, detail);
}

/** Restarts the dry clock when the crop rose since the last think (a droplet came). */
function noteHoney(sim: Sim, ant: Ant): void {
  const c = cropOf(ant);
  if (c > num(ant, TH.cropSeen, c) + 1e-9 || num(ant, TH.empty0, -1) < 0) ant.bb[TH.empty0] = sim.state.tick;
  ant.bb[TH.cropSeen] = c;
}

/** Seconds since the tender last got honeydew at the herd. */
function dryS(sim: Sim, ant: Ant): number {
  return (sim.state.tick - num(ant, TH.empty0, sim.state.tick)) / TICKS_PER_SECOND;
}

function enterFull(sim: Sim, ant: Ant): void {
  ant.bb[TH.rcv] = -1;
  ant.bb[TH.give] = GIVE.none;
  setState(sim, ant, HS.full, 'crop-full');
}

function waitAtHerd(sim: Sim, ant: Ant, h: Herd, src: FoodSource): void {
  if (cropOf(ant) >= CROP_RETURN_FRACTION * ant.cropCap) { enterFull(sim, ant); return; }
  noteHoney(sim, ant);
  // the wait ends after WAIT_TIMEOUT_S without honeydew; short spells of soliciting in between do not restart it
  if (dryS(sim, ant) >= TEND_SOLICIT_EMPTY_S + TEND_WAIT_TIMEOUT_S) { leaveHerd(sim, ant, 'timeout'); return; }
  if (h.pool >= APHID_DROPLET && hasSlot(sim, ant, src)) setState(sim, ant, HS.solicit);
}

function guard(sim: Sim, ant: Ant, h: Herd, src: FoodSource, preds: Creature[]): void {
  const c = preds[0];
  if (c) {
    if (ant.hp < TEND_FLEE_HP_FRAC * ant.maxHp) {
      requestFlee(sim, ant, c.pos.x, c.pos.z);
      ant.bb[TH.st] = HS.off;
      ant.bb[K.phase] = PHASE.outbound;
      return;
    }
    if (sim.state.tick < (ant.bb['cr.stunUntil'] ?? -1)) return; // reflex bleeding: stunned
    if (num(ant, TH.alarm, 0) === 0 && canDo(sim, ant, 'release-alarm', null).ok) {
      begin(sim, ant, 'release-alarm', null);
      ant.bb[TH.alarm] = 1;
      return;
    }
    if (ant.action) return;
    const t = { kind: 'creature' as const, id: c.id, pos: c.pos };
    if (canDo(sim, ant, 'bite', t).ok) { begin(sim, ant, 'bite', t); return; }
    if (ant.nav.status !== 'moving') navToTarget(sim, ant, t, TEND_BITE_APPROACH_BU * bu(sim));
    return;
  }
  if (num(ant, TH.shift, 0) === 1 && sim.state.tick - num(ant, TH.shift0, 0) < daysToTicks(TEND_GUARD_SHIFT_GD)) {
    if (!atHerd(sim, ant, src) && ant.nav.status !== 'moving') navTo(sim, ant, src.pos, HERD_ARRIVE_BU * bu(sim));
    if (cropOf(ant) < TEND_GUARD_SIP_CROP) stroke(sim, ant, h, src); // upkeep from the herd
    return;
  }
  ant.bb[TH.shift] = 0;
  if (!atHerd(sim, ant, src)) { setState(sim, ant, HS.travel); requestTravel(sim, ant, src); return; }
  startSolicit(sim, ant);
}

/** Whether o can take honeydew home for the tender: a nestmate outside, not possessed, crop at most half full, not
 * working this herd itself. */
function canReceive(ant: Ant, o: Ant, h: Herd): boolean {
  if (o.id === ant.id || !o.alive || o.colony !== ant.colony || o.nestId >= 0 || (o.flags & AntFlag.POSSESSED) !== 0) return false;
  if (o.task !== 'forage' && o.task !== 'scout' && o.task !== 'tend') return false;
  if (cropOf(o) > RELAY_RECEIVER_MAX_CROP * o.cropCap) return false;
  return !(num(o, TH.herd, -1) === h.id && herdActive(o));
}

/** The nearest receiver within RELAY_RADIUS_BU of the tender or of the herd point, or undefined. */
function relayReceiver(sim: Sim, ant: Ant, h: Herd, src: FoodSource): Ant | undefined {
  let best: Ant | undefined, bd = Infinity;
  const r = RELAY_RADIUS_BU * bu(sim);
  for (const centre of [ant.pos, src.pos]) {
    sim.index.queryAnts(centre, r, ids);
    for (const id of ids) {
      const o = sim.stores.ants.get(id);
      if (!o || !canReceive(ant, o, h) || dist(o.pos, centre) > r) continue;
      const d = dist(o.pos, ant.pos);
      if (d < bd || (d === bd && best && o.id < best.id)) { bd = d; best = o; }
    }
  }
  return best;
}

/**
 * The relay is reported once honey is seen going over (GDD 07 App. E 6: within 10 s of the tender being full), not
 * when the give ends: a give runs up to TROPH_MAX_S. `loads` is what this give will move at the trophallaxis rate:
 * moved so far plus what the donor can still spare and the receiver still take, within the action's time limit.
 */
function reportRelay(sim: Sim, ant: Ant, rid: number, moved: number, running: boolean): void {
  let loads = moved;
  const r = sim.stores.ants.get(rid);
  if (running && r) {
    const rest = Math.min(cropOf(ant) - TROPH_DONOR_MIN, r.cropCap - cropOf(r), TROPH_RATE * TROPH_MAX_S - moved);
    loads += Math.max(0, rest);
  }
  sim.emit({ type: 'honeydew-relay', fromAnt: ant.id, toAnt: rid, loads });
  ant.bb[TH.give] = GIVE.reported;
}

function full(sim: Sim, ant: Ant, h: Herd, src: FoodSource): void {
  const rid = num(ant, TH.rcv, -1);
  const give = num(ant, TH.give, GIVE.none);
  const moved = num(ant, TH.c0, cropOf(ant)) - cropOf(ant);
  if (ant.action?.id === 'trophallaxis-give') {
    if (give === GIVE.started && moved > 1e-6) reportRelay(sim, ant, rid, moved, true);
    return;
  }
  if (give !== GIVE.none) {
    // the give ended
    ant.bb[TH.give] = GIVE.none;
    if (moved > 1e-6) {
      if (give === GIVE.started) reportRelay(sim, ant, rid, moved, false);
      ant.bb[TH.give] = GIVE.none;
      ant.bb[TH.rcv] = -1;
      startSolicit(sim, ant, 'job:relay', rid); // back to stroking: the tender stays at the herd
      return;
    }
  }
  if (!RELAY_ENABLED || stateS(sim, ant) >= RELAY_TRY_S) { ant.bb[TH.rcv] = -1; leaveHerd(sim, ant, 'crop-full'); return; }
  const kept = sim.stores.ants.get(rid);
  const r = kept && canReceive(ant, kept, h) && dist(kept.pos, src.pos) <= RELAY_KEEP_MULT * RELAY_RADIUS_BU * bu(sim)
    ? kept : relayReceiver(sim, ant, h, src);
  if (!r) { ant.bb[TH.rcv] = -1; leaveHerd(sim, ant, 'crop-full'); return; }
  ant.bb[TH.rcv] = r.id;
  const t = { kind: 'ant' as const, id: r.id, pos: r.pos };
  if (canDo(sim, ant, 'trophallaxis-give', t).ok) {
    ant.bb[TH.c0] = cropOf(ant);
    if (begin(sim, ant, 'trophallaxis-give', t)) { ant.bb[TH.give] = GIVE.started; stop(sim, ant); return; }
  }
  if (ant.nav.status !== 'moving') navToTarget(sim, ant, t, RELAY_APPROACH_BU * bu(sim));
}
