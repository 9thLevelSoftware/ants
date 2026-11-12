// Combat: bites, grapples, specials, alarm, retreat, injuries. STUB written by F1b; owner: combat.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, System, TargetKind } from '@/sim/types';

/** Resolves locks, hits and retreats every tick (after locomotion). Stub: combat. */
export const combatSystem: System = { name: 'combat', run: () => {} };

/** Starts a fight between an ant and a target. Stub: false (combat). */
export function engage(_sim: Sim, _antId: number, _targetKind: TargetKind, _targetId: number): boolean {
  return false;
}

/** Applies damage points; returns damage actually dealt. Stub: 0 (combat). */
export function applyDamage(_sim: Sim, _targetKind: TargetKind, _targetId: number, _dmg: number, _cause: string): number {
  return 0;
}

/** Releases alarm pheromone and raises alarm levels around pos. Stub: no-op (combat). */
export function raiseAlarm(_sim: Sim, _colony: number, _pos: Vec3, _strength: number): void {}
