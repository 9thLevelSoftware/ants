import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing/testWorld';
import { createEntityIndexImpl, isLocoEntityIndex } from './entityIndex';

describe('entity index', () => {
  it('finds ants by radius and follows moves after refreshWalkers', () => {
    const sim = makeTestSim({ nest: 'small', workers: 10, systems: [] });
    const idx = createEntityIndexImpl(sim.stores, 8 * sim.world.bu);
    expect(isLocoEntityIndex(idx)).toBe(true);
    idx.refresh();
    const a = sim.state.ants[3];
    const out: number[] = [];
    expect(idx.queryAnts(a.pos, 0.1, out)).toContain(a.id);
    a.pos = { x: a.pos.x + 100, y: a.pos.y, z: a.pos.z };
    expect(idx.queryAnts(a.pos, 0.1, out)).not.toContain(a.id);
    idx.refreshWalkers();
    expect(idx.queryAnts(a.pos, 0.1, out)).toContain(a.id);
    expect(idx.queryCreatures(a.pos, 10, out)).toEqual([]);
  });
});
