// LinkedSliderGroup maths (GDD 08 4.2): the four workforce shares always add up to exactly 100 %, move in steps of
// 5 %, respect a floor and a cap per group, and keep locked groups where they are. Works in whole steps (integers),
// so there is no floating-point drift: 100 % = 20 steps of 5 %.
import { MANUAL_FLOOR, MANUAL_RESERVE } from '@/sim/balance';
import type { UiGroupId } from '../../api';
import { FLOOR_BUDGET_PCT } from '../../hud/balance';

export const GROUP_ORDER: readonly UiGroupId[] = ['forage', 'nurse', 'dig', 'defend'];
export const SHARE_STEP = 5;
export const SHARE_TOTAL = 100;

export type Shares = Record<UiGroupId, number>;
export type Flags = Partial<Record<UiGroupId, boolean>>;
export interface Bounds { min: number; max: number }
export type BoundsMap = Partial<Record<UiGroupId, Bounds>>;

const UNITS = SHARE_TOTAL / SHARE_STEP;

const toUnits = (s: Shares): number[] => GROUP_ORDER.map((g) => Math.round(s[g] / SHARE_STEP));

function fromUnits(u: readonly number[]): Shares {
  const out = {} as Shares;
  GROUP_ORDER.forEach((g, i) => { out[g] = u[i] * SHARE_STEP; });
  return out;
}

function boundsOf(map: BoundsMap | undefined, g: UiGroupId): [number, number] {
  const b = map?.[g];
  const lo = Math.max(0, Math.ceil((b?.min ?? 0) / SHARE_STEP));
  const hi = Math.min(UNITS, Math.floor((b?.max ?? SHARE_TOTAL) / SHARE_STEP));
  return lo <= hi ? [lo, hi] : [lo, lo];
}

/**
 * Turns arbitrary shares (percent, floats, sum near 100) into whole steps summing to exactly 20, by the largest
 * remainder method. All zero becomes an even split.
 */
export function quantise(shares: Shares): Shares {
  const raw = GROUP_ORDER.map((g) => Math.max(0, shares[g]));
  const sum = raw.reduce((a, b) => a + b, 0);
  const ideal = sum > 0 ? raw.map((v) => (v / sum) * UNITS) : raw.map(() => UNITS / raw.length);
  const u = ideal.map(Math.floor);
  let left = UNITS - u.reduce((a, b) => a + b, 0);
  const order = ideal.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) u[order[k].i]++;
  return fromUnits(u);
}

/**
 * Spreads `amount` steps over the free groups in proportion to their current steps, each within its bounds.
 * Water-filling: a group that hits a bound is fixed there and the rest share what is left. Returns null when the
 * bounds cannot take that amount.
 */
function distribute(free: number[], cur: readonly number[], lo: readonly number[], hi: readonly number[], amount: number): number[] | null {
  const out = cur.slice();
  let loSum = 0, hiSum = 0;
  for (const i of free) { loSum += lo[i]; hiSum += hi[i]; }
  if (amount < loSum || amount > hiSum) return null;
  const open = new Set(free);
  let rest = amount;
  const target = new Map<number, number>();
  for (let guard = 0; guard < 8 && open.size > 0; guard++) {
    let weight = 0;
    for (const i of open) weight += Math.max(cur[i], 0);
    let clamped = false;
    for (const i of open) {
      const share = weight > 0 ? (Math.max(cur[i], 0) / weight) * rest : rest / open.size;
      if (share < lo[i]) { target.set(i, lo[i]); rest -= lo[i]; open.delete(i); clamped = true; }
      else if (share > hi[i]) { target.set(i, hi[i]); rest -= hi[i]; open.delete(i); clamped = true; }
    }
    if (!clamped) {
      for (const i of open) target.set(i, weight > 0 ? (Math.max(cur[i], 0) / weight) * rest : rest / open.size);
      break;
    }
  }
  // integer rounding by largest remainder, inside the bounds
  const ints = new Map<number, number>();
  let used = 0;
  for (const i of free) { const v = target.get(i) ?? lo[i]; const f = Math.min(hi[i], Math.max(lo[i], Math.floor(v))); ints.set(i, f); used += f; }
  let left = amount - used;
  const byRemainder = free.map((i) => ({ i, r: (target.get(i) ?? 0) - Math.floor(target.get(i) ?? 0) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let pass = 0; left > 0 && pass < free.length * UNITS; pass++) {
    const e = byRemainder[pass % byRemainder.length];
    if ((ints.get(e.i) ?? 0) < hi[e.i]) { ints.set(e.i, (ints.get(e.i) ?? 0) + 1); left--; }
  }
  for (let pass = 0; left < 0 && pass < free.length * UNITS; pass++) {
    const e = byRemainder[byRemainder.length - 1 - (pass % byRemainder.length)];
    if ((ints.get(e.i) ?? 0) > lo[e.i]) { ints.set(e.i, (ints.get(e.i) ?? 0) - 1); left++; }
  }
  if (left !== 0) return null;
  for (const i of free) out[i] = ints.get(i) as number;
  return out;
}

export interface ShareChange {
  shares: Shares;
  /** The value the moved group actually got (it may differ from the request when locks, floors or caps limit it). */
  applied: number;
  /** True when the moved group could not take the requested value. */
  limited: boolean;
}

/**
 * Moves one group to `requested` percent. The unlocked others change in proportion to their current values so the
 * sum stays exactly 100. Locked groups keep their value; if every other group is locked nothing moves. Floors and
 * caps hold for every group; the request is pulled in to the nearest value the others can absorb.
 */
export function moveShare(shares: Shares, moved: UiGroupId, requested: number, locked: Flags = {}, bounds: BoundsMap = {}): ShareChange {
  const cur = toUnits(quantise(shares));
  const lo = GROUP_ORDER.map((g) => boundsOf(bounds, g)[0]);
  const hi = GROUP_ORDER.map((g) => boundsOf(bounds, g)[1]);
  const m = GROUP_ORDER.indexOf(moved);
  const free = GROUP_ORDER.map((g, i) => i).filter((i) => i !== m && !locked[GROUP_ORDER[i]]);
  const lockedSum = GROUP_ORDER.reduce((a, g, i) => a + (i !== m && locked[g] ? cur[i] : 0), 0);
  const freeLo = free.reduce((a, i) => a + lo[i], 0);
  const freeHi = free.reduce((a, i) => a + hi[i], 0);
  // the moved group can only take what the free groups can give back
  const minM = Math.max(lo[m], UNITS - lockedSum - freeHi);
  const maxM = Math.min(hi[m], UNITS - lockedSum - freeLo);
  const want = Math.round(requested / SHARE_STEP);
  if (free.length === 0 || minM > maxM) return { shares: fromUnits(cur), applied: cur[m] * SHARE_STEP, limited: want !== cur[m] };
  const target = Math.min(maxM, Math.max(minM, want));
  const next = distribute(free, cur, lo, hi, UNITS - lockedSum - target);
  if (!next) return { shares: fromUnits(cur), applied: cur[m] * SHARE_STEP, limited: want !== cur[m] };
  next[m] = target;
  return { shares: fromUnits(next), applied: target * SHARE_STEP, limited: target !== want };
}

/** Sum of the shares, percent. */
export function sharesSum(s: Shares): number {
  return GROUP_ORDER.reduce((a, g) => a + s[g], 0);
}

/**
 * Per-group bounds of the manual allocation: the colony cannot be ordered to abandon a need (GDD 02 6.3 floor) and
 * the "defend" group has no work to do while the colony is below the guard threshold. `need` is the group's demand in
 * worker-equivalents; `workers` the headcount that can be ordered.
 */
export function boundsFor(need: Record<UiGroupId, number>, workers: number): BoundsMap {
  const out: BoundsMap = {};
  if (workers <= 0) return out;
  const raw = GROUP_ORDER.map((g) => Math.min(100, ((MANUAL_FLOOR * need[g]) / (workers * (1 - MANUAL_RESERVE))) * 100));
  // With few workers and a large need (a founding colony) the floors alone can exceed 100 %, which would freeze every
  // slider. Scale them down together so they never claim more than FLOOR_BUDGET_PCT; the simulation keeps its own floors.
  const total = raw.reduce((a, b) => a + b, 0);
  const k = total > FLOOR_BUDGET_PCT ? FLOOR_BUDGET_PCT / total : 1;
  GROUP_ORDER.forEach((g, i) => {
    // as a share of the orderable workers, rounded down to a step
    const min = Math.floor((raw[i] * k) / SHARE_STEP) * SHARE_STEP;
    if (min > 0) out[g] = { min, max: SHARE_TOTAL };
  });
  return out;
}
