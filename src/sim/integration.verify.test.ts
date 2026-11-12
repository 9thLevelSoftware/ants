// Reviewer tests (int-1A-sim gate): player intent sanitising and cheat-spawn placement on the kernel level set.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing/testWorld';

function possessQueen(sim: Sim): Ant {
  const id = sim.state.colonies[0].queenId;
  sim.enqueue({ type: 'possess', antId: id, via: 'command' });
  sim.tick();
  expect(sim.state.player.possessedAntId).toBe(id);
  return sim.stores.ants.get(id)!;
}

const finite = (a: Ant): boolean => [a.pos.x, a.pos.y, a.pos.z, a.fwd.x, a.fwd.y, a.fwd.z, a.up.x, a.up.y, a.up.z].every(Number.isFinite);

describe('setPlayerIntent robustness (reviewer)', () => {
  for (const [label, dir] of [
    ['NaN', { x: Number.NaN, y: 0, z: 0 }],
    ['Infinity', { x: Infinity, y: 0, z: 1 }],
    ['huge finite (overflows x*x)', { x: 1e200, y: 0, z: 1e200 }],
    ['length 50', { x: 50, y: 0, z: 0 }],
  ] as const) {
    it(`a ${label} direction never puts a non-finite value into the possessed walker`, () => {
      const sim = makeTestSim();
      const q = possessQueen(sim);
      sim.setPlayerIntent({ dir: { ...dir }, hurry: false, grip: false, held: [], flight: null });
      for (let t = 0; t < 30; t++) { sim.tick(); sim.integratePossessed(1 / 60); }
      expect(finite(q)).toBe(true);
      expect(Math.abs(sim.field.sample(q.pos) - q.footOffset)).toBeLessThan(0.25 * sim.world.bu);
    });
  }

  it('an intent without a dir is treated as no input', () => {
    const sim = makeTestSim();
    const q = possessQueen(sim);
    sim.setPlayerIntent({ hurry: false, grip: false, held: [], flight: null } as never);
    for (let t = 0; t < 10; t++) sim.tick();
    expect(finite(q)).toBe(true);
  });
});

describe('cheat.spawnAnts placement (reviewer)', () => {
  it('spawned workers stand on the level set, also next to rocks', () => {
    const sim = makeTestSim({ prims: 40 });
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: 40, caste: 'worker', ageGd: 2, task: null, pos: null });
    sim.tick();
    const workers = sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
    expect(workers.length).toBe(40);
    for (const w of workers) {
      expect(finite(w)).toBe(true);
      expect(sim.field.sample(w.pos)).toBeGreaterThan(0);
    }
  });
});
