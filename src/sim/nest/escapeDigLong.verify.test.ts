// gate-sim-2 review: the report lists nest/escapeDig as "an execution-speed bound" (opened after 3.5 h on Nov 22 trees,
// against the test's 2.5 h). On the gate-sim-2 tree (43fbaf86) the same nest is not open after the test's whole 8 game
// hours: it opens at 2190 ticks = 8.76 game h (2.5 x the Nov 22 time, 2.2 x R14's 4 h). This case only guards that the
// escape plan opens the nest at all within a game day (so "slow" is not silently becoming "never") and logs the hours;
// the speed bound is escapeDig.test's.
import { describe, expect, it } from 'vitest';
import { escapePlan } from '@/sim/colony/founding/reopen';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { makeNestColony, run } from '@/sim/ants/behaviours/nest/testkit';
import { fillSphere } from './carveOps';

describe('reviewer: escape dig of a nest closed by plain fill (gate-sim-2)', () => {
  it('the escape plan opens the nest within a game day (logs the hours)', () => {
    const k = makeNestColony({ workers: 16, seed: 2 });
    const { sim, nest, entrance: e } = k;
    const bu = sim.world.bu;
    fillSphere(sim, { ...e.pos, y: e.pos.y - 1.5 * bu }, 2.5 * bu);
    run(sim, 60);
    const id = escapePlan(sim, nest);
    expect(id).toBeGreaterThan(0);
    const plan = nest.digPlans.find((p) => p.id === id)!;
    let opened = -1;
    const at8h: string[] = [];
    for (let t = 0; t < TICKS_PER_DAY && opened < 0; t += 10) {
      run(sim, 10);
      if (nest.entrances.some((x) => x.status === 'open')) opened = t;
      if (t === 8 * TICKS_PER_HOUR) at8h.push(JSON.stringify({ status: plan.status, plan }));
    }
    const diggers = sim.stores.ants.list.filter((a) => a.alive && a.task === 'dig').length;
    const msg = JSON.stringify({ openedTick: opened, openedH: opened / TICKS_PER_HOUR, status: plan.status, diggers }).slice(0, 600)
      + ' ' + (at8h[0] ?? '').slice(0, 600);
    // eslint-disable-next-line no-console
    console.log('escape dig', msg);
    expect(opened, msg).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
