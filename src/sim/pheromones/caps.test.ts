import { describe, expect, it } from 'vitest';
import { HOME_DEPOSIT_PER_BU, PHERO_MAX_CELLS, PHERO_MAX_CHUNKS, TRAIL_DAB } from './balance';
import { newField, TEST_BU, TEST_CELL, testRandom } from './testkit';

const C = (i: number, j: number, k: number) => ({ x: (i + 0.5) * TEST_CELL, y: (j + 0.5) * TEST_CELL, z: (k + 0.5) * TEST_CELL });

describe('pheromone caps and eviction', () => {
  it('evicts exactly the weakest 1/16 of the cells when the cell cap is hit', () => {
    const f = newField({ limits: { trail: { maxCells: 100, maxChunks: 50 } } });
    for (let i = 0; i < 100; i++) f.deposit(1, 'trail', C(i, 0, 0), (i + 1) * 0.25);
    f.deposit(1, 'trail', C(0, 0, 5), 3);
    expect(f.activeCellCount(1, 'trail')).toBe(100 - 7 + 1);
    for (let i = 0; i < 100; i++) expect(f.sampleCell(1, 'trail', C(i, 0, 0)) > 0).toBe(i >= 7);
    expect(f.validate()).toEqual([]);
  });

  it('breaks ties deterministically (equal values: lowest canonical cell first)', () => {
    const f = newField({ limits: { trail: { maxCells: 32, maxChunks: 50 } } });
    for (let i = 0; i < 32; i++) f.deposit(1, 'trail', C(31 - i, 0, 0), 2);
    f.deposit(1, 'trail', C(0, 0, 9), 2);
    expect(f.activeCellCount(1, 'trail')).toBe(32 - 2 + 1);
    expect(f.sampleCell(1, 'trail', C(0, 0, 0))).toBe(0);
    expect(f.sampleCell(1, 'trail', C(1, 0, 0))).toBe(0);
    expect(f.sampleCell(1, 'trail', C(2, 0, 0))).toBe(2);
  });

  it('evicts the chunk holding the least pheromone when the chunk cap is hit', () => {
    const f = newField({ limits: { home: { maxCells: 10000, maxChunks: 4 } } });
    const sums = [5, 1, 9, 3];
    sums.forEach((n, c) => { for (let i = 0; i < n; i++) f.deposit(1, 'home', C(c * 16 + i, 0, 0), 1); });
    f.deposit(1, 'home', C(200, 0, 0), 0.5);
    expect(f.stats().chunks).toBe(4);
    expect(f.sampleCell(1, 'home', C(16, 0, 0))).toBe(0); // the 1-cell chunk went
    expect(f.sampleCell(1, 'home', C(0, 0, 0))).toBe(1);
    expect(f.sampleCell(1, 'home', C(200, 0, 0))).toBe(0.5);
    expect(f.validate()).toEqual([]);
  });

  it('AC7: 1,000 ants depositing for 20,000 ticks: caps hold and memory stops growing', () => {
    const f = newField();
    const r = testRandom(2024);
    const N = 1000, world = 4000 * TEST_BU;
    const px = new Float64Array(N), pz = new Float64Array(N), h = new Float64Array(N);
    for (let i = 0; i < N; i++) { px[i] = r() * world; pz[i] = r() * world; h[i] = r() * 6.283; }
    const step = 0.6 * TEST_BU; // 6 BU/s, 0.1 s ticks
    const p = { x: 0, y: 0.6, z: 0 };
    const samples: { cells: number; chunks: number; bytes: number }[] = [];
    for (let t = 1; t <= 20000; t++) {
      for (let i = 0; i < N; i++) {
        h[i] += (r() - 0.5) * 0.6;
        px[i] = Math.min(world, Math.max(0, px[i] + Math.cos(h[i]) * step));
        pz[i] = Math.min(world, Math.max(0, pz[i] + Math.sin(h[i]) * step));
        p.x = px[i]; p.z = pz[i];
        f.deposit(0, 'home', p, HOME_DEPOSIT_PER_BU * 0.6);
        if (i % 3 === 0 && (t + i) % 3 === 0) f.deposit(0, 'trail', p, TRAIL_DAB);
      }
      if (t % 10 === 0) f.step(1);
      if (t % 1000 === 0) samples.push({ cells: f.activeCellCount(), chunks: f.stats().chunks, bytes: f.stats().bytes });
    }
    expect(f.activeCellCount(0, 'trail')).toBeLessThanOrEqual(PHERO_MAX_CELLS.trail);
    expect(f.activeCellCount(0, 'home')).toBeLessThanOrEqual(PHERO_MAX_CELLS.home);
    const capBytes = (PHERO_MAX_CHUNKS.trail + PHERO_MAX_CHUNKS.home) * 4096 * 5 + 4 * 2 * 65536 * 4 + 4 * 1024 * 16;
    const maxBytes = Math.max(...samples.map((s) => s.bytes));
    expect(maxBytes).toBeLessThanOrEqual(capBytes);
    // Saturation: the caps are hit early (a uniform spread over the map), then nothing grows.
    const sat = samples.findIndex((s) => s.chunks >= 0.9 * (PHERO_MAX_CHUNKS.trail + PHERO_MAX_CHUNKS.home));
    expect(sat).toBeGreaterThanOrEqual(0);
    expect(sat).toBeLessThan(10);
    const peakAtSat = Math.max(...samples.slice(0, sat + 1).map((s) => s.bytes));
    for (const s of samples.slice(sat + 1)) {
      expect(s.chunks).toBeLessThanOrEqual(PHERO_MAX_CHUNKS.trail + PHERO_MAX_CHUNKS.home);
      expect(s.bytes).toBeLessThanOrEqual(peakAtSat * 1.05 + 65536 * 8);
    }
    expect(f.validate()).toEqual([]);
    // Reported in the task report: the samples.
    (globalThis as { __pheroMemorySamples?: unknown }).__pheroMemorySamples = samples;
    // a functional check, not a budget: ~80 s alone, ~180 s with the whole suite on a loaded 4-core machine
  }, 600_000);
});
