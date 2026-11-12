// Pheromone module. STUB written by F1b; owner: phero.

import type { PheromoneField, PheromoneState, System } from '@/sim/types';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import { createPlaceholderPheromones } from '@/sim/testing/placeholders';

/** Runtime field over state.phero. Stub: deposit/sample only, no diffusion or sensing. */
export function createPheromoneField(data: PheromoneState): PheromoneField {
  return createPlaceholderPheromones(data);
}

/** Decay, diffusion, rain wash and disturbance multipliers. Stub: phero. */
export const pheromoneSystem: System = { name: 'pheromones', every: PHERO_DECAY_EVERY, run: () => {} };
