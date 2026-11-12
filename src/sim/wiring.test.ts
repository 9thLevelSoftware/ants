// Runtime hooks installed by createSim (src/sim/wiring.ts): the pheromone decay modifier and free-space test
// (GDD 02 §8.2), and the nest clutter speed factor for walkers in cavities.
import { describe, expect, it } from 'vitest';
import { ensureThermal } from '@/sim/environment';
import { pheromoneSystem } from '@/sim/pheromones';
import { makeTestSim } from '@/sim/testing/testWorld';
import { aiSpeed } from '@/sim/locomotion';
import { spawnPellet } from '@/sim/nest/pellets';
import { locoParams } from '@/sim/locomotion/params';
import { newScratch } from '@/sim/locomotion/scratch';

describe('pheromone hooks', () => {
  it('trail decays faster on sunlit porous ground than in a sheltered nest cavity', () => {
    const sim = makeTestSim({ nest: 'small', systems: [pheromoneSystem] });
    ensureThermal(sim);
    const bu = sim.world.bu, col = sim.state.colonies[0].id;
    const room = sim.state.nests[0].chambers[0];
    const under = { x: room.center.x, y: room.center.y, z: room.center.z };
    const surf = { x: sim.world.size * 0.2, y: sim.field.height(sim.world.size * 0.2, sim.world.size * 0.2) + 0.5 * bu, z: sim.world.size * 0.2 };
    expect(sim.field.isUnderground(under)).toBe(true);
    sim.phero.deposit(col, 'trail', under, 20);
    sim.phero.deposit(col, 'trail', surf, 20);
    for (let t = 0; t < 3000; t++) sim.tick(); // 300 s
    const u = sim.phero.sample(col, 'trail', under), s = sim.phero.sample(col, 'trail', surf);
    // base 900 s half-life: 300 s alone leaves 0.79; sheltered x1.5 half-life keeps more, sunlit porous x0.5 less
    expect(u).toBeGreaterThan(s);
    expect(u / 20).toBeGreaterThan(0.79 * 0.9);
  });

  it('alarm diffuses only into free cells (none into the solid ground below the surface)', () => {
    const sim = makeTestSim({ systems: [pheromoneSystem] });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const g = sim.field.height(c, c);
    sim.phero.deposit(-1, 'alarm', { x: c, y: g + 1 * bu, z: c }, 10);
    for (let t = 0; t < 30; t++) sim.tick();
    let solidCells = 0, cells = 0;
    sim.phero.forEachActiveCell!(-1, 'alarm', (x, y, z) => { cells++; if (sim.field.sampleXYZ(x, y, z) <= 0) solidCells++; });
    expect(cells).toBeGreaterThan(1);
    expect(solidCells).toBe(0);
  });
});

describe('locomotion speed factors', () => {
  it('loose pellets in a cavity slow walkers there (nest clutterSpeedMult), not on the surface', () => {
    const sim = makeTestSim({ nest: 'small', workers: 1, systems: [] });
    const ant = sim.state.ants.find((a) => a.caste === 'worker')!;
    expect(ant.medium).toBe('cavity');
    const P = locoParams(sim.world.bu), s = newScratch();
    const v0 = aiSpeed(sim, ant, s, P);
    for (let n = 0; n < 6; n++) {
      const it = spawnPellet(sim, { ...ant.pos }, 0.85 * sim.world.bu ** 3, 'loam', ant.nestId, ant.colony, -1);
      it.inNest = true;
    }
    sim.index.refresh();
    expect(aiSpeed(sim, ant, s, P)).toBeLessThan(v0);
  });
});
