// Allocation targets from demand: auto and manual modes (GDD 02 §6.3).

import { ti } from '../taskIdx';
import type { AllocationGroup, Colony, Task } from '@/sim/types';
import { ALLOCATION_GROUPS } from '@/sim/types';
import { MANUAL_CAP, MANUAL_FLOOR, MANUAL_RESERVE } from '@/sim/balance';
import { GROUP_TASKS } from './groups';

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
function autoTargets(demand: Float32Array, available: number, threat: boolean, target: Int16Array): void {
  let sum = 0;
  for (const t of PRIORITY) sum += demand[ti(t)];
  if (sum <= available) {
    for (const t of PRIORITY) target[ti(t)] = Math.round(demand[ti(t)]);
    return;
  }
  let left = available;
  const order = threat ? PRIORITY_THREAT : PRIORITY;
  for (const t of order) {
    const give = Math.min(left, Math.ceil(0.5 * demand[ti(t)]));
    target[ti(t)] = give;
    left -= give;
  }
  for (const t of order) {
    const i = ti(t);
    const give = Math.min(left, Math.max(0, Math.round(demand[i]) - target[i]));
    target[i] += give;
    left -= give;
  }
}

/** Manual targets from the player's group shares, with floors and useful caps (GDD 02 §6.3). */
function manualTargets(
  demand: Float32Array, available: number, shares: Record<AllocationGroup, number>,
  taskShares: Partial<Record<Task, number>>, target: Int16Array,
): void {
  const total = ALLOCATION_GROUPS.reduce((a, g) => a + Math.max(0, shares[g] ?? 0), 0) || 1;
  const aEff = available * (1 - MANUAL_RESERVE);
  for (const g of ALLOCATION_GROUPS) {
    const tasks = GROUP_TASKS[g];
    const dG = tasks.reduce((a, t) => a + demand[ti(t)], 0);
    let G = Math.round((aEff * Math.max(0, shares[g] ?? 0)) / total);
    G = Math.max(G, Math.min(available, Math.ceil(MANUAL_FLOOR * dG)));
    if (g !== 'forage') {
      const [a, b] = MANUAL_CAP[g];
      G = Math.min(G, Math.floor(a * dG + b));
    }
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

/** Recomputes col.alloc.target; returns the idle target (available workers not given a task). */
export function computeTargets(col: Colony, available: number, threat: boolean): number {
  const target = col.alloc.target;
  target.fill(0);
  const a = col.directives.allocation;
  if (a === 'auto') autoTargets(col.alloc.demand, available, threat, target);
  else manualTargets(col.alloc.demand, available, a, col.directives.taskShares, target);
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
