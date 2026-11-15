// Combat (GDD 05 §4; owner: combat): stats, bites and hit resolution, grapple locks and pins, acid spray, dodge,
// alarm and recruitment, engage / retreat decisions, injuries, deaths, combat alerts and diagnostics.
// See README.md for the seams other modules use. The functions below keep the signatures the foundation fixed
// (the action library and the creature module call them through their ports).

import type { Vec3 } from '@/core/math/vec3';
import type { CommandHandlerMap, DeathCause, Sim, System, TargetKind } from '@/sim/types';
import { setCombatFlags, bodyOf } from './state';
import { damageAnt, damageCreature } from './damage';
import { executingAttacker } from './attribution';
import { resolveBite } from './hits';
import { sprayHit } from './acid';
import { startFight } from './fight';
import { runCombat, ensureInstalled } from './system';
import { beginGrapple as grab, releaseGrapple as letGo } from './grapple';
import { raiseAlarm as alarm } from './alarm';

/** Resolves locks, hits and retreats every tick (after locomotion). */
export const combatSystem: System = { name: 'combat', phase: 'combat', run: runCombat };

export const systems: readonly System[] = [combatSystem];

/**
 * Starts a fight between an ant and a target (the AI ant switches to task `fight`; the possessed ant keeps its
 * control). False when the ant cannot fight or the target is gone.
 */
export function engage(sim: Sim, antId: number, targetKind: TargetKind, targetId: number): boolean {
  ensureInstalled(sim);
  const ant = sim.stores.ants.get(antId);
  if (!ant || (targetKind !== 'ant' && targetKind !== 'creature')) return false;
  const b = bodyOf(sim, targetKind, targetId);
  if (!b) return false;
  const pos = b.kind === 'ant' ? b.ant.pos : b.c.pos;
  return startFight(sim, ant, { kind: targetKind, id: targetId }, pos, 'threat');
}

/**
 * Applies damage points to an ant or creature (armour, possessed-ant multiplier, death with `cause`); returns the
 * damage actually dealt. `attackerId` (additive, optional) names the hitter for outnumbering and alarms. When the
 * action library's `bite` or `spray-acid` shell calls without it, the bite / spray is resolved here in full: hit
 * chance, M(n), events (the raw `dmg` of the shell is then replaced by the rules' value).
 */
export function applyDamage(sim: Sim, targetKind: TargetKind, targetId: number, dmg: number, cause: DeathCause, attackerId?: number): number {
  ensureInstalled(sim);
  const b = bodyOf(sim, targetKind, targetId);
  if (!b) return 0;
  if (attackerId === undefined && cause === 'combat') {
    const a = executingAttacker(sim, targetKind, targetId, b.kind === 'ant' ? b.ant.pos : b.c.pos);
    if (a?.action?.id === 'bite') return resolveBite(sim, a, b.kind, targetId, false);
    if (a?.action?.id === 'spray-acid') return sprayHit(sim, a, b.kind, targetId);
  }
  const by = attackerId ?? -1;
  if (b.kind === 'creature') return damageCreature(sim, b.c, dmg, by);
  return damageAnt(sim, b.ant, dmg, cause, by, cause === 'combat' ? 'other' : 'predator');
}

/** The holder ant grabs the target in a grapple lock (GDD 05 §4.3); false if no slot, no hit or not allowed. */
export function beginGrapple(sim: Sim, holderId: number, targetKind: 'ant' | 'creature', targetId: number): boolean {
  ensureInstalled(sim);
  return grab(sim, holderId, targetKind, targetId);
}

/** Releases the holder's lock, if any. */
export function releaseGrapple(sim: Sim, holderId: number): void {
  letGo(sim, holderId);
}

/** Alarm trigger at pos for a colony (GDD 05 §4.5); see alarm.ts for how `strength` maps to the trigger table. */
export function raiseAlarm(sim: Sim, colony: number, pos: Vec3, strength: number): void {
  alarm(sim, colony, pos, strength);
}

// ---- further API for behaviours, rivals, creatures, UI and tests ----
export { combatStats, fightStrength, healthOf, retreatHealth, type CombatStats } from './stats';
export {
  attackChance, canFight, colonyAggression, fightThreshold, localStrength, mayAttack, protectedQueen, recruitCap,
  retreatReason, stanceFactor, territoryAt, territoryFactor, type RetreatReason,
} from './engage';
export { endFight, fightTarget, fightSource, resumeTaskOf, setFightTarget, startFight, startRetreat } from './fight';
export { computePinned, frontHolder, holdersOf, isHelpless, isPinned, slotsFor } from './grapple';
export { biteHitChance, mayBite, outnumberMult, resolveBite } from './hits';
export { sprayDamage, sprayDisabled, sprayHit } from './acid';
export { dodgeDef, dodgeRefusal, setDodgeDirection, startDodge } from './dodge';
export { stingDamage, stingDef, stingHit } from './sting';
export { alarmBurst } from './alarm';
export { hasInjury, injure, rollInjuries } from './injuries';
export { activeRally } from './rally';
export { combatSummary, publishCombatDiagnostic, type CombatSummary } from './diagnostics';
export { combatFlags, faceToward, type CombatFlags } from './state';
export { ensureInstalled } from './system';

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.combatFlags': (sim, c) => setCombatFlags(sim, { noRetreat: c.noRetreat, noInjury: c.noInjury, noRng: c.noRng }),
};
