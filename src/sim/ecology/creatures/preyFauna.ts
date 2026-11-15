// Prey the colony hunts (GDD 05 §2.2b, §2.3, §1.5).
//  springtail:  graze -> jump on touch (escape p 0.6 open ground / 0.25 litter) -> vanish after 30 s unseen.
//  mite:        as springtail without the jump; a bite hits half the time.
//  fly-larva:   feed (stationary in ripe carrion; 5 maggots eat 10 % of its P per gd) -> burrow (pupate) when the
//               carcass is gone or after 1.5 gd; wriggles holders off (p 0.1 / s).
//  caterpillar: feed on a leaf -> crawl to the next -> (drop on silk on the first bite p 0.5 / thrash p 0.3 per s
//               per holder / regurgitate every 10 s); hairy variant repels biters; pupates after 3 gd.
//  fruit-fly:   feed 20-60 s -> fly (hop) -> land -> feed; caught only while feeding (p 0.15 per strike).

import type { Creature, Sim } from '@/sim/types';
import { despawnCreature } from '@/sim/entities';
import { rngRange } from '@/core/rng';
import {
  CATERPILLAR_FEED_S, CATERPILLAR_HAIRY_REPEL_S, CATERPILLAR_REGURGITATE_L, CATERPILLAR_REGURGITATE_S, CATERPILLAR_REGURGITATE_STUN_S, CATERPILLAR_SILK_P, CATERPILLAR_SILK_S, CATERPILLAR_THRASH_P,
  CREATURE_STATS, FLY_LARVA_LIFE_GD, FLY_LARVA_WRIGGLE_P, FRUIT_FLY_CATCH_P, FRUIT_FLY_FEED_S, FRUIT_FLY_FLY_S,
  FRUIT_FLY_HOP_MM, FRUIT_FLY_MIN_C, MAGGOT_P_PER_GD_PER_5, MITE_EVADE, PREY_CONTACT_L, PREY_VANISH_S,
  SPRINGTAIL_ESCAPE_LITTER, SPRINGTAIL_ESCAPE_OPEN, SPRINGTAIL_JUMP_MM,
} from '@/sim/balance/creatures';
import { SECONDS_PER_DAY, TICKS_PER_DAY } from '@/sim/time';
import { zoneAt } from '@/sim/world';
import {
  CreatureFlag, antLen, between, chance, cue, dist, holderIds, rng, setState, stop, stunAnt, ticks, timerDone, walkTo, wander,
} from './common';
import { ports } from './ports';
import type { KindBehaviour } from './kinds';

const _ids: number[] = [];
const LITTER_MATERIALS = new Set(['humus', 'leaf-litter', 'litter', 'thatch', 'moss', 'compost', 'bark-mulch']);

/** Ant (any colony) within `l` body lengths: the prey's contact clock resets. */
function antNear(sim: Sim, c: Creature, l: number): number {
  sim.index.queryAnts(c.pos, l * 4 * sim.world.bu, _ids);
  let best = -1, bestD = Infinity;
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (!a) continue;
    const d = dist(a.pos, c.pos);
    if (d <= l * a.lengthBu * sim.world.bu + c.radius && d < bestD) { bestD = d; best = id; }
  }
  return best;
}

/** Litter, humus or thatch under the springtail (escape 0.25) rather than open ground (0.6). */
function inLitter(sim: Sim, c: Creature): boolean {
  const ground = { x: c.pos.x - c.up.x * (c.footOffset + 0.5), y: c.pos.y - c.up.y * (c.footOffset + 0.5), z: c.pos.z - c.up.z * (c.footOffset + 0.5) };
  if (LITTER_MATERIALS.has(sim.field.materialAt(ground))) return true;
  return zoneAt(sim.world, c.pos.x, c.pos.z) === 'forest';
}

/** A springtail's jump: a 60 mm hop in a random direction (a teleport onto the surface; see README "hops"). */
function jump(sim: Sim, c: Creature): void {
  const a = rngRange(rng(sim), 0, 2 * Math.PI);
  const g = { x: c.pos.x - c.up.x * c.footOffset, y: c.pos.y - c.up.y * c.footOffset, z: c.pos.z - c.up.z * c.footOffset };
  ports.placeOnSurface(sim, c, { x: g.x + Math.cos(a) * SPRINGTAIL_JUMP_MM, y: g.y, z: g.z + Math.sin(a) * SPRINGTAIL_JUMP_MM });
  c.bb.jumpCd = sim.state.tick + ticks(2);
  setState(sim, c, 'graze');
}

function patchPrey(jumps: boolean): KindBehaviour {
  return {
    evades(sim, c) {
      if (!jumps) return chance(sim, MITE_EVADE);
      if (chance(sim, inLitter(sim, c) ? SPRINGTAIL_ESCAPE_LITTER : SPRINGTAIL_ESCAPE_OPEN)) {
        jump(sim, c);
        sim.emit({ type: 'prey-escaped', creatureId: c.id, kind: c.kind, antIds: [] });
        return true;
      }
      return false;
    },
    update(sim, c) {
      const near = antNear(sim, c, PREY_CONTACT_L);
      if (near >= 0) c.bb.contact = sim.state.tick;
      else if (sim.state.tick - (c.bb.contact ?? c.stateTick) >= ticks(PREY_VANISH_S)) { despawnCreature(sim, c.id, 'vanished'); return; }
      // jump on touch
      if (jumps && near >= 0 && sim.state.tick >= (c.bb.jumpCd ?? 0) && antNear(sim, c, 1) >= 0) {
        c.bb.jumpCd = sim.state.tick + ticks(2);
        if (chance(sim, inLitter(sim, c) ? SPRINGTAIL_ESCAPE_LITTER : SPRINGTAIL_ESCAPE_OPEN)) { jump(sim, c); return; }
      }
      if (c.nav.mode !== 'wander') wander(sim, c, c.homeCenter, 8 * sim.world.bu, CREATURE_STATS[c.kind].walkMmS * 0.5);
    },
  };
}

export const springtail = patchPrey(true);
export const mite = patchPrey(false);

/** Holders let go with probability p per second (wriggle / thrash), counted every second. */
function shakeHolders(sim: Sim, c: Creature, pPerS: number, onlyIfNotPinned: boolean): void {
  if ((sim.state.tick + c.id) % 10 !== 0) return;
  holderIds(sim, c, c.radius + 4 * sim.world.bu, _ids);
  if (_ids.length === 0) return;
  if (onlyIfNotPinned && _ids.length >= 2) return; // a pinning group holds on
  for (const id of _ids) if (chance(sim, pPerS)) ports.releaseGrapple(sim, id);
  cue(sim, 'prey-struggle', c.pos, Math.min(1, _ids.length / 4));
}

export const flyLarva: KindBehaviour = {
  update(sim, c) {
    if (c.state === 'burrow') { if (timerDone(c)) despawnCreature(sim, c.id, 'pupated'); return; }
    const src = sim.stores.sources.get(c.bb.src ?? -1);
    const old = sim.state.tick - (c.bb.born ?? c.stateTick) >= Math.round(FLY_LARVA_LIFE_GD * TICKS_PER_DAY);
    if (!src || src.units <= 0 || old) { c.flags |= CreatureFlag.HIDDEN; setState(sim, c, 'burrow', 5); return; }
    shakeHolders(sim, c, FLY_LARVA_WRIGGLE_P, false);
    // feeding: every 10 s this maggot eats 1/5 of the 10 %-per-gd share of the carcass' remaining P
    if ((sim.state.tick + c.id) % 100 === 0) src.p *= 1 - (MAGGOT_P_PER_GD_PER_5 / 5) * (10 / SECONDS_PER_DAY);
  },
};

function onFoliage(sim: Sim, c: Creature): boolean {
  return c.pos.y - sim.field.height(c.pos.x, c.pos.z) > 2 * sim.world.bu || c.up.y < 0.7;
}

/** Every 10 s after the first bite: ants within 1 L that bit it in that time are stunned 2 s (and let go). */
function regurgitate(sim: Sim, c: Creature): void {
  c.bb.regurgAt = sim.state.tick + ticks(CATERPILLAR_REGURGITATE_S);
  cue(sim, 'prey-struggle', c.pos, 0.8);
  sim.index.queryAnts(c.pos, c.radius + 2 * sim.world.bu, _ids);
  _ids.sort((a, b) => a - b);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    const bit = c.bb[`bit.${id}`];
    const biter = bit !== undefined && sim.state.tick - bit <= ticks(CATERPILLAR_REGURGITATE_S);
    if (a && biter && dist(a.pos, c.pos) <= c.radius + CATERPILLAR_REGURGITATE_L * antLen(sim, a)) stunAnt(sim, a, CATERPILLAR_REGURGITATE_STUN_S);
  }
}

export const caterpillar: KindBehaviour = {
  evades(sim, c) {
    return c.state === 'silk';
  },
  onHit(sim, c, antId) {
    const biter = sim.stores.ants.get(antId);
    if ((c.flags & CreatureFlag.HAIRY) !== 0) { if (biter) stunAnt(sim, biter, CATERPILLAR_HAIRY_REPEL_S); return; }
    if (!c.bb.bitten) {
      c.bb.bitten = 1;
      c.bb.regurgAt = sim.state.tick + ticks(CATERPILLAR_REGURGITATE_S);
      if (onFoliage(sim, c) && chance(sim, CATERPILLAR_SILK_P)) {
        holderIds(sim, c, c.radius + 4 * sim.world.bu, _ids);
        for (const id of _ids) ports.releaseGrapple(sim, id);
        c.flags |= CreatureFlag.ON_SILK;
        setState(sim, c, 'silk', CATERPILLAR_SILK_S);
        ports.navStop(sim, c);
      }
    }
  },
  update(sim, c) {
    if (c.lifeEndTick >= 0 && sim.state.tick >= c.lifeEndTick) { despawnCreature(sim, c.id, 'pupated'); return; }
    if (c.state === 'silk') {
      if (timerDone(c)) { c.flags &= ~CreatureFlag.ON_SILK; setState(sim, c, 'feed', between(sim, CATERPILLAR_FEED_S)); }
      return;
    }
    shakeHolders(sim, c, CATERPILLAR_THRASH_P, true);
    // held: it thrashes where it is (combat moves locked targets)
    if (c.bb.bitten && sim.state.tick >= (c.bb.regurgAt ?? 0)) regurgitate(sim, c);
    if ((sim.state.tick + c.id) % 10 === 0) c.bb.held = holderIds(sim, c, c.radius + 4 * sim.world.bu, _ids).length;
    if ((c.bb.held ?? 0) > 0) { stop(sim, c); return; }
    if (c.state === 'crawl') {
      if (c.nav.status !== 'moving') setState(sim, c, 'feed', between(sim, CATERPILLAR_FEED_S));
      return;
    }
    if (c.state !== 'feed') setState(sim, c, 'feed', between(sim, CATERPILLAR_FEED_S));
    if (timerDone(c)) {
      const a = rngRange(rng(sim), 0, 2 * Math.PI), d = rngRange(rng(sim), 10, 30);
      const g = c.homeCenter;
      walkTo(sim, c, { x: g.x + Math.cos(a) * d, y: g.y, z: g.z + Math.sin(a) * d }, CREATURE_STATS.caterpillar.walkMmS, 3);
      setState(sim, c, 'crawl');
    }
  },
};

function fruitFlyHop(sim: Sim, c: Creature): void {
  c.flags |= CreatureFlag.FLYING | CreatureFlag.HIDDEN;
  setState(sim, c, 'fly', between(sim, FRUIT_FLY_FLY_S));
  cue(sim, 'wing-buzz', c.pos, 0.3);
}

export const fruitFly: KindBehaviour = {
  evades(sim, c) {
    if (c.state !== 'feed' || chance(sim, 1 - FRUIT_FLY_CATCH_P)) { fruitFlyHop(sim, c); return true; }
    return false;
  },
  update(sim, c, cond) {
    const src = sim.stores.sources.get(c.bb.src ?? -1);
    if (!src || !cond.day || cond.airC < FRUIT_FLY_MIN_C) { despawnCreature(sim, c.id, 'flew-off'); return; }
    if (c.state === 'fly') {
      if (!timerDone(c)) return;
      const a = rngRange(rng(sim), 0, 2 * Math.PI), d = between(sim, FRUIT_FLY_HOP_MM);
      c.flags &= ~(CreatureFlag.FLYING | CreatureFlag.HIDDEN);
      if (!ports.placeOnSurface(sim, c, { x: src.pos.x + Math.cos(a) * d * 0.3, y: src.pos.y, z: src.pos.z + Math.sin(a) * d * 0.3 })) {
        despawnCreature(sim, c.id, 'flew-off');
        return;
      }
      setState(sim, c, 'feed', between(sim, FRUIT_FLY_FEED_S));
      return;
    }
    if (c.state !== 'feed') setState(sim, c, 'feed', between(sim, FRUIT_FLY_FEED_S));
    if (timerDone(c)) fruitFlyHop(sim, c);
  },
};
