// Allocation groups and task eligibility (GDD 02 §6.1, 00-index B3).

import type { AgeBand, AllocationGroup, Ant, SpeciesDef, Task } from '@/sim/types';
import { AntFlag, TASKS } from '@/sim/types';
import { AGE_THRESHOLD_MULT, AGE_THRESHOLD_MULT_OTHER, NANITIC_MID_AFTER_GD } from '@/sim/balance';
import { daysToTicks } from '@/sim/time';
import { bandOf } from '../physiology';
import { casteOf } from '../life';

/** Tasks per slider group (`raid`, `idle`, `rest`, `fight`, `flee` belong to none). */
export const GROUP_TASKS: Record<AllocationGroup, readonly Task[]> = {
  forage: ['scout', 'forage', 'tend', 'cut'],
  nurse: ['nurse', 'queen-care', 'store', 'garden', 'mill'],
  dig: ['dig', 'haul'],
  defend: ['guard', 'patrol'],
};

const GROUP_OF = new Map<Task, AllocationGroup>();
for (const g of Object.keys(GROUP_TASKS) as AllocationGroup[]) for (const t of GROUP_TASKS[g]) GROUP_OF.set(t, g);

export function groupOf(t: Task): AllocationGroup | null {
  return GROUP_OF.get(t) ?? null;
}

/** Tasks the allocator assigns (every task of a group). */
export const ALLOCATED_TASKS: readonly Task[] = TASKS.filter((t) => GROUP_OF.has(t));

/** Band whose threshold multipliers apply: nanitics act as `mid` from NANITIC_MID_AFTER_GD after eclosion. */
export function thresholdBand(a: Ant, tick: number): AgeBand {
  if ((a.flags & AntFlag.NANITIC) && tick - a.bornTick >= daysToTicks(NANITIC_MID_AFTER_GD)) return 'mid';
  return bandOf(a);
}

/** Age multiplier of task t for a band; undefined = not eligible (callows only work in the nurse group). */
export function ageMult(band: AgeBand, t: Task): number | undefined {
  const row = AGE_THRESHOLD_MULT[band] as Partial<Record<Task, number>>;
  const v = row[t];
  if (v !== undefined) return v;
  if (band === 'callow') return undefined;
  return groupOf(t) ? AGE_THRESHOLD_MULT_OTHER : undefined;
}

/** Caste propensity for a task from species data (0 = never). */
export function taskWeight(def: SpeciesDef, a: Ant, t: Task): number {
  return casteOf(def, a.caste)?.taskWeights[t] ?? 1;
}

/** Group eligibility (GDD 02 §6.1): outside groups need a healthy non-callow worker. */
export function eligible(a: Ant, t: Task, band: AgeBand, def: SpeciesDef): boolean {
  const g = groupOf(t);
  if (!g) return false;
  if (taskWeight(def, a, t) <= 0) return false;
  if (ageMult(band, t) === undefined) return false;
  if ((g === 'forage' || g === 'defend') && (a.flags & AntFlag.INJURED)) return false;
  return true;
}
