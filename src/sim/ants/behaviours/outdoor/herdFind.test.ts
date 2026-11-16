// econ-growth R10: scouts find aphid herds by smell (herdFind.ts). Before, a herd's food-less source was invisible
// to the smell percept and no colony learnt of a herd it was not given; the `tend` demand stayed 0.

import { describe, expect, it } from 'vitest';
import { herdSourceOf, herdTendDemand, isDiscoveredBy, odourRadiusMm } from '@/sim/ecology';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { discoverHerdsNear } from './herdFind';

describe('scouts find herds by smell (econ-growth R10)', () => {
  it('a scout within the herd odour discovers it once; the herd then counts for the tend demand', () => {
    const { sim, plants } = plantSim({ workers: 4, sizeBu: 200, herbs: [{ dx: 40, dz: 0 }] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 100);
    const s = herdSourceOf(sim, h)!;
    expect(isDiscoveredBy(sim, s, col.id)).toBe(false);
    expect(herdTendDemand(sim, col.id)).toBe(0);
    const scout = sim.state.ants.find((a) => a.caste === 'worker')!;
    const r = odourRadiusMm(s, sim.world.bu);
    scout.pos = { x: s.pos.x + 2 * r, y: 0, z: s.pos.z };
    expect(discoverHerdsNear(sim, scout)).toBe(0); // out of smell range
    scout.pos = { x: s.pos.x + 0.5 * r, y: 0, z: s.pos.z };
    expect(discoverHerdsNear(sim, scout)).toBe(1);
    expect(discoverHerdsNear(sim, scout)).toBe(0); // known now
    expect(isDiscoveredBy(sim, s, col.id)).toBe(true);
    expect(herdTendDemand(sim, col.id)).toBeGreaterThan(0);
  });
});
