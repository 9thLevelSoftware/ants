// Local rain rate from human watering (GDD 04 §15.4), the one read the weather effects (moisture, puddles) and the
// nest flood model (entrance inflow, GDD 03 §11.1 "sprinkler or hose 0.5") make of the human-events state. A leaf
// module (plans and footprints only), so its readers do not load the whole human-events module (import order;
// moved here from index.ts unchanged, task nest-fix3 item 7).

import type { Sim } from '@/sim/types';
import { WATER_RAIN_MMH } from '@/sim/balance/human';
import { humanPlan } from './plans';
import { inFootprint } from './plan';

/**
 * Local rain rate from sprinklers, hoses and cans at (x, z), mm/h equivalent (GDD 04 §15.4: 15 / 40 / 80), for the
 * weather effects (moisture, puddles, entrance inflow) and `rainIntensityAt`. 0 where no water falls now.
 */
export function humanRainRateAt(sim: Sim, x: number, z: number): number {
  let r = 0;
  for (const run of sim.state.env.human.active) {
    const inst = run.inst;
    if (!inst || inst.kind !== 'watering' || !run.started) continue;
    const plan = humanPlan(sim, inst);
    const area = plan?.impacts[0];
    if (!plan || !area || sim.state.tick - inst.startTick > plan.endT) continue;
    if (inFootprint(area.fp, x, z)) r = Math.max(r, WATER_RAIN_MMH[(inst.variant ?? 'sprinkler') as keyof typeof WATER_RAIN_MMH] ?? 0);
  }
  return r;
}
