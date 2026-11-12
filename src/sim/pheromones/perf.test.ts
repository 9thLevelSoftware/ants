// AC6 performance budgets (measured on the dev container; asserted on the fastest of many repetitions with 2x
// slack because other test files and processes run in parallel). Run alone for clean numbers: npx vitest run src/sim/pheromones/perf.test.ts --silent=false
import { describe, expect, it } from 'vitest';
import { newField, TEST_CELL, testRandom } from './testkit';
import type { PheromoneRuntime } from './field';

const SLACK = 2;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Logs median and min; returns the min (robust against other processes; the median is for the report). */
function report(label: string, xs: number[]): number {
  const m = median(xs), lo = Math.min(...xs);
  console.log(`${label}: median ${m.toFixed(3)} ms, min ${lo.toFixed(3)} ms`);
  return lo;
}

/** 100,000 active cells for colony 0: home 60,000 (245 x 245 on the ground), trail 40,000 (200 x 200). */
function filledField(): PheromoneRuntime {
  const f = newField();
  const p = { x: 0, y: 2, z: 0 };
  for (let i = 0; i < 60000; i++) {
    p.x = ((i % 245) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 245) + 0.5) * TEST_CELL;
    f.deposit(0, 'home', p, 10);
  }
  for (let i = 0; i < 40000; i++) {
    p.x = ((i % 200) + 0.5) * TEST_CELL; p.z = (Math.floor(i / 200) + 0.5) * TEST_CELL;
    f.deposit(0, 'trail', p, 10);
  }
  return f;
}

describe('pheromone performance (AC6)', () => {
  const f = filledField();

  it('decay pass over 100,000 active cells < 3 ms', () => {
    expect(f.activeCellCount()).toBe(100000);
    const times: number[] = [];
    for (let k = 0; k < 40; k++) {
      const t0 = performance.now();
      f.step(1);
      times.push(performance.now() - t0);
    }
    expect(f.activeCellCount()).toBe(100000);
    const m = report('decay 100k cells', times.slice(10));
    expect(m).toBeLessThan(3 * SLACK);
  });

  it('2,000 deposits < 0.5 ms', () => {
    const r = testRandom(1);
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 2000; i++) pts.push({ x: r() * 260 * TEST_CELL, y: 2, z: r() * 260 * TEST_CELL });
    const times: number[] = [];
    for (let k = 0; k < 60; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 2000; i++) f.deposit(0, i & 1 ? 'trail' : 'home', pts[i], 0.25);
      times.push(performance.now() - t0);
    }
    const m = report('2000 deposits', times.slice(10));
    expect(m).toBeLessThan(0.5 * SLACK);
  });

  it('5,000 senseDirection calls < 2 ms', () => {
    const r = testRandom(2);
    const pts: { x: number; y: number; z: number }[] = [];
    const fw: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 5000; i++) {
      pts.push({ x: r() * 200 * TEST_CELL, y: 0.6, z: r() * 200 * TEST_CELL });
      const a = r() * 6.283;
      fw.push({ x: Math.cos(a), y: 0, z: Math.sin(a) });
    }
    const up = { x: 0, y: 1, z: 0 }, out = { x: 0, y: 0, z: 0 };
    const times: number[] = [];
    let acc = 0;
    for (let k = 0; k < 60; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 5000; i++) acc += f.sense(0, 'trail', pts[i], fw[i], up, out);
      times.push(performance.now() - t0);
    }
    expect(acc).toBeGreaterThan(0);
    const m = report('5000 senseDirection', times.slice(10));
    expect(m).toBeLessThan(2 * SLACK);
  });
});
