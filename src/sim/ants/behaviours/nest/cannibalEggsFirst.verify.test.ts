// Independent review of colony-life round 12 (side fix in nurse.ts `cannibalise`): the nurse now abandons a chosen
// larva whenever any live egg of her colony exists ("eggs first"). The victim choice (colony/cannibalism.ts
// nextCannibalVictim) only counts eggs that lie on the floor (carriedBy === -1). With the only egg in someone's
// mandibles (here: a possessed worker holding it, as a player may), the choice keeps naming the larva and the step
// keeps abandoning it: under brood sacrifice no brood is eaten at all while the egg is carried.
// The control case (the egg lying) shows the same colony does reach brood sacrifice and eats the egg, then larvae.
import { describe, expect, it } from 'vitest';
import { AntFlag } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { takeBrood } from '@/sim/ants/actions/carry';
import { makeNestColony, run } from './testkit';

function starvingColony(carryEgg: boolean) {
  const k = makeNestColony({
    workers: 6, seed: 7, stores: { c: 20, p: 0 },
    brood: [{ stage: 'egg', n: 1, chamber: 'nursery' }, { stage: 'larva', n: 3, chamber: 'nursery', progress: 0.3 }],
  });
  const { sim } = k;
  const col = sim.state.colonies[0];
  // no laying (the queen would add lying eggs): only the one egg of the fixture exists
  const q = sim.stores.ants.get(col.queenId)!;
  q.queen!.fecundity = 0;
  run(sim, 20);
  if (carryEgg) {
    const egg = sim.stores.brood.list.find((b) => b.alive && b.stage === 'egg')!;
    const w = sim.stores.ants.list.find((a) => a.alive && a.caste === 'worker' && a.nestId >= 0)!;
    w.flags |= AntFlag.POSSESSED;
    takeBrood(sim, w, egg);
  }
  const eaten: string[] = [];
  sim.events.on('brood-died', (e) => { if (e.cause === 'cannibalised') eaten.push(e.stage); });
  let sacrifice = 0;
  for (let t = 0; t < Math.round(0.8 * TICKS_PER_DAY); t += 100) {
    run(sim, 100);
    if (col.starvationStage === 'brood-sacrifice' || col.starvationStage === 'adult-starvation') sacrifice++;
  }
  return { eaten, sacrifice };
}

describe('round 12 review: cannibalism "eggs first" re-check against a carried egg', () => {
  it('control: the egg lies on the floor -> brood sacrifice eats it, then a larva', () => {
    const { eaten, sacrifice } = starvingColony(false);
    expect(sacrifice).toBeGreaterThan(0);
    expect(eaten[0]).toBe('egg');
    expect(eaten.filter((s) => s === 'larva').length).toBeGreaterThan(0);
  }, 300_000);

  it('the only egg is carried -> brood sacrifice still eats a starving larva (the victim the choice names)', () => {
    const { eaten, sacrifice } = starvingColony(true);
    expect(sacrifice).toBeGreaterThan(0);
    expect(eaten.filter((s) => s === 'larva').length).toBeGreaterThan(0);
  }, 300_000);
});
