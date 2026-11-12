// Player control (GDD 01 §3.4, §5.2, §7.2): turns the held / pressed intents of the possessed ant into action
// primitives, cancels cancellable primitives on movement input, keeps the prompt selection, and releases the ant
// after POSSESS_AFK_S real seconds without input. Movement itself is locomotion's (integratePossessed).

import type { ActionId, Ant, CommandOf, PlayerIntent, Sim, System, TargetRef } from '@/sim/types';
import {
  ACTION_MOVE_CANCEL_MAG, ACTION_MOVE_CANCEL_S, HOLD_ACTIONS, INPUT_DEADZONE, POSSESS_AFK_S,
} from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { actionDef, setTrailFlag } from '../actions/defs';
import { begin, cancel, canDo, interruptible, resolveTarget, stopAction } from '../actions/runner';
import { CTL } from './controlState';
import { publishActionFailure } from './diagnostics';
import { releasePossessed } from './possession';
import { promptView } from './prompt';
import { updatePromptSelection } from './targeting';

const TICK_S = 1 / TICKS_PER_SECOND;
/** Primitives that keep running while the ant walks. */
const MOVING_OK: readonly ActionId[] = ['grip', 'drag', 'bite-hold', 'lay-trail'];

function possessedAnt(sim: Sim): Ant | undefined {
  return sim.stores.ants.get(sim.state.player.possessedAntId);
}

function intentMagnitude(i: PlayerIntent): number {
  return Math.hypot(i.dir.x, i.dir.y, i.dir.z);
}

function hasInput(i: PlayerIntent): boolean {
  return intentMagnitude(i) > INPUT_DEADZONE || i.hurry || i.grip || i.held.length > 0 || i.flight !== null;
}

function heldMask(i: PlayerIntent): number {
  let m = 0;
  for (let b = 0; b < HOLD_ACTIONS.length; b++) {
    const id = HOLD_ACTIONS[b];
    if (i.held.includes(id) || (id === 'grip' && i.grip)) m |= 1 << b;
  }
  return m;
}

/** Marks player input now (AFK clock). */
export function noteInput(sim: Sim, ant: Ant): void {
  sim.state.player.lastInputTick = sim.state.tick;
  ant.bb[CTL.idleS] = 0;
  ant.bb[CTL.idleFrom] = sim.state.tick;
}

/**
 * AFK clock in real seconds: one tick is 0.1 game s = 0.1 / speed real s. Returns true when the ant was released.
 * The clock restarts whenever player.lastInputTick moves away from the tick it was counted from, so the load path
 * resetting lastInputTick (GDD 01 App. A: not persisted) also restarts the persisted clock.
 */
function afk(sim: Sim, ant: Ant, intent: PlayerIntent): boolean {
  if (hasInput(intent)) { noteInput(sim, ant); return false; }
  const time = sim.state.env.time;
  if (time.paused) return false;
  const since = sim.state.player.lastInputTick;
  const counted = ant.bb[CTL.idleFrom] === since ? (ant.bb[CTL.idleS] ?? 0) : 0;
  ant.bb[CTL.idleFrom] = since;
  const idle = counted + TICK_S / Math.max(1, time.speed);
  ant.bb[CTL.idleS] = idle;
  if (idle < POSSESS_AFK_S) return false;
  releasePossessed(sim, 'afk');
  return true;
}

/** Press / release edges of hold inputs start and stop their primitives (dig repeats while held). */
function holdEdges(sim: Sim, ant: Ant, intent: PlayerIntent): void {
  const now = heldMask(intent);
  const before = ant.bb[CTL.held] ?? 0;
  ant.bb[CTL.held] = now;
  for (let b = 0; b < HOLD_ACTIONS.length; b++) {
    const bit = 1 << b;
    const id = HOLD_ACTIONS[b];
    if ((now & bit) !== 0 && (before & bit) === 0) startPlayerAction(sim, ant, id, null, false);
    else if ((now & bit) === 0 && (before & bit) !== 0) stopAction(sim, ant, id);
  }
}

/** Movement input above 0.5 for more than 0.15 game s cancels a cancellable primitive (GDD 01 §7.2). */
function movementInterrupt(sim: Sim, ant: Ant, intent: PlayerIntent): void {
  const moving = intentMagnitude(intent) > ACTION_MOVE_CANCEL_MAG;
  const t = moving ? (ant.bb[CTL.moveS] ?? 0) + TICK_S : 0;
  ant.bb[CTL.moveS] = t;
  const a = ant.action;
  if (!a || t <= ACTION_MOVE_CANCEL_S + 1e-9 || MOVING_OK.includes(a.id) || !interruptible(ant)) return;
  cancel(sim, ant, null);
}

/** The target of the HUD line that offers this action (primary, secondary or an extra key line), null if none. */
function promptTargetFor(sim: Sim, ant: Ant, id: ActionId): TargetRef | null {
  const view = promptView(sim, ant);
  for (const l of [view.primary, view.secondary, ...view.extras]) if (l && l.actionId === id && l.target) return l.target;
  return null;
}

/**
 * Starts a primitive for the possessed ant: the given target, else the target of the prompt line offering this
 * action (GDD 01 App. B), else the primitive's own choice. Hold-type primitives repeat until stopped.
 */
export function startPlayerAction(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null, secondary: boolean): boolean {
  let t = target ?? promptTargetFor(sim, ant, id);
  if (!t) t = resolveTarget(sim, ant, id, null);
  const repeat = actionDef(id)?.repeatable === true && HOLD_ACTIONS.includes(id);
  if (begin(sim, ant, id, t, { repeat, secondary })) return true;
  publishActionFailure(sim, ant, id, canDo(sim, ant, id, t).reason ?? 'conditions');
  return false;
}

export const playerControlSystem: System = {
  name: 'player-control',
  phase: 'player-control',
  run(sim) {
    const ant = possessedAnt(sim);
    if (!ant) return;
    const intent = sim.state.player.intent;
    if (afk(sim, ant, intent)) return;
    holdEdges(sim, ant, intent);
    movementInterrupt(sim, ant, intent);
    updatePromptSelection(sim, ant);
  },
};

/** `action` command: begin / stop a primitive for the possessed ant (the sim re-validates the target). */
export function actionCommand(sim: Sim, c: CommandOf<'action'>): void {
  const ant = possessedAnt(sim);
  if (!ant) return;
  noteInput(sim, ant);
  if (c.phase === 'stop') { stopAction(sim, ant, c.actionId); return; }
  startPlayerAction(sim, ant, c.actionId, c.target ?? null, c.secondary === true);
}

/** `setTrail` command: the lay-trail toggle set to a value (refused for castes that cannot lay trail). */
export function setTrailCommand(sim: Sim, c: CommandOf<'setTrail'>): void {
  const ant = possessedAnt(sim);
  if (!ant) return;
  noteInput(sim, ant);
  if (c.on) {
    const check = canDo(sim, ant, 'lay-trail', null);
    if (!check.ok) {
      sim.emit({ type: 'action-failed', antId: ant.id, action: 'lay-trail', reason: check.reason ?? 'caste' });
      return;
    }
  }
  setTrailFlag(sim, ant, c.on);
}
