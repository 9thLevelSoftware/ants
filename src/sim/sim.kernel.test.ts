// Save round trip on the real kernel (F-int acceptance 6): snapshot -> restore -> continue equals an
// uninterrupted run, with a pre-carved nest, run-time carving, a mound overlay and walkers that move with the
// kernel walker along nest-nav fields (so every derived kernel cache must be rebuilt identically on load).
import { describe, expect, it } from 'vitest';
import type { Sim, System } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { walkerSnapshot, walkerStep } from '@/sim/locomotion/walker';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { SYSTEMS } from '@/sim/systems';
import { makeTestSim, makeTestWorld } from '@/sim/testing';

const target = { x: 0, y: 0, z: 0 };
const want = { x: 0, y: 0, z: 0 };

/** Test-only movement: workers climb the exit field; at tick 15 a cheat carves a side pocket; tick 25 a mound. */
const kernelWalkers: System = {
  name: 'test-kernel-walkers',
  run(sim: Sim) {
    const s = sim.state, bu = sim.world.bu, nest = s.nests[0];
    if (s.tick === 15) {
      const c = nest.chambers[1].center;
      sim.enqueue({ type: 'cheat.carveSphere', pos: { x: c.x + 6 * bu, y: c.y, z: c.z }, r: 2 * bu });
    }
    if (s.tick === 25 && s.worldDelta.mounds.length === 0) {
      const e = nest.entrances[0].pos, n = 17, cell = 0.5 * bu, h = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) {
        const dx = (i % n) - 8, dz = Math.floor(i / n) - 8, r = Math.hypot(dx, dz);
        h[i] = r > 3 && r < 7 ? bu * 0.5 : 0; // a crater ring around the opening
      }
      const m = { id: s.nextId++, nestId: nest.id, entranceId: nest.entrances[0].id, centerX: e.x, centerZ: e.z,
        cell, n, base: new Float32Array(n * n), h, material: 'loam', volume: 0, absorbed: 0, lastBatchTick: s.tick };
      s.worldDelta.mounds.push(m);
      sim.kernel.setHeightOverlay({ id: m.id, x0: e.x - 8 * cell, z0: e.z - 8 * cell, cell, nx: n, nz: n, h, material: 'loam' });
    }
    const id = nestFieldId(nest.id, { kind: 'exit', id: -1 });
    for (const a of s.ants) {
      if (!a.alive || a.caste !== 'worker') continue;
      const d = sim.kernel.nav.lookahead(id, a.pos, 4, target);
      if (!(d > bu)) continue;
      want.x = target.x - a.pos.x; want.y = target.y - a.pos.y; want.z = target.z - a.pos.z;
      walkerSnapshot(a);
      walkerStep(sim.field, a, want, 6 * bu, 0.1, sim.kernel.walker);
    }
  },
};

function run(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

describe('save round trip on the kernel', () => {
  it('snapshot -> restore -> continue equals a straight run (carve grid non-empty, mound, moving walkers)', () => {
    const world = makeTestWorld({ seed: 5, terrain: 'noise', features: 'all' });
    const systems = [kernelWalkers, ...SYSTEMS];
    const mk = (): Sim => makeTestSim({ world, seed: 5, systems, nest: 'small', workers: 8 });
    const total = 60;
    const straight = mk();
    run(straight, total);
    expect(straight.state.worldDelta.carve.keys.length).toBeGreaterThan(0);
    expect(straight.state.worldDelta.mounds.length).toBe(1);
    for (const N of [1, 20, 30]) {
      const first = mk();
      run(first, N);
      expect(first.state.worldDelta.carve.keys.length, `N=${N}`).toBeGreaterThan(0);
      const resumed = createSim(restore(snapshot(first)).state, world, { systems });
      expect(resumed.field.height(resumed.state.nests[0].origin.x + 5 * world.bu, resumed.state.nests[0].origin.z))
        .toBe(first.field.height(first.state.nests[0].origin.x + 5 * world.bu, first.state.nests[0].origin.z));
      run(resumed, total - N);
      expect(stateHash(resumed.state), `N=${N}`).toBe(stateHash(straight.state));
    }
    // the workers really moved
    const w0 = mk().state.ants.find((a) => a.caste === 'worker')!;
    const w1 = straight.state.ants.find((a) => a.id === w0.id)!;
    expect(Math.hypot(w1.pos.x - w0.pos.x, w1.pos.y - w0.pos.y, w1.pos.z - w0.pos.z)).toBeGreaterThan(world.bu);
  });
});
