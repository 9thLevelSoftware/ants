// Shared plumbing of the combat module: the per-ant CombatState, the ant.bb keys combat keeps (numbers only, so
// they persist), the debug flags of `cheat.combatFlags`, the combat RNG stream and small geometry helpers.

import type { Vec3 } from '@/core/math/vec3';
import type { RngState } from '@/core/rng';
import type { Ant, CombatState, Creature, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';

/** ant.bb / creature.bb keys owned by combat (prefix `cb.`). The stun key is shared with the creature module. */
export const CB = {
  /** Fight record: tick it began (-1 / missing none), hp at its start, last tick of a lock, hit or damage. */
  fight0: 'cb.f0',
  hp0: 'cb.hp0',
  lastAct: 'cb.act',
  /** Next hold bite (absolute tick) of a holder; tick the lock began. */
  holdNext: 'cb.hold',
  lockTick: 'cb.lockT',
  /** Next lock-break shake of a held target (absolute tick). */
  shakeNext: 'cb.shake',
  /** Last tick either side of a lock dealt damage (stalemate). */
  lastDmg: 'cb.dmgT',
  /** Acid / venom in progress on this body: total left; with a slot suffix (doses.ts) per dose left, per tick, source. */
  acidLeft: 'cb.acid',
  acidRate: 'cb.acidR',
  acidBy: 'cb.acidBy',
  /** Last tick the bitten alarm fired for this ant. */
  bittenAlarm: 'cb.bitA',
  /** Alarm source point and the attacker id (-1 unknown). */
  alarmX: 'cb.alX',
  alarmY: 'cb.alY',
  alarmZ: 'cb.alZ',
  alarmBy: 'cb.alBy',
  /** Hit by a hostile while not fighting: attacker id and kind (1 ant, 2 creature) and tick. */
  hitBy: 'cb.hitBy',
  hitByKind: 'cb.hitK',
  hitTick: 'cb.hitT',
  /** Lost legs (cumulative). */
  legs: 'cb.legs',
  /** Dodge in progress: unit direction and mm still to travel. */
  dodgeX: 'cb.dgX',
  dodgeY: 'cb.dgY',
  dodgeZ: 'cb.dgZ',
  dodgeLeft: 'cb.dgL',
  /** acid charges seen at the last combat tick (spray detection). */
  acidSeen: 'cb.acidS',
  /** The fight behaviour: target kind (1 ant, 2 creature, 0 none) and id, the task to resume, source point. */
  tgtKind: 'cb.tk',
  tgtId: 'cb.ti',
  tgtSeen: 'cb.tSeen',
  prevTask: 'cb.prev',
  srcX: 'cb.sx',
  srcY: 'cb.sy',
  srcZ: 'cb.sz',
  /** Fight started from a rally marker (marker id) / patrol rally marker the ant answers. */
  rally: 'cb.rally',
  /** Marker id an idle worker was recruited to (counted against the rally share). */
  rallyRecruit: 'cb.rallyRec',
  /** Encounter re-roll prefix: `cb.rr.<otherId>` = tick of the last roll. */
  reroll: 'cb.rr.',
  /** Stun shared with the creature module (ecology/creatures/common.ts BB_STUNNED). */
  stunUntil: 'cr.stunUntil',
} as const;

/** Debug switches of `cheat.combatFlags` (GDD 05 App. B): deterministic duels. Runtime only (see README). */
export interface CombatFlags {
  noRetreat: boolean;
  noInjury: boolean;
  /** Every roll succeeds: hits land, locks never break, injuries never happen. */
  noRng: boolean;
  /** Test switch (not a cheat field): no recruitment / encounter scans, so scripted fights stay as set up. */
  noScan?: boolean;
}

const flags = new WeakMap<Sim, CombatFlags>();

export function combatFlags(sim: Sim): CombatFlags {
  return flags.get(sim) ?? { noRetreat: false, noInjury: false, noRng: false };
}

export function setCombatFlags(sim: Sim, f: CombatFlags): void {
  flags.set(sim, { ...f });
}

export function rng(sim: Sim): RngState {
  return sim.stream('rng.combat');
}

export function ticksOf(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

export function emptyCombat(): CombatState {
  return {
    lock: null, heldBy: [], pinned: false, seizedBy: -1, escape: 0, paralysedUntilTick: 0, stuckSinceTick: 0,
    disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0, recentHitters: [], biteCdTick: 0, specialCdTick: 0,
    dodgeCdTick: 0,
  };
}

export function ensureCombat(ant: Ant): CombatState {
  if (!ant.combat) ant.combat = emptyCombat();
  return ant.combat;
}

export function isPossessed(ant: Ant): boolean {
  return (ant.flags & AntFlag.POSSESSED) !== 0;
}

export function isWorkerCaste(ant: Ant): boolean {
  return ant.caste === 'worker' || ant.caste === 'minor' || ant.caste === 'media' || ant.caste === 'major';
}

export function isSeized(ant: Ant): boolean {
  return !!ant.combat && ant.combat.seizedBy >= 0;
}

export function isParalysed(sim: Sim, ant: Ant): boolean {
  return !!ant.combat && ant.combat.paralysedUntilTick > sim.state.tick;
}

export function isStunned(sim: Sim, ant: Ant): boolean {
  return (ant.bb[CB.stunUntil] ?? 0) > sim.state.tick;
}

export function isDisoriented(sim: Sim, ant: Ant): boolean {
  return !!ant.combat && ant.combat.disorientedUntilTick > sim.state.tick;
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Turns the ant in its tangent plane to face p (heading only; locomotion owns position). */
export function faceToward(ant: Ant, p: Vec3): void {
  let dx = p.x - ant.pos.x, dy = p.y - ant.pos.y, dz = p.z - ant.pos.z;
  const k = dx * ant.up.x + dy * ant.up.y + dz * ant.up.z;
  dx -= k * ant.up.x; dy -= k * ant.up.y; dz -= k * ant.up.z;
  const l = Math.hypot(dx, dy, dz);
  if (l > 1e-6) { ant.fwd.x = dx / l; ant.fwd.y = dy / l; ant.fwd.z = dz / l; }
}

/** Body length of an ant, mm. */
export function antLenMm(sim: Sim, ant: Ant): number {
  return ant.lengthBu * sim.world.bu;
}

/** Standard worker length of a colony's species, mm (the L of colony-level radii such as alarm bursts). */
export function colonyLenMm(sim: Sim, colonyId: number): number {
  const col = sim.stores.colonies.get(colonyId);
  const def = col ? sim.getSpecies(col.species) : undefined;
  return def ? def.buMm : sim.world.bu;
}

/** A body in a fight: an ant or a creature, with what the rules need. */
export type Body = { kind: 'ant'; ant: Ant } | { kind: 'creature'; c: Creature };

export function bodyOf(sim: Sim, kind: string, id: number): Body | null {
  if (kind === 'ant') {
    const ant = sim.stores.ants.get(id);
    return ant && ant.alive ? { kind: 'ant', ant } : null;
  }
  if (kind === 'creature') {
    const c = sim.stores.creatures.get(id);
    return c && c.alive ? { kind: 'creature', c } : null;
  }
  return null;
}

export function bodyPos(b: Body): Vec3 {
  return b.kind === 'ant' ? b.ant.pos : b.c.pos;
}

export function bodyRadius(b: Body): number {
  return b.kind === 'ant' ? b.ant.radius : b.c.radius;
}

/** Length of a body, mm (creatures: their catalogue size, GDD 05 §2.2). */
export function bodyLenMm(sim: Sim, b: Body): number {
  if (b.kind === 'ant') return antLenMm(sim, b.ant);
  return CREATURE_STATS[b.c.kind]?.sizeMm ?? Math.max(b.c.radius * 2, 1e-3);
}
