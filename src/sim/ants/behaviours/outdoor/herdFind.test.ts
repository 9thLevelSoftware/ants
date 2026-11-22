// econ-growth R10: scouts find aphid herds by smell (herdFind.ts). Before, a herd's food-less source was invisible
// to the smell percept and no colony learnt of a herd it was not given; the `tend` demand stayed 0.

import { describe, expect, it } from 'vitest';
import { herdSourceOf, herdTendDemand, isDiscoveredBy, odourRadiusMm } from '@/sim/ecology';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { discoverHerdsNear, herdSignRadiusMm } from './herdFind';
import { noticeOutside } from './notice';

describe('scouts find herds by smell (econ-growth R10)', () => {
  it('a scout within the herd odour discovers it once; the herd then counts for the tend demand', () => {
    const { sim, plants } = plantSim({ workers: 4, sizeBu: 200, herbs: [{ dx: 40, dz: 0 }] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 100);
    const s = herdSourceOf(sim, h)!;
    expect(isDiscoveredBy(sim, s, col.id)).toBe(false);
    expect(herdTendDemand(sim, col.id)).toBe(0);
    const scout = sim.state.ants.find((a) => a.caste === 'worker')!;
    // R38 item 2: the herd's sign (100 aphids: the 24 BU cap), not its 6 BU odour, sets the radius
    const r = herdSignRadiusMm(h, sim.world.bu);
    expect(r).toBeGreaterThan(odourRadiusMm(s, sim.world.bu));
    scout.pos = { x: s.pos.x + 2 * r, y: 0, z: s.pos.z };
    expect(discoverHerdsNear(sim, scout)).toBe(0); // out of the sign's range
    scout.pos = { x: s.pos.x + 0.5 * r, y: 0, z: s.pos.z };
    expect(discoverHerdsNear(sim, scout)).toBe(1);
    expect(discoverHerdsNear(sim, scout)).toBe(0); // known now
    expect(isDiscoveredBy(sim, s, col.id)).toBe(true);
    expect(herdTendDemand(sim, col.id)).toBeGreaterThan(0);
  });
});

describe('R38 item 2: a herd\'s sign grows with the herd, and any worker outside finds it', () => {
  it('plan radius clamp(6 + 2 sqrt(aphids), 6, 24) BU', () => {
    const { sim, plants } = plantSim({ workers: 1, sizeBu: 200, herbs: [{ dx: 40, dz: 0 }] });
    const bu = sim.world.bu;
    const h = addHerd(sim, plants[0], 7);
    const at = (a: number) => { h.a = a; return herdSignRadiusMm(h, bu) / bu; };
    expect(at(0)).toBeCloseTo(6, 9);
    expect(at(7)).toBeCloseTo(6 + 2 * Math.sqrt(7), 9); // ~11.3
    expect(at(14)).toBeCloseTo(6 + 2 * Math.sqrt(14), 9); // ~13.5
    expect(at(64)).toBeCloseTo(22, 9);
    expect(at(400)).toBeCloseTo(24, 9);
  });

  it('a worker outside on a task that is not a trip (a hauler) discovers a 64-aphid herd 20 BU away (plan distance)', () => {
    const { sim, plants } = plantSim({ workers: 2, sizeBu: 200, herbs: [{ dx: 40, dz: 0 }] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 64);
    const s = herdSourceOf(sim, h)!;
    const bu = sim.world.bu;
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    ant.task = 'haul'; ant.nestId = -1;
    ant.pos = { x: s.pos.x + 20 * bu, y: s.pos.y - 9 * bu, z: s.pos.z }; // on the ground under a raised herd
    noticeOutside(sim, ant);
    expect(isDiscoveredBy(sim, s, col.id)).toBe(true);
  });

  it('a worker inside the nest does not', () => {
    const { sim, plants } = plantSim({ workers: 2, sizeBu: 200, herbs: [{ dx: 40, dz: 0 }] });
    const col = sim.state.colonies[0];
    const h = addHerd(sim, plants[0], 64);
    const s = herdSourceOf(sim, h)!;
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    ant.nestId = Math.max(0, ant.nestId);
    ant.pos = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    noticeOutside(sim, ant);
    expect(isDiscoveredBy(sim, s, col.id)).toBe(false);
  });
});
