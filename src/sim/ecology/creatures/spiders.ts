// Jumping spider and wolf spider (GDD 05 §2.2b, §2.4).
//  jumping-spider: rest (sunny spot) -> scan -> stalk (move / pause facing the ant) -> windup 0.6 s -> leap ->
//                  hold (venom) -> feed (retreat 12 mm, 120 s) | recover | flee. Day, air >= 15 C. Lone ants only.
//  wolf-spider:    wander <-> ambush (30-120 s) -> orient 0.3 s -> freeze (vibration cue 1.0 s) -> windup 0.5 s ->
//                  pounce -> hold -> feed (retreat 16 mm to cover, 120 s) | flee. Dusk/night; by day activity x0.4.

import type { Creature, Sim } from '@/sim/types';
import {
  CREATURE_STATS, JUMPING_SPIDER_MIN_C, LONE_ANT_L, STALK_GIVE_UP_S, STALK_MOVE_S, STALK_PAUSE_S, STRIKE_RANGE_MM, WOLF_AMBUSH_S, WOLF_DAY_ACTIVITY,
  WOLF_AMBUSH_CHANCE, WOLF_FREEZE_CUE_S, WOLF_FREEZE_MAX_S, WOLF_HOME_RADIUS_MM, WOLF_ORIENT_S, WOLF_WANDER_S,
  windupMaxTargetSpeed,
} from '@/sim/balance/creatures';
import { antLen, between, chance, cue, dist, face, inStateS, setState, stop, ticks, timerDone, walkTo, wander, nestmateWithin } from './common';
import type { Conditions } from './conditions';
import { beginWindup, landStrike, windupTicks } from './attack';
import {
  currentVictim, findVictim, holdState, shouldFlee, startFeed, startFlee, startRecover, strikeDue,
} from './predator';
import type { KindBehaviour } from './kinds';

const JS = CREATURE_STATS['jumping-spider'];
const WS = CREATURE_STATS['wolf-spider'];
/** Scan / detection cadence, ticks. */
const SCAN_EVERY = 10;
/** The spider strolls this close to its sunny spot while scanning, mm. */
const JS_SCAN_RADIUS_MM = 60;

/** Flee check shared by both spiders (any state but flee). */
function fleeCheck(sim: Sim, c: Creature, burst: number): boolean {
  if (c.state === 'flee' || !shouldFlee(sim, c)) return false;
  startFlee(sim, c, burst * 0.25);
  return true;
}

function landAndFollow(sim: Sim, c: Creature): void {
  const out = landStrike(sim, c, true);
  if (out === 'seized') setState(sim, c, 'hold');
  else if (out === 'killed') startFeed(sim, c);
  else startRecover(sim, c);
}

export const jumpingSpider: KindBehaviour = {
  update(sim, c, cond: Conditions) {
    if (fleeCheck(sim, c, JS.burstMmS)) return;
    const active = cond.day && cond.airC >= JUMPING_SPIDER_MIN_C;
    switch (c.state) {
      case 'hold': holdState(sim, c); return;
      case 'windup': if (strikeDue(sim, c)) landAndFollow(sim, c); return;
      case 'feed': case 'flee': case 'recover':
        if (timerDone(c)) setState(sim, c, active ? 'scan' : 'rest');
        return;
      case 'stalk': {
        const ant = currentVictim(sim, c);
        const d = ant ? dist(ant.pos, c.pos) : Infinity;
        if (!ant || !active || d > JS.senseMm * 1.2 || inStateS(sim, c) > STALK_GIVE_UP_S || !isLone(sim, ant.id)) { startRecover(sim, c); return; }
        if (d <= (STRIKE_RANGE_MM['jumping-spider'] ?? 16) && ant.speed <= windupMaxTargetSpeed('jumping-spider', cond.levers.telegraphMult)) {
          beginWindup(sim, c, ant);
          setState(sim, c, 'windup');
          return;
        }
        // stalking rhythm: move, then pause with the body facing the ant
        const phase = (sim.state.tick - c.stateTick) % ticks(STALK_MOVE_S + STALK_PAUSE_S);
        if (phase < ticks(STALK_MOVE_S)) {
          if (phase % SCAN_EVERY === 0) walkTo(sim, c, ant.pos, JS.walkMmS, (STRIKE_RANGE_MM['jumping-spider'] ?? 16) * 0.8);
        } else { stop(sim, c); face(c, ant.pos); }
        return;
      }
      case 'scan': {
        if (!active) { setState(sim, c, 'rest'); stop(sim, c); return; }
        if ((sim.state.tick + c.id) % SCAN_EVERY !== 0) return;
        const v = findVictim(sim, c, { rangeMm: JS.senseMm, lone: true });
        if (v) { c.bb.tgt = v.id; c.target = { kind: 'ant', id: v.id, pos: { ...v.pos } }; setState(sim, c, 'stalk'); return; }
        if (c.nav.mode !== 'wander') wander(sim, c, c.homeCenter, JS_SCAN_RADIUS_MM, JS.walkMmS * 0.5);
        return;
      }
      default: // rest
        if (active) { setState(sim, c, 'scan'); return; }
        if (c.nav.status !== 'moving' && dist(c.pos, c.homeCenter) > 10) walkTo(sim, c, c.homeCenter, JS.walkMmS, 4);
    }
  },
};

/** The stalked ant is still alone (no nestmate within 3 L). */
function isLone(sim: Sim, antId: number): boolean {
  const a = sim.stores.ants.get(antId);
  return !!a && !nestmateWithin(sim, a, LONE_ANT_L * antLen(sim, a));
}

/** Wolf spider activity: always at dusk / night (18:00-06:00 peak), by day each cycle is active with p 0.4. */
function wolfActiveNow(sim: Sim, cond: Conditions): boolean {
  if (cond.hour >= 18 || cond.hour < 6) return true;
  return chance(sim, WOLF_DAY_ACTIVITY);
}

function wolfNextCycle(sim: Sim, c: Creature, cond: Conditions): void {
  if (!wolfActiveNow(sim, cond)) {
    setState(sim, c, 'rest', between(sim, WOLF_WANDER_S));
    walkTo(sim, c, c.homeCenter, WS.walkMmS * 0.5, 6);
    return;
  }
  if (c.state === 'wander' || chance(sim, WOLF_AMBUSH_CHANCE)) {
    setState(sim, c, 'ambush', between(sim, WOLF_AMBUSH_S));
    stop(sim, c);
  } else {
    setState(sim, c, 'wander', between(sim, WOLF_WANDER_S));
    wander(sim, c, c.homeCenter, c.homeRadius > 0 ? c.homeRadius : WOLF_HOME_RADIUS_MM, WS.walkMmS * 0.4);
  }
}

export const wolfSpider: KindBehaviour = {
  update(sim, c, cond: Conditions) {
    if (fleeCheck(sim, c, WS.burstMmS)) return;
    switch (c.state) {
      case 'hold': holdState(sim, c); return;
      case 'windup': if (strikeDue(sim, c)) landAndFollow(sim, c); return;
      case 'feed': case 'flee': case 'recover':
        if (timerDone(c)) wolfNextCycle(sim, c, cond);
        return;
      case 'orient': {
        const ant = currentVictim(sim, c);
        if (!ant || dist(ant.pos, c.pos) > WS.senseMm * 1.5 || inStateS(sim, c) > WOLF_FREEZE_MAX_S) { startRecover(sim, c); return; }
        face(c, ant.pos);
        if (inStateS(sim, c) < WOLF_ORIENT_S) return;
        // waits facing the ant until it pauses; then freezes: the vibration cue (ground shiver + low tap) a full
        // second before the 0.5 s wind-up. The aim is fixed now - the ant that hurries away is missed.
        if (ant.speed > windupMaxTargetSpeed('wolf-spider', cond.levers.telegraphMult)) return;
        cue(sim, 'creature-step', c.pos, 0.6);
        beginWindup(sim, c, ant, WOLF_FREEZE_CUE_S);
        setState(sim, c, 'freeze');
        return;
      }
      case 'freeze':
        // the wind-up (body lowers, legs gather) is the last 0.5 s before the strike
        if (sim.state.tick >= c.bb.strikeAt - windupTicks(sim, c)) setState(sim, c, 'windup');
        return;
      case 'ambush': case 'wander': {
        if ((sim.state.tick + c.id) % SCAN_EVERY === 0) {
          const v = findVictim(sim, c, { rangeMm: WS.senseMm });
          if (v) {
            c.bb.tgt = v.id;
            c.target = { kind: 'ant', id: v.id, pos: { ...v.pos } };
            stop(sim, c);
            setState(sim, c, 'orient');
            return;
          }
        }
        if (timerDone(c)) wolfNextCycle(sim, c, cond);
        return;
      }
      default: // rest / idle
        if (timerDone(c)) wolfNextCycle(sim, c, cond);
    }
  },
};

