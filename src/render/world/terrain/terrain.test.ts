// Terrain LOD seams, hole mask rasterisation, terrain data tables and mound geometry (pure parts).
import { describe, expect, it, vi } from 'vitest';
import { heightAt } from '@/sim/world/terrainSample';
import { materialCode, type Mound } from '@/sim/types';
import { INNER_SHRINK, layoutClipmap, levelCountFor, morphedXZ, morphFactor } from './clipmap';
import { HoleMask } from './holeMask';
import { buildMoundArrays } from './moundRenderer';
import { buildLayerTable, sampleHeight, usedCodes } from './terrainData';

describe('clipmap layout', () => {
  const n = 64, s0 = 8;
  it('reaches the requested distance', () => {
    const L = levelCountFor(s0, n, 20000);
    expect((n / 2) * s0 * 2 ** (L - 1)).toBeGreaterThanOrEqual(20000);
    expect((n / 2) * s0 * 2 ** (L - 2)).toBeLessThan(20000);
  });

  it('snaps every level so its even vertices lie on the next coarser grid', () => {
    for (const [cx, cz] of [[8123.4, 7999.9], [3.3, 15990], [12345.6, 222.2]]) {
      const lay = layoutClipmap(cx, cz, s0, n, 8);
      for (let l = 0; l < 7; l++) {
        const f = lay.levels[l], c = lay.levels[l + 1];
        expect(((f.originX - c.originX) / c.spacing) % 1).toBeCloseTo(0, 9);
        expect(((f.originZ - c.originZ) / c.spacing) % 1).toBeCloseTo(0, 9);
        // the camera stays within two spacings of the level centre
        expect(Math.abs(f.originX + (n / 2) * f.spacing - cx)).toBeLessThanOrEqual(f.spacing * 2 + 1e-9);
      }
    }
  });

  it('fully morphs the outer ring of a level onto the coarser grid (no T-junction cracks)', () => {
    const lay = layoutClipmap(8123.4, 7999.9, s0, n, 4);
    const f = lay.levels[1], c = lay.levels[2];
    const p = { x: 0, z: 0 };
    for (let g = 0; g <= n; g++) {
      for (const [gx, gz] of [[g, 0], [g, n], [0, g], [n, g]]) {
        expect(morphFactor(gx, gz, n)).toBe(1);
        morphedXZ(f, gx, gz, p);
        // on a coarse vertex column/row
        expect(((p.x - c.originX) / c.spacing) % 1).toBeCloseTo(0, 6);
        expect(((p.z - c.originZ) / c.spacing) % 1).toBeCloseTo(0, 6);
      }
    }
    // interior vertices do not move
    expect(morphFactor(n / 2 + 1, n / 2, n)).toBe(0);
  });

  it('discards only inside the finer level, with a small overlap', () => {
    const lay = layoutClipmap(500, 500, s0, n, 3);
    const f = lay.levels[0], c = lay.levels[1];
    expect(c.innerX0).toBeCloseTo(f.originX + INNER_SHRINK * f.spacing, 9);
    expect(c.innerX1).toBeCloseTo(f.originX + n * f.spacing - INNER_SHRINK * f.spacing, 9);
    expect(lay.levels[0].innerX0).toBeGreaterThan(lay.levels[0].innerX1); // level 0 discards nothing
    // the finer level's square lies inside the coarser level's non-morphing interior
    const half = (n / 2) * c.spacing, cc = c.originX + half;
    expect(Math.abs(f.originX - cc) / half).toBeLessThan(0.8);
    expect(Math.abs(f.originX + n * f.spacing - cc) / half).toBeLessThan(0.8);
  });
});

describe('hole mask', () => {
  const mk = () => new HoleMask({ worldSize: 4000, texelMm: 1, tileTexels: 64, atlasSlots: 4 });
  it('rasterises a circular opening exactly to its outline', () => {
    const hm = mk();
    hm.setProbe((x, z) => 5 - Math.hypot(x - 1000, z - 1000));
    hm.markCircle(1000, 1000, 5);
    expect(hm.update(100)).toBeGreaterThan(0);
    expect(hm.isOpen(1000, 1000)).toBe(true);
    expect(hm.isOpen(1003.5, 1000)).toBe(true);
    expect(hm.isOpen(1006.5, 1000)).toBe(false);
    expect(hm.isOpen(1500, 1500)).toBe(false);
    expect(hm.usedSlots).toBeGreaterThanOrEqual(1);
  });
  it('handles holes across tile borders (border texels) and frees slots when closed', () => {
    const hm = mk();
    let open = true;
    hm.setProbe((x, z) => (open ? 6 - Math.hypot(x - 1024, z - 1024) : -1));
    hm.markCircle(1024, 1024, 6);
    hm.update(100);
    expect(hm.usedSlots).toBe(4); // the corner of four tiles
    for (const [x, z] of [[1022, 1022], [1026, 1022], [1022, 1026], [1026, 1026], [1024, 1024]]) expect(hm.isOpen(x, z)).toBe(true);
    open = false;
    hm.markCircle(1024, 1024, 6);
    hm.update(100);
    expect(hm.usedSlots).toBe(0);
    expect(hm.isOpen(1024, 1024)).toBe(false);
  });
  it('counts holes that find the atlas full, warns once, and opens them when a slot frees up', () => {
    const hm = new HoleMask({ worldSize: 4000, texelMm: 1, tileTexels: 64, atlasSlots: 1 }); // one slot
    const holes = new Set(['a', 'b']);
    hm.setProbe((x, z) => Math.max(holes.has('a') ? 5 - Math.hypot(x - 300, z - 300) : -1, holes.has('b') ? 5 - Math.hypot(x - 1300, z - 1300) : -1));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    hm.markCircle(300, 300, 5);
    hm.markCircle(1300, 1300, 5);
    hm.update(100, 300, 300);
    expect(hm.isOpen(300, 300)).toBe(true);
    expect(hm.isOpen(1300, 1300)).toBe(false);
    expect(hm.droppedTiles).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    holes.delete('a'); // the first hole closes: its slot goes to the waiting one
    hm.markCircle(300, 300, 5);
    hm.update(100);
    hm.update(100);
    expect(hm.isOpen(1300, 1300)).toBe(true);
    expect(hm.droppedTiles).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('respects the per-frame budget, nearest tiles first', () => {
    const hm = mk();
    hm.setProbe(() => -1);
    hm.markRect(0, 0, 3999, 3999);
    const total = hm.pending;
    expect(hm.update(5, 0, 0)).toBe(5);
    expect(hm.pending).toBe(total - 5);
  });
});

describe('terrain data', () => {
  it('maps material codes to deduplicated texture layers', () => {
    const codes = new Uint8Array([materialCode('loam'), materialCode('clay'), materialCode('asphalt'), materialCode('loam'), 250]);
    const used = usedCodes(codes);
    expect(used).toContain(materialCode('loam'));
    expect(used).toContain(0); // unknown code 250 -> loam
    const t = buildLayerTable(used);
    // loam and clay share the soil scan with different tints
    expect(t.matA[materialCode('clay')].x).toBe(t.matA[materialCode('loam')].x);
    expect(t.matB[materialCode('clay')].x).not.toBe(t.matB[materialCode('loam')].x);
    expect(t.layerDefs.map((d) => d.texture)).toEqual(['soil_garden', 'asphalt']);
  });
  it('samples heights exactly like the kernel', () => {
    const nx = 9, data = new Float32Array(nx * nx);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 1.7) * 20;
    const hf = { cell: 16, nx, nz: nx, data };
    for (const [x, z] of [[0, 0], [17.3, 99.1], [127.9, 3], [64, 64]]) {
      expect(sampleHeight({ cell: 16, nx, nz: nx, heights: data }, x, z)).toBeCloseTo(heightAt(hf, x, z), 3);
    }
  });
});

describe('mound geometry', () => {
  const mound = (fill: (r: number) => number): Mound => {
    const n = 32, cell = 2, base = new Float32Array(n * n), h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = fill(Math.hypot(i - 15.5, j - 15.5) * cell);
    return { id: 1, nestId: 1, entranceId: 1, centerX: 100, centerZ: 100, cell, n, base, h, material: 'loam', volume: 1, absorbed: 0, lastBatchTick: 0 };
  };
  it('crops to the soil and keeps the entrance cells open', () => {
    const a = buildMoundArrays(mound((r) => (r < 6 ? 0 : r < 20 ? 3 : 0)))!;
    expect(a).not.toBeNull();
    // fewer vertices than the whole grid
    expect(a.pile.length).toBeLessThan(32 * 32);
    // the vertex nearest the centre carries no pile (fragments are discarded there)
    let best = 1e9, pileAtCentre = -1;
    for (let k = 0; k < a.pile.length; k++) {
      const d = Math.hypot(a.pos[k * 3] - 100, a.pos[k * 3 + 2] - 100);
      if (d < best) { best = d; pileAtCentre = a.pile[k]; }
    }
    expect(pileAtCentre).toBe(0);
  });
  it('returns null for an empty pile', () => {
    expect(buildMoundArrays(mound(() => 0))).toBeNull();
  });
});
