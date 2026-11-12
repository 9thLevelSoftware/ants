// Primitive geometry equals collision: every expanded vertex of the parametric geometries lies on the zero level of
// the matching SDF from src/core/math/sdf.ts, for several sizes and roundings. Plus instance data and LOD rules,
// and dynamic add / remove / update in the renderer (headless three).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { sdCappedCylinder, sdCapsule, sdEllipsoidExact, sdRoundBox } from '@/core/math/sdf';
import type { Primitive } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { createWorldUniforms } from '../materials/uniforms';
import { expandVertex, PRIM_DETAIL, roundedBoxData, roundedCylinderData, sphereData } from './primGeometry';
import { bucketKey, instanceShape, lodFor, LOD_SIZE_K, tintColor } from './primInstances';
import { PrimitiveRenderer } from './primitiveRenderer';

const v = new Vector3();

function prim(shape: Primitive['shape'], size: [number, number, number], round = 0, extra: Partial<Primitive> = {}): Primitive {
  return {
    id: 1, shape, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: size[0], y: size[1], z: size[2] }, round,
    material: 'stone', flags: 0, objectId: -1, ...extra,
  };
}

function maxSurfaceError(p: Primitive, sdf: (q: Vector3) => number): number {
  const s = instanceShape(p);
  const data = s.geom === 'box' ? roundedBoxData(PRIM_DETAIL.near.arc) : s.geom === 'cyl' ? roundedCylinderData(PRIM_DETAIL.near.arc + 1, 16) : sphereData(16);
  let worst = 0;
  for (let i = 0; i < data.dir.length / 3; i++) {
    expandVertex(data, i, { x: s.size[0], y: s.size[1], z: s.size[2] }, s.size[3], s.family === 'ellipsoid', v);
    worst = Math.max(worst, Math.abs(sdf(v)));
  }
  return worst;
}

describe('parametric primitive geometry matches the field SDFs', () => {
  it('rounded boxes (sharp, rounded, fully rounded)', () => {
    for (const [size, r] of [[[20, 5, 8], 0], [[225, 20, 225], 3], [[4, 4, 4], 4], [[62, 75, 457], 6]] as const) {
      const p = prim('box', [...size] as [number, number, number], r);
      expect(maxSurfaceError(p, (q) => sdRoundBox(q, p.size, r))).toBeLessThan(1e-4);
    }
  });
  it('cylinders and capsules', () => {
    for (const [rad, half, r] of [[22, 350, 3], [1.3, 62, 0.5], [60, 320, 8], [9, 220, 0]]) {
      const p = prim('cylinder', [rad, half, 0], r);
      expect(maxSurfaceError(p, (q) => sdCappedCylinder(q, rad, half, r))).toBeLessThan(1e-4);
    }
    for (const [rad, half] of [[3, 90], [1.8, 28], [10, 0]]) {
      const p = prim('capsule', [rad, half, 0]);
      expect(maxSurfaceError(p, (q) => sdCapsule(q, half, rad))).toBeLessThan(1e-4);
    }
  });
  it('ellipsoids', () => {
    const p = prim('ellipsoid', [18, 0.5, 7]);
    expect(maxSurfaceError(p, (q) => sdEllipsoidExact(q, 18, 0.5, 7))).toBeLessThan(1e-3);
  });
  it('box faces are wound outward', () => {
    const d = roundedBoxData(2);
    const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
    for (let t = 0; t < d.index.length; t += 3) {
      expandVertex(d, d.index[t], { x: 3, y: 2, z: 1 }, 0.5, false, a);
      expandVertex(d, d.index[t + 1], { x: 3, y: 2, z: 1 }, 0.5, false, b);
      expandVertex(d, d.index[t + 2], { x: 3, y: 2, z: 1 }, 0.5, false, c);
      n.subVectors(b, a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-12) continue; // collapsed band triangles
      const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      expect(n.dot(centre)).toBeGreaterThan(0);
    }
  });
});

describe('instance data', () => {
  it('maps contract sizes to shader sizes', () => {
    expect(instanceShape(prim('capsule', [3, 90, 0])).size).toEqual([3, 93, 3, 3]);
    expect(instanceShape(prim('cylinder', [22, 350, 0], 50)).size).toEqual([22, 350, 22, 22]); // rounding clamped
    expect(instanceShape(prim('box', [2, 3, 4], 9)).size[3]).toBe(2);
  });
  it('tints vary gently and deterministically', () => {
    const a = tintColor(prim('box', [1, 1, 1], 0, { tint: 0 }), [0, 0, 0]);
    const b = tintColor(prim('box', [1, 1, 1], 0, { tint: 1 }), [0, 0, 0]);
    expect(a[1]).toBeCloseTo(0.84, 5);
    expect(b[1]).toBeCloseTo(1.16, 5);
    expect(tintColor(prim('box', [1, 1, 1], 0, { id: 7 }), [0, 0, 0])).toEqual(tintColor(prim('box', [1, 1, 1], 0, { id: 7 }), [0, 0, 0]));
  });
  it('keeps big objects detailed farther away', () => {
    const small = prim('ellipsoid', [5, 5, 5], 0, { pos: { x: 1000, y: 0, z: 0 } });
    const big = prim('box', [300, 300, 300], 0, { pos: { x: 3000, y: 0, z: 0 } });
    expect(lodFor(small, 5, 0, 0, 0, 280)).toBe('far');
    expect(lodFor(big, Math.hypot(300, 300, 300), 0, 0, 0, 280)).toBe('near');
    expect(LOD_SIZE_K).toBeGreaterThan(1);
    expect(bucketKey('box', 'stone', false, 'near')).not.toBe(bucketKey('box', 'stone', true, 'near'));
  });
});

describe('PrimitiveRenderer dynamics (headless)', () => {
  const lib = new MaterialLibrary(null, createWorldUniforms(), { anisotropy: 1 });
  it('adds, moves and removes dynamic primitives in one update', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic([prim('box', [10, 10, 10], 1, { id: 1, material: 'concrete' })]);
    r.update(new Vector3());
    expect(r.stats().prims).toBe(1);
    const dyn = prim('ellipsoid', [30, 30, 30], 0, { id: 500, material: 'plastic', pos: { x: 100, y: 0, z: 0 } });
    r.syncDynamic([dyn], new Map());
    r.update(new Vector3());
    expect(r.has(500)).toBe(true);
    expect(r.stats().prims).toBe(2);
    const before = r.rebuilds;
    r.syncDynamic([{ ...dyn, pos: { x: 120, y: 0, z: 0 } }], new Map());
    r.update(new Vector3());
    expect(r.rebuilds).toBe(before + 1);
    r.syncDynamic([], new Map());
    r.update(new Vector3());
    expect(r.has(500)).toBe(false);
    expect(r.stats().prims).toBe(1);
    r.dispose();
  });
  it('moves static primitives of a moved object and restores them', () => {
    const r = new PrimitiveRenderer(lib, 280);
    const s = prim('box', [10, 10, 10], 1, { id: 3, material: 'metal' });
    r.setStatic([s]);
    r.update(new Vector3());
    r.syncDynamic([], new Map([[3, { ...s, pos: { x: 50, y: 0, z: 0 } }]]));
    r.update(new Vector3());
    const n0 = r.rebuilds;
    r.syncDynamic([], new Map());
    r.update(new Vector3());
    expect(r.rebuilds).toBe(n0 + 1);
    expect(r.has(3)).toBe(true);
    r.dispose();
  });
  it('uploads the render-only look of each primitive (finish vector and colour) with its instance (look-pass)', async () => {
    const { lookTable } = await import('../dressing/looks');
    const { FINISH } = await import('../dressing/finishes');
    const { PALETTE } = await import('../dressing/palette');
    const { InstancedMesh: IM } = await import('three');
    const r = new PrimitiveRenderer(lib, 280);
    r.setLooks(lookTable([{ id: 9, templateId: 'fridge', pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: 0, primCount: 1, tags: [], routeIds: [], poiIds: [] }]));
    r.setStatic([prim('box', [10, 10, 10], 1, { id: 1, material: 'metal', objectId: 9 }), prim('box', [10, 10, 10], 1, { id: 2, material: 'stone', objectId: -1, pos: { x: 30, y: 0, z: 0 } })]);
    r.update(new Vector3());
    const meshes = r.group.children.filter((c): c is InstanceType<typeof IM> => c instanceof IM && c.visible && c.count > 0);
    const metal = meshes.find((m) => m.name.includes('|metal|'))!, stone = meshes.find((m) => m.name.includes('|stone|'))!;
    const look = (m: InstanceType<typeof IM>) => Array.from((m.geometry.getAttribute('iLook').array as Float32Array).slice(0, 4));
    expect(look(metal)[0]).toBe(FINISH.colour); // white enamel, not the rust scan
    expect(look(stone)).toEqual([0, 0, 0, 0]); // natural
    const c = Array.from((metal.instanceColor!.array as Float32Array).slice(0, 3));
    for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - PALETTE.enamel[k])).toBeLessThan(PALETTE.enamel[k] * 0.07);
    r.dispose();
  });
  it('batches by material and shape', () => {
    const r = new PrimitiveRenderer(lib, 280);
    const list: Primitive[] = [];
    for (let i = 0; i < 40; i++) list.push(prim(i % 2 ? 'box' : 'ellipsoid', [3, 3, 3], 0, { id: 10 + i, material: i % 4 < 2 ? 'stone' : 'bark', pos: { x: 1000 + i, y: 0, z: 0 } }));
    r.setStatic(list);
    r.update(new Vector3());
    expect(r.stats().buckets).toBe(4);
    r.dispose();
  });
});
