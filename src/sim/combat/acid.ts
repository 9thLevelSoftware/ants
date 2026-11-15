// Acid spray resolution (GDD 05 §4.4). The `spray-acid` primitive picks the hostiles in its 60° / 1.5 L cone,
// spends the charge, deposits the 1.0 ph alarm puff and hands each hit to sprayHit(): a free straight segment from
// the sprayer, then 2.5 x m^(2/3) x species multiplier (x creature acid sensitivity) delivered over 2 s; a hit ant
// releases its locks with p 0.5 and is disoriented 1 s; creatures get deterrence through noteCreatureHit.

import type { Ant, Creature, Sim } from '@/sim/types';
import { INJURIES } from '@/sim/types';
import {
  ALARM_SPRAYED, SPRAY_ACID_PER_MG23, SPRAY_ACID_S, SPRAY_DISORIENT_S, SPRAY_RELEASE_P, SPRAY_SEGMENT_RADIUS_L,
} from '@/sim/balance/combat';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { noteCreatureHit } from '@/sim/ecology/creatures';
import { alarmBurst } from './alarm';
import { damageAnt, damageCreature } from './damage';
import { noteFightActivity } from './fightRecord';
import { releaseGrapple, roll } from './grapple';
import { combatStats } from './stats';
import { antLenMm, bodyOf, bodyPos, bodyRadius, CB, dist, ensureCombat, ticksOf } from './state';
import { SPRAY_RANGE_L } from '@/sim/balance/actions';

const GASTER = 1 << INJURIES.indexOf('gaster');

/** Hits recorded per sprayer this tick, for the `combat-spray` event (runtime only, emptied each combat tick). */
const sprayHits = new WeakMap<Sim, Map<number, number[]>>();

export function takeSprayHits(sim: Sim, sprayerId: number): number[] {
  const m = sprayHits.get(sim);
  const list = m?.get(sprayerId) ?? [];
  m?.delete(sprayerId);
  return list;
}

export function clearSprayHits(sim: Sim): void {
  sprayHits.get(sim)?.clear();
}

/** A gaster wound disables the special (GDD 05 §4.7). */
export function sprayDisabled(ant: Ant): boolean {
  return (ant.injuries & GASTER) !== 0;
}

/** Total acid of one spray of this ant on a target of acid sensitivity `sens`. */
export function sprayDamage(sim: Sim, sprayer: Ant, sens: number): number {
  return SPRAY_ACID_PER_MG23 * Math.pow(Math.max(0, sprayer.massMg), 2 / 3) * combatStats(sim, sprayer).sprayMult * sens;
}

function scheduleAcid(bb: Record<string, number>, total: number, sprayerId: number): void {
  const ticks = Math.max(1, ticksOf(SPRAY_ACID_S));
  const left = (bb[CB.acidLeft] ?? 0) + total;
  bb[CB.acidLeft] = left;
  bb[CB.acidRate] = Math.max(bb[CB.acidRate] ?? 0, total / ticks);
  bb[CB.acidBy] = sprayerId;
}

/** One target of a spray. Returns the acid scheduled (0 when blocked or the sprayer cannot spray). */
export function sprayHit(sim: Sim, sprayer: Ant, kind: 'ant' | 'creature', id: number): number {
  if (sprayDisabled(sprayer)) return 0;
  const b = bodyOf(sim, kind, id);
  if (!b) return 0;
  if (b.kind === 'ant' && b.ant.colony === sprayer.colony) return 0;
  const tp = bodyPos(b);
  // range 1.5 L from the sprayer's body (the gaster tip curls forward under it) to the target's surface
  const range = SPRAY_RANGE_L * antLenMm(sim, sprayer);
  if (dist(sprayer.pos, tp) - bodyRadius(b) > range + 1e-6) return 0;
  // the plume travels just above the ground: the sphere stays within the bodies' foot offset
  const r = Math.min(SPRAY_SEGMENT_RADIUS_L * antLenMm(sim, sprayer), 0.5 * sprayer.footOffset);
  if (!sim.field.segmentFree(sprayer.pos, tp, r)) return 0;
  let m = sprayHits.get(sim);
  if (!m) { m = new Map(); sprayHits.set(sim, m); }
  const list = m.get(sprayer.id) ?? [];
  list.push(id);
  m.set(sprayer.id, list);
  noteFightActivity(sim, sprayer);
  if (b.kind === 'creature') {
    const total = sprayDamage(sim, sprayer, CREATURE_STATS[b.c.kind]?.acidSens ?? 1);
    noteCreatureHit(sim, id, sprayer.id, 'spray');
    scheduleAcid(b.c.bb, total, sprayer.id);
    return total;
  }
  const t = b.ant;
  const total = sprayDamage(sim, sprayer, 1);
  scheduleAcid(t.bb, total, sprayer.id);
  const cs = ensureCombat(t);
  if (cs.lock && roll(sim, SPRAY_RELEASE_P)) releaseGrapple(sim, t.id);
  cs.disorientedUntilTick = Math.max(cs.disorientedUntilTick, sim.state.tick + ticksOf(SPRAY_DISORIENT_S));
  noteFightActivity(sim, t);
  alarmBurst(sim, t.colony, t.pos, ALARM_SPRAYED, 'sprayed', sprayer.id);
  sim.emit({ type: 'combat-hit', attackerId: sprayer.id, targetId: id, dmg: total * (1 - combatStats(sim, t).armour), kind: 'acid' });
  return total;
}

/** Applies one tick of acid on a body (ants and creatures); clears the record when spent. */
export function acidTick(sim: Sim, kind: 'ant' | 'creature', body: Ant | Creature): void {
  const left = body.bb[CB.acidLeft];
  if (left === undefined) return;
  const d = Math.min(left, body.bb[CB.acidRate] ?? left);
  const by = body.bb[CB.acidBy] ?? -1;
  const rest = left - d;
  if (rest <= 1e-9) { delete body.bb[CB.acidLeft]; delete body.bb[CB.acidRate]; delete body.bb[CB.acidBy]; } else body.bb[CB.acidLeft] = rest;
  if (kind === 'ant') {
    const a = body as Ant;
    damageAnt(sim, a, d, 'combat', by, 'acid');
  } else damageCreature(sim, body as Creature, d, by);
}
