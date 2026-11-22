// Spatial partition of primitive sets: haze cull, pixel-size cull, level of detail, hidden originals, and the
// standard-world budget (architecture section 6: < 1.5 M triangles at High).
import { describe, expect, it } from 'vitest';
import { Vector3, type InstancedMesh } from 'three';
import type { Primitive } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { createWorldUniforms } from '../materials/uniforms';
import { PrimSet, type PartitionView } from './primCells';
import { lodFor, instanceShape, type Lod } from './primInstances';
import { PrimitiveRenderer, PRIM_SIZE_CULL_K } from './primitiveRenderer';

function prim(id: number, x: number, z: number, r = 2, extra: Partial<Primitive> = {}): Primitive {
  return {
    id, shape: 'ellipsoid', pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: r, y: r, z: r }, round: 0,
    material: 'stone', flags: 0, objectId: -1, ...extra,
  };
}

const view = (x: number, z: number, over: Partial<PartitionView> = {}): PartitionView => (
  { x, y: 10, z, nearMm: 280, cullMm: Infinity, sizeK: PRIM_SIZE_CULL_K, ...over }
);

function collect(set: PrimSet, v: PartitionView): Map<number, Lod> {
  const out = new Map<number, Lod>();
  set.partition(v, (i, _b, lod) => out.set(set.ids[i], lod));
  return out;
}

describe('PrimSet partition', () => {
  it('culls past the haze distance, but keeps a big object whose bounding sphere reaches inside', () => {
    const set = new PrimSet([prim(1, 1000, 0, 5), prim(2, 5000, 0, 5), prim(3, 5000, 0, 2500)], () => false, 560);
    const seen = collect(set, view(0, 0, { cullMm: 3000 }));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(false);
    expect(seen.has(3)).toBe(true);
  });

  it('skips primitives smaller than about a pixel, never big ones', () => {
    const set = new PrimSet([prim(1, 2 * PRIM_SIZE_CULL_K + 100, 0, 2), prim(2, 2 * PRIM_SIZE_CULL_K + 100, 0, 40)], () => false, 560);
    const seen = collect(set, view(0, 0));
    expect(seen.has(1)).toBe(false);
    expect(seen.has(2)).toBe(true);
  });

  it('chooses the same level of detail as lodFor, and leaves hidden primitives out', () => {
    const list: Primitive[] = [];
    for (let i = 0; i < 300; i++) list.push(prim(i, (i % 20) * 37, Math.floor(i / 20) * 41, 1 + (i % 7) * 6));
    const set = new PrimSet(list, () => false, 560);
    set.hidden[set.indexOf(5)] = 1;
    const seen = collect(set, view(100, 100));
    for (const p of list) {
      if (p.id === 5) { expect(seen.has(5)).toBe(false); continue; }
      expect(seen.get(p.id)).toBe(lodFor(p, instanceShape(p).radius, 100, 10, 100, 280));
    }
  });
});

/** GDD 04 4.1 PRIM_BUDGET_TOTAL for a standard world (16 m, Lasius). */
const PRIM_BUDGET_TOTAL = 16000;

function standardWorld(): Primitive[] {
  // pebbles 1-8 mm over 16 m plus a few hundred large objects (slabs, logs, walls)
  const list: Primitive[] = [];
  let h = 12345;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296);
  for (let i = 0; i < PRIM_BUDGET_TOTAL; i++) {
    const big = i % 50 === 0;
    const r = big ? 40 + rnd() * 300 : 1 + rnd() * 7;
    list.push(prim(i, rnd() * 16000, rnd() * 16000, r, { shape: i % 3 === 0 ? 'box' : 'ellipsoid', material: i % 4 === 0 ? 'bark' : 'stone', round: r * 0.3 }));
  }
  return list;
}

function triangles(r: PrimitiveRenderer): number {
  let t = 0;
  for (const c of r.group.children) {
    const m = c as InstancedMesh;
    if (!m.visible) continue;
    t += (m.geometry.getIndex()!.count / 3) * m.count;
  }
  return t;
}

describe('PrimitiveRenderer budget on a standard world', () => {
  const lib = new MaterialLibrary(null, createWorldUniforms(), { anisotropy: 1 });
  const r = new PrimitiveRenderer(lib, 280);
  r.setStatic(standardWorld());

  it('stays well inside the 1.5 M triangle budget at ant height and from the colony camera', () => {
    // lawn haze (300 BU at Lasius) x PRIM_FOG_CULL_K 3.2 = 3840 mm
    r.update(new Vector3(8000, 10, 8000), 3840);
    const ant = triangles(r);
    // colony camera 225 BU up: haze visibility grows to 1200 BU -> cull 15 m (the whole map)
    r.update(new Vector3(8000, 900, 8000), 15360);
    const colony = triangles(r);
    expect(ant).toBeLessThan(500_000);
    expect(colony).toBeLessThan(1_000_000);
  });

  it('re-partitions a moving camera in well under a millisecond per frame (best of 3 batches)', () => {
    let best = Infinity;
    for (let batch = 0; batch < 3; batch++) {
      const t0 = performance.now();
      for (let f = 0; f < 100; f++) r.update(new Vector3(4000 + batch * 3000 + f * 80, 10, 8000), 3840); // > nearMm/4 per frame
      best = Math.min(best, (performance.now() - t0) / 100);
    }
    expect(best).toBeLessThan(2); // measured ~0.4 ms in Node (the full rebuild it replaces: ~8 ms)
  });

  it('does not re-upload when a small camera move leaves the visible set unchanged', () => {
    const big = new PrimitiveRenderer(lib, 280);
    big.setStatic([prim(1, 1000, 1000, 300), prim(2, 1200, 1000, 300)]);
    big.update(new Vector3(0, 10, 0), 50_000);
    const u0 = big.stats().uploads;
    big.update(new Vector3(100, 10, 0), 50_000); // past the re-partition step, same instances and LOD
    expect(big.rebuilds).toBe(2);
    expect(big.stats().uploads).toBe(u0);
    big.dispose();
  });
});

describe('tiny level of detail', () => {
  it('the minimal rounded box is 12 outward triangles whose faces meet at shared corners (no cracks)', async () => {
    const { roundedBoxData, expandVertex } = await import('./primGeometry');
    const d = roundedBoxData(0);
    expect(d.index.length / 3).toBe(12);
    const v = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
    const seen = new Map<string, number>();
    for (let i = 0; i < d.dir.length / 3; i++) {
      expandVertex(d, i, { x: 3, y: 2, z: 1 }, 0.5, false, v);
      const k = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(seen.size).toBe(8);
    for (const n of seen.values()) expect(n).toBe(3);
    for (let t = 0; t < d.index.length; t += 3) {
      expandVertex(d, d.index[t], { x: 3, y: 2, z: 1 }, 0.5, false, a);
      expandVertex(d, d.index[t + 1], { x: 3, y: 2, z: 1 }, 0.5, false, b);
      expandVertex(d, d.index[t + 2], { x: 3, y: 2, z: 1 }, 0.5, false, c);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      expect(n.dot(a.clone().add(b).add(c))).toBeGreaterThan(0);
    }
  });
});

describe('PrimSet object foot (the reference of plinths and brick courses)', () => {
  const box = (id: number, y: number, hy: number, objectId: number): Primitive => (
    { id, shape: 'box', pos: { x: id * 100, y, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 50, y: hy, z: 5 }, round: 0, material: 'brick', flags: 0, objectId }
  );
  it('every prim of an object shares the lowest bottom of the object, so a facade cut into bands has one plinth line', () => {
    // bands 234..1050 and 1050..2250 of one wall, and a lone prim of another object
    const set = new PrimSet([box(1, 642, 408, 7), box(2, 1650, 600, 7), box(3, 5000, 100, 8)], () => false, 560);
    expect(set.foot[0]).toBeCloseTo(234, 3);
    expect(set.foot[1]).toBeCloseTo(234, 3);
    expect(set.foot[2]).toBeCloseTo(4900, 3);
  });
  it('a prim without an object uses its own bottom, a rotated box its rotated extent', () => {
    const lone = new PrimSet([box(1, 300, 100, -1)], () => false, 560);
    expect(lone.foot[0]).toBeCloseTo(200, 3);
    const s = Math.SQRT1_2;
    const tilted: Primitive = { ...box(2, 500, 100, -1), rot: { x: 0, y: 0, z: s, w: s }, size: { x: 300, y: 100, z: 5 } }; // turned 90 degrees about z: x extent is now vertical
    expect(new PrimSet([tilted], () => false, 560).foot[0]).toBeCloseTo(200, 2);
  });
});

describe('PrimitiveRenderer feeds the face detail (look-pass-4 fix)', () => {
  const lib = new MaterialLibrary(null, createWorldUniforms(), { anisotropy: 1 });
  const wall = (id: number, y: number, hy: number): Primitive => (
    { id, shape: 'box', pos: { x: 100, y, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 50, y: hy, z: 800 }, round: 0, material: 'brick', flags: 0, objectId: 5 }
  );
  const log: Primitive = { id: 9, shape: 'cylinder', pos: { x: 400, y: 100, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 300, y: 300, z: 300 }, round: 0, material: 'wood-sound', flags: 0, objectId: 6 };

  it('writes the object foot per instance (iFoot) so the bands of one wall share one plinth line', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic([wall(1, 642, 408), wall(2, 1650, 600), log]);
    r.update(new Vector3(0, 100, 0), 50_000);
    const brick = r.group.children.filter((c) => c.name.includes('|brick|') && (c as InstancedMesh).count > 0) as InstancedMesh[];
    expect(brick.length).toBeGreaterThan(0);
    for (const m of brick) {
      const foot = m.geometry.getAttribute('iFoot').array as Float32Array;
      for (let i = 0; i < m.count; i++) expect(foot[i]).toBeCloseTo(234, 3);
    }
    r.dispose();
  });

  it('a cylinder log never gets the flat-face patterns: its material is a separate, curved variant', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic([log, { ...log, id: 10, shape: 'box', size: { x: 300, y: 300, z: 300 }, objectId: 7 }]);
    r.update(new Vector3(0, 100, 0), 50_000);
    const meshes = r.group.children.filter((c) => c.name.includes('wood-sound')) as InstancedMesh[];
    const cyl = meshes.find((m) => m.name.includes(':cyl|')), box = meshes.find((m) => m.name.includes(':box|'));
    expect(cyl).toBeDefined(); expect(box).toBeDefined();
    expect(cyl!.material).not.toBe(box!.material);
    const defines = (m: InstancedMesh): string => {
      const mat = m.material as { onBeforeCompile: (s: unknown, r: unknown) => void };
      const s = { uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_begin>\n#include <fog_fragment>' };
      mat.onBeforeCompile(s, null);
      return s.vertexShader;
    };
    expect(defines(cyl!)).not.toContain('#define WR_BOARDS');
    expect(defines(cyl!)).not.toContain('#define WR_FACE');
    expect(defines(box!)).toContain('#define WR_FACE_WOOD');
    r.dispose();
  });
});
