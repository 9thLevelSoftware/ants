// Allocation targets from demand: auto and manual modes (GDD 02 §6.3).

import { ti } from '../taskIdx';
import type { AllocationGroup, Colony, Task } from '@/sim/types';
import { ALLOCATION_GROUPS } from '@/sim/types';
import { MANUAL_CAP, MANUAL_FLOOR, MANUAL_RESERVE } from '@/sim/balance';
import { GROUP_TASKS, groupOf } from './groups';

/**
 * The workforce `A` of GDD 02 §6.3 as nested pools: every available worker (nurse group), those past the callow
 * stage (dig group), and those also at health >= 0.4 (outside groups forage and defend).
 */
export interface Workforce {
  all: number;
  adult: number;
  outside: number;
}

type Pool = 'all' | 'adult' | 'outside';

function poolOfGroup(g: AllocationGroup): Pool {
  return g === 'forage' || g === 'defend' ? 'outside' : g === 'dig' ? 'adult' : 'all';
}

function poolOfTask(t: Task): Pool {
  const g = groupOf(t);
  return g ? poolOfGroup(g) : 'all';
}

/**
 * Workers still free while targets are handed out. A pool's room is bounded by the pools that contain it, so a
 * target set built through `take` can always be staffed (nurse-group targets use ineligible ants first).
 */
class Free {
  constructor(private all: number, private adult: number, private outside: number) {}
  room(p: Pool): number {
    if (p === 'all') return Math.max(0, this.all);
    if (p === 'adult') return Math.max(0, Math.min(this.all, this.adult));
    return Math.max(0, Math.min(this.all, this.adult, this.outside));
  }
  take(p: Pool, n: number): number {
    const k = Math.min(n, this.room(p));
    this.all -= k;
    if (p !== 'all') this.adult -= k;
    if (p === 'outside') this.outside -= k;
    return k;
  }
}

/** Auto-mode priority when demand exceeds the workforce; `guard` comes first under threat. */
const PRIORITY: readonly Task[] = [
  'nurse', 'queen-care', 'forage', 'store', 'garden', 'mill', 'cut', 'tend', 'scout', 'haul', 'dig', 'guard', 'patrol',
];
const PRIORITY_THREAT: readonly Task[] = ['guard', ...PRIORITY.filter((t) => t !== 'guard')];

/** Splits `total` over weights with largest remainders (integers summing to total). */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

/** Auto targets (GDD 02 §6.3). */
function autoTargets(demand: Float32Array, w: Workforce, threat: boolean, target: Int16Array): void {
  let sum = 0;
  for (const t of PRIORITY) sum += demand[ti(t)];
  const order = threat ? PRIORITY_THREAT : PRIORITY;
  const free = new Free(w.all, w.adult, w.outside);
  if (sum <= w.all) {
    for (const t of order) target[ti(t)] = free.take(poolOfTask(t), Math.round(demand[ti(t)]));
    return;
  }
  for (const t of order) target[ti(t)] = free.take(poolOfTask(t), Math.ceil(0.5 * demand[ti(t)]));
  for (const t of order) {
    const i = ti(t);
    target[i] += free.take(poolOfTask(t), Math.max(0, Math.round(demand[i]) - target[i]));
  }
}

/** Manual targets from the player's group shares, with floors and useful caps (GDD 02 §6.3). */
/** Groups in the order their eligible pools are filled: the most constrained first. */
const MANUAL_FILL_ORDER: readonly AllocationGroup[] = ['forage', 'defend', 'dig', 'nurse'];

function manualTargets(
  demand: Float32Array, w: Workforce, shares: Record<AllocationGroup, number>,
  taskShares: Partial<Record<Task, number>>, target: Int16Array,
): void {
  const available = w.all;
  const total = ALLOCATION_GROUPS.reduce((a, g) => a + Math.max(0, shares[g] ?? 0), 0) || 1;
  const aEff = available * (1 - MANUAL_RESERVE);
  const free = new Free(w.all, w.adult, w.outside);
  for (const g of MANUAL_FILL_ORDER) {
    const tasks = GROUP_TASKS[g];
    const dG = tasks.reduce((a, t) => a + demand[ti(t)], 0);
    let G = Math.round((aEff * Math.max(0, shares[g] ?? 0)) / total);
    G = Math.max(G, Math.min(available, Math.ceil(MANUAL_FLOOR * dG)));
    if (g !== 'forage') {
      const [a, b] = MANUAL_CAP[g];
      G = Math.min(G, Math.floor(a * dG + b));
    }
    // Only workers eligible for the group can fill it (injured and callow ants stay inside).
    G = free.take(poolOfGroup(g), G);
    const hasShares = tasks.some((t) => (taskShares[t] ?? 0) > 0);
    const weights = tasks.map((t) => (hasShares ? Math.max(0, taskShares[t] ?? 0) : demand[ti(t)]));
    if (weights.every((w) => w <= 0)) {
      // No demand inside the group: forage scouts, nurse grooms (nurse), others idle.
      if (g === 'forage') target[ti('scout')] = G;
      else if (g === 'nurse') target[ti('nurse')] = G;
      continue;
    }
    const split = apportion(G, weights);
    tasks.forEach((t, i) => { target[ti(t)] = split[i]; });
  }
}

/**
 * Recomputes col.alloc.target; returns the idle target (available workers not given a task). `workforce` splits
 * `available` by eligibility (default: every available worker fits every group).
 */
export function computeTargets(
  col: Colony, available: number, threat: boolean,
  workforce: Workforce = { all: available, adult: available, outside: available },
): number {
  const target = col.alloc.target;
  target.fill(0);
  const a = col.directives.allocation;
  const w = { ...workforce, all: available };
  if (a === 'auto') autoTargets(col.alloc.demand, w, threat, target);
  else manualTargets(col.alloc.demand, w, a, col.directives.taskShares, target);
  let assigned = 0;
  for (let i = 0; i < target.length; i++) assigned += target[i];
  // Targets never exceed the workforce: trim from the lowest priority upwards.
  for (let k = PRIORITY.length - 1; assigned > available && k >= 0; k--) {
    const i = ti(PRIORITY[k]);
    const cut = Math.min(target[i], assigned - available);
    target[i] -= cut;
    assigned -= cut;
  }
  const idle = Math.max(0, available - assigned);
  target[ti('idle')] = idle;
  return idle;
}
