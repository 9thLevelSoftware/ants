// Response thresholds and reassignment (GDD 02 §6.4-§6.5). The allocator only changes `ant.task`; the behaviour
// runner sees the change and runs exit/enter. Possessed ants and ants carrying something are never reassigned.

import { ti } from '../taskIdx';
import { rngFloat } from '@/core/rng';
import type { Ant, Colony, ReasonCode, Sim, SpeciesDef, Task } from '@/sim/types';
import { AntFlag, REASON_CODES, TASKS } from '@/sim/types';
import {
  EXP_DECAY, EXP_MAX, EXP_MIN, EXP_RELAX_PER_GD, STAY_WEIGHT, SURPLUS_FACTOR, SURPLUS_SLACK, TASK_CHANGED_SAMPLE,
  TASK_MIN_TENURE_S, THETA_BASE, THETA_NEVER,
} from '@/sim/balance';
import { secondsToTicks } from '@/sim/time';
import { isAvailable, isWorkerCaste } from '../census';
import { ageMult, ALLOCATED_TASKS, eligible, groupOf, taskWeight, thresholdBand } from './groups';

const IDLE = ti('idle');

/** Whether task index i is in surplus (GDD 02 §6.5: actual > 1.2 x target + 1). */
export function inSurplus(col: Colony, i: number): boolean {
  return col.alloc.actual[i] > SURPLUS_FACTOR * col.alloc.target[i] + SURPLUS_SLACK;
}

/** Stimulus of task i: relative deficit 0..1 (GDD 02 §6.4). */
export function stimulus(col: Colony, i: number): number {
  const t = col.alloc.target[i], a = col.alloc.actual[i];
  return Math.min(1, Math.max(0, (t - a) / Math.max(t, 1)));
}

/** Effective response threshold of the ant for task t (base x experience, x age band, / caste propensity). */
export function threshold(sim: Sim, a: Ant, t: Task, def: SpeciesDef): number {
  const i = ti(t);
  const base = a.thresholds[i];
  if (base >= THETA_NEVER) return THETA_NEVER;
  const m = ageMult(thresholdBand(a, sim.state.tick), t);
  if (m === undefined) return THETA_NEVER;
  return (base * m) / Math.max(0.05, taskWeight(def, a, t));
}

/** Probability the ant takes task t at a re-evaluation: s^2 / (s^2 + theta^2). */
export function takeProbability(sim: Sim, col: Colony, a: Ant, t: Task, def: SpeciesDef): number {
  const s = stimulus(col, ti(t));
  if (s <= 0) return 0;
  const th = threshold(sim, a, t, def);
  return (s * s) / (s * s + th * th);
}

/** May the allocator touch this ant at all? */
export function reassignable(a: Ant): boolean {
  return a.alive && isWorkerCaste(a.caste) && isAvailable(a) && a.carry.kind === 'none' && (a.flags & AntFlag.POSSESSED) === 0;
}

function logDecision(a: Ant, reason: ReasonCode, detail: number, tick: number): void {
  const base = reason.split(':')[0];
  const code = (REASON_CODES as readonly string[]).indexOf(base);
  const ring = a.mem.decisions;
  if (ring.length === 0) return;
  for (let i = ring.length - 1; i > 0; i--) ring[i] = ring[i - 1];
  ring[0] = { tick, code, detail };
}

/** Switches the ant's task and keeps the headcount caches exact. */
export function switchTask(sim: Sim, col: Colony, a: Ant, to: Task, reason: ReasonCode): void {
  const from = a.task;
  if (from === to) return;
  const fi = ti(from), toI = ti(to);
  if (col.alloc.actual[fi] > 0) col.alloc.actual[fi]--;
  col.alloc.actual[toI]++;
  const gf = groupOf(from), gt = groupOf(to);
  if (gf && col.groupCounts[gf] > 0) col.groupCounts[gf]--;
  if (gt) col.groupCounts[gt]++;
  a.task = to;
  a.taskTick = sim.state.tick;
  logDecision(a, reason, toI, sim.state.tick);
  if ((a.flags & AntFlag.POSSESSED) !== 0 || a.id % TASK_CHANGED_SAMPLE === 0) {
    sim.emit({ type: 'task-changed', antId: a.id, from, to, reason });
  }
}

/**
 * One re-evaluation of an ant (GDD 02 §6.5): roulette over the take-probabilities of deficit tasks plus a stay
 * weight (0 when the current task is in surplus). `force` skips the tenure rule (idle ants, emergencies).
 * Returns the task chosen (possibly the current one).
 */
export function reevaluate(sim: Sim, col: Colony, a: Ant, def: SpeciesDef, force = false): Task {
  if (!reassignable(a)) return a.task;
  const cur = ti(a.task);
  if (!force && cur !== IDLE && sim.state.tick - a.taskTick < secondsToTicks(TASK_MIN_TENURE_S)) return a.task;
  const band = thresholdBand(a, sim.state.tick);
  const weights: number[] = [];
  const tasks: Task[] = [];
  let sum = 0;
  for (const t of ALLOCATED_TASKS) {
    const i = ti(t);
    if (i === cur || col.alloc.target[i] <= col.alloc.actual[i] || !eligible(a, t, band, def)) continue;
    const p = takeProbability(sim, col, a, t, def);
    if (p <= 0) continue;
    tasks.push(t);
    weights.push(p);
    sum += p;
  }
  const curEligible = cur === IDLE || eligible(a, a.task, band, def);
  const stay = curEligible && !inSurplus(col, cur) ? STAY_WEIGHT : 0;
  if (sum <= 0) {
    if (!curEligible || (cur !== IDLE && inSurplus(col, cur))) { switchTask(sim, col, a, 'idle', 'surplus'); return 'idle'; }
    return a.task;
  }
  let pick = rngFloat(sim.stream('rng.alloc')) * (sum + stay);
  for (let k = 0; k < tasks.length; k++) {
    pick -= weights[k];
    if (pick < 0) {
      switchTask(sim, col, a, tasks[k], `deficit:${tasks[k]}`);
      return tasks[k];
    }
  }
  return a.task;
}

/** Forced surplus check (every SURPLUS_CHECK_S): ants leave a surplus task with P = (actual - target) / actual. */
export function surplusCheck(sim: Sim, col: Colony, a: Ant, def: SpeciesDef): void {
  const i = ti(a.task);
  if (i === IDLE || !reassignable(a) || !inSurplus(col, i) || !groupOf(a.task)) return;
  const act = col.alloc.actual[i];
  if (rngFloat(sim.stream('rng.alloc')) < (act - col.alloc.target[i]) / act) {
    const next = reevaluate(sim, col, a, def, true);
    if (next === TASKS[i]) switchTask(sim, col, a, 'idle', 'surplus');
  }
}

/** Experience gain at the end of a task cycle: exp x EXP_DECAY (floor EXP_MIN). */
export function gainExperience(a: Ant, t: Task): void {
  const i = ti(t);
  if (a.thresholds[i] >= THETA_NEVER) return;
  a.thresholds[i] = Math.max(THETA_BASE * EXP_MIN, a.thresholds[i] * EXP_DECAY);
}

/** Daily relaxation of experience toward 1 (GDD 02 §6.4), clamped to [EXP_MIN, EXP_MAX]. */
export function relaxExperience(a: Ant, days: number): void {
  const k = 1 - Math.pow(1 - EXP_RELAX_PER_GD, days);
  for (let i = 0; i < a.thresholds.length; i++) {
    const v = a.thresholds[i];
    if (v >= THETA_NEVER) continue;
    const next = v + (THETA_BASE - v) * k;
    a.thresholds[i] = Math.min(THETA_BASE * EXP_MAX, Math.max(THETA_BASE * EXP_MIN, next));
  }
}
