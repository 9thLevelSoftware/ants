// In-nest behaviours (nurse, queen-care, store, dig, haul, idle, guard, queen): owned by the beh-nest task, which
// adds its state machines here. The behaviour runner (src/sim/ants/behaviourRunner.ts) looks them up by task.

import type { Behaviour, System } from '@/sim/types';

export const behaviours: Behaviour[] = [];

/** Extra systems of these behaviours (e.g. perception); src/sim/ants/index.ts adds them to the module's systems. */
export const systems: System[] = [];
