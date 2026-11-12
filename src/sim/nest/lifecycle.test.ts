// Nest lifecycle helpers, architect queries, the nest system inside the full system list, invariants, cost.
import { describe, expect, it } from 'vitest';
import { checkInvariants, collectInvariants, makeTestSim, type InvariantViolation } from '@/sim/testing';
import { carveTemplateNest, createFoundingNest, nestStats, wallSpots, chamberStats, voxelAt } from './index';
import { runNestSystem } from './system';
import { nestSim, runTicks } from './nestTestKit';

const BU = 4;
const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe('nest lifecycle', () => {
  it('createFoundingNest + carveTemplateNest: an entrance, a royal cell and the template chambers, all reachable', () => {
    const sim = nestSim();
    const colony = sim.state.colonies[0];
    const site = { x: sim.world.size / 2 + 30 * BU, y: 0, z: sim.world.size / 2 };
    const nest = createFoundingNest(sim, colony.id, site);
    expect(nest.founding?.state).toBe('site-search');
    expect(colony.nestIds).toContain(nest.id);
    const { chambers } = carveTemplateNest(sim, nest.id);
    expect(nest.founding).toBeNull();
    expect(nest.entrances.length).toBe(1);
    expect(chambers.map((c) => c.type)).toEqual(['royal', 'nursery', 'food']);
    for (const c of chambers) expect(sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, c.center)).toBeGreaterThan(0);
    const e = nest.entrances[0];
    expect(e.moundId).toBeGreaterThanOrEqual(0);
    const stats = nestStats(sim, nest.id)!;
    expect(stats.chambers).toBe(3);
    expect(stats.openEntrances).toBe(1);
    expect(stats.depthBu).toBeGreaterThan(20);
    expect(stats.volume).toBeGreaterThan(chambers.reduce((s, c) => s + c.volume, 0));
    expect(stats.tunnelLengthBu).toBeGreaterThan(10);
  });

  it('architect queries: wall spots, chamber stats, voxel query', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0];
    const spots = wallSpots(sim, nest.id, 48, 3);
    expect(spots.length).toBe(48);
    for (const s of spots) {
      expect(s.depthBu).toBeGreaterThan(0);
      expect(Math.hypot(s.normal.x, s.normal.y, s.normal.z)).toBeCloseTo(1, 6);
    }
    expect(chamberStats(sim, nest.id).length).toBe(3);
    const q = voxelAt(sim, nest.chambers[0].center);
    expect(q.open).toBe(255);
    expect(q.flags).toBe(0);
  });
});

describe('nest system', () => {
  it('runs inside the full system list without invariant violations', () => {
    const sim = makeTestSim({ nest: 'small', workers: 20 });
    const out: InvariantViolation[] = [];
    const list = collectInvariants();
    for (let n = 0; n < 6; n++) {
      runTicks(sim, 50);
      checkInvariants(sim, list, out);
    }
    expect(out.filter((v) => v.invariant.startsWith('nest') || v.invariant === 'pellets-valid')).toEqual([]);
  }, 60_000);

  it('cost: one nest-system tick of the small nest stays far below a frame (load-tolerant; strict with FOUNDRESS_PERF_STRICT=1)', () => {
    const sim = nestSim({ nest: 'small', workers: 20 });
    runTicks(sim, 60); // first detection and fields built
    const strict = env.FOUNDRESS_PERF_STRICT === '1';
    let best = Infinity;
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      for (let n = 0; n < 100; n++) { runNestSystem(sim); sim.state.tick++; }
      best = Math.min(best, (performance.now() - t0) / 100);
    }
    expect(best).toBeLessThan(strict ? 0.5 : 4);
  }, 60_000);
});
