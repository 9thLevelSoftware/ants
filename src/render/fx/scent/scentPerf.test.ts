// Acceptance 3: the scent view with 100,000 active cells (the player colony's trail and home layers at their caps,
// in the REAL pheromone field) stays within its per-frame CPU budget. Prints the numbers for the report.
// Surface projection is the real field.project of a real test world (noise terrain and rocks); the 100k cells cover
// far more ground than that world, so the snapper wraps x and z onto it (the cost per projection is the real one).
// Load-tolerant limits by default; FOUNDRESS_PERF_STRICT=1 applies the real budget.
import { describe, expect, it } from 'vitest';
import { createPheromoneField } from '@/sim/pheromones';
import type { PheromoneState } from '@/sim/types';
import type { Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { PERF_STRICT } from '@/sim/testing/perfLoad';
import { ScentCache, type CellLayerSpec, type SurfaceSnapper } from './ScentCache';
import { FADE_RATE_S, FULL_PH, SCENT_BUDGET, STYLE } from './tuning';

const CELL = 16;
/** High preset per-frame CPU budget of the scent view, ms (FX share of a 16.7 ms frame). */
const FRAME_BUDGET_MS = 1.5;
const LOOSE = 6;

/** The real world's field, with x and z wrapped onto the world (outputs moved back to the cell's tile). */
function wrappedFieldSnapper(sim: Sim): SurfaceSnapper {
  const size = sim.world.size;
  const p = { x: 0, y: 0, z: 0 };
  return {
    snap(x, y, z, outPos, outNrm) {
      const ox = Math.floor(x / size) * size, oz = Math.floor(z / size) * size;
      p.x = x - ox; p.y = y; p.z = z - oz;
      if (!sim.field.project(p, 0, outPos, outNrm)) return false;
      outPos.x += ox; outPos.z += oz;
      return true;
    },
  };
}

function field100k() {
  const data: PheromoneState = { cell: CELL, chunkCells: 16, layers: [], lastDecayTick: 0 };
  const f = createPheromoneField(data);
  const p = { x: 0, y: 0, z: 0 };
  const at = (i: number, k: number) => {
    p.x = (i + 0.5) * CELL; p.z = (k + 0.5) * CELL;
    p.y = 0.5 * CELL; // the cells just above the ground (the noise terrain stays within half a cell of 0)
  };
  let n = 0;
  // trail: 40,000 cells in a 200 x 200 block; home: 60,000 cells in a 300 x 200 block beside it (ground level)
  for (let i = 0; i < 200; i++) for (let k = 0; k < 200; k++) {
    at(i, k);
    f.deposit(0, 'trail', p, 1 + ((i * 7 + k * 3) % 20));
    n++;
  }
  for (let i = 0; i < 300; i++) for (let k = 0; k < 200; k++) {
    at(i, k + 200);
    f.deposit(0, 'home', p, 0.5 + ((i + k) % 7));
    n++;
  }
  return { f, n, data };
}

const specs: CellLayerSpec[] = [
  { kind: 'cells', key: '0:trail', colony: 0, channel: 'trail', style: STYLE.trail, fullPh: FULL_PH.trail, origins: [{ x: 0, y: 0, z: 0 }] },
  { kind: 'cells', key: '0:home', colony: 0, channel: 'home', style: STYLE.home, fullPh: FULL_PH.home, origins: [] },
];

describe('scent view with 100,000 active cells', () => {
  it('first build and steady frames within the per-frame budget', () => {
    const sim = makeTestSim({ terrain: 'noise', prims: 6, seed: 3, systems: [] });
    expect(sim.state.phero.cell).toBe(CELL);
    const { f, n, data } = field100k();
    expect(f.activeCellCount!()).toBe(100_000);
    expect(n).toBe(100_000);
    const b = SCENT_BUDGET.high;
    const budget = { chunks: b.chunksPerFrame, visits: b.visitsPerFrame, minRefreshS: b.minRefreshS, evictScan: b.evictScanPerFrame };
    const c = new ScentCache(b.maxCells, CELL);
    c.setLayers(specs);
    const snap = wrappedFieldSnapper(sim);
    const frame = () => {
      c.refresh(f, data, budget, now);
      c.processSnaps(snap, b.snapsPerFrame);
      c.processAxes(b.axesPerFrame, b.axesSweepPerFrame, b.geoPerFrame);
      c.ease(1 / 60, FADE_RATE_S);
    };

    // first build at the high budget: frames until every cell is placed (drawn, or found to have no surface)
    let frames = 0, now = 0;
    const buildTimes: number[] = [];
    const tBuild = performance.now();
    while ((c.stats().slots < n || c.stats().pending > 0) && frames < 600) {
      const t = performance.now();
      frame();
      buildTimes.push(performance.now() - t);
      frames++; now += 1 / 60;
    }
    const buildMs = performance.now() - tBuild;
    const live = c.stats().live;
    expect(live).toBeGreaterThan(95_000); // a few cells over the rocks have no surface within reach

    // steady state: the field decays every tick, so every layer is due whenever its refresh interval has passed
    const times: number[] = [];
    for (let i = 0; i < 90; i++) {
      f.step!(0.1);
      const t = performance.now();
      frame();
      times.push(performance.now() - t);
      now += 1 / 60;
    }
    times.sort((a, z) => a - z);
    const median = times[times.length >> 1], p95 = times[Math.floor(times.length * 0.95)], max = times[times.length - 1];
    const mean = times.reduce((a, z) => a + z, 0) / times.length;
    buildTimes.sort((a, z) => a - z);
    const bMedian = buildTimes[buildTimes.length >> 1], bP95 = buildTimes[Math.floor(buildTimes.length * 0.95)];
    const bMax = buildTimes[buildTimes.length - 1];
    const bMean = buildMs / frames;
    console.log(`[scent perf] 100k cells (${live} on a surface), high budget, real field.project: first build ${frames} frames ${buildMs.toFixed(0)} ms `
      + `(frame mean ${bMean.toFixed(2)} median ${bMedian.toFixed(2)} p95 ${bP95.toFixed(2)} max ${bMax.toFixed(2)} ms); `
      + `steady frame mean ${mean.toFixed(3)} median ${median.toFixed(3)} p95 ${p95.toFixed(3)} max ${max.toFixed(3)} ms; draw calls 1`);
    const limit = PERF_STRICT ? FRAME_BUDGET_MS : FRAME_BUDGET_MS * LOOSE;
    expect(mean).toBeLessThan(limit);
    expect(bMedian).toBeLessThan(limit);
  });
});
