// Bite resolution (GDD 05 §4.2): hit chance, outnumbering M(n), damage, events and cues. Free bites come from the
// `bite` primitive (AI and possessed alike); hold bites from a lock (grapple cycle in system.ts).

import type { Ant, Sim } from '@/sim/types';
import {
  HIT_CHANCE_HELPLESS, HIT_CHANCE_HOLDING, HIT_MULT_DISORIENTED, HIT_MULT_DODGED, OUTNUMBER_MAX, OUTNUMBER_STEP,
  OUTNUMBER_WINDOW_S,
} from '@/sim/balance/combat';
import { creatureArmour } from '@/sim/ecology/creatures/queries';
import { noteCreatureHit, preyEvades } from '@/sim/ecology/creatures';
import { creatureHitters, damageAnt, damageCreature } from './damage';
import { noteFightActivity } from './fightRecord';
import { freeHitChance, frontHolder, isHelpless, roll } from './grapple';
import { combatStats } from './stats';
import { type Body, bodyOf, ensureCombat, isDisoriented, isStunned, ticksOf } from './state';

/** M(n) = min(2.0, 1 + 0.25 (n - 1)). */
export function outnumberMult(n: number): number {
  return Math.min(OUTNUMBER_MAX, 1 + OUTNUMBER_STEP * (Math.max(1, n) - 1));
}

/**
 * Distinct hostile attackers of the attacker's colony that hit the target within the last 2 s, this hit included
 * (§4.10: in a three-colony melee each hit counts its own attacker's colony).
 */
export function hittersNow(sim: Sim, target: Body, attacker: Ant): number {
  const w = ticksOf(OUTNUMBER_WINDOW_S);
  if (target.kind === 'creature') return creatureHitters(sim, target.c, attacker.colony, attacker.id, w);
  const since = sim.state.tick - w;
  let n = 1;
  for (const h of target.ant.combat?.recentHitters ?? []) {
    if (h.id === attacker.id || h.tick < since) continue;
    if (sim.stores.ants.get(h.id)?.colony === attacker.colony) n++;
  }
  return n;
}

/** Hardness of a body for the bite cue (audio crunches above 0.5): its armour. */
export function hardnessOf(sim: Sim, b: Body): number {
  return b.kind === 'ant' ? combatStats(sim, b.ant).armour : creatureArmour(b.c);
}

/** Whether the attacker may bite the target at all now (stunned; pinned ants only bite a holder in front). */
export function mayBite(sim: Sim, attacker: Ant, kind: string, id: number): boolean {
  if (!attacker.alive || isStunned(sim, attacker)) return false;
  if (attacker.combat?.pinned && !frontHolder(sim, attacker, kind, id)) return false;
  return true;
}

/** Hit chance of one bite (before the roll). */
export function biteHitChance(sim: Sim, attacker: Ant, target: Body, holding: boolean): number {
  let p = holding ? (isHelpless(sim, target) ? HIT_CHANCE_HELPLESS : HIT_CHANCE_HOLDING) : freeHitChance(sim, attacker, target);
  if (isDisoriented(sim, attacker)) p *= HIT_MULT_DISORIENTED;
  if (target.kind === 'ant' && (target.ant.combat?.dodgeUntilTick ?? 0) > sim.state.tick) p *= HIT_MULT_DODGED;
  return p;
}

/**
 * One bite of `attacker` on the target: returns the damage dealt (0 on a miss or when the bite is not allowed).
 * `holding`: a hold bite of the attacker's lock (0.9, or 1.0 against a helpless target).
 */
export function resolveBite(sim: Sim, attacker: Ant, kind: 'ant' | 'creature', id: number, holding: boolean): number {
  const b = bodyOf(sim, kind, id);
  if (!b || !mayBite(sim, attacker, kind, id)) return 0;
  if (b.kind === 'ant' && b.ant.colony === attacker.colony) return 0;
  noteFightActivity(sim, attacker);
  if (b.kind === 'creature' && !holding && preyEvades(sim, id, attacker.id)) return 0;
  const hit = roll(sim, biteHitChance(sim, attacker, b, holding));
  const pos = { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z };
  if (!hit) {
    sim.emit({ type: 'cue', cue: 'bite', pos, strength: 0 });
    return 0;
  }
  const raw = combatStats(sim, attacker).bite * outnumberMult(hittersNow(sim, b, attacker));
  let dealt: number;
  if (b.kind === 'creature') {
    noteCreatureHit(sim, id, attacker.id, 'bite');
    dealt = damageCreature(sim, b.c, raw, attacker.id);
  } else dealt = damageAnt(sim, b.ant, raw, 'combat', attacker.id, 'bite');
  ensureCombat(attacker).fightDamage += dealt;
  sim.emit({ type: 'combat-hit', attackerId: attacker.id, targetId: id, dmg: dealt, kind: 'bite' });
  sim.emit({ type: 'cue', cue: 'bite', pos, strength: hardnessOf(sim, b) });
  return dealt;
}
