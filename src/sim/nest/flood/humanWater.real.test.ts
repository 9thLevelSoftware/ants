// nest-fix3 item 7 on the real path (review finding: humanWater.test.ts stubs the rate function and the plan). A
// watering event is scheduled through the human-events module and run by its own system: plan footprint, variant
// table (GDD 04 §15.4), the run's `started` flag and its end. The flood model's intensity at a point under the water
// is GDD 03 §11.1's 0.5 while it runs and 0 beside it and after it; the soil there gets wetter.
// Decision recorded here: a watering can counts as 0.5 too. GDD 03 §11.1 names "sprinkler or hose", the can is the
// same kind of watering on the spot (GDD 04 §15.4 even gives it the highest rate), so leaving it out would be odd.
import { describe, expect, it } from 'vitest';
import type { HumanEventInst, HumanVariant, Sim } from '@/sim/types';
import { FLOOD_HUMAN_WATER_INTENSITY } from '@/sim/balance/weather';
import { humanRainRateAt } from '@/sim/environment/human/waterRate';
import { humanPlan, humanSim, patioWorld, scheduleNow } from '@/sim/environment/human/testkit';
import { inFootprint } from '@/sim/environment/human/plan';
import { stepWatering } from '@/sim/environment/effectsWatering';
import { floodCheats } from './cheats';
import { intensityAt } from './inflow';

/** An x (at the footprint's z) a moisture cell beyond the watering footprint's edge. */
function besidePoint(sim: Sim, inst: HumanEventInst): number {
  const fp = humanPlan(sim, inst)!.impacts[0].fp;
  const x = fp.x + Math.max(fp.hx, fp.hz) + 2 * sim.state.env.moisture.cell;
  expect(inFootprint(fp, x, fp.z)).toBe(false);
  return x;
}

describe('watering through the human-events module (nest-fix3 item 7, real path)', () => {
  it.each(['sprinkler', 'hose', 'can'] as HumanVariant[])('%s: intensity 0.5 under the water while it runs, 0 beside it and after it', (variant) => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 8000 }));
    floodCheats(sim.state).rainI = -1; // the sky's rain, not a forced value
    const c = sim.world.size / 2, at = { x: c, y: 0, z: c };
    expect(intensityAt(sim, at)).toBe(0);
    const inst = scheduleNow(sim, 'watering', variant, -1, at);
    const far = { x: 0, y: 0, z: c };
    let wetTicks = 0, besideWet = 0, maxRate = 0, ran = false;
    for (let i = 0; i < 20000; i++) {
      sim.tick();
      const run = sim.state.env.human.active.find((r) => r.instId === inst.id);
      if (run) ran = true;
      if (run?.started) {
        if (far.x === 0) far.x = besidePoint(sim, inst);
        const rate = humanRainRateAt(sim, at.x, at.z);
        maxRate = Math.max(maxRate, rate);
        if (rate > 0) {
          wetTicks++;
          expect(intensityAt(sim, at)).toBe(FLOOD_HUMAN_WATER_INTENSITY);
        }
        if (intensityAt(sim, far) > 0) besideWet++;
      }
      if (ran && !run) break;
    }
    expect(inst.cancelled).toBe(false);
    expect(ran).toBe(true);
    expect(wetTicks).toBeGreaterThan(0);
    expect(maxRate).toBeGreaterThan(0);
    expect(besideWet).toBe(0);
    // the run is over: no water falls there any more
    expect(sim.state.env.human.active.some((r) => r.instId === inst.id)).toBe(false);
    expect(intensityAt(sim, at)).toBe(0);
  });

  it('a sprinkler run wets the soil under it, not beside it', () => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 8000 }));
    const m = sim.state.env.moisture;
    const c = sim.world.size / 2, at = { x: c, y: 0, z: c };
    const cell = (x: number, z: number) => Math.floor(z / m.cell) * m.nx + Math.floor(x / m.cell);
    const inst = scheduleNow(sim, 'watering', 'sprinkler', -1, at);
    for (let i = 0; i < 20000; i++) {
      sim.tick();
      if (sim.state.env.human.active.find((r) => r.instId === inst.id)?.started && humanRainRateAt(sim, at.x, at.z) > 0) break;
    }
    const under = cell(at.x, at.z), beside = cell(besidePoint(sim, inst), at.z);
    expect(humanRainRateAt(sim, at.x, at.z)).toBeGreaterThan(0);
    const t0 = m.theta0[under], t1 = m.theta0[beside];
    expect(stepWatering(sim)).toBeGreaterThan(0);
    expect(m.theta0[under]).toBeGreaterThan(t0);
    expect(m.theta0[beside]).toBe(t1);
  });
});
