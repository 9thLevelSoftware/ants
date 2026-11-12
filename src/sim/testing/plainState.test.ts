import { describe, expect, it } from 'vitest';
import { makeTestSim } from './testWorld';
import { findNonPlain } from './plainData';

describe('SimState is plain data', () => {
  it('a fresh state holds only primitives, plain objects, arrays and typed arrays', () => {
    const sim = makeTestSim({ terrain: 'noise', prims: 2 });
    expect(findNonPlain(sim.state)).toEqual([]);
  });

  it('stays plain after entities are spawned and ticks run', () => {
    const sim = makeTestSim();
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 5, caste: 'worker', ageGd: 1, task: 'forage', pos: null });
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, stage: 'egg', n: 3, chamberId: -1, progress: 0, destined: null });
    sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugar-granules', pos: { x: 10, y: 0, z: 10 }, units: 5, stage: null });
    sim.enqueue({ type: 'cheat.spawnCreature', kind: 'springtail', variant: null, pos: { x: 20, y: 0, z: 20 }, state: null });
    sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { x: 30, y: 0, z: 30 }, radius: 40, mode: null, chamberType: null, chamberIds: [] });
    for (let i = 0; i < 50; i++) sim.tick();
    expect(sim.stores.ants.count).toBe(6);
    expect(findNonPlain(sim.state)).toEqual([]);
  });

  it('detects class instances, functions, Maps, undefined', () => {
    expect(findNonPlain({ a: new Map(), b: () => 1, c: undefined, d: new (class X {})() })).toHaveLength(4);
  });
});
