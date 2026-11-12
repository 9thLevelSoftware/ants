// Cap admission (pending counters), eviction selection, coordinate range and diffusion mass at the caps.
import { describe, expect, it } from 'vitest';
import { decode, encode } from '@/core/serialize';
import type { PheromoneState } from '@/sim/types';
import { PHERO_MAX, PHERO_PENDING_CELLS } from './balance';
import { diffuseLayer } from './decay';
import { kthSmallest, pickWeakest } from './evict';
import { createPheromoneField } from './field';
import { LayerRuntime } from './layer';
import { PendingTable } from './pending';
import { newField, TEST_CELL, testRandom } from './testkit';

const C = (i: number, j: number, k: number) => ({ x: (i + 0.5) * TEST_CELL, y: (j + 0.5) * TEST_CELL, z: (k + 0.5) * TEST_CELL });

describe('cap admission', () => {
  it('a new cell at the cap is admitted once its waiting deposits beat the floor, with their sum', () => {
    const f = newField({ limits: { home: { maxCells: 32, maxChunks: 50 } } });
    for (let i = 0; i < 33; i++) f.deposit(1, 'home', C(i, 0, 0), 1); // 33rd evicts 2 cells: floor 1
    expect(f.data.layers[0].cellFloor).toBe(1);
    expect(f.activeCellCount(1, 'home')).toBe(31);
    f.deposit(1, 'home', C(0, 0, 9), 0.1); // fills the cap again
    for (let k = 0; k < 10; k++) f.deposit(1, 'home', C(5, 0, 9), 0.1); // waits: 1.0 is not above 1
    expect(f.sampleCell(1, 'home', C(5, 0, 9))).toBe(0);
    f.deposit(1, 'home', C(5, 0, 9), 0.1);
    expect(f.sampleCell(1, 'home', C(5, 0, 9))).toBeCloseTo(1.1, 6);
    expect(f.validate()).toEqual([]);
  });

  it('a new chunk at the chunk cap is admitted once its waiting deposits beat the chunk floor', () => {
    const f = newField({ limits: { trail: { maxCells: 10000, maxChunks: 4 } } });
    for (let c = 0; c < 5; c++) for (let i = 0; i < 4; i++) f.deposit(1, 'trail', C(c * 16 + i, 0, 0), 1);
    expect(f.data.layers[0].chunkFloor).toBe(4); // the fifth chunk evicted chunk 0 (4 ph, lowest key of the tie)
    expect(f.stats().chunks).toBe(4);
    f.deposit(1, 'trail', C(100, 0, 0), 1); // a stray dab in a new chunk waits
    for (let k = 0; k < 4; k++) f.deposit(1, 'trail', C(200 + k, 0, 0), 1); // 4 ph: not above the floor yet
    expect(f.stats().chunks).toBe(4);
    expect(f.activeCellCount(1, 'trail')).toBe(16);
    f.deposit(1, 'trail', C(204, 0, 0), 1); // 5 ph waited: admitted, the weakest chunk (chunk 1) goes
    expect(f.sampleCell(1, 'trail', C(204, 0, 0))).toBe(1);
    expect(f.sampleCell(1, 'trail', C(16, 0, 0))).toBe(0);
    expect(f.sampleCell(1, 'trail', C(100, 0, 0))).toBe(0);
    expect(f.stats().chunks).toBe(4);
    expect(f.validate()).toEqual([]);
  });

  it('pending counters decay with the layer and survive save/load (identical admissions after reload)', () => {
    const f = newField({ limits: { home: { maxCells: 32, maxChunks: 50 } } });
    for (let i = 0; i < 33; i++) f.deposit(1, 'home', C(i, 0, 0), 1);
    f.deposit(1, 'home', C(0, 0, 9), 0.1);
    for (let k = 0; k < 8; k++) f.deposit(1, 'home', C(5, 0, 9), 0.1);
    f.step(600);
    const pending = f.data.layers[0].pendingCells!;
    expect(pending.length).toBe(2);
    expect(pending[1]).toBeCloseTo(0.8 * Math.pow(2, -0.5), 9);
    const g = createPheromoneField(decode(encode(f.data)) as PheromoneState, { limits: { home: { maxCells: 32, maxChunks: 50 } } });
    for (const h of [f, g]) for (let k = 0; k < 6; k++) h.deposit(1, 'home', C(5, 0, 9), 0.1);
    expect(g.sampleCell(1, 'home', C(5, 0, 9))).toBe(f.sampleCell(1, 'home', C(5, 0, 9)));
    expect(sameBytes(encode(g.data), encode(f.data))).toBe(true);
    expect(g.validate()).toEqual([]);
  });

  it('the pending table is bounded: a full table replaces its weakest entry only with a stronger newcomer', () => {
    const t = new PendingTable([], 3);
    t.accumulate(10, 1); t.accumulate(11, 0.5); t.accumulate(12, 2);
    expect(t.accumulate(13, 0.4)).toBe(0.4);
    expect(t.data).toEqual([10, 1, 11, 0.5, 12, 2]);
    t.accumulate(14, 0.7);
    expect(t.data).toEqual([10, 1, 14, 0.7, 12, 2]);
    t.remove(10);
    expect(t.data).toEqual([12, 2, 14, 0.7]);
    expect(t.validate('t')).toEqual([]);
    expect(PHERO_PENDING_CELLS).toBeGreaterThanOrEqual(64);
  });
});

describe('eviction selection', () => {
  it('kthSmallest agrees with a sort, including heavy ties', () => {
    const r = testRandom(5);
    for (let rep = 0; rep < 40; rep++) {
      const n = 1 + Math.floor(r() * 300);
      const a = new Float64Array(n);
      for (let i = 0; i < n; i++) a[i] = rep % 3 === 0 ? 7 : Math.floor(r() * (rep % 2 ? 5 : 1000));
      const sorted = Float64Array.from(a).sort();
      const k = Math.floor(r() * n);
      expect(kthSmallest(Float64Array.from(a), n, k)).toBe(sorted[k]);
    }
  });

  it('pickWeakest takes smallest values first, then smallest codes', () => {
    const v = Float64Array.from([3, 1, 2, 1, 1]);
    const c = Float64Array.from([0, 9, 1, 4, 7]);
    expect(Array.from(pickWeakest(v, c, 5, 2))).toEqual([0, 0, 0, 1, 1]);
    expect(Array.from(pickWeakest(v, c, 5, 4))).toEqual([0, 1, 1, 1, 1]);
  });
});

describe('coordinate range', () => {
  it('huge finite coordinates are refused everywhere (deposit, reads, sense, wipes), never aliased', () => {
    const f = newField();
    f.deposit(1, 'trail', C(6, 0, 0), 2);
    const far = { x: 2 ** 32 * TEST_CELL + C(6, 0, 0).x, y: C(6, 0, 0).y, z: C(6, 0, 0).z };
    f.deposit(1, 'trail', far, 5);
    expect(f.sampleCell(1, 'trail', C(6, 0, 0))).toBe(2);
    expect(f.sampleCell(1, 'trail', far)).toBe(0);
    expect(f.sample(1, 'trail', far)).toBe(0);
    const out = { x: 0, y: 0, z: 0 };
    expect(f.sense(1, 'trail', { ...far, x: far.x - 3 * 4 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, out)).toBe(0);
    expect(f.wipeRegion({ kind: 'sphere', center: far, radius: 20 }, 0)).toBe(0);
    expect(f.sampleCell(1, 'trail', C(6, 0, 0))).toBe(2);
    // The edge of the key range still works.
    const edge = 512 * 16 - 1;
    f.deposit(1, 'trail', C(edge, 0, -edge - 1), 1);
    expect(f.sampleCell(1, 'trail', C(edge, 0, -edge - 1))).toBe(1);
    f.deposit(1, 'trail', C(edge + 1, 0, 0), 1);
    expect(f.sampleCell(1, 'trail', C(edge + 1, 0, 0))).toBe(0);
    expect(f.validate()).toEqual([]);
  });
});

describe('alarm diffusion at the caps', () => {
  function layer(maxCells: number): LayerRuntime {
    return new LayerRuntime({ colony: -1, channel: 'alarm', keys: [], chunks: [] }, 16,
      { maxCells, maxChunks: 50, maxValue: PHERO_MAX.alarm }, { values: [], flags: [], max: 0 });
  }
  const mass = (l: LayerRuntime) => { let m = 0; for (let i = 0; i < l.count; i++) m += l.valueOf(l.active[i]); return m; };

  it('conserves mass when targets are saturated (the share stays with its source)', () => {
    const l = layer(1000);
    for (let i = 0; i < 5; i++) l.add(10 + i, 4, 4, 10); // a saturated row
    l.add(9, 4, 4, 0.5); // weak cell next to it: its source share into the saturated cell comes back
    const before = mass(l);
    diffuseLayer(l, 1, TEST_CELL, null);
    expect(mass(l)).toBeCloseTo(before, 4);
    for (let i = 0; i < l.count; i++) expect(l.valueOf(l.active[i])).toBeLessThanOrEqual(PHERO_MAX.alarm);
    expect(l.validate()).toEqual([]);
  });

  it('conserves mass at the cell cap when new target cells wait for admission', () => {
    const l = layer(7);
    l.add(4, 4, 4, 9);
    diffuseLayer(l, 1, TEST_CELL, null); // 7 cells: at the cap
    expect(l.nz).toBe(7);
    l.data.cellFloor = 5; // as after an eviction of strong cells: new targets must wait
    const before = mass(l);
    diffuseLayer(l, 1, TEST_CELL, null);
    expect(l.nz).toBe(7);
    expect(mass(l)).toBeCloseTo(before, 5);
    expect(l.validate()).toEqual([]);
  });
});

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
