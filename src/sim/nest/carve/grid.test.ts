import { describe, expect, it } from 'vitest';
import type { CarveData } from '@/sim/types/geom';
import { decode, encode } from '@/core/serialize';
import { createCarveGrid, type CarveChange } from './grid';
import { chunkKey, CHUNK3, keyCx, keyCy, keyCz, meshChunksForBox, OPEN_MIN } from './keys';

const BU = 4;
const V = BU / 2;
const emptyData = (): CarveData => ({ voxel: V, keys: [], chunks: [], breaches: [] });
const vec = (x: number, y: number, z: number) => ({ x, y, z });

describe('chunk keys', () => {
  it('round-trips negative and large coordinates', () => {
    for (const [cx, cy, cz] of [[0, 0, 0], [-1, -3, 7], [700, -20, 1023], [-1024, 1023, -1024]]) {
      const k = chunkKey(cx, cy, cz);
      expect([keyCx(k), keyCy(k), keyCz(k)]).toEqual([cx, cy, cz]);
    }
  });
  it('marks chunks whose mesh reads a changed sample (including normal overlap)', () => {
    const keys = meshChunksForBox({ i0: 16, j0: 5, k0: 5, i1: 16, j1: 5, k1: 5 });
    // sample 16 is read by chunk 0 (cells up to 16) and chunk 1 (owner)
    expect(keys).toContain(chunkKey(0, 0, 0));
    expect(keys).toContain(chunkKey(1, 0, 0));
    const k17 = meshChunksForBox({ i0: 17, j0: 5, k0: 5, i1: 17, j1: 5, k1: 5 });
    expect(k17).toContain(chunkKey(0, 0, 0)); // central-difference normal at sample 16 of chunk 0
  });
});

describe('carve grid', () => {
  it('carve then fill of the same sphere restores the original bytes exactly', () => {
    const data = emptyData();
    const g = createCarveGrid(data);
    const c = vec(31.3, -40.7, 12.2);
    const r1 = g.carveSphere(c, 9);
    expect(r1.changed).toBeGreaterThan(0);
    expect(g.openVolume()).toBeGreaterThan(0);
    const r2 = g.fillSphere(c, 9);
    expect(r2.closed).toBe(r1.opened);
    expect(data.keys.length).toBe(0);
    expect(data.chunks.length).toBe(0);
    expect(g.openVolume()).toBeCloseTo(0, 9);
    // the field term is fully solid everywhere around
    for (let n = 0; n < 500; n++) {
      const p = vec(c.x + ((n * 7) % 23) - 11, c.y + ((n * 11) % 23) - 11, c.z + ((n * 13) % 23) - 11);
      expect(g.cavity(p.x, p.y, p.z)).toBeLessThan(0);
    }
  });

  it('fill inside a larger cavity makes a solid plug and keeps the surrounding ramp', () => {
    const g = createCarveGrid(emptyData());
    g.carveCapsule(vec(0, -40, 0), vec(60, -40, 0), 6);
    g.fillSphere(vec(30, -40, 0), 7);
    expect(g.cavity(30, -40, 0)).toBeLessThan(0);
    expect(g.cavity(5, -40, 0)).toBeGreaterThan(0);
    expect(g.cavity(55, -40, 0)).toBeGreaterThan(0);
  });

  it('carved volume matches the analytic sphere volume within 10 % for r >= 1 BU', () => {
    for (const rBU of [1, 1.25, 1.5, 2, 3, 4]) {
      for (const off of [0, 0.31, 0.5, 0.77]) {
        const g = createCarveGrid(emptyData());
        const r = rBU * BU;
        const res = g.carveSphere(vec(100 + off * V, -100 + off * 0.7 * V, 50 - off * 0.3 * V), r);
        const exact = (4 / 3) * Math.PI * r * r * r;
        expect(Math.abs(res.volume / exact - 1)).toBeLessThan(0.1);
        expect(Math.abs(g.openVolume() / exact - 1)).toBeLessThan(0.1);
      }
    }
  });

  it('respects canDig and reports the blocked fraction', () => {
    const g = createCarveGrid(emptyData());
    const res = g.carveSphere(vec(0, -50, 0), 8, { canDig: (x) => x < 0 });
    expect(res.blockedFraction).toBeGreaterThan(0.35);
    expect(res.blockedFraction).toBeLessThan(0.65);
    for (const key of [...g.data.keys]) {
      g.forEachOpenSample(key, (i) => expect(i * V).toBeLessThan(0));
    }
    // force ignores canDig
    const f = g.carveSphere(vec(0, -50, 0), 8, { canDig: () => false, force: true });
    expect(f.blockedFraction).toBe(0);
    expect(g.cavity(4, -50, 0)).toBeGreaterThan(0);
  });

  it('detects breaches exactly when a brush crosses the substrate surface (flat ground at y = 0)', () => {
    const r = 1.5 * BU;
    const cases: [number, boolean][] = [
      [-r - 2 * V, false], [-r - 1.2 * V, false], [-r + 1.2 * V, true], [-r / 2, true], [0, true],
      [r / 2, true], [r - 1.2 * V, true], [r + 1.2 * V, false], [r + 3 * V, false],
    ];
    for (const [cy, expected] of cases) {
      for (const ox of [0, 0.37, 0.5]) {
        const g = createCarveGrid(emptyData());
        g.setSubstrateProbe((_x, y) => y);
        const res = g.carveSphere(vec(50 + ox * V, cy, 50 - ox * V), r);
        expect(res.breach, `centre y ${cy} offset ${ox}`).toBe(expected);
        expect(g.breaches.length > 0).toBe(expected);
      }
    }
  });

  it('does not report a breach under a hard cover even when the soil surface is near', () => {
    // substrate: ground at y = 0 plus a 10 mm slab (y in [-6, 4]) over x, z in [0, 100]
    const g = createCarveGrid(emptyData());
    g.setSubstrateProbe((x, y, z) => {
      const ground = y;
      const inSlabXZ = Math.max(-x, x - 100, -z, z - 100);
      const slab = Math.max(inSlabXZ, -6 - y, y - 4);
      return Math.min(ground, slab);
    });
    const under = g.carveSphere(vec(50, -6 - 2, 50), 4);
    expect(under.breach).toBe(false);
    const edge = g.carveCapsule(vec(80, -8, 50), vec(110, -2, 50), 4);
    expect(edge.breach).toBe(true);
    // the record sits beyond the slab edge
    expect(g.breaches.every((b) => b.pos.x > 95)).toBe(true);
  });

  it('breach records are de-duplicated and pruned when filled', () => {
    const g = createCarveGrid(emptyData());
    g.setSubstrateProbe((_x, y) => y);
    g.carveSphere(vec(10, 0, 10), 6);
    g.carveSphere(vec(10.5, 0, 10), 6);
    expect(g.breaches.length).toBe(1);
    g.fillSphere(vec(10, 0, 10), 12);
    expect(g.breaches.length).toBe(0);
  });

  it('volume excludes the parts of a brush in open air', () => {
    const g = createCarveGrid(emptyData());
    g.setSubstrateProbe((_x, y) => y);
    const r = 2 * BU;
    const res = g.carveSphere(vec(0.3, 0, 0.7), r);
    const half = (2 / 3) * Math.PI * r * r * r;
    expect(Math.abs(res.volume / half - 1)).toBeLessThan(0.1);
  });

  it('CarveData round-trips through encode/decode and a rebuilt grid samples identically', () => {
    const data = emptyData();
    const g = createCarveGrid(data);
    g.setSubstrateProbe((_x, y) => y);
    g.carveCapsule(vec(10, 2, 10), vec(60, -50, 40), 4);
    g.carveEllipsoid(vec(60, -54, 40), vec(20, 6, 18));
    g.fillSphere(vec(30, -20, 22), 3);
    const back = decode(encode(data)) as CarveData;
    expect(back.keys).toEqual(data.keys);
    expect(back.breaches).toEqual(data.breaches);
    const g2 = createCarveGrid(back);
    expect(g2.openVolume()).toBeCloseTo(g.openVolume(), 6);
    for (let n = 0; n < 3000; n++) {
      const x = (n * 0.731) % 80, y = -60 + ((n * 1.37) % 70), z = (n * 0.417) % 60;
      expect(g2.cavity(x, y, z)).toBe(g.cavity(x, y, z));
    }
  });

  it('keeps keys/chunks in sync and the index rebuildable', () => {
    const data = emptyData();
    const g = createCarveGrid(data);
    g.carveSphere(vec(0, 0, 0), 20);
    expect(data.keys.length).toBe(data.chunks.length);
    expect(new Set(data.keys).size).toBe(data.keys.length);
    for (const c of data.chunks) expect(c.length).toBe(CHUNK3);
    const before = g.cavity(3, 4, 5);
    g.rebuild();
    expect(g.cavity(3, 4, 5)).toBe(before);
  });

  it('tracks dirty chunks and notifies listeners', () => {
    const g = createCarveGrid(emptyData());
    const seen: CarveChange[] = [];
    g.addListener((c) => seen.push(c));
    const res = g.carveSphere(vec(32, -32, 32), 5);
    expect(seen.length).toBe(1);
    expect(seen[0].kind).toBe('carve');
    const dirty = g.takeDirty();
    expect(dirty).toEqual(res.dirty);
    expect(dirty.length).toBeGreaterThanOrEqual(8); // sphere straddles a chunk corner
    expect(g.takeDirty()).toEqual([]);
    g.carveSphere(vec(32, -32, 32), 5); // no change -> no notification
    expect(seen.length).toBe(1);
  });

  it('cavity gradient matches central differences inside the ramp band', () => {
    const g = createCarveGrid(emptyData());
    g.carveSphere(vec(10, -20, 10), 8);
    const gr = { x: 0, y: 0, z: 0 };
    const h = 1e-4;
    for (const p of [vec(17.3, -20.4, 10.2), vec(10.1, -12.6, 11), vec(4.2, -25.1, 6.3)]) {
      const val = g.cavity(p.x, p.y, p.z, gr);
      expect(Math.abs(val)).toBeLessThan(g.ramp / 2);
      const nx = (g.cavity(p.x + h, p.y, p.z) - g.cavity(p.x - h, p.y, p.z)) / (2 * h);
      const ny = (g.cavity(p.x, p.y + h, p.z) - g.cavity(p.x, p.y - h, p.z)) / (2 * h);
      const nz = (g.cavity(p.x, p.y, p.z + h) - g.cavity(p.x, p.y, p.z - h)) / (2 * h);
      expect(gr.x).toBeCloseTo(nx, 3);
      expect(gr.y).toBeCloseTo(ny, 3);
      expect(gr.z).toBeCloseTo(nz, 3);
      // points into the cavity (towards the centre) with magnitude ~1
      const len = Math.hypot(gr.x, gr.y, gr.z);
      expect(len).toBeGreaterThan(0.8);
      expect(len).toBeLessThan(1.25);
      expect(gr.x * (10 - p.x) + gr.y * (-20 - p.y) + gr.z * (10 - p.z)).toBeGreaterThan(0);
    }
  });

  it('iterates open samples', () => {
    const g = createCarveGrid(emptyData());
    g.carveSphere(vec(8, 8, 8), 4);
    let n = 0;
    for (const key of g.data.keys) g.forEachOpenSample(key, (_i, _j, _k, o) => { expect(o).toBeGreaterThanOrEqual(OPEN_MIN); n++; });
    expect(n).toBeGreaterThan(20);
  });
});
