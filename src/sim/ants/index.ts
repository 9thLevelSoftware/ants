// Ant module API: perception, behaviours, player control, action primitives, lifecycle.
// STUB written by F1b. Owners: actions (actions/**, player/**, lifecycle.ts), beh-forage (perception, scout/
// forage/tend/flee), beh-nest (nurse/queenCare/store/dig/haul/idle/guard/queen), combat (fight/patrol).

import type {
  ActionCheck, ActionFailReason, ActionId, Ant, Behaviour, Sim, System, TargetRef, Task,
} from '@/sim/types';

/** Contact, antennal and smell perception, staggered. Stub: beh-forage. */
export const perceptionSystem: System = { name: 'perception', run: () => {} };

/** Runs the behaviour state machine of each AI ant whose thinkTick is due. Stub: beh-forage / beh-nest. */
export const behaviourSystem: System = { name: 'behaviours', run: () => {} };

/** Applies player intent and held actions to the possessed ant. Stub: actions. */
export const playerControlSystem: System = { name: 'player-control', run: () => {} };

/** Advances action primitives (windup/active/recovery) and applies their effects. Stub: actions. */
export const actionSystem: System = { name: 'actions', run: () => {} };

/** Ageing, deaths (old age, starvation), corpses, eclosion spawns. Stub: actions (lifecycle.ts). */
export const lifecycleSystem: System = { name: 'lifecycle', run: () => {} };

const behaviours = new Map<Task, Behaviour>();

/** Registers the behaviour for a task (species modules may add more). */
export function registerBehaviour(b: Behaviour): void {
  behaviours.set(b.task, b);
}

export function behaviourFor(task: Task): Behaviour | undefined {
  return behaviours.get(task);
}

/** Can this ant start the action on the target now? Stub: never (actions). */
export function canDo(_sim: Sim, _ant: Ant, _action: ActionId, _target: TargetRef | null): ActionCheck {
  return { ok: false, reason: 'conditions' };
}

/** Starts an action primitive; false if canDo fails. Stub: false (actions). */
export function begin(_sim: Sim, _ant: Ant, _action: ActionId, _target: TargetRef | null): boolean {
  return false;
}

/** Cancels the ant's action in progress. Stub: no-op (actions). */
export function cancelAction(_sim: Sim, _ant: Ant, _reason: ActionFailReason | null): void {}

/** Actions currently available to the ant (prompts, AI). Stub: none (actions). */
export function availableActions(_sim: Sim, _ant: Ant): ActionId[] {
  return [];
}

/** Task an ant resumes when released from possession (GDD 01 §3.5). Stub: its suspended task or idle (actions). */
export function inferReleaseTask(_sim: Sim, ant: Ant): Task {
  return ant.suspendedTask ?? 'idle';
}
