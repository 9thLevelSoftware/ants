// Ant module API: perception, behaviours, player control, action primitives, possession, lifecycle.
// Owners: actions (actions/**, player/**, lifecycle.ts, behaviourRunner.ts, this file), beh-forage
// (behaviours/outdoor/**, perception), beh-nest (behaviours/nest/**), combat (fight/patrol behaviours).
// Behaviour tasks add their state machines (and any extra systems, e.g. perception) to the arrays in
// behaviours/{outdoor,nest}/index.ts; this file assembles them, so those tasks never edit it (ruling 13).

import type {
  ActionCheck, ActionFailReason, ActionId, ActionPrompt, Ant, AntInspect, Behaviour, CommandHandlerMap, Sim, System,
  TargetRef, Task,
} from '@/sim/types';
import { ACTION_IDS, BROOD_DEATH_CAUSES, isOneOf, REASON_CODES } from '@/sim/types';
import { killCreature } from '@/sim/entities';
import { killColonyBrood } from '@/sim/colony';
import * as actions from './actions';
import { behaviourSystem } from './behaviourRunner';
import * as nestBehaviours from './behaviours/nest';
import * as outdoorBehaviours from './behaviours/outdoor';
import { lifecycleSystem, processAntDeath, toDeathCause } from './lifecycle';
import * as player from './player';

/** Contact, antennal and smell perception (beh-forage's system, registered through behaviours/outdoor). */
export { perceptionSystem } from './perception';

export { behaviourSystem } from './behaviourRunner';
/** Applies player intent and held actions to the possessed ant. */
export const playerControlSystem: System = player.playerControlSystem;
/** Advances action primitives (windup/active/recovery) and applies their effects. */
export const actionSystem: System = actions.actionSystem;
export { lifecycleSystem } from './lifecycle';

export const systems: readonly System[] = [
  behaviourSystem, playerControlSystem, actionSystem, lifecycleSystem,
  ...outdoorBehaviours.systems, ...nestBehaviours.systems,
];

/** Task behaviours from behaviours/outdoor and behaviours/nest (beh-forage, beh-nest, combat add theirs there). */
export const behaviours: readonly Behaviour[] = [...outdoorBehaviours.behaviours, ...nestBehaviours.behaviours];

// ---- action primitives ----

/** Can this ant start the action on the target now? A null target lets the primitive choose (e.g. the dig face). */
export function canDo(sim: Sim, ant: Ant, action: ActionId, target: TargetRef | null): ActionCheck {
  return actions.canDo(sim, ant, action, target);
}

/** Starts an action primitive; false (and `action-failed`) if canDo fails. `opts.repeat` repeats until stopped. */
export function begin(sim: Sim, ant: Ant, action: ActionId, target: TargetRef | null, opts?: actions.BeginOptions): boolean {
  return actions.begin(sim, ant, action, target, opts);
}

/** Cancels the ant's action in progress (emits action-cancelled); a timed effect not yet applied never happens. */
export function cancel(sim: Sim, ant: Ant, reason: ActionFailReason | null): void {
  actions.cancel(sim, ant, reason);
}

/** The context prompt for the possessed ant (best action on what it faces); null for other ants or nothing. */
export function currentPrompt(sim: Sim, ant: Ant): ActionPrompt | null {
  return player.currentPrompt(sim, ant);
}

/** Actions the ant could start now with automatic targets (prompts, AI). */
export function availableActions(sim: Sim, ant: Ant): ActionId[] {
  return actions.availableActions(sim, ant, ACTION_IDS);
}

/** Read-only summary for the inspect card and the debug API; null for unknown ids. */
export function inspect(sim: Sim, antId: number): AntInspect | null {
  const a = sim.stores.ants.get(antId);
  if (!a) return null;
  const decisions = a.mem.decisions
    .filter((d) => d.tick >= 0)
    .sort((x, y) => y.tick - x.tick)
    .map((d) => ({ tick: d.tick, reason: REASON_CODES[d.code] ?? 'unknown', detail: d.detail }));
  return {
    antId: a.id, colonyId: a.colony, caste: a.caste, task: a.task, state: a.state,
    health: a.maxHp > 0 ? a.hp / a.maxHp : 0, crop: { c: a.cropC, p: a.cropP }, energy: a.energy,
    ageGd: a.physioAgeGd, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, decisions,
  };
}

/** Task an ant resumes when released from possession (GDD 01 §3.5 table; pure). */
export function inferReleaseTask(sim: Sim, ant: Ant): Task {
  return player.inferRelease(sim, ant).task;
}

// ---- additive API (actions task) ----

export {
  ACTION_DEFS, actionDef, carriedBrood, carriedItem, entityTarget, handsFree, interruptible, isGripping, isPossessed,
  ports, resolveTarget, selfTarget, stopAction, workRate, type ActionDef, type BeginOptions,
} from './actions';
export { behaviourFor, defaultBehaviour, enteredTask, exitBehaviour, runBehaviour, thinkNow } from './behaviourRunner';
export { onEclosion, processAntDeath, removeAnt, toDeathCause } from './lifecycle';
export {
  inferRelease, inspectTarget, promptCandidates, promptView, releasePossessed, type InspectCard, type PromptLine,
  type PromptView, type ReleaseInference,
} from './player';

// ---- commands owned by this module ----

export const commandHandlers: Partial<CommandHandlerMap> = {
  possess: player.possess,
  release: player.release,
  setIntent: (sim, c) => sim.setPlayerIntent(c.intent),
  /** Begins / stops the possessed ant's action primitive (the sim re-validates the target). */
  action: player.actionCommand,
  setTrail: player.setTrailCommand,
  /** Kills any ant (leaving a corpse), creature or brood by id (debug). The cause arrives as untyped JSON. */
  'cheat.kill': (sim, c) => {
    const cause = String(c.cause);
    if (sim.stores.ants.has(c.id)) processAntDeath(sim, c.id, toDeathCause(cause));
    else if (sim.stores.creatures.has(c.id)) killCreature(sim, c.id, cause);
    else if (sim.stores.brood.has(c.id)) killColonyBrood(sim, c.id, isOneOf(BROOD_DEATH_CAUSES, cause) ? cause : 'base');
  },
};
