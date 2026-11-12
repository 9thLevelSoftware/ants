// Combat: bites, grapples, specials, alarm, retreat, injuries. STUB written by F1b/F1c; owner: combat.

import type { Vec3 } from '@/core/math/vec3';
import type { CommandHandlerMap, DeathCause, Sim, System, TargetKind } from '@/sim/types';

/** Resolves locks, hits and retreats every tick (after locomotion). Stub: combat. */
export const combatSystem: System = { name: 'combat', phase: 'combat', run: () => {} };

export const systems: readonly System[] = [combatSystem];

/** Starts a fight between an ant and a target. Stub: false. */
export function engage(_sim: Sim, _antId: number, _targetKind: TargetKind, _targetId: number): boolean {
  return false;
}

/**
 * Applies damage points to an ant or creature (armour, possessed-ant multiplier, death with `cause`); returns the
 * damage actually dealt. Stub: 0.
 */
export function applyDamage(_sim: Sim, _targetKind: TargetKind, _targetId: number, _dmg: number, _cause: DeathCause): number {
  return 0;
}

/** The holder ant grabs the target in a grapple lock (GDD 05 §4.3); false if no slot or not in reach. Stub: false. */
export function beginGrapple(_sim: Sim, _holderId: number, _targetKind: 'ant' | 'creature', _targetId: number): boolean {
  return false;
}

/** Releases the holder's lock, if any. Stub: no-op. */
export function releaseGrapple(_sim: Sim, _holderId: number): void {}

/** Releases alarm pheromone and raises alarm levels around pos. Stub: no-op. */
export function raiseAlarm(_sim: Sim, _colony: number, _pos: Vec3, _strength: number): void {}

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.combatFlags': () => {}, // owner: combat
};
