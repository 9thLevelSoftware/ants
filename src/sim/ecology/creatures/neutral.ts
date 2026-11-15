// Neutral fauna that makes the world feel alive (GDD 05 §2.2b). Ignored by AI ants; obstacles; food when dead.
//  woodlouse: shelter (by day, at home under cover) <-> wander / graze (night, damp); roll when bitten >= 2 times
//             (half of them): armour 0.9, still for 20 s. Residents, never despawn.
//  earthworm: surface (night, rain) -> return (burrows at dawn); stranded on hard ground after rain -> dying 0.3 gd
//             in daylight -> dead (large carcass, 120 P).
//  snail:     graze <-> crawl leaving a slime trail (ant speed x0.7 for 0.5 gd) -> retract when touched; goes into
//             cover at dawn.
//  millipede: wander (night) -> coil when bitten (+ secretion: the biter flees 4 s, no alarm); cover at dawn.

import type { Creature, Sim } from '@/sim/types';
import { despawnCreature } from '@/sim/entities';
import { zoneAt } from '@/sim/world';
import {
  CREATURE_STATS, GRAZE_S, MILLIPEDE_COIL_S, SLIME_LIFE_GD, SLIME_MAX, SLIME_RADIUS_MM, SLIME_SPACING_MM,
  SNAIL_RETRACT_S, WANDER_S, WOODLOUSE_ROLL_BITES, WOODLOUSE_ROLL_S, WORM_DYING_GD,
} from '@/sim/balance/creatures';
import { TICKS_PER_DAY } from '@/sim/time';
import { CreatureFlag, between, dist, dist2D, setState, stop, timerDone, walkTo, wander } from './common';
import type { Conditions } from './conditions';
import { creatureDies } from './prey';
import type { KindBehaviour } from './kinds';

const HARD_ZONES = new Set(['pavement', 'asphalt']);
/** Going into cover / burrowing takes this long before the animal is gone, s. */
const COVER_S = 8;

function outside(cond: Conditions): boolean {
  return cond.dark || cond.raining;
}

/** Alternates wander and graze around home. */
function forage(sim: Sim, c: Creature, speed: number, radius: number): void {
  if (!timerDone(c) && (c.state === 'wander' || c.state === 'graze')) return;
  if (c.state === 'wander') { stop(sim, c); setState(sim, c, 'graze', between(sim, GRAZE_S)); return; }
  setState(sim, c, 'wander', between(sim, WANDER_S));
  wander(sim, c, c.homeCenter, radius, speed);
}

function curl(sim: Sim, c: Creature, state: string, seconds: number): void {
  c.flags |= CreatureFlag.CURLED;
  stop(sim, c);
  setState(sim, c, state, seconds);
}

function uncurlDone(c: Creature): boolean {
  if (!timerDone(c)) return false;
  c.flags &= ~CreatureFlag.CURLED;
  return true;
}

/** Walk home and disappear into cover (dawn). */
function intoCover(sim: Sim, c: Creature, speed: number): void {
  if (c.state !== 'cover') { setState(sim, c, 'cover', COVER_S * 4); walkTo(sim, c, c.homeCenter, speed, 6); return; }
  if (timerDone(c) || c.nav.status !== 'moving') despawnCreature(sim, c.id, 'into-cover');
}

export const woodlouse: KindBehaviour = {
  onHit(sim, c) {
    if (c.bb.roller === 1 && c.harass >= WOODLOUSE_ROLL_BITES && c.state !== 'roll') curl(sim, c, 'roll', WOODLOUSE_ROLL_S);
  },
  update(sim, c, cond) {
    const st = CREATURE_STATS.woodlouse;
    if (c.state === 'roll') { if (uncurlDone(c)) setState(sim, c, 'shelter'); return; }
    if (!outside(cond)) {
      if (c.state !== 'shelter') { setState(sim, c, 'shelter'); walkTo(sim, c, c.homeCenter, st.walkMmS * 0.5, 6); }
      return;
    }
    forage(sim, c, st.walkMmS * 0.3, c.homeRadius > 0 ? c.homeRadius : 200);
  },
};

export const earthworm: KindBehaviour = {
  update(sim, c, cond) {
    const st = CREATURE_STATS.earthworm;
    if (c.state === 'dying') { if (timerDone(c)) creatureDies(sim, c, 'stranded'); return; }
    if (c.state === 'return') { if (timerDone(c)) despawnCreature(sim, c.id, 'burrowed'); return; }
    const onHard = HARD_ZONES.has(zoneAt(sim.world, c.pos.x, c.pos.z));
    if (!outside(cond)) {
      if (c.bb.stranded === 1 || onHard) { stop(sim, c); setState(sim, c, 'dying', 0); c.stateTimer = Math.round(WORM_DYING_GD * TICKS_PER_DAY); return; }
      c.flags |= CreatureFlag.HIDDEN;
      setState(sim, c, 'return', COVER_S);
      stop(sim, c);
      return;
    }
    if (c.bb.stranded === 1) { if (c.nav.mode !== 'wander') wander(sim, c, c.homeCenter, 60, st.walkMmS * 0.5); return; }
    if (c.state !== 'surface') setState(sim, c, 'surface');
    if (c.nav.mode !== 'wander') wander(sim, c, c.homeCenter, c.homeRadius > 0 ? c.homeRadius : 200, st.walkMmS);
  },
};

/** Lays a slime-trail hazard every SLIME_SPACING_MM travelled (oldest dropped above SLIME_MAX). */
function slime(sim: Sim, c: Creature): void {
  const last = { x: c.bb.slX ?? Infinity, y: 0, z: c.bb.slZ ?? Infinity };
  if (Number.isFinite(last.x) && dist2D(last, c.pos) < SLIME_SPACING_MM) return;
  c.bb.slX = c.pos.x; c.bb.slZ = c.pos.z;
  const hz = sim.state.ecology.hazards;
  let n = 0;
  for (const h of hz) if (h.kind === 'slime-trail') n++;
  if (n >= SLIME_MAX) { const i = hz.findIndex((h) => h.kind === 'slime-trail'); if (i >= 0) hz.splice(i, 1); }
  hz.push({
    id: sim.state.nextId++, kind: 'slime-trail', pos: { x: c.pos.x, y: c.pos.y - c.footOffset, z: c.pos.z }, radius: SLIME_RADIUS_MM,
    depth: 0, state: 'fresh', knownBy: 0, untilTick: sim.state.tick + Math.round(SLIME_LIFE_GD * TICKS_PER_DAY),
  });
}

/** An ant touching the snail (within its radius + 1 mm). */
function touched(sim: Sim, c: Creature): boolean {
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, c.radius + 2 * sim.world.bu, ids);
  for (const id of ids) { const a = sim.stores.ants.get(id); if (a && dist(a.pos, c.pos) <= c.radius + a.radius + 1) return true; }
  return false;
}

export const snail: KindBehaviour = {
  onHit(sim, c) { if (c.state !== 'retract') curl(sim, c, 'retract', SNAIL_RETRACT_S); },
  update(sim, c, cond) {
    const st = CREATURE_STATS.snail;
    if (c.state === 'retract') { if (uncurlDone(c)) setState(sim, c, 'graze', between(sim, GRAZE_S)); return; }
    if (!outside(cond)) { intoCover(sim, c, st.walkMmS); return; }
    if ((sim.state.tick + c.id) % 10 === 0 && touched(sim, c)) { curl(sim, c, 'retract', SNAIL_RETRACT_S); return; }
    if (c.state === 'wander' && c.speed > 0) slime(sim, c);
    forage(sim, c, st.walkMmS, c.homeRadius > 0 ? c.homeRadius : 300);
  },
};

export const millipede: KindBehaviour = {
  onHit(sim, c) {
    if (c.state !== 'coil') { c.bb.secretionTick = sim.state.tick; curl(sim, c, 'coil', MILLIPEDE_COIL_S); }
  },
  update(sim, c, cond) {
    const st = CREATURE_STATS.millipede;
    if (c.state === 'coil') { if (uncurlDone(c)) setState(sim, c, 'wander'); return; }
    if (!outside(cond)) { intoCover(sim, c, st.walkMmS); return; }
    forage(sim, c, st.walkMmS * 0.3, c.homeRadius > 0 ? c.homeRadius : 200);
  },
};

/** Expires slime trails (called by the director). */
export function expireHazards(sim: Sim): void {
  const hz = sim.state.ecology.hazards;
  for (let i = hz.length - 1; i >= 0; i--) {
    const u = hz[i].untilTick;
    if (u !== undefined && sim.state.tick >= u) hz.splice(i, 1);
  }
}
