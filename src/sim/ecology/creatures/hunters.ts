// Ant-spider, centipede and rove beetle (GDD 05 §2.2b, §2.4, §2.5).
//  ant-spider:  rest (day) | patrol -> approach (ant mimicry) -> windup 0.3 s -> bite (1 + venom 6 over 15 s) ->
//               retreat -> wait (venom; paralysed at health <= 0.3) -> collect -> carry to cover -> feed | flee
//               (detected within 1 L by another ant, or bitten once).
//  centipede:   prowl -> windup 0.5 s -> lunge -> hold (venom 1/s) -> feed 60 s | flee; nest raids (invasion.ts).
//  rove-beetle: forage (erratic) -> target a lone ant -> windup 0.4 s -> grab and hold 1.5/s -> feed | secretion
//               (>= 2 biters within 2 s: ants within 1.5 L flee 3 s) -> flee.

import type { Creature, Sim } from '@/sim/types';
import {
  ANT_SPIDER_APPROACH_MMS, ANT_SPIDER_DETECT_L, ANT_SPIDER_RETREAT_L, ANT_SPIDER_VENOM_S, ANT_SPIDER_VENOM_TOTAL,
  CREATURE_STATS, FEED_RETREAT_MM, PARALYSE_HEALTH, PARALYSE_S, RESIDENT_HOME_RADIUS_MM, ROVE_SECRETION_BITERS,
  ROVE_SECRETION_COOLDOWN_S, ROVE_SECRETION_WINDOW_S, STRIKE_RANGE_MM, windupMaxTargetSpeed,
} from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import {
  antLen, awayPoint, dist, setState, stop, ticks, timerDone, walkTo, wander,
} from './common';
import type { Conditions } from './conditions';
import { beginWindup, ensureCombat, landStrike, seizeAnt } from './attack';
import {
  currentVictim, findVictim, holdState, shouldFlee, startFeed, startFlee, startRecover, strikeDue,
} from './predator';
import { distinctBiters } from './hits';
import { ports } from './ports';
import { invasionTick, maybeInvade } from './invasion';
import type { KindBehaviour } from './kinds';

const SCAN_EVERY = 10;
const AS = CREATURE_STATS['ant-spider'];
const CE = CREATURE_STATS.centipede;
const RB = CREATURE_STATS['rove-beetle'];

// ---------------------------------------------------------------- ant-spider

/** Venom left in the victim (bb.venomTgt, bb.venomUntil): applied every tick until it runs out. */
function venomTick(sim: Sim, c: Creature, cond: Conditions): void {
  const id = c.bb.venomTgt ?? -1;
  if (id < 0) return;
  const ant = sim.stores.ants.get(id);
  if (!ant || sim.state.tick >= (c.bb.venomUntil ?? 0)) { c.bb.venomTgt = -1; return; }
  const perTick = (ANT_SPIDER_VENOM_TOTAL / ANT_SPIDER_VENOM_S) / TICKS_PER_SECOND;
  ports.applyDamage(sim, 'ant', ant.id, perTick * cond.levers.predatorDamageMult, 'predation');
  if (!sim.stores.ants.has(ant.id)) return;
  const cs = ensureCombat(ant);
  if (ant.hp > 0 && ant.hp <= PARALYSE_HEALTH * ant.maxHp + 1e-6 && cs.paralysedUntilTick <= sim.state.tick) {
    cs.paralysedUntilTick = sim.state.tick + ticks(PARALYSE_S);
    ports.navStop(sim, ant);
    sim.emit({ type: 'ant-paralysed', antId: ant.id, by: c.id });
  }
}

/** Another ant within 1 L of the spider sees through the mimicry (the approached victim does not). */
function detectedByAnt(sim: Sim, c: Creature): boolean {
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, 4 * sim.world.bu, ids);
  for (const id of ids) {
    if (id === (c.bb.tgt ?? -1) || id === (c.bb.prey ?? -1)) continue;
    const a = sim.stores.ants.get(id);
    if (a && dist(a.pos, c.pos) <= ANT_SPIDER_DETECT_L * antLen(sim, a)) return true;
  }
  return false;
}

function antSpiderFlee(sim: Sim, c: Creature): void {
  startFlee(sim, c, AS.walkMmS, ANT_SPIDER_RETREAT_L * sim.world.bu);
}

export const antSpider: KindBehaviour = {
  onHit(sim, c) { if (c.state !== 'flee') antSpiderFlee(sim, c); },
  update(sim, c, cond) {
    venomTick(sim, c, cond);
    const active = cond.dark;
    switch (c.state) {
      case 'flee': case 'feed': case 'recover':
        if (timerDone(c)) setState(sim, c, active ? 'patrol' : 'rest');
        return;
      case 'carry': {
        const ant = sim.stores.ants.get(c.seizedAntId);
        if (!ant) { c.seizedAntId = -1; setState(sim, c, 'patrol'); return; }
        if (c.nav.status === 'arrived' || c.nav.status === 'failed' || dist(c.pos, c.homeCenter) < 6) {
          c.seizedAntId = -1;
          if (ant.combat) ant.combat.seizedBy = -1;
          ports.applyDamage(sim, 'ant', ant.id, ant.hp + ant.maxHp, 'predation');
          startFeed(sim, c);
        }
        return;
      }
      case 'collect': {
        const ant = sim.stores.ants.get(c.bb.prey ?? -1);
        const paralysed = !!ant && !!ant.combat && ant.combat.paralysedUntilTick > sim.state.tick;
        if (!ant || !paralysed || ant.nestId >= 0) { startRecover(sim, c); return; }
        if (detectedByAnt(sim, c)) { antSpiderFlee(sim, c); return; }
        if (dist(ant.pos, c.pos) <= c.radius + ant.radius + 2) {
          seizeAnt(sim, c, ant);
          setState(sim, c, 'carry');
          walkTo(sim, c, c.homeCenter, AS.walkMmS * 0.5, 4);
        } else if ((sim.state.tick + c.id) % SCAN_EVERY === 0) walkTo(sim, c, ant.pos, AS.walkMmS * 0.5, 1);
        return;
      }
      case 'wait': {
        if (detectedByAnt(sim, c)) { antSpiderFlee(sim, c); return; }
        const ant = sim.stores.ants.get(c.bb.prey ?? -1);
        if (ant && ant.combat && ant.combat.paralysedUntilTick > sim.state.tick) { setState(sim, c, 'collect'); return; }
        if (!ant || (c.bb.venomTgt ?? -1) < 0) { c.bb.prey = -1; setState(sim, c, active ? 'patrol' : 'rest'); }
        return;
      }
      case 'windup':
        if (!strikeDue(sim, c)) return;
        if (landStrike(sim, c, false) === 'hit') {
          c.bb.venomTgt = c.bb.tgt;
          c.bb.prey = c.bb.tgt;
          c.bb.venomUntil = sim.state.tick + ticks(ANT_SPIDER_VENOM_S) + 1; // applied from the next tick: 15 s in all
          const victim = sim.stores.ants.get(c.bb.tgt);
          const back = awayPoint(c.pos, victim ? victim.pos : c.homeCenter, FEED_RETREAT_MM['ant-spider'] ?? 16, { x: 0, y: 0, z: 0 });
          walkTo(sim, c, back, AS.walkMmS, 2);
          setState(sim, c, 'wait');
        } else startRecover(sim, c);
        return;
      case 'approach': {
        const ant = currentVictim(sim, c);
        if (!ant || !active) { startRecover(sim, c); return; }
        if (detectedByAnt(sim, c)) { antSpiderFlee(sim, c); return; }
        const d = dist(ant.pos, c.pos);
        if (d <= (STRIKE_RANGE_MM['ant-spider'] ?? 6) && ant.speed <= windupMaxTargetSpeed('ant-spider', cond.levers.telegraphMult)) {
          beginWindup(sim, c, ant);
          setState(sim, c, 'windup');
        } else if ((sim.state.tick + c.id) % SCAN_EVERY === 0) walkTo(sim, c, ant.pos, ANT_SPIDER_APPROACH_MMS, (STRIKE_RANGE_MM['ant-spider'] ?? 6) * 0.7);
        return;
      }
      case 'patrol': {
        if (!active) { setState(sim, c, 'rest'); walkTo(sim, c, c.homeCenter, AS.walkMmS * 0.5, 4); return; }
        if ((sim.state.tick + c.id) % SCAN_EVERY === 0 && (c.bb.venomTgt ?? -1) < 0) {
          const v = findVictim(sim, c, { rangeMm: AS.senseMm });
          if (v) { c.bb.tgt = v.id; c.target = { kind: 'ant', id: v.id, pos: { ...v.pos } }; setState(sim, c, 'approach'); return; }
        }
        if (c.nav.mode !== 'wander') wander(sim, c, c.homeCenter, c.homeRadius > 0 ? c.homeRadius : RESIDENT_HOME_RADIUS_MM, AS.walkMmS * 0.3);
        return;
      }
      default: // rest
        if (active) setState(sim, c, 'patrol');
    }
  },
};

// ---------------------------------------------------------------- centipede

export const centipede: KindBehaviour = {
  update(sim, c, cond) {
    if (c.state !== 'flee' && shouldFlee(sim, c)) { startFlee(sim, c, CE.walkMmS); return; }
    switch (c.state) {
      case 'hold': holdState(sim, c); return;
      case 'windup':
        if (!strikeDue(sim, c)) return;
        {
          const out = landStrike(sim, c, true);
          if (out === 'seized') setState(sim, c, 'hold');
          else if (out === 'killed') startFeed(sim, c);
          else startRecover(sim, c);
        }
        return;
      case 'invade': invasionTick(sim, c, cond); return;
      case 'feed': case 'flee': case 'recover':
        if (timerDone(c)) setState(sim, c, 'prowl');
        return;
      default: { // prowl
        const inNest = c.nestId >= 0;
        if ((sim.state.tick + c.id) % SCAN_EVERY === 0) {
          const v = findVictim(sim, c, { rangeMm: CE.senseMm, inNest });
          if (v && v.speed <= windupMaxTargetSpeed('centipede', cond.levers.telegraphMult) * 3) {
            if (dist(v.pos, c.pos) <= (STRIKE_RANGE_MM.centipede ?? 15) && v.speed <= windupMaxTargetSpeed('centipede', cond.levers.telegraphMult)) {
              beginWindup(sim, c, v);
              setState(sim, c, 'windup');
              return;
            }
            walkTo(sim, c, v.pos, CE.walkMmS * 0.3, (STRIKE_RANGE_MM.centipede ?? 15) * 0.7);
            return;
          }
          if (maybeInvade(sim, c, cond)) return;
        }
        if (c.nav.mode !== 'wander' && c.nav.status !== 'moving') wander(sim, c, c.homeCenter, c.homeRadius > 0 ? c.homeRadius : RESIDENT_HOME_RADIUS_MM, CE.walkMmS * 0.3);
      }
    }
  },
};

// ---------------------------------------------------------------- rove beetle

function secretion(sim: Sim, c: Creature): void {
  c.bb.secretionTick = sim.state.tick;
  stop(sim, c);
  startFlee(sim, c, RB.walkMmS);
}

export const roveBeetle: KindBehaviour = {
  onHit(sim, c) {
    const cooled = sim.state.tick - (c.bb.secretionTick ?? -1e9) >= ticks(ROVE_SECRETION_COOLDOWN_S);
    if (cooled && distinctBiters(sim, c, ROVE_SECRETION_WINDOW_S) >= ROVE_SECRETION_BITERS) secretion(sim, c);
  },
  update(sim, c, cond) {
    switch (c.state) {
      case 'hold': holdState(sim, c); return;
      case 'windup':
        if (!strikeDue(sim, c)) return;
        {
          const out = landStrike(sim, c, true);
          if (out === 'seized') setState(sim, c, 'hold');
          else if (out === 'killed') startFeed(sim, c);
          else startRecover(sim, c);
        }
        return;
      case 'feed': case 'flee': case 'recover':
        if (timerDone(c)) setState(sim, c, 'forage');
        return;
      default: { // forage: erratic dashes in its litter territory
        if ((sim.state.tick + c.id) % SCAN_EVERY === 0) {
          const v = findVictim(sim, c, { rangeMm: RB.senseMm, lone: true });
          if (v && v.speed <= windupMaxTargetSpeed('rove-beetle', cond.levers.telegraphMult)) {
            if (dist(v.pos, c.pos) <= (STRIKE_RANGE_MM['rove-beetle'] ?? 8)) { beginWindup(sim, c, v); setState(sim, c, 'windup'); return; }
            walkTo(sim, c, v.pos, RB.walkMmS * 0.2, (STRIKE_RANGE_MM['rove-beetle'] ?? 8) * 0.7);
            return;
          }
        }
        if (c.nav.mode !== 'wander' && c.nav.status !== 'moving') wander(sim, c, c.homeCenter, c.homeRadius > 0 ? c.homeRadius : RESIDENT_HOME_RADIUS_MM, RB.walkMmS * 0.25);
      }
    }
  },
};

/** Rove-beetle secretion is active (ants within 1.5 L flee 3 s) - read by threatsNear. */
export function secretionActive(sim: Sim, c: Creature, withinS: number): boolean {
  return c.kind === 'rove-beetle' && sim.state.tick - (c.bb.secretionTick ?? -1e9) <= withinS * TICKS_PER_SECOND;
}
