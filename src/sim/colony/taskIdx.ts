// Constant-time task -> index (TASKS order) for hot loops; `taskIndex` from the contracts is a linear search.

import type { Task } from '@/sim/types';
import { TASKS } from '@/sim/types';

const INDEX: Record<string, number> = {};
TASKS.forEach((t, i) => { INDEX[t] = i; });

export function ti(t: Task): number {
  return INDEX[t];
}
