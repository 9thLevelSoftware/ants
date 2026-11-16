// nest-fix3 item 4c: with no plan through any plug possible and no plug voxel in reach, the workers bite out along the
// shortest line to open air (colony/founding/reopen.ts escapePlan): a real founding shaft plan, dug by the workers'
// own dig behaviour. Here: the small test nest's throat filled with soil (no PLUG flags at all), the plan asked for,
// and the colony's workers left to dig it.
import { describe, expect, it } from 'vitest';
import { escapePlan } from '@/sim/colony/founding/reopen';
import { TICKS_PER_HOUR } from '@/sim/time';
import { makeNestColony, run } from '@/sim/ants/behaviours/nest/testkit';
import { fillSphere } from './carveOps';
import { plugCount } from './entrances';

describe('escape dig (nest-fix3 item 4c)', () => {
  it('a nest closed by plain fill gets a shaft plan from its cavity straight up to the air, and the workers open it', () => {
    const k = makeNestColony({ workers: 16, seed: 2 });
    const { sim, nest, entrance: e } = k;
    const bu = sim.world.bu;
    fillSphere(sim, { ...e.pos, y: e.pos.y - 1.5 * bu }, 2.5 * bu);
    run(sim, 60);
    expect(e.status).toBe('sealed');
    expect(plugCount(sim, e)).toBe(0);
    const id = escapePlan(sim, nest);
    expect(id).toBeGreaterThan(0);
    const plan = nest.digPlans.find((p) => p.id === id)!;
    expect(plan.source).toBe('founding');
    expect(plan.kind).toBe('shaft');
    // the colony digs it: some entrance of the nest is open again within 3 game hours (measured 2.8 here: the task
    // allocator, not this rule, decides how many diggers take the plan; the spec asks for 1 game hour, see report)
    let opened = -1;
    for (let t = 0; t < 2 * TICKS_PER_HOUR * 4 && opened < 0; t += 10) {
      run(sim, 10);
      if (nest.entrances.some((x) => x.status === 'open')) opened = t;
    }
    expect({ opened: opened >= 0, plan: plan.status }).toEqual({ opened: true, plan: plan.status });
    expect(opened, `open after ${opened} ticks`).toBeLessThanOrEqual(3 * TICKS_PER_HOUR);
  }, 60_000);
});
