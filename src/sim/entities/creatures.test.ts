import { describe, expect, it } from 'vitest';
import { FOOT_OFFSET_BU } from '@/sim/balance';
import { makeTestSim } from '@/sim/testing';
import { spawnCreature } from './creatures';

describe('spawnCreature', () => {
  it('uses the world body unit and lifts the walker by its foot offset, like spawnAnt', () => {
    const sim = makeTestSim();
    const ctx = { state: sim.state, stores: sim.stores, emit: (e: Parameters<typeof sim.emit>[0]) => sim.emit(e), world: { bu: 9 } };
    const ground = { x: 100, y: 5, z: 100 };
    const c = spawnCreature(ctx, { kind: 'springtail', pos: ground });
    expect(c.footOffset).toBeCloseTo(FOOT_OFFSET_BU * 9);
    expect(c.radius).toBe(9);
    expect(c.pos.y).toBeCloseTo(ground.y + FOOT_OFFSET_BU * 9);
    expect(c.homeCenter).toEqual(ground);
  });

  it('defaults to the world of the sim', () => {
    const sim = makeTestSim();
    const c = spawnCreature(sim, { kind: 'springtail', pos: { x: 50, y: 0, z: 50 } });
    expect(c.footOffset).toBeCloseTo(FOOT_OFFSET_BU * sim.world.bu);
  });
});
