// Adversarial checks of the primitive renderer (reviewer tests, headless three in Node).
import { describe, expect, it } from 'vitest';
import { Vector3, type InstancedMesh } from 'three';
import type { Primitive } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { createWorldUniforms } from '../materials/uniforms';
import { BREACH_UNIFORM_MAX } from '../materials/surfacePatch';
import { PrimitiveRenderer } from './primitiveRenderer';

const lib = new MaterialLibrary(null, createWorldUniforms(), { anisotropy: 1 });

function prim(id: number, extra: Partial<Primitive> = {}): Primitive {
  return {
    id, shape: 'box', pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 2, y: 2, z: 2 }, round: 0.5,
    material: 'stone', flags: 0, objectId: -1, ...extra,
  };
}

/** GDD 04 4.1 PRIM_BUDGET_TOTAL for a standard world. */
const PRIM_BUDGET_TOTAL = 16000;

function staticWorld(): Primitive[] {
  const list: Primitive[] = [];
  for (let i = 0; i < PRIM_BUDGET_TOTAL; i++) list.push(prim(i, { pos: { x: (i % 128) * 120, y: 0, z: Math.floor(i / 128) * 120 } }));
  return list;
}

function staticBucket(r: PrimitiveRenderer): InstancedMesh {
  return r.group.children.find((c) => c.name.includes('|stone|')) as InstancedMesh;
}

describe('PrimitiveRenderer: dynamic changes do not touch the static batches', () => {
  it('moving ONE dynamic primitive does not re-upload the 16 000 static instances', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic(staticWorld());
    const cam = new Vector3(0, 10, 0);
    r.syncDynamic([], new Map());
    r.update(cam);
    const stone = staticBucket(r);
    expect(stone).toBeDefined();
    const v0 = stone.instanceMatrix.version;
    const dyn = prim(1e7, { material: 'plastic', flags: 16, pos: { x: 5, y: 0, z: 5 } });
    for (let f = 0; f < 5; f++) {
      r.syncDynamic([{ ...dyn, pos: { x: 5 + f, y: 0, z: 5 } }], new Map());
      r.update(cam);
    }
    // BUG (performance): every dynamic add/move/remove rebuilds and re-uploads EVERY bucket (O(all prims) per frame;
    // ~12 ms per frame in Node at the GDD 04 budget for one moving toy/car/tyre)
    expect(stone.instanceMatrix.version).toBe(v0);
    r.dispose();
  });
});

describe('PrimitiveRenderer: breach list', () => {
  it('keeps the nearest breaches when there are more than the uniform capacity', () => {
    const r = new PrimitiveRenderer(lib, 280);
    const list = [];
    for (let i = 0; i < BREACH_UNIFORM_MAX * 3; i++) list.push({ pos: { x: 1000 + i * 10, y: 0, z: 0 }, r: 3 });
    list.reverse();
    r.setBreaches(list, new Vector3(1000, 0, 0));
    expect(r.breaches.count.value).toBe(BREACH_UNIFORM_MAX);
    const xs = r.breaches.spheres.value.map((v) => v.x).sort((a, b) => a - b);
    expect(xs[0]).toBe(1000);
    expect(xs[BREACH_UNIFORM_MAX - 1]).toBe(1000 + (BREACH_UNIFORM_MAX - 1) * 10);
    // the caller's list is not reordered
    expect(list[0].pos.x).toBe(1000 + (BREACH_UNIFORM_MAX * 3 - 1) * 10);
    r.setBreaches([], new Vector3());
    expect(r.breaches.count.value).toBe(0);
    r.dispose();
  });
});

describe('PrimitiveRenderer: odd inputs', () => {
  it('a dynamic primitive that changes material moves to the right batch, removal empties it', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic([]);
    const cam = new Vector3();
    r.syncDynamic([prim(7, { material: 'metal', flags: 16 })], new Map());
    r.update(cam);
    r.syncDynamic([prim(7, { material: 'glass', flags: 16 })], new Map());
    r.update(cam);
    const visible = r.group.children.filter((c) => c.visible && (c as InstancedMesh).count > 0).map((c) => c.name);
    expect(visible.some((n) => n.includes('|glass|'))).toBe(true);
    expect(visible.some((n) => n.includes('|metal|'))).toBe(false);
    r.syncDynamic([], new Map());
    r.update(cam);
    expect(r.stats().prims).toBe(0);
    expect(r.stats().buckets).toBe(0);
    r.dispose();
  });

  it('zero-size and negative-rounding primitives produce finite instance data', () => {
    const r = new PrimitiveRenderer(lib, 280);
    r.setStatic([prim(1, { size: { x: 0, y: 0, z: 0 }, round: -3 }), prim(2, { shape: 'ellipsoid', size: { x: 0, y: 1, z: 1 } })]);
    r.update(new Vector3());
    for (const c of r.group.children) {
      const m = c as InstancedMesh;
      if (!m.visible) continue;
      const size = m.geometry.getAttribute('iSize').array as Float32Array;
      for (let i = 0; i < m.count * 4; i++) expect(Number.isFinite(size[i])).toBe(true);
      expect(Number.isFinite(m.boundingSphere!.radius)).toBe(true);
    }
    r.dispose();
  });
});
