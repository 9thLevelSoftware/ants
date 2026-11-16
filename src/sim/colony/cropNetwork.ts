// Crop loads back to the social stomach (GDD 02 §5.1: the pool is "the abstract social stomach of nest workers";
// §5.4.1 ambient trophallaxis: "the pool already represents the network"). A nurse or carer load taken from the pool
// is meant for brood or the queen; when the allocator moves its holder to a task that never feeds anyone, nothing in
// the behaviours gives it back, and the food was lost to the colony (econ-growth review: 60 idle workers of App. E 25
// held 9 P while the larvae needed it). Here such a worker passes her crop back at the trophallaxis rate, booked as a
// transit return.

import type { Ant, Colony, Sim, Task } from '@/sim/types';
import { AntFlag, TASKS } from '@/sim/types';
import { CROP_NETWORK_KEEP, CROP_NETWORK_TASKS, LOAD_EPS } from '@/sim/balance';
import { TROPH_RATE } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { deposit } from './stores';

const NETWORK = new Set<Task>(CROP_NETWORK_TASKS);

/**
 * The task whose behaviour the ant is running (the runner's `run.task`), not the one assigned: an ant held by
 * deliver first still runs its outdoor behaviour and unloads by it.
 */
function runningTask(a: Ant): Task | null {
  const i = a.bb['run.task'] ?? -1;
  return i >= 0 && i < TASKS.length ? TASKS[i] : null;
}

/** Whether the ant's crop belongs back in the pool: an in-nest worker, not possessed, on a non-feeding task. */
export function holdsNetworkCrop(a: Ant): boolean {
  if (!a.alive || a.caste !== 'worker' || a.nestId < 0 || (a.flags & AntFlag.POSSESSED) !== 0 || a.action) return false;
  const t = runningTask(a);
  return t !== null && t === a.task && NETWORK.has(t) && a.cropC + a.cropP > CROP_NETWORK_KEEP + LOAD_EPS;
}

/**
 * Passes up to TROPH_RATE x dt of the crop above CROP_NETWORK_KEEP back to the pool, in crop proportion, as far as
 * the pool has room. Returns the loads moved.
 */
export function returnCropToPool(col: Colony, a: Ant, dtTicks: number): number {
  const crop = a.cropC + a.cropP;
  const n = Math.min(crop - CROP_NETWORK_KEEP, TROPH_RATE * (dtTicks / TICKS_PER_SECOND));
  if (n <= LOAD_EPS) return 0;
  const got = deposit(col, (n * a.cropC) / crop, (n * a.cropP) / crop, 0, 'transit-return');
  a.cropC = Math.max(0, a.cropC - got.c);
  a.cropP = Math.max(0, a.cropP - got.p);
  if (a.cropC < LOAD_EPS) a.cropC = 0;
  if (a.cropP < LOAD_EPS) a.cropP = 0;
  return got.c + got.p;
}
