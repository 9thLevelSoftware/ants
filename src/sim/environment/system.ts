// The environment's fast step (every ENV_FAST_EVERY ticks): weather, then the thermal fields that depend on it.

import type { System } from '@/sim/types';
import { ENV_FAST_EVERY } from '@/sim/balance';
import { ensureThermal, updateThermal } from './surface';
import { stepWeather } from './weatherStep';

/** Weather state machine, wind, dew, lagged surface and soil temperatures. */
export const weatherSystem: System = {
  name: 'weather',
  phase: 'environment',
  every: ENV_FAST_EVERY,
  run(sim) {
    ensureThermal(sim);
    stepWeather(sim, ENV_FAST_EVERY);
    updateThermal(sim, ENV_FAST_EVERY);
  },
};
