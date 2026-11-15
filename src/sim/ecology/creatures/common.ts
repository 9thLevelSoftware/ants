// Shared helpers of the creature state machines: timers, stats, RNG, ant queries and steering requests.
// Creatures never move themselves: they ask locomotion (ports.nav*) and poll nav.status, like ants.

import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngRange, type RngState } from '@/core/rng';
import type { Ant, Creature, CreatureKind, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { CATERPILLAR_MEDIUM, CREATURE_STATS, type CreatureStats } from '@/sim/balance/creatures';
import { ports } from './ports';

/** Creature.flags bits owned by this module (render reads them; see README). Append only. */
export const CreatureFlag = {
  /** Not visible / not interactive (eggs, burrowed, in cover, in flight between hops). */
  HIDDEN: 1 << 0,
  /** Woodlouse rolled, millipede coiled, snail retracted: armoured, not moving. */
  CURLED: 1 << 1,
  /** Dormant (antlion in winter / wet sand). */
  DORMANT: 1 << 2,
  /** In visible flight (ladybird fly-in / fly-off, fruit fly hop). */
  FLYING: 1 << 3,
  /** Hanging on silk out of reach (caterpillar). */
  ON_SILK: 1 << 4,
  /** Subdued prey: no longer struggling, dies soon. */
  SUBDUED: 1 << 5,
  /** Hairy caterpillar (ignored by AI ants, repels biters). */
  HAIRY: 1 << 6,
} as const;

export function ticks(s: number): number {
  return Math.round(s * TICKS_PER_SECOND);
}

export function rng(sim: Sim): RngState {
  return sim.stream('rng.creatures');
}

export function chance(sim: Sim, p: number): boolean {
  return p > 0 && (p >= 1 || rngFloat(rng(sim)) < p);
}

export function between(sim: Sim, r: readonly [number, number]): number {
  return rngRange(rng(sim), r[0], r[1]);
}

/** Enters a state; the timer counts down `seconds` (0 = none). */
export function setState(sim: Sim, c: Creature, state: string, seconds = 0): void {
  c.state = state;
  c.stateTick = sim.state.tick;
  c.stateTimer = seconds > 0 ? ticks(seconds) : 0;
}

/** Counts the state timer down by one tick; true when it reached 0 this tick (or was already 0). */
export function timerDone(c: Creature): boolean {
  if (c.stateTimer > 0) c.stateTimer--;
  return c.stateTimer <= 0;
}

/** Catalogue row of a creature, with the medium caterpillar variant applied. */
export function statsOf(c: Pick<Creature, 'kind' | 'variant'>): CreatureStats {
  const base = CREATURE_STATS[c.kind];
  if (c.kind === 'caterpillar' && c.variant === 'medium') {
    return { ...base, sizeMm: CATERPILLAR_MEDIUM.sizeMm, massMg: CATERPILLAR_MEDIUM.massMg, maxHp: CATERPILLAR_MEDIUM.maxHp,
      pull: CATERPILLAR_MEDIUM.pull, deadP: CATERPILLAR_MEDIUM.deadP, deadC: CATERPILLAR_MEDIUM.deadC, deadBulk: CATERPILLAR_MEDIUM.deadBulk };
  }
  return base;
}

export function statsOfKind(kind: CreatureKind): CreatureStats {
  return CREATURE_STATS[kind];
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function dist2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Body length of an ant, mm (L of GDD 05). */
export function antLen(sim: Sim, ant: Ant): number {
  return (ant.lengthBu > 0 ? ant.lengthBu : 1) * sim.world.bu;
}

/** On the open surface (not in a nest, not flying). */
export function onSurface(ant: Ant): boolean {
  return ant.alive && ant.nestId < 0 && ant.medium === 'surface';
}

export function isPossessed(sim: Sim, ant: Ant): boolean {
  return (ant.flags & AntFlag.POSSESSED) !== 0 && sim.state.player.possessedAntId === ant.id;
}

const _ids: number[] = [];

/** Ant ids within r of p (exact distance), ascending, into out. */
export function antsWithin(sim: Sim, p: Vec3, r: number, out: number[]): number[] {
  out.length = 0;
  sim.index.queryAnts(p, r, _ids);
  for (let i = 0; i < _ids.length; i++) {
    const a = sim.stores.ants.get(_ids[i]);
    if (a && dist(a.pos, p) <= r) out.push(a.id);
  }
  out.sort((x, y) => x - y);
  return out;
}

/** Another living ant of the same colony within r of the ant. */
export function nestmateWithin(sim: Sim, ant: Ant, r: number): boolean {
  sim.index.queryAnts(ant.pos, r, _ids);
  for (let i = 0; i < _ids.length; i++) {
    if (_ids[i] === ant.id) continue;
    const a = sim.stores.ants.get(_ids[i]);
    if (a && a.colony === ant.colony && dist(a.pos, ant.pos) <= r) return true;
  }
  return false;
}

/** Ants holding the creature in a grapple lock (combat state), counted. */
export function holdersOf(sim: Sim, c: Creature, radius: number): number {
  let n = 0;
  sim.index.queryAnts(c.pos, radius, _ids);
  for (let i = 0; i < _ids.length; i++) {
    const a = sim.stores.ants.get(_ids[i]);
    const l = a?.combat?.lock;
    if (l && l.targetKind === 'creature' && l.targetId === c.id) n++;
  }
  return n;
}

/** Holder ids of the creature (ascending). */
export function holderIds(sim: Sim, c: Creature, radius: number, out: number[]): number[] {
  out.length = 0;
  sim.index.queryAnts(c.pos, radius, _ids);
  for (let i = 0; i < _ids.length; i++) {
    const a = sim.stores.ants.get(_ids[i]);
    const l = a?.combat?.lock;
    if (l && l.targetKind === 'creature' && l.targetId === c.id) out.push(a!.id);
  }
  out.sort((x, y) => x - y);
  return out;
}

// ---- steering (through locomotion) ----

export function walkTo(sim: Sim, c: Creature, dest: Vec3, speedMmS: number, arriveMm: number): boolean {
  return ports.navTo(sim, c, dest, Math.max(0.5, arriveMm), { speed: speedMmS });
}

export function wander(sim: Sim, c: Creature, center: Vec3, radiusMm: number, speedMmS: number): boolean {
  return ports.navWander(sim, c, center, radiusMm, { speed: speedMmS });
}

export function stop(sim: Sim, c: Creature): void {
  if (c.nav.status !== 'idle' || c.nav.mode !== 'none') ports.navStop(sim, c);
}

/** A point `d` mm from `from` directly away from `threat` (horizontal), for fleeing. */
export function awayPoint(from: Vec3, threat: Vec3, d: number, out: Vec3): Vec3 {
  let dx = from.x - threat.x, dz = from.z - threat.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  out.x = from.x + dx * d; out.y = from.y; out.z = from.z + dz * d;
  return out;
}

/** Turns the creature's heading toward a point in its tangent plane (pose hint; locomotion owns real turning). */
export function face(c: Creature, p: Vec3): void {
  let dx = p.x - c.pos.x, dy = p.y - c.pos.y, dz = p.z - c.pos.z;
  const k = dx * c.up.x + dy * c.up.y + dz * c.up.z;
  dx -= k * c.up.x; dy -= k * c.up.y; dz -= k * c.up.z;
  const l = Math.hypot(dx, dy, dz);
  if (l > 1e-6) { c.fwd.x = dx / l; c.fwd.y = dy / l; c.fwd.z = dz / l; }
}

/** Seconds since the creature entered its current state. */
export function inStateS(sim: Sim, c: Creature): number {
  return (sim.state.tick - c.stateTick) / TICKS_PER_SECOND;
}

/** ant.bb key: tick until which a creature's defence keeps the ant from biting (read by combat / behaviours). */
export const BB_STUNNED = 'cr.stunUntil';

/**
 * A creature defence stuns an ant (ladybird reflex bleeding, caterpillar regurgitation, hairy caterpillar): its
 * lock on the creature breaks and it cannot bite for `seconds` (the bite cooldown is pushed back; there is no
 * stun field in CombatState, see the report).
 */
export function stunAnt(sim: Sim, ant: Ant, seconds: number): void {
  if (ant.combat?.lock) ports.releaseGrapple(sim, ant.id);
  const until = sim.state.tick + ticks(seconds);
  ant.bb[BB_STUNNED] = Math.max(ant.bb[BB_STUNNED] ?? 0, until);
  if (ant.combat) ant.combat.biteCdTick = Math.max(ant.combat.biteCdTick, until);
}

/** Cue event for audio (ids listed in src/audio/README.md "cues waiting for an emitter"). */
export function cue(sim: Sim, id: 'creature-step' | 'wing-buzz' | 'bird-strike' | 'antlion-flick' | 'prey-struggle' | 'cricket-call' | `ambient.${string}`, pos: Vec3 | null, strength = 1): void {
  sim.emit({ type: 'cue', cue: id, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, strength });
}
