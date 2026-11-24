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

/**
 * Waste in a brood chamber at the hygiene tolerance (colony-life round 4; a deviation from GDD 02 §6.3's fixed order):
 * `haul` moves up to just after `queen-care`. With the GDD order a small colony whose demand exceeds its workers gives
 * `haul` nothing (it comes after forage, store, tend and scout), and the waste kills the brood it lies among: on
 * suburban-garden #2 (9 workers, one royal chamber) haul demand 1.6-1.8, haul workers 0, 0 of 23 waste items taken out
 * in 5 gd, 15 of 16 brood dead of hygiene. Removing corpses from the brood pile is brood care in real colonies.
 */
function withHygiene(order: readonly Task[]): Task[] {
  const rest = order.filter((t) => t !== 'haul');
  const at = rest.indexOf('queen-care') + 1;
  return [...rest.slice(0, at), 'haul', ...rest.slice(at)];
}

/**
 * R38 item 1 (a deviation from GDD 02 §6.3's fixed order): while a nutrient is missing, the scout floor (demand.ts
 * scoutFloor, rounded) is served right after the brood's care (nurse, queen-care and, when brood lies among waste,
 * haul), before `forage`. Only the floor: the rest of the scout demand keeps its GDD place after `tend` (direction 26
 * item 3; sweep 11's review found the whole demand served first, 2 scouts ahead of forage in a colony of 6). Round 10:
 * once a colony knew its sugar, forage and tend took every free worker and the scouts' head-count fell to 0.02-0.1,
 * so its protein was never found. Returns the index in `order` after which the floor is served.
 */
function scoutFloorSlot(order: readonly Task[], hygiene: boolean): number {
  return order.indexOf(hygiene ? 'haul' : 'queen-care');
}

/*
 * The unplug floor (task opening-fix, a deviation from GDD 02 §6.3's fixed order like the two above): while the
 * colony has no `open` entrance and a `reopening` throat still holds plug soil (nest entranceToUnplug), that many
 * diggers (UNPLUG_FLOOR_DIGGERS per such nest, at most the dig demand) are served right after the brood's care, before
 * the scout floor and `forage` (serveUnplugFloor: the nurses' full demand first). GDD 06 §5.13 (b) and GDD 03 §4.2 / §13: the first workers reopen the plug. With the GDD order a
 * colony of 5-7 nanitics (one of them possessed by the player) gives `dig` nothing once a narrow way out exists: the
 * browser's first play on seed 2 (Nov 23) kept the throat `reopening` with 72 plug samples for 16 game hours, the
 * foragers walking out past the rim while no worker was left to dig it (R14: open within 4 game hours).
 */

/**
 * The unplug floor's turn, right after the brood's care (integrator ruling 1 of opening-fix: the floor must not starve
 * the brood of a small founding). The nurses get their full demand first (the care's first pass gave them half,
 * rounded up), then the plug its diggers, then queen-care's second half and the work outside share what is left. So
 * the floor never lowers the nurse target; it takes its diggers from forage, store, scouting and queen-care's second
 * half. Four first workers, one possessed (the browser's seed 1), nurse 1 and queen-care 2: nurse 1, queen-care 1,
 * one digger; with all four free, two.
 */
function serveUnplugFloor(demand: Float32Array, target: Int16Array, free: Free, floorDiggers: number): void {
  const ni = ti('nurse'), di = ti('dig');
  target[ni] += free.take(poolOfTask('nurse'), Math.max(0, Math.round(demand[ni]) - target[ni]));
  target[di] += free.take(poolOfTask('dig'), Math.max(0, floorDiggers - target[di]));
}

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

/**
 * Auto targets (GDD 02 §6.3). `hygiene`: brood lies among waste (withHygiene). `prospForage`: the part of the forage
 * demand that is R32b's prospective protein demand (R35 point 5): it is served last, from the workers no other task
 * wants, so the head-count of every other task (the herds' tenders first) is the same with and without it.
 */
function autoTargets(
  demand: Float32Array, w: Workforce, threat: boolean, target: Int16Array, hygiene: boolean, prospForage: number,
  scoutFloor: number, unplugFloor = 0,
): void {
  const fi = ti('forage');
  const extra = Math.max(0, Math.min(prospForage, demand[fi]));
  demand[fi] -= extra;
  const free = new Free(w.all, w.adult, w.outside);
  planTargets(demand, free, threat, target, hygiene, scoutFloor, unplugFloor);
  demand[fi] += extra;
  if (extra > 0) target[fi] += free.take(poolOfTask('forage'), Math.max(0, Math.round(demand[fi]) - target[fi]));
}

/**
 * GDD 02 §6.3's two passes: full demands when they fit, else half of each in order, then the rest in order.
 * `scoutFloor` > 0: that many scouts (at most the scout demand) are served after the brood's care in the first pass
 * (scoutFloorSlot); the scout entry at its own place then tops up to half its demand as any task does.
 */
function planTargets(
  demand: Float32Array, free: Free, threat: boolean, target: Int16Array, hygiene: boolean, scoutFloor = 0, unplugFloor = 0,
): void {
  let sum = 0;
  for (const t of PRIORITY) sum += demand[ti(t)];
  const base = threat ? PRIORITY_THREAT : PRIORITY;
  const order = hygiene ? withHygiene(base) : base;
  if (sum <= free.room('all')) {
    for (const t of order) target[ti(t)] = free.take(poolOfTask(t), Math.round(demand[ti(t)]));
    return;
  }
  const si = ti('scout'), di = ti('dig');
  const careEnd = scoutFloorSlot(order, hygiene);
  const floorAfter = scoutFloor > 0 ? careEnd : -1;
  const floorScouts = Math.min(Math.round(scoutFloor), Math.round(demand[si]));
  const floorDiggers = Math.min(Math.round(unplugFloor), Math.round(demand[di]));
  for (let k = 0; k < order.length; k++) {
    const i = ti(order[k]);
    target[i] += free.take(poolOfTask(order[k]), Math.max(0, Math.ceil(0.5 * demand[i]) - target[i]));
    // the closed nest's plug before any work outside, then the scout floor
    if (k === careEnd && floorDiggers > 0) serveUnplugFloor(demand, target, free, floorDiggers);
    if (k === floorAfter) target[si] += free.take(poolOfTask('scout'), Math.max(0, floorScouts - target[si]));
  }
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
 * `available` by eligibility (default: every available worker fits every group). `hygiene`: waste in a brood chamber
 * at the hygiene tolerance (auto mode ranks `haul` after `queen-care`). `scoutFloor`: the scout floor while a
 * nutrient is missing (R38 item 1, demand.ts SCOUT_FLOOR_KEY): auto mode serves that many scouts before `forage`.
 */
export function computeTargets(
  col: Colony, available: number, threat: boolean,
  workforce: Workforce = { all: available, adult: available, outside: available }, hygiene = false, prospForage = 0,
  scoutFloor = 0, unplugFloor = 0,
): number {
  const target = col.alloc.target;
  target.fill(0);
  const a = col.directives.allocation;
  const w = { ...workforce, all: available };
  if (a === 'auto') autoTargets(col.alloc.demand, w, threat, target, hygiene, prospForage, scoutFloor, unplugFloor);
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
