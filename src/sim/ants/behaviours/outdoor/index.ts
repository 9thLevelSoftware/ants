// Outdoor behaviours (scout, forage, tend, flee): owned by the beh-forage task, which adds its state machines here.
// The behaviour runner (src/sim/ants/behaviourRunner.ts) looks them up by task through sim.behaviours.

import type { Behaviour, System } from '@/sim/types';

export const behaviours: Behaviour[] = [];

/** Extra systems of these behaviours (e.g. perception); src/sim/ants/index.ts adds them to the module's systems. */
export const systems: System[] = [];
