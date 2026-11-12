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
    if (process.env.PRIM_BUDGET_LOG) console.log(`prim triangles: ant ${ant}, colony ${colony}`);
    expect(ant).toBeLessThan(500_000);
    expect(colony).toBeLessThan(1_000_000);
  });

  it('re-partitions a moving camera in well under a millisecond per frame on average', () => {
    const t0 = performance.now();
    for (let f = 0; f < 200; f++) r.update(new Vector3(8000 + f * 80, 10, 8000), 3840);
    const ms = (performance.now() - t0) / 200;
    if (process.env.PRIM_BUDGET_LOG) console.log(`re-partition ${ms.toFixed(3)} ms/frame`);
    expect(ms).toBeLessThan(2); // Node, CI noise included; measured ~0.2 ms
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
