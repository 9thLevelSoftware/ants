// Read-only queries for the ant side (behaviours, combat, UI): threats near a point, prey near a point, known
// hazards, the armour a creature has right now. Ant reactions (flee, mob, dodge, avoid) are the behaviour and
// combat modules'; these queries give them what GDD 05 §2.4 says an ant can perceive.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Creature, CreatureKind, Hazard, Sim } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import {
  BIRD_RESPONSE_RADIUS_BU, CREATURE_STATS, MILLIPEDE_REPEL_S, ROVE_SECRETION_FLEE_S, ROVE_SECRETION_RADIUS_L, WOODLOUSE_ROLLED_ARMOUR,
} from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import { CreatureFlag, dist, statsOf } from './common';
import { detectRangeMm } from './attack';

export interface ThreatInfo {
  /** Creature id; -1 for the bird event. */
  creatureId: number;
  kind: CreatureKind;
  pos: Vec3;
  /** FSM state word ("stalk", "windup", "ambush" ...): the inspect card's "about to strike" during 'windup'. */
  state: string;
  /** A strike is announced (telegraph emitted): tick it lands and the ant it aims at; -1 none. */
  strikeAtTick: number;
  targetId: number;
  /** Ants within `repelRadiusMm` should flee for `repelUntilTick` (rove-beetle / millipede secretion). */
  repelRadiusMm: number;
  repelUntilTick: number;
  distanceMm: number;
}

const ANT_PREDATORS = new Set<CreatureKind>(['jumping-spider', 'wolf-spider', 'ant-spider', 'antlion', 'centipede', 'rove-beetle']);
const _ids: number[] = [];

/** Ant predators (and the bird event, and secreting millipedes) within radiusMm of p, nearest first. */
export function threatsNear(sim: Sim, p: Vec3, radiusMm: number): ThreatInfo[] {
  const out: ThreatInfo[] = [];
  sim.index.queryCreatures(p, radiusMm, _ids);
  for (const id of _ids) {
    const c = sim.stores.creatures.get(id);
    if (!c || (c.flags & (CreatureFlag.HIDDEN | CreatureFlag.DORMANT)) !== 0) continue;
    const d = dist(c.pos, p);
    if (d > radiusMm) continue;
    const secreting = c.kind === 'rove-beetle' || c.kind === 'millipede';
    if (!ANT_PREDATORS.has(c.kind) && !secreting) continue;
    const t = threatOf(sim, c, d);
    if (!ANT_PREDATORS.has(c.kind) && t.repelUntilTick <= sim.state.tick) continue;
    out.push(t);
  }
  const ev = sim.state.ecology.birdEvent;
  if (ev) {
    const d = dist(ev.pos, p);
    if (d <= radiusMm + BIRD_RESPONSE_RADIUS_BU * sim.world.bu) {
      out.push({
        creatureId: -1, kind: 'bird', pos: { ...ev.pos }, state: ev.phase, strikeAtTick: ev.nextPeckTick ?? -1,
        targetId: ev.peckTargetId ?? -1, repelRadiusMm: BIRD_RESPONSE_RADIUS_BU * sim.world.bu, repelUntilTick: ev.endTick ?? -1, distanceMm: d,
      });
    }
  }
  return out.sort((a, b) => a.distanceMm - b.distanceMm || a.creatureId - b.creatureId);
}

function threatOf(sim: Sim, c: Creature, d: number): ThreatInfo {
  const strike = c.bb.strikeAt ?? -1;
  let repelR = 0, repelUntil = -1;
  if (c.bb.secretionTick !== undefined) {
    const s = c.kind === 'rove-beetle' ? ROVE_SECRETION_FLEE_S : MILLIPEDE_REPEL_S;
    repelUntil = c.bb.secretionTick + s * TICKS_PER_SECOND;
    repelR = ROVE_SECRETION_RADIUS_L * sim.world.bu + c.radius;
  }
  return {
    creatureId: c.id, kind: c.kind, pos: { ...c.pos }, state: c.state, strikeAtTick: strike >= sim.state.tick ? strike : -1,
    targetId: strike >= sim.state.tick ? c.bb.tgt ?? -1 : -1, repelRadiusMm: repelR, repelUntilTick: repelUntil, distanceMm: d,
  };
}

export interface PreyInfo {
  creatureId: number;
  kind: CreatureKind;
  pos: Vec3;
  /** Carcass bulk (loads of carry capacity) and protein when killed. */
  bulk: number;
  p: number;
  /** Mites: taken only under a protein deficit (§2.2b). */
  lastResort: boolean;
  distanceMm: number;
}

/** Prey an ant of `colonyId` could hunt within radiusMm of p (hairy caterpillars and unseen lacewing larvae excluded). */
export function preyNear(sim: Sim, p: Vec3, radiusMm: number, colonyId: number): PreyInfo[] {
  const out: PreyInfo[] = [];
  const bit = colonySlotBit(sim, colonyId);
  sim.index.queryCreatures(p, radiusMm, _ids);
  for (const id of _ids) {
    const c = sim.stores.creatures.get(id);
    if (!c || (c.flags & (CreatureFlag.HIDDEN | CreatureFlag.HAIRY | CreatureFlag.ON_SILK | CreatureFlag.FLYING)) !== 0) continue;
    const fam = CREATURE_STATS[c.kind].family;
    const killableHerdPredator = c.kind === 'ladybird-larva' || (c.kind === 'lacewing-larva' && ((c.bb.seen ?? 0) & bit) !== 0);
    if (fam !== 'prey' && !killableHerdPredator) continue;
    if (c.kind === 'aphid') continue;
    const d = dist(c.pos, p);
    if (d > radiusMm) continue;
    const st = statsOf(c);
    out.push({ creatureId: c.id, kind: c.kind, pos: { ...c.pos }, bulk: st.deadBulk, p: st.deadP, lastResort: c.kind === 'mite', distanceMm: d });
  }
  return out.sort((a, b) => a.distanceMm - b.distanceMm || a.creatureId - b.creatureId);
}

/**
 * Hazards (antlion pits) a colony knows within radiusMm of p: avoid `radius + 1 L` in local steering (§2.4).
 * An abandoned pit (its antlion is gone; it fills in and expires, lifecycle.ts) is no longer a hazard.
 */
export function knownHazardsNear(sim: Sim, colonyId: number, p: Vec3, radiusMm: number): Hazard[] {
  const bit = colonySlotBit(sim, colonyId);
  return sim.state.ecology.hazards.filter((h) => h.kind === 'antlion-pit' && h.untilTick === undefined && (h.knownBy & bit) !== 0
    && dist(h.pos, p) <= radiusMm + h.radius);
}

/** Armour of a creature now (rolled woodlice 0.9), for combat's damage formula. */
export function creatureArmour(c: Creature): number {
  if (c.kind === 'woodlouse' && (c.flags & CreatureFlag.CURLED) !== 0) return WOODLOUSE_ROLLED_ARMOUR;
  return statsOf(c).armour;
}

/** Pull of a creature (combat's lock / pin rules, GDD 05 §4.3). */
export function creaturePull(c: Creature): number {
  return statsOf(c).pull;
}

/**
 * Does this ant perceive this predator now (GDD 05 §2.4 "AI avoidance" column)? Within 4 L x the predator's stealth
 * in its current state (jumping spider stalking 0.5, wolf spider 0.75 / ambush 0.4, ant-spider 1 L, centipede and
 * rove beetle 0.8); never while it is hidden or dormant, and never a buried antlion (known pits are avoided by
 * steering through knownHazardsNear, not fled from). The ant side's flee trigger asks this.
 */
export function predatorPerceivedBy(sim: Sim, c: Creature, ant: Ant): boolean {
  if (!c.alive || (c.flags & (CreatureFlag.HIDDEN | CreatureFlag.DORMANT)) !== 0) return false;
  if (!ANT_PREDATORS.has(c.kind) || c.kind === 'antlion') return false;
  return dist(c.pos, ant.pos) <= detectRangeMm(sim, c, ant);
}
