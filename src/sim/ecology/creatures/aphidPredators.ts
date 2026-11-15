// Aphid predators acting on herds (GDD 05 §1.4, §2.2b).
//  ladybird:       fly-in -> feed (1 aphid / 6 s) -> fly-off (harass >= 6: repelled; 60 eaten; dusk) -> gone.
//                  Reflex bleeding: a bite makes the biter let go with p 0.25. After >= 20 eaten: larvae (p 0.5, 1-3)
//                  hatch 0.5 gd later at the herd (days 4-16).
//  ladybird-larva: egg (0.5 gd, hidden) -> crawl -> feed (1 / 10 s) -> drop-off (harass >= 10: 50 BU away);
//                  pupates after 3 gd.
//  lacewing-larva: crawl -> feed (1 / 8 s) -> leave (harass >= 8); bites an ant holding it (2.0 per 2 s);
//                  only tenders within 1 L notice it (30 % per s, debris camouflage); pupates after 3 gd.
// Arrival: hourly per herd with A >= 40, days 3-19, air >= 12 C, by day.

import type { Creature, Herd, Sim } from '@/sim/types';
import { colonySlotBit, despawnCreature } from '@/sim/entities';
import {
  APHID_PRED_DAYS, APHID_PRED_MIN_A, APHID_PRED_MIN_C, CREATURE_STATS, FLY_PHASE_S, HERD_STAND_MM, LACEWING_APHIDS_PER,
  LACEWING_ARRIVAL_PER_H, LACEWING_BITE_DMG, LACEWING_BITE_EVERY_S, LACEWING_DAYS, LACEWING_DETECT_L,
  LACEWING_DETECT_P_PER_S, LACEWING_EAT_S, LACEWING_HARASS_LEAVE, LADYBIRD_APHIDS_PER, LADYBIRD_ARRIVAL_PER_H,
  LADYBIRD_AUTUMN_MULT, LADYBIRD_BLEED_P, LADYBIRD_EAT_S, LADYBIRD_HARASS_LEAVE, LADYBIRD_LARVA_APHIDS_PER,
  LADYBIRD_LARVA_DROP_BU, LADYBIRD_LARVA_EAT_S, LADYBIRD_LARVA_HARASS_LEAVE, LADYBIRD_MAX_EATEN, LARVA_COUNT,
  LARVA_DAYS, LARVA_DELAY_GD, LARVA_P, LARVA_TRIGGER_EATEN, PUPATE_GD, REF_BU_MM,
} from '@/sim/balance/creatures';
import { SECONDS_PER_DAY, TICKS_PER_DAY } from '@/sim/time';
import { rngInt } from '@/core/rng';
import { CreatureFlag, antLen, awayPoint, chance, cue, dist, rng, setState, ticks, timerDone, walkTo } from './common';
import { conditions, inDays, type Conditions } from './conditions';
import { spawnKind } from './spawn';
import { capOf } from './caps';
import { ports } from './ports';
import type { KindBehaviour } from './kinds';

/** Where a herd sits: its plant's aphid-site point (by segment), else the plant object, else its film source. */
export function herdSite(sim: Sim, herd: Herd): { x: number; y: number; z: number } | null {
  const plant = sim.stores.plants.get(herd.hostId);
  const obj = plant ? sim.world.objects.find((o) => o.id === plant.objectId) : undefined;
  if (obj) {
    const pois = sim.world.pois.filter((p) => obj.poiIds.includes(p.id) && p.kind === 'aphid-site');
    if (pois.length > 0) return { ...pois[Math.abs(herd.segment) % pois.length].pos };
    return { ...obj.pos };
  }
  const film = sim.stores.sources.get(herd.filmSourceId);
  return film ? { ...film.pos } : null;
}

/** Local adapter for the plants module's `herdDamage` (not landed yet): predation removes aphids in real time. */
export function eatAphids(herd: Herd, n: number): number {
  const eaten = Math.min(herd.a, n);
  herd.a -= eaten;
  return eaten;
}

function herdOf(sim: Sim, c: Creature): Herd | undefined {
  return sim.stores.herds.get(c.bb.herd ?? -1);
}

function leaveHerd(sim: Sim, c: Creature, repelled: boolean): void {
  const h = herdOf(sim, c);
  if (h) {
    h.predators = h.predators.filter((id) => id !== c.id);
    if (repelled) sim.emit({ type: 'herd-predator-repelled', herdId: h.id, creatureId: c.id, kind: c.kind });
    else sim.emit({ type: 'herd-predator-left', herdId: h.id, creatureId: c.id, kind: c.kind });
  }
  c.bb.herd = -1;
}

function eatTick(sim: Sim, c: Creature, everyS: number): void {
  const h = herdOf(sim, c);
  if (!h) return;
  if ((sim.state.tick - c.stateTick) <= 0 || (sim.state.tick - c.stateTick) % ticks(everyS) !== 0) return;
  c.eaten += eatAphids(h, 1);
  // fewer aphids on the map than the present predators need (I4): the newest move on
  trackAphids(sim);
}

// ---------------------------------------------------------------- ladybird

function ladybirdFlyOff(sim: Sim, c: Creature, repelled: boolean): void {
  leaveHerd(sim, c, repelled);
  if (c.eaten >= LARVA_TRIGGER_EATEN) layLarvae(sim, c);
  c.flags |= CreatureFlag.FLYING;
  setState(sim, c, 'fly-off', FLY_PHASE_S);
  cue(sim, 'wing-buzz', c.pos, 0.5);
}

/**
 * Aphid predators track the aphids (I4): when the map's aphids fall below what the present predators need (their
 * per-aphid cap), the newest arrivals leave (ladybirds fly off, larvae walk away and are gone). Debug-placed ones
 * (bb.forced) stay; `busy` ones (held by ants) stay until free.
 */
export function trackAphids(sim: Sim, busy: (sim: Sim, c: Creature) => boolean = () => false): void {
  for (const kind of ['ladybird', 'ladybird-larva', 'lacewing-larva'] as const) {
    const present = sim.stores.creatures.list
      .filter((c) => c.alive && c.kind === kind && c.state !== 'fly-off' && c.state !== 'egg' && c.bb.forced !== 1)
      .sort((a, b) => b.id - a.id);
    let excess = present.length - capOf(sim, kind);
    for (const c of present) {
      if (excess <= 0) break;
      if (busy(sim, c)) continue;
      if (kind === 'ladybird') ladybirdFlyOff(sim, c, false);
      else { leaveHerd(sim, c, false); despawnCreature(sim, c.id, 'left'); }
      excess--;
    }
  }
}

function layLarvae(sim: Sim, c: Creature): void {
  const cond = conditions(sim);
  const herdId = c.bb.lastHerd ?? -1;
  if (!inDays(cond, LARVA_DAYS) || herdId < 0 || !chance(sim, LARVA_P)) return;
  const n = rngInt(rng(sim), LARVA_COUNT[0], LARVA_COUNT[1]);
  const cap = Math.min(CREATURE_STATS['ladybird-larva'].cap, Math.floor(totalAphids(sim) / LADYBIRD_LARVA_APHIDS_PER));
  for (let i = 0; i < n && countKind(sim, 'ladybird-larva') < cap; i++) {
    spawnKind(sim, 'ladybird-larva', c.homeCenter, {
      state: 'egg', stateS: LARVA_DELAY_GD * SECONDS_PER_DAY, flags: CreatureFlag.HIDDEN, bb: { herd: herdId },
      lifeEndTick: sim.state.tick + Math.round((LARVA_DELAY_GD + PUPATE_GD) * TICKS_PER_DAY),
    });
  }
}

export const ladybird: KindBehaviour = {
  onHit(sim, c, antId, kind) {
    if (kind === 'bite' && antId >= 0 && chance(sim, LADYBIRD_BLEED_P)) ports.releaseGrapple(sim, antId);
    if (c.state !== 'fly-off' && c.harass >= LADYBIRD_HARASS_LEAVE) ladybirdFlyOff(sim, c, true);
  },
  update(sim, c, cond) {
    switch (c.state) {
      case 'fly-in':
        if (timerDone(c)) { c.flags &= ~CreatureFlag.FLYING; setState(sim, c, 'feed'); }
        return;
      case 'fly-off':
        if (timerDone(c)) despawnCreature(sim, c.id, 'flew-off');
        return;
      default: { // feed
        const h = herdOf(sim, c);
        if (!h || h.a <= 0 || c.eaten >= LADYBIRD_MAX_EATEN || cond.phase === 'dusk' || cond.phase === 'night') { ladybirdFlyOff(sim, c, false); return; }
        if (c.state !== 'feed') setState(sim, c, 'feed');
        eatTick(sim, c, LADYBIRD_EAT_S);
      }
    }
  },
};

// ---------------------------------------------------------------- larvae

function larvaFeed(sim: Sim, c: Creature, eatS: number, harassLeave: number): void {
  const h = herdOf(sim, c);
  if (!h || h.a <= 0) { leaveHerd(sim, c, false); setState(sim, c, 'wander'); return; }
  if (c.harass >= harassLeave) {
    leaveHerd(sim, c, true);
    const to = awayPoint(c.pos, c.homeCenter, LADYBIRD_LARVA_DROP_BU * REF_BU_MM, { x: 0, y: 0, z: 0 });
    if (dist(to, c.pos) < 1) to.x += LADYBIRD_LARVA_DROP_BU * REF_BU_MM;
    walkTo(sim, c, to, CREATURE_STATS[c.kind].walkMmS, 4);
    setState(sim, c, 'drop-off');
    return;
  }
  eatTick(sim, c, eatS);
}

function crawlTo(sim: Sim, c: Creature): void {
  const h = herdOf(sim, c);
  const site = h ? herdSite(sim, h) : null;
  if (!h || !site) { setState(sim, c, 'wander'); return; }
  if (dist(c.pos, site) <= HERD_STAND_MM + c.radius + 2) {
    if (!h.predators.includes(c.id)) h.predators.push(c.id);
    setState(sim, c, 'feed');
    return;
  }
  if (c.nav.status !== 'moving') walkTo(sim, c, site, CREATURE_STATS[c.kind].walkMmS, HERD_STAND_MM);
}

export const ladybirdLarva: KindBehaviour = {
  update(sim, c) {
    if (c.lifeEndTick >= 0 && sim.state.tick >= c.lifeEndTick) { leaveHerd(sim, c, false); despawnCreature(sim, c.id, 'pupated'); return; }
    switch (c.state) {
      case 'egg':
        if (!timerDone(c)) return;
        // hatchlings beyond what the aphids on the map support do not stay (I4)
        if (countActive(sim, 'ladybird-larva') >= capOf(sim, 'ladybird-larva')) { despawnCreature(sim, c.id, 'left'); return; }
        c.flags &= ~CreatureFlag.HIDDEN;
        setState(sim, c, 'crawl');
        return;
      case 'crawl': crawlTo(sim, c); return;
      case 'feed': larvaFeed(sim, c, LADYBIRD_LARVA_EAT_S, LADYBIRD_LARVA_HARASS_LEAVE); return;
      default: return; // drop-off / wander: idle until pupation
    }
  },
};

/** Tenders within 1 L notice the camouflaged larva at 30 % per s (bb.seen = colony slot bits). */
function lacewingNoticed(sim: Sim, c: Creature): void {
  if ((sim.state.tick + c.id) % 10 !== 0) return;
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, 2 * sim.world.bu + c.radius, ids);
  for (const id of ids.sort((a, b) => a - b)) {
    const a = sim.stores.ants.get(id);
    if (!a || dist(a.pos, c.pos) > LACEWING_DETECT_L * antLen(sim, a) + c.radius) continue;
    if (chance(sim, LACEWING_DETECT_P_PER_S)) c.bb.seen = (c.bb.seen ?? 0) | colonySlotBit(sim, a.colony);
  }
}

/** Bites an ant locked on it: 2.0 damage every 2 s. */
function lacewingBitesBack(sim: Sim, c: Creature): void {
  if ((sim.state.tick - c.stateTick) % ticks(LACEWING_BITE_EVERY_S) !== 0) return;
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, c.radius + 4 * sim.world.bu, ids);
  for (const id of ids.sort((a, b) => a - b)) {
    const a = sim.stores.ants.get(id);
    const l = a?.combat?.lock;
    if (a && l && l.targetKind === 'creature' && l.targetId === c.id) {
      ports.applyDamage(sim, 'ant', a.id, LACEWING_BITE_DMG, 'combat');
      return;
    }
  }
}

export const lacewingLarva: KindBehaviour = {
  update(sim, c) {
    if (c.lifeEndTick >= 0 && sim.state.tick >= c.lifeEndTick) { leaveHerd(sim, c, false); despawnCreature(sim, c.id, 'pupated'); return; }
    lacewingNoticed(sim, c);
    switch (c.state) {
      case 'crawl': crawlTo(sim, c); return;
      case 'feed': lacewingBitesBack(sim, c); larvaFeed(sim, c, LACEWING_EAT_S, LACEWING_HARASS_LEAVE); return;
      default: return;
    }
  },
};

// ---------------------------------------------------------------- arrivals (hourly)

export function totalAphids(sim: Sim): number {
  let n = 0;
  for (const h of sim.stores.herds.list) if (h.alive) n += h.a;
  return n;
}

/** Present (not unhatched, not leaving) creatures of a kind. */
function countActive(sim: Sim, kind: Creature['kind']): number {
  let n = 0;
  for (const c of sim.stores.creatures.list) if (c.alive && c.kind === kind && c.state !== 'egg' && c.state !== 'fly-off') n++;
  return n;
}

export function countKind(sim: Sim, kind: Creature['kind']): number {
  let n = 0;
  for (const c of sim.stores.creatures.list) if (c.alive && c.kind === kind) n++;
  return n;
}

/**
 * Arrival of a ladybird / lacewing larva at a herd. `forced` (debug and tests: GDD 05 E4 "a spawned ladybird")
 * exempts it from leaving when the map's aphids drop below its per-aphid cap.
 */
export function arriveAt(sim: Sim, herd: Herd, kind: 'ladybird' | 'lacewing-larva', forced = false): Creature | null {
  const site = herdSite(sim, herd);
  if (!site) return null;
  const c = spawnKind(sim, kind, site, {
    state: kind === 'ladybird' ? 'fly-in' : 'crawl', stateS: kind === 'ladybird' ? FLY_PHASE_S : 0,
    flags: kind === 'ladybird' ? CreatureFlag.FLYING : 0, bb: { herd: herd.id, lastHerd: herd.id, forced: forced ? 1 : 0 },
    lifeEndTick: kind === 'lacewing-larva' ? sim.state.tick + Math.round(PUPATE_GD * TICKS_PER_DAY) : -1,
  });
  if (!c) return null;
  if (!herd.predators.includes(c.id)) herd.predators.push(c.id);
  sim.emit({ type: 'herd-predator-arrived', herdId: herd.id, creatureId: c.id, kind });
  if (kind === 'ladybird') cue(sim, 'wing-buzz', c.pos, 0.5);
  return c;
}

/** Hourly arrival rolls (§1.4 table). */
export function aphidPredatorArrivals(sim: Sim, cond: Conditions): void {
  if (!inDays(cond, APHID_PRED_DAYS) || cond.airC < APHID_PRED_MIN_C || cond.phase === 'night' || cond.phase === 'dusk') return;
  const total = totalAphids(sim);
  const mult = cond.levers.aphidPredatorMult;
  const ladyCap = Math.min(CREATURE_STATS.ladybird.cap, Math.floor(total / LADYBIRD_APHIDS_PER));
  const laceCap = Math.min(CREATURE_STATS['lacewing-larva'].cap, Math.floor(total / LACEWING_APHIDS_PER));
  for (const h of sim.stores.herds.list) {
    if (!h.alive || h.a < APHID_PRED_MIN_A) continue;
    const autumn = cond.season === 'autumn' ? LADYBIRD_AUTUMN_MULT : 1;
    if (countKind(sim, 'ladybird') < ladyCap && chance(sim, LADYBIRD_ARRIVAL_PER_H * (h.a / 100) * autumn * mult)) arriveAt(sim, h, 'ladybird');
    if (inDays(cond, LACEWING_DAYS) && countKind(sim, 'lacewing-larva') < laceCap && chance(sim, LACEWING_ARRIVAL_PER_H * (h.a / 100) * mult)) arriveAt(sim, h, 'lacewing-larva');
  }
}
