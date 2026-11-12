// The shared action lifecycle (GDD 01 §7.1-7.2): validation, windup / active / recovery, continuous rates,
// interrupts, failure codes, events. AI behaviours and the possessed ant go through exactly these functions.

import type { ActionCheck, ActionFailReason, ActionId, Ant, Sim, TargetRef } from '@/sim/types';
import { POSES } from '@/sim/types';
import { ACTION_ACTIVE_FRAC, ACTION_MIN_TICKS, ACTION_WINDUP_FRAC, WORK_RATE_MIN } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { actionDef } from './defs';
import { inReach, placeOf, selfTarget, type TargetPlace } from './geometry';
import type { ActionDef } from './types';
import { casteAllows, workRate } from './workRate';

const TICK_S = 1 / TICKS_PER_SECOND;

/** Options of begin(); both default to false. */
export interface BeginOptions {
  /** Restart on completion until stopped (held input, AI dig loop). */
  repeat?: boolean;
  /** Secondary variant (interact hold). */
  secondary?: boolean;
}

interface Validation {
  reason: ActionFailReason | null;
  target: TargetRef | null;
  def: ActionDef | null;
}

const place: TargetPlace = { pos: { x: 0, y: 0, z: 0 }, radius: 0 };

function speciesHasAction(sim: Sim, ant: Ant, id: ActionId): boolean {
  const colony = sim.stores.colonies.get(ant.colony);
  const def = colony ? sim.getSpecies(colony.species) : undefined;
  return !def || def.castes.some((c) => c.actions.includes(id));
}

function lockedNow(ant: Ant, def: ActionDef): boolean {
  return def.lockedAfterWindup === true && ant.action !== null && ant.action.phase !== 'windup';
}

function fail(reason: ActionFailReason, target: TargetRef | null = null): Validation {
  return { reason, target, def: null };
}

/** Validation in the order of GDD 01 §7.1: permission, target, busy, preconditions, reach, conditions. */
function validate(sim: Sim, ant: Ant, id: ActionId, target: TargetRef | null): Validation {
  if (!ant.alive) return fail('conditions');
  if (!casteAllows(sim, ant, id)) return fail(speciesHasAction(sim, ant, id) ? 'caste' : 'species');
  const def = actionDef(id);
  if (!def) return fail('conditions'); // a later tier's primitive (fly, sting, cut-leaf ...)
  const t = target ?? def.autoTarget?.(sim, ant) ?? (def.targets.includes('none') ? selfTarget(ant) : null);
  if (!t || !def.targets.includes(t.kind)) return fail('no-target', t);
  if (ant.action && !def.concurrent) {
    const running = actionDef(ant.action.id);
    if (!def.preempts || !running || !running.cancellable || lockedNow(ant, running)) return fail('blocked', t);
  }
  if (!placeOf(sim, ant, t, place)) return fail('no-target', t);
  const r = def.check(sim, ant, t);
  if (r) return fail(r, t);
  const reachable = t.kind === 'none' || (def.reachable ? def.reachable(sim, ant, t) : inReach(sim, ant, place));
  if (!reachable) return fail('out-of-reach', t);
  if (def.kind === 'timed' && workRate(sim, ant) < WORK_RATE_MIN) return fail('conditions', t);
  return { reason: null, target: t, def };
}

/** Can this ant start the action on the target now? A null target lets the primitive pick its own. */
export function canDo(sim: Sim, ant: Ant, action: ActionId, target: TargetRef | null): ActionCheck {
  const v = validate(sim, ant, action, target);
  return { ok: v.reason === null, reason: v.reason };
}

/** The target begin() would use when called without one (null = none fits). */
export function resolveTarget(sim: Sim, ant: Ant, action: ActionId, target: TargetRef | null): TargetRef | null {
  return validate(sim, ant, action, target).target;
}

/** Starts an action primitive. On failure emits `action-failed` and returns false. */
export function begin(sim: Sim, ant: Ant, action: ActionId, target: TargetRef | null, opts: BeginOptions = {}): boolean {
  const v = validate(sim, ant, action, target);
  if (v.reason !== null || !v.def || !v.target) {
    sim.emit({ type: 'action-failed', antId: ant.id, action, reason: v.reason ?? 'conditions' });
    return false;
  }
  if (ant.action && !v.def.concurrent) cancel(sim, ant, null);
  start(sim, ant, v.def, v.target, opts, sim.state.tick);
  return true;
}

function timedTicks(sim: Sim, ant: Ant, def: ActionDef, t: TargetRef): number {
  const ticks = (def.durationS(sim, ant, t) * TICKS_PER_SECOND) / Math.max(WORK_RATE_MIN, workRate(sim, ant));
  return Math.max(ACTION_MIN_TICKS, Math.ceil(ticks - 1e-9));
}

function windupTicks(def: ActionDef, d: number): number {
  return Math.round(d * (def.windupFrac ?? ACTION_WINDUP_FRAC));
}

/**
 * Tick (1-based elapsed count) at which a timed primitive applies its effect: the end of active. Rounded down so
 * that a primitive of 2 ticks or more keeps at least one recovery tick (pick-up 5 ticks: effect at 4).
 */
function effectTick(def: ActionDef, d: number): number {
  const w = windupTicks(def, d);
  const e = Math.floor(d * ((def.windupFrac ?? ACTION_WINDUP_FRAC) + ACTION_ACTIVE_FRAC) + 1e-9);
  return Math.min(d, Math.max(w, 1, e));
}

function cue(sim: Sim, ant: Ant, def: ActionDef): void {
  if (def.cue) sim.emit({ type: 'cue', cue: def.cue, pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z }, strength: 1 });
}

function cloneTarget(t: TargetRef): TargetRef {
  return { kind: t.kind, id: t.id, pos: { x: t.pos.x, y: t.pos.y, z: t.pos.z } };
}

function start(sim: Sim, ant: Ant, def: ActionDef, t: TargetRef, opts: BeginOptions, startTick: number): void {
  const target = cloneTarget(t);
  if (def.kind === 'instant') {
    def.onBegin?.(sim, ant, target);
    sim.emit({ type: 'action-started', antId: ant.id, action: def.id, target });
    const r = def.effect ? def.effect(sim, ant, target) : 0;
    if (typeof r === 'string') {
      sim.emit({ type: 'action-failed', antId: ant.id, action: def.id, reason: r });
      return;
    }
    cue(sim, ant, def);
    sim.emit({ type: 'action-completed', antId: ant.id, action: def.id, target, result: r });
    return;
  }
  const timed = def.kind === 'timed';
  const maxS = def.durationS(sim, ant, target);
  const d = timed ? timedTicks(sim, ant, def, target) : maxS > 0 ? Math.round(maxS * TICKS_PER_SECOND) : 0;
  ant.action = {
    id: def.id, phase: timed && windupTicks(def, d) > 0 ? 'windup' : 'active', startTick, durationTicks: d, target,
    repeat: opts.repeat === true, secondary: opts.secondary === true, reason: null,
  };
  ant.bb['act.hp'] = ant.hp;
  ant.bb['act.moved'] = 0;
  ant.bb['act.result'] = 0;
  ant.pose = Math.max(0, POSES.indexOf(def.pose));
  def.onBegin?.(sim, ant, target);
  sim.emit({ type: 'action-started', antId: ant.id, action: def.id, target });
  if (!timed) cue(sim, ant, def);
}

function clear(ant: Ant): void {
  ant.action = null;
  ant.pose = 0;
}

/** Cancels the ant's action in progress (emits `action-cancelled`); a timed effect not yet applied never happens. */
export function cancel(sim: Sim, ant: Ant, reason: ActionFailReason | null): void {
  const a = ant.action;
  if (!a) return;
  const def = actionDef(a.id);
  a.phase = 'cancelled';
  a.reason = reason;
  clear(ant);
  def?.onEnd?.(sim, ant, a.target);
  sim.emit({ type: 'action-cancelled', antId: ant.id, action: a.id, reason });
}

function failRunning(sim: Sim, ant: Ant, def: ActionDef, reason: ActionFailReason): void {
  const a = ant.action;
  if (!a) return;
  a.phase = 'failed';
  a.reason = reason;
  clear(ant);
  def.onEnd?.(sim, ant, a.target);
  sim.emit({ type: 'action-failed', antId: ant.id, action: a.id, reason });
}

function complete(sim: Sim, ant: Ant, def: ActionDef, result: number): void {
  const a = ant.action;
  if (!a) return;
  a.phase = 'done';
  clear(ant);
  def.onEnd?.(sim, ant, a.target);
  sim.emit({ type: 'action-completed', antId: ant.id, action: a.id, target: a.target, result });
  if (!a.repeat || !def.repeatable || !ant.alive) return;
  // Repeat: re-validate (validating -> windup) and start on the next tick. Surface targets are re-aimed.
  const next = a.target.kind === 'surface' && def.autoTarget ? null : a.target;
  const v = validate(sim, ant, a.id, next);
  if (v.reason !== null || !v.def || !v.target) {
    sim.emit({ type: 'action-failed', antId: ant.id, action: a.id, reason: v.reason ?? 'conditions' });
    return;
  }
  start(sim, ant, v.def, v.target, { repeat: true, secondary: a.secondary }, sim.state.tick + 1);
}

/**
 * Ends a held primitive (`action` command phase 'stop', input released): no more repeats; a continuous primitive
 * ends now (done), a timed one finishes its current cycle. Returns false when no matching action runs.
 */
export function stopAction(sim: Sim, ant: Ant, action?: ActionId): boolean {
  const a = ant.action;
  if (!a || (action !== undefined && a.id !== action)) return false;
  a.repeat = false;
  const def = actionDef(a.id);
  if (def && def.kind === 'continuous') complete(sim, ant, def, ant.bb['act.moved'] ?? 0);
  return true;
}

/** Whether interrupts may cancel the ant's running action now (cancellable and not locked after windup). */
export function interruptible(ant: Ant): boolean {
  const def = ant.action ? actionDef(ant.action.id) : undefined;
  return def !== undefined && def.cancellable && !lockedNow(ant, def);
}

/** Interrupts of GDD 01 §7.2 other than movement input (that one is player control's). */
function interruptReason(sim: Sim, ant: Ant, def: ActionDef): ActionFailReason | null {
  const a = ant.action;
  if (!a) return null;
  if (!placeOf(sim, ant, a.target, place)) return 'no-target';
  if (lockedNow(ant, def)) return null;
  if (ant.medium === 'air' && def.id !== 'grip') return 'conditions';
  if (ant.combat && ant.combat.seizedBy >= 0) return 'blocked';
  const hpBefore = ant.bb['act.hp'] ?? ant.hp;
  if (ant.hp < hpBefore - 1e-9 && !def.ignoresDamage) return 'conditions';
  return null;
}

/** Advances one ant's action by one tick. */
export function stepAction(sim: Sim, ant: Ant): void {
  const a = ant.action;
  if (!a) return;
  const def = actionDef(a.id);
  if (!def) return clear(ant);
  const elapsed = sim.state.tick - a.startTick + 1;
  if (elapsed < 1) return; // a repeat scheduled for the next tick
  const why = interruptReason(sim, ant, def);
  ant.bb['act.hp'] = ant.hp;
  if (why) return cancel(sim, ant, why);
  if (def.kind === 'continuous') return stepContinuous(sim, ant, def, elapsed);
  const d = a.durationTicks;
  const w = windupTicks(def, d);
  const e = effectTick(def, d);
  a.phase = elapsed <= w ? 'windup' : elapsed <= e ? 'active' : 'recovery';
  if (elapsed === e) {
    const r = def.effect ? def.effect(sim, ant, a.target) : 0;
    if (typeof r === 'string') return failRunning(sim, ant, def, r);
    ant.bb['act.result'] = r;
    cue(sim, ant, def);
  }
  if (elapsed >= d) complete(sim, ant, def, ant.bb['act.result'] ?? 0);
}

function stepContinuous(sim: Sim, ant: Ant, def: ActionDef, elapsed: number): void {
  const a = ant.action;
  if (!a || !def.tick) return;
  const dt = TICK_S * (def.scalesWithWork === false ? 1 : workRate(sim, ant));
  let out = def.tick(sim, ant, a.target, dt);
  if (out === 'continue' && a.durationTicks > 0 && elapsed >= a.durationTicks) out = 'done';
  if (out === 'continue') return;
  if (out === 'done') complete(sim, ant, def, ant.bb['act.moved'] ?? 0);
  else failRunning(sim, ant, def, out);
}

/** Primitives this ant could start now with automatic targets (prompts, AI hints). */
export function availableActions(sim: Sim, ant: Ant, ids: readonly ActionId[]): ActionId[] {
  return ids.filter((id) => validate(sim, ant, id, null).reason === null);
}
