// Damage and death (GDD 05 §4.2, §4.7): armour, the possessed ant's difficulty multiplier, the hitter record that
// feeds outnumbering, the bitten alarm, the "hit while not fighting" reaction flag, queen-in-danger, and death
// with its cause (the corpse item is made by the ant lifecycle). Every caller's damage goes through here.

import type { Ant, Creature, DeathCause, Sim } from '@/sim/types';
import {
  ALARM_BITTEN, ALARM_BITTEN_EVERY_S, ALARM_KILLED_WITNESS_L, ALARM_NESTMATE_KILLED, RECENT_HITTER_KEEP_S,
} from '@/sim/balance/combat';
import { creatureArmour } from '@/sim/ecology/creatures/queries';
import { creatureKilled } from '@/sim/ecology/creatures';
import { dep } from './late';
import { alarmBurst } from './alarm';
import { noteFightActivity } from './fightRecord';
import { creatureHolders, releaseAllOn, releaseGrapple } from './grapple';
import { noteQueenDamaged } from './alerts';
import { combatStats } from './stats';
import { antLenMm, CB, dist, ensureCombat, isPossessed, ticksOf } from './state';

export type DamageKind = 'bite' | 'sting' | 'acid' | 'predator' | 'other';

const ids: number[] = [];

function pruneHitters(sim: Sim, ant: Ant): void {
  const cs = ant.combat;
  if (!cs || cs.recentHitters.length === 0) return;
  const old = sim.state.tick - ticksOf(RECENT_HITTER_KEEP_S);
  if (cs.recentHitters[0].tick < old) cs.recentHitters = cs.recentHitters.filter((h) => h.tick >= old);
}

/** Records who hit the ant now (one entry per hitter, latest tick). */
function noteHitter(sim: Sim, ant: Ant, hitterId: number): void {
  const cs = ensureCombat(ant);
  pruneHitters(sim, ant);
  const now = sim.state.tick;
  const e = cs.recentHitters.find((h) => h.id === hitterId);
  if (e) e.tick = now;
  else cs.recentHitters.push({ id: hitterId, tick: now });
}

/**
 * Damage to an ant: raw x (1 - armour) x damageTakenMult (possessed ant only). Returns the damage dealt. Death at
 * hp <= 0 with `cause`. `kind` 'bite' / 'sting' / 'other' with cause 'combat' raises the bitten alarm.
 */
export function damageAnt(sim: Sim, ant: Ant, raw: number, cause: DeathCause, attackerId: number, kind: DamageKind): number {
  if (!ant.alive || !(raw > 0)) return 0;
  const armour = combatStats(sim, ant).armour;
  const mult = isPossessed(ant) ? sim.state.config.difficulty.params.damageTakenMult : 1;
  const dealt = raw * (1 - armour) * mult;
  if (!(dealt > 0)) return 0;
  // the fight record opens with the health before this hit ("lost >= 0.3 health in the fight", §4.7)
  noteFightActivity(sim, ant);
  ant.hp -= dealt;
  const now = sim.state.tick;
  if (attackerId >= 0) noteHitter(sim, ant, attackerId);
  ant.bb[CB.lastDmg] = now;
  const attacker = attackerId >= 0 ? sim.stores.ants.get(attackerId) : undefined;
  if (attacker) attacker.bb[CB.lastDmg] = now;
  if (attackerId >= 0 && kind !== 'acid') {
    ant.bb[CB.hitBy] = attackerId;
    ant.bb[CB.hitByKind] = attacker ? 1 : 2;
    ant.bb[CB.hitTick] = now;
  }
  if (cause === 'combat' && kind !== 'acid' && now - (ant.bb[CB.bittenAlarm] ?? -1e9) >= ticksOf(ALARM_BITTEN_EVERY_S)) {
    ant.bb[CB.bittenAlarm] = now;
    alarmBurst(sim, ant.colony, ant.pos, ALARM_BITTEN, 'bitten', attackerId);
  }
  noteQueenDamaged(sim, ant);
  if (ant.hp <= 0) killInFight(sim, ant, cause);
  return dealt;
}

/** Death of an ant from damage: locks on and by it end, witnesses raise the alarm, then the lifecycle's death. */
export function killInFight(sim: Sim, ant: Ant, cause: DeathCause): void {
  const len = antLenMm(sim, ant);
  sim.index.queryAnts(ant.pos, ALARM_KILLED_WITNESS_L * len, ids);
  let witness = false;
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (a && a.id !== ant.id && a.alive && a.colony === ant.colony && dist(a.pos, ant.pos) <= ALARM_KILLED_WITNESS_L * len) { witness = true; break; }
  }
  if (ant.combat?.lock) releaseGrapple(sim, ant.id);
  releaseAllOn(sim, 'ant', ant.id, null);
  const at = { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z };
  dep().processAntDeath(sim, ant.id, cause);
  if (witness) alarmBurst(sim, ant.colony, at, ALARM_NESTMATE_KILLED, 'killed');
}

/** Damage to a creature: raw x (1 - its armour now). A creature at hp <= 0 dies as food (creatureKilled). */
export function damageCreature(sim: Sim, c: Creature, raw: number, attackerId: number): number {
  if (!c.alive || !(raw > 0)) return 0;
  const dealt = raw * (1 - creatureArmour(c));
  if (!(dealt > 0)) return 0;
  c.hp -= dealt;
  const now = sim.state.tick;
  if (attackerId >= 0) c.bb[`cb.h.${attackerId}`] = now;
  const attacker = attackerId >= 0 ? sim.stores.ants.get(attackerId) : undefined;
  if (attacker) attacker.bb[CB.lastDmg] = now;
  if (c.hp <= 0) {
    const killers = creatureHolders(sim, c, []);
    if (attackerId >= 0 && !killers.includes(attackerId)) killers.push(attackerId);
    releaseAllOn(sim, 'creature', c.id, { kind: 'creature', c });
    creatureKilled(sim, c.id, killers.sort((a, b) => a - b), 'combat');
  }
  return dealt;
}

/** Distinct ants of `colony` that hit the creature within `windowTicks` (from its bb record), plus `self`. */
export function creatureHitters(sim: Sim, c: Creature, colony: number, self: number, windowTicks: number): number {
  const since = sim.state.tick - windowTicks;
  let n = 1;
  for (const k of Object.keys(c.bb)) {
    if (!k.startsWith('cb.h.')) continue;
    const t = c.bb[k];
    const id = Number(k.slice(5));
    if (t < since) { if (t < since - windowTicks) delete c.bb[k]; continue; }
    if (id === self) continue;
    if (sim.stores.ants.get(id)?.colony === colony) n++;
  }
  return n;
}
